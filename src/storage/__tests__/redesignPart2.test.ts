import {it} from 'node:test';
import assert from 'node:assert/strict';
import {generateFinitePeriodRosterPreview} from '../../domain/roster';
import {PlanuiRepositories} from '../repositories';
import {InMemoryTransactionalEngine} from '../db';
import {projectTodayTasks,sessionFromDuration} from '../../domain/today';
import {selectShiftCount} from '../../domain/projections';
import type {Task} from '../../domain/types';
it('finite overnight cycle preserves other instances on a one-date override across DST',async()=>{
 const now='2026-10-01T00:00:00Z';
 const preview=generateFinitePeriodRosterPreview({startDate:'2026-10-23',endDate:'2026-10-29',cycleEveryDays:2,action:{kind:'custom_shift',title:'Ніч',startLocalTime:'20:00',endLocalTime:'08:00',endDateOffsetDays:1},lockedZoneId:'Europe/Kyiv',existingEvents:[],existingReservations:[],existingDayOffAnnotations:[],nowIso:now});
 assert.equal(preview.totalShiftsToSave,4);assert.equal(preview.blockingErrorCount,0);
 const repos=new PlanuiRepositories(new InMemoryTransactionalEngine());
 for(const event of preview.eventsToSave)await repos.saveCalendarEvent(event);
 const before=(await repos.captureCoherentSnapshot()).snapshot;
 const event=before.events[1];
 await repos.rescheduleCalendarEventTransactionally(event.id,{kind:'timed',interval:sessionFromDuration('2026-10-25','21:00',600,'Europe/Kyiv')},now,event.revision);
 const after=(await repos.captureCoherentSnapshot()).snapshot;
 assert.equal(selectShiftCount(after),4);assert.deepEqual(after.events.filter(e=>e.id!==event.id),before.events.filter(e=>e.id!==event.id));
 assert.throws(()=>generateFinitePeriodRosterPreview({startDate:'2026-10-23',endDate:'2026-10-29',cycleEveryDays:0,action:{kind:'day_off'},lockedZoneId:'UTC',existingEvents:[],existingReservations:[],existingDayOffAnnotations:[],nowIso:now}));
});
it('minimum day keeps a deadline and at most one small optional focus task without mutating data',()=>{
 const make=(id:string):Task=>({id,title:id,state:'open',priority:'normal',deadline:null,description:null,estimatedDurationMinutes:null,planningState:'date_only',plannedDate:'2026-11-04',ownership:{kind:'standalone'},effort:'small',checklist:[],createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',completedAt:null,canceledAt:null,revision:1});
 const tasks=[make('a'),make('b'),{...make('large'),effort:'large' as const},{...make('due'),deadline:{kind:'date_only' as const,localDate:'2026-11-04'}}];const before=structuredClone(tasks);
 const result=projectTodayTasks(tasks,[],'2026-11-04','UTC',{minimalDay:true,focusTaskIds:['a','b','large'],focusNoteUk:null});
 assert.deepEqual(result.visible.map(t=>t.id),['a','due']);assert.deepEqual(tasks,before);
});
it('changed stage periods require review when siblings exist and never mutate siblings',async()=>{
 const {requiresStageDateReview}=await import('../../domain/roadmap');
 const item:import('../../domain/roadmap').RoadmapItem={owner:{kind:'stage',id:'a'},title:'A',state:'active',folderId:null,deadline:null,parent:{kind:'project',id:'p'},record:{id:'a',projectId:'p',title:'A',expectedOutcome:null,targetDate:null,order:0,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',revision:1,roadmapPeriod:{precision:'month',month:'2026-11'}}};
 const next={...item,owner:{kind:'stage' as const,id:'b'}};const original=structuredClone(next);
 assert.equal(requiresStageDateReview(item,[item,next],{precision:'month',month:'2026-12'}),true);
 assert.equal(requiresStageDateReview(item,[item,next],{precision:'month',month:'2026-11'}),false);
 assert.deepEqual(next,original);
});
