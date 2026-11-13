import React from "react";
import type { MonthGridCellDate } from "../../domain/temporal";
import { MONDAY_FIRST_WEEKDAY_SHORT_UK } from "../../domain/temporal";
import { CalendarEvent, ShiftTemplate } from "../../domain/types";
import { RoundButton } from "../../ui/buttons";
import { Icon3D } from "../../ui/Icon3D";
import { Icon } from "../../ui/icons";
import { Pill } from "../../ui/selection";
import { MONTH_NAMES_NOMINATIVE_UK } from "./editorContext";

interface ShiftStampPanelProps {
  allShiftTemplates: readonly ShiftTemplate[];
  stampTool: string;
  setStampTool: React.Dispatch<React.SetStateAction<string>>;
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  isStampReady: boolean;
  setStampMonthYear: React.Dispatch<
    React.SetStateAction<{ year: number; month: number }>
  >;
  stampMonthYear: { year: number; month: number };
  isPointerStampingRef: React.RefObject<boolean>;
  stampedInGestureRef: React.RefObject<Set<string>>;
  stampCells: MonthGridCellDate[];
  shiftsByStartDate: Map<string, CalendarEvent[]>;
  dayOffByDate: Set<string>;
  todayDate: string;
  handleStampDate: (localDate: string) => Promise<void>;
}

export function ShiftStampPanel({
  allShiftTemplates,
  stampTool,
  setStampTool,
  title,
  setTitle,
  isStampReady,
  setStampMonthYear,
  stampMonthYear,
  isPointerStampingRef,
  stampedInGestureRef,
  stampCells,
  shiftsByStartDate,
  dayOffByDate,
  todayDate,
  handleStampDate,
}: ShiftStampPanelProps) {
  return (
    <div
      className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-milky)] p-3 space-y-2.5 shadow-[var(--shadow-card)]"
      data-testid="quick-add-shift-stamp-flow"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {allShiftTemplates.map((tpl) => {
            const isNight = tpl.kind === "night" || tpl.endDateOffsetDays === 1;
            return (
              <Pill
                key={tpl.id}
                selected={stampTool === tpl.id}
                onClick={() => {
                  setStampTool(tpl.id);
                  if (!title.trim()) {
                    setTitle(tpl.name);
                  }
                }}
                data-testid={`shift-template-pill-${tpl.id}`}
                className="min-h-[34px] px-2.5 text-xs"
              >
                <Icon3D
                  name={isNight ? "moon" : "sun"}
                  color={
                    isNight ? "var(--color-purple)" : "var(--color-yellow)"
                  }
                  size={16}
                />
                <span>{tpl.name}</span>
              </Pill>
            );
          })}
          <Pill
            selected={stampTool === "day_off"}
            onClick={() => setStampTool("day_off")}
            data-testid="shift-stamp-dayoff-pill"
            className="min-h-[34px] px-3 text-xs"
          >
            Вихідний
          </Pill>
        </div>

        {!isStampReady && (
          <span
            className="text-xs font-bold text-[var(--text-secondary)]"
            data-testid="shift-select-template-hint"
          >
            Оберіть шаблон
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <RoundButton
          aria-label="Попередній місяць"
          onClick={() =>
            setStampMonthYear((prev) =>
              prev.month === 1
                ? { year: prev.year - 1, month: 12 }
                : { year: prev.year, month: prev.month - 1 },
            )
          }
        >
          <Icon name="chevron-left" size={18} />
        </RoundButton>
        <span className="text-sm font-extrabold">
          {MONTH_NAMES_NOMINATIVE_UK[stampMonthYear.month - 1]}{" "}
          {stampMonthYear.year}
        </span>
        <RoundButton
          aria-label="Наступний місяць"
          onClick={() =>
            setStampMonthYear((prev) =>
              prev.month === 12
                ? { year: prev.year + 1, month: 1 }
                : { year: prev.year, month: prev.month + 1 },
            )
          }
        >
          <Icon name="chevron-right" size={18} />
        </RoundButton>
      </div>

      <div
        className="calendar-grid calendar-grid-compact"
        onPointerUp={() => {
          isPointerStampingRef.current = false;
          stampedInGestureRef.current.clear();
        }}
        onPointerCancel={() => {
          isPointerStampingRef.current = false;
          stampedInGestureRef.current.clear();
        }}
      >
        <div className="calendar-weekdays">
          {MONDAY_FIRST_WEEKDAY_SHORT_UK.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div
          className="calendar-cells"
          data-testid="quick-add-stamp-month-grid"
        >
          {stampCells.map((cell) => {
            const dayShifts = shiftsByStartDate.get(cell.localDate) ?? [];
            const hasNight = dayShifts.some(
              (s) =>
                s.schedule.kind === "timed" &&
                s.schedule.interval.originEndLocalDate !==
                  s.schedule.interval.originStartLocalDate,
            );
            const hasDay = dayShifts.length > 0 && !hasNight;
            const isOff = dayOffByDate.has(cell.localDate);
            return (
              <button
                type="button"
                key={cell.localDate}
                disabled={!isStampReady}
                data-adjacent={!cell.inActiveMonth}
                data-today={cell.localDate === todayDate}
                data-calendar-date={cell.localDate}
                onPointerDown={(e) => {
                  if (!isStampReady) return;
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
                  isPointerStampingRef.current = true;
                  stampedInGestureRef.current = new Set([cell.localDate]);
                  void handleStampDate(cell.localDate);
                }}
                onPointerEnter={() => {
                  if (
                    isStampReady &&
                    isPointerStampingRef.current &&
                    !stampedInGestureRef.current.has(cell.localDate)
                  ) {
                    stampedInGestureRef.current.add(cell.localDate);
                    void handleStampDate(cell.localDate);
                  }
                }}
              >
                <span className="calendar-day-number">{cell.day}</span>
                <span className="calendar-marks">
                  {hasNight && (
                    <span
                      className="text-[var(--shift-night-deep)]"
                      aria-label="Нічна зміна"
                    >
                      <Icon name="moon" size={12} />
                    </span>
                  )}
                  {hasDay && (
                    <span
                      className="text-[var(--shift-day-deep)]"
                      aria-label="Денна зміна"
                    >
                      <Icon name="sun" size={12} />
                    </span>
                  )}
                  {!hasNight && !hasDay && isOff && (
                    <span className="calendar-off">В</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
