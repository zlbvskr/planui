import React, { useState } from 'react';
import { CalendarEvent, Task, TaskReservation } from '../../domain/types';
import { PlanningChangePreview, previewPlanningChange, sessionFromDuration } from '../../domain/today';
import { formatInstantInZone, formatUkrainianDateHeading } from '../../domain/temporal';
import { detectScheduleConflicts } from '../../domain/scheduling';
import { PlanuiRepositories } from '../../storage/repositories';
import { Button, InputField, ModalSheet } from '../ui/primitives';

export function TaskPlanningSheet({ task, date, zone, tasks, events, reservations, repositories, initialReservationId, onClose, onSaved }: { task: Task; date: string; zone: string; tasks: readonly Task[]; events: readonly CalendarEvent[]; reservations: readonly TaskReservation[]; repositories: PlanuiRepositories; initialReservationId?: string; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const original = reservations.find(r => r.id === initialReservationId);
  const initialStart = original ? formatInstantInZone(original.interval.startInstant, zone) : null;
  const [editing, setEditing] = useState<TaskReservation | null>(original ?? null);
  const [startDate, setStartDate] = useState(initialStart?.localDate ?? date);
  const [startTime, setStartTime] = useState(initialStart?.localTime ?? '09:00');
  const [duration, setDuration] = useState(original ? String((Date.parse(original.interval.endInstant) - Date.parse(original.interval.startInstant)) / 60000) : '30');
  const [assignedDate, setAssignedDate] = useState(task.plannedDate ?? date);
  const [preview, setPreview] = useState<PlanningChangePreview | null>(null);
  const [cancel, setCancel] = useState<{ reservation: TaskReservation; nowIso: string } | null>(null);
  const [overlap, setOverlap] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  let interval: ReturnType<typeof sessionFromDuration> | null = null;
  try { interval = sessionFromDuration(startDate, startTime, Number(duration), zone); } catch { /* The form reports invalid input on save. */ }
  const conflict = interval ? detectScheduleConflicts({ candidateStartInstant: interval.startInstant, candidateEndInstant: interval.endInstant, displayZone: zone, tasks, events, reservations, excludeReservationId: editing?.id }) : null;
  function label(instant: string): string { const wall = formatInstantInZone(instant, zone); return `${formatUkrainianDateHeading(wall.localDate)}, ${wall.localTime}:${String(wall.second).padStart(2, '0')}`; }
  async function act(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); await onSaved(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не вдалося змінити планування.'); }
    finally { setBusy(false); }
  }
  return <ModalSheet isOpen title={`Планування: ${task.title}`} isDirty={dirty} onClose={onClose}>
    <div className="space-y-4">
      <p>Термін та оцінка тривалості справи не змінюються. Історія сеансів зберігається. Дати й час показано в часовому поясі {zone}.</p>
      {error && <p role="alert">{error}</p>}
      <section className="space-y-2"><h3 className="font-semibold">Дата без часу / повернення до загального списку</h3>
        <InputField label="Призначити на дату" type="date" value={assignedDate} onChange={e => { setAssignedDate(e.target.value); setPreview(null); setDirty(true); }} />
        <div className="flex flex-wrap gap-2"><Button disabled={!assignedDate || busy} onClick={() => { setPreview(previewPlanningChange(task, reservations, assignedDate, new Date().toISOString())); setCancel(null); }}>Переглянути зміну дати</Button><Button disabled={busy} onClick={() => { setPreview(previewPlanningChange(task, reservations, null, new Date().toISOString())); setCancel(null); }}>Повернути без дати: переглянути зміни</Button></div>
        {preview && <div role="status" className="rounded-xl border p-3 space-y-2">
          <p>Дата без часу: {preview.previousDate ? formatUkrainianDateHeading(preview.previousDate) : 'Не задана'} → {preview.nextDate ? formatUkrainianDateHeading(preview.nextDate) : 'Без дати, у загальному списку'}.</p>
          <p>Зміни сеансів станом на {label(preview.nowIso)}:</p>
          <ul>{preview.sessions.map(s => <li key={s.id}>{label(s.start)} – {label(s.end)}: {s.action === 'release_future' ? 'Звільнити майбутній резерв, зберегти запис в історії.' : s.action === 'truncate_current' ? `Звільнити решту після ${label(preview.nowIso)}, зберегти минулу частину й початкові межі.` : 'Зберегти минулий інтервал, позначити як зняте планування в історії.'}</li>)}</ul>
          {preview.sessions.length === 0 && <p>Резерви не змінюються.</p>}
          <p>Термін, стан виконання, події та робочі зміни не змінюються. Перенесення на завтра не відбувається.</p>
          <Button disabled={busy} variant="primary" onClick={() => void act(() => repositories.setTaskDateOnlyPlanningTransactionally(preview.taskId, preview.nextDate, preview.nowIso, preview.taskRevision, Object.fromEntries(preview.sessions.map(s => [s.id, s.revision]))))}>Підтвердити ці зміни</Button>
          <Button disabled={busy} onClick={() => setPreview(null)}>Скасувати зміну</Button>
        </div>}
      </section>
      <section className="space-y-2"><h3 className="font-semibold">Сеанси та історія</h3>
        {reservations.filter(r => r.taskId === task.id).map(r => <div key={r.id} className="border rounded-xl p-2 space-y-1">
          <p>{label(r.interval.startInstant)} – {label(r.interval.endInstant)} · {r.state === 'released' ? 'Зняте планування / історія' : r.state === 'canceled' ? 'Скасовано' : Date.parse(r.interval.endInstant) <= Date.now() ? 'Минулий сеанс' : Date.parse(r.interval.startInstant) <= Date.now() ? 'Поточний сеанс' : 'Майбутній сеанс'}</p>
          {r.state === 'active' && Date.parse(r.interval.startInstant) > Date.now() && task.state === 'open' && <Button disabled={busy} onClick={() => { const start = formatInstantInZone(r.interval.startInstant, zone); setEditing(r); setStartDate(start.localDate); setStartTime(start.localTime); setDuration(String((Date.parse(r.interval.endInstant) - Date.parse(r.interval.startInstant)) / 60000)); setOverlap(false); }}>Змінити сеанс</Button>}
          {r.state === 'active' && Date.parse(r.interval.endInstant) > Date.now() && <Button disabled={busy} onClick={() => { setCancel({ reservation: r, nowIso: new Date().toISOString() }); setPreview(null); }}>Скасувати резерв: переглянути</Button>}
        </div>)}
        {cancel && <div role="status" className="border rounded-xl p-3 space-y-2"><p>{label(cancel.reservation.interval.startInstant)} – {label(cancel.reservation.interval.endInstant)}: {Date.parse(cancel.reservation.interval.startInstant) < Date.parse(cancel.nowIso) ? `звільнити решту після ${label(cancel.nowIso)}, минулу частину зберегти.` : 'звільнити майбутній резерв і зберегти запис в історії.'} Інші сеанси та термін не змінюються.</p><Button disabled={busy} onClick={() => void act(() => repositories.cancelSingleReservationTransactionally(cancel.reservation.id, 'release', cancel.nowIso, cancel.reservation.revision))}>Підтвердити скасування резерву</Button><Button onClick={() => setCancel(null)}>Залишити резерв</Button></div>}
      </section>
      {task.state === 'open' && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(async () => {
        if (!interval) throw new Error('Перевірте дату, час і додатну цілу тривалість. Неоднозначний або пропущений час потребує іншого часу початку.');
        const fresh = (await repositories.captureCoherentSnapshot()).snapshot;
        if (fresh.tasks.find(t => t.id === task.id)?.state !== 'open') throw new Error('Справа вже не відкрита. Оновіть дані.');
        const conflicts = detectScheduleConflicts({ candidateStartInstant: interval.startInstant, candidateEndInstant: interval.endInstant, displayZone: zone, tasks: fresh.tasks, events: fresh.events, reservations: fresh.reservations, excludeReservationId: editing?.id });
        if (conflicts.hasConflicts && !overlap) throw new Error('Є накладання. Перегляньте розклад і явно підтвердіть його.');
        const nowIso = new Date().toISOString();
        if (editing) {
          if (Date.parse(editing.interval.startInstant) <= Date.parse(nowIso)) throw new Error('Сеанс уже почався. Його минула частина зберігається; можна скасувати решту резерву.');
          await repositories.rescheduleReservationTransactionally(editing.id, interval, nowIso, editing.revision);
        } else await repositories.saveReservationTransactionally({ id: crypto.randomUUID(), taskId: task.id, interval, state: 'active', releaseMetadata: null, createdAt: nowIso, updatedAt: nowIso, revision: 1 }, undefined, fresh.tasks.find(t => t.id === task.id)!.revision);
      }); }}>
        <h3 className="font-semibold">{editing ? 'Змінити обраний сеанс' : 'Додати окремий сеанс'}</h3>
        {editing && <Button onClick={() => { setEditing(null); setOverlap(false); }}>Додати ще один сеанс</Button>}
        <InputField label="Дата початку" type="date" required value={startDate} onChange={e => { setStartDate(e.target.value); setOverlap(false); setDirty(true); }} />
        <InputField label="Час початку" type="time" required value={startTime} onChange={e => { setStartTime(e.target.value); setOverlap(false); setDirty(true); }} />
        <InputField label="Запланована тривалість, хвилин" type="number" min="1" step="1" required value={duration} onChange={e => { setDuration(e.target.value); setOverlap(false); setDirty(true); }} />
        {interval && <p>Сеанс: {label(interval.startInstant)} – {label(interval.endInstant)} ({duration} хв). Часовий пояс: {zone}.</p>}
        {conflict?.hasConflicts && <div role="status"><p>{conflict.warningMessageUk}</p><ul>{conflict.conflicts.map((c, i) => <li key={i}>{c.title}: {c.displayRangeUk}</li>)}</ul><label className="min-h-[44px] flex gap-2 items-center"><input type="checkbox" checked={overlap} onChange={e => setOverlap(e.target.checked)} />Свідомо дозволяю це накладання</label></div>}
        <Button type="submit" variant="primary" disabled={busy}>Зберегти сеанс</Button>
      </form>}
    </div>
  </ModalSheet>;
}
