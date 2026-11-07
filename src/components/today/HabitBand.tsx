import React, { useState, useRef } from 'react';
import { Icon } from '../../ui/icons';
import { Orb, Sheet, Button } from '../../ui';
import { evaluateHabitOnDate } from '../../domain/habits';
import { resolveArea, areaColor, ModelContext } from '../../domain/modelHelpers';
import type { Folder, Habit, HabitEntry, Project } from '../../domain/types';
import type { PlanuiRepositories } from '../../storage/repositories';

interface HabitBandProps {
  habits: readonly Habit[];
  habitEntries: readonly HabitEntry[];
  date: string;
  daysOff?: readonly string[];
  folders?: readonly Folder[];
  projects?: readonly Project[];
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void> | void;
  onPlanHabit?: (habitId: string, date: string) => void;
  habitsEnabled?: boolean;
}

export function HabitBand({
  habits,
  habitEntries,
  date,
  daysOff = [],
  folders = [],
  projects = [],
  repositories,
  onChanged,
  onPlanHabit,
  habitsEnabled = true,
}: HabitBandProps) {
  const [activeMenuHabit, setActiveMenuHabit] = useState<Habit | null>(null);
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const context: ModelContext = { folders, projects };

  if (!habits || habits.length === 0) {
    return null;
  }

  // Find active habits scheduled for this day or with entries on this day
  const relevantHabits = habits.filter((h) => {
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

  if (relevantHabits.length === 0) {
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
        <div className="ui-habit-band-scroll">
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

            const areaInfo = resolveArea(habit, context);
            const color = areaColor(areaInfo?.rating);

            return (
              <div
                key={habit.id}
                className="ui-habit-band-chip"
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
                <Orb size={18} color={color} className="flex-shrink-0" />
                <button
                  type="button"
                  className="ui-habit-chip-label text-left truncate max-w-[140px]"
                  onClick={() => setActiveMenuHabit(habit)}
                  title={habit.name}
                >
                  <span className="font-semibold text-[13px] text-ink leading-tight">
                    {habit.name}
                  </span>
                  {isMinimum && (
                    <span className="ml-1 text-[11px] text-secondary bg-black/5 px-1.5 py-0.2 rounded-full">
                      Мінімум
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="ui-habit-chip-check ui-pressable"
                  aria-label={`${isDone ? 'Скасувати' : 'Виконати'}: ${habit.name}`}
                  onClick={() => void handleToggle(habit, currentStatus)}
                  style={{
                    backgroundColor: isCompleted
                      ? color
                      : isMinimum
                      ? 'rgba(61, 107, 255, 0.15)'
                      : 'transparent',
                    borderColor: isDone ? color : 'rgba(20, 24, 40, 0.22)',
                  }}
                >
                  {isCompleted && (
                    <Icon name="check" size={12} className="text-white" />
                  )}
                  {isMinimum && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </button>
              </div>
            );
          })}
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
