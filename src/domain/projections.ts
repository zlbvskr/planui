import type { PlanuiDomainSnapshot, Task } from './types';
import { getLocalDateBoundariesInZone } from './temporal';
import { resolveEffectiveLifeArea } from './plans';

/** Read-only projections retain the canonical task objects; never write derived lists. */
export function selectProjectTasks(snapshot: PlanuiDomainSnapshot, projectId: string): Task[] {
  return snapshot.tasks.filter(task => task.ownership.kind === 'project' && task.ownership.projectId === projectId);
}
export function selectDateTasks(snapshot: PlanuiDomainSnapshot, date: string, zone = snapshot.settings.lastDetectedTimeZone): Task[] {
  const bounds = getLocalDateBoundariesInZone(date, zone);
  const timedIds = new Set(snapshot.reservations.filter(session => session.state === 'active' && Date.parse(session.interval.startInstant) < bounds.endMs && Date.parse(session.interval.endInstant) > bounds.startMs).map(session => session.taskId));
  return snapshot.tasks.filter(task => task.plannedDate === date || timedIds.has(task.id));
}
export const selectTodayTasks = selectDateTasks;
export const selectCalendarTasks = selectDateTasks;

/** Explicit review projection, without changing legacy lifecycle values in stored backups. */
export function selectTaskReviewState(task: Task, today: string): Task['state'] | 'needs_triage' {
  return task.state === 'open' && task.plannedDate !== null && task.plannedDate < today ? 'needs_triage' : task.state;
}
export function selectTaskLifeArea(snapshot: PlanuiDomainSnapshot, task: Task): string | null {
  const projectsById = new Map(snapshot.projects.map(project => [project.id, project]));
  const goalsById = new Map(snapshot.goals.map(goal => [goal.id, goal]));
  const resolved = resolveEffectiveLifeArea(task, { projectsById, goalsById });
  if (resolved.effectiveLifeAreaId) return resolved.effectiveLifeAreaId;
  const owner = task.ownership;
  const project = owner.kind === 'project' ? projectsById.get(owner.projectId) : undefined;
  const goal = owner.kind === 'goal' ? goalsById.get(owner.goalId) : project?.goalId ? goalsById.get(project.goalId) : undefined;
  const folderId = owner.kind === 'folder' || owner.kind === 'standalone' ? owner.folderId : project?.folderId ?? goal?.folderId;
  return snapshot.folders.find(folder => folder.id === folderId)?.lifeAreaId ?? null;
}
export function selectShiftCount(snapshot: PlanuiDomainSnapshot): number {
  return new Set(snapshot.events.filter(event => event.type === 'work_shift' && event.state !== 'canceled').map(event => event.id)).size;
}
