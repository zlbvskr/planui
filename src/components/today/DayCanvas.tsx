import React, { useEffect, useRef, useState } from 'react';
import { Moon, ChevronDown } from 'lucide-react';
import { SharedDayTimelineProps } from '../timeline/SharedDayTimeline';
import { buildDayTimelineHourRail, computeCurrentTimeIndicatorPosition, layoutTimelineOverlapLanes } from '../../domain/scheduling';
import { DailyPlan, Folder, Project, Task } from '../../domain/types';
import { ItemCard } from '../ui/design';
import { Button } from '../ui/primitives';

export function directionFor(task: Task | undefined, folders: readonly Folder[], projects: readonly Project[]) {
  const ownership = task?.ownership;
  const folderId = ownership?.kind === 'folder' ? ownership.folderId : ownership?.kind === 'project' ? projects.find(p => p.id === ownership.projectId)?.folderId : null;
  const index = Math.max(0, folders.findIndex(f => f.id === folderId));
  return { name: folders.find(f => f.id === folderId)?.name ?? 'Справа', hue: ['#79cfcc','#e898b1','#a6b4ff','#8ed4a6','#e4b86d'][index % 5] };
}
export const effortDots = (effort: Task['effort']) => effort === 'small' ? '●○○' : effort === 'medium' ? '●●○' : effort === 'large' ? '●●●' : '';

export function DayCanvas(props: SharedDayTimelineProps & { folders: readonly Folder[]; projects: readonly Project[]; plan: DailyPlan }) {
  const { projection, nowMs, events, tasks, reservations, folders, projects, plan } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [away, setAway] = useState(false);
  const [released, setReleased] = useState(false);
  const effective = released && props.projectionWithReleased ? props.projectionWithReleased : projection;
  const now = computeCurrentTimeIndicatorPosition({localDate: projection.localDate, displayZone: projection.displayZone, nowMs});
  const hours = buildDayTimelineHourRail(projection.localDate, projection.displayZone);
  const height = projection.dayDurationMinutes * 56 / 60;
  const reveal = () => { if(ref.current) ref.current.scrollTop = Math.max(0, now.topPercent / 100 * height - 24); };
  useEffect(() => { const frame = requestAnimationFrame(reveal); return () => cancelAnimationFrame(frame); }, [projection.localDate]);
  const overnight = projection.timelineItems.find(i => i.sourceKind === 'work_shift' && i.segment.continuesBeforeDayStart);
  const sleep = projection.timelineItems.find(i => { const ev = events.find(e => e.id === i.sourceId); return ev?.type === 'sleep'; });
  const {positionedItems} = layoutTimelineOverlapLanes({items:effective.timelineItems,dayDurationMinutes:projection.dayDurationMinutes,nowMs});
  const gaps = plan.minimalDay ? [] : projection.availability.unoccupiedGaps.filter(g => g.durationMinutes >= 30 && g.durationMinutes < 1440 && g.endMs > nowMs).slice(-1);
  return <section className="today-day-canvas">
    {overnight && <div className="today-continuity"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className="today-moon"><Moon size={20} aria-hidden="true" /></span><span><strong>{Date.parse(events.find(e=>e.id===overnight.sourceId)?.schedule.kind === 'timed' ? (events.find(e=>e.id===overnight.sourceId)!.schedule as {interval:{endInstant:string}}).interval.endInstant : '') > nowMs ? `Нічна зміна · до ${overnight.segment.displayEndLocalTime}` : `Нічна зміна завершилась о ${overnight.segment.displayEndLocalTime}`}</strong><small>{(() => { const e=events.find(e=>e.id===overnight.sourceId); return e?.schedule.kind==='timed' ? `З ${new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:projection.displayZone}).format(new Date(e.schedule.interval.startInstant))}, ${e.schedule.interval.originStartLocalTime}` : ''; })()}{sleep ? ` · сон до ${sleep.segment.displayEndLocalTime}` : ''}</small></span><ChevronDown size={18} aria-hidden="true" /></button>{expanded && <div className="p-3 space-y-2">{[overnight,sleep].filter(Boolean).map(i=><button key={i!.itemKey} className="block w-full text-left" onClick={()=>{const e=events.find(e=>e.id===i!.sourceId);if(e)props.onInspectEvent(e);}}>{i!.segment.displayStartLocalTime}–{i!.segment.displayEndLocalTime} · {i!.title}</button>)}</div>}</div>}
    {projection.allDayItems.map(i=><ItemCard key={i.eventId}><button onClick={()=>{const e=events.find(e=>e.id===i.eventId);if(e)props.onInspectEvent(e);}}>{i.title} · Увесь день</button></ItemCard>)}
    {props.projectionWithReleased?.timelineItems.some(i=>i.state==='released') && <button className="ui-pill" aria-pressed={released} onClick={()=>setReleased(!released)}>Показати зняті сеанси</button>}
    {away && now.isVisibleOnDate && <button className="ui-pill today-now-jump" onClick={reveal}>Зараз</button>}
    <div ref={ref} className="today-time-scroll" tabIndex={0} role="region" aria-label="Розклад на 24 години" onScroll={()=>setAway(Math.abs((ref.current?.scrollTop??0) - (now.topPercent /100*height-24))>100)}>
      <div className="today-time-canvas" style={{height}}>
        {hours.map(h=><div className="today-hour" key={h.slotIndex} style={{top:`${h.topPercent}%`}}><span>{h.localTimeLabel}</span><i /></div>)}
        {gaps.map(g=><button key={g.startInstant} className="today-gap" style={{top:(Date.parse(g.startInstant)-Date.parse(projection.availability.windowStartInstant))/60000*56/60}} onClick={()=>props.onOpenGapPicker(g)}>+ {g.startLocalTime}–{g.endLocalTime} · Запланувати справу</button>)}
        {positionedItems.filter(p=>!overnight || expanded || (p.item.itemKey!==overnight.itemKey && p.item.itemKey!==sleep?.itemKey)).map(p=>{
          const item=p.item; const task=tasks.find(t=>t.id===item.taskId);const ev=events.find(e=>e.id===item.sourceId);const dir=directionFor(task,folders,projects);
          const reminder=item.segment.elapsedDurationMinutes<10; const hue=task?dir.hue:ev?.type==='work_shift'?'#e4b86d':ev?.type==='sleep'?'#8aabdb':'#8ed4a6';
          return <ItemCard key={item.itemKey} hue={hue} className={`today-time-item ${reminder?'today-reminder':''}`} style={{top:`${p.topPercent}%`,height:Math.max(44,p.heightPercent/100*height-4),left:`calc(52px + (100% - 52px) * ${p.laneIndex/p.totalLanes})`,width:`calc((100% - 52px) / ${p.totalLanes} - 2px)`}}>
            <button className="today-item-open" onClick={()=>task?props.onInspectTask?.(task,item.sourceId):ev&&props.onInspectEvent(ev)} aria-label={`Відкрити: ${item.title}`}><h3>{reminder?'♥ ':''}{item.title}</h3>{!reminder&&task?.description&&<p>{task.description}</p>}{!reminder&&<div className="ui-item-meta">{item.segment.displayStartLocalTime}–{item.segment.displayEndLocalTime} · {task?dir.name:item.title} · {effortDots(task?.effort)}</div>}{reminder&&<span className="ui-item-meta">{item.segment.displayStartLocalTime}</span>}</button>
            {!reminder&&plan.focusTaskIds.includes(task?.id??'')&&<span className="today-star" aria-label="Фокус дня">★</span>}
            {task?.deadline?.kind==='date_only'&&<span className="today-deadline">до {Number(task.deadline.localDate.slice(8))}.{task.deadline.localDate.slice(5,7)}</span>}
            <details className="today-item-menu"><summary aria-label={`Дії: ${item.title}`}>⋯</summary><div><Button onClick={()=>task?props.onInspectTask?.(task,item.sourceId):ev&&props.onInspectEvent(ev)}>Редагувати</Button>{task&&<Button onClick={()=>void props.onToggleTaskState(task.id)}>{task.state==='completed'?'Відкрити знову':'Завершити'}</Button>}{ev&&<Button onClick={()=>void props.onCancelEvent(ev.id,ev.revision)}>Скасувати подію</Button>}{reservations.find(r=>r.id===item.sourceId)?.habitOccurrence&&<Button onClick={()=>props.onInspectHabitSession?.(reservations.find(r=>r.id===item.sourceId)!)}>Запис звички</Button>}</div></details>
          </ItemCard>;
        })}
        {now.isVisibleOnDate&&<div className="today-now-line" style={{top:`${now.topPercent}%`}} data-testid="today-current-time-indicator"><span>{now.currentLocalTimeLabel}</span><i /></div>}
      </div>
    </div>
  </section>;
}
