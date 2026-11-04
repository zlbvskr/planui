import { PlanuiError } from '../i18n/errorsUk';
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  EventPaletteColor,
  IanaTimeZone,
  IsoInstantString,
  LocalDateString,
  LocalTimeString,
  ShiftTemplate,
  TaskReservation,
} from './types';
import {
  DstDisambiguation,
  EpochInterval,
  addDaysToLocalDate,
  assertValidIanaZone,
  assertValidLocalDate,
  assertValidLocalTime,
  buildZonedIntervalFromLocalInput,
  clipIntervalToWindow,
  compareLocalDates,
  diffCalendarDays,
  doIntervalsOverlap,
  enumerateLocalDatesInclusive,
  getDaysInMonth,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getLocalDateBoundariesInZone,
  getMondayFirstWeekdayIndex,
  parseLocalDateParts,
  parseLocalTimeParts,
  projectIntervalOntoLocalDates,
  resolveAllDayEventOccupancyInterval,
  resolveLocalDateTimeToInstant,
  unionIntervals,
} from './temporal';

export const DAY_OFF_CODES_UPPER = new Set([
  'В',
  'ВИХ',
  'ВИХІДНИЙ',
  'ВИХІДНА',
  'OFF',
  'DO',
  '-',
]);

export type RosterDiagnosticSeverity = 'error' | 'warning' | 'info';

export type RosterDiagnosticCode =
  | 'INVALID_SYNTAX'
  | 'INVALID_CALENDAR_DATE'
  | 'UNKNOWN_TEMPLATE_CODE'
  | 'EQUAL_CLOCKS_AMBIGUOUS'
  | 'DST_GAP_NONEXISTENT_TIME'
  | 'DST_AMBIGUOUS_FOLD_TIME'
  | 'DUPLICATE_IDENTICAL_ROW'
  | 'CONTRADICTORY_SAME_DAY_ANNOTATION'
  | 'EARLIER_END_SUGGESTS_NEXT_DAY'
  | 'MULTIPLE_SHIFTS_SAME_DATE'
  | 'OVERLAP_CONFLICT'
  | 'UNUSUAL_DURATION'
  | 'MIXED_DAY_OFF_WITH_OVERNIGHT_CARRYOVER';

export interface RosterDiagnostic {
  code: RosterDiagnosticCode;
  severity: RosterDiagnosticSeverity;
  messageUk: string;
}

export interface ProposedRosterItem {
  previewKey: string;
  sourceLineNumber?: number;
  rawLineText?: string;
  kind: 'work_shift' | 'day_off' | 'clear_date';
  localDate: LocalDateString;
  endLocalDate: LocalDateString;
  zoneId: IanaTimeZone;
  eventToSave?: CalendarEvent;
  dayOffToSave?: DayOffAnnotation;
  eventIdsToDelete?: EntityId[];
  dayOffIdsToDelete?: EntityId[];
  elapsedDurationMinutes: number;
  clockLabelDurationMinutes: number;
  isOvernight: boolean;
  isAutoNextDaySuggested: boolean;
  diagnostics: RosterDiagnostic[];
  hasBlockingError: boolean;
  hasConflictWarning: boolean;
  isMixedDayOffCarryover: boolean;
  excluded?: boolean;
}

export interface RosterBatchPreview {
  lockedZoneId: IanaTimeZone;
  items: ProposedRosterItem[];
  activeItems: ProposedRosterItem[];
  eventsToSave: CalendarEvent[];
  dayOffAnnotationsToSave: DayOffAnnotation[];
  eventIdsToDelete: EntityId[];
  dayOffAnnotationIdsToDelete: EntityId[];
  totalShiftsToSave: number;
  totalDayOffsToSave: number;
  totalDatesToClear: number;
  totalElapsedMinutes: number;
  blockingErrorCount: number;
  conflictWarningCount: number;
  mixedCarryoverCount: number;
  canCommit: boolean;
  requiresConflictConfirmation: boolean;
  summaryWarningsUk: string[];
}

/**
 * 8.2 Instantiate an independent CalendarEvent (type === 'work_shift') by copying
 * values from a ShiftTemplate. Later template edits or deletions never rewrite existing shifts.
 */
export function instantiateWorkShiftFromTemplate(params: {
  id: EntityId;
  template: ShiftTemplate;
  startLocalDate: LocalDateString;
  zoneId: IanaTimeZone;
  nowIso: IsoInstantString;
  disambiguation?: DstDisambiguation;
  noteOverride?: string | null;
}): {
  event: CalendarEvent;
  elapsedDurationMinutes: number;
  clockLabelDurationMinutes: number;
  dstNoticesUk: string[];
} {
  assertValidLocalDate(params.startLocalDate);
  assertValidIanaZone(params.zoneId);

  const endLocalDate = addDaysToLocalDate(
    params.startLocalDate,
    params.template.endDateOffsetDays
  );

  const built = buildZonedIntervalFromLocalInput({
    startLocalDate: params.startLocalDate,
    startLocalTime: params.template.startLocalTime,
    endLocalDate,
    endLocalTime: params.template.endLocalTime,
    originZone: params.zoneId,
    startDisambiguation: params.disambiguation ?? 'compatible',
    endDisambiguation: params.disambiguation ?? 'compatible',
  });

  const event: CalendarEvent = {
    id: params.id,
    title: params.template.name,
    note:
      params.noteOverride !== undefined
        ? params.noteOverride
        : params.template.note,
    type: 'work_shift',
    color: params.template.color,
    schedule: {
      kind: 'timed',
      interval: built.interval,
    },
    isBlocking: true,
    state: 'active',
    workProperties: {
      shiftName: params.template.name,
      shiftCode: params.template.code,
      sourceTemplateId: params.template.id,
    },
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
    revision: 1,
  };

  return {
    event,
    elapsedDurationMinutes: built.elapsedDurationMinutes,
    clockLabelDurationMinutes: built.clockLabelDurationMinutes,
    dstNoticesUk: built.dstNoticesUk,
  };
}

/**
 * 8.2 Build an independent custom work shift event without requiring a template.
 */
export function buildCustomWorkShiftEvent(params: {
  id: EntityId;
  title: string;
  shiftCode?: string | null;
  startLocalDate: LocalDateString;
  startLocalTime: LocalTimeString;
  endDateOffsetDays: 0 | 1;
  endLocalTime: LocalTimeString;
  zoneId: IanaTimeZone;
  color?: EventPaletteColor;
  note?: string | null;
  nowIso: IsoInstantString;
  disambiguation?: DstDisambiguation;
}): {
  event: CalendarEvent;
  elapsedDurationMinutes: number;
  clockLabelDurationMinutes: number;
  dstNoticesUk: string[];
} {
  assertValidLocalDate(params.startLocalDate);
  assertValidLocalTime(params.startLocalTime);
  assertValidLocalTime(params.endLocalTime);
  assertValidIanaZone(params.zoneId);

  const trimmedTitle = params.title.trim() || 'Робоча зміна';
  const endLocalDate = addDaysToLocalDate(
    params.startLocalDate,
    params.endDateOffsetDays
  );

  const built = buildZonedIntervalFromLocalInput({
    startLocalDate: params.startLocalDate,
    startLocalTime: params.startLocalTime,
    endLocalDate,
    endLocalTime: params.endLocalTime,
    originZone: params.zoneId,
    startDisambiguation: params.disambiguation ?? 'compatible',
    endDisambiguation: params.disambiguation ?? 'compatible',
  });

  const event: CalendarEvent = {
    id: params.id,
    title: trimmedTitle,
    note: params.note ?? null,
    type: 'work_shift',
    color: params.color ?? 'work',
    schedule: {
      kind: 'timed',
      interval: built.interval,
    },
    isBlocking: true,
    state: 'active',
    workProperties: {
      shiftName: trimmedTitle,
      shiftCode: params.shiftCode?.trim() || null,
      sourceTemplateId: null,
    },
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
    revision: 1,
  };

  return {
    event,
    elapsedDurationMinutes: built.elapsedDurationMinutes,
    clockLabelDurationMinutes: built.clockLabelDurationMinutes,
    dstNoticesUk: built.dstNoticesUk,
  };
}

export function buildDayOffAnnotationRecord(params: {
  id: EntityId;
  localDate: LocalDateString;
  sourceZone: IanaTimeZone;
  code?: string | null;
  note?: string | null;
  nowIso: IsoInstantString;
}): DayOffAnnotation {
  assertValidLocalDate(params.localDate);
  assertValidIanaZone(params.sourceZone);
  return {
    id: params.id,
    localDate: params.localDate,
    sourceZone: params.sourceZone,
    code: params.code?.trim() || 'В',
    note: params.note?.trim() || null,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
    revision: 1,
  };
}

function collectExistingBlockingEpochs(params: {
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  excludedEventIds?: ReadonlySet<string>;
  displayZone: IanaTimeZone;
}): { id: string; title: string; startMs: number; endMs: number }[] {
  const result: { id: string; title: string; startMs: number; endMs: number }[] =
    [];

  for (const ev of params.events) {
    if (ev.state !== 'active' || !ev.isBlocking) continue;
    if (params.excludedEventIds?.has(ev.id)) continue;

    if (ev.schedule.kind === 'timed') {
      const startMs = Date.parse(ev.schedule.interval.startInstant);
      const endMs = Date.parse(ev.schedule.interval.endInstant);
      if (endMs > startMs) {
        result.push({ id: ev.id, title: ev.title, startMs, endMs });
      }
    } else {
      const occ = resolveAllDayEventOccupancyInterval(
        ev.schedule,
        params.displayZone
      );
      if (occ.endMs > occ.startMs) {
        result.push({
          id: ev.id,
          title: ev.title,
          startMs: occ.startMs,
          endMs: occ.endMs,
        });
      }
    }
  }

  for (const res of params.reservations) {
    if (res.state !== 'active') continue;
    const startMs = Date.parse(res.interval.startInstant);
    const endMs = Date.parse(res.interval.endInstant);
    if (endMs > startMs) {
      result.push({
        id: res.id,
        title: 'Часовий резерв справи',
        startMs,
        endMs,
      });
    }
  }

  return result;
}

function hasOvernightCarryoverOntoDate(params: {
  localDate: LocalDateString;
  zoneId: IanaTimeZone;
  allWorkShiftEvents: readonly CalendarEvent[];
}): boolean {
  for (const ev of params.allWorkShiftEvents) {
    if (
      ev.state !== 'active' ||
      ev.type !== 'work_shift' ||
      ev.schedule.kind !== 'timed'
    ) {
      continue;
    }
    const segs = projectIntervalOntoLocalDates(
      ev.id,
      ev.schedule.interval,
      params.zoneId,
      params.localDate,
      params.localDate
    );
    if (segs.some((s) => s.continuesBeforeDayStart)) {
      return true;
    }
  }
  return false;
}

export type MultiDateBatchActionSpec =
  | {
      kind: 'template_shift';
      template: ShiftTemplate;
      replaceExistingDayOffOnDate?: boolean;
      noteOverride?: string | null;
    }
  | {
      kind: 'custom_shift';
      title: string;
      shiftCode?: string | null;
      startLocalTime: LocalTimeString;
      endLocalTime: LocalTimeString;
      endDateOffsetDays: 0 | 1;
      color?: EventPaletteColor;
      note?: string | null;
      replaceExistingDayOffOnDate?: boolean;
    }
  | {
      kind: 'day_off';
      code?: string | null;
      note?: string | null;
      removeSameDayStartingShifts?: boolean;
    }
  | {
      kind: 'clear_date';
    };

/**
 * 8.3 Prepare a transactional multi-date batch preview across nonconsecutive selected dates.
 * Never paints unselected dates as off or touches unselected records.
 */
export function prepareMultiDateRosterBatch(params: {
  selectedDates: readonly LocalDateString[];
  action: MultiDateBatchActionSpec;
  lockedZoneId: IanaTimeZone;
  existingEvents: readonly CalendarEvent[];
  existingReservations: readonly TaskReservation[];
  existingDayOffAnnotations: readonly DayOffAnnotation[];
  nowIso: IsoInstantString;
  idPrefix?: string;
}): RosterBatchPreview {
  assertValidIanaZone(params.lockedZoneId);

  const uniqueSortedDates = Array.from(new Set(params.selectedDates)).sort(
    compareLocalDates
  );
  const prefix = params.idPrefix ?? `roster-batch-${Date.now()}`;

  const items: ProposedRosterItem[] = [];
  const deletedEventIdsSet = new Set<string>();
  const deletedDayOffIdsSet = new Set<string>();

  for (let i = 0; i < uniqueSortedDates.length; i++) {
    const dateStr = uniqueSortedDates[i];
    assertValidLocalDate(dateStr);

    const existingDayOffsOnDate = params.existingDayOffAnnotations.filter(
      (a) => a.localDate === dateStr
    );
    const existingShiftsStartingOnDate = params.existingEvents.filter(
      (ev) =>
        ev.state === 'active' &&
        ev.type === 'work_shift' &&
        ev.schedule.kind === 'timed' &&
        ev.schedule.interval.originStartLocalDate === dateStr
    );

    if (params.action.kind === 'clear_date') {
      const evIds = existingShiftsStartingOnDate.map((e) => e.id);
      const doIds = existingDayOffsOnDate.map((d) => d.id);
      for (const id of evIds) deletedEventIdsSet.add(id);
      for (const id of doIds) deletedDayOffIdsSet.add(id);

      items.push({
        previewKey: `${prefix}-clear-${dateStr}`,
        kind: 'clear_date',
        localDate: dateStr,
        endLocalDate: dateStr,
        zoneId: params.lockedZoneId,
        eventIdsToDelete: evIds,
        dayOffIdsToDelete: doIds,
        elapsedDurationMinutes: 0,
        clockLabelDurationMinutes: 0,
        isOvernight: false,
        isAutoNextDaySuggested: false,
        diagnostics: [],
        hasBlockingError: false,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
      });
      continue;
    }

    if (params.action.kind === 'day_off') {
      const doIdsToDelete = existingDayOffsOnDate.map((d) => d.id);
      for (const id of doIdsToDelete) deletedDayOffIdsSet.add(id);

      const evIdsToDelete = params.action.removeSameDayStartingShifts
        ? existingShiftsStartingOnDate.map((e) => e.id)
        : [];
      for (const id of evIdsToDelete) deletedEventIdsSet.add(id);

      const dayOffRec = buildDayOffAnnotationRecord({
        id: `${prefix}-dayoff-${dateStr}-${i}`,
        localDate: dateStr,
        sourceZone: params.lockedZoneId,
        code: params.action.code ?? 'В',
        note: params.action.note ?? null,
        nowIso: params.nowIso,
      });

      const diagnostics: RosterDiagnostic[] = [];
      let hasBlockingError = false;

      if (
        existingShiftsStartingOnDate.length > 0 &&
        !params.action.removeSameDayStartingShifts
      ) {
        diagnostics.push({
          code: 'CONTRADICTORY_SAME_DAY_ANNOTATION',
          severity: 'warning',
          messageUk: `На дату ${dateStr} вже заплановано початок робочої зміни (${existingShiftsStartingOnDate[0].title}).`,
        });
      }

      items.push({
        previewKey: `${prefix}-dayoff-${dateStr}`,
        kind: 'day_off',
        localDate: dateStr,
        endLocalDate: dateStr,
        zoneId: params.lockedZoneId,
        dayOffToSave: dayOffRec,
        dayOffIdsToDelete: doIdsToDelete,
        eventIdsToDelete: evIdsToDelete,
        elapsedDurationMinutes: 0,
        clockLabelDurationMinutes: 0,
        isOvernight: false,
        isAutoNextDaySuggested: false,
        diagnostics,
        hasBlockingError,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
      });
      continue;
    }

    // Shift creation (template_shift or custom_shift)
    const diagnostics: RosterDiagnostic[] = [];
    let hasBlockingError = false;
    let builtEvent: CalendarEvent | undefined;
    let elapsedDurationMinutes = 0;
    let clockLabelDurationMinutes = 0;
    let endLocalDate = dateStr;

    try {
      if (params.action.kind === 'template_shift') {
        const res = instantiateWorkShiftFromTemplate({
          id: `${prefix}-shift-${dateStr}-${i}`,
          template: params.action.template,
          startLocalDate: dateStr,
          zoneId: params.lockedZoneId,
          nowIso: params.nowIso,
          noteOverride: params.action.noteOverride,
        });
        builtEvent = res.event;
        elapsedDurationMinutes = res.elapsedDurationMinutes;
        clockLabelDurationMinutes = res.clockLabelDurationMinutes;
        endLocalDate =
          res.event.schedule.kind === 'timed'
            ? res.event.schedule.interval.originEndLocalDate
            : dateStr;
        for (const notice of res.dstNoticesUk) {
          diagnostics.push({
            code: 'DST_AMBIGUOUS_FOLD_TIME',
            severity: 'warning',
            messageUk: notice,
          });
        }
      } else {
        const res = buildCustomWorkShiftEvent({
          id: `${prefix}-shift-${dateStr}-${i}`,
          title: params.action.title,
          shiftCode: params.action.shiftCode,
          startLocalDate: dateStr,
          startLocalTime: params.action.startLocalTime,
          endDateOffsetDays: params.action.endDateOffsetDays,
          endLocalTime: params.action.endLocalTime,
          zoneId: params.lockedZoneId,
          color: params.action.color,
          note: params.action.note,
          nowIso: params.nowIso,
        });
        builtEvent = res.event;
        elapsedDurationMinutes = res.elapsedDurationMinutes;
        clockLabelDurationMinutes = res.clockLabelDurationMinutes;
        endLocalDate =
          res.event.schedule.kind === 'timed'
            ? res.event.schedule.interval.originEndLocalDate
            : dateStr;
        for (const notice of res.dstNoticesUk) {
          diagnostics.push({
            code: 'DST_AMBIGUOUS_FOLD_TIME',
            severity: 'warning',
            messageUk: notice,
          });
        }
      }
    } catch (err) {
      hasBlockingError = true;
      diagnostics.push({
        code:
          err instanceof PlanuiError &&
          err.code === 'EQUAL_SHIFT_CLOCKS_AMBIGUOUS'
            ? 'EQUAL_CLOCKS_AMBIGUOUS'
            : 'DST_GAP_NONEXISTENT_TIME',
        severity: 'error',
        messageUk:
          err instanceof Error
            ? err.message
            : 'Не вдалося побудувати інтервал робочої зміни.',
      });
    }

    const doIdsToDelete =
      params.action.replaceExistingDayOffOnDate !== false
        ? existingDayOffsOnDate.map((d) => d.id)
        : [];
    for (const id of doIdsToDelete) deletedDayOffIdsSet.add(id);

    if (
      existingDayOffsOnDate.length > 0 &&
      params.action.replaceExistingDayOffOnDate === false
    ) {
      diagnostics.push({
        code: 'CONTRADICTORY_SAME_DAY_ANNOTATION',
        severity: 'warning',
        messageUk: `Дата ${dateStr} позначена як вихідний день. Нова зміна додається без видалення позначки вихідного.`,
      });
    }

    if (
      elapsedDurationMinutes > 0 &&
      (elapsedDurationMinutes < 60 || elapsedDurationMinutes > 16 * 60)
    ) {
      diagnostics.push({
        code: 'UNUSUAL_DURATION',
        severity: 'warning',
        messageUk: `Нетипова тривалість зміни (${Math.floor(
          elapsedDurationMinutes / 60
        )} год ${elapsedDurationMinutes % 60} хв). Перевірте правильність часу.`,
      });
    }

    items.push({
      previewKey: `${prefix}-shift-${dateStr}-${i}`,
      kind: 'work_shift',
      localDate: dateStr,
      endLocalDate,
      zoneId: params.lockedZoneId,
      eventToSave: builtEvent,
      dayOffIdsToDelete: doIdsToDelete,
      elapsedDurationMinutes,
      clockLabelDurationMinutes,
      isOvernight: endLocalDate > dateStr,
      isAutoNextDaySuggested: false,
      diagnostics,
      hasBlockingError,
      hasConflictWarning: false,
      isMixedDayOffCarryover: false,
    });
  }

  return finalizeRosterBatchPreview({
    lockedZoneId: params.lockedZoneId,
    items,
    existingEvents: params.existingEvents,
    existingReservations: params.existingReservations,
    existingDayOffAnnotations: params.existingDayOffAnnotations,
  });
}

/**
 * 8.4 Generate finite period shifts across selected dates or ISO weekdays (1=Monday..7=Sunday)
 * inside an explicit [startDate, endDate] period (max 366 days).
 */
export function generateFinitePeriodRosterPreview(params: {
  startDate: LocalDateString;
  endDate: LocalDateString;
  cycleEveryDays?: number;
  selectedWeekdaysMondayFirst?: readonly number[]; // 0 = Monday .. 6 = Sunday
  explicitDatesFilter?: readonly LocalDateString[];
  action: Exclude<MultiDateBatchActionSpec, { kind: 'clear_date' }>;
  lockedZoneId: IanaTimeZone;
  existingEvents: readonly CalendarEvent[];
  existingReservations: readonly TaskReservation[];
  existingDayOffAnnotations: readonly DayOffAnnotation[];
  nowIso: IsoInstantString;
  idPrefix?: string;
}): RosterBatchPreview {
  assertValidLocalDate(params.startDate);
  assertValidLocalDate(params.endDate);
  assertValidIanaZone(params.lockedZoneId);

  if (compareLocalDates(params.endDate, params.startDate) < 0) {
    throw new PlanuiError(
      'ROSTER_PERIOD_INVALID_RANGE',
      `${params.startDate} .. ${params.endDate}`
    );
  }
  const spanDays = diffCalendarDays(params.startDate, params.endDate) + 1;
  if (spanDays > 366) {
    throw new PlanuiError(
      'ROSTER_PERIOD_INVALID_RANGE',
      `${spanDays} днів (максимум 366)`
    );
  }

  if (params.cycleEveryDays !== undefined && (!Number.isInteger(params.cycleEveryDays) || params.cycleEveryDays < 1 || params.cycleEveryDays > 366)) throw new PlanuiError('ROSTER_PERIOD_INVALID_RANGE');
  const allDatesInPeriod = enumerateLocalDatesInclusive(
    params.startDate,
    params.endDate
  );

  const explicitSet = params.explicitDatesFilter
    ? new Set(params.explicitDatesFilter)
    : null;
  const weekdaySet = params.selectedWeekdaysMondayFirst
    ? new Set(params.selectedWeekdaysMondayFirst)
    : null;

  const matchedDates = allDatesInPeriod.filter((d, index) => {
    if (params.cycleEveryDays !== undefined) return index % params.cycleEveryDays === 0;
    if (explicitSet && !explicitSet.has(d)) return false;
    if (weekdaySet) {
      const wkIdx = getMondayFirstWeekdayIndex(d);
      if (!weekdaySet.has(wkIdx)) return false;
    }
    return true;
  });

  return prepareMultiDateRosterBatch({
    selectedDates: matchedDates,
    action: params.action,
    lockedZoneId: params.lockedZoneId,
    existingEvents: params.existingEvents,
    existingReservations: params.existingReservations,
    existingDayOffAnnotations: params.existingDayOffAnnotations,
    nowIso: params.nowIso,
    idPrefix: params.idPrefix ?? `roster-gen-${Date.now()}`,
  });
}

function normalizeTimeToken(raw: string): LocalTimeString | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * 8.5 Deterministic local text parser for irregular work schedules.
 * Supports:
 * - Day + template code: `5 Д1`, `12 Н1`, `2026-11-05 Д1`, `05.11 Д1`
 * - Day + manual range: `7 08:00-20:00`, `14 9:00–18:00`, `18 22:00-06:00`, `18 22:00-06:00 +1`
 * - Day + day-off code: `8 В`, `8 ВИХ`, `8 ВИХІДНИЙ`, `8 OFF`, `8 -`
 *
 * Flags invalid dates, unknown codes, duplicates, DST ambiguity/gaps, overlaps,
 * unusual durations, and contradictory annotations.
 * Carryover from a previous night onto an off-day date is marked as a valid mixed state (`isMixedDayOffCarryover: true`), not an error.
 */
export function parseDeterministicRosterText(params: {
  rawText: string;
  targetYear: number;
  targetMonth1To12: number;
  lockedZoneId: IanaTimeZone;
  templates: readonly ShiftTemplate[];
  existingEvents: readonly CalendarEvent[];
  existingReservations: readonly TaskReservation[];
  existingDayOffAnnotations: readonly DayOffAnnotation[];
  excludedLineNumbers?: ReadonlySet<number>;
  dstDisambiguationByLine?: Readonly<Record<number, DstDisambiguation>>;
  nowIso: IsoInstantString;
  idPrefix?: string;
}): RosterBatchPreview {
  assertValidIanaZone(params.lockedZoneId);
  const maxDayInMonth = getDaysInMonth(
    params.targetYear,
    params.targetMonth1To12
  );
  if (maxDayInMonth === 0) {
    throw new PlanuiError(
      'INVALID_LOCAL_DATE',
      `${params.targetYear}-${String(params.targetMonth1To12).padStart(2, '0')}`
    );
  }

  const templatesByUpperCode = new Map<string, ShiftTemplate>();
  for (const tpl of params.templates) {
    templatesByUpperCode.set(tpl.code.trim().toUpperCase(), tpl);
  }

  const prefix = params.idPrefix ?? `roster-parse-${Date.now()}`;
  const rawLines = params.rawText.split(/\r?\n/);
  const items: ProposedRosterItem[] = [];
  const seenRowSignatures = new Set<string>();
  const shiftDatesSeen = new Map<string, number>();
  const dayOffDatesSeen = new Set<string>();

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNumber = idx + 1;
    const trimmed = rawLines[idx].trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    const isExcluded = params.excludedLineNumbers?.has(lineNumber) ?? false;
    const lineDisambiguation =
      params.dstDisambiguationByLine?.[lineNumber] ?? undefined;

    // Extract optional trailing note after `|` or `;`
    let mainPart = trimmed;
    let inlineNote: string | null = null;
    const noteSepIdx = trimmed.search(/[|;]/);
    if (noteSepIdx >= 0) {
      mainPart = trimmed.slice(0, noteSepIdx).trim();
      const noteText = trimmed.slice(noteSepIdx + 1).trim();
      if (noteText.length > 0) inlineNote = noteText;
    }

    const tokens = mainPart.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      items.push({
        previewKey: `${prefix}-line-${lineNumber}`,
        sourceLineNumber: lineNumber,
        rawLineText: trimmed,
        kind: 'work_shift',
        localDate: `${String(params.targetYear).padStart(4, '0')}-${String(
          params.targetMonth1To12
        ).padStart(2, '0')}-01`,
        endLocalDate: `${String(params.targetYear).padStart(4, '0')}-${String(
          params.targetMonth1To12
        ).padStart(2, '0')}-01`,
        zoneId: params.lockedZoneId,
        elapsedDurationMinutes: 0,
        clockLabelDurationMinutes: 0,
        isOvernight: false,
        isAutoNextDaySuggested: false,
        diagnostics: [
          {
            code: 'INVALID_SYNTAX',
            severity: 'error',
            messageUk: `Рядок ${lineNumber}: очікується формат «<день> <код_шаблону | ГГ:ХХ-ГГ:ХХ [+1] | В>».`,
          },
        ],
        hasBlockingError: true,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
        excluded: isExcluded,
      });
      continue;
    }

    // 1. Parse Date Token (supports `5`, `05`, `05.11`, `05.11.2026`, `2026-11-05`)
    const dateToken = tokens[0].replace(/[,.:]+$/, '');
    let resolvedLocalDate: LocalDateString | null = null;
    let dateErrorUk: string | null = null;

    if (/^\d{1,2}$/.test(dateToken)) {
      const dayNum = Number(dateToken);
      if (dayNum < 1 || dayNum > maxDayInMonth) {
        dateErrorUk = `Рядок ${lineNumber}: день «${dateToken}» не існує у місяці ${String(
          params.targetMonth1To12
        ).padStart(2, '0')}.${params.targetYear} (максимум ${maxDayInMonth} днів).`;
      } else {
        resolvedLocalDate = `${String(params.targetYear).padStart(
          4,
          '0'
        )}-${String(params.targetMonth1To12).padStart(2, '0')}-${String(
          dayNum
        ).padStart(2, '0')}`;
      }
    } else if (/^\d{1,2}\.\d{1,2}(?:\.\d{4})?$/.test(dateToken)) {
      const parts = dateToken.split('.');
      const d = Number(parts[0]);
      const m = Number(parts[1]);
      const y = parts[2] ? Number(parts[2]) : params.targetYear;
      const candidate = `${String(y).padStart(4, '0')}-${String(m).padStart(
        2,
        '0'
      )}-${String(d).padStart(2, '0')}`;
      if (!parseLocalDateParts(candidate)) {
        dateErrorUk = `Рядок ${lineNumber}: некоректна календарна дата «${dateToken}».`;
      } else {
        resolvedLocalDate = candidate;
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) {
      if (!parseLocalDateParts(dateToken)) {
        dateErrorUk = `Рядок ${lineNumber}: некоректна календарна дата «${dateToken}».`;
      } else {
        resolvedLocalDate = dateToken;
      }
    } else {
      dateErrorUk = `Рядок ${lineNumber}: не вдалося розпізнати день або дату «${dateToken}».`;
    }

    const fallbackDate = `${String(params.targetYear).padStart(4, '0')}-${String(
      params.targetMonth1To12
    ).padStart(2, '0')}-01`;

    if (!resolvedLocalDate || dateErrorUk) {
      items.push({
        previewKey: `${prefix}-line-${lineNumber}`,
        sourceLineNumber: lineNumber,
        rawLineText: trimmed,
        kind: 'work_shift',
        localDate: fallbackDate,
        endLocalDate: fallbackDate,
        zoneId: params.lockedZoneId,
        elapsedDurationMinutes: 0,
        clockLabelDurationMinutes: 0,
        isOvernight: false,
        isAutoNextDaySuggested: false,
        diagnostics: [
          {
            code: 'INVALID_CALENDAR_DATE',
            severity: 'error',
            messageUk:
              dateErrorUk ??
              `Рядок ${lineNumber}: некоректна календарна дата «${dateToken}».`,
          },
        ],
        hasBlockingError: true,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
        excluded: isExcluded,
      });
      continue;
    }

    // 2. Parse Rest of Tokens
    const restTokens = tokens.slice(1);
    const secondTokenUpper = restTokens[0].toUpperCase();

    // Case A: Explicit Day-Off Code (`В`, `ВИХ`, `ВИХІДНИЙ`, `OFF`, `-`)
    if (DAY_OFF_CODES_UPPER.has(secondTokenUpper) && restTokens.length === 1) {
      const diagnostics: RosterDiagnostic[] = [];
      let hasBlockingError = false;

      const sig = `DAYOFF::${resolvedLocalDate}`;
      if (seenRowSignatures.has(sig) && !isExcluded) {
        hasBlockingError = true;
        diagnostics.push({
          code: 'DUPLICATE_IDENTICAL_ROW',
          severity: 'error',
          messageUk: `Рядок ${lineNumber}: дублікат позначки вихідного на дату ${resolvedLocalDate}.`,
        });
      }
      if (!isExcluded) {
        seenRowSignatures.add(sig);
        dayOffDatesSeen.add(resolvedLocalDate);
      }

      if ((shiftDatesSeen.get(resolvedLocalDate) ?? 0) > 0 && !isExcluded) {
        hasBlockingError = true;
        diagnostics.push({
          code: 'CONTRADICTORY_SAME_DAY_ANNOTATION',
          severity: 'error',
          messageUk: `Рядок ${lineNumber}: суперечлива позначка — на дату ${resolvedLocalDate} у цьому ж списку вже задано початок робочої зміни.`,
        });
      }

      const dayOffRec = buildDayOffAnnotationRecord({
        id: `${prefix}-dayoff-${lineNumber}`,
        localDate: resolvedLocalDate,
        sourceZone: params.lockedZoneId,
        code: secondTokenUpper === '-' ? 'В' : secondTokenUpper,
        note: inlineNote,
        nowIso: params.nowIso,
      });

      items.push({
        previewKey: `${prefix}-line-${lineNumber}`,
        sourceLineNumber: lineNumber,
        rawLineText: trimmed,
        kind: 'day_off',
        localDate: resolvedLocalDate,
        endLocalDate: resolvedLocalDate,
        zoneId: params.lockedZoneId,
        dayOffToSave: dayOffRec,
        elapsedDurationMinutes: 0,
        clockLabelDurationMinutes: 0,
        isOvernight: false,
        isAutoNextDaySuggested: false,
        diagnostics,
        hasBlockingError,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
        excluded: isExcluded,
      });
      continue;
    }

    // Case B: Manual Time Range (e.g. `08:00-20:00`, `22:00–06:00`, `22:00 - 06:00 +1`)
    const joinedRest = restTokens.join(' ');
    const rangeRegex =
      /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})(?:\s+(\+1(?:\s*д(?:оба|\.)?)?|наст(?:упний)?))?(?:\s+(.+))?$/i;
    const rangeMatch = rangeRegex.exec(joinedRest);

    if (rangeMatch) {
      const startNorm = normalizeTimeToken(rangeMatch[1]);
      const endNorm = normalizeTimeToken(rangeMatch[2]);
      const explicitPlusOneToken = rangeMatch[3];
      const extraLabelText = rangeMatch[4]?.trim() || null;

      const diagnostics: RosterDiagnostic[] = [];
      let hasBlockingError = false;

      if (!startNorm || !endNorm) {
        items.push({
          previewKey: `${prefix}-line-${lineNumber}`,
          sourceLineNumber: lineNumber,
          rawLineText: trimmed,
          kind: 'work_shift',
          localDate: resolvedLocalDate,
          endLocalDate: resolvedLocalDate,
          zoneId: params.lockedZoneId,
          elapsedDurationMinutes: 0,
          clockLabelDurationMinutes: 0,
          isOvernight: false,
          isAutoNextDaySuggested: false,
          diagnostics: [
            {
              code: 'INVALID_SYNTAX',
              severity: 'error',
              messageUk: `Рядок ${lineNumber}: некоректний час у діапазоні «${rangeMatch[1]}–${rangeMatch[2]}» (очікується 00:00–23:59).`,
            },
          ],
          hasBlockingError: true,
          hasConflictWarning: false,
          isMixedDayOffCarryover: false,
          excluded: isExcluded,
        });
        continue;
      }

      const startParts = parseLocalTimeParts(startNorm)!;
      const endParts = parseLocalTimeParts(endNorm)!;
      const startMin = startParts.hour * 60 + startParts.minute;
      const endMin = endParts.hour * 60 + endParts.minute;

      let endDateOffsetDays: 0 | 1 = explicitPlusOneToken ? 1 : 0;
      let isAutoNextDaySuggested = false;

      if (startMin === endMin && !explicitPlusOneToken) {
        // C09 / 8.5: Equal clocks require clarification; do not infer 24 hours silently
        hasBlockingError = true;
        diagnostics.push({
          code: 'EQUAL_CLOCKS_AMBIGUOUS',
          severity: 'error',
          messageUk: `Рядок ${lineNumber}: однаковий час початку і завершення (${startNorm}–${endNorm}). Додайте «+1» для 24-годинної зміни на наступну добу або вкажіть інший час.`,
        });
      } else if (endMin < startMin && !explicitPlusOneToken) {
        // C09 / 8.5: Earlier end clock visibly suggests next day
        endDateOffsetDays = 1;
        isAutoNextDaySuggested = true;
        diagnostics.push({
          code: 'EARLIER_END_SUGGESTS_NEXT_DAY',
          severity: 'info',
          messageUk: `Рядок ${lineNumber}: час завершення (${endNorm}) раніше за початок (${startNorm}) — розпізнано як перехід на наступну добу (+1 доба, завершення ${addDaysToLocalDate(
            resolvedLocalDate,
            1
          )}).`,
        });
      }

      const endLocalDate = addDaysToLocalDate(
        resolvedLocalDate,
        endDateOffsetDays
      );
      const sig = `SHIFT::${resolvedLocalDate}::${startNorm}::${endLocalDate}::${endNorm}`;

      if (seenRowSignatures.has(sig) && !isExcluded) {
        hasBlockingError = true;
        diagnostics.push({
          code: 'DUPLICATE_IDENTICAL_ROW',
          severity: 'error',
          messageUk: `Рядок ${lineNumber}: дублікат зміни ${startNorm}–${endNorm} на дату ${resolvedLocalDate}.`,
        });
      }
      if (!isExcluded) {
        seenRowSignatures.add(sig);
      }

      if (dayOffDatesSeen.has(resolvedLocalDate) && !isExcluded) {
        hasBlockingError = true;
        diagnostics.push({
          code: 'CONTRADICTORY_SAME_DAY_ANNOTATION',
          severity: 'error',
          messageUk: `Рядок ${lineNumber}: суперечливий запис — дата ${resolvedLocalDate} вже позначена як вихідний у цьому списку.`,
        });
      }

      const prevCountOnDate = shiftDatesSeen.get(resolvedLocalDate) ?? 0;
      if (prevCountOnDate > 0 && !isExcluded) {
        diagnostics.push({
          code: 'MULTIPLE_SHIFTS_SAME_DATE',
          severity: 'warning',
          messageUk: `Рядок ${lineNumber}: на дату ${resolvedLocalDate} припадає декілька робочих змін у цьому пакеті.`,
        });
      }
      if (!isExcluded) {
        shiftDatesSeen.set(resolvedLocalDate, prevCountOnDate + 1);
      }

      let builtEvent: CalendarEvent | undefined;
      let elapsedDurationMinutes = 0;
      let clockLabelDurationMinutes = 0;

      if (!hasBlockingError) {
        // Check strict DST gap/repeat before building
        const startCheck = resolveLocalDateTimeToInstant(
          resolvedLocalDate,
          startNorm,
          params.lockedZoneId,
          lineDisambiguation ?? 'compatible'
        );
        const endCheck = resolveLocalDateTimeToInstant(
          endLocalDate,
          endNorm,
          params.lockedZoneId,
          lineDisambiguation ?? 'compatible'
        );

        if (
          (startCheck.status === 'gap' || endCheck.status === 'gap') &&
          !lineDisambiguation
        ) {
          hasBlockingError = true;
          diagnostics.push({
            code: 'DST_GAP_NONEXISTENT_TIME',
            severity: 'error',
            messageUk: `Рядок ${lineNumber}: локальний час потрапляє у пропущену годину переходу на літній час у поясі ${params.lockedZoneId}. Уточніть час або дозвольте зміщення.`,
          });
        } else {
          if (startCheck.status === 'repeated' && startCheck.dstNoticeUk) {
            diagnostics.push({
              code: 'DST_AMBIGUOUS_FOLD_TIME',
              severity: 'warning',
              messageUk: `Рядок ${lineNumber}: ${startCheck.dstNoticeUk}`,
            });
          }
          if (endCheck.status === 'repeated' && endCheck.dstNoticeUk) {
            diagnostics.push({
              code: 'DST_AMBIGUOUS_FOLD_TIME',
              severity: 'warning',
              messageUk: `Рядок ${lineNumber}: ${endCheck.dstNoticeUk}`,
            });
          }

          try {
            const customRes = buildCustomWorkShiftEvent({
              id: `${prefix}-shift-${lineNumber}`,
              title: extraLabelText || 'Робоча зміна',
              shiftCode: null,
              startLocalDate: resolvedLocalDate,
              startLocalTime: startNorm,
              endDateOffsetDays,
              endLocalTime: endNorm,
              zoneId: params.lockedZoneId,
              note: inlineNote,
              nowIso: params.nowIso,
              disambiguation: lineDisambiguation ?? 'compatible',
            });
            builtEvent = customRes.event;
            elapsedDurationMinutes = customRes.elapsedDurationMinutes;
            clockLabelDurationMinutes = customRes.clockLabelDurationMinutes;
          } catch (err) {
            hasBlockingError = true;
            diagnostics.push({
              code: 'INVALID_SYNTAX',
              severity: 'error',
              messageUk:
                err instanceof Error
                  ? err.message
                  : `Рядок ${lineNumber}: некоректний часовий інтервал.`,
            });
          }
        }
      }

      if (
        elapsedDurationMinutes > 0 &&
        (elapsedDurationMinutes < 60 || elapsedDurationMinutes > 16 * 60)
      ) {
        diagnostics.push({
          code: 'UNUSUAL_DURATION',
          severity: 'warning',
          messageUk: `Рядок ${lineNumber}: нетипова тривалість зміни (${Math.floor(
            elapsedDurationMinutes / 60
          )} год ${elapsedDurationMinutes % 60} хв).`,
        });
      }

      items.push({
        previewKey: `${prefix}-line-${lineNumber}`,
        sourceLineNumber: lineNumber,
        rawLineText: trimmed,
        kind: 'work_shift',
        localDate: resolvedLocalDate,
        endLocalDate,
        zoneId: params.lockedZoneId,
        eventToSave: builtEvent,
        elapsedDurationMinutes,
        clockLabelDurationMinutes,
        isOvernight: endDateOffsetDays === 1,
        isAutoNextDaySuggested,
        diagnostics,
        hasBlockingError,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
        excluded: isExcluded,
      });
      continue;
    }

    // Case C: Template Code (e.g. `5 Д1`, `12 Н1`)
    const tpl = templatesByUpperCode.get(secondTokenUpper);
    if (!tpl) {
      items.push({
        previewKey: `${prefix}-line-${lineNumber}`,
        sourceLineNumber: lineNumber,
        rawLineText: trimmed,
        kind: 'work_shift',
        localDate: resolvedLocalDate,
        endLocalDate: resolvedLocalDate,
        zoneId: params.lockedZoneId,
        elapsedDurationMinutes: 0,
        clockLabelDurationMinutes: 0,
        isOvernight: false,
        isAutoNextDaySuggested: false,
        diagnostics: [
          {
            code: 'UNKNOWN_TEMPLATE_CODE',
            severity: 'error',
            messageUk: `Рядок ${lineNumber}: невідомий код шаблону зміни або позначки «${restTokens[0]}».`,
          },
        ],
        hasBlockingError: true,
        hasConflictWarning: false,
        isMixedDayOffCarryover: false,
        excluded: isExcluded,
      });
      continue;
    }

    const diagnostics: RosterDiagnostic[] = [];
    let hasBlockingError = false;
    const endLocalDate = addDaysToLocalDate(
      resolvedLocalDate,
      tpl.endDateOffsetDays
    );
    const sig = `SHIFT::${resolvedLocalDate}::${tpl.startLocalTime}::${endLocalDate}::${tpl.endLocalTime}`;

    if (seenRowSignatures.has(sig) && !isExcluded) {
      hasBlockingError = true;
      diagnostics.push({
        code: 'DUPLICATE_IDENTICAL_ROW',
        severity: 'error',
        messageUk: `Рядок ${lineNumber}: дублікат зміни «${tpl.code}» на дату ${resolvedLocalDate}.`,
      });
    }
    if (!isExcluded) {
      seenRowSignatures.add(sig);
    }

    if (dayOffDatesSeen.has(resolvedLocalDate) && !isExcluded) {
      hasBlockingError = true;
      diagnostics.push({
        code: 'CONTRADICTORY_SAME_DAY_ANNOTATION',
        severity: 'error',
        messageUk: `Рядок ${lineNumber}: суперечливий запис — дата ${resolvedLocalDate} вже позначена як вихідний у цьому списку.`,
      });
    }

    const prevCountOnDate = shiftDatesSeen.get(resolvedLocalDate) ?? 0;
    if (prevCountOnDate > 0 && !isExcluded) {
      diagnostics.push({
        code: 'MULTIPLE_SHIFTS_SAME_DATE',
        severity: 'warning',
        messageUk: `Рядок ${lineNumber}: на дату ${resolvedLocalDate} припадає декілька робочих змін.`,
      });
    }
    if (!isExcluded) {
      shiftDatesSeen.set(resolvedLocalDate, prevCountOnDate + 1);
    }

    let builtEvent: CalendarEvent | undefined;
    let elapsedDurationMinutes = 0;
    let clockLabelDurationMinutes = 0;

    if (!hasBlockingError) {
      const startCheck = resolveLocalDateTimeToInstant(
        resolvedLocalDate,
        tpl.startLocalTime,
        params.lockedZoneId,
        lineDisambiguation ?? 'compatible'
      );
      const endCheck = resolveLocalDateTimeToInstant(
        endLocalDate,
        tpl.endLocalTime,
        params.lockedZoneId,
        lineDisambiguation ?? 'compatible'
      );

      if (
        (startCheck.status === 'gap' || endCheck.status === 'gap') &&
        !lineDisambiguation
      ) {
        hasBlockingError = true;
        diagnostics.push({
          code: 'DST_GAP_NONEXISTENT_TIME',
          severity: 'error',
          messageUk: `Рядок ${lineNumber}: час шаблону «${tpl.code}» потрапляє у пропущену годину переходу на літній час у поясі ${params.lockedZoneId}.`,
        });
      } else {
        if (startCheck.status === 'repeated' && startCheck.dstNoticeUk) {
          diagnostics.push({
            code: 'DST_AMBIGUOUS_FOLD_TIME',
            severity: 'warning',
            messageUk: `Рядок ${lineNumber}: ${startCheck.dstNoticeUk}`,
          });
        }
        if (endCheck.status === 'repeated' && endCheck.dstNoticeUk) {
          diagnostics.push({
            code: 'DST_AMBIGUOUS_FOLD_TIME',
            severity: 'warning',
            messageUk: `Рядок ${lineNumber}: ${endCheck.dstNoticeUk}`,
          });
        }

        const inst = instantiateWorkShiftFromTemplate({
          id: `${prefix}-shift-${lineNumber}`,
          template: tpl,
          startLocalDate: resolvedLocalDate,
          zoneId: params.lockedZoneId,
          nowIso: params.nowIso,
          disambiguation: lineDisambiguation ?? 'compatible',
          noteOverride: inlineNote !== null ? inlineNote : tpl.note,
        });
        builtEvent = inst.event;
        elapsedDurationMinutes = inst.elapsedDurationMinutes;
        clockLabelDurationMinutes = inst.clockLabelDurationMinutes;
      }
    }

    if (
      elapsedDurationMinutes > 0 &&
      (elapsedDurationMinutes < 60 || elapsedDurationMinutes > 16 * 60)
    ) {
      diagnostics.push({
        code: 'UNUSUAL_DURATION',
        severity: 'warning',
        messageUk: `Рядок ${lineNumber}: нетипова тривалість зміни (${Math.floor(
          elapsedDurationMinutes / 60
        )} год ${elapsedDurationMinutes % 60} хв).`,
      });
    }

    items.push({
      previewKey: `${prefix}-line-${lineNumber}`,
      sourceLineNumber: lineNumber,
      rawLineText: trimmed,
      kind: 'work_shift',
      localDate: resolvedLocalDate,
      endLocalDate,
      zoneId: params.lockedZoneId,
      eventToSave: builtEvent,
      elapsedDurationMinutes,
      clockLabelDurationMinutes,
      isOvernight: tpl.endDateOffsetDays === 1,
      isAutoNextDaySuggested: false,
      diagnostics,
      hasBlockingError,
      hasConflictWarning: false,
      isMixedDayOffCarryover: false,
      excluded: isExcluded,
    });
  }

  return finalizeRosterBatchPreview({
    lockedZoneId: params.lockedZoneId,
    items,
    existingEvents: params.existingEvents,
    existingReservations: params.existingReservations,
    existingDayOffAnnotations: params.existingDayOffAnnotations,
  });
}

function finalizeRosterBatchPreview(params: {
  lockedZoneId: IanaTimeZone;
  items: ProposedRosterItem[];
  existingEvents: readonly CalendarEvent[];
  existingReservations: readonly TaskReservation[];
  existingDayOffAnnotations: readonly DayOffAnnotation[];
}): RosterBatchPreview {
  const activeItems = params.items.filter((item) => !item.excluded);

  const eventIdsToDeleteSet = new Set<string>();
  const dayOffIdsToDeleteSet = new Set<string>();

  for (const item of activeItems) {
    for (const id of item.eventIdsToDelete ?? []) eventIdsToDeleteSet.add(id);
    for (const id of item.dayOffIdsToDelete ?? []) dayOffIdsToDeleteSet.add(id);
    if (item.kind === 'day_off') {
      // Replace any existing day-off annotation on the same localDate so we don't duplicate day-off records
      for (const existingAnn of params.existingDayOffAnnotations) {
        if (existingAnn.localDate === item.localDate) {
          dayOffIdsToDeleteSet.add(existingAnn.id);
        }
      }
    }
  }

  const existingBlocking = collectExistingBlockingEpochs({
    events: params.existingEvents,
    reservations: params.existingReservations,
    excludedEventIds: eventIdsToDeleteSet,
    displayZone: params.lockedZoneId,
  });

  const batchShiftEpochs: {
    previewKey: string;
    title: string;
    startMs: number;
    endMs: number;
    event: CalendarEvent;
  }[] = [];

  for (const item of activeItems) {
    if (
      item.kind === 'work_shift' &&
      item.eventToSave &&
      item.eventToSave.schedule.kind === 'timed'
    ) {
      batchShiftEpochs.push({
        previewKey: item.previewKey,
        title: item.eventToSave.title,
        startMs: Date.parse(item.eventToSave.schedule.interval.startInstant),
        endMs: Date.parse(item.eventToSave.schedule.interval.endInstant),
        event: item.eventToSave,
      });
    }
  }

  const combinedWorkShiftsForCarryover: CalendarEvent[] = [
    ...params.existingEvents.filter(
      (e) =>
        e.state === 'active' &&
        e.type === 'work_shift' &&
        !eventIdsToDeleteSet.has(e.id)
    ),
    ...batchShiftEpochs.map((b) => b.event),
  ];

  // Evaluate overlaps and mixed day-off carryover across active items
  for (const item of activeItems) {
    if (
      item.kind === 'work_shift' &&
      item.eventToSave &&
      item.eventToSave.schedule.kind === 'timed'
    ) {
      const startMs = Date.parse(
        item.eventToSave.schedule.interval.startInstant
      );
      const endMs = Date.parse(item.eventToSave.schedule.interval.endInstant);

      const overlappingNames: string[] = [];
      for (const ex of existingBlocking) {
        if (doIntervalsOverlap({ startMs, endMs }, ex)) {
          overlappingNames.push(ex.title);
        }
      }
      for (const other of batchShiftEpochs) {
        if (other.previewKey === item.previewKey) continue;
        if (doIntervalsOverlap({ startMs, endMs }, other)) {
          overlappingNames.push(other.title);
        }
      }

      if (overlappingNames.length > 0) {
        item.hasConflictWarning = true;
        item.diagnostics.push({
          code: 'OVERLAP_CONFLICT',
          severity: 'warning',
          messageUk: `Перетин у часі з: ${Array.from(
            new Set(overlappingNames)
          ).join(', ')}.`,
        });
      }
    }

    if (item.kind === 'day_off') {
      // C13 / 8.5: Carryover from a previous night onto an off-day date is a valid mixed state, not an error
      const hasCarryover = hasOvernightCarryoverOntoDate({
        localDate: item.localDate,
        zoneId: params.lockedZoneId,
        allWorkShiftEvents: combinedWorkShiftsForCarryover,
      });
      if (hasCarryover) {
        item.isMixedDayOffCarryover = true;
        item.diagnostics.push({
          code: 'MIXED_DAY_OFF_WITH_OVERNIGHT_CARRYOVER',
          severity: 'info',
          messageUk: `Змішаний стан на ${item.localDate}: позначено вихідний день із ранковим завершенням нічної зміни з попередньої доби.`,
        });
      }
    }
  }

  // Also check if a new overnight shift carries over onto an existing day-off annotation on endLocalDate
  const effectiveDayOffDates = new Set<string>(
    params.existingDayOffAnnotations
      .filter((a) => !dayOffIdsToDeleteSet.has(a.id))
      .map((a) => a.localDate)
  );
  for (const item of activeItems) {
    if (item.kind === 'day_off' && !item.hasBlockingError) {
      effectiveDayOffDates.add(item.localDate);
    }
  }

  for (const item of activeItems) {
    if (
      item.kind === 'work_shift' &&
      item.isOvernight &&
      effectiveDayOffDates.has(item.endLocalDate)
    ) {
      item.isMixedDayOffCarryover = true;
      if (
        !item.diagnostics.some(
          (d) => d.code === 'MIXED_DAY_OFF_WITH_OVERNIGHT_CARRYOVER'
        )
      ) {
        item.diagnostics.push({
          code: 'MIXED_DAY_OFF_WITH_OVERNIGHT_CARRYOVER',
          severity: 'info',
          messageUk: `Змішаний стан: нічна зміна завершується вранці ${item.endLocalDate} у день, позначений як вихідний.`,
        });
      }
    }
  }

  const eventsToSave = activeItems
    .filter((i) => !i.hasBlockingError && i.eventToSave)
    .map((i) => i.eventToSave!);

  const dayOffAnnotationsToSave = activeItems
    .filter((i) => !i.hasBlockingError && i.dayOffToSave)
    .map((i) => i.dayOffToSave!);

  const blockingErrorCount = activeItems.filter(
    (i) => i.hasBlockingError
  ).length;
  const conflictWarningCount = activeItems.filter(
    (i) => i.hasConflictWarning
  ).length;
  const mixedCarryoverCount = activeItems.filter(
    (i) => i.isMixedDayOffCarryover
  ).length;

  const totalElapsedMinutes = activeItems
    .filter((i) => !i.hasBlockingError)
    .reduce((acc, i) => acc + i.elapsedDurationMinutes, 0);

  const summaryWarningsUk: string[] = [];
  if (blockingErrorCount > 0) {
    summaryWarningsUk.push(
      `Виявлено помилок: ${blockingErrorCount}. Виправте або виключіть помилкові рядки перед збереженням.`
    );
  }
  if (conflictWarningCount > 0) {
    summaryWarningsUk.push(
      `Виявлено перетинів у часі: ${conflictWarningCount}. Для збереження потрібне свідоме підтвердження.`
    );
  }
  if (mixedCarryoverCount > 0) {
    summaryWarningsUk.push(
      `Днів зі змішаним станом (вихідний + ранкове завершення нічної зміни): ${mixedCarryoverCount}.`
    );
  }

  return {
    lockedZoneId: params.lockedZoneId,
    items: params.items,
    activeItems,
    eventsToSave,
    dayOffAnnotationsToSave,
    eventIdsToDelete: Array.from(eventIdsToDeleteSet),
    dayOffAnnotationIdsToDelete: Array.from(dayOffIdsToDeleteSet),
    totalShiftsToSave: eventsToSave.length,
    totalDayOffsToSave: dayOffAnnotationsToSave.length,
    totalDatesToClear: activeItems.filter((i) => i.kind === 'clear_date')
      .length,
    totalElapsedMinutes,
    blockingErrorCount,
    conflictWarningCount,
    mixedCarryoverCount,
    canCommit: activeItems.length > 0 && blockingErrorCount === 0,
    requiresConflictConfirmation: conflictWarningCount > 0,
    summaryWarningsUk,
  };
}

export interface MonthIntersectingShiftDetail {
  eventId: EntityId;
  title: string;
  shiftCode: string | null;
  originStartLocalDate: LocalDateString;
  originStartLocalTime: LocalTimeString;
  originEndLocalDate: LocalDateString;
  originEndLocalTime: LocalTimeString;
  fullShiftDurationMinutes: number;
  intersectingMonthMinutes: number;
  crossesMonthBoundary: boolean;
}

export interface MonthWorkRosterSummary {
  monthStartLocalDate: LocalDateString;
  monthEndLocalDate: LocalDateString;
  displayZone: IanaTimeZone;
  intersectingShiftCount: number;
  intersectingWorkMinutes: number;
  unionWorkMinutesInMonth: number;
  fullShiftsTotalMinutes: number;
  boundaryCrossingShiftCount: number;
  explicitDayOffCount: number;
  mixedDayOffCarryoverCount: number;
  shiftDetails: MonthIntersectingShiftDetail[];
}

/**
 * 8.6 / C13: Calculate month work summary using exact duration intersecting the month boundaries.
 * - Never counts projected day segments as separate shifts (an overnight shift inside the month = 1 shift).
 * - Distinguishes full shift duration vs. exact duration intersecting the month when a shift crosses month boundaries.
 */
export function calculateMonthWorkSummary(params: {
  referenceDateInMonth: LocalDateString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  dayOffAnnotations: readonly DayOffAnnotation[];
}): MonthWorkRosterSummary {
  assertValidLocalDate(params.referenceDateInMonth);
  assertValidIanaZone(params.displayZone);

  const monthStartLocalDate = getFirstDayOfMonth(params.referenceDateInMonth);
  const monthEndLocalDate = getLastDayOfMonth(params.referenceDateInMonth);

  const firstDayBounds = getLocalDateBoundariesInZone(
    monthStartLocalDate,
    params.displayZone
  );
  const lastDayBounds = getLocalDateBoundariesInZone(
    monthEndLocalDate,
    params.displayZone
  );

  const monthWindow: EpochInterval = {
    startMs: firstDayBounds.startMs,
    endMs: lastDayBounds.endMs,
  };

  const shiftDetails: MonthIntersectingShiftDetail[] = [];
  const clippedWorkEpochs: EpochInterval[] = [];
  let intersectingWorkMinutes = 0;
  let fullShiftsTotalMinutes = 0;
  let boundaryCrossingShiftCount = 0;

  const activeWorkShifts = params.events.filter(
    (ev) =>
      ev.state === 'active' &&
      ev.type === 'work_shift' &&
      ev.schedule.kind === 'timed'
  );

  for (const ev of activeWorkShifts) {
    if (ev.schedule.kind !== 'timed') continue;
    const { interval } = ev.schedule;
    const startMs = Date.parse(interval.startInstant);
    const endMs = Date.parse(interval.endInstant);
    if (endMs <= startMs) continue;

    const clipped = clipIntervalToWindow({ startMs, endMs }, monthWindow);
    if (!clipped) continue;

    const fullMinutes = Math.round((endMs - startMs) / 60_000);
    const inMonthMinutes = Math.round(
      (clipped.endMs - clipped.startMs) / 60_000
    );
    const crossesMonthBoundary = inMonthMinutes < fullMinutes;

    clippedWorkEpochs.push(clipped);
    intersectingWorkMinutes += inMonthMinutes;
    fullShiftsTotalMinutes += fullMinutes;
    if (crossesMonthBoundary) {
      boundaryCrossingShiftCount++;
    }

    shiftDetails.push({
      eventId: ev.id,
      title: ev.title,
      shiftCode: ev.workProperties?.shiftCode ?? null,
      originStartLocalDate: interval.originStartLocalDate,
      originStartLocalTime: interval.originStartLocalTime,
      originEndLocalDate: interval.originEndLocalDate,
      originEndLocalTime: interval.originEndLocalTime,
      fullShiftDurationMinutes: fullMinutes,
      intersectingMonthMinutes: inMonthMinutes,
      crossesMonthBoundary,
    });
  }

  shiftDetails.sort((a, b) =>
    a.originStartLocalDate.localeCompare(b.originStartLocalDate) ||
    a.originStartLocalTime.localeCompare(b.originStartLocalTime)
  );

  const mergedWorkUnion = unionIntervals(clippedWorkEpochs);
  const unionWorkMinutesInMonth = mergedWorkUnion.reduce(
    (acc, iv) => acc + Math.round((iv.endMs - iv.startMs) / 60_000),
    0
  );

  const monthDayOffs = params.dayOffAnnotations.filter(
    (ann) =>
      ann.localDate >= monthStartLocalDate && ann.localDate <= monthEndLocalDate
  );
  const uniqueDayOffDates = Array.from(
    new Set(monthDayOffs.map((a) => a.localDate))
  );

  let mixedDayOffCarryoverCount = 0;
  for (const offDate of uniqueDayOffDates) {
    if (
      hasOvernightCarryoverOntoDate({
        localDate: offDate,
        zoneId: params.displayZone,
        allWorkShiftEvents: activeWorkShifts,
      })
    ) {
      mixedDayOffCarryoverCount++;
    }
  }

  return {
    monthStartLocalDate,
    monthEndLocalDate,
    displayZone: params.displayZone,
    intersectingShiftCount: shiftDetails.length,
    intersectingWorkMinutes,
    unionWorkMinutesInMonth,
    fullShiftsTotalMinutes,
    boundaryCrossingShiftCount,
    explicitDayOffCount: uniqueDayOffDates.length,
    mixedDayOffCarryoverCount,
    shiftDetails,
  };
}
