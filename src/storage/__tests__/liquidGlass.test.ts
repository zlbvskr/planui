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
