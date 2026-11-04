import type { PlanuiDomainSnapshot, Task, TaskReservation } from './types';
import { getLocalDateBoundariesInZone } from './temporal';
import { resolveEffectiveLifeArea } from './plans';

/** Read-only projections retain the canonical task objects; never write derived lists. */
export function selectProjectTasks(snapshot: PlanuiDomainSnapshot, projectId: string): Task[] {
  return snapshot.tasks.filter(task => task.ownership.kind === 'project' && task.ownership.projectId === projectId);
}
export function selectDateTasks(snapshot: PlanuiDomainSnapshot, date: string, zone = snapshot.settings.timeZoneMode === 'manual' ? snapshot.settings.manualTimeZone ?? snapshot.settings.lastDetectedTimeZone : snapshot.settings.lastDetectedTimeZone): Task[] {
  const bounds = getLocalDateBoundariesInZone(date, zone);
  const timedIds = new Set(snapshot.reservations.filter(session => session.state === 'active' && Date.parse(session.interval.startInstant) < bounds.endMs && Date.parse(session.interval.endInstant) > bounds.startMs).map(session => session.taskId));
  return snapshot.tasks.filter(task => task.plannedDate === date || timedIds.has(task.id));
}
export const selectTodayTasks = selectDateTasks;
export const selectCalendarTasks = selectDateTasks;

/** Explicit review projection, without changing legacy lifecycle values in stored backups. */
export function selectTaskReviewState(task: Task, today: string, reservations: readonly TaskReservation[] = [], zone = 'UTC'): Task['state'] | 'needs_triage' {
  if (task.state !== 'open') return task.state;
  if (task.plannedDate !== null) return task.plannedDate < today ? 'needs_triage' : task.state;
  const sessions = reservations.filter(session => session.taskId === task.id && session.state === 'active');
  const dayStart = getLocalDateBoundariesInZone(today, zone).startMs;
  return sessions.length > 0 && sessions.every(session => Date.parse(session.interval.endInstant) <= dayStart) ? 'needs_triage' : task.state;
}
export function selectTaskLifeArea(snapshot: PlanuiDomainSnapshot, task: Task): string | null {
  const projectsById = new Map(snapshot.projects.map(project => [project.id, project]));
  const goalsById = new Map(snapshot.goals.map(goal => [goal.id, goal]));
  return resolveEffectiveLifeArea(task, { projectsById, goalsById, foldersById: new Map(snapshot.folders.map(folder => [folder.id, folder])) }).effectiveLifeAreaId;
}
export function selectShiftCount(snapshot: PlanuiDomainSnapshot): number {
  return new Set(snapshot.events.filter(event => event.type === 'work_shift' && event.state !== 'canceled').map(event => event.id)).size;
}

export function selectAmbientContext(snapshot: Pick<PlanuiDomainSnapshot, 'events'>, nowMs: number, directionName = ''): 'night' | 'creative' | 'neutral' {
  const quietWindow = snapshot.events.some(event => {
    if (event.state === 'canceled' || event.schedule.kind !== 'timed') return false;
    const interval = event.schedule.interval;
    const night = event.type === 'sleep' || (event.type === 'work_shift' && interval.originStartLocalDate !== interval.originEndLocalDate);
    return night && Date.parse(interval.startInstant) <= nowMs && nowMs < Date.parse(interval.endInstant);
  });
  if (quietWindow) return 'night';
  // Cosmetic context only; never alters classifications, schedules or stored data.
  return /творч|мистец|creative|art\b/iu.test(directionName) ? 'creative' : 'neutral';
}
