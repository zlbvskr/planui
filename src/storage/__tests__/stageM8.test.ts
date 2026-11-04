import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Habit, HabitEntry, TaskReservation } from '../../domain/types';
import { PLANUI_DB_SCHEMA_VERSION, PLANUI_BACKUP_VERSION } from '../../domain/types';
import { evaluateHabitOnDate, computeHabitWeekProgress, getPreviousLocalDateForNightShift, appendEffectiveHabitRuleRevision } from '../../domain/habits';
import { sessionFromDuration } from '../../domain/today';
import { projectScheduleForDate } from '../../domain/scheduling';
import { validateDomainSnapshot, validateHabitRecord, validateHabitEntryRecord, validateReservationRecord } from '../../domain/validation';
import { InMemoryTransactionalEngine, STORE_NAMES } from '../db';
import { PlanuiRepositories } from '../repositories';
import { exportFullBackupZip, validateBackupArchive, executeAtomicBackupReplacement, migrateSupportedDomainSnapshot } from '../backup/backupService';
const day='2026-11-04', tomorrow='2026-11-05', zone='UTC', now='2026-11-04T12:00:00.000Z';
function habit(id='habit'):Habit {return {id,name:'Читання',description:null,icon:null,lifeAreaId:null,projectId:null,state:'active',minimumVersionUk:'Прочитати один абзац',contextCueUk:'Після пробудження',reminderIntentionUk:'Покласти книгу поруч',ruleRevisions:[{id:`${id}-v1`,effectiveFromLocalDate:'2026-11-01',rule:{kind:'daily'},target:{kind:'binary'},createdAt:now}],createdAt:now,updatedAt:now,revision:1};}
async function fixture(h=habit()){const engine=new InMemoryTransactionalEngine(),repos=new PlanuiRepositories(engine);await repos.getOrInitSettings(now);await repos.saveHabit(h);return {engine,repos};}
async function plan(repos:PlanuiRepositories,id:string,date=day,time='14:00',duration=60,expectedHabitRevision=1){return repos.scheduleHabitSession({id,habitId:'habit',localDate:date,interval:sessionFromDuration(date,time,duration,zone),expectedHabitRevision,nowIso:now});}
async function snapshot(repos:PlanuiRepositories){return (await repos.captureCoherentSnapshot(now)).snapshot;}
describe('M8 context-aware habits and canonical sessions',()=>{
  it('uses explicit days off, preserves overnight occupancy and never treats a blank date as a day off',async()=>{
    const h=habit();h.ruleRevisions[0].rule={kind:'days_off'};const {repos}=await fixture(h);
    assert.equal(evaluateHabitOnDate({habit:h,entriesForHabit:[],localDate:day}).cellStatus,'not_scheduled');
    await repos.saveDayOffAnnotationTransactionally({id:'off',localDate:day,sourceZone:zone,code:null,note:null,createdAt:now,updatedAt:now,revision:1});
    await repos.saveCalendarEvent({id:'night',title:'Нічна зміна',type:'work_shift',color:'work',note:null,schedule:{kind:'timed',interval:sessionFromDuration('2026-11-03','20:00',720,zone)},isBlocking:true,state:'active',workProperties:{shiftName:'Нічна зміна',shiftCode:'Н',sourceTemplateId:null},createdAt:now,updatedAt:now,revision:1});
    const snap=await snapshot(repos);
    assert.equal(evaluateHabitOnDate({habit:h,entriesForHabit:[],localDate:day,daysOff:snap.dayOffAnnotations.map(d=>d.localDate)}).cellStatus,'no_entry');
    const projected=projectScheduleForDate({localDate:day,displayZone:zone,events:snap.events,tasks:[],reservations:[],dayOffAnnotations:snap.dayOffAnnotations});
    assert.equal(projected.availability.totalOccupiedMinutes,480);
    assert.equal(getPreviousLocalDateForNightShift(day),'2026-11-03');
  });
  it('pins logged day-off classification while unlogged future changes remain relevant',async()=>{
    const h=habit();h.ruleRevisions[0].rule={kind:'days_off'};const {repos,engine}=await fixture(h);
    await repos.saveDayOffAnnotationTransactionally({id:'off',localDate:day,sourceZone:zone,code:null,note:null,createdAt:now,updatedAt:now,revision:1});
    await repos.recordHabitEntryForDateTransactionally({habitId:h.id,localDate:day,input:{kind:'skip'},nowIso:now});
    await engine.runTransaction([STORE_NAMES.dayOffAnnotations],'readwrite',tx=>tx.delete(STORE_NAMES.dayOffAnnotations,'off'));
    await plan(repos,'future',tomorrow);
    const snap=await snapshot(repos);
    assert.equal(evaluateHabitOnDate({habit:h,entriesForHabit:snap.habitEntries,localDate:day,daysOff:[]}).isScheduledOpportunity,true);
    assert.equal(evaluateHabitOnDate({habit:h,entriesForHabit:snap.habitEntries,localDate:tomorrow,daysOff:[tomorrow]}).isScheduledOpportunity,true);
    assert.equal(evaluateHabitOnDate({habit:h,entriesForHabit:snap.habitEntries,localDate:tomorrow,daysOff:[]}).isScheduledOpportunity,false);
  });
  it('counts one canonical occurrence across several sessions and releases only its remaining time',async()=>{
    const {repos}=await fixture();await plan(repos,'past',day,'09:00');await plan(repos,'ongoing',day,'11:30');await plan(repos,'pending');await plan(repos,'other-date',tomorrow);
    const before=await snapshot(repos);const ids=new Set(before.reservations.filter(r=>r.habitOccurrence?.localDate===day).map(r=>r.habitOccurrence?.entryId));assert.equal(ids.size,1);
    await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:day,input:{kind:'complete'},nowIso:now});
    const after=await snapshot(repos);assert.equal(after.tasks.length,0);assert.equal(after.habitEntries.length,2);
    assert.equal(computeHabitWeekProgress(after.habits[0],after.habitEntries,day).completedCount,1);
    assert.deepEqual(after.reservations.find(r=>r.id==='past'),before.reservations.find(r=>r.id==='past'));
    assert.equal(after.reservations.find(r=>r.id==='ongoing')?.interval.endInstant,now);
    assert.equal(after.reservations.find(r=>r.id==='ongoing')?.releaseMetadata?.originalEndInstant,'2026-11-04T12:30:00.000Z');
    assert.equal(after.reservations.find(r=>r.id==='pending')?.state,'released');
    assert.deepEqual(after.reservations.find(r=>r.id==='other-date'),before.reservations.find(r=>r.id==='other-date'));
    assert.equal(projectScheduleForDate({localDate:day,displayZone:zone,events:[],tasks:[],reservations:after.reservations,dayOffAnnotations:[]}).availability.totalOccupiedMinutes,90);
    await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:day,input:{kind:'complete'},nowIso:now});
    assert.deepEqual((await snapshot(repos)).reservations,after.reservations);
  });
  it('preserves the occurrence ID when clearing a session-linked log and never restores released sessions',async()=>{
    const {repos}=await fixture();await plan(repos,'one');const entry=(await snapshot(repos)).habitEntries[0];
    await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:day,input:{kind:'complete'},nowIso:now});
    await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:day,input:{kind:'clear'},nowIso:now});
    let snap=await snapshot(repos);assert.equal(snap.habitEntries[0].id,entry.id);assert.equal(snap.habitEntries[0].status,'no_entry');assert.equal(snap.reservations[0].state,'released');
    await repos.deleteHabitEntryTransactionally(entry.id,now);snap=await snapshot(repos);assert.equal(snap.habitEntries[0].id,entry.id);validateDomainSnapshot(snap);
  });
  it('keeps minimum wording separate from numeric targets and weekly completion',async()=>{
    const h=habit();h.ruleRevisions[0].rule={kind:'weekly_frequency',timesPerWeek:2};h.ruleRevisions[0].target={kind:'numeric',targetValue:2000,unitUk:'мл'};h.minimumVersionUk='Один спокійний вдих';const {repos}=await fixture(h);await plan(repos,'numeric');
    await repos.recordHabitEntryForDateTransactionally({habitId:h.id,localDate:day,input:{kind:'minimum'},nowIso:now});
    let snap=await snapshot(repos);assert.equal(snap.habitEntries[0].numericValue,null);assert.equal(snap.habitEntries[0].minimumCompletedUk,'Один спокійний вдих');assert.equal(snap.reservations[0].state,'active');assert.equal(computeHabitWeekProgress(h,snap.habitEntries,day).completedCount,0);
    await repos.recordHabitEntryForDateTransactionally({habitId:h.id,localDate:day,input:{kind:'set_numeric',numericValue:500},nowIso:now});snap=await snapshot(repos);assert.equal(evaluateHabitOnDate({habit:h,entriesForHabit:snap.habitEntries,localDate:day}).numericProgressRatio,0.25);
    await repos.recordHabitEntryForDateTransactionally({habitId:h.id,localDate:day,input:{kind:'add_numeric_delta',delta:1500},nowIso:now});snap=await snapshot(repos);assert.equal(computeHabitWeekProgress(h,snap.habitEntries,day).completedCount,1);assert.equal(snap.reservations[0].state,'released');assert.equal(snap.habitEntries.length,1);
  });
  it('pins legacy log targets before schedule edits and keeps immutable schedule versions',async()=>{
    const h=habit();h.ruleRevisions[0].target={kind:'numeric',targetValue:2000,unitUk:'мл'};const {repos,engine}=await fixture(h);
    const old:HabitEntry={id:'legacy-custom-id',habitId:h.id,localDate:day,status:'partial',numericValue:500,note:'Мій текст',recordedAt:now,updatedAt:now,revision:3};
    await engine.runTransaction([STORE_NAMES.habitEntries],'readwrite',tx=>tx.put(STORE_NAMES.habitEntries,old));
    const next={id:'v2',effectiveFromLocalDate:day,rule:{kind:'selected_weekdays' as const,weekdaysIso:[1]},target:{kind:'numeric' as const,targetValue:3,unitUk:'сторінки'},createdAt:'2026-11-04T13:00:00.000Z'};
    await repos.saveHabitRuleRevisionTransactionally(h.id,next,now,1);const snap=await snapshot(repos);const evalOld=evaluateHabitOnDate({habit:snap.habits[0],entriesForHabit:snap.habitEntries,localDate:day});
    assert.equal(evalOld.targetValue,2000);assert.equal(evalOld.unitUk,'мл');assert.equal(evalOld.numericProgressRatio,0.25);assert.deepEqual({...snap.habitEntries[0],ruleSnapshot:undefined},{...old,ruleSnapshot:undefined});assert.equal(snap.habits[0].ruleRevisions.length,2);
    assert.equal(evaluateHabitOnDate({habit:snap.habits[0],entriesForHabit:snap.habitEntries,localDate:tomorrow}).targetValue,3);
    assert.throws(()=>appendEffectiveHabitRuleRevision(h.ruleRevisions,{...h.ruleRevisions[0],target:{kind:'binary'}}));
    await assert.rejects(repos.saveHabit({...snap.habits[0],ruleRevisions:[next]},2));
  });
  it('does not cancel sessions or mutate logs on pause or module disable; existing sessions survive ZIP restore',async()=>{
    const {repos}=await fixture();await plan(repos,'session');const initial=await snapshot(repos);
    await repos.updateHabitStateTransactionally('habit','paused',now,1);let settings=(await snapshot(repos)).settings;
    await repos.saveSettings({...settings,modules:{...settings.modules!,habitsEnabled:false,userConfigured:true}},settings.revision);
    const saved=await snapshot(repos);assert.deepEqual(saved.reservations,initial.reservations);assert.deepEqual(saved.habitEntries,initial.habitEntries);assert.equal(evaluateHabitOnDate({habit:saved.habits[0],entriesForHabit:saved.habitEntries,localDate:day}).cellStatus,'paused');
    await assert.rejects(plan(repos,'paused',tomorrow,'14:00',60,2));
    const target=new PlanuiRepositories(new InMemoryTransactionalEngine());const zip=await exportFullBackupZip(repos,now);assert.equal(zip.manifest.backupVersion,7);await executeAtomicBackupReplacement(target,await validateBackupArchive(zip.zipBytes),{explicitUserConfirmation:true,nowIso:now});
    const restored=await snapshot(target);assert.deepEqual(restored.reservations,saved.reservations);assert.deepEqual(restored.habits,saved.habits);assert.deepEqual(restored.habitEntries,saved.habitEntries);assert.equal(restored.settings.modules?.habitsEnabled,false);
    await target.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:day,input:{kind:'complete'},nowIso:now});assert.equal((await snapshot(target)).reservations[0].state,'released');
  });
  it('warns before overlaps, checks stale plans and rolls back failed session creation',async()=>{
    const {repos}=await fixture();await plan(repos,'one');const before=await snapshot(repos);
    await assert.rejects(plan(repos,'conflict'));assert.deepEqual((await snapshot(repos)).habitEntries,before.habitEntries);assert.equal((await snapshot(repos)).reservations.length,1);
    await repos.scheduleHabitSession({id:'confirmed',habitId:'habit',localDate:day,interval:sessionFromDuration(day,'14:00',60,zone),expectedHabitRevision:1,confirmOverlap:true,nowIso:now});assert.equal((await snapshot(repos)).reservations.length,2);
    await assert.rejects(plan(repos,'stale',tomorrow,'14:00',60,99));
    await assert.rejects(plan(repos,'one',tomorrow));assert.equal((await snapshot(repos)).habitEntries.length,1);
  });
  it('skips and clears yesterday explicitly without creating habit debt or completing another date',async()=>{
    const {repos}=await fixture();await plan(repos,'today');await plan(repos,'tomorrow',tomorrow);await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:day,input:{kind:'skip'},nowIso:now});
    let snap=await snapshot(repos);assert.equal(snap.reservations.find(r=>r.id==='today')?.state,'released');assert.equal(snap.reservations.find(r=>r.id==='tomorrow')?.state,'active');assert.equal(computeHabitWeekProgress(snap.habits[0],snap.habitEntries,day).completedCount,0);
    const yesterday=getPreviousLocalDateForNightShift(day);await repos.recordHabitEntryForDateTransactionally({habitId:'habit',localDate:yesterday,input:{kind:'complete'},nowIso:now});snap=await snapshot(repos);assert.equal(snap.habitEntries.find(e=>e.localDate===yesterday)?.recordedAt,now);assert.equal(snap.habitEntries.find(e=>e.localDate===day)?.status,'skipped');
  });
  it('validates session ownership/references, optional text and saved schedule metadata',async()=>{
    const {repos}=await fixture();await plan(repos,'one');const snap=await snapshot(repos),session=snap.reservations[0];validateDomainSnapshot(snap);
    assert.throws(()=>validateReservationRecord({...session,taskId:'unrelated-task'}));assert.throws(()=>validateDomainSnapshot({...snap,reservations:[{...session,habitOccurrence:{...session.habitOccurrence!,entryId:'missing'}}]}));
    assert.throws(()=>validateHabitRecord({...habit(),minimumVersionUk:3 as any}));assert.throws(()=>validateHabitEntryRecord({...snap.habitEntries[0],ruleSnapshot:{...habit().ruleRevisions[0],rule:{kind:'bad'} as any}}));
  });
  it('keeps older v1–v6 records intact on migration and advances schema metadata only',async()=>{
    const {repos}=await fixture();const snap=await snapshot(repos);const exported=await exportFullBackupZip(repos,now);
    for(const version of [1,2,3,4,5,6]) {const old={...snap,settings:{...snap.settings,dbSchemaVersion:version}};const migrated=migrateSupportedDomainSnapshot(old,{...exported.manifest,backupVersion:version,dbSchemaVersion:version}).snapshot;assert.deepEqual(migrated.habits,snap.habits);assert.deepEqual(migrated.habitEntries,snap.habitEntries);assert.equal(migrated.settings.dbSchemaVersion,PLANUI_DB_SCHEMA_VERSION);validateDomainSnapshot(migrated);}
    assert.equal(PLANUI_BACKUP_VERSION,7);
  });
  it('explicit permanent habit deletion removes only its own canonical sessions and entries',async()=>{
    const {repos}=await fixture();await plan(repos,'session');await repos.saveHabit(habit('other'));await repos.recordHabitEntryForDateTransactionally({habitId:'other',localDate:day,input:{kind:'complete'},nowIso:now});await repos.deleteHabitWithHistoryTransactionally('habit',now);const snap=await snapshot(repos);assert.equal(snap.habits.length,1);assert.equal(snap.habitEntries.length,1);assert.equal(snap.habitEntries[0].habitId,'other');assert.equal(snap.reservations.length,0);validateDomainSnapshot(snap);
  });
  it('cancels one selected session without completing or releasing sibling sessions',async()=>{
    const {repos}=await fixture();const one=await plan(repos,'one');await plan(repos,'two',day,'16:00');const before=await snapshot(repos);
    await repos.cancelHabitSession(one.id,one.revision);const after=await snapshot(repos);
    assert.equal(after.reservations.find(r=>r.id==='one')?.state,'released');assert.deepEqual(after.reservations.find(r=>r.id==='two'),before.reservations.find(r=>r.id==='two'));assert.deepEqual(after.habitEntries,before.habitEntries);
    await assert.rejects(repos.cancelHabitSession(one.id,one.revision));
  });
  it('reassigns direct direction references safely when a direction is removed',async()=>{
    const {repos}=await fixture();await repos.saveFolder({id:'folder',name:'Напрям',parentId:null,lifeAreaId:null,order:0,createdAt:now,updatedAt:now,revision:1});const h=(await snapshot(repos)).habits[0];await repos.saveHabit({...h,folderId:'folder'},h.revision);await repos.deleteFolderTransactionally('folder','rehome_to_parent',now);const after=await snapshot(repos);assert.equal(after.habits[0].folderId,null);validateDomainSnapshot(after);
  });
  it('rolls back the occurrence if writing its session fails',async()=>{
    const {repos,engine}=await fixture();
    const failing=new PlanuiRepositories({dbName:engine.dbName,close:()=>engine.close(),runTransaction:(stores,mode,work)=>engine.runTransaction(stores,mode,tx=>work({...tx,put:async(store,record)=>{if(store===STORE_NAMES.reservations)throw Error('Injected failure');await tx.put(store,record);}}))});
    await assert.rejects(plan(failing,'broken'));const after=await snapshot(repos);assert.equal(after.habitEntries.length,0);assert.equal(after.reservations.length,0);
  });
  it('keeps the latest appended schedule effective even when timestamps tie',()=>{
    const h=habit();const second={...h.ruleRevisions[0],id:'aaa',rule:{kind:'days_off' as const}};
    const updated={...h,ruleRevisions:appendEffectiveHabitRuleRevision(h.ruleRevisions,second)};
    assert.equal(evaluateHabitOnDate({habit:updated,entriesForHabit:[],localDate:day}).effectiveRevision.id,'aaa');assert.deepEqual(updated.ruleRevisions[0],h.ruleRevisions[0]);
  });

});
