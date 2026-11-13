import { EntityId, Habit, HabitEntry, HabitEntryStatus, HabitFrequencyRule, HabitRuleRevision, IsoInstantString, LocalDateString } from './types';
import { addDaysToLocalDate, buildWeekDates, compareLocalDates, getMondayFirstWeekdayIndex, getMondayOfWeek } from './temporal';
import { PlanuiError } from '../i18n/errorsUk';

/**
 * 9.2 / 9.3 / C14: Distinct date states for a habit on an explicit local date.
 * - 'completed': completed entry exists on this date
 * - 'partial': partial entry exists on this date
 * - 'skipped': intentionally skipped entry exists on this date (skip is NOT completion)
 * - 'no_entry': scheduled/eligible on this date, active, and no entry recorded yet
 * - 'not_scheduled': not scheduled on this date under the effective rule revision (or weekly quota already satisfied on other days of the week)
 * - 'paused': habit is paused and has no recorded entry on this date
 */
type HabitDateCellStatus =
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'no_entry'
  | 'not_scheduled'
  | 'paused';

export const UKRAINIAN_WEEKDAY_SHORT_BY_ISO: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Нд',
};

export const ISO_WEEKDAYS_UK: readonly { iso: number; shortUk: string }[] = [
  { iso: 1, shortUk: 'Пн' },
  { iso: 2, shortUk: 'Вт' },
  { iso: 3, shortUk: 'Ср' },
  { iso: 4, shortUk: 'Чт' },
  { iso: 5, shortUk: 'Пт' },
  { iso: 6, shortUk: 'Сб' },
  { iso: 7, shortUk: 'Нд' },
];

export interface HabitDayEvaluation {
  habitId: EntityId;
  localDate: LocalDateString;
  weekdayIso: number; // 1 (Mon) .. 7 (Sun)
  effectiveRevision: HabitRuleRevision;
  entry: HabitEntry | null;
  cellStatus: HabitDateCellStatus;
  isScheduledOpportunity: boolean;
  numericValue: number | null;
  targetValue: number | null;
  unitUk: string | null;
  numericProgressRatio: number; // 0..1
  statusLabelUk: string;
  compactBadgeUk: string;
  nonColorSymbol: string;
}

interface HabitWeekProgressSummary {
  weekStartMonday: LocalDateString;
  weekEndSunday: LocalDateString;
  days: HabitDayEvaluation[];
  completedCount: number;
  partialCount: number;
  skippedCount: number;
  scheduledTargetCount: number;
  isWeeklyTargetMet: boolean;
  summaryTextUk: string;
}


export interface HabitStreakSummary {
  kind: 'scheduled_days_streak' | 'weekly_target_streak';
  currentCount: number;
  unitLabelUk: string;
  explanationUk: string;
}

/**
 * Sorts habit rule revisions ascending by effectiveFromLocalDate (and createdAt tie-breaker).
 */
export function sortHabitRuleRevisions(
  revisions: readonly HabitRuleRevision[]
): HabitRuleRevision[] {
  return [...revisions].sort((a, b) => {
    const cmp = compareLocalDates(
      a.effectiveFromLocalDate,
      b.effectiveFromLocalDate
    );
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * 9.3 / C14: Resolves the effective schedule rule revision for a specific localDate.
 * Never rewrites historical dates under a newer rule whose effectiveFromLocalDate is after localDate.
 * If localDate precedes the earliest revision's effectiveFromLocalDate (e.g. previous-day night-shift entry),
 * falls back deterministically to the earliest revision.
 */
export function getEffectiveHabitRuleRevisionForDate(
  habit: Habit,
  localDate: LocalDateString
): HabitRuleRevision {
  if (!habit.ruleRevisions || habit.ruleRevisions.length === 0) {
    throw new PlanuiError('HABIT_INVALID_RULE', habit.id);
  }
  const sorted = sortHabitRuleRevisions(habit.ruleRevisions);
  let chosen = sorted[0];
  for (const rev of sorted) {
    if (compareLocalDates(rev.effectiveFromLocalDate, localDate) <= 0) {
      chosen = rev;
    } else {
      break;
    }
  }
  return chosen;
}

/**
 * 9.3 / C14: Appends an immutable effective-dated rule revision (later appended revisions win equal-date/equal-time ties)
 * without mutating earlier revisions that govern historical dates.
 */
export function appendEffectiveHabitRuleRevision(
  existingRevisions: readonly HabitRuleRevision[],
  nextRevision: HabitRuleRevision
): HabitRuleRevision[] {
  const existing = existingRevisions.find(rev => rev.id === nextRevision.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(nextRevision)) throw new PlanuiError('HABIT_INVALID_RULE');
    return sortHabitRuleRevisions(existingRevisions);
  }
  return sortHabitRuleRevisions([...existingRevisions, nextRevision]);
}

/**
 * Returns ISO weekday (1 = Monday .. 7 = Sunday) for a YYYY-MM-DD local date.
 */
function getIsoWeekdayForLocalDate(localDate: LocalDateString): number {
  return getMondayFirstWeekdayIndex(localDate) + 1;
}

/**
 * 9.2: Helper for easy previous-date recording after night work.
 */
export function getPreviousLocalDateForNightShift(
  selectedDate: LocalDateString
): LocalDateString {
  return addDaysToLocalDate(selectedDate, -1);
}

/**
 * Checks whether a rule schedules the habit on the given localDate.
 * For 'weekly_frequency', any weekday is eligible unless the weekly target has already been met on other days of the same week.
 */
function isRuleScheduledOnWeekday(
  rule: HabitFrequencyRule,
  localDate: LocalDateString,
  daysOff: readonly LocalDateString[] = []
): boolean {
  if (rule.kind === 'days_off') return daysOff.includes(localDate);
  if (rule.kind === 'daily') {
    return true;
  }
  if (rule.kind === 'selected_weekdays') {
    const weekdayIso = getIsoWeekdayForLocalDate(localDate);
    return rule.weekdaysIso.includes(weekdayIso);
  }
  // weekly_frequency: eligible on any day of the week
  return true;
}

/**
 * Builds an index of HabitEntry by localDate for a single habit.
 */
function indexHabitEntriesByDate(
  entries: readonly HabitEntry[],
  habitId: EntityId
): Map<LocalDateString, HabitEntry> {
  const map = new Map<LocalDateString, HabitEntry>();
  for (const e of entries) {
    if (e.habitId === habitId) {
      map.set(e.localDate, e);
    }
  }
  return map;
}

/**
 * 9.2 / 9.3: Evaluates a habit on a single localDate taking into account effective-dated rule revisions,
 * weekly frequency satisfaction across the Monday–Sunday week, and habit lifecycle state.
 */
export function evaluateHabitOnDate(params: {
  habit: Habit;
  entriesForHabit: ReadonlyMap<LocalDateString, HabitEntry> | readonly HabitEntry[];
  localDate: LocalDateString;
  daysOff?: readonly LocalDateString[];
}): HabitDayEvaluation {
  const { habit, localDate } = params;
  const entryMap =
    params.entriesForHabit instanceof Map
      ? (params.entriesForHabit as ReadonlyMap<LocalDateString, HabitEntry>)
      : indexHabitEntriesByDate(
          params.entriesForHabit as readonly HabitEntry[],
          habit.id
        );

  const effectiveRevision = (entryMap.get(localDate)?.status !== 'no_entry' ? entryMap.get(localDate)?.ruleSnapshot : undefined) ?? getEffectiveHabitRuleRevisionForDate(
    habit,
    localDate
  );
  const { rule, target } = effectiveRevision;
  const weekdayIso = getIsoWeekdayForLocalDate(localDate);
  const entry = entryMap.get(localDate) ?? null;

  const targetValue = target.kind === 'numeric' ? target.targetValue : null;
  const unitUk = target.kind === 'numeric' ? target.unitUk : null;
  const numericValue = entry?.numericValue ?? null;

  // Determine whether this date is a scheduled opportunity
  let isScheduledOpportunity = isRuleScheduledOnWeekday(rule, localDate, entry?.status !== 'no_entry' && entry?.dayOffSnapshot !== undefined ? (entry.dayOffSnapshot ? [localDate] : []) : params.daysOff);

  if (rule.kind === 'weekly_frequency' && (!entry || entry.status === 'no_entry')) {
    // Check if the weekly quota (rule.timesPerWeek) is already satisfied by completed entries in the same Monday-Sunday week
    const weekDates = buildWeekDates(localDate);
    let completedInWeek = 0;
    for (const wd of weekDates) {
      const we = entryMap.get(wd);
      if (we?.status === 'completed') {
        completedInWeek++;
      }
    }
    if (completedInWeek >= rule.timesPerWeek) {
      isScheduledOpportunity = false;
    }
  }

  let cellStatus: HabitDateCellStatus;
  if (entry && entry.status !== 'no_entry') {
    // 9.3: Pause/archive preserve entries
    cellStatus = entry.status;
  } else if (habit.state === 'paused') {
    cellStatus = 'paused';
  } else if (!isScheduledOpportunity) {
    cellStatus = 'not_scheduled';
  } else {
    cellStatus = 'no_entry';
  }

  let numericProgressRatio = 0;
  if (cellStatus === 'completed') {
    numericProgressRatio = 1;
  } else if (
    cellStatus === 'partial' &&
    targetValue !== null &&
    targetValue > 0 &&
    numericValue !== null
  ) {
    numericProgressRatio = Math.min(
      1,
      Math.max(0, numericValue / targetValue)
    );
  }

  let statusLabelUk: string;
  let compactBadgeUk: string;
  let nonColorSymbol: string;

  switch (cellStatus) {
    case 'completed':
      nonColorSymbol = '✓';
      if (target.kind === 'numeric' && numericValue !== null) {
        statusLabelUk = `Виконано (${numericValue}/${target.targetValue} ${target.unitUk})`;
        compactBadgeUk = `${numericValue}/${target.targetValue} ${target.unitUk}`;
      } else {
        statusLabelUk = 'Виконано';
        compactBadgeUk = 'Виконано';
      }
      break;
    case 'partial':
      nonColorSymbol = '◐';
      if (target.kind === 'numeric' && numericValue !== null) {
        statusLabelUk = `Частково (${numericValue}/${target.targetValue} ${target.unitUk})`;
        compactBadgeUk = `${numericValue}/${target.targetValue} ${target.unitUk}`;
      } else {
        statusLabelUk = 'Частково';
        compactBadgeUk = 'Частково';
      }
      break;
    case 'skipped':
      nonColorSymbol = '↷';
      statusLabelUk = 'Свідомо пропущено';
      compactBadgeUk = 'Пропущено';
      break;
    case 'paused':
      nonColorSymbol = '⏸';
      statusLabelUk = 'На паузі';
      compactBadgeUk = 'Пауза';
      break;
    case 'not_scheduled':
      nonColorSymbol = '·';
      statusLabelUk = 'Поза розкладом правила';
      compactBadgeUk = 'Поза розкладом';
      break;
    case 'no_entry':
    default:
      nonColorSymbol = '○';
      if (target.kind === 'numeric') {
        statusLabelUk = `Без відмітки (0/${target.targetValue} ${target.unitUk})`;
        compactBadgeUk = `0/${target.targetValue} ${target.unitUk}`;
      } else {
        statusLabelUk = 'Без відмітки';
        compactBadgeUk = 'Без відмітки';
      }
      break;
  }

  return {
    habitId: habit.id,
    localDate,
    weekdayIso,
    effectiveRevision,
    entry,
    cellStatus,
    isScheduledOpportunity,
    numericValue,
    targetValue,
    unitUk,
    numericProgressRatio,
    statusLabelUk,
    compactBadgeUk,
    nonColorSymbol,
  };
}

/**
 * 9.3: Computes weekly (Monday-first 7-day) progress for a habit around referenceDate.
 */
function computeHabitWeekProgress(
  habit: Habit,
  entries: readonly HabitEntry[],
  referenceDate: LocalDateString,
  daysOff: readonly LocalDateString[] = []
): HabitWeekProgressSummary {
  const entryMap = indexHabitEntriesByDate(entries, habit.id);
  const weekDates = buildWeekDates(referenceDate);
  const weekStartMonday = weekDates[0];
  const weekEndSunday = weekDates[6];

  const days = weekDates.map((d) =>
    evaluateHabitOnDate({ habit, entriesForHabit: entryMap, localDate: d, daysOff })
  );

  let completedCount = 0;
  let partialCount = 0;
  let skippedCount = 0;

  for (const day of days) {
    if (day.cellStatus === 'completed') completedCount++;
    else if (day.cellStatus === 'partial') partialCount++;
    else if (day.cellStatus === 'skipped') skippedCount++;
  }

  const refRev = getEffectiveHabitRuleRevisionForDate(habit, referenceDate);
  let scheduledTargetCount: number;
  if (refRev.rule.kind === 'weekly_frequency') {
    scheduledTargetCount = refRev.rule.timesPerWeek;
  } else {
    scheduledTargetCount = days.filter((d) =>
      d.isScheduledOpportunity
    ).length;
  }

  const isWeeklyTargetMet =
    scheduledTargetCount > 0 && completedCount >= scheduledTargetCount;

  const partialSuffix =
    partialCount > 0 ? `, частково: ${partialCount}` : '';
  const skippedSuffix =
    skippedCount > 0 ? `, пропущено: ${skippedCount}` : '';

  const summaryTextUk =
    refRev.rule.kind === 'weekly_frequency'
      ? `Тиждень: виконано ${completedCount} із ${scheduledTargetCount} разів${partialSuffix}${skippedSuffix}`
      : `Тиждень: виконано ${completedCount} із ${scheduledTargetCount} запланованих днів${partialSuffix}${skippedSuffix}`;

  return {
    weekStartMonday,
    weekEndSunday,
    days,
    completedCount,
    partialCount,
    skippedCount,
    scheduledTargetCount,
    isWeeklyTargetMet,
    summaryTextUk,
  };
}

/**
 * 9.3 / C14: Computes a transparent, rule-appropriate streak summary.
 * - For 'weekly_frequency' rules: NEVER invents a daily streak. Counts consecutive Monday–Sunday weeks
 *   where the weekly target was met.
 * - For 'daily' and 'selected_weekdays' rules: Counts consecutive scheduled days with 'completed' entries.
 *   Unscheduled dates ('not_scheduled'), paused state, and intentional skips ('skipped') do not break the streak
 *   and do not increment the completed count.
 */
export function computeHabitStreakSummary(
  habit: Habit,
  entries: readonly HabitEntry[],
  referenceDate: LocalDateString,
  daysOff: readonly LocalDateString[] = []
): HabitStreakSummary {
  const entryMap = indexHabitEntriesByDate(entries, habit.id);
  const currentRevision = getEffectiveHabitRuleRevisionForDate(
    habit,
    referenceDate
  );

  if (currentRevision.rule.kind === 'weekly_frequency') {
    const currentWeekMonday = getMondayOfWeek(referenceDate);
    let consecutiveWeeks = 0;

    // Check up to 52 weeks backward
    for (let w = 0; w < 52; w++) {
      const weekMonday = addDaysToLocalDate(currentWeekMonday, -7 * w);
      const weekProgress = computeHabitWeekProgress(habit, entries, weekMonday, daysOff);

      if (weekProgress.isWeeklyTargetMet) {
        consecutiveWeeks++;
      } else if (w === 0) {
        // Current week is still in progress and not yet completed; continue checking prior week
        continue;
      } else {
        break;
      }
    }

    const unitLabelUk =
      consecutiveWeeks === 1
        ? 'тиждень поспіль'
        : consecutiveWeeks >= 2 && consecutiveWeeks <= 4
        ? 'тижні поспіль'
        : 'тижнів поспіль';

    return {
      kind: 'weekly_target_streak',
      currentCount: consecutiveWeeks,
      unitLabelUk,
      explanationUk: `Для тижневої частоти серія рахується за виконаними тижнями (${currentRevision.rule.timesPerWeek}/тиж.), без штучної щоденної серії.`,
    };
  }

  // Daily or selected_weekdays: count consecutive completed scheduled opportunities
  let streakCount = 0;

  // Determine earliest date to scan (earliest revision date or earliest entry date)
  let earliestBoundDate = referenceDate;
  for (const rev of habit.ruleRevisions) {
    if (compareLocalDates(rev.effectiveFromLocalDate, earliestBoundDate) < 0) {
      earliestBoundDate = rev.effectiveFromLocalDate;
    }
  }
  for (const entry of entryMap.values()) {
    if (compareLocalDates(entry.localDate, earliestBoundDate) < 0) {
      earliestBoundDate = entry.localDate;
    }
  }

  for (let offset = 0; offset <= 366; offset++) {
    const d = addDaysToLocalDate(referenceDate, -offset);
    if (compareLocalDates(d, earliestBoundDate) < 0) {
      break;
    }

    const evalDay = evaluateHabitOnDate({
      habit,
      entriesForHabit: entryMap,
      localDate: d, daysOff,
    });

    if (evalDay.cellStatus === 'completed') {
      streakCount++;
      continue;
    }

    if (
      evalDay.cellStatus === 'not_scheduled' ||
      evalDay.cellStatus === 'paused' ||
      evalDay.cellStatus === 'skipped'
    ) {
      // Unscheduled, paused, or intentionally skipped dates are not failed opportunities
      continue;
    }

    // cellStatus is 'no_entry' or 'partial' on a scheduled date:
    if (offset === 0 && evalDay.cellStatus === 'no_entry') {
      // Reference date (e.g. today) is not yet marked; do not penalize prior streak
      continue;
    }

    // Streak ends at this uncompleted scheduled date
    break;
  }

  const unitLabelUk =
    streakCount === 1
      ? 'запланований день'
      : streakCount >= 2 && streakCount <= 4
      ? 'заплановані дні'
      : 'запланованих днів';

  return {
    kind: 'scheduled_days_streak',
    currentCount: streakCount,
    unitLabelUk,
    explanationUk:
      'Серія враховує виконані заплановані дні за чинним правилом. Дні поза розкладом, пауза та свідомий пропуск не вважаються помилкою.',
  };
}

/**
 * 9.2: Resolves the next HabitEntry state for a user recording mutation on (habit, localDate).
 * Returns either `{ mode: 'save', entry: HabitEntry }` or `{ mode: 'delete', existingEntryId: EntityId }`.
 */
export type HabitRecordingInput =
  | { kind: 'toggle_complete' }
  | { kind: 'complete' }
  | { kind: 'minimum' }
  | { kind: 'skip' }
  | { kind: 'clear' }
  | { kind: 'set_numeric'; numericValue: number; note?: string | null }
  | { kind: 'add_numeric_delta'; delta: number };

export function resolveHabitEntryMutation(params: {
  habit: Habit;
  existingEntry: HabitEntry | null;
  localDate: LocalDateString;
  input: HabitRecordingInput;
  nowIso: IsoInstantString;
  entryId?: EntityId;
}):
  | { action: 'upsert'; entry: HabitEntry }
  | { action: 'delete'; entryId: EntityId }
  | { action: 'noop' } {
  const { habit, existingEntry, localDate, input, nowIso } = params;
  const effectiveRevision = (existingEntry?.status !== 'no_entry' ? existingEntry?.ruleSnapshot : undefined) ?? getEffectiveHabitRuleRevisionForDate(
    habit,
    localDate
  );
  const { target } = effectiveRevision;

  const entryId =
    existingEntry?.id ??
    params.entryId ??
    `hentry_${habit.id}_${localDate}`;
  const recordedAt = existingEntry?.recordedAt ?? nowIso;
  const nextRevision = existingEntry ? existingEntry.revision + 1 : 1;

  if (input.kind === 'clear') {
    if (!existingEntry) return { action: 'noop' };
    return { action: 'delete', entryId: existingEntry.id };
  }

  if (input.kind === 'minimum') {
    if (!habit.minimumVersionUk?.trim()) throw new PlanuiError('VALIDATION_FAILED');
    return { action: 'upsert', entry: { id: entryId, habitId: habit.id, localDate, status: 'partial', numericValue: existingEntry?.numericValue ?? null, note: existingEntry?.note ?? null, minimumCompletedUk: habit.minimumVersionUk, recordedAt, updatedAt: nowIso, revision: nextRevision } };
  }
  if (input.kind === 'skip') {
    const skippedEntry: HabitEntry = {
      id: entryId,
      habitId: habit.id,
      localDate,
      status: 'skipped',
      numericValue: null,
      note: existingEntry?.note ?? null,
      recordedAt,
      updatedAt: nowIso,
      revision: nextRevision,
    };
    return { action: 'upsert', entry: skippedEntry };
  }

  if (input.kind === 'toggle_complete') {
    if (existingEntry?.status === 'completed') {
      return { action: 'delete', entryId: existingEntry.id };
    }
    const completedValue =
      target.kind === 'numeric' ? target.targetValue : null;
    return {
      action: 'upsert',
      entry: {
        id: entryId,
        habitId: habit.id,
        localDate,
        status: 'completed',
        numericValue: completedValue,
        note: existingEntry?.note ?? null,
        recordedAt,
        updatedAt: nowIso,
        revision: nextRevision,
      },
    };
  }

  if (input.kind === 'complete') {
    const completedValue =
      target.kind === 'numeric' ? target.targetValue : null;
    return {
      action: 'upsert',
      entry: {
        id: entryId,
        habitId: habit.id,
        localDate,
        status: 'completed',
        numericValue: completedValue,
        note: existingEntry?.note ?? null,
        recordedAt,
        updatedAt: nowIso,
        revision: nextRevision,
      },
    };
  }

  if (input.kind === 'set_numeric' || input.kind === 'add_numeric_delta') {
    const rawValue =
      input.kind === 'set_numeric'
        ? input.numericValue
        : (existingEntry?.numericValue ?? 0) + input.delta;

    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue < 0) {
      throw new PlanuiError('HABIT_INVALID_NUMERIC_ENTRY', String(rawValue));
    }

    const roundedValue = Math.round(rawValue * 100) / 100;

    if (roundedValue === 0) {
      if (!existingEntry) return { action: 'noop' };
      return { action: 'delete', entryId: existingEntry.id };
    }

    const targetThreshold =
      target.kind === 'numeric' ? target.targetValue : 1;
    const status: HabitEntryStatus =
      roundedValue >= targetThreshold ? 'completed' : 'partial';

    return {
      action: 'upsert',
      entry: {
        id: entryId,
        habitId: habit.id,
        localDate,
        status,
        numericValue: roundedValue,
        note:
          input.kind === 'set_numeric' && input.note !== undefined
            ? input.note
            : existingEntry?.note ?? null,
        recordedAt,
        updatedAt: nowIso,
        revision: nextRevision,
      },
    };
  }

  return { action: 'noop' };
}
