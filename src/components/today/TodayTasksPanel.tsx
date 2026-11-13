import { sphereStates } from '../../domain/sphereInsights';
import { needsSphereStep, SphereStepMarker } from '../../ui/spheres';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Pause, Pencil } from 'lucide-react';
import { Icon } from '../../ui/icons';
import { formatDuration, formatTimeRange } from '../../lib/format';
import { Checkbox } from '../../ui/Checkbox';
import { HeroArt } from '../../ui/art';
import { EmptyState } from '../../ui/EmptyState';
import { Icon3D } from '../../ui/Icon3D';
import { MilkyCard, Tile3D } from '../../ui/cards';
import { PillRow } from '../../ui/selection';
import { RoundButton } from '../../ui/buttons';
import { Row } from '../../ui/rows';
import { Sheet } from '../../ui/sheets';
import { orbVars } from '../../domain/modelHelpers';
import { projectTodayTasks } from '../../domain/today';
import { areaName, itemColor, reorder, getManualOrder } from '../../domain/modelHelpers';
import type { CalendarEvent, DailyPlan, Folder, Goal, LifeAreaAssessment, LifeAreaQuestion, Project, Task, TaskReservation } from '../../domain/types';
import type { PlanuiRepositories } from '../../storage/repositories';

function Effort({ effort }: { effort: Task['effort'] }) {
  if (!effort) return null;
  const level = { small: 1, medium: 2, large: 3 }[effort];
  const label = { small: 'малі', medium: 'середні', large: 'значні' }[effort];
  return (
    <span
      className="ui-effort inline-flex flex-row items-center gap-[3px] align-middle"
      role="img"
      aria-label={`Зусилля: ${label}`}
    >
      {[0, 1, 2].map((index) => {
        const filled = index < level;
        return (
          <span
            key={index}
            aria-hidden="true"
            className="ui-effort-bead"
            data-filled={filled}
          />
        );
      })}
    </span>
  );
}

type Props = {
  folders: readonly Folder[];
  projects: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly LifeAreaQuestion[];
  assessments?: readonly LifeAreaAssessment[];
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
  goals = [],
  lifeAreas = [],
  assessments = [],
  date,
  nowMs,
  zone,
  plan,
  tasks,
  reservations,
  repositories,
  onChanged,
  onToggle,
  onPlan,
  onAdd,
}: Props) {
  const [filter, setFilter] = useState<'today' | 'all'>('today');
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [menuTask, setMenuTask] = useState<Task | null>(null);
  const [swipeActionTask, setSwipeActionTask] = useState<Task | null>(null);
  const [folderMoveTask, setFolderMoveTask] = useState<Task | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const timersRef = useRef<number[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const modelContext = useMemo(
    () => ({
      folders,
      projects,
      goals,
      lifeAreas,
      assessments,
    }),
    [folders, projects, goals, lifeAreas, assessments],
  );

  const sphereData = useMemo(() => sphereStates(lifeAreas, assessments, new Date(nowMs).toISOString()), [lifeAreas, assessments, nowMs]);
  const supportsArea = (task: Task) => needsSphereStep(task, sphereData, modelContext);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const pendingTaskIds = useRef(new Set<string>());
  const handleTaskCheck = (task: Task) => {
    if (pendingTaskIds.current.has(task.id)) return;
    pendingTaskIds.current.add(task.id);
    if (task.state === 'open') {
      if (completingIds.has(task.id)) { pendingTaskIds.current.delete(task.id); return; }
      setCompletingIds((prev) => new Set(prev).add(task.id));

      const write = Promise.resolve().then(() => onToggle(task.id)).catch(() => undefined);
      const timerId = window.setTimeout(() => {
        void write.finally(() => {
          pendingTaskIds.current.delete(task.id);
          setCompletingIds((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
        });
      }, 280);

      timersRef.current.push(timerId);
    } else {
      void Promise.resolve().then(()=>onToggle(task.id)).catch(()=>undefined).finally(()=>pendingTaskIds.current.delete(task.id));
    }
  };

  const handleCancelTask = async (task: Task) => {
    try {
      const nowIso = new Date().toISOString();
      await repositories.saveTask(
        { ...task, state: 'canceled', canceledAt: nowIso, updatedAt: nowIso },
        task.revision,
      );
      await onChanged();
    } catch {
      // ignore
    }
  };

  const handleTogglePause = async (task: Task) => {
    try {
      const nowIso = new Date().toISOString();
      const nextPlanning = task.planningState === 'unplanned' ? 'date_only' : 'unplanned';
      await repositories.saveTask(
        { ...task, planningState: nextPlanning, updatedAt: nowIso },
        task.revision,
      );
      await onChanged();
    } catch {
      // ignore
    }
  };

  const handleMoveToFolder = async (task: Task, folderId: string | null) => {
    try {
      const nowIso = new Date().toISOString();
      await repositories.saveTask(
        { ...task, folderId, updatedAt: nowIso },
        task.revision,
      );
      await onChanged();
      setFolderMoveTask(null);
    } catch {
      // ignore
    }
  };

  const handleMoveTaskOrder = async (task: Task, delta: number) => {
    const list = tasks.filter((t) => t.state === task.state && t.folderId === task.folderId);
    const fromIndex = list.findIndex((t) => t.id === task.id);
    if (fromIndex < 0) return;
    const toIndex = Math.max(0, Math.min(list.length - 1, fromIndex + delta));
    if (fromIndex === toIndex) return;

    const reordered = reorder(list, fromIndex, toIndex);
    try {
      const nowIso = new Date().toISOString();
      for (const item of reordered) {
        await repositories.saveTask(
          { ...item, updatedAt: nowIso },
          item.revision,
        );
      }
      await onChanged();
    } catch {
      // ignore
    }
  };

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

  const focus = todayTasks
    .filter((t) => isStayingInOpenSection(t) && plan.focusTaskIds.includes(t.id))
    .slice(0, 3);
  const rest = todayTasks.filter(
    (t) => isStayingInOpenSection(t) && !plan.focusTaskIds.includes(t.id),
  );
  const scheduledToday = rest
    .filter((t) => !inbox.includes(t))
    .sort((a, b) => getManualOrder(a, 0) - getManualOrder(b, 0));
  const inboxToday = rest
    .filter((t) => inbox.includes(t))
    .sort((a, b) => getManualOrder(a, 0) - getManualOrder(b, 0));
  const completedToday = todayTasks.filter(
    (t) => t.state === 'completed' && !completingIds.has(t.id),
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

  const rootTasks = useMemo(
    () =>
      allActiveTasks
        .filter((t) => !t.folderId || !folders.some((f) => f.id === t.folderId))
        .sort((a, b) => {
          const aDone = a.state === 'completed' ? 1 : 0;
          const bDone = b.state === 'completed' ? 1 : 0;
          if (aDone !== bDone) return aDone - bDone;
          return getManualOrder(a, 0) - getManualOrder(b, 0);
        }),
    [allActiveTasks, folders],
  );

  const renderFocusCompactRow = (task: Task) => {
    const color = itemColor(task, modelContext);
    const isCompleting = completingIds.has(task.id);
    const completed = task.state === 'completed' || isCompleting;
    const activeRes = reservations.find(
      (r) =>
        r.taskId === task.id &&
        r.state === 'active' &&
        r.interval.originStartLocalDate === date,
    );
    const timeOrDuration = activeRes
      ? formatTimeRange(
          activeRes.interval.originStartLocalTime,
          activeRes.interval.originEndLocalTime,
        )
      : task.estimatedDurationMinutes
        ? formatDuration(task.estimatedDurationMinutes)
        : '';

    return (
      <div
        key={task.id}
        role="button"
        tabIndex={0}
        onClick={() => onPlan(task)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPlan(task);
          }
        }}
        className={`today-focus-row min-h-[48px] h-12 px-3 rounded-[20px] flex items-center gap-2.5 cursor-pointer select-none ${
          completed ? 'task-completed ui-soft-row-glow' : ''
        }`}
        style={{ '--c': orbVars(color)['--c'], '--glow-c': orbVars(color)['--c'] } as React.CSSProperties}
      >
        <span
          aria-label="Фокус дня"
          className="text-amber-500 text-[15px] leading-none shrink-0"
        >
          ★
        </span>
        <span className="text-[14.5px] leading-[19px] font-bold text-[var(--text-primary)] truncate flex-1 min-w-0">
          {supportsArea(task) && <SphereStepMarker />}{task.title}
        </span>
        {timeOrDuration && (
          <span className="text-[12px] leading-[16px] font-semibold text-[var(--text-secondary)] shrink-0 tabular-nums">
            {timeOrDuration}
          </span>
        )}
        <div
          className="shrink-0 flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={completed}
            label={
              completed
                ? `Позначити невиконаним: ${task.title}`
                : `Позначити виконаним: ${task.title}`
            }
            onChange={() => handleTaskCheck(task)}
          />
        </div>
      </div>
    );
  };

  const renderTaskRow = (task: Task) => {
    const resolvedName = areaName(task, modelContext);
    const color = itemColor(task, modelContext);
    const isCompleting = completingIds.has(task.id);
    const completed = task.state === 'completed' || isCompleting;
    const hasDuration = Boolean(task.estimatedDurationMinutes);
    const hasEffort = Boolean(task.effort) && !(hasDuration && resolvedName);
    const hasArea = Boolean(resolvedName);

    return (
      <div
        key={task.id}
        data-list-key={task.id}
        className="w-full"
        onTouchStart={(e) => {
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
          if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
          }
          longPressTimerRef.current = window.setTimeout(() => {
            setMenuTask(task);
          }, 480);
        }}
        onTouchMove={(e) => {
          if (!touchStartRef.current) return;
          const dist = Math.hypot(
            e.touches[0].clientX - touchStartRef.current.x,
            e.touches[0].clientY - touchStartRef.current.y,
          );
          if (dist > 10 && longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }}
        onTouchEnd={(e) => {
          if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          if (!touchStartRef.current) return;
          const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
          const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
          touchStartRef.current = null;
          if (Math.abs(deltaY) > 36) return;
          if (deltaX > 56) {
            handleTaskCheck(task);
          } else if (deltaX < -56) {
            setSwipeActionTask(task);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuTask(task);
        }}
      >
        <div
          data-completing={isCompleting ? 'true' : undefined}
          data-glow={completed ? 'true' : undefined}
          data-done={completed ? 'true' : undefined}
          className={`w-full ${completed ? 'task-completed' : ''}`}
          style={{ '--glow-c': orbVars(color)['--c'] } as React.CSSProperties}
        >
          {isCompleting && <span className="task-sparks" aria-hidden="true">{Array.from({length:6},(_,i)=><i key={i} style={{'--spark-x':`${Math.cos(i*Math.PI/3)*30}px`,'--spark-y':`${Math.sin(i*Math.PI/3)*30}px`} as React.CSSProperties}/>)}</span>}
          <Row
            orbColor={color}
            orbSize={26}
            title={
              <span className="ui-soft-row-title">
                {plan.focusTaskIds.includes(task.id) && (
                  <span aria-label="Фокус дня" className="text-amber-500 mr-1.5 inline-block">
                    ★
                  </span>
                )}
                {supportsArea(task) && <SphereStepMarker />}{task.title}
              </span>
            }
            meta={
              (hasDuration || hasEffort || hasArea || task.measure) ? (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {(hasDuration || hasEffort || hasArea) && (
                    <div className="flex items-center gap-1.5 flex-wrap ui-soft-row-meta">
                      {hasDuration && (
                        <span>{formatDuration(task.estimatedDurationMinutes!)}</span>
                      )}
                      {hasEffort && (
                        <>
                          {hasDuration && <span>·</span>}
                          <Effort effort={task.effort} />
                        </>
                      )}
                      {hasArea && (
                        <>
                          {(hasDuration || hasEffort) && <span>·</span>}
                          <span>{resolvedName}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Measure slim bar if present */}
                  {task.measure && (
                    <div className="w-full mt-1">
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
                      <span className="text-[11px] font-medium text-[var(--text-secondary)] tabular-nums mt-0.5 inline-block">
                        {task.measure.current} / {task.measure.target} {task.measure.unit}
                      </span>
                    </div>
                  )}
                </div>
              ) : undefined
            }
            checked={completed}
            done={completed}
            onCheckedChange={() => handleTaskCheck(task)}
            trailing={
              <div className="flex items-center gap-2">
                <RoundButton
                  size={44}
                  variant="frosted"
                  icon="clock"
                  aria-label="У вільне вікно"
                  title="У вільне вікно"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlan(task, 'schedule');
                  }}
                />
              </div>
            }
            onClick={() => onPlan(task)}
            className="cursor-pointer min-h-[52px]"
          />
        </div>
      </div>
    );
  };

  return (
    <section
      ref={rootRef}
      className="daily-list today-task-sections space-y-4"
      data-testid="today-tasks-mode"
      data-ui="content-start"
    >
      {/* Pill row [На сьогодні | Усі] left-aligned on the 20px gutter */}
      <PillRow
        label="Вибір завдань"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'today', label: 'На сьогодні' },
          { value: 'all', label: 'Усі' },
        ]}
      />

      {filter === 'today' ? (
        <div className="space-y-4">
          {/* "Фокус дня" = ONE compact card (8px padding, no empty bottom space), rows 48px (star + title + time + checkbox); headings 17/800 */}
          {focus.length > 0 && (
            <div className="space-y-2">
              <div className="focus-art-heading"><h2 className="ui-section-title px-1 mb-2">Фокус дня</h2><HeroArt name="target" size={48} /></div>
              <MilkyCard padded={false} className="today-focus-card">
                {focus.map(renderFocusCompactRow)}
              </MilkyCard>
            </div>
          )}

          {/* Heading 17/800 "На сьогодні" */}
          {scheduledToday.length > 0 && (
            <div className="space-y-2">
              <h2 className="ui-section-title px-1 mb-2">
                На сьогодні
              </h2>
              <div className="space-y-2">
                {scheduledToday.map(renderTaskRow)}
              </div>
            </div>
          )}

          {/* Heading 17/800 "Без дати" */}
          {inboxToday.length > 0 && (
            <div className="space-y-2">
              <h2 className="ui-section-title px-1 mb-2">
                Без дати
              </h2>
              <div className="space-y-2">
                {inboxToday.map(renderTaskRow)}
              </div>
            </div>
          )}

          {/* Completed rows move to the bottom at 70% opacity */}
          {completedToday.length > 0 && (
            <div className="space-y-2 opacity-70">
              <h2 className="ui-section-title text-[var(--text-secondary)] px-1 mb-2">
                Виконано
              </h2>
              <div className="space-y-2">
                {completedToday.map(renderTaskRow)}
              </div>
            </div>
          )}

          {todayTasks.length === 0 && (
            <EmptyState
              context="tasks"
              title="Нічого на сьогодні"
              primaryAction={{
                label: 'Додати завдання',
                onClick: onAdd,
              }}
            />
          )}
        </div>
      ) : (
        /* "Усі" view: The folder tree for tasks (folder Rows with a 36px Icon3D tile) + loose tasks */
        <div className="space-y-4">
          {taskFolders.map((folder) => {
            const folderTasks = allActiveTasks
              .filter((t) => t.folderId === folder.id)
              .sort((a, b) => {
                const aDone = a.state === 'completed' ? 1 : 0;
                const bDone = b.state === 'completed' ? 1 : 0;
                if (aDone !== bDone) return aDone - bDone;
                return getManualOrder(a, 0) - getManualOrder(b, 0);
              });
            const isCollapsed = collapsedFolderIds.has(folder.id);
            const folderColor = itemColor(folder, modelContext);

            return (
              <div key={folder.id} className="space-y-2">
                <Row
                  leading={
                    <Tile3D
                      as="div"
                      radius={12}
                      className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center pointer-events-none"
                    >
                      <Icon3D name="folder" color={folderColor} size={24} />
                    </Tile3D>
                  }
                  title={folder.name}
                  trailing={
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] bg-black/5 text-[var(--text-secondary)] px-2 py-0.5 rounded-full font-bold tabular-nums">
                        {folderTasks.length}
                      </span>
                      <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={18} />
                    </div>
                  }
                  onClick={() => {
                    setCollapsedFolderIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    });
                  }}
                  className="cursor-pointer min-h-[52px]"
                />

                {!isCollapsed && folderTasks.length > 0 && (
                  <div className="space-y-2 pl-3">
                    {folderTasks.map(renderTaskRow)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Root tasks (loose tasks without folder) - only when loose tasks exist */}
          {rootTasks.length > 0 && (
            <div className="space-y-2">
              <h2 className="ui-section-title px-1 mb-2">
                Без папки
              </h2>
              <div className="space-y-2">
                {rootTasks.map(renderTaskRow)}
              </div>
            </div>
          )}

          {/* If there are no tasks in the app at all, show ONLY the EmptyState */}
          {allActiveTasks.length === 0 && (
            <EmptyState
              context="tasks"
              title="Нічого на сьогодні"
              primaryAction={{
                label: 'Додати завдання',
                onClick: onAdd,
              }}
            />
          )}
        </div>
      )}

      {/* Swipe left action sheet (Перенести / Пауза / Відмовитися) */}
      {swipeActionTask && (
        <Sheet
          isOpen={Boolean(swipeActionTask)}
          onClose={() => setSwipeActionTask(null)}
          title={swipeActionTask.title}
        >
          <div className="space-y-2 py-2">
            <Row
              hideOrb
              leading={<Icon name="calendar" size={18} />}
              title="Перенести"
              onClick={() => {
                const t = swipeActionTask;
                setSwipeActionTask(null);
                onPlan(t, 'reschedule');
              }}
            />
            <Row
              hideOrb
              leading={<Pause size={18} className="text-secondary" />}
              title="Поставити на паузу"
              onClick={() => {
                const t = swipeActionTask;
                setSwipeActionTask(null);
                void handleTogglePause(t);
              }}
            />
            <Row
              hideOrb
              leading={<Icon name="x" size={18} />}
              title="Відмовитися"
              className="text-[var(--accent-danger)]"
              onClick={() => {
                const t = swipeActionTask;
                setSwipeActionTask(null);
                void handleCancelTask(t);
              }}
            />
          </div>
        </Sheet>
      )}

      {/* Long-press item menu (accessible alternative; NO "⋯" on the screen) */}
      {menuTask && (
        <Sheet
          isOpen={Boolean(menuTask)}
          onClose={() => setMenuTask(null)}
          title={menuTask.title}
        >
          <div className="space-y-2 py-2">
            <Row
              hideOrb
              leading={<Icon name="check" size={18} />}
              title={menuTask.state === 'completed' ? 'Відкрити знову' : 'Виконати'}
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                handleTaskCheck(t);
              }}
            />
            <Row
              hideOrb
              leading={<Icon name="calendar" size={18} />}
              title="Перенести"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                onPlan(t, 'reschedule');
              }}
            />
            <Row
              hideOrb
              leading={<Pause size={18} className="text-secondary" />}
              title="Поставити на паузу"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                void handleTogglePause(t);
              }}
            />
            <Row
              hideOrb
              leading={<Icon name="folder" size={18} />}
              title="Перемістити в папку"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                setFolderMoveTask(t);
              }}
            />
            <Row
              hideOrb
              leading={<Icon name="arrow-up" size={18} />}
              title="Вище"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                void handleMoveTaskOrder(t, -1);
              }}
            />
            <Row
              hideOrb
              leading={<Icon name="arrow-down" size={18} />}
              title="Нижче"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                void handleMoveTaskOrder(t, 1);
              }}
            />
            <Row
              hideOrb
              leading={<Pencil size={18} className="text-secondary" />}
              title="Редагувати"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                onPlan(t);
              }}
            />
            <Row
              hideOrb
              leading={<Icon name="trash" size={18} />}
              title="Відмовитися"
              className="text-[var(--accent-danger)]"
              onClick={() => {
                const t = menuTask;
                setMenuTask(null);
                void handleCancelTask(t);
              }}
            />
          </div>
        </Sheet>
      )}

      {/* Move to folder sheet */}
      {folderMoveTask && (
        <Sheet
          isOpen={Boolean(folderMoveTask)}
          onClose={() => setFolderMoveTask(null)}
          title="Перемістити в папку"
        >
          <div className="space-y-2 py-2">
            <Row
              hideOrb
              title="Без папки"
              selected={!folderMoveTask.folderId}
              onClick={() => void handleMoveToFolder(folderMoveTask, null)}
            />
            {taskFolders.map((f) => (
              <Row
                key={f.id}
                hideOrb
                title={f.name}
                selected={folderMoveTask.folderId === f.id}
                onClick={() => void handleMoveToFolder(folderMoveTask, f.id)}
              />
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}
