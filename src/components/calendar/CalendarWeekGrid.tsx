import React, { useLayoutEffect, useRef } from "react";
import { Icon } from "../../ui/icons";
import { animateSpringTransform, isReducedMotion, springs } from "../../ui/motion";
import {
  projectScheduleForDate,
  ProjectedDaySchedule,
  ProjectedTimelineItem,
} from "../../domain/scheduling";
import { addDaysToLocalDate } from "../../domain/temporal";
import {
  CalendarEvent,
  DayOffAnnotation,
  Folder,
  Project,
  Task,
  TaskReservation,
} from "../../domain/types";
import { formatTimeRange } from "../../lib/format";
import { itemColor } from "../../domain/modelHelpers";

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
  onSelectDate: (date: string) => void;
  onSelectTask?: (task: Task, reservationId?: string) => void;
  onInspectEvent?: (event: CalendarEvent) => void;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}

const WEEKDAY_NAMES_UK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const HOUR_HEIGHT = 34; // hour ≈ 34px

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
  onSelectDate,
  onSelectTask,
  onInspectEvent,
  onInspectHabitSession,
  onPrevWeek,
  onNextWeek,
}: CalendarWeekGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prevSelectedLeftRef = useRef<{ left: number; weekStart: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Compute Monday of the week
  const d = new Date(selectedDate + "T12:00:00Z");
  const mondayOffset = -(d.getUTCDay() + 6) % 7;
  const weekStart = addDaysToLocalDate(selectedDate, mondayOffset);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const selectedBadge = root.querySelector<HTMLElement>(".calendar-day-selected");
    if (!selectedBadge) return;
    const rect = selectedBadge.getBoundingClientRect();
    const prev = prevSelectedLeftRef.current;
    prevSelectedLeftRef.current = { left: rect.left, weekStart };
    if (
      prev &&
      prev.weekStart === weekStart &&
      !isReducedMotion() &&
      Math.abs(prev.left - rect.left) > 1
    ) {
      const dx = Math.round(prev.left - rect.left);
      animateSpringTransform(
        selectedBadge,
        `translate3d(${dx}px, 0px, 0)`,
        "translate3d(0px, 0px, 0)",
        springs.smooth,
        { root },
      );
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

  // Auto-scroll time grid to now or 07:00
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const hasToday = weekDays.some((d) => d.localDate === actualTodayDate);
    let targetHour = 7;
    if (hasToday) {
      const currentHour = new Date().getHours();
      targetHour = Math.max(0, currentHour - 1);
    }
    scrollRef.current.scrollTop = targetHour * HOUR_HEIGHT;
  }, [weekStart, actualTodayDate]);

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
  const currentMinutesToday = now.getHours() * 60 + now.getMinutes();
  const nowIndicatorTop = (currentMinutesToday / 60) * HOUR_HEIGHT;

  return (
    <div
      ref={rootRef}
      className="calendar-week-grid"
      data-testid="calendar-week-grid"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Header row with day labels */}
      <div className="calendar-week-header-row">
        <div className="calendar-week-time-gutter-head" aria-hidden="true" />
        <div className="calendar-week-cols-head">
          {weekDays.map((col) => (
            <button
              type="button"
              key={col.localDate}
              data-calendar-date={col.localDate}
              aria-pressed={col.isSelected}
              onClick={() => onSelectDate(col.localDate)}
              className="calendar-week-head-btn"
            >
              <span className="calendar-week-weekday">{col.weekdayLabel}</span>
              <span
                className={`calendar-week-num ${
                  col.isSelected ? "calendar-day-selected" : ""
                } ${col.isToday ? "calendar-day-today" : ""}`}
              >
                {col.dayNumber}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. All-day items row on top */}
      <div className="calendar-week-all-day-row">
        <div className="calendar-week-all-day-label">Весь день</div>
        <div className="calendar-week-all-day-cols">
          {weekDays.map((col) => {
            const allDayItems = col.schedule.allDayItems;
            const untimedTasks = col.schedule.untimedDateOnlyTasks;
            const hasItems = allDayItems.length > 0 || untimedTasks.length > 0 || col.dayOff;

            return (
              <div
                key={col.localDate}
                className="calendar-week-all-day-cell"
                data-day-off={col.dayOff}
              >
                {allDayItems.map((item) => (
                  <button
                    type="button"
                    key={item.eventId}
                    className="calendar-week-all-day-pill"
                    style={{
                      background: itemColor(
                        events.find((e) => e.id === item.eventId),
                        { folders, projects },
                      ),
                    }}
                    onClick={() => {
                      const ev = events.find((e) => e.id === item.eventId);
                      if (ev) onInspectEvent?.(ev);
                    }}
                  >
                    {item.title}
                  </button>
                ))}
                {untimedTasks.slice(0, 2).map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    className="calendar-week-all-day-pill"
                    style={{
                      background: itemColor(task, { folders, projects }),
                    }}
                    onClick={() => onSelectTask?.(task)}
                  >
                    {task.deadline ? "◆ " : ""}{task.title}
                  </button>
                ))}
                {untimedTasks.length > 2 && (
                  <small className="calendar-week-overflow">+{untimedTasks.length - 2}</small>
                )}
                {!hasItems && <span className="calendar-week-empty-slot" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Scrollable 24-hour time grid (container ≈ 46% of window) */}
      <div
        ref={scrollRef}
        className="calendar-week-scroll-container"
        data-testid="calendar-week-scroll"
      >
        <div className="calendar-week-inner-grid">
          {/* Time gutter with hour labels (00:00 - 23:00) */}
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

          {/* 7 Columns for the 7 days */}
          <div className="calendar-week-day-columns">
            {weekDays.map((col) => {
              const items = col.schedule.timelineItems;

              // Check collisions between active blocking items
              const activeBlocking = items.filter(
                (it) => it.state === "active" && it.isBlocking,
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
                    // Tap column background selects that day
                    if (e.target === e.currentTarget) {
                      onSelectDate(col.localDate);
                    }
                  }}
                >
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
                    />
                  )}

                  {/* Timed blocks */}
                  {items.map((item) => {
                    const startMin = Math.max(0, item.segment.startMinuteOfDay);
                    const endMin = Math.min(1440, item.segment.endMinuteOfDay);
                    const durMin = Math.max(1, endMin - startMin);

                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(18, (durMin / 60) * HOUR_HEIGHT);
                    const hasConflict = conflictIds.has(item.itemKey);

                    // Colors per DESIGN.md:
                    // shifts: day yellow / night violet (unless area linked)
                    let bgGradient: string;
                    let iconName: "sun" | "moon" | "clock" = "clock";
                    let label = item.title;

                    if (item.sourceKind === "work_shift") {
                      const isContinuation = item.segment.continuesBeforeDayStart;
                      const isNight =
                        isContinuation ||
                        item.segment.continuesAfterDayEnd ||
                        item.segment.displayStartLocalTime >= "18:00" ||
                        item.segment.displayStartLocalTime < "06:00";
                      iconName = isNight ? "moon" : "sun";
                      bgGradient = isNight
                        ? "linear-gradient(180deg, var(--color-shift-night-start) 0%, var(--color-shift-night-end) 100%)"
                        : "linear-gradient(180deg, var(--color-shift-day-start) 0%, var(--color-shift-day-end) 100%)";
                      label = isNight ? "Нічна" : "Денна";
                      if (isContinuation) {
                        label = `Нічна (до ${item.segment.displayEndLocalTime})`;
                      }
                    } else {
                      const color = itemColor(
                        item.taskId
                          ? tasks.find((t) => t.id === item.taskId)
                          : events.find((e) => e.id === item.sourceId),
                        { folders, projects },
                      );
                      bgGradient = `linear-gradient(180deg, ${color} 0%, ${color} 100%)`;
                    }

                    return (
                      <button
                        type="button"
                        key={item.itemKey}
                        className={`calendar-week-block ${hasConflict ? "calendar-week-conflict" : ""}`}
                        style={{
                          top,
                          height,
                          background: bgGradient,
                        }}
                        title={`${item.title} (${item.segment.displayStartLocalTime}–${item.segment.displayEndLocalTime})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleItemClick(item);
                        }}
                      >
                        <span className="calendar-week-block-icon" aria-hidden="true">
                          <Icon name={iconName} size={11} />
                        </span>
                        <span className="calendar-week-block-text">
                          <span className="calendar-week-block-title">{label}</span>
                          {height >= 32 && (
                            <span className="calendar-week-block-time">
                              {formatTimeRange(
                                item.segment.displayStartLocalTime,
                                item.segment.displayEndLocalTime,
                              )}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
