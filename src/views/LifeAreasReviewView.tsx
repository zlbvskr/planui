import { WeeklyReviewSheet } from '../components/today/WeeklyReviewSheet';
import { OptionalSlider } from '../components/ui/OptionalSlider';
import { PlanuiError } from '../i18n/errorsUk';
import React, { useEffect, useState } from 'react';
import { LifeAreaQuestion, PlanuiDomainSnapshot, Project, Task, RoadmapOwner } from '../domain/types';
import { STARTER_LIFE_AREAS, SATISFACTION_QUESTION_UK, ReviewAnswerDraft, LifeAreaLink, buildLifeReview, lifeAreaMergeSignature, projectLifeAreaLinks } from '../domain/lifeAreas';
import { updateLifeAreaQuestionWording } from '../domain/personalSpace';
import { addDaysToLocalDate, formatUkrainianDateHeading } from '../domain/temporal';
import { PlanuiRepositories } from '../storage/repositories';
import { Button, Card, InputField, ModalSheet, SelectField, TextAreaField } from '../components/ui/primitives';
import { PlanningReviewPanel } from '../components/today/PlanningReviewPanel';
import { TaskPlanningSheet } from '../components/today/TaskPlanningSheet';
import { RoadmapView } from './RoadmapView';

const EMPTY_ANSWER: ReviewAnswerDraft = { score: null, attentionNow: null, usefulChangeUk: null };
const KIND_UK = { inspiration: 'Матеріал', folder: 'Напрям', goal: 'Ціль', project: 'Проєкт', task: 'Завдання', habit: 'Звичка', event: 'Подія', reservation: 'Запланована дія' };

function AreaEditor({ area, repositories, onChanged }: { area: LifeAreaQuestion; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void }) {
  const [name, setName] = useState(area.questionTextUk), [definition, setDefinition] = useState(area.goodEnoughUk ?? ''), [archived, setArchived] = useState(!!area.archived), [error, setError] = useState('');
  return <form className="space-y-2" onSubmit={async e => { e.preventDefault(); try { const record = updateLifeAreaQuestionWording(area, name, new Date().toISOString()); await repositories.saveLifeAreaQuestion({ ...record, goodEnoughUk: definition || null, archived }, area.revision); await onChanged(); } catch { setError('Не вдалося змінити сферу. Перевірте назву й оновіть дані.'); } }}>
    <InputField label="Назва сфери" required value={name} onChange={e => setName(e.target.value)} />
    <TextAreaField label="Що для мене означає «достатньо добре» у цій сфері? (необов’язково)" value={definition} onChange={e => setDefinition(e.target.value)} />
    <label className="min-h-[44px] flex gap-2 items-center"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Приховати / архівувати сферу</label>
    <p>Історія та зв’язки зберігаються. Зміниться лише поточна назва або визначення.</p>
    {error && <p role="alert">{error}</p>}<Button type="submit">Зберегти сферу</Button>
  </form>;
}

export function LifeAreasReviewView({ snapshot, zone, today, repositories, onChanged, onOpenPlan, onInspectEvent, onModalStateChange, initialPlanningReview }: { snapshot: PlanuiDomainSnapshot; zone: string; today: string; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; onOpenPlan: (kind: 'goal' | 'project', id: string) => void; onInspectEvent: (id: string) => void; onModalStateChange?: (open: boolean) => void; initialPlanningReview?: boolean }) {
  const areas = [...snapshot.lifeAreaQuestions].sort((a, b) => a.order - b.order);
  const active = areas.filter(a => !a.archived && !a.mergedIntoId);
  const [start, setStart] = useState(addDaysToLocalDate(today,-13)), [end, setEnd] = useState(today);
  const [reviewRhythm,setReviewRhythm]=useState('14');
  const [reviewDirty, setReviewDirty] = useState(false);
  const [leavePlan, setLeavePlan] = useState<{ kind: 'goal' | 'project'; id: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewAnswerDraft>>({});
  const [areaId, setAreaId] = useState(active[0]?.id ?? areas[0]?.id ?? '');
  const [showHidden, setShowHidden] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [starterKey, setStarterKey] = useState(''), [mapping, setMapping] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [merge, setMerge] = useState<{ source: LifeAreaQuestion; target: LifeAreaQuestion; signature: string; links: LifeAreaLink[] } | null>(null);
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const [pause, setPause] = useState<Project | null>(null);
  const [linkId, setLinkId] = useState(''), [linkPreview, setLinkPreview] = useState<LifeAreaLink | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [planning, setPlanning] = useState<{ task: Task; reservationId?: string } | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapOwner | null>(null);
  const selected = areas.find(a => a.id === areaId && !a.mergedIntoId);
  const links = projectLifeAreaLinks(snapshot);
  const related = links.filter(link => link.effectiveId === areaId);
  const missing = STARTER_LIFE_AREAS.filter(([key]) => !areas.some(a => a.starterKeys?.includes(key)));
  const [lifeReviewOpen,setLifeReviewOpen]=useState(false);
  const [weeklyOpen,setWeeklyOpen]=useState(false);
  const modalOpen = lifeReviewOpen || weeklyOpen || !!(merge || pause || linkPreview || planning || leavePlan);
  useEffect(() => { onModalStateChange?.(modalOpen); return () => onModalStateChange?.(false); }, [modalOpen]);
  async function act(work: () => Promise<unknown>, close?: () => void) {
    setError(''); setBusy(true);
    try { await work(); await onChanged(); close?.(); } catch (e) { setError(e instanceof PlanuiError ? e.message : 'Не вдалося зберегти зміни. Оновіть дані й повторіть.'); } finally { setBusy(false); }
  }
  function openPlan(kind: 'goal' | 'project', id: string) { if (reviewDirty) setLeavePlan({ kind, id }); else onOpenPlan(kind, id); }
  function update(id: string, patch: Partial<ReviewAnswerDraft>) { setReviewDirty(true); setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? EMPTY_ANSWER), ...patch } })); }
  return <div className="space-y-4" data-testid="life-areas-review">
    <p>Сфери життя є редагованою рамкою для планування, а не валідованим психологічним тестом. Загальний бал життя й рейтинг сфер не обчислюються.</p>
    {error && <p role="alert">{error}</p>}
    <Button onClick={()=>setWeeklyOpen(true)}>Щотижневий огляд · 4 кроки</Button>
    {weeklyOpen && <WeeklyReviewSheet snapshot={snapshot} today={today} repositories={repositories} onClose={()=>setWeeklyOpen(false)} onOpenPlan={openPlan} onPause={setPause} onInspectEvent={onInspectEvent} onChanged={onChanged} />}
    <PlanningReviewPanel snapshot={snapshot} zone={zone} today={today} initiallyOpen={initialPlanningReview} onOpenPlan={openPlan} onPause={setPause} onInspectEvent={onInspectEvent} onPlanTask={(id, reservationId) => { const task = snapshot.tasks.find(t => t.id === id); if (task) setPlanning({ task, reservationId }); }} />
    <Card className="space-y-3"><details><summary className="font-semibold min-h-[44px] cursor-pointer">Налаштувати сфери та базову рамку</summary>
      <label className="flex gap-2 items-center min-h-[44px]"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />Показати приховані й об’єднані сфери</label>
      {areas.filter(a => showHidden || (!a.archived && !a.mergedIntoId)).map((area, index, visible) => <div key={area.id} className="border rounded-xl p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <details><summary className="min-h-[44px] cursor-pointer break-words">{area.questionTextUk}{area.mergedIntoId ? ' · Об’єднана' : area.archived ? ' · Прихована' : ''}</summary>{area.mergedIntoId ? <p>Ідентичність і історію збережено. Поточні зв’язки перенесені до «{areas.find(a => a.id === area.mergedIntoId)?.questionTextUk}».</p> : <AreaEditor key={`${area.id}:${area.revision}`} area={area} repositories={repositories} onChanged={onChanged} />}</details>
        {!area.mergedIntoId && <div className="flex flex-wrap gap-2">{[-1, 1].map(delta => <Button key={delta} disabled={busy || !visible[index + delta]} aria-label={`${delta < 0 ? 'Вище' : 'Нижче'}: ${area.questionTextUk}`} onClick={() => void act(async () => { const ids = areas.map(a => a.id), from = ids.indexOf(area.id), to = ids.indexOf(visible[index + delta].id); [ids[from], ids[to]] = [ids[to], ids[from]]; await repositories.reorderLifeAreas(ids, Object.fromEntries(areas.map(a => [a.id, a.revision]))); })}>{delta < 0 ? 'Вище' : 'Нижче'}</Button>)}</div>}
      </div>)}
      {missing.length > 0 && <div className="space-y-2 pt-3"><p>Відсутні елементи базової рамки можна додати або явно зіставити з власною сферою. Назви не порівнюються автоматично.</p>
        <SelectField label="Елемент базової рамки" value={starterKey} onChange={e => setStarterKey(e.target.value)} options={[{ value: '', label: 'Оберіть елемент' }, ...missing.map(([value, label]) => ({ value, label }))]} />
        <SelectField label="Додати чи зіставити" value={mapping} onChange={e => setMapping(e.target.value)} options={[{ value: '', label: 'Додати окрему сферу' }, ...areas.filter(a => !a.mergedIntoId).map(a => ({ value: a.id, label: `Зіставити: ${a.questionTextUk}` }))]} />
        <Button disabled={!starterKey || busy} onClick={() => void act(() => repositories.addOrMapStarterArea(starterKey, mapping || null), () => { setStarterKey(''); setMapping(''); })}>Підтвердити додавання або зіставлення</Button>
      </div>}
    </details></Card>
    <Button onClick={()=>setLifeReviewOpen(true)}>Новий огляд сфер життя</Button><ModalSheet isOpen={lifeReviewOpen} title="Огляд сфер життя" isDirty={reviewDirty} onClose={()=>setLifeReviewOpen(false)}>
      <SelectField label="Ритм огляду (днів)" value={reviewRhythm} options={[7,14,30].map(days=>({value:String(days),label:`Кожні ${days} днів`}))} onChange={event=>{setReviewRhythm(event.target.value);setStart(addDaysToLocalDate(today,1-Number(event.target.value)));setEnd(today);setReviewDirty(true);}} />
      <p>Ритм задає період поточного огляду; нагадування не створюються.</p>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void act(() => repositories.saveLifeAreaAssessment(buildLifeReview(crypto.randomUUID(), active, drafts, start, end, new Date().toISOString())), () => { setDrafts({}); setReviewDirty(false); }); }}>
        <fieldset disabled={busy} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-2"><InputField label="Початок періоду" type="date" required value={start} onChange={e => { setStart(e.target.value); setReviewDirty(true); }} /><InputField label="Кінець періоду (включно)" type="date" required value={end} onChange={e => { setEnd(e.target.value); setReviewDirty(true); }} /></div>
        <Button onClick={() => { setStart(addDaysToLocalDate(today, -13)); setEnd(today); setReviewDirty(true); }}>Запропонувати останні два тижні</Button>
        <p>Усі відповіді необов’язкові. «Без відповіді» відрізняється від 0, «Ні» та навмисно порожнього тексту.</p>
        {active.map(area => { const answer = drafts[area.id] ?? EMPTY_ANSWER; return <fieldset key={area.id} className="border rounded-xl p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}><legend className="font-semibold break-words">{area.questionTextUk}</legend>
          {area.goodEnoughUk && <p>Достатньо добре для мене: {area.goodEnoughUk}</p>}
          <OptionalSlider label={SATISFACTION_QUESTION_UK} max={10} value={answer.score} onChange={score => update(area.id, {score:score as ReviewAnswerDraft['score']})} />
          <SelectField label="Хочу приділити цій сфері увагу зараз?" value={answer.attentionNow === null ? '' : answer.attentionNow ? 'yes' : 'no'} options={[{ value: '', label: 'Без відповіді' }, { value: 'yes', label: 'Так' }, { value: 'no', label: 'Ні' }]} onChange={e => update(area.id, { attentionNow: e.target.value === '' ? null : e.target.value === 'yes' })} />
          <TextAreaField label="Одна потенційно корисна зміна" value={answer.usefulChangeUk ?? ''} onChange={e => update(area.id, { usefulChangeUk: e.target.value })} />
          <p>{answer.usefulChangeUk === null ? 'Без відповіді' : answer.usefulChangeUk === '' ? 'Відповідь залишено порожньою' : 'Відповідь додано'}</p><div className="flex flex-wrap gap-2"><Button onClick={() => update(area.id, { usefulChangeUk: null })}>Залишити зміну без відповіді</Button><Button onClick={() => update(area.id, { usefulChangeUk: '' })}>Позначити порожню відповідь</Button></div>
        </fieldset>; })}
        <Button type="submit" variant="primary" disabled={busy || active.length === 0}>Зберегти частковий або повний огляд</Button>
        <p>Збереження відповідей не змінює календар, справи, проєкти чи їхні оцінки автоматично.</p>

        </fieldset>
      </form>
    </ModalSheet>
    <Card className="space-y-3"><h2 className="font-semibold">Від огляду до явної дії</h2>
      <SelectField label="Сфера для перегляду зв’язків і наступного кроку" value={selected?.id ?? ''} onChange={e => { setAreaId(e.target.value); setMergeTarget(''); }} options={[{ value: '', label: 'Оберіть сферу' }, ...areas.filter(a => !a.mergedIntoId).map(a => ({ value: a.id, label: a.questionTextUk }))]} />
      {selected && <>
        <p>Прямий зв’язок має перевагу над успадкованим. Записи не копіюються.</p>
        <ul className="space-y-2">{related.map(link => <li key={`${link.kind}:${link.id}`} className="border-t py-2 space-y-1"><p>{KIND_UK[link.kind]}: {link.title} · {link.directId === areaId ? 'Прямий зв’язок' : 'Успадкований зв’язок'}</p>
          {(link.kind === 'goal' || link.kind === 'project') && <div className="flex flex-wrap gap-2"><Button onClick={() => setRoadmap({ kind: link.kind as 'goal' | 'project', id: link.id })}>Дорожня карта</Button><Button onClick={() => openPlan(link.kind as 'goal' | 'project', link.id)}>{link.kind === 'project' ? 'Скоротити обсяг: відкрити проєкт' : 'Відкрити ціль'}</Button>{link.kind === 'project' && snapshot.projects.find(p => p.id === link.id)?.state === 'active' && <Button onClick={() => setPause(snapshot.projects.find(p => p.id === link.id)!)}>Переглянути паузу</Button>}</div>}
          {(link.kind === 'task' || link.kind === 'reservation') && <Button onClick={() => { const task = snapshot.tasks.find(t => t.id === (link.taskId ?? link.id)); if (task) setPlanning({ task, reservationId: link.kind === 'reservation' ? link.id : undefined }); }}>Планування / звільнити вибраний майбутній час</Button>}
          {link.kind === 'event' && <Button onClick={() => onInspectEvent(link.id)}>Відкрити редактор події</Button>}
        </li>)}</ul>
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void act(() => repositories.saveTask({ id: crypto.randomUUID(), title: taskTitle.trim(), lifeAreaId: selected.id, description: null, state: 'open', priority: 'normal', deadline: null, estimatedDurationMinutes: null, planningState: 'unplanned', plannedDate: null, ownership: { kind: 'standalone', folderId: null }, checklist: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, canceledAt: null, revision: 1 }), () => setTaskTitle('')); }}><InputField label="Назва наступного завдання" required value={taskTitle} onChange={e => setTaskTitle(e.target.value)} /><Button type="submit" disabled={busy}>Створити наступне завдання без дати</Button></form>
        <SelectField label="Прив’язати наявний запис" value={linkId} onChange={e => setLinkId(e.target.value)} options={[{ value: '', label: 'Оберіть запис' }, ...links.filter(l => l.kind !== 'reservation').map(l => ({ value: `${l.kind}:${l.id}`, label: `${KIND_UK[l.kind]}: ${l.title}` }))]} />
        <Button disabled={!linkId || busy} onClick={() => setLinkPreview(links.find(l => `${l.kind}:${l.id}` === linkId) ?? null)}>Переглянути пряме прив’язування</Button>
        <SelectField label="Об’єднати поточну сферу з іншою" value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} options={[{ value: '', label: 'Оберіть цільову сферу' }, ...active.filter(a => a.id !== selected.id).map(a => ({ value: a.id, label: a.questionTextUk }))]} />
        <Button disabled={!mergeTarget || busy} onClick={() => { const target = areas.find(a => a.id === mergeTarget); if (target) { setMerge({ source: selected, target, signature: lifeAreaMergeSignature(snapshot, selected.id), links: related }); setMergeConfirmed(false); } }}>Переглянути об’єднання</Button>
      </>}
    </Card>
    {roadmap && <RoadmapView key={`${roadmap.kind}:${roadmap.id}`} source={snapshot} repositories={repositories} initialOwner={roadmap} onChanged={onChanged} onInspect={owner => { if (owner.kind !== 'stage') openPlan(owner.kind, owner.id); }} />}
    <Card><h2 className="font-semibold">Історія оглядів</h2>
      {[...snapshot.lifeAreaAssessments].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map(review => <details key={review.id} className="border-t py-2"><summary className="min-h-[44px] cursor-pointer">{formatUkrainianDateHeading(review.periodStartLocalDate)} – {formatUkrainianDateHeading(review.periodEndLocalDate)} · шкала {review.scale?.min ?? 1}–{review.scale?.max ?? 10}</summary>
        {review.answers.map(answer => <div key={answer.questionId} className="p-2 space-y-1"><h3 className="font-semibold">{answer.questionTextSnapshotUk}</h3><p>Версія формулювання на час огляду: {answer.questionVersionSnapshot}.</p>{answer.satisfactionQuestionSnapshotUk && <p>{answer.satisfactionQuestionSnapshotUk}</p>}<p>Оцінка: {answer.score === null ? 'Без відповіді' : `${answer.score} / ${review.scale?.max ?? 10}`}</p>{review.scale && <p>{review.scale.labelUk}</p>}<p>Увага зараз: {answer.attentionNow == null ? 'Без відповіді' : answer.attentionNow ? 'Так' : 'Ні'}</p><p>Корисна зміна: {answer.usefulChangeUk == null ? 'Без відповіді' : answer.usefulChangeUk === '' ? 'Відповідь залишено порожньою' : answer.usefulChangeUk}</p>{answer.definitionSnapshotUk != null && <p>Визначення на час огляду: {answer.definitionSnapshotUk}</p>}{answer.note != null && <p className="whitespace-pre-wrap">{answer.note}</p>}</div>)}
      </details>)}
    </Card>
    <ModalSheet isOpen={!!leavePlan} title="Перейти без збереження огляду?" onClose={() => setLeavePlan(null)}>{leavePlan && <div className="space-y-3"><p>Є незбережені відповіді або зміни періоду. Можна повернутися й зберегти огляд або явно перейти без збереження.</p><Button onClick={() => setLeavePlan(null)}>Повернутися до огляду</Button><Button onClick={() => onOpenPlan(leavePlan.kind, leavePlan.id)}>Перейти без збереження</Button></div>}</ModalSheet>
    <ModalSheet isOpen={!!merge} title="Підтвердити об’єднання сфер" onClose={() => { if (!busy) setMerge(null); }}>
      {merge && <div className="space-y-3"><p>«{merge.source.questionTextUk}» → «{merge.target.questionTextUk}». Прямі живі зв’язки буде перенесено, успадковані перераховано. Початкова сфера залишиться прихованою з її ідентичністю. Історичні відповіді, формулювання, періоди й шкали не зміняться.</p><ul>{merge.links.map(l => <li key={`${l.kind}:${l.id}`}>{KIND_UK[l.kind]}: {l.title} · {l.directId === merge.source.id ? 'Пряме переприв’язування' : 'Зміна успадкованого зв’язку'}</li>)}</ul><p>Календарні дати, резерви часу й оцінки задоволеності не зміняться.</p><label className="min-h-[44px] flex gap-2 items-center"><input type="checkbox" checked={mergeConfirmed} onChange={e => setMergeConfirmed(e.target.checked)} />Підтверджую саме це об’єднання</label>{error && <p role="alert">{error}</p>}<Button disabled={!mergeConfirmed || busy} onClick={() => void act(() => repositories.mergeLifeAreas(merge.source.id, merge.target.id, merge.source.revision, merge.target.revision, merge.signature, mergeConfirmed), () => { setAreaId(merge.target.id); setMerge(null); })}>Об’єднати збережені зв’язки</Button></div>}
    </ModalSheet>
    <ModalSheet isOpen={!!pause} title="Поставити проєкт на паузу?" onClose={() => { if (!busy) setPause(null); }}>{pause && <div className="space-y-3"><p>«{pause.title}»: Активний → На паузі. Завдання не завершуються, терміни, події й усі бронювання часу зберігаються. Звільнити вибраний час можна окремо.</p>{error && <p role="alert">{error}</p>}<Button disabled={busy} onClick={() => void act(() => repositories.saveProject({ ...pause, state: 'paused', updatedAt: new Date().toISOString() }, pause.revision), () => setPause(null))}>Підтвердити паузу</Button></div>}</ModalSheet>
    <ModalSheet isOpen={!!linkPreview} title="Підтвердити пряме прив’язування" onClose={() => { if (!busy) setLinkPreview(null); }}>{linkPreview && selected && <div className="space-y-3"><p>{KIND_UK[linkPreview.kind]}: {linkPreview.title}. Поточний прямий зв’язок: {areas.find(a => a.id === linkPreview.directId)?.questionTextUk ?? 'Не заданий'}. Новий: {selected.questionTextUk}. Він матиме перевагу над успадкованим зв’язком. Дати й оцінки не зміняться.</p>{error && <p role="alert">{error}</p>}<Button disabled={busy} onClick={() => void act(() => repositories.setLifeAreaLink(linkPreview.kind as Exclude<LifeAreaLink['kind'], 'reservation'>, linkPreview.id, selected.id, linkPreview.revision), () => setLinkPreview(null))}>Підтвердити зв’язок</Button>{linkPreview.directId && <><p>Якщо прибрати прямий зв’язок, діятиме успадкований: {areas.find(a => a.id === linkPreview.inheritedId)?.questionTextUk ?? 'Не заданий'}.</p><Button disabled={busy} onClick={() => void act(() => repositories.setLifeAreaLink(linkPreview.kind as Exclude<LifeAreaLink['kind'], 'reservation'>, linkPreview.id, null, linkPreview.revision), () => setLinkPreview(null))}>Підтвердити прибирання прямого зв’язку</Button></>}</div>}</ModalSheet>
    {planning && <TaskPlanningSheet task={planning.task} initialReservationId={planning.reservationId} date={today} zone={zone} tasks={snapshot.tasks} events={snapshot.events} reservations={snapshot.reservations} repositories={repositories} onSaved={onChanged} onClose={() => setPlanning(null)} />}
  </div>;
}
