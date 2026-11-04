import {ProjectStage, RoadmapPeriod} from './types';
import {periodInterval} from './roadmap';
import {addDaysToLocalDate,diffCalendarDays} from './temporal';
import {PlanuiError} from '../i18n/errorsUk';
export function validateStageDependencies(stages:readonly ProjectStage[]):void {
 const byId=new Map(stages.map(stage=>[stage.id,stage]));const visiting=new Set<string>(),done=new Set<string>();
 const visit=(id:string)=>{if(visiting.has(id))throw new PlanuiError('VALIDATION_FAILED');if(done.has(id))return;const stage=byId.get(id);if(!stage)throw new PlanuiError('VALIDATION_FAILED');visiting.add(id);const deps=stage.dependsOnStageIds??[];if(!Array.isArray(deps)||new Set(deps).size!==deps.length)throw new PlanuiError('VALIDATION_FAILED');for(const dep of deps){if(typeof dep!=='string')throw new PlanuiError('VALIDATION_FAILED');const parent=byId.get(dep);if(!parent||parent.projectId!==stage.projectId||(parent.goalId??null)!==(stage.goalId??null))throw new PlanuiError('VALIDATION_FAILED');visit(dep);}visiting.delete(id);done.add(id);};for(const stage of stages)visit(stage.id);
}
export function shiftStagePeriod(period:RoadmapPeriod,days:number):RoadmapPeriod {
 const interval=periodInterval(period);return {precision:'range',startDate:addDaysToLocalDate(interval.startDate,days),endDateExclusive:addDaysToLocalDate(interval.endDateExclusive,days)};
}
export function previewStageShift(stages:readonly ProjectStage[],id:string,period:RoadmapPeriod|null):ProjectStage[] {
 validateStageDependencies(stages);const root=stages.find(stage=>stage.id===id);if(!root)throw new PlanuiError('ENTITY_NOT_FOUND');
 const affected=new Set([id]);let changed=true;while(changed){changed=false;for(const stage of stages)if(!affected.has(stage.id)&&(stage.dependsOnStageIds??[]).some(dep=>affected.has(dep))){affected.add(stage.id);changed=true;}}
 const days=root.roadmapPeriod&&period?diffCalendarDays(periodInterval(root.roadmapPeriod).startDate,periodInterval(period).startDate):0;
 return stages.filter(stage=>affected.has(stage.id)).map(stage=>stage.id===id?{...stage,roadmapPeriod:period}:{...stage,roadmapPeriod:stage.roadmapPeriod?shiftStagePeriod(stage.roadmapPeriod,days):stage.roadmapPeriod,targetDate:stage.targetDate?addDaysToLocalDate(stage.targetDate,days):stage.targetDate,checkpoints:stage.checkpoints?.map(point=>({...point,localDate:point.localDate?addDaysToLocalDate(point.localDate,days):null}))});
}
