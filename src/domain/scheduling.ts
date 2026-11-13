import { CalendarEvent,DayOffAnnotation,EntityId,EventPaletteColor,IanaTimeZone,LocalDateString,Task,TaskReservation } from "./types";

import { ProjectedDaySegment,assertValidIanaZone,assertValidLocalDate,formatInstantInZone,getLocalDateBoundariesInZone,projectIntervalOntoLocalDates,resolveAllDayEventOccupancyInterval } from "./temporal";

import { WindowAvailabilitySummary } from './availability';

import { calculateWindowAvailability } from './availability';

export interface ProjectedTimelineItem {
  itemKey: string;
  sourceKind: 'event' | 'work_shift' | 'reservation';
  sourceId: EntityId;
  taskId: EntityId | null;
  title: string;
  note: string | null;
  color: EventPaletteColor;
  isBlocking: boolean;
  state: 'active' | 'released' | 'canceled';
  taskState: Task['state'] | null;
  segment: ProjectedDaySegment;
  releaseNoteUk: string | null;
  originZoneNoteUk: string | null;
  isActualTrackedWork: false;
}

export interface ProjectedAllDayItem {
  eventId: EntityId;
  title: string;
  note: string | null;
  color: EventPaletteColor;
  isBlocking: boolean;
  startLocalDate: LocalDateString;
  endLocalDateExclusive: LocalDateString;
  originZone: IanaTimeZone;
  travelBoundaryNoteUk: string | null;
}

export interface ProjectedDayOffInfo {
  annotationId: EntityId;
  localDate: LocalDateString;
  sourceZone: IanaTimeZone;
  code: string | null;
  note: string | null;
  isFromDifferentZone: boolean;
  hasOvernightCarryoverOnThisDate: boolean;
  zoneNoticeUk: string | null;
}

export interface ProjectedDaySchedule {
  localDate: LocalDateString;
  displayZone: IanaTimeZone;
  dayDurationMinutes: number;
  dstKind: 'normal' | 'spring_forward_short' | 'fall_back_long';
  timelineItems: ProjectedTimelineItem[];
  allDayItems: ProjectedAllDayItem[];
  dayOffAnnotations: ProjectedDayOffInfo[];
  untimedDateOnlyTasks: Task[];
  availability: WindowAvailabilitySummary;
}

/**
 * 5.1 / 5.2 / 5.3 / 5.4 / 5.6 Unified day schedule projection in `displayZone`.
 * One engine serves all temporal records (events, overnight work shifts, reservations,
 * all-day records, day-off annotations, and unoccupied gaps).
 */
export function projectScheduleForDate(params: {
  localDate: LocalDateString;
  displayZone: IanaTimeZone;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  includeReleasedReservations?: boolean;
}): ProjectedDaySchedule {
  assertValidLocalDate(params.localDate);
  assertValidIanaZone(params.displayZone);

  const dayBounds = getLocalDateBoundariesInZone(
    params.localDate,
    params.displayZone
  );
  const tasksById = new Map<EntityId, Task>(params.tasks.map((t) => [t.id, t]));
  const timelineItems: ProjectedTimelineItem[] = [];
  const allDayItems: ProjectedAllDayItem[] = [];

  for (const ev of params.events) {
    if (ev.state === 'canceled') continue;

    if (ev.schedule.kind === 'timed') {
      const segments = projectIntervalOntoLocalDates(
        ev.id,
        ev.schedule.interval,
        params.displayZone,
        params.localDate,
        params.localDate
      );
      for (const seg of segments) {
        const originZoneNoteUk = seg.originZoneDiffersFromDisplay
          ? `Час у поясі створення (${seg.originZone}): ${seg.originClockRangeLabel}`
          : null;
        timelineItems.push({
          itemKey: `event:${ev.id}:seg:${seg.segmentIndex}`,
          sourceKind: ev.type === 'work_shift' ? 'work_shift' : 'event',
          sourceId: ev.id,
          taskId: null,
          title: ev.title,
          note: ev.note,
          color: ev.color,
          isBlocking: ev.isBlocking,
          state: ev.state,
          taskState: null,
          segment: seg,
          releaseNoteUk: null,
          originZoneNoteUk,
          isActualTrackedWork: false,
        });
      }
    } else {
      // All-day event
      if (ev.isBlocking) {
        const occ = resolveAllDayEventOccupancyInterval(
          ev.schedule,
          params.displayZone
        );
        if (occ.displayedDatesTouched.includes(params.localDate)) {
          allDayItems.push({
            eventId: ev.id,
            title: ev.title,
            note: ev.note,
            color: ev.color,
            isBlocking: true,
            startLocalDate: ev.schedule.startLocalDate,
            endLocalDateExclusive: ev.schedule.endLocalDateExclusive,
            originZone: ev.schedule.originZone,
            travelBoundaryNoteUk: occ.travelBoundaryNoteUk,
          });
        }
      } else {
        // Informational all-day event retains its calendar date meaning
        if (
          params.localDate >= ev.schedule.startLocalDate &&
          params.localDate < ev.schedule.endLocalDateExclusive
        ) {
          allDayItems.push({
            eventId: ev.id,
            title: ev.title,
            note: ev.note,
            color: ev.color,
            isBlocking: false,
            startLocalDate: ev.schedule.startLocalDate,
            endLocalDateExclusive: ev.schedule.endLocalDateExclusive,
            originZone: ev.schedule.originZone,
            travelBoundaryNoteUk: null,
          });
        }
      }
    }
  }

  for (const res of params.reservations) {
    if (res.state === 'canceled') continue;
    if (res.state === 'released' && !params.includeReleasedReservations) {
      continue;
    }

    const segments = projectIntervalOntoLocalDates(
      res.id,
      res.interval,
      params.displayZone,
      params.localDate,
      params.localDate
    );
    const task = res.taskId ? tasksById.get(res.taskId) : undefined;
    const title = task ? task.title : (res.habitOccurrence ? 'Сеанс звички' : 'Запланована справа');

    for (const seg of segments) {
      let releaseNoteUk: string | null = null;
      if (res.releaseMetadata) {
        if (res.state === 'released') {
          releaseNoteUk =
            'Майбутній часовий резерв вивільнено (не займає час у розкладі).';
        } else {
          const origEndWall = formatInstantInZone(
            res.releaseMetadata.originalEndInstant,
            params.displayZone
          );
          releaseNoteUk = `Залишок резерву вивільнено о ${seg.displayEndLocalTime} (початковий план був до ${origEndWall.localTime}; це історія плану, а не підрахунок фактичної роботи).`;
        }
      }

      const originZoneNoteUk = seg.originZoneDiffersFromDisplay
        ? `Час у поясі створення (${seg.originZone}): ${seg.originClockRangeLabel}`
        : null;

      timelineItems.push({
        itemKey: `reservation:${res.id}:seg:${seg.segmentIndex}`,
        sourceKind: 'reservation',
        sourceId: res.id,
        taskId: res.taskId,
        title,
        note: task?.description ?? null,
        color: 'reservation',
        isBlocking: res.state === 'active',
        state: res.state,
        taskState: task?.state ?? null,
        segment: seg,
        releaseNoteUk,
        originZoneNoteUk,
        isActualTrackedWork: false,
      });
    }
  }

  timelineItems.sort(
    (a, b) =>
      a.segment.elapsedStartOffsetMinutes - b.segment.elapsedStartOffsetMinutes ||
      a.segment.elapsedEndOffsetMinutes - b.segment.elapsedEndOffsetMinutes
  );

  const hasOvernightCarryoverOnThisDate = timelineItems.some(
    (item) =>
      item.sourceKind === 'work_shift' && item.segment.continuesBeforeDayStart
  );

  // Day-off annotations retain sourceZone context and do not erase overnight carryover
  const dayOffAnnotations: ProjectedDayOffInfo[] = params.dayOffAnnotations
    .filter((ann) => ann.localDate === params.localDate)
    .map((ann) => {
      const isFromDifferentZone = ann.sourceZone !== params.displayZone;
      const notices: string[] = [];
      if (isFromDifferentZone) {
        notices.push(
          `Позначку вихідного створено для дати ${ann.localDate} у часовому поясі ${ann.sourceZone} (поточний пояс перегляду: ${params.displayZone}).`
        );
      }
      if (hasOvernightCarryoverOnThisDate) {
        notices.push(
          'На початку цієї дати завершується нічна зміна з попереднього дня.'
        );
      }
      return {
        annotationId: ann.id,
        localDate: ann.localDate,
        sourceZone: ann.sourceZone,
        code: ann.code,
        note: ann.note,
        isFromDifferentZone,
        hasOvernightCarryoverOnThisDate,
        zoneNoticeUk: notices.length > 0 ? notices.join(' ') : null,
      };
    });

  // Date-only task intentions remain stable on their calendar date
  const untimedDateOnlyTasks = params.tasks.filter(
    (t) =>
      t.planningState === 'date_only' &&
      t.plannedDate === params.localDate &&
      t.state !== 'canceled'
  );

  const availability = calculateWindowAvailability({
    windowStartInstant: dayBounds.startInstant,
    windowEndInstant: dayBounds.endInstant,
    displayZone: params.displayZone,
    events: params.events,
    reservations: params.reservations,
    tasks: params.tasks,
  });

  return {
    localDate: params.localDate,
    displayZone: params.displayZone,
    dayDurationMinutes: dayBounds.durationMinutes,
    dstKind: dayBounds.dstKind,
    timelineItems,
    allDayItems,
    dayOffAnnotations,
    untimedDateOnlyTasks,
    availability,
  };
}
