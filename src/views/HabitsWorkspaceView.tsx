import { HabitPresentationContext } from "../components/habits/presentation";
import { SleepReminderNote } from "../components/habits/SleepReminderNote";
import {
  Section,
  Row,
  ActionMenu,
  InfoSheet,
  Sheet,
  SubHeader,
  DateField,
  SelectField,
} from "../ui";
import { formatDate, formatDuration } from "../lib/format";
import React, { useMemo, useState, useEffect, useContext } from "react";
import { Repeat } from "lucide-react";
import {
  CalendarEvent,
  EntityId,
  Habit,
  HabitEntry,
  HabitFrequencyRule,
  HabitLifecycleState,
  HabitTargetSpec,
  LifeAreaQuestion,
  LocalDateString,
  Project,
  Folder,
} from "../domain/types";
import { addDaysToLocalDate } from "../domain/temporal";
import {
  ISO_WEEKDAYS_UK,
  appendEffectiveHabitRuleRevision,
  computeHabitDeleteImpact,
  evaluateHabitOnDate,
  getEffectiveHabitRuleRevisionForDate,
  getPreviousLocalDateForNightShift,
  sortHabitRuleRevisions,
} from "../domain/habits";
import {
  HabitsFilterMode,
  ImplementedCreationActionKind,
} from "../state/shellStore";
import { PlanuiRepositories } from "../storage/repositories";
import { UK_STRINGS } from "../i18n/uk";
import {
  Button,
  FeedbackBanner,
  InputField,
  TextAreaField,
} from "../components/ui/primitives";

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
  folders?: readonly Folder[];
  dayOffDates?: readonly string[];
  onPlanHabit?: (habitId: string, date: string) => void;
  lifeAreaQuestions: readonly LifeAreaQuestion[];
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
  folders = [],
  dayOffDates = [],
  onPlanHabit,
  lifeAreaQuestions,
  repositories,
  onSelectDate,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}: HabitsWorkspaceViewProps) {
  const presentation = useContext(HabitPresentationContext);
  const [history, setHistory] = useState(false);
  const [editAdvanced, setEditAdvanced] = useState(false);
  useEffect(() => {
    onHistoryChange?.(history);
    return () => onHistoryChange?.(false);
  }, [history, onHistoryChange]);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [numericDraftByHabit, setNumericDraftByHabit] = useState<
    Record<string, string>
  >({});

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

  const deleteImpact = useMemo(() => {
    if (!deletingHabit) return null;
    return computeHabitDeleteImpact(
      deletingHabit,
      entriesByHabitId.get(deletingHabit.id) ?? [],
    );
  }, [deletingHabit, entriesByHabitId]);

  return (
    <div className="space-y-4" data-testid="destination-view-habits">
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
      {nightShiftAlternative && (
        <Section>
          <Row
            className="habit-day" title={`Звичковий день · ${formatDate(selectedDate, { day: "numeric", month: "long" })}${selectedDate === previousLocalDate ? " · після нічної зміни" : ""}`}
            trailing={
              <Button onClick={() => setDateOpen(true)}>Змінити</Button>
            }
          />
        </Section>
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
        const context = (h: Habit) => {
          if (history)
            return h.state === "archived"
              ? "Архів"
              : h.state === "paused"
                ? "На паузі"
                : "Активні";
          const rule = getEffectiveHabitRuleRevisionForDate(
            h,
            selectedDate,
          )?.rule;
          return h.contextCueUk?.includes("пробудження")
            ? "Після пробудження"
            : rule?.kind === "days_off"
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
          const done = state.cellStatus === "completed",
            minimum = Boolean(state.entry?.minimumCompletedUk);
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
          return (
            <div
              key={habit.id}
              style={
                {
                  "--habit-hue":
                    presentation[habit.id]?.hue ??
                    [
                      "var(--hue-english)",
                      "var(--hue-university)",
                      "var(--hue-relationships)",
                      "var(--hue-work)",
                    ][habits.findIndex((h) => h.id === habit.id) % 4],
                } as React.CSSProperties
              }
              className="habit-row"
              data-testid={`habit-row-${habit.id}`}
            >
              <Row
                leading={<Repeat size={20} />}
                title={habit.name}
                secondary={
                  [
                    presentation[habit.id]?.durationMinutes
                      ? formatDuration(presentation[habit.id].durationMinutes!)
                      : null,
                    habit.minimumVersionUk
                      ? `мінімум: ${habit.minimumVersionUk}`
                      : habit.contextCueUk,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                trailing={
                  <>
                    <button
                      className="habit-check"
                      type="button"
                      aria-label={`Стандарт: ${habit.name}`}
                      aria-pressed={done}
                      data-minimum={minimum && !done}
                      onClick={() => void record("complete")}
                    >
                      {done || minimum ? "✓" : "○"}
                      {minimum && !done && <small>мінімум</small>}
                    </button>
                    {habit.minimumVersionUk && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void record("minimum")}
                      >
                        Мінімум
                      </Button>
                    )}
                    <ActionMenu
                      label={`Дії: ${habit.name}`}
                      items={[
                        {
                          label:
                            habit.state === "active" ? "Пауза" : "Відновити",
                          onSelect: () =>
                            void handleChangeState(
                              habit,
                              habit.state === "active" ? "paused" : "active",
                            ),
                        },
                        {
                          label: "Редагувати",
                          onSelect: () => openEditModal(habit),
                        },
                        {
                          label: "Прибрати відмітку",
                          onSelect: () => void record("clear"),
                        },
                        {
                          label: "Пропустити",
                          onSelect: () => void record("skip"),
                        },
                        {
                          label: "Архів",
                          onSelect: () =>
                            void handleChangeState(habit, "archived"),
                        },
                        ...(history
                          ? [
                              {
                                label: "Видалити",
                                onSelect: () => {
                                  setDeletingHabit(habit);
                                  onModalStateChange?.(true);
                                },
                              },
                              {
                                label: "Запланувати в календарі",
                                onSelect: () =>
                                  onPlanHabit?.(habit.id, selectedDate),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </>
                }
              />
              <div className="habit-dots" aria-label="Останні сім днів">
                {Array.from({ length: 7 }, (_, i) => {
                  const date = addDaysToLocalDate(selectedDate, i - 6);
                  const entry = entries.find((e) => e.localDate === date);
                  return (
                    <span
                      role="img"
                      key={date}
                      aria-label={formatDate(date)}
                      data-done={Boolean(
                        entry &&
                        (entry.status === "completed" ||
                          entry.minimumCompletedUk),
                      )}
                    />
                  );
                })}
              </div>
              {history && state.effectiveRevision.target.kind === "numeric" && (
                <div className="flex gap-2 p-3">
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
              {history && (
                <details>
                  <summary>Історія</summary>
                  {entries.map((entry) => (
                    <Row
                      key={entry.id}
                      title={formatDate(entry.localDate)}
                      secondary={
                        entry.minimumCompletedUk
                          ? "Мінімум"
                          : entry.status === "completed"
                            ? "Виконано"
                            : "Без виконання"
                      }
                    />
                  ))}
                </details>
              )}
            </div>
          );
        };
        return (
          <>
            {[...new Set(visible.map(context))].map((label) => (
              <Section key={label} title={label}>
                {visible.filter((h) => context(h) === label).map(renderHabit)}
              </Section>
            ))}
            {!visible.length && (
              <div className="ui-surface p-3 flex items-center justify-between">
                <span>Звичок поки немає</span>
                <Button onClick={() => onOpenGlobalCreation("habit")}>
                  Додати звичку
                </Button>
              </div>
            )}
            {!history && habits.some((h) => h.state === "paused") && (
              <Section title="На паузі">
                <Row
                  title="На паузі"
                  trailing={
                    <Button
                      aria-expanded={pausedOpen}
                      onClick={() => setPausedOpen(!pausedOpen)}
                    >
                      ⌄
                    </Button>
                  }
                />
                {pausedOpen &&
                  habits.filter((h) => h.state === "paused").map(renderHabit)}
              </Section>
            )}
          </>
        );
      })()}
      {!history && habits.length > 0 && (
        <Section>
          <Row
            title="Усі звички та історія"
            trailing={
              <Button
                aria-label="Усі звички та історія"
                onClick={() => setHistory(true)}
              >
                ›
              </Button>
            }
          />
        </Section>
      )}
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

            <div className="flex items-center justify-end gap-2 pt-2">
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
      </Sheet>

      {/* Modal 2: Delete Habit with History Impact Explanation (9.3) */}
      <Sheet
        isOpen={Boolean(deletingHabit)}
        title="Видалення звички, історії та її сеансів"
        subtitle="Перевірте вплив на збережену історію перед остаточним видаленням"
        onClose={() => {
          setDeletingHabit(null);
          onModalStateChange?.(false);
        }}
      >
        {deletingHabit && deleteImpact && (
          <div className="space-y-4" data-testid="delete-habit-modal">
            <p>
              «{deletingHabit.name}» буде видалено разом з історією. Цю дію не
              можна скасувати.
            </p>
            {deleteImpact.totalEntriesCount > 0 && (
              <Row
                title="Записи історії"
                trailing={String(deleteImpact.totalEntriesCount)}
              />
            )}
            <Button
              variant="danger"
              data-testid="confirm-delete-habit-button"
              onClick={() => void confirmDeleteHabit()}
            >
              Видалити звичку та історію
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
