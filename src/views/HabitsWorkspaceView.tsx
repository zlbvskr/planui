import React, { useMemo, useState } from 'react';
import {
  Archive,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit3,
  PauseCircle,
  PlayCircle,
  Repeat,
  SkipForward,
  Trash2,
} from 'lucide-react';
import {
  EntityId,
  Habit,
  HabitEntry,
  HabitFrequencyRule,
  HabitLifecycleState,
  HabitTargetSpec,
  LifeAreaQuestion,
  LocalDateString,
  Project,
} from '../domain/types';
import {
  addDaysToLocalDate,
  formatUkrainianDateHeading,
} from '../domain/temporal';
import {
  HabitDateCellStatus,
  ISO_WEEKDAYS_UK,
  appendEffectiveHabitRuleRevision,
  computeHabitDeleteImpact,
  computeHabitMonthProgress,
  computeHabitStreakSummary,
  computeHabitWeekProgress,
  evaluateHabitOnDate,
  filterHabitsByLifecycleState,
  formatHabitRuleSummaryUk,
  getEffectiveHabitRuleRevisionForDate,
  getPreviousLocalDateForNightShift,
  getYearMonthFromLocalDate,
  sortHabitRuleRevisions,
} from '../domain/habits';
import {
  HabitsFilterMode,
  ImplementedCreationActionKind,
} from '../state/shellStore';
import { PlanuiRepositories } from '../storage/repositories';
import { UK_STRINGS } from '../i18n/uk';
import {
  Button,
  Card,
  EmptyStateCard,
  FeedbackBanner,
  InputField,
  ModalSheet,
  SegmentedControl,
  SelectField,
  TextAreaField,
} from '../components/ui/primitives';

export interface HabitsWorkspaceViewProps {
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  filter: HabitsFilterMode;
  habits: readonly Habit[];
  habitEntries: readonly HabitEntry[];
  projects: readonly Project[];
  lifeAreaQuestions: readonly LifeAreaQuestion[];
  repositories: PlanuiRepositories;
  onSelectDate: (nextDate: LocalDateString) => void;
  onChangeFilter: (nextFilter: HabitsFilterMode) => void;
  onOpenGlobalCreation: (preferredAction?: ImplementedCreationActionKind) => void;
  onDataChanged: (feedbackUk?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
}

function getCellSymbolAndLabelUk(status: HabitDateCellStatus): {
  symbol: string;
  shortLabelUk: string;
} {
  switch (status) {
    case 'completed':
      return { symbol: '✓', shortLabelUk: 'Виконано' };
    case 'partial':
      return { symbol: '◐', shortLabelUk: 'Частково' };
    case 'skipped':
      return { symbol: '↷', shortLabelUk: 'Пропущено (не є виконанням)' };
    case 'no_entry':
      return { symbol: '○', shortLabelUk: 'Без відмітки' };
    case 'not_scheduled':
      return { symbol: '·', shortLabelUk: 'Поза розкладом' };
    case 'paused':
      return { symbol: '⏸', shortLabelUk: 'На паузі' };
  }
}

export function HabitsWorkspaceView({
  selectedDate,
  actualTodayDate,
  filter,
  habits,
  habitEntries,
  projects,
  lifeAreaQuestions,
  repositories,
  onSelectDate,
  onChangeFilter,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}: HabitsWorkspaceViewProps) {
  const [expandedMonthHabitIds, setExpandedMonthHabitIds] = useState<
    Record<string, boolean>
  >({});
  const [numericDraftByHabit, setNumericDraftByHabit] = useState<
    Record<string, string>
  >({});

  // Edit / New Rule Revision Modal State
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState('repeat');
  const [editProjectId, setEditProjectId] = useState('');
  const [editLifeAreaId, setEditLifeAreaId] = useState('');
  const [editEffectiveDate, setEditEffectiveDate] = useState(selectedDate);
  const [editRuleKind, setEditRuleKind] = useState<
    'daily' | 'selected_weekdays' | 'weekly_frequency'
  >('daily');
  const [editWeekdaysIso, setEditWeekdaysIso] = useState<number[]>([1, 3, 5]);
  const [editTimesPerWeek, setEditTimesPerWeek] = useState<string>('3');
  const [editTargetKind, setEditTargetKind] = useState<'binary' | 'numeric'>(
    'binary'
  );
  const [editTargetValue, setEditTargetValue] = useState<string>('2000');
  const [editUnitUk, setEditUnitUk] = useState<string>('мл');
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirmation Modal State (9.3: Deletion explains history impact)
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);

  const previousLocalDate = useMemo(
    () => getPreviousLocalDateForNightShift(actualTodayDate),
    [actualTodayDate]
  );

  const filteredHabits = useMemo(
    () => filterHabitsByLifecycleState(habits, filter),
    [habits, filter]
  );

  const countsByState = useMemo(() => {
    let active = 0;
    let paused = 0;
    let archived = 0;
    for (const h of habits) {
      if (h.state === 'active') active += 1;
      else if (h.state === 'paused') paused += 1;
      else if (h.state === 'archived') archived += 1;
    }
    return { active, paused, archived };
  }, [habits]);

  const entriesByHabitId = useMemo(() => {
    const map = new Map<EntityId, HabitEntry[]>();
    for (const entry of habitEntries) {
      const list = map.get(entry.habitId) ?? [];
      list.push(entry);
      map.set(entry.habitId, list);
    }
    return map;
  }, [habitEntries]);

  const openEditModal = (habit: Habit) => {
    const currentRev =
      getEffectiveHabitRuleRevisionForDate(habit, selectedDate) ??
      sortHabitRuleRevisions(habit.ruleRevisions).at(-1);

    setEditingHabit(habit);
    setEditName(habit.name);
    setEditDescription(habit.description ?? '');
    setEditIcon(habit.icon ?? 'repeat');
    setEditProjectId(habit.projectId ?? '');
    setEditLifeAreaId(habit.lifeAreaId ?? '');
    setEditEffectiveDate(selectedDate);

    if (currentRev) {
      setEditRuleKind(currentRev.rule.kind);
      if (currentRev.rule.kind === 'selected_weekdays') {
        setEditWeekdaysIso([...currentRev.rule.weekdaysIso]);
      } else {
        setEditWeekdaysIso([1, 3, 5]);
      }
      if (currentRev.rule.kind === 'weekly_frequency') {
        setEditTimesPerWeek(String(currentRev.rule.timesPerWeek));
      } else {
        setEditTimesPerWeek('3');
      }

      setEditTargetKind(currentRev.target.kind);
      if (currentRev.target.kind === 'numeric') {
        setEditTargetValue(String(currentRev.target.targetValue));
        setEditUnitUk(currentRev.target.unitUk);
      } else {
        setEditTargetValue('2000');
        setEditUnitUk('мл');
      }
    }

    setEditError(null);
    onModalStateChange?.(true);
  };

  const closeEditModal = () => {
    setEditingHabit(null);
    setEditError(null);
    onModalStateChange?.(false);
  };

  const handleSaveHabitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHabit) return;
    setEditError(null);

    try {
      const nowIso = new Date().toISOString();
      let rule: HabitFrequencyRule;
      if (editRuleKind === 'daily') {
        rule = { kind: 'daily' };
      } else if (editRuleKind === 'selected_weekdays') {
        rule = {
          kind: 'selected_weekdays',
          weekdaysIso: [...editWeekdaysIso].sort((a, b) => a - b),
        };
      } else {
        rule = {
          kind: 'weekly_frequency',
          timesPerWeek: Number(editTimesPerWeek),
        };
      }

      const target: HabitTargetSpec =
        editTargetKind === 'binary'
          ? { kind: 'binary' }
          : {
              kind: 'numeric',
              targetValue: Number(editTargetValue),
              unitUk: editUnitUk.trim(),
            };

      const revId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const nextRevisions = appendEffectiveHabitRuleRevision(
        editingHabit.ruleRevisions,
        {
          id: revId,
          effectiveFromLocalDate: editEffectiveDate,
          rule,
          target,
          createdAt: nowIso,
        }
      );

      await repositories.saveHabit(
        {
          ...editingHabit,
          name: editName.trim(),
          description: editDescription.trim() ? editDescription.trim() : null,
          icon: editIcon.trim() ? editIcon.trim() : null,
          projectId: editProjectId ? editProjectId : null,
          lifeAreaId: editLifeAreaId ? editLifeAreaId : null,
          ruleRevisions: nextRevisions,
          updatedAt: nowIso,
          revision: editingHabit.revision + 1,
        },
        editingHabit.revision
      );

      closeEditModal();
      await onDataChanged(
        `Звичку «${editName.trim()}» оновлено (правило діє з ${editEffectiveDate}, попередню історію збережено).`
      );
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Не вдалося оновити звичку.'
      );
    }
  };

  const handleChangeState = async (
    habit: Habit,
    nextState: HabitLifecycleState
  ) => {
    try {
      await repositories.updateHabitStateTransactionally(
        habit.id,
        nextState,
        new Date().toISOString(),
        habit.revision
      );
      const stateLabel =
        nextState === 'active'
          ? 'відновлено'
          : nextState === 'paused'
          ? 'поставлено на паузу (історію збережено)'
          : 'перенесено в архів (історію збережено)';
      await onDataChanged(`Звичку «${habit.name}» ${stateLabel}.`);
    } catch (err) {
      await onDataChanged(
        err instanceof Error ? err.message : 'Не вдалося змінити стан звички.'
      );
    }
  };

  const confirmDeleteHabit = async () => {
    if (!deletingHabit) return;
    try {
      const targetName = deletingHabit.name;
      const { deletedEntriesCount } =
        await repositories.deleteHabitWithHistoryTransactionally(
          deletingHabit.id
        );
      setDeletingHabit(null);
      onModalStateChange?.(false);
      await onDataChanged(
        `Звичку «${targetName}» видалено разом із записами історії (${deletedEntriesCount}).`
      );
    } catch (err) {
      setDeletingHabit(null);
      onModalStateChange?.(false);
      await onDataChanged(
        err instanceof Error ? err.message : 'Не вдалося видалити звичку.'
      );
    }
  };

  const deleteImpact = useMemo(() => {
    if (!deletingHabit) return null;
    return computeHabitDeleteImpact(
      deletingHabit,
      entriesByHabitId.get(deletingHabit.id) ?? []
    );
  }, [deletingHabit, entriesByHabitId]);

  const activeYearMonth = selectedDate.slice(0, 7);
  const activeYearMonthObj = useMemo(
    () => getYearMonthFromLocalDate(selectedDate),
    [selectedDate]
  );

  return (
    <div className="space-y-4" data-testid="destination-view-habits">
      {/* 1. Header & Date Navigation with Easy Previous-Date Night-Shift Recording (9.2) */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[32px] font-bold tracking-tight leading-tight m-0">
            {UK_STRINGS.destinations.habits.title}
          </h1>
          <p
            className="text-[15px] m-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {UK_STRINGS.destinations.habits.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={UK_STRINGS.app.previousDayAria}
            data-testid="habits-prev-day-button"
            onClick={() => onSelectDate(addDaysToLocalDate(selectedDate, -1))}
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </Button>

          <Button
            type="button"
            variant={selectedDate === previousLocalDate ? 'primary' : 'secondary'}
            size="sm"
            data-testid="habits-night-shift-yesterday-btn"
            onClick={() => onSelectDate(previousLocalDate)}
          >
            За вчора після нічної зміни ({previousLocalDate})
          </Button>

          {selectedDate !== actualTodayDate && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="habits-return-today-button"
              onClick={() => onSelectDate(actualTodayDate)}
            >
              {UK_STRINGS.app.returnToToday} ({actualTodayDate})
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={UK_STRINGS.app.nextDayAria}
            data-testid="habits-next-day-button"
            onClick={() => onSelectDate(addDaysToLocalDate(selectedDate, 1))}
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {/* Date Context Bar */}
      <div
        className="p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
        data-testid="habits-date-context-bar"
      >
        <div className="space-y-0.5">
          <div className="text-[14px] font-semibold flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" aria-hidden="true" />
            <span data-testid="habits-selected-date-heading">
              Дата відмітки: {formatUkrainianDateHeading(selectedDate)} (
              {selectedDate})
            </span>
          </div>
          <div
            className="text-[12px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Відмітки зберігаються за явною локальною датою й не зміщуються під
            час зміни часового поясу.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="habits-explicit-date-picker"
            className="text-[13px] font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Інша дата:
          </label>
          <input
            id="habits-explicit-date-picker"
            type="date"
            lang="uk"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                onSelectDate(e.target.value);
              }
            }}
            data-testid="habits-date-input"
            className="min-h-[42px] px-3 py-1.5 rounded-xl text-[15px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        </div>
      </div>

      {/* Lifecycle Filter (Active / Paused / Archived) */}
      <SegmentedControl<HabitsFilterMode>
        ariaLabel={UK_STRINGS.destinations.habits.title}
        value={filter}
        onChange={onChangeFilter}
        options={[
          {
            value: 'active',
            label: `${UK_STRINGS.destinations.habits.filterActive} (${countsByState.active})`,
          },
          {
            value: 'paused',
            label: `${UK_STRINGS.destinations.habits.filterPaused} (${countsByState.paused})`,
          },
          {
            value: 'archived',
            label: `${UK_STRINGS.destinations.habits.filterArchived} (${countsByState.archived})`,
          },
        ]}
      />

      {/* Empty State or Habit List */}
      {filteredHabits.length === 0 ? (
        <EmptyStateCard
          icon={<Repeat className="w-5 h-5" />}
          title={
            filter === 'active'
              ? UK_STRINGS.destinations.habits.emptyTitle
              : filter === 'paused'
              ? 'Немає звичок на паузі'
              : 'Архів звичок порожній'
          }
          description={
            filter === 'active'
              ? UK_STRINGS.destinations.habits.emptyDescription
              : 'Пауза та архівація зберігають усю попередню історію відміток без спотворення статистики.'
          }
          actionLabel={filter === 'active' ? 'Нова звичка' : undefined}
          onAction={
            filter === 'active'
              ? () => onOpenGlobalCreation('habit')
              : undefined
          }
        />
      ) : (
        <div className="space-y-4" data-testid="habits-list-container">
          {filteredHabits.map((habit) => {
            const entriesForHabit = entriesByHabitId.get(habit.id) ?? [];
            const dayEval = evaluateHabitOnDate({
              habit,
              entriesForHabit,
              localDate: selectedDate,
            });
            const weekProgress = computeHabitWeekProgress(
              habit,
              entriesForHabit,
              selectedDate
            );
            const streakSummary = computeHabitStreakSummary(
              habit,
              entriesForHabit,
              selectedDate
            );
            const isMonthExpanded = Boolean(expandedMonthHabitIds[habit.id]);
            const monthProgress = isMonthExpanded
              ? computeHabitMonthProgress(
                  habit,
                  entriesForHabit,
                  activeYearMonthObj.year,
                  activeYearMonthObj.month
                )
              : null;

            const rev = dayEval.effectiveRevision;
            const isNumeric = rev.target.kind === 'numeric';
            const targetVal =
              rev.target.kind === 'numeric' ? rev.target.targetValue : 1;
            const unitUk =
              rev.target.kind === 'numeric' ? rev.target.unitUk : '';
            const currentNumeric = dayEval.numericValue ?? 0;

            const linkedProject = habit.projectId
              ? projects.find((p) => p.id === habit.projectId) ?? null
              : null;
            const linkedLifeArea = habit.lifeAreaId
              ? lifeAreaQuestions.find((la) => la.id === habit.lifeAreaId) ??
                null
              : null;

            const statusInfo = getCellSymbolAndLabelUk(dayEval.cellStatus);
            const sortedRevs = sortHabitRuleRevisions(habit.ruleRevisions);
            const streakBadgeText = `Серія: ${streakSummary.currentCount} ${streakSummary.unitLabelUk}`;

            return (
              <Card
                key={habit.id}
                data-testid={`habit-card-${habit.id}`}
                title={habit.name}
                subtitle={formatHabitRuleSummaryUk(rev.rule, rev.target)}
                headerRight={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="px-2.5 py-1 rounded-lg text-[12px] font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                      data-testid={`habit-streak-badge-${habit.id}`}
                      title={streakSummary.explanationUk}
                    >
                      {streakBadgeText}
                    </span>
                  </div>
                }
              >
                <div className="space-y-4">
                  {/* Optional Description & Context Badges */}
                  {(habit.description || linkedProject || linkedLifeArea) && (
                    <div className="space-y-1.5">
                      {habit.description && (
                        <p
                          className="text-[14px] m-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {habit.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        {linkedProject && (
                          <span
                            className="px-2 py-0.5 rounded-md font-medium"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            Проєкт: {linkedProject.title}
                          </span>
                        )}
                        {linkedLifeArea && (
                          <span
                            className="px-2 py-0.5 rounded-md font-medium"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            Сфера: {linkedLifeArea.questionTextUk}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Selected Date Recording Box (9.2) */}
                  <div
                    className="p-3.5 rounded-2xl space-y-3"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    data-testid={`habit-entry-box-${habit.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[14px] font-semibold">
                        Статус на {selectedDate}:{' '}
                        <span
                          style={{
                            color:
                              dayEval.cellStatus === 'completed'
                                ? 'var(--color-dayoff-text)'
                                : 'var(--text-primary)',
                          }}
                          data-testid={`habit-date-status-${habit.id}`}
                        >
                          {statusInfo.symbol} {statusInfo.shortLabelUk}
                          {isNumeric &&
                          (dayEval.cellStatus === 'completed' ||
                            dayEval.cellStatus === 'partial')
                            ? ` (${currentNumeric} / ${targetVal} ${unitUk})`
                            : ''}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {isNumeric ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              data-testid={`habit-num-step-btn-${habit.id}`}
                              onClick={async () => {
                                const step = Math.max(
                                  1,
                                  Math.round(targetVal / 4)
                                );
                                const nextVal = currentNumeric + step;
                                await repositories.recordHabitEntryForDateTransactionally(
                                  {
                                    habitId: habit.id,
                                    localDate: selectedDate,
                                    input: {
                                      kind: 'set_numeric',
                                      numericValue: nextVal,
                                    },
                                    nowIso: new Date().toISOString(),
                                  }
                                );
                                await onDataChanged(
                                  `Записано ${nextVal} ${unitUk} для «${habit.name}» на ${selectedDate}.`
                                );
                              }}
                            >
                              +{Math.max(1, Math.round(targetVal / 4))}{' '}
                              {unitUk}
                            </Button>

                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              data-testid={`habit-complete-btn-${habit.id}`}
                              onClick={async () => {
                                await repositories.recordHabitEntryForDateTransactionally(
                                  {
                                    habitId: habit.id,
                                    localDate: selectedDate,
                                    input: { kind: 'complete' },
                                    nowIso: new Date().toISOString(),
                                  }
                                );
                                await onDataChanged(
                                  `Норму «${habit.name}» (${targetVal} ${unitUk}) виконано на ${selectedDate}.`
                                );
                              }}
                            >
                              <CheckCircle2
                                className="w-4 h-4 mr-1"
                                aria-hidden="true"
                              />
                              Виконати норму ({targetVal} {unitUk})
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              data-testid={`habit-skip-btn-${habit.id}`}
                              onClick={async () => {
                                await repositories.recordHabitEntryForDateTransactionally(
                                  {
                                    habitId: habit.id,
                                    localDate: selectedDate,
                                    input: { kind: 'skip' },
                                    nowIso: new Date().toISOString(),
                                  }
                                );
                                await onDataChanged(
                                  `Дату ${selectedDate} позначено як свідомо пропущену для «${habit.name}» (не вважається виконанням).`
                                );
                              }}
                            >
                              <SkipForward
                                className="w-4 h-4 mr-1"
                                aria-hidden="true"
                              />
                              Пропустити
                            </Button>

                            {dayEval.entry && (
                              <Button
                                type="button"
                                variant="subtle"
                                size="sm"
                                data-testid={`habit-clear-btn-${habit.id}`}
                                onClick={async () => {
                                  await repositories.recordHabitEntryForDateTransactionally(
                                    {
                                      habitId: habit.id,
                                      localDate: selectedDate,
                                      input: { kind: 'clear' },
                                      nowIso: new Date().toISOString(),
                                    }
                                  );
                                  setNumericDraftByHabit((prev) => ({
                                    ...prev,
                                    [habit.id]: '',
                                  }));
                                  await onDataChanged(
                                    `Відмітку для «${habit.name}» за ${selectedDate} знято.`
                                  );
                                }}
                              >
                                Зняти відмітку
                              </Button>
                            )}
                          </div>

                          {/* Exact numeric value entry */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              aria-label={`Точне числове значення для ${habit.name} (${unitUk})`}
                              placeholder={`Введіть значення (${unitUk})`}
                              value={
                                numericDraftByHabit[habit.id] ??
                                (dayEval.numericValue !== null
                                  ? String(dayEval.numericValue)
                                  : '')
                              }
                              onChange={(e) =>
                                setNumericDraftByHabit((prev) => ({
                                  ...prev,
                                  [habit.id]: e.target.value,
                                }))
                              }
                              data-testid={`habit-numeric-input-${habit.id}`}
                              className="w-44 min-h-[42px] px-3 py-1.5 rounded-xl text-[15px]"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              data-testid={`habit-numeric-save-btn-${habit.id}`}
                              onClick={async () => {
                                const raw =
                                  numericDraftByHabit[habit.id]?.trim() ?? '';
                                const parsed = Number(raw);
                                if (raw === '' || Number.isNaN(parsed)) return;
                                await repositories.recordHabitEntryForDateTransactionally(
                                  {
                                    habitId: habit.id,
                                    localDate: selectedDate,
                                    input: {
                                      kind: 'set_numeric',
                                      numericValue: parsed,
                                    },
                                    nowIso: new Date().toISOString(),
                                  }
                                );
                                await onDataChanged(
                                  `Оновлено числове значення «${habit.name}» за ${selectedDate}: ${parsed} ${unitUk}.`
                                );
                              }}
                            >
                              Записати значення
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant={
                              dayEval.cellStatus === 'completed'
                                ? 'secondary'
                                : 'primary'
                            }
                            size="sm"
                            data-testid={`habit-complete-btn-${habit.id}`}
                            onClick={async () => {
                              await repositories.recordHabitEntryForDateTransactionally(
                                {
                                  habitId: habit.id,
                                  localDate: selectedDate,
                                  input: { kind: 'complete' },
                                  nowIso: new Date().toISOString(),
                                }
                              );
                              await onDataChanged(
                                `Звичку «${habit.name}» позначено виконаною за ${selectedDate}.`
                              );
                            }}
                          >
                            <CheckCircle2
                              className="w-4 h-4 mr-1"
                              aria-hidden="true"
                            />
                            Виконано
                          </Button>

                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`habit-skip-btn-${habit.id}`}
                            onClick={async () => {
                              await repositories.recordHabitEntryForDateTransactionally(
                                {
                                  habitId: habit.id,
                                  localDate: selectedDate,
                                  input: { kind: 'skip' },
                                  nowIso: new Date().toISOString(),
                                }
                              );
                              await onDataChanged(
                                `Звичку «${habit.name}» позначено як свідомо пропущену за ${selectedDate} (пропуск не є виконанням).`
                              );
                            }}
                          >
                            <SkipForward
                              className="w-4 h-4 mr-1"
                              aria-hidden="true"
                            />
                            Пропустити
                          </Button>

                          {dayEval.entry && (
                            <Button
                              type="button"
                              variant="subtle"
                              size="sm"
                              data-testid={`habit-clear-btn-${habit.id}`}
                              onClick={async () => {
                                await repositories.recordHabitEntryForDateTransactionally(
                                  {
                                    habitId: habit.id,
                                    localDate: selectedDate,
                                    input: { kind: 'clear' },
                                    nowIso: new Date().toISOString(),
                                  }
                                );
                                await onDataChanged(
                                  `Відмітку для «${habit.name}» за ${selectedDate} знято.`
                                );
                              }}
                            >
                              Зняти відмітку
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Restrained 7-Day Monday-Sunday Weekly Strip (9.3 / C14) */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                      <span
                        style={{ color: 'var(--text-secondary)' }}
                        data-testid={`habit-week-summary-${habit.id}`}
                      >
                        Тиждень {weekProgress.weekStartMonday} –{' '}
                        {weekProgress.weekEndSunday}: виконано{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {weekProgress.completedCount} /{' '}
                          {weekProgress.scheduledTargetCount}
                        </strong>
                        {weekProgress.partialCount > 0
                          ? ` · частково: ${weekProgress.partialCount}`
                          : ''}
                        {weekProgress.skippedCount > 0
                          ? ` · пропущено: ${weekProgress.skippedCount}`
                          : ''}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {streakSummary.explanationUk}
                      </span>
                    </div>

                    <div
                      className="grid grid-cols-7 gap-1.5"
                      role="group"
                      aria-label={`Тижнева історія для ${habit.name}`}
                    >
                      {weekProgress.days.map((day, idx) => {
                        const wdShort = ISO_WEEKDAYS_UK[idx]?.shortUk ?? '';
                        const isSelected = day.localDate === selectedDate;
                        const cellInfo = getCellSymbolAndLabelUk(
                          day.cellStatus
                        );
                        return (
                          <button
                            key={day.localDate}
                            type="button"
                            onClick={() => onSelectDate(day.localDate)}
                            aria-label={`${wdShort} ${day.localDate}: ${cellInfo.shortLabelUk}`}
                            aria-pressed={isSelected}
                            data-testid={`habit-week-cell-${habit.id}-${day.localDate}`}
                            className="min-h-[54px] p-1.5 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer planui-transition-micro"
                            style={{
                              backgroundColor:
                                day.cellStatus === 'completed'
                                  ? 'var(--bg-pressed)'
                                  : 'var(--bg-elevated)',
                              border: isSelected
                                ? '2px solid var(--color-brand)'
                                : '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <span
                              className="text-[11px] font-medium"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {wdShort} {day.localDate.slice(8, 10)}
                            </span>
                            <span
                              className="text-[14px] font-bold mt-0.5"
                              style={{
                                color:
                                  day.cellStatus === 'completed'
                                    ? 'var(--color-dayoff-text)'
                                    : day.cellStatus === 'not_scheduled' ||
                                      day.cellStatus === 'paused'
                                    ? 'var(--text-secondary)'
                                    : 'var(--text-primary)',
                              }}
                            >
                              {cellInfo.symbol}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expandable Monthly Overview & Rule Revision History (9.3) */}
                  <div
                    className="pt-2 border-t space-y-2.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="subtle"
                        size="sm"
                        aria-expanded={isMonthExpanded}
                        data-testid={`habit-month-toggle-${habit.id}`}
                        onClick={() =>
                          setExpandedMonthHabitIds((prev) => ({
                            ...prev,
                            [habit.id]: !prev[habit.id],
                          }))
                        }
                      >
                        {isMonthExpanded ? (
                          <>
                            <span>
                              Сховати місячний огляд ({activeYearMonth}) та
                              ревізії
                            </span>
                            <ChevronUp
                              className="w-4 h-4 ml-1"
                              aria-hidden="true"
                            />
                          </>
                        ) : (
                          <>
                            <span>
                              Історія за місяць ({activeYearMonth}) та ревізії
                              правила ({sortedRevs.length})
                            </span>
                            <ChevronDown
                              className="w-4 h-4 ml-1"
                              aria-hidden="true"
                            />
                          </>
                        )}
                      </Button>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          data-testid={`habit-edit-btn-${habit.id}`}
                          onClick={() => openEditModal(habit)}
                        >
                          <Edit3 className="w-4 h-4 mr-1" aria-hidden="true" />
                          Змінити / нове правило
                        </Button>

                        {habit.state === 'active' && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`habit-pause-btn-${habit.id}`}
                            onClick={() =>
                              void handleChangeState(habit, 'paused')
                            }
                          >
                            <PauseCircle
                              className="w-4 h-4 mr-1"
                              aria-hidden="true"
                            />
                            На паузу
                          </Button>
                        )}

                        {habit.state === 'paused' && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`habit-resume-btn-${habit.id}`}
                            onClick={() =>
                              void handleChangeState(habit, 'active')
                            }
                          >
                            <PlayCircle
                              className="w-4 h-4 mr-1"
                              aria-hidden="true"
                            />
                            Відновити
                          </Button>
                        )}

                        {habit.state !== 'archived' ? (
                          <Button
                            type="button"
                            variant="subtle"
                            size="sm"
                            data-testid={`habit-archive-btn-${habit.id}`}
                            onClick={() =>
                              void handleChangeState(habit, 'archived')
                            }
                          >
                            <Archive
                              className="w-4 h-4 mr-1"
                              aria-hidden="true"
                            />
                            В архів
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid={`habit-unarchive-btn-${habit.id}`}
                            onClick={() =>
                              void handleChangeState(habit, 'active')
                            }
                          >
                            Розархівувати
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          data-testid={`habit-delete-btn-${habit.id}`}
                          onClick={() => {
                            setDeletingHabit(habit);
                            onModalStateChange?.(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-1" aria-hidden="true" />
                          Видалити
                        </Button>
                      </div>
                    </div>

                    {isMonthExpanded && monthProgress && (
                      <div
                        className="p-3.5 rounded-2xl space-y-3"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                        data-testid={`habit-month-panel-${habit.id}`}
                      >
                        <div className="text-[13px] font-medium">
                          Підсумок за {activeYearMonth}: виконано днів —{' '}
                          <strong>{monthProgress.completedCount}</strong>,
                          частково —{' '}
                          <strong>{monthProgress.partialCount}</strong>,
                          свідомо пропущено —{' '}
                          <strong>{monthProgress.skippedCount}</strong> (із{' '}
                          {monthProgress.scheduledOpportunitiesCount}{' '}
                          запланованих днів).
                        </div>

                        <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                          {monthProgress.days.map((d) => {
                            const info = getCellSymbolAndLabelUk(d.cellStatus);
                            return (
                              <button
                                key={d.localDate}
                                type="button"
                                onClick={() => onSelectDate(d.localDate)}
                                aria-label={`${d.localDate}: ${info.shortLabelUk}`}
                                className="min-h-[38px] px-1 py-1 rounded-lg text-[11px] flex flex-col items-center justify-center cursor-pointer"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  border:
                                    d.localDate === selectedDate
                                      ? '1.5px solid var(--color-brand)'
                                      : '1px solid var(--border-subtle)',
                                }}
                              >
                                <span>{d.localDate.slice(8, 10)}</span>
                                <span className="font-bold">{info.symbol}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Effective-dated rule revisions list (9.3: Do not rewrite old history with new rules) */}
                        <div className="space-y-1 pt-1">
                          <div
                            className="text-[12px] font-semibold"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Історія ревізій правила за датами початку дії:
                          </div>
                          <ul
                            className="space-y-1 m-0 p-0 list-none text-[12px]"
                            data-testid={`habit-revisions-list-${habit.id}`}
                          >
                            {sortedRevs.map((r) => (
                              <li
                                key={r.id}
                                className="px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2"
                                style={{ backgroundColor: 'var(--bg-surface)' }}
                              >
                                <span>
                                  Діє з <strong>{r.effectiveFromLocalDate}</strong>
                                </span>
                                <span>
                                  {formatHabitRuleSummaryUk(r.rule, r.target)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal 1: Edit Habit Metadata & Append Effective-Dated Rule Revision (9.3) */}
      <ModalSheet
        isOpen={Boolean(editingHabit)}
        title="Редагування звички та ревізія правила"
        subtitle="Нове правило набуває чинності з обраної дати й не переписує попередню історію"
        onClose={closeEditModal}
      >
        {editingHabit && (
          <form
            onSubmit={handleSaveHabitRevision}
            className="space-y-3.5"
            data-testid="edit-habit-revision-form"
          >
            <InputField
              label="Назва звички"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              data-testid="edit-habit-name-input"
              required
            />

            <TextAreaField
              label="Опис або підказка (необов’язково)"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              data-testid="edit-habit-description-input"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label="Пов’язаний проєкт"
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
                options={[
                  { value: '', label: 'Без проєкту' },
                  ...projects.map((p) => ({ value: p.id, label: p.title })),
                ]}
              />
              <SelectField
                label="Сфера життя"
                value={editLifeAreaId}
                onChange={(e) => setEditLifeAreaId(e.target.value)}
                options={[
                  { value: '', label: 'Без прив’язки до сфери' },
                  ...lifeAreaQuestions.map((la) => ({
                    value: la.id,
                    label: la.questionTextUk,
                  })),
                ]}
              />
            </div>

            <InputField
              label="Нова ревізія правила діє з дати"
              type="date"
              lang="uk"
              value={editEffectiveDate}
              onChange={(e) => setEditEffectiveDate(e.target.value)}
              data-testid="edit-habit-effective-date-input"
              required
            />

            <div className="space-y-2">
              <span className="text-[14px] font-medium block">
                Правило повторення з цієї дати
              </span>
              <SegmentedControl<
                'daily' | 'selected_weekdays' | 'weekly_frequency'
              >
                ariaLabel="Правило повторення"
                value={editRuleKind}
                onChange={setEditRuleKind}
                options={[
                  { value: 'daily', label: 'Щодня' },
                  { value: 'selected_weekdays', label: 'Обрані дні' },
                  { value: 'weekly_frequency', label: 'Разів на тиждень' },
                ]}
              />

              {editRuleKind === 'selected_weekdays' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ISO_WEEKDAYS_UK.map((wd) => {
                    const selected = editWeekdaysIso.includes(wd.iso);
                    return (
                      <button
                        key={wd.iso}
                        type="button"
                        aria-pressed={selected}
                        data-testid={`edit-habit-weekday-${wd.iso}`}
                        onClick={() =>
                          setEditWeekdaysIso((prev) =>
                            prev.includes(wd.iso)
                              ? prev.filter((d) => d !== wd.iso)
                              : [...prev, wd.iso].sort((a, b) => a - b)
                          )
                        }
                        className="min-w-[44px] min-h-[44px] px-2.5 py-1.5 rounded-xl text-[13px] font-semibold cursor-pointer"
                        style={{
                          backgroundColor: selected
                            ? 'var(--color-brand)'
                            : 'var(--bg-elevated)',
                          color: selected ? '#FFFFFF' : 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {wd.shortUk}
                      </button>
                    );
                  })}
                </div>
              )}

              {editRuleKind === 'weekly_frequency' && (
                <InputField
                  label="Кількість разів на тиждень (1–7)"
                  type="number"
                  min={1}
                  max={7}
                  value={editTimesPerWeek}
                  onChange={(e) => setEditTimesPerWeek(e.target.value)}
                  data-testid="edit-habit-times-input"
                  required
                />
              )}
            </div>

            <div className="space-y-2">
              <span className="text-[14px] font-medium block">
                Ціль на день з цієї дати
              </span>
              <SegmentedControl<'binary' | 'numeric'>
                ariaLabel="Тип цілі"
                value={editTargetKind}
                onChange={setEditTargetKind}
                options={[
                  { value: 'binary', label: 'Бінарна' },
                  { value: 'numeric', label: 'Числова з одиницями' },
                ]}
              />

              {editTargetKind === 'numeric' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <InputField
                    label="Цільове значення (> 0)"
                    type="number"
                    min={1}
                    step="any"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(e.target.value)}
                    data-testid="edit-habit-target-value-input"
                    required
                  />
                  <InputField
                    label="Одиниці"
                    value={editUnitUk}
                    onChange={(e) => setEditUnitUk(e.target.value)}
                    data-testid="edit-habit-unit-input"
                    required
                  />
                </div>
              )}
            </div>

            {editError && (
              <FeedbackBanner
                tone="error"
                message={editError}
                onDismiss={() => setEditError(null)}
              />
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeEditModal}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="edit-habit-save-button"
              >
                {UK_STRINGS.app.saveButton}
              </Button>
            </div>
          </form>
        )}
      </ModalSheet>

      {/* Modal 2: Delete Habit with History Impact Explanation (9.3) */}
      <ModalSheet
        isOpen={Boolean(deletingHabit)}
        title="Видалення звички та історії"
        subtitle="Перевірте вплив на збережену історію перед остаточним видаленням"
        onClose={() => {
          setDeletingHabit(null);
          onModalStateChange?.(false);
        }}
      >
        {deletingHabit && deleteImpact && (
          <div className="space-y-4" data-testid="delete-habit-modal">
            <div
              className="p-3.5 rounded-2xl space-y-2 text-[14px]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
              data-testid="delete-habit-impact-summary"
            >
              <div>
                Ви збираєтеся видалити звичку{' '}
                <strong>«{deletingHabit.name}»</strong>.
              </div>
              {deleteImpact.totalEntriesCount === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>
                  Для цієї звички ще немає збережених записів виконання.
                </div>
              ) : (
                <div className="space-y-1">
                  <div>
                    Разом із нею буде остаточно видалено записів історії:{' '}
                    <strong data-testid="delete-habit-entries-count">
                      {deleteImpact.totalEntriesCount}
                    </strong>{' '}
                    (виконано: {deleteImpact.completedEntriesCount}, частково:{' '}
                    {deleteImpact.partialEntriesCount}, пропущено:{' '}
                    {deleteImpact.skippedEntriesCount}).
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Період записів: {deleteImpact.earliestLocalDate} —{' '}
                    {deleteImpact.latestLocalDate}. Якщо ви хочете зберегти
                    історію без відображення в активному списку, скористайтеся
                    дією «На паузу» або «В архів».
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDeletingHabit(null);
                  onModalStateChange?.(false);
                }}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                type="button"
                variant="danger"
                data-testid="confirm-delete-habit-button"
                onClick={() => void confirmDeleteHabit()}
              >
                Видалити звичку та історію
              </Button>
            </div>
          </div>
        )}
      </ModalSheet>
    </div>
  );
}
