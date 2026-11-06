import {MotionScreen} from '../ui/Motion';
import {Icon} from '../ui/icons';
import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Stamp,
} from "../ui/icons";
import {
  PageHeader,
  Segmented,
  RoundButton,
  Pill,
  ActionMenu,
  InfoSheet,
  Section,
  Row,
  ItemCard,
  Sheet,
  EmptyState,
} from "../ui";
import {
  formatMonthYear,
  formatDateRange,
  formatShortDate,
  formatTimeRange,
  sentenceCase,
} from "../lib/format";
import { CalendarGrid } from "../components/calendar/CalendarGrid";
import { WorkRosterSubview } from "../components/roster/WorkRosterSubview";
import { SharedDayTimeline } from "../components/timeline/SharedDayTimeline";
import { TaskPlanningSheet } from "../components/today/TaskPlanningSheet";
import { directionFor } from "../components/timeline/itemPresentation";
import {
  RoadmapSource,
  projectRoadmap,
  roadmapMarkers,
} from "../domain/roadmap";
import {
  CalendarSecondaryFilter,
  UnoccupiedTimeGap,
  ProjectedDaySchedule,
  applyCalendarSecondaryFilter,
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
import { RoadmapCalendarLayer } from "./RoadmapCalendarLayer";
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
  onChangeMode: (nextMode: CalendarViewMode) => void;
  onChangeSecondaryFilter: (nextFilter: CalendarSecondaryFilter) => void;
  onSelectDate: (nextDate: LocalDateString) => void;
  onToggleTaskState: (taskId: EntityId) => Promise<void> | void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  onInspectEvent: (event: CalendarEvent) => void;
  onOpenGapPicker: (gap: UnoccupiedTimeGap) => void;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
}
export function CalendarWorkspaceView(props: CalendarWorkspaceViewProps) {
  const {
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
    onChangeMode,
    onChangeSecondaryFilter,
    onSelectDate,
    onToggleTaskState,
    onCancelEvent,
    onInspectEvent,
    onInspectHabitSession,
    onOpenGapPicker,
    onOpenGlobalCreation,
    onDataChanged,
    onModalStateChange,
  } = props;
  const [stampOpen, setStampOpen] = useState(false),
    [summaryOpen, setSummaryOpen] = useState(false),
    [tool, setTool] = useState<"period" | "text" | null>(null),
    [planning, setPlanning] = useState<{
      task: Task;
      reservationId?: string;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    onModalStateChange?.(stampOpen || summaryOpen || Boolean(planning));
    return () => onModalStateChange?.(false);
  }, [stampOpen, summaryOpen, Boolean(planning)]);
  const roadmapItems = useMemo(
    () => projectRoadmap(roadmapSource),
    [roadmapSource],
  );
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
        secondaryFilter,
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
      secondaryFilter,
    ],
  );
  const projection = (date: string, released = false) => {
    const full = projectScheduleForDate({
      localDate: date,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
      includeReleasedReservations: released,
    });
    const filter = applyCalendarSecondaryFilter({
      dayProjection: full,
      secondaryFilter,
    });
    return {
      ...full,
      timelineItems: filter.filteredTimelineItems,
      allDayItems: filter.filteredAllDayItems,
      untimedDateOnlyTasks: filter.filteredUntimedTasks,
      dayOffAnnotations: filter.filteredDayOffAnnotations,
    };
  };
  const selected = projection(selectedDate),
    released = projection(selectedDate, true);
  const weekStart = (() => {
    const d = new Date(selectedDate + "T12:00:00Z");
    return addDaysToLocalDate(selectedDate, -(d.getUTCDay() + 6) % 7);
  })();
  const week = Array.from({ length: 7 }, (_, i) =>
    projection(addDaysToLocalDate(weekStart, i)),
  );
  const shiftIds = new Set(
    week.flatMap((d) =>
      d.timelineItems
        .filter((i) => i.sourceKind === "work_shift")
        .map((i) => i.sourceId),
    ),
  );
  const nights = events.filter(
    (e) =>
      shiftIds.has(e.id) &&
      e.schedule.kind === "timed" &&
      e.schedule.interval.originStartLocalDate !==
        e.schedule.interval.originEndLocalDate,
  ).length;
  const summary = [
    shiftIds.size ? `${shiftIds.size} зміни` : null,
    nights ? `${nights} нічні` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const period =
    mode === "month" || mode === "work_schedule"
      ? sentenceCase(formatMonthYear(selectedDate)).replace(/ р\.$/, "")
      : mode === "week"
        ? formatDateRange(weekStart, addDaysToLocalDate(weekStart, 6), true)
        : sentenceCase(formatShortDate(selectedDate));
  const step = (direction: number) =>
    onSelectDate(
      mode === "month" || mode === "work_schedule"
        ? addMonthsToLocalDate(selectedDate, direction)
        : addDaysToLocalDate(
            selectedDate,
            direction * (mode === "week" ? 7 : 1),
          ),
    );
  const away =
    mode === "month" || mode === "work_schedule"
      ? selectedDate.slice(0, 7) !== actualTodayDate.slice(0, 7)
      : mode === "week"
        ? !week.some((d) => d.localDate === actualTodayDate)
        : selectedDate !== actualTodayDate;
  const hue = (id: string | null) =>
    directionFor(
      tasks.find((t) => t.id === id),
      roadmapSource.folders ?? [],
      roadmapSource.projects ?? [],
    ).hue;
  const inspect = (item: ProjectedDaySchedule["timelineItems"][number]) => {
    if (item.taskId) {
      const task = tasks.find((t) => t.id === item.taskId);
      if (task) setPlanning({ task, reservationId: item.sourceId });
    } else if (item.sourceKind === "reservation") {
      const r = reservations.find((r) => r.id === item.sourceId);
      if (r) onInspectHabitSession?.(r);
    } else {
      const event = events.find((e) => e.id === item.sourceId);
      if (event) onInspectEvent(event);
    }
  };
  const agenda = (day: ProjectedDaySchedule, collapse = false) => {
    const empty =
      !day.timelineItems.length &&
      !day.allDayItems.length &&
      !day.untimedDateOnlyTasks.length &&
      !day.dayOffAnnotations.length;
    if (empty && collapse)
      return (
        <p key={day.localDate} className="calendar-muted-day">
          <button type="button" onClick={() => onSelectDate(day.localDate)}>
            {sentenceCase(formatShortDate(day.localDate))} · Поки без подій
          </button>
        </p>
      );
    return (
      <section
        className="calendar-agenda"
        key={day.localDate}
        data-testid={`calendar-agenda-${day.localDate}`}
      >
        <button
          className="ui-pill calendar-day-chip"
          type="button"
          onClick={() => onSelectDate(day.localDate)}
        >
          {sentenceCase(formatShortDate(day.localDate))}
        </button>
        {empty ? (
          collapse ? (
            <p className="calendar-muted-day">Поки без подій</p>
          ) : (
            <EmptyState
              text="Поки без подій"
              action="Створити"
              onAction={() => {
                onSelectDate(day.localDate);
                onOpenGlobalCreation("event");
              }}
            />
          )
        ) : (
          <>
            {day.dayOffAnnotations.length > 0 && <Row title="Вихідний" />}
            {day.timelineItems.map((item) => (
              <ItemCard
                key={item.itemKey}
                hue={
                  item.sourceKind === "work_shift"
                    ? "var(--color-work)"
                    : hue(item.taskId)
                }
                className="calendar-agenda-item"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectDate(day.localDate);
                    inspect(item);
                  }}
                >
                  <strong>{item.title}</strong>
                  <small>
                    {formatTimeRange(
                      item.segment.displayStartLocalTime,
                      item.segment.displayEndLocalTime,
                    )}
                    {item.segment.continuesBeforeDayStart
                      ? " · після нічної зміни"
                      : item.segment.continuesAfterDayEnd
                        ? " · до наступного дня"
                        : ""}
                  </small>
                </button>
              </ItemCard>
            ))}
            {day.allDayItems.map((item) => (
              <ItemCard
                key={item.eventId}
                hue={hue(null)}
                className="calendar-agenda-item"
              >
                <button
                  type="button"
                  onClick={() => {
                    const event = events.find((e) => e.id === item.eventId);
                    if (event) onInspectEvent(event);
                  }}
                >
                  <strong>{item.title}</strong>
                  <small>Увесь день</small>
                </button>
              </ItemCard>
            ))}
            {day.untimedDateOnlyTasks.map((task) => (
              <ItemCard
                key={task.id}
                hue={hue(task.id)}
                className="calendar-agenda-item"
              >
                <button type="button" onClick={() => setPlanning({ task })}>
                  <strong>{task.title}</strong>
                  <small>{task.deadline ? "◆ Термін" : "Без часу"}</small>
                </button>
              </ItemCard>
            ))}
          </>
        )}
      </section>
    );
  };
  const setLayer = async (layer: PlanuiSettings["roadmapLayer"]) => {
    try {
      await repositories.saveSettings(
        { ...settings, roadmapLayer: layer },
        settings.revision,
      );
      await onDataChanged();
    } catch {
      setError("Не вдалося змінити вигляд планів.");
    }
  };
  const rosterProps = {
    selectedDate,
    actualTodayDate,
    displayZone,
    monthGrid: grid,
    events,
    reservations,
    tasks,
    dayOffAnnotations,
    shiftTemplates,
    repositories,
    onSelectDate,
    onInspectEvent,
    onCancelEvent,
    onOpenGlobalCreation,
    onDataChanged,
  };
  const previousDate=React.useRef(selectedDate);React.useEffect(()=>{previousDate.current=selectedDate;},[selectedDate]);
  return (
    <div
      className="calendar-workspace calendar-stage3"
      data-testid="calendar-workspace"
    >
      <PageHeader
        title="Календар"
        actions={
          <>
            <RoundButton
              aria-label="Штамп змін"
              onClick={() => setStampOpen(true)}
            >
              <Stamp size={21} aria-hidden="true" />
            </RoundButton>
            <ActionMenu
              label="Інструменти календаря"
              items={[
                {
                  label: "Генерація на період",
                  onSelect: () => {
                    setTool("period");
                    setStampOpen(true);
                  },
                },
                {
                  label: "Текстове внесення",
                  onSelect: () => {
                    setTool("text");
                    setStampOpen(true);
                  },
                },
                {
                  label: "Створити подію",
                  onSelect: () => onOpenGlobalCreation("event"),
                },
              ]}
            />
          </>
        }
      >
        <Segmented
          label="Режим календаря"
          value={mode}
          onChange={onChangeMode}
          options={[
            { value: "month", label: "Місяць" },
            { value: "week", label: "Тиждень" },
            { value: "day", label: "День" },
            { value: "work_schedule", label: "Графік" },
          ]}
        />
        <div className="calendar-period">
          <span data-testid="calendar-period-heading">{period}</span>
          <RoundButton aria-label="Попередній період" onClick={() => step(-1)}>
            <ChevronLeft size={19} />
          </RoundButton>
          <RoundButton aria-label="Наступний період" onClick={() => step(1)}>
            <ChevronRight size={19} />
          </RoundButton>
          {away && (
            <Pill onClick={() => onSelectDate(actualTodayDate)}>Сьогодні</Pill>
          )}
        </div>
        <div
          className="ui-pill-row"
          data-ui="pill-row"
          role="group"
          aria-label="Фільтри календаря"
        >
          {(
            [
              { value: "all", label: "Усе" },
              { value: "work", label: "Робота" },
              { value: "events_and_tasks", label: "Події та справи" },
            ] as const
          ).map((f) => (
            <Pill
              key={f.value}
              selected={secondaryFilter === f.value}
              onClick={() => onChangeSecondaryFilter(f.value)}
            >
              {f.label}
            </Pill>
          ))}
          <ActionMenu
            label="Плани"
            items={[
              {
                label: "Лише ключові дати",
                onSelect: () => void setLayer("key_dates"),
              },
              {
                label: "Етапи й дати",
                onSelect: () => void setLayer("periods"),
              },
              {
                label: "Приховати плани",
                onSelect: () => void setLayer("hidden"),
              },
            ]}
          >
            <span
              className="ui-pill"
              data-selected={settings.roadmapLayer !== "hidden"}
            >
              Плани <Icon name="chevron-down"/>
            </span>
          </ActionMenu>
        </div>
      </PageHeader>
      {error && <p role="alert">{error}</p>}
      <MotionScreen id={mode} kind="view"><MotionScreen id={selectedDate} kind="calendar" direction={selectedDate>=previousDate.current?1:-1}>
      {mode === "month" && (
        <>
          <CalendarGrid
            grid={grid}
            onSelect={(cell) => onSelectDate(cell.localDate)}
            hueForTask={hue}
            roadmapCount={(date) =>
              roadmapMarkers(
                roadmapItems,
                date,
                settings.roadmapLayer ?? "hidden",
              ).length
            }
          />
          {agenda(selected)}
          <InfoSheet title="Позначки календаря">
            <p>
              <Icon name="moon" size={14}/> Нічна зміна · <Icon name="sun" size={14}/> Денна зміна · ● Подія чи справа · ◆ Термін або
              віха. Нічна зміна — один запис через північ.
            </p>
          </InfoSheet>
        </>
      )}
      {mode === "week" && (
        <div data-ui="content-start">
          <CalendarGrid
            grid={{
              ...grid,
              cells: grid.cells.filter((cell) =>
                week.some((day) => day.localDate === cell.localDate),
              ),
            }}
            onSelect={(cell) => onSelectDate(cell.localDate)}
            hueForTask={hue}
            roadmapCount={(date) =>
              roadmapMarkers(
                roadmapItems,
                date,
                settings.roadmapLayer ?? "hidden",
              ).length
            }
          />
          {week.map((d) => agenda(d, true))}
          {summary && (
            <Section>
              <Row
                title="Підсумок тижня"
                secondary={summary}
                trailing={
                  <RoundButton
                    aria-label="Підсумок тижня"
                    onClick={() => setSummaryOpen(true)}
                  >
                    ⓘ
                  </RoundButton>
                }
              />
            </Section>
          )}
        </div>
      )}
      {mode === "day" && (
        <div data-ui="content-start">
          {tasks.some(
            (t) =>
              t.state === "open" &&
              deadlineDate(t, displayZone) === selectedDate,
          ) && (
            <div className="calendar-deadlines" aria-label="Терміни дня">
              {tasks
                .filter(
                  (t) =>
                    t.state === "open" &&
                    deadlineDate(t, displayZone) === selectedDate,
                )
                .map((t) => (
                  <button
                    className="planui-deadline-badge"
                    type="button"
                    key={t.id}
                    onClick={() => setPlanning({ task: t })}
                  >
                    ◆ {t.title}
                  </button>
                ))}
            </div>
          )}
          <SharedDayTimeline
            testIdPrefix="calendar"
            folders={roadmapSource.folders}
            projects={roadmapSource.projects}
            projection={selected}
            projectionWithReleased={released}
            nowMs={nowMs}
            events={events}
            tasks={tasks}
            reservations={reservations}
            onDayInView={onSelectDate}
            onToggleTaskState={onToggleTaskState}
            onCancelEvent={onCancelEvent}
            onInspectEvent={onInspectEvent}
            onInspectHabitSession={onInspectHabitSession}
            onInspectTask={(task, reservationId) =>
              setPlanning({ task, reservationId })
            }
            onOpenGapPicker={onOpenGapPicker}
          />
        </div>
      )}
      {mode === "work_schedule" && (
        <div data-ui="content-start">
          <WorkRosterSubview
            {...rosterProps}
            onModalStateChange={onModalStateChange}
          />
        </div>
      )}
      </MotionScreen></MotionScreen>
      {mode !== "work_schedule" && (
        <RoadmapCalendarLayer
          selectedDate={selectedDate}
          source={roadmapSource}
          settings={settings}
          repositories={repositories}
          startDate={
            mode === "month"
              ? grid.cells[0].localDate
              : mode === "week"
                ? weekStart
                : selectedDate
          }
          endDateExclusive={addDaysToLocalDate(
            mode === "month"
              ? grid.cells.at(-1)!.localDate
              : mode === "week"
                ? addDaysToLocalDate(weekStart, 6)
                : selectedDate,
            1,
          )}
          onChanged={() => onDataChanged()}
        />
      )}
      <Sheet
        title="Підсумок тижня"
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
      >
        <div data-ui="info-sheet">
          <p>{summary}</p>
          <p>
            Нічна зміна враховується один раз, навіть коли переходить на
            наступний день.
          </p>
        </div>
      </Sheet>
      <Sheet
        title="Штамп змін"
        isOpen={stampOpen}
        onClose={() => {
          setStampOpen(false);
          setTool(null);
        }}
      >
        <WorkRosterSubview
          {...rosterProps}
          stampMode
          initialTool={tool}
          onInspectEvent={(e) => {
            setStampOpen(false);
            onInspectEvent(e);
          }}
          onOpenGlobalCreation={(kind) => {
            setStampOpen(false);
            onOpenGlobalCreation(kind);
          }}
          onModalStateChange={() => onModalStateChange?.(true)}
        />
      </Sheet>
      {planning && (
        <TaskPlanningSheet
          task={planning.task}
          initialReservationId={planning.reservationId}
          date={selectedDate}
          zone={displayZone}
          tasks={tasks}
          events={events}
          reservations={reservations}
          repositories={repositories}
          onClose={() => setPlanning(null)}
          onSaved={() => onDataChanged()}
        />
      )}
    </div>
  );
}
