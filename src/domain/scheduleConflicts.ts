import {
  CalendarEvent,
  EntityId,
  IanaTimeZone,
  IsoInstantString,
  Task,
  TaskReservation,
} from "./types";

import {
  EpochInterval,
  doIntervalsOverlap,
  formatInstantInZone,
} from "./temporal";

import { BlockingOccupancyCategory } from "./availability";

import { getEventEffectiveBlockingSlice } from "./availability";

import { getReservationEffectiveBlockingSlice } from "./availability";

interface ScheduleConflictItem {
  sourceKind: "event" | "reservation";
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

/**
 * Detect overlaps with existing blocking events/shifts/reservations.
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
        sourceKind: "event",
        sourceId: ev.id,
        taskId: null,
        title: ev.title,
        category: slice.category,
        overlapStartInstant: new Date(overlapStartMs).toISOString(),
        overlapEndInstant: new Date(overlapEndMs).toISOString(),
        overlapMinutes: Math.max(
          1,
          Math.round((overlapEndMs - overlapStartMs) / 60_000),
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
        sourceKind: "reservation",
        sourceId: res.id,
        taskId: res.taskId,
        title: slice.title,
        category: "reservations",
        overlapStartInstant: new Date(overlapStartMs).toISOString(),
        overlapEndInstant: new Date(overlapEndMs).toISOString(),
        overlapMinutes: Math.max(
          1,
          Math.round((overlapEndMs - overlapStartMs) / 60_000),
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
    .join(", ");

  return {
    hasConflicts: true,
    conflicts,
    warningMessageUk: `Увага: обраний інтервал перетинається із записаними зобов’язаннями: ${summaryNames}. Підтвердьте свідоме збереження з перетином або змініть час.`,
  };
}
