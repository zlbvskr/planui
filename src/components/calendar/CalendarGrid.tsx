import React, { useLayoutEffect, useRef } from "react";
import { Icon } from "../../ui/icons";
import { animateSpringTransform, isReducedMotion, springs } from "../../ui/motion";
import { deadlineDate } from "../../domain/today";
import { applyCalendarSecondaryFilter } from "../../domain/scheduling";
import type {
  ProjectedMonthCalendarGrid,
  ProjectedMonthCell,
} from "../../domain/scheduling";
import { formatDate, formatTimeRange } from "../../lib/format";

export interface CalendarGridProps {
  grid: ProjectedMonthCalendarGrid;
  onSelect: (cell: ProjectedMonthCell) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  roadmapCount?: (date: string) => number;
  hueForTask?: (id: string | null) => string;
  compact?: boolean;
  onPaint?: (dates: string[]) => void;
  markedDates?: readonly string[];
}

interface MiniBarItem {
  id: string;
  order: number;
  label: string;
  icon?: "sun" | "moon" | "diamond";
  bgGradient: string;
  title: string;
}

export function CalendarGrid({
  grid,
  onSelect,
  onPrevMonth,
  onNextMonth,
  roadmapCount = () => 0,
  hueForTask = () => "var(--color-personal)",
  compact = false,
  onPaint,
  markedDates = [],
}: CalendarGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prevSelectedRectRef = useRef<{ left: number; top: number; monthKey: string } | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const selectedCell = grid.cells.find((c) => c.isSelected);
  const selectedDateKey = selectedCell?.localDate ?? "";
  const activeMonthKey = grid.cells[15]?.localDate.slice(0, 7) ?? "";

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const selectedBadge = root.querySelector<HTMLElement>(".calendar-day-selected");
    if (!selectedBadge) return;
    const rect = selectedBadge.getBoundingClientRect();
    const prev = prevSelectedRectRef.current;
    prevSelectedRectRef.current = {
      left: rect.left,
      top: rect.top,
      monthKey: activeMonthKey,
    };
    if (
      prev &&
      prev.monthKey === activeMonthKey &&
      !isReducedMotion() &&
      (Math.abs(prev.left - rect.left) > 1 || Math.abs(prev.top - rect.top) > 1)
    ) {
      const dx = Math.round(prev.left - rect.left);
      const dy = Math.round(prev.top - rect.top);
      animateSpringTransform(
        selectedBadge,
        `translate3d(${dx}px, ${dy}px, 0)`,
        "translate3d(0px, 0px, 0)",
        springs.smooth,
        { root },
      );
    }
  }, [selectedDateKey, activeMonthKey]);

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
      if (dx < 0 && onNextMonth) {
        onNextMonth();
      } else if (dx > 0 && onPrevMonth) {
        onPrevMonth();
      }
    }
  };

  return (
    <div
      ref={rootRef}
      className={`calendar-grid ${compact ? "calendar-grid-compact" : ""}`}
      data-testid="calendar-month-grid"
      data-ui="content-start"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="calendar-weekdays" aria-hidden="true">
        {grid.weekdayHeadersUk.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="calendar-cells">
        {grid.cells.map((cell) => {
          const filtered = applyCalendarSecondaryFilter({
            dayProjection: cell.dayProjection,
            secondaryFilter: grid.secondaryFilter,
          });
          const items = filtered.filteredTimelineItems;
          const shifts = items.filter((i) => i.sourceKind === "work_shift");

          const miniBars: MiniBarItem[] = [];

          // 1. All-day events first
          for (const allDay of filtered.filteredAllDayItems) {
            miniBars.push({
              id: allDay.eventId,
              order: 0,
              label: allDay.title.slice(0, 8),
              bgGradient: `linear-gradient(180deg, ${hueForTask(null)} 0%, ${hueForTask(null)} 100%)`,
              title: allDay.title,
            });
          }

          // 2. Goal deadlines
          if (roadmapCount(cell.localDate) > 0) {
            miniBars.push({
              id: `goal-${cell.localDate}`,
              order: 5,
              label: "Ціль",
              icon: "diamond",
              bgGradient: "linear-gradient(180deg, var(--color-deadline-start) 0%, var(--color-deadline-end) 100%)",
              title: "Термін цілі",
            });
          }

          // 3. Task deadlines
          for (const task of filtered.filteredUntimedTasks) {
            const isDeadline =
              deadlineDate(task, cell.dayProjection.displayZone) ===
              cell.localDate;
            if (isDeadline) {
              miniBars.push({
                id: `deadline-${task.id}`,
                order: 8,
                label: task.title.slice(0, 7),
                icon: "diamond",
                bgGradient: `linear-gradient(180deg, ${hueForTask(task.id)} 0%, ${hueForTask(task.id)} 100%)`,
                title: task.title,
              });
            }
          }

          // 4. Timed items (shifts, events, tasks, reservations)
          for (const item of items) {
            if (item.sourceKind === "work_shift") {
              const isContinuation = item.segment.continuesBeforeDayStart;
              const isNight =
                isContinuation ||
                item.segment.continuesAfterDayEnd ||
                item.segment.displayStartLocalTime >= "18:00" ||
                item.segment.displayStartLocalTime < "06:00";
              const shiftGradient = isNight
                ? "linear-gradient(180deg, var(--color-shift-night-start) 0%, var(--color-shift-night-end) 100%)"
                : "linear-gradient(180deg, var(--color-shift-day-start) 0%, var(--color-shift-day-end) 100%)";

              miniBars.push({
                id: item.itemKey,
                order: isContinuation ? 1 : item.segment.startMinuteOfDay + 10,
                label: isNight ? "Нічна" : "Денна",
                icon: isNight ? "moon" : "sun",
                bgGradient: shiftGradient,
                title: `${item.title} (${item.segment.displayStartLocalTime}–${item.segment.displayEndLocalTime})`,
              });
            } else {
              // Regular timed event / task reservation
              miniBars.push({
                id: item.itemKey,
                order: item.segment.startMinuteOfDay + 10,
                label: item.title.slice(0, 8),
                bgGradient: `linear-gradient(180deg, ${hueForTask(item.taskId)} 0%, ${hueForTask(item.taskId)} 100%)`,
                title: item.title,
              });
            }
          }

          // 5. Non-deadline untimed tasks
          for (const task of filtered.filteredUntimedTasks) {
            const isDeadline =
              deadlineDate(task, cell.dayProjection.displayZone) ===
              cell.localDate;
            if (!isDeadline) {
              miniBars.push({
                id: `task-${task.id}`,
                order: 1440,
                label: task.title.slice(0, 8),
                bgGradient: `linear-gradient(180deg, ${hueForTask(task.id)} 0%, ${hueForTask(task.id)} 100%)`,
                title: task.title,
              });
            }
          }

          // Sort chronologically (all-day first)
          miniBars.sort((a, b) => a.order - b.order);

          const visibleBars = miniBars.slice(0, 3);
          const overflowCount = miniBars.length - 3;

          return (
            <button
              type="button"
              key={cell.localDate}
              data-calendar-date={cell.localDate}
              data-adjacent={!cell.inActiveMonth}
              data-today={cell.isToday}
              data-day-off={cell.hasExplicitDayOff}
              aria-current={cell.isToday ? "date" : undefined}
              aria-pressed={
                markedDates.length
                  ? markedDates.includes(cell.localDate)
                  : cell.isSelected
              }
              aria-label={formatDate(cell.localDate)}
              onClick={() => onSelect(cell)}
              className="calendar-month-cell"
            >
              <span
                className={`calendar-day-number ${cell.isSelected ? "calendar-day-selected" : ""} ${cell.isToday ? "calendar-day-today" : ""}`}
              >
                {cell.dayNumber}
              </span>

              {visibleBars.length > 0 && (
                <span className="calendar-mini-bars" aria-hidden="true">
                  {visibleBars.map((bar) => (
                    <span
                      key={bar.id}
                      className="calendar-mini-bar"
                      style={{ background: bar.bgGradient }}
                      title={bar.title}
                    >
                      {bar.icon === "sun" && <Icon name="sun" size={9} />}
                      {bar.icon === "moon" && <Icon name="moon" size={9} />}
                      {bar.icon === "diamond" && <span className="calendar-mini-diamond">◆</span>}
                      <span className="calendar-mini-label">{bar.label}</span>
                    </span>
                  ))}
                  {overflowCount > 0 && (
                    <small className="calendar-mini-overflow">+{overflowCount}</small>
                  )}
                </span>
              )}

              {/* Night bridge compatibility line */}
              {shifts
                .filter(
                  (i) =>
                    i.segment.continuesBeforeDayStart ||
                    i.segment.continuesAfterDayEnd,
                )
                .map((i) => (
                  <i
                    key={i.sourceId}
                    className="calendar-night-bridge"
                    data-source={i.sourceId}
                    data-from-previous={i.segment.continuesBeforeDayStart}
                    data-into-next={i.segment.continuesAfterDayEnd}
                    aria-label={formatTimeRange(
                      i.segment.displayStartLocalTime,
                      i.segment.displayEndLocalTime,
                    )}
                    style={{
                      left: `${i.segment.continuesBeforeDayStart ? 0 : ((Number(i.segment.displayStartLocalTime.slice(0, 2)) * 60 + Number(i.segment.displayStartLocalTime.slice(3))) * 100) / 1440}%`,
                      right: `${i.segment.continuesAfterDayEnd ? 0 : 100 - ((Number(i.segment.displayEndLocalTime.slice(0, 2)) * 60 + Number(i.segment.displayEndLocalTime.slice(3))) * 100) / 1440}%`,
                    }}
                  />
                ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
