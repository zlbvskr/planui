import { addDaysToLocalDate, buildZonedIntervalFromLocalInput } from '../domain/temporal';
import { EventTemporalSchedule, ZonedInterval } from '../domain/types';

export const DEMO_PREFIX = 'demo-';

export const DEMO_AREA_KEYS = {
  health: 'life-q-1',
  mental: 'life-q-2',
  recovery: 'life-q-3',
  relationships: 'life-q-4',
  creativity: 'life-q-5',
  work: 'life-q-6',
  finance: 'life-q-7',
  learning: 'life-q-8',
  home: 'life-q-9',
  meaning: 'life-q-10',
} as const;

function isDemoId(id?: string | null): boolean {
  return typeof id === 'string' && id.startsWith(DEMO_PREFIX);
}

export function isDemoRecord<T extends { id: string; isDemo?: boolean }>(record: T): boolean {
  return Boolean(record.isDemo || isDemoId(record.id));
}

export function atDate(dayOffset: number, baseToday: string): string {
  return addDaysToLocalDate(baseToday, dayOffset);
}

export function buildInterval(
  baseToday: string,
  zone: string,
  startDayOffset: number,
  startTime: string,
  endDayOffset: number,
  endTime: string
): ZonedInterval {
  const startLocalDate = atDate(startDayOffset, baseToday);
  const endLocalDate = atDate(endDayOffset, baseToday);
  return buildZonedIntervalFromLocalInput({
    startLocalDate,
    startLocalTime: startTime,
    endLocalDate,
    endLocalTime: endTime,
    originZone: zone,
  }).interval;
}

export function buildTimedSchedule(
  baseToday: string,
  zone: string,
  startDayOffset: number,
  startTime: string,
  endDayOffset: number,
  endTime: string
): EventTemporalSchedule {
  return {
    kind: 'timed',
    interval: buildInterval(baseToday, zone, startDayOffset, startTime, endDayOffset, endTime),
  };
}

export function buildAllDaySchedule(
  baseToday: string,
  zone: string,
  startDayOffset: number,
  endDayOffsetExclusive: number
): EventTemporalSchedule {
  return {
    kind: 'all_day',
    startLocalDate: atDate(startDayOffset, baseToday),
    endLocalDateExclusive: atDate(endDayOffsetExclusive, baseToday),
    originZone: zone,
  };
}
