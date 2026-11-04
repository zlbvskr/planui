import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Goal, Project, ProjectStage, PLANUI_DB_SCHEMA_VERSION, PLANUI_BACKUP_VERSION, PLANUI_BACKUP_FORMAT } from '../../domain/types';
import { periodInterval, projectRoadmap, roadmapMarkers, roadmapWarnings, validateRoadmapMetadata } from '../../domain/roadmap';
import { validateDomainSnapshot, validateStageRecord } from '../../domain/validation';
import { InMemoryTransactionalEngine, IndexedDbStorageEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import { exportFullBackupZip, validateBackupArchive, migrateSupportedDomainSnapshot, executeAtomicBackupReplacement } from '../backup/backupService';
import { calculateWindowAvailability, projectScheduleForDate } from '../../domain/scheduling';
import { buildZonedIntervalFromLocalInput } from '../../domain/temporal';
import { createZipArchive, sha256Hex } from '../backup/zipCodec';

const now = '2026-11-04T10:00:00.000Z';
function goal(id = 'goal'): Goal { return { id, title: 'Ціль', description: null, purposeUk: null, completionCriteriaUk: null, nextActionTaskId: null, timing: { targetDate: '2028-03-15', targetPeriodUk: 'Навесні' }, folderId: null, lifeAreaId: null, implementationIntentionUk: null, state: 'active', archived: false, order: 0, createdAt: now, updatedAt: now, completedAt: null, revision: 1 }; }
function project(): Project { return { id: 'project', title: 'Проєкт', description: null, desiredOutcome: null, completionCriteria: null, targetDate: '2028-03-10', folderId: null, goalId: 'goal', lifeAreaId: null, collaboratorText: null, state: 'active', archived: false, createdAt: now, updatedAt: now, completedAt: null, revision: 1 }; }
function stage(id: string, projectId: string | null = 'project'): ProjectStage { return { id, projectId, goalId: projectId ? null : 'goal', title: `Етап ${id}`, expectedOutcome: null, targetDate: null, order: 0, createdAt: now, updatedAt: now, revision: 1 }; }
async function fixture() { const repos = new PlanuiRepositories(new InMemoryTransactionalEngine()); await repos.getOrInitSettings(now); await repos.saveGoal(goal()); await repos.saveProject(project()); await repos.saveStage(stage('a')); await repos.saveStage(stage('b')); await repos.saveStage(stage('g', null)); return repos; }

describe('M4: canonical informational roadmap', () => {
  it('preserves month/quarter precision across leap and year boundaries', () => {
    assert.deepEqual(periodInterval({ precision: 'month', month: '2028-02' }), { startDate: '2028-02-01', endDateExclusive: '2028-03-01' });
    assert.deepEqual(periodInterval({ precision: 'month', month: '2027-12' }), { startDate: '2027-12-01', endDateExclusive: '2028-01-01' });
    assert.deepEqual(periodInterval({ precision: 'quarter', year: 2027, quarter: 4 }), { startDate: '2027-10-01', endDateExclusive: '2028-01-01' });
    assert.deepEqual(periodInterval({ precision: 'quarter', year: 2028, quarter: 1 }), { startDate: '2028-01-01', endDateExclusive: '2028-04-01' });
  });
  it('rejects invalid dates and reversed/equal intervals rather than swapping', () => {
    for (const period of [{ precision: 'range', startDate: '2027-02-29', endDateExclusive: '2027-03-01' }, { precision: 'range', startDate: '2028-03-02', endDateExclusive: '2028-03-01' }, { precision: 'range', startDate: '2028-03-01', endDateExclusive: '2028-03-01' }, { precision: 'quarter', year: 2028, quarter: 5 }, { precision: 'month', month: '2028-13' }]) assert.throws(() => periodInterval(period as any));
    assert.doesNotThrow(() => periodInterval({ precision: 'range', startDate: '2028-02-29', endDateExclusive: '2028-03-01' }));
  });
  it('keeps undated items and filters non-commitments explicitly', () => {
    const active = goal(), idea = { ...goal('idea'), state: 'idea' as const }, paused = { ...goal('paused'), state: 'paused' as const }, completed = { ...goal('completed'), state: 'completed' as const };
    const source = { goals: [active, idea, paused, completed], projects: [], stages: [] };
    assert.deepEqual(projectRoadmap(source).map(i => i.owner.id), ['goal']);
    assert.equal(projectRoadmap(source, ['idea', 'paused', 'completed']).length, 3);
    assert.equal(projectRoadmap(source)[0].record.roadmapPeriod, undefined);
  });
  it('requires exactly one canonical stage owner and preserves flat project stages', async () => {
    const repos = await fixture();
    const { snapshot } = await repos.captureCoherentSnapshot();
    validateDomainSnapshot(snapshot);
    assert.throws(() => validateStageRecord({ ...stage('bad'), goalId: 'goal' }, new Set(['project']), new Set(['goal'])));
    await assert.rejects(repos.saveStage({ ...stage('bad', null), goalId: 'missing' }));
    assert.throws(() => validateStageRecord({ ...stage('bad', null), goalId: null }));
    assert.equal(snapshot.stages.filter(s => s.goalId === 'goal').length, 1);
  });
  it('edits canonical deadlines and periods independently with stale-write protection', async () => {
    const repos = await fixture();
    await repos.updateRoadmapItem({ kind: 'goal', id: 'goal' }, { roadmapPeriod: { precision: 'quarter', year: 2028, quarter: 2 }, checkpoints: [{ id: 'c', title: 'Перевірка', localDate: '2028-04-20', order: 0 }] }, 1);
    let { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.goals[0].timing?.targetDate, '2028-03-15');
    assert.equal(snapshot.goals[0].timing?.targetPeriodUk, 'Навесні');
    await assert.rejects(repos.updateRoadmapItem({ kind: 'goal', id: 'goal' }, { deadline: '2028-05-01' }, 1));
    await repos.updateRoadmapItem({ kind: 'goal', id: 'goal' }, { deadline: '2028-05-01' }, 2);
    ({ snapshot } = await repos.captureCoherentSnapshot());
    assert.equal(snapshot.goals[0].timing?.targetDate, '2028-05-01');
    assert.equal(roadmapMarkers(projectRoadmap(snapshot), '2028-05-01', 'key_dates')[0].kind, 'deadline');
    assert.equal(roadmapMarkers(projectRoadmap(snapshot), '2028-03-15', 'key_dates').length, 0);
  });
  it('does not move related dates or occupancy when changing periods and layer modes', async () => {
    const repos = await fixture();
    await repos.saveTask({ id: 'task', title: 'Робота', description: null, state: 'open', priority: 'normal', deadline: { kind: 'date_only', localDate: '2028-03-01' }, estimatedDurationMinutes: 60, planningState: 'unplanned', plannedDate: null, ownership: { kind: 'project', projectId: 'project', stageId: 'a' }, checklist: [], createdAt: now, updatedAt: now, completedAt: null, canceledAt: null, revision: 1 });
    const session = buildZonedIntervalFromLocalInput({ startLocalDate: '2028-03-01', startLocalTime: '10:00', endLocalDate: '2028-03-01', endLocalTime: '11:00', originZone: 'Europe/Kyiv' }).interval;
    await repos.saveReservationTransactionally({ id: 'reservation', taskId: 'task', interval: session, state: 'active', releaseMetadata: null, createdAt: now, updatedAt: now, revision: 1 });
    const shift = buildZonedIntervalFromLocalInput({ startLocalDate: '2028-03-01', startLocalTime: '12:00', endLocalDate: '2028-03-01', endLocalTime: '16:00', originZone: 'Europe/Kyiv' }).interval;
    await repos.saveCalendarEvent({ id: 'shift', title: 'Зміна', type: 'work_shift', color: 'work', note: null, schedule: { kind: 'timed', interval: shift }, isBlocking: true, state: 'active', workProperties: { shiftName: 'Денна', shiftCode: null, sourceTemplateId: null }, createdAt: now, updatedAt: now, revision: 1 });
    const { snapshot: before } = await repos.captureCoherentSnapshot();
    const window = { windowStartInstant: '2028-03-01T00:00:00Z', windowEndInstant: '2028-03-02T00:00:00Z', displayZone: 'Europe/Kyiv', events: before.events, tasks: before.tasks, reservations: before.reservations };
    const occupancy = calculateWindowAvailability(window);
    assert.equal(occupancy.totalOccupiedMinutes, 300);
    await repos.updateRoadmapItem({ kind: 'project', id: 'project' }, { roadmapPeriod: { precision: 'month', month: '2028-04' } }, 1);
    const { snapshot: moved } = await repos.captureCoherentSnapshot();
    const affectedPlan = projectRoadmap(moved);
    assert.ok(roadmapWarnings(affectedPlan.find(i => i.owner.kind === 'project')!, affectedPlan, moved.tasks).some(w => w.includes('Робота')));
    for (const layer of ['hidden', 'key_dates', 'periods'] as const) {
      const { snapshot } = await repos.captureCoherentSnapshot();
      await repos.saveSettings({ ...snapshot.settings, roadmapLayer: layer });
      const { snapshot: after } = await repos.captureCoherentSnapshot();
      roadmapMarkers(projectRoadmap(after), '2028-03-01', layer);
      assert.deepEqual(calculateWindowAvailability({ ...window, events: after.events, tasks: after.tasks, reservations: after.reservations }), occupancy);
      assert.deepEqual(after.stages, before.stages);
      assert.deepEqual(after.tasks, before.tasks);
      assert.deepEqual(after.events, before.events);
      assert.deepEqual(after.reservations, before.reservations);
      assert.equal(after.projects[0].targetDate, before.projects[0].targetDate);
    }
  });
  it('keeps calendar-date projection invariant across zones and excludes it from overdue tasks', async () => {
    const repos = await fixture();
    await repos.updateRoadmapItem({ kind: 'project', id: 'project' }, { roadmapPeriod: { precision: 'month', month: '2028-02' }, checkpoints: [{ id: 'leap', title: 'Перевірка', localDate: '2028-02-29', order: 0 }] }, 1);
    const { snapshot } = await repos.captureCoherentSnapshot();
    for (const zone of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Kyiv']) {
      const settings = { ...snapshot.settings, timeZoneMode: 'manual' as const, manualTimeZone: zone };
      await repos.saveSettings(settings);
      const markers = roadmapMarkers(projectRoadmap(snapshot), '2028-02-29', 'periods');
      assert.equal(markers.length, 2);
      assert.equal(roadmapMarkers(projectRoadmap(snapshot), '2028-03-01', 'periods').length, 0);
      const projection = projectScheduleForDate({ localDate: '2028-04-01', displayZone: zone, events: snapshot.events, reservations: snapshot.reservations, tasks: snapshot.tasks, dayOffAnnotations: snapshot.dayOffAnnotations });
      assert.equal(projection.timelineItems.length, 0);
    }
  });
  it('reorders stage siblings and checkpoints without changing dates', async () => {
    const repos = await fixture();
    await repos.reorderRoadmapStages({ kind: 'project', id: 'project' }, ['b', 'a']);
    await repos.reorderRoadmapStages({ kind: 'goal', id: 'goal' }, ['g']);
    await assert.rejects(repos.reorderRoadmapStages({ kind: 'project', id: 'project' }, ['a', 'g']));
    await repos.updateRoadmapItem({ kind: 'stage', id: 'a' }, { checkpoints: [{ id: 'later', title: 'Пізніше', localDate: '2028-03-03', order: 0 }, { id: 'earlier', title: 'Раніше', localDate: null, order: 1 }] }, 2);
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.stages.find(s => s.id === 'b')?.order, 0);
    assert.equal(snapshot.stages.find(s => s.id === 'a')?.checkpoints?.[1].localDate, null);
  });
  it('warns on clear inconsistencies without silently repairing them', () => {
    const g = { ...goal(), roadmapPeriod: { precision: 'month' as const, month: '2028-02' } };
    const p = { ...project(), roadmapPeriod: { precision: 'month' as const, month: '2028-04' }, checkpoints: [{ id: 'c', title: 'Поза планом', localDate: '2028-05-01', order: 0 }] };
    const items = projectRoadmap({ goals: [g], projects: [p], stages: [] });
    assert.equal(roadmapWarnings(items[1], items).length, 4);
    assert.equal(p.targetDate, '2028-03-10');
  });
  it('validates checkpoint dates, names, order and duplicate identifiers', () => {
    for (const checkpoints of [[{ id: 'c', title: '', localDate: null, order: 0 }], [{ id: 'c', title: 'Точка', localDate: '2027-02-29', order: 0 }], [{ id: 'c', title: 'Точка', localDate: null, order: Infinity }], [{ id: 'c', title: 'Точка', localDate: null, order: 0 }, { id: 'c', title: 'Точка', localDate: null, order: 1 }]]) assert.throws(() => validateRoadmapMetadata({ checkpoints }));
  });
  it('round-trips roadmap metadata, owners and layer through ZIP import', async () => {
    const repos = await fixture();
    await repos.updateRoadmapItem({ kind: 'goal', id: 'goal' }, { roadmapPeriod: { precision: 'quarter', year: 2028, quarter: 1 }, checkpoints: [{ id: 'checkpoint', title: 'Огляд', localDate: '2028-02-29', order: 0 }] }, 1);
    const { snapshot } = await repos.captureCoherentSnapshot();
    await repos.saveSettings({ ...snapshot.settings, roadmapLayer: 'periods' });
    const exported = await exportFullBackupZip(repos, now);
    assert.equal(exported.manifest.backupVersion, PLANUI_BACKUP_VERSION);
    assert.equal(exported.manifest.dbSchemaVersion, PLANUI_DB_SCHEMA_VERSION);
    const preview = await validateBackupArchive(exported.zipBytes);
    const target = new PlanuiRepositories(new InMemoryTransactionalEngine());
    await target.getOrInitSettings(now);
    await executeAtomicBackupReplacement(target, preview, { explicitUserConfirmation: true, nowIso: now });
    const { snapshot: restored } = await target.captureCoherentSnapshot();
    assert.deepEqual(restored.goals, (await repos.captureCoherentSnapshot()).snapshot.goals);
    assert.equal(restored.settings.roadmapLayer, 'periods');
    assert.equal(restored.stages.find(s => s.id === 'g')?.goalId, 'goal');
  });
  it('accepts legacy v1/v2 snapshots without inventing precision or dates', async () => {
    const repos = await fixture();
    const { snapshot } = await repos.captureCoherentSnapshot();
    for (const version of [1, 2]) {
      const migrated = migrateSupportedDomainSnapshot({ ...snapshot, stages: snapshot.stages.filter(s => s.projectId), settings: { ...snapshot.settings, dbSchemaVersion: version } }, { format: PLANUI_BACKUP_FORMAT, backupVersion: version, dbSchemaVersion: version } as any).snapshot;
      validateDomainSnapshot(migrated);
      assert.equal(migrated.goals[0].timing?.targetPeriodUk, 'Навесні');
      assert.equal(migrated.goals[0].roadmapPeriod, null);
      const legacy: any = structuredClone(snapshot);
      legacy.stages = legacy.stages.filter((s: ProjectStage) => s.projectId);
      legacy.settings.dbSchemaVersion = version;
      delete legacy.settings.roadmapLayer;
      if (version === 1) { delete legacy.goals; legacy.projects[0].goalId = null; }
      const data = new TextEncoder().encode(JSON.stringify(legacy));
      const exported = await exportFullBackupZip(repos, now);
      const manifest = { ...exported.manifest, backupVersion: version, dbSchemaVersion: version, entityCounts: { ...exported.manifest.entityCounts, stages: 2, goals: version === 1 ? 0 : 1 }, files: [{ path: 'data.json', byteSize: data.length, sha256Hex: await sha256Hex(data), mimeType: 'application/json' }] };
      if (version === 1) delete manifest.entityCounts.goals;
      const zip = await createZipArchive([{ path: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) }, { path: 'data.json', bytes: data }]);
      const preview = await validateBackupArchive(zip);
      const target = new PlanuiRepositories(new InMemoryTransactionalEngine());
      await target.getOrInitSettings(now);
      await executeAtomicBackupReplacement(target, preview, { explicitUserConfirmation: true, nowIso: now });
      const { snapshot: restored } = await target.captureCoherentSnapshot();
      assert.equal(restored.projects[0].targetDate, '2028-03-10');
      assert.equal(restored.settings.dbSchemaVersion, PLANUI_DB_SCHEMA_VERSION);
      assert.equal(restored.settings.roadmapLayer, 'hidden');
      assert.equal(restored.projects[0].roadmapPeriod, null);
    }
  });
  it('runs the v2-to-current IndexedDB upgrade callback without rewriting existing dates', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const records = new Map<string, any[]>([['goals', [goal()]], ['projects', [project()]], ['stages', [stage('legacy')]], ['settings', [{ id: 'singleton', dbSchemaVersion: 2, dbGeneration: 9, revision: 5 }]]]);
    const before = structuredClone(records);
    const cursors: [string, any][] = [];
    const request: any = { result: { objectStoreNames: { contains: () => true }, close() {} }, transaction: { objectStore(name: string) { return { openCursor() { const cursorRequest: any = {}; cursors.push([name, cursorRequest]); return cursorRequest; } }; } } };
    try {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open(name: string, version: number) { assert.equal(version, PLANUI_DB_SCHEMA_VERSION); return request; } } });
      const engine = new IndexedDbStorageEngine('isolated-m4-upgrade');
      const opened = (engine as unknown as { openDatabase(): Promise<unknown> }).openDatabase();
      request.onupgradeneeded({ oldVersion: 2 });
      for (const [name, cursorRequest] of cursors) {
        for (let index = 0; index < records.get(name)!.length; index++) {
          cursorRequest.result = { value: structuredClone(records.get(name)![index]), update(value: unknown) { records.get(name)![index] = value; }, continue() {} };
          cursorRequest.onsuccess();
        }
        cursorRequest.result = null; cursorRequest.onsuccess();
      }
      request.onsuccess(); await opened;
      for (const name of ['goals', 'projects', 'stages']) assert.deepEqual(records.get(name)![0], { ...before.get(name)![0], roadmapPeriod: null, checkpoints: [] });
      assert.deepEqual(records.get('settings')![0], { ...before.get('settings')![0], dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION, roadmapLayer: 'hidden', dailyPlans: {} });
      engine.close();
    } finally {
      if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });
  it('deletes goal-owned stages with their canonical owner', async () => {
    const repos = await fixture();
    await repos.deleteGoalTransactionally('goal', 'unlink_children');
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.stages.some(s => s.id === 'g'), false);
    assert.equal(snapshot.stages.length, 2);
    validateDomainSnapshot(snapshot);
  });
});
