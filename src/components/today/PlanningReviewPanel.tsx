import {PillRow, Section, Row, DateField, Disclosure, ActionMenu, EmptyState} from '../../ui';
import {formatDate,formatInstant} from '../../lib/format';
import { formatDuration } from '../../lib/format';
import { projectPlanningReview } from '../../domain/lifeAreas';
import React, { useState } from 'react';
import { PlanuiDomainSnapshot, Project } from '../../domain/types';
import { addDaysToLocalDate, formatInstantInZone, formatUkrainianDateHeading } from '../../domain/temporal';
import { Button, Card, InputField } from '../ui/primitives';

export function PlanningReviewPanel({ snapshot, zone, today, initiallyOpen, onOpenPlan, onPause, onInspectEvent, onPlanTask }: { snapshot: PlanuiDomainSnapshot; zone: string; today: string; initiallyOpen?: boolean; onOpenPlan: (kind: 'goal' | 'project', id: string) => void; onPause: (project: Project) => void; onInspectEvent: (id: string) => void; onPlanTask: (id: string, reservationId?: string) => void }) {
  const [start, setStart] = useState(today), [end, setEnd] = useState(addDaysToLocalDate(today, 13));
  let projection: ReturnType<typeof projectPlanningReview> | null = null;
  try { projection = projectPlanningReview(snapshot, start, end, zone); } catch { /* Invalid period is never swapped. */ }
  const [range,setRange]=useState('14');
  const recovery=projection?.events.filter(e=>e.type==='rest'||e.type==='sleep')??[];
  return <div className="space-y-5" data-testid="planning-overview">
    <PillRow label="Період" value={range} options={[{value:'7',label:'7 днів'},{value:'14',label:'14 днів'},{value:'custom',label:'Свій діапазон'}]} onChange={v=>{setRange(v);if(v!=='custom'){setStart(today);setEnd(addDaysToLocalDate(today,Number(v)-1));}}}/>
    {range==='custom'&&<Section><DateField label="Від" value={start} onChange={e=>setStart(e.target.value)}/><DateField label="До" value={end} onChange={e=>setEnd(e.target.value)}/></Section>}
    {!projection&&<p role="alert">Перевірте період</p>}
    <Section title="Найближчі зміни й зобов’язання">
      {projection?.events.filter(e=>e.type!=='rest'&&e.type!=='sleep').map(e=><Disclosure key={e.id} title={e.title} secondary={e.schedule.kind==='timed'?formatInstant(e.schedule.interval.startInstant,zone):formatDate(e.schedule.startLocalDate)} onClick={()=>onInspectEvent(e.id)}/>)}
      {projection?.reservations.map(r=><Disclosure key={r.id} title={snapshot.tasks.find(t=>t.id===r.taskId)?.title??'Запланована дія'} secondary={formatInstant(r.interval.startInstant,zone)} onClick={()=>r.taskId&&onPlanTask(r.taskId,r.id)}/>)}
      {projection?.datedTasks.map(t=><Disclosure key={t.id} title={t.title} onClick={()=>onPlanTask(t.id)}/>)}
      {projection&&!projection.events.length&&!projection.reservations.length&&!projection.datedTasks.length&&<EmptyState text="Зобов’язань у цьому періоді немає"/>}
    </Section>
    <Section title="Відновлення">{recovery.map(e=><Disclosure key={e.id} title={e.title} secondary={e.schedule.kind==='timed'?formatInstant(e.schedule.interval.startInstant,zone):formatDate(e.schedule.startLocalDate)} onClick={()=>onInspectEvent(e.id)}/>)}{!recovery.length&&<EmptyState text="Блоків відновлення немає" action="Додати" onAction={()=>window.dispatchEvent(new CustomEvent('planui:add-recovery'))}/>}</Section>
    <Section title="Поточні цілі">{snapshot.goals.filter(g=>g.state==='active'&&!g.archived).map(g=><Row key={g.id} title={g.title} secondary={snapshot.tasks.find(t=>t.state==='open'&&t.ownership.kind==='goal'&&t.ownership.goalId===g.id)?.title} trailing={<ActionMenu items={[{label:'Зменшити',onSelect:()=>onOpenPlan('goal',g.id)}]}/>}/>)}{snapshot.projects.filter(p=>p.state==='active'&&!p.archived).map(p=><Row key={p.id} title={p.title} trailing={<ActionMenu items={[{label:'Зменшити',onSelect:()=>onOpenPlan('project',p.id)},{label:'Поставити на паузу',onSelect:()=>onPause(p)}]}/>}/>)}</Section>
  </div>;
}
