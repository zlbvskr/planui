import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import { RoundButton, TintedCard, EventBar, Orb } from "../ui";
import {
  easings,
  ensureMotionRootAttribute,
  isReducedMotion,
  runInterruptibleAnimation,
  tweens,
} from "../ui/motion";
import { HabitBand } from "../components/today/HabitBand";
import {
  formatMonthYear,
  formatShortDate,
  formatTimeRange,
  sentenceCase,
} from "../lib/format";
import { CalendarGrid } from "../components/calendar/CalendarGrid";
import { CalendarWeekGrid } from "../components/calendar/CalendarWeekGrid";
import { TaskPlanningSheet } from "../components/today/TaskPlanningSheet";
import { itemColor } from "../domain/modelHelpers";
import {
  RoadmapSource,
  projectRoadmap,
  roadmapMarkers,
} from "../domain/roadmap";
import {
  CalendarSecondaryFilter,
  UnoccupiedTimeGap,
  projectMonthCalendarGrid,
  projectScheduleForDate,
} from "../domain/scheduling";
import { addDaysToLocalDate, addMonthsToLocalDate } from "../domain/temporal";
import { deadlineDate } from "../domain/today";
import {
  PlanuiSettings,
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  Habit,
  HabitEntry,
  IanaTimeZone,
  LocalDateString,
  ShiftTemplate,
  Task,
  TaskReservation,
} from "../domain/types";
import {
  CalendarViewMode,
  ImplementedCreationActionKind,
} from "../state/shellStore";
import { PlanuiRepositories } from "../storage/repositories";

export interface CalendarWorkspaceViewProps {
  roadmapSource: RoadmapSource;
  settings: PlanuiSettings;
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  mode: CalendarViewMode;
  secondaryFilter: CalendarSecondaryFilter;
  displayZone: IanaTimeZone;
  nowMs: number;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  shiftTemplates: readonly ShiftTemplate[];
  repositories: PlanuiRepositories;
  habits?: readonly Habit[];
  habitEntries?: readonly HabitEntry[];
  onChangeMode: (nextMode: CalendarViewMode) => void;
  onChangeSecondaryFilter: (nextFilter: CalendarSecondaryFilter) => void;
  onSelectDate: (nextDate: LocalDateString) => void;
  onToggleTaskState: (taskId: EntityId) => Promise<void> | void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  onInspectEvent: (event: CalendarEvent) => void;
  onOpenGapPicker?: (gap: UnoccupiedTimeGap) => void;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
  onPlanHabit?: (habitId: string, date: string) => void;
}

export function CalendarWorkspaceView({
  roadmapSource,
  settings,
  selectedDate,
  actualTodayDate,
  mode,
  secondaryFilter,
  displayZone,
  nowMs,
  events,
  reservations,
  tasks,
  dayOffAnnotations,
  shiftTemplates,
  repositories,
  habits = [],
  habitEntries = [],
  onSelectDate,
  onToggleTaskState,
  onCancelEvent,
  onInspectEvent,
  onInspectHabitSession,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
  onPlanHabit,
}: CalendarWorkspaceViewProps) {
  const [planning, setPlanning] = useState<{
    task: Task;
    reservationId?: string;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef<CalendarViewMode>(mode);
  const prevPeriodKeyRef = useRef<string>("");
  const lastDirectionRef = useRef<number>(1);

  useEffect(() => {
    onModalStateChange?.(Boolean(planning));
    return () => onModalStateChange?.(false);
  }, [Boolean(planning)]);

  const roadmapItems = useMemo(
    () => projectRoadmap(roadmapSource),
    [roadmapSource],
  );

  // Month grid projection
  const grid = useMemo(
    () =>
      projectMonthCalendarGrid({
        selectedDate,
        actualTodayDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        secondaryFilter: "all",
        maxVisibleBadges: 3,
      }),
    [
      selectedDate,
      actualTodayDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
    ],
  );

  // Selected day schedule projection for the agenda below the calendar
  const selectedSchedule = useMemo(
    () =>
      projectScheduleForDate({
        localDate: selectedDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
      }),
    [
      selectedDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
    ],
  );

  // Period title: "Листопад 2026"
  const monthTitle = sentenceCase(formatMonthYear(selectedDate)).replace(
    / р\.$/,
    "",
  );

  // Compute period key (month YYYY-MM or week Monday YYYY-MM-DD) for paging animation
  const periodKey = useMemo(() => {
    if (mode === "week") {
      const d = new Date(selectedDate + "T12:00:00Z");
      const mondayOffset = -((d.getUTCDay() + 6) % 7);
      return `week:${addDaysToLocalDate(selectedDate, mondayOffset)}`;
    }
    return `month:${selectedDate.slice(0, 7)}`;
  }, [mode, selectedDate]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    ensureMotionRootAttribute(el);

    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      prevPeriodKeyRef.current = periodKey;
      if (isReducedMotion()) {
        runInterruptibleAnimation(el, [{ opacity: 0 }, { opacity: 1 }], {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: el,
          willChange: "opacity",
        });
      } else {
        runInterruptibleAnimation(
          el,
          [
            { opacity: 0, transform: "scale(0.985)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          {
            durationMs: tweens.base,
            easing: easings.out,
            root: el,
            willChange: "transform, opacity",
          },
        );
      }
      return;
    }

    if (!prevPeriodKeyRef.current) {
      prevPeriodKeyRef.current = periodKey;
      return;
    }

    if (prevPeriodKeyRef.current !== periodKey) {
      const prev = prevPeriodKeyRef.current;
      prevPeriodKeyRef.current = periodKey;
      const dir =
        periodKey > prev ? 1 : periodKey < prev ? -1 : lastDirectionRef.current;
      if (isReducedMotion()) {
        runInterruptibleAnimation(el, [{ opacity: 0 }, { opacity: 1 }], {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: el,
          willChange: "opacity",
        });
      } else {
        const offsetPx = dir >= 0 ? 24 : -24;
        runInterruptibleAnimation(
          el,
          [
            { opacity: 0, transform: `translate3d(${offsetPx}px, 0, 0)` },
            { opacity: 1, transform: "translate3d(0px, 0, 0)" },
          ],
          {
            durationMs: tweens.base,
            easing: easings.out,
            root: el,
            willChange: "transform, opacity",
          },
        );
      }
    }
  }, [mode, periodKey]);

  const step = (direction: number) => {
    lastDirectionRef.current = direction;
    if (mode === "week") {
      onSelectDate(addDaysToLocalDate(selectedDate, direction * 7));
    } else {
      onSelectDate(addMonthsToLocalDate(selectedDate, direction));
    }
  };

  const awayFromToday =
    selectedDate !== actualTodayDate ||
    selectedDate.slice(0, 7) !== actualTodayDate.slice(0, 7);

  // Model context for resolving area colors
  const modelContext = useMemo(
    () => ({
      folders: roadmapSource.folders,
      projects: roadmapSource.projects,
      goals: roadmapSource.goals,
    }),
    [roadmapSource],
  );

  // Shifts for the selected day
  const dayShifts = useMemo(() => {
    return selectedSchedule.timelineItems
      .filter((i) => i.sourceKind === "work_shift")
      .map((shift) => {
        const isContinuation = shift.segment.continuesBeforeDayStart;
        const isNight =
          isContinuation ||
          shift.segment.continuesAfterDayEnd ||
          shift.segment.displayStartLocalTime >= "18:00" ||
          shift.segment.displayStartLocalTime < "06:00";
        const timeRange = formatTimeRange(
          shift.segment.displayStartLocalTime,
          shift.segment.displayEndLocalTime,
          shift.segment.continuesAfterDayEnd,
        );
        const originalEvent = events.find((e) => e.id === shift.sourceId);
        const resolvedColor = itemColor(originalEvent, modelContext);
        const hasCustomArea = resolvedColor !== "var(--color-neutral-slate)" && resolvedColor !== "var(--color-adjacent-day)";

        return {
          id: shift.itemKey,
          sourceId: shift.sourceId,
          title: isNight ? "Нічна зміна" : "Денна зміна",
          timeRange,
          isNight,
          isContinuation,
          color: hasCustomArea
            ? resolvedColor
            : isNight
              ? "var(--color-shift-night-start)"
              : "var(--color-shift-day-start)",
          colorEnd: hasCustomArea
            ? undefined
            : isNight
              ? "var(--color-shift-night-end)"
              : "var(--color-shift-day-end)",
          event: originalEvent,
        };
      });
  }, [selectedSchedule.timelineItems, events, modelContext]);

  // Primary shift chip for the selected day header (if any)
  const primaryShift = dayShifts[0] ?? null;

  // Events for the selected day
  const dayEvents = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      timeMeta: string;
      color: string;
      event: CalendarEvent;
    }> = [];

    // All-day events
    for (const allDay of selectedSchedule.allDayItems) {
      const ev = events.find((e) => e.id === allDay.eventId);
      if (ev) {
        list.push({
          id: allDay.eventId,
          title: allDay.title,
          timeMeta: "Увесь день",
          color: itemColor(ev, modelContext),
          event: ev,
        });
      }
    }

    // Timed events
    for (const item of selectedSchedule.timelineItems) {
      if (item.sourceKind === "event") {
        const ev = events.find((e) => e.id === item.sourceId);
        if (ev) {
          list.push({
            id: item.itemKey,
            title: item.title,
            timeMeta: formatTimeRange(
              item.segment.displayStartLocalTime,
              item.segment.displayEndLocalTime,
            ),
            color: itemColor(ev, modelContext),
            event: ev,
          });
        }
      }
    }

    return list;
  }, [selectedSchedule, events, modelContext]);

  // Tasks for the selected day
  const dayTasks = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      state: Task["state"];
      timeMeta: string;
      color: string;
      task: Task;
      reservationId?: string;
    }> = [];

    // Timed task reservations
    for (const item of selectedSchedule.timelineItems) {
      if (item.taskId) {
        const task = tasks.find((t) => t.id === item.taskId);
        if (task) {
          list.push({
            id: item.itemKey,
            title: task.title,
            state: task.state,
            timeMeta: formatTimeRange(
              item.segment.displayStartLocalTime,
              item.segment.displayEndLocalTime,
            ),
            color: itemColor(task, modelContext),
            task,
            reservationId: item.sourceId,
          });
        }
      }
    }

    // Untimed tasks / deadlines
    for (const task of selectedSchedule.untimedDateOnlyTasks) {
      const isDeadline =
        deadlineDate(task, displayZone) === selectedDate;
      list.push({
        id: task.id,
        title: task.title,
        state: task.state,
        timeMeta: isDeadline ? "◆ Термін" : "Без часу",
        color: itemColor(task, modelContext),
        task,
      });
    }

    return list;
  }, [selectedSchedule, tasks, displayZone, selectedDate, modelContext]);

  // Check if day is completely empty
  const isDayEmpty =
    dayShifts.length === 0 &&
    dayEvents.length === 0 &&
    dayTasks.length === 0 &&
    !selectedSchedule.dayOffAnnotations.length;

  return (
    <div
      className="calendar-workspace calendar-p6-window"
      data-testid="calendar-workspace"
    >
      {/* Header inside the window: month title (28px bold), ‹ ›, "Сьогодні" pill */}
      <div className="calendar-window-header" data-ui="calendar-header">
        <h1 className="calendar-window-title" data-testid="calendar-period-heading">
          {monthTitle}
        </h1>
        <div className="calendar-window-actions">
          <RoundButton
            aria-label="Попередній період"
            onClick={() => step(-1)}
          >
            <Icon name="chevron-left" size={18} />
          </RoundButton>
          <RoundButton
            aria-label="Наступний період"
            onClick={() => step(1)}
          >
            <Icon name="chevron-right" size={18} />
          </RoundButton>
          {awayFromToday && (
            <button
              type="button"
              className="ui-pill ui-pressable calendar-today-jump"
              onClick={() => onSelectDate(actualTodayDate)}
            >
              Сьогодні
            </button>
          )}
        </div>
      </div>

      {/* Main calendar area (Month or Week) */}
      <div ref={stageRef} className="calendar-view-container" data-ui="calendar-stage">
        {mode === "week" ? (
          <CalendarWeekGrid
            selectedDate={selectedDate}
            actualTodayDate={actualTodayDate}
            displayZone={displayZone}
            events={events}
            reservations={reservations}
            tasks={tasks}
            dayOffAnnotations={dayOffAnnotations}
            folders={roadmapSource.folders}
            projects={roadmapSource.projects}
            onSelectDate={onSelectDate}
            onSelectTask={(task, resId) =>
              setPlanning({ task, reservationId: resId })
            }
            onInspectEvent={onInspectEvent}
            onInspectHabitSession={onInspectHabitSession}
            onPrevWeek={() => step(-1)}
            onNextWeek={() => step(1)}
          />
        ) : (
          <CalendarGrid
            grid={grid}
            onSelect={(cell) => onSelectDate(cell.localDate)}
            onPrevMonth={() => step(-1)}
            onNextMonth={() => step(1)}
            hueForTask={(id) => {
              const task = tasks.find((t) => t.id === id);
              return itemColor(task, modelContext);
            }}
            roadmapCount={(date) =>
              roadmapMarkers(
                roadmapItems,
                date,
                settings.roadmapLayer ?? "hidden",
              ).length
            }
          />
        )}
      </div>

      {/* Under the calendar: selected day's header & agenda in common category order */}
      <div
        className="calendar-agenda-container"
        data-testid={`calendar-agenda-${selectedDate}`}
      >
        {/* Selected day header ("чт, 5 листопада" + shift chip if any) */}
        <div className="calendar-agenda-head">
          <h2 className="calendar-agenda-title">
            {sentenceCase(formatShortDate(selectedDate))}
          </h2>
          {primaryShift && (
            <span
              className="calendar-shift-badge"
              style={{
                background: primaryShift.colorEnd
                  ? `linear-gradient(180deg, ${primaryShift.color} 0%, ${primaryShift.colorEnd} 100%)`
                  : primaryShift.color,
              }}
            >
              <Icon name={primaryShift.isNight ? "moon" : "sun"} size={13} />
              <span>
                {primaryShift.title} · {primaryShift.timeRange}
              </span>
            </span>
          )}
        </div>

        {/* Explicit Day Off indicator if applicable */}
        {selectedSchedule.dayOffAnnotations.length > 0 && (
          <div className="calendar-day-off-banner">
            <span>Вихідний день</span>
          </div>
        )}

        {/* Common category order: (1) Habit band -> (2) Зміна -> (3) Події -> (4) Завдання */}
        <div className="calendar-agenda-content space-y-3">
          {/* 1. Habit band (visually separate, above everything) */}
          <HabitBand
            habits={habits}
            habitEntries={habitEntries}
            date={selectedDate}
            daysOff={dayOffAnnotations.map((d) => d.localDate)}
            folders={roadmapSource.folders}
            projects={roadmapSource.projects}
            repositories={repositories}
            onChanged={onDataChanged}
            onPlanHabit={onPlanHabit}
          />

          {/* 2. Зміна (EventBars) */}
          {dayShifts.map((shift) => (
            <EventBar
              key={shift.id}
              color={shift.color}
              colorEnd={shift.colorEnd}
              icon={shift.isNight ? "moon" : "sun"}
              title={shift.title}
              meta={shift.timeRange}
              onClick={() => {
                if (shift.event) onInspectEvent(shift.event);
              }}
            />
          ))}

          {/* 3. Події (EventBars) */}
          {dayEvents.map((ev) => (
            <EventBar
              key={ev.id}
              color={ev.color}
              icon="calendar"
              title={ev.title}
              meta={ev.timeMeta}
              onClick={() => onInspectEvent(ev.event)}
            />
          ))}

          {/* 4. Завдання (TintedCards with tinted check circle) */}
          {dayTasks.map((t) => (
            <TintedCard
              key={t.id}
              color={t.color}
              icon={
                <button
                  type="button"
                  className="planui-task-check-circle"
                  aria-label={
                    t.state === "completed"
                      ? "Позначити невиконаним"
                      : "Позначити виконаним"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTaskState(t.task.id);
                  }}
                >
                  <span
                    className={`planui-check-dot ${
                      t.state === "completed" ? "done" : ""
                    }`}
                  >
                    {t.state === "completed" && <Icon name="check" size={13} />}
                  </span>
                </button>
              }
              title={t.title}
              meta={t.timeMeta}
              onClick={() =>
                setPlanning({ task: t.task, reservationId: t.reservationId })
              }
            />
          ))}

          {/* Empty day state */}
          {isDayEmpty && (
            <div className="calendar-empty-state" data-testid="calendar-empty-day">
              <Orb color="var(--color-neutral-slate)" size={52} />
              <p className="calendar-empty-text">Нічого не заплановано</p>
              <button
                type="button"
                className="calendar-tertiary-create"
                onClick={() => onOpenGlobalCreation(undefined)}
              >
                Створити
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Task planning modal */}
      {planning && (
        <TaskPlanningSheet
          task={planning.task}
          initialReservationId={planning.reservationId}
          date={selectedDate}
          zone={displayZone}
          tasks={tasks}
          events={events}
          reservations={reservations}
          folders={roadmapSource.folders}
          projects={roadmapSource.projects}
          goals={roadmapSource.goals}
          repositories={repositories}
          onClose={() => setPlanning(null)}
          onSaved={() => onDataChanged()}
        />
      )}
    </div>
  );
}
