import React,{ useLayoutEffect,useRef } from "react";
import type { ProjectedMonthCalendarGrid,ProjectedMonthCell } from '../../domain/calendarProjection';
import { applyCalendarSecondaryFilter } from '../../domain/calendarProjection';
import { NEUTRAL_SLATE,shiftColor,tintChipStyle } from '../../domain/modelHelpers';
import { deadlineDate } from '../../domain/today';
import { formatDate,formatTime } from '../../lib/format';
import { animateSpringTransform,isReducedMotion,springs } from '../../ui/motion';

export interface CalendarGridProps {
  grid: ProjectedMonthCalendarGrid;
  onSelect: (cell: ProjectedMonthCell) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  roadmapCount?: (date: string) => number;
  hueForTask?: (id: string | null) => string;
  shiftAreaColorForEvent?: (id: string | null) => string | null;
  originEndForEvent?: (id: string | null) => string | null;
  deadlineTasksForDate?: (date: string) => readonly { id: string; title: string }[];
  compact?: boolean;
  onPaint?: (dates: string[]) => void;
  markedDates?: readonly string[];
}

interface CellChipItem {
  id: string;
  order: number;
  kind: "shift_day" | "shift_night" | "tint";
  color: string;
  areaColor?: string | null;
  title: string;
}

export function CalendarGrid({
  grid,
  onSelect,
  onPrevMonth,
  onNextMonth,
  roadmapCount = () => 0,
  hueForTask = () => NEUTRAL_SLATE,
  shiftAreaColorForEvent,
  originEndForEvent,
  deadlineTasksForDate,
  compact = false,
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
    const selectedTile = root.querySelector<HTMLElement>('.calendar-month-cell[data-selected="true"]');
    if (!selectedTile) return;
    const rect = selectedTile.getBoundingClientRect();
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
      const numEl = selectedTile.querySelector<HTMLElement>(".calendar-day-number");
      if (numEl) {
        animateSpringTransform(
          numEl,
          `translate3d(${dx * 0.18}px, ${dy * 0.18}px, 0)`,
          "translate3d(0px, 0px, 0)",
          springs.smooth,
          { root },
        );
      }
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
      className={`calendar-grid ${compact ? "calendar-grid-compact" : "calendar-month-frosted-card"}`}
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
          const hasGoalDeadline = roadmapCount(cell.localDate) > 0;
          const overnightContinuation = shifts.find(
            (s) => s.segment.continuesBeforeDayStart
          );

          const chips: CellChipItem[] = [];
          const seenTaskIds = new Set<string>();

          // 1. Shifts: ALWAYS yellow (day) or violet (night); overnight continuation is a 4px top bar, never a second chip
          for (const item of shifts) {
            const isContinuation = item.segment.continuesBeforeDayStart;
            if (isContinuation) {
              continue;
            }
            const isNight =
              item.segment.continuesAfterDayEnd ||
              item.segment.displayStartLocalTime >= "18:00" ||
              item.segment.displayStartLocalTime < "06:00";

            const realEnd =
              (item.segment.continuesAfterDayEnd
                ? originEndForEvent?.(item.sourceId)
                : null) || item.segment.displayEndLocalTime;
            const timeDesc = item.segment.continuesAfterDayEnd
              ? `${formatTime(item.segment.displayStartLocalTime)} → ${formatTime(realEnd)}`
              : `${formatTime(item.segment.displayStartLocalTime)}–${formatTime(realEnd)}`;

            chips.push({
              id: item.itemKey,
              order: 2,
              kind: isNight ? "shift_night" : "shift_day",

              color: shiftColor({ kind: isNight ? "night" : "day" }),
              areaColor: shiftAreaColorForEvent?.(item.sourceId) ?? null,
              title: `${isNight ? "Нічна" : "Денна"} зміна (${timeDesc})`,
            });
          }

          // 2. All-day events (TINT chips)
          for (const allDay of filtered.filteredAllDayItems) {
            chips.push({
              id: `allday-${allDay.eventId}`,
              order: 5,
              kind: "tint",

              color: hueForTask(allDay.eventId),
              title: allDay.title,
            });
          }

          // 3. Timed events & task reservations (TINT chips)
          for (const item of items) {
            if (item.sourceKind === "work_shift") continue;
            if (item.taskId) seenTaskIds.add(item.taskId);
            chips.push({
              id: item.itemKey,
              order: 10 + item.segment.startMinuteOfDay,
              kind: "tint",

              color: hueForTask(item.taskId ?? item.sourceId),
              title: item.title,
            });
          }

          // 4. Untimed tasks on this date (TINT chips)
          for (const task of filtered.filteredUntimedTasks) {
            if (seenTaskIds.has(task.id)) continue;
            seenTaskIds.add(task.id);
            const isDeadline =
              deadlineDate(task, cell.dayProjection.displayZone) === cell.localDate;
            chips.push({
              id: `task-${task.id}`,
              order: isDeadline ? 8 : 1500,
              kind: "tint",

              color: hueForTask(task.id),
              title: task.title,
            });
          }

          // 5. Tasks whose deadline falls on this date even if plannedDate differs
          if (deadlineTasksForDate) {
            for (const dTask of deadlineTasksForDate(cell.localDate)) {
              if (seenTaskIds.has(dTask.id)) continue;
              seenTaskIds.add(dTask.id);
              chips.push({
                id: `deadline-${dTask.id}`,
                order: 9,
                kind: "tint",

                color: hueForTask(dTask.id),
                title: dTask.title,
              });
            }
          }

          chips.sort((a, b) => a.order - b.order);

          const visibleChips = chips.slice(0, 2);
          const overflowCount = Math.max(0, chips.length - 2);

          // Full accessible Ukrainian label (no ISO dates)
          const dateLabelParts: string[] = [formatDate(cell.localDate)];
          if (cell.hasExplicitDayOff) {
            dateLabelParts.push("вихідний день");
          }
          if (shifts.length > 0) {
            const shiftDescs = shifts.map((s) => {
              const isContinuation = s.segment.continuesBeforeDayStart;
              const isNight =
                isContinuation ||
                s.segment.continuesAfterDayEnd ||
                s.segment.displayStartLocalTime >= "18:00" ||
                s.segment.displayStartLocalTime < "06:00";
              if (isContinuation) {
                return `нічна зміна до ${formatTime(s.segment.displayEndLocalTime)}`;
              }
              const realEnd =
                (s.segment.continuesAfterDayEnd
                  ? originEndForEvent?.(s.sourceId)
                  : null) || s.segment.displayEndLocalTime;
              const shiftKind = isNight ? "нічна зміна" : "денна зміна";
              return s.segment.continuesAfterDayEnd
                ? `${shiftKind} ${formatTime(s.segment.displayStartLocalTime)} → ${formatTime(realEnd)}`
                : `${shiftKind} ${formatTime(s.segment.displayStartLocalTime)}–${formatTime(realEnd)}`;
            });
            dateLabelParts.push(shiftDescs.join(", "));
          }
          if (hasGoalDeadline) {
            dateLabelParts.push("термін цілі");
          }
          const nonShiftCount = chips.filter(
            (c) => c.kind === "tint",
          ).length;
          if (nonShiftCount > 0) {
            dateLabelParts.push(
              nonShiftCount === 1
                ? "1 запис"
                : nonShiftCount < 5
                  ? `${nonShiftCount} записи`
                  : `${nonShiftCount} записів`,
            );
          }
          dateLabelParts.push(...chips.filter(chip=>chip.kind === "tint").map(chip=>chip.title));
          const fullDateAriaLabel = dateLabelParts.join(", ");

          return (
            <button
              type="button"
              key={cell.localDate}
              data-calendar-date={cell.localDate}
              data-adjacent={!cell.inActiveMonth}
              data-today={cell.isToday}
              data-selected={cell.isSelected}
              data-day-off={cell.hasExplicitDayOff}
              aria-current={cell.isToday ? "date" : undefined}
              aria-pressed={
                markedDates.length
                  ? markedDates.includes(cell.localDate)
                  : cell.isSelected
              }
              aria-label={fullDateAriaLabel}
              onClick={() => onSelect(cell)}
              className="calendar-month-cell"
            >
              {overnightContinuation && (
                <span
                  className="calendar-cell-overnight-bar"
                  data-ui="overnight-continuation-bar"
                  title={`Нічна зміна · до ${formatTime(overnightContinuation.segment.displayEndLocalTime)}`}
                  aria-hidden="true"
                />
              )}
              <span className="calendar-cell-top" aria-hidden="true">
                <span
                  className={`calendar-day-number ${cell.isSelected ? "calendar-day-selected" : ""} ${
                    cell.isToday && !cell.isSelected ? "calendar-day-today" : ""
                  }`}
                >
                  {cell.dayNumber}
                </span>
                <span className="calendar-cell-top-right">
                  {overflowCount > 0 && (
                    <small className="calendar-mini-overflow">+{overflowCount}</small>
                  )}
                  {hasGoalDeadline && (
                    <span
                      className="calendar-goal-diamond"
                      data-ui="goal-diamond"
                      title="Термін цілі"
                    />
                  )}
                </span>
              </span>

              {visibleChips.length > 0 && (
                <span className="calendar-mini-bars" aria-hidden="true">
                  {visibleChips.map((chip) => {
                    if (chip.kind === "shift_day" || chip.kind === "shift_night") {
                      const isNight = chip.kind === "shift_night";
                      return (
                        <span
                          key={chip.id}
                          className={`calendar-mini-bar ${
                            isNight
                              ? "calendar-mini-bar-shift-night"
                              : "calendar-mini-bar-shift-day"
                          }`}
                          style={
                            chip.areaColor
                              ? { borderLeft: `3px solid ${chip.areaColor}` }
                              : undefined
                          }
                          title={chip.title}
                        >

                        </span>
                      );
                    }
                    return (
                      <span
                        key={chip.id}
                        className="calendar-mini-bar calendar-mini-bar-tint"
                        style={tintChipStyle(chip.color)}
                        title={chip.title}
                      >

                      </span>
                    );
                  })}
                </span>
              )}

              {cell.hasExplicitDayOff && (
                <span
                  className="calendar-day-off-ring"
                  data-ui="day-off-ring"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
