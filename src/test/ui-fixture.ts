/** Tests only: never import from the application entrypoint or persist in IndexedDB. */
import type { CalendarEvent, Goal, Habit, MediaBlobRecord, PlanuiDomainSnapshot, Project, Task, ThemePreference, ZonedInterval } from '../domain/types';
import { createDefaultSettings, InMemoryTransactionalEngine, STORE_NAMES, StorageEngine } from '../storage/db';
import { createStarterAreas } from '../domain/lifeAreas';

export const UI_CLOCK = '2026-11-05T03:41:00.000Z';
export const UI_ZONE = 'Europe/Kyiv';
export const UI_DATE = '2026-11-05';
export const DIRECTION_HUES = { english: '#79cfcc', creative: '#e898b1', university: '#a6b4ff', work: '#e4b86d', transition: '#bc9ded', relationships: '#8ed4a6' } as const;
export type UiFixtureVariant = 'filled' | 'empty';
const base = { createdAt: UI_CLOCK, updatedAt: UI_CLOCK, revision: 1 };
function interval(date: string, start: string, end: string, endDate = date): ZonedInterval {
  return {startInstant:new Date(`${date}T${start}:00+02:00`).toISOString(),endInstant:new Date(`${endDate}T${end}:00+02:00`).toISOString(),originZone:UI_ZONE,originStartLocalDate:date,originStartLocalTime:start,originEndLocalDate:endDate,originEndLocalTime:end};
}
function event(id:string,title:string,type:CalendarEvent['type'],color:CalendarEvent['color'],date:string,start:string,end:string,endDate=date):CalendarEvent {
  return {...base,id,title,type,color,note:null,state:'active',isBlocking:true,schedule:{kind:'timed',interval:interval(date,start,end,endDate)},workProperties:type==='work_shift'?{shiftName:title,shiftCode:start==='20:00'?'Н':'Д',sourceTemplateId:null}:null};
}
function task(id:string,title:string,overrides:Partial<Task>={}):Task {
  return {...base,id,title,description:null,state:'open',priority:'normal',effort:null,deadline:null,estimatedDurationMinutes:null,planningState:'unplanned',plannedDate:null,ownership:{kind:'standalone'},checklist:[],completedAt:null,canceledAt:null,...overrides};
}
function goal(id:string,title:string,state:Goal['state']='active'):Goal {
  return {...base,id,title,state,folderId:'transition',lifeAreaId:'life-q-6',description:null,purposeUk:'Передбачуваний графік і більше свободи',completionCriteriaUk:'Домовитися про нову роботу',nextActionTaskId:null,timing:null,implementationIntentionUk:null,archived:false,completedAt:null,order:0};
}
function project(id:string,title:string,state:Project['state']='active'):Project {
  return {...base,id,title,state,folderId:'creative',goalId:null,lifeAreaId:'life-q-5',description:null,desiredOutcome:'Спільний реліз',completionCriteria:'Підготувати альбом',targetDate:null,collaboratorText:'Друг',nextActionTaskId:'album',archived:false,completedAt:state==='completed'?UI_CLOCK:null};
}
function habit(id:string,name:string,rule:Habit['ruleRevisions'][number]['rule'],contextCueUk:string,minimumVersionUk:string,state:Habit['state']='active'):Habit {
  return {...base,id,name,state,contextCueUk,minimumVersionUk,reminderIntentionUk:null,description:null,icon:null,lifeAreaId:null,projectId:null,folderId:null,ruleRevisions:[{id:`rule-${id}`,effectiveFromLocalDate:'2026-10-01',rule,target:{kind:'binary'},createdAt:UI_CLOCK}]};
}
export function createUiFixture(variant:UiFixtureVariant='filled',theme:ThemePreference='dark') {
  const settings=createDefaultSettings(UI_CLOCK);
  settings.theme=theme;settings.timeZoneMode='manual';settings.manualTimeZone=UI_ZONE;settings.lastDetectedTimeZone=UI_ZONE;
  settings.modules={habitsEnabled:true,stateCheckInsEnabled:true,desiredLifeEnabled:true,wishlistEnabled:true,userConfigured:true};
  settings.todayNextDayCollapsed=true;
  const snapshot:PlanuiDomainSnapshot={folders:[],goals:[],projects:[],stages:[],tasks:[],reservations:[],events:[],shiftTemplates:[],dayOffAnnotations:[],habits:[],habitEntries:[],personalRecords:[],lifeAreaQuestions:[],lifeAreaAssessments:[],inspirationItems:[],mediaMeta:[],wishlistCategories:[],wishes:[],settings};
  const mediaBlobs:MediaBlobRecord[]=[];
  snapshot.lifeAreaQuestions=createStarterAreas(UI_CLOCK);
  if(variant==='empty')return {snapshot,mediaBlobs,directionHues:DIRECTION_HUES,habitDurationMinutes:{}};
  snapshot.folders=Object.entries({english:'Англійська',creative:'Творчість',university:'Університет',work:'Поточна робота',transition:'Перехід на іншу роботу',relationships:'Стосунки'}).map(([id,name],order)=>({...base,id,name,order,parentId:null}));
  snapshot.goals=[{...goal('career','Перехід на іншу роботу'),roadmapPeriod:{precision:'range',startDate:'2026-11-01',endDateExclusive:'2027-05-01'},checkpoints:[{id:'milestone-12',title:'Визначено бажану роль',localDate:'2026-11-12',order:0},{id:'milestone-portfolio',title:'Портфоліо готове',localDate:'2027-02-01',order:1}]}];
  snapshot.stages=['Визначити роль','Перелік навичок','Навчання','Портфоліо','Резюме','Співбесіди'].map((title,order)=>({...base,id:`career-stage-${order}`,title,goalId:'career',projectId:null,expectedOutcome:null,targetDate:null,order,dependsOnStageIds:order===1?['career-stage-0']:[],roadmapPeriod:{precision:'month',month:['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04'][order]}}));
  snapshot.projects=[project('album-project','Альбом із другом'),project('idea','Власне артистичне ім’я','idea'),project('paused','Домашня студія','paused'),project('completed','Перший демозапис','completed')];
  snapshot.tasks=[
    task('english-lesson','Урок 12 · аудіювання',{ownership:{kind:'folder',folderId:'english'},effort:'small',estimatedDurationMinutes:60,planningState:'timed'}),
    task('album','Альбом із другом',{ownership:{kind:'project',projectId:'album-project',stageId:null},description:'Аранжування демо №3',checklist:[{id:'arrange',title:'Аранжування демо №3',order:0,completed:false}],effort:'medium',estimatedDurationMinutes:90,planningState:'timed'}),
    task('seminar','Тези до семінару',{ownership:{kind:'folder',folderId:'university'},effort:'large',estimatedDurationMinutes:60,planningState:'timed',deadline:{kind:'date_only',localDate:'2026-11-09'}}),
    task('medicine','Купити ліки',{plannedDate:UI_DATE,planningState:'date_only'}),
    task('triage','Переглянути матеріали до заняття',{plannedDate:'2026-11-04',planningState:'date_only',estimatedDurationMinutes:30}),
  ];
  snapshot.reservations=[['english-lesson',UI_DATE,'16:00','17:00'],['album',UI_DATE,'17:30','19:00'],['seminar','2026-11-06','20:30','21:30']].map(([taskId,date,start,end])=>({...base,id:`session-${taskId}`,taskId,interval:interval(date,start,end),state:'active',releaseMetadata:null}));
  snapshot.events=[event('night-4','Нічна зміна','work_shift','work','2026-11-04','20:00','08:00',UI_DATE),event('night-6','Нічна зміна','work_shift','work','2026-11-06','20:00','08:00','2026-11-07'),event('day-10','Денна зміна','work_shift','work','2026-11-10','08:00','20:00'),event('sleep-5','Сон','sleep','rest',UI_DATE,'08:30','15:00'),{...event('call-mom','Зателефонувати мамі','personal','dayoff',UI_DATE,'19:30','19:31'),isBlocking:false,lifeAreaId:'life-q-4'},{...base,id:'trip-home',title:'Поїздка додому',type:'travel',color:'dayoff',note:null,isBlocking:true,state:'active',workProperties:null,lifeAreaId:'life-q-4',schedule:{kind:'all_day',startLocalDate:'2026-11-14',endLocalDateExclusive:'2026-11-17',originZone:UI_ZONE}}];
  snapshot.dayOffAnnotations=['2026-11-08','2026-11-09'].map(localDate=>({...base,id:`off-${localDate}`,localDate,sourceZone:UI_ZONE,code:null,note:null}));
  snapshot.settings.dailyPlans={[UI_DATE]:{minimalDay:false,focusTaskIds:['album'],focusNoteUk:null}};
  snapshot.habits=[habit('stretch','Розтяжка',{kind:'daily'},'Після пробудження','3 рухи'),habit('read','Читання',{kind:'weekly_frequency',timesPerWeek:3},'3 рази на тиждень','2 сторінки'),habit('walk','Прогулянка',{kind:'days_off'},'У вихідні від роботи','10 хв'),habit('water','Вода',{kind:'daily'},'Після пробудження','Склянка води','paused')];
  snapshot.lifeAreaQuestions=createStarterAreas(UI_CLOCK).map(a=>({...a,goodEnoughUk:'Мені достатньо сил і простору для важливого'}));
  snapshot.lifeAreaAssessments=[{...base,id:'life-review',recordedAt:UI_CLOCK,periodStartLocalDate:'2026-10-22',periodEndLocalDate:UI_DATE,scale:{min:0,max:10,labelUk:'Задоволеність'},answers:snapshot.lifeAreaQuestions.map((a,i)=>({questionId:a.id,questionTextSnapshotUk:a.questionTextUk,questionVersionSnapshot:a.version,score:([6,4,3,7,8,4,5,6,7,5] as const)[i],attentionNow:i===2,usefulChangeUk:null,definitionSnapshotUk:a.goodEnoughUk,note:null}))}];
  snapshot.personalRecords=[0,1,2].map(i=>({...base,id:`check-in-${i}`,recordedAt:`2026-11-0${3+i}T03:30:00.000Z`,localDate:`2026-11-0${3+i}`,zoneId:UI_ZONE,text:null,mood:3,energy:i===2?2:4,stress:3,sleepMinutes:420,sleepQuality:3,tags:[],scaleVersion:1}));
  snapshot.wishlistCategories=[{...base,id:'music',name:'Для музики',order:0},{...base,id:'home',name:'Для дому',order:1}];
  snapshot.wishes=[['headphones','Навушники для студії','3500.00',350000,'now','music'],['lamp','Лампа для читання','850.00',85000,'later','home'],['keyboard','MIDI-клавіатура','6200.00',620000,'someday','music']].map(([id,title,amountDecimal,amountMinor,timing,categoryId])=>({...base,id:String(id),title:String(title),categoryId:String(categoryId),timing:timing as 'now'|'later'|'someday',estimatedPrice:{amountDecimal:String(amountDecimal),amountMinor:Number(amountMinor),currency:'UAH'},note:null,state:'active',fulfilledAt:null,archived:false,purchaseStatus:'want',projectId:categoryId==='music'?'album-project':null,linkUrl:null,mediaId:null}));
  // Tiny local PNG; no external image request and no fixture asset in the production graph.
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  mediaBlobs.push({id:'ideal-image',mimeType:'image/png',bytes});
  snapshot.mediaMeta=[{id:'ideal-image',mimeType:'image/png',byteSize:bytes.length,width:1,height:1,sha256Hex:'0a97501e18a664a7d7ee7a1aeea061759a8833e1dbe6b6259d4b7c7746a4506c',wasOptimized:false,optimizationNoteUk:null,createdAt:UI_CLOCK}];
  snapshot.inspirationItems=[{...base,id:'ideal-note',kind:'text',title:'Мій бажаний день',contentText:'Передбачуваний графік, музика й час із близькими',collection:'preferred_life',lifeAreaId:'life-q-3',goalId:'career',linkUrl:null,mediaId:null,isFavorite:false,projectId:null},{...base,id:'ideal-quote',kind:'quote',title:'Власний ритм',contentText:'Достатньо добре — теж добре',collection:'preferred_life',linkUrl:null,mediaId:null,isFavorite:true,projectId:null},{...base,id:'ideal-photo',kind:'image',title:'Місце для творчості',contentText:null,collection:'preferred_life',linkUrl:null,mediaId:'ideal-image',isFavorite:false,projectId:'album-project'}];
  return {snapshot,mediaBlobs,directionHues:DIRECTION_HUES,habitDurationMinutes:{stretch:10,read:15,walk:30}};
}

/** Refuses persistent engines. Tests may seed only a disposable memory engine. */
export async function seedUiFixture(engine:StorageEngine,variant:UiFixtureVariant='filled',theme:ThemePreference='dark') {
  if(!(engine instanceof InMemoryTransactionalEngine))throw new Error('UI fixture requires InMemoryTransactionalEngine');
  const fixture=createUiFixture(variant,theme);
  for(const media of fixture.snapshot.mediaMeta){const blob=fixture.mediaBlobs.find(b=>b.id===media.id)!;media.sha256Hex=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',blob.bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');}
  await engine.runTransaction(Object.values(STORE_NAMES),'readwrite',async tx=>{
    for(const store of Object.values(STORE_NAMES))await tx.clear(store);
    for(const [key,records] of Object.entries(fixture.snapshot)){
      const store=STORE_NAMES[key as keyof typeof STORE_NAMES];
      if(!store)throw new Error(`Unknown fixture store: ${key}`);
      for(const record of Array.isArray(records)?records:[records])await tx.put(store,record);
    }
    for(const blob of fixture.mediaBlobs)await tx.put(STORE_NAMES.mediaBlobs,blob);
  });
  return fixture;
}
