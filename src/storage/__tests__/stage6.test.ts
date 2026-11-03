import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDayTimelineHourRail,
  collectOlderUnresolvedAndOverdueTasks,
  computeCollapsedNextDaySummary,
  computeCurrentTimeIndicatorPosition,
  computeNearestCommitment,
  evaluateGapTaskSessionProposal,
  layoutTimelineOverlapLanes,
  projectScheduleForDate,
} from '../../domain/scheduling';
import { buildZonedIntervalFromLocalInput } from '../../domain/temporal';
import { CalendarEvent, Task, TaskReservation } from '../../domain/types';
import { InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';

describe('Stage 6: Shared Day Timeline and Today Acceptance Suite', () => {
  it('6.1 Proportional timeline & DST rail: represents normal 24h, spring-forward 23h skipped hour, and fall-back 25h repeated hour honestly', () => {
    // 1. Normal 24-hour day (1440 min)
    const normalRail = buildDayTimelineHourRail('2026-11-02', 'Europe/Kyiv');
    assert.equal(normalRail.length, 24);
    assert.equal(normalRail[0].localTimeLabel, '00:00');
    assert.equal(normalRail[12].localTimeLabel, '12:00');
    assert.equal(normalRail[12].topPercent, 50);

    // 2. Spring-forward 23-hour day in Europe/Kyiv (2026-03-29: 03:00 is skipped -> 1380 min)
    const springRail = buildDayTimelineHourRail('2026-03-29', 'Europe/Kyiv');
    assert.equal(springRail.length, 23);
    const skippedSlot = springRail.find(
      (s) => s.skippedBeforeThisSlotUk !== null
    );
    assert.ok(skippedSlot, 'Should mark skipped DST hour on spring-forward day');
    assert.equal(skippedSlot.localTimeLabel, '04:00');
    assert.match(skippedSlot.skippedBeforeThisSlotUk!, /Пропущено 03:00/);

    // 3. Fall-back 25-hour day in Europe/Kyiv (2026-10-25: 03:00 repeats twice -> 1500 min)
    const fallRail = buildDayTimelineHourRail('2026-10-25', 'Europe/Kyiv');
    assert.equal(fallRail.length, 25);
    const repeatedSlots = fallRail.filter(
      (s) => s.localTimeLabel === '03:00' && s.repeatedOccurrenceBadgeUk !== null
    );
    assert.equal(repeatedSlots.length, 2);
    assert.match(repeatedSlots[0].repeatedOccurrenceBadgeUk!, /1-ше/);
    assert.match(repeatedSlots[1].repeatedOccurrenceBadgeUk!, /2-ге/);
  });

  it('6.1 & 6.5 Overlap lanes & visual states: separates overlapping items into distinct lanes, flags conflicts, and never equates past with completed', () => {
    const zone = 'Europe/Kyiv';
    const date = '2026-11-02';

    const shiftEvent: CalendarEvent = {
      id: 'ev-shift-1',
      title: 'Денна зміна',
      note: null,
      type: 'work_shift',
      color: 'work',
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: date,
          startLocalTime: '09:00',
          endLocalDate: date,
          endLocalTime: '13:00',
          originZone: zone,
        }).interval,
      },
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Денна зміна',
        shiftCode: 'Д1',
        sourceTemplateId: null,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const taskOpen: Task = {
      id: 'task-overlap-1',
      title: 'Підготувати звіт',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: 60,
      planningState: 'timed',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };

    const overlappingRes: TaskReservation = {
      id: 'res-overlap-1',
      taskId: taskOpen.id,
      interval: buildZonedIntervalFromLocalInput({
        startLocalDate: date,
        startLocalTime: '10:00',
        endLocalDate: date,
        endLocalTime: '11:00',
        originZone: zone,
      }).interval,
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const releasedRes: TaskReservation = {
      id: 'res-released-1',
      taskId: taskOpen.id,
      interval: buildZonedIntervalFromLocalInput({
        startLocalDate: date,
        startLocalTime: '15:00',
        endLocalDate: date,
        endLocalTime: '16:00',
        originZone: zone,
      }).interval,
      state: 'released',
      releaseMetadata: {
        releasedAt: '2026-11-02T12:00:00.000Z',
        reason: 'manual_unplan',
        originalStartInstant: '2026-11-02T13:00:00.000Z',
        originalEndInstant: '2026-11-02T14:00:00.000Z',
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 2,
    };

    const projWithReleased = projectScheduleForDate({
      localDate: date,
      displayZone: zone,
      events: [shiftEvent],
      reservations: [overlappingRes, releasedRes],
      tasks: [taskOpen],
      dayOffAnnotations: [],
      includeReleasedReservations: true,
    });

    // Released history does NOT occupy time (only 09:00-13:00 = 240 min is occupied)
    assert.equal(projWithReleased.availability.totalOccupiedMinutes, 240);

    // At 14:00 local time (12:00Z), 09:00-13:00 and 10:00-11:00 are in the past, but taskOpen is still 'open'
    const nowAt14LocalMs = Date.parse('2026-11-02T12:00:00.000Z');
    const layout = layoutTimelineOverlapLanes({
      items: projWithReleased.timelineItems,
      dayDurationMinutes: projWithReleased.dayDurationMinutes,
      nowMs: nowAt14LocalMs,
    });

    assert.equal(layout.positionedItems.length, 3);
    const shiftPos = layout.positionedItems.find(
      (p) => p.item.sourceId === shiftEvent.id
    )!;
    const resPos = layout.positionedItems.find(
      (p) => p.item.sourceId === overlappingRes.id
    )!;
    const relPos = layout.positionedItems.find(
      (p) => p.item.sourceId === releasedRes.id
    )!;

    assert.equal(shiftPos.totalLanes, 2);
    assert.equal(resPos.totalLanes, 2);
    assert.notEqual(shiftPos.laneIndex, resPos.laneIndex);
    assert.equal(shiftPos.hasConflict, true);
    assert.equal(resPos.hasConflict, true);

    // Past open reservation is classified as 'past', never 'completed'
    assert.equal(resPos.visualState, 'past');
    assert.match(resPos.statusBadgeUk, /не означає виконання/);
    assert.equal(relPos.visualState, 'released');
    assert.equal(relPos.totalLanes, 1);
  });

  it('6.2 & 6.3 Current-time indicator appears only on actual today; collapsed next-day summary includes overnight carryover; next-day preference persists', async () => {
    const repos = new PlanuiRepositories(new InMemoryTransactionalEngine());
    const zone = 'Europe/Kyiv';
    const todayDate = '2026-11-02';
    const nextDate = '2026-11-03';
    const nowMs = Date.parse('2026-11-02T10:30:00.000Z'); // 12:30 in Europe/Kyiv

    // Current-time indicator is visible on 2026-11-02, NOT on 2026-11-03
    const indToday = computeCurrentTimeIndicatorPosition({
      localDate: todayDate,
      displayZone: zone,
      nowMs,
    });
    assert.equal(indToday.isVisibleOnDate, true);
    assert.equal(indToday.currentLocalTimeLabel, '12:30');
    assert.equal(indToday.elapsedMinutesFromDayStart, 750);

    const indNextDay = computeCurrentTimeIndicatorPosition({
      localDate: nextDate,
      displayZone: zone,
      nowMs,
    });
    assert.equal(indNextDay.isVisibleOnDate, false);

    // Create overnight shift 2026-11-02 20:00 -> 2026-11-03 08:00
    const overnightInterval = buildZonedIntervalFromLocalInput({
      startLocalDate: todayDate,
      startLocalTime: '20:00',
      endLocalDate: nextDate,
      endLocalTime: '08:00',
      originZone: zone,
    }).interval;

    await repos.saveCalendarEvent({
      id: 'shift-overnight-1',
      title: 'Нічна зміна',
      note: null,
      type: 'work_shift',
      color: 'work',
      schedule: { kind: 'timed', interval: overnightInterval },
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Нічна зміна',
        shiftCode: 'Н1',
        sourceTemplateId: null,
      },
      createdAt: '2026-11-02T08:00:00.000Z',
      updatedAt: '2026-11-02T08:00:00.000Z',
      revision: 1,
    });

    const snap = (await repos.captureCoherentSnapshot()).snapshot;
    const todayProj = projectScheduleForDate({
      localDate: todayDate,
      displayZone: zone,
      events: snap.events,
      reservations: snap.reservations,
      tasks: snap.tasks,
      dayOffAnnotations: snap.dayOffAnnotations,
    });
    const nextDayProj = projectScheduleForDate({
      localDate: nextDate,
      displayZone: zone,
      events: snap.events,
      reservations: snap.reservations,
      tasks: snap.tasks,
      dayOffAnnotations: snap.dayOffAnnotations,
    });

    const nearest = computeNearestCommitment({
      projection: todayProj,
      nowMs,
      actualTodayDate: todayDate,
    });
    assert.ok(nearest);
    assert.equal(nearest.relation, 'upcoming');
    assert.equal(nearest.item.title, 'Нічна зміна');

    const collapsedSummary = computeCollapsedNextDaySummary(nextDayProj);
    assert.equal(collapsedSummary.overnightCarryoverItems.length, 1);
    assert.match(
      collapsedSummary.summaryTextUk,
      /Перехід із попередньої доби: «Нічна зміна» \(00:00–08:00\)/
    );

    // Persist todayNextDayCollapsed preference
    assert.equal(snap.settings.todayNextDayCollapsed, false);
    await repos.saveSettings({
      ...snap.settings,
      todayNextDayCollapsed: true,
      updatedAt: '2026-11-02T10:35:00.000Z',
      revision: snap.settings.revision + 1,
    });
    const reloadedSettings = (await repos.captureCoherentSnapshot()).snapshot
      .settings;
    assert.equal(reloadedSettings.todayNextDayCollapsed, true);
  });

  it('6.4 Tasks & Gaps: does not inject undated or yesterday tasks, separates older unresolved plans from overdue deadlines, and supports partial gap sessions', () => {
    const zone = 'Europe/Kyiv';
    const selectedDate = '2026-11-02';
    const nowMs = Date.parse('2026-11-02T08:00:00.000Z');

    const taskUndated: Task = {
      id: 't-undated',
      title: 'Незапланована справа',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: null,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };

    const taskYesterdayNoDeadline: Task = {
      id: 't-yesterday',
      title: 'Вчорашня справа без дедлайну',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: 90,
      planningState: 'date_only',
      plannedDate: '2026-11-01',
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };

    const taskOverdueDeadline: Task = {
      id: 't-overdue',
      title: 'Справа з простроченим дедлайном',
      description: null,
      state: 'open',
      priority: 'high',
      deadline: { kind: 'date_only', localDate: '2026-10-31' },
      estimatedDurationMinutes: 45,
      planningState: 'unplanned',
      plannedDate: null,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-10-25T08:00:00.000Z',
      updatedAt: '2026-10-25T08:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };

    const taskTodayUntimed: Task = {
      id: 't-today',
      title: 'Справа на сьогодні',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: 30,
      planningState: 'date_only',
      plannedDate: selectedDate,
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-11-02T07:00:00.000Z',
      updatedAt: '2026-11-02T07:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };

    const allTasks = [
      taskUndated,
      taskYesterdayNoDeadline,
      taskOverdueDeadline,
      taskTodayUntimed,
    ];

    const proj = projectScheduleForDate({
      localDate: selectedDate,
      displayZone: zone,
      events: [],
      reservations: [],
      tasks: allTasks,
      dayOffAnnotations: [],
    });

    // Only explicitly date-planned untimed task for 2026-11-02 appears
    assert.equal(proj.untimedDateOnlyTasks.length, 1);
    assert.equal(proj.untimedDateOnlyTasks[0].id, taskTodayUntimed.id);

    const separated = collectOlderUnresolvedAndOverdueTasks({
      tasks: allTasks,
      reservations: [],
      selectedDate,
      displayZone: zone,
      nowMs,
    });

    assert.equal(separated.olderUnresolvedPlannedTasks.length, 1);
    assert.equal(
      separated.olderUnresolvedPlannedTasks[0].task.id,
      taskYesterdayNoDeadline.id
    );
    assert.doesNotMatch(
      separated.olderUnresolvedPlannedTasks[0].reasonUk,
      /дедлайн/i
    );

    assert.equal(separated.overdueDeadlineTasks.length, 1);
    assert.equal(
      separated.overdueDeadlineTasks[0].task.id,
      taskOverdueDeadline.id
    );

    // Gap Task Picker evaluation:
    // 1) Task without estimate asks for duration when durationMinutesInput is null
    const sampleGap = {
      startInstant: '2026-11-02T12:00:00.000Z',
      endInstant: '2026-11-02T13:00:00.000Z',
      startMs: Date.parse('2026-11-02T12:00:00.000Z'),
      endMs: Date.parse('2026-11-02T13:00:00.000Z'),
      localDate: selectedDate,
      startLocalTime: '14:00',
      endLocalTime: '15:00',
      durationMinutes: 60,
      descriptionUk: 'Незайнятий час за записаними даними',
    };

    const missingEstProposal = evaluateGapTaskSessionProposal({
      gap: sampleGap,
      task: taskUndated,
      startLocalTime: '14:00',
      durationMinutesInput: null,
      displayZone: zone,
      events: [],
      reservations: [],
      tasks: allTasks,
    });
    assert.equal(missingEstProposal.isValid, false);
    assert.equal(missingEstProposal.requiresDurationInput, true);

    // 2) Task with 90-min estimate in a 60-min gap offers a 60-min partial session without conflict
    const partialProposal = evaluateGapTaskSessionProposal({
      gap: sampleGap,
      task: taskYesterdayNoDeadline, // 90 min estimate
      startLocalTime: '14:00',
      durationMinutesInput: 60,
      displayZone: zone,
      events: [],
      reservations: [],
      tasks: allTasks,
    });
    assert.equal(partialProposal.isValid, true);
    assert.equal(partialProposal.estimateExceedsGap, true);
    assert.equal(partialProposal.isPartialSession, true);
    assert.equal(partialProposal.suggestedPartialMinutes, 60);
    assert.equal(partialProposal.displayEndLocalTime, '15:00');
    assert.equal(partialProposal.conflictReport.hasConflicts, false);
  });
});
