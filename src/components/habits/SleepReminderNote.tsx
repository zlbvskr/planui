import React from "react";
import type { CalendarEvent } from "../../domain/types";
import { resolveLocalDateTimeToInstant } from "../../domain/temporal";
export function reminderFallsInSleep(
  reminder: string,
  date: string,
  zone: string,
  events: readonly CalendarEvent[],
): boolean {
  const time = reminder.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/)?.[0];
  if (!time || !date) return false;
  try {
    const candidate = resolveLocalDateTimeToInstant(date, time, zone).instant;
    return events.some(
      (e) =>
        e.state === "active" &&
        e.type === "sleep" &&
        (e.schedule.kind === "timed"
          ? e.schedule.interval.startInstant <= candidate &&
            e.schedule.interval.endInstant > candidate
          : e.schedule.startLocalDate <= date &&
            e.schedule.endLocalDateExclusive > date),
    );
  } catch {
    return false;
  }
}
export function SleepReminderNote({
  reminder,
  date,
  zone,
  events,
}: {
  reminder: string;
  date: string;
  zone: string;
  events: readonly CalendarEvent[];
}) {
  return reminderFallsInSleep(reminder, date, zone, events) ? (
    <p role="note" className="review-amber">
      Нагадування потрапляє у ваш блок сну.
    </p>
  ) : null;
}
