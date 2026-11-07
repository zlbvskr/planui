import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Icon } from '../../ui/icons';
import { Clock, Check, ChevronDown, ChevronRight, Folder as FolderIcon } from '../../ui/icons';
import {
  formatDuration,
  formatInstant,
  formatTimeRange,
} from '../../lib/format';
import { ActionMenu, EmptyState, PillRow, Sheet, EventBar, TintedCard, Orb, Button } from '../../ui';
import { directionFor, Effort } from '../timeline/itemPresentation';
import { futureGaps } from '../timeline/viewport';
import {
  detectScheduleConflicts,
  projectScheduleForDate,
} from '../../domain/scheduling';
import { projectTodayTasks, sessionFromDuration } from '../../domain/today';
import { formatInstantInZone } from '../../domain/temporal';
import { resolveArea, areaColor, SHIFT_DAY_COLOR, SHIFT_NIGHT_COLOR } from '../../domain/modelHelpers';
import type {
  CalendarEvent,
  DailyPlan,
  Folder,
  Project,
  Task,
  TaskReservation,
} from '../../domain/types';
import type { PlanuiRepositories } from '../../storage/repositories';
import {
  AnimatedList,
  isReducedMotion,
  markMotionRunning,
  useDragReorder,
} from '../../ui/motion';

type Props = {
  folders: readonly Folder[];
  projects: readonly Project[];
  date: string;
  actualTodayDate: string;
  nowMs: number;
  zone: string;
  plan: DailyPlan;
  tasks: readonly Task[];
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void> | void;
  onToggle: (id: string) => Promise<void> | void;
  onPlan: (task: Task, reviewAction?: string) => void;
  onAdd: () => void;
};

export function TodayTasksPanel({
  folders,
  projects,
  date,
  nowMs,
  zone,
  plan,
  tasks,
  events,
  reservations,
  repositories,
  onChanged,
  onToggle,
  onPlan,
  onAdd,
}: Props) {
  const [filter, setFilter] = useState<'today' | 'all'>('today');
  const [error, setError] = useState('');
  const [placement, setPlacement] = useState<Task | null>(null);
  const [movingTask, setMovingTask] = useState<Task | null>(null);
  const [swipeActionTask, setSwipeActionTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const [collapsingIds, setCollapsingIds] = useState<Set<string>>(() => new Set());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLElement>(null);
  const timersRef = useRef<number[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handleReorderTasks = async (orderedIds: string[]) => {
    const nowIso = new Date().toISOString();
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        const task = tasks.find((t) => t.id === orderedIds[i]);
        if (task && task.order !== i) {
          await repositories.saveTask(
            { ...task, order: i, updatedAt: nowIso },
            task.revision,
          );
        }
      }
      await onChanged();
    } catch {
      // ignore
    }
  };

  const handleTaskCheck = (task: Task) => {
    if (task.state === 'open' && !isReducedMotion()) {
      if (completingIds.has(task.id)) return;
      const release = markMotionRunning(rootRef.current);
      setCompletingIds((prev) => new Set(prev).add(task.id));

      const tCollapse = window.setTimeout(() => {
        setCollapsingIds((prev) => new Set(prev).add(task.id));
      }, 220);

      const tDone = window.setTimeout(() => {
        void Promise.resolve(onToggle(task.id)).finally(() => {
          setCompletingIds((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          setCollapsingIds((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          release();
        });
      }, 400);

      timersRef.current.push(tCollapse, tDone);
    } else {
      void onToggle(task.id);
    }
  };

  const handleMoveFolder = async (targetFolderId: string | null) => {
    if (!movingTask) return;
    try {
      await repositories.saveTask(
        {
          ...movingTask,
          folderId: targetFolderId ?? undefined,
          updatedAt: new Date().toISOString(),
        },
        movingTask.revision,
      );

      await onChanged();
      setMovingTask(null);
    } catch {
      setError('Не вдалося перемістити завдання.');
    }
  };

  const gaps = futureGaps(
    projectScheduleForDate({
      localDate: date,
      displayZone: zone,
      tasks,
      events,
      reservations,
      dayOffAnnotations: [],
    }).availability.unoccupiedGaps,
    nowMs,
    placement?.estimatedDurationMinutes ?? 30,
  ).slice(0, 3);

  async function place(startMs: number) {
    if (!placement || busy) return;
    setBusy(true);
    setError('');
    try {
      const start = new Date(startMs).toISOString();
      const duration = placement.estimatedDurationMinutes ?? 30;
      const fresh = (await repositories.captureCoherentSnapshot()).snapshot;
      const warning = detectScheduleConflicts({
        candidateStartInstant: start,
        candidateEndInstant: new Date(startMs + duration * 60000).toISOString(),
        displayZone: zone,
        tasks: fresh.tasks,
        events: fresh.events,
        reservations: fresh.reservations,
      });
      if (warning.hasConflicts)
        throw new Error('Вікно змінилося. Перегляньте розклад.');
      const local = formatInstantInZone(start, zone),
        interval = sessionFromDuration(
          local.localDate,
          local.localTime,
          duration,
          zone,
        );
      const stamp = new Date().toISOString();
      await repositories.saveReservationTransactionally(
        {
          id: crypto.randomUUID(),
          taskId: placement.id,
          interval,
          state: 'active',
          releaseMetadata: null,
          createdAt: stamp,
          updatedAt: stamp,
          revision: 1,
        },
        undefined,
        placement.revision,
      );
      await onChanged();
      setPlacement(null);
    } catch {
      setError('Не вдалося зайняти вікно. Оновіть розклад.');
    } finally {
      setBusy(false);
    }
  }

  // Projection for today
  const projection = projectTodayTasks(tasks, reservations, date, zone, plan);
  const inbox = tasks.filter(
    (t) =>
      !t.plannedDate &&
      !t.deadline &&
      !reservations.some((r) => r.taskId === t.id && r.state === 'active') &&
      t.state !== 'canceled',
  );

  const isStayingInOpenSection = (t: Task) =>
    t.state === 'open' || completingIds.has(t.id);

  // Today items
  const todayTasks = [
    ...new Map(
      [...projection.visible, ...inbox].map((t) => [t.id, t]),
    ).values(),
  ];

  const focus = todayTasks.filter(
    (t) => isStayingInOpenSection(t) && plan.focusTaskIds.includes(t.id),
  );
  const rest = todayTasks.filter(
    (t) => isStayingInOpenSection(t) && !plan.focusTaskIds.includes(t.id),
  );
  const scheduledToday = rest.filter((t) => !inbox.includes(t));
  const inboxToday = rest.filter((t) => inbox.includes(t));
  const completedToday = todayTasks.filter(
    (t) => t.state === 'completed' && !completingIds.has(t.id),
  );

  const dragReorder = useDragReorder(todayTasks, handleReorderTasks);

  // Shifts and Events for today
  const todayShifts = useMemo(
    () =>
      events.filter((e) => {
        if (e.type !== 'work_shift') return false;
        if (e.schedule.kind === 'timed') {
          return e.schedule.interval.originStartLocalDate === date;
        }
        return (e.schedule as any).localDate === date;
      }),
    [events, date],
  );

  const todayEvents = useMemo(
    () =>
      events.filter((e) => {
        if (e.type === 'work_shift' || e.type === 'sleep') return false;
        if (e.schedule.kind === 'timed') {
          return e.schedule.interval.originStartLocalDate === date;
        }
        return (e.schedule as any).localDate === date;
      }),
    [events, date],
  );

  // Folders for "Усі"
  const taskFolders = useMemo(
    () => folders.filter((f) => f.kind === 'tasks'),
    [folders],
  );

  const allActiveTasks = useMemo(
    () => tasks.filter((t) => t.state !== 'canceled'),
    [tasks],
  );

  const renderTaskRow = (task: Task) => {
    const areaInfo = resolveArea(task, { folders, projects });
    const dir = directionFor(task, folders, projects);
    const color = areaInfo ? areaColor(areaInfo.rating) : dir.hue;
    const isCompleting = completingIds.has(task.id);
    const isCollapsing = collapsingIds.has(task.id);
    const completed = task.state === 'completed' || isCompleting;
    const dragProps = dragReorder.bindDragItem(task.id);

    return (
      <div
        key={task.id}
        data-list-key={task.id}
        className="today-task-collapse"
        data-collapsing={isCollapsing ? 'true' : undefined}
        {...dragProps}
        onTouchStart={(e) => {
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }}
        onTouchEnd={(e) => {
          if (!touchStartRef.current) return;
          const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
          const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
          touchStartRef.current = null;
          if (Math.abs(deltaY) > 40) return;
          if (deltaX > 56) {
            // Swipe right = complete
            handleTaskCheck(task);
          } else if (deltaX < -56) {
            // Swipe left = options
            setSwipeActionTask(task);
          }
        }}
      >
        <div
          data-completing={isCompleting ? 'true' : undefined}
          data-motion={isCompleting ? 'running' : 'idle'}
          className={`today-task-row ${completed ? 'task-completed' : ''}`}
        >
          {/* Tinted round check */}
          <button
            className="task-check"
            aria-label={`${completed ? 'Відкрити знову' : 'Завершити'}: ${task.title}`}
            onClick={() => handleTaskCheck(task)}
            style={{
              backgroundColor: completed ? color : 'transparent',
              borderColor: color,
            }}
          >
            <span>{completed && <Check size={14} className="text-white" />}</span>
          </button>

          {/* Title & meta */}
          <button className="task-copy text-left" onClick={() => onPlan(task)}>
            <span className="font-semibold text-[15px] text-ink leading-snug">
              {plan.focusTaskIds.includes(task.id) && (
                <span aria-label="Фокус дня" className="text-amber-500 mr-1 inline-block">
                  <Icon name="star" size={14} />
                </span>
              )}
              {task.title}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-secondary mt-0.5">
              {task.estimatedDurationMinutes && (
                <span>{formatDuration(task.estimatedDurationMinutes)}</span>
              )}
              {task.effort && (
                <>
                  <span>·</span>
                  <Effort effort={task.effort} />
                </>
              )}
              {areaInfo?.name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <Orb size={10} color={color} />
                    {areaInfo.name}
                  </span>
                </>
              )}
            </div>

            {/* Measure slim bar if present */}
            {task.measure && (
              <div className="w-full mt-1.5">
                <div className="w-full bg-black/10 rounded-full h-1 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          (task.measure.current / (task.measure.target || 1)) * 100,
                        ),
                      )}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="text-[11px] font-medium text-secondary tabular-nums mt-0.5 inline-block">
                  {task.measure.current} / {task.measure.target} {task.measure.unit}
                </span>
              </div>
            )}
          </button>

          {/* Trailing clock button */}
          {!completed && (
            <button
              type="button"
              className="task-clock ui-pressable"
              aria-label={`У вільне вікно: ${task.title}`}
              onClick={() => setPlacement(task)}
              title="У вільне вікно"
            >
              <Clock size={18} aria-hidden="true" />
            </button>
          )}

          {/* Action menu */}
          <ActionMenu
            label={`Дії: ${task.title}`}
            items={[
              {
                label: completed ? 'Відкрити знову' : 'Виконано',
                onSelect: () => handleTaskCheck(task),
              },
              { label: 'Перенести', onSelect: () => onPlan(task) },
              {
                label: 'Розділити на сесії',
                onSelect: () => onPlan(task, 'Розділити'),
              },
              {
                label: 'Пауза',
                onSelect: () => onPlan(task, 'Поставити на паузу'),
              },
              {
                label: 'Відмовитися',
                onSelect: () => onPlan(task, 'Відмовитися'),
              },
              {
                label: 'Перемістити в папку',
                onSelect: () => setMovingTask(task),
              },
              {
                label: plan.focusTaskIds.includes(task.id)
                  ? 'Прибрати з фокусу'
                  : 'Додати до фокусу',
                onSelect: () => {
                  void (async () => {
                    try {
                      await repositories.saveDailyPlan(
                        date,
                        {
                          ...plan,
                          focusTaskIds: plan.focusTaskIds.includes(task.id)
                            ? plan.focusTaskIds.filter((id) => id !== task.id)
                            : [...plan.focusTaskIds, task.id],
                        },
                        plan,
                      );
                      await onChanged();
                    } catch {
                      setError('Не вдалося змінити фокус.');
                    }
                  })();
                },
              },
            ]}
          />
        </div>
      </div>
    );
  };

  return (
    <section
      ref={rootRef}
      className="today-task-sections space-y-4"
      data-testid="today-tasks-mode"
      data-ui="content-start"
      data-motion="idle"
    >
      {/* Pill row [На сьогодні | Усі] (selected = ink) */}
      <div className="flex justify-center">
        <PillRow
          label="Вибір завдань"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'today', label: 'На сьогодні' },
            { value: 'all', label: 'Усі' },
          ]}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 px-2">
          {error}
        </p>
      )}

      {filter === 'today' ? (
        <div className="space-y-4">
          {/* Category (2): Зміна */}
          {todayShifts.length > 0 && (
            <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2.5">
              <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                Зміна
              </h2>
              {todayShifts.map((sh) => {
                const areaInfo = resolveArea(sh, { folders, projects });
                const isNight =
                  sh.schedule.kind === 'timed' &&
                  sh.schedule.interval.originStartLocalDate !==
                    sh.schedule.interval.originEndLocalDate;
                const color = areaInfo
                  ? areaColor(areaInfo.rating)
                  : isNight
                  ? SHIFT_NIGHT_COLOR
                  : SHIFT_DAY_COLOR;
                const hours =
                  sh.schedule.kind === 'timed'
                    ? formatTimeRange(
                        sh.schedule.interval.originStartLocalTime,
                        sh.schedule.interval.originEndLocalTime,
                      )
                    : 'Увесь день';
                return (
                  <EventBar
                    key={sh.id}
                    color={color}
                    icon={isNight ? 'moon' : 'sun'}
                    title={sh.title}
                    meta={`${hours}${areaInfo?.name ? ` · ${areaInfo.name}` : ''}`}
                  />
                );
              })}
            </div>
          )}

          {/* Category (3): Події */}
          {todayEvents.length > 0 && (
            <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2.5">
              <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                Події
              </h2>
              {todayEvents.map((ev) => {
                const areaInfo = resolveArea(ev, { folders, projects });
                const color = areaInfo
                  ? areaColor(areaInfo.rating)
                  : 'var(--color-brand)';
                const hours =
                  ev.schedule.kind === 'timed'
                    ? formatTimeRange(
                        ev.schedule.interval.originStartLocalTime,
                        ev.schedule.interval.originEndLocalTime,
                      )
                    : 'Увесь день';
                return (
                  <EventBar
                    key={ev.id}
                    color={color}
                    icon="calendar"
                    title={ev.title}
                    meta={`${hours}${areaInfo?.name ? ` · ${areaInfo.name}` : ''}`}
                  />
                );
              })}
            </div>
          )}

          {/* Category (4): Завдання */}
          {focus.length > 0 && (
            <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2">
              <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                Фокус дня
              </h2>
              <AnimatedList depKey={focus.map((t) => `${t.id}:${t.state}`).join(',')}>
                {focus.map(renderTaskRow)}
              </AnimatedList>
            </div>
          )}

          {scheduledToday.length > 0 && (
            <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2">
              <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                На сьогодні
              </h2>
              <AnimatedList
                depKey={scheduledToday.map((t) => `${t.id}:${t.state}`).join(',')}
              >
                {scheduledToday.map(renderTaskRow)}
              </AnimatedList>
            </div>
          )}

          {inboxToday.length > 0 && (
            <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2">
              <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                Без дати
              </h2>
              <AnimatedList
                depKey={inboxToday.map((t) => `${t.id}:${t.state}`).join(',')}
              >
                {inboxToday.map(renderTaskRow)}
              </AnimatedList>
            </div>
          )}

          {completedToday.length > 0 && (
            <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2">
              <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                Виконано
              </h2>
              <AnimatedList
                depKey={completedToday.map((t) => `${t.id}:${t.state}`).join(',')}
              >
                {completedToday.map(renderTaskRow)}
              </AnimatedList>
            </div>
          )}

          {todayTasks.length === 0 && (
            <EmptyState
              text="Поки немає завдань на сьогодні."
              action="Додати"
              onAction={onAdd}
            />
          )}
        </div>
      ) : (
        /* "Усі" view: The folder tree for tasks (folders first, then items) */
        <div className="space-y-4">
          {/* Folders first */}
          {taskFolders.map((folder) => {
            const folderTasks = allActiveTasks.filter(
              (t) => t.folderId === folder.id,
            );
            const isCollapsed = collapsedFolderIds.has(folder.id);

            return (
              <div
                key={folder.id}
                className="rounded-[28px] bg-white p-4 shadow-sm space-y-2"
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-left py-1 cursor-pointer"
                  onClick={() => {
                    setCollapsedFolderIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    });
                  }}
                >
                  <div className="flex items-center gap-2">
                    <FolderIcon size={18} className="text-secondary" />
                    <span className="font-semibold text-[15px] text-ink">
                      {folder.name}
                    </span>
                    <span className="text-[12px] bg-black/5 text-secondary px-2 py-0.5 rounded-full font-medium">
                      {folderTasks.length}
                    </span>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight size={18} className="text-secondary" />
                  ) : (
                    <ChevronDown size={18} className="text-secondary" />
                  )}
                </button>

                {!isCollapsed && (
                  <div className="space-y-1 pt-1">
                    {folderTasks.length > 0 ? (
                      folderTasks.map(renderTaskRow)
                    ) : (
                      <p className="text-[13px] text-secondary py-2 px-1">
                        Папка порожня
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Root tasks (no folder) */}
          {(() => {
            const rootTasks = allActiveTasks.filter(
              (t) => !t.folderId || !folders.some((f) => f.id === t.folderId),
            );
            return (
              <div className="rounded-[28px] bg-white p-4 shadow-sm space-y-2">
                <h2 className="text-[13px] font-semibold text-secondary tracking-wider px-1">
                  Без папки
                </h2>
                {rootTasks.length > 0 ? (
                  rootTasks.map(renderTaskRow)
                ) : (
                  <p className="text-[13px] text-secondary py-2 px-1">
                    Усі справи розподілено по папках
                  </p>
                )}
              </div>
            );
          })()}

          {allActiveTasks.length === 0 && (
            <EmptyState
              text="Поки немає жодного завдання."
              action="Додати"
              onAction={onAdd}
            />
          )}
        </div>
      )}

      {/* Swipe action sheet alternative */}
      {swipeActionTask && (
        <Sheet
          isOpen={Boolean(swipeActionTask)}
          onClose={() => setSwipeActionTask(null)}
          title={swipeActionTask.title}
        >
          <div className="space-y-2 py-2">
            <Button
              variant="secondary"
              onClick={() => {
                onPlan(swipeActionTask);
                setSwipeActionTask(null);
              }}
            >
              Перенести
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onPlan(swipeActionTask, 'Поставити на паузу');
                setSwipeActionTask(null);
              }}
            >
              Пауза
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onPlan(swipeActionTask, 'Відмовитися');
                setSwipeActionTask(null);
              }}
            >
              Відмовитися
            </Button>
          </div>
        </Sheet>
      )}

      {/* Move to folder sheet */}
      {movingTask && (
        <Sheet
          isOpen={Boolean(movingTask)}
          onClose={() => setMovingTask(null)}
          title="Перемістити в папку"
        >
          <div className="space-y-2 py-2">
            <button
              type="button"
              className="w-full text-left p-3 rounded-2xl bg-black/5 hover:bg-black/10 font-medium text-[14px]"
              onClick={() => void handleMoveFolder(null)}
            >
              Коренева папка (без папки)
            </button>
            {taskFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="w-full text-left p-3 rounded-2xl bg-black/5 hover:bg-black/10 font-medium text-[14px] flex items-center justify-between"
                onClick={() => void handleMoveFolder(f.id)}
              >
                <span>{f.name}</span>
                {movingTask.folderId === f.id && (
                  <Check size={16} className="text-ink" />
                )}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {/* Gap placement sheet */}
      <Sheet
        title="У вільне вікно"
        isOpen={Boolean(placement)}
        onClose={() => setPlacement(null)}
      >
        <p className="text-sm">
          Час для роботи над справою — план, який можна змінити.
        </p>
        {gaps.length ? (
          gaps.map((gap) => (
            <button
              disabled={busy}
              className="ui-disclosure"
              key={gap.startInstant}
              onClick={() => void place(gap.startMs)}
            >
              {formatTimeRange(
                formatInstant(gap.startMs, zone, {
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                }),
                gap.endLocalTime,
              )}{' '}
              · {formatDuration(placement?.estimatedDurationMinutes ?? 30)}
            </button>
          ))
        ) : (
          <EmptyState
            text="Вільних вікон поки немає."
            action="Обрати час"
            onAction={() => {
              if (placement) onPlan(placement);
              setPlacement(null);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}
