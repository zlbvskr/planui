import { DateField, Row, Section } from '../ui';
import { formatSubtitle } from "../lib/format";
import { evaluateHabitOnDate } from "../domain/habits";
import { DayCanvas } from "../components/today/DayCanvas";
import { Leaf } from "lucide-react";
import {
  Sheet,
  ActionMenu,
  RoundButton,
  WeekStrip,
  Pill,
  Segmented,
} from "../components/ui/design";
import { selectTaskReviewState } from "../domain/projections";
import { TodayMode, DailyPlan } from "../domain/types";
import {
  EMPTY_DAILY_PLAN,
  projectTodayTasks,
  deadlineDate,
} from "../domain/today";
import { DailyFocusPanel } from "../components/today/DailyFocusPanel";
import { TodayTasksPanel } from "../components/today/TodayTasksPanel";
import { TaskPlanningSheet } from "../components/today/TaskPlanningSheet";
import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  CalendarEvent,
  Folder,
  DayOffAnnotation,
  EntityId,
  Habit,
  HabitEntry,
  IanaTimeZone,
  LocalDateString,
  Project,
  Task,
  TaskReservation,
} from "../domain/types";
import {
  addDaysToLocalDate,
  formatUkrainianDateHeading,
} from "../domain/temporal";
import {
  UnoccupiedTimeGap,
  projectScheduleForDate,
} from "../domain/scheduling";
import {
  PlanuiRepositories,
  TaskLifecycleUndoToken,
} from "../storage/repositories";
import { ImplementedCreationActionKind } from "../state/shellStore";
import { UK_STRINGS } from "../i18n/uk";
import { Button, Card } from "../components/ui/primitives";

export interface TodayWorkspaceViewProps {
  mode?: TodayMode;
  hasInteraction?: boolean;
  savedScrollTop?: number;
  dailyPlans?: Record<string, DailyPlan>;
  dailyPlan?: DailyPlan;
  onChangeMode: (mode: TodayMode) => void;
  onInteraction: () => void;
  onModalStateChange?: (open: boolean) => void;
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  activeZone: IanaTimeZone;
  nowMs: number;
  untimedCollapsed: boolean;
  nextDayCollapsed: boolean;
  midnightRolloverDate: LocalDateString | null;
  todayUndoToken: TaskLifecycleUndoToken | null;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  projects: readonly Project[];
  folders: readonly Folder[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  habits: readonly Habit[];
  habitEntries: readonly HabitEntry[];
  habitsEnabled?: boolean;
  habitsContent?: React.ReactNode;
  onInspectHabitSession?: (reservation: TaskReservation) => void;
  repositories: PlanuiRepositories;
  onSelectDate: (nextDate: LocalDateString) => void;
  onToggleUntimedCollapsed: () => void;
  onToggleNextDayCollapsed: (nextCollapsed: boolean) => Promise<void> | void;
  onDismissMidnightRollover: () => void;
  onToggleTaskState: (taskId: EntityId) => Promise<void> | void;
  onUndoLifecycle: () => Promise<void> | void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onInspectEvent: (event: CalendarEvent) => void;
  onOpenGapPicker: (gap: UnoccupiedTimeGap) => void;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  onNavigateToHabits?: (date: LocalDateString) => void;
  onDataChanged: (feedbackUk?: string) => Promise<void> | void;
}

export function TodayWorkspaceView({
  mode = "day",
  hasInteraction = false,
  savedScrollTop = 0,
  dailyPlans,
  dailyPlan = EMPTY_DAILY_PLAN,
  onChangeMode,
  onInteraction,
  onModalStateChange,
  selectedDate,
  actualTodayDate,
  activeZone,
  nowMs,
  untimedCollapsed,
  nextDayCollapsed,
  midnightRolloverDate,
  todayUndoToken,
  events,
  reservations,
  tasks,
  projects,
  folders,
  dayOffAnnotations,
  habits,
  habitEntries,
  habitsEnabled = true,
  habitsContent,
  onInspectHabitSession,
  repositories,
  onSelectDate,
  onToggleUntimedCollapsed,
  onToggleNextDayCollapsed,
  onDismissMidnightRollover,
  onToggleTaskState,
  onUndoLifecycle,
  onCancelEvent,
  onInspectEvent,
  onOpenGapPicker,
  onOpenGlobalCreation,
  onNavigateToHabits,
  onDataChanged,
}: TodayWorkspaceViewProps) {
  const effectiveMode = mode === "habits" && !habitsEnabled ? "day" : mode;
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewDate, setViewDate] = useState(selectedDate);
  const actionDate=effectiveMode==='day'?viewDate:selectedDate;
  const actionPlan=dailyPlans?.[actionDate]??(actionDate===selectedDate?dailyPlan:EMPTY_DAILY_PLAN);
  useEffect(() => setViewDate(selectedDate), [selectedDate]);
  const [triageIndex,setTriageIndex]=useState(0);
  const [triageDismissed,setTriageDismissed]=useState(false);
  const [rescheduleOpen,setRescheduleOpen]=useState(false);
  const [triageDate,setTriageDate]=useState(selectedDate);
  const triageTasks=tasks.filter(task=>selectTaskReviewState(task,actualTodayDate,reservations,activeZone)==="needs_triage");
  const triageTask=triageTasks[triageIndex];
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  useEffect(() => {
    const header = rootRef.current?.querySelector(".today-heading");
    if (!header) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        rootRef.current?.classList.toggle(
          "today-scrolled",
          !entry.isIntersecting,
        ),
      { threshold: 0 },
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [planningTask, setPlanningTask] = useState<{
    task: Task;
    reservationId?: string;
    reviewAction?: string;
    initialDate?: string;
  } | null>(null);
  useEffect(() => {
    onModalStateChange?.(Boolean(planningTask) || focusOpen || reviewOpen);
    return () => onModalStateChange?.(false);
  }, [Boolean(planningTask), focusOpen, reviewOpen]);
  const todayProjection = useMemo(
    () =>
      projectScheduleForDate({
        localDate: selectedDate,
        displayZone: activeZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: false,
      }),
    [selectedDate, activeZone, events, reservations, tasks, dayOffAnnotations],
  );

  const todayProjectionWithReleased = useMemo(
    () =>
      projectScheduleForDate({
        localDate: selectedDate,
        displayZone: activeZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: true,
      }),
    [selectedDate, activeZone, events, reservations, tasks, dayOffAnnotations],
  );

  return (
    <div
      ref={rootRef}
      className="space-y-4"
      data-testid="destination-view-today"
      onPointerDownCapture={onInteraction}
      onWheelCapture={onInteraction}
      onKeyDownCapture={onInteraction}
    >
      <header className="today-heading">
        <div>
          <h1>Сьогодні</h1>
          <p data-testid="today-selected-date-heading">
            {formatSubtitle(effectiveMode === "day" ? viewDate : selectedDate)}
          </p>
        </div>
        <div className="today-heading-actions">
          <RoundButton
            aria-label={`Мінімальний день: ${actionPlan.minimalDay?"увімкнено":"вимкнено"}`}
            aria-pressed={actionPlan.minimalDay}
            onClick={async () => {
              try {
                await repositories.saveDailyPlan(
                  actionDate,
                  { ...actionPlan, minimalDay: !actionPlan.minimalDay },
                  actionPlan,
                );
                await onDataChanged();
              } catch {
                window.alert(
                  "Не вдалося змінити вигляд дня. Оновіть дані й повторіть.",
                );
              }
            }}
          >
            <Leaf aria-hidden="true" size={22} />
          </RoundButton>
          <div className="today-round-menu planui-floating-capsule">
            <ActionMenu
              label="Інші дії дня"
              items={[
                { label: "Повернути все", onSelect: async () => { await repositories.saveDailyPlan(actionDate,{...actionPlan,minimalDay:false},actionPlan); await onDataChanged(); } },
                { label: "Фокус дня", onSelect: () => setFocusOpen(true) },
                {
                  label: "Переглянути попередні плани",
                  onSelect: () => setReviewOpen(true),
                },
                {
                  label: "Попередній тиждень",
                  onSelect: () =>
                    onSelectDate(addDaysToLocalDate(viewDate, -7)),
                },
                {
                  label: "Наступний тиждень",
                  onSelect: () => onSelectDate(addDaysToLocalDate(viewDate, 7)),
                },
                {
                  label: "Сьогодні",
                  onSelect: () => onSelectDate(actualTodayDate),
                },
              ]}
            />
          </div>
        </div>
      </header>
      <div className="today-mode-bar">
        <span className="today-compact-title">Сьогодні</span>
        <Segmented<TodayMode>
          label="Режими Сьогодні"
          value={effectiveMode}
          onChange={next=>{if(effectiveMode==='day'&&next!=='day'&&viewDate!==selectedDate)onSelectDate(viewDate);onChangeMode(next);}}
          options={[
            { value: "day", label: "День" },
            { value: "tasks", label: "Завдання" },
            ...(habitsEnabled
              ? [{ value: "habits" as const, label: "Звички" }]
              : []),
          ]}
        />
      </div>
      <WeekStrip
        date={effectiveMode === "day" ? viewDate : selectedDate}
        today={actualTodayDate}
        onChange={onSelectDate}
        markers={Object.fromEntries(
          events
            .filter(
              (e) => e.type === "work_shift" && e.schedule.kind === "timed",
            )
            .map((e) => {
              const i = (
                e.schedule as {
                  interval: {
                    originStartLocalDate: string;
                    originStartLocalTime: string;
                    originEndLocalDate: string;
                  };
                }
              ).interval;
              return [
                i.originStartLocalDate,
                i.originEndLocalDate !== i.originStartLocalDate
                  ? "night"
                  : "day",
              ];
            }),
        )}
      />

      {effectiveMode!=='habits'&&!triageDismissed&&triageTasks.length>0&&<div data-ui="content-start"><Section><Row title="Переглянути попередні плани" trailing={<><Button onClick={()=>{setTriageIndex(0);setReviewOpen(true);}}>Переглянути</Button><RoundButton aria-label="Приховати пропозицію" onClick={()=>setTriageDismissed(true)}>×</RoundButton></>}/></Section></div>}
      <Sheet title="Попередні плани" isOpen={reviewOpen} onClose={()=>setReviewOpen(false)}>
        {triageTask?<div className="space-y-4"><div className="review-dots" role="group" aria-label={`${triageIndex+1} з ${triageTasks.length}`}>{triageTasks.map((task,i)=><span key={task.id} data-active={i===triageIndex}/>)}<small>{triageIndex+1} з {triageTasks.length}</small></div><h2>{triageTask.title}</h2><p>Потребує вашого рішення</p><div className="flex flex-wrap gap-2">{['Перенести','Зменшити обсяг','Розділити','Поставити на паузу','Відмовитися'].map(action=><button type="button" className="ui-pill" key={action} onClick={()=>action==='Перенести'?setRescheduleOpen(!rescheduleOpen):setPlanningTask({task:triageTask,reviewAction:action})}>{action}</button>)}</div>{rescheduleOpen&&<Section>{['Сьогодні ввечері','Завтра'].map(label=><Row key={label} title={label} trailing={<Button onClick={()=>{setRescheduleOpen(false);setPlanningTask({task:triageTask,reviewAction:'Перенести',initialDate:label==='Завтра'?addDaysToLocalDate(actualTodayDate,1):actualTodayDate});}}>Обрати</Button>}/>)}<DateField label="Інша дата" value={triageDate} onChange={e=>{setTriageDate(e.target.value);setPlanningTask({task:triageTask,reviewAction:'Перенести',initialDate:e.target.value});}}/></Section>}<button type="button" className="triage-keep" onClick={()=>{setRescheduleOpen(false);if(triageIndex+1<triageTasks.length)setTriageIndex(triageIndex+1);else setReviewOpen(false);}}>Залишити як є</button></div>:<p>Усе переглянуто</p>}
      </Sheet>
      <DailyFocusPanel
        key={actionDate + ":" + JSON.stringify(actionPlan)}
        date={actionDate}
        zone={activeZone}
        plan={actionPlan}
        tasks={tasks}
        reservations={reservations}
        repositories={repositories}
        isOpen={focusOpen}
        onClose={() => setFocusOpen(false)}
        onChanged={() => onDataChanged()}
      />
      {dailyPlan.minimalDay && effectiveMode !== "day" && (
        <Card className="space-y-2" data-testid="today-minimal-commitments">
          <h2 className="font-semibold">
            Зобов’язання та зайнятий час залишаються видимими
          </h2>

          <ul>
            {todayProjection.timelineItems
              .filter((item) => item.isBlocking)
              .map((item) => (
                <li key={item.itemKey}>
                  {item.segment.displayStartLocalTime} –{" "}
                  {item.segment.displayEndLocalTime}: {item.title}
                </li>
              ))}
            {todayProjection.allDayItems
              .filter((item) => item.isBlocking)
              .map((item) => (
                <li key={item.eventId}>Увесь день: {item.title}</li>
              ))}
            {projectTodayTasks(
              tasks,
              reservations,
              selectedDate,
              activeZone,
              dailyPlan,
            )
              .relevant.filter((task) => task.deadline)
              .map((task) => (
                <li key={task.id}>
                  Термін: {task.title},{" "}
                  {formatUkrainianDateHeading(deadlineDate(task, activeZone)!)}
                </li>
              ))}
          </ul>
        </Card>
      )}
      {planningTask && (
        <TaskPlanningSheet
          key={planningTask.task.id + ":" + (planningTask.reservationId ?? "")}
          reviewAction={planningTask.reviewAction}
          initialDate={planningTask.initialDate}
          task={planningTask.task}
          initialReservationId={planningTask.reservationId}
          date={selectedDate}
          zone={activeZone}
          tasks={tasks}
          events={events}
          reservations={reservations}
          repositories={repositories}
          onClose={() => setPlanningTask(null)}
          onSaved={() => onDataChanged()}
        />
      )}
      {/* Midnight Rollover Notice Banner (6.3 Preserve viewport at midnight and offer actual-today return) */}
      {midnightRolloverDate && (
        <div
          className="p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
          data-testid="today-midnight-rollover-banner"
        >
          <span className="text-[13px] font-medium">
            {UK_STRINGS.destinations.today.midnightRolloverNotice(
              formatUkrainianDateHeading(midnightRolloverDate),
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              data-testid="today-midnight-jump-button"
              onClick={() => {
                onSelectDate(midnightRolloverDate);
                onDismissMidnightRollover();
              }}
            >
              {UK_STRINGS.destinations.today.midnightJumpToNewTodayButton}
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={onDismissMidnightRollover}
            >
              {UK_STRINGS.app.closeButton}
            </Button>
          </div>
        </div>
      )}

      {/* Lifecycle Immediate Undo Banner */}
      {todayUndoToken && (
        <div
          className="p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
          data-testid="today-lifecycle-undo-banner"
        >
          <span className="text-[13px] font-medium">
            Справу «{todayUndoToken.previousTaskSnapshot.title}» завершено.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void onUndoLifecycle()}
            data-testid="today-undo-lifecycle-button"
          >
            {UK_STRINGS.scheduling.undoActionButton}
          </Button>
        </div>
      )}

      {effectiveMode === "habits" && habitsEnabled && (
        <section className="today-habits space-y-4" data-ui="content-start">
          {habitsContent}
        </section>
      )}
      {effectiveMode === "tasks" && (
        <TodayTasksPanel
          folders={folders}
          projects={projects}
          events={events}
          actualTodayDate={actualTodayDate}
          nowMs={nowMs}
          date={selectedDate}
          zone={activeZone}
          plan={dailyPlan}
          tasks={tasks}
          reservations={reservations}
          repositories={repositories}
          onChanged={() => onDataChanged()}
          onToggle={onToggleTaskState}
          onAdd={() => onOpenGlobalCreation("task")}
          onPlan={(task, reviewAction) =>
            setPlanningTask({ task, reviewAction })
          }
        />
      )}
      {effectiveMode === "day" && (
        <>
          {/* 5. Main Proportional Timeline for Selected Date (6.1 / 6.5) */}
          <DayCanvas
            plans={dailyPlans}
            onDayInView={setViewDate}
            folders={folders}
            projects={projects}
            plan={dailyPlan}
            onInspectHabitSession={onInspectHabitSession}
            testIdPrefix="today"
            projection={todayProjection}
            projectionWithReleased={todayProjectionWithReleased}
            nowMs={nowMs}
            events={events}
            tasks={tasks}
            reservations={reservations}
            onToggleTaskState={onToggleTaskState}
            onCancelEvent={onCancelEvent}
            onInspectEvent={onInspectEvent}
            onInspectTask={(task, reservationId) =>
              setPlanningTask({ task, reservationId })
            }
            onOpenGapPicker={onOpenGapPicker}
            onEmptyCreateAction={() => onOpenGlobalCreation("task")}
            emptyActionLabel={UK_STRINGS.creation.actions.task.label}
          />
        </>
      )}
    </div>
  );
}
