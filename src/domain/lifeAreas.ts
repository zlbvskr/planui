import { LifeAreaQuestion, LifeAreaAssessment, PlanuiDomainSnapshot, Goal, Project, Task, TaskReservation } from './types';
import { resolveEffectiveLifeArea } from './plans';
import { assertValidLocalDate, addDaysToLocalDate, getLocalDateBoundariesInZone } from './temporal';
import { calculateWindowAvailability } from './scheduling';
import { deadlineDate } from './today';
import { PlanuiError } from '../i18n/errorsUk';

export const STARTER_LIFE_AREAS = [
  ['physical', 'Фізичне здоров’я'], ['mental', 'Психічний стан'],
  ['recovery', 'Відновлення та особистий час'], ['relationships', 'Стосунки та близькість'],
  ['creativity', 'Творчість і самовираження'], ['work', 'Робота та професійний шлях'],
  ['finances', 'Фінанси та матеріальна стабільність'], ['learning', 'Навчання та розвиток'],
  ['home', 'Дім, побут і середовище'], ['meaning', 'Сенс, цінності та свобода вибору'],
] as const;
export const SATISFACTION_QUESTION_UK = 'Наскільки мене влаштовує ця сфера?';
export function createStarterAreas(now: string): LifeAreaQuestion[] {
  return STARTER_LIFE_AREAS.map(([key, title], order) => ({ id: `life-q-${order + 1}`, questionTextUk: title, starterKeys: [key], archived: false, mergedIntoId: null, goodEnoughUk: null, order, version: 1, revision: 1, updatedAt: now }));
}

export interface ReviewAnswerDraft { score: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | null; attentionNow: boolean | null; usefulChangeUk: string | null }
export function buildLifeReview(id: string, areas: readonly LifeAreaQuestion[], drafts: Record<string, ReviewAnswerDraft>, start: string, end: string, now: string): LifeAreaAssessment {
  assertValidLocalDate(start); assertValidLocalDate(end);
  if (start > end) throw new PlanuiError('VALIDATION_FAILED');
  return { id, scale: { min: 0, max: 10, labelUk: 'Задоволеність: 0–10' }, recordedAt: now, periodStartLocalDate: start, periodEndLocalDate: end,
    answers: areas.filter(a => !a.archived && !a.mergedIntoId).map(a => ({ questionId: a.id, questionTextSnapshotUk: a.questionTextUk, questionVersionSnapshot: a.version, score: drafts[a.id]?.score ?? null, note: null, attentionNow: drafts[a.id]?.attentionNow ?? null, usefulChangeUk: drafts[a.id]?.usefulChangeUk ?? null, definitionSnapshotUk: a.goodEnoughUk ?? null, satisfactionQuestionSnapshotUk: SATISFACTION_QUESTION_UK })), createdAt: now, updatedAt: now, revision: 1 };
}

export type LifeLinkKind = 'folder' | 'goal' | 'project' | 'task' | 'habit' | 'event' | 'reservation';
export interface LifeAreaLink { kind: LifeLinkKind; id: string; title: string; revision: number; effectiveId: string | null; directId: string | null; inheritedId: string | null; taskId?: string; projectId?: string }
export type LifeLinkSource = Pick<PlanuiDomainSnapshot, 'folders' | 'goals' | 'projects' | 'tasks' | 'habits' | 'events' | 'reservations'>;
export function projectLifeAreaLinks(snapshot: LifeLinkSource): LifeAreaLink[] {
  const context = { goalsById: new Map(snapshot.goals.map(g => [g.id, g])), projectsById: new Map(snapshot.projects.map(p => [p.id, p])) };
  const result = new Map<string, LifeAreaLink>();
  function add(kind: LifeLinkKind, record: { id: string; revision: number; lifeAreaId?: string | null }, title: string, inherited?: { goalId?: string | null; ownership?: Task['ownership'] }, taskId?: string, projectId?: string) {
    const resolved = resolveEffectiveLifeArea({ ...record, ...inherited }, context);
    result.set(`${kind}:${record.id}`, { kind, id: record.id, title, revision: record.revision, effectiveId: resolved.effectiveLifeAreaId, directId: resolved.directLifeAreaId, inheritedId: resolved.inheritedLifeAreaId, taskId, projectId });
  }
  for (const f of snapshot.folders) add('folder', f, f.name);
  for (const g of snapshot.goals) add('goal', g, g.title);
  for (const p of snapshot.projects) add('project', p, p.title, { goalId: p.goalId });
  for (const t of snapshot.tasks) add('task', t, t.title, { ownership: t.ownership });
  for (const h of snapshot.habits) add('habit', h, h.name, h.projectId ? { ownership: { kind: 'project', projectId: h.projectId, stageId: null } } : undefined);
  for (const e of snapshot.events) add('event', e, e.title);
  for (const r of snapshot.reservations) {
    const task = snapshot.tasks.find(t => t.id === r.taskId);
    const parent = task && result.get(`task:${task.id}`);
    result.set(`reservation:${r.id}`, { kind: 'reservation', id: r.id, title: task?.title ?? 'Запланована дія', revision: r.revision, effectiveId: parent?.effectiveId ?? null, directId: null, inheritedId: parent?.effectiveId ?? null, taskId: r.taskId });
  }
  return [...result.values()];
}
export function directMergeLinks(snapshot: LifeLinkSource, sourceId: string): LifeAreaLink[] {
  return projectLifeAreaLinks(snapshot).filter(link => link.directId === sourceId).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
export function lifeAreaMergeSignature(snapshot: LifeLinkSource, sourceId: string): string {
  return JSON.stringify(projectLifeAreaLinks(snapshot).filter(link => link.effectiveId === sourceId).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)).map(link => [link.kind, link.id, link.revision, link.directId, link.inheritedId]));
}

export function projectPlanningReview(snapshot: LifeLinkSource, start: string, endInclusive: string, zone: string) {
  assertValidLocalDate(start); assertValidLocalDate(endInclusive);
  if (start > endInclusive) throw new PlanuiError('VALIDATION_FAILED');
  const from = getLocalDateBoundariesInZone(start, zone), to = getLocalDateBoundariesInZone(addDaysToLocalDate(endInclusive, 1), zone);
  const events = snapshot.events.filter(event => {
    if (event.state !== 'active') return false;
    const schedule = event.schedule;
    const eventStart = schedule.kind === 'timed' ? Date.parse(schedule.interval.startInstant) : getLocalDateBoundariesInZone(schedule.startLocalDate, schedule.originZone).startMs;
    const eventEnd = schedule.kind === 'timed' ? Date.parse(schedule.interval.endInstant) : getLocalDateBoundariesInZone(schedule.endLocalDateExclusive, schedule.originZone).startMs;
    return eventStart < to.startMs && eventEnd > from.startMs;
  });
  return {
    events,
    reservations: snapshot.reservations.filter(r => r.state === 'active' && Date.parse(r.interval.startInstant) < to.startMs && Date.parse(r.interval.endInstant) > from.startMs),
    datedTasks: snapshot.tasks.filter(t => { const due = deadlineDate(t, zone); return t.state === 'open' && ((t.plannedDate !== null && t.plannedDate >= start && t.plannedDate <= endInclusive) || (due !== null && due >= start && due <= endInclusive)); }),
    availability: calculateWindowAvailability({ windowStartInstant: from.startInstant, windowEndInstant: to.startInstant, displayZone: zone, tasks: snapshot.tasks, events: snapshot.events, reservations: snapshot.reservations }),
  };
}
