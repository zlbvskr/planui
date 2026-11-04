import { Surface, Sheet } from '../ui/design';
import React, { useState } from 'react';
import { DailyPlan, Task, TaskReservation } from '../../domain/types';
import { suggestFocusTasks } from '../../domain/today';
import { PlanuiRepositories } from '../../storage/repositories';
import { Button, InputField, TextAreaField } from '../ui/primitives';

export function DailyFocusPanel({ date, zone, plan, tasks, reservations, repositories, onChanged, isOpen, onClose }: { date: string; zone: string; plan: DailyPlan; tasks: readonly Task[]; reservations: readonly TaskReservation[]; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; isOpen: boolean; onClose: () => void }) {
  const [ids, setIds] = useState([...plan.focusTaskIds]);
  const [note, setNote] = useState(plan.focusNoteUk ?? '');
  const [minimal, setMinimal] = useState(plan.minimalDay);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function closeEditor() { setIds([...plan.focusTaskIds]); setNote(plan.focusNoteUk ?? ''); setMinimal(plan.minimalDay); setError(''); onClose(); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await repositories.saveDailyPlan(date, { focusTaskIds: ids, focusNoteUk: note.trim() || null, minimalDay: minimal }, plan); await onChanged(); onClose(); }
    catch { setError('Не вдалося зберегти фокус. Дані могли змінитися; оновіть сторінку й повторіть.'); }
    finally { setBusy(false); }
  }
  return <>
    {(plan.focusNoteUk || plan.focusTaskIds.length > 0) && <Surface className="today-focus" data-testid="today-daily-focus">
    <h2 className="font-semibold">Фокус дня</h2>
    {plan.focusNoteUk && <p className="whitespace-pre-wrap break-words">{plan.focusNoteUk}</p>}
    <ul>{plan.focusTaskIds.map(id => { const task = tasks.find(t => t.id === id); return <li key={id}>{task ? `${task.state === 'completed' ? '✓ ' : ''}${task.title}` : 'Справа більше недоступна'}</li>; })}</ul>
    </Surface>}
    <Sheet title="Фокус дня" isOpen={isOpen} onClose={closeEditor} isDirty={JSON.stringify(ids) !== JSON.stringify(plan.focusTaskIds) || note !== (plan.focusNoteUk ?? '') || minimal !== plan.minimalDay}>
      <form onSubmit={save} className="space-y-3 pt-2">
        <p>Оберіть 1–3 справи для фокусу, якщо це корисно. Можна обрати більше або жодної.</p>
        <div className="space-y-1"><p>Можливі кроки з датованих справ. Це пропозиція, а не обов’язок:</p>{suggestFocusTasks(tasks, reservations, date, zone).filter(task => !ids.includes(task.id)).map(task => <Button key={task.id} onClick={() => setIds([...ids, task.id])}>Додати до фокусу: {task.title}</Button>)}</div>
        <TextAreaField label="Головний намір (необов’язково)" value={note} onChange={e => setNote(e.target.value)} />
        <InputField label="Знайти справу для фокусу" value={query} onChange={e => setQuery(e.target.value)} />
        <fieldset className="max-h-72 overflow-y-auto space-y-1"><legend>Що залишити у фокусі</legend>
          {tasks.filter(t => t.state !== 'canceled' && (ids.includes(t.id) || (t.state === 'open' && t.title.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk'))))).map(task => <label key={task.id} className="min-h-[44px] flex items-center gap-2"><input type="checkbox" checked={ids.includes(task.id)} onChange={() => setIds(ids.includes(task.id) ? ids.filter(id => id !== task.id) : [...ids, task.id])} /><span className="break-words">{task.title}</span></label>)}
        </fieldset>
        <label className="min-h-[44px] flex items-center gap-2"><input type="checkbox" checked={minimal} onChange={e => setMinimal(e.target.checked)} />Мінімальний день</label>
        <p>Це допомагає спростити план, а не стерти зобов’язання. Залишається не більше одного малого кроку з фокусу без терміну й сеансу. Терміни, робота, події та зайнятий час залишаються видимими. Пріоритет не визначає обов’язковість. Розклад не змінюється.</p>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy} variant="primary">Зберегти фокус і вигляд дня</Button>
      </form>
    </Sheet>
  </>;
}
