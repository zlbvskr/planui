import {Icon} from '../../ui/icons';
import { deadlineDate } from "../../domain/today";
import React, { useRef } from "react";
import { applyCalendarSecondaryFilter } from "../../domain/scheduling";
import type {
  ProjectedMonthCalendarGrid,
  ProjectedMonthCell,
} from "../../domain/scheduling";
import { formatDate, formatTimeRange } from "../../lib/format";
type Props = {
  grid: ProjectedMonthCalendarGrid;
  onSelect: (cell: ProjectedMonthCell) => void;
  onPaint?: (dates: string[]) => void;
  markedDates?: readonly string[];
  roadmapCount?: (date: string) => number;
  hueForTask?: (id: string | null) => string;
  compact?: boolean;
};
/** One canvas grid for Month, roster and stamp; source IDs survive midnight/month boundaries. */
export function CalendarGrid({
  grid,
  onSelect,
  onPaint,
  markedDates = [],
  roadmapCount = () => 0,
  hueForTask = () => "var(--color-personal)",
  compact = false,
}: Props) {
  const ignoreClick = useRef(false);
  const gesture = useRef<{
    start: string;
    dates: Set<string>;
    x: number;
    y: number;
  } | null>(null);
  const cellAt = (x: number, y: number) =>
    document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-calendar-date]")?.dataset.calendarDate;
  return (
    <div
      className={`calendar-grid ${compact ? "calendar-grid-compact" : ""}`}
      data-testid="calendar-month-grid"
      data-ui="content-start"
      onPointerDown={(e) => {
        if (!onPaint || e.button !== 0) return;
        const date = cellAt(e.clientX, e.clientY);
        if (date) {
          ignoreClick.current = false;
          gesture.current = {
            start: date,
            dates: new Set([date]),
            x: e.clientX,
            y: e.clientY,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g) return;
        const date = cellAt(e.clientX, e.clientY);
        if (date) g.dates.add(date);
      }}
      onPointerUp={() => {
        const g = gesture.current;
        gesture.current = null;
        if (g) {
          ignoreClick.current = true;
          if (g.dates.size > 1) onPaint?.([...g.dates]);
          else {
            const cell = grid.cells.find((c) => c.localDate === g.start);
            if (cell) onSelect(cell);
          }
        }
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
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
          const marks: React.ReactNode[] = shifts.map((i) => (
            <span
              key={i.itemKey}
              className="calendar-work-mark"
              title={i.title}
              aria-label={
                i.segment.continuesBeforeDayStart ||
                i.segment.continuesAfterDayEnd
                  ? "Нічна зміна"
                  : "Денна зміна"
              }
              role="img"
            >
              {i.segment.continuesBeforeDayStart ||
              i.segment.continuesAfterDayEnd
                ? <Icon name="moon" size={12}/>
                : <Icon name="sun" size={12}/>}
            </span>
          ));
          for (const item of items.filter((i) => i.sourceKind !== "work_shift"))
            marks.push(
              <i
                key={item.itemKey}
                className="calendar-dot"
                style={{ background: hueForTask(item.taskId) }}
              />,
            );
          for (const item of filtered.filteredAllDayItems)
            marks.push(
              <i
                key={item.eventId}
                className="calendar-dot"
                style={{ background: hueForTask(null) }}
              />,
            );
          for (const task of filtered.filteredUntimedTasks)
            marks.push(
              <span
                key={task.id}
                className="calendar-diamond"
                style={{ color: hueForTask(task.id) }}
              >
                {deadlineDate(task, cell.dayProjection.displayZone) ===
                cell.localDate
                  ? "◆"
                  : "•"}
              </span>,
            );
          if (roadmapCount(cell.localDate))
            marks.push(
              <span key="roadmap" className="calendar-diamond">
                ◆
              </span>,
            );
          if (cell.hasExplicitDayOff)
            marks.push(
              <span
                key="off"
                className="calendar-off"
                aria-label="Вихідний"
                role="img"
              >
                ○
              </span>,
            );
          return (
            <button
              type="button"
              key={cell.localDate}
              data-calendar-date={cell.localDate}
              data-adjacent={!cell.inActiveMonth}
              data-today={cell.isToday}
              aria-current={cell.isToday ? "date" : undefined}
              aria-pressed={
                markedDates.length
                  ? markedDates.includes(cell.localDate)
                  : cell.isSelected
              }
              aria-label={formatDate(cell.localDate)}
              onClick={(e) => {
                if (e.detail > 0 && ignoreClick.current) {
                  ignoreClick.current = false;
                  return;
                }
                onSelect(cell);
              }}
            >
              <span className="calendar-day-number">{cell.dayNumber}</span>
              <span className="calendar-marks" aria-hidden="true">
                {marks.slice(0, 3)}
                {marks.length > 3 && <small>+{marks.length - 3}</small>}
              </span>
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
