import { useState } from 'react';
import type { Habit, HabitEntry, Task, CalendarEvent, TaskReservation } from '../../domain/types';
import { sessionFromDuration } from '../../domain/today';
import { formatInstantInZone } from '../../domain/temporal';
import { formatDate } from '../../lib/format';
import { detectScheduleConflicts } from '../../domain/scheduling';
import { evaluateHabitOnDate } from '../../domain/habits';
import type { HabitRecordingInput } from '../../domain/habits';
import type { PlanuiRepositories } from '../../storage/repositories';
import { DateField, Row, TimeField, Toggle } from '../../ui';
import { Button, InputField, ModalSheet } from '../ui/primitives';

export function HabitSessionSheet({habit,date,zone,tasks,events,reservations,entries,repositories,allowPlanning,onChanged,onClose}: {habit:Habit;date:string;zone:string;tasks:readonly Task[];events:readonly CalendarEvent[];reservations:readonly TaskReservation[];entries:readonly HabitEntry[];repositories:PlanuiRepositories;allowPlanning:boolean;onChanged:()=>Promise<unknown>;onClose:()=>void}) {
  const [startDate,setStartDate]=useState(date),[time,setTime]=useState('09:00'),[duration,setDuration]=useState('30');
  const [overlap,setOverlap]=useState(false),[error,setError]=useState(''),[numeric,setNumeric]=useState(''),[dirty,setDirty]=useState(false);
  const entry=entries.find(e=>e.habitId===habit.id&&e.localDate===date);
  const sessions=reservations.filter(r=>r.habitOccurrence?.habitId===habit.id&&r.habitOccurrence.localDate===date);
  const evaluation=evaluateHabitOnDate({habit,entriesForHabit:entries,localDate:date});
  let conflict=false;
  try { const interval=sessionFromDuration(startDate,time,Number(duration),zone); conflict=detectScheduleConflicts({candidateStartInstant:interval.startInstant,candidateEndInstant:interval.endInstant,displayZone:zone,tasks,events,reservations}).hasConflicts; } catch { /* Invalid entered values are reported on submit. */ }
  async function act(work:()=>Promise<unknown>) {setError('');try {await work();setDirty(false);await onChanged();} catch(e) {setError(e instanceof Error?e.message:'Не вдалося зберегти зміни.');}}
  const record=(input:HabitRecordingInput)=>act(()=>repositories.recordHabitEntryForDateTransactionally({habitId:habit.id,localDate:date,input}));
  const canPlan=allowPlanning&&habit.state==='active'&&entry?.status!=='completed'&&entry?.status!=='skipped';
  return <ModalSheet isOpen title={`Звичка: ${habit.name}`} subtitle={`Єдиний запис за ${formatDate(date)}. Кілька сеансів не множать виконання.`} isDirty={dirty} onClose={onClose}>
    {error&&<p role="alert">{error}</p>}
    <p>{evaluation.statusLabelUk}{entry?.minimumCompletedUk?` · Мінімум: ${entry.minimumCompletedUk}`:''}</p>
    <p>Виконання або свідомий пропуск вивільняє лише залишок сеансів цього запису. Минула зайнятість зберігається; інші дати не змінюються. Повторне відкриття не відновлює вивільнений час.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={()=>void record({kind:'complete'})}>Виконано</Button>
      <Button onClick={()=>void record({kind:'skip'})}>Свідомо пропустити</Button>
      <Button onClick={()=>void record({kind:'clear'})}>Очистити відмітку</Button>
    </div>
    {evaluation.effectiveRevision.target.kind==='numeric'&&<div className="space-y-2"><InputField label={`Значення (${evaluation.effectiveRevision.target.unitUk})`} type="number" min="0" step="0.01" value={numeric} onChange={e=>{setNumeric(e.target.value);setDirty(true);}}/><Button disabled={numeric===''} onClick={()=>void record({kind:'set_numeric',numericValue:Number(numeric)})}>Зберегти значення</Button></div>}
    {canPlan&&<form className="space-y-3" onChange={()=>{setOverlap(false);setDirty(true);}} onSubmit={e=>{e.preventDefault();void act(()=>repositories.scheduleHabitSession({id:crypto.randomUUID(),habitId:habit.id,localDate:date,interval:sessionFromDuration(startDate,time,Number(duration),zone),confirmOverlap:overlap,expectedHabitRevision:habit.revision}));}}>
      <DateField label="Дата початку сеансу" required value={startDate} onChange={e=>setStartDate(e.target.value)}/>
      <TimeField label="Час початку" required value={time} onChange={e=>setTime(e.target.value)}/>
      <InputField label="Тривалість, хвилини реального часу" type="number" min="1" step="1" required value={duration} onChange={e=>setDuration(e.target.value)}/>
      <p>Цей блок стосується запису за {formatDate(date)}, навіть якщо починається іншого дня.</p>
      {conflict&&<Row title="Свідомо підтверджую накладання з наявними подіями або резервами" trailing={<Toggle label="Свідомо підтверджую накладання з наявними подіями або резервами" checked={overlap} onChange={v=>{setOverlap(v);setDirty(true);}}/>}/>}
      <Button type="submit" disabled={conflict&&!overlap}>Додати сеанс</Button>
    </form>}
    <ul className="space-y-2">{sessions.map(s=>{const start=formatInstantInZone(s.interval.startInstant,zone),end=formatInstantInZone(s.interval.endInstant,zone);return <li key={s.id}>{formatDate(start.localDate)} · {start.localTime} — {end.localTime} · {s.state==='active'?'збережена зайнятість':s.state==='released'?'залишок вивільнено':'скасовано'}{s.state==='active'&&Date.parse(s.interval.endInstant)>Date.now()&&<Button onClick={()=>void act(()=>repositories.cancelHabitSession(s.id,s.revision))}>Вивільнити лише цей сеанс</Button>}</li>;})}</ul>
    {!canPlan&&<p>Нові сеанси доступні для активної звички з незавершеним записом і ввімкненим модулем. Наявні сеанси та історія збережені.</p>}
  </ModalSheet>;
}
