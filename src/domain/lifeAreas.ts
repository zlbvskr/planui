import { LifeAreaQuestion, LifeAreaAssessment, PlanuiDomainSnapshot, Task } from './types';
import { resolveEffectiveLifeArea } from './plans';
import { assertValidLocalDate, getLocalDateBoundariesInZone } from './temporal';
import { PlanuiError } from '../i18n/errorsUk';
import { resolveItemAreaId } from './modelHelpers';

export const AREA_METRIC_CONSTANTS = {
  dayMs: 86_400_000,
  weekDays: 7,
  ageCapDays: 30,
  minScore: 1,
  maxScore: 10,
  balanceMaxDeviation: 5,
  weights: { score: 0.45, neglect: 0.15, stale: 0.10, share: 0.10, focus: 0.20 },
} as const;

type AreaRating = Pick<LifeAreaQuestion, 'id' | 'rating' | 'ratedAt' | 'focus'>;

/** Chronological scored answers only; a skipped answer does not erase previous history. */
function areaHistory(id: string, history: readonly LifeAreaAssessment[], now?: string) {
  const until = now === undefined ? Infinity : Date.parse(now);
  return history.flatMap(review => {
    const at = Date.parse(review.recordedAt);
    const answer = review.answers.find(a => a.questionId === id);
    return Number.isFinite(at) && at <= until && validAreaScore(answer?.score)
      ? [{ score: answer!.score!, at }]
      : [];
  }).sort((a, b) => a.at - b.at);
}

function validAreaScore(score: number | null | undefined): score is number {
  // Stored assessments support 0, even though the legacy color ramp starts at 1.
  return score != null && Number.isFinite(score) && score >= 0 && score <= AREA_METRIC_CONSTANTS.maxScore;
}

/** Difference between the two latest scored assessments; null means insufficient history. */
export function areaTrend(id: string, history: readonly LifeAreaAssessment[], now?: string): number | null {
  const scores = areaHistory(id, history, now);
  return scores.length < 2 ? null : scores.at(-1)!.score - scores.at(-2)!.score;
}

function elapsedDays(at: number | undefined, now: string): number {
  const until = Date.parse(now);
  if (!Number.isFinite(until)) throw new PlanuiError('VALIDATION_FAILED');
  return at === undefined ? Infinity : Math.max(0, Math.floor((until - at) / AREA_METRIC_CONSTANTS.dayMs));
}

/** Full elapsed days since a scored assessment or ratedAt; Infinity means never rated. */
export function areaStaleDays(area: AreaRating, history: readonly LifeAreaAssessment[], now: string): number {
  const latest = areaHistory(area.id, history, now).at(-1)?.at;
  const ratedAt = area.ratedAt ? Date.parse(area.ratedAt) : NaN;
  const saved = validAreaScore(area.rating) && Number.isFinite(ratedAt) && ratedAt <= Date.parse(now) ? ratedAt : undefined;
  return elapsedDays(latest === undefined ? saved : Math.max(latest, saved ?? -Infinity), now);
}

export type AreaActivitySource = Pick<PlanuiDomainSnapshot, 'tasks' | 'habits' | 'habitEntries' | 'folders' | 'goals' | 'projects'>;

function areaCompletions(source: AreaActivitySource, now: string, zone: string) {
  const until = Date.parse(now);
  if (!Number.isFinite(until)) throw new PlanuiError('VALIDATION_FAILED');
  const result: { areaId: string | undefined; at: number }[] = [];
  for (const task of source.tasks) {
    const at = Date.parse(task.completedAt ?? '');
    if (task.state === 'completed' && Number.isFinite(at) && at <= until) {
      result.push({ areaId: resolveItemAreaId(task, source), at });
    }
  }
  // Keep the latest revision per occurrence, so edits cannot double-count a habit day.
  const entries = new Map<string, PlanuiDomainSnapshot['habitEntries'][number]>();
  for (const entry of source.habitEntries) {
    if (Date.parse(entry.recordedAt) > until) continue;
    const key = `${entry.habitId}:${entry.localDate}`;
    const previous = entries.get(key);
    if (!previous || entry.revision > previous.revision ||
      (entry.revision === previous.revision && entry.updatedAt > previous.updatedAt)) entries.set(key, entry);
  }
  for (const entry of entries.values()) {
    const habit = source.habits.find(h => h.id === entry.habitId);
    if (!habit || entry.status !== 'completed') continue;
    // Use the occurrence date, not the date of a later retrospective entry.
    const at = getLocalDateBoundariesInZone(entry.localDate, zone).startMs;
    if (at > until) continue;
    const ownership = habit.projectId ? { kind: 'project' as const, projectId: habit.projectId, stageId: null } : undefined;
    result.push({ areaId: resolveItemAreaId({ ...habit, ownership }, source), at });
  }
  return result;
}

/** Full days without a completed task/habit, including inherited areas; Infinity means no steps. */
export function areaNeglectDays(id: string, source: AreaActivitySource, now: string, zone = 'UTC'): number {
  const times = areaCompletions(source, now, zone).filter(c => c.areaId === id).map(c => c.at);
  return elapsedDays(times.length ? Math.max(...times) : undefined, now);
}

/** Share of all completions in the trailing 7 days (unassigned completions count in the total). */
export function weekShare(id: string, source: AreaActivitySource, now: string, zone = 'UTC'): number {
  const from = Date.parse(now) - AREA_METRIC_CONSTANTS.weekDays * AREA_METRIC_CONSTANTS.dayMs;
  const completions = areaCompletions(source, now, zone).filter(c => c.at > from);
  return completions.length ? completions.filter(c => c.areaId === id).length / completions.length : 0;
}

/** 0..1 evenness: 1 - population standard deviation / 5; excludes unrated areas.
 * null means fewer than two ratings. Equal low scores are balanced, not necessarily healthy.
 */
export function balanceIndex(scores: readonly (number | null | undefined)[]): number | null {
  const rated = scores.filter(validAreaScore);
  if (rated.length < 2) return null;
  const mean = rated.reduce((sum, score) => sum + score, 0) / rated.length;
  const variance = rated.reduce((sum, score) => sum + (score - mean) ** 2, 0) / rated.length;
  return Math.max(0, 1 - Math.sqrt(variance) / AREA_METRIC_CONSTANTS.balanceMaxDeviation);
}

export interface AreaPriorityInput {
  score: number | null | undefined;
  neglectDays: number;
  staleDays: number;
  weekShare: number;
  focus?: boolean | null;
}

/** Formula from SPEC §4.3, including stored zero scores; unrated returns 1. */
export function areaPriority(input: AreaPriorityInput): number {
  if (!validAreaScore(input.score)) return 1;
  const c = AREA_METRIC_CONSTANTS;
  const age = (days: number) => Number.isNaN(days) ? 0 : Math.min(c.ageCapDays, Math.max(0, days)) / c.ageCapDays;
  const share = Number.isFinite(input.weekShare) ? Math.min(1, Math.max(0, input.weekShare)) : 0;
  return c.weights.score * (c.maxScore - input.score) / (c.maxScore - c.minScore)
    + c.weights.neglect * age(input.neglectDays)
    + c.weights.stale * age(input.staleDays)
    + c.weights.share * (1 - share)
    + c.weights.focus * (input.focus ? 1 : 0);
}

/** Explanation follows the largest weighted contribution, with stable tie ordering. */
export function areaPriorityReason(input: AreaPriorityInput): string {
  if (!validAreaScore(input.score)) return 'Оцінити';
  const c = AREA_METRIC_CONSTANTS;
  const age = (days: number) => Number.isNaN(days) ? 0 : Math.min(c.ageCapDays, Math.max(0, days)) / c.ageCapDays;
  const daysText = (days: number, never: string, suffix: string) => Number.isFinite(days) ? `${Math.max(0, Math.floor(days))} дн. ${suffix}` : never;
  const reasons = [
    { weight: c.weights.score * (c.maxScore - input.score) / (c.maxScore - c.minScore), text: `${input.score}/10 · ${daysText(input.neglectDays, 'ще без кроків', 'без кроків')}` },
    { weight: c.weights.neglect * age(input.neglectDays), text: daysText(input.neglectDays, 'Ще без кроків', 'без кроків') },
    { weight: c.weights.stale * age(input.staleDays), text: daysText(input.staleDays, 'Час оновити оцінку', 'без оцінки') },
    { weight: c.weights.share * (1 - Math.min(1, Math.max(0, input.weekShare || 0))), text: 'Мало кроків цього тижня' },
    { weight: c.weights.focus * (input.focus ? 1 : 0), text: 'У твоєму фокусі' },
  ];
  return reasons.sort((a, b) => b.weight - a.weight)[0].text;
}

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

export type LifeLinkKind = 'folder' | 'goal' | 'project' | 'task' | 'habit' | 'event' | 'reservation' | 'inspiration';
export interface LifeAreaLink { kind: LifeLinkKind; id: string; title: string; revision: number; effectiveId: string | null; directId: string | null; inheritedId: string | null; taskId?: string; projectId?: string }
export type LifeLinkSource = Pick<PlanuiDomainSnapshot, 'folders' | 'goals' | 'projects' | 'tasks' | 'habits' | 'events' | 'reservations'> & Partial<Pick<PlanuiDomainSnapshot, 'inspirationItems'>>;
export function projectLifeAreaLinks(snapshot: LifeLinkSource): LifeAreaLink[] {
  const context = { foldersById: new Map(snapshot.folders.map(f => [f.id, f])), goalsById: new Map(snapshot.goals.map(g => [g.id, g])), projectsById: new Map(snapshot.projects.map(p => [p.id, p])) };
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
  for (const i of snapshot.inspirationItems ?? []) add('inspiration', i, i.title ?? i.contentText ?? 'Матеріал');
  for (const e of snapshot.events) add('event', e, e.title);
  for (const r of snapshot.reservations) {
    const task = snapshot.tasks.find(t => t.id === r.taskId);
    const parent = task ? result.get(`task:${task.id}`) : (r.habitOccurrence ? result.get(`habit:${r.habitOccurrence.habitId}`) : undefined);
    result.set(`reservation:${r.id}`, { kind: 'reservation', id: r.id, title: task?.title ?? 'Запланована дія', revision: r.revision, effectiveId: parent?.effectiveId ?? null, directId: null, inheritedId: parent?.effectiveId ?? null, taskId: r.taskId ?? undefined });
  }
  return [...result.values()];
}
export function directMergeLinks(snapshot: LifeLinkSource, sourceId: string): LifeAreaLink[] {
  return projectLifeAreaLinks(snapshot).filter(link => link.directId === sourceId).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
export function lifeAreaMergeSignature(snapshot: LifeLinkSource, sourceId: string): string {
  return JSON.stringify(projectLifeAreaLinks(snapshot).filter(link => link.effectiveId === sourceId).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)).map(link => [link.kind, link.id, link.revision, link.directId, link.inheritedId]));
}
