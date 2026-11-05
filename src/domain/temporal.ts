import { formatDate, formatMonthYear, formatDateRange, formatTimeRange } from '../lib/format';
import { PlanuiError } from '../i18n/errorsUk';
import {
  EventTemporalSchedule,
  IanaTimeZone,
  IsoInstantString,
  LocalDateString,
  LocalTimeString,
  PlanuiSettings,
  ZonedInterval,
} from './types';

const LOCAL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DstDisambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

export interface ZonedWallClock {
  localDate: LocalDateString;
  localTime: LocalTimeString;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offsetMinutes: number;
  offsetLabel: string;
}

export interface LocalTimeResolutionResult {
  instant: IsoInstantString;
  epochMs: number;
  status: 'exact' | 'gap' | 'repeated';
  resolvedWallClock: ZonedWallClock;
  earlierInstant?: IsoInstantString;
  laterInstant?: IsoInstantString;
  dstNoticeUk: string | null;
}

export interface EpochInterval {
  startMs: number;
  endMs: number;
}

export interface LocalDateBoundaries {
  localDate: LocalDateString;
  zoneId: IanaTimeZone;
  startInstant: IsoInstantString;
  endInstant: IsoInstantString;
  startMs: number;
  endMs: number;
  durationMinutes: number;
  dstKind: 'normal' | 'spring_forward_short' | 'fall_back_long';
}

export interface ProjectedDaySegment {
  sourceId: string;
  localDate: LocalDateString;
  displayZone: IanaTimeZone;
  originZone: IanaTimeZone;
  segmentIndex: number;
  totalSegments: number;
  isContinuation: boolean;
  continuesBeforeDayStart: boolean;
  continuesAfterDayEnd: boolean;
  clippedStartInstant: IsoInstantString;
  clippedEndInstant: IsoInstantString;
  displayStartLocalTime: LocalTimeString;
  displayEndLocalTime: LocalTimeString;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
  elapsedStartOffsetMinutes: number;
  elapsedEndOffsetMinutes: number;
  elapsedDurationMinutes: number;
  originClockRangeLabel: string;
  originZoneDiffersFromDisplay: boolean;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getWallClockFormatter(zoneId: IanaTimeZone): Intl.DateTimeFormat {
  let cached = formatterCache.get(zoneId);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(zoneId, cached);
  }
  return cached;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month1To12: number): number {
  switch (month1To12) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export function parseLocalDateParts(
  value: string
): { year: number; month: number; day: number } | null {
  const match = LOCAL_DATE_REGEX.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) return null;
  return { year, month, day };
}

export function assertValidLocalDate(value: string): LocalDateString {
  if (!parseLocalDateParts(value)) {
    throw new PlanuiError('INVALID_LOCAL_DATE', value);
  }
  return value;
}

export function parseLocalTimeParts(
  value: string
): { hour: number; minute: number } | null {
  const match = LOCAL_TIME_REGEX.exec(value);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function assertValidLocalTime(value: string): LocalTimeString {
  if (!parseLocalTimeParts(value)) {
    throw new PlanuiError('INVALID_LOCAL_TIME', value);
  }
  return value;
}

export function assertValidIsoInstant(value: string): IsoInstantString {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    throw new PlanuiError('INVALID_INSTANT', String(value));
  }
  const ms = Date.parse(value);
  const fraction = value.split('.')[1]?.slice(0, -1) ?? '';
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19) || /[1-9]/.test(fraction.slice(3))) {
    throw new PlanuiError('INVALID_INSTANT', value);
  }
  return value;
}

export function isValidIanaZone(zoneId: string): boolean {
  if (typeof zoneId !== 'string' || zoneId.trim().length === 0) return false;
  try {
    // Construction validates the zone; reuse the same formatter for wall clocks.
    // Invalid zones still throw and are never retained in the cache.
    getWallClockFormatter(zoneId);
    return true;
  } catch {
    return false;
  }
}

export function assertValidIanaZone(zoneId: string): IanaTimeZone {
  if (!isValidIanaZone(zoneId)) {
    throw new PlanuiError('INVALID_IANA_ZONE', zoneId);
  }
  return zoneId;
}

export function detectDeviceTimeZone(): IanaTimeZone | null {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && isValidIanaZone(resolved)) {
      return resolved;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * C08 / 5.1: Calendar arithmetic for local dates.
 * Never calculates tomorrow using fixed 24-hour milliseconds on local instants.
 */
export function addDaysToLocalDate(
  localDate: LocalDateString,
  deltaDays: number
): LocalDateString {
  const parts = parseLocalDateParts(localDate);
  if (!parts) {
    throw new PlanuiError('INVALID_LOCAL_DATE', localDate);
  }
  const utcDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + Math.trunc(deltaDays))
  );
  const y = String(utcDate.getUTCFullYear()).padStart(4, '0');
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffCalendarDays(
  startLocalDate: LocalDateString,
  endLocalDate: LocalDateString
): number {
  const startParts = parseLocalDateParts(startLocalDate);
  const endParts = parseLocalDateParts(endLocalDate);
  if (!startParts) throw new PlanuiError('INVALID_LOCAL_DATE', startLocalDate);
  if (!endParts) throw new PlanuiError('INVALID_LOCAL_DATE', endLocalDate);
  const startUtc = Date.UTC(
    startParts.year,
    startParts.month - 1,
    startParts.day
  );
  const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function enumerateLocalDatesInclusive(
  startLocalDate: LocalDateString,
  endLocalDateInclusive: LocalDateString
): LocalDateString[] {
  if (compareLocalDates(endLocalDateInclusive, startLocalDate) < 0) {
    return [];
  }
  const count = diffCalendarDays(startLocalDate, endLocalDateInclusive);
  const result: LocalDateString[] = [];
  for (let i = 0; i <= count; i++) {
    result.push(addDaysToLocalDate(startLocalDate, i));
  }
  return result;
}

export function compareLocalDates(
  a: LocalDateString,
  b: LocalDateString
): number {
  assertValidLocalDate(a);
  assertValidLocalDate(b);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${h}:${m}`;
}

export function formatInstantInZone(
  instantOrMs: IsoInstantString | number,
  zoneId: IanaTimeZone
): ZonedWallClock {
  assertValidIanaZone(zoneId);
  const epochMs =
    typeof instantOrMs === 'number'
      ? instantOrMs
      : Date.parse(assertValidIsoInstant(instantOrMs));
  if (!Number.isFinite(epochMs)) {
    throw new PlanuiError('INVALID_INSTANT', String(instantOrMs));
  }

  const fmt = getWallClockFormatter(zoneId);
  const parts = fmt.formatToParts(new Date(epochMs));

  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'hour') {
      const h = Number(part.value);
      hour = h === 24 ? 0 : h;
    } else if (part.type === 'minute') minute = Number(part.value);
    else if (part.type === 'second') second = Number(part.value);
  }

  const yStr = String(year).padStart(4, '0');
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  const hStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');

  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const truncatedEpochSecMs = Math.floor(epochMs / 1000) * 1000;
  const offsetMinutes = Math.round((wallAsUtcMs - truncatedEpochSecMs) / 60_000);

  return {
    localDate: `${yStr}-${mStr}-${dStr}`,
    localTime: `${hStr}:${minStr}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
    offsetMinutes,
    offsetLabel: formatOffsetLabel(offsetMinutes),
  };
}

/**
 * 5.1 Local-input resolution with explicit DST gap and repetition handling.
 */
export function resolveLocalDateTimeToInstant(
  localDate: LocalDateString,
  localTime: LocalTimeString,
  zoneId: IanaTimeZone,
  disambiguation: DstDisambiguation = 'compatible'
): LocalTimeResolutionResult {
  const dateParts = parseLocalDateParts(localDate);
  if (!dateParts) throw new PlanuiError('INVALID_LOCAL_DATE', localDate);
  const timeParts = parseLocalTimeParts(localTime);
  if (!timeParts) throw new PlanuiError('INVALID_LOCAL_TIME', localTime);
  assertValidIanaZone(zoneId);

  const nominalUtcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0
  );

  // Sample offsets around nominalUtcMs to capture pre-transition and post-transition offsets
  const sampleDeltasHours = [-36, -12, -4, -2, -1, 0, 1, 2, 4, 12, 36];
  const candidateOffsetsMinutes: number[] = [];
  for (const dh of sampleDeltasHours) {
    const wc = formatInstantInZone(nominalUtcMs + dh * 3_600_000, zoneId);
    if (!candidateOffsetsMinutes.includes(wc.offsetMinutes)) {
      candidateOffsetsMinutes.push(wc.offsetMinutes);
    }
  }

  // Test each offset to find exact wall-clock matches, sorted chronologically
  const candidateEpochs = candidateOffsetsMinutes
    .map((offMin) => nominalUtcMs - offMin * 60_000)
    .sort((a, b) => a - b);

  const exactMatches: { epochMs: number; wallClock: ZonedWallClock }[] = [];
  const seenEpochs = new Set<number>();

  for (const candMs of candidateEpochs) {
    if (seenEpochs.has(candMs)) continue;
    seenEpochs.add(candMs);
    const wc = formatInstantInZone(candMs, zoneId);
    if (wc.localDate === localDate && wc.localTime === localTime) {
      exactMatches.push({ epochMs: candMs, wallClock: wc });
    }
  }

  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    return {
      instant: new Date(match.epochMs).toISOString(),
      epochMs: match.epochMs,
      status: 'exact',
      resolvedWallClock: match.wallClock,
      dstNoticeUk: null,
    };
  }

  if (exactMatches.length >= 2) {
    const first = exactMatches[0];
    const last = exactMatches[exactMatches.length - 1];
    if (disambiguation === 'reject') {
      throw new PlanuiError(
        'AMBIGUOUS_LOCAL_TIME_DST_REPEAT',
        `${localDate} ${localTime} (${zoneId})`
      );
    }
    const chosen = disambiguation === 'later' ? last : first;
    const occurrenceLabelUk =
      disambiguation === 'later'
        ? 'друге входження (після переведення годинника)'
        : 'перше входження (до переведення годинника)';
    return {
      instant: new Date(chosen.epochMs).toISOString(),
      epochMs: chosen.epochMs,
      status: 'repeated',
      resolvedWallClock: chosen.wallClock,
      earlierInstant: new Date(first.epochMs).toISOString(),
      laterInstant: new Date(last.epochMs).toISOString(),
      dstNoticeUk: `Локальний час ${localTime} (${localDate}) повторюється двічі через перехід на зимовий час у поясі ${zoneId}. Обрано ${occurrenceLabelUk} (${chosen.wallClock.offsetLabel}).`,
    };
  }

  // Nonexistent local time in a DST spring-forward gap
  if (disambiguation === 'reject') {
    throw new PlanuiError(
      'NONEXISTENT_LOCAL_TIME_DST_GAP',
      `${localDate} ${localTime} (${zoneId})`
    );
  }

  const beforeWc = formatInstantInZone(nominalUtcMs - 6 * 3_600_000, zoneId);
  const afterWc = formatInstantInZone(nominalUtcMs + 6 * 3_600_000, zoneId);
  const chosenEpochMs =
    disambiguation === 'earlier'
      ? nominalUtcMs - afterWc.offsetMinutes * 60_000
      : nominalUtcMs - beforeWc.offsetMinutes * 60_000;
  const resolvedWc = formatInstantInZone(chosenEpochMs, zoneId);

  return {
    instant: new Date(chosenEpochMs).toISOString(),
    epochMs: chosenEpochMs,
    status: 'gap',
    resolvedWallClock: resolvedWc,
    dstNoticeUk: `Локальний час ${localTime} (${localDate}) пропущено через перехід на літній час у поясі ${zoneId}. Автоматично скориговано до ${resolvedWc.localTime} (${resolvedWc.offsetLabel}).`,
  };
}

/**
 * 5.1 Local date boundaries in a specific IANA zone using calendar arithmetic.
 */
export function getLocalDateBoundariesInZone(
  localDate: LocalDateString,
  zoneId: IanaTimeZone
): LocalDateBoundaries {
  assertValidLocalDate(localDate);
  assertValidIanaZone(zoneId);

  const nextLocalDate = addDaysToLocalDate(localDate, 1);
  const startRes = resolveLocalDateTimeToInstant(
    localDate,
    '00:00',
    zoneId,
    'compatible'
  );
  const endRes = resolveLocalDateTimeToInstant(
    nextLocalDate,
    '00:00',
    zoneId,
    'compatible'
  );

  const durationMinutes = Math.round((endRes.epochMs - startRes.epochMs) / 60_000);
  let dstKind: LocalDateBoundaries['dstKind'] = 'normal';
  if (durationMinutes < 1440) {
    dstKind = 'spring_forward_short';
  } else if (durationMinutes > 1440) {
    dstKind = 'fall_back_long';
  }

  return {
    localDate,
    zoneId,
    startInstant: startRes.instant,
    endInstant: endRes.instant,
    startMs: startRes.epochMs,
    endMs: endRes.epochMs,
    durationMinutes,
    dstKind,
  };
}

export function assertValidHalfOpenInstants(
  startInstant: IsoInstantString,
  endInstant: IsoInstantString
): void {
  assertValidIsoInstant(startInstant);
  assertValidIsoInstant(endInstant);
  const startMs = Date.parse(startInstant);
  const endMs = Date.parse(endInstant);
  if (endMs <= startMs) {
    throw new PlanuiError(
      'INVALID_HALF_OPEN_INTERVAL',
      `${startInstant} .. ${endInstant}`
    );
  }
}

export function validateZonedInterval(interval: ZonedInterval): ZonedInterval {
  if (!interval || typeof interval !== 'object') {
    throw new PlanuiError('INVALID_HALF_OPEN_INTERVAL');
  }
  assertValidIanaZone(interval.originZone);
  assertValidLocalDate(interval.originStartLocalDate);
  assertValidLocalTime(interval.originStartLocalTime);
  assertValidLocalDate(interval.originEndLocalDate);
  assertValidLocalTime(interval.originEndLocalTime);
  assertValidHalfOpenInstants(interval.startInstant, interval.endInstant);
  return interval;
}

export function isOvernightZonedInterval(interval: ZonedInterval): boolean {
  validateZonedInterval(interval);
  return interval.originEndLocalDate > interval.originStartLocalDate;
}

/**
 * 5.1 / 5.3 Build a validated ZonedInterval from local start/end inputs.
 * Rejects equal start/end clocks on the same date (C09: Equal clocks require clarification; do not infer 24 hours silently).
 */
export function buildZonedIntervalFromLocalInput(params: {
  startLocalDate: LocalDateString;
  startLocalTime: LocalTimeString;
  endLocalDate: LocalDateString;
  endLocalTime: LocalTimeString;
  originZone: IanaTimeZone;
  startDisambiguation?: DstDisambiguation;
  endDisambiguation?: DstDisambiguation;
}): {
  interval: ZonedInterval;
  elapsedDurationMinutes: number;
  clockLabelDurationMinutes: number;
  dstNoticesUk: string[];
} {
  assertValidLocalDate(params.startLocalDate);
  assertValidLocalTime(params.startLocalTime);
  assertValidLocalDate(params.endLocalDate);
  assertValidLocalTime(params.endLocalTime);
  assertValidIanaZone(params.originZone);

  if (
    params.startLocalDate === params.endLocalDate &&
    params.startLocalTime === params.endLocalTime
  ) {
    throw new PlanuiError(
      'EQUAL_SHIFT_CLOCKS_AMBIGUOUS',
      `${params.startLocalDate} ${params.startLocalTime}`
    );
  }

  const startResolved = resolveLocalDateTimeToInstant(
    params.startLocalDate,
    params.startLocalTime,
    params.originZone,
    params.startDisambiguation ?? 'compatible'
  );
  const endResolved = resolveLocalDateTimeToInstant(
    params.endLocalDate,
    params.endLocalTime,
    params.originZone,
    params.endDisambiguation ?? 'compatible'
  );

  if (endResolved.epochMs <= startResolved.epochMs) {
    throw new PlanuiError(
      'INVALID_HALF_OPEN_INTERVAL',
      `${params.startLocalDate} ${params.startLocalTime} .. ${params.endLocalDate} ${params.endLocalTime}`
    );
  }

  const interval: ZonedInterval = {
    startInstant: startResolved.instant,
    endInstant: endResolved.instant,
    originZone: params.originZone,
    originStartLocalDate: params.startLocalDate,
    originStartLocalTime: params.startLocalTime,
    originEndLocalDate: params.endLocalDate,
    originEndLocalTime: params.endLocalTime,
  };

  const elapsedDurationMinutes = computeElapsedDurationMinutes(
    interval.startInstant,
    interval.endInstant
  );
  const clockLabelDurationMinutes = computeClockLabelDurationMinutes(interval);
  const dstNoticesUk = [
    startResolved.dstNoticeUk,
    endResolved.dstNoticeUk,
  ].filter((n): n is string => Boolean(n));

  return {
    interval,
    elapsedDurationMinutes,
    clockLabelDurationMinutes,
    dstNoticesUk,
  };
}

/**
 * 5.3 Helper: when user enters an end clock earlier than start clock, suggest next calendar day.
 */
export function suggestEndDateForClockRange(
  startLocalDate: LocalDateString,
  startLocalTime: LocalTimeString,
  endLocalTime: LocalTimeString
): {
  suggestedEndLocalDate: LocalDateString;
  isOvernightSuggestion: boolean;
  isAmbiguousEqualClocks: boolean;
} {
  assertValidLocalDate(startLocalDate);
  const startParts = parseLocalTimeParts(startLocalTime);
  const endParts = parseLocalTimeParts(endLocalTime);
  if (!startParts || !endParts) {
    return {
      suggestedEndLocalDate: startLocalDate,
      isOvernightSuggestion: false,
      isAmbiguousEqualClocks: false,
    };
  }
  const startMin = startParts.hour * 60 + startParts.minute;
  const endMin = endParts.hour * 60 + endParts.minute;
  if (endMin === startMin) {
    return {
      suggestedEndLocalDate: startLocalDate,
      isOvernightSuggestion: false,
      isAmbiguousEqualClocks: true,
    };
  }
  if (endMin < startMin) {
    return {
      suggestedEndLocalDate: addDaysToLocalDate(startLocalDate, 1),
      isOvernightSuggestion: true,
      isAmbiguousEqualClocks: false,
    };
  }
  return {
    suggestedEndLocalDate: startLocalDate,
    isOvernightSuggestion: false,
    isAmbiguousEqualClocks: false,
  };
}

/**
 * C08 / 5.1: Distinguish actual elapsed duration from nominal wall-clock label duration.
 */
export function computeElapsedDurationMinutes(
  startInstant: IsoInstantString,
  endInstant: IsoInstantString
): number {
  assertValidHalfOpenInstants(startInstant, endInstant);
  return Math.round(
    (Date.parse(endInstant) - Date.parse(startInstant)) / 60_000
  );
}

export function computeClockLabelDurationMinutes(
  interval: Pick<
    ZonedInterval,
    | 'originStartLocalDate'
    | 'originStartLocalTime'
    | 'originEndLocalDate'
    | 'originEndLocalTime'
  >
): number {
  const daysDiff = diffCalendarDays(
    interval.originStartLocalDate,
    interval.originEndLocalDate
  );
  const startParts = parseLocalTimeParts(interval.originStartLocalTime);
  const endParts = parseLocalTimeParts(interval.originEndLocalTime);
  if (!startParts || !endParts) return 0;
  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;
  return daysDiff * 1440 + (endMinutes - startMinutes);
}

/**
 * 5.1 Half-open interval operations: clip, intersect, union, subtract.
 */
export function clipIntervalToWindow(
  interval: EpochInterval,
  window: EpochInterval
): EpochInterval | null {
  const startMs = Math.max(interval.startMs, window.startMs);
  const endMs = Math.min(interval.endMs, window.endMs);
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

export function intersectIntervals(
  a: EpochInterval,
  b: EpochInterval
): EpochInterval | null {
  return clipIntervalToWindow(a, b);
}

export function doIntervalsOverlap(
  a: EpochInterval,
  b: EpochInterval
): boolean {
  return Math.max(a.startMs, b.startMs) < Math.min(a.endMs, b.endMs);
}

export function unionIntervals(
  intervals: readonly EpochInterval[]
): EpochInterval[] {
  const valid = intervals
    .filter((iv) => iv.endMs > iv.startMs)
    .map((iv) => ({ startMs: iv.startMs, endMs: iv.endMs }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (valid.length === 0) return [];

  const merged: EpochInterval[] = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const last = merged[merged.length - 1];
    // Merge overlapping or directly adjacent half-open intervals [a, b) and [b, c)
    if (current.startMs <= last.endMs) {
      if (current.endMs > last.endMs) {
        last.endMs = current.endMs;
      }
    } else {
      merged.push(current);
    }
  }
  return merged;
}

export function subtractIntervalUnions(
  viewingWindow: EpochInterval,
  blockingIntervals: readonly EpochInterval[]
): EpochInterval[] {
  if (viewingWindow.endMs <= viewingWindow.startMs) return [];

  const clippedBlocking = blockingIntervals
    .map((iv) => clipIntervalToWindow(iv, viewingWindow))
    .filter((iv): iv is EpochInterval => iv !== null);

  const mergedBlocking = unionIntervals(clippedBlocking);
  if (mergedBlocking.length === 0) {
    return [{ startMs: viewingWindow.startMs, endMs: viewingWindow.endMs }];
  }

  const gaps: EpochInterval[] = [];
  let cursorMs = viewingWindow.startMs;

  for (const block of mergedBlocking) {
    if (block.startMs > cursorMs) {
      gaps.push({ startMs: cursorMs, endMs: block.startMs });
    }
    cursorMs = Math.max(cursorMs, block.endMs);
  }

  if (cursorMs < viewingWindow.endMs) {
    gaps.push({ startMs: cursorMs, endMs: viewingWindow.endMs });
  }

  return gaps;
}

/**
 * 5.1 / C09: Segment a ZonedInterval across local calendar dates in `displayZone`.
 * One overnight shift or cross-midnight record remains one stored record with projected day segments.
 */
export function projectIntervalOntoLocalDates(
  sourceId: string,
  interval: ZonedInterval,
  displayZone: IanaTimeZone,
  visibleStartDate?: LocalDateString,
  visibleEndDateInclusive?: LocalDateString
): ProjectedDaySegment[] {
  validateZonedInterval(interval);
  assertValidIanaZone(displayZone);

  const intervalStartMs = Date.parse(interval.startInstant);
  const intervalEndMs = Date.parse(interval.endInstant);

  // Determine the full range of local dates in displayZone touched by [intervalStartMs, intervalEndMs)
  const startWall = formatInstantInZone(intervalStartMs, displayZone);
  // Subtract 1ms from intervalEndMs so an interval ending exactly at 00:00:00.000 does not create a 0-minute segment on the next day
  const inclusiveLastMs = Math.max(intervalStartMs, intervalEndMs - 1);
  const endWall = formatInstantInZone(inclusiveLastMs, displayZone);

  const allTouchedDates = enumerateLocalDatesInclusive(
    startWall.localDate,
    endWall.localDate
  );

  const rawSegments: {
    localDate: LocalDateString;
    clipped: EpochInterval;
    dayBounds: LocalDateBoundaries;
  }[] = [];

  for (const dateStr of allTouchedDates) {
    const dayBounds = getLocalDateBoundariesInZone(dateStr, displayZone);
    const clipped = clipIntervalToWindow(
      { startMs: intervalStartMs, endMs: intervalEndMs },
      { startMs: dayBounds.startMs, endMs: dayBounds.endMs }
    );
    if (clipped) {
      rawSegments.push({ localDate: dateStr, clipped, dayBounds });
    }
  }

  const totalSegments = rawSegments.length;
  const originClockRangeLabel =
    interval.originStartLocalDate === interval.originEndLocalDate
      ? `${interval.originStartLocalTime}–${interval.originEndLocalTime}`
      : `${interval.originStartLocalDate} ${interval.originStartLocalTime} – ${interval.originEndLocalDate} ${interval.originEndLocalTime}`;

  const projected: ProjectedDaySegment[] = rawSegments.map((seg, idx) => {
    const segStartWall = formatInstantInZone(seg.clipped.startMs, displayZone);
    const segEndWall =
      seg.clipped.endMs === seg.dayBounds.endMs
        ? { localTime: '24:00' as LocalTimeString, hour: 24, minute: 0 }
        : formatInstantInZone(seg.clipped.endMs, displayZone);

    const startMinuteOfDay = segStartWall.hour * 60 + segStartWall.minute;
    const endMinuteOfDay =
      seg.clipped.endMs === seg.dayBounds.endMs
        ? 1440
        : segEndWall.hour * 60 + segEndWall.minute;

    const elapsedStartOffsetMinutes = Math.max(
      0,
      Math.round((seg.clipped.startMs - seg.dayBounds.startMs) / 60_000)
    );
    const elapsedDurationMinutes = Math.max(
      1,
      Math.round((seg.clipped.endMs - seg.clipped.startMs) / 60_000)
    );
    const elapsedEndOffsetMinutes =
      elapsedStartOffsetMinutes + elapsedDurationMinutes;

    return {
      sourceId,
      localDate: seg.localDate,
      displayZone,
      originZone: interval.originZone,
      segmentIndex: idx,
      totalSegments,
      isContinuation: idx > 0,
      continuesBeforeDayStart: seg.clipped.startMs > intervalStartMs,
      continuesAfterDayEnd: seg.clipped.endMs < intervalEndMs,
      clippedStartInstant: new Date(seg.clipped.startMs).toISOString(),
      clippedEndInstant: new Date(seg.clipped.endMs).toISOString(),
      displayStartLocalTime: segStartWall.localTime,
      displayEndLocalTime:
        seg.clipped.endMs === seg.dayBounds.endMs
          ? '00:00'
          : segEndWall.localTime,
      startMinuteOfDay,
      endMinuteOfDay: Math.max(startMinuteOfDay + 1, endMinuteOfDay),
      elapsedStartOffsetMinutes,
      elapsedEndOffsetMinutes,
      elapsedDurationMinutes,
      originClockRangeLabel,
      originZoneDiffersFromDisplay: interval.originZone !== displayZone,
    };
  });

  if (!visibleStartDate && !visibleEndDateInclusive) {
    return projected;
  }

  return projected.filter((seg) => {
    if (visibleStartDate && seg.localDate < visibleStartDate) return false;
    if (visibleEndDateInclusive && seg.localDate > visibleEndDateInclusive) {
      return false;
    }
    return true;
  });
}

/**
 * 5.2 / C08: Blocking all-day events reserve their own record-zone (`originZone`) date boundaries.
 * During travel (`displayZone !== originZone`), their occupied interval may span different displayed dates.
 */
export function resolveAllDayEventOccupancyInterval(
  schedule: Extract<EventTemporalSchedule, { kind: 'all_day' }>,
  displayZone?: IanaTimeZone
): {
  startInstant: IsoInstantString;
  endInstant: IsoInstantString;
  startMs: number;
  endMs: number;
  originZone: IanaTimeZone;
  displayedDatesTouched: LocalDateString[];
  travelBoundaryNoteUk: string | null;
} {
  assertValidLocalDate(schedule.startLocalDate);
  assertValidLocalDate(schedule.endLocalDateExclusive);
  assertValidIanaZone(schedule.originZone);
  if (
    compareLocalDates(schedule.endLocalDateExclusive, schedule.startLocalDate) <=
    0
  ) {
    throw new PlanuiError('INVALID_HALF_OPEN_INTERVAL', schedule.startLocalDate);
  }

  const startRes = resolveLocalDateTimeToInstant(
    schedule.startLocalDate,
    '00:00',
    schedule.originZone,
    'compatible'
  );
  const endRes = resolveLocalDateTimeToInstant(
    schedule.endLocalDateExclusive,
    '00:00',
    schedule.originZone,
    'compatible'
  );

  const effectiveDisplayZone = displayZone ?? schedule.originZone;
  assertValidIanaZone(effectiveDisplayZone);

  const dispStart = formatInstantInZone(startRes.epochMs, effectiveDisplayZone);
  const dispEndInclusive = formatInstantInZone(
    Math.max(startRes.epochMs, endRes.epochMs - 1),
    effectiveDisplayZone
  );
  const displayedDatesTouched = enumerateLocalDatesInclusive(
    dispStart.localDate,
    dispEndInclusive.localDate
  );

  const travelBoundaryNoteUk =
    effectiveDisplayZone !== schedule.originZone
      ? `Подія на весь день резервує межі дат (${schedule.startLocalDate} – ${schedule.endLocalDateExclusive}) у часовому поясі запису (${schedule.originZone}), тому в поточному поясі відображення (${effectiveDisplayZone}) охоплює: ${dispStart.localDate} ${dispStart.localTime} – ${
          formatInstantInZone(endRes.epochMs, effectiveDisplayZone).localDate
        } ${
          formatInstantInZone(endRes.epochMs, effectiveDisplayZone).localTime
        }.`
      : null;

  return {
    startInstant: startRes.instant,
    endInstant: endRes.instant,
    startMs: startRes.epochMs,
    endMs: endRes.epochMs,
    originZone: schedule.originZone,
    displayedDatesTouched,
    travelBoundaryNoteUk,
  };
}

/**
 * 5.2 Separate display-zone viewing from explicit rescheduling in another zone.
 * Explicit rescheduling re-anchors local clock times into `targetZone` (or shifts to new local date/time).
 */
export function rescheduleZonedIntervalInZone(
  existing: ZonedInterval,
  nextParams: {
    startLocalDate?: LocalDateString;
    startLocalTime?: LocalTimeString;
    endLocalDate?: LocalDateString;
    endLocalTime?: LocalTimeString;
    targetZone?: IanaTimeZone;
    disambiguation?: DstDisambiguation;
  }
): ZonedInterval {
  validateZonedInterval(existing);
  const originZone = nextParams.targetZone ?? existing.originZone;
  const startLocalDate =
    nextParams.startLocalDate ?? existing.originStartLocalDate;
  const startLocalTime =
    nextParams.startLocalTime ?? existing.originStartLocalTime;
  const endLocalDate = nextParams.endLocalDate ?? existing.originEndLocalDate;
  const endLocalTime = nextParams.endLocalTime ?? existing.originEndLocalTime;

  return buildZonedIntervalFromLocalInput({
    startLocalDate,
    startLocalTime,
    endLocalDate,
    endLocalTime,
    originZone,
    startDisambiguation: nextParams.disambiguation,
    endDisambiguation: nextParams.disambiguation,
  }).interval;
}

/**
 * 5.2 Evaluate device time-zone detection and foreground zone transitions.
 * - Never silently defaults to Kyiv if detection fails: flags `requiresManualZoneChoice: true`.
 * - In `device` mode, detects when device zone changed on foregrounding and explains the change in Ukrainian without rewriting stored instants.
 * - In `manual` mode, keeps manual zone fixed even if the device zone changes.
 */
export function evaluateTimeZoneStatus(
  settings: Pick<
    PlanuiSettings,
    'timeZoneMode' | 'manualTimeZone' | 'lastDetectedTimeZone'
  >,
  detectedDeviceZone: IanaTimeZone | null
): {
  effectiveZone: IanaTimeZone;
  requiresManualZoneChoice: boolean;
  zoneChangedInDeviceMode: boolean;
  previousZone: IanaTimeZone | null;
  detectedDeviceZone: IanaTimeZone | null;
  explanationBannerUk: string | null;
} {
  if (settings.timeZoneMode === 'manual' && settings.manualTimeZone) {
    return {
      effectiveZone: settings.manualTimeZone,
      requiresManualZoneChoice: false,
      zoneChangedInDeviceMode: false,
      previousZone: null,
      detectedDeviceZone,
      explanationBannerUk: null,
    };
  }

  // Device mode
  if (!detectedDeviceZone || !isValidIanaZone(detectedDeviceZone)) {
    const fallbackZone =
      settings.manualTimeZone ?? settings.lastDetectedTimeZone ?? 'UTC';
    return {
      effectiveZone: fallbackZone,
      requiresManualZoneChoice: settings.manualTimeZone === null,
      zoneChangedInDeviceMode: false,
      previousZone: null,
      detectedDeviceZone: null,
      explanationBannerUk:
        'Не вдалося автоматично визначити часовий пояс пристрою. Будь ласка, оберіть часовий пояс вручну.',
    };
  }

  const changed =
    Boolean(settings.lastDetectedTimeZone) &&
    settings.lastDetectedTimeZone !== detectedDeviceZone;

  return {
    effectiveZone: detectedDeviceZone,
    requiresManualZoneChoice: false,
    zoneChangedInDeviceMode: changed,
    previousZone: changed ? settings.lastDetectedTimeZone : null,
    detectedDeviceZone,
    explanationBannerUk: changed
      ? `Часовий пояс пристрою змінився з ${settings.lastDetectedTimeZone} на ${detectedDeviceZone}. Розклад відображається у новому поясі без перезапису збережених моментів часу.`
      : null,
  };
}

export function todayLocalDateInZone(
  zoneId: IanaTimeZone,
  nowMs: number = Date.now()
): LocalDateString {
  const safeZone = isValidIanaZone(zoneId) ? zoneId : 'UTC';
  return formatInstantInZone(nowMs, safeZone).localDate;
}

export function formatUkrainianDateHeading(localDate: LocalDateString): string {
  return formatDate(localDate);
}

export function formatUkrainianTimeRange(
  startLocalTime: LocalTimeString,
  endLocalTime: LocalTimeString,
  isOvernight: boolean = false
): string {
  return formatTimeRange(startLocalTime, endLocalTime, isOvernight);
}

// ============================================================================
// STAGE 7: MONTH & WEEK CALENDAR ARITHMETIC (MONDAY-FIRST, UKRAINIAN LOCALE)
// ============================================================================

export const MONDAY_FIRST_WEEKDAY_SHORT_UK = [
  'Пн',
  'Вт',
  'Ср',
  'Чт',
  'Пт',
  'Сб',
  'Нд',
] as const;

export const MONDAY_FIRST_WEEKDAY_FULL_UK = [
  'понеділок',
  'вівторок',
  'середа',
  'четвер',
  'п’ятниця',
  'субота',
  'неділя',
] as const;

export interface MonthGridCellDate {
  localDate: LocalDateString;
  year: number;
  month: number;
  day: number;
  weekdayIndexMondayFirst: number; // 0 = Monday .. 6 = Sunday
  rowIndex: number; // 0 .. 5 (6 stable rows)
  inActiveMonth: boolean;
  monthRelation: 'previous' | 'active' | 'next';
}

/**
 * 7.2 Monday-first weekday index (0 = Monday .. 6 = Sunday) without UTC drift.
 */
export function getMondayFirstWeekdayIndex(
  localDate: LocalDateString
): number {
  const parts = parseLocalDateParts(localDate);
  if (!parts) {
    throw new PlanuiError('INVALID_LOCAL_DATE', localDate);
  }
  const utcDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day)
  ).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return (utcDay + 6) % 7;
}

/**
 * 7.2 Add calendar months to a `LocalDateString`, clamping the day-of-month
 * to the target month's length (28, 29, 30, or 31).
 */
export function addMonthsToLocalDate(
  localDate: LocalDateString,
  deltaMonths: number
): LocalDateString {
  const parts = parseLocalDateParts(localDate);
  if (!parts) {
    throw new PlanuiError('INVALID_LOCAL_DATE', localDate);
  }
  const totalMonthsZeroBased =
    parts.year * 12 + (parts.month - 1) + Math.trunc(deltaMonths);
  const targetYear = Math.floor(totalMonthsZeroBased / 12);
  const targetMonthZeroBased = ((totalMonthsZeroBased % 12) + 12) % 12;
  const targetMonth = targetMonthZeroBased + 1;
  const maxDay = getDaysInMonth(targetYear, targetMonth);
  const clampedDay = Math.min(parts.day, maxDay);

  const y = String(targetYear).padStart(4, '0');
  const m = String(targetMonth).padStart(2, '0');
  const d = String(clampedDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getFirstDayOfMonth(
  localDate: LocalDateString
): LocalDateString {
  const parts = parseLocalDateParts(localDate);
  if (!parts) {
    throw new PlanuiError('INVALID_LOCAL_DATE', localDate);
  }
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function getLastDayOfMonth(localDate: LocalDateString): LocalDateString {
  const parts = parseLocalDateParts(localDate);
  if (!parts) {
    throw new PlanuiError('INVALID_LOCAL_DATE', localDate);
  }
  const maxDay = getDaysInMonth(parts.year, parts.month);
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(maxDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 7.2 / 7.5 Return the Monday date (`LocalDateString`) of the Monday-first week containing `localDate`.
 */
export function getMondayOfWeek(localDate: LocalDateString): LocalDateString {
  const weekdayIdx = getMondayFirstWeekdayIndex(localDate);
  return addDaysToLocalDate(localDate, -weekdayIdx);
}

/**
 * 7.5 Build the 7 consecutive Monday-to-Sunday dates for the week containing `referenceDate`.
 */
export function buildWeekDates(
  referenceDate: LocalDateString
): LocalDateString[] {
  const monday = getMondayOfWeek(referenceDate);
  const dates: LocalDateString[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDaysToLocalDate(monday, i));
  }
  return dates;
}

/**
 * 7.2 Build the stable 42-cell (7 columns × 6 rows, Monday-first) month grid
 * for the month containing `referenceDate`.
 */
export function buildMonthGridDates(
  referenceDate: LocalDateString
): MonthGridCellDate[] {
  const activeParts = parseLocalDateParts(referenceDate);
  if (!activeParts) {
    throw new PlanuiError('INVALID_LOCAL_DATE', referenceDate);
  }

  const firstOfMonth = getFirstDayOfMonth(referenceDate);
  const leadingOffsetDays = getMondayFirstWeekdayIndex(firstOfMonth);
  const gridStartDate = addDaysToLocalDate(firstOfMonth, -leadingOffsetDays);
  const activeYearMonthKey = activeParts.year * 12 + (activeParts.month - 1);

  const cells: MonthGridCellDate[] = [];
  for (let idx = 0; idx < 42; idx++) {
    const cellDate = addDaysToLocalDate(gridStartDate, idx);
    const cellParts = parseLocalDateParts(cellDate)!;
    const cellYearMonthKey = cellParts.year * 12 + (cellParts.month - 1);
    let monthRelation: MonthGridCellDate['monthRelation'] = 'active';
    if (cellYearMonthKey < activeYearMonthKey) {
      monthRelation = 'previous';
    } else if (cellYearMonthKey > activeYearMonthKey) {
      monthRelation = 'next';
    }

    cells.push({
      localDate: cellDate,
      year: cellParts.year,
      month: cellParts.month,
      day: cellParts.day,
      weekdayIndexMondayFirst: idx % 7,
      rowIndex: Math.floor(idx / 7),
      inActiveMonth: monthRelation === 'active',
      monthRelation,
    });
  }

  return cells;
}

export function formatUkrainianMonthYearHeading(
  localDate: LocalDateString
): string {
  return formatMonthYear(localDate);
}

export function formatUkrainianWeekRangeHeading(
  referenceDate: LocalDateString
): string {
  const dates = buildWeekDates(referenceDate); return formatDateRange(dates[0], dates[6], true);
}

export function formatUkrainianShortDayMonth(
  localDate: LocalDateString
): string {
  return formatDate(localDate, {day:'numeric',month:'short'});
}

