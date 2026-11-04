import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransactionalEngine, STORE_NAMES } from '../db';
import { PlanuiRepositories } from '../repositories';
import { validatePersonalRecord, validateInspirationItemRecord } from '../../domain/validation';
import { isCheckIn, exportSelectedRecords } from '../../domain/stateCheckIns';
import { buildInspirationItemRecord, validateAndPrepareRasterMedia } from '../../domain/personalSpace';
import { exportFullBackupZip, validateBackupArchive, executeAtomicBackupReplacement, migrateSupportedDomainSnapshot } from '../backup/backupService';
import type { PersonalRecord } from '../../domain/types';
const now = '2026-11-04T12:00:00.000Z';
const record = (id: string): PersonalRecord => ({ id, recordedAt: now, localDate: '2026-11-04', zoneId: 'Europe/Kyiv', text: null, mood: null, energy: null, stress: null, tags: [], createdAt: now, updatedAt: now, revision: 1 });
describe('M7 optional state and preferred life', () => {
  it('retains text-only and scored legacy records without inventing check-ins or scale answers', async () => {
    const repo = new PlanuiRepositories(new InMemoryTransactionalEngine());
    const legacy = { ...record('text'), text: '  Мій історичний текст\n', tags: ['мій тег'] };
    const scored = { ...record('scored'), text: 'Оригінал', mood: 2 as const };
    await repo.savePersonalRecord(legacy); await repo.savePersonalRecord(scored);
    assert.equal(isCheckIn(legacy), false); assert.equal(isCheckIn(scored), true);
    const { snapshot } = await repo.captureCoherentSnapshot();
    const exp = await exportFullBackupZip(repo);
    for (const version of [1,2,3,4,5,6]) {
      const migrated = migrateSupportedDomainSnapshot(snapshot, {...exp.manifest, backupVersion: version, dbSchemaVersion: version});
      assert.deepEqual(migrated.snapshot.personalRecords, snapshot.personalRecords);
    }
    assert.deepEqual(snapshot.personalRecords.find(r => r.id === legacy.id), legacy);
  });
  it('supports multiple same-day records, partial sleep, zero duration, edits and selected export', async () => {
    const repo = new PlanuiRepositories(new InMemoryTransactionalEngine());
    await repo.savePersonalRecord({...record('one'), sleepMinutes: 0, scaleVersion: 1});
    await repo.savePersonalRecord({...record('two'), sleepQuality: 5, energy: 1, scaleVersion: 1});
    await repo.savePersonalRecord({...record('one'), sleepMinutes: 480, scaleVersion: 1}, 1);
    let { snapshot } = await repo.captureCoherentSnapshot();
    assert.equal(snapshot.personalRecords.length, 2);
    const json = JSON.parse(exportSelectedRecords(snapshot.personalRecords, ['two']));
    assert.equal(json.records.length, 1); assert.equal(json.records[0].sleepQuality, 5); assert.equal(json.scales.version, 1);
    await repo.deletePersonalRecordTransactionally('one');
    assert.equal((await repo.captureCoherentSnapshot()).snapshot.personalRecords.length, 1);
    for (const invalid of [-1, 1441, 1.5, NaN]) assert.throws(() => validatePersonalRecord({...record('bad'), sleepMinutes: invalid}));
    assert.throws(() => validatePersonalRecord({...record('bad'), sleepQuality: 6 as any}));
  });
  it('preserves local images, legacy inspiration, text, sleep and disabled preferences through real ZIP replacement', async () => {
    const repo = new PlanuiRepositories(new InMemoryTransactionalEngine()); const settings = await repo.getOrInitSettings(now);
    await repo.saveSettings({...settings, modules: {...settings.modules!, stateCheckInsEnabled: false, desiredLifeEnabled: false, userConfigured: true}}, settings.revision);
    await repo.savePersonalRecord({...record('sleep'), text: 'Історичний текст', sleepMinutes: 420, sleepQuality: 3, scaleVersion: 1});
    const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]); bytes[19]=1; bytes[23]=1; bytes[24]=8; bytes[25]=6;
    const media = await validateAndPrepareRasterMedia({id:'image', bytes, declaredMimeType:'image/png', nowIso:now});
    await repo.saveInspirationWithMediaTransactionally({...buildInspirationItemRecord({id:'fragment',kind:'image', mediaId:'image', nowIso:now}), collection:'preferred_life'}, media);
    await repo.saveInspirationWithMediaTransactionally(buildInspirationItemRecord({id:'old',kind:'quote', contentText:'Цитата', isFavorite:true, nowIso:now}));
    const exported = await exportFullBackupZip(repo), validated = await validateBackupArchive(exported.zipBytes);
    const target = new PlanuiRepositories(new InMemoryTransactionalEngine());
    await executeAtomicBackupReplacement(target, validated, { explicitUserConfirmation: true, nowIso: now });
    const result = await target.captureCoherentSnapshot();
    assert.equal(result.snapshot.personalRecords[0].text, 'Історичний текст'); assert.equal(result.snapshot.personalRecords[0].sleepMinutes, 420);
    assert.equal(result.snapshot.inspirationItems.length,2); assert.equal(result.snapshot.inspirationItems.find(i=>i.id==='old')?.isFavorite,true);
    assert.equal(result.snapshot.settings.modules?.stateCheckInsEnabled,false); assert.equal(result.snapshot.settings.modules?.desiredLifeEnabled,false);
    assert.deepEqual(result.mediaBlobs.get('image'),bytes);
  });
  it('rejects unsafe links for every kind, allowing user-entered HTTP/S links', () => {
    for (const kind of ['text','image','quote','link'] as const) {
      const base = {id:'x',kind,title:'Матеріал',contentText:'Текст',mediaId:'img', nowIso:now};
      assert.throws(()=>buildInspirationItemRecord({...base,linkUrl:'javascript:alert(1)'}));
      assert.throws(()=>validateInspirationItemRecord({...buildInspirationItemRecord({...base,linkUrl:'https://example.com'}),linkUrl:'data:text/html,x'}));
      assert.equal(buildInspirationItemRecord({...base,linkUrl:'https://example.com'}).linkUrl,'https://example.com/');
    }
  });
  it('rejects missing goal and area references transactionally without storing media', async () => {
    const engine = new InMemoryTransactionalEngine(), repo = new PlanuiRepositories(engine);
    const item = buildInspirationItemRecord({id:'bad',kind:'text',title:'Фрагмент',nowIso:now});
    await assert.rejects(repo.saveInspirationWithMediaTransactionally({...item,goalId:'missing'}));
    await assert.rejects(repo.saveInspirationWithMediaTransactionally({...item,lifeAreaId:'missing'}));
    assert.equal((await repo.captureCoherentSnapshot()).snapshot.inspirationItems.length,0);
  });
  it('unlinks deleted goals and transfers area links with reviewed merge signatures', async () => {
    const repo = new PlanuiRepositories(new InMemoryTransactionalEngine()); await repo.getOrInitSettings(now);
    await repo.saveGoal({id:'g',title:'Ціль',description:null,purposeUk:null,completionCriteriaUk:null,nextActionTaskId:null,timing:null,folderId:null,lifeAreaId:null,implementationIntentionUk:null,state:'active',archived:false,order:0,createdAt:now,updatedAt:now,completedAt:null,revision:1});
    const item = {...buildInspirationItemRecord({id:'linked',kind:'text',title:'Фрагмент',nowIso:now}),goalId:'g',lifeAreaId:'life-q-1',collection:'preferred_life' as const};
    await repo.saveInspirationWithMediaTransactionally(item);
    await repo.deleteGoalTransactionally('g','unlink_children',now);
    let snapshot = (await repo.captureCoherentSnapshot()).snapshot;
    assert.equal(snapshot.inspirationItems[0].goalId,null);
    const {lifeAreaMergeSignature} = await import('../../domain/lifeAreas');
    await repo.mergeLifeAreas('life-q-1','life-q-2',1,1,lifeAreaMergeSignature(snapshot,'life-q-1'),true);
    snapshot = (await repo.captureCoherentSnapshot()).snapshot;
    assert.equal(snapshot.inspirationItems[0].lifeAreaId,'life-q-2'); assert.equal(snapshot.inspirationItems[0].title,'Фрагмент');
  });

});
