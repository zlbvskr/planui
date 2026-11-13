import React,{ useEffect,useLayoutEffect,useMemo,useRef,useState } from "react";
import { SharedDayTimeline as DayCanvas } from '../components/timeline/SharedDayTimeline';
import { SharedDayTimelineHandle as DayCanvasHandle } from '../components/timeline/timelineTypes';
import { HabitBand } from '../components/today/HabitBand';
import { TaskSheet } from '../components/today/TaskSheet';
import { itemColor } from '../domain/modelHelpers';
import { sphereStates } from '../domain/sphereInsights';
import { EMPTY_DAILY_PLAN,selectTaskReviewState } from '../domain/today';
import { DailyPlan,TodayMode } from '../domain/types';
import { formatDate,formatDuration,formatSubtitle } from '../lib/format';
import { HeroArt } from '../ui/art';
import { Button } from '../ui/buttons';
import { DateField } from '../ui/fields';
import { Section } from '../ui/headers';
import { Row } from '../ui/rows';
import { Sheet } from '../ui/sheets';
import { HeatStrip,ScoreRing,needsSphereStep } from '../ui/spheres';
import { WeekStrip } from '../ui/WeekStrip';

import { TodayOverview } from '../components/today/TodayOverview';
import { UnoccupiedTimeGap } from '../domain/availability';
import { projectScheduleForDate } from '../domain/scheduling';
import { addDaysToLocalDate } from '../domain/temporal';
import { CalendarEvent,DayOffAnnotation,EntityId,Folder,Goal,Habit,HabitEntry,IanaTimeZone,LifeAreaAssessment,LifeAreaQuestion,LocalDateString,Project,Task,TaskReservation } from '../domain/types';
import { UK_STRINGS } from '../i18n/uk';
import { ImplementedCreationActionKind } from '../state/shellStore';
import { PlanuiRepositories } from '../storage/repositories';
import { TaskLifecycleUndoToken } from '../storage/repositoryTypes';
import { useHeaderScrollCollapse } from '../ui/motion';

const TodayTasksPanel = React.lazy(() =>
  import("../components/today/TodayTasksPanel").then((m) => ({
    default: m.TodayTasksPanel,
  }))
);

export interface TodayWorkspaceViewProps {
  habitHistory?: boolean;
  mode?: TodayMode;
  hasInteraction?: boolean;
  dailyPlans?: Record<string, DailyPlan>;
  dailyPlan?: DailyPlan;
  onOpenLifeAreas: (areaId?: string, review?: boolean) => void;
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
  goals?: readonly Goal[];
  folders: readonly Folder[];
  lifeAreaQuestions?: readonly LifeAreaQuestion[];
  lifeAreaAssessments?: readonly LifeAreaAssessment[];
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
  onChangeMode,
  onOpenLifeAreas,
  dailyPlans,
  dailyPlan = EMPTY_DAILY_PLAN,
  onInteraction,
  onModalStateChange,
  selectedDate,
  actualTodayDate,
  activeZone,
  nowMs,
  midnightRolloverDate,
  todayUndoToken,
  events,
  reservations,
  tasks,
  projects,
  goals = [],
  folders,
  lifeAreaQuestions = [],
  lifeAreaAssessments = [],
  dayOffAnnotations,
  habits,
  habitEntries,
  habitsEnabled = true,
  habitsContent,
  habitHistory = false,
  onInspectHabitSession,
  repositories,
  onSelectDate,
  onDismissMidnightRollover,
  onToggleTaskState,
  onUndoLifecycle,
  onCancelEvent,
  onInspectEvent,
  onOpenGapPicker,
  onOpenGlobalCreation,
  onDataChanged,
}: TodayWorkspaceViewProps) {
  const sphereData = useMemo(() => sphereStates(lifeAreaQuestions, lifeAreaAssessments, new Date(nowMs).toISOString()), [lifeAreaQuestions, lifeAreaAssessments, nowMs]);
  const latestReview = lifeAreaAssessments.filter(r => Date.parse(r.recordedAt) <= nowMs).reduce((latest, r) => Math.max(latest, Date.parse(r.recordedAt) || 0), 0);
  const needsReview = nowMs - latestReview >= 7 * 86400000;
  const focusedSpheres = sphereData.filter(a => a.focus);
  const effectiveMode = mode;
  const rootRef = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<HTMLElement>(null);
  // The timeline scrollport ends above the measured dock, including keyboard/viewport changes.
  useLayoutEffect(() => {
    if (effectiveMode !== 'day') return;
    const root = scheduleRef.current;
    const scroller = root?.querySelector<HTMLElement>('.continuous-time-scroll');
    const dock = document.querySelector<HTMLElement>('[data-testid="bottom-dock"]');
    if (!root || !scroller || !dock) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bottom = Math.min(dock.getBoundingClientRect().top, window.visualViewport?.height ?? window.innerHeight);
        const available = Math.max(180, Math.floor(bottom - (scroller.getBoundingClientRect().top + window.scrollY) - 12));
        const value = `${available}px`;
        if (root.style.getPropertyValue('--schedule-viewport-height') !== value) root.style.setProperty('--schedule-viewport-height', value);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root); observer.observe(dock);
    if (rootRef.current) observer.observe(rootRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure);
    window.visualViewport?.addEventListener('resize', measure);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [effectiveMode]);
  const dayCanvasRef = useRef<DayCanvasHandle>(null);
  const lastExternalSelectedDateRef = useRef<LocalDateString>(selectedDate);
  const [viewDate, setViewDate] = useState<LocalDateString>(selectedDate);

  // Sync only when selectedDate prop changes from outside (e.g. Calendar window or external navigation)
  useEffect(() => {
    if (selectedDate !== lastExternalSelectedDateRef.current) {
      lastExternalSelectedDateRef.current = selectedDate;
      setViewDate(selectedDate);
      dayCanvasRef.current?.scrollToDay(selectedDate, "auto");
    }
  }, [selectedDate]);

  const handleJumpToDate = (
    nextDate: LocalDateString,
    behavior: "smooth" | "auto" = "smooth",
  ) => {
    lastExternalSelectedDateRef.current = nextDate;
    setViewDate(nextDate);
    onSelectDate(nextDate);
    dayCanvasRef.current?.scrollToDay(nextDate, behavior);
  };

  const [triageIndex, setTriageIndex] = useState(0);
  const [triageDismissed, setTriageDismissed] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [triageDate, setTriageDate] = useState(selectedDate);
  const triageTasks = tasks.filter(
    (task) =>
      selectTaskReviewState(task, actualTodayDate, reservations, activeZone) ===
      "needs_triage",
  );
  const triageTask = triageTasks[triageIndex];
  const [reviewOpen, setReviewOpen] = useState(false);
  const { headerRef: todayHeaderRef } = useHeaderScrollCollapse(64);

  const [planningTask, setPlanningTask] = useState<{
    task: Task;
    reservationId?: string;
    reviewAction?: string;
    initialDate?: string;
    initialTime?: string;
  } | null>(null);
  useEffect(() => {
    onModalStateChange?.(Boolean(planningTask) || reviewOpen);
    return () => onModalStateChange?.(false);
  }, [Boolean(planningTask), reviewOpen]);
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

  const weekMarkers = useMemo(() => {
    const result: Record<string, any> = {};

    // 1. Shifts: yellow sun or violet moon
    events
      .filter((e) => e.type === "work_shift" && e.schedule.kind === "timed")
      .forEach((e) => {
        const i = (e.schedule as any).interval;
        const isNight = i.originEndLocalDate !== i.originStartLocalDate;
        result[i.originStartLocalDate] = {
          ...(result[i.originStartLocalDate] ?? {}),
          shift: isNight ? "night" : "day",
        };
      });

    // 2. Explicit day off
    dayOffAnnotations.forEach((d) => {
      result[d.localDate] = {
        ...(result[d.localDate] ?? {}),
        dayOff: true,
      };
    });

    // 3. Up to 2 colored dots for events
    const modelCtx = {
      folders,
      projects,
      goals,
      lifeAreas: lifeAreaQuestions,
      assessments: lifeAreaAssessments,
    };
    events
      .filter((e) => e.type !== "work_shift" && e.type !== "sleep")
      .forEach((e) => {
        const d =
          e.schedule.kind === "timed"
            ? (e.schedule as any).interval.originStartLocalDate
            : (e.schedule as any).localDate;
        if (d) {
          const color = itemColor(e, modelCtx);
          const prev = result[d]?.eventColors ?? [];
          if (prev.length < 2 && !prev.includes(color)) {
            result[d] = {
              ...(result[d] ?? {}),
              eventColors: [...prev, color],
            };
          }
        }
      });

    return result;
  }, [events, dayOffAnnotations, folders, projects, goals, lifeAreaQuestions, lifeAreaAssessments]);

  const activeDate = effectiveMode === "day" ? viewDate : selectedDate;

  return (
    <div
      ref={rootRef}
      className="space-y-4 today-materials"
      data-testid="destination-view-today"
      onPointerDownCapture={onInteraction}
      onWheelCapture={onInteraction}
      onKeyDownCapture={onInteraction}
    >
      {/* Sticky header zone: title + date subtitle + small Сьогодні pill + ClayBadge + week strip with full-bleed gradient fade */}
      <div
        ref={todayHeaderRef as React.RefObject<HTMLDivElement>}
        className="today-sticky-header"
        hidden={effectiveMode === "habits" && habitHistory}
      >
        <div className="flex items-center justify-between min-h-[56px] max-h-[64px] mb-1">
          <div className="min-w-0 flex-1">
            <h1 className="ui-page-header-large-title m-0 truncate">
              Сьогодні
            </h1>
            <p
              className="ui-page-header-subtitle m-0 mt-0.5"
              data-testid="today-selected-date-heading"
            >
              {formatSubtitle(activeDate)}
            </p>
          </div>
          <div className="ui-page-header-right flex items-center gap-2 shrink-0">
            <HeroArt name="calendar" size={64} />
            {activeDate !== actualTodayDate && (
              <button
                type="button"
                onClick={() => handleJumpToDate(actualTodayDate, "smooth")}
                data-testid="week-strip-jump-today-button"
                className="ui-pill h-7 px-2.5 text-[12px] font-bold cursor-pointer"
              >
                Сьогодні
              </button>
            )}

          </div>
        </div>

        <HeatStrip areas={sphereData} onSelect={id => onOpenLifeAreas(id)} />
        <WeekStrip
          date={activeDate}
          today={actualTodayDate}
          onChange={(iso) => handleJumpToDate(iso, "smooth")}
          markers={weekMarkers}
        />
      </div>

      {(effectiveMode === 'day' || effectiveMode === 'tasks') && <section className="sphere-today-context" aria-label="Сфери сьогодні">
        {focusedSpheres.length > 0 && <div className="sphere-focus-list">{focusedSpheres.map(area => <button type="button" key={area.id} className="sphere-focus-chip" onClick={() => onOpenLifeAreas(area.id)}><ScoreRing area={area} size={40}/><span>✦ У фокусі<small className="block font-semibold">{area.questionTextUk}</small></span></button>)}</div>}
        {needsReview && sphereData.length > 0 && <button type="button" className="sphere-review-card" data-testid="sphere-review-reminder" onClick={() => onOpenLifeAreas(undefined, true)}><HeroArt name="pearl" size={44}/><span><strong>Час оновити оцінки</strong><small>{latestReview ? 'Минув тиждень від останнього Огляду' : 'Оціни сфери й обери, що потребує уваги'}</small></span><span aria-hidden="true">›</span></button>}
      </section>}

      {effectiveMode === "day" && <TodayOverview
        supportsArea={task => needsSphereStep(task, sphereData, { folders, projects, goals })}
        focus={tasks.find(task => (dailyPlans?.[activeDate] ?? dailyPlan).focusTaskIds.includes(task.id) && task.state === 'open')}
        tasks={tasks.filter(task => task.plannedDate === activeDate && task.state !== 'canceled')}
        onInspect={task => setPlanningTask({ task })}
        onTasks={() => onChangeMode('tasks')}
      />}

      {/* Habit band in Day mode: 32px chips, edge-to-edge scroll without a clipped box, and "Попередні плани · N" pill at its end */}
      {effectiveMode === "day" && (
        <HabitBand
          habits={habits}
          habitEntries={habitEntries}
          date={activeDate}
          daysOff={dayOffAnnotations.map((d) => d.localDate)}
          folders={folders}
          projects={projects}
          goals={goals}
          lifeAreas={lifeAreaQuestions}
          assessments={lifeAreaAssessments}
          repositories={repositories}
          onChanged={() => onDataChanged()}
          triageCount={!triageDismissed ? triageTasks.length : 0}
          onOpenTriage={() => {
            setTriageIndex(0);
            setReviewOpen(true);
          }}
          onDismissTriage={() => setTriageDismissed(true)}
        />
      )}

      <Sheet title="Попередні плани" isOpen={reviewOpen} onClose={()=>setReviewOpen(false)}>
        {triageTask?<div className="space-y-4"><div className="review-dots" role="group" aria-label={`${triageIndex+1} з ${triageTasks.length}`}>{triageTasks.map((task,i)=><span key={task.id} data-active={i===triageIndex}/>)}<small>{triageIndex+1} з {triageTasks.length}</small></div><h2>{triageTask.title}</h2><p>{triageTask.estimatedDurationMinutes?formatDuration(triageTask.estimatedDurationMinutes):"Без оцінки тривалості"}</p><div className="flex flex-wrap gap-2">{['Перенести','Зменшити обсяг','Розділити','Поставити на паузу','Відмовитися'].map(action=><button type="button" className="ui-pill" key={action} onClick={()=>action==='Перенести'?setRescheduleOpen(!rescheduleOpen):setPlanningTask({task:triageTask,reviewAction:action})}>{action}</button>)}</div>{rescheduleOpen&&<Section>{['Сьогодні ввечері','Завтра'].map(label=><Row key={label} title={label} trailing={<Button onClick={()=>{setRescheduleOpen(false);setPlanningTask({task:triageTask,reviewAction:'Перенести',initialDate:label==='Завтра'?addDaysToLocalDate(actualTodayDate,1):actualTodayDate,initialTime:label==='Сьогодні ввечері'?'18:00':undefined});}}>Обрати</Button>}/>)}<DateField label="Інша дата" value={triageDate} onChange={e=>{setTriageDate(e.target.value);setPlanningTask({task:triageTask,reviewAction:'Перенести',initialDate:e.target.value});}}/></Section>}<button type="button" className="triage-keep" onClick={()=>{setRescheduleOpen(false);if(triageIndex+1<triageTasks.length)setTriageIndex(triageIndex+1);else setReviewOpen(false);}}>Залишити як є</button></div>:<p>Усе переглянуто</p>}
      </Sheet>
      {planningTask && (
        <React.Suspense fallback={null}>
          <TaskSheet
            key={planningTask.task.id + ":" + (planningTask.reservationId ?? "") + (planningTask.initialDate??'') + (planningTask.initialTime??'')}
            reviewAction={planningTask.reviewAction}
            initialDate={planningTask.initialDate}
            initialTime={planningTask.initialTime}
            task={planningTask.task}
            initialReservationId={planningTask.reservationId}
            date={selectedDate}
            zone={activeZone}
            tasks={tasks}
            events={events}
            reservations={reservations}
            folders={folders}
            projects={projects}
            goals={goals}
            lifeAreas={lifeAreaQuestions}
            repositories={repositories}
            onClose={() => setPlanningTask(null)}
            onSaved={() => onDataChanged()}
          />
        </React.Suspense>
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
          <span className="text-[0.8125rem] font-medium">
            {UK_STRINGS.destinations.today.midnightRolloverNotice(
              formatDate(midnightRolloverDate),
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="today-midnight-jump-button"
              onClick={() => {
                handleJumpToDate(midnightRolloverDate, "smooth");
                onDismissMidnightRollover();
              }}
            >
              {UK_STRINGS.destinations.today.midnightJumpToTodayButton}
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
          <span className="text-[0.8125rem] font-medium">
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
        <React.Suspense fallback={null}>
          <TodayTasksPanel
            folders={folders}
            projects={projects}
            goals={goals}
            lifeAreas={lifeAreaQuestions}
            assessments={lifeAreaAssessments}
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
        </React.Suspense>
      )}
      {effectiveMode === "day" && (
        <>
          <section ref={scheduleRef} className="workspace-schedule" aria-label="Розклад дня">
          <div className="workspace-schedule-heading"><div><h2>Розклад дня</h2><span>{formatSubtitle(activeDate)}</span></div><button type="button" className="schedule-add candy-gloss" aria-label="Додати подію" onClick={() => onOpenGlobalCreation('event')}>+</button></div>
          <DayCanvas
            ref={dayCanvasRef}
            plans={dailyPlans}
            onDayInView={setViewDate}
            folders={folders}
            projects={projects}
            goals={goals}
            lifeAreas={lifeAreaQuestions}
            assessments={lifeAreaAssessments}
            dayOffAnnotations={dayOffAnnotations}
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
          </section>
        </>
      )}
    </div>
  );
}
