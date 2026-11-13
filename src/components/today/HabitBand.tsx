import { useState, useRef } from 'react';
import { Icon } from '../../ui/icons';
import { Orb } from '../../ui/Orb';
import { Sheet } from '../../ui/sheets';
import { Button } from '../../ui/buttons';
import { evaluateHabitOnDate } from '../../domain/habits';
import { itemColor, ModelContext } from '../../domain/modelHelpers';
import type { Folder, Goal, Habit, HabitEntry, LifeAreaAssessment, LifeAreaQuestion, Project } from '../../domain/types';
import type { PlanuiRepositories } from '../../storage/repositories';

interface HabitBandProps {
  habits: readonly Habit[];
  habitEntries: readonly HabitEntry[];
  date: string;
  daysOff?: readonly string[];
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly LifeAreaQuestion[];
  assessments?: readonly LifeAreaAssessment[];
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void> | void;
  onPlanHabit?: (habitId: string, date: string) => void;
  habitsEnabled?: boolean;
  triageCount?: number;
  onOpenTriage?: () => void;
  onDismissTriage?: () => void;
}

export function HabitBand({
  habits,
  habitEntries,
  date,
  daysOff = [],
  folders = [],
  projects = [],
  goals = [],
  lifeAreas = [],
  assessments = [],
  repositories,
  onChanged,
  onPlanHabit,
  triageCount,
  onOpenTriage,
  onDismissTriage,
}: HabitBandProps) {
  const [activeMenuHabit, setActiveMenuHabit] = useState<Habit | null>(null);
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const context: ModelContext = { folders, projects, goals, lifeAreas, assessments };

  const hasTriage = Boolean(triageCount && triageCount > 0);

  // Find active habits scheduled for this day or with entries on this day
  const relevantHabits = (habits || []).filter((h) => {
    if (h.state === 'archived') return false;
    const evaluation = evaluateHabitOnDate({
      habit: h,
      entriesForHabit: habitEntries,
      localDate: date,
      daysOff,
    });
    const isDone =
      evaluation.cellStatus === 'completed' ||
      Boolean(evaluation.entry?.minimumCompletedUk);
    // Include if scheduled today or if user logged something today
    return evaluation.isScheduledOpportunity || isDone;
  });

  if (relevantHabits.length === 0 && !hasTriage) {
    return null;
  }

  const handleToggle = async (habit: Habit, currentStatus: string) => {
    const isDone = currentStatus === 'completed' || currentStatus === 'minimum';
    const nextKind = isDone ? 'clear' : 'complete';
    if (!isDone) {
      setCompletingHabitId(habit.id);
      window.setTimeout(() => setCompletingHabitId(null), 380);
    }
    try {
      await repositories.recordHabitEntryForDateTransactionally({
        habitId: habit.id,
        localDate: date,
        input: { kind: nextKind },
        nowIso: new Date().toISOString(),
      });
      await onChanged();
    } catch {
      // ignore
    }
  };

  const handleLogMinimum = async (habit: Habit) => {
    try {
      await repositories.recordHabitEntryForDateTransactionally({
        habitId: habit.id,
        localDate: date,
        input: { kind: 'minimum' },
        nowIso: new Date().toISOString(),
      });
      await onChanged();
      setActiveMenuHabit(null);
    } catch {
      // ignore
    }
  };

  const handleLogSkip = async (habit: Habit) => {
    try {
      await repositories.recordHabitEntryForDateTransactionally({
        habitId: habit.id,
        localDate: date,
        input: { kind: 'skip' },
        nowIso: new Date().toISOString(),
      });
      await onChanged();
      setActiveMenuHabit(null);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <section
        className="ui-habit-band-container"
        data-ui="habit-band"
        aria-label="Стрічка звичок"
      >
        <div className="ui-habit-band-scroll no-scrollbar">
          {relevantHabits.map((habit) => {
            const evaluation = evaluateHabitOnDate({
              habit,
              entriesForHabit: habitEntries,
              localDate: date,
              daysOff,
            });
            const isCompleted =
              evaluation.cellStatus === 'completed' ||
              completingHabitId === habit.id;
            const isMinimum = Boolean(evaluation.entry?.minimumCompletedUk);
            const isDone = isCompleted || isMinimum;
            const currentStatus =
              evaluation.cellStatus === 'completed'
                ? 'completed'
                : isMinimum
                ? 'minimum'
                : 'no_entry';

            const color = itemColor(habit, context);

            return (
              <div
                key={habit.id}
                className="ui-habit-band-chip h-8 min-h-[32px] px-2.5 py-0 inline-flex items-center gap-2 rounded-full shrink-0"
                data-done={isDone ? 'true' : 'false'}
                data-completing={completingHabitId === habit.id ? 'true' : undefined}
                onTouchStart={() => {
                  pressTimer.current = window.setTimeout(() => {
                    setActiveMenuHabit(habit);
                  }, 480);
                }}
                onTouchEnd={() => {
                  if (pressTimer.current) {
                    window.clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                  }
                }}
                onTouchMove={() => {
                  if (pressTimer.current) {
                    window.clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveMenuHabit(habit);
                }}
              >
                <Orb size={14} color={color} className="flex-shrink-0" />
                <button
                  type="button"
                  className="ui-habit-chip-label text-left truncate max-w-[128px]"
                  onClick={() => setActiveMenuHabit(habit)}
                  title={habit.name}
                >
                  <span className="font-bold text-[12.5px] text-[var(--text-primary)] leading-tight">
                    {habit.name}
                  </span>
                  {isMinimum && (
                    <span className="ml-1 text-[11px] text-[var(--text-secondary)] bg-black/5 px-1 py-0.2 rounded-full">
                      Мінімум
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`ui-habit-chip-check ui-checkbox ui-pressable w-[18px] h-[18px] min-w-[18px] min-h-[18px] rounded-[6px] p-0 flex items-center justify-center ${
                    isCompleted || isMinimum ? 'ui-ink-gel' : ''
                  }`}
                  data-checked={isDone ? 'true' : 'false'}
                  aria-label={`${isDone ? 'Скасувати' : 'Виконати'}: ${habit.name}`}
                  onClick={() => void handleToggle(habit, currentStatus)}
                >
                  {(isCompleted || isMinimum) && (
                    <Icon name="check" size={12} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            );
          })}

          {hasTriage && (
            <div className="ui-habit-band-chip ui-habit-band-triage h-8 min-h-[32px] pl-3 pr-2 py-0 inline-flex items-center gap-1.5 rounded-full shrink-0">
              <button
                type="button"
                className="text-[12.5px] leading-[16px] font-bold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                onClick={onOpenTriage}
              >
                Попередні плани · {triageCount}
              </button>
              {onDismissTriage && (
                <button
                  type="button"
                  aria-label="Приховати пропозицію"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissTriage();
                  }}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {activeMenuHabit && (
        <Sheet
          isOpen={Boolean(activeMenuHabit)}
          onClose={() => setActiveMenuHabit(null)}
          title={activeMenuHabit.name}
        >
          <div className="space-y-3 py-2">
            <p className="text-[14px] text-secondary">
              {activeMenuHabit.description || 'Звичка на сьогодні'}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="primary"
                onClick={() => {
                  void handleToggle(activeMenuHabit, 'no_entry');
                  setActiveMenuHabit(null);
                }}
              >
                Виконати стандарт
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleLogMinimum(activeMenuHabit)}
              >
                Виконати мінімум
              </Button>
              <Button
                variant="subtle"
                onClick={() => void handleLogSkip(activeMenuHabit)}
              >
                Пропустити на сьогодні
              </Button>
              {onPlanHabit && (
                <Button
                  variant="subtle"
                  onClick={() => {
                    onPlanHabit(activeMenuHabit.id, date);
                    setActiveMenuHabit(null);
                  }}
                >
                  Запланувати час
                </Button>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
