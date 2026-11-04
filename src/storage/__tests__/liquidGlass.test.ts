import { it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanuiRepositories } from '../repositories';
import { InMemoryTransactionalEngine } from '../db';
import type { Task } from '../../domain/types';
import { selectProjectTasks, selectTodayTasks, selectCalendarTasks, selectTaskReviewState, selectTaskLifeArea } from '../../domain/projections';
it('projections retain one task and derive explicit review without rollover', async () => {
 const snapshot = (await new PlanuiRepositories(new InMemoryTransactionalEngine()).captureCoherentSnapshot()).snapshot;
 const task: Task = {id:'task',title:'Next step',state:'open',priority:'normal',description:null,deadline:{kind:'date_only',localDate:'2026-12-01'},estimatedDurationMinutes:null,planningState:'date_only',plannedDate:'2026-11-04',ownership:{kind:'project',projectId:'project',stageId:null},checklist:[],createdAt:'2026-11-04T00:00:00Z',updatedAt:'2026-11-04T00:00:00Z',completedAt:null,canceledAt:null,revision:1,lifeAreaId:'area'};
 snapshot.tasks=[task];
 assert.equal(selectProjectTasks(snapshot,'project')[0],task);
 assert.equal(selectTodayTasks(snapshot,'2026-11-04')[0],task);
 assert.equal(selectCalendarTasks(snapshot,'2026-11-04')[0],task);
 assert.equal(selectTaskReviewState(task,'2026-11-05'),'needs_triage');
 assert.equal(task.state,'open');
 assert.equal(task.plannedDate,'2026-11-04');
 assert.equal(selectTaskLifeArea(snapshot,task),'area');
 task.state='completed';
 assert.equal(selectTodayTasks(snapshot,'2026-11-04')[0].state,'completed');
 assert.equal(selectTaskReviewState(task,'2026-11-05'),'completed');
});

it('direction life area flows through the canonical links without changing satisfaction', async () => {
 const { projectLifeAreaLinks } = await import('../../domain/lifeAreas');
 const snapshot = (await new PlanuiRepositories(new InMemoryTransactionalEngine()).captureCoherentSnapshot()).snapshot;
 const now='2026-11-04T00:00:00Z';
 snapshot.folders=[{id:'direction',name:'Creative',parentId:null,order:0,createdAt:now,updatedAt:now,revision:1,lifeAreaId:'area'}];
 snapshot.tasks=[{id:'task',title:'Step',state:'open',priority:'normal',description:null,deadline:null,estimatedDurationMinutes:null,planningState:'unplanned',plannedDate:null,ownership:{kind:'folder',folderId:'direction'},checklist:[],createdAt:now,updatedAt:now,completedAt:null,canceledAt:null,revision:1}];
 const before=JSON.stringify(snapshot.lifeAreaAssessments);
 assert.equal(projectLifeAreaLinks(snapshot).find(link=>link.kind==='task')?.effectiveId,'area');
 snapshot.tasks[0].state='completed';
 assert.equal(JSON.stringify(snapshot.lifeAreaAssessments),before);
});

it('moving a session, reducing scope, pausing and dropping preserve deadline and history', async () => {
 const { sessionFromDuration } = await import('../../domain/today');
 const repos = new PlanuiRepositories(new InMemoryTransactionalEngine());
 const now='2026-11-04T00:00:00Z';
 let task=await repos.saveTask({id:'triage',title:'Large task',state:'open',priority:'normal',description:null,deadline:{kind:'date_only',localDate:'2026-12-01'},estimatedDurationMinutes:60,planningState:'unplanned',plannedDate:null,ownership:{kind:'standalone'},checklist:[],createdAt:now,updatedAt:now,completedAt:null,canceledAt:null,revision:1});
 const deadline=structuredClone(task.deadline);
 const { reservation: session }=await repos.saveReservationTransactionally({id:'work',taskId:task.id,interval:sessionFromDuration('2026-11-10','20:00',720,'UTC'),state:'active',releaseMetadata:null,createdAt:now,updatedAt:now,revision:1});
 const snapshot=async()=> (await repos.captureCoherentSnapshot()).snapshot;
 let state=await snapshot();
 assert.equal(selectCalendarTasks(state,'2026-11-10','UTC')[0].id,task.id);
 assert.equal(selectCalendarTasks(state,'2026-11-11','UTC')[0].id,task.id);
 await repos.rescheduleReservationTransactionally(session.id,sessionFromDuration('2026-11-12','10:00',60,'UTC'),now,session.revision);
 state=await snapshot();task=state.tasks[0];assert.deepEqual(task.deadline,deadline);
 task=await repos.saveTask({...task,title:'Smaller step',checklist:[{id:'step',title:'First step',order:0,completed:false}]},task.revision);
 assert.deepEqual((await snapshot()).reservations,state.reservations);
 await repos.setTaskDateOnlyPlanningTransactionally(task.id,null,now,task.revision);
 state=await snapshot();task=state.tasks[0];assert.equal(task.plannedDate,null);assert.deepEqual(task.deadline,deadline);assert.equal(state.reservations.length,1);assert.equal(state.reservations[0].state,'released');
 await repos.cancelTaskTransactionally(task.id,now,task.revision);
 state=await snapshot();assert.equal(state.tasks[0].state,'canceled');assert.deepEqual(state.tasks[0].deadline,deadline);assert.equal(state.reservations.length,1);
});

it('overnight shift is one record on both dates; daytime sleep uses quiet ambient context', async () => {
 const { selectShiftCount, selectAmbientContext } = await import('../../domain/projections');
 const { sessionFromDuration } = await import('../../domain/today');
 const { projectScheduleForDate } = await import('../../domain/scheduling');
 const state=(await new PlanuiRepositories(new InMemoryTransactionalEngine()).captureCoherentSnapshot()).snapshot;
 const now='2026-11-04T00:00:00Z';
 state.events=[{id:'night',title:'Night',type:'work_shift',color:'work',note:null,isBlocking:true,state:'active',schedule:{kind:'timed',interval:sessionFromDuration('2026-11-10','20:00',720,'UTC')},workProperties:{shiftName:'Night',shiftCode:null,sourceTemplateId:null},createdAt:now,updatedAt:now,revision:1}];
 assert.equal(selectShiftCount(state),1);
 for(const date of ['2026-11-10','2026-11-11']) assert.equal(projectScheduleForDate({localDate:date,displayZone:'UTC',tasks:[],reservations:[],events:state.events,dayOffAnnotations:[]}).timelineItems.length,1);
 assert.equal(selectAmbientContext(state,Date.parse('2026-11-11T03:00:00Z')),'night');
 state.events=[{...state.events[0],id:'sleep',type:'sleep',workProperties:null,schedule:{kind:'timed',interval:sessionFromDuration('2026-11-11','09:00',480,'UTC')}}];
 assert.equal(selectAmbientContext(state,Date.parse('2026-11-11T12:00:00Z')),'night');
 assert.equal(selectShiftCount(state),0);
});
