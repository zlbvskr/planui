import { MeasureField } from '../components/create/MeasureField';
import { logMeasure } from '../domain/modelHelpers';
import { ParamRow } from '../components/create/ParamRow';
import { WhenField } from '../components/create/WhenField';
import { SphereField } from '../components/create/SphereField';
import { ChevronDown, ChevronRight, Check } from '../ui/icons';
import { Section, SubHeader } from '../ui/headers';
import { Row, RowTextValue } from '../ui/rows';
import { ActionMenu, AlertSheet, InfoSheet, Sheet } from '../ui/sheets';
import { DateField, SelectField } from '../ui/fields';
import { Button } from '../ui/buttons';
import { FeedbackBanner, InputField, TextAreaField } from '../ui/primitives';
import { Orb } from '../ui/Orb';
import { EmptyState } from '../ui/EmptyState';
import { Checkbox } from '../ui/Checkbox';
import { orbVars } from '../domain/modelHelpers';
import { ProgressRing } from '../ui/ProgressRing';
import { HeroArt } from '../ui/art';
import { formatDate } from '../lib/format';
import React, { useMemo, useState, useEffect } from "react";
import { CalendarEvent, EntityId, Goal, Habit, HabitEntry, HabitFrequencyRule, HabitLifecycleState, HabitTargetSpec, LifeAreaAssessment, LifeAreaQuestion, LocalDateString, Project, Folder } from '../domain/types';
import { addDaysToLocalDate, resolveLocalDateTimeToInstant } from '../domain/temporal';
import { ISO_WEEKDAYS_UK, appendEffectiveHabitRuleRevision, evaluateHabitOnDate, computeHabitStreakSummary, getEffectiveHabitRuleRevisionForDate, getPreviousLocalDateForNightShift, sortHabitRuleRevisions } from '../domain/habits';
import { HabitsFilterMode, ImplementedCreationActionKind } from '../state/shellStore';
import { PlanuiRepositories } from '../storage/repositories';
import { UK_STRINGS } from '../i18n/uk';
import { itemColor } from '../domain/modelHelpers';

function reminderFallsInSleep(
  reminder: string,
  date: string,
  zone: string,
  events: readonly CalendarEvent[],
): boolean {
  const time = reminder.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/)?.[0];
  if (!time || !date) return false;
  try {
    const candidate = resolveLocalDateTimeToInstant(date, time, zone).instant;
    return events.some(
      (e) =>
        e.state === "active" &&
        e.type === "sleep" &&
        (e.schedule.kind === "timed"
          ? e.schedule.interval.startInstant <= candidate &&
            e.schedule.interval.endInstant > candidate
          : e.schedule.startLocalDate <= date &&
            e.schedule.endLocalDateExclusive > date),
    );
  } catch {
    return false;
  }
}

function SleepReminderNote({
  reminder,
  date,
  zone,
  events,
}: {
  reminder: string;
  date: string;
  zone: string;
  events: readonly CalendarEvent[];
}) {
  return reminderFallsInSleep(reminder, date, zone, events) ? (
    <p role="note" className="review-amber">
      Нагадування потрапляє у ваш блок сну.
    </p>
  ) : null;
}


export interface HabitsWorkspaceViewProps {
  nightShiftAlternative?: boolean;
  events?: readonly CalendarEvent[];
  zone?: string;
  onHistoryChange?: (open: boolean) => void;
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  filter: HabitsFilterMode;
  habits: readonly Habit[];
  habitEntries: readonly HabitEntry[];
  projects: readonly Project[];
  goals?: readonly Goal[];
  folders?: readonly Folder[];
  dayOffDates?: readonly string[];
  onPlanHabit?: (habitId: string, date: string) => void;
  lifeAreaQuestions: readonly LifeAreaQuestion[];
  lifeAreaAssessments?: readonly LifeAreaAssessment[];
  repositories: PlanuiRepositories;
  onSelectDate: (nextDate: LocalDateString) => void;
  onChangeFilter: (nextFilter: HabitsFilterMode) => void;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  onDataChanged: (feedbackUk?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
}

export function HabitsWorkspaceView({
  selectedDate,
  events = [],
  zone = "",
  onHistoryChange,
  nightShiftAlternative = false,
  actualTodayDate,
  habits,
  habitEntries,
  projects,
  goals = [],
  folders = [],
  dayOffDates = [],
  lifeAreaQuestions,
  lifeAreaAssessments = [],
  repositories,
  onSelectDate,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}: HabitsWorkspaceViewProps) {
  const [history, setHistory] = useState(false);
  const [editAdvanced, setEditAdvanced] = useState(false);
  useEffect(() => {
    onHistoryChange?.(history);
    return () => onHistoryChange?.(false);
  }, [history, onHistoryChange]);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [movingHabit, setMovingHabit] = useState<Habit | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [activeActionHabit, setActiveActionHabit] = useState<Habit | null>(null);
  const [numericDraftByHabit, setNumericDraftByHabit] = useState<
    Record<string, string>
  >({});

  const modelCtx = useMemo(
    () => ({
      folders,
      projects,
      goals,
      lifeAreas: lifeAreaQuestions,
      assessments: lifeAreaAssessments,
    }),
    [folders, projects, goals, lifeAreaQuestions, lifeAreaAssessments],
  );

  // Edit / New Rule Revision Modal State
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editMinimum, setEditMinimum] = useState("");
  const [editCue, setEditCue] = useState("");
  const [editReminder, setEditReminder] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("repeat");
  const [editProjectId, setEditProjectId] = useState("");
  const [editLifeAreaId, setEditLifeAreaId] = useState("");
  const [editEffectiveDate, setEditEffectiveDate] = useState(selectedDate);
  const [editRuleKind, setEditRuleKind] = useState<
    "daily" | "days_off" | "selected_weekdays" | "weekly_frequency"
  >("daily");
  const [editWeekdaysIso, setEditWeekdaysIso] = useState<number[]>([1, 3, 5]);
  const [editTimesPerWeek, setEditTimesPerWeek] = useState<string>("3");
  const [editTargetKind, setEditTargetKind] = useState<"binary" | "numeric">(
    "binary",
  );
  const [editTargetValue, setEditTargetValue] = useState<string>("2000");
  const [editUnitUk, setEditUnitUk] = useState<string>("мл");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirmation Modal State (9.3: Deletion explains history impact)
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);

  const previousLocalDate = useMemo(
    () => getPreviousLocalDateForNightShift(actualTodayDate),
    [actualTodayDate],
  );

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
    setEditMinimum(habit.minimumVersionUk ?? "");
    setEditCue(habit.contextCueUk ?? "");
    setEditReminder(habit.reminderIntentionUk ?? "");
    setEditFolder(habit.folderId ?? "");
    const currentRev =
      getEffectiveHabitRuleRevisionForDate(habit, selectedDate) ??
      sortHabitRuleRevisions(habit.ruleRevisions).at(-1);

    setEditAdvanced(false);
    setEditingHabit(habit);
    setEditName(habit.name);
    setEditDescription(habit.description ?? "");
    setEditIcon(habit.icon ?? "repeat");
    setEditProjectId(habit.projectId ?? "");
    setEditLifeAreaId(habit.lifeAreaId ?? "");
    setEditEffectiveDate(selectedDate);

    if (currentRev) {
      setEditRuleKind(currentRev.rule.kind);
      if (currentRev.rule.kind === "selected_weekdays") {
        setEditWeekdaysIso([...currentRev.rule.weekdaysIso]);
      } else {
        setEditWeekdaysIso([1, 3, 5]);
      }
      if (currentRev.rule.kind === "weekly_frequency") {
        setEditTimesPerWeek(String(currentRev.rule.timesPerWeek));
      } else {
        setEditTimesPerWeek("3");
      }

      setEditTargetKind(currentRev.target.kind);
      if (currentRev.target.kind === "numeric") {
        setEditTargetValue(String(currentRev.target.targetValue));
        setEditUnitUk(currentRev.target.unitUk);
      } else {
        setEditTargetValue("2000");
        setEditUnitUk("мл");
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
      if (editRuleKind === "days_off") {
        rule = { kind: "days_off" };
      } else if (editRuleKind === "daily") {
        rule = { kind: "daily" };
      } else if (editRuleKind === "selected_weekdays") {
        rule = {
          kind: "selected_weekdays",
          weekdaysIso: [...editWeekdaysIso].sort((a, b) => a - b),
        };
      } else {
        rule = {
          kind: "weekly_frequency",
          timesPerWeek: Number(editTimesPerWeek),
        };
      }

      const target: HabitTargetSpec =
        editTargetKind === "binary"
          ? { kind: "binary" }
          : {
              kind: "numeric",
              targetValue: Number(editTargetValue),
              unitUk: editUnitUk.trim(),
            };

      const revId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
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
        },
      );

      await repositories.saveHabit(
        {
          ...editingHabit,
          name: editName.trim(),
          minimumVersionUk: editMinimum.trim() || null,
          contextCueUk: editCue.trim() || null,
          reminderIntentionUk: editReminder.trim() || null,
          folderId: editProjectId ? null : editFolder || null,
          description: editDescription.trim() ? editDescription.trim() : null,
          icon: editIcon.trim() ? editIcon.trim() : null,
          projectId: editProjectId ? editProjectId : null,
          lifeAreaId: editLifeAreaId ? editLifeAreaId : null,
          ruleRevisions: nextRevisions,
          updatedAt: nowIso,
          revision: editingHabit.revision + 1,
        },
        editingHabit.revision,
      );

      closeEditModal();
      await onDataChanged(`Звичку «${editName.trim()}» оновлено.`);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Не вдалося оновити звичку.",
      );
    }
  };

  const handleChangeState = async (
    habit: Habit,
    nextState: HabitLifecycleState,
  ) => {
    try {
      await repositories.updateHabitStateTransactionally(
        habit.id,
        nextState,
        new Date().toISOString(),
        habit.revision,
      );
      const stateLabel =
        nextState === "active"
          ? "відновлено"
          : nextState === "paused"
            ? "поставлено на паузу (історію збережено)"
            : "перенесено в архів (історію збережено)";
      await onDataChanged(`Звичку «${habit.name}» ${stateLabel}.`);
    } catch (err) {
      await onDataChanged(
        err instanceof Error ? err.message : "Не вдалося змінити стан звички.",
      );
    }
  };

  const confirmDeleteHabit = async () => {
    if (!deletingHabit) return;
    try {
      const targetName = deletingHabit.name;
      const { deletedEntriesCount } =
        await repositories.deleteHabitWithHistoryTransactionally(
          deletingHabit.id,
        );
      setDeletingHabit(null);
      onModalStateChange?.(false);
      await onDataChanged(
        `Звичку «${targetName}» видалено разом із її сеансами та записами історії (${deletedEntriesCount}).`,
      );
    } catch (err) {
      setDeletingHabit(null);
      onModalStateChange?.(false);
      await onDataChanged(
        err instanceof Error ? err.message : "Не вдалося видалити звичку.",
      );
    }
  };

  const streakSummaries = habits.filter(h=>h.state==='active').map(habit=>({habit,...computeHabitStreakSummary(habit,habitEntries,selectedDate,dayOffDates)}));
  const dailyStreak = streakSummaries.filter(s=>s.kind==='scheduled_days_streak').sort((a,b)=>b.currentCount-a.currentCount)[0];
  const weeklyStreak = streakSummaries.filter(s=>s.kind==='weekly_target_streak').sort((a,b)=>b.currentCount-a.currentCount)[0];
  return (
    <div className="daily-list space-y-4" data-testid="destination-view-habits">
      {history ? (
        <>
          <SubHeader
            title="Усі звички та історія"
            onBack={() => setHistory(false)}
          />
          <DateField
            label="Дата історії"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
          />
        </>
      ) : null}
      {!history && habits.some(h=>h.state==='active') && <section className="habit-streak-summary" aria-label="Серії звичок"><HeroArt name="medal" size={52}/><div><strong>Серії звичок</strong>{[dailyStreak,weeklyStreak].filter(streak=>streak && streak.currentCount>0).map(streak=><p key={streak!.kind}>{streak!.habit.name}: <b>{streak!.currentCount} {streak!.unitLabelUk}</b></p>)}{!dailyStreak?.currentCount && !weeklyStreak?.currentCount && <p>Кожне виконання починає твою серію.</p>}</div></section>}
      {nightShiftAlternative && (
        <div className="habit-day flex items-center justify-between gap-2 min-h-[32px] h-8 px-1">
          <span className="text-[12.5px] leading-[16px] font-bold text-[var(--text-secondary)] truncate">
            {`Звичковий день · ${formatDate(selectedDate, { day: "numeric", month: "long" })}${selectedDate === previousLocalDate ? " · після нічної зміни" : ""}`}
          </span>
          <button
            type="button"
            className="ui-pill !min-h-[26px] h-[26px] !px-2.5 !text-[12px] font-bold shrink-0"
            onClick={() => setDateOpen(true)}
          >
            Змінити
          </button>
        </div>
      )}
      <Sheet
        title="Звичковий день"
        isOpen={dateOpen}
        onClose={() => setDateOpen(false)}
      >
        <Section>
          {[
            { label: "Сьогодні", date: actualTodayDate },
            { label: "За вчора після нічної зміни", date: previousLocalDate },
          ].map((o) => (
            <Row
              key={o.label}
              title={o.label}
              trailing={
                <Button
                  onClick={() => {
                    onSelectDate(o.date);
                    setDateOpen(false);
                  }}
                >
                  Обрати
                </Button>
              }
            />
          ))}
          <DateField
            label="Інша дата"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
          />
        </Section>
      </Sheet>
      {(() => {
        const visible = habits.filter((h) => history || h.state === "active");
        const habitFolders = folders.filter((f) => f.kind === "habits");

        const context = (h: Habit) => {
          if (history)
            return h.state === "archived"
              ? "Архів"
              : h.state === "paused"
                ? "На паузі"
                : "Активні";
          const cue = h.contextCueUk?.trim();
          if (cue) {
            return cue.includes("пробудження") ? "Після пробудження" : cue;
          }
          const rule = getEffectiveHabitRuleRevisionForDate(
            h,
            selectedDate,
          )?.rule;
          return rule?.kind === "days_off"
            ? "У вихідні від роботи"
            : rule?.kind === "weekly_frequency"
              ? `${rule.timesPerWeek} рази на тиждень`
              : "Щодня";
        };

        const renderHabit = (habit: Habit) => {
          const entries = entriesByHabitId.get(habit.id) ?? [];
          const state = evaluateHabitOnDate({
            habit,
            entriesForHabit: entries,
            localDate: selectedDate,
            daysOff: dayOffDates,
          });
          const streak = computeHabitStreakSummary(habit,entries,selectedDate,dayOffDates);
          const done = state.cellStatus === "completed";
          const minimum = Boolean(state.entry?.minimumCompletedUk);
          const color = itemColor(habit, modelCtx);

          const record = async (
            kind: "complete" | "minimum" | "clear" | "skip",
          ) => {
            try {
              await repositories.recordHabitEntryForDateTransactionally({
                habitId: habit.id,
                localDate: selectedDate,
                input: { kind },
              });
              await onDataChanged();
            } catch {
              await onDataChanged("Не вдалося записати виконання.");
            }
          };

          const numericTargetText =
            state.effectiveRevision.target.kind === "numeric"
              ? `${state.entry?.numericValue ?? 0} / ${state.effectiveRevision.target.targetValue} ${state.effectiveRevision.target.unitUk}`
              : null;
          const measureText =
            habit.measure && habit.measure.target && habit.measure.target > 0
              ? `${habit.measure.current} / ${habit.measure.target} ${habit.measure.unit}`
              : numericTargetText;
          const minText = habit.minimumVersionUk
            ? `мінімум: ${habit.minimumVersionUk}`
            : null;
          const metaText = measureText ?? minText ?? null;

          return (
            <div
              key={habit.id}
              style={
                {
                  "--c": orbVars(color)["--c"],
                  "--habit-hue": color,
                  "--glow-c": orbVars(color)["--c"],
                } as React.CSSProperties
              }
              data-glow={done ? "true" : undefined}
              data-done={done ? "true" : undefined}
              className={`habit-row ui-soft-row flex-col items-stretch cursor-pointer min-h-[52px] py-2 px-3.5 ${
                done ? "ui-soft-row-glow task-completed" : ""
              }`}
              data-testid={`habit-row-${habit.id}`}
              onClick={() => setActiveActionHabit(habit)}
            >
              <div className="flex items-center gap-2.5 w-full">
                {/* Gel Orb 26 in area color */}
                <Orb size={26} color={color} className="flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="daily-list-title">
                    {habit.name}
                  </div>
                  {metaText && (
                    <div className="text-[12px] font-semibold text-[var(--text-secondary)] leading-[16px] truncate mt-0.5 tabular-nums">
                      {metaText}
                    </div>
                  )}
                  {/* Seven-day pearl bead history */}
                  <div
                    className="habit-dots flex items-center gap-1 mt-[5px]"
                    aria-label="Останні сім днів"
                  >
                    {Array.from({ length: 7 }, (_, i) => {
                      const date = addDaysToLocalDate(selectedDate, i - 6);
                      const dayState = evaluateHabitOnDate({habit,entriesForHabit:entries,localDate:date,daysOff:dayOffDates});
                      const entry = dayState.entry;
                      const isDoneDay = Boolean(
                        entry &&
                          (entry.status === "completed" ||
                            entry.minimumCompletedUk),
                      );
                      return (
                        <span
                          role="img"
                          key={date}
                          aria-label={`${formatDate(date)}: ${isDoneDay ? (entry?.minimumCompletedUk ? 'виконано мінімум' : 'виконано') : dayState.cellStatus === 'skipped' ? 'пропущено свідомо' : dayState.cellStatus === 'not_scheduled' ? 'поза розкладом' : 'не виконано'}`}
                          data-status={dayState.cellStatus}
                          data-done={isDoneDay}
                          className="habit-bead"
                          style={{ "--c": color } as React.CSSProperties}
                        />
                      );
                    })}
                  </div>
                  {streak.currentCount > 0 && <small className="habit-streak-label" title={streak.explanationUk}>Серія: {streak.currentCount} {streak.unitLabelUk}</small>}
                </div>

                <div
                  className="habit-check-actions flex items-center gap-2 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Thick progress ring with percent for measured habits */}
                  {habit.measure &&
                    habit.measure.target &&
                    habit.measure.target > 0 && (
                      <ProgressRing
                        role="img"
                        aria-label={`${habit.name}: ${habit.measure.current} / ${habit.measure.target}`}
                        current={habit.measure.current}
                        target={habit.measure.target}
                        color={color}
                        size={44}
                        strokeWidth={10}
                      />
                    )}

                  {/* Small "Мінімум" pill 26px */}
                  {habit.minimumVersionUk && (
                    <button
                      type="button"
                      aria-pressed={minimum}
                      className={`ui-pill !min-h-[26px] h-[26px] !px-2.5 !text-[12px] font-bold rounded-full ${
                        minimum ? "is-active" : ""
                      }`}
                      onClick={() => void record("minimum")}
                    >
                      Мінімум
                    </button>
                  )}

                  {/* Standard 24px Checkbox */}
                  <Checkbox
                    checked={done}
                    label={`Стандарт: ${habit.name}`}
                    onChange={() => void record(done ? "clear" : "complete")}
                  />
                </div>
              </div>

              {history && state.effectiveRevision.target.kind === "numeric" && (
                <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                  <InputField
                    label={`Кількість (${state.effectiveRevision.target.unitUk})`}
                    type="number"
                    min={0}
                    value={
                      numericDraftByHabit[habit.id] ??
                      String(state.entry?.numericValue ?? 0)
                    }
                    onChange={(e) =>
                      setNumericDraftByHabit({
                        ...numericDraftByHabit,
                        [habit.id]: e.target.value,
                      })
                    }
                  />
                  <Button
                    onClick={async () => {
                      try {
                        await repositories.recordHabitEntryForDateTransactionally(
                          {
                            habitId: habit.id,
                            localDate: selectedDate,
                            input: {
                              kind: "set_numeric",
                              numericValue: Number(
                                numericDraftByHabit[habit.id] ??
                                  state.entry?.numericValue ??
                                  0,
                              ),
                            },
                          },
                        );
                        await onDataChanged();
                      } catch {
                        await onDataChanged("Не вдалося зберегти кількість.");
                      }
                    }}
                  >
                    Записати
                  </Button>
                </div>
              )}
            </div>
          );
        };

        const rootHabits = visible.filter(
          (h) => !h.folderId || !habitFolders.some((f) => f.id === h.folderId),
        );

        return (
          <>
            {/* NO nested cards: for each folder a heading (14.5/800 + count 12px secondary) followed directly by habit Rows */}
            {!history &&
              habitFolders.map((folder) => {
                const folderHabits = visible.filter(
                  (h) => h.folderId === folder.id,
                );
                const isCollapsed = collapsedFolderIds.has(folder.id);
                return (
                  <div key={folder.id} className="space-y-2">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      className="w-full flex items-center justify-between gap-2 px-1 py-0.5 text-left cursor-pointer"
                      onClick={() => {
                        setCollapsedFolderIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-extrabold text-[14.5px] leading-[19px] text-[var(--text-primary)] truncate">
                          {folder.name}
                        </span>
                        <span className="text-[12px] leading-[16px] font-semibold text-[var(--text-secondary)] tabular-nums">
                          {folderHabits.length}
                        </span>
                      </div>
                      <span className="text-[var(--text-secondary)] shrink-0">
                        {isCollapsed ? (
                          <ChevronRight size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </span>
                    </button>
                    {!isCollapsed && folderHabits.length > 0 && (
                      <div className="space-y-2">
                        {folderHabits.map(renderHabit)}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Frequency/context sections for root habits: heading (14.5/800 + count 12px secondary + 16px chevron) followed directly by habit Rows */}
            {[
              "Після пробудження",
              "У вихідні від роботи",
              "3 рази на тиждень",
              "Щодня",
              ...new Set(rootHabits.map(context)),
            ]
              .filter((label, idx, arr) => arr.indexOf(label) === idx)
              .map((label) => {
                const sectionHabits = rootHabits.filter(
                  (h) => context(h) === label,
                );
                if (sectionHabits.length === 0) return null;
                const sectionKey = `section:${label}`;
                const isCollapsed = collapsedFolderIds.has(sectionKey);
                return (
                  <div key={label} className="space-y-2">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      className="w-full flex items-center justify-between gap-2 px-1 py-0.5 text-left cursor-pointer"
                      onClick={() => {
                        setCollapsedFolderIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(sectionKey)) next.delete(sectionKey);
                          else next.add(sectionKey);
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <h2 className="font-extrabold text-[14.5px] leading-[19px] text-[var(--text-primary)] m-0 truncate">
                          {label}
                        </h2>
                        <span className="text-[12px] leading-[16px] font-semibold text-[var(--text-secondary)] tabular-nums">
                          {sectionHabits.length}
                        </span>
                      </div>
                      <span className="text-[var(--text-secondary)] shrink-0">
                        {isCollapsed ? (
                          <ChevronRight size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-2">
                        {sectionHabits.map(renderHabit)}
                      </div>
                    )}
                  </div>
                );
              })}

            {!visible.length && (
              <EmptyState
                context="habits"
                title="Додайте першу звичку"
                primaryAction={{
                  label: "Додати звичку",
                  onClick: () => onOpenGlobalCreation("habit"),
                }}
              />
            )}

            {!history && habits.some((h) => h.state === "paused") && (
              <div className="space-y-2">
                <button
                  type="button"
                  aria-label="Показати звички на паузі"
                  aria-expanded={pausedOpen}
                  className="w-full flex items-center justify-between gap-2 px-1 py-0.5 text-left cursor-pointer"
                  onClick={() => setPausedOpen(!pausedOpen)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[14.5px] leading-[19px] text-[var(--text-primary)]">
                      На паузі
                    </span>
                    <span className="text-[12px] leading-[16px] font-semibold text-[var(--text-secondary)] tabular-nums">
                      {habits.filter((h) => h.state === "paused").length}
                    </span>
                  </div>
                  <span className="text-[var(--text-secondary)]">
                    {pausedOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </span>
                </button>
                {pausedOpen && (
                  <div className="space-y-2">
                    {habits.filter((h) => h.state === "paused").map(renderHabit)}
                  </div>
                )}
              </div>
            )}

            {/* Move habit to folder sheet */}
            {movingHabit && (
              <Sheet
                isOpen={Boolean(movingHabit)}
                onClose={() => setMovingHabit(null)}
                title="Перемістити в папку"
              >
                <div className="space-y-2 py-2">
                  <button
                    type="button"
                    className="w-full text-left p-3 rounded-2xl bg-black/5 hover:bg-black/10 font-medium text-[14px]"
                    onClick={async () => {
                      try {
                        await repositories.saveHabit(
                          {
                            ...movingHabit,
                            folderId: undefined,
                            updatedAt: new Date().toISOString(),
                          },
                          movingHabit.revision,
                        );
                        await onDataChanged();
                        setMovingHabit(null);
                      } catch {
                        await onDataChanged("Не вдалося перемістити звичку.");
                      }
                    }}
                  >
                    Коренева папка (без папки)
                  </button>
                  {habitFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="w-full text-left p-3 rounded-2xl bg-black/5 hover:bg-black/10 font-medium text-[14px] flex items-center justify-between"
                      onClick={async () => {
                        try {
                          await repositories.saveHabit(
                            {
                              ...movingHabit,
                              folderId: f.id,
                              updatedAt: new Date().toISOString(),
                            },
                            movingHabit.revision,
                          );

                          await onDataChanged();
                          setMovingHabit(null);
                        } catch {
                          await onDataChanged("Не вдалося перемістити звичку.");
                        }
                      }}
                    >
                      <span>{f.name}</span>
                      {movingHabit.folderId === f.id && (
                        <Check size={16} className="text-ink" />
                      )}
                    </button>
                  ))}
                </div>
              </Sheet>
            )}

            {/* Habit Action Sheet */}
            {activeActionHabit && (
              <Sheet
                isOpen={Boolean(activeActionHabit)}
                onClose={() => setActiveActionHabit(null)}
                title={activeActionHabit.name}
              >
                <div className="space-y-2 py-2">
                  <RowTextValue
                    hideOrb
                    title="Якщо - то"
                    value={activeActionHabit.reminderIntentionUk || "Не заповнено"}
                    chevron
                    onClick={() => {
                      const h = activeActionHabit;
                      setActiveActionHabit(null);
                      openEditModal(h);
                    }}
                  />
                  <button
                    type="button"
                    className="w-full text-left p-3.5 rounded-2xl bg-black/5 hover:bg-black/10 font-semibold text-[15px] flex items-center gap-3 transition-colors cursor-pointer"
                    onClick={() => {
                      const h = activeActionHabit;
                      setActiveActionHabit(null);
                      openEditModal(h);
                    }}
                  >
                    <span>Редагувати звичку</span>
                  </button>

                  <button
                    type="button"
                    className="w-full text-left p-3.5 rounded-2xl bg-black/5 hover:bg-black/10 font-semibold text-[15px] flex items-center gap-3 transition-colors cursor-pointer"
                    onClick={() => {
                      const h = activeActionHabit;
                      setActiveActionHabit(null);
                      setMovingHabit(h);
                    }}
                  >
                    <span>Перемістити в папку</span>
                  </button>

                  <button
                    type="button"
                    className="w-full text-left p-3.5 rounded-2xl bg-black/5 hover:bg-black/10 font-semibold text-[15px] flex items-center gap-3 transition-colors cursor-pointer"
                    onClick={() => {
                      const h = activeActionHabit;
                      setActiveActionHabit(null);
                      void handleChangeState(
                        h,
                        h.state === "paused" ? "active" : "paused",
                      );
                    }}
                  >
                    <span>
                      {activeActionHabit.state === "paused"
                        ? "Відновити звичку"
                        : "Поставити на паузу"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="w-full text-left p-3.5 rounded-2xl bg-black/5 hover:bg-black/10 font-semibold text-[15px] flex items-center gap-3 transition-colors cursor-pointer"
                    onClick={() => {
                      const h = activeActionHabit;
                      setActiveActionHabit(null);
                      void handleChangeState(
                        h,
                        h.state === "archived" ? "active" : "archived",
                      );
                    }}
                  >
                    <span>
                      {activeActionHabit.state === "archived"
                        ? "Розархівувати"
                        : "Архівувати"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="w-full text-left p-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 font-semibold text-[15px] flex items-center gap-3 transition-colors cursor-pointer"
                    onClick={() => {
                      const h = activeActionHabit;
                      setActiveActionHabit(null);
                      setDeletingHabit(h);
                      onModalStateChange?.(true);
                    }}
                  >
                    <span>Видалити звичку</span>
                  </button>
                </div>
              </Sheet>
            )}
          </>
        );
      })()}
      <InfoSheet title="Звички">
        <p>
          Звички — необов’язкова підтримка. Після пробудження — контекст, а не
          час. Невідмічені дні не створюють боргу.
        </p>
      </InfoSheet>

      {/* Modal 1: Edit Habit Metadata & Append Effective-Dated Rule Revision (9.3) */}
      <Sheet
        isOpen={Boolean(editingHabit)}
        title="Редагувати звичку"
        onClose={closeEditModal}
      >
        {editingHabit && (
          <form
            onSubmit={handleSaveHabitRevision}
            className="space-y-3.5"
            data-testid="edit-habit-revision-form"
          >
            <InputField
              label="Що робити"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              data-testid="edit-habit-name-input"
              required
            />

            {editingHabit.measure && <MeasureField measure={editingHabit.measure} color={itemColor(editingHabit,modelCtx)} onLog={async delta=>{const saved=await repositories.saveHabit(logMeasure(editingHabit,delta),editingHabit.revision);setEditingHabit(saved);await onDataChanged();}}/>}
            <WhenField label="Як часто">
            <SelectField
              label="Як часто"
              value={
                editCue === "Після пробудження" ? "awakening" : editRuleKind
              }
              onChange={(e) => {
                const v = e.target.value;
                setEditRuleKind(
                  (v === "awakening" ? "daily" : v) as typeof editRuleKind,
                );
                if (v === "awakening") setEditCue("Після пробудження");
                else if (editCue === "Після пробудження") setEditCue("");
              }}
              options={[
                { value: "daily", label: "Щодня" },
                { value: "weekly_frequency", label: "N разів на тиждень" },
                { value: "days_off", label: "У вихідні від роботи" },
                { value: "awakening", label: "Після пробудження" },
                ...(editRuleKind === "selected_weekdays"
                  ? [{ value: "selected_weekdays", label: "Обрані дні" }]
                  : []),
              ]}
            />
            {editRuleKind === "weekly_frequency" && (
              <InputField
                label="Разів на тиждень"
                type="number"
                min={1}
                max={7}
                value={editTimesPerWeek}
                onChange={(e) => setEditTimesPerWeek(e.target.value)}
              />
            )}
            </WhenField>
            <SphereField areas={lifeAreaQuestions} value={editLifeAreaId} onChange={setEditLifeAreaId} expanded />
            <InputField
              label="Мінімальний варіант"
              value={editMinimum}
              onChange={(e) => setEditMinimum(e.target.value)}
            />
            <InputField
              label="Зручний контекст"
              value={editCue}
              onChange={(e) => setEditCue(e.target.value)}
            />
            <InputField
              label="Нагадування для себе"
              value={editReminder}
              onChange={(e) => setEditReminder(e.target.value)}
            />
            <SleepReminderNote
              reminder={editReminder}
              date={selectedDate}
              zone={zone}
              events={events}
            />
            <ParamRow label="Куди">
            <SelectField
              label="Пов’язати"
              value={
                editProjectId
                  ? "project:" + editProjectId
                  : editFolder
                    ? "folder:" + editFolder
                    : editLifeAreaId
                      ? "area:" + editLifeAreaId
                      : ""
              }
              onChange={(e) => {
                const [kind, id] = e.target.value.split(":");
                setEditProjectId(kind === "project" ? id : "");
                setEditFolder(kind === "folder" ? id : "");
                setEditLifeAreaId(kind === "area" ? id : "");
              }}
              options={[
                { value: "", label: "Ні з чим" },
                ...folders.map((f) => ({
                  value: "folder:" + f.id,
                  label: f.name,
                })),
                ...projects
                  .filter((p) => !p.archived)
                  .map((p) => ({ value: "project:" + p.id, label: p.title })),
                ...lifeAreaQuestions
                  .filter((a) => !a.archived)
                  .map((a) => ({
                    value: "area:" + a.id,
                    label: a.questionTextUk,
                  })),
              ]}
            />
            </ParamRow>
            <ActionMenu
              label="Додаткові поля звички"
              items={[
                {
                  label: editAdvanced
                    ? "Приховати додаткові поля"
                    : "Додаткові поля",
                  onSelect: () => setEditAdvanced(!editAdvanced),
                },
              ]}
            />
            {editAdvanced && (
              <>
                <TextAreaField
                  label="Опис"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <InputField
                  label="Піктограма"
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                />
                <DateField
                  label="Діє з дати"
                  value={editEffectiveDate}
                  onChange={(e) => setEditEffectiveDate(e.target.value)}
                />
                <SelectField
                  label="Тип цілі"
                  value={editTargetKind}
                  onChange={(e) =>
                    setEditTargetKind(e.target.value as typeof editTargetKind)
                  }
                  options={[
                    { value: "binary", label: "Відмітка" },
                    { value: "numeric", label: "Кількість" },
                  ]}
                />
                {editTargetKind === "numeric" && (
                  <>
                    <InputField
                      label="Кількість"
                      type="number"
                      min={1}
                      value={editTargetValue}
                      onChange={(e) => setEditTargetValue(e.target.value)}
                    />
                    <InputField
                      label="Одиниці"
                      value={editUnitUk}
                      onChange={(e) => setEditUnitUk(e.target.value)}
                    />
                  </>
                )}
                {editRuleKind === "selected_weekdays" && (
                  <div className="quick-options" data-ui="pill-row">
                    {ISO_WEEKDAYS_UK.map((day) => (
                      <Button
                        key={day.iso}
                        aria-pressed={editWeekdaysIso.includes(day.iso)}
                        onClick={() =>
                          setEditWeekdaysIso((prev) =>
                            prev.includes(day.iso)
                              ? prev.filter((d) => d !== day.iso)
                              : [...prev, day.iso],
                          )
                        }
                      >
                        {day.shortUk}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}

            {editError && (
              <FeedbackBanner
                tone="error"
                message={editError}
                onDismiss={() => setEditError(null)}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              data-testid="edit-habit-save-button"
            >
              {UK_STRINGS.app.saveButton}
            </Button>
          </form>
        )}
      </Sheet>

      {/* Modal 2: Delete Habit AlertSheet */}
      <AlertSheet
        isOpen={Boolean(deletingHabit)}
        title={`Видалити звичку «${deletingHabit?.name ?? ""}»?`}
        description="Звичку та її історію буде видалено без можливості відновлення."
        confirmLabel="Видалити звичку та історію"
        cancelLabel="Не зараз"
        destructive
        onClose={() => {
          setDeletingHabit(null);
          onModalStateChange?.(false);
        }}
        onConfirm={() => void confirmDeleteHabit()}
      />
    </div>
  );
}
