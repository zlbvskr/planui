import { projectPlanningReview } from '../../domain/lifeAreas';
import React, { useState } from 'react';
import { PlanuiDomainSnapshot, Project } from '../../domain/types';
import { addDaysToLocalDate, formatInstantInZone, formatUkrainianDateHeading } from '../../domain/temporal';
import { Button, Card, InputField } from '../ui/primitives';

export function PlanningReviewPanel({ snapshot, zone, today, initiallyOpen, onOpenPlan, onPause, onInspectEvent, onPlanTask }: { snapshot: PlanuiDomainSnapshot; zone: string; today: string; initiallyOpen?: boolean; onOpenPlan: (kind: 'goal' | 'project', id: string) => void; onPause: (project: Project) => void; onInspectEvent: (id: string) => void; onPlanTask: (id: string, reservationId?: string) => void }) {
  const [start, setStart] = useState(today), [end, setEnd] = useState(addDaysToLocalDate(today, 13));
  let projection: ReturnType<typeof projectPlanningReview> | null = null;
  try { projection = projectPlanningReview(snapshot, start, end, zone); } catch { /* Invalid period is never swapped. */ }
  return <Card><details open={initiallyOpen || undefined}>
    <summary className="font-semibold min-h-[44px] cursor-pointer">Короткий огляд планування</summary>
    <div className="space-y-3 pt-2">
      <p>Ручна коротка перевірка плану. Звіту, повторюваного завдання чи сповіщень не потрібно. Відповіді на огляд не змінюють розклад.</p>
      <div className="grid sm:grid-cols-2 gap-2"><InputField label="Планування від" type="date" value={start} onChange={e => setStart(e.target.value)} /><InputField label="До (включно)" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
      {!projection ? <p role="alert">Перевірте період. Кінець не може бути раніше початку.</p> : <>
        <h3 className="font-semibold">Майбутні зміни й зобов’язання</h3>
        <ul className="space-y-2">{projection.events.map(event => <li key={event.id}>{event.title} · {event.schedule.kind === 'timed' ? `${formatUkrainianDateHeading(formatInstantInZone(event.schedule.interval.startInstant, zone).localDate)}, ${formatInstantInZone(event.schedule.interval.startInstant, zone).localTime} – ${formatUkrainianDateHeading(formatInstantInZone(event.schedule.interval.endInstant, zone).localDate)}, ${formatInstantInZone(event.schedule.interval.endInstant, zone).localTime}` : `Увесь день: ${formatUkrainianDateHeading(event.schedule.startLocalDate)} – ${formatUkrainianDateHeading(addDaysToLocalDate(event.schedule.endLocalDateExclusive, -1))}`} · {event.type === 'work_shift' ? 'Робоча зміна' : event.type === 'rest' || event.type === 'sleep' ? 'Відновлення' : 'Подія'}{!event.isBlocking ? ' · Не блокує час' : ''}<Button size="sm" onClick={() => onInspectEvent(event.id)}>Переглянути подію</Button></li>)}{projection.reservations.map(reservation => <li key={reservation.id}>{snapshot.tasks.find(t => t.id === reservation.taskId)?.title ?? (reservation.habitOccurrence ? 'Сеанс звички' : 'Запланована дія')}: {formatUkrainianDateHeading(formatInstantInZone(reservation.interval.startInstant, zone).localDate)}, {formatInstantInZone(reservation.interval.startInstant, zone).localTime}{reservation.taskId && <Button size="sm" onClick={() => onPlanTask(reservation.taskId!, reservation.id)}>Переглянути вибраний резерв</Button>}</li>)}{projection.datedTasks.map(task => <li key={task.id}>{task.title} · Дата або термін<Button size="sm" onClick={() => onPlanTask(task.id)}>Переглянути планування</Button></li>)}</ul>
        <h3 className="font-semibold">Простір для відновлення</h3>
        <p>Незайнято у вказаному періоді: {Math.round(projection.availability.totalUnoccupiedMinutes)} хв. Вільний час не означає, що його потрібно заповнити або що ви маєте енергію працювати.</p>
        <p>Чи достатньо місця для відпочинку? Події відновлення додаються лише вручну у календарі.</p>
      </>}
      <h3 className="font-semibold">Поточні цілі</h3>
      {snapshot.goals.filter(g => g.state === 'active' && !g.archived).map(g => <div key={g.id}><Button variant="subtle" onClick={() => onOpenPlan('goal', g.id)}>{g.title}</Button></div>)}
      <h3 className="font-semibold">Що можна скоротити або поставити на паузу?</h3>
      {snapshot.projects.filter(p => p.state === 'active' && !p.archived).map(p => <div key={p.id} className="flex flex-wrap items-center gap-2"><span className="break-words">{p.title}</span><Button onClick={() => onOpenPlan('project', p.id)}>Скоротити обсяг: відкрити проєкт</Button><Button onClick={() => onPause(p)}>Переглянути паузу</Button></div>)}
    </div>
  </details></Card>;
}
