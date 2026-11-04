import React, { useState } from 'react';
import { Folder, PlanningEntityState, RoadmapCheckpoint, RoadmapPeriod, RoadmapOwner, Task } from '../domain/types';
import { RoadmapItem, RoadmapSource, projectRoadmap, periodLabelUk, dateLabelUk, roadmapWarnings, periodInterval } from '../domain/roadmap';
import { addDaysToLocalDate } from '../domain/temporal';
import { PlanuiRepositories } from '../storage/repositories';
import { Button, Card, InputField, SelectField } from '../components/ui/primitives';

const stateLabels: Record<PlanningEntityState, string> = { active: 'Активні', idea: 'Ідеї', paused: 'На паузі', completed: 'Завершені' };
const kindLabels = { goal: 'Ціль', project: 'Проєкт', stage: 'Етап' };

export function RoadmapItemEditor({ item, repositories, onChanged, onCancel, relatedItems = [], relatedTasks = [] }: { item: RoadmapItem; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; onCancel: () => void; relatedItems?: RoadmapItem[]; relatedTasks?: readonly Task[] }) {
  const period = item.record.roadmapPeriod;
  const [precision, setPrecision] = useState(period?.precision ?? 'undated');
  const [month, setMonth] = useState(period?.precision === 'month' ? period.month : '');
  const [year, setYear] = useState(period?.precision === 'quarter' ? String(period.year) : '');
  const [quarter, setQuarter] = useState(period?.precision === 'quarter' ? String(period.quarter) : '1');
  const [start, setStart] = useState(period?.precision === 'range' ? period.startDate : '');
  const [end, setEnd] = useState(period?.precision === 'range' ? addDaysToLocalDate(period.endDateExclusive, -1) : '');
  const [deadline, setDeadline] = useState(item.deadline ?? '');
  const [points, setPoints] = useState<RoadmapCheckpoint[]>([...(item.record.checkpoints ?? [])].sort((a, b) => a.order - b.order));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function draftPeriod(): RoadmapPeriod | null {
    if (precision === 'month') return { precision, month };
    if (precision === 'quarter') return { precision, year: Number(year), quarter: Number(quarter) as 1 | 2 | 3 | 4 };
    if (precision === 'range') return { precision, startDate: start, endDateExclusive: addDaysToLocalDate(end, 1) };
    return null;
  }
  let warnings: string[] = [];
  try {
    const preview: RoadmapItem = { ...item, deadline: deadline || null, record: { ...item.record, roadmapPeriod: draftPeriod(), checkpoints: points } };
    if (preview.record.roadmapPeriod) periodInterval(preview.record.roadmapPeriod);
    const related = [...relatedItems.filter(i => i.owner.kind !== item.owner.kind || i.owner.id !== item.owner.id), preview];
    warnings = related.filter(i => (i.owner.kind === preview.owner.kind && i.owner.id === preview.owner.id) || (i.parent?.kind === preview.owner.kind && i.parent.id === preview.owner.id)).flatMap(i => roadmapWarnings(i, related, relatedTasks).map(w => `${i.title}: ${w}`));
  } catch { /* Incomplete input is validated on submit. */ }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const roadmapPeriod = draftPeriod();
      if (roadmapPeriod) periodInterval(roadmapPeriod);
      await repositories.updateRoadmapItem(item.owner, { roadmapPeriod, deadline: deadline || null, checkpoints: points.map((c, order) => ({ ...c, order })) }, item.record.revision);
      await onChanged(); onCancel();
    } catch { setError('Не вдалося зберегти. Перевірте дати, порядок меж і назви контрольних точок. Якщо запис змінився, закрийте форму та відкрийте знову.'); }
    finally { setBusy(false); }
  }
  return <form className="space-y-3 min-w-0" onSubmit={save} aria-label={`Дати: ${item.title}`}>
    <h4 className="font-semibold">{item.title}</h4>
    <SelectField label="Точність планування" value={precision} onChange={e => setPrecision(e.target.value as typeof precision)} options={[{ value: 'undated', label: 'Без періоду' }, { value: 'month', label: 'Місяць' }, { value: 'quarter', label: 'Квартал' }, { value: 'range', label: 'Діапазон дат' }]} />
    {precision === 'month' && <InputField label="Місяць" type="month" required value={month} onChange={e => setMonth(e.target.value)} />}
    {precision === 'quarter' && <div className="grid grid-cols-2 gap-2"><InputField label="Рік" type="number" min="1" max="9998" required value={year} onChange={e => setYear(e.target.value)} /><SelectField label="Квартал" value={quarter} onChange={e => setQuarter(e.target.value)} options={[1, 2, 3, 4].map(q => ({ value: String(q), label: `${q} квартал` }))} /></div>}
    {precision === 'range' && <div className="grid sm:grid-cols-2 gap-2"><InputField label="Початок" type="date" required value={start} onChange={e => setStart(e.target.value)} /><InputField label="Останній день (включно)" type="date" required value={end} onChange={e => setEnd(e.target.value)} /></div>}
    <InputField label="Термін завершення" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} hint="Окремо від приблизного періоду. Час для роботи планується окремо у справі." />
    <fieldset className="space-y-3"><legend className="font-semibold">Контрольні точки</legend>
      {points.map((point, index) => <div key={point.id} className="space-y-2 border rounded-xl p-3">
        <InputField label={`Назва точки ${index + 1}`} required value={point.title} onChange={e => setPoints(points.map(c => c.id === point.id ? { ...c, title: e.target.value } : c))} />
        <InputField label={`Дата точки ${index + 1} (необов’язково)`} type="date" value={point.localDate ?? ''} onChange={e => setPoints(points.map(c => c.id === point.id ? { ...c, localDate: e.target.value || null } : c))} />
        <div className="flex flex-wrap gap-2"><Button disabled={index === 0} aria-label={`Вище: ${point.title}`} onClick={() => { const next = [...points]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setPoints(next); }}>Вище</Button><Button disabled={index === points.length - 1} aria-label={`Нижче: ${point.title}`} onClick={() => { const next = [...points]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setPoints(next); }}>Нижче</Button><Button onClick={() => setPoints(points.filter(c => c.id !== point.id))}>Прибрати точку</Button></div>
      </div>)}
      <Button onClick={() => setPoints([...points, { id: crypto.randomUUID(), title: '', localDate: null, order: points.length }])}>Додати контрольну точку</Button>
    </fieldset>
    <p className="text-sm">Зміна дат не переносить інші етапи, терміни справ, бронювання, події чи зміни.</p>
    {warnings.length > 0 && <div role="status"><p className="font-semibold">Перевірте узгодженість плану:</p><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><p>Пов’язані елементи можна відкрити в напрямах і змінити окремо.</p></div>}
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={busy}>Зберегти дати</Button><Button disabled={busy} onClick={onCancel}>Скасувати</Button></div>
  </form>;
}

export function RoadmapView({ source, repositories, onChanged, initialOwner = null, onInspect }: { source: RoadmapSource; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; initialOwner?: RoadmapOwner | null; onInspect?: (owner: RoadmapOwner) => void }) {
  const [states, setStates] = useState<PlanningEntityState[]>(['active']);
  const [editing, setEditing] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');
  const all = projectRoadmap(source, ['active', 'idea', 'paused', 'completed']);
  const items = projectRoadmap(source, states).filter(i => !initialOwner || (i.owner.kind === initialOwner.kind && i.owner.id === initialOwner.id) || (i.parent?.kind === initialOwner.kind && i.parent.id === initialOwner.id) || (initialOwner.kind === 'goal' && i.owner.kind === 'stage' && source.projects.some(p => p.goalId === initialOwner.id && p.id === i.parent?.id && i.parent.kind === 'project')));
  const detailOrder: string[] = [];
  const addOwner = (owner: RoadmapOwner) => {
    detailOrder.push(owner.kind + ':' + owner.id);
    for (const stage of [...source.stages].filter(s => owner.kind === 'goal' ? s.goalId === owner.id : s.projectId === owner.id).sort((a, b) => a.order - b.order)) detailOrder.push('stage:' + stage.id);
  };
  if (initialOwner) {
    addOwner(initialOwner);
    if (initialOwner.kind === 'goal') for (const project of source.projects.filter(p => p.goalId === initialOwner.id)) addOwner({ kind: 'project', id: project.id });
  }
  const ordered = [...items].sort((a, b) => {
    if (initialOwner) return detailOrder.indexOf(a.owner.kind + ':' + a.owner.id) - detailOrder.indexOf(b.owner.kind + ':' + b.owner.id);
    const date = (i: RoadmapItem) => i.record.roadmapPeriod ? periodInterval(i.record.roadmapPeriod).startDate : i.deadline ?? '9999-99-99';
    return date(a).localeCompare(date(b));
  });
  async function action(work: () => Promise<unknown>) { try { setError(''); await work(); await onChanged(); } catch { setError('Не вдалося змінити етапи. Оновіть дані та спробуйте знову.'); } }
  const groups = new Map<string | null, RoadmapItem[]>();
  for (const item of ordered) { const group = groups.get(item.folderId) ?? []; group.push(item); groups.set(item.folderId, group); }
  return <Card className="space-y-4" data-testid="roadmap">
    <h2 className="text-xl font-bold">Дорожня карта{initialOwner ? ': деталі плану' : ': усі напрями'}</h2>
    <p className="text-sm">Періоди та контрольні точки інформаційні й не займають години. Ідеї показуються лише за вибраним фільтром.</p>
    <fieldset className="flex flex-wrap gap-3"><legend>Показати стани</legend>{(Object.keys(stateLabels) as PlanningEntityState[]).map(state => <label key={state} className="min-h-[44px] flex items-center gap-2"><input type="checkbox" checked={states.includes(state)} onChange={() => setStates(states.includes(state) ? states.filter(s => s !== state) : [...states, state])} />{stateLabels[state]}</label>)}</fieldset>
    {error && <p role="alert">{error}</p>}
    {items.length === 0 && <p>Немає планів за обраними станами. Плани без дат також будуть тут.</p>}
    {[...groups].map(([folderId, group]) => <section key={folderId ?? 'none'} className="space-y-3"><h3 className="font-semibold">{directionPath(source.folders ?? [], folderId)}</h3>
      {group.map(item => {
        const key = `${item.owner.kind}:${item.owner.id}`;
        const warnings = roadmapWarnings(item, all, source.tasks);
        const siblings = all.filter(i => i.owner.kind === 'stage' && i.parent?.kind === item.parent?.kind && i.parent?.id === item.parent?.id).sort((a, b) => ('order' in a.record ? a.record.order : 0) - ('order' in b.record ? b.record.order : 0));
        const index = siblings.findIndex(s => s.owner.id === item.owner.id);
        return <article key={key} className="border rounded-xl p-3 space-y-2 min-w-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <h4 className="font-semibold break-words">{kindLabels[item.owner.kind]}: {item.title}</h4>
          {item.parent && <p className="text-sm">Належить: {all.find(i => i.owner.kind === item.parent!.kind && i.owner.id === item.parent!.id)?.title ?? 'План'}</p>}
          <p>{periodLabelUk(item.record.roadmapPeriod)} · {stateLabels[item.state]}</p>
          {item.owner.kind === 'goal' && (item.record as import('../domain/types').Goal).timing?.targetPeriodUk && <p>Попередній опис періоду: {(item.record as import('../domain/types').Goal).timing?.targetPeriodUk}</p>}
          <p>Термін: {item.deadline ? dateLabelUk(item.deadline) : 'Не задано'}</p>
          <ul>{[...(item.record.checkpoints ?? [])].sort((a, b) => a.order - b.order).map(c => <li key={c.id}>◇ {c.title}: {c.localDate ? dateLabelUk(c.localDate) : 'Без дати'}</li>)}</ul>
          {warnings.map((w, n) => <p role="status" key={n}>{w} Перевірте пов’язані елементи нижче або відкрийте їх у напрямах.</p>)}
          {editing === key ? <RoadmapItemEditor item={item} relatedItems={all} relatedTasks={source.tasks} repositories={repositories} onChanged={onChanged} onCancel={() => setEditing(null)} /> : <div className="flex flex-wrap gap-2"><Button onClick={() => setEditing(key)}>Змінити дати й точки</Button>{onInspect && <Button onClick={() => onInspect(item.owner.kind === 'stage' ? item.parent! : item.owner)}>Відкрити план</Button>}</div>}
          {item.owner.kind === 'stage' && item.parent && <div className="flex flex-wrap gap-2">{[-1, 1].map(delta => <Button key={delta} disabled={index + delta < 0 || index + delta >= siblings.length} aria-label={`${delta < 0 ? 'Вище' : 'Нижче'}: ${item.title}`} onClick={() => action(async () => { const ids = siblings.map(s => s.owner.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; await repositories.reorderRoadmapStages(item.parent as { kind: 'goal' | 'project'; id: string }, ids); })}>{delta < 0 ? 'Етап вище' : 'Етап нижче'}</Button>)}</div>}
        </article>;
      })}
    </section>)}
    {initialOwner && initialOwner.kind !== 'stage' && <form className="space-y-2" onSubmit={e => { e.preventDefault(); void action(async () => { const now = new Date().toISOString(); await repositories.saveStage({ id: crypto.randomUUID(), projectId: initialOwner.kind === 'project' ? initialOwner.id : null, goalId: initialOwner.kind === 'goal' ? initialOwner.id : null, title: newTitle, expectedOutcome: null, targetDate: null, order: source.stages.length, createdAt: now, updatedAt: now, revision: 1 }); setNewTitle(''); }); }}><InputField label="Назва нового етапу" required value={newTitle} onChange={e => setNewTitle(e.target.value)} /><Button type="submit">Створити етап</Button></form>}
  </Card>;
}

function directionPath(folders: readonly Folder[], id: string | null): string {
  const names: string[] = []; const seen = new Set<string>();
  while (id && !seen.has(id)) { seen.add(id); const folder = folders.find(f => f.id === id); if (!folder) break; names.unshift(folder.name); id = folder.parentId; }
  return names.join(' / ') || 'Без напряму';
}
