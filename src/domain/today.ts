import { DailyPlan, Task, TaskReservation, TodayMode, ZonedInterval } from './types';
import { assertValidLocalDate, formatInstantInZone, getLocalDateBoundariesInZone, resolveLocalDateTimeToInstant } from './temporal';
import { PlanuiError } from '../i18n/errorsUk';

export const EMPTY_DAILY_PLAN: DailyPlan = { focusTaskIds: [], focusNoteUk: null, minimalDay: false };
export const EFFORT_LABELS_UK = { small: 'Невеликі', medium: 'Середні', large: 'Значні' } as const;

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

export function suggestFocusTasks(tasks: readonly Task[], reservations: readonly TaskReservation[], date: string, zone: string): Task[] {
  return projectTodayTasks(tasks, reservations, date, zone).relevant.filter(task => task.state === 'open').sort((a, b) => (deadlineDate(a, zone) ?? '9999-12-31').localeCompare(deadlineDate(b, zone) ?? '9999-12-31') || a.id.localeCompare(b.id)).slice(0, 3);
}

export interface PlanningChangePreview {
  taskId: string; taskRevision: number; nextDate: string | null; nowIso: string;
  previousDate: string | null;
  sessions: { id: string; revision: number; start: string; end: string; action: 'release_future' | 'truncate_current' | 'retain_history' }[];
}

export function previewPlanningChange(task: Task, reservations: readonly TaskReservation[], nextDate: string | null, nowIso: string): PlanningChangePreview {
  if (nextDate !== null) assertValidLocalDate(nextDate);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new PlanuiError('INVALID_INSTANT');
  return { taskId: task.id, taskRevision: task.revision, nextDate, nowIso, previousDate: task.plannedDate, sessions: reservations.filter(r => r.taskId === task.id && r.state === 'active').map(r => ({ id: r.id, revision: r.revision, start: r.interval.startInstant, end: r.interval.endInstant, action: Date.parse(r.interval.startInstant) >= now ? 'release_future' : Date.parse(r.interval.endInstant) > now ? 'truncate_current' : 'retain_history' })) };
}

export interface TodayInteraction { selectedDate: string; mode: TodayMode; scrollTop: number; hasInteraction: boolean }
export function restoreTodayInteraction(raw: string | null, today: string): TodayInteraction {
  const fallback: TodayInteraction = { selectedDate: today, mode: 'day', scrollTop: 0, hasInteraction: false };
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || !['day', 'tasks', 'habits'].includes(value.mode) || !Number.isFinite(value.scrollTop) || value.scrollTop < 0) return fallback;
    assertValidLocalDate(value.selectedDate);
    return { selectedDate: value.selectedDate, mode: value.mode, scrollTop: value.scrollTop, hasInteraction: true };
  } catch { return fallback; }
}
export function shouldRevealNow(context: TodayInteraction, actualToday: string): boolean {
  return context.selectedDate === actualToday && context.mode === 'day' && !context.hasInteraction && context.scrollTop === 0;
}

export function sessionFromDuration(date: string, time: string, minutes: number, zone: string): ZonedInterval {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new PlanuiError('VALIDATION_FAILED');
  const start = resolveLocalDateTimeToInstant(date, time, zone, 'reject');
  const endInstant = new Date(start.epochMs + minutes * 60000).toISOString();
  const end = formatInstantInZone(endInstant, zone);
  return { startInstant: start.instant, endInstant, originZone: zone, originStartLocalDate: date, originStartLocalTime: time, originEndLocalDate: end.localDate, originEndLocalTime: end.localTime };
}
