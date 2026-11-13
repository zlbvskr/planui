import { Goal, Project, ProjectStage, RoadmapMetadata, RoadmapPeriod, RoadmapOwner, RoadmapLayer, PlanningEntityState, Folder, Task } from './types';
import { addMonthsToLocalDate, assertValidLocalDate } from './temporal';
import { PlanuiError } from '../i18n/errorsUk';

export function periodInterval(period: RoadmapPeriod): { startDate: string; endDateExclusive: string } {
  if (!period || typeof period !== 'object') throw new PlanuiError('VALIDATION_FAILED');
  if (period.precision === 'range') {
    assertValidLocalDate(period.startDate);
    assertValidLocalDate(period.endDateExclusive);
    if (period.startDate >= period.endDateExclusive) throw new PlanuiError('INVALID_HALF_OPEN_INTERVAL');
    return { startDate: period.startDate, endDateExclusive: period.endDateExclusive };
  }
  let startDate: string;
  if (period.precision === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period.month)) {
    startDate = `${period.month}-01`;
  } else if (period.precision === 'quarter' && Number.isInteger(period.year) && period.year >= 1 && period.year <= 9998 && [1, 2, 3, 4].includes(period.quarter)) {
    startDate = `${String(period.year).padStart(4, '0')}-${String((period.quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  } else throw new PlanuiError('VALIDATION_FAILED');
  assertValidLocalDate(startDate);
  return { startDate, endDateExclusive: addMonthsToLocalDate(startDate, period.precision === 'month' ? 1 : 3) };
}

export function validateRoadmapMetadata(record: RoadmapMetadata): void {
  if (record.roadmapPeriod !== undefined && record.roadmapPeriod !== null) periodInterval(record.roadmapPeriod);
  if (record.checkpoints === undefined) return;
  if (!Array.isArray(record.checkpoints)) throw new PlanuiError('VALIDATION_FAILED');
  const ids = new Set<string>();
  for (const point of record.checkpoints) {
    if (!point || typeof point.id !== 'string' || !point.id.trim() || ids.has(point.id) || typeof point.title !== 'string' || !point.title.trim() || !Number.isFinite(point.order)) throw new PlanuiError('VALIDATION_FAILED');
    ids.add(point.id);
    if (point.localDate !== null) assertValidLocalDate(point.localDate);
  }
}

export interface RoadmapSource { goals: readonly Goal[]; projects: readonly Project[]; stages: readonly ProjectStage[]; folders?: readonly Folder[]; tasks?: readonly Task[] }
export interface RoadmapItem {
  owner: RoadmapOwner; record: Goal | Project | ProjectStage; title: string; state: PlanningEntityState;
  folderId: string | null; deadline: string | null; parent: RoadmapOwner | null;
}

export function projectRoadmap(source: RoadmapSource, states: readonly PlanningEntityState[] = ['active']): RoadmapItem[] {
  const goals = new Map(source.goals.map(g => [g.id, g]));
  const projects = new Map(source.projects.map(p => [p.id, p]));
  const items: RoadmapItem[] = [];
  for (const g of source.goals) if (!g.archived && states.includes(g.state)) items.push({ owner: { kind: 'goal', id: g.id }, record: g, title: g.title, state: g.state, folderId: g.folderId, deadline: g.timing?.targetDate ?? null, parent: null });
  for (const p of source.projects) if (!p.archived && states.includes(p.state)) items.push({ owner: { kind: 'project', id: p.id }, record: p, title: p.title, state: p.state, folderId: p.folderId ?? (p.goalId ? goals.get(p.goalId)?.folderId : null) ?? null, deadline: p.targetDate, parent: p.goalId ? { kind: 'goal', id: p.goalId } : null });
  for (const s of [...source.stages].sort((a, b) => a.order - b.order)) {
    const parent = s.projectId ? projects.get(s.projectId) : goals.get(s.goalId ?? '');
    const goalId = s.projectId ? (parent as Project | undefined)?.goalId : null;
    const folderId = parent?.folderId ?? (goalId ? goals.get(goalId)?.folderId : null) ?? null;
    if (parent && !parent.archived && states.includes(parent.state)) items.push({ owner: { kind: 'stage', id: s.id }, record: s, title: s.title, state: parent.state, folderId, deadline: s.targetDate, parent: { kind: s.projectId ? 'project' : 'goal', id: parent.id } });
  }
  return items;
}

export interface RoadmapMarker { key: string; item: RoadmapItem; labelUk: string; kind: 'deadline' | 'checkpoint' | 'period'; checkpointId?: string }
export function roadmapMarkers(items: readonly RoadmapItem[], date: string, layer: RoadmapLayer): RoadmapMarker[] {
  if (layer === 'hidden') return [];
  const result: RoadmapMarker[] = [];
  for (const item of items) {
    const key = `${item.owner.kind}:${item.owner.id}`;
    if (item.deadline === date) result.push({ key: `${key}:deadline`, item, kind: 'deadline', labelUk: `Термін: ${item.title}` });
    for (const c of [...(item.record.checkpoints ?? [])].sort((a, b) => a.order - b.order)) if (c.localDate === date) result.push({ key: `${key}:checkpoint:${c.id}`, item, kind: 'checkpoint', checkpointId: c.id, labelUk: `Контрольна точка: ${c.title} (${item.title})` });
    if (layer === 'periods' && item.owner.kind !== 'goal' && item.record.roadmapPeriod) {
      const range = periodInterval(item.record.roadmapPeriod);
      if (date >= range.startDate && date < range.endDateExclusive) result.push({ key: `${key}:period`, item, kind: 'period', labelUk: `Період: ${item.title}` });
    }
  }
  return result;
}

