import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DailyPlan, Task, TaskReservation, PLANUI_BACKUP_FORMAT, PLANUI_DB_SCHEMA_VERSION } from '../../domain/types';
import { EMPTY_DAILY_PLAN, deadlineDate, previewPlanningChange, projectTodayTasks, restoreTodayInteraction, sessionFromDuration, shouldRevealNow, suggestFocusTasks, validateDailyPlans } from '../../domain/today';
import { addDaysToLocalDate, buildZonedIntervalFromLocalInput } from '../../domain/temporal';
import { calculateWindowAvailability, detectScheduleConflicts, projectScheduleForDate, computeCollapsedNextDaySummary } from '../../domain/scheduling';
import { validateDomainSnapshot, validateTaskRecord } from '../../domain/validation';
import { InMemoryTransactionalEngine, IndexedDbStorageEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import { executeAtomicBackupReplacement, exportFullBackupZip, migrateSupportedDomainSnapshot, validateBackupArchive } from '../backup/backupService';
import { createInitialDestinationContextMap, updateDestinationContext } from '../../state/shellStore';

const zone = 'Europe/Kyiv';
const day = '2026-11-04';
const now = '2026-11-04T10:30:00.000Z';
function task(id = 'task'): Task { return { id, title: `Справа ${id}`, description: null, state: 'open', priority: 'normal', deadline: null, estimatedDurationMinutes: 120, planningState: 'unplanned', plannedDate: null, ownership: { kind: 'standalone', folderId: null }, checklist: [], createdAt: now, updatedAt: now, completedAt: null, canceledAt: null, revision: 1 }; }
function reservation(id: string, start: string, end: string): TaskReservation { return { id, taskId: 'task', interval: buildZonedIntervalFromLocalInput({ startLocalDate: day, startLocalTime: start, endLocalDate: day, endLocalTime: end, originZone: zone }).interval, state: 'active', releaseMetadata: null, createdAt: now, updatedAt: now, revision: 1 }; }
async function fixture() { const repos = new PlanuiRepositories(new InMemoryTransactionalEngine()); await repos.getOrInitSettings(now); await repos.saveTask(task()); return repos; }

describe('M5: Today working space', () => {
  it('restores date/mode/scroll and only reveals now on first unhandled actual-day entry', () => {
    const initial = restoreTodayInteraction(null, day);
    assert.equal(shouldRevealNow(initial, day), true);
    const restored = restoreTodayInteraction(JSON.stringify({ selectedDate: '2026-10-31', mode: 'tasks', scrollTop: 980 }), day);
    assert.equal(restored.selectedDate, '2026-10-31');
    assert.equal(restored.mode, 'tasks'); assert.equal(restored.scrollTop, 980);
    assert.equal(shouldRevealNow(restored, day), false);
    assert.equal(shouldRevealNow({ ...initial, hasInteraction: true }, day), false);
    assert.equal(shouldRevealNow({ ...initial, scrollTop: 50 }, day), false);
    assert.equal(shouldRevealNow({ ...initial, mode: 'habits' }, day), false);
    for (const raw of ['{', '{"mode":"day","selectedDate":"2026-02-30","scrollTop":5}', '{"mode":"day","selectedDate":"2026-11-04","scrollTop":-1}']) assert.deepEqual(restoreTodayInteraction(raw, day), initial);
    const contexts = createInitialDestinationContextMap(day);
    const returned = updateDestinationContext(contexts, 'today', { ...restored, nextDayCollapsed: true });
    const other = updateDestinationContext(returned, 'calendar', { selectedDate: '2027-01-01' });
    assert.deepEqual(other.today, returned.today);
    assert.equal(other.today.nextDayCollapsed, true);
  });
  it('projects date-only assignments, exact deadlines, sessions and explicit focus without injecting all undated or past plans', () => {
    const dated = { ...task('dated'), planningState: 'date_only' as const, plannedDate: day };
    const past = { ...task('past'), planningState: 'date_only' as const, plannedDate: '2026-11-03' };
    const due = { ...task('due'), deadline: { kind: 'date_only' as const, localDate: day } };
    const exact = { ...task('exact'), deadline: { kind: 'exact_instant' as const, instant: '2026-11-04T00:30:00Z', zoneId: zone } };
    const session = reservation('session', '12:00', '13:00');
    const tasks = [task(), dated, past, due, exact, task('undated')];
    const result = projectTodayTasks(tasks, [session], day, zone);
    assert.deepEqual(result.relevant.map(t => t.id), ['task', 'dated', 'due', 'exact']);
    assert.equal(deadlineDate(exact, 'America/Los_Angeles'), '2026-11-03');
    const focused = projectTodayTasks(tasks, [session], day, zone, { ...EMPTY_DAILY_PLAN, focusTaskIds: ['undated'] });
    assert.ok(focused.relevant.some(t => t.id === 'undated'));
    assert.equal(tasks.find(t => t.id === 'undated')?.plannedDate, null);
    const released: TaskReservation = { ...session, state: 'released', releaseMetadata: { releasedAt: '2026-11-04T08:00:00.000Z', reason: 'manual_unplan', originalStartInstant: session.interval.startInstant, originalEndInstant: session.interval.endInstant } };
    assert.equal(projectTodayTasks([task()], [released], day, zone).relevant.length, 0);
  });
  it('persists unlimited explicit focus and a note per calendar date, with independent dates and stale-plan protection', async () => {
    const repos = await fixture();
    for (const id of ['a', 'b', 'c', 'd']) await repos.saveTask({ ...task(id), plannedDate: day, planningState: 'date_only' });
    const suggestionsSnapshot = (await repos.captureCoherentSnapshot()).snapshot;
    assert.equal(suggestFocusTasks(suggestionsSnapshot.tasks, [], day, zone).length, 3);
    assert.equal(suggestionsSnapshot.settings.dailyPlans?.[day], undefined);
    const plan: DailyPlan = { focusTaskIds: ['a', 'b', 'c', 'd'], focusNoteUk: 'Один важливий крок', minimalDay: true };
    await repos.saveDailyPlan(day, plan, EMPTY_DAILY_PLAN);
    await repos.saveDailyPlan('2026-11-05', { ...EMPTY_DAILY_PLAN, focusTaskIds: ['task'] }, EMPTY_DAILY_PLAN);
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.deepEqual(snapshot.settings.dailyPlans?.[day], plan);
    assert.deepEqual(snapshot.settings.dailyPlans?.['2026-11-05']?.focusTaskIds, ['task']);
    await assert.rejects(repos.saveDailyPlan(day, EMPTY_DAILY_PLAN, EMPTY_DAILY_PLAN));
    await assert.rejects(repos.saveDailyPlan('2026-11-06', { ...EMPTY_DAILY_PLAN, focusTaskIds: ['missing'] }));
  });
  it('minimal-day filtering ignores priority and never changes deadlines, assignments, sessions or occupancy', async () => {
    const repos = await fixture();
    await repos.saveTask({ ...task('optional-high'), priority: 'high', planningState: 'date_only', plannedDate: day });
    await repos.saveTask({ ...task('due-low'), priority: 'low', deadline: { kind: 'date_only', localDate: day } });
    await repos.saveTask({ ...task('focus'), effort: 'small', planningState: 'date_only', plannedDate: day });
    await repos.saveReservationTransactionally(reservation('session', '12:00', '13:00'));
    const { snapshot: before } = await repos.captureCoherentSnapshot();
    const plan: DailyPlan = { focusTaskIds: ['focus'], minimalDay: true, focusNoteUk: null };
    await repos.saveDailyPlan(day, plan, EMPTY_DAILY_PLAN);
    const { snapshot: after } = await repos.captureCoherentSnapshot();
    const projected = projectTodayTasks(after.tasks, after.reservations, day, zone, plan);
    assert.ok(!projected.visible.some(t => t.id === 'optional-high'));
    assert.ok(projected.visible.some(t => t.id === 'due-low'));
    assert.ok(projected.visible.some(t => t.id === 'task'));
    assert.ok(projected.visible.some(t => t.id === 'focus'));
    assert.equal(projected.hiddenCount, 1);
    assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.reservations, before.reservations); assert.deepEqual(after.events, before.events);
    const availability = (snapshot: typeof before) => calculateWindowAvailability({ windowStartInstant: '2026-11-04T00:00:00Z', windowEndInstant: '2026-11-05T00:00:00Z', displayZone: zone, tasks: snapshot.tasks, reservations: snapshot.reservations, events: snapshot.events });
    assert.deepEqual(availability(after), availability(before));
    assert.equal(availability(after).totalOccupiedMinutes, 60);
  });
  it('keeps one overnight event across the selected/next dates and carries in from the previous date', async () => {
    const repos = await fixture();
    const interval = buildZonedIntervalFromLocalInput({ startLocalDate: '2026-12-31', startLocalTime: '22:00', endLocalDate: '2027-01-01', endLocalTime: '06:00', originZone: zone }).interval;
    await repos.saveCalendarEvent({ id: 'overnight', title: 'Нічна зміна', type: 'work_shift', color: 'work', note: null, schedule: { kind: 'timed', interval }, isBlocking: true, state: 'active', workProperties: { shiftName: 'Нічна', shiftCode: null, sourceTemplateId: null }, createdAt: now, updatedAt: now, revision: 1 });
    const { snapshot } = await repos.captureCoherentSnapshot();
    const project = (localDate: string) => projectScheduleForDate({ localDate, displayZone: zone, tasks: snapshot.tasks, reservations: snapshot.reservations, events: snapshot.events, dayOffAnnotations: [] });
    const first = project('2026-12-31'), next = project(addDaysToLocalDate('2026-12-31', 1));
    assert.equal(snapshot.events.length, 1);
    assert.equal(first.timelineItems[0].sourceId, next.timelineItems[0].sourceId);
    assert.equal(next.timelineItems[0].segment.continuesBeforeDayStart, true);
    assert.equal(computeCollapsedNextDaySummary(next).overnightCarryoverItems.length, 1);
    assert.equal(first.availability.totalOccupiedMinutes + next.availability.totalOccupiedMinutes, 480);
  });
  it('previews and applies unplanning exactly while preserving historical intervals and deadlines', async () => {
    const repos = await fixture();
    await repos.saveTask({ ...task(), deadline: { kind: 'date_only', localDate: '2026-11-07' } }, 1);
    for (const r of [reservation('history', '09:00', '10:00'), reservation('current', '12:00', '13:00'), reservation('future', '15:00', '16:00')]) await repos.saveReservationTransactionally(r);
    const { snapshot } = await repos.captureCoherentSnapshot();
    const current = snapshot.tasks[0];
    const preview = previewPlanningChange(current, snapshot.reservations, null, now);
    assert.deepEqual(preview.sessions.map(s => s.action), ['retain_history', 'truncate_current', 'release_future']);
    await repos.setTaskDateOnlyPlanningTransactionally(preview.taskId, preview.nextDate, preview.nowIso, preview.taskRevision, Object.fromEntries(preview.sessions.map(s => [s.id, s.revision])));
    const { snapshot: after } = await repos.captureCoherentSnapshot();
    assert.equal(after.tasks[0].planningState, 'unplanned'); assert.equal(after.tasks[0].state, 'open');
    assert.deepEqual(after.tasks[0].deadline, current.deadline);
    assert.equal(after.reservations.length, 3);
    assert.deepEqual(after.reservations.find(r => r.id === 'history')?.interval, snapshot.reservations.find(r => r.id === 'history')?.interval);
    assert.equal(after.reservations.find(r => r.id === 'current')?.interval.endInstant, now);
    assert.equal(after.reservations.find(r => r.id === 'current')?.releaseMetadata?.originalEndInstant, snapshot.reservations.find(r => r.id === 'current')?.interval.endInstant);
  });
  it('rejects stale previews when a reservation changes without a task revision change', async () => {
    const repos = await fixture(); await repos.saveReservationTransactionally(reservation('future', '15:00', '16:00'));
    const { snapshot } = await repos.captureCoherentSnapshot();
    const preview = previewPlanningChange(snapshot.tasks[0], snapshot.reservations, null, now);
    await repos.rescheduleReservationTransactionally('future', sessionFromDuration(day, '16:00', 30, zone), now, 1);
    await assert.rejects(repos.setTaskDateOnlyPlanningTransactionally('task', null, now, preview.taskRevision, Object.fromEntries(preview.sessions.map(s => [s.id, s.revision]))));
    assert.equal((await repos.captureCoherentSnapshot()).snapshot.reservations[0].state, 'active');
  });
  it('single current-reservation cancellation preserves the elapsed part and other sessions', async () => {
    const repos = await fixture();
    await repos.saveReservationTransactionally(reservation('current', '12:00', '13:00'));
    await repos.saveReservationTransactionally(reservation('future', '15:00', '16:00'));
    const { snapshot: before } = await repos.captureCoherentSnapshot();
    await repos.cancelSingleReservationTransactionally('current', 'release', now, 1);
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.reservations[0].interval.endInstant, now);
    assert.equal(snapshot.reservations[0].releaseMetadata?.originalEndInstant, before.reservations[0].interval.endInstant);
    assert.deepEqual(snapshot.reservations[1], before.reservations[1]);
    assert.equal(snapshot.tasks[0].state, 'open');
    assert.equal(projectScheduleForDate({ localDate: day, displayZone: zone, tasks: snapshot.tasks, reservations: snapshot.reservations, events: [], dayOffAnnotations: [] }).availability.totalOccupiedMinutes, 90);
  });
  it('completion releases future/remainder; elapsed sessions never complete tasks; reopening restores no reservations', async () => {
    const repos = await fixture();
    for (const r of [reservation('history', '09:00', '10:00'), reservation('current', '12:00', '13:00'), reservation('future', '15:00', '16:00')]) await repos.saveReservationTransactionally(r);
    assert.equal((await repos.captureCoherentSnapshot()).snapshot.tasks[0].state, 'open');
    await repos.completeTaskTransactionally('task', now);
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(snapshot.tasks[0].state, 'completed');
    assert.equal(snapshot.reservations.find(r => r.id === 'current')?.interval.endInstant, now);
    assert.equal(snapshot.reservations.find(r => r.id === 'future')?.state, 'released');
    await repos.reopenTaskTransactionally('task', '2026-11-04T11:00:00.000Z');
    const { snapshot: reopened } = await repos.captureCoherentSnapshot();
    assert.deepEqual(reopened.reservations, snapshot.reservations);
    assert.equal(reopened.tasks[0].estimatedDurationMinutes, 120);
  });
  it('supports multiple sessions, explicit elapsed duration, conflict detection and union availability', async () => {
    const repos = await fixture();
    const first = sessionFromDuration(day, '12:00', 60, zone), second = sessionFromDuration(day, '12:30', 60, zone);
    await repos.saveReservationTransactionally({ ...reservation('one', '12:00', '13:00'), interval: first });
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.equal(detectScheduleConflicts({ candidateStartInstant: second.startInstant, candidateEndInstant: second.endInstant, displayZone: zone, tasks: snapshot.tasks, events: [], reservations: snapshot.reservations }).hasConflicts, true);
    await repos.saveReservationTransactionally({ ...reservation('two', '12:30', '13:30'), interval: second });
    const after = (await repos.captureCoherentSnapshot()).snapshot;
    const schedule = projectScheduleForDate({ localDate: day, displayZone: zone, tasks: after.tasks, events: [], reservations: after.reservations, dayOffAnnotations: [] });
    assert.equal(schedule.availability.totalOccupiedMinutes, 90);
    assert.equal(after.reservations.length, 2);
    assert.equal(after.tasks[0].estimatedDurationMinutes, 120);
    const dst = sessionFromDuration('2026-03-29', '02:30', 120, zone);
    assert.equal(Date.parse(dst.endInstant) - Date.parse(dst.startInstant), 120 * 60000);
    assert.throws(() => sessionFromDuration('2026-03-29', '03:30', 60, zone));
    assert.throws(() => sessionFromDuration(day, '12:00', 0, zone));
  });
  it('manual effort and daily plans validate and round-trip through v4 ZIP while legacy v3 defaults remain uninferred', async () => {
    const repos = await fixture();
    await repos.setTaskEffort('task', 'large', 1);
    await repos.saveDailyPlan(day, { focusTaskIds: ['task'], focusNoteUk: 'Мій намір', minimalDay: true });
    const { snapshot } = await repos.captureCoherentSnapshot();
    assert.throws(() => validateTaskRecord({ ...snapshot.tasks[0], effort: 'automatic' as any }));
    assert.throws(() => validateDailyPlans({ '2026-02-30': EMPTY_DAILY_PLAN }));
    assert.throws(() => validateDailyPlans({ [day]: { ...EMPTY_DAILY_PLAN, focusTaskIds: ['task', 'task'] } }));
    const exported = await exportFullBackupZip(repos, now);
    const preview = await validateBackupArchive(exported.zipBytes);
    const target = new PlanuiRepositories(new InMemoryTransactionalEngine()); await target.getOrInitSettings(now);
    await executeAtomicBackupReplacement(target, preview, { explicitUserConfirmation: true, nowIso: now });
    const restored = (await target.captureCoherentSnapshot()).snapshot;
    assert.deepEqual(restored.settings.dailyPlans, snapshot.settings.dailyPlans);
    assert.equal(restored.tasks[0].effort, 'large'); validateDomainSnapshot(restored);
    const legacy: any = structuredClone(snapshot); delete legacy.settings.dailyPlans; delete legacy.tasks[0].effort;
    const migrated = migrateSupportedDomainSnapshot(legacy, { format: PLANUI_BACKUP_FORMAT, backupVersion: 3, dbSchemaVersion: 3 } as any).snapshot;
    assert.deepEqual(migrated.settings.dailyPlans, {});
    assert.equal(migrated.tasks[0].effort, undefined);
    assert.equal(migrated.settings.dbSchemaVersion, PLANUI_DB_SCHEMA_VERSION);
    assert.deepEqual(migrated.tasks[0].deadline, snapshot.tasks[0].deadline);
  });
  it('rejects creation against a stale task revision instead of adding a session after a lifecycle edit', async () => {
    const repos = await fixture();
    await repos.completeTaskTransactionally('task', now);
    await assert.rejects(repos.saveReservationTransactionally(reservation('late', '15:00', '16:00'), undefined, 1));
    assert.equal((await repos.captureCoherentSnapshot()).snapshot.reservations.length, 0);
  });
  it('upgrades live v3 settings to v4 with empty daily plans and no inferred task effort or date changes', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const old = { id: 'singleton', dbSchemaVersion: 3, dbGeneration: 7, revision: 12, roadmapLayer: 'periods', todayNextDayCollapsed: true };
    let updated: unknown;
    const cursorRequest: any = {};
    const request: any = { result: { objectStoreNames: { contains: () => true }, close() {} }, transaction: { objectStore(name: string) { assert.equal(name, 'settings'); return { openCursor() { return cursorRequest; } }; } } };
    try {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open(name: string, version: number) { assert.equal(version, PLANUI_DB_SCHEMA_VERSION); return request; } } });
      const engine = new IndexedDbStorageEngine('isolated-m5-upgrade');
      const opened = (engine as unknown as { openDatabase(): Promise<unknown> }).openDatabase();
      request.onupgradeneeded({ oldVersion: 3 });
      cursorRequest.result = { value: old, update(value: unknown) { updated = value; }, continue() {} };
      cursorRequest.onsuccess(); cursorRequest.result = null; cursorRequest.onsuccess();
      request.onsuccess(); await opened;
      assert.deepEqual(updated, { ...old, dailyPlans: {}, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION });
      engine.close();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });
});
