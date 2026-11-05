import { formatDuration } from '../../lib/format';
import { ItemCard, PillMenu as SelectField } from '../ui/design';
import { directionFor, effortDots } from './DayCanvas';
import { Folder, Project } from '../../domain/types';
import { detectScheduleConflicts, projectScheduleForDate } from '../../domain/scheduling';
import { sessionFromDuration } from '../../domain/today';
import type { CalendarEvent } from '../../domain/types';
import { classifyTaskTemporalNotice } from '../../domain/plans';
import React, { useState } from 'react';
import { DailyPlan, Task, TaskEffort, TaskReservation } from '../../domain/types';
import { deadlineDate, EFFORT_LABELS_UK, projectTodayTasks } from '../../domain/today';
import { formatUkrainianDateHeading, formatInstantInZone } from '../../domain/temporal';
import { PlanuiRepositories } from '../../storage/repositories';
import { Button, Card } from '../ui/primitives';

export function TodayTasksPanel({ folders, projects, date, actualTodayDate, nowMs, zone, plan, tasks, events, reservations, repositories, onChanged, onToggle, onPlan }: { folders: readonly Folder[]; projects: readonly Project[]; date: string; actualTodayDate: string; nowMs: number; zone: string; plan: DailyPlan; tasks: readonly Task[]; events: readonly CalendarEvent[]; reservations: readonly TaskReservation[]; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; onToggle: (id: string) => Promise<void> | void; onPlan: (task: Task) => void }) {
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const projection = projectTodayTasks(tasks, reservations, date, zone, plan);
  const gaps = projectScheduleForDate({localDate:date,displayZone:zone,tasks,events,reservations,dayOffAnnotations:[]}).availability.unoccupiedGaps;
  const visible = [...(all ? tasks.filter(t => t.state !== 'canceled') : projection.visible)].sort((a,b)=>Number(plan.focusTaskIds.includes(b.id))-Number(plan.focusTaskIds.includes(a.id))); 
  return <section className="space-y-3" data-testid="today-tasks-mode" data-ui="content-start">
    <div className="flex flex-wrap gap-2 items-center"><h2 className="font-semibold">{all ? 'Усі завдання' : 'Фокус дня'}</h2><Button aria-pressed={all} onClick={() => setAll(!all)}>{all ? 'Повернутися до дня' : 'Відкрити загальний список'}</Button></div>
    {!all && projection.hiddenCount > 0 && <p>Мінімальний день: приховано {projection.hiddenCount} справ без термінів і сеансів. Загальний список доступний без зміни даних.</p>}

    {error && <p role="alert">{error}</p>}
    {visible.length === 0 && <p>Немає завдань за цим вибором.</p>}
    {visible.map(task => {
      const due = deadlineDate(task, zone);
      const notice = classifyTaskTemporalNotice(task, reservations, actualTodayDate, new Date(nowMs).toISOString());
      const sessions = reservations.filter(r => r.taskId === task.id && r.state === 'active');
      const direction=directionFor(task,folders,projects);
      return <ItemCard key={task.id} hue={direction.hue} className="space-y-2">
        <h3 className="font-semibold break-words">{task.state === 'completed' ? '✓ Виконано: ' : ''}{task.title} {plan.focusTaskIds.includes(task.id) ? '★' : ''}</h3><p className="ui-item-meta">{direction.name} · {task.estimatedDurationMinutes ? `${formatDuration(task.estimatedDurationMinutes)} · ` : ''}{effortDots(task.effort)}</p>
        {due && <p>Термін: {formatUkrainianDateHeading(due)}{task.deadline?.kind === 'exact_instant' ? `, ${formatInstantInZone(task.deadline.instant, zone).localTime}` : ''}{notice.isDeadlineOverdue ? ' · Термін минув' : ''}</p>}
        <details><summary className="ui-pill">Деталі й редагування</summary><p>Дата без часу: {task.plannedDate ? formatUkrainianDateHeading(task.plannedDate) : 'Не задана'}</p>
        {notice.isPastPlannedDate && <p>Дата планування минула; справа залишається відкритою.</p>}
        {notice.isElapsedTimedPlanning && <p>Сеанси закінчилися; це не завершує справу.</p>}
        <p>Сеанси: {sessions.length} · Оцінка: {task.estimatedDurationMinutes === null ? 'Не задана' : `${formatDuration(task.estimatedDurationMinutes)}`}</p>
        <SelectField label={`Зусилля: ${task.title}`} value={task.effort ?? ''} options={[{ value: '', label: 'Не задані' }, ...Object.entries(EFFORT_LABELS_UK).map(([value, label]) => ({ value, label }))]} onChange={async e => { try { setError(''); await repositories.setTaskEffort(task.id, (e.target.value || null) as TaskEffort | null, task.revision); await onChanged(); } catch { setError('Не вдалося змінити зусилля. Оновіть дані й повторіть.'); } }} />
        </details>{task.state === 'open' && <details><summary>У вільне вікно</summary><div className="flex flex-wrap gap-2">{gaps.filter(gap => gap.endMs > nowMs && gap.durationMinutes >= (task.estimatedDurationMinutes ?? 15)).slice(0,3).map(gap => <Button key={gap.startInstant} onClick={async () => {try {const interval=sessionFromDuration(date,gap.startLocalTime,task.estimatedDurationMinutes ?? 15,zone);const fresh=(await repositories.captureCoherentSnapshot()).snapshot;const warning=detectScheduleConflicts({candidateStartInstant:interval.startInstant,candidateEndInstant:interval.endInstant,displayZone:zone,tasks:fresh.tasks,events:fresh.events,reservations:fresh.reservations});if(warning.hasConflicts) throw new Error('Вікно змінилося. Перегляньте розклад.');const now=new Date().toISOString();await repositories.saveReservationTransactionally({id:crypto.randomUUID(),taskId:task.id,interval,state:'active',releaseMetadata:null,createdAt:now,updatedAt:now,revision:1},undefined,task.revision);await onChanged();}catch {setError('Не вдалося зайняти вікно. Оновіть розклад.');}}}>{gap.startLocalTime} · {formatDuration(task.estimatedDurationMinutes ?? 15)}</Button>)}</div></details>}
        <div className="flex flex-wrap gap-2">{plan.minimalDay && task.state === 'open' && !task.deadline && <Button onClick={async () => {try {await repositories.setTaskDateOnlyPlanningTransactionally(task.id,null,new Date().toISOString(),task.revision);await repositories.saveDailyPlan(date,{...plan,focusTaskIds:plan.focusTaskIds.filter(id=>id!==task.id)},plan);await onChanged();}catch {setError('Не вдалося повернути справу до списку. Оновіть дані.');}}}>Повернути до списку</Button>}<Button onClick={() => onPlan(task)}>Дата й сеанси</Button><Button onClick={() => void onToggle(task.id)}>{task.state === 'completed' ? 'Відкрити знову' : 'Завершити'}</Button></div>
      </ItemCard>;
    })}
  </section>;
}
