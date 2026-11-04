import { readFile } from 'node:fs/promises';
import { calculateGoalProgress } from '../../domain/plans';
import { projectTodayTasks, sessionFromDuration } from '../../domain/today';
import { projectScheduleForDate } from '../../domain/scheduling';
import { projectRoadmap } from '../../domain/roadmap';
import { computeHabitWeekProgress } from '../../domain/habits';
import { validateAndPrepareRasterMedia } from '../../domain/personalSpace';
import { assertValidIsoInstant } from '../../domain/temporal';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanuiError } from '../../i18n/errorsUk';
import { PLANUI_DB_SCHEMA_VERSION, type PlanuiDomainSnapshot } from '../../domain/types';
import { buildWishItemRecord } from '../../domain/wishlist';
import { InMemoryTransactionalEngine, STORE_NAMES } from '../db';
import { PlanuiRepositories } from '../repositories';
import { TabSyncCoordinator } from '../tabSync';
import { BACKUP_LIMITS, createZipArchive, extractAndVerifyZipArchive, sha256Hex } from '../backup/zipCodec';
import { executeAtomicBackupReplacement, exportFullBackupZip, exportRecoverySnapshotZip, migrateSupportedDomainSnapshot, resetAllPlanuiDataTransactionally, restoreFromRecoverySnapshotTransactionally, validateBackupArchive } from '../backup/backupService';
const now = '2026-11-04T16:00:00.000Z';
async function fixture() {
  const engine = new InMemoryTransactionalEngine();
  const repos = new PlanuiRepositories(engine);
  await repos.getOrInitSettings(now);
  return { engine, repos };
}
const snapshot = async (repos: PlanuiRepositories) => (await repos.captureCoherentSnapshot(now)).snapshot;
async function archive(repos: PlanuiRepositories) { return validateBackupArchive((await exportFullBackupZip(repos, now)).zipBytes); }
const confirmed = { explicitUserConfirmation: true, nowIso: now };
const isCode = (code: string) => (error: unknown) => error instanceof PlanuiError && error.code === code;
async function alteredZip(repos: PlanuiRepositories, alter: (s: PlanuiDomainSnapshot) => void) {
  const preview = await archive(repos);
  alter(preview.snapshot);
  const bytes = new TextEncoder().encode(JSON.stringify(preview.snapshot));
  preview.manifest.files = [{ path: 'data.json', byteSize: bytes.length, sha256Hex: await sha256Hex(bytes), mimeType: 'application/json' }];
  return createZipArchive([{path:'manifest.json',bytes:new TextEncoder().encode(JSON.stringify(preview.manifest))},{path:'data.json',bytes}]);
}

describe('M10 recovery and integration hardening', () => {
  it('shares canonical task/date/completion and habit history across planning projections and ZIP restore', async () => {
    const {repos}=await fixture();
    const common={createdAt:now,updatedAt:now,revision:1};
    await repos.saveGoal({id:'goal',title:'Ціль',description:null,purposeUk:null,completionCriteriaUk:null,nextActionTaskId:null,timing:null,folderId:null,lifeAreaId:null,implementationIntentionUk:null,state:'active',archived:false,order:0,completedAt:null,roadmapPeriod:{precision:'month',month:'2026-11'},checkpoints:[{id:'checkpoint',title:'Віха',localDate:'2026-11-05',order:0}],...common});
    await repos.saveProject({id:'project',title:'Проєкт',description:null,desiredOutcome:null,completionCriteria:null,targetDate:null,folderId:null,goalId:'goal',lifeAreaId:null,collaboratorText:null,state:'active',archived:false,completedAt:null,...common});
    await repos.saveTask({id:'task',title:'Справа',description:null,state:'open',priority:'normal',deadline:null,estimatedDurationMinutes:60,planningState:'unplanned',plannedDate:null,ownership:{kind:'project',projectId:'project',stageId:null},checklist:[],completedAt:null,canceledAt:null,...common});
    await repos.setTaskDateOnlyPlanningTransactionally('task','2026-11-05',now,1);
    let state=await snapshot(repos);
    assert.equal(projectTodayTasks(state.tasks,state.reservations,'2026-11-04','UTC').relevant.length,0);
    assert.equal(projectTodayTasks(state.tasks,state.reservations,'2026-11-05','UTC').relevant[0].id,'task');
    const schedule=()=>projectScheduleForDate({localDate:'2026-11-05',displayZone:'UTC',tasks:state.tasks,reservations:state.reservations,events:state.events,dayOffAnnotations:state.dayOffAnnotations});
    assert.equal(schedule().availability.totalOccupiedMinutes,0);
    assert.equal(projectRoadmap(state).length,2);
    await repos.saveHabit({id:'habit',name:'Читання',description:null,icon:null,lifeAreaId:null,projectId:'project',state:'active',ruleRevisions:[{id:'rule',effectiveFromLocalDate:'2026-11-01',rule:{kind:'daily'},target:{kind:'binary'},createdAt:now}],...common});
    await repos.scheduleHabitSession({id:'session',habitId:'habit',localDate:'2026-11-05',interval:sessionFromDuration('2026-11-05','14:00',60,'UTC'),expectedHabitRevision:1,nowIso:now});
    state=await snapshot(repos);assert.equal(schedule().availability.totalOccupiedMinutes,60);
    await repos.completeProjectExplicitlyTransactionally('project',now,1);
    state=await snapshot(repos);assert.equal(state.tasks[0].state,'open');assert.equal(state.goals[0].state,'active');assert.equal(state.reservations[0].state,'active');
    await repos.completeTaskTransactionally('task',now,state.tasks[0].revision);
    await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:'2026-11-05',input:{kind:'complete'},nowIso:now});
    state=await snapshot(repos);assert.equal(calculateGoalProgress('goal',state.tasks,state.projects).completedCount,1);
    assert.equal(projectTodayTasks(state.tasks,state.reservations,'2026-11-05','UTC').relevant[0].state,'completed');
    assert.equal(computeHabitWeekProgress(state.habits[0],state.habitEntries,'2026-11-05').completedCount,1);
    assert.equal(schedule().availability.totalOccupiedMinutes,0);assert.equal(state.goals[0].state,'active');
    await repos.updateSettingsPatch({modules:{habitsEnabled:false,stateCheckInsEnabled:false,desiredLifeEnabled:false,wishlistEnabled:false,userConfigured:true},timeZoneMode:'manual',manualTimeZone:'Europe/Kyiv'},now);
    const preview=await archive(repos), target=(await fixture()).repos;
    await executeAtomicBackupReplacement(target,preview,confirmed);
    const restored=await snapshot(target);
    for(const key of Object.keys(preview.snapshot).filter(key=>key!=='settings') as Array<keyof PlanuiDomainSnapshot>)assert.deepEqual(restored[key],preview.snapshot[key]);
    assert.deepEqual(restored.settings.modules,preview.snapshot.settings.modules);assert.equal(restored.settings.manualTimeZone,'Europe/Kyiv');
    assert.deepEqual((await archive(target)).snapshot.reservations,preview.snapshot.reservations);
  });

  it('rejects a conflicting media identity without corrupting live bytes or recovery references', async () => {
    const {repos}=await fixture(),source=(await fixture()).repos;
    const bytes=new Uint8Array(await readFile(new URL('../../../public/pwa-192x192.png',import.meta.url)));
    const original=await validateAndPrepareRasterMedia({id:'same-image',bytes,declaredMimeType:'image/png',nowIso:now});
    const changed=await validateAndPrepareRasterMedia({id:'same-image',bytes:new Uint8Array([...bytes,0]),declaredMimeType:'image/png',nowIso:now});
    const wish=buildWishItemRecord({id:'image-wish',title:'Зображення',nowIso:now}).wish;
    await repos.saveWishItem({...wish,mediaId:'same-image'},undefined,{media:original});
    await source.saveWishItem({...wish,mediaId:'same-image'},undefined,{media:changed});
    const before=await snapshot(repos);
    await assert.rejects(executeAtomicBackupReplacement(repos,await archive(source),confirmed),isCode('BACKUP_CHECKSUM_MISMATCH'));
    assert.deepEqual(await snapshot(repos),before);assert.equal((await repos.listRecoverySnapshots()).length,0);
    assert.deepEqual((await archive(repos)).mediaBlobs.get('same-image'),bytes);
  });

  it('validates UTC precision and real dates without silently normalizing instants', () => {
    for(const invalid of ['2026-02-30T12:00:00Z','2026-11-04T24:00:00Z','2026-11-04T12:00:00.0001Z','2026-11-04Z'])assert.throws(()=>assertValidIsoInstant(invalid),isCode('INVALID_INSTANT'));
    for(const valid of [now,'2026-11-04T12:00:00Z','2026-11-04T12:00:00.120000Z'])assert.equal(assertValidIsoInstant(valid),valid);
  });

  it('restores and re-exports a supported pre-revision local recovery snapshot through the migration chain', async () => {
    const {engine,repos}=await fixture();
    const old=structuredClone(await snapshot(repos)) as any;
    delete old.goals; delete old.wishes; delete old.wishlistCategories;delete old.settings.dailyPlans;delete old.settings.roadmapLayer;delete old.settings.preferredWishlistCurrency;old.settings.dbSchemaVersion=1;
    const text={id:'legacy-text',recordedAt:now,localDate:'2026-11-04',zoneId:'Europe/Kyiv',text:'  Давній щоденник\n',mood:null,energy:null,stress:null,tags:['робота'],createdAt:now,updatedAt:now,revision:5};
    old.personalRecords=[text];
    await engine.runTransaction([STORE_NAMES.recoverySnapshots],'readwrite',tx=>tx.put(STORE_NAMES.recoverySnapshots,{id:'old-recovery',createdAt:now,reason:'pre_import_replacement',dbSchemaVersion:1,appVersion:'0.3.0',snapshot:old}));
    const exported=await exportRecoverySnapshotZip(repos,'old-recovery',now);
    assert.deepEqual((await validateBackupArchive(exported.zipBytes)).snapshot.personalRecords,[text]);
    await restoreFromRecoverySnapshotTransactionally(repos,'old-recovery',confirmed);
    assert.deepEqual((await archive(repos)).snapshot.personalRecords,[text]);
    assert.equal((await snapshot(repos)).settings.dbSchemaVersion,PLANUI_DB_SCHEMA_VERSION);
  });

  it('does not acknowledge a generation when the engine fails after the replacement work finishes', async () => {
    const {engine,repos}=await fixture();
    const run=engine.runTransaction.bind(engine);let fail=true;
    engine.runTransaction=(stores,mode,work)=>run(stores,mode,async tx=>{
      const result=await work(tx);
      if(fail&&mode==='readwrite'&&stores.includes(STORE_NAMES.recoverySnapshots)){fail=false;throw new DOMException('Isolated commit failure','QuotaExceededError');}
      return result;
    });
    await assert.rejects(executeAtomicBackupReplacement(repos,await archive((await fixture()).repos),confirmed),isCode('STORAGE_QUOTA_EXCEEDED'));
    assert.equal(repos.getKnownDbGeneration(),1);assert.equal((await snapshot(repos)).settings.dbGeneration,1);
    assert.equal((await repos.listRecoverySnapshots()).length,0);
    await repos.updateSettingsPatch({theme:'dark'},now);
  });

  it('uses the privately validated preview and refuses fabricated previews before any write', async () => {
    const { repos } = await fixture();
    await repos.saveWishItem(buildWishItemRecord({ id: 'wish', title: 'Оригінал', nowIso: now }).wish);
    const preview = await archive(repos);
    const target = (await fixture()).repos;
    await assert.rejects(executeAtomicBackupReplacement(target, structuredClone(preview), confirmed), isCode('VALIDATION_FAILED'));
    assert.equal((await target.listRecoverySnapshots()).length, 0);
    preview.snapshot.wishes[0].title = 'Підмінено після перевірки';
    preview.mediaBlobs.clear();
    await executeAtomicBackupReplacement(target, preview, confirmed);
    assert.equal((await snapshot(target)).wishes[0].title, 'Оригінал');
  });

  it('captures edits committed between preview/capture and the replacement transaction in recovery', async () => {
    const { repos } = await fixture();
    const preview = await archive((await fixture()).repos);
    const originalCapture = repos.captureCoherentSnapshot.bind(repos);
    repos.captureCoherentSnapshot = async (...args) => {
      const result = await originalCapture(...args);
      await repos.saveWishItem(buildWishItemRecord({ id: 'last-edit', title: 'Остання зміна', nowIso: now }).wish);
      repos.captureCoherentSnapshot = originalCapture;
      return result;
    };
    const result = await executeAtomicBackupReplacement(repos, preview, confirmed);
    const recovery = (await repos.listRecoverySnapshots()).find(record => record.id === result.recoverySnapshotId)!;
    assert.equal(recovery.snapshot.wishes[0].id, 'last-edit');
    assert.equal((await snapshot(repos)).wishes.length, 0);
    await restoreFromRecoverySnapshotTransactionally(repos, result.recoverySnapshotId, confirmed);
    const reexport = await archive(repos);
    assert.equal(reexport.snapshot.wishes[0].id, 'last-edit');
  });

  it('keeps the new recovery point despite equal timestamps or a clock moving backwards', async () => {
    const { repos } = await fixture();
    let latest = '';
    for (let i = 0; i < 4; i++) latest = (await executeAtomicBackupReplacement(repos, await archive((await fixture()).repos), {...confirmed,nowIso:i<3?'2030-11-04T16:00:00.000Z':now})).recoverySnapshotId;
    const recoveries = await repos.listRecoverySnapshots();
    assert.equal(recoveries.length, 3);
    assert.ok(recoveries.some(record => record.id === latest));
  });

  it('rolls back failed replacement, generation and recovery eviction together, permitting a subsequent save', async () => {
    const { repos } = await fixture();
    for (let i = 0; i < 3; i++) await executeAtomicBackupReplacement(repos, await archive((await fixture()).repos), confirmed);
    const before = await snapshot(repos), recoveries = await repos.listRecoverySnapshots(), generation = repos.getKnownDbGeneration();
    await assert.rejects(executeAtomicBackupReplacement(repos, await archive((await fixture()).repos), { ...confirmed, simulateReplacementWriteFailure: true }));
    assert.deepEqual(await snapshot(repos), before);
    assert.deepEqual(await repos.listRecoverySnapshots(), recoveries);
    assert.equal(repos.getKnownDbGeneration(), generation);
    await repos.updateSettingsPatch({theme:'dark'}, now);
    assert.equal((await snapshot(repos)).settings.theme, 'dark');
  });

  it('blocks stale replacement, reset, restore and ordinary writes, even without a broadcast', async () => {
    const { engine, repos: first } = await fixture();
    const stale = new PlanuiRepositories(engine);
    await stale.captureCoherentSnapshot(now);
    const preview = await archive((await fixture()).repos);
    const recovery = await executeAtomicBackupReplacement(first, preview, confirmed);
    await assert.rejects(stale.updateSettingsPatch({theme:'dark'},now), isCode('STALE_DB_GENERATION_CONFLICT'));
    await assert.rejects(executeAtomicBackupReplacement(stale, preview, confirmed), isCode('STALE_DB_GENERATION_CONFLICT'));
    await assert.rejects(resetAllPlanuiDataTransactionally(stale, {...confirmed,snapshotHandling:'clear_all_snapshots'}), isCode('STALE_DB_GENERATION_CONFLICT'));
    await assert.rejects(restoreFromRecoverySnapshotTransactionally(stale, recovery.recoverySnapshotId, confirmed), isCode('STALE_DB_GENERATION_CONFLICT'));
    assert.equal((await snapshot(first)).settings.dbGeneration, 2);
  });

  it('blocks all write paths of older code against newer persisted schema without clearing records', async () => {
    const {engine, repos} = await fixture();
    const preview = await archive((await fixture()).repos);
    await engine.runTransaction([STORE_NAMES.settings], 'readwrite', async tx => {
      const settings = await tx.get<any>(STORE_NAMES.settings,'singleton');
      await tx.put(STORE_NAMES.settings,{...settings,dbSchemaVersion:PLANUI_DB_SCHEMA_VERSION+1});
    });
    await assert.rejects(repos.updateSettingsPatch({theme:'dark'},now), isCode('INCOMPATIBLE_NEWER_SCHEMA_WRITE_BLOCKED'));
    await assert.rejects(executeAtomicBackupReplacement(repos,preview,confirmed), isCode('INCOMPATIBLE_NEWER_SCHEMA_WRITE_BLOCKED'));
    await assert.rejects(resetAllPlanuiDataTransactionally(repos,{...confirmed,snapshotHandling:'clear_all_snapshots'}), isCode('INCOMPATIBLE_NEWER_SCHEMA_WRITE_BLOCKED'));
  });

  it('migrates supported Stage-11 snapshots directly and incrementally without rewriting legacy text or exact money', async () => {
    const {repos} = await fixture();
    const old = structuredClone(await snapshot(repos)) as any;
    delete old.goals; delete old.wishes; delete old.wishlistCategories;
    delete old.settings.dailyPlans; delete old.settings.roadmapLayer; delete old.settings.preferredWishlistCurrency;
    old.settings.dbSchemaVersion = 1;
    const manifest = {format:'planui-backup-zip' as const,backupVersion:1,dbSchemaVersion:1};
    const direct = migrateSupportedDomainSnapshot(old,manifest).snapshot;
    let incremental = old;
    for (let version=1;version<=8;version++) incremental = migrateSupportedDomainSnapshot(incremental,{...manifest,backupVersion:version,dbSchemaVersion:version}).snapshot;
    assert.deepEqual(incremental,direct);
    assert.deepEqual(migrateSupportedDomainSnapshot(direct,{...manifest,backupVersion:8,dbSchemaVersion:8}).snapshot,direct);
    const bad = await alteredZip(repos, s => { delete (s as any).wishes; });
    await assert.rejects(validateBackupArchive(bad), isCode('VALIDATION_FAILED'));
  });

  it('rejects malformed records, non-exact generations and invalid current metadata before mutation', async () => {
    const {repos} = await fixture(); const before=await snapshot(repos);
    for (const alter of [
      (s: PlanuiDomainSnapshot)=>{s.settings.dbGeneration=Number.MAX_SAFE_INTEGER;},
      (s: PlanuiDomainSnapshot)=>{s.wishes=[null as any];},
      (s: PlanuiDomainSnapshot)=>{s.settings.modules={habitsEnabled:'false'} as any;},
      (s: PlanuiDomainSnapshot)=>{(s as any).unknownFutureCollection=[];},
      (s: PlanuiDomainSnapshot)=>{s.wishes=[{...buildWishItemRecord({id:'bad',title:'Назва',nowIso:now}).wish,note:{} as any}];},
      (s: PlanuiDomainSnapshot)=>{s.wishes=[{...buildWishItemRecord({id:'bad',title:'Назва',nowIso:now}).wish,archived:'false' as any}];},
    ]) await assert.rejects(validateBackupArchive(await alteredZip(repos,alter)),isCode('VALIDATION_FAILED'));
    assert.deepEqual(await snapshot(repos),before);
  });

  it('rejects encrypted flags, local/central disagreement, overlapping entries and ambiguous paths', async () => {
    const clean = await createZipArchive([{path:'data.json',bytes:new TextEncoder().encode('hello')},{path:'manifest.json',bytes:new Uint8Array([1,2])}]);
    const eocd = clean.length-22, central = new DataView(clean.buffer).getUint32(eocd+16,true);
    for (const mutate of [
      (b:Uint8Array,v:DataView)=>v.setUint16(central+8,1,true),
      (b:Uint8Array)=>{b[30]='x'.charCodeAt(0);},
      (b:Uint8Array,v:DataView)=>v.setUint16(eocd+4,1,true),
      (b:Uint8Array,v:DataView)=>v.setUint32(central+24,500_000_000,true),
      (b:Uint8Array,v:DataView)=>v.setUint32(central+46+9+42,0,true),
    ]) { const bytes=new Uint8Array(clean);mutate(bytes,new DataView(bytes.buffer));await assert.rejects(extractAndVerifyZipArchive(bytes)); }
    await assert.rejects(extractAndVerifyZipArchive(await createZipArchive([{path:'data.json',bytes:new Uint8Array()},{path:'DATA.JSON',bytes:new Uint8Array()}])),isCode('BACKUP_DUPLICATE_ENTRY'));
    for(const path of ['../data.json','media/%2e%2e.png','media/a\u0001.png'])await assert.rejects(createZipArchive([{path,bytes:new Uint8Array()}]),isCode('BACKUP_UNSAFE_PATH'));
    await assert.rejects(extractAndVerifyZipArchive(clean,{...BACKUP_LIMITS,MAX_DATA_JSON_BYTES:4} as any),isCode('BACKUP_BOMB_DETECTED'));
  });

  it('exports highly repetitive user data in a form accepted by the same decompression limits', async () => {
    const {repos}=await fixture();
    await repos.saveWishItem({...buildWishItemRecord({id:'large',title:'Нотатка',nowIso:now}).wish,note:'а'.repeat(100_000)});
    assert.equal((await archive(repos)).snapshot.wishes[0].note?.length,100_000);
  });

  it('expires interrupted-tab advisory leases while preserving independent simultaneous locks', () => {
    const Original = globalThis.BroadcastChannel;
    let receiver: ((event:any)=>void) | undefined;
    class Channel {set onmessage(value:any){receiver=value;} postMessage(){} close(){} }
    globalThis.BroadcastChannel=Channel as any;
    let clock=0;
    const sync=new TabSyncCoordinator('isolated-test',()=>clock);
    try {
      receiver!({data:{type:'IMPORT_STARTED',tabId:'a'}});
      receiver!({data:{type:'IMPORT_STARTED',tabId:'b'}});
      receiver!({data:{type:'IMPORT_FINISHED',tabId:'a',dbGeneration:1}});
      assert.throws(()=>sync.assertNoRemoteImportInProgress(),isCode('IMPORT_ALREADY_IN_PROGRESS'));
      clock=30_001;sync.assertNoRemoteImportInProgress();
    } finally {sync.close();globalThis.BroadcastChannel=Original;}
  });
});
