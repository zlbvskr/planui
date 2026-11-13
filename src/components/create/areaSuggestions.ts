import type { PlanuiDomainSnapshot } from '../../domain/types';
import { areaNeglectDays, areaPriority, areaPriorityReason, areaStaleDays, weekShare } from '../../domain/lifeAreas';

// View model only: reuse the existing metrics without changing persisted questions.
export function createAreaSuggestions(snapshot: PlanuiDomainSnapshot, now: string, zone: string) {
  return snapshot.lifeAreaQuestions.filter(area => !area.archived && !area.mergedIntoId).map(area => {
    const latest = snapshot.lifeAreaAssessments.filter(review => review.recordedAt <= now).flatMap(review => review.answers.filter(answer => answer.questionId === area.id && answer.score != null && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= 10).map(answer => ({ score: answer.score!, at: review.recordedAt }))).sort((a, b) => b.at.localeCompare(a.at))[0];
    const rating = latest && (!area.ratedAt || latest.at >= area.ratedAt) ? latest.score : area.rating ?? null;
    const input = { score: rating, focus: area.focus, neglectDays: areaNeglectDays(area.id, snapshot, now, zone), staleDays: areaStaleDays(area, snapshot.lifeAreaAssessments, now), weekShare: weekShare(area.id, snapshot, now, zone) };
    return { ...area, rating, priority: areaPriority(input), priorityReason: areaPriorityReason(input) };
  }).sort((a, b) => b.priority - a.priority || a.order - b.order);
}
