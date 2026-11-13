import { useEffect,useLayoutEffect,useMemo,useRef,useState } from "react";
import { CalendarGrid } from '../components/calendar/CalendarGrid';
import { CalendarWeekGrid } from '../components/calendar/CalendarWeekGrid';
import { HabitBand } from '../components/today/HabitBand';
import { TaskSheet } from '../components/today/TaskSheet';
import { UnoccupiedTimeGap } from '../domain/availability';
import { CalendarSecondaryFilter,projectMonthCalendarGrid } from '../domain/calendarProjection';
import { NEUTRAL_SLATE,areaName,itemColor,shiftAreaColor,shiftColor } from '../domain/modelHelpers';
import { RoadmapSource,projectRoadmap,roadmapMarkers } from '../domain/roadmap';
import { projectScheduleForDate } from '../domain/scheduling';
import { addDaysToLocalDate,addMonthsToLocalDate } from '../domain/temporal';
import { deadlineDate } from '../domain/today';
import { CalendarEvent,DayOffAnnotation,EntityId,Habit,HabitEntry,IanaTimeZone,LifeAreaAssessment,LifeAreaQuestion,LocalDateString,PlanuiSettings,ShiftTemplate,Task,TaskReservation } from '../domain/types';
import { formatDate,formatMonthYear,formatSegmentTimeRange,formatTime,formatTimeRange,sentenceCase } from '../lib/format';
import { CalendarViewMode,ImplementedCreationActionKind } from '../state/shellStore';
import { PlanuiRepositories } from '../storage/repositories';
import { RoundButton } from '../ui/buttons';
import { ClayBadge } from '../ui/ClayBadge';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/icons';
import { easings,ensureMotionRootAttribute,isReducedMotion,runInterruptibleAnimation,tweens } from '../ui/motion';
import { SoftRow } from '../ui/rows';

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
  lifeAreaQuestions?: readonly LifeAreaQuestion[];
  lifeAreaAssessments?: readonly LifeAreaAssessment[];
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
  displayZone,
  events,
  reservations,
  tasks,
  dayOffAnnotations,
  repositories,
  habits = [],
  habitEntries = [],
  lifeAreaQuestions = [],
  lifeAreaAssessments = [],
  onSelectDate,
  onToggleTaskState,
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
        maxVisibleBadges: 2,
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

  const awayFromToday = selectedDate !== actualTodayDate;

  // Model context for resolving area colors and names
  const modelContext = useMemo(
    () => ({
      folders: roadmapSource.folders,
      projects: roadmapSource.projects,
      goals: roadmapSource.goals,
      lifeAreas: lifeAreaQuestions,
      assessments: lifeAreaAssessments,
    }),
    [roadmapSource, lifeAreaQuestions, lifeAreaAssessments],
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
        const originalEvent = events.find((e) => e.id === shift.sourceId);
        const originInterval =
          originalEvent?.schedule.kind === "timed"
            ? originalEvent.schedule.interval
            : null;
        const realEnd =
          (shift.segment.continuesAfterDayEnd
            ? originInterval?.originEndLocalTime || shift.segment.displayEndLocalTime
            : shift.segment.displayEndLocalTime);
        const realStart =
          originInterval?.originStartLocalTime || shift.segment.displayStartLocalTime;
        const timeRange = formatSegmentTimeRange(shift.segment, originInterval);
        const linkedAreaColor = shiftAreaColor(originalEvent, modelContext);
        const areaLabel = areaName(originalEvent, modelContext);

        const shortKind = isNight ? "Нічна" : "Денна";
        const chipLabel = isContinuation
          ? `Нічна · до ${formatTime(realEnd)}`
          : isNight
            ? `Нічна · ${formatTime(realStart)} → ${formatTime(realEnd)}`
            : `Денна · ${formatTime(realStart)}–${formatTime(realEnd)}`;

        const rowTitle = isContinuation
          ? `Продовження нічної зміни · до ${formatTime(realEnd)}`
          : isNight
            ? `Нічна зміна · з ${formatTime(realStart)} до ${formatTime(realEnd)}${shift.segment.continuesAfterDayEnd ? " (завтра)" : ""}`
            : `Денна зміна · з ${formatTime(realStart)} до ${formatTime(realEnd)}`;

        return {
          id: shift.itemKey,
          sourceId: shift.sourceId,
          title: isNight ? "Нічна зміна" : "Денна зміна",
          rowTitle,
          shortKind,
          chipLabel,
          timeRange,
          areaLabel,
          isNight,
          isContinuation,
          linkedAreaColor,
          color: shiftColor(originalEvent ?? { kind: isNight ? "night" : "day" }),
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
        const name = areaName(ev, modelContext);
        list.push({
          id: allDay.eventId,
          title: allDay.title,
          timeMeta: name ? `Весь день · ${name}` : "Весь день",
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
          const rangeStr = formatTimeRange(
            item.segment.displayStartLocalTime,
            item.segment.displayEndLocalTime,
          );
          const name = areaName(ev, modelContext);
          list.push({
            id: item.itemKey,
            title: item.title,
            timeMeta: name ? `${rangeStr} · ${name}` : rangeStr,
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
    const seenTaskIds = new Set<string>();

    // Timed task reservations
    for (const item of selectedSchedule.timelineItems) {
      if (item.taskId) {
        const task = tasks.find((t) => t.id === item.taskId);
        if (task) {
          seenTaskIds.add(task.id);
          const rangeStr = formatTimeRange(
            item.segment.displayStartLocalTime,
            item.segment.displayEndLocalTime,
          );
          const name = areaName(task, modelContext);
          list.push({
            id: item.itemKey,
            title: task.title,
            state: task.state,
            timeMeta: name ? `${rangeStr} · ${name}` : rangeStr,
            color: itemColor(task, modelContext),
            task,
            reservationId: item.sourceId,
          });
        }
      }
    }

    // Untimed tasks on this date
    for (const task of selectedSchedule.untimedDateOnlyTasks) {
      if (seenTaskIds.has(task.id)) continue;
      seenTaskIds.add(task.id);
      const isDeadline = deadlineDate(task, displayZone) === selectedDate;
      const baseMeta = isDeadline ? "◆ Термін" : "Без часу";
      const name = areaName(task, modelContext);
      list.push({
        id: task.id,
        title: task.title,
        state: task.state,
        timeMeta: name ? `${baseMeta} · ${name}` : baseMeta,
        color: itemColor(task, modelContext),
        task,
      });
    }

    // Tasks whose deadline falls on selectedDate even if plannedDate differs
    for (const task of tasks) {
      if (
        task.state !== "canceled" &&
        !seenTaskIds.has(task.id) &&
        deadlineDate(task, displayZone) === selectedDate
      ) {
        seenTaskIds.add(task.id);
        const name = areaName(task, modelContext);
        list.push({
          id: `deadline-${task.id}`,
          title: task.title,
          state: task.state,
          timeMeta: name ? `◆ Термін · ${name}` : "◆ Термін",
          color: itemColor(task, modelContext),
          task,
        });
      }
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
      {/* 1) HEADER (compact): ONE row: month title 24/800, round ‹ › (32px) next to it, "Сьогодні" pill only when away, ClayBadge (52px) at right */}
      <div className="calendar-window-header" data-ui="calendar-header">
        <div className="calendar-window-header-left">
          <h1
            className="calendar-window-title capitalize m-0"
            data-testid="calendar-period-heading"
          >
            {monthTitle}
          </h1>
          <div className="calendar-window-nav-controls">
            <RoundButton
              size={32}
              variant="frosted"
              aria-label="Попередній період"
              onClick={() => step(-1)}
            >
              <Icon name="chevron-left" size={16} />
            </RoundButton>
            <RoundButton
              size={32}
              variant="frosted"
              aria-label="Наступний період"
              onClick={() => step(1)}
            >
              <Icon name="chevron-right" size={16} />
            </RoundButton>
            {awayFromToday && (
              <button
                type="button"
                className="calendar-today-pill ui-pressable"
                onClick={() => onSelectDate(actualTodayDate)}
              >
                Сьогодні
              </button>
            )}
          </div>
        </div>
        <ClayBadge
          shape="calendar"
          size={52}
          dayNumber={Number(actualTodayDate.slice(8, 10))}
          className="shrink-0"
        />
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
            goals={roadmapSource.goals}
            lifeAreas={lifeAreaQuestions}
            assessments={lifeAreaAssessments}
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
              if (!id) return NEUTRAL_SLATE;
              const task = tasks.find((t) => t.id === id);
              if (task) return itemColor(task, modelContext);
              const ev = events.find((e) => e.id === id);
              if (ev) return itemColor(ev, modelContext);
              return NEUTRAL_SLATE;
            }}
            shiftAreaColorForEvent={(id) => {
              if (!id) return null;
              const ev = events.find((e) => e.id === id);
              return shiftAreaColor(ev, modelContext);
            }}
            originEndForEvent={(id) => {
              if (!id) return null;
              const ev = events.find((e) => e.id === id);
              if (ev?.schedule.kind === "timed") {
                return ev.schedule.interval.originEndLocalTime;
              }
              return null;
            }}
            deadlineTasksForDate={(date) =>
              tasks.filter(
                (t) =>
                  t.state !== "canceled" &&
                  deadlineDate(t, displayZone) === date,
              )
            }
            roadmapCount={(date) => {
              const goalHit = roadmapSource.goals.some(
                (g) =>
                  !g.archived &&
                  g.state === "active" &&
                  (g.timing?.targetDate === date ||
                    (g as { endDate?: string }).endDate === date),
              );
              const markerHit =
                roadmapMarkers(
                  roadmapItems,
                  date,
                  settings.roadmapLayer && settings.roadmapLayer !== "hidden"
                    ? settings.roadmapLayer
                    : "periods",
                ).filter((m) => m.kind === "deadline").length > 0;
              return goalHit || markerHit ? 1 : 0;
            }}
          />
        )}
      </div>

      {/* Under the grid: selected-day row "Вт, 10 листопада" (15/800) + shift chip, then list in common order */}
      <div
        className="calendar-agenda-container"
        data-testid={`calendar-agenda-${selectedDate}`}
      >
        <div className="calendar-agenda-head">
          <h2 className="calendar-agenda-title m-0">
            {sentenceCase(
              formatDate(selectedDate, {
                weekday: "short",
                day: "numeric",
                month: "long",
              }),
            )}
          </h2>
          {primaryShift && (
            <span
              className={`calendar-shift-badge ${
                primaryShift.isNight
                  ? "calendar-shift-badge-night"
                  : "calendar-shift-badge-day"
              }`}
            >
              <Icon name={primaryShift.isNight ? "moon" : "sun"} size={12} />
              {primaryShift.linkedAreaColor && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: primaryShift.linkedAreaColor }}
                  aria-hidden="true"
                />
              )}
              <span>{primaryShift.chipLabel}</span>
            </span>
          )}
        </div>

        {/* Explicit Day Off indicator if applicable */}
        {selectedSchedule.dayOffAnnotations.length > 0 && (
          <div className="calendar-day-off-banner mb-2.5">
            <span className="calendar-day-off-ring" aria-hidden="true" />
            <span>Вихідний день</span>
          </div>
        )}

        {/* Common category order: (1) Shifts (44px rows) -> (2) Habit band -> (3) Events (Rows with color rail) -> (4) Tasks (Rows with color rail) */}
        <div className="calendar-agenda-content space-y-2">
          {/* 1. Shifts: 44px rows (not tall gel bars) */}
          {dayShifts.map((shift) => (
            <div
              key={shift.id}
              className="calendar-agenda-shift-row ui-soft-row flex items-center justify-between gap-2.5 h-[44px] min-h-[44px] px-3.5 rounded-[20px] cursor-pointer"
              style={{
                borderLeft: `4px solid ${shift.color}`,
              }}
              onClick={() => {
                if (shift.event) onInspectEvent(shift.event);
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0"
                  style={{ color: shift.isNight ? "var(--shift-night)" : "var(--shift-day)" }}
                >
                  <Icon name={shift.isNight ? "moon" : "sun"} size={18} />
                </span>
                <span className="font-bold text-[14px] leading-[18px] text-[var(--text-primary)] whitespace-normal break-words">
                  {shift.rowTitle}
                </span>
              </div>
              {shift.areaLabel && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: shift.linkedAreaColor || NEUTRAL_SLATE }}
                    aria-hidden="true"
                  />
                  <span className="text-[12px] font-semibold text-[var(--text-secondary)] whitespace-normal break-words max-w-[120px]">
                    {shift.areaLabel}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* 2. Habit band (32px chips, no clipped box) */}
          <HabitBand
            habits={habits}
            habitEntries={habitEntries}
            date={selectedDate}
            daysOff={dayOffAnnotations.map((d) => d.localDate)}
            folders={roadmapSource.folders}
            projects={roadmapSource.projects}
            goals={roadmapSource.goals}
            lifeAreas={lifeAreaQuestions}
            assessments={lifeAreaAssessments}
            repositories={repositories}
            onChanged={onDataChanged}
            onPlanHabit={onPlanHabit}
          />

          {/* 3. Events as Rows with the color rail */}
          {dayEvents.map((ev) => (
            <SoftRow
              key={ev.id}
              hideOrb
              leading={
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: ev.color }}
                />
              }
              title={<span className="whitespace-normal break-words">{ev.title}</span>}
              meta={ev.timeMeta}
              onClick={() => onInspectEvent(ev.event)}
            />
          ))}

          {/* 4. Tasks as Rows with the color rail */}
          {dayTasks.map((t) => (
            <SoftRow
              key={t.id}
              hideOrb
              leading={
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: t.color }}
                />
              }
              title={<span className="whitespace-normal break-words">{t.title}</span>}
              meta={t.timeMeta}
              checked={t.state === "completed"}
              done={t.state === "completed"}
              glowColor={t.color}
              checkLabel={
                t.state === "completed"
                  ? "Позначити невиконаним"
                  : "Позначити виконаним"
              }
              onToggleCheck={() => onToggleTaskState(t.task.id)}
              onClick={() =>
                setPlanning({ task: t.task, reservationId: t.reservationId })
              }
            />
          ))}

          {/* Empty day state (compact EmptyState) */}
          {isDayEmpty && (
            <div className="py-1" data-testid="calendar-empty-day">
              <EmptyState
                context="calendar"
                className="calendar-compact-empty"
                title="Нічого не заплановано"
                primaryAction={{
                  label: "Створити",
                  onClick: () => onOpenGlobalCreation(undefined),
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Task planning modal */}
      {planning && (
        <TaskSheet
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
          lifeAreas={lifeAreaQuestions}
          assessments={lifeAreaAssessments}
          repositories={repositories}
          onClose={() => setPlanning(null)}
          onSaved={() => onDataChanged()}
        />
      )}
    </div>
  );
}
