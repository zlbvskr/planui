import {
  CalendarEvent,
  EntityId,
  IanaTimeZone,
  IsoInstantString,
  LocalDateString,
  LocalTimeString,
  Task,
  TaskReservation,
} from "./types";

import {
  EpochInterval,
  assertValidIanaZone,
  clipIntervalToWindow,
  formatInstantInZone,
  resolveAllDayEventOccupancyInterval,
  subtractIntervalUnions,
  unionIntervals,
} from "./temporal";

export type BlockingOccupancyCategory =
  | "work"
  | "reservations"
  | "personalBlocking"
  | "restSleepTravel";

interface EffectiveBlockingSlice {
  sourceKind: "event" | "reservation";
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
   * Past or truncated planned intervals are schedule records,
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

interface CategoryTotalsMinutes {
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
   * Category totals kept distinct from union-based totalOccupiedMinutes.
   */
  categoryTotalsMinutes: CategoryTotalsMinutes;
  effectiveBlockingSlices: EffectiveBlockingSlice[];
  unoccupiedGaps: UnoccupiedTimeGap[];
}

function classifyEventOccupancyCategory(
  event: CalendarEvent,
): BlockingOccupancyCategory {
  if (event.type === "work_shift") return "work";
  if (
    event.type === "rest" ||
    event.type === "sleep" ||
    event.type === "travel"
  ) {
    return "restSleepTravel";
  }
  return "personalBlocking";
}

export /**
 * 5.5 Effective occupancy for a TaskReservation:
 * - `state === 'released'` (released before start) or `'canceled'`: occupies 0 minutes (`null`).
 * - `state === 'active'`: occupies `[interval.startInstant, interval.endInstant)`.
 *   When truncated during an ongoing block, `interval.endInstant` equals `releaseMetadata.releasedAt`,
 *   so occupancy ends at the release instant and the remainder is free.
 */
function getReservationEffectiveBlockingSlice(
  reservation: TaskReservation,
  tasksById: ReadonlyMap<EntityId, Task>,
): EffectiveBlockingSlice | null {
  if (reservation.state !== "active") {
    return null;
  }
  const startMs = Date.parse(reservation.interval.startInstant);
  const endMs = Date.parse(reservation.interval.endInstant);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }
  const task = reservation.taskId
    ? tasksById.get(reservation.taskId)
    : undefined;
  const title = task
    ? task.title
    : reservation.habitOccurrence
      ? "Сеанс звички"
      : "Запланована справа";

  return {
    sourceKind: "reservation",
    sourceId: reservation.id,
    taskId: reservation.taskId,
    title,
    category: "reservations",
    startInstant: reservation.interval.startInstant,
    endInstant: reservation.interval.endInstant,
    startMs,
    endMs,
    isTruncatedRemainderReleased: reservation.releaseMetadata !== null,
    isActualTrackedWork: false,
  };
}

export /**
 * 5.3 / 5.6 Effective occupancy for a CalendarEvent:
 * - Canceled or non-blocking events (`isBlocking === false`) do not occupy time.
 * - Timed blocking events occupy `[startInstant, endInstant)`.
 * - Blocking all-day events reserve their own record-zone (`originZone`) date boundaries.
 */
function getEventEffectiveBlockingSlice(
  event: CalendarEvent,
): EffectiveBlockingSlice | null {
  if (event.state !== "active" || !event.isBlocking) {
    return null;
  }

  const category = classifyEventOccupancyCategory(event);

  if (event.schedule.kind === "timed") {
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
      sourceKind: "event",
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

  // Blocking all-day event uses its own originZone boundaries
  const resolvedAllDay = resolveAllDayEventOccupancyInterval(event.schedule);
  return {
    sourceKind: "event",
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
 * 5.6 Availability & Load Engine:
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
    (windowEndMs - windowStartMs) / 60_000,
  );

  const tasksById = new Map<EntityId, Task>(params.tasks.map((t) => [t.id, t]));
  const effectiveBlockingSlices: EffectiveBlockingSlice[] = [];

  for (const ev of params.events) {
    const slice = getEventEffectiveBlockingSlice(ev);
    if (!slice) continue;
    const clipped = clipIntervalToWindow(
      { startMs: slice.startMs, endMs: slice.endMs },
      windowEpoch,
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
      windowEpoch,
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
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );

  // Union across all categories for totalOccupiedMinutes (no double counting)
  const allUnioned = unionIntervals(effectiveBlockingSlices);
  const totalOccupiedMinutes = Math.min(
    windowDurationMinutes,
    sumIntervalMinutes(allUnioned),
  );
  const totalUnoccupiedMinutes = Math.max(
    0,
    windowDurationMinutes - totalOccupiedMinutes,
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
      unionIntervals(byCategory.personalBlocking),
    ),
    restSleepTravel: sumIntervalMinutes(
      unionIntervals(byCategory.restSleepTravel),
    ),
  };

  // Unoccupied gaps by subtracting the union of blocking intervals from the viewing window
  const rawGaps = subtractIntervalUnions(windowEpoch, effectiveBlockingSlices);
  const unoccupiedGaps: UnoccupiedTimeGap[] = rawGaps.map((gap) => {
    const startWall = formatInstantInZone(gap.startMs, params.displayZone);
    const endWall = formatInstantInZone(gap.endMs, params.displayZone);
    const isEndMidnightNextDay =
      endWall.localTime === "00:00" && endWall.localDate > startWall.localDate;
    return {
      startInstant: new Date(gap.startMs).toISOString(),
      endInstant: new Date(gap.endMs).toISOString(),
      startMs: gap.startMs,
      endMs: gap.endMs,
      localDate: startWall.localDate,
      startLocalTime: startWall.localTime,
      endLocalTime: isEndMidnightNextDay ? "24:00" : endWall.localTime,
      durationMinutes: Math.round((gap.endMs - gap.startMs) / 60_000),
      descriptionUk: "Незайнятий час за записаними даними",
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
