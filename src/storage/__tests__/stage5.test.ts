import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToLocalDate,
  buildZonedIntervalFromLocalInput,
  computeClockLabelDurationMinutes,
  computeElapsedDurationMinutes,
  doIntervalsOverlap,
  evaluateTimeZoneStatus,
  getLocalDateBoundariesInZone,
  intersectIntervals,
  projectIntervalOntoLocalDates,
  rescheduleZonedIntervalInZone,
  resolveAllDayEventOccupancyInterval,
  resolveLocalDateTimeToInstant,
  subtractIntervalUnions,
  suggestEndDateForClockRange,
  unionIntervals,
} from '../../domain/temporal';
import {
  calculateWindowAvailability,
  detectScheduleConflicts,
  projectScheduleForDate,
} from '../../domain/scheduling';
import { parseLocalizedPriceInput } from '../../domain/wishlist';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  validateBackupArchive,
} from '../backup/backupService';

describe('Stage 5: Shared Time Engine and Scheduling Lifecycle', () => {
  it('5.1 Temporal functions: calendar arithmetic, leap dates, DST spring-forward gap & fall-back repeat, and clock vs elapsed duration', () => {
    // Calendar arithmetic across leap year Feb 2024 and non-leap Feb 2025
    assert.equal(addDaysToLocalDate('2024-02-28', 1), '2024-02-29');
    assert.equal(addDaysToLocalDate('2024-02-29', 1), '2024-03-01');
    assert.equal(addDaysToLocalDate('2025-02-28', 1), '2025-03-01');
    assert.equal(addDaysToLocalDate('2026-12-31', 1), '2027-01-01');

    // DST Spring Forward in Europe/Kyiv: 2026-03-29 at 03:00 jumps to 04:00 (23-hour day = 1380 min)
    const springBounds = getLocalDateBoundariesInZone('2026-03-29', 'Europe/Kyiv');
    assert.equal(springBounds.durationMinutes, 23 * 60);
    assert.equal(springBounds.dstKind, 'spring_forward_short');

    // Nonexistent local time 03:30 on 2026-03-29 in Europe/Kyiv
    assert.throws(
      () =>
        resolveLocalDateTimeToInstant(
          '2026-03-29',
          '03:30',
          'Europe/Kyiv',
          'reject'
        ),
      (err: unknown) => err instanceof Error && /літній час/i.test(err.message)
    );

    const gapCompatible = resolveLocalDateTimeToInstant(
      '2026-03-29',
      '03:30',
      'Europe/Kyiv',
      'compatible'
    );
    assert.equal(gapCompatible.status, 'gap');
    assert.ok(gapCompatible.dstNoticeUk && gapCompatible.dstNoticeUk.length > 0);

    // Overnight shift crossing spring-forward: 2026-03-28 22:00 to 2026-03-29 06:00 in Europe/Kyiv
    // Clock label difference is 8h (480m), actual elapsed duration is 7h (420m)
    const springOvernight = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-03-28',
      startLocalTime: '22:00',
      endLocalDate: '2026-03-29',
      endLocalTime: '06:00',
      originZone: 'Europe/Kyiv',
    });
    assert.equal(springOvernight.clockLabelDurationMinutes, 480);
    assert.equal(springOvernight.elapsedDurationMinutes, 420);
    assert.equal(
      computeClockLabelDurationMinutes(springOvernight.interval),
      480
    );
    assert.equal(
      computeElapsedDurationMinutes(
        springOvernight.interval.startInstant,
        springOvernight.interval.endInstant
      ),
      420
    );

    // DST Fall Back in Europe/Kyiv: 2026-10-25 at 04:00 repeats 03:00 (25-hour day = 1500 min)
    const fallBounds = getLocalDateBoundariesInZone('2026-10-25', 'Europe/Kyiv');
    assert.equal(fallBounds.durationMinutes, 25 * 60);
    assert.equal(fallBounds.dstKind, 'fall_back_long');

    // Repeated local time 03:30 on 2026-10-25 in Europe/Kyiv
    const earlierRepeat = resolveLocalDateTimeToInstant(
      '2026-10-25',
      '03:30',
      'Europe/Kyiv',
      'earlier'
    );
    const laterRepeat = resolveLocalDateTimeToInstant(
      '2026-10-25',
      '03:30',
      'Europe/Kyiv',
      'later'
    );
    assert.equal(earlierRepeat.status, 'repeated');
    assert.equal(laterRepeat.status, 'repeated');
    assert.equal(laterRepeat.epochMs - earlierRepeat.epochMs, 60 * 60_000);

    // Half-open interval algebra (start inclusive, end exclusive)
    const intA = {
      startMs: Date.parse('2026-05-10T08:00:00.000Z'),
      endMs: Date.parse('2026-05-10T10:00:00.000Z'),
    };
    const intB = {
      startMs: Date.parse('2026-05-10T10:00:00.000Z'),
      endMs: Date.parse('2026-05-10T12:00:00.000Z'),
    };
    const intC = {
      startMs: Date.parse('2026-05-10T09:00:00.000Z'),
      endMs: Date.parse('2026-05-10T11:00:00.000Z'),
    };

    // Adjacent half-open intervals [08:00, 10:00) and [10:00, 12:00) do not overlap
    assert.equal(doIntervalsOverlap(intA, intB), false);
    assert.equal(intersectIntervals(intA, intB), null);
    assert.equal(doIntervalsOverlap(intA, intC), true);

    const merged = unionIntervals([intA, intC]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].startMs, Date.parse('2026-05-10T08:00:00.000Z'));
    assert.equal(merged[0].endMs, Date.parse('2026-05-10T11:00:00.000Z'));

    const subtracted = subtractIntervalUnions(
      {
        startMs: Date.parse('2026-05-10T07:00:00.000Z'),
        endMs: Date.parse('2026-05-10T13:00:00.000Z'),
      },
      [intA, intC]
    );
    assert.equal(subtracted.length, 2);
    assert.equal(
      subtracted[0].startMs,
      Date.parse('2026-05-10T07:00:00.000Z')
    );
    assert.equal(subtracted[0].endMs, Date.parse('2026-05-10T08:00:00.000Z'));
    assert.equal(
      subtracted[1].startMs,
      Date.parse('2026-05-10T11:00:00.000Z')
    );
    assert.equal(subtracted[1].endMs, Date.parse('2026-05-10T13:00:00.000Z'));
  });

  it('5.2 Zones: device vs manual mode, display-zone change vs explicit reschedule, and blocking all-day origin boundaries', () => {
    // Device mode zone change detection
    const deviceStatus = evaluateTimeZoneStatus(
      {
        timeZoneMode: 'device',
        manualTimeZone: null,
        lastDetectedTimeZone: 'Europe/Kyiv',
      },
      'America/New_York'
    );
    assert.equal(deviceStatus.effectiveZone, 'America/New_York');
    assert.equal(deviceStatus.zoneChangedInDeviceMode, true);
    assert.ok(
      deviceStatus.explanationBannerUk &&
        deviceStatus.explanationBannerUk.includes('America/New_York')
    );

    // Manual mode stays fixed when device zone changes
    const manualStatus = evaluateTimeZoneStatus(
      {
        timeZoneMode: 'manual',
        manualTimeZone: 'Europe/Kyiv',
        lastDetectedTimeZone: 'Europe/Kyiv',
      },
      'America/New_York'
    );
    assert.equal(manualStatus.effectiveZone, 'Europe/Kyiv');
    assert.equal(manualStatus.zoneChangedInDeviceMode, false);
    assert.equal(manualStatus.explanationBannerUk, null);

    // Detection failure requires explicit user choice without silent Kyiv fallback
    const failedDetectionStatus = evaluateTimeZoneStatus(
      {
        timeZoneMode: 'device',
        manualTimeZone: null,
        lastDetectedTimeZone: '',
      },
      null
    );
    assert.equal(failedDetectionStatus.requiresManualZoneChoice, true);

    // Viewing an event in another display zone preserves stored instants and exposes origin context
    const kyivEvent = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-06-15',
      startLocalTime: '10:00',
      endLocalDate: '2026-06-15',
      endLocalTime: '12:00',
      originZone: 'Europe/Kyiv',
    });
    const segmentsInLondon = projectIntervalOntoLocalDates(
      'ev-1',
      kyivEvent.interval,
      'Europe/London'
    );
    assert.equal(segmentsInLondon.length, 1);
    assert.equal(segmentsInLondon[0].displayStartLocalTime, '08:00');
    assert.equal(segmentsInLondon[0].displayEndLocalTime, '10:00');
    assert.equal(segmentsInLondon[0].originZone, 'Europe/Kyiv');
    assert.equal(segmentsInLondon[0].originZoneDiffersFromDisplay, true);

    // Explicit rescheduling in another zone rewrites instants intentionally
    const rescheduledToLondonWallClock = rescheduleZonedIntervalInZone(
      kyivEvent.interval,
      {
        startLocalDate: '2026-06-15',
        startLocalTime: '10:00',
        endLocalDate: '2026-06-15',
        endLocalTime: '12:00',
        targetZone: 'Europe/London',
      }
    );
    assert.notEqual(
      rescheduledToLondonWallClock.startInstant,
      kyivEvent.interval.startInstant
    );
    assert.equal(rescheduledToLondonWallClock.originZone, 'Europe/London');

    // Blocking all-day event reserves its own record-zone date boundaries
    const allDayOcc = resolveAllDayEventOccupancyInterval(
      {
        kind: 'all_day',
        startLocalDate: '2026-06-15',
        endLocalDateExclusive: '2026-06-16',
        originZone: 'Europe/Kyiv',
      },
      'America/New_York'
    );
    const kyivJune15Bounds = getLocalDateBoundariesInZone(
      '2026-06-15',
      'Europe/Kyiv'
    );
    assert.equal(allDayOcc.startInstant, kyivJune15Bounds.startInstant);
    assert.equal(allDayOcc.endInstant, kyivJune15Bounds.endInstant);
    // In America/New_York (UTC-4), Kyiv 2026-06-15 00:00 (UTC+3) is 2026-06-14 17:00, touching both 2026-06-14 and 2026-06-15
    assert.ok(allDayOcc.displayedDatesTouched.includes('2026-06-14'));
    assert.ok(allDayOcc.displayedDatesTouched.includes('2026-06-15'));
    assert.ok(allDayOcc.travelBoundaryNoteUk);
  });

  it('5.3 Events and overnight shifts: next-day suggestion, equal-clocks ambiguity rejection, single-record overnight segmentation, and edit propagation', async () => {
    const engine = new InMemoryTransactionalEngine('stage5_events_db');
    const repos = new PlanuiRepositories(engine);

    // Suggest next day when end clock is earlier than start clock
    const sug = suggestEndDateForClockRange('2026-05-10', '20:00', '08:00');
    assert.equal(sug.isOvernightSuggestion, true);
    assert.equal(sug.suggestedEndLocalDate, '2026-05-11');

    // Equal clocks on the same date require clarification (do not infer 24h silently)
    assert.throws(
      () =>
        buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-05-10',
          startLocalTime: '09:00',
          endLocalDate: '2026-05-10',
          endLocalTime: '09:00',
          originZone: 'Europe/Kyiv',
        }),
      (err: unknown) => err instanceof Error && /збігається/i.test(err.message)
    );

    // Save one overnight work shift (20:00 -> 08:00 next day)
    const shiftBuilt = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-05-10',
      startLocalTime: '20:00',
      endLocalDate: '2026-05-11',
      endLocalTime: '08:00',
      originZone: 'Europe/Kyiv',
    });
    const shiftRecord = await repos.saveCalendarEvent({
      id: 'shift-overnight-1',
      title: 'Нічна зміна',
      note: 'Чергування',
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      schedule: {
        kind: 'timed',
        interval: shiftBuilt.interval,
      },
      workProperties: {
        shiftName: 'Нічна зміна',
        shiftCode: 'Н1',
        sourceTemplateId: null,
      },
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      revision: 1,
    });

    // Only one persisted event record exists
    const { snapshot: snap1 } = await repos.captureCoherentSnapshot();
    const allEvents = snap1.events;
    assert.equal(allEvents.length, 1);

    // Projections on May 10 and May 11 both show their respective segments referencing the same sourceId
    const may10Proj = projectScheduleForDate({
      localDate: '2026-05-10',
      displayZone: 'Europe/Kyiv',
      events: allEvents,
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    });
    const may11Proj = projectScheduleForDate({
      localDate: '2026-05-11',
      displayZone: 'Europe/Kyiv',
      events: allEvents,
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    });

    assert.equal(may10Proj.timelineItems.length, 1);
    assert.equal(may10Proj.timelineItems[0].sourceId, shiftRecord.id);
    assert.equal(
      may10Proj.timelineItems[0].segment.displayStartLocalTime,
      '20:00'
    );
    assert.equal(
      may10Proj.timelineItems[0].segment.displayEndLocalTime,
      '00:00'
    );
    assert.equal(may10Proj.timelineItems[0].segment.endMinuteOfDay, 1440);
    assert.equal(
      may10Proj.timelineItems[0].segment.elapsedDurationMinutes,
      240
    );
    assert.equal(may10Proj.timelineItems[0].segment.continuesAfterDayEnd, true);

    assert.equal(may11Proj.timelineItems.length, 1);
    assert.equal(may11Proj.timelineItems[0].sourceId, shiftRecord.id);
    assert.equal(
      may11Proj.timelineItems[0].segment.displayStartLocalTime,
      '00:00'
    );
    assert.equal(
      may11Proj.timelineItems[0].segment.displayEndLocalTime,
      '08:00'
    );
    assert.equal(
      may11Proj.timelineItems[0].segment.elapsedDurationMinutes,
      480
    );
    assert.equal(
      may11Proj.timelineItems[0].segment.continuesBeforeDayStart,
      true
    );

    // Rescheduling the single overnight record updates both day segments coherently
    const updatedShiftBuilt = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-05-10',
      startLocalTime: '21:00',
      endLocalDate: '2026-05-11',
      endLocalTime: '07:00',
      originZone: 'Europe/Kyiv',
    });
    await repos.rescheduleCalendarEventTransactionally(
      shiftRecord.id,
      { kind: 'timed', interval: updatedShiftBuilt.interval },
      '2026-05-01T11:00:00.000Z',
      shiftRecord.revision
    );

    const { snapshot: snap2 } = await repos.captureCoherentSnapshot();
    const updatedEvents = snap2.events;
    const may10After = projectScheduleForDate({
      localDate: '2026-05-10',
      displayZone: 'Europe/Kyiv',
      events: updatedEvents,
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    });
    const may11After = projectScheduleForDate({
      localDate: '2026-05-11',
      displayZone: 'Europe/Kyiv',
      events: updatedEvents,
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    });
    assert.equal(
      may10After.timelineItems[0].segment.displayStartLocalTime,
      '21:00'
    );
    assert.equal(
      may11After.timelineItems[0].segment.displayEndLocalTime,
      '07:00'
    );
  });

  it('5.4 Task planning & reservations: replaces date-only intention when timed, supports multiple sessions, and preserves task metadata on reschedule/cancel', async () => {
    const engine = new InMemoryTransactionalEngine('stage5_planning_db');
    const repos = new PlanuiRepositories(engine);

    // Create task with date-only intention, priority, deadline, estimate, and folder ownership
    await repos.saveFolder({
      id: 'folder-music',
      name: 'Музика',
      parentId: null,
      order: 1,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      revision: 1,
    });

    await repos.saveTask({
      id: 'task-mix',
      title: 'Звести ударні',
      description: 'Фінальний мікс',
      state: 'open',
      priority: 'high',
      deadline: { kind: 'date_only', localDate: '2026-05-20' },
      estimatedDurationMinutes: 120,
      planningState: 'date_only',
      plannedDate: '2026-05-12',
      ownership: { kind: 'standalone', folderId: 'folder-music' },
      checklist: [],
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });

    // Transitioning to timed reservation replaces contradictory date-only intention
    const session1Built = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-05-14',
      startLocalTime: '14:00',
      endLocalDate: '2026-05-14',
      endLocalTime: '15:00',
      originZone: 'Europe/Kyiv',
    });
    await repos.saveReservationTransactionally({
      id: 'res-mix-1',
      taskId: 'task-mix',
      interval: session1Built.interval,
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-05-02T10:00:00.000Z',
      updatedAt: '2026-05-02T10:00:00.000Z',
      revision: 1,
    });

    let { snapshot: snap1 } = await repos.captureCoherentSnapshot();
    let taskAfterSession1 = snap1.tasks.find((t) => t.id === 'task-mix')!;
    assert.equal(taskAfterSession1.planningState, 'timed');
    assert.equal(taskAfterSession1.plannedDate, null);

    // Rescheduling the reservation must not change task priority, deadline, estimate, or ownership
    const session1RescheduledBuilt = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-05-14',
      startLocalTime: '15:00',
      endLocalDate: '2026-05-14',
      endLocalTime: '16:30',
      originZone: 'Europe/Kyiv',
    });
    await repos.rescheduleReservationTransactionally(
      'res-mix-1',
      session1RescheduledBuilt.interval,
      '2026-05-02T11:00:00.000Z',
      1
    );

    ({ snapshot: snap1 } = await repos.captureCoherentSnapshot());
    taskAfterSession1 = snap1.tasks.find((t) => t.id === 'task-mix')!;
    assert.equal(taskAfterSession1.priority, 'high');
    assert.deepEqual(taskAfterSession1.deadline, {
      kind: 'date_only',
      localDate: '2026-05-20',
    });
    assert.equal(taskAfterSession1.estimatedDurationMinutes, 120);
    assert.deepEqual(taskAfterSession1.ownership, {
      kind: 'standalone',
      folderId: 'folder-music',
    });

    // Add a second session for the same task without duplicating the task
    const session2Built = buildZonedIntervalFromLocalInput({
      startLocalDate: '2026-05-15',
      startLocalTime: '10:00',
      endLocalDate: '2026-05-15',
      endLocalTime: '11:00',
      originZone: 'Europe/Kyiv',
    });
    await repos.saveReservationTransactionally({
      id: 'res-mix-2',
      taskId: 'task-mix',
      interval: session2Built.interval,
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-05-02T12:00:00.000Z',
      updatedAt: '2026-05-02T12:00:00.000Z',
      revision: 1,
    });
    ({ snapshot: snap1 } = await repos.captureCoherentSnapshot());
    assert.equal(snap1.tasks.length, 1);

    // Canceling one session while another active session remains keeps task in 'timed' state
    const afterCancelOne = await repos.cancelSingleReservationTransactionally(
      'res-mix-1',
      'cancel',
      '2026-05-02T13:00:00.000Z',
      2
    );
    assert.equal(afterCancelOne.task.planningState, 'timed');

    // Removing current planning releases remaining active reservations and leaves task unplanned
    const afterRemovePlanning =
      await repos.removeTaskCurrentPlanningTransactionally(
        'task-mix',
        '2026-05-02T14:00:00.000Z'
      );
    assert.equal(afterRemovePlanning.task.planningState, 'unplanned');
    assert.equal(afterRemovePlanning.task.plannedDate, null);
    ({ snapshot: snap1 } = await repos.captureCoherentSnapshot());
    const activeResLeft = snap1.reservations.filter(
      (r) => r.taskId === 'task-mix' && r.state === 'active'
    );
    assert.equal(activeResLeft.length, 0);
  });

  it('5.5 Complete, cancel, release, reopen, and revision-checked undo with overlap reporting', async () => {
    const engine = new InMemoryTransactionalEngine('stage5_lifecycle_db');
    const repos = new PlanuiRepositories(engine);

    await repos.saveTask({
      id: 'task-lifecycle',
      title: 'Підготувати семпли',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: 180,
      planningState: 'timed',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-05-10T06:00:00.000Z',
      updatedAt: '2026-05-10T06:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });

    // Past reservation: 08:00 - 09:00 UTC
    // Ongoing reservation: 10:00 - 12:00 UTC (completed at 11:00 UTC)
    // Future reservation: 15:00 - 16:00 UTC
    await repos.saveReservationTransactionally({
      id: 'res-past',
      taskId: 'task-lifecycle',
      interval: {
        startInstant: '2026-05-10T08:00:00.000Z',
        endInstant: '2026-05-10T09:00:00.000Z',
        originZone: 'UTC',
        originStartLocalDate: '2026-05-10',
        originStartLocalTime: '08:00',
        originEndLocalDate: '2026-05-10',
        originEndLocalTime: '09:00',
      },
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-05-10T06:00:00.000Z',
      updatedAt: '2026-05-10T06:00:00.000Z',
      revision: 1,
    });

    await repos.saveReservationTransactionally({
      id: 'res-ongoing',
      taskId: 'task-lifecycle',
      interval: {
        startInstant: '2026-05-10T10:00:00.000Z',
        endInstant: '2026-05-10T12:00:00.000Z',
        originZone: 'UTC',
        originStartLocalDate: '2026-05-10',
        originStartLocalTime: '10:00',
        originEndLocalDate: '2026-05-10',
        originEndLocalTime: '12:00',
      },
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-05-10T06:00:00.000Z',
      updatedAt: '2026-05-10T06:00:00.000Z',
      revision: 1,
    });

    await repos.saveReservationTransactionally({
      id: 'res-future',
      taskId: 'task-lifecycle',
      interval: {
        startInstant: '2026-05-10T15:00:00.000Z',
        endInstant: '2026-05-10T16:00:00.000Z',
        originZone: 'UTC',
        originStartLocalDate: '2026-05-10',
        originStartLocalTime: '15:00',
        originEndLocalDate: '2026-05-10',
        originEndLocalTime: '16:00',
      },
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-05-10T06:00:00.000Z',
      updatedAt: '2026-05-10T06:00:00.000Z',
      revision: 1,
    });

    // Complete task at 11:00 UTC (midway through res-ongoing)
    const completeResult = await repos.completeTaskTransactionally(
      'task-lifecycle',
      '2026-05-10T11:00:00.000Z'
    );
    assert.equal(completeResult.task.state, 'completed');
    assert.equal(
      completeResult.task.completedAt,
      '2026-05-10T11:00:00.000Z'
    );

    const { snapshot: snapAfterComplete } =
      await repos.captureCoherentSnapshot();
    const resAfterComplete = snapAfterComplete.reservations;
    const pastRes = resAfterComplete.find((r) => r.id === 'res-past')!;
    const ongoingRes = resAfterComplete.find((r) => r.id === 'res-ongoing')!;
    const futureRes = resAfterComplete.find((r) => r.id === 'res-future')!;

    // Past reservation remains untouched
    assert.equal(pastRes.state, 'active');
    assert.equal(pastRes.releaseMetadata, null);

    // Ongoing reservation is truncated at 11:00 UTC with original plan preserved in releaseMetadata
    assert.equal(ongoingRes.state, 'active');
    assert.equal(ongoingRes.interval.endInstant, '2026-05-10T11:00:00.000Z');
    assert.equal(ongoingRes.interval.originEndLocalTime, '11:00');
    assert.ok(ongoingRes.releaseMetadata);
    assert.equal(
      ongoingRes.releaseMetadata.originalStartInstant,
      '2026-05-10T10:00:00.000Z'
    );
    assert.equal(
      ongoingRes.releaseMetadata.originalEndInstant,
      '2026-05-10T12:00:00.000Z'
    );

    // Future reservation is released and no longer blocks time
    assert.equal(futureRes.state, 'released');
    assert.ok(futureRes.releaseMetadata);

    // Verify availability: 11:00-12:00 and 15:00-16:00 are now free!
    // Total occupied on 2026-05-10 is only 08:00-09:00 (60m) + 10:00-11:00 (60m) = 120m
    const availAfterComplete = calculateWindowAvailability({
      windowStartInstant: '2026-05-10T00:00:00.000Z',
      windowEndInstant: '2026-05-11T00:00:00.000Z',
      displayZone: 'UTC',
      events: [],
      reservations: resAfterComplete,
      tasks: snapAfterComplete.tasks,
    });
    assert.equal(availAfterComplete.totalOccupiedMinutes, 120);
    for (const slice of availAfterComplete.effectiveBlockingSlices) {
      assert.equal(slice.isActualTrackedWork, false);
    }

    // Add a new blocking event at 15:00 - 16:00 UTC while the future reservation is released
    await repos.saveCalendarEvent({
      id: 'ev-new-conflict',
      title: 'Дзвінок',
      note: null,
      type: 'personal',
      color: 'personal',
      isBlocking: true,
      state: 'active',
      schedule: {
        kind: 'timed',
        interval: {
          startInstant: '2026-05-10T15:00:00.000Z',
          endInstant: '2026-05-10T16:00:00.000Z',
          originZone: 'UTC',
          originStartLocalDate: '2026-05-10',
          originStartLocalTime: '15:00',
          originEndLocalDate: '2026-05-10',
          originEndLocalTime: '16:00',
        },
      },
      workProperties: null,
      createdAt: '2026-05-10T11:01:00.000Z',
      updatedAt: '2026-05-10T11:01:00.000Z',
      revision: 1,
    });

    // Immediate undo restores previous task state and reservations and reports the new overlap without auto-resolving it
    const undoResult = await repos.undoTaskLifecycleTransactionally(
      completeResult.undoToken,
      '2026-05-10T11:02:00.000Z',
      'UTC'
    );
    assert.equal(undoResult.restoredTask.state, 'open');
    assert.equal(undoResult.conflictReport.hasConflicts, true);
    assert.equal(undoResult.conflictReport.conflicts.length, 1);
    assert.equal(undoResult.conflictReport.conflicts[0].title, 'Дзвінок');

    // Reusing the same undo token after revisions have advanced fails revision check safely
    await assert.rejects(
      () =>
        repos.undoTaskLifecycleTransactionally(
          completeResult.undoToken,
          '2026-05-10T11:03:00.000Z',
          'UTC'
        ),
      (err: unknown) =>
        err instanceof Error && /новішій операції/i.test(err.message)
    );

    // Reopening a completed/canceled task later does NOT silently restore released reservations
    await repos.completeTaskTransactionally(
      'task-lifecycle',
      '2026-05-10T11:05:00.000Z'
    );
    await repos.reopenTaskTransactionally(
      'task-lifecycle',
      '2026-05-10T11:10:00.000Z'
    );
    const { snapshot: snapAfterReopen } =
      await repos.captureCoherentSnapshot();
    const futureResAfterReopen = snapAfterReopen.reservations.find(
      (r) => r.id === 'res-future'
    )!;
    assert.equal(futureResAfterReopen.state, 'released');
  });

  it('5.6 Availability & 5.7 Backup round-trip: union occupancy without double-counting overlaps, distinct category totals, non-blocking exclusions, and full ZIP round-trip', async () => {
    const engine = new InMemoryTransactionalEngine('stage5_avail_db');
    const repos = new PlanuiRepositories(engine);

    // Work shift: 09:00 - 13:00 UTC (240 min)
    await repos.saveCalendarEvent({
      id: 'ev-work',
      title: 'Денна зміна',
      note: null,
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      schedule: {
        kind: 'timed',
        interval: {
          startInstant: '2026-05-15T09:00:00.000Z',
          endInstant: '2026-05-15T13:00:00.000Z',
          originZone: 'UTC',
          originStartLocalDate: '2026-05-15',
          originStartLocalTime: '09:00',
          originEndLocalDate: '2026-05-15',
          originEndLocalTime: '13:00',
        },
      },
      workProperties: {
        shiftName: 'Денна зміна',
        shiftCode: 'Д1',
        sourceTemplateId: null,
      },
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      revision: 1,
    });

    // Overlapping task reservation: 12:00 - 14:00 UTC (120 min; overlaps work shift by 60 min)
    await repos.saveTask({
      id: 'task-overlap',
      title: 'Перевірити звіт',
      description: null,
      state: 'open',
      priority: 'high',
      deadline: { kind: 'date_only', localDate: '2026-05-15' },
      estimatedDurationMinutes: 120,
      planningState: 'timed',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });
    await repos.saveReservationTransactionally({
      id: 'res-overlap',
      taskId: 'task-overlap',
      interval: {
        startInstant: '2026-05-15T12:00:00.000Z',
        endInstant: '2026-05-15T14:00:00.000Z',
        originZone: 'UTC',
        originStartLocalDate: '2026-05-15',
        originStartLocalTime: '12:00',
        originEndLocalDate: '2026-05-15',
        originEndLocalTime: '14:00',
      },
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      revision: 1,
    });

    // Non-blocking records on 2026-05-15: informational event, date-only task, day-off annotation, wish
    await repos.saveCalendarEvent({
      id: 'ev-nonblocking',
      title: 'День народження друга',
      note: null,
      type: 'personal',
      color: 'personal',
      isBlocking: false,
      state: 'active',
      schedule: {
        kind: 'all_day',
        startLocalDate: '2026-05-15',
        endLocalDateExclusive: '2026-05-16',
        originZone: 'UTC',
      },
      workProperties: null,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      revision: 1,
    });

    await repos.saveTask({
      id: 'task-dateonly',
      title: 'Подзвонити батькам',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: { kind: 'date_only', localDate: '2026-05-15' },
      estimatedDurationMinutes: 60,
      planningState: 'date_only',
      plannedDate: '2026-05-15',
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    });

    await repos.applyRosterBatchTransactionally({
      eventsToSave: [],
      dayOffAnnotationsToSave: [
        {
          id: 'dayoff-1',
          localDate: '2026-05-15',
          sourceZone: 'UTC',
          code: 'В',
          note: 'Вихідний',
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-01T10:00:00.000Z',
          revision: 1,
        },
      ],
    });

    await repos.saveWishItem({
      id: 'wish-synth',
      title: 'Аналоговий синтезатор',
      note: null,
      categoryId: null,
      timing: 'later',
      estimatedPrice: parseLocalizedPriceInput('25000,00', 'UAH'),
      state: 'active',
      fulfilledAt: null,
      archived: false,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      revision: 1,
    });

    const { snapshot: snap } = await repos.captureCoherentSnapshot();
    const events = snap.events;
    const reservations = snap.reservations;
    const tasks = snap.tasks;

    // Detect schedule conflict between 09:00-13:00 work shift and 12:00-14:00 reservation
    const conflictReport = detectScheduleConflicts({
      candidateStartInstant: '2026-05-15T12:00:00.000Z',
      candidateEndInstant: '2026-05-15T14:00:00.000Z',
      displayZone: 'UTC',
      events,
      reservations,
      tasks,
      excludeReservationId: 'res-overlap',
    });
    assert.equal(conflictReport.hasConflicts, true);
    assert.equal(conflictReport.conflicts.length, 1);
    assert.equal(conflictReport.conflicts[0].overlapMinutes, 60);

    // Availability: union of [09:00, 13:00) and [12:00, 14:00) is [09:00, 14:00) = 300 minutes (not 360!)
    // Category totals remain distinct: work = 240, reservations = 120
    const avail = calculateWindowAvailability({
      windowStartInstant: '2026-05-15T00:00:00.000Z',
      windowEndInstant: '2026-05-16T00:00:00.000Z',
      displayZone: 'UTC',
      events,
      reservations,
      tasks,
    });
    assert.equal(avail.totalOccupiedMinutes, 300);
    assert.equal(avail.totalUnoccupiedMinutes, 1440 - 300);
    assert.equal(avail.categoryTotalsMinutes.work, 240);
    assert.equal(avail.categoryTotalsMinutes.reservations, 120);
    assert.equal(avail.categoryTotalsMinutes.personalBlocking, 0);
    assert.equal(avail.unoccupiedGaps.length, 2);
    assert.equal(avail.unoccupiedGaps[0].startLocalTime, '00:00');
    assert.equal(avail.unoccupiedGaps[0].endLocalTime, '09:00');
    assert.equal(avail.unoccupiedGaps[1].startLocalTime, '14:00');
    assert.equal(avail.unoccupiedGaps[1].endLocalTime, '24:00');

    // Full ZIP backup and restore round-trip preserving all Stage 5 temporal & release records
    const { zipBytes } = await exportFullBackupZip(
      repos,
      '2026-05-15T18:00:00.000Z'
    );
    const validatedPreview = await validateBackupArchive(zipBytes);
    assert.equal(validatedPreview.snapshot.events.length, 2);
    assert.equal(validatedPreview.snapshot.reservations.length, 1);

    const targetEngine = new InMemoryTransactionalEngine(
      'stage5_restore_target_db'
    );
    const targetRepos = new PlanuiRepositories(targetEngine);
    await executeAtomicBackupReplacement(targetRepos, validatedPreview, {
      explicitUserConfirmation: true,
      nowIso: '2026-05-15T18:05:00.000Z',
    });

    const { snapshot: restoredSnap } =
      await targetRepos.captureCoherentSnapshot();
    assert.equal(restoredSnap.events.length, 2);
    assert.equal(restoredSnap.reservations.length, 1);
    assert.equal(
      restoredSnap.reservations[0].interval.startInstant,
      '2026-05-15T12:00:00.000Z'
    );
  });
});
