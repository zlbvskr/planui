import {useReducedMotion} from '../../ui/motion';
import {Icon} from '../../ui/icons';
import {DeferredTasks} from './DeferredTasks';
import {minimumDayTasks} from './minimumDayPresentation';
import React, { useState, useRef, useEffect } from "react";
import { Clock, Check } from "../../ui/icons";
import {
  formatDuration,
  formatInstant,
  formatTimeRange,
} from "../../lib/format";
import { ActionMenu, EmptyState, PillRow, Section, Sheet } from "../ui/design";
import { directionFor, Effort } from "../timeline/itemPresentation";
import { futureGaps } from "../timeline/viewport";
import {
  detectScheduleConflicts,
  projectScheduleForDate,
} from "../../domain/scheduling";
import { projectTodayTasks, sessionFromDuration } from "../../domain/today";
import { formatInstantInZone } from "../../domain/temporal";
import type {
  CalendarEvent,
  DailyPlan,
  Folder,
  Project,
  Task,
  TaskReservation,
} from "../../domain/types";
import type { PlanuiRepositories } from "../../storage/repositories";

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
  const reduced=useReducedMotion();
  const [completing,setCompleting]=useState<Set<string>>(new Set());
  const pending=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  useEffect(()=>()=>{pending.current.forEach(clearTimeout);},[]);
  const toggle=(task:Task)=>{
    const timer=pending.current.get(task.id);
    if(timer){clearTimeout(timer);pending.current.delete(task.id);setCompleting(prev=>{const next=new Set(prev);next.delete(task.id);return next;});return;}
    if(task.state!=='open'){void onToggle(task.id);return;}
    setCompleting(prev=>new Set(prev).add(task.id));
    pending.current.set(task.id,setTimeout(()=>{pending.current.delete(task.id);void Promise.resolve(onToggle(task.id)).finally(()=>setCompleting(prev=>{const next=new Set(prev);next.delete(task.id);return next;}));},reduced?120:400));
  };
  const [filter, setFilter] = useState<"today" | "all">("today");
  const [error, setError] = useState("");
  const [placement, setPlacement] = useState<Task | null>(null);
  const [deferredOpen,setDeferredOpen]=useState(false);
  const [busy, setBusy] = useState(false);
  const projection = projectTodayTasks(tasks, reservations, date, zone, plan);
  if(plan.minimalDay)projection.visible=minimumDayTasks(projection.relevant,plan);
  const inbox = tasks.filter(
    (t) =>
      !t.plannedDate &&
      !t.deadline &&
      !reservations.some((r) => r.taskId === t.id && r.state === "active") &&
      t.state !== "canceled",
  );
  const visible =
    filter === "all"
      ? tasks.filter((t) => t.state !== "canceled")
      : [
          ...new Map(
            [...projection.visible, ...(plan.minimalDay ? [] : inbox)].map(
              (t) => [t.id, t],
            ),
          ).values(),
        ];
  const focus = visible.filter(
    (t) => t.state === "open" && plan.focusTaskIds.includes(t.id),
  );
  const rest = visible.filter(
    (t) => t.state === "open" && !plan.focusTaskIds.includes(t.id),
  );
  const sections = [
    { title: "Фокус дня", items: focus },
    { title: "На сьогодні", items: rest.filter((t) => !inbox.includes(t)) },
    { title: "Без дати", items: rest.filter((t) => inbox.includes(t)) },
    {
      title: "Виконано",
      items: visible.filter((t) => t.state === "completed"),
    },
  ];
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
    setError("");
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
        throw new Error("Вікно змінилося. Перегляньте розклад.");
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
          state: "active",
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
      setError("Не вдалося зайняти вікно. Оновіть розклад.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="today-task-sections"
      data-testid="today-tasks-mode"
      data-ui="content-start"
    >
      <PillRow
        label="Вибір завдань"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "today", label: "На сьогодні" },
          { value: "all", label: "Усі" },
        ]}
      />
      {error && <p role="alert">{error}</p>}
      {plan.minimalDay&&<DeferredTasks tasks={projection.relevant.filter(t=>!projection.visible.includes(t))} repositories={repositories} onChanged={onChanged} onPlan={task=>onPlan(task,'Перенести')}/>}
      {!visible.length && (
        <EmptyState
          text="Поки немає завдань."
          action="Додати"
          onAction={onAdd}
        />
      )}
      {sections
        .filter((s) => s.items.length)
        .map((section) => (
          <Section key={section.title} title={section.title}>
            {section.items.map((task) => {
              const dir = directionFor(task, folders, projects),
                completed = task.state === "completed" || completing.has(task.id);
              return (
                <div
                  key={task.id}
                  className={`today-task-row ${completed ? "task-completed" : ""}`} data-completing={completing.has(task.id)} data-motion={completing.has(task.id)?"running":"idle"}
                >
                  <button
                    className="task-check"
                    aria-label={`${completed ? "Відкрити знову" : "Завершити"}: ${task.title}`}
                    onClick={() => toggle(task)}
                  >
                    <span>
                      {completed && <Check size={15} aria-hidden="true" />}
                    </span>
                  </button>
                  <button className="task-copy" onClick={() => onPlan(task)}>
                    <span>
                      {plan.focusTaskIds.includes(task.id) && (
                        <span aria-label="Фокус дня"><Icon name="star" size={14}/> </span>
                      )}
                      {task.title}
                    </span>
                    <small>
                      {task.estimatedDurationMinutes
                        ? `${formatDuration(task.estimatedDurationMinutes)} · `
                        : ""}
                      <Effort effort={task.effort} />
                      {task.effort ? " · " : ""}
                      <span style={{ color: dir.hue }} aria-hidden="true">
                        ●
                      </span>{" "}
                      {dir.name}
                    </small>
                  </button>
                  {!completed && (
                    <button
                      className="task-clock"
                      aria-label={`У вільне вікно: ${task.title}`}
                      onClick={() => setPlacement(task)}
                    >
                      <Clock size={18} aria-hidden="true" />
                    </button>
                  )}
                  <ActionMenu
                    label={`Дії: ${task.title}`}
                    items={[
                      { label: "Перенести", onSelect: () => onPlan(task) },
                      {
                        label: "Розділити на сесії",
                        onSelect: () => onPlan(task, "Розділити"),
                      },
                      {
                        label: "Пауза",
                        onSelect: () => onPlan(task, "Поставити на паузу"),
                      },
                      {
                        label: "Відмовитися",
                        onSelect: () => onPlan(task, "Відмовитися"),
                      },
                      {
                        label: plan.focusTaskIds.includes(task.id)
                          ? "Прибрати з фокусу"
                          : "Додати до фокусу",
                        onSelect: () => {
                          void (async () => {
                            try {
                              await repositories.saveDailyPlan(
                                date,
                                {
                                  ...plan,
                                  focusTaskIds: plan.focusTaskIds.includes(
                                    task.id,
                                  )
                                    ? plan.focusTaskIds.filter(
                                        (id) => id !== task.id,
                                      )
                                    : [...plan.focusTaskIds, task.id],
                                },
                                plan,
                              );
                              await onChanged();
                            } catch {
                              setError("Не вдалося змінити фокус.");
                            }
                          })();
                        },
                      },
                    ]}
                  />
                </div>
              );
            })}
          </Section>
        ))}
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
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                }),
                gap.endLocalTime,
              )}{" "}
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
