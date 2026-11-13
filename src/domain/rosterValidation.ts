import { PlanuiError } from "../i18n/errorsUk";

import {
  assertValidIanaZone,
  assertValidIsoInstant,
  assertValidLocalDate,
  assertValidLocalTime,
  compareLocalDates,
  validateZonedInterval,
} from "./temporal";

import { CalendarEvent, DayOffAnnotation, ShiftTemplate } from "./types";

import { assertNonEmptyString } from "./validationInputs";

import { assertPositiveRevision } from "./validationInputs";

export function validateCalendarEventRecord(
  event: CalendarEvent,
): CalendarEvent {
  assertNonEmptyString(event.id, "INVALID_ID");
  assertNonEmptyString(event.title, "REQUIRED_TITLE");

  if (
    !["personal", "work_shift", "rest", "sleep", "travel"].includes(
      event.type,
    ) ||
    !["brand", "work", "dayoff", "personal", "reservation", "rest"].includes(
      event.color,
    ) ||
    !["active", "canceled"].includes(event.state) ||
    typeof event.isBlocking !== "boolean"
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (event.workProperties !== null) {
    assertNonEmptyString(event.workProperties.shiftName);
    if (
      event.workProperties.shiftCode !== null &&
      typeof event.workProperties.shiftCode !== "string"
    )
      throw new PlanuiError("VALIDATION_FAILED");
    if (event.workProperties.sourceTemplateId !== null)
      assertNonEmptyString(event.workProperties.sourceTemplateId, "INVALID_ID");
  }
  if (event.schedule.kind === "timed") {
    validateZonedInterval(event.schedule.interval);
    if (
      event.type === "work_shift" &&
      event.schedule.interval.originStartLocalTime ===
        event.schedule.interval.originEndLocalTime &&
      event.schedule.interval.originStartLocalDate ===
        event.schedule.interval.originEndLocalDate
    ) {
      throw new PlanuiError("EQUAL_SHIFT_CLOCKS_AMBIGUOUS", event.id);
    }
  } else if (event.schedule.kind === "all_day") {
    assertValidLocalDate(event.schedule.startLocalDate);
    assertValidLocalDate(event.schedule.endLocalDateExclusive);
    assertValidIanaZone(event.schedule.originZone);
    if (
      compareLocalDates(
        event.schedule.endLocalDateExclusive,
        event.schedule.startLocalDate,
      ) <= 0
    ) {
      throw new PlanuiError("INVALID_HALF_OPEN_INTERVAL", event.id);
    }
  } else {
    throw new PlanuiError("VALIDATION_FAILED", "event.schedule");
  }

  if (event.type === "work_shift" && !event.workProperties) {
    throw new PlanuiError("VALIDATION_FAILED", "workProperties required");
  }

  assertValidIsoInstant(event.createdAt);
  assertValidIsoInstant(event.updatedAt);
  assertPositiveRevision(event.revision);
  return event;
}

export function validateShiftTemplateRecord(tpl: ShiftTemplate): ShiftTemplate {
  assertNonEmptyString(tpl.id, "INVALID_ID");
  assertNonEmptyString(tpl.name, "REQUIRED_TITLE");
  const start = tpl.start || tpl.startLocalTime || "08:00";
  const end = tpl.end || tpl.endLocalTime || "20:00";
  tpl.start = start;
  tpl.end = end;
  if (!tpl.kind) {
    tpl.kind =
      end < start || parseInt(start.slice(0, 2), 10) >= 18 ? "night" : "day";
  }
  if (!tpl.code) {
    tpl.code = tpl.name.slice(0, 2).toUpperCase();
  }
  if (!tpl.startLocalTime) tpl.startLocalTime = start;
  if (!tpl.endLocalTime) tpl.endLocalTime = end;
  if (tpl.endDateOffsetDays === undefined) {
    tpl.endDateOffsetDays = end <= start ? 1 : 0;
  }
  assertValidLocalTime(tpl.startLocalTime);
  assertValidLocalTime(tpl.endLocalTime);
  if (tpl.startLocalTime === tpl.endLocalTime && tpl.endDateOffsetDays === 0) {
    throw new PlanuiError("EQUAL_SHIFT_CLOCKS_AMBIGUOUS", tpl.id);
  }
  assertValidIsoInstant(tpl.createdAt);
  assertValidIsoInstant(tpl.updatedAt);
  assertPositiveRevision(tpl.revision);
  return tpl;
}

export function validateDayOffAnnotationRecord(
  ann: DayOffAnnotation,
): DayOffAnnotation {
  assertNonEmptyString(ann.id, "INVALID_ID");
  assertValidLocalDate(ann.localDate);
  assertValidIanaZone(ann.sourceZone);
  assertValidIsoInstant(ann.createdAt);
  assertValidIsoInstant(ann.updatedAt);
  assertPositiveRevision(ann.revision);
  return ann;
}
