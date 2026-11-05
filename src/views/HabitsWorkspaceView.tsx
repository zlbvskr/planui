import { Section, Row, ActionMenu, InfoSheet, Sheet, SubHeader, DateField, SelectField } from '../ui';
import { formatDate } from '../lib/format';
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
  Folder,
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
  TextAreaField,
} from '../components/ui/primitives';

export interface HabitsWorkspaceViewProps {
  nightShiftAlternative?: boolean;
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
  nightShiftAlternative = false,
  actualTodayDate,
  filter,
  habits,
  habitEntries,
  projects, folders = [], dayOffDates = [], onPlanHabit,
  lifeAreaQuestions,
  repositories,
  onSelectDate,
  onChangeFilter,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}: HabitsWorkspaceViewProps) {
  const [history, setHistory] = useState(false);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [expandedMonthHabitIds, setExpandedMonthHabitIds] = useState<
    Record<string, boolean>
  >({});
  const [numericDraftByHabit, setNumericDraftByHabit] = useState<
    Record<string, string>
  >({});

  // Edit / New Rule Revision Modal State
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editMinimum, setEditMinimum] = useState('');
  const [editCue, setEditCue] = useState('');
  const [editReminder, setEditReminder] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState('repeat');
  const [editProjectId, setEditProjectId] = useState('');
  const [editLifeAreaId, setEditLifeAreaId] = useState('');
  const [editEffectiveDate, setEditEffectiveDate] = useState(selectedDate);
  const [editRuleKind, setEditRuleKind] = useState<
    'daily' | 'days_off' | 'selected_weekdays' | 'weekly_frequency'
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
    setEditMinimum(habit.minimumVersionUk ?? ''); setEditCue(habit.contextCueUk ?? ''); setEditReminder(habit.reminderIntentionUk ?? ''); setEditFolder(habit.folderId ?? '');
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
      if (editRuleKind === 'days_off') {
        rule = {kind: 'days_off'};
      } else if (editRuleKind === 'daily') {
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
          minimumVersionUk: editMinimum.trim() || null, contextCueUk: editCue.trim() || null, reminderIntentionUk: editReminder.trim() || null, folderId: editProjectId ? null : editFolder || null,
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
      await onDataChanged(`Звичку «${editName.trim()}» оновлено.`);
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
        `Звичку «${targetName}» видалено разом із її сеансами та записами історії (${deletedEntriesCount}).`
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
      {history ? <><SubHeader title="Усі звички та історія" onBack={()=>setHistory(false)}/><DateField label="Дата історії" value={selectedDate} onChange={e=>onSelectDate(e.target.value)}/></> : null}
      {nightShiftAlternative && <Section><Row title={`Звичковий день · ${formatDate(selectedDate,{day:'numeric',month:'long'})}${selectedDate===previousLocalDate?' · після нічної зміни':''}`} trailing={<Button onClick={()=>setDateOpen(true)}>Змінити</Button>}/></Section>}
      <Sheet title="Звичковий день" isOpen={dateOpen} onClose={()=>setDateOpen(false)}><Section>{[{label:'Сьогодні',date:actualTodayDate},{label:'За вчора після нічної зміни',date:previousLocalDate}].map(o=><Row key={o.label} title={o.label} trailing={<Button onClick={()=>{onSelectDate(o.date);setDateOpen(false);}}>Обрати</Button>}/>)}<DateField label="Інша дата" value={selectedDate} onChange={e=>onSelectDate(e.target.value)}/></Section></Sheet>
      {(() => {
        const visible=habits.filter(h=>history || h.state==='active');
        const context=(h:Habit)=>{const rule=getEffectiveHabitRuleRevisionForDate(h,selectedDate)?.rule;return h.contextCueUk?.includes('пробудження')?'Після пробудження':rule?.kind==='days_off'?'У вихідні від роботи':rule?.kind==='weekly_frequency'?`${rule.timesPerWeek} рази на тиждень`:'Щодня';};
        const renderHabit=(habit:Habit)=>{
          const entries=entriesByHabitId.get(habit.id)??[];
          const state=evaluateHabitOnDate({habit,entriesForHabit:entries,localDate:selectedDate,daysOff:dayOffDates});
          const done=state.cellStatus==='completed', minimum=Boolean(state.entry?.minimumCompletedUk);
          const record=async(kind:'complete'|'minimum'|'clear'|'skip')=>{try{await repositories.recordHabitEntryForDateTransactionally({habitId:habit.id,localDate:selectedDate,input:{kind}});await onDataChanged();}catch{await onDataChanged('Не вдалося записати виконання.');}};
          return <div key={habit.id} className="habit-row" data-testid={`habit-row-${habit.id}`}><Row leading={<Repeat size={20}/>} title={habit.name} secondary={habit.minimumVersionUk?`Мінімум: ${habit.minimumVersionUk}`:habit.contextCueUk??undefined} trailing={<><button className="habit-check" type="button" aria-label={`Стандарт: ${habit.name}`} aria-pressed={done} data-minimum={minimum&&!done} onClick={()=>void record('complete')}>{done||minimum?'✓':'○'}{minimum&&!done&&<small>мінімум</small>}</button>{habit.minimumVersionUk&&<Button variant="secondary" size="sm" onClick={()=>void record('minimum')}>Мінімум</Button>}<ActionMenu label={`Дії: ${habit.name}`} items={[{label:habit.state==='active'?'Пауза':'Відновити',onSelect:()=>void handleChangeState(habit,habit.state==='active'?'paused':'active')},{label:'Редагувати',onSelect:()=>openEditModal(habit)},{label:'Прибрати відмітку',onSelect:()=>void record('clear')},{label:'Пропустити',onSelect:()=>void record('skip')},{label:'Архів',onSelect:()=>void handleChangeState(habit,'archived')},...(history?[{label:'Видалити',onSelect:()=>setDeletingHabit(habit)},{label:'Запланувати в календарі',onSelect:()=>onPlanHabit?.(habit.id,selectedDate)}]:[])]}/></>}/><div className="habit-dots" aria-label="Останні сім днів">{Array.from({length:7},(_,i)=>{const date=addDaysToLocalDate(selectedDate,i-6);const entry=entries.find(e=>e.localDate===date);return <span role="img" key={date} aria-label={formatDate(date)} data-done={Boolean(entry&&(entry.status==='completed'||entry.minimumCompletedUk))}/>;})}</div>{history&&state.effectiveRevision.target.kind==='numeric'&&<div className="flex gap-2 p-3"><InputField label={`Кількість (${state.effectiveRevision.target.unitUk})`} type="number" min={0} value={numericDraftByHabit[habit.id]??String(state.entry?.numericValue??0)} onChange={e=>setNumericDraftByHabit({...numericDraftByHabit,[habit.id]:e.target.value})}/><Button onClick={async()=>{try{await repositories.recordHabitEntryForDateTransactionally({habitId:habit.id,localDate:selectedDate,input:{kind:'set_numeric',numericValue:Number(numericDraftByHabit[habit.id]??state.entry?.numericValue??0)}});await onDataChanged();}catch{await onDataChanged('Не вдалося зберегти кількість.');}}}>Записати</Button></div>}{history&&<details><summary>Історія</summary>{entries.map(entry=><Row key={entry.id} title={formatDate(entry.localDate)} secondary={entry.minimumCompletedUk?'Мінімум':entry.status==='completed'?'Виконано':'Без виконання'}/>)}</details>}</div>;
        };
        return <>{[...new Set(visible.map(context))].map(label=><Section key={label} title={label}>{visible.filter(h=>context(h)===label).map(renderHabit)}</Section>)}{!visible.length&&<div className="ui-surface p-3 flex items-center justify-between"><span>Звичок поки немає</span><Button onClick={()=>onOpenGlobalCreation('habit')}>Додати звичку</Button></div>}{!history&&habits.some(h=>h.state==='paused')&&<Section title="На паузі"><Row title="На паузі" trailing={<Button aria-expanded={pausedOpen} onClick={()=>setPausedOpen(!pausedOpen)}>⌄</Button>}/>{pausedOpen&&habits.filter(h=>h.state==='paused').map(renderHabit)}</Section>}</>;
      })()}
      {!history&&<Section><Row title="Усі звички та історія" trailing={<Button aria-label="Усі звички та історія" onClick={()=>setHistory(true)}>›</Button>}/></Section>}
      <InfoSheet title="Звички"><p>Звички — необов’язкова підтримка. Після пробудження — контекст, а не час. Невідмічені дні не створюють боргу.</p></InfoSheet>

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

            <InputField label="Мінімальний варіант" value={editMinimum} onChange={e => setEditMinimum(e.target.value)} />
            <InputField label="Зручний контекст" value={editCue} onChange={e => setEditCue(e.target.value)} />
            <InputField label="Мій намір нагадати собі (без будильника)" value={editReminder} onChange={e => setEditReminder(e.target.value)} />
            <SelectField label="Напрям (без проєкту)" value={editProjectId ? '' : editFolder} disabled={Boolean(editProjectId)} onChange={e => setEditFolder(e.target.value)} options={[{value: '', label: 'Без напряму'}, ...folders.map(f => ({value:f.id,label:f.name}))]} />
            <DateField
              label="Діє з дати"
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
              <Button variant="secondary" onClick={()=>{setEditRuleKind('daily');setEditCue('Після пробудження');}}>Після пробудження</Button>
              <SegmentedControl<
                'daily' | 'days_off' | 'selected_weekdays' | 'weekly_frequency'
              >
                ariaLabel="Правило повторення"
                value={editRuleKind}
                onChange={setEditRuleKind}
                options={[
                  { value: 'daily', label: 'Щодня' },
                  { value: 'days_off', label: 'Позначені вихідні' },
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
      </Sheet>
    </div>
  );
}
