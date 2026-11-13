import { detectScheduleConflicts } from "../../domain/scheduleConflicts";

import {
  buildZonedIntervalFromLocalInput,
  formatInstantInZone,
  resolveLocalDateTimeToInstant,
} from "../../domain/temporal";

import type { ZonedInterval } from "../../domain/types";

import { CalendarEvent, Task, TaskReservation } from "../../domain/types";

export function buildZonedIntervalFromStartAndDuration(
  localDate: string,
  startHm: string,
  durationMinutes: number,
  zone: string,
): ZonedInterval {
  const startRes = resolveLocalDateTimeToInstant(localDate, startHm, zone);
  const endWall = formatInstantInZone(
    startRes.epochMs + Math.max(5, durationMinutes) * 60_000,
    zone,
  );
  return buildZonedIntervalFromLocalInput({
    startLocalDate: localDate,
    startLocalTime: startHm,
    endLocalDate: endWall.localDate,
    endLocalTime: endWall.localTime,
    originZone: zone,
  }).interval;
}

export function localDateAndTimeToInstant(
  localDate: string,
  localTime: string,
  zone: string,
): string {
  return resolveLocalDateTimeToInstant(localDate, localTime, zone).instant;
}

export function detectTimeConflicts(
  interval: ZonedInterval,
  events: readonly CalendarEvent[],
  reservations: readonly TaskReservation[],
  excludeReservationId?: string,
  tasks: readonly Task[] = [],
) {
  return detectScheduleConflicts({
    candidateStartInstant: interval.startInstant,
    candidateEndInstant: interval.endInstant,
    displayZone: interval.originZone,
    events,
    reservations,
    tasks,
    excludeReservationId,
  });
}

const UK_SHORT_WEEKDAYS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

const UK_GENITIVE_MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

export /**
 * Formats a session summary like "Чт, 5 листопада · 09:00-09:30" (no seconds).
 */
function formatSessionSummaryUk(
  localDate: string,
  startTime: string,
  durationMinutes: number,
  zone: string,
): string {
  const [y, m, d] = localDate.split("-").map(Number);
  if (!y || !m || !d) return `${localDate} · ${startTime}`;
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = UK_SHORT_WEEKDAYS[utcDate.getUTCDay()] ?? "";
  const monthName = UK_GENITIVE_MONTHS[(m - 1) % 12] ?? "";
  const safeStart = (startTime || "09:00").slice(0, 5);
  try {
    const interval = buildZonedIntervalFromStartAndDuration(
      localDate,
      safeStart,
      Math.max(5, durationMinutes || 30),
      zone,
    );
    const endHm = interval.originEndLocalTime.slice(0, 5);
    return `${weekday}, ${d} ${monthName} · ${safeStart}-${endHm}`;
  } catch {
    return `${weekday}, ${d} ${monthName} · ${safeStart}`;
  }
}

export interface FreeWindowSlot {
  startTime: string;
  endTime: string;
  label: string;
}

export /**
 * Computes up to 5 free time windows on `localDate` of at least `durationMinutes`.
 */
function computeFreeWindowsForDay(
  localDate: string,
  zone: string,
  durationMinutes: number,
  events: readonly CalendarEvent[],
  reservations: readonly TaskReservation[],
  excludeId?: string,
): FreeWindowSlot[] {
  const dur = Math.max(15, durationMinutes || 30);
  const candidates = [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
  ];
  const results: FreeWindowSlot[] = [];
  for (const startHm of candidates) {
    try {
      const interval = buildZonedIntervalFromStartAndDuration(
        localDate,
        startHm,
        dur,
        zone,
      );
      const conflict = detectTimeConflicts(
        interval,
        events,
        reservations,
        excludeId,
      );
      if (!conflict.hasConflicts) {
        const endHm = interval.originEndLocalTime.slice(0, 5);
        results.push({
          startTime: startHm,
          endTime: endHm,
          label: `${startHm}–${endHm}`,
        });
        if (results.length >= 4) break;
      }
    } catch {}
  }
  return results;
}
