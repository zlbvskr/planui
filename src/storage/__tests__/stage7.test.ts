import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsToLocalDate,
  buildMonthGridDates,
  buildWeekDates,
  buildZonedIntervalFromLocalInput,
  formatUkrainianMonthYearHeading,
  formatUkrainianWeekRangeHeading,
  getDaysInMonth,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getMondayFirstWeekdayIndex,
  getMondayOfWeek,
} from '../../domain/temporal';
import {
  projectMonthCalendarGrid,
  projectWeekCalendarOverview,
  selectCalendarDateFromCell,
} from '../../domain/scheduling';
import {
  CalendarEvent,
  DayOffAnnotation,
  Task,
  TaskReservation,
} from '../../domain/types';
import {
  createInitialDestinationContextMap,
  updateDestinationContext,
} from '../../state/shellStore';

describe('STAGE 7: Month and Week Calendar (7.1–7.6, C11–C12)', () => {
  it('7.2 & 7.6 handles month lengths (28, 29, 30, 31), leap February, year boundaries, and Monday-first 42-cell grid alignment', () => {
    // Month lengths including leap years (2024, 2028) and non-leap years (2026, 2100)
    assert.equal(getDaysInMonth(2026, 2), 28);
    assert.equal(getDaysInMonth(2024, 2), 29);
    assert.equal(getDaysInMonth(2028, 2), 29);
    assert.equal(getDaysInMonth(2026, 4), 30);
    assert.equal(getDaysInMonth(2026, 11), 30);
    assert.equal(getDaysInMonth(2026, 1), 31);
    assert.equal(getDaysInMonth(2026, 12), 31);

    // Month addition clamps day safely without UTC drift
    assert.equal(addMonthsToLocalDate('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonthsToLocalDate('2024-01-31', 1), '2024-02-29');
    assert.equal(addMonthsToLocalDate('2026-03-31', -1), '2026-02-28');
    assert.equal(addMonthsToLocalDate('2026-12-15', 1), '2027-01-15');
    assert.equal(addMonthsToLocalDate('2027-01-15', -1), '2026-12-15');

    assert.equal(getFirstDayOfMonth('2026-11-18'), '2026-11-01');
    assert.equal(getLastDayOfMonth('2026-11-18'), '2026-11-30');
    assert.equal(getLastDayOfMonth('2024-02-10'), '2024-02-29');

    // Monday-first weekday index: 2026-11-02 is Monday (0), 2026-11-01 is Sunday (6)
    assert.equal(getMondayFirstWeekdayIndex('2026-11-02'), 0);
    assert.equal(getMondayFirstWeekdayIndex('2026-11-01'), 6);
    assert.equal(getMondayOfWeek('2026-11-01'), '2026-10-26');
    assert.equal(getMondayOfWeek('2026-11-04'), '2026-11-02');

    // 42-cell grid for November 2026 (2026-11-01 is Sunday -> 6 leading October dates: Oct 26..Oct 31)
    const nov2026Grid = buildMonthGridDates('2026-11-15');
    assert.equal(nov2026Grid.length, 42);
    assert.equal(nov2026Grid[0].localDate, '2026-10-26');
    assert.equal(nov2026Grid[0].weekdayIndexMondayFirst, 0);
    assert.equal(nov2026Grid[0].inActiveMonth, false);
    assert.equal(nov2026Grid[0].monthRelation, 'previous');

    assert.equal(nov2026Grid[6].localDate, '2026-11-01');
    assert.equal(nov2026Grid[6].weekdayIndexMondayFirst, 6);
    assert.equal(nov2026Grid[6].inActiveMonth, true);

    assert.equal(nov2026Grid[35].localDate, '2026-11-30');
    assert.equal(nov2026Grid[35].inActiveMonth, true);

    assert.equal(nov2026Grid[36].localDate, '2026-12-01');
    assert.equal(nov2026Grid[36].inActiveMonth, false);
    assert.equal(nov2026Grid[36].monthRelation, 'next');
    assert.equal(nov2026Grid[41].localDate, '2026-12-06');
    assert.equal(nov2026Grid[41].rowIndex, 5);
    assert.equal(nov2026Grid[41].weekdayIndexMondayFirst, 6);

    assert.ok(formatUkrainianMonthYearHeading('2026-11-15').length > 0);
    assert.ok(formatUkrainianWeekRangeHeading('2026-11-30').length > 0);
  });

  it('7.2 & 7.6 retains events on adjacent-month dates, switches active month on adjacent selection, and never infers weekend/empty days off', () => {
    const decEvent: CalendarEvent = {
      id: 'ev-dec-2',
      title: 'Подія у грудні',
      note: null,
      type: 'personal',
      color: 'personal',
      isBlocking: true,
      state: 'active',
      workProperties: null,
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-12-02',
          startLocalTime: '10:00',
          endLocalDate: '2026-12-02',
          endLocalTime: '11:30',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const grid = projectMonthCalendarGrid({
      selectedDate: '2026-11-15',
      actualTodayDate: '2026-11-02',
      displayZone: 'Europe/Kyiv',
      events: [decEvent],
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    });

    // Adjacent-month cell 2026-12-02 is inside November's 42-cell grid and retains its event
    const dec2Cell = grid.cells.find((c) => c.localDate === '2026-12-02');
    assert.ok(dec2Cell, '2026-12-02 should be in the trailing row of Nov 2026');
    assert.equal(dec2Cell.inActiveMonth, false);
    assert.equal(dec2Cell.markerCounts.personalEventsCount, 1);
    assert.equal(dec2Cell.isNeutralUnknownDate, false);

    // Selecting 2026-12-02 updates selectedDate and changes the active month to December 2026
    const selectionResult = selectCalendarDateFromCell({
      previousSelectedDate: '2026-11-15',
      clickedCellDate: dec2Cell.localDate,
    });
    assert.equal(selectionResult.nextSelectedDate, '2026-12-02');
    assert.equal(selectionResult.activeMonthChanged, true);
    assert.equal(selectionResult.nextYearMonth, '2026-12');

    // Empty Saturday (2026-11-07) and Sunday (2026-11-08) remain neutral, NEVER inferred as days off
    const satCell = grid.cells.find((c) => c.localDate === '2026-11-07')!;
    const sunCell = grid.cells.find((c) => c.localDate === '2026-11-08')!;
    assert.equal(satCell.isNeutralUnknownDate, true);
    assert.equal(satCell.inferredDayOff, false);
    assert.equal(satCell.hasExplicitDayOff, false);
    assert.equal(sunCell.isNeutralUnknownDate, true);
    assert.equal(sunCell.inferredDayOff, false);
    assert.equal(sunCell.hasExplicitDayOff, false);
  });

  it('7.3, 7.4 & 7.6 projects overnight shifts across month and year boundaries onto the 00:00–12:00–24:00 work strip without artificial midnight endpoints', () => {
    const monthBoundaryNightShift: CalendarEvent = {
      id: 'shift-nov30-dec1',
      title: 'Нічна зміна на межі місяців',
      note: 'Чергування',
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Нічна зміна на межі місяців',
        shiftCode: 'Н1',
        sourceTemplateId: null,
      },
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-11-30',
          startLocalTime: '20:00',
          endLocalDate: '2026-12-01',
          endLocalTime: '08:00',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const yearBoundaryNightShift: CalendarEvent = {
      id: 'shift-dec31-jan1',
      title: 'Новорічна нічна зміна',
      note: null,
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Новорічна нічна зміна',
        shiftCode: 'Н2',
        sourceTemplateId: null,
      },
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-12-31',
          startLocalTime: '18:00',
          endLocalDate: '2027-01-01',
          endLocalTime: '06:00',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const decGrid = projectMonthCalendarGrid({
      selectedDate: '2026-12-01',
      actualTodayDate: '2026-12-01',
      displayZone: 'Europe/Kyiv',
      events: [monthBoundaryNightShift, yearBoundaryNightShift],
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    });

    // Check Nov 30 (adjacent leading date in Dec 2026 grid): [20:00, 24:00) -> left 83.3333%, width 16.6667%
    const nov30Cell = decGrid.cells.find((c) => c.localDate === '2026-11-30')!;
    assert.equal(nov30Cell.workStripSegments.length, 1);
    assert.equal(nov30Cell.workStripSegments[0].eventId, 'shift-nov30-dec1');
    assert.equal(nov30Cell.workStripSegments[0].startMinuteOfDay, 1200);
    assert.equal(nov30Cell.workStripSegments[0].endMinuteOfDay, 1440);
    assert.equal(nov30Cell.workStripSegments[0].leftPercent, 83.3333);
    assert.equal(nov30Cell.workStripSegments[0].widthPercent, 16.6667);
    // Compact badge on Nov 30 shows '20:00→' (never claiming 00:00 is the shift end!)
    assert.equal(nov30Cell.visibleBadges[0].compactLabel, '20:00→');
    assert.equal(
      nov30Cell.visibleBadges[0].usesArtificialMidnightAsEndpoint,
      false
    );

    // Check Dec 1: [00:00, 08:00) -> left 0%, width 33.3333%
    const dec1Cell = decGrid.cells.find((c) => c.localDate === '2026-12-01')!;
    assert.equal(dec1Cell.workStripSegments.length, 1);
    assert.equal(dec1Cell.workStripSegments[0].eventId, 'shift-nov30-dec1');
    assert.equal(dec1Cell.workStripSegments[0].startMinuteOfDay, 0);
    assert.equal(dec1Cell.workStripSegments[0].endMinuteOfDay, 480);
    assert.equal(dec1Cell.workStripSegments[0].leftPercent, 0);
    assert.equal(dec1Cell.workStripSegments[0].widthPercent, 33.3333);
    // Compact badge on Dec 1 shows '→08:00' (never claiming 00:00 is the shift start!)
    assert.equal(dec1Cell.visibleBadges[0].compactLabel, '→08:00');
    assert.equal(
      dec1Cell.visibleBadges[0].usesArtificialMidnightAsEndpoint,
      false
    );

    // Check Dec 31 -> Jan 1 year boundary in the same Dec 2026 grid
    const dec31Cell = decGrid.cells.find((c) => c.localDate === '2026-12-31')!;
    const jan1Cell = decGrid.cells.find((c) => c.localDate === '2027-01-01')!;
    assert.equal(dec31Cell.workStripSegments.length, 1);
    assert.equal(dec31Cell.workStripSegments[0].leftPercent, 75);
    assert.equal(dec31Cell.workStripSegments[0].widthPercent, 25);
    assert.equal(dec31Cell.visibleBadges[0].compactLabel, '18:00→');

    assert.equal(jan1Cell.workStripSegments.length, 1);
    assert.equal(jan1Cell.workStripSegments[0].leftPercent, 0);
    assert.equal(jan1Cell.workStripSegments[0].widthPercent, 25);
    assert.equal(jan1Cell.visibleBadges[0].compactLabel, '→06:00');
  });

  it('7.3, 7.4 & 7.6 supports multiple shifts on one date, omits personal event titles on mobile cells, bounds overflow, and keeps work strip separate from personal/task markers', () => {
    const morningShift: CalendarEvent = {
      id: 'shift-morning',
      title: 'Ранкова зміна',
      note: null,
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Ранкова зміна',
        shiftCode: 'Р1',
        sourceTemplateId: null,
      },
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-11-10',
          startLocalTime: '06:00',
          endLocalDate: '2026-11-10',
          endLocalTime: '12:00',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const eveningShift: CalendarEvent = {
      id: 'shift-evening',
      title: 'Вечірнє чергування',
      note: null,
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Вечірнє чергування',
        shiftCode: 'В1',
        sourceTemplateId: null,
      },
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-11-10',
          startLocalTime: '18:00',
          endLocalDate: '2026-11-10',
          endLocalTime: '21:00',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const secretPersonalEvent: CalendarEvent = {
      id: 'ev-personal-secret',
      title: 'Приватна консультація у лікаря з довгим описом',
      note: 'Дуже довгий опис особистої події, який не має відображатися у мобільній клітинці місяця',
      type: 'personal',
      color: 'personal',
      isBlocking: true,
      state: 'active',
      workProperties: null,
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-11-10',
          startLocalTime: '13:30',
          endLocalDate: '2026-11-10',
          endLocalTime: '14:30',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const taskTimed: Task = {
      id: 'task-1',
      title: 'Змонтувати демо-запис',
      description: null,
      state: 'open',
      priority: 'high',
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

    const reservationTimed: TaskReservation = {
      id: 'res-1',
      taskId: 'task-1',
      interval: buildZonedIntervalFromLocalInput({
        startLocalDate: '2026-11-10',
        startLocalTime: '15:00',
        endLocalDate: '2026-11-10',
        endLocalTime: '16:00',
        originZone: 'Europe/Kyiv',
      }).interval,
      state: 'active',
      releaseMetadata: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const taskUntimed: Task = {
      id: 'task-2',
      title: 'Замовити струни',
      description: null,
      state: 'open',
      priority: 'normal',
      deadline: null,
      estimatedDurationMinutes: null,
      planningState: 'date_only',
      plannedDate: '2026-11-10',
      ownership: { kind: 'standalone', folderId: null },
      checklist: [],
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      completedAt: null,
      canceledAt: null,
      revision: 1,
    };

    const grid = projectMonthCalendarGrid({
      selectedDate: '2026-11-10',
      actualTodayDate: '2026-11-02',
      displayZone: 'Europe/Kyiv',
      events: [morningShift, eveningShift, secretPersonalEvent],
      reservations: [reservationTimed],
      tasks: [taskTimed, taskUntimed],
      dayOffAnnotations: [],
      maxVisibleBadges: 2,
    });

    const cell = grid.selectedCell;
    assert.equal(cell.localDate, '2026-11-10');

    // 1. Work strip has ONLY the 2 work shifts (06:00-12:00 -> 25%..50%, 18:00-21:00 -> 75%..87.5%)
    assert.equal(cell.workStripSegments.length, 2);
    assert.equal(cell.workStripSegments[0].leftPercent, 25);
    assert.equal(cell.workStripSegments[0].widthPercent, 25);
    assert.equal(cell.workStripSegments[1].leftPercent, 75);
    assert.equal(cell.workStripSegments[1].widthPercent, 12.5);

    // 2. Personal event & task markers are counted separately from work coverage
    assert.equal(cell.markerCounts.workShiftsCount, 2);
    assert.equal(cell.markerCounts.personalEventsCount, 1);
    assert.equal(cell.markerCounts.taskReservationsCount, 1);
    assert.equal(cell.markerCounts.untimedTasksCount, 1);

    // 3. Bounded overflow: 5 total badges (2 shifts + 1 personal + 1 reservation + 1 untimed group), 2 visible, +3 overflow
    assert.equal(cell.allBadgesCount, 5);
    assert.equal(cell.visibleBadges.length, 2);
    assert.equal(cell.overflowCount, 3);

    // 4. Mobile cell never includes personal event titles
    assert.equal(cell.omitsPersonalTitlesOnMobile, true);
    for (const b of cell.visibleBadges) {
      assert.equal(b.personalEventTitleIncluded, false);
      assert.ok(!b.compactLabel.includes('Приватна консультація'));
    }

    // Even if maxVisibleBadges is raised to 10, personal event badge only shows compact clock '13:30' and symbol '●'
    const fullBadgesGrid = projectMonthCalendarGrid({
      selectedDate: '2026-11-10',
      actualTodayDate: '2026-11-02',
      displayZone: 'Europe/Kyiv',
      events: [morningShift, eveningShift, secretPersonalEvent],
      reservations: [reservationTimed],
      tasks: [taskTimed, taskUntimed],
      dayOffAnnotations: [],
      maxVisibleBadges: 10,
    });
    const personalBadge = fullBadgesGrid.selectedCell.visibleBadges.find(
      (b) => b.kind === 'personal_event'
    )!;
    assert.equal(personalBadge.nonColorSymbol, '●');
    assert.equal(personalBadge.compactLabel, '13:30');
    assert.ok(!personalBadge.compactLabel.includes('Приватна консультація'));
  });

  it('7.4, 7.5 & 7.6 preserves day-off annotation alongside overnight carryover, projects 7-day Week overview with union occupancy, and shares mode/filter state', () => {
    const nightShift: CalendarEvent = {
      id: 'shift-night',
      title: 'Нічна зміна 22:00–06:00',
      note: null,
      type: 'work_shift',
      color: 'work',
      isBlocking: true,
      state: 'active',
      workProperties: {
        shiftName: 'Нічна зміна 22:00–06:00',
        shiftCode: 'Н',
        sourceTemplateId: null,
      },
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-11-03',
          startLocalTime: '22:00',
          endLocalDate: '2026-11-04',
          endLocalTime: '06:00',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const dayOffOnNov4: DayOffAnnotation = {
      id: 'dayoff-nov4',
      localDate: '2026-11-04',
      sourceZone: 'Europe/Kyiv',
      code: 'В',
      note: 'Вихідний після нічної зміни',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    const personalEventOnNov4: CalendarEvent = {
      id: 'ev-nov4',
      title: 'Прогулянка',
      note: null,
      type: 'personal',
      color: 'personal',
      isBlocking: true,
      state: 'active',
      workProperties: null,
      schedule: {
        kind: 'timed',
        interval: buildZonedIntervalFromLocalInput({
          startLocalDate: '2026-11-04',
          startLocalTime: '14:00',
          endLocalDate: '2026-11-04',
          endLocalTime: '15:30',
          originZone: 'Europe/Kyiv',
        }).interval,
      },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      revision: 1,
    };

    // Coexistence on 2026-11-04: explicit day off + overnight carryover [00:00, 06:00)
    const weekAll = projectWeekCalendarOverview({
      selectedDate: '2026-11-04',
      actualTodayDate: '2026-11-02',
      displayZone: 'Europe/Kyiv',
      events: [nightShift, personalEventOnNov4],
      reservations: [],
      tasks: [],
      dayOffAnnotations: [dayOffOnNov4],
      secondaryFilter: 'all',
    });

    assert.equal(weekAll.days.length, 7);
    assert.equal(weekAll.mondayDate, '2026-11-02');
    assert.equal(weekAll.sundayDate, '2026-11-08');

    const wedOverview = weekAll.selectedDayOverview;
    assert.equal(wedOverview.localDate, '2026-11-04');
    assert.equal(wedOverview.hasExplicitDayOff, true);
    assert.equal(wedOverview.hasOvernightWorkCarryover, true);
    assert.equal(wedOverview.isMixedDayOffWithCarryover, true);
    // Work strip still shows the [00:00, 06:00) carryover (0%..25%) even though day-off is marked
    assert.equal(wedOverview.workStripSegments.length, 1);
    assert.equal(wedOverview.workStripSegments[0].widthPercent, 25);
    // Occupied time on Nov 4 = 360 min (00:00-06:00) + 90 min (14:00-15:30) = 450 min
    assert.equal(wedOverview.unionOccupiedMinutes, 450);

    // Editing either night segment references the same shift ID ('shift-night')
    const tueOverview = weekAll.days.find(
      (d) => d.localDate === '2026-11-03'
    )!;
    assert.equal(
      tueOverview.filteredTimelineItems[0].sourceId,
      wedOverview.filteredTimelineItems[0].sourceId
    );
    assert.equal(tueOverview.filteredTimelineItems[0].sourceId, 'shift-night');

    // Secondary filter 'work' hides personal events while keeping work shifts & day-off markers
    const weekWorkOnly = projectWeekCalendarOverview({
      selectedDate: '2026-11-04',
      actualTodayDate: '2026-11-02',
      displayZone: 'Europe/Kyiv',
      events: [nightShift, personalEventOnNov4],
      reservations: [],
      tasks: [],
      dayOffAnnotations: [dayOffOnNov4],
      secondaryFilter: 'work',
    });
    assert.equal(weekWorkOnly.selectedDayOverview.filteredTimelineItems.length, 1);
    assert.equal(
      weekWorkOnly.selectedDayOverview.filteredTimelineItems[0].sourceKind,
      'work_shift'
    );

    // Secondary filter 'events_and_tasks' hides work shifts while keeping personal events & tasks
    const weekEventsOnly = projectWeekCalendarOverview({
      selectedDate: '2026-11-04',
      actualTodayDate: '2026-11-02',
      displayZone: 'Europe/Kyiv',
      events: [nightShift, personalEventOnNov4],
      reservations: [],
      tasks: [],
      dayOffAnnotations: [dayOffOnNov4],
      secondaryFilter: 'events_and_tasks',
    });
    assert.equal(
      weekEventsOnly.selectedDayOverview.filteredTimelineItems.length,
      1
    );
    assert.equal(
      weekEventsOnly.selectedDayOverview.filteredTimelineItems[0].sourceKind,
      'event'
    );

    // Shared mode & selectedDate state across Month, Week, Day in DestinationContextMap
    let ctx = createInitialDestinationContextMap('2026-11-02');
    assert.equal(ctx.calendar.mode, 'month');
    assert.equal(ctx.calendar.selectedDate, '2026-11-02');
    assert.equal(ctx.calendar.secondaryFilter, 'all');

    ctx = updateDestinationContext(ctx, 'calendar', {
      selectedDate: '2026-11-04',
      mode: 'week',
      secondaryFilter: 'work',
    });
    assert.equal(ctx.calendar.selectedDate, '2026-11-04');
    assert.equal(ctx.calendar.mode, 'week');
    assert.equal(ctx.calendar.secondaryFilter, 'work');

    ctx = updateDestinationContext(ctx, 'calendar', { mode: 'day' });
    assert.equal(ctx.calendar.selectedDate, '2026-11-04');
    assert.equal(ctx.calendar.secondaryFilter, 'work');

    const weekDates = buildWeekDates('2026-11-04');
    assert.deepEqual(weekDates, [
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
  });
});
