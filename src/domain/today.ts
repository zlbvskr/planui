import { DailyPlan, Task, TaskReservation } from './types';
import { assertValidLocalDate, formatInstantInZone, getLocalDateBoundariesInZone } from './temporal';
import { PlanuiError } from '../i18n/errorsUk';

export const EMPTY_DAILY_PLAN: DailyPlan = { focusTaskIds: [], focusNoteUk: null, minimalDay: false };

export function validateDailyPlans(plans: unknown): void {
  if (plans === undefined) return;
  if (!plans || typeof plans !== 'object' || Array.isArray(plans)) throw new PlanuiError('VALIDATION_FAILED');
  for (const [date, plan] of Object.entries(plans)) {
    assertValidLocalDate(date);
    const p = plan as DailyPlan;
    if (!p || !Array.isArray(p.focusTaskIds) || p.focusTaskIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(p.focusTaskIds).size !== p.focusTaskIds.length || (p.focusNoteUk !== null && typeof p.focusNoteUk !== 'string') || typeof p.minimalDay !== 'boolean') throw new PlanuiError('VALIDATION_FAILED');
  }
}

export function deadlineDate(task: Task, zone: string): string | null {
  return !task.deadline ? null : task.deadline.kind === 'date_only' ? task.deadline.localDate : formatInstantInZone(task.deadline.instant, zone).localDate;
}

/** Explicit review projection, without changing legacy lifecycle values in stored backups. */
export function selectTaskReviewState(
  task: Task,
  today: string,
  reservations: readonly TaskReservation[] = [],
  zone = 'UTC'
): Task['state'] | 'needs_triage' {
  if (task.state !== 'open') return task.state;
  if (task.plannedDate !== null) return task.plannedDate < today ? 'needs_triage' : task.state;
  const sessions = reservations.filter(session => session.taskId === task.id && session.state === 'active');
  const dayStart = getLocalDateBoundariesInZone(today, zone).startMs;
  return sessions.length > 0 && sessions.every(session => Date.parse(session.interval.endInstant) <= dayStart) ? 'needs_triage' : task.state;
}

export function projectTodayTasks(tasks: readonly Task[], reservations: readonly TaskReservation[], date: string, zone: string, plan: DailyPlan = EMPTY_DAILY_PLAN): { relevant: Task[]; visible: Task[]; hiddenCount: number } {
  const bounds = getLocalDateBoundariesInZone(date, zone);
  const sessionIds = new Set(reservations.filter(r => {
    const start = Date.parse(r.interval.startInstant);
    const end = Date.parse(r.interval.endInstant);
    // Released future placeholders belong in history, not the day's commitments.
    const retained = r.state === 'active' || (r.state === 'released' && r.releaseMetadata !== null && Date.parse(r.releaseMetadata.releasedAt) > start);
    return retained && start < bounds.endMs && end > bounds.startMs;
  }).map(r => r.taskId));
  const relevant = tasks.filter(t => {
    const due = deadlineDate(t, zone);
    return t.state !== 'canceled' && (t.plannedDate === date || sessionIds.has(t.id) || due === date || (t.state === 'open' && due !== null && due < date) || plan.focusTaskIds.includes(t.id));
  });
  const optional = relevant.find(t => t.state === 'open' && t.effort === 'small' && plan.focusTaskIds.includes(t.id) && !t.deadline && !sessionIds.has(t.id));
  const visible = plan.minimalDay ? relevant.filter(t => !!t.deadline || sessionIds.has(t.id) || t.id === optional?.id) : relevant;
  return { relevant, visible, hiddenCount: relevant.length - visible.length };
}

