import type { LifeAreaQuestion, LifeAreaAssessment, PlanuiDomainSnapshot, Measure } from './types';
import { areaStaleDays, balanceIndex } from './lifeAreas';
import { resolveItemAreaId } from './modelHelpers';
import { addDaysToLocalDate, formatInstantInZone } from './temporal';
export type SphereState = LifeAreaQuestion & {
  score: number | null;
  trend: number | null;
  stale: boolean;
  previousScore: number | null;
};
const valid = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n >= 0 && n <= 10;
/** Presentation model: current valid rating and the last known score at least 30 days ago. */
export function sphereStates(
  areas: readonly LifeAreaQuestion[],
  history: readonly LifeAreaAssessment[],
  now: string,
): SphereState[] {
  const until = Date.parse(now),
    cutoff = until - 30 * 86400000;
  return areas
    .filter((a) => !a.archived && !a.mergedIntoId)
    .sort((a, b) => a.order - b.order)
    .map((area) => {
      const points: { score: number; at: number }[] = history.flatMap(
        (review) =>
          review.answers
            .filter(
              (a) =>
                a.questionId === area.id &&
                valid(a.score) &&
                Date.parse(review.recordedAt) <= until,
            )
            .map((a) => ({
              score: a.score!,
              at: Date.parse(review.recordedAt),
            })),
      );
      if (
        valid(area.rating) &&
        area.ratedAt &&
        Date.parse(area.ratedAt) <= until
      )
        points.push({ score: area.rating, at: Date.parse(area.ratedAt) });
      points.sort((a, b) => b.at - a.at);
      const score =
        points[0]?.score ??
        (valid(area.rating) && !area.ratedAt ? area.rating : null);
      const previousScore = points.find((p) => p.at <= cutoff)?.score ?? null;
      return {
        ...area,
        score,
        previousScore,
        trend:
          score != null && previousScore != null ? score - previousScore : null,
        stale: areaStaleDays(area, history, now) > 21,
      };
    });
}
export function sphereBalance(
  areas: readonly SphereState[],
  previous = false,
): number | null {
  const value = balanceIndex(
    areas.map((a) => (previous ? a.previousScore : a.score)),
  );
  return value == null ? null : value * 10;
}

export function measurePercent(measure: Measure): number | null {
  if (
    measure.target == null ||
    !Number.isFinite(measure.target) ||
    measure.target < 0 ||
    !Number.isFinite(measure.current)
  )
    return null;
  if (measure.direction === "less") {
    if (measure.current <= measure.target) return 100;
    const initial =
      measure.current - measure.log.reduce((sum, item) => sum + item.delta, 0);
    return initial > measure.target
      ? Math.max(
          0,
          Math.min(
            100,
            ((initial - measure.current) / (initial - measure.target)) * 100,
          ),
        )
      : 0;
  }
  return measure.target > 0
    ? Math.max(0, Math.min(100, (measure.current / measure.target) * 100))
    : measure.current === 0
      ? 100
      : null;
}
export function measureSeries(measure: Measure): number[] {
  const log = [...measure.log]
    .filter(
      (e) => Number.isFinite(e.delta) && Number.isFinite(Date.parse(e.ts)),
    )
    .sort((a, b) => a.ts.localeCompare(b.ts));
  let value = measure.current - log.reduce((sum, e) => sum + e.delta, 0);
  return [value, ...log.map((e) => (value += e.delta))];
}
/** Weekly cells show only actual assessments in that week. Missing observations remain null. */
export function sphereWeeks(
  areas: readonly LifeAreaQuestion[],
  history: readonly LifeAreaAssessment[],
  today: string,
  zone: string,
  weeks = 12,
) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDaysToLocalDate(today, -((weekday + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDaysToLocalDate(monday, (i - weeks + 1) * 7),
      end = addDaysToLocalDate(start, 6);
    const reviews = history
      .filter((r) => {
        const day = formatInstantInZone(r.recordedAt, zone).localDate;
        return day >= start && day <= end && day <= today;
      })
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const scores = areas.map(
      (area) =>
        reviews
          .flatMap((r) => r.answers)
          .find((a) => a.questionId === area.id && valid(a.score))?.score ??
        null,
    );
    const balance = balanceIndex(scores);
    return {
      start,
      end,
      scores,
      balance: balance == null ? null : balance * 10,
    };
  });
}
export function sphereActivity(
  snapshot: PlanuiDomainSnapshot,
  from: string,
  now: string,
) {
  const start = Date.parse(from),
    until = Date.parse(now);
  const context = {
    folders: snapshot.folders,
    goals: snapshot.goals,
    projects: snapshot.projects,
  };
  const completions: { areaId: string | undefined; kind: "task" | "habit" }[] =
    [];
  for (const task of snapshot.tasks)
    if (
      task.state === "completed" &&
      Date.parse(task.completedAt ?? "") >= start &&
      Date.parse(task.completedAt ?? "") <= until
    )
      completions.push({
        areaId: resolveItemAreaId(task, context),
        kind: "task",
      });
  const latest = new Map<
    string,
    PlanuiDomainSnapshot["habitEntries"][number]
  >();
  for (const e of snapshot.habitEntries) {
    if (Date.parse(e.recordedAt) > until) continue;
    const key = `${e.habitId}:${e.localDate}`,
      old = latest.get(key);
    if (
      !old ||
      e.revision > old.revision ||
      (e.revision === old.revision && e.updatedAt > old.updatedAt)
    )
      latest.set(key, e);
  }
  const habitStats: { areaId: string | undefined; completed: boolean }[] = [];
  for (const e of latest.values()) {
    const day = Date.parse(`${e.localDate}T12:00:00Z`),
      habit = snapshot.habits.find((h) => h.id === e.habitId);
    if (!habit || day < start || day > until || e.status === "skipped")
      continue;
    const areaId = resolveItemAreaId(habit, context);
    habitStats.push({ areaId, completed: e.status === "completed" });
    if (e.status === "completed") completions.push({ areaId, kind: "habit" });
  }
  const measures = [
    ...snapshot.tasks.map((e) => ({ ...e, label: e.title })),
    ...snapshot.habits.map((e) => ({ ...e, label: e.name })),
    ...snapshot.projects.map((e) => ({ ...e, label: e.title })),
    ...snapshot.goals.map((e) => ({ ...e, label: e.title })),
    ...snapshot.wishes.map((e) => ({ ...e, label: e.title })),
  ]
    .filter((e) => e.measure)
    .map((e) => ({
      id: e.id,
      label: e.label,
      areaId: resolveItemAreaId(e, context),
      measure: e.measure!,
      delta: e
        .measure!.log.filter(
          (l) => Date.parse(l.ts) >= start && Date.parse(l.ts) <= until,
        )
        .reduce((sum, l) => sum + l.delta, 0),
    }));
  return { completions, habitStats, measures };
}

export interface MeasureDraft {
  unit: string;
  target: string;
  current: string;
  direction: "more" | "less";
}
export function configureMeasure(
  existing: Measure | null | undefined,
  draft: MeasureDraft,
  now = new Date().toISOString(),
): Measure | null {
  if (!draft.unit.trim()) return null;
  const parse = (value: string) =>
    Number(value.trim().replace(/\s/g, "").replace(",", "."));
  const current = parse(draft.current || "0"),
    target = draft.target.trim() ? parse(draft.target) : null;
  if (
    !Number.isFinite(current) ||
    current < 0 ||
    (target != null && (!Number.isFinite(target) || target < 0))
  )
    throw new Error("Значення виміру мають бути невід’ємними числами.");
  const delta = current - (existing?.current ?? current);
  return {
    unit: draft.unit.trim(),
    current,
    target,
    direction: draft.direction,
    log: [...(existing?.log ?? []), ...(delta ? [{ ts: now, delta }] : [])],
  };
}
