import { PlanuiError } from "../i18n/errorsUk";

import { assertValidIsoInstant, assertValidLocalDate } from "./temporal";

import { Habit, HabitEntry } from "./types";

import { assertNonEmptyString } from "./validationInputs";

import { assertPositiveRevision } from "./validationInputs";

function validateHabitRuleSnapshot(
  rev: import("./types").HabitRuleRevision,
): void {
  if (
    !rev ||
    typeof rev !== "object" ||
    !rev.rule ||
    typeof rev.rule !== "object" ||
    !rev.target ||
    typeof rev.target !== "object"
  )
    throw new PlanuiError("HABIT_INVALID_RULE");
  assertNonEmptyString(rev.id, "INVALID_ID");
  assertValidLocalDate(rev.effectiveFromLocalDate);
  assertValidIsoInstant(rev.createdAt);
  if (rev.rule.kind === "selected_weekdays") {
    if (
      !Array.isArray(rev.rule.weekdaysIso) ||
      rev.rule.weekdaysIso.length === 0 ||
      rev.rule.weekdaysIso.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
    ) {
      throw new PlanuiError("HABIT_INVALID_RULE", rev.id);
    }
  } else if (rev.rule.kind === "weekly_frequency") {
    if (
      !Number.isInteger(rev.rule.timesPerWeek) ||
      rev.rule.timesPerWeek < 1 ||
      rev.rule.timesPerWeek > 7
    ) {
      throw new PlanuiError("HABIT_INVALID_RULE", rev.id);
    }
  } else if (rev.rule.kind !== "daily" && rev.rule.kind !== "days_off") {
    throw new PlanuiError("HABIT_INVALID_RULE", rev.id);
  }

  if (rev.target.kind === "numeric") {
    if (
      typeof rev.target.targetValue !== "number" ||
      !Number.isFinite(rev.target.targetValue) ||
      rev.target.targetValue <= 0 ||
      typeof rev.target.unitUk !== "string" ||
      rev.target.unitUk.trim().length === 0
    ) {
      throw new PlanuiError("HABIT_INVALID_NUMERIC_TARGET", rev.id);
    }
  } else if (rev.target.kind !== "binary") {
    throw new PlanuiError("HABIT_INVALID_RULE", rev.id);
  }
}

export function validateHabitRecord(habit: Habit): Habit {
  assertNonEmptyString(habit.id, "INVALID_ID");
  assertNonEmptyString(habit.name, "REQUIRED_TITLE");
  for (const text of [
    habit.minimumVersionUk,
    habit.contextCueUk,
    habit.reminderIntentionUk,
  ])
    if (text != null && typeof text !== "string")
      throw new PlanuiError("VALIDATION_FAILED");
  if (habit.folderId != null) {
    assertNonEmptyString(habit.folderId, "INVALID_ID");
    if (habit.projectId) throw new PlanuiError("VALIDATION_FAILED");
  }
  if (
    new Set(habit.ruleRevisions.map((r) => r.id)).size !==
    habit.ruleRevisions.length
  )
    throw new PlanuiError("HABIT_INVALID_RULE");
  if (
    habit.state !== "active" &&
    habit.state !== "paused" &&
    habit.state !== "archived"
  ) {
    throw new PlanuiError("VALIDATION_FAILED", "habit.state");
  }
  if (habit.ruleRevisions.length === 0) {
    throw new PlanuiError("HABIT_INVALID_RULE", habit.id);
  }
  for (const rev of habit.ruleRevisions) validateHabitRuleSnapshot(rev);
  assertValidIsoInstant(habit.createdAt);
  assertValidIsoInstant(habit.updatedAt);
  assertPositiveRevision(habit.revision);
  return habit;
}

export function validateHabitEntryRecord(
  entry: HabitEntry,
  habitIds?: ReadonlySet<string>,
): HabitEntry {
  assertNonEmptyString(entry.id, "INVALID_ID");
  assertNonEmptyString(entry.habitId, "INVALID_ID");
  if (habitIds && !habitIds.has(entry.habitId)) {
    throw new PlanuiError("HABIT_NOT_FOUND", entry.habitId);
  }
  assertValidLocalDate(entry.localDate);
  if (entry.ruleSnapshot !== undefined)
    validateHabitRuleSnapshot(entry.ruleSnapshot);
  if (
    entry.dayOffSnapshot !== undefined &&
    typeof entry.dayOffSnapshot !== "boolean"
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    entry.minimumCompletedUk != null &&
    (typeof entry.minimumCompletedUk !== "string" ||
      !entry.minimumCompletedUk.trim() ||
      entry.status !== "partial")
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (entry.status === "no_entry" && entry.numericValue != null)
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    entry.status !== "completed" &&
    entry.status !== "partial" &&
    entry.status !== "skipped" &&
    entry.status !== "no_entry"
  ) {
    throw new PlanuiError("VALIDATION_FAILED", "habitEntry.status");
  }
  if (entry.numericValue !== null && entry.numericValue !== undefined) {
    if (
      typeof entry.numericValue !== "number" ||
      !Number.isFinite(entry.numericValue) ||
      entry.numericValue < 0
    ) {
      throw new PlanuiError("HABIT_INVALID_NUMERIC_ENTRY", entry.id);
    }
  }
  assertValidIsoInstant(entry.recordedAt);
  assertValidIsoInstant(entry.updatedAt);
  assertPositiveRevision(entry.revision);
  return entry;
}
