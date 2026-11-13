import { validateStageDependencies } from "./stageDependencies";

import { PlanuiError } from "../i18n/errorsUk";

import { validateFolderHierarchy } from "./folders";

import { PlanuiDomainSnapshot } from "./types";

import { validateLifeAreaQuestion } from './personalValidation';

import { validateFolderRecord } from './planningValidation';

import { validateGoalRecord } from './planningValidation';

import { validateProjectRecord } from './planningValidation';

import { validateStageRecord } from './planningValidation';

import { validateTaskRecord } from './planningValidation';

import { validateReservationRecord } from './planningValidation';

import { validateCalendarEventRecord } from './rosterValidation';

import { validateShiftTemplateRecord } from './rosterValidation';

import { validateDayOffAnnotationRecord } from './rosterValidation';

import { validateHabitRecord } from './habitValidation';

import { validateHabitEntryRecord } from './habitValidation';

import { validatePersonalRecord } from './personalValidation';

import { validateLifeAreaAssessment } from './personalValidation';

import { validateMediaAssetMetaAndBytes } from './mediaValidation';

import { validateInspirationItemRecord } from './personalValidation';

import { validateWishlistCategoryRecord } from './personalValidation';

import { validateWishItemRecord } from './personalValidation';

import { validateSettingsRecord } from './settingsValidation';

export function validateDomainSnapshot(
  snapshot: PlanuiDomainSnapshot,
  mediaBlobsById?: ReadonlyMap<string, Uint8Array>
): PlanuiDomainSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new PlanuiError('VALIDATION_FAILED', 'snapshot');
  }

  const requiredArrayKeys: (keyof Omit<PlanuiDomainSnapshot, 'settings'>)[] = [
    'folders',
    'goals',
    'projects',
    'stages',
    'tasks',
    'reservations',
    'events',
    'shiftTemplates',
    'dayOffAnnotations',
    'habits',
    'habitEntries',
    'personalRecords',
    'lifeAreaQuestions',
    'lifeAreaAssessments',
    'inspirationItems',
    'mediaMeta',
    'wishlistCategories',
    'wishes',
  ];
  if (Object.keys(snapshot).some(key => key !== 'settings' && !requiredArrayKeys.includes(key as keyof Omit<PlanuiDomainSnapshot, 'settings'>))) throw new PlanuiError('VALIDATION_FAILED');
  for (const key of requiredArrayKeys) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
      throw new PlanuiError('VALIDATION_FAILED', `snapshot.${key}`);
    }
  }

  // Reject malformed scalar payloads before they reach editors or React rendering.
  // Optional historical fields remain optional; authored strings are never coerced.
  for (const key of requiredArrayKeys) {
    for (const record of snapshot[key]) {
      const fields = record as typeof record & Record<string, unknown>;
      for (const name of ['description','note','text','contentText','icon','desiredOutcome','completionCriteria','expectedOutcome','purposeUk','completionCriteriaUk','implementationIntentionUk','collaboratorText']) {
        if (fields[name] !== undefined && fields[name] !== null && typeof fields[name] !== 'string') throw new PlanuiError('VALIDATION_FAILED');
      }
      for (const name of ['archived','isFavorite','wasOptimized','isBlocking']) {
        if (fields[name] !== undefined && typeof fields[name] !== 'boolean') throw new PlanuiError('VALIDATION_FAILED');
      }
      if (fields.order !== undefined && (typeof fields.order !== 'number' || !Number.isFinite(fields.order))) throw new PlanuiError('VALIDATION_FAILED');
    }
  }

  const lifeAreaQuestionIds = new Set<string>();
  for (const lq of snapshot.lifeAreaQuestions) {
    validateLifeAreaQuestion(lq);
    if (lifeAreaQuestionIds.has(lq.id)) {
      throw new PlanuiError('INVALID_ID', lq.id);
    }
    lifeAreaQuestionIds.add(lq.id);
  }

  const folderIds = new Set<string>();
  for (const f of snapshot.folders) {
    validateFolderRecord(f);
    if (folderIds.has(f.id)) throw new PlanuiError('INVALID_ID', f.id);
    folderIds.add(f.id);
  }
  validateFolderHierarchy(snapshot.folders);

  const goalIds = new Set<string>();
  if (Array.isArray(snapshot.goals)) {
    for (const g of snapshot.goals) {
      validateGoalRecord(g, { folderIds });
      if (
        g.lifeAreaId !== null &&
          !lifeAreaQuestionIds.has(g.lifeAreaId)
      ) {
        throw new PlanuiError('VALIDATION_FAILED', `goal.lifeAreaId:${g.lifeAreaId}`);
      }
      if (goalIds.has(g.id)) throw new PlanuiError('INVALID_ID', g.id);
      goalIds.add(g.id);
    }
  }

  for (const area of snapshot.lifeAreaQuestions) {
    if (area.mergedIntoId) {
      const seen = new Set([area.id]); let id: string | null | undefined = area.mergedIntoId;
      while (id) { if (seen.has(id)) throw new PlanuiError('VALIDATION_FAILED'); seen.add(id); const target = snapshot.lifeAreaQuestions.find(a => a.id === id); if (!target) throw new PlanuiError('VALIDATION_FAILED'); id = target.mergedIntoId; }
    }
  }
  for (const record of [...snapshot.folders, ...snapshot.tasks, ...snapshot.events]) if (record.lifeAreaId != null && !lifeAreaQuestionIds.has(record.lifeAreaId)) throw new PlanuiError('VALIDATION_FAILED');

  const projectIds = new Set<string>();
  for (const p of snapshot.projects) {
    validateProjectRecord(p, { folderIds, goalIds });
    if (
      p.lifeAreaId !== null &&
      !lifeAreaQuestionIds.has(p.lifeAreaId)
    ) {
      throw new PlanuiError('VALIDATION_FAILED', `project.lifeAreaId:${p.lifeAreaId}`);
    }
    if (projectIds.has(p.id)) throw new PlanuiError('INVALID_ID', p.id);
    projectIds.add(p.id);
  }

  const stageProjectMap = new Map<string, string>();
  const stageIds = new Set<string>();
  validateStageDependencies(snapshot.stages);
  for (const s of snapshot.stages) {
    validateStageRecord(s, projectIds, goalIds);
    if (stageIds.has(s.id)) throw new PlanuiError('INVALID_ID', s.id);
    stageIds.add(s.id);
    if (s.projectId) stageProjectMap.set(s.id, s.projectId);
  }

  const activeReservationsByTaskId = new Map<string, number>();
  const reservationIds = new Set<string>();
  for (const r of snapshot.reservations) {
    if (reservationIds.has(r.id)) throw new PlanuiError('INVALID_ID', r.id);
    reservationIds.add(r.id);
    if (r.state === 'active' && r.taskId !== null) {
      activeReservationsByTaskId.set(
        r.taskId,
        (activeReservationsByTaskId.get(r.taskId) ?? 0) + 1
      );
    }
  }

  const taskIds = new Set<string>();
  for (const t of snapshot.tasks) {
    validateTaskRecord(t, {
      folderIds,
      goalIds,
      projectIds,
      stageProjectMap,
      activeReservationsByTaskId,
    });
    if (taskIds.has(t.id)) throw new PlanuiError('INVALID_ID', t.id);
    taskIds.add(t.id);
  }

  if (Array.isArray(snapshot.goals)) {
    for (const g of snapshot.goals) {
      if (g.nextActionTaskId !== null && !taskIds.has(g.nextActionTaskId)) {
        throw new PlanuiError('TASK_INVALID_NEXT_ACTION', g.nextActionTaskId);
      }
    }
  }

  for (const p of snapshot.projects) {
    if (p.nextActionTaskId !== null && p.nextActionTaskId !== undefined && !taskIds.has(p.nextActionTaskId)) {
      throw new PlanuiError('TASK_INVALID_NEXT_ACTION', p.nextActionTaskId);
    }
  }

  for (const r of snapshot.reservations) {
    validateReservationRecord(r, taskIds);
  }

  const eventIds = new Set<string>();
  for (const ev of snapshot.events) {
    validateCalendarEventRecord(ev);
    if (eventIds.has(ev.id)) throw new PlanuiError('INVALID_ID', ev.id);
    eventIds.add(ev.id);
  }

  const templateIds = new Set<string>();
  for (const tpl of snapshot.shiftTemplates) {
    validateShiftTemplateRecord(tpl);
    if (templateIds.has(tpl.id)) throw new PlanuiError('INVALID_ID', tpl.id);
    templateIds.add(tpl.id);
  }

  const dayOffIds = new Set<string>();
  for (const ann of snapshot.dayOffAnnotations) {
    validateDayOffAnnotationRecord(ann);
    if (dayOffIds.has(ann.id)) throw new PlanuiError('INVALID_ID', ann.id);
    dayOffIds.add(ann.id);
  }

  const habitIds = new Set<string>();
  for (const h of snapshot.habits) {
    validateHabitRecord(h);
    if (h.folderId != null && !folderIds.has(h.folderId)) throw new PlanuiError('ENTITY_NOT_FOUND');
    if (h.projectId !== null && !projectIds.has(h.projectId)) {
      throw new PlanuiError('PROJECT_NOT_FOUND', h.projectId);
    }
    if (
      h.lifeAreaId !== null &&
      !lifeAreaQuestionIds.has(h.lifeAreaId)
    ) {
      throw new PlanuiError('VALIDATION_FAILED', `habit.lifeAreaId:${h.lifeAreaId}`);
    }
    if (habitIds.has(h.id)) throw new PlanuiError('INVALID_ID', h.id);
    habitIds.add(h.id);
  }

  const habitEntryIds = new Set<string>();
  const habitDatePairs = new Set<string>();
  for (const he of snapshot.habitEntries) {
    validateHabitEntryRecord(he, habitIds);
    if (habitEntryIds.has(he.id)) throw new PlanuiError('INVALID_ID', he.id);
    habitEntryIds.add(he.id);
    const key = `${he.habitId}::${he.localDate}`;
    if (habitDatePairs.has(key)) {
      throw new PlanuiError('HABIT_DUPLICATE_BINARY_ENTRY', key);
    }
    habitDatePairs.add(key);
  }

  for (const session of snapshot.reservations) {
    const occurrence = session.habitOccurrence;
    if (!occurrence) continue;
    const entry = snapshot.habitEntries.find(e => e.id === occurrence.entryId);
    if (!entry || entry.habitId !== occurrence.habitId || entry.localDate !== occurrence.localDate) throw new PlanuiError('VALIDATION_FAILED');
  }

  const personalRecordIds = new Set<string>();
  for (const pr of snapshot.personalRecords) {
    if ((pr.text !== null && typeof pr.text !== 'string') || !Array.isArray(pr.tags) || pr.tags.some(tag => typeof tag !== 'string')) throw new PlanuiError('VALIDATION_FAILED');
    validatePersonalRecord(pr);
    if (personalRecordIds.has(pr.id)) {
      throw new PlanuiError('INVALID_ID', pr.id);
    }
    personalRecordIds.add(pr.id);
  }

  const assessmentIds = new Set<string>();
  for (const la of snapshot.lifeAreaAssessments) {
    validateLifeAreaAssessment(la);
    if (assessmentIds.has(la.id)) throw new PlanuiError('INVALID_ID', la.id);
    assessmentIds.add(la.id);
  }

  const mediaIds = new Set<string>();
  for (const mm of snapshot.mediaMeta) {
    const blobBytes = mediaBlobsById ? mediaBlobsById.get(mm.id) : undefined;
    if (mediaBlobsById && !blobBytes) {
      throw new PlanuiError('MISSING_REFERENCED_MEDIA', mm.id);
    }
    validateMediaAssetMetaAndBytes(mm, blobBytes);
    if (mediaIds.has(mm.id)) throw new PlanuiError('INVALID_ID', mm.id);
    mediaIds.add(mm.id);
  }

  if (mediaBlobsById) {
    for (const blobId of mediaBlobsById.keys()) {
      if (!mediaIds.has(blobId)) {
        throw new PlanuiError('BACKUP_UNEXPECTED_FILE', `media/${blobId}`);
      }
    }
  }

  const inspirationIds = new Set<string>();
  for (const ins of snapshot.inspirationItems) {
    validateInspirationItemRecord(ins, mediaIds, projectIds);
    if (ins.goalId != null && !snapshot.goals.some(g => g.id === ins.goalId)) throw new PlanuiError('VALIDATION_FAILED');
    if (ins.lifeAreaId != null && !snapshot.lifeAreaQuestions.some(a => a.id === ins.lifeAreaId)) throw new PlanuiError('VALIDATION_FAILED');
    if (inspirationIds.has(ins.id)) {
      throw new PlanuiError('INVALID_ID', ins.id);
    }
    inspirationIds.add(ins.id);
  }

  const wishlistCategoryIds = new Set<string>();
  for (const wc of snapshot.wishlistCategories) {
    validateWishlistCategoryRecord(wc);
    if (wishlistCategoryIds.has(wc.id)) {
      throw new PlanuiError('INVALID_ID', wc.id);
    }
    wishlistCategoryIds.add(wc.id);
  }

  const wishIds = new Set<string>();
  for (const w of snapshot.wishes) {
    validateWishItemRecord(w, wishlistCategoryIds, mediaIds, projectIds);
    if (wishIds.has(w.id)) {
      throw new PlanuiError('INVALID_ID', w.id);
    }
    wishIds.add(w.id);
  }

  validateSettingsRecord(snapshot.settings);

  return snapshot;
}
