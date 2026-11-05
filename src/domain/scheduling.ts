import { formatMonthYear, formatDateRange } from '../lib/format';
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  EventPaletteColor,
  IanaTimeZone,
  IsoInstantString,
  LocalDateString,
  LocalTimeString,
  Task,
  TaskReservation,
} from './types';
import {
  EpochInterval,
  MONDAY_FIRST_WEEKDAY_FULL_UK,
  MONDAY_FIRST_WEEKDAY_SHORT_UK,
  MonthGridCellDate,
  ProjectedDaySegment,
  assertValidIanaZone,
  assertValidLocalDate,
  buildMonthGridDates,
  buildWeekDates,
  clipIntervalToWindow,
  doIntervalsOverlap,
  formatInstantInZone,
  formatUkrainianDateHeading,
  formatUkrainianShortDayMonth,
  getLocalDateBoundariesInZone,
  getMondayFirstWeekdayIndex,
  parseLocalDateParts,
  projectIntervalOntoLocalDates,
  resolveAllDayEventOccupancyInterval,
  resolveLocalDateTimeToInstant,
  subtractIntervalUnions,
  unionIntervals,
} from './temporal';

export type BlockingOccupancyCategory =
  | 'work'
  | 'reservations'
  | 'personalBlocking'
  | 'restSleepTravel';

export interface EffectiveBlockingSlice {
  sourceKind: 'event' | 'reservation';
  sourceId: EntityId;
  taskId: EntityId | null;
  title: string;
  category: BlockingOccupancyCategory;
  startInstant: IsoInstantString;
  endInstant: IsoInstantString;
  startMs: number;
  endMs: number;
  isTruncatedRemainderReleased: boolean;
  /**
   * C07 / 5.5: Past or truncated planned intervals are schedule records,
   * never claimed as actual tracked work.
   */
  isActualTrackedWork: false;
}

export interface UnoccupiedTimeGap {
  startInstant: IsoInstantString;
  endInstant: IsoInstantString;
  startMs: number;
  endMs: number;
  localDate: LocalDateString;
  startLocalTime: LocalTimeString;
  endLocalTime: LocalTimeString;
  durationMinutes: number;
  descriptionUk: string;
}

export interface CategoryTotalsMinutes {
  work: number;
  reservations: number;
  personalBlocking: number;
  restSleepTravel: number;
}

export interface WindowAvailabilitySummary {
  windowStartInstant: IsoInstantString;
  windowEndInstant: IsoInstantString;
  windowDurationMinutes: number;
  /**
   * Union-based total occupied minutes (overlaps are never double-counted).
   */
  totalOccupiedMinutes: number;
  totalUnoccupiedMinutes: number;
  /**
   * Category totals kept distinct from union-based totalOccupiedMinutes (C10 / 5.6).
   */
  categoryTotalsMinutes: CategoryTotalsMinutes;
  effectiveBlockingSlices: EffectiveBlockingSlice[];
  unoccupiedGaps: UnoccupiedTimeGap[];
}

export interface ScheduleConflictItem {
  sourceKind: 'event' | 'reservation';
  sourceId: EntityId;
  taskId: EntityId | null;
  title: string;
  category: BlockingOccupancyCategory;
  overlapStartInstant: IsoInstantString;
  overlapEndInstant: IsoInstantString;
  overlapMinutes: number;
  displayRangeUk: string;
}

export interface ScheduleConflictReport {
  hasConflicts: boolean;
  conflicts: ScheduleConflictItem[];
  warningMessageUk: string | null;
}

export interface ProjectedTimelineItem {
  itemKey: string;
  sourceKind: 'event' | 'work_shift' | 'reservation';
  sourceId: EntityId;
  taskId: EntityId | null;
  title: string;
  note: string | null;
  color: EventPaletteColor;
  isBlocking: boolean;
  state: 'active' | 'released' | 'canceled';
  taskState: Task['state'] | null;
  segment: ProjectedDaySegment;
  releaseNoteUk: string | null;
  originZoneNoteUk: string | null;
  isActualTrackedWork: false;
}

export interface ProjectedAllDayItem {
  eventId: EntityId;
  title: string;
  note: string | null;
  color: EventPaletteColor;
  isBlocking: boolean;
  startLocalDate: LocalDateString;
  endLocalDateExclusive: LocalDateString;
  originZone: IanaTimeZone;
  travelBoundaryNoteUk: string | null;
}

export interface ProjectedDayOffInfo {
  annotationId: EntityId;
  localDate: LocalDateString;
  sourceZone: IanaTimeZone;
  code: string | null;
  note: string | null;
  isFromDifferentZone: boolean;
  hasOvernightCarryoverOnThisDate: boolean;
  zoneNoticeUk: string | null;
}

export interface ProjectedDaySchedule {
  localDate: LocalDateString;
  displayZone: IanaTimeZone;
  dayDurationMinutes: number;
  dstKind: 'normal' | 'spring_forward_short' | 'fall_back_long';
  timelineItems: ProjectedTimelineItem[];
  allDayItems: ProjectedAllDayItem[];
  dayOffAnnotations: ProjectedDayOffInfo[];
  untimedDateOnlyTasks: Task[];
  availability: WindowAvailabilitySummary;
}

export function classifyEventOccupancyCategory(
  event: CalendarEvent
): BlockingOccupancyCategory {
  if (event.type === 'work_shift') return 'work';
  if (
    event.type === 'rest' ||
    event.type === 'sleep' ||
    event.type === 'travel'
  ) {
    return 'restSleepTravel';
  }
  return 'personalBlocking';
}

/**
 * 5.5 Effective occupancy for a TaskReservation:
 * - `state === 'released'` (released before start) or `'canceled'`: occupies 0 minutes (`null`).
 * - `state === 'active'`: occupies `[interval.startInstant, interval.endInstant)`.
 *   When truncated during an ongoing block, `interval.endInstant` equals `releaseMetadata.releasedAt`,
 *   so occupancy ends at the release instant and the remainder is free.
 */
export function getReservationEffectiveBlockingSlice(
  reservation: TaskReservation,
  tasksById: ReadonlyMap<EntityId, Task>
): EffectiveBlockingSlice | null {
  if (reservation.state !== 'active') {
    return null;
  }
  const startMs = Date.parse(reservation.interval.startInstant);
  const endMs = Date.parse(reservation.interval.endInstant);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  const task = reservation.taskId ? tasksById.get(reservation.taskId) : undefined;
  const title = task ? task.title : (reservation.habitOccurrence ? 'Сеанс звички' : 'Запланована справа');

  return {
    sourceKind: 'reservation',
    sourceId: reservation.id,
    taskId: reservation.taskId,
    title,
    category: 'reservations',
    startInstant: reservation.interval.startInstant,
    endInstant: reservation.interval.endInstant,
    startMs,
    endMs,
    isTruncatedRemainderReleased: reservation.releaseMetadata !== null,
    isActualTrackedWork: false,
  };
}

/**
 * 5.3 / 5.6 Effective occupancy for a CalendarEvent:
 * - Canceled or non-blocking events (`isBlocking === false`) do not occupy time.
 * - Timed blocking events occupy `[startInstant, endInstant)`.
 * - Blocking all-day events reserve their own record-zone (`originZone`) date boundaries.
 */
export function getEventEffectiveBlockingSlice(
  event: CalendarEvent
): EffectiveBlockingSlice | null {
  if (event.state !== 'active' || !event.isBlocking) {
    return null;
  }

  const category = classifyEventOccupancyCategory(event);

  if (event.schedule.kind === 'timed') {
    const startMs = Date.parse(event.schedule.interval.startInstant);
    const endMs = Date.parse(event.schedule.interval.endInstant);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    ) {
      return null;
    }
    return {
      sourceKind: 'event',
      sourceId: event.id,
      taskId: null,
      title: event.title,
      category,
      startInstant: event.schedule.interval.startInstant,
      endInstant: event.schedule.interval.endInstant,
      startMs,
      endMs,
      isTruncatedRemainderReleased: false,
      isActualTrackedWork: false,
    };
  }

  // Blocking all-day event uses its own originZone boundaries (C08 / 5.2)
  const resolvedAllDay = resolveAllDayEventOccupancyInterval(event.schedule);
  return {
    sourceKind: 'event',
    sourceId: event.id,
    taskId: null,
    title: event.title,
    category,
    startInstant: resolvedAllDay.startInstant,
    endInstant: resolvedAllDay.endInstant,
    startMs: resolvedAllDay.startMs,
    endMs: resolvedAllDay.endMs,
    isTruncatedRemainderReleased: false,
    isActualTrackedWork: false,
  };
}

function sumIntervalMinutes(intervals: readonly EpochInterval[]): number {
  let totalMs = 0;
  for (const iv of intervals) {
    if (iv.endMs > iv.startMs) {
      totalMs += iv.endMs - iv.startMs;
    }
  }
  return Math.round(totalMs / 60_000);
}

/**
 * 5.6 Availability & Load Engine (C10):
 * - Subtracts the union of effective blocking intervals from the viewing window.
 * - Includes: work shifts, active/truncated reservations, blocking events, manual blocking rest/sleep/travel.
 * - Excludes: deadlines, priorities, date-only intentions, day-off annotations, untimed habits,
 *   personal records, assessments, inspiration, and wishes.
 * - Overlaps never double-count in `totalOccupiedMinutes`.
 * - Category totals remain distinct.
 */
export function calculateWindowAvailability(params: {
  windowStartInstant: IsoInstantString;
  windowEndInstant: IsoInstantString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
}): WindowAvailabilitySummary {
  assertValidIanaZone(params.displayZone);
  const windowStartMs = Date.parse(params.windowStartInstant);
  const windowEndMs = Date.parse(params.windowEndInstant);
  if (
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(windowEndMs) ||
    windowEndMs <= windowStartMs
  ) {
    return {
      windowStartInstant: params.windowStartInstant,
      windowEndInstant: params.windowEndInstant,
      windowDurationMinutes: 0,
      totalOccupiedMinutes: 0,
      totalUnoccupiedMinutes: 0,
      categoryTotalsMinutes: {
        work: 0,
        reservations: 0,
        personalBlocking: 0,
        restSleepTravel: 0,
      },
      effectiveBlockingSlices: [],
      unoccupiedGaps: [],
    };
  }

  const windowEpoch: EpochInterval = {
    startMs: windowStartMs,
    endMs: windowEndMs,
  };
  const windowDurationMinutes = Math.round(
    (windowEndMs - windowStartMs) / 60_000
  );

  const tasksById = new Map<EntityId, Task>(params.tasks.map((t) => [t.id, t]));
  const effectiveBlockingSlices: EffectiveBlockingSlice[] = [];

  for (const ev of params.events) {
    const slice = getEventEffectiveBlockingSlice(ev);
    if (!slice) continue;
    const clipped = clipIntervalToWindow(
      { startMs: slice.startMs, endMs: slice.endMs },
      windowEpoch
    );
    if (clipped) {
      effectiveBlockingSlices.push({
        ...slice,
        startMs: clipped.startMs,
        endMs: clipped.endMs,
        startInstant: new Date(clipped.startMs).toISOString(),
        endInstant: new Date(clipped.endMs).toISOString(),
      });
    }
  }

  for (const res of params.reservations) {
    const slice = getReservationEffectiveBlockingSlice(res, tasksById);
    if (!slice) continue;
    const clipped = clipIntervalToWindow(
      { startMs: slice.startMs, endMs: slice.endMs },
      windowEpoch
    );
    if (clipped) {
      effectiveBlockingSlices.push({
        ...slice,
        startMs: clipped.startMs,
        endMs: clipped.endMs,
        startInstant: new Date(clipped.startMs).toISOString(),
        endInstant: new Date(clipped.endMs).toISOString(),
      });
    }
  }

  effectiveBlockingSlices.sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs
  );

  // Union across all categories for totalOccupiedMinutes (no double counting)
  const allUnioned = unionIntervals(effectiveBlockingSlices);
  const totalOccupiedMinutes = Math.min(
    windowDurationMinutes,
    sumIntervalMinutes(allUnioned)
  );
  const totalUnoccupiedMinutes = Math.max(
    0,
    windowDurationMinutes - totalOccupiedMinutes
  );

  // Distinct category totals (union within each category so same-category self-overlap doesn't inflate, while cross-category totals stay distinct)
  const byCategory: Record<BlockingOccupancyCategory, EpochInterval[]> = {
    work: [],
    reservations: [],
    personalBlocking: [],
    restSleepTravel: [],
  };
  for (const slice of effectiveBlockingSlices) {
    byCategory[slice.category].push({
      startMs: slice.startMs,
      endMs: slice.endMs,
    });
  }

  const categoryTotalsMinutes: CategoryTotalsMinutes = {
    work: sumIntervalMinutes(unionIntervals(byCategory.work)),
    reservations: sumIntervalMinutes(unionIntervals(byCategory.reservations)),
    personalBlocking: sumIntervalMinutes(
      unionIntervals(byCategory.personalBlocking)
    ),
    restSleepTravel: sumIntervalMinutes(
      unionIntervals(byCategory.restSleepTravel)
    ),
  };

  // Unoccupied gaps by subtracting the union of blocking intervals from the viewing window
  const rawGaps = subtractIntervalUnions(windowEpoch, effectiveBlockingSlices);
  const unoccupiedGaps: UnoccupiedTimeGap[] = rawGaps.map((gap) => {
    const startWall = formatInstantInZone(gap.startMs, params.displayZone);
    const endWall = formatInstantInZone(gap.endMs, params.displayZone);
    const isEndMidnightNextDay =
      endWall.localTime === '00:00' && endWall.localDate > startWall.localDate;
    return {
      startInstant: new Date(gap.startMs).toISOString(),
      endInstant: new Date(gap.endMs).toISOString(),
      startMs: gap.startMs,
      endMs: gap.endMs,
      localDate: startWall.localDate,
      startLocalTime: startWall.localTime,
      endLocalTime: isEndMidnightNextDay ? '24:00' : endWall.localTime,
      durationMinutes: Math.round((gap.endMs - gap.startMs) / 60_000),
      descriptionUk: 'Незайнятий час за записаними даними',
    };
  });

  return {
    windowStartInstant: params.windowStartInstant,
    windowEndInstant: params.windowEndInstant,
    windowDurationMinutes,
    totalOccupiedMinutes,
    totalUnoccupiedMinutes,
    categoryTotalsMinutes,
    effectiveBlockingSlices,
    unoccupiedGaps,
  };
}

/**
 * 5.3 / 5.4 / C10: Detect overlaps with existing blocking events/shifts/reservations.
 * Warns the user with Ukrainian details while allowing consciously confirmed conflicts.
 */
export function detectScheduleConflicts(params: {
  candidateStartInstant: IsoInstantString;
  candidateEndInstant: IsoInstantString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  excludeEventId?: EntityId;
  excludeReservationId?: EntityId;
}): ScheduleConflictReport {
  const candStartMs = Date.parse(params.candidateStartInstant);
  const candEndMs = Date.parse(params.candidateEndInstant);
  if (
    !Number.isFinite(candStartMs) ||
    !Number.isFinite(candEndMs) ||
    candEndMs <= candStartMs
  ) {
    return { hasConflicts: false, conflicts: [], warningMessageUk: null };
  }

  const candidateEpoch: EpochInterval = {
    startMs: candStartMs,
    endMs: candEndMs,
  };
  const tasksById = new Map<EntityId, Task>(params.tasks.map((t) => [t.id, t]));
  const conflicts: ScheduleConflictItem[] = [];

  for (const ev of params.events) {
    if (params.excludeEventId && ev.id === params.excludeEventId) continue;
    const slice = getEventEffectiveBlockingSlice(ev);
    if (!slice) continue;
    if (doIntervalsOverlap(candidateEpoch, slice)) {
      const overlapStartMs = Math.max(candStartMs, slice.startMs);
      const overlapEndMs = Math.min(candEndMs, slice.endMs);
      const startWall = formatInstantInZone(overlapStartMs, params.displayZone);
      const endWall = formatInstantInZone(overlapEndMs, params.displayZone);
      conflicts.push({
        sourceKind: 'event',
        sourceId: ev.id,
        taskId: null,
        title: ev.title,
        category: slice.category,
        overlapStartInstant: new Date(overlapStartMs).toISOString(),
        overlapEndInstant: new Date(overlapEndMs).toISOString(),
        overlapMinutes: Math.max(
          1,
          Math.round((overlapEndMs - overlapStartMs) / 60_000)
        ),
        displayRangeUk: `${startWall.localTime}–${endWall.localTime}`,
      });
    }
  }

  for (const res of params.reservations) {
    if (params.excludeReservationId && res.id === params.excludeReservationId) {
      continue;
    }
    const slice = getReservationEffectiveBlockingSlice(res, tasksById);
    if (!slice) continue;
    if (doIntervalsOverlap(candidateEpoch, slice)) {
      const overlapStartMs = Math.max(candStartMs, slice.startMs);
      const overlapEndMs = Math.min(candEndMs, slice.endMs);
      const startWall = formatInstantInZone(overlapStartMs, params.displayZone);
      const endWall = formatInstantInZone(overlapEndMs, params.displayZone);
      conflicts.push({
        sourceKind: 'reservation',
        sourceId: res.id,
        taskId: res.taskId,
        title: slice.title,
        category: 'reservations',
        overlapStartInstant: new Date(overlapStartMs).toISOString(),
        overlapEndInstant: new Date(overlapEndMs).toISOString(),
        overlapMinutes: Math.max(
          1,
          Math.round((overlapEndMs - overlapStartMs) / 60_000)
        ),
        displayRangeUk: `${startWall.localTime}–${endWall.localTime}`,
      });
    }
  }

  if (conflicts.length === 0) {
    return { hasConflicts: false, conflicts: [], warningMessageUk: null };
  }

  const summaryNames = conflicts
    .map((c) => `«${c.title}» (${c.displayRangeUk})`)
    .join(', ');

  return {
    hasConflicts: true,
    conflicts,
    warningMessageUk: `Увага: обраний інтервал перетинається із записаними зобов’язаннями: ${summaryNames}. Підтвердьте свідоме збереження з перетином або змініть час.`,
  };
}

/**
 * 5.1 / 5.2 / 5.3 / 5.4 / 5.6 Unified day schedule projection in `displayZone`.
 * One engine serves all temporal records (events, overnight work shifts, reservations,
 * all-day records, day-off annotations, and unoccupied gaps).
 */
export function projectScheduleForDate(params: {
  localDate: LocalDateString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  includeReleasedReservations?: boolean;
}): ProjectedDaySchedule {
  assertValidLocalDate(params.localDate);
  assertValidIanaZone(params.displayZone);

  const dayBounds = getLocalDateBoundariesInZone(
    params.localDate,
    params.displayZone
  );
  const tasksById = new Map<EntityId, Task>(params.tasks.map((t) => [t.id, t]));
  const timelineItems: ProjectedTimelineItem[] = [];
  const allDayItems: ProjectedAllDayItem[] = [];

  for (const ev of params.events) {
    if (ev.state === 'canceled') continue;

    if (ev.schedule.kind === 'timed') {
      const segments = projectIntervalOntoLocalDates(
        ev.id,
        ev.schedule.interval,
        params.displayZone,
        params.localDate,
        params.localDate
      );
      for (const seg of segments) {
        const originZoneNoteUk = seg.originZoneDiffersFromDisplay
          ? `Час у поясі створення (${seg.originZone}): ${seg.originClockRangeLabel}`
          : null;
        timelineItems.push({
          itemKey: `event:${ev.id}:seg:${seg.segmentIndex}`,
          sourceKind: ev.type === 'work_shift' ? 'work_shift' : 'event',
          sourceId: ev.id,
          taskId: null,
          title: ev.title,
          note: ev.note,
          color: ev.color,
          isBlocking: ev.isBlocking,
          state: ev.state,
          taskState: null,
          segment: seg,
          releaseNoteUk: null,
          originZoneNoteUk,
          isActualTrackedWork: false,
        });
      }
    } else {
      // All-day event
      if (ev.isBlocking) {
        const occ = resolveAllDayEventOccupancyInterval(
          ev.schedule,
          params.displayZone
        );
        if (occ.displayedDatesTouched.includes(params.localDate)) {
          allDayItems.push({
            eventId: ev.id,
            title: ev.title,
            note: ev.note,
            color: ev.color,
            isBlocking: true,
            startLocalDate: ev.schedule.startLocalDate,
            endLocalDateExclusive: ev.schedule.endLocalDateExclusive,
            originZone: ev.schedule.originZone,
            travelBoundaryNoteUk: occ.travelBoundaryNoteUk,
          });
        }
      } else {
        // Informational all-day event retains its calendar date meaning (C08 / 5.2)
        if (
          params.localDate >= ev.schedule.startLocalDate &&
          params.localDate < ev.schedule.endLocalDateExclusive
        ) {
          allDayItems.push({
            eventId: ev.id,
            title: ev.title,
            note: ev.note,
            color: ev.color,
            isBlocking: false,
            startLocalDate: ev.schedule.startLocalDate,
            endLocalDateExclusive: ev.schedule.endLocalDateExclusive,
            originZone: ev.schedule.originZone,
            travelBoundaryNoteUk: null,
          });
        }
      }
    }
  }

  for (const res of params.reservations) {
    if (res.state === 'canceled') continue;
    if (res.state === 'released' && !params.includeReleasedReservations) {
      continue;
    }

    const segments = projectIntervalOntoLocalDates(
      res.id,
      res.interval,
      params.displayZone,
      params.localDate,
      params.localDate
    );
    const task = res.taskId ? tasksById.get(res.taskId) : undefined;
    const title = task ? task.title : (res.habitOccurrence ? 'Сеанс звички' : 'Запланована справа');

    for (const seg of segments) {
      let releaseNoteUk: string | null = null;
      if (res.releaseMetadata) {
        if (res.state === 'released') {
          releaseNoteUk =
            'Майбутній часовий резерв вивільнено (не займає час у розкладі).';
        } else {
          const origEndWall = formatInstantInZone(
            res.releaseMetadata.originalEndInstant,
            params.displayZone
          );
          releaseNoteUk = `Залишок резерву вивільнено о ${seg.displayEndLocalTime} (початковий план був до ${origEndWall.localTime}; це історія плану, а не підрахунок фактичної роботи).`;
        }
      }

      const originZoneNoteUk = seg.originZoneDiffersFromDisplay
        ? `Час у поясі створення (${seg.originZone}): ${seg.originClockRangeLabel}`
        : null;

      timelineItems.push({
        itemKey: `reservation:${res.id}:seg:${seg.segmentIndex}`,
        sourceKind: 'reservation',
        sourceId: res.id,
        taskId: res.taskId,
        title,
        note: task?.description ?? null,
        color: 'reservation',
        isBlocking: res.state === 'active',
        state: res.state,
        taskState: task?.state ?? null,
        segment: seg,
        releaseNoteUk,
        originZoneNoteUk,
        isActualTrackedWork: false,
      });
    }
  }

  timelineItems.sort(
    (a, b) =>
      a.segment.elapsedStartOffsetMinutes - b.segment.elapsedStartOffsetMinutes ||
      a.segment.elapsedEndOffsetMinutes - b.segment.elapsedEndOffsetMinutes
  );

  const hasOvernightCarryoverOnThisDate = timelineItems.some(
    (item) =>
      item.sourceKind === 'work_shift' && item.segment.continuesBeforeDayStart
  );

  // Day-off annotations retain sourceZone context and do not erase overnight carryover (C08 / C11 / C13)
  const dayOffAnnotations: ProjectedDayOffInfo[] = params.dayOffAnnotations
    .filter((ann) => ann.localDate === params.localDate)
    .map((ann) => {
      const isFromDifferentZone = ann.sourceZone !== params.displayZone;
      const notices: string[] = [];
      if (isFromDifferentZone) {
        notices.push(
          `Позначку вихідного створено для дати ${ann.localDate} у часовому поясі ${ann.sourceZone} (поточний пояс перегляду: ${params.displayZone}).`
        );
      }
      if (hasOvernightCarryoverOnThisDate) {
        notices.push(
          'На початку цієї дати завершується нічна зміна з попереднього дня.'
        );
      }
      return {
        annotationId: ann.id,
        localDate: ann.localDate,
        sourceZone: ann.sourceZone,
        code: ann.code,
        note: ann.note,
        isFromDifferentZone,
        hasOvernightCarryoverOnThisDate,
        zoneNoticeUk: notices.length > 0 ? notices.join(' ') : null,
      };
    });

  // Date-only task intentions remain stable on their calendar date (C08 / 5.2 / 6.4)
  const untimedDateOnlyTasks = params.tasks.filter(
    (t) =>
      t.planningState === 'date_only' &&
      t.plannedDate === params.localDate &&
      t.state !== 'canceled'
  );

  const availability = calculateWindowAvailability({
    windowStartInstant: dayBounds.startInstant,
    windowEndInstant: dayBounds.endInstant,
    displayZone: params.displayZone,
    events: params.events,
    reservations: params.reservations,
    tasks: params.tasks,
  });

  return {
    localDate: params.localDate,
    displayZone: params.displayZone,
    dayDurationMinutes: dayBounds.durationMinutes,
    dstKind: dayBounds.dstKind,
    timelineItems,
    allDayItems,
    dayOffAnnotations,
    untimedDateOnlyTasks,
    availability,
  };
}

// ============================================================================
// STAGE 6: SHARED DAY TIMELINE, OVERLAP LANES, DST RAIL, TODAY & GAP PLANNING
// ============================================================================

export type TimelineItemVisualState =
  | 'past'
  | 'current'
  | 'future'
  | 'completed'
  | 'canceled'
  | 'released';

export interface PositionedTimelineItem {
  item: ProjectedTimelineItem;
  laneIndex: number;
  totalLanes: number;
  clusterId: string;
  clusterSize: number;
  hasConflict: boolean;
  elapsedStartOffsetMinutes: number;
  elapsedEndOffsetMinutes: number;
  topPercent: number;
  heightPercent: number;
  visualState: TimelineItemVisualState;
  statusBadgeUk: string;
}

export interface TimelineOverlapCluster {
  clusterId: string;
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  displayStartLocalTime: LocalTimeString;
  displayEndLocalTime: LocalTimeString;
  totalLanes: number;
  hasConflict: boolean;
  items: PositionedTimelineItem[];
}

export interface DayTimelineHourRailSlot {
  slotIndex: number;
  elapsedOffsetMinutes: number;
  topPercent: number;
  heightPercent: number;
  localTimeLabel: LocalTimeString;
  offsetLabel: string;
  skippedBeforeThisSlotUk: string | null;
  repeatedOccurrenceBadgeUk: string | null;
}

export interface CurrentTimeIndicatorState {
  isVisibleOnDate: boolean;
  localDate: LocalDateString;
  actualTodayDate: LocalDateString;
  elapsedMinutesFromDayStart: number;
  topPercent: number;
  currentLocalTimeLabel: LocalTimeString;
}

export interface NearestCommitmentSummary {
  item: ProjectedTimelineItem;
  relation: 'ongoing' | 'upcoming' | 'scheduled_on_date';
  badgeUk: string;
}

export interface CollapsedNextDaySummary {
  nextLocalDate: LocalDateString;
  overnightCarryoverItems: ProjectedTimelineItem[];
  totalTimedItemsCount: number;
  workShiftsCount: number;
  reservationsCount: number;
  personalEventsCount: number;
  untimedTasksCount: number;
  dayOffCount: number;
  summaryTextUk: string;
}

export interface OlderUnresolvedAndOverdueReport {
  /**
   * 6.4 Older open tasks with date_only < selectedDate or elapsed reservations before selectedDate
   * that are NOT automatically copied into Today.
   */
  olderUnresolvedPlannedTasks: {
    task: Task;
    reasonUk: string;
    referenceDateLabel: string;
  }[];
  /**
   * 6.4 Open tasks with an overdue deadline, kept strictly separate from elapsed planning.
   */
  overdueDeadlineTasks: {
    task: Task;
    deadlineLabelUk: string;
  }[];
}

export interface GapTaskSessionProposal {
  isValid: boolean;
  requiresDurationInput: boolean;
  estimateExceedsGap: boolean;
  isPartialSession: boolean;
  suggestedPartialMinutes: number;
  fullEstimateMinutes: number | null;
  candidateStartInstant: IsoInstantString | null;
  candidateEndInstant: IsoInstantString | null;
  displayStartLocalTime: LocalTimeString;
  displayEndLocalTime: LocalTimeString;
  displayEndLocalDate: LocalDateString;
  durationMinutes: number;
  conflictReport: ScheduleConflictReport;
  errorUk: string | null;
}

/**
 * 6.1 Build a chronological hour rail for `localDate` in `displayZone`
 * that represents DST skipped (23h day) and repeated (25h day) hours honestly.
 */
export function buildDayTimelineHourRail(
  localDate: LocalDateString,
  displayZone: IanaTimeZone
): DayTimelineHourRailSlot[] {
  const bounds = getLocalDateBoundariesInZone(localDate, displayZone);
  const totalMinutes = Math.max(60, bounds.durationMinutes);
  const totalHours = Math.max(1, Math.round(totalMinutes / 60));

  const rawSlots: {
    slotIndex: number;
    elapsedOffsetMinutes: number;
    hour: number;
    localTimeLabel: LocalTimeString;
    offsetMinutes: number;
    offsetLabel: string;
  }[] = [];

  const hourCounts = new Map<string, number>();

  for (let i = 0; i < totalHours; i++) {
    const elapsedOffsetMinutes = i * 60;
    const slotMs = bounds.startMs + elapsedOffsetMinutes * 60_000;
    const wc = formatInstantInZone(slotMs, displayZone);
    hourCounts.set(wc.localTime, (hourCounts.get(wc.localTime) ?? 0) + 1);
    rawSlots.push({
      slotIndex: i,
      elapsedOffsetMinutes,
      hour: wc.hour,
      localTimeLabel: wc.localTime,
      offsetMinutes: wc.offsetMinutes,
      offsetLabel: wc.offsetLabel,
    });
  }

  const seenHourOccurrences = new Map<string, number>();

  return rawSlots.map((slot, idx) => {
    const prev = idx > 0 ? rawSlots[idx - 1] : null;
    let skippedBeforeThisSlotUk: string | null = null;

    if (prev) {
      const expectedHour = (prev.hour + 1) % 24;
      if (
        slot.offsetMinutes > prev.offsetMinutes &&
        slot.hour !== expectedHour
      ) {
        const skippedHourStr = `${String(expectedHour).padStart(2, '0')}:00`;
        skippedBeforeThisSlotUk = `Пропущено ${skippedHourStr} (перехід на літній час)`;
      }
    }

    let repeatedOccurrenceBadgeUk: string | null = null;
    if ((hourCounts.get(slot.localTimeLabel) ?? 0) > 1) {
      const occ = (seenHourOccurrences.get(slot.localTimeLabel) ?? 0) + 1;
      seenHourOccurrences.set(slot.localTimeLabel, occ);
      repeatedOccurrenceBadgeUk =
        occ === 1
          ? `1-ше (${slot.offsetLabel})`
          : `2-ге (${slot.offsetLabel})`;
    }

    const topPercent = (slot.elapsedOffsetMinutes / totalMinutes) * 100;
    const heightPercent = (60 / totalMinutes) * 100;

    return {
      slotIndex: slot.slotIndex,
      elapsedOffsetMinutes: slot.elapsedOffsetMinutes,
      topPercent,
      heightPercent,
      localTimeLabel: slot.localTimeLabel,
      offsetLabel: slot.offsetLabel,
      skippedBeforeThisSlotUk,
      repeatedOccurrenceBadgeUk,
    };
  });
}

/**
 * 6.5 Classify the visual state of a projected timeline item without confusing past with completed.
 */
export function classifyTimelineItemVisualState(
  item: ProjectedTimelineItem,
  nowMs: number
): { visualState: TimelineItemVisualState; statusBadgeUk: string } {
  if (item.state === 'released') {
    return {
      visualState: 'released',
      statusBadgeUk: 'Вивільнено • історія плану (не займає час)',
    };
  }
  if (item.state === 'canceled' || item.taskState === 'canceled') {
    return {
      visualState: 'canceled',
      statusBadgeUk: 'Скасовано',
    };
  }
  if (item.sourceKind === 'reservation' && item.taskState === 'completed') {
    return {
      visualState: 'completed',
      statusBadgeUk: 'Справу виконано',
    };
  }

  const startMs = Date.parse(item.segment.clippedStartInstant);
  const endMs = Date.parse(item.segment.clippedEndInstant);

  if (Number.isFinite(endMs) && endMs <= nowMs) {
    return {
      visualState: 'past',
      statusBadgeUk:
        item.sourceKind === 'reservation'
          ? 'Минулий резерв (не означає виконання)'
          : 'Минулий інтервал',
    };
  }
  if (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs <= nowMs &&
    nowMs < endMs
  ) {
    return {
      visualState: 'current',
      statusBadgeUk: 'Триває зараз',
    };
  }
  return {
    visualState: 'future',
    statusBadgeUk: 'Заплановано',
  };
}

/**
 * 6.1 / 6.5 Compute proportional positions, connected overlap clusters, and distinguishable lanes.
 * Shared by Today and Calendar Day so overlap and lane math is never duplicated.
 */
export function layoutTimelineOverlapLanes(params: {
  items: readonly ProjectedTimelineItem[];
  dayDurationMinutes: number;
  nowMs: number;
}): {
  positionedItems: PositionedTimelineItem[];
  clusters: TimelineOverlapCluster[];
} {
  const totalDayMinutes = Math.max(60, params.dayDurationMinutes);
  if (params.items.length === 0) {
    return { positionedItems: [], clusters: [] };
  }

  const sorted = [...params.items].sort(
    (a, b) =>
      a.segment.elapsedStartOffsetMinutes -
        b.segment.elapsedStartOffsetMinutes ||
      a.segment.elapsedEndOffsetMinutes - b.segment.elapsedEndOffsetMinutes ||
      a.itemKey.localeCompare(b.itemKey)
  );

  // Partition into connected overlap clusters
  const rawClusters: ProjectedTimelineItem[][] = [];
  let currentCluster: ProjectedTimelineItem[] = [];
  let clusterMaxEnd = -1;

  for (const item of sorted) {
    const startOff = item.segment.elapsedStartOffsetMinutes;
    const endOff = Math.max(
      startOff + 1,
      item.segment.elapsedEndOffsetMinutes
    );

    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterMaxEnd = endOff;
    } else if (startOff < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, endOff);
    } else {
      rawClusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = endOff;
    }
  }
  if (currentCluster.length > 0) {
    rawClusters.push(currentCluster);
  }

  const positionedItems: PositionedTimelineItem[] = [];
  const clusters: TimelineOverlapCluster[] = [];

  rawClusters.forEach((clusterItems, clusterIdx) => {
    const clusterId = `cluster-${clusterIdx}`;
    const laneEndOffsets: number[] = [];
    const assignedLanes: number[] = [];

    for (const item of clusterItems) {
      const startOff = item.segment.elapsedStartOffsetMinutes;
      const endOff = Math.max(
        startOff + 1,
        item.segment.elapsedEndOffsetMinutes
      );
      let placedLane = -1;
      for (let lane = 0; lane < laneEndOffsets.length; lane++) {
        if (laneEndOffsets[lane] <= startOff) {
          placedLane = lane;
          laneEndOffsets[lane] = endOff;
          break;
        }
      }
      if (placedLane === -1) {
        placedLane = laneEndOffsets.length;
        laneEndOffsets.push(endOff);
      }
      assignedLanes.push(placedLane);
    }

    const totalLanes = Math.max(1, laneEndOffsets.length);
    const activeBlockingItems = clusterItems.filter(
      (it) => it.state === 'active' && it.isBlocking
    );

    // Check if at least two active blocking items actually overlap in time
    let hasConflict = false;
    for (let i = 0; i < activeBlockingItems.length && !hasConflict; i++) {
      for (let j = i + 1; j < activeBlockingItems.length; j++) {
        const aStart = activeBlockingItems[i].segment.elapsedStartOffsetMinutes;
        const aEnd = activeBlockingItems[i].segment.elapsedEndOffsetMinutes;
        const bStart = activeBlockingItems[j].segment.elapsedStartOffsetMinutes;
        const bEnd = activeBlockingItems[j].segment.elapsedEndOffsetMinutes;
        if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
          hasConflict = true;
          break;
        }
      }
    }

    const clusterPositioned: PositionedTimelineItem[] = clusterItems.map(
      (item, i) => {
        const startOff = Math.max(
          0,
          Math.min(totalDayMinutes, item.segment.elapsedStartOffsetMinutes)
        );
        const endOff = Math.max(
          startOff + 1,
          Math.min(totalDayMinutes, item.segment.elapsedEndOffsetMinutes)
        );
        const topPercent = (startOff / totalDayMinutes) * 100;
        const heightPercent = ((endOff - startOff) / totalDayMinutes) * 100;
        const { visualState, statusBadgeUk } = classifyTimelineItemVisualState(
          item,
          params.nowMs
        );

        return {
          item,
          laneIndex: assignedLanes[i],
          totalLanes,
          clusterId,
          clusterSize: clusterItems.length,
          hasConflict: hasConflict && item.state === 'active' && item.isBlocking,
          elapsedStartOffsetMinutes: startOff,
          elapsedEndOffsetMinutes: endOff,
          topPercent,
          heightPercent,
          visualState,
          statusBadgeUk,
        };
      }
    );

    positionedItems.push(...clusterPositioned);

    const minStart = Math.min(
      ...clusterPositioned.map((p) => p.elapsedStartOffsetMinutes)
    );
    const maxEnd = Math.max(
      ...clusterPositioned.map((p) => p.elapsedEndOffsetMinutes)
    );
    const firstSeg = clusterItems[0].segment;
    const lastSeg = clusterItems.reduce((acc, cur) =>
      cur.segment.elapsedEndOffsetMinutes >= acc.segment.elapsedEndOffsetMinutes
        ? cur
        : acc
    ).segment;

    clusters.push({
      clusterId,
      startOffsetMinutes: minStart,
      endOffsetMinutes: maxEnd,
      displayStartLocalTime: firstSeg.displayStartLocalTime,
      displayEndLocalTime: lastSeg.displayEndLocalTime,
      totalLanes,
      hasConflict,
      items: clusterPositioned,
    });
  });

  return { positionedItems, clusters };
}

/**
 * 6.3 Current-time line appears ONLY in the date containing `nowMs`.
 */
export function computeCurrentTimeIndicatorPosition(params: {
  localDate: LocalDateString;
  displayZone: IanaTimeZone;
  nowMs: number;
}): CurrentTimeIndicatorState {
  const nowWall = formatInstantInZone(params.nowMs, params.displayZone);
  const actualTodayDate = nowWall.localDate;
  if (params.localDate !== actualTodayDate) {
    return {
      isVisibleOnDate: false,
      localDate: params.localDate,
      actualTodayDate,
      elapsedMinutesFromDayStart: 0,
      topPercent: 0,
      currentLocalTimeLabel: nowWall.localTime,
    };
  }

  const bounds = getLocalDateBoundariesInZone(
    params.localDate,
    params.displayZone
  );
  const totalMinutes = Math.max(60, bounds.durationMinutes);
  const elapsedMinutesFromDayStart = Math.max(
    0,
    Math.min(
      totalMinutes,
      Math.round((params.nowMs - bounds.startMs) / 60_000)
    )
  );
  const topPercent = (elapsedMinutesFromDayStart / totalMinutes) * 100;

  return {
    isVisibleOnDate: true,
    localDate: params.localDate,
    actualTodayDate,
    elapsedMinutesFromDayStart,
    topPercent,
    currentLocalTimeLabel: nowWall.localTime,
  };
}

/**
 * 6.2 Nearest commitment on the selected date:
 * - When viewing actual today: ongoing active block first, otherwise next upcoming block after `nowMs`,
 *   otherwise most recent active block today.
 * - When viewing another date: first active block on that date.
 */
export function computeNearestCommitment(params: {
  projection: ProjectedDaySchedule;
  nowMs: number;
  actualTodayDate: LocalDateString;
}): NearestCommitmentSummary | null {
  const activeItems = params.projection.timelineItems.filter(
    (it) =>
      it.state === 'active' &&
      it.taskState !== 'completed' &&
      it.taskState !== 'canceled'
  );
  if (activeItems.length === 0) return null;

  if (params.projection.localDate === params.actualTodayDate) {
    for (const item of activeItems) {
      const sMs = Date.parse(item.segment.clippedStartInstant);
      const eMs = Date.parse(item.segment.clippedEndInstant);
      if (sMs <= params.nowMs && params.nowMs < eMs) {
        return {
          item,
          relation: 'ongoing',
          badgeUk: 'Триває зараз',
        };
      }
    }
    for (const item of activeItems) {
      const sMs = Date.parse(item.segment.clippedStartInstant);
      if (sMs > params.nowMs) {
        return {
          item,
          relation: 'upcoming',
          badgeUk: 'Наступне за розкладом',
        };
      }
    }
  }

  return {
    item: activeItems[0],
    relation: 'scheduled_on_date',
    badgeUk: 'За розкладом обраної доби',
  };
}

/**
 * 6.2 Meaningful collapsed summary for the next calendar date, including overnight carryover.
 */
export function computeCollapsedNextDaySummary(
  nextDayProjection: ProjectedDaySchedule
): CollapsedNextDaySummary {
  const activeItems = nextDayProjection.timelineItems.filter(
    (it) => it.state === 'active'
  );
  const overnightCarryoverItems = activeItems.filter(
    (it) => it.segment.continuesBeforeDayStart
  );
  const workShiftsCount = activeItems.filter(
    (it) => it.sourceKind === 'work_shift'
  ).length;
  const reservationsCount = activeItems.filter(
    (it) => it.sourceKind === 'reservation'
  ).length;
  const personalEventsCount = activeItems.filter(
    (it) => it.sourceKind === 'event'
  ).length;
  const untimedTasksCount = nextDayProjection.untimedDateOnlyTasks.length;
  const dayOffCount = nextDayProjection.dayOffAnnotations.length;

  const parts: string[] = [];
  if (overnightCarryoverItems.length > 0) {
    const carryLabels = overnightCarryoverItems
      .map(
        (c) =>
          `«${c.title}» (${c.segment.displayStartLocalTime}–${c.segment.displayEndLocalTime})`
      )
      .join(', ');
    parts.push(`Перехід із попередньої доби: ${carryLabels}`);
  }
  if (workShiftsCount > 0) {
    parts.push(`робочих змін: ${workShiftsCount}`);
  }
  if (personalEventsCount > 0) {
    parts.push(`подій: ${personalEventsCount}`);
  }
  if (reservationsCount > 0) {
    parts.push(`резервів справ: ${reservationsCount}`);
  }
  if (untimedTasksCount > 0) {
    parts.push(`справ без часу: ${untimedTasksCount}`);
  }
  if (dayOffCount > 0) {
    parts.push('позначено вихідний');
  }

  const summaryTextUk =
    parts.length > 0
      ? parts.join(' • ')
      : 'На наступну добу ще немає записаних подій чи перехідних нічних змін.';

  return {
    nextLocalDate: nextDayProjection.localDate,
    overnightCarryoverItems,
    totalTimedItemsCount: activeItems.length,
    workShiftsCount,
    reservationsCount,
    personalEventsCount,
    untimedTasksCount,
    dayOffCount,
    summaryTextUk,
  };
}

/**
 * 6.4 Strictly separate older unresolved planned tasks from overdue deadlines.
 * Never auto-copies yesterday's incomplete tasks or undated tasks into Today.
 */
export function collectOlderUnresolvedAndOverdueTasks(params: {
  tasks: readonly Task[];
  reservations: readonly TaskReservation[];
  selectedDate: LocalDateString;
  displayZone: IanaTimeZone;
  nowMs: number;
}): OlderUnresolvedAndOverdueReport {
  const olderUnresolvedPlannedTasks: OlderUnresolvedAndOverdueReport['olderUnresolvedPlannedTasks'] =
    [];
  const overdueDeadlineTasks: OlderUnresolvedAndOverdueReport['overdueDeadlineTasks'] =
    [];

  const selectedBounds = getLocalDateBoundariesInZone(
    params.selectedDate,
    params.displayZone
  );

  for (const task of params.tasks) {
    if (task.state !== 'open') continue;

    // 1. Check overdue deadline (separate from elapsed planning)
    if (task.deadline) {
      if (
        task.deadline.kind === 'date_only' &&
        task.deadline.localDate < params.selectedDate
      ) {
        overdueDeadlineTasks.push({
          task,
          deadlineLabelUk: `Прострочений дедлайн: ${task.deadline.localDate}`,
        });
      } else if (task.deadline.kind === 'exact_instant') {
        const dlMs = Date.parse(task.deadline.instant);
        if (Number.isFinite(dlMs) && dlMs < params.nowMs) {
          const dlWall = formatInstantInZone(dlMs, params.displayZone);
          overdueDeadlineTasks.push({
            task,
            deadlineLabelUk: `Прострочений дедлайн: ${dlWall.localDate} ${dlWall.localTime}`,
          });
        }
      }
    }

    // 2. Check older unresolved planning (without calling it overdue)
    if (
      task.planningState === 'date_only' &&
      task.plannedDate &&
      task.plannedDate < params.selectedDate
    ) {
      olderUnresolvedPlannedTasks.push({
        task,
        reasonUk: `Запланована дата в минулому (${task.plannedDate})`,
        referenceDateLabel: task.plannedDate,
      });
    } else if (task.planningState === 'timed') {
      const taskActiveRes = params.reservations.filter(
        (r) => r.taskId === task.id && r.state === 'active'
      );
      if (taskActiveRes.length > 0) {
        const allBeforeSelectedDate = taskActiveRes.every(
          (r) => Date.parse(r.interval.endInstant) <= selectedBounds.startMs
        );
        if (allBeforeSelectedDate) {
          const latestRes = taskActiveRes.reduce((acc, cur) =>
            Date.parse(cur.interval.endInstant) >
            Date.parse(acc.interval.endInstant)
              ? cur
              : acc
          );
          const wall = formatInstantInZone(
            latestRes.interval.startInstant,
            params.displayZone
          );
          olderUnresolvedPlannedTasks.push({
            task,
            reasonUk: `Минулий часовий резерв (${wall.localDate} ${wall.localTime})`,
            referenceDateLabel: wall.localDate,
          });
        }
      }
    }
  }

  return {
    olderUnresolvedPlannedTasks,
    overdueDeadlineTasks,
  };
}

/**
 * 6.4 Evaluate a candidate session in the Gap Task Picker:
 * - Asks for duration when task has no `estimatedDurationMinutes` and no explicit duration was entered yet.
 * - Supports partial sessions when `estimatedDurationMinutes > gap.durationMinutes` without extending the gap.
 * - Detects overlaps if the user consciously edits duration/start beyond the gap.
 */
export function evaluateGapTaskSessionProposal(params: {
  gap: UnoccupiedTimeGap;
  task: Task;
  startLocalTime: LocalTimeString;
  durationMinutesInput: number | null;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
}): GapTaskSessionProposal {
  const estimate = params.task.estimatedDurationMinutes;
  const estimateExceedsGap =
    estimate !== null && estimate > params.gap.durationMinutes;
  const suggestedPartialMinutes = Math.max(1, params.gap.durationMinutes);

  if (
    params.durationMinutesInput === null ||
    !Number.isFinite(params.durationMinutesInput) ||
    params.durationMinutesInput <= 0
  ) {
    return {
      isValid: false,
      requiresDurationInput: estimate === null,
      estimateExceedsGap,
      isPartialSession: false,
      suggestedPartialMinutes,
      fullEstimateMinutes: estimate,
      candidateStartInstant: null,
      candidateEndInstant: null,
      displayStartLocalTime: params.startLocalTime,
      displayEndLocalTime: params.startLocalTime,
      displayEndLocalDate: params.gap.localDate,
      durationMinutes: 0,
      conflictReport: {
        hasConflicts: false,
        conflicts: [],
        warningMessageUk: null,
      },
      errorUk:
        estimate === null
          ? 'Вкажіть тривалість сесії (у хвилинах), оскільки для справи не задано оцінку.'
          : 'Вкажіть коректну тривалість сесії (більше 0 хв).',
    };
  }

  const durationMinutes = Math.round(params.durationMinutesInput);
  try {
    const startRes = resolveLocalDateTimeToInstant(
      params.gap.localDate,
      params.startLocalTime,
      params.displayZone,
      'compatible'
    );
    const endMs = startRes.epochMs + durationMinutes * 60_000;
    const endWall = formatInstantInZone(endMs, params.displayZone);
    const candidateStartInstant = startRes.instant;
    const candidateEndInstant = new Date(endMs).toISOString();

    const conflictReport = detectScheduleConflicts({
      candidateStartInstant,
      candidateEndInstant,
      displayZone: params.displayZone,
      events: params.events,
      reservations: params.reservations,
      tasks: params.tasks,
    });

    const isPartialSession =
      estimate !== null && durationMinutes < estimate;

    return {
      isValid: true,
      requiresDurationInput: false,
      estimateExceedsGap,
      isPartialSession,
      suggestedPartialMinutes,
      fullEstimateMinutes: estimate,
      candidateStartInstant,
      candidateEndInstant,
      displayStartLocalTime: params.startLocalTime,
      displayEndLocalTime: endWall.localTime,
      displayEndLocalDate: endWall.localDate,
      durationMinutes,
      conflictReport,
      errorUk: null,
    };
  } catch (err) {
    return {
      isValid: false,
      requiresDurationInput: estimate === null,
      estimateExceedsGap,
      isPartialSession: false,
      suggestedPartialMinutes,
      fullEstimateMinutes: estimate,
      candidateStartInstant: null,
      candidateEndInstant: null,
      displayStartLocalTime: params.startLocalTime,
      displayEndLocalTime: params.startLocalTime,
      displayEndLocalDate: params.gap.localDate,
      durationMinutes,
      conflictReport: {
        hasConflicts: false,
        conflicts: [],
        warningMessageUk: null,
      },
      errorUk:
        err instanceof Error ? err.message : 'Некоректний час початку сесії.',
    };
  }
}

// ============================================================================
// STAGE 7: MONTH & WEEK CALENDAR PROJECTIONS, WORK STRIP & COMPACT CELLS
// ============================================================================

export type CalendarSecondaryFilter = 'all' | 'work' | 'events_and_tasks';

/**
 * 7.4 Thin local-clock work strip segment on [00:00 (0%), 12:00 (50%), 24:00 (100%)].
 * Overnight work shows the corresponding portion on both dates.
 */
export interface WorkStripSegment {
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
export interface MonthCellCompactBadge {
  id: string;
  sourceId: EntityId;
  kind:
    | 'work_shift'
    | 'personal_event'
    | 'task_reservation'
    | 'untimed_task'
    | 'day_off';
  compactLabel: string;
  nonColorSymbol: '◆' | '●' | '■' | '□' | '○';
  semanticRole: 'work' | 'personal' | 'reservation' | 'dayoff' | 'neutral';
  continuesBeforeDayStart: boolean;
  continuesAfterDayEnd: boolean;
  personalEventTitleIncluded: false;
  usesArtificialMidnightAsEndpoint: false;
  ariaLabelUk: string;
}

export interface MonthCellMarkerCounts {
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

export interface ProjectedWeekDayOverview {
  localDate: LocalDateString;
  weekdayIndexMondayFirst: number;
  weekdayShortUk: string;
  weekdayFullUk: string;
  shortDateLabelUk: string;
  fullDateHeadingUk: string;
  isToday: boolean;
  isSelected: boolean;
  isNeutralUnknownDate: boolean;
  inferredDayOff: false;
  hasExplicitDayOff: boolean;
  hasOvernightWorkCarryover: boolean;
  isMixedDayOffWithCarryover: boolean;
  workStripSegments: WorkStripSegment[];
  dayProjection: ProjectedDaySchedule;
  filteredTimelineItems: ProjectedTimelineItem[];
  filteredAllDayItems: ProjectedAllDayItem[];
  filteredUntimedTasks: Task[];
  positionedLaneLayout: {
    positionedItems: PositionedTimelineItem[];
    clusters: TimelineOverlapCluster[];
  };
  unionOccupiedMinutes: number;
  unionUnoccupiedMinutes: number;
  categoryTotalsMinutes: CategoryTotalsMinutes;
}

export interface ProjectedWeekCalendarOverview {
  referenceSelectedDate: LocalDateString;
  mondayDate: LocalDateString;
  sundayDate: LocalDateString;
  weekRangeHeadingUk: string;
  secondaryFilter: CalendarSecondaryFilter;
  days: ProjectedWeekDayOverview[]; // Always 7 days (Monday .. Sunday)
  selectedDayOverview: ProjectedWeekDayOverview;
  weekTotalUnionOccupiedMinutes: number;
  weekWorkCategoryMinutes: number;
}

/**
 * 7.3 Format a compact time badge for a projected segment without treating
 * artificial midnight boundaries (`00:00` on continuation start or `24:00`/`00:00` on continuation end)
 * as actual shift/event endpoints.
 */
export function formatSegmentCompactClockLabel(
  segment: ProjectedDaySegment,
  kind: 'work_shift' | 'personal_event' | 'task_reservation'
): string {
  if (segment.continuesBeforeDayStart && segment.continuesAfterDayEnd) {
    return '↔24г';
  }
  if (segment.continuesBeforeDayStart) {
    // Started on previous day; artificial 00:00 start is NOT the actual start endpoint
    return `→${segment.displayEndLocalTime}`;
  }
  if (segment.continuesAfterDayEnd) {
    // Continues into next day; artificial midnight end is NOT the actual end endpoint
    return `${segment.displayStartLocalTime}→`;
  }
  if (kind === 'work_shift') {
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
  if (params.secondaryFilter === 'work') {
    return {
      filteredTimelineItems: params.dayProjection.timelineItems.filter(
        (it) => it.sourceKind === 'work_shift'
      ),
      filteredAllDayItems: [],
      filteredUntimedTasks: [],
      filteredDayOffAnnotations: params.dayProjection.dayOffAnnotations,
    };
  }

  if (params.secondaryFilter === 'events_and_tasks') {
    return {
      filteredTimelineItems: params.dayProjection.timelineItems.filter(
        (it) => it.sourceKind !== 'work_shift'
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
export function buildWorkStripSegmentsForDate(params: {
  dayProjection: ProjectedDaySchedule;
  eventsById: ReadonlyMap<EntityId, CalendarEvent>;
}): WorkStripSegment[] {
  const workItems = params.dayProjection.timelineItems.filter(
    (it) => it.sourceKind === 'work_shift' && it.state === 'active'
  );

  return workItems.map((it) => {
    const startMin = Math.max(0, Math.min(1440, it.segment.startMinuteOfDay));
    const endMin = Math.max(
      startMin + 1,
      Math.min(1440, it.segment.endMinuteOfDay)
    );
    const leftPercent = Number(((startMin / 1440) * 100).toFixed(4));
    const widthPercent = Number(
      (((endMin - startMin) / 1440) * 100).toFixed(4)
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
export function projectMonthCell(params: {
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
    params.secondaryFilter === 'events_and_tasks' ? [] : allWorkSegments;

  const activeWorkItems = filtered.filteredTimelineItems.filter(
    (it) => it.sourceKind === 'work_shift' && it.state === 'active'
  );
  const activePersonalEvents = filtered.filteredTimelineItems.filter(
    (it) => it.sourceKind === 'event' && it.state === 'active'
  );
  const activeReservations = filtered.filteredTimelineItems.filter(
    (it) =>
      it.sourceKind === 'reservation' &&
      it.state === 'active' &&
      it.taskState !== 'canceled'
  );

  const hasExplicitDayOff = dayProjection.dayOffAnnotations.length > 0;
  const hasOvernightWorkCarryover = allWorkSegments.some(
    (seg) => seg.continuesBeforeDayStart
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
      kind: 'day_off',
      compactLabel: isMixedDayOffWithCarryover ? 'Вих+ніч' : ann.code || 'Вих',
      nonColorSymbol: '○',
      semanticRole: 'dayoff',
      continuesBeforeDayStart: false,
      continuesAfterDayEnd: false,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: isMixedDayOffWithCarryover
        ? 'Позначено вихідний день із перехідною частиною нічної зміни з попередньої доби'
        : 'Позначено вихідний день',
    });
  }

  // 2. Work shift badges (compact times without artificial midnight endpoints)
  for (const ws of activeWorkItems) {
    const compactClock = formatSegmentCompactClockLabel(
      ws.segment,
      'work_shift'
    );
    allBadges.push({
      id: ws.itemKey,
      sourceId: ws.sourceId,
      kind: 'work_shift',
      compactLabel: compactClock,
      nonColorSymbol: '◆',
      semanticRole: 'work',
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
      'personal_event'
    );
    allBadges.push({
      id: ev.itemKey,
      sourceId: ev.sourceId,
      kind: 'personal_event',
      compactLabel: compactClock,
      nonColorSymbol: '●',
      semanticRole: 'personal',
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
      kind: 'personal_event',
      compactLabel: 'День',
      nonColorSymbol: '●',
      semanticRole: 'personal',
      continuesBeforeDayStart: false,
      continuesAfterDayEnd: false,
      personalEventTitleIncluded: false,
      usesArtificialMidnightAsEndpoint: false,
      ariaLabelUk: 'Подія на весь день',
    });
  }

  // 5. Timed task reservation markers (kept separate from work coverage)
  for (const res of activeReservations) {
    const compactClock = formatSegmentCompactClockLabel(
      res.segment,
      'task_reservation'
    );
    allBadges.push({
      id: res.itemKey,
      sourceId: res.sourceId,
      kind: 'task_reservation',
      compactLabel: compactClock,
      nonColorSymbol: '■',
      semanticRole: 'reservation',
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
      kind: 'untimed_task',
      compactLabel: `${count} спр.`,
      nonColorSymbol: '□',
      semanticRole: 'reservation',
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
    summaryParts.push('суміжний місяць');
  }
  if (isToday) {
    summaryParts.push('сьогодні');
  }
  if (isSelected) {
    summaryParts.push('обрана дата');
  }
  if (isMixedDayOffWithCarryover) {
    summaryParts.push(
      'позначено вихідний із завершенням нічної зміни з попередньої доби'
    );
  } else if (hasExplicitDayOff) {
    summaryParts.push('позначено вихідний день');
  }
  if (markerCounts.workShiftsCount > 0) {
    const shiftRanges = activeWorkItems
      .map((w) => formatSegmentCompactClockLabel(w.segment, 'work_shift'))
      .join(', ');
    summaryParts.push(
      `робочих змін: ${markerCounts.workShiftsCount} (${shiftRanges})`
    );
  }
  if (
    markerCounts.personalEventsCount + markerCounts.allDayEventsCount >
    0
  ) {
    summaryParts.push(
      `подій календаря: ${
        markerCounts.personalEventsCount + markerCounts.allDayEventsCount
      }`
    );
  }
  if (markerCounts.taskReservationsCount > 0) {
    summaryParts.push(`резервів справ: ${markerCounts.taskReservationsCount}`);
  }
  if (markerCounts.untimedTasksCount > 0) {
    summaryParts.push(`справ без часу: ${markerCounts.untimedTasksCount}`);
  }
  if (isNeutralUnknownDate) {
    summaryParts.push('немає записаних подій чи позначок');
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
    accessibleSummaryUk: summaryParts.join(', '),
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

  const secondaryFilter = params.secondaryFilter ?? 'all';
  const gridDates = buildMonthGridDates(params.selectedDate);
  const selectedParts = parseLocalDateParts(params.selectedDate)!;
  const eventsById = new Map<EntityId, CalendarEvent>(
    params.events.map((e) => [e.id, e])
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
    })
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

/**
 * 7.2 Selecting any cell in the Month grid (including an adjacent-month date)
 * updates `selectedDate` to that date, changing the active month when an adjacent-month
 * cell is chosen and opening its date details.
 */
export function selectCalendarDateFromCell(params: {
  previousSelectedDate: LocalDateString;
  clickedCellDate: LocalDateString;
}): {
  nextSelectedDate: LocalDateString;
  activeMonthChanged: boolean;
  previousYearMonth: string;
  nextYearMonth: string;
} {
  assertValidLocalDate(params.previousSelectedDate);
  assertValidLocalDate(params.clickedCellDate);
  const prevYm = params.previousSelectedDate.slice(0, 7);
  const nextYm = params.clickedCellDate.slice(0, 7);
  return {
    nextSelectedDate: params.clickedCellDate,
    activeMonthChanged: prevYm !== nextYm,
    previousYearMonth: prevYm,
    nextYearMonth: nextYm,
  };
}

/**
 * 7.5 Project the 7-day Monday-first Week overview for `selectedDate`.
 * - Provides a readable 7-day overview for phone viewports (never forcing 7 cramped hourly columns on a phone).
 * - Also computes `positionedLaneLayout` for each day so wide desktop/tablet viewports can render
 *   7-day proportional timeline columns using the exact same projection.
 */
export function projectWeekCalendarOverview(params: {
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  secondaryFilter?: CalendarSecondaryFilter;
  nowMs?: number;
}): ProjectedWeekCalendarOverview {
  assertValidLocalDate(params.selectedDate);
  assertValidLocalDate(params.actualTodayDate);
  assertValidIanaZone(params.displayZone);

  const secondaryFilter = params.secondaryFilter ?? 'all';
  const nowMs = params.nowMs ?? Date.now();
  const weekDates = buildWeekDates(params.selectedDate);
  const eventsById = new Map<EntityId, CalendarEvent>(
    params.events.map((e) => [e.id, e])
  );

  const days: ProjectedWeekDayOverview[] = weekDates.map((localDate) => {
    const weekdayIdx = getMondayFirstWeekdayIndex(localDate);
    const dayProjection = projectScheduleForDate({
      localDate,
      displayZone: params.displayZone,
      events: params.events,
      reservations: params.reservations,
      tasks: params.tasks,
      dayOffAnnotations: params.dayOffAnnotations,
      includeReleasedReservations: false,
    });

    const filtered = applyCalendarSecondaryFilter({
      dayProjection,
      secondaryFilter,
    });

    const allWorkSegments = buildWorkStripSegmentsForDate({
      dayProjection,
      eventsById,
    });
    const workStripSegments =
      secondaryFilter === 'events_and_tasks' ? [] : allWorkSegments;

    const hasExplicitDayOff = dayProjection.dayOffAnnotations.length > 0;
    const hasOvernightWorkCarryover = allWorkSegments.some(
      (seg) => seg.continuesBeforeDayStart
    );
    const isMixedDayOffWithCarryover =
      hasExplicitDayOff && hasOvernightWorkCarryover;

    const totalUnfilteredRecords =
      dayProjection.timelineItems.length +
      dayProjection.allDayItems.length +
      dayProjection.untimedDateOnlyTasks.length +
      dayProjection.dayOffAnnotations.length;

    const positionedLaneLayout = layoutTimelineOverlapLanes({
      items: filtered.filteredTimelineItems,
      dayDurationMinutes: dayProjection.dayDurationMinutes,
      nowMs,
    });

    return {
      localDate,
      weekdayIndexMondayFirst: weekdayIdx,
      weekdayShortUk: MONDAY_FIRST_WEEKDAY_SHORT_UK[weekdayIdx],
      weekdayFullUk: MONDAY_FIRST_WEEKDAY_FULL_UK[weekdayIdx],
      shortDateLabelUk: formatUkrainianShortDayMonth(localDate),
      fullDateHeadingUk: formatUkrainianDateHeading(localDate),
      isToday: localDate === params.actualTodayDate,
      isSelected: localDate === params.selectedDate,
      isNeutralUnknownDate: totalUnfilteredRecords === 0,
      inferredDayOff: false,
      hasExplicitDayOff,
      hasOvernightWorkCarryover,
      isMixedDayOffWithCarryover,
      workStripSegments,
      dayProjection,
      filteredTimelineItems: filtered.filteredTimelineItems,
      filteredAllDayItems: filtered.filteredAllDayItems,
      filteredUntimedTasks: filtered.filteredUntimedTasks,
      positionedLaneLayout,
      unionOccupiedMinutes: dayProjection.availability.totalOccupiedMinutes,
      unionUnoccupiedMinutes: dayProjection.availability.totalUnoccupiedMinutes,
      categoryTotalsMinutes: dayProjection.availability.categoryTotalsMinutes,
    };
  });

  const selectedDayOverview =
    days.find((d) => d.localDate === params.selectedDate) ?? days[0];

  const weekTotalUnionOccupiedMinutes = days.reduce(
    (sum, d) => sum + d.unionOccupiedMinutes,
    0
  );
  const weekWorkCategoryMinutes = days.reduce(
    (sum, d) => sum + d.categoryTotalsMinutes.work,
    0
  );

  const weekRangeHeadingUk = formatDateRange(weekDates[0], weekDates[6], true);

  return {
    referenceSelectedDate: params.selectedDate,
    mondayDate: weekDates[0],
    sundayDate: weekDates[6],
    weekRangeHeadingUk,
    secondaryFilter,
    days,
    selectedDayOverview,
    weekTotalUnionOccupiedMinutes,
    weekWorkCategoryMinutes,
  };
}


