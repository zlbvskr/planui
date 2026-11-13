import React, { useLayoutEffect, useRef } from "react";
import { animateSpringTransform, isReducedMotion, springs } from '../../ui/motion';
import { projectScheduleForDate, ProjectedTimelineItem } from '../../domain/scheduling';
import { formatInstantInZone, addDaysToLocalDate } from '../../domain/temporal';
import { deadlineDate } from '../../domain/today';
import { CalendarEvent, DayOffAnnotation, Folder, Goal, LifeAreaAssessment, LifeAreaQuestion, Project, Task, TaskReservation } from '../../domain/types';
import { formatDate, formatTime } from '../../lib/format';
import { getContrastTextColor, itemColor, orbVars, shiftAreaColor, tintChipStyle } from '../../domain/modelHelpers';

export interface CalendarWeekGridProps {
  selectedDate: string;
  actualTodayDate: string;
  displayZone: string;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly LifeAreaQuestion[];
  assessments?: readonly LifeAreaAssessment[];
  onSelectDate: (date: string) => void;
  onSelectTask?: (task: Task, reservationId?: string) => void;
  onInspectEvent?: (event: CalendarEvent) => void;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}

const WEEKDAY_NAMES_UK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const HOUR_HEIGHT = 44; // hour = 44px

export function CalendarWeekGrid({
  selectedDate,
  actualTodayDate,
  displayZone,
  events,
  reservations,
  tasks,
  dayOffAnnotations,
  folders = [],
  projects = [],
  goals = [],
  lifeAreas = [],
  assessments = [],
  onSelectDate,
  onSelectTask,
  onInspectEvent,
  onInspectHabitSession,
  onPrevWeek,
  onNextWeek,
}: CalendarWeekGridProps) {
  const modelContext = { folders, projects, goals, lifeAreas, assessments };
  const rootRef = useRef<HTMLDivElement>(null);
  const prevSelectedLeftRef = useRef<{ left: number; weekStart: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Compute Monday of the week
  const d = new Date(selectedDate + "T12:00:00Z");
  const mondayOffset = -((d.getUTCDay() + 6) % 7);
  const weekStart = addDaysToLocalDate(selectedDate, mondayOffset);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const selectedTile = root.querySelector<HTMLElement>('.calendar-week-head-btn[data-selected="true"]');
    if (!selectedTile) return;
    const rect = selectedTile.getBoundingClientRect();
    const prev = prevSelectedLeftRef.current;
    prevSelectedLeftRef.current = { left: rect.left, weekStart };
    if (
      prev &&
      prev.weekStart === weekStart &&
      !isReducedMotion() &&
      Math.abs(prev.left - rect.left) > 1
    ) {
      const dx = Math.round(prev.left - rect.left);
      const numEl = selectedTile.querySelector<HTMLElement>(".calendar-week-num");
      if (numEl) {
        animateSpringTransform(
          numEl,
          `translate3d(${dx * 0.18}px, 0px, 0)`,
          "translate3d(0px, 0px, 0)",
          springs.smooth,
          { root },
        );
      }
    }
  }, [selectedDate, weekStart]);

  // Project schedules for all 7 days
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const localDate = addDaysToLocalDate(weekStart, i);
    const schedule = projectScheduleForDate({
      localDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
    });
    const isToday = localDate === actualTodayDate;
    const isSelected = localDate === selectedDate;
    const dayOff = dayOffAnnotations.some((ann) => ann.localDate === localDate);
    const dayNumber = Number(localDate.slice(8));

    return {
      localDate,
      dayNumber,
      weekdayLabel: WEEKDAY_NAMES_UK[i],
      isToday,
      isSelected,
      dayOff,
      schedule,
    };
  });

  // Auto-scroll time grid to now - 1h (or 07:00 if away from current week)
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const hasToday = weekDays.some((day) => day.localDate === actualTodayDate);
    let targetHour = 7;
    if (hasToday) {
      const currentHour = formatInstantInZone(Date.now(), displayZone).hour;
      targetHour = Math.max(0, currentHour - 1);
    }
    scrollRef.current.scrollTop = targetHour * HOUR_HEIGHT;
  }, [weekStart, actualTodayDate, displayZone]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0 && onNextWeek) {
        onNextWeek();
      } else if (dx > 0 && onPrevWeek) {
        onPrevWeek();
      }
    }
  };

  const handleItemClick = (item: ProjectedTimelineItem) => {
    if (item.taskId) {
      const task = tasks.find((t) => t.id === item.taskId);
      if (task) {
        onSelectTask?.(task, item.sourceId);
        return;
      }
    }
    if (item.sourceKind === "reservation") {
      const res = reservations.find((r) => r.id === item.sourceId);
      if (res) {
        if (res.taskId) {
          const task = tasks.find((t) => t.id === res.taskId);
          if (task) {
            onSelectTask?.(task, res.id);
            return;
          }
        }
        onInspectHabitSession?.(res);
        return;
      }
    }
    const ev = events.find((e) => e.id === item.sourceId);
    if (ev) {
      onInspectEvent?.(ev);
    }
  };

  const now = new Date();
  const wallNow = formatInstantInZone(now.getTime(), displayZone);
  const currentMinutesToday = wallNow.hour * 60 + wallNow.minute;
  const nowIndicatorTop = (currentMinutesToday / 60) * HOUR_HEIGHT;

  return (
    <div
      ref={rootRef}
      className="calendar-week-grid calendar-week-frosted-card"
      data-testid="calendar-week-grid"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Header row: weekday + number tiles (selected = MINT GEL tile, today = coral ring) */}
      <div className="calendar-week-header-row">
        <div className="calendar-week-time-gutter-head" aria-hidden="true" />
        <div className="calendar-week-cols-head">
          {weekDays.map((col) => (
            <button
              type="button"
              key={col.localDate}
              data-calendar-date={col.localDate}
              data-selected={col.isSelected}
              data-today={col.isToday}
              data-day-off={col.dayOff}
              aria-current={col.isToday ? "date" : undefined}
              aria-pressed={col.isSelected}
              aria-label={formatDate(col.localDate)}
              onClick={() => onSelectDate(col.localDate)}
              className="calendar-week-head-btn"
            >
              <span className="calendar-week-weekday">{col.weekdayLabel}</span>
              <span
                className={`calendar-week-num ${
                  col.isSelected ? "calendar-day-selected" : ""
                } ${col.isToday && !col.isSelected ? "calendar-day-today" : ""}`}
              >
                {col.dayNumber}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. All-day row (height auto, min 26) with "Весь день" in the gutter ONLY (10px, nowrap) and TINT chips */}
      <div className="calendar-week-all-day-row">
        <div className="calendar-week-all-day-label">Весь день</div>
        <div className="calendar-week-all-day-cols">
          {weekDays.map((col) => {
            const allDayItems = col.schedule.allDayItems;
            const seenTasks = new Set<string>();
            const untimedTasks: Task[] = [];
            for (const t of col.schedule.untimedDateOnlyTasks) {
              seenTasks.add(t.id);
              untimedTasks.push(t);
            }
            for (const t of tasks) {
              if (
                t.state !== "canceled" &&
                !seenTasks.has(t.id) &&
                deadlineDate(t, displayZone) === col.localDate
              ) {
                seenTasks.add(t.id);
                untimedTasks.push(t);
              }
            }

            const totalChips = allDayItems.length + untimedTasks.length;
            const visibleAllDay = allDayItems.slice(0, 2);
            const remainingSlots = Math.max(0, 2 - visibleAllDay.length);
            const visibleTasks = untimedTasks.slice(0, remainingSlots);
            const overflow = Math.max(0, totalChips - (visibleAllDay.length + visibleTasks.length));
            const hasItems = totalChips > 0 || col.dayOff;

            return (
              <div
                key={col.localDate}
                className="calendar-week-all-day-cell"
                data-day-off={col.dayOff}
              >
                {visibleAllDay.map((item) => {
                  const ev = events.find((e) => e.id === item.eventId);
                  const color = itemColor(ev, modelContext);
                  return (
                    <button
                      type="button"
                      key={item.eventId}
                      className="calendar-week-all-day-pill"
                      style={tintChipStyle(color)}
                      title={item.title}
                      aria-label={item.title}
                      onClick={() => {
                        if (ev) onInspectEvent?.(ev);
                      }}
                    >
                      <span className="calendar-week-capsule" style={{backgroundColor:color}} aria-hidden="true" />
                    </button>
                  );
                })}
                {visibleTasks.map((task) => {
                  const color = itemColor(task, modelContext);
                  return (
                    <button
                      type="button"
                      key={task.id}
                      className="calendar-week-all-day-pill"
                      style={tintChipStyle(color)}
                      title={task.title}
                      aria-label={task.title}
                      onClick={() => onSelectTask?.(task)}
                    >
                      <span className="calendar-week-capsule" style={{backgroundColor:color}} aria-hidden="true" />
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <small className="calendar-week-overflow">+{overflow}</small>
                )}
                {col.dayOff && totalChips === 0 && (
                  <span className="calendar-day-off-ring mx-auto my-auto" aria-hidden="true" />
                )}
                {!hasItems && <span className="calendar-week-empty-slot" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. 24-hour time grid (44px gutter + 7 columns, hour rows 44px, NO inner wrappers) */}
      <div
        ref={scrollRef}
        className="calendar-week-scroll-container"
        data-testid="calendar-week-scroll"
      >
        <div className="calendar-week-time-gutter" aria-hidden="true">
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="calendar-week-hour-label"
              style={{ height: HOUR_HEIGHT }}
            >
              <span>{String(hour).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>

        <div className="calendar-week-day-columns">
          {weekDays.map((col) => {
            const items = col.schedule.timelineItems;
            // Presentation lanes only: never modify schedule intervals or conflict state.
            const groups: ProjectedTimelineItem[][] = [];
            for (const item of items.filter(it => it.sourceKind !== "work_shift").sort((a,b) => a.segment.startMinuteOfDay - b.segment.startMinuteOfDay)) {
              const group = groups[groups.length - 1];
              if (group && item.segment.startMinuteOfDay < Math.max(...group.map(it => it.segment.endMinuteOfDay))) group.push(item);
              else groups.push([item]);
            }
            const lanes = new Map<string, { column: number; columns: number; hidden: boolean }>();
            for (const group of groups) {
              const ends = [-1, -1];
              for (const item of group) {
                const column = ends.findIndex(end => end <= item.segment.startMinuteOfDay);
                lanes.set(item.itemKey, { column: Math.max(0,column), columns: group.length > 1 ? 2 : 1, hidden: column < 0 });
                if (column >= 0) ends[column] = item.segment.endMinuteOfDay;
              }
            }
            const overnightContinuationShift = items.find(
              (it) => it.sourceKind === "work_shift" && it.segment.continuesBeforeDayStart
            );

            // Check collisions between active blocking items
            const activeBlocking = items.filter(
              (it) =>
                it.state === "active" &&
                it.isBlocking &&
                it.sourceKind !== "work_shift",
            );
            const conflictIds = new Set<string>();
            for (let i = 0; i < activeBlocking.length; i++) {
              for (let j = i + 1; j < activeBlocking.length; j++) {
                const a = activeBlocking[i].segment;
                const b = activeBlocking[j].segment;
                if (
                  Math.max(a.startMinuteOfDay, b.startMinuteOfDay) <
                  Math.min(a.endMinuteOfDay, b.endMinuteOfDay)
                ) {
                  conflictIds.add(activeBlocking[i].itemKey);
                  conflictIds.add(activeBlocking[j].itemKey);
                }
              }
            }

            return (
              <div
                key={col.localDate}
                className="calendar-week-day-col"
                data-selected={col.isSelected}
                data-today={col.isToday}
                data-day-off={col.dayOff}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    onSelectDate(col.localDate);
                  }
                }}
              >
                {overnightContinuationShift && (
                  <span
                    className="calendar-col-overnight-bar"
                    data-ui="overnight-continuation-bar"
                    aria-hidden="true"
                  />
                )}
                {/* Grid hour lines */}
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="calendar-week-hour-slot"
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => onSelectDate(col.localDate)}
                  />
                ))}

                {/* Current time indicator line if today */}
                {col.isToday && (
                  <div
                    className="calendar-week-now-line"
                    style={{ top: nowIndicatorTop }}
                    aria-hidden="true"
                  />
                )}

                {groups.map(group => {
                  const hidden = group.filter(item => lanes.get(item.itemKey)?.hidden).length;
                  return hidden ? <button key={group[0].itemKey} type="button" className="calendar-week-timed-overflow" style={{ top: group[0].segment.startMinuteOfDay / 60 * HOUR_HEIGHT }} aria-label={`Ще ${hidden} записи, ${formatDate(col.localDate)}`} onClick={e => {e.stopPropagation(); onSelectDate(col.localDate);}}>+{hidden}</button> : null;
                })}
                {/* Timed blocks retain their schedule geometry; only visual lanes change. */}
                {items.map((item) => {
                  const startMin = Math.max(0, item.segment.startMinuteOfDay);
                  const endMin = Math.min(1440, item.segment.endMinuteOfDay);
                  const durMin = Math.max(1, endMin - startMin);

                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max(22, (durMin / 60) * HOUR_HEIGHT);
                  const hasConflict = conflictIds.has(item.itemKey);

                  if (item.sourceKind === "work_shift") {
                    const isContinuation = item.segment.continuesBeforeDayStart;
                    const isNight =
                      isContinuation ||
                      item.segment.continuesAfterDayEnd ||
                      item.segment.displayStartLocalTime >= "18:00" ||
                      item.segment.displayStartLocalTime < "06:00";

                    const ev = events.find((e) => e.id === item.sourceId);
                    const linkedAreaColor = shiftAreaColor(ev, modelContext);
                    const shiftLabel = isNight ? "Нічна" : "Денна";
                    const originInterval =
                      ev?.schedule.kind === "timed" ? ev.schedule.interval : null;
                    const realEnd =
                      (item.segment.continuesAfterDayEnd
                        ? (originInterval?.originEndLocalTime || item.segment.displayEndLocalTime)
                        : item.segment.displayEndLocalTime);
                    const rangeText = isContinuation
                      ? `до ${formatTime(item.segment.displayEndLocalTime)}`
                      : item.segment.continuesAfterDayEnd
                        ? `${formatTime(item.segment.displayStartLocalTime)} → ${formatTime(realEnd)}`
                        : `${formatTime(item.segment.displayStartLocalTime)}–${formatTime(realEnd)}`;

                    return (
                      <button
                        type="button"
                        key={item.itemKey}
                        data-ui="week-block"
                        data-shift={isNight ? "night" : "day"}
                        aria-label={`${shiftLabel} зміна, ${rangeText}`}
                        className={`calendar-week-block-shift-rail ${
                          isNight
                            ? "calendar-week-shift-rail-night"
                            : "calendar-week-shift-rail-day"
                        }`}
                        style={{
                          top,
                          height,
                        }}
                        title={`${shiftLabel} зміна (${rangeText})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleItemClick(item);
                        }}
                      >
                        <span className="calendar-week-capsule" style={{backgroundColor:isNight ? "var(--shift-night)" : "var(--shift-day)"}} aria-hidden="true" />
                        {linkedAreaColor && <span className="calendar-week-area-marker" style={{backgroundColor:linkedAreaColor}} aria-hidden="true"/>}
                      </button>
                    );
                  }

                  const entity = item.taskId
                    ? tasks.find((t) => t.id === item.taskId)
                    : events.find((e) => e.id === item.sourceId);
                  const color = itemColor(entity, modelContext);
                  const vars = orbVars(color);
                  const textColor = getContrastTextColor(color);
                  const lane = lanes.get(item.itemKey);
                  if (lane?.hidden) return null;

                  return (
                    <button
                      type="button"
                      key={item.itemKey}
                      data-ui="week-block"
                      aria-label={`${item.title}, ${item.segment.displayStartLocalTime}–${item.segment.displayEndLocalTime}`}
                      data-compact={lane?.columns === 2 ? "true" : undefined}
                      className={`calendar-week-block ${hasConflict ? "calendar-week-conflict" : ""}`}
                      style={{
                        top,
                        height,
                        ...vars,
                        color: textColor,
                        left: `calc(${(lane?.column ?? 0) * 100 / (lane?.columns ?? 1)}% + 1px)`,
                        right: 'auto',
                        width: `calc(${100 / (lane?.columns ?? 1)}% - 2px)`,
                      }}
                      title={`${item.title} (${item.segment.displayStartLocalTime}–${item.segment.displayEndLocalTime})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                    >
                      <span className="calendar-week-capsule" style={{backgroundColor:color}} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
