import { classifyTaskTemporalNotice } from '../../domain/plans';
import React, { useState } from 'react';
import { DailyPlan, Task, TaskEffort, TaskReservation } from '../../domain/types';
import { deadlineDate, EFFORT_LABELS_UK, projectTodayTasks } from '../../domain/today';
import { formatUkrainianDateHeading, formatInstantInZone } from '../../domain/temporal';
import { PlanuiRepositories } from '../../storage/repositories';
import { Button, Card, SelectField } from '../ui/primitives';

export function TodayTasksPanel({ date, actualTodayDate, nowMs, zone, plan, tasks, reservations, repositories, onChanged, onToggle, onPlan }: { date: string; actualTodayDate: string; nowMs: number; zone: string; plan: DailyPlan; tasks: readonly Task[]; reservations: readonly TaskReservation[]; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; onToggle: (id: string) => Promise<void> | void; onPlan: (task: Task) => void }) {
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const projection = projectTodayTasks(tasks, reservations, date, zone, plan);
  const visible = all ? tasks.filter(t => t.state !== 'canceled') : projection.visible;
  return <Card className="space-y-3" data-testid="today-tasks-mode">
    <div className="flex flex-wrap gap-2 items-center"><h2 className="font-semibold">{all ? 'Загальний список завдань' : 'Завдання обраного дня'}</h2><Button aria-pressed={all} onClick={() => setAll(!all)}>{all ? 'Повернутися до дня' : 'Відкрити загальний список'}</Button></div>
    {!all && projection.hiddenCount > 0 && <p>Мінімальний день: приховано {projection.hiddenCount} справ без термінів і сеансів. Загальний список доступний без зміни даних.</p>}
    <p className="text-sm">Термін, призначення на дату, сеанси й оцінка тривалості є окремими даними. Заплановані хвилини не є обліком виконаної роботи.</p>
    {error && <p role="alert">{error}</p>}
    {visible.length === 0 && <p>Немає завдань за цим вибором.</p>}
    {visible.map(task => {
      const due = deadlineDate(task, zone);
      const notice = classifyTaskTemporalNotice(task, reservations, actualTodayDate, new Date(nowMs).toISOString());
      const sessions = reservations.filter(r => r.taskId === task.id && r.state === 'active');
      return <article key={task.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="font-semibold break-words">{task.state === 'completed' ? '✓ Виконано: ' : ''}{task.title}</h3>
        {due && <p>Термін: {formatUkrainianDateHeading(due)}{task.deadline?.kind === 'exact_instant' ? `, ${formatInstantInZone(task.deadline.instant, zone).localTime}` : ''}{notice.isDeadlineOverdue ? ' · Термін минув' : ''}</p>}
        <p>Дата без часу: {task.plannedDate ? formatUkrainianDateHeading(task.plannedDate) : 'Не задана'}</p>
        {notice.isPastPlannedDate && <p>Дата планування минула; справа залишається відкритою.</p>}
        {notice.isElapsedTimedPlanning && <p>Сеанси закінчилися; це не завершує справу.</p>}
        <p>Сеанси: {sessions.length} · Оцінка: {task.estimatedDurationMinutes === null ? 'Не задана' : `${task.estimatedDurationMinutes} хв`}</p>
        <SelectField label={`Зусилля: ${task.title}`} value={task.effort ?? ''} options={[{ value: '', label: 'Не задані' }, ...Object.entries(EFFORT_LABELS_UK).map(([value, label]) => ({ value, label }))]} onChange={async e => { try { setError(''); await repositories.setTaskEffort(task.id, (e.target.value || null) as TaskEffort | null, task.revision); await onChanged(); } catch { setError('Не вдалося змінити зусилля. Оновіть дані й повторіть.'); } }} />
        <div className="flex flex-wrap gap-2"><Button onClick={() => onPlan(task)}>Дата й сеанси</Button><Button onClick={() => void onToggle(task.id)}>{task.state === 'completed' ? 'Відкрити знову' : 'Завершити'}</Button></div>
      </article>;
    })}
  </Card>;
}
