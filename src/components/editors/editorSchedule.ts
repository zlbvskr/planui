import {
  addDaysToLocalDate,
  buildZonedIntervalFromLocalInput,
  formatInstantInZone,
  resolveLocalDateTimeToInstant,
} from "../../domain/temporal";

import { EventTemporalSchedule, ZonedInterval } from "../../domain/types";

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

export function buildZonedIntervalFromLocalRange(
  startLocalDate: string,
  startLocalTime: string,
  endLocalDate: string,
  endLocalTime: string,
  originZone: string,
): ZonedInterval {
  return buildZonedIntervalFromLocalInput({
    startLocalDate,
    startLocalTime,
    endLocalDate,
    endLocalTime,
    originZone,
  }).interval;
}

export function buildAllDaySchedule(
  startLocalDate: string,
  endLocalDateInclusive: string,
  originZone: string,
): EventTemporalSchedule {
  return {
    kind: "all_day",
    startLocalDate,
    endLocalDateExclusive: addDaysToLocalDate(endLocalDateInclusive, 1),
    originZone,
  };
}
