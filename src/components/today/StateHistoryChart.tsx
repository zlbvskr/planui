import React from 'react';
import {PersonalRecord,CalendarEvent} from '../../domain/types';
import {addDaysToLocalDate,getLocalDateBoundariesInZone,formatInstantInZone} from '../../domain/temporal';
import {formatDate} from '../../lib/format';
export function StateHistoryChart({records,events,zone,today}:{records:readonly PersonalRecord[];events:readonly CalendarEvent[];zone:string;today?:string}) {
 const end=today??formatInstantInZone(new Date().toISOString(),zone).localDate;
 const dates=Array.from({length:14},(_,i)=>addDaysToLocalDate(end,i-13));
 const points=records.filter(r=>dates.includes(r.localDate));
 const hasShift=(date:string)=>{const day=getLocalDateBoundariesInZone(date,zone);return events.some(event=>event.type==='work_shift'&&event.state==='active'&&event.schedule.kind==='timed'&&Date.parse(event.schedule.interval.startInstant)<day.endMs&&Date.parse(event.schedule.interval.endInstant)>day.startMs);};
 return <div className="p-4"><svg viewBox="0 0 560 140" role="img" aria-label="Стан за 14 днів на тлі робочих змін">{dates.map((date,i)=>hasShift(date)&&<rect data-shift-date={date} key={date} x={i*40} y="0" width="40" height="140" fill="var(--color-work-tint)"/>)}{(['mood','energy','stress'] as const).map((key,line)=><g key={key} fill={['var(--color-brand)','var(--color-dayoff)','var(--color-reservation)'][line]}>{points.map(r=>r[key]!=null&&<circle key={r.id} cx={dates.indexOf(r.localDate)*40+20} cy={125-(r[key]!-1)*28} r="4"><title>{formatDate(r.localDate)}: {key} {r[key]}</title></circle>)}</g>)}</svg><div className="flex justify-between text-xs"><span>{formatDate(dates[0])}</span><span>{formatDate(end)}</span></div></div>;
}
