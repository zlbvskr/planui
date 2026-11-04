import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Goal, Project, Task, LifeAreaQuestion, LifeAreaAssessment, PLANUI_BACKUP_FORMAT, PLANUI_DB_SCHEMA_VERSION } from '../../domain/types';
import { STARTER_LIFE_AREAS, buildLifeReview, lifeAreaMergeSignature, projectLifeAreaLinks, projectPlanningReview } from '../../domain/lifeAreas';
import { buildLifeAreaAssessmentSnapshot, updateLifeAreaQuestionWording } from '../../domain/personalSpace';
import { validateDomainSnapshot, validateLifeAreaAssessment } from '../../domain/validation';
import { sessionFromDuration, previewPlanningChange } from '../../domain/today';
import { InMemoryTransactionalEngine, IndexedDbStorageEngine, STORE_NAMES, createDefaultSettings } from '../db';
import { PlanuiRepositories } from '../repositories';
import { executeAtomicBackupReplacement, exportFullBackupZip, migrateSupportedDomainSnapshot, validateBackupArchive } from '../backup/backupService';
import { createZipArchive, sha256Hex } from '../backup/zipCodec';

const now = '2026-11-04T10:00:00.000Z', date = '2026-11-04', zone = 'Europe/Kyiv';
const sourceId = 'life-q-1', targetId = 'life-q-2';
function goal(): Goal { return { id: 'goal', title: 'Ціль', description: null, purposeUk: null, completionCriteriaUk: null, nextActionTaskId: null, timing: null, folderId: 'folder', lifeAreaId: sourceId, implementationIntentionUk: null, state: 'active', archived: false, order: 0, createdAt: now, updatedAt: now, completedAt: null, revision: 1 }; }
function project(): Project { return { id: 'project', title: 'Проєкт', description: null, desiredOutcome: null, completionCriteria: null, targetDate: null, folderId: 'folder', goalId: 'goal', lifeAreaId: null, collaboratorText: null, state: 'active', archived: false, createdAt: now, updatedAt: now, completedAt: null, revision: 1 }; }
function task(id = 'task'): Task { return { id, title: id, description: null, state: 'open', priority: 'normal', deadline: null, estimatedDurationMinutes: 60, planningState: 'unplanned', plannedDate: null, ownership: { kind: 'project', projectId: 'project', stageId: null }, checklist: [], createdAt: now, updatedAt: now, completedAt: null, canceledAt: null, revision: 1 }; }
function legacyAreas(): LifeAreaQuestion[] {
  const names = ['Моя власна назва фізичного здоров’я', 'Емоційний спокій', 'Мій відпочинок', 'Близькі люди', 'Творчість', 'Моя робота', 'Фінансова стабільність', 'Особистий час'];
  return names.map((questionTextUk, order) => ({ id: `legacy-${order}`, questionTextUk, order, version: order + 1, revision: order + 1, updatedAt: now }));
}
async function fixture() {
  const engine = new InMemoryTransactionalEngine(), repos = new PlanuiRepositories(engine); await repos.getOrInitSettings(now);
  await repos.saveFolder({ id: 'folder', name: 'Напрям', parentId: null, lifeAreaId: sourceId, order: 0, createdAt: now, updatedAt: now, revision: 1 });
  await repos.saveGoal(goal()); await repos.saveProject(project()); await repos.saveTask(task());
  await repos.saveTask({ ...task('override'), lifeAreaId: targetId });
  await repos.saveTask({ ...task('direct'), lifeAreaId: sourceId, ownership: { kind: 'standalone', folderId: null } });
  await repos.saveHabit({ id: 'habit', name: 'Звичка', description: null, icon: null, lifeAreaId: null, projectId: 'project', state: 'active', ruleRevisions: [{ id: 'rule', effectiveFromLocalDate: date, rule: { kind: 'daily' }, target: { kind: 'binary' }, createdAt: now }], createdAt: now, updatedAt: now, revision: 1 });
  await repos.saveCalendarEvent({ id: 'event', title: 'Відновлення', lifeAreaId: sourceId, type: 'rest', color: 'rest', note: null, schedule: { kind: 'timed', interval: sessionFromDuration(date, '15:00', 60, zone) }, isBlocking: false, state: 'active', workProperties: null, createdAt: now, updatedAt: now, revision: 1 });
  await repos.saveReservationTransactionally({ id: 'session', taskId: 'task', interval: sessionFromDuration(date, '14:00', 60, zone), state: 'active', releaseMetadata: null, createdAt: now, updatedAt: now, revision: 1 });
  return { repos, engine };
}

describe('M6: life areas and lightweight reviews (latest approved stage scope)', () => {
  it('initializes only genuinely fresh areas with the exact editable ten-area framework', async () => {
    const repos = new PlanuiRepositories(new InMemoryTransactionalEngine());
    const { snapshot } = await repos.captureCoherentSnapshot(now);
    assert.deepEqual(snapshot.lifeAreaQuestions.map(a => a.questionTextUk), ['Фізичне здоров’я', 'Психічний стан', 'Відновлення та особистий час', 'Стосунки та близькість', 'Творчість і самовираження', 'Робота та професійний шлях', 'Фінанси та матеріальна стабільність', 'Навчання та розвиток', 'Дім, побут і середовище', 'Сенс, цінності та свобода вибору']);
    assert.equal(new Set(snapshot.lifeAreaQuestions.map(a => a.id)).size, 10);
    const updated = updateLifeAreaQuestionWording(snapshot.lifeAreaQuestions[0], 'Моє формулювання', now);
    await repos.saveLifeAreaQuestion(updated, 1);
    assert.equal((await repos.captureCoherentSnapshot()).snapshot.lifeAreaQuestions[0].questionTextUk, 'Моє формулювання');
  });
  it('preserves eight upgraded/custom areas and does not reseed an existing empty store', async () => {
    const engine = new InMemoryTransactionalEngine(); const settings = { ...createDefaultSettings(now), dbSchemaVersion: 4 };
    const old = legacyAreas();
    const assessment = buildLifeAreaAssessmentSnapshot({ id: 'old', questions: old, periodStartLocalDate: '2026-10-01', periodEndLocalDate: '2026-10-14', scoresByQuestionId: { 'legacy-0': 1, 'legacy-1': 10 }, nowIso: now });
    await engine.runTransaction([STORE_NAMES.settings, STORE_NAMES.lifeAreaQuestions, STORE_NAMES.lifeAreaAssessments], 'readwrite', async tx => { await tx.put(STORE_NAMES.settings, settings); for (const area of old) await tx.put(STORE_NAMES.lifeAreaQuestions, area); await tx.put(STORE_NAMES.lifeAreaAssessments, assessment); });
    const repos = new PlanuiRepositories(engine); await repos.getOrInitSettings(now);
    let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.deepEqual(snapshot.lifeAreaQuestions, old); assert.deepEqual(snapshot.lifeAreaAssessments, [assessment]);
    await engine.runTransaction([STORE_NAMES.lifeAreaQuestions], 'readwrite', tx => tx.clear(STORE_NAMES.lifeAreaQuestions));
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.deepEqual(snapshot.lifeAreaQuestions, []); assert.deepEqual(snapshot.lifeAreaAssessments, [assessment]);
  });
  it('retains partial null answers separately from zero, false and an explicitly empty change', async () => {
    const { repos } = await fixture(); const snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const review = buildLifeReview('new', snapshot.lifeAreaQuestions, { [sourceId]: { score: 0, attentionNow: false, usefulChangeUk: '' } }, '2028-02-29', '2028-03-01', now);
    validateLifeAreaAssessment(review);
    assert.equal(review.answers[0].score, 0); assert.equal(review.answers[0].attentionNow, false); assert.equal(review.answers[0].usefulChangeUk, '');
    assert.equal(review.answers[1].score, null); assert.equal(review.answers[1].attentionNow, null); assert.equal(review.answers[1].usefulChangeUk, null);
    assert.deepEqual(review.scale, { min: 0, max: 10, labelUk: 'Задоволеність: 0–10' });
    assert.throws(() => buildLifeReview('bad', snapshot.lifeAreaQuestions, {}, '2028-03-02', '2028-03-01', now));
    assert.throws(() => buildLifeReview('bad', snapshot.lifeAreaQuestions, {}, '2027-02-29', '2027-03-01', now));
  });
  it('keeps historical 1–10 scales, wording, IDs, periods and definitions when live areas change', async () => {
    const { repos } = await fixture(); let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const old = buildLifeAreaAssessmentSnapshot({ id: 'legacy', questions: snapshot.lifeAreaQuestions.slice(0, 8), periodStartLocalDate: '2026-10-01', periodEndLocalDate: '2026-10-07', scoresByQuestionId: { [sourceId]: 1 }, nowIso: now });
    await repos.saveLifeAreaAssessment(old);
    const q = snapshot.lifeAreaQuestions[0]; await repos.saveLifeAreaQuestion({ ...q, goodEnoughUk: 'Для мене достатньо прогулянки' }, q.revision);
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const current = buildLifeReview('current', snapshot.lifeAreaQuestions, {}, date, date, now); await repos.saveLifeAreaAssessment(current);
    const updated = updateLifeAreaQuestionWording(snapshot.lifeAreaQuestions[0], 'Нова назва', now); await repos.saveLifeAreaQuestion({ ...updated, goodEnoughUk: 'Нове визначення' }, snapshot.lifeAreaQuestions[0].revision);
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.deepEqual(snapshot.lifeAreaAssessments[0], old);
    await assert.rejects(repos.saveLifeAreaAssessment({ ...old, scale: { min: 0, max: 10, labelUk: 'Нова шкала' } }, old.revision));
    assert.equal(snapshot.lifeAreaAssessments[1].answers[0].definitionSnapshotUk, 'Для мене достатньо прогулянки');
    assert.equal(old.scale, undefined);
    assert.throws(() => validateLifeAreaAssessment({ ...old, answers: [{ ...old.answers[0], score: 0 }] }));
  });
  it('deduplicates direct/inherited goals, projects, tasks, habits, events, directions and planned actions', async () => {
    const { repos } = await fixture(); const snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const links = projectLifeAreaLinks(snapshot);
    assert.equal(new Set(links.map(l => `${l.kind}:${l.id}`)).size, links.length);
    for (const kind of ['folder', 'goal', 'project', 'task', 'habit', 'event', 'reservation']) assert.ok(links.some(l => l.kind === kind && l.effectiveId === sourceId));
    assert.equal(links.find(l => l.kind === 'project')?.directId, null);
    assert.equal(links.find(l => l.kind === 'project')?.inheritedId, sourceId);
    assert.equal(links.find(l => l.id === 'override')?.effectiveId, targetId);
    assert.equal(links.find(l => l.id === 'override')?.inheritedId, sourceId);
    const before = structuredClone(snapshot);
    projectLifeAreaLinks(snapshot); assert.deepEqual(snapshot, before);
    await repos.setLifeAreaLink('task', 'override', null, 1);
    const inherited = projectLifeAreaLinks((await repos.captureCoherentSnapshot()).snapshot).find(l => l.kind === 'task' && l.id === 'override');
    assert.equal(inherited?.directId, null); assert.equal(inherited?.effectiveId, sourceId);
  });
  it('merges only after explicit confirmation, reassigns live links transactionally, and preserves history and schedule', async () => {
    const { repos } = await fixture(); let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const review = buildLifeReview('review', snapshot.lifeAreaQuestions, { [sourceId]: { score: 0, attentionNow: false, usefulChangeUk: '' } }, date, date, now); await repos.saveLifeAreaAssessment(review);
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const source = snapshot.lifeAreaQuestions.find(a => a.id === sourceId)!, target = snapshot.lifeAreaQuestions.find(a => a.id === targetId)!;
    const signature = lifeAreaMergeSignature(snapshot, sourceId);
    await assert.rejects(repos.mergeLifeAreas(sourceId, targetId, source.revision, target.revision, signature, false));
    assert.deepEqual((await repos.captureCoherentSnapshot()).snapshot, snapshot);
    await repos.mergeLifeAreas(sourceId, targetId, source.revision, target.revision, signature, true);
    const after = (await repos.captureCoherentSnapshot()).snapshot; validateDomainSnapshot(after);
    assert.deepEqual(after.lifeAreaAssessments, snapshot.lifeAreaAssessments);
    assert.deepEqual(after.reservations, snapshot.reservations);
    assert.deepEqual(after.events[0].schedule, snapshot.events[0].schedule);
    assert.equal(after.events[0].isBlocking, snapshot.events[0].isBlocking);
    assert.equal(after.goals[0].lifeAreaId, targetId); assert.equal(after.folders[0].lifeAreaId, targetId);
    assert.equal(after.projects[0].lifeAreaId, null); assert.equal(after.tasks.find(t => t.id === 'task')?.lifeAreaId, undefined);
    assert.equal(after.tasks.find(t => t.id === 'override')?.lifeAreaId, targetId);
    assert.equal(after.lifeAreaQuestions.find(a => a.id === sourceId)?.questionTextUk, source.questionTextUk);
    assert.equal(after.lifeAreaQuestions.find(a => a.id === sourceId)?.mergedIntoId, targetId);
    assert.ok(!projectLifeAreaLinks(after).some(l => l.effectiveId === sourceId));
  });
  it('rejects stale merge previews and never merges merely similar names', async () => {
    const { repos } = await fixture(); const snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const signature = lifeAreaMergeSignature(snapshot, sourceId);
    await repos.setLifeAreaLink('task', 'override', sourceId, 1);
    await assert.rejects(repos.mergeLifeAreas(sourceId, targetId, 1, 1, signature, true));
    assert.equal((await repos.captureCoherentSnapshot()).snapshot.lifeAreaQuestions.find(a => a.id === sourceId)?.mergedIntoId, null);
    await assert.rejects(repos.mergeLifeAreas(sourceId, sourceId, 1, 1, signature, true));
  });
  it('rolls back the entire merge if one relationship write fails', async () => {
    const { repos, engine } = await fixture(); const before = (await repos.captureCoherentSnapshot()).snapshot;
    const original = engine.runTransaction.bind(engine);
    engine.runTransaction = ((stores: any, mode: any, work: any) => original(stores, mode, tx => work({ ...tx, put: async (store: any, record: any) => { if (store === STORE_NAMES.goals && record.lifeAreaId === targetId) throw new Error('isolated simulated write failure'); await tx.put(store, record); } }))) as typeof engine.runTransaction;
    await assert.rejects(repos.mergeLifeAreas(sourceId, targetId, 1, 1, lifeAreaMergeSignature(before, sourceId), true));
    engine.runTransaction = original;
    assert.deepEqual((await repos.captureCoherentSnapshot()).snapshot, before);
  });
  it('explicitly maps or adds missing starter areas without renaming or replacing customization', async () => {
    const engine = new InMemoryTransactionalEngine(); const old = legacyAreas();
    old[0].questionTextUk = STARTER_LIFE_AREAS[0][1];
    await engine.runTransaction([STORE_NAMES.settings, STORE_NAMES.lifeAreaQuestions], 'readwrite', async tx => { await tx.put(STORE_NAMES.settings, createDefaultSettings(now)); for (const area of old) await tx.put(STORE_NAMES.lifeAreaQuestions, area); });
    const repos = new PlanuiRepositories(engine);
    assert.equal((await repos.captureCoherentSnapshot()).snapshot.lifeAreaQuestions.length, 8);
    await repos.addOrMapStarterArea('physical', old[0].id);
    let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal(snapshot.lifeAreaQuestions.length, 8); assert.equal(snapshot.lifeAreaQuestions[0].questionTextUk, old[0].questionTextUk); assert.equal(snapshot.lifeAreaQuestions[0].version, old[0].version);
    await assert.rejects(repos.addOrMapStarterArea('physical', old[1].id));
    await repos.addOrMapStarterArea('mental', null); snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal(snapshot.lifeAreaQuestions.length, 9); assert.ok(snapshot.lifeAreaQuestions.some(a => a.questionTextUk === 'Психічний стан'));
  });
  it('archives/reorders without deleting links/history and excludes archived areas only from new reviews', async () => {
    const { repos } = await fixture(); let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const area = snapshot.lifeAreaQuestions[0]; await repos.saveLifeAreaQuestion({ ...area, archived: true }, area.revision);
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.ok(projectLifeAreaLinks(snapshot).some(l => l.effectiveId === sourceId));
    assert.ok(!buildLifeReview('new', snapshot.lifeAreaQuestions, {}, date, date, now).answers.some(a => a.questionId === sourceId));
    const ids = snapshot.lifeAreaQuestions.map(a => a.id).reverse();
    await repos.reorderLifeAreas(ids, Object.fromEntries(snapshot.lifeAreaQuestions.map(a => [a.id, a.revision])));
    const after = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal([...after.lifeAreaQuestions].sort((a, b) => a.order - b.order)[0].id, ids[0]); assert.deepEqual(after.reservations, snapshot.reservations);
  });
  it('review answers never modify calendar, while completion and explicit planning changes never modify scores', async () => {
    const { repos } = await fixture(); let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const review = buildLifeReview('review', snapshot.lifeAreaQuestions, { [sourceId]: { score: 4, attentionNow: true, usefulChangeUk: 'Поставити проєкт на паузу та звільнити час' } }, date, date, now);
    await repos.saveLifeAreaAssessment(review);
    let after = (await repos.captureCoherentSnapshot()).snapshot;
    assert.deepEqual(after.reservations, snapshot.reservations); assert.deepEqual(after.projects, snapshot.projects); assert.deepEqual(after.events, snapshot.events);
    assert.equal(after.settings.modules?.stateCheckInsEnabled, snapshot.settings.modules?.stateCheckInsEnabled);
    await repos.completeTaskTransactionally('task', now);
    after = (await repos.captureCoherentSnapshot()).snapshot; assert.deepEqual(after.lifeAreaAssessments, [review]);
    const p = after.projects[0]; await repos.saveProject({ ...p, state: 'paused' }, p.revision);
    await repos.setTaskDateOnlyPlanningTransactionally('direct', null, now, after.tasks.find(t => t.id === 'direct')!.revision, {});
    assert.deepEqual((await repos.captureCoherentSnapshot()).snapshot.lifeAreaAssessments, [review]);
  });
  it('manual planning review includes non-blocking recovery, current commitments and time-zone-aware periods without mutations', async () => {
    const { repos } = await fixture(); const snapshot = (await repos.captureCoherentSnapshot()).snapshot, before = structuredClone(snapshot);
    const review = projectPlanningReview(snapshot, date, date, zone);
    assert.equal(review.events[0].title, 'Відновлення'); assert.equal(review.reservations.length, 1);
    assert.equal(review.availability.totalOccupiedMinutes, 60);
    assert.deepEqual(snapshot, before);
    assert.throws(() => projectPlanningReview(snapshot, '2026-11-05', date, zone));
  });
  it('round-trips new and legacy scale metadata, merges and direct links through ZIP; supported upgrades do not rewrite old areas/reviews', async () => {
    const { repos } = await fixture(); let snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const legacy = buildLifeAreaAssessmentSnapshot({ id: 'legacy', questions: snapshot.lifeAreaQuestions.slice(0, 8), periodStartLocalDate: date, periodEndLocalDate: date, scoresByQuestionId: { [sourceId]: 1 }, nowIso: now });
    await repos.saveLifeAreaAssessment(legacy); await repos.saveLifeAreaAssessment(buildLifeReview('new', snapshot.lifeAreaQuestions, { [sourceId]: { score: 0, attentionNow: false, usefulChangeUk: '' } }, date, date, now));
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    await repos.mergeLifeAreas(sourceId, targetId, 1, 1, lifeAreaMergeSignature(snapshot, sourceId), true);
    snapshot = (await repos.captureCoherentSnapshot()).snapshot;
    const exported = await exportFullBackupZip(repos, now), preview = await validateBackupArchive(exported.zipBytes);
    const target = new PlanuiRepositories(new InMemoryTransactionalEngine()); await target.getOrInitSettings(now);
    await executeAtomicBackupReplacement(target, preview, { explicitUserConfirmation: true, nowIso: now });
    const restored = (await target.captureCoherentSnapshot()).snapshot;
    assert.deepEqual(restored.lifeAreaQuestions, snapshot.lifeAreaQuestions); assert.deepEqual(restored.lifeAreaAssessments, snapshot.lifeAreaAssessments); assert.deepEqual(restored.tasks, snapshot.tasks);
    const oldAreas = legacyAreas(), oldAssessment = buildLifeAreaAssessmentSnapshot({ id: 'old-eight', questions: oldAreas, periodStartLocalDate: date, periodEndLocalDate: date, scoresByQuestionId: { 'legacy-0': 1 }, nowIso: now });
    for (const version of [1, 2, 3, 4]) {
      const oldSnapshot = { ...snapshot, folders: [], goals: [], projects: [], tasks: [], habits: [], events: [], reservations: [], lifeAreaQuestions: oldAreas, lifeAreaAssessments: [oldAssessment], settings: { ...snapshot.settings, dbSchemaVersion: version } };
      const migrated = migrateSupportedDomainSnapshot(oldSnapshot, { format: PLANUI_BACKUP_FORMAT, backupVersion: version, dbSchemaVersion: version } as any).snapshot;
      validateDomainSnapshot(migrated);
      assert.deepEqual(migrated.lifeAreaQuestions, oldAreas); assert.deepEqual(migrated.lifeAreaAssessments, [oldAssessment]); assert.equal(migrated.settings.dbSchemaVersion, PLANUI_DB_SCHEMA_VERSION);
      const bytes = new TextEncoder().encode(JSON.stringify(oldSnapshot));
      const counts = { ...exported.manifest.entityCounts };
      for (const key of Object.keys(counts)) if (Array.isArray((oldSnapshot as any)[key])) counts[key] = (oldSnapshot as any)[key].length;
      const manifest = { ...exported.manifest, backupVersion: version, dbSchemaVersion: version, entityCounts: counts, files: [{ path: 'data.json', byteSize: bytes.length, sha256Hex: await sha256Hex(bytes), mimeType: 'application/json' }] };
      const zip = await createZipArchive([{ path: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) }, { path: 'data.json', bytes }]);
      const oldPreview = await validateBackupArchive(zip);
      await executeAtomicBackupReplacement(target, oldPreview, { explicitUserConfirmation: true, nowIso: now });
      const imported = (await target.captureCoherentSnapshot()).snapshot;
      assert.deepEqual(imported.lifeAreaQuestions, oldAreas); assert.deepEqual(imported.lifeAreaAssessments, [oldAssessment]);
    }
    assert.throws(() => validateDomainSnapshot({ ...restored, lifeAreaQuestions: restored.lifeAreaQuestions.map(a => a.id === targetId ? { ...a, archived: true, mergedIntoId: sourceId } : a) }));
  });
  it('advances live v4 storage metadata without touching legacy area/assessment stores', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const settings = { ...createDefaultSettings(now), dbSchemaVersion: 4 }; let updated: unknown; const cursorRequest: any = {};
    const request: any = { result: { objectStoreNames: { contains: () => true }, close() {} }, transaction: { objectStore(name: string) { assert.equal(name, STORE_NAMES.settings); return { openCursor: () => cursorRequest }; } } };
    try {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request } });
      const engine = new IndexedDbStorageEngine('isolated-m6-upgrade'), opened = (engine as unknown as { openDatabase(): Promise<unknown> }).openDatabase();
      request.onupgradeneeded({ oldVersion: 4 }); cursorRequest.result = { value: settings, update(record: unknown) { updated = record; }, continue() {} }; cursorRequest.onsuccess(); cursorRequest.result = null; cursorRequest.onsuccess(); request.onsuccess(); await opened;
      assert.deepEqual(updated, { ...settings, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION }); engine.close();
    } finally { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else Reflect.deleteProperty(globalThis, 'indexedDB'); }
  });
});
