import {Icon} from '../ui/icons';
import {formatDate} from '../lib/format';
import {Section, Row, Slider, Toggle, Sheet, RoundButton, InfoSheet, Disclosure, PillRow, SelectField, Button, InputField, ModalSheet, TextAreaField, SubHeaderActions} from '../ui';
import { PlanuiError } from '../i18n/errorsUk';
import React, { useEffect, useState } from 'react';
import { LifeAreaQuestion, PlanuiDomainSnapshot, Project, Task, RoadmapOwner } from '../domain/types';
import { STARTER_LIFE_AREAS, ReviewAnswerDraft, LifeAreaLink, buildLifeReview, lifeAreaMergeSignature, projectLifeAreaLinks } from '../domain/lifeAreas';
import { updateLifeAreaQuestionWording } from '../domain/personalSpace';
import { addDaysToLocalDate } from '../domain/temporal';
import { PlanuiRepositories } from '../storage/repositories';
import { PlanningReviewPanel } from '../components/today/PlanningReviewPanel';
import { TaskPlanningSheet } from '../components/today/TaskPlanningSheet';
import { RoadmapView } from './RoadmapView';

const EMPTY_ANSWER: ReviewAnswerDraft = { score: null, attentionNow: null, usefulChangeUk: null };
const KIND_UK = { inspiration: 'Матеріал', folder: 'Папка', goal: 'Ціль', project: 'Проєкт', task: 'Завдання', habit: 'Звичка', event: 'Подія', reservation: 'Запланована дія' };

function AreaEditor({ area, repositories, onChanged }: { area: LifeAreaQuestion; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void }) {
  const [splitName,setSplitName]=useState('');
  const [name, setName] = useState(area.questionTextUk), [definition, setDefinition] = useState(area.goodEnoughUk ?? ''), [archived, setArchived] = useState(!!area.archived), [error, setError] = useState('');
  return <form className="space-y-2" onSubmit={async e => { e.preventDefault(); try { const record = updateLifeAreaQuestionWording(area, name, new Date().toISOString()); await repositories.saveLifeAreaQuestion({ ...record, goodEnoughUk: definition || null, archived }, area.revision); await onChanged(); } catch { setError('Не вдалося змінити сферу. Перевірте назву й оновіть дані.'); } }}>
    <InputField label="Назва сфери" required value={name} onChange={e => setName(e.target.value)} />
    <TextAreaField label="Що для мене означає «достатньо добре» у цій сфері? (необов’язково)" value={definition} onChange={e => setDefinition(e.target.value)} />
    <Row title="Приховати сферу" trailing={<Toggle label="Приховати сферу" checked={archived} onChange={setArchived}/>}/>
    <p>Історія та зв’язки зберігаються. Зміниться лише поточна назва або визначення.</p>
    {error && <p role="alert">{error}</p>}<Button type="submit" variant="primary">Зберегти сферу</Button>
    <InputField label="Нова сфера при розділенні" value={splitName} onChange={e=>setSplitName(e.target.value)}/><Button disabled={!splitName.trim()} onClick={async()=>{try{await repositories.saveLifeAreaQuestion({...area,id:crypto.randomUUID(),questionTextUk:splitName.trim(),starterKeys:[],goodEnoughUk:null,order:area.order+0.5,version:1,revision:1,updatedAt:new Date().toISOString()});setSplitName('');await onChanged();}catch{setError('Не вдалося розділити сферу');}}}>Розділити сферу</Button>
  </form>;
}

export function LifeAreasReviewView({ snapshot, zone, today, repositories, onChanged, onOpenPlan, onInspectEvent, onModalStateChange, initialPlanningReview }: { snapshot: PlanuiDomainSnapshot; zone: string; today: string; repositories: PlanuiRepositories; onChanged: () => Promise<void> | void; onOpenPlan: (kind: 'goal' | 'project', id: string) => void; onInspectEvent: (id: string) => void; onModalStateChange?: (open: boolean) => void; initialPlanningReview?: boolean }) {
  const areas = [...snapshot.lifeAreaQuestions].sort((a, b) => a.order - b.order);
  const active = areas.filter(a => !a.archived && !a.mergedIntoId);
  const [start, setStart] = useState(addDaysToLocalDate(today,-13)), end = today;
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
  const [taskTitle, setTaskTitle] = useState(''), [parentLink,setParentLink]=useState('');
  const [planning, setPlanning] = useState<{ task: Task; reservationId?: string } | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapOwner | null>(null);
  const selected = areas.find(a => a.id === areaId && !a.mergedIntoId);
  const links = projectLifeAreaLinks(snapshot);
  const related = links.filter(link => link.effectiveId === areaId);
  const missing = STARTER_LIFE_AREAS.filter(([key]) => !areas.some(a => a.starterKeys?.includes(key)));
  const [lifeReviewOpen,setLifeReviewOpen]=useState(false);
  const [definitionDraft,setDefinitionDraft]=useState('');
  const [detail,setDetail]=useState(false), [manage,setManage]=useState(false), [step,setStep]=useState(0);
  const [picker,setPicker]=useState(false), [history,setHistory]=useState(false);
  const latest=(id:string)=>[...snapshot.lifeAreaAssessments].filter(r=>r.scale?.min===0).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)).flatMap(r=>r.answers).find(a=>a.questionId===id);
  const answerFor=(id:string)=>drafts[id] ?? latest(id) ?? EMPTY_ANSWER;
  const modalOpen = history || detail || manage || picker || lifeReviewOpen || !!(merge || pause || linkPreview || planning || leavePlan);
  useEffect(() => { onModalStateChange?.(modalOpen); return () => onModalStateChange?.(false); }, [modalOpen]);
  async function act(work: () => Promise<unknown>, close?: () => void) {
    setError(''); setBusy(true);
    try { await work(); await onChanged(); close?.(); } catch (e) { setError(e instanceof PlanuiError ? e.message : 'Не вдалося зберегти зміни. Оновіть дані й повторіть.'); } finally { setBusy(false); }
  }
  function openPlan(kind: 'goal' | 'project', id: string) { if (reviewDirty) setLeavePlan({ kind, id }); else onOpenPlan(kind, id); }
  function update(id: string, patch: Partial<ReviewAnswerDraft>) { setReviewDirty(true); setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? latest(id) ?? EMPTY_ANSWER), ...patch } })); }
  return <div className="space-y-4" data-testid="life-areas-review" data-ui="content-start">
    {initialPlanningReview ? <PlanningReviewPanel snapshot={snapshot} zone={zone} today={today} initiallyOpen onOpenPlan={openPlan} onPause={setPause} onInspectEvent={onInspectEvent} onPlanTask={(id,reservationId)=>{const task=snapshot.tasks.find(t=>t.id===id);if(task)setPlanning({task,reservationId});}} /> : <>
    <SubHeaderActions><RoundButton aria-label="Огляд сфер" onClick={()=>{setStep(0);setLifeReviewOpen(true);}}><Icon name="rotate-ccw"/></RoundButton><RoundButton aria-label="Налаштувати сфери" onClick={()=>setManage(true)}><Icon name="more-horizontal"/></RoundButton><InfoSheet title="Про сфери життя">Це не психологічний тест, загального балу немає. Оцінку визначаєте лише ви; виконані кроки її не змінюють.</InfoSheet></SubHeaderActions>
    {error && <p role="alert">{error}</p>}
    <Section>{active.map((area,index)=>{const answer=latest(area.id);return <button key={area.id} className="ui-disclosure area-list-row" style={{'--area-hue':`var(--area-${index%10+1})`} as React.CSSProperties} onClick={()=>{setAreaId(area.id);setDefinitionDraft(area.goodEnoughUk??'');setDrafts({});setDetail(true);}}><Row leading={<Icon name={(['sparkles','sun','moon','heart-pulse','brain','target','compass','briefcase','home','leaf'] as const)[index%10]}/>} title={area.questionTextUk} trailing={<><span className="area-score-bar"><i style={{width:`${(answer?.score??0)*10}%`}}/></span><span>{answer?.score==null?'-':`${answer.score}/10`}</span>{answer?.attentionNow&&<span aria-label="Фокус зараз">●</span>}</>} /></button>;})}</Section>
    <Sheet isOpen={detail} title={selected?.questionTextUk??'Сфера'} onClose={()=>setDetail(false)}>{selected&&<div className="life-area-detail space-y-4">
      <Slider label="Задоволеність" value={answerFor(selected.id).score} onChange={score=>update(selected.id,{...answerFor(selected.id),score:score as ReviewAnswerDraft['score']})}/>
      <TextAreaField label="Що означає «достатньо добре» для мене" value={definitionDraft} onChange={e=>setDefinitionDraft(e.target.value)}/>
      <Row title="Фокус зараз" trailing={<Toggle label="Фокус зараз" checked={answerFor(selected.id).attentionNow===true} onChange={attentionNow=>update(selected.id,{...answerFor(selected.id),attentionNow})}/>}/>
      <Section title="Що підтримує цю сферу">{related.filter(l=>l.kind!=='reservation').map(link=><Row key={`${link.kind}:${link.id}`} title={link.title} secondary={KIND_UK[link.kind]}/>)}{(()=>{const n=related.filter(l=>l.kind==='task'&&snapshot.tasks.some(t=>t.id===l.id&&t.completedAt&&t.completedAt.slice(0,10)>=addDaysToLocalDate(today,-13)&&t.completedAt.slice(0,10)<=today)).length;return n>0?<Row title={`${n} кроків за 2 тижні`}/>:null;})()}</Section>
      <Disclosure title="Додати крок" onClick={()=>setPicker(true)}/><Disclosure title="Пов’язати запис" onClick={()=>setPicker(true)}/>
      <button className="ui-primary" onClick={()=>void act(async()=>{if(definitionDraft!==(selected.goodEnoughUk??''))await repositories.saveLifeAreaQuestion({...selected,goodEnoughUk:definitionDraft||null,updatedAt:new Date().toISOString()},selected.revision);await repositories.saveLifeAreaAssessment(buildLifeReview(crypto.randomUUID(),[{...selected,goodEnoughUk:definitionDraft||null}],{[selected.id]:answerFor(selected.id)},today,today,new Date().toISOString()));},()=>{setDetail(false);setDrafts({});setReviewDirty(false);})}>Зберегти</button>
    </div>}</Sheet>
    </>}
    <Sheet isOpen={manage} title="Налаштувати сфери" onClose={()=>setManage(false)}><Disclosure title="Історія оглядів" onClick={()=>{setManage(false);setHistory(true);}}/><PillRow label="Ритм огляду" value={reviewRhythm} options={[7,14,30].map(n=>({value:String(n),label:n===14?"Кожні 2 тижні":`Кожні ${n} днів`}))} onChange={v=>{setReviewRhythm(v);setStart(addDaysToLocalDate(today,1-Number(v)));}}/>
    <div className="space-y-3">
      <Row title="Показати приховані сфери" trailing={<Toggle label="Показати приховані сфери" checked={showHidden} onChange={setShowHidden}/>}/>
      {areas.filter(a => showHidden || (!a.archived && !a.mergedIntoId)).map((area, index, visible) => <div key={area.id} className="border rounded-xl p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <details><summary className="min-h-[44px] cursor-pointer break-words">{area.questionTextUk}{area.mergedIntoId ? ' · Об’єднана' : area.archived ? ' · Прихована' : ''}</summary>{area.mergedIntoId ? <p>Ідентичність і історію збережено. Поточні зв’язки перенесені до «{areas.find(a => a.id === area.mergedIntoId)?.questionTextUk}».</p> : <><AreaEditor key={`${area.id}:${area.revision}`} area={area} repositories={repositories} onChanged={onChanged} /><Disclosure title="Об’єднати з іншою сферою" onClick={()=>{setAreaId(area.id);setManage(false);setPicker(true);}}/></>}</details>
        {!area.mergedIntoId && <div className="flex flex-wrap gap-2">{[-1, 1].map(delta => <Button key={delta} disabled={busy || !visible[index + delta]} aria-label={`${delta < 0 ? 'Вище' : 'Нижче'}: ${area.questionTextUk}`} onClick={() => void act(async () => { const ids = areas.map(a => a.id), from = ids.indexOf(area.id), to = ids.indexOf(visible[index + delta].id); [ids[from], ids[to]] = [ids[to], ids[from]]; await repositories.reorderLifeAreas(ids, Object.fromEntries(areas.map(a => [a.id, a.revision]))); })}>{delta < 0 ? 'Вище' : 'Нижче'}</Button>)}</div>}
      </div>)}
      {missing.length > 0 && <div className="space-y-2 pt-3"><p>Відсутні елементи базової рамки можна додати або явно зіставити з власною сферою. Назви не порівнюються автоматично.</p>
        <SelectField label="Елемент базової рамки" value={starterKey} onChange={e => setStarterKey(e.target.value)} options={[{ value: '', label: 'Оберіть елемент' }, ...missing.map(([value, label]) => ({ value, label }))]} />
        <SelectField label="Додати чи зіставити" value={mapping} onChange={e => setMapping(e.target.value)} options={[{ value: '', label: 'Додати окрему сферу' }, ...areas.filter(a => !a.mergedIntoId).map(a => ({ value: a.id, label: `Зіставити: ${a.questionTextUk}` }))]} />
        <Button variant="primary" disabled={!starterKey || busy} onClick={() => void act(() => repositories.addOrMapStarterArea(starterKey, mapping || null), () => { setStarterKey(''); setMapping(''); })}>Підтвердити додавання або зіставлення</Button>
      </div>}
    </div>
    </Sheet>
    <Sheet isOpen={lifeReviewOpen} title="Огляд сфер життя" isDirty={reviewDirty} onClose={()=>setLifeReviewOpen(false)}>
      <div className="flex gap-2 justify-center" role="group" aria-label={`Сфера ${step+1} з ${active.length}`}>{active.map((a,i)=><span key={a.id} role="img" aria-label={`Сфера ${i+1}`} aria-current={i===step?'step':undefined}>{i===step?'●':'○'}</span>)}</div>
      {active[step]&&(()=>{const area=active[step],answer=drafts[area.id]??latest(area.id)??EMPTY_ANSWER;return <div className="space-y-3"><h3>{area.questionTextUk}</h3><Slider label="Наскільки мене влаштовує ця сфера?" value={answer.score} onChange={score=>update(area.id,{score:score as ReviewAnswerDraft['score']})}/><Row title="Приділити увагу зараз?" trailing={<Toggle label="Приділити увагу зараз?" checked={answer.attentionNow===true} onChange={attentionNow=>update(area.id,{attentionNow})}/>}/><TextAreaField label="Одна корисна зміна" value={answer.usefulChangeUk??''} onChange={e=>update(area.id,{usefulChangeUk:e.target.value})}/><PillRow label="Корисні зміни" value={answer.usefulChangeUk??''} options={['Зменшити навантаження','Поставити проєкт на паузу','Звільнити час на відпочинок','Створити крок'].map(label=>({value:label,label}))} onChange={usefulChangeUk=>{update(area.id,{usefulChangeUk});setAreaId(area.id);if(usefulChangeUk==='Створити крок')setPicker(true);else if(usefulChangeUk==='Поставити проєкт на паузу'){const p=snapshot.projects.find(p=>p.state==='active'&&links.some(l=>l.id===p.id&&l.kind==='project'&&l.effectiveId===area.id));if(p)setPause(p);else setPicker(true);}else if(usefulChangeUk==='Зменшити навантаження'){const p=links.find(l=>l.effectiveId===area.id&&(l.kind==='project'||l.kind==='goal'));if(p)openPlan(p.kind as 'project'|'goal',p.id);else setPicker(true);}else {const r=snapshot.reservations.find(r=>r.state==='active'&&r.taskId&&r.interval.startInstant>new Date().toISOString());const task=snapshot.tasks.find(t=>t.id===r?.taskId);if(task)setPlanning({task,reservationId:r!.id});else window.dispatchEvent(new CustomEvent('planui:add-recovery'));}}}/><p>Не обов’язково прагнути максимуму в кожній сфері.</p><div className="flex justify-between"><RoundButton aria-label="Попередня сфера" disabled={step===0} onClick={()=>setStep(step-1)}><Icon name="chevron-left"/></RoundButton><RoundButton aria-label="Наступна сфера" disabled={step===active.length-1} onClick={()=>setStep(step+1)}><Icon name="chevron-right"/></RoundButton></div></div>;})()}
      <button className="ui-primary" disabled={busy} onClick={()=>void act(()=>repositories.saveLifeAreaAssessment(buildLifeReview(crypto.randomUUID(),active,Object.fromEntries(active.map(a=>[a.id,answerFor(a.id)])),start,end,new Date().toISOString())),()=>{setDrafts({});setReviewDirty(false);setLifeReviewOpen(false);})}>Зберегти огляд</button>
    </Sheet>
    <Sheet isOpen={picker} title="Крок і зв’язки" onClose={()=>setPicker(false)}>
    <Section title="Від огляду до явної дії"><div className="p-4 space-y-3">
      <SelectField label="Сфера для перегляду зв’язків і наступного кроку" value={selected?.id ?? ''} onChange={e => { setAreaId(e.target.value); setMergeTarget(''); }} options={[{ value: '', label: 'Оберіть сферу' }, ...areas.filter(a => !a.mergedIntoId).map(a => ({ value: a.id, label: a.questionTextUk }))]} />
      {selected && <>
        <p>Прямий зв’язок має перевагу над успадкованим. Записи не копіюються.</p>
        <ul className="space-y-2">{related.map(link => <li key={`${link.kind}:${link.id}`} className="border-t py-2 space-y-1"><p>{KIND_UK[link.kind]}: {link.title} · {link.directId === areaId ? 'Прямий зв’язок' : 'Успадкований зв’язок'}</p>
          {(link.kind === 'goal' || link.kind === 'project') && <div className="flex flex-wrap gap-2"><Button onClick={() => setRoadmap({ kind: link.kind as 'goal' | 'project', id: link.id })}>Дорожня карта</Button><Button onClick={() => openPlan(link.kind as 'goal' | 'project', link.id)}>{link.kind === 'project' ? 'Скоротити обсяг: відкрити проєкт' : 'Відкрити ціль'}</Button>{link.kind === 'project' && snapshot.projects.find(p => p.id === link.id)?.state === 'active' && <Button onClick={() => setPause(snapshot.projects.find(p => p.id === link.id)!)}>Переглянути паузу</Button>}</div>}
          {(link.kind === 'task' || link.kind === 'reservation') && <Button onClick={() => { const task = snapshot.tasks.find(t => t.id === (link.taskId ?? link.id)); if (task) setPlanning({ task, reservationId: link.kind === 'reservation' ? link.id : undefined }); }}>Планування / звільнити вибраний майбутній час</Button>}
          {link.kind === 'event' && <Button onClick={() => onInspectEvent(link.id)}>Відкрити редактор події</Button>}
        </li>)}</ul>
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void act(() => repositories.saveTask({ id: crypto.randomUUID(), title: taskTitle.trim(), lifeAreaId: selected.id, description: null, state: 'open', priority: 'normal', deadline: null, estimatedDurationMinutes: null, planningState: 'unplanned', plannedDate: null, ownership: parentLink.startsWith('project:') ? {kind:'project',projectId:parentLink.slice(8),stageId:null} : parentLink.startsWith('goal:') ? {kind:'goal',goalId:parentLink.slice(5)} : parentLink.startsWith('folder:') ? {kind:'folder',folderId:parentLink.slice(7)} : { kind: 'standalone', folderId: null }, checklist: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, canceledAt: null, revision: 1 }), () => setTaskTitle('')); }}><InputField label="Назва наступного завдання" required value={taskTitle} onChange={e => setTaskTitle(e.target.value)} /><SelectField label="Пов’язати з напрямом або проєктом" value={parentLink} onChange={e=>setParentLink(e.target.value)} options={[{value:"",label:"Без зв’язку"},...links.filter(l=>["folder","goal","project"].includes(l.kind)).map(l=>({value:`${l.kind}:${l.id}`,label:l.title}))]}/><Button type="submit" variant="primary" disabled={busy}>Створити крок</Button></form>
        <SelectField label="Прив’язати наявний запис" value={linkId} onChange={e => setLinkId(e.target.value)} options={[{ value: '', label: 'Оберіть запис' }, ...links.filter(l => l.kind !== 'reservation').map(l => ({ value: `${l.kind}:${l.id}`, label: `${KIND_UK[l.kind]}: ${l.title}` }))]} />
        <Button disabled={!linkId || busy} onClick={() => setLinkPreview(links.find(l => `${l.kind}:${l.id}` === linkId) ?? null)}>Переглянути пряме прив’язування</Button>
        <SelectField label="Об’єднати поточну сферу з іншою" value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} options={[{ value: '', label: 'Оберіть цільову сферу' }, ...active.filter(a => a.id !== selected.id).map(a => ({ value: a.id, label: a.questionTextUk }))]} />
        <Button disabled={!mergeTarget || busy} onClick={() => { const target = areas.find(a => a.id === mergeTarget); if (target) { setMerge({ source: selected, target, signature: lifeAreaMergeSignature(snapshot, selected.id), links: related }); setMergeConfirmed(false); } }}>Переглянути об’єднання</Button>
      </>}
    </div></Section>
    </Sheet>
    {roadmap && <RoadmapView key={`${roadmap.kind}:${roadmap.id}`} source={snapshot} repositories={repositories} initialOwner={roadmap} onChanged={onChanged} onInspect={owner => { if (owner.kind !== 'stage') openPlan(owner.kind, owner.id); }} />}
    <Sheet isOpen={history} title="Історія оглядів" onClose={()=>setHistory(false)}><h2 className="font-semibold">Історія оглядів</h2>
      {[...snapshot.lifeAreaAssessments].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map(review => <details key={review.id} className="border-t py-2"><summary className="min-h-[44px] cursor-pointer">{formatDate(review.periodStartLocalDate)} – {formatDate(review.periodEndLocalDate)} · шкала {review.scale?.min ?? 1}–{review.scale?.max ?? 10}</summary>
        {review.answers.map(answer => <div key={answer.questionId} className="p-2 space-y-1"><h3 className="font-semibold">{answer.questionTextSnapshotUk}</h3><p>Версія формулювання на час огляду: {answer.questionVersionSnapshot}.</p>{answer.satisfactionQuestionSnapshotUk && <p>{answer.satisfactionQuestionSnapshotUk}</p>}<p>Оцінка: {answer.score === null ? 'Без відповіді' : `${answer.score} / ${review.scale?.max ?? 10}`}</p>{review.scale && <p>{review.scale.labelUk}</p>}<p>Увага зараз: {answer.attentionNow == null ? 'Без відповіді' : answer.attentionNow ? 'Так' : 'Ні'}</p><p>Корисна зміна: {answer.usefulChangeUk == null ? 'Без відповіді' : answer.usefulChangeUk === '' ? 'Відповідь залишено порожньою' : answer.usefulChangeUk}</p>{answer.definitionSnapshotUk != null && <p>Визначення на час огляду: {answer.definitionSnapshotUk}</p>}{answer.note != null && <p className="whitespace-pre-wrap">{answer.note}</p>}</div>)}
      </details>)}
    </Sheet>
    <ModalSheet isOpen={!!leavePlan} title="Перейти без збереження огляду?" onClose={() => setLeavePlan(null)}>{leavePlan && <div className="space-y-3"><p>Є незбережені відповіді або зміни періоду. Можна повернутися й зберегти огляд або явно перейти без збереження.</p><Button variant="primary" onClick={() => setLeavePlan(null)}>Повернутися до огляду</Button><Button onClick={() => onOpenPlan(leavePlan.kind, leavePlan.id)}>Перейти без збереження</Button></div>}</ModalSheet>
    <ModalSheet isOpen={!!merge} title="Підтвердити об’єднання сфер" onClose={() => { if (!busy) setMerge(null); }}>
      {merge && <div className="space-y-3"><p>«{merge.source.questionTextUk}» → «{merge.target.questionTextUk}». Прямі живі зв’язки буде перенесено, успадковані перераховано. Початкова сфера залишиться прихованою з її ідентичністю. Історичні відповіді, формулювання, періоди й шкали не зміняться.</p><ul>{merge.links.map(l => <li key={`${l.kind}:${l.id}`}>{KIND_UK[l.kind]}: {l.title} · {l.directId === merge.source.id ? 'Пряме переприв’язування' : 'Зміна успадкованого зв’язку'}</li>)}</ul><p>Календарні дати, резерви часу й оцінки задоволеності не зміняться.</p><Row title="Підтверджую об’єднання" trailing={<Toggle label="Підтверджую об’єднання" checked={mergeConfirmed} onChange={setMergeConfirmed}/>}/>{error && <p role="alert">{error}</p>}<Button variant="primary" disabled={!mergeConfirmed || busy} onClick={() => void act(() => repositories.mergeLifeAreas(merge.source.id, merge.target.id, merge.source.revision, merge.target.revision, merge.signature, mergeConfirmed), () => { setAreaId(merge.target.id); setMerge(null); })}>Об’єднати збережені зв’язки</Button></div>}
    </ModalSheet>
    <ModalSheet isOpen={!!pause} title="Поставити проєкт на паузу?" onClose={() => { if (!busy) setPause(null); }}>{pause && <div className="space-y-3"><p>«{pause.title}»: Активний → На паузі. Завдання не завершуються, терміни, події й усі бронювання часу зберігаються. Звільнити вибраний час можна окремо.</p>{error && <p role="alert">{error}</p>}<Button variant="primary" disabled={busy} onClick={() => void act(() => repositories.saveProject({ ...pause, state: 'paused', updatedAt: new Date().toISOString() }, pause.revision), () => setPause(null))}>Підтвердити паузу</Button></div>}</ModalSheet>
    <ModalSheet isOpen={!!linkPreview} title="Підтвердити пряме прив’язування" onClose={() => { if (!busy) setLinkPreview(null); }}>{linkPreview && selected && <div className="space-y-3"><p>{KIND_UK[linkPreview.kind]}: {linkPreview.title}. Поточний прямий зв’язок: {areas.find(a => a.id === linkPreview.directId)?.questionTextUk ?? 'Не заданий'}. Новий: {selected.questionTextUk}. Він матиме перевагу над успадкованим зв’язком. Дати й оцінки не зміняться.</p>{error && <p role="alert">{error}</p>}<Button variant="primary" disabled={busy} onClick={() => void act(() => repositories.setLifeAreaLink(linkPreview.kind as Exclude<LifeAreaLink['kind'], 'reservation'>, linkPreview.id, selected.id, linkPreview.revision), () => setLinkPreview(null))}>Підтвердити зв’язок</Button>{linkPreview.directId && <><p>Якщо прибрати прямий зв’язок, діятиме успадкований: {areas.find(a => a.id === linkPreview.inheritedId)?.questionTextUk ?? 'Не заданий'}.</p><Button disabled={busy} onClick={() => void act(() => repositories.setLifeAreaLink(linkPreview.kind as Exclude<LifeAreaLink['kind'], 'reservation'>, linkPreview.id, null, linkPreview.revision), () => setLinkPreview(null))}>Підтвердити прибирання прямого зв’язку</Button></>}</div>}</ModalSheet>
    {planning && <TaskPlanningSheet task={planning.task} initialReservationId={planning.reservationId} date={today} zone={zone} tasks={snapshot.tasks} events={snapshot.events} reservations={snapshot.reservations} repositories={repositories} onSaved={onChanged} onClose={() => setPlanning(null)} />}
  </div>;
}
