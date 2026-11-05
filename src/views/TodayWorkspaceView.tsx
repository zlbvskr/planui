import { TopBar, Pill, Segmented } from '../components/ui/design';
import { selectTaskReviewState } from '../domain/projections';
import { TodayMode, DailyPlan } from '../domain/types';
import { EMPTY_DAILY_PLAN, shouldRevealNow, projectTodayTasks, deadlineDate } from '../domain/today';
import { DailyFocusPanel } from '../components/today/DailyFocusPanel';
import { TodayTasksPanel } from '../components/today/TodayTasksPanel';
import { TaskPlanningSheet } from '../components/today/TaskPlanningSheet';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Repeat,
} from 'lucide-react';
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  Habit,
  HabitEntry,
  IanaTimeZone,
  LocalDateString,
  Project,
  Task,
  TaskReservation,
} from '../domain/types';
import {
  addDaysToLocalDate,
  formatUkrainianDateHeading,
} from '../domain/temporal';
import {
  UnoccupiedTimeGap,
  computeCollapsedNextDaySummary,
  computeNearestCommitment,
  projectScheduleForDate,
} from '../domain/scheduling';
import {
  PlanuiRepositories,
  TaskLifecycleUndoToken,
} from '../storage/repositories';
import { ImplementedCreationActionKind } from '../state/shellStore';
import { UK_STRINGS } from '../i18n/uk';
import { Button, Card } from '../components/ui/primitives';
import { SharedDayTimeline } from '../components/timeline/SharedDayTimeline';

export interface TodayWorkspaceViewProps {
  mode?: TodayMode;
  hasInteraction?: boolean;
  savedScrollTop?: number;
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
  onOpenGlobalCreation: (preferredAction?: ImplementedCreationActionKind) => void;
  onNavigateToHabits?: (date: LocalDateString) => void;
  onDataChanged: (feedbackUk?: string) => Promise<void> | void;
}

export function TodayWorkspaceView({
  mode = 'day', hasInteraction = false, savedScrollTop = 0, dailyPlan = EMPTY_DAILY_PLAN,
  onChangeMode, onInteraction, onModalStateChange,
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
  dayOffAnnotations,
  habits,
  habitEntries,
  habitsEnabled = true, habitsContent, onInspectHabitSession,
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
  const effectiveMode = mode === 'habits' && !habitsEnabled ? 'day' : mode;
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [planningTask, setPlanningTask] = useState<{ task: Task; reservationId?: string; reviewAction?: string } | null>(null);
  useEffect(() => { onModalStateChange?.(Boolean(planningTask) || focusOpen); return () => onModalStateChange?.(false); }, [Boolean(planningTask), focusOpen]);
  const revealCurrentTime = () => rootRef.current?.querySelector('[data-testid="today-current-time-indicator"]')?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  useEffect(() => {
    if (!shouldRevealNow({ selectedDate, mode: effectiveMode, hasInteraction, scrollTop: savedScrollTop }, actualTodayDate)) return;
    const frame = requestAnimationFrame(() => { revealCurrentTime(); onInteraction(); });
    return () => cancelAnimationFrame(frame);
  }, [selectedDate, actualTodayDate, effectiveMode, hasInteraction]);

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
    [selectedDate, activeZone, events, reservations, tasks, dayOffAnnotations]
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
    [selectedDate, activeZone, events, reservations, tasks, dayOffAnnotations]
  );

  const nextDayDate = useMemo(
    () => addDaysToLocalDate(selectedDate, 1),
    [selectedDate]
  );

  const nextDayProjection = useMemo(
    () =>
      projectScheduleForDate({
        localDate: nextDayDate,
        displayZone: activeZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: false,
      }),
    [nextDayDate, activeZone, events, reservations, tasks, dayOffAnnotations]
  );

  const nextDayProjectionWithReleased = useMemo(
    () =>
      projectScheduleForDate({
        localDate: nextDayDate,
        displayZone: activeZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: true,
      }),
    [nextDayDate, activeZone, events, reservations, tasks, dayOffAnnotations]
  );

  const nearestCommitment = useMemo(
    () =>
      computeNearestCommitment({
        projection: todayProjection,
        nowMs,
        actualTodayDate,
      }),
    [todayProjection, nowMs, actualTodayDate]
  );

  const collapsedNextDaySummary = useMemo(
    () => computeCollapsedNextDaySummary(nextDayProjection),
    [nextDayProjection]
  );

  return (
    <div ref={rootRef} className="space-y-4" data-testid="destination-view-today" onPointerDownCapture={onInteraction} onWheelCapture={onInteraction} onKeyDownCapture={onInteraction}>
      <TopBar>
        <div className="ui-topbar-title"><h1>Сьогодні</h1><Pill data-testid="today-return-to-actual-today-button" onClick={() => { onSelectDate(actualTodayDate); if (selectedDate === actualTodayDate) revealCurrentTime(); }}>Зараз</Pill></div>
        <div className="today-date-row">
          <Button variant="subtle" size="icon" aria-label={UK_STRINGS.app.previousDayAria} data-testid="today-prev-day-button" onClick={() => onSelectDate(addDaysToLocalDate(selectedDate, -1))}><ChevronLeft aria-hidden="true" className="w-5 h-5" /></Button>
          <span data-testid="today-selected-date-heading">{new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(selectedDate + 'T12:00:00Z'))}</span>
          <Button variant="subtle" size="icon" aria-label={UK_STRINGS.app.nextDayAria} data-testid="today-next-day-button" onClick={() => onSelectDate(addDaysToLocalDate(selectedDate, 1))}><ChevronRight aria-hidden="true" className="w-5 h-5" /></Button>
        </div>
        <Segmented<TodayMode> label="Режими Сьогодні" value={effectiveMode} onChange={onChangeMode} options={[{ value: 'day', label: 'День' }, { value: 'tasks', label: 'Завдання' }, ...(habitsEnabled ? [{ value: 'habits' as const, label: 'Звички' }] : [])]} />
        <div className="ui-topbar-actions">
          <Pill selected={dailyPlan.minimalDay} onClick={async () => { try { await repositories.saveDailyPlan(selectedDate, { ...dailyPlan, minimalDay: !dailyPlan.minimalDay }, dailyPlan); await onDataChanged(); } catch { window.alert('Не вдалося змінити вигляд дня. Оновіть дані й повторіть.'); } }}>Мінімальний день</Pill>
          <Pill onClick={() => setFocusOpen(true)}>Фокус дня</Pill>
        </div>
      </TopBar>
      {selectedDate === actualTodayDate && tasks.some(task => selectTaskReviewState(task, actualTodayDate, reservations, activeZone) === 'needs_triage') && <details className="rounded-3xl p-4" style={{ background: 'var(--surface-card-elevated)', border: '1px solid var(--border-subtle)' }}>
        <summary className="cursor-pointer">Переглянути попередні плани</summary>
        <p>Ці справи залишилися на попередніх датах. Оберіть наступний крок, коли будете готові.</p>
        <ul>{tasks.filter(task => selectTaskReviewState(task, actualTodayDate, reservations, activeZone) === 'needs_triage').map(task => <li key={task.id} data-review-state="needs_triage"><p>{task.title}</p><div className="flex flex-wrap gap-2">{['Перенести','Зменшити обсяг','Розділити','Поставити на паузу','Відмовитися'].map(reviewAction=><Button key={reviewAction} onClick={()=>setPlanningTask({task,reviewAction})}>{reviewAction}</Button>)}</div></li>)}</ul>
      </details>}
      <DailyFocusPanel key={selectedDate + ':' + JSON.stringify(dailyPlan)} date={selectedDate} zone={activeZone} plan={dailyPlan} tasks={tasks} reservations={reservations} repositories={repositories} isOpen={focusOpen} onClose={() => setFocusOpen(false)} onChanged={() => onDataChanged()} />
      {dailyPlan.minimalDay && effectiveMode !== 'day' && <Card className="space-y-2" data-testid="today-minimal-commitments">
        <h2 className="font-semibold">Зобов’язання та зайнятий час залишаються видимими</h2>

        <ul>{todayProjection.timelineItems.filter(item => item.isBlocking).map(item => <li key={item.itemKey}>{item.segment.displayStartLocalTime} – {item.segment.displayEndLocalTime}: {item.title}</li>)}{todayProjection.allDayItems.filter(item => item.isBlocking).map(item => <li key={item.eventId}>Увесь день: {item.title}</li>)}{projectTodayTasks(tasks, reservations, selectedDate, activeZone, dailyPlan).relevant.filter(task => task.deadline).map(task => <li key={task.id}>Термін: {task.title}, {formatUkrainianDateHeading(deadlineDate(task, activeZone)!)}</li>)}</ul>
      </Card>}
      {planningTask && <TaskPlanningSheet key={planningTask.task.id + ':' + (planningTask.reservationId ?? '')} reviewAction={planningTask.reviewAction} task={planningTask.task} initialReservationId={planningTask.reservationId} date={selectedDate} zone={activeZone} tasks={tasks} events={events} reservations={reservations} repositories={repositories} onClose={() => setPlanningTask(null)} onSaved={() => onDataChanged()} />}
      {/* Midnight Rollover Notice Banner (6.3 Preserve viewport at midnight and offer actual-today return) */}
      {midnightRolloverDate && (
        <div
          className="p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
          data-testid="today-midnight-rollover-banner"
        >
          <span className="text-[13px] font-medium">
            {UK_STRINGS.destinations.today.midnightRolloverNotice(
              formatUkrainianDateHeading(midnightRolloverDate)
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
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
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

      {effectiveMode === 'habits' && habitsEnabled && habitsContent}
      {effectiveMode === 'tasks' && <TodayTasksPanel events={events} actualTodayDate={actualTodayDate} nowMs={nowMs} date={selectedDate} zone={activeZone} plan={dailyPlan} tasks={tasks} reservations={reservations} repositories={repositories} onChanged={() => onDataChanged()} onToggle={onToggleTaskState} onPlan={task => setPlanningTask({ task })} />}
      {effectiveMode === 'day' && <>
      {/* 5. Main Proportional Timeline for Selected Date (6.1 / 6.5) */}
      <SharedDayTimeline
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
        onInspectTask={(task, reservationId) => setPlanningTask({ task, reservationId })}
        onOpenGapPicker={onOpenGapPicker}
        onEmptyCreateAction={() => onOpenGlobalCreation('task')}
        emptyActionLabel={UK_STRINGS.creation.actions.task.label}
      />

      {nearestCommitment && <div className="today-next-commitment"><span className="ui-section-label">Далі</span><p>{nearestCommitment.item.segment.displayStartLocalTime} · {nearestCommitment.item.title}</p></div>}

      {/* 6. Clear Divider & Collapsible Next Calendar Date in the Same Scroll Flow (6.2 / C12) */}
      <div
        className="pt-4 border-t space-y-4"
        style={{ borderColor: 'var(--border-subtle)' }}
        data-testid="today-next-day-section"
      >
        <Card
          title={`${UK_STRINGS.destinations.today.nextDayDivider}: ${formatUkrainianDateHeading(
            nextDayDate
          )}`}
          headerRight={
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={!nextDayCollapsed}
              data-testid="today-toggle-next-day-button"
              onClick={() =>
                void onToggleNextDayCollapsed(!nextDayCollapsed)
              }
            >
              {nextDayCollapsed
                ? UK_STRINGS.destinations.today.expandNextDay
                : UK_STRINGS.destinations.today.collapseNextDay}
            </Button>
          }
        >
          {/* Meaningful Summary Always Visible when Collapsed (including Overnight Carryover) */}
          {nextDayCollapsed ? (
            <div
              className="space-y-2"
              data-testid="today-next-day-collapsed-summary"
            >
              <p
                className="text-[14px] m-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                {collapsedNextDaySummary.overnightCarryoverItems.length ? 'Перехідні події' : nextDayProjection.timelineItems.length ? 'Є заплановані події' : 'Поки без планів'}
              </p>
              {collapsedNextDaySummary.overnightCarryoverItems.length > 0 && (
                <ul className="space-y-1.5 m-0 p-0 list-none">
                  {collapsedNextDaySummary.overnightCarryoverItems.map(
                    (item) => (
                      <li
                        key={item.itemKey}
                        className="p-2.5 rounded-xl text-[13px] flex items-center justify-between gap-2"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <span>
                          <strong className="font-mono tabular-nums">
                            {item.segment.displayStartLocalTime} –{' '}
                            {item.segment.displayEndLocalTime}
                          </strong>{' '}
                          {item.title}
                        </span>
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: 'var(--color-work-text)' }}
                        >
                          {UK_STRINGS.scheduling.continuationFromPrevDayBadge}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          ) : (
            <div
              className="space-y-4"
              data-testid="today-next-day-expanded-content"
            >
              {/* Next Day Shared Proportional Timeline (same scale and scroll flow) */}
              <SharedDayTimeline
                onInspectHabitSession={onInspectHabitSession}
                testIdPrefix="today-next-day"
                projection={nextDayProjection}
                projectionWithReleased={nextDayProjectionWithReleased}
                nowMs={nowMs}
                events={events}
                tasks={tasks}
                reservations={reservations}
                onToggleTaskState={onToggleTaskState}
                onCancelEvent={onCancelEvent}
                onInspectEvent={onInspectEvent}
                onInspectTask={(task, reservationId) => setPlanningTask({ task, reservationId })}
                onOpenGapPicker={onOpenGapPicker}
              />
            </div>
          )}
        </Card>
      </div>
      </>}
    </div>
  );
}
