import { CalendarEvent, DayOffAnnotation, EntityId, IanaTimeZone, IsoInstantString, LocalDateString, ShiftTemplate } from './types';
import { DstDisambiguation, addDaysToLocalDate, assertValidIanaZone, assertValidLocalDate, buildZonedIntervalFromLocalInput } from './temporal';

export const DAY_OFF_CODES_UPPER = new Set([
  'В',
  'ВИХ',
  'ВИХІДНИЙ',
  'ВИХІДНА',
  'OFF',
  'DO',
  '-',
]);






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








