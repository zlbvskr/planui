import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
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
  collectOlderUnresolvedAndOverdueTasks,
  computeCollapsedNextDaySummary,
  computeNearestCommitment,
  projectScheduleForDate,
} from '../domain/scheduling';
import {
  formatHabitRuleSummaryUk,
  getPreviousLocalDateForNightShift,
  selectHabitsForTodayBlock,
} from '../domain/habits';
import {
  PlanuiRepositories,
  TaskLifecycleUndoToken,
} from '../storage/repositories';
import { ImplementedCreationActionKind } from '../state/shellStore';
import { UK_STRINGS } from '../i18n/uk';
import { Button, Card } from '../components/ui/primitives';
import { SharedDayTimeline } from '../components/timeline/SharedDayTimeline';

export interface TodayWorkspaceViewProps {
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
  const [olderPlansExpanded, setOlderPlansExpanded] = useState(false);
  const [overdueExpanded, setOverdueExpanded] = useState(false);
  const [recordHabitForPreviousDate, setRecordHabitForPreviousDate] =
    useState(false);

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

  const { olderUnresolvedPlannedTasks, overdueDeadlineTasks } = useMemo(
    () =>
      collectOlderUnresolvedAndOverdueTasks({
        tasks,
        reservations,
        selectedDate,
        displayZone: activeZone,
        nowMs,
      }),
    [tasks, reservations, selectedDate, activeZone, nowMs]
  );

  // 6.2 & 9.4 Compact habits when real active habits exist, filtered by selected-date relevance
  const activeRealHabits = useMemo(
    () => habits.filter((h) => h.state === 'active'),
    [habits]
  );

  const previousLocalDateForHabits = useMemo(
    () => getPreviousLocalDateForNightShift(selectedDate),
    [selectedDate]
  );

  const effectiveHabitRecordingDate = recordHabitForPreviousDate
    ? previousLocalDateForHabits
    : selectedDate;

  const relevantTodayHabits = useMemo(
    () =>
      selectHabitsForTodayBlock(
        habits,
        habitEntries,
        effectiveHabitRecordingDate
      ),
    [habits, habitEntries, effectiveHabitRecordingDate]
  );

  const todayUntimedTasks = todayProjection.untimedDateOnlyTasks;

  const handleMoveTaskToSelectedDate = async (task: Task) => {
    try {
      const nowIso = new Date().toISOString();
      if (task.planningState === 'timed') {
        await repositories.removeTaskCurrentPlanningTransactionally(
          task.id,
          nowIso
        );
      }
      const freshSnap = await repositories.captureCoherentSnapshot();
      const currentTask =
        freshSnap.snapshot.tasks.find((t) => t.id === task.id) ?? task;
      await repositories.saveTask(
        {
          ...currentTask,
          planningState: 'date_only',
          plannedDate: selectedDate,
          updatedAt: nowIso,
          revision: currentTask.revision + 1,
        },
        currentTask.revision
      );
      await onDataChanged(`Справу «${task.title}» заплановано на ${selectedDate}.`);
    } catch (err) {
      await onDataChanged(
        err instanceof Error ? err.message : 'Не вдалося перенести справу.'
      );
    }
  };

  const handleClearTaskPlanning = async (task: Task) => {
    try {
      await repositories.removeTaskCurrentPlanningTransactionally(
        task.id,
        new Date().toISOString()
      );
      await onDataChanged(
        `Планування для справи «${task.title}» знято (справа залишилась у «Планах»).`
      );
    } catch (err) {
      await onDataChanged(
        err instanceof Error ? err.message : 'Не вдалося зняти планування.'
      );
    }
  };

  return (
    <div className="space-y-4" data-testid="destination-view-today">
      {/* 1. Selected Date / Weekday, Navigation, and One-Action Return to Actual Today (6.2) */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[32px] font-bold tracking-tight leading-tight m-0">
              {UK_STRINGS.destinations.today.title}
            </h1>
            {selectedDate === actualTodayDate && (
              <span
                className="text-[13px] font-semibold"
                style={{ color: 'var(--color-brand-text)' }}
                data-testid="today-actual-today-indicator"
              >
                · {UK_STRINGS.app.todayBadge}
              </span>
            )}
          </div>
          <p
            className="text-[15px] m-0"
            style={{ color: 'var(--text-secondary)' }}
            data-testid="today-selected-date-heading"
          >
            {formatUkrainianDateHeading(selectedDate)} ({selectedDate})
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="icon"
            aria-label={UK_STRINGS.app.previousDayAria}
            data-testid="today-prev-day-button"
            onClick={() => onSelectDate(addDaysToLocalDate(selectedDate, -1))}
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </Button>
          {selectedDate !== actualTodayDate && (
            <Button
              variant="secondary"
              size="sm"
              data-testid="today-return-to-actual-today-button"
              onClick={() => onSelectDate(actualTodayDate)}
            >
              {UK_STRINGS.app.returnToToday}
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            aria-label={UK_STRINGS.app.nextDayAria}
            data-testid="today-next-day-button"
            onClick={() => onSelectDate(addDaysToLocalDate(selectedDate, 1))}
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

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

      {/* 2. Compact Nearest Commitment (6.2) */}
      <Card
        title={UK_STRINGS.destinations.today.nearestCommitmentLabel}
        data-testid="today-nearest-commitment-card"
      >
        {!nearestCommitment ? (
          <p
            className="text-[14px] m-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {UK_STRINGS.destinations.today.noCommitmentsToday}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
            <div>
              <span className="font-mono tabular-nums font-semibold">
                {nearestCommitment.item.segment.displayStartLocalTime} –{' '}
                {nearestCommitment.item.segment.displayEndLocalTime}:
              </span>{' '}
              <strong>{nearestCommitment.item.title}</strong>
            </div>
            <span
              className="text-[12px] font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {nearestCommitment.badgeUk}
            </span>
          </div>
        )}
      </Card>

      {/* 3. Compact Habits ONLY when real data exists (6.2 & 9.4: Selected-date relevance, shared entries, previous-date night-shift toggle) */}
      {activeRealHabits.length > 0 && (
        <Card
          title={UK_STRINGS.destinations.today.compactHabitsSection}
          data-testid="today-compact-habits-card"
          headerRight={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant={recordHabitForPreviousDate ? 'primary' : 'secondary'}
                size="sm"
                data-testid="today-habits-prev-date-toggle"
                onClick={() => setRecordHabitForPreviousDate((prev) => !prev)}
              >
                {recordHabitForPreviousDate
                  ? `За вчора (${previousLocalDateForHabits})`
                  : `За вчора після нічної зміни (${previousLocalDateForHabits})`}
              </Button>
              {onNavigateToHabits && (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  data-testid="today-open-habits-view-button"
                  onClick={() =>
                    onNavigateToHabits(effectiveHabitRecordingDate)
                  }
                >
                  Усі звички
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-2.5">
            <div
              className="text-[12px] flex items-center justify-between gap-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span data-testid="today-habits-active-date-label">
                Дата відмітки:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {effectiveHabitRecordingDate}
                </strong>
                {recordHabitForPreviousDate
                  ? ' (попередня доба після нічної зміни)'
                  : ''}
              </span>
              <span>Не займають час у календарі</span>
            </div>

            {relevantTodayHabits.length === 0 ? (
              <p
                className="text-[14px] m-0"
                style={{ color: 'var(--text-secondary)' }}
                data-testid="today-habits-none-scheduled"
              >
                На дату {effectiveHabitRecordingDate} немає запланованих
                активних звичок (або тижневу норму вже виконано).
              </p>
            ) : (
              <ul className="space-y-2 m-0 p-0 list-none">
                {relevantTodayHabits.map((evaluation) => {
                  const habit = habits.find(
                    (h) => h.id === evaluation.habitId
                  );
                  if (!habit) return null;
                  const rev = evaluation.effectiveRevision;
                  const isNumeric = rev.target.kind === 'numeric';
                  const targetVal =
                    rev.target.kind === 'numeric' ? rev.target.targetValue : 1;
                  const unitUk =
                    rev.target.kind === 'numeric' ? rev.target.unitUk : '';
                  const currentVal = evaluation.numericValue ?? 0;

                  const statusLabelUk =
                    evaluation.cellStatus === 'completed'
                      ? isNumeric
                        ? `Виконано (${currentVal}/${targetVal} ${unitUk})`
                        : '✓ Виконано'
                      : evaluation.cellStatus === 'partial'
                      ? `◐ Частково (${currentVal}/${targetVal} ${unitUk})`
                      : evaluation.cellStatus === 'skipped'
                      ? '↷ Пропущено'
                      : isNumeric
                      ? `0 / ${targetVal} ${unitUk}`
                      : 'Без відмітки';

                  return (
                    <li
                      key={habit.id}
                      data-testid={`today-habit-row-${habit.id}`}
                      className="p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[14px]"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <Repeat className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>{habit.name}</span>
                        </div>
                        <div
                          className="text-[12px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {formatHabitRuleSummaryUk(rev.rule, rev.target)} ·{' '}
                          <strong
                            style={{
                              color:
                                evaluation.cellStatus === 'completed'
                                  ? 'var(--color-dayoff-text)'
                                  : 'var(--text-primary)',
                            }}
                            data-testid={`today-habit-status-${habit.id}`}
                          >
                            {statusLabelUk}
                          </strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isNumeric && evaluation.cellStatus !== 'completed' && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`today-habit-partial-btn-${habit.id}`}
                            onClick={async () => {
                              const step = Math.max(
                                1,
                                Math.round(targetVal / 2)
                              );
                              const nextVal = currentVal + step;
                              await repositories.recordHabitEntryForDateTransactionally(
                                {
                                  habitId: habit.id,
                                  localDate: effectiveHabitRecordingDate,
                                  input: {
                                    kind: 'set_numeric',
                                    numericValue: nextVal,
                                  },
                                  nowIso: new Date().toISOString(),
                                }
                              );
                              await onDataChanged(
                                `Оновлено прогрес «${habit.name}» на ${effectiveHabitRecordingDate}: ${nextVal} ${unitUk}.`
                              );
                            }}
                          >
                            +{Math.max(1, Math.round(targetVal / 2))} {unitUk}
                          </Button>
                        )}

                        {evaluation.cellStatus !== 'completed' ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            data-testid={`today-habit-complete-btn-${habit.id}`}
                            onClick={async () => {
                              await repositories.recordHabitEntryForDateTransactionally(
                                {
                                  habitId: habit.id,
                                  localDate: effectiveHabitRecordingDate,
                                  input: { kind: 'complete' },
                                  nowIso: new Date().toISOString(),
                                }
                              );
                              await onDataChanged(
                                `Звичку «${habit.name}» відмічено виконаною за ${effectiveHabitRecordingDate}.`
                              );
                            }}
                          >
                            Виконано
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`today-habit-clear-btn-${habit.id}`}
                            onClick={async () => {
                              await repositories.recordHabitEntryForDateTransactionally(
                                {
                                  habitId: habit.id,
                                  localDate: effectiveHabitRecordingDate,
                                  input: { kind: 'clear' },
                                  nowIso: new Date().toISOString(),
                                }
                              );
                              await onDataChanged(
                                `Відмітку звички «${habit.name}» за ${effectiveHabitRecordingDate} знято.`
                              );
                            }}
                          >
                            Зняти
                          </Button>
                        )}

                        {evaluation.cellStatus !== 'skipped' &&
                          evaluation.cellStatus !== 'completed' && (
                            <Button
                              type="button"
                              variant="subtle"
                              size="sm"
                              data-testid={`today-habit-skip-btn-${habit.id}`}
                              onClick={async () => {
                                await repositories.recordHabitEntryForDateTransactionally(
                                  {
                                    habitId: habit.id,
                                    localDate: effectiveHabitRecordingDate,
                                    input: { kind: 'skip' },
                                    nowIso: new Date().toISOString(),
                                  }
                                );
                                await onDataChanged(
                                  `Звичку «${habit.name}» позначено як свідомо пропущену за ${effectiveHabitRecordingDate}.`
                                );
                              }}
                            >
                              Пропустити
                            </Button>
                          )}

                        {(evaluation.cellStatus === 'partial' ||
                          evaluation.cellStatus === 'skipped') && (
                          <Button
                            type="button"
                            variant="subtle"
                            size="sm"
                            data-testid={`today-habit-reset-btn-${habit.id}`}
                            onClick={async () => {
                              await repositories.recordHabitEntryForDateTransactionally(
                                {
                                  habitId: habit.id,
                                  localDate: effectiveHabitRecordingDate,
                                  input: { kind: 'clear' },
                                  nowIso: new Date().toISOString(),
                                }
                              );
                              await onDataChanged(
                                `Відмітку «${habit.name}» за ${effectiveHabitRecordingDate} очищено.`
                              );
                            }}
                          >
                            Очистити
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      )}

      {/* 4. Collapsible Untimed Date-Planned Tasks + Separate Compact Older Plans & Overdue Deadlines (6.2 / 6.4) */}
      <Card
        title={UK_STRINGS.destinations.today.untimedTasksSection}
        data-testid="today-untimed-tasks-card"
        headerRight={
          <div className="flex items-center gap-2">
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{ color: 'var(--text-secondary)' }}
              data-testid="today-untimed-count"
            >
              {todayUntimedTasks.length}
            </span>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              aria-expanded={!untimedCollapsed}
              data-testid="today-toggle-untimed-button"
              onClick={onToggleUntimedCollapsed}
            >
              {untimedCollapsed ? (
                <>
                  <span>{UK_STRINGS.destinations.today.expandUntimedTasks}</span>
                  <ChevronDown className="w-4 h-4 ml-1" aria-hidden="true" />
                </>
              ) : (
                <>
                  <span>
                    {UK_STRINGS.destinations.today.collapseUntimedTasks}
                  </span>
                  <ChevronUp className="w-4 h-4 ml-1" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {!untimedCollapsed && (
            <>
              {todayUntimedTasks.length === 0 ? (
                <p
                  className="text-[14px] m-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.destinations.today.noUntimedTasks}
                </p>
              ) : (
                <ul className="space-y-2 m-0 p-0 list-none">
                  {todayUntimedTasks.map((task) => {
                    const completed = task.state === 'completed';
                    return (
                      <li
                        key={task.id}
                        data-testid={`today-untimed-task-${task.title}`}
                        className="p-3 rounded-xl flex items-center justify-between gap-3"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <button
                          type="button"
                          onClick={() => void onToggleTaskState(task.id)}
                          className="min-h-[44px] flex items-center gap-3 text-left flex-1 cursor-pointer"
                        >
                          {completed ? (
                            <CheckCircle2
                              className="w-5 h-5 shrink-0"
                              style={{ color: 'var(--color-dayoff)' }}
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle
                              className="w-5 h-5 shrink-0"
                              style={{ color: 'var(--text-secondary)' }}
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={`text-[15px] font-medium ${
                              completed ? 'line-through opacity-70' : ''
                            }`}
                          >
                            {task.title}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {/* Compact Access to Older Unresolved Plans (6.4: Never auto-copied into Today) */}
          {olderUnresolvedPlannedTasks.length > 0 && (
            <div
              className="pt-2 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
              data-testid="today-older-unresolved-section"
            >
              <button
                type="button"
                aria-expanded={olderPlansExpanded}
                data-testid="today-older-unresolved-toggle"
                onClick={() => setOlderPlansExpanded((prev) => !prev)}
                className="w-full min-h-[44px] flex items-center justify-between text-left text-[13px] font-semibold cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span>
                  {UK_STRINGS.destinations.today.olderUnresolvedPlansToggle(
                    olderUnresolvedPlannedTasks.length
                  )}
                </span>
                {olderPlansExpanded ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {olderPlansExpanded && (
                <div className="space-y-2">
                  <p
                    className="text-[12px] m-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {UK_STRINGS.destinations.today.olderUnresolvedPlansSubtitle}
                  </p>
                  <ul className="space-y-1.5 m-0 p-0 list-none">
                    {olderUnresolvedPlannedTasks.map(({ task, reasonUk }) => (
                      <li
                        key={task.id}
                        data-testid={`today-older-unresolved-item-${task.title}`}
                        className="p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[13px]"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold">{task.title}</div>
                          <div
                            className="text-[11px]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {reasonUk}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            data-testid={`today-reschedule-older-to-selected-${task.title}`}
                            onClick={() =>
                              void handleMoveTaskToSelectedDate(task)
                            }
                          >
                            {
                              UK_STRINGS.destinations.today
                                .rescheduleToSelectedDateButton
                            }
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            data-testid={`today-clear-older-planning-${task.title}`}
                            onClick={() => void handleClearTaskPlanning(task)}
                          >
                            {
                              UK_STRINGS.destinations.today
                                .clearTaskPlanningButton
                            }
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Separate Overdue Deadlines Drawer (6.4: Keep overdue deadlines separate from elapsed planning) */}
          {overdueDeadlineTasks.length > 0 && (
            <div
              className="pt-2 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
              data-testid="today-overdue-deadlines-section"
            >
              <button
                type="button"
                aria-expanded={overdueExpanded}
                data-testid="today-overdue-deadlines-toggle"
                onClick={() => setOverdueExpanded((prev) => !prev)}
                className="w-full min-h-[44px] flex items-center justify-between text-left text-[13px] font-semibold cursor-pointer"
                style={{ color: 'var(--color-brand-text)' }}
              >
                <span>
                  {UK_STRINGS.destinations.today.overdueDeadlinesToggle(
                    overdueDeadlineTasks.length
                  )}
                </span>
                {overdueExpanded ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {overdueExpanded && (
                <div className="space-y-2">
                  <p
                    className="text-[12px] m-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {UK_STRINGS.destinations.today.overdueDeadlinesSubtitle}
                  </p>
                  <ul className="space-y-1.5 m-0 p-0 list-none">
                    {overdueDeadlineTasks.map(({ task, deadlineLabelUk }) => (
                      <li
                        key={task.id}
                        data-testid={`today-overdue-deadline-item-${task.title}`}
                        className="p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[13px]"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold">{task.title}</div>
                          <div
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--color-brand-text)' }}
                          >
                            {deadlineLabelUk}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void onToggleTaskState(task.id)}
                          >
                            {UK_STRINGS.plansView.completeTaskButton}
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() =>
                              void handleMoveTaskToSelectedDate(task)
                            }
                          >
                            {
                              UK_STRINGS.destinations.today
                                .rescheduleToSelectedDateButton
                            }
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 5. Main Proportional Timeline for Selected Date (6.1 / 6.5) */}
      <SharedDayTimeline
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
        onOpenGapPicker={onOpenGapPicker}
        onEmptyCreateAction={() => onOpenGlobalCreation('task')}
        emptyActionLabel={UK_STRINGS.creation.actions.task.label}
      />

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
                {collapsedNextDaySummary.summaryTextUk}
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
              {nextDayProjection.timelineItems.length === 0 &&
              nextDayProjection.untimedDateOnlyTasks.length === 0 &&
              nextDayProjection.allDayItems.length === 0 ? (
                <p
                  className="text-[14px] m-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.destinations.today.nextDaySummaryEmpty}
                </p>
              ) : (
                <ul className="space-y-1.5 m-0 p-0 list-none">
                  {nextDayProjection.timelineItems.map((item) => (
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
                      {item.segment.continuesBeforeDayStart && (
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: 'var(--color-work-text)' }}
                        >
                          {UK_STRINGS.scheduling.continuationFromPrevDayBadge}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Next Day Shared Proportional Timeline (compact mode in same scroll flow) */}
              <SharedDayTimeline
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
                onOpenGapPicker={onOpenGapPicker}
                compactMode
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
