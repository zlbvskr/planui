import { formatMonthYear } from "../lib/format";

import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  EventPaletteColor,
  IanaTimeZone,
  LocalDateString,
  LocalTimeString,
  Task,
  TaskReservation,
} from "./types";

import {
  MONDAY_FIRST_WEEKDAY_SHORT_UK,
  MonthGridCellDate,
  ProjectedDaySegment,
  assertValidIanaZone,
  assertValidLocalDate,
  buildMonthGridDates,
  formatUkrainianDateHeading,
  parseLocalDateParts,
} from "./temporal";

import { ProjectedDaySchedule } from "./scheduling";

import { ProjectedTimelineItem } from "./scheduling";

import { ProjectedAllDayItem } from "./scheduling";

import { ProjectedDayOffInfo } from "./scheduling";

import { projectScheduleForDate } from "./scheduling";

// ============================================================================

// ============================================================================

export type CalendarSecondaryFilter = "all" | "work" | "events_and_tasks";

/**
 * 7.4 Thin local-clock work strip segment on [00:00 (0%), 12:00 (50%), 24:00 (100%)].
 * Overnight work shows the corresponding portion on both dates.
 */
interface WorkStripSegment {
  eventId: EntityId;
  segmentKey: string;
  title: string;
  shiftCode: string | null;
  color: EventPaletteColor;
  startMinuteOfDay: number; // 0 .. 1440
  endMinuteOfDay: number; // 1 .. 1440
  leftPercent: number; // 0 .. 100
  widthPercent: number; // > 0 .. 100
  displayStartLocalTime: LocalTimeString;
  displayEndLocalTime: LocalTimeString;
  continuesBeforeDayStart: boolean;
  continuesAfterDayEnd: boolean;
  elapsedDurationMinutes: number;
  originClockRangeLabel: string;
}

/**
 * 7.3 Meaningful compact cell badge:
 * - Never includes personal-event titles or long descriptions on mobile (`personalEventTitleIncluded: false`).
 * - Never presents an artificial midnight segment split (`00:00` or `24:00`) as an actual shift endpoint (`usesArtificialMidnightAsEndpoint: false`).
 * - Includes a non-color type symbol (`◆`, `●`, `■`, `□`, `○`) for accessibility.
 */
interface MonthCellCompactBadge {
  id: string;
  sourceId: EntityId;
  kind:
    | "work_shift"
    | "personal_event"
    | "task_reservation"
    | "untimed_task"
    | "day_off";
  compactLabel: string;
  nonColorSymbol: "◆" | "●" | "■" | "□" | "○";
  semanticRole: "work" | "personal" | "reservation" | "dayoff" | "neutral";
  continuesBeforeDayStart: boolean;
  continuesAfterDayEnd: boolean;
  personalEventTitleIncluded: false;
  usesArtificialMidnightAsEndpoint: false;
  ariaLabelUk: string;
}

interface MonthCellMarkerCounts {
  workShiftsCount: number;
  personalEventsCount: number;
  allDayEventsCount: number;
  taskReservationsCount: number;
  untimedTasksCount: number;
  dayOffCount: number;
}

export interface ProjectedMonthCell {
  gridDate: MonthGridCellDate;
  localDate: LocalDateString;
  dayNumber: number;
  inActiveMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /**
   * 7.2 / 7.4 Unknown/empty dates remain neutral; Saturday/Sunday are NEVER inferred as days off.
   */
  isNeutralUnknownDate: boolean;
  inferredDayOff: false;
  hasExplicitDayOff: boolean;
  hasOvernightWorkCarryover: boolean;
  /**
   * 7.4 Day-off markings coexist with overnight carryover (mixed state, not erased).
   */
  isMixedDayOffWithCarryover: boolean;
  workStripSegments: WorkStripSegment[];
  markerCounts: MonthCellMarkerCounts;
  visibleBadges: MonthCellCompactBadge[];
  allBadgesCount: number;
  overflowCount: number;
  omitsPersonalTitlesOnMobile: true;
  accessibleSummaryUk: string;
  dayProjection: ProjectedDaySchedule;
}

export interface ProjectedMonthCalendarGrid {
  referenceSelectedDate: LocalDateString;
  activeYear: number;
  activeMonth: number;
  monthHeadingUk: string;
  weekdayHeadersUk: readonly string[];
  secondaryFilter: CalendarSecondaryFilter;
  cells: ProjectedMonthCell[]; // Always 42 cells (7 columns × 6 rows, Monday-first)
  selectedCell: ProjectedMonthCell;
}

/**
 * 7.3 Format a compact time badge for a projected segment without treating
 * artificial midnight boundaries (`00:00` on continuation start or `24:00`/`00:00` on continuation end)
 * as actual shift/event endpoints.
 */
function formatSegmentCompactClockLabel(
  segment: ProjectedDaySegment,
  kind: "work_shift" | "personal_event" | "task_reservation",
): string {
  if (segment.continuesBeforeDayStart && segment.continuesAfterDayEnd) {
    return "↔24г";
  }
  if (segment.continuesBeforeDayStart) {
    // Started on previous day; artificial 00:00 start is NOT the actual start endpoint
    return `→${segment.displayEndLocalTime}`;
  }
  if (segment.continuesAfterDayEnd) {
    // Continues into next day; artificial midnight end is NOT the actual end endpoint
    return `${segment.displayStartLocalTime}→`;
  }
  if (kind === "work_shift") {
    return `${segment.displayStartLocalTime}–${segment.displayEndLocalTime}`;
  }
  return segment.displayStartLocalTime;
}

/**
 * 7.1 Filter projected items according to the active secondary filter in Calendar.
 */
export function applyCalendarSecondaryFilter(params: {
  dayProjection: ProjectedDaySchedule;
  secondaryFilter: CalendarSecondaryFilter;
}): {
  filteredTimelineItems: ProjectedTimelineItem[];
  filteredAllDayItems: ProjectedAllDayItem[];
  filteredUntimedTasks: Task[];
  filteredDayOffAnnotations: ProjectedDayOffInfo[];
} {
  if (params.secondaryFilter === "work") {
    return {
      filteredTimelineItems: params.dayProjection.timelineItems.filter(
        (it) => it.sourceKind === "work_shift",
      ),
      filteredAllDayItems: [],
      filteredUntimedTasks: [],
      filteredDayOffAnnotations: params.dayProjection.dayOffAnnotations,
    };
  }

  if (params.secondaryFilter === "events_and_tasks") {
    return {
      filteredTimelineItems: params.dayProjection.timelineItems.filter(
        (it) => it.sourceKind !== "work_shift",
      ),
      filteredAllDayItems: params.dayProjection.allDayItems,
      filteredUntimedTasks: params.dayProjection.untimedDateOnlyTasks,
      filteredDayOffAnnotations: [],
    };
  }

  return {
    filteredTimelineItems: params.dayProjection.timelineItems,
    filteredAllDayItems: params.dayProjection.allDayItems,
    filteredUntimedTasks: params.dayProjection.untimedDateOnlyTasks,
    filteredDayOffAnnotations: params.dayProjection.dayOffAnnotations,
  };
}

/**
 * 7.4 Compute local-clock work strip segments (`00:00` at left `0%`, `12:00` at center `50%`,
 * local date end at right `100%`) for a given day projection.
 * Keeps personal events and task reservations strictly separate from work coverage.
 */
function buildWorkStripSegmentsForDate(params: {
  dayProjection: ProjectedDaySchedule;
  eventsById: ReadonlyMap<EntityId, CalendarEvent>;
}): WorkStripSegment[] {
  const workItems = params.dayProjection.timelineItems.filter(
    (it) => it.sourceKind === "work_shift" && it.state === "active",
  );

  return workItems.map((it) => {
    const startMin = Math.max(0, Math.min(1440, it.segment.startMinuteOfDay));
    const endMin = Math.max(
      startMin + 1,
      Math.min(1440, it.segment.endMinuteOfDay),
    );
    const leftPercent = Number(((startMin / 1440) * 100).toFixed(4));
    const widthPercent = Number(
      (((endMin - startMin) / 1440) * 100).toFixed(4),
    );
    const sourceEvent = params.eventsById.get(it.sourceId);

    return {
      eventId: it.sourceId,
      segmentKey: it.itemKey,
      title: it.title,
      shiftCode: sourceEvent?.workProperties?.shiftCode ?? null,
      color: it.color,
      startMinuteOfDay: startMin,
      endMinuteOfDay: endMin,
      leftPercent,
      widthPercent,
      displayStartLocalTime: it.segment.displayStartLocalTime,
      displayEndLocalTime: it.segment.displayEndLocalTime,
      continuesBeforeDayStart: it.segment.continuesBeforeDayStart,
      continuesAfterDayEnd: it.segment.continuesAfterDayEnd,
      elapsedDurationMinutes: it.segment.elapsedDurationMinutes,
      originClockRangeLabel: it.segment.originClockRangeLabel,
    };
  });
}

/**
 * 7.3 / 7.4 Project a single cell in the Month calendar grid.
 * - Mobile cells omit personal-event titles and long descriptions (`omitsPersonalTitlesOnMobile: true`).
 * - Artificial midnight segment boundaries are never presented as shift endpoints.
 * - Unknown dates remain neutral (`isNeutralUnknownDate`), never inferred as weekend/empty days off.
 * - Day-off annotations coexist with overnight carryover (`isMixedDayOffWithCarryover`).
 */
function projectMonthCell(params: {
  gridDate: MonthGridCellDate;
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  eventsById: ReadonlyMap<EntityId, CalendarEvent>;
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  secondaryFilter: CalendarSecondaryFilter;
  maxVisibleBadges?: number;
}): ProjectedMonthCell {
  const maxVisibleBadges = params.maxVisibleBadges ?? 2;
  const dayProjection = projectScheduleForDate({
    localDate: params.gridDate.localDate,
    displayZone: params.displayZone,
    events: params.events,
    reservations: params.reservations,
    tasks: params.tasks,
    dayOffAnnotations: params.dayOffAnnotations,
    includeReleasedReservations: false,
  });

  const filtered = applyCalendarSecondaryFilter({
    dayProjection,
    secondaryFilter: params.secondaryFilter,
  });

  const allWorkSegments = buildWorkStripSegmentsForDate({
    dayProjection,
    eventsById: params.eventsById,
  });
  const workStripSegments =
    params.secondaryFilter === "events_and_tasks" ? [] : allWorkSegments;

  const activeWorkItems = filtered.filteredTimelineItems.filter(
    (it) => it.sourceKind === "work_shift" && it.state === "active",
  );
  const activePersonalEvents = filtered.filteredTimelineItems.filter(
    (it) => it.sourceKind === "event" && it.state === "active",
  );
  const activeReservations = filtered.filteredTimelineItems.filter(
    (it) =>
      it.sourceKind === "reservation" &&
      it.state === "active" &&
      it.taskState !== "canceled",
  );

  const hasExplicitDayOff = dayProjection.dayOffAnnotations.length > 0;
  const hasOvernightWorkCarryover = allWorkSegments.some(
    (seg) => seg.continuesBeforeDayStart,
  );
  const isMixedDayOffWithCarryover =
    hasExplicitDayOff && hasOvernightWorkCarryover;

  const totalUnfilteredRecords =
    dayProjection.timelineItems.length +
    dayProjection.allDayItems.length +
    dayProjection.untimedDateOnlyTasks.length +
    dayProjection.dayOffAnnotations.length;
  const isNeutralUnknownDate = totalUnfilteredRecords === 0;

  const allBadges: MonthCellCompactBadge[] = [];

  // 1. Explicit day-off badge (if visible under filter)
  if (filtered.filteredDayOffAnnotations.length > 0) {
    const ann = filtered.filteredDayOffAnnotations[0];
    allBadges.push({
      id: `dayoff:${ann.annotationId}`,
      sourceId: ann.annotationId,
      kind: "day_off",
      compactLabel: isMixedDayOffWithCarryover ? "Вих+ніч" : ann.code || "Вих",
      nonColorSymbol: "○",
      semanticRole: "dayoff",
      continuesBeforeDayStart: false,
      continuesAfterDayEnd: false,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: isMixedDayOffWithCarryover
        ? "Позначено вихідний день із перехідною частиною нічної зміни з попередньої доби"
        : "Позначено вихідний день",
    });
  }

  // 2. Work shift badges (compact times without artificial midnight endpoints)
  for (const ws of activeWorkItems) {
    const compactClock = formatSegmentCompactClockLabel(
      ws.segment,
      "work_shift",
    );
    allBadges.push({
      id: ws.itemKey,
      sourceId: ws.sourceId,
      kind: "work_shift",
      compactLabel: compactClock,
      nonColorSymbol: "◆",
      semanticRole: "work",
      continuesBeforeDayStart: ws.segment.continuesBeforeDayStart,
      continuesAfterDayEnd: ws.segment.continuesAfterDayEnd,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: ws.segment.continuesBeforeDayStart
        ? `Завершення нічної зміни з попередньої доби до ${ws.segment.displayEndLocalTime} (повний інтервал: ${ws.segment.originClockRangeLabel})`
        : ws.segment.continuesAfterDayEnd
          ? `Початок нічної зміни о ${ws.segment.displayStartLocalTime} з переходом на наступну добу (повний інтервал: ${ws.segment.originClockRangeLabel})`
          : `Робоча зміна ${ws.segment.displayStartLocalTime}–${ws.segment.displayEndLocalTime}`,
    });
  }

  // 3. Personal / rest timed event markers (NEVER include personal event titles in mobile cell badges)
  for (const ev of activePersonalEvents) {
    const compactClock = formatSegmentCompactClockLabel(
      ev.segment,
      "personal_event",
    );
    allBadges.push({
      id: ev.itemKey,
      sourceId: ev.sourceId,
      kind: "personal_event",
      compactLabel: compactClock,
      nonColorSymbol: "●",
      semanticRole: "personal",
      continuesBeforeDayStart: ev.segment.continuesBeforeDayStart,
      continuesAfterDayEnd: ev.segment.continuesAfterDayEnd,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: `Подія календаря о ${compactClock}`,
    });
  }

  // 4. All-day event markers (separate from work coverage, no personal titles in cell)
  for (const allDay of filtered.filteredAllDayItems) {
    allBadges.push({
      id: `allday:${allDay.eventId}`,
      sourceId: allDay.eventId,
      kind: "personal_event",
      compactLabel: "День",
      nonColorSymbol: "●",
      semanticRole: "personal",
      continuesBeforeDayStart: false,
      continuesAfterDayEnd: false,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: "Подія на весь день",
    });
  }

  // 5. Timed task reservation markers (kept separate from work coverage)
  for (const res of activeReservations) {
    const compactClock = formatSegmentCompactClockLabel(
      res.segment,
      "task_reservation",
    );
    allBadges.push({
      id: res.itemKey,
      sourceId: res.sourceId,
      kind: "task_reservation",
      compactLabel: compactClock,
      nonColorSymbol: "■",
      semanticRole: "reservation",
      continuesBeforeDayStart: res.segment.continuesBeforeDayStart,
      continuesAfterDayEnd: res.segment.continuesAfterDayEnd,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: `Часовий резерв справи о ${compactClock}`,
    });
  }

  // 6. Untimed date-planned tasks summary badge
  if (filtered.filteredUntimedTasks.length > 0) {
    const count = filtered.filteredUntimedTasks.length;
    allBadges.push({
      id: `untimed:${params.gridDate.localDate}`,
      sourceId: filtered.filteredUntimedTasks[0].id,
      kind: "untimed_task",
      compactLabel: `${count} спр.`,
      nonColorSymbol: "□",
      semanticRole: "reservation",
      continuesBeforeDayStart: false,
      continuesAfterDayEnd: false,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: `Справ без точного часу на цю дату: ${count}`,
    });
  }

  const visibleBadges = allBadges.slice(0, maxVisibleBadges);
  const overflowCount = Math.max(0, allBadges.length - visibleBadges.length);

  const markerCounts: MonthCellMarkerCounts = {
    workShiftsCount: activeWorkItems.length,
    personalEventsCount: activePersonalEvents.length,
    allDayEventsCount: filtered.filteredAllDayItems.length,
    taskReservationsCount: activeReservations.length,
    untimedTasksCount: filtered.filteredUntimedTasks.length,
    dayOffCount: filtered.filteredDayOffAnnotations.length,
  };

  const isToday = params.gridDate.localDate === params.actualTodayDate;
  const isSelected = params.gridDate.localDate === params.selectedDate;

  // Build full Ukrainian accessible summary for screen readers
  const dateHeadingUk = formatUkrainianDateHeading(params.gridDate.localDate);
  const summaryParts: string[] = [dateHeadingUk];
  if (!params.gridDate.inActiveMonth) {
    summaryParts.push("суміжний місяць");
  }
  if (isToday) {
    summaryParts.push("сьогодні");
  }
  if (isSelected) {
    summaryParts.push("обрана дата");
  }
  if (isMixedDayOffWithCarryover) {
    summaryParts.push(
      "позначено вихідний із завершенням нічної зміни з попередньої доби",
    );
  } else if (hasExplicitDayOff) {
    summaryParts.push("позначено вихідний день");
  }
  if (markerCounts.workShiftsCount > 0) {
    const shiftRanges = activeWorkItems
      .map((w) => formatSegmentCompactClockLabel(w.segment, "work_shift"))
      .join(", ");
    summaryParts.push(
      `робочих змін: ${markerCounts.workShiftsCount} (${shiftRanges})`,
    );
  }
  if (markerCounts.personalEventsCount + markerCounts.allDayEventsCount > 0) {
    summaryParts.push(
      `подій календаря: ${
        markerCounts.personalEventsCount + markerCounts.allDayEventsCount
      }`,
    );
  }
  if (markerCounts.taskReservationsCount > 0) {
    summaryParts.push(`резервів справ: ${markerCounts.taskReservationsCount}`);
  }
  if (markerCounts.untimedTasksCount > 0) {
    summaryParts.push(`справ без часу: ${markerCounts.untimedTasksCount}`);
  }
  if (isNeutralUnknownDate) {
    summaryParts.push("немає записаних подій чи позначок");
  }

  return {
    gridDate: params.gridDate,
    localDate: params.gridDate.localDate,
    dayNumber: params.gridDate.day,
    inActiveMonth: params.gridDate.inActiveMonth,
    isToday,
    isSelected,
    isNeutralUnknownDate,
    inferredDayOff: false,
    hasExplicitDayOff,
    hasOvernightWorkCarryover,
    isMixedDayOffWithCarryover,
    workStripSegments,
    markerCounts,
    visibleBadges,
    allBadgesCount: allBadges.length,
    overflowCount,
    omitsPersonalTitlesOnMobile: true,
    accessibleSummaryUk: summaryParts.join(", "),
    dayProjection,
  };
}

/**
 * 7.2 / 7.3 / 7.4 Project the full 42-cell (7 columns × 6 rows, Monday-first) Month Calendar grid.
 */
export function projectMonthCalendarGrid(params: {
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  secondaryFilter?: CalendarSecondaryFilter;
  maxVisibleBadges?: number;
}): ProjectedMonthCalendarGrid {
  assertValidLocalDate(params.selectedDate);
  assertValidLocalDate(params.actualTodayDate);
  assertValidIanaZone(params.displayZone);

  const secondaryFilter = params.secondaryFilter ?? "all";
  const gridDates = buildMonthGridDates(params.selectedDate);
  const selectedParts = parseLocalDateParts(params.selectedDate)!;
  const eventsById = new Map<EntityId, CalendarEvent>(
    params.events.map((e) => [e.id, e]),
  );

  const cells = gridDates.map((gridDate) =>
    projectMonthCell({
      gridDate,
      selectedDate: params.selectedDate,
      actualTodayDate: params.actualTodayDate,
      displayZone: params.displayZone,
      events: params.events,
      eventsById,
      reservations: params.reservations,
      tasks: params.tasks,
      dayOffAnnotations: params.dayOffAnnotations,
      secondaryFilter,
      maxVisibleBadges: params.maxVisibleBadges,
    }),
  );

  const selectedCell =
    cells.find((c) => c.localDate === params.selectedDate) ?? cells[0];

  const monthHeadingUk = formatMonthYear(params.selectedDate);

  return {
    referenceSelectedDate: params.selectedDate,
    activeYear: selectedParts.year,
    activeMonth: selectedParts.month,
    monthHeadingUk,
    weekdayHeadersUk: MONDAY_FIRST_WEEKDAY_SHORT_UK,
    secondaryFilter,
    cells,
    selectedCell,
  };
}
