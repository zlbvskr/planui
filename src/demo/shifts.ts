import { CalendarEvent, DayOffAnnotation, ShiftTemplate } from '../domain/types';
import { atDate, buildTimedSchedule, DEMO_AREA_KEYS, DEMO_PREFIX } from './common';

export const DEMO_SHIFT_TEMPLATES = {
  day: `${DEMO_PREFIX}shift-template-day`,
  night: `${DEMO_PREFIX}shift-template-night`,
} as const;

export function buildDemoShiftTemplates(nowIso: string): ShiftTemplate[] {
  return [
    {
      id: DEMO_SHIFT_TEMPLATES.day,
      name: 'Денна',
      code: 'Д',
      kind: 'day',
      startLocalTime: '08:00',
      endLocalTime: '20:00',
      endDateOffsetDays: 0,
      color: 'work',
      areaId: DEMO_AREA_KEYS.work,
      note: 'Денна робоча зміна',
      isDemo: true,
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: DEMO_SHIFT_TEMPLATES.night,
      name: 'Нічна',
      code: 'Н',
      kind: 'night',
      startLocalTime: '20:00',
      endLocalTime: '08:00',
      endDateOffsetDays: 1,
      color: 'work',
      areaId: DEMO_AREA_KEYS.work,
      note: 'Нічна зміна переходить на наступний ранок',
      isDemo: true,
      order: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
  ];
}

export function buildDemoShiftsAndDaysOff(
  baseToday: string,
  zone: string,
  nowIso: string
): { shiftEvents: CalendarEvent[]; dayOffAnnotations: DayOffAnnotation[] } {
  const shiftEvents: CalendarEvent[] = [];
  const dayOffAnnotations: DayOffAnnotation[] = [];

  for (let offset = -10; offset <= 40; offset++) {
    // 8-day cycle: offset = -1 is cycle day 0
    const cycleDay = ((offset - (-1)) % 8 + 8) % 8;

    if (cycleDay === 0 || cycleDay === 1) {
      // Night shift: 20:00 to 08:00 next day (ONE record)
      shiftEvents.push({
        id: `${DEMO_PREFIX}shift-night-${offset}`,
        title: 'Нічна зміна',
        note: 'Чергування',
        type: 'work_shift',
        color: 'work',
        areaId: DEMO_AREA_KEYS.work,
        isBlocking: true,
        state: 'active',
        schedule: buildTimedSchedule(baseToday, zone, offset, '20:00', offset + 1, '08:00'),
        workProperties: {
          shiftName: 'Нічна',
          shiftCode: 'Н',
          sourceTemplateId: DEMO_SHIFT_TEMPLATES.night,
        },
        isDemo: true,
        order: offset,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });
    } else if (cycleDay === 4 || cycleDay === 5) {
      // Day shift: 08:00 to 20:00
      shiftEvents.push({
        id: `${DEMO_PREFIX}shift-day-${offset}`,
        title: 'Денна зміна',
        note: 'Чергування',
        type: 'work_shift',
        color: 'work',
        areaId: DEMO_AREA_KEYS.work,
        isBlocking: true,
        state: 'active',
        schedule: buildTimedSchedule(baseToday, zone, offset, '08:00', offset, '20:00'),
        workProperties: {
          shiftName: 'Денна',
          shiftCode: 'Д',
          sourceTemplateId: DEMO_SHIFT_TEMPLATES.day,
        },
        isDemo: true,
        order: offset,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });
    } else {
      // Cycle days 2, 3, 6, 7 are days off ("Вихідний")
      const localDate = atDate(offset, baseToday);
      dayOffAnnotations.push({
        id: `${DEMO_PREFIX}dayoff-${localDate}`,
        localDate,
        sourceZone: zone,
        code: 'В',
        note: 'Вихідний',
        areaId: DEMO_AREA_KEYS.recovery,
        isDemo: true,
        order: offset,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });
    }
  }

  return { shiftEvents, dayOffAnnotations };
}
