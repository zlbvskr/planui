import {it} from 'node:test';
import assert from 'node:assert/strict';
import {PlanuiRepositories} from '../repositories';
import {InMemoryTransactionalEngine} from '../db';
import {migrateSupportedDomainSnapshot,exportFullBackupZip,validateBackupArchive} from '../backup/backupService';
import {generateFinitePeriodRosterPreview} from '../../domain/roster';
const now='2026-11-01T00:00:00Z';
async function fixture(){const repos=new PlanuiRepositories(new InMemoryTransactionalEngine());await repos.getOrInitSettings(now);await repos.saveGoal({id:'goal',title:'Goal',description:null,nextActionTaskId:null,purposeUk:null,completionCriteriaUk:null,timing:null,folderId:null,lifeAreaId:null,implementationIntentionUk:null,state:'active',archived:false,order:0,createdAt:now,updatedAt:now,completedAt:null,revision:1});for(const [index,id] of ['a','b','c'].entries())await repos.saveStage({id,projectId:null,goalId:'goal',title:id,expectedOutcome:null,targetDate:null,order:index,createdAt:now,updatedAt:now,revision:1,roadmapPeriod:{precision:'month',month:`2026-${11+index>12?'12':11+index}`},dependsOnStageIds:index?[['a','b'][index-1]]:[]});return repos;}
it('dependent date shift is atomic, rejects cycles/stale previews, and keeps independent data intact',async()=>{
 const repos=await fixture();const capture=async()=>(await repos.captureCoherentSnapshot()).snapshot;const before=await capture();
 await assert.rejects(repos.updateStageGraph('a',{dependsOnStageIds:['c']},{a:1},false));assert.deepEqual(await capture(),before);
 await assert.rejects(repos.updateStageGraph('a',{roadmapPeriod:{precision:'month',month:'2026-12'}},{a:1,b:99,c:1},true));assert.deepEqual(await capture(),before);
 await repos.updateStageGraph('a',{roadmapPeriod:{precision:'month',month:'2026-12'}},{a:1,b:1,c:1},true);
 const after=await capture();assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.events,before.events);assert.deepEqual(after.reservations,before.reservations);assert.equal(after.stages.find(s=>s.id==='b')!.roadmapPeriod?.precision,'range');assert.equal(after.stages.find(s=>s.id==='c')!.revision,2);
 const legacyEdit={...after.stages.find(stage=>stage.id==='c')!,title:'Renamed'};delete legacyEdit.dependsOnStageIds;await repos.saveStage(legacyEdit,legacyEdit.revision);assert.deepEqual((await capture()).stages.find(stage=>stage.id==='c')!.dependsOnStageIds,['b']);
 await repos.deleteStageTransactionally('b',now);assert.deepEqual((await capture()).stages.find(s=>s.id==='c')!.dependsOnStageIds,[]);
});
it('v8/schema9 backup migration preserves old stage dates; new dependency/Ideal Life links round-trip',async()=>{
 const repos=await fixture();const old=structuredClone((await repos.captureCoherentSnapshot()).snapshot);old.settings.dbSchemaVersion=9;for(const stage of old.stages)delete stage.dependsOnStageIds;
 const migrated=migrateSupportedDomainSnapshot(old,{format:'planui-backup-zip',backupVersion:8,dbSchemaVersion:9}).snapshot;assert.equal(migrated.settings.dbSchemaVersion,10);assert.deepEqual(migrated.stages,old.stages);
 await repos.saveInspirationWithMediaTransactionally({id:'ideal',kind:'text',title:'Desired day',contentText:'Calm morning',linkUrl:null,mediaId:null,isFavorite:false,projectId:null,goalId:'goal',collection:'preferred_life',createdAt:now,updatedAt:now,revision:1});
 const archive=await exportFullBackupZip(repos,now);const restored=await validateBackupArchive(archive.zipBytes);assert.equal(restored.snapshot.inspirationItems[0].goalId,'goal');assert.deepEqual(restored.snapshot.stages,(await repos.captureCoherentSnapshot()).snapshot.stages);
});
it('arbitrary day/night/off sequence repeats without modifying templates or existing records',()=>{
 const base={id:'d',name:'Day',code:'D',startLocalTime:'08:00',endLocalTime:'20:00',endDateOffsetDays:0 as const,color:'work' as const,note:null,createdAt:now,updatedAt:now,revision:1};const night={...base,id:'n',name:'Night',code:'N',startLocalTime:'20:00',endLocalTime:'08:00',endDateOffsetDays:1 as const};
 const sequence=[base,night,null,null];const original=structuredClone(sequence);const preview=generateFinitePeriodRosterPreview({startDate:'2026-11-01',endDate:'2026-11-08',cycleTemplateSequence:sequence,action:{kind:'day_off'},lockedZoneId:'Europe/Kyiv',existingEvents:[],existingReservations:[],existingDayOffAnnotations:[],nowIso:now});assert.equal(preview.totalShiftsToSave,4);assert.equal(preview.totalDayOffsToSave,4);assert.deepEqual(sequence,original);assert.equal(preview.eventsToSave.filter(event=>event.workProperties?.shiftCode==='N').length,2);
});
