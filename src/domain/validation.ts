import { validateDailyPlans } from './today';
import { validateRoadmapMetadata } from './roadmap';
import { PlanuiError } from '../i18n/errorsUk';
import { validateFolderHierarchy } from './folders';
import {
  assertValidHalfOpenInstants,
  assertValidIanaZone,
  assertValidIsoInstant,
  assertValidLocalDate,
  assertValidLocalTime,
  compareLocalDates,
  validateZonedInterval,
} from './temporal';
import {
  CalendarEvent,
  DayOffAnnotation,
  Folder,
  Goal,
  Habit,
  HabitEntry,
  InspirationItem,
  LifeAreaAssessment,
  LifeAreaQuestion,
  MediaAssetMeta,
  PersonalRecord,
  PlanuiDomainSnapshot,
  PlanuiSettings,
  Project,
  ProjectStage,
  ShiftTemplate,
  SupportedMediaMimeType,
  Task,
  TaskReservation,
  WishItem,
  WishlistCategory,
} from './types';
import {
  assertValidWishFulfillmentState,
  assertValidWishlistTiming,
   isSupportedCurrencyCode,
  validateExactPriceObject,
} from './wishlist';

export const MAX_MEDIA_DIMENSION_PX = 8192;
export const MAX_MEDIA_DECODED_PIXELS = 25_000_000;
export const MAX_SINGLE_MEDIA_BYTES = 15 * 1024 * 1024;

export function assertNonEmptyString(
  val: unknown,
  errorCode: 'INVALID_ID' | 'REQUIRED_TITLE' = 'REQUIRED_TITLE'
): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new PlanuiError(errorCode);
  }
  return val.trim();
}

export function assertPositiveRevision(rev: unknown): number {
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 1) {
    throw new PlanuiError('INVALID_REVISION', String(rev));
  }
  return rev;
}

export function validateFolderRecord(folder: Folder): Folder {
  assertNonEmptyString(folder.id, 'INVALID_ID');
  assertNonEmptyString(folder.name, 'REQUIRED_TITLE');
  if (folder.parentId !== null) {
    assertNonEmptyString(folder.parentId, 'INVALID_ID');
    if (folder.parentId === folder.id) {
      throw new PlanuiError('FOLDER_SELF_PARENT', folder.id);
    }
  }
  assertValidIsoInstant(folder.createdAt);
  assertValidIsoInstant(folder.updatedAt);
  assertPositiveRevision(folder.revision);
  return folder;
}

export function validateGoalRecord(
  goal: Goal,
  context?: {
    folderIds?: ReadonlySet<string>;
    taskIds?: ReadonlySet<string>;
  }
): Goal {
  validateRoadmapMetadata(goal);
  assertNonEmptyString(goal.id, 'INVALID_ID');
  assertNonEmptyString(goal.title, 'REQUIRED_TITLE');

  if (
    goal.state !== 'idea' &&
    goal.state !== 'active' &&
    goal.state !== 'paused' &&
    goal.state !== 'completed'
  ) {
    throw new PlanuiError('GOAL_INVALID_STATE', `goal.state=${goal.state}`);
  }

  if (goal.folderId !== null) {
    assertNonEmptyString(goal.folderId, 'INVALID_ID');
    if (context?.folderIds && !context.folderIds.has(goal.folderId)) {
      throw new PlanuiError('FOLDER_PARENT_NOT_FOUND', goal.folderId);
    }
  }

  if (goal.nextActionTaskId !== null) {
    assertNonEmptyString(goal.nextActionTaskId, 'INVALID_ID');
    if (context?.taskIds && !context.taskIds.has(goal.nextActionTaskId)) {
      throw new PlanuiError('TASK_INVALID_NEXT_ACTION', goal.nextActionTaskId);
    }
  }

  if (goal.timing !== null) {
    if (goal.timing.targetDate !== null) {
      assertValidLocalDate(goal.timing.targetDate);
    }
  }

  assertValidIsoInstant(goal.createdAt);
  assertValidIsoInstant(goal.updatedAt);
  if (goal.completedAt !== null) {
    assertValidIsoInstant(goal.completedAt);
  }
  assertPositiveRevision(goal.revision);
  return goal;
}

export function validateProjectRecord(
  project: Project,
  context?: {
    folderIds?: ReadonlySet<string>;
    goalIds?: ReadonlySet<string>;
    taskIds?: ReadonlySet<string>;
  }
): Project {
  validateRoadmapMetadata(project);
  assertNonEmptyString(project.id, 'INVALID_ID');
  assertNonEmptyString(project.title, 'REQUIRED_TITLE');
  if (project.targetDate !== null) {
    assertValidLocalDate(project.targetDate);
  }
  if (project.folderId !== null) {
    assertNonEmptyString(project.folderId, 'INVALID_ID');
    if (context?.folderIds && !context.folderIds.has(project.folderId)) {
      throw new PlanuiError('FOLDER_PARENT_NOT_FOUND', project.folderId);
    }
  }
  if (project.goalId !== null && project.goalId !== undefined) {
    assertNonEmptyString(project.goalId, 'INVALID_ID');
    if (context?.goalIds && !context.goalIds.has(project.goalId)) {
      throw new PlanuiError('GOAL_NOT_FOUND', project.goalId);
    }
  }
  if (project.nextActionTaskId !== null && project.nextActionTaskId !== undefined) {
    assertNonEmptyString(project.nextActionTaskId, 'INVALID_ID');
    if (context?.taskIds && !context.taskIds.has(project.nextActionTaskId)) {
      throw new PlanuiError('TASK_INVALID_NEXT_ACTION', project.nextActionTaskId);
    }
  }
  if (
    project.state !== 'idea' &&
    project.state !== 'active' &&
    project.state !== 'paused' &&
    project.state !== 'completed'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', `project.state=${project.state}`);
  }
  assertValidIsoInstant(project.createdAt);
  assertValidIsoInstant(project.updatedAt);
  if (project.completedAt !== null) {
    assertValidIsoInstant(project.completedAt);
  }
  assertPositiveRevision(project.revision);
  return project;
}

export function validateStageRecord(
  stage: ProjectStage,
  projectIds?: ReadonlySet<string>,
  goalIds?: ReadonlySet<string>
): ProjectStage {
  validateRoadmapMetadata(stage);
  assertNonEmptyString(stage.id, 'INVALID_ID');
  if (stage.projectId !== null) {
    assertNonEmptyString(stage.projectId, 'INVALID_ID');
    if (stage.goalId != null || (projectIds && !projectIds.has(stage.projectId))) throw new PlanuiError('STAGE_PROJECT_NOT_FOUND');
  } else {
    assertNonEmptyString(stage.goalId, 'INVALID_ID');
    if (goalIds && !goalIds.has(stage.goalId!)) throw new PlanuiError('GOAL_NOT_FOUND');
  }
  assertNonEmptyString(stage.title, 'REQUIRED_TITLE');
  if (stage.targetDate !== null) {
    assertValidLocalDate(stage.targetDate);
  }
  assertValidIsoInstant(stage.createdAt);
  assertValidIsoInstant(stage.updatedAt);
  assertPositiveRevision(stage.revision);
  return stage;
}

export function validateTaskRecord(
  task: Task,
  context?: {
    folderIds: ReadonlySet<string>;
    goalIds?: ReadonlySet<string>;
    projectIds: ReadonlySet<string>;
    stageProjectMap: ReadonlyMap<string, string>;
    activeReservationsByTaskId?: ReadonlyMap<string, number>;
  }
): Task {
  if (task.effort !== undefined && task.effort !== null && !['small', 'medium', 'large'].includes(task.effort)) throw new PlanuiError('VALIDATION_FAILED');
  assertNonEmptyString(task.id, 'INVALID_ID');
  assertNonEmptyString(task.title, 'REQUIRED_TITLE');

  if (
    task.state !== 'open' &&
    task.state !== 'completed' &&
    task.state !== 'canceled'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', `task.state=${task.state}`);
  }

  if (
    task.priority !== 'high' &&
    task.priority !== 'normal' &&
    task.priority !== 'low'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', `task.priority=${task.priority}`);
  }

  if (task.deadline !== null) {
    if (task.deadline.kind === 'date_only') {
      assertValidLocalDate(task.deadline.localDate);
    } else if (task.deadline.kind === 'exact_instant') {
      assertValidIsoInstant(task.deadline.instant);
      assertValidIanaZone(task.deadline.zoneId);
    } else {
      throw new PlanuiError('VALIDATION_FAILED', 'deadline');
    }
  }

  if (task.planningState === 'unplanned') {
    if (task.plannedDate !== null) {
      throw new PlanuiError('TASK_CONTRADICTORY_PLANNING', task.id);
    }
  } else if (task.planningState === 'date_only') {
    if (task.plannedDate === null) {
      throw new PlanuiError('TASK_CONTRADICTORY_PLANNING', task.id);
    }
    assertValidLocalDate(task.plannedDate);
    if (
      context?.activeReservationsByTaskId &&
      (context.activeReservationsByTaskId.get(task.id) ?? 0) > 0
    ) {
      throw new PlanuiError('TASK_CONTRADICTORY_PLANNING', task.id);
    }
  } else if (task.planningState === 'timed') {
    if (task.plannedDate !== null) {
      throw new PlanuiError('TASK_CONTRADICTORY_PLANNING', task.id);
    }
  } else {
    throw new PlanuiError('VALIDATION_FAILED', 'planningState');
  }

  if (!task.ownership || typeof task.ownership !== 'object') {
    throw new PlanuiError('TASK_INVALID_OWNERSHIP', task.id);
  }
  const ownRec = task.ownership as unknown as Record<string, unknown>;
  if (task.ownership.kind === 'standalone') {
    if ('projectId' in ownRec || 'stageId' in ownRec || 'goalId' in ownRec) {
      throw new PlanuiError('TASK_INVALID_OWNERSHIP', task.id);
    }
    const legacyFolderId = ownRec.folderId as string | null | undefined;
    if (legacyFolderId !== null && legacyFolderId !== undefined) {
      // Legacy v1 compatibility: { kind: 'standalone', folderId: 'folder-id' }
      assertNonEmptyString(legacyFolderId, 'INVALID_ID');
      if (context && !context.folderIds.has(legacyFolderId)) {
        throw new PlanuiError('FOLDER_PARENT_NOT_FOUND', legacyFolderId);
      }
    }
  } else if (task.ownership.kind === 'folder') {
    if ('projectId' in ownRec || 'stageId' in ownRec || 'goalId' in ownRec) {
      throw new PlanuiError('TASK_INVALID_OWNERSHIP', task.id);
    }
    assertNonEmptyString(task.ownership.folderId, 'INVALID_ID');
    if (context && !context.folderIds.has(task.ownership.folderId)) {
      throw new PlanuiError('FOLDER_PARENT_NOT_FOUND', task.ownership.folderId);
    }
  } else if (task.ownership.kind === 'goal') {
    if ('projectId' in ownRec || 'stageId' in ownRec || 'folderId' in ownRec) {
      throw new PlanuiError('TASK_INVALID_OWNERSHIP', task.id);
    }
    assertNonEmptyString(task.ownership.goalId, 'INVALID_ID');
    if (context && (context as { goalIds?: ReadonlySet<string> }).goalIds && !(context as { goalIds?: ReadonlySet<string> }).goalIds!.has(task.ownership.goalId)) {
      throw new PlanuiError('GOAL_NOT_FOUND', task.ownership.goalId);
    }
  } else if (task.ownership.kind === 'project') {
    if ('folderId' in ownRec || 'goalId' in ownRec) {
      throw new PlanuiError('TASK_INVALID_OWNERSHIP', task.id);
    }
    assertNonEmptyString(task.ownership.projectId, 'INVALID_ID');
    if (context && !context.projectIds.has(task.ownership.projectId)) {
      throw new PlanuiError('STAGE_PROJECT_NOT_FOUND', task.ownership.projectId);
    }
    if (task.ownership.stageId !== null) {
      assertNonEmptyString(task.ownership.stageId, 'INVALID_ID');
      if (context) {
        const ownerProjectId = context.stageProjectMap.get(
          task.ownership.stageId
        );
        if (ownerProjectId !== task.ownership.projectId) {
          throw new PlanuiError('TASK_STAGE_MISMATCH', task.ownership.stageId);
        }
      }
    }
  } else {
    throw new PlanuiError('TASK_INVALID_OWNERSHIP', task.id);
  }

  for (const item of task.checklist) {
    assertNonEmptyString(item.id, 'INVALID_ID');
    assertNonEmptyString(item.title, 'REQUIRED_TITLE');
  }

  assertValidIsoInstant(task.createdAt);
  assertValidIsoInstant(task.updatedAt);
  if (task.completedAt !== null) assertValidIsoInstant(task.completedAt);
  if (task.canceledAt !== null) assertValidIsoInstant(task.canceledAt);
  assertPositiveRevision(task.revision);

  return task;
}

export function validateReservationRecord(
  reservation: TaskReservation,
  taskIds?: ReadonlySet<string>
): TaskReservation {
  assertNonEmptyString(reservation.id, 'INVALID_ID');
  if (reservation.habitOccurrence != null) {
    if (reservation.taskId !== null) throw new PlanuiError('VALIDATION_FAILED');
    assertNonEmptyString(reservation.habitOccurrence.entryId, 'INVALID_ID');
    assertNonEmptyString(reservation.habitOccurrence.habitId, 'INVALID_ID');
    assertValidLocalDate(reservation.habitOccurrence.localDate);
  } else {
    assertNonEmptyString(reservation.taskId, 'INVALID_ID');
    if (taskIds && !taskIds.has(reservation.taskId!)) throw new PlanuiError('RESERVATION_TASK_NOT_FOUND');
  }
  validateZonedInterval(reservation.interval);
  if (
    reservation.state !== 'active' &&
    reservation.state !== 'released' &&
    reservation.state !== 'canceled'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', 'reservation.state');
  }
  if (reservation.releaseMetadata !== null) {
    assertValidIsoInstant(reservation.releaseMetadata.releasedAt);
    assertValidHalfOpenInstants(
      reservation.releaseMetadata.originalStartInstant,
      reservation.releaseMetadata.originalEndInstant
    );
  }
  assertValidIsoInstant(reservation.createdAt);
  assertValidIsoInstant(reservation.updatedAt);
  assertPositiveRevision(reservation.revision);
  return reservation;
}

export function validateCalendarEventRecord(
  event: CalendarEvent
): CalendarEvent {
  assertNonEmptyString(event.id, 'INVALID_ID');
  assertNonEmptyString(event.title, 'REQUIRED_TITLE');

  if (event.schedule.kind === 'timed') {
    validateZonedInterval(event.schedule.interval);
    if (
      event.type === 'work_shift' &&
      event.schedule.interval.originStartLocalTime ===
        event.schedule.interval.originEndLocalTime &&
      event.schedule.interval.originStartLocalDate ===
        event.schedule.interval.originEndLocalDate
    ) {
      throw new PlanuiError('EQUAL_SHIFT_CLOCKS_AMBIGUOUS', event.id);
    }
  } else if (event.schedule.kind === 'all_day') {
    assertValidLocalDate(event.schedule.startLocalDate);
    assertValidLocalDate(event.schedule.endLocalDateExclusive);
    assertValidIanaZone(event.schedule.originZone);
    if (
      compareLocalDates(
        event.schedule.endLocalDateExclusive,
        event.schedule.startLocalDate
      ) <= 0
    ) {
      throw new PlanuiError('INVALID_HALF_OPEN_INTERVAL', event.id);
    }
  } else {
    throw new PlanuiError('VALIDATION_FAILED', 'event.schedule');
  }

  if (event.type === 'work_shift' && !event.workProperties) {
    throw new PlanuiError('VALIDATION_FAILED', 'workProperties required');
  }

  assertValidIsoInstant(event.createdAt);
  assertValidIsoInstant(event.updatedAt);
  assertPositiveRevision(event.revision);
  return event;
}

export function validateShiftTemplateRecord(
  tpl: ShiftTemplate
): ShiftTemplate {
  assertNonEmptyString(tpl.id, 'INVALID_ID');
  assertNonEmptyString(tpl.name, 'REQUIRED_TITLE');
  assertNonEmptyString(tpl.code, 'REQUIRED_TITLE');
  assertValidLocalTime(tpl.startLocalTime);
  assertValidLocalTime(tpl.endLocalTime);
  if (tpl.endDateOffsetDays !== 0 && tpl.endDateOffsetDays !== 1) {
    throw new PlanuiError('VALIDATION_FAILED', 'endDateOffsetDays');
  }
  if (
    tpl.startLocalTime === tpl.endLocalTime &&
    tpl.endDateOffsetDays === 0
  ) {
    throw new PlanuiError('EQUAL_SHIFT_CLOCKS_AMBIGUOUS', tpl.id);
  }
  assertValidIsoInstant(tpl.createdAt);
  assertValidIsoInstant(tpl.updatedAt);
  assertPositiveRevision(tpl.revision);
  return tpl;
}

export function validateDayOffAnnotationRecord(
  ann: DayOffAnnotation
): DayOffAnnotation {
  assertNonEmptyString(ann.id, 'INVALID_ID');
  assertValidLocalDate(ann.localDate);
  assertValidIanaZone(ann.sourceZone);
  assertValidIsoInstant(ann.createdAt);
  assertValidIsoInstant(ann.updatedAt);
  assertPositiveRevision(ann.revision);
  return ann;
}

function validateHabitRuleSnapshot(rev: import('./types').HabitRuleRevision): void {
  if (!rev || typeof rev !== 'object' || !rev.rule || typeof rev.rule !== 'object' || !rev.target || typeof rev.target !== 'object') throw new PlanuiError('HABIT_INVALID_RULE');
    assertNonEmptyString(rev.id, 'INVALID_ID');
    assertValidLocalDate(rev.effectiveFromLocalDate);
    assertValidIsoInstant(rev.createdAt);
    if (rev.rule.kind === 'selected_weekdays') {
      if (
        !Array.isArray(rev.rule.weekdaysIso) ||
        rev.rule.weekdaysIso.length === 0 ||
        rev.rule.weekdaysIso.some(
          (d) => !Number.isInteger(d) || d < 1 || d > 7
        )
      ) {
        throw new PlanuiError('HABIT_INVALID_RULE', rev.id);
      }
    } else if (rev.rule.kind === 'weekly_frequency') {
      if (
        !Number.isInteger(rev.rule.timesPerWeek) ||
        rev.rule.timesPerWeek < 1 ||
        rev.rule.timesPerWeek > 7
      ) {
        throw new PlanuiError('HABIT_INVALID_RULE', rev.id);
      }
    } else if (rev.rule.kind !== 'daily' && rev.rule.kind !== 'days_off') {
      throw new PlanuiError('HABIT_INVALID_RULE', rev.id);
    }

    if (rev.target.kind === 'numeric') {
      if (
        typeof rev.target.targetValue !== 'number' ||
        !Number.isFinite(rev.target.targetValue) ||
        rev.target.targetValue <= 0 ||
        typeof rev.target.unitUk !== 'string' ||
        rev.target.unitUk.trim().length === 0
      ) {
        throw new PlanuiError('HABIT_INVALID_NUMERIC_TARGET', rev.id);
      }
    } else if (rev.target.kind !== 'binary') {
      throw new PlanuiError('HABIT_INVALID_RULE', rev.id);
    }
}

export function validateHabitRecord(habit: Habit): Habit {
  assertNonEmptyString(habit.id, 'INVALID_ID');
  assertNonEmptyString(habit.name, 'REQUIRED_TITLE');
  for (const text of [habit.minimumVersionUk, habit.contextCueUk, habit.reminderIntentionUk]) if (text != null && typeof text !== 'string') throw new PlanuiError('VALIDATION_FAILED');
  if (habit.folderId != null) { assertNonEmptyString(habit.folderId, 'INVALID_ID'); if (habit.projectId) throw new PlanuiError('VALIDATION_FAILED'); }
  if (new Set(habit.ruleRevisions.map(r => r.id)).size !== habit.ruleRevisions.length) throw new PlanuiError('HABIT_INVALID_RULE');
  if (
    habit.state !== 'active' &&
    habit.state !== 'paused' &&
    habit.state !== 'archived'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', 'habit.state');
  }
  if (habit.ruleRevisions.length === 0) {
    throw new PlanuiError('HABIT_INVALID_RULE', habit.id);
  }
  for (const rev of habit.ruleRevisions) validateHabitRuleSnapshot(rev);
  assertValidIsoInstant(habit.createdAt);
  assertValidIsoInstant(habit.updatedAt);
  assertPositiveRevision(habit.revision);
  return habit;
}

export function validateHabitEntryRecord(
  entry: HabitEntry,
  habitIds?: ReadonlySet<string>
): HabitEntry {
  assertNonEmptyString(entry.id, 'INVALID_ID');
  assertNonEmptyString(entry.habitId, 'INVALID_ID');
  if (habitIds && !habitIds.has(entry.habitId)) {
    throw new PlanuiError('HABIT_NOT_FOUND', entry.habitId);
  }
  assertValidLocalDate(entry.localDate);
  if (entry.ruleSnapshot !== undefined) validateHabitRuleSnapshot(entry.ruleSnapshot);
  if (entry.dayOffSnapshot !== undefined && typeof entry.dayOffSnapshot !== 'boolean') throw new PlanuiError('VALIDATION_FAILED');
  if (entry.minimumCompletedUk != null && (typeof entry.minimumCompletedUk !== 'string' || !entry.minimumCompletedUk.trim() || entry.status !== 'partial')) throw new PlanuiError('VALIDATION_FAILED');
  if (entry.status === 'no_entry' && entry.numericValue != null) throw new PlanuiError('VALIDATION_FAILED');
  if (
    entry.status !== 'completed' &&
    entry.status !== 'partial' &&
    entry.status !== 'skipped' &&
    entry.status !== 'no_entry'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', 'habitEntry.status');
  }
  if (entry.numericValue !== null && entry.numericValue !== undefined) {
    if (
      typeof entry.numericValue !== 'number' ||
      !Number.isFinite(entry.numericValue) ||
      entry.numericValue < 0
    ) {
      throw new PlanuiError('HABIT_INVALID_NUMERIC_ENTRY', entry.id);
    }
  }
  assertValidIsoInstant(entry.recordedAt);
  assertValidIsoInstant(entry.updatedAt);
  assertPositiveRevision(entry.revision);
  return entry;
}

function assertOptionalScale1To5(val: unknown): void {
  if (val === null || val === undefined) return;
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5) {
    throw new PlanuiError('INVALID_SCALE_1_5', String(val));
  }
}

export function validatePersonalRecord(rec: PersonalRecord): PersonalRecord {
  assertNonEmptyString(rec.id, 'INVALID_ID');
  assertValidIsoInstant(rec.recordedAt);
  assertValidLocalDate(rec.localDate);
  assertValidIanaZone(rec.zoneId);
  assertOptionalScale1To5(rec.mood);
  assertOptionalScale1To5(rec.energy);
  assertOptionalScale1To5(rec.stress);
  assertOptionalScale1To5(rec.sleepQuality);
  if (rec.scaleVersion !== undefined && rec.scaleVersion !== 1) throw new PlanuiError('VALIDATION_FAILED');
  if (rec.sleepMinutes != null && (!Number.isInteger(rec.sleepMinutes) || rec.sleepMinutes < 0 || rec.sleepMinutes > 1440)) throw new PlanuiError('VALIDATION_FAILED');
  assertValidIsoInstant(rec.createdAt);
  assertValidIsoInstant(rec.updatedAt);
  assertPositiveRevision(rec.revision);
  return rec;
}

export function validateLifeAreaQuestion(
  q: LifeAreaQuestion
): LifeAreaQuestion {
  if (q.archived !== undefined && typeof q.archived !== 'boolean') throw new PlanuiError('VALIDATION_FAILED');
  if (q.goodEnoughUk !== undefined && q.goodEnoughUk !== null && typeof q.goodEnoughUk !== 'string') throw new PlanuiError('VALIDATION_FAILED');
  if (q.mergedIntoId != null && (typeof q.mergedIntoId !== 'string' || !q.mergedIntoId.trim() || q.mergedIntoId === q.id || !q.archived)) throw new PlanuiError('VALIDATION_FAILED');
  if (!Number.isFinite(q.order) || !Number.isInteger(q.version) || q.version < 1) throw new PlanuiError('VALIDATION_FAILED');
  if (q.starterKeys !== undefined && (!Array.isArray(q.starterKeys) || new Set(q.starterKeys).size !== q.starterKeys.length || q.starterKeys.some(k => typeof k !== 'string' || !k.trim()))) throw new PlanuiError('VALIDATION_FAILED');
  assertNonEmptyString(q.id, 'INVALID_ID');
  assertNonEmptyString(q.questionTextUk, 'REQUIRED_TITLE');
  assertValidIsoInstant(q.updatedAt);
  assertPositiveRevision(q.revision);
  return q;
}

export function validateLifeAreaAssessment(
  assessment: LifeAreaAssessment
): LifeAreaAssessment {
  assertNonEmptyString(assessment.id, 'INVALID_ID');
  assertValidIsoInstant(assessment.recordedAt);
  assertValidLocalDate(assessment.periodStartLocalDate);
  assertValidLocalDate(assessment.periodEndLocalDate);
  if (assessment.periodStartLocalDate > assessment.periodEndLocalDate) throw new PlanuiError('VALIDATION_FAILED');
  const scale = assessment.scale ?? { min: 1, max: 10 };
  if ((scale.min !== 0 && scale.min !== 1) || scale.max !== 10 || (assessment.scale && (typeof assessment.scale.labelUk !== 'string' || !assessment.scale.labelUk.trim()))) throw new PlanuiError('VALIDATION_FAILED');
  if (!Array.isArray(assessment.answers)) throw new PlanuiError('VALIDATION_FAILED');
  const answerIds = new Set<string>();
  for (const ans of assessment.answers) {
    if (answerIds.has(ans.questionId)) throw new PlanuiError('INVALID_ID');
    answerIds.add(ans.questionId);
    if (!Number.isInteger(ans.questionVersionSnapshot) || ans.questionVersionSnapshot < 1) throw new PlanuiError('VALIDATION_FAILED');
    if (ans.attentionNow !== undefined && ans.attentionNow !== null && typeof ans.attentionNow !== 'boolean') throw new PlanuiError('VALIDATION_FAILED');
    for (const value of [ans.note, ans.usefulChangeUk, ans.definitionSnapshotUk]) if (value !== undefined && value !== null && typeof value !== 'string') throw new PlanuiError('VALIDATION_FAILED');
    if (ans.satisfactionQuestionSnapshotUk !== undefined && typeof ans.satisfactionQuestionSnapshotUk !== 'string') throw new PlanuiError('VALIDATION_FAILED');
    assertNonEmptyString(ans.questionId, 'INVALID_ID');
    assertNonEmptyString(ans.questionTextSnapshotUk, 'REQUIRED_TITLE');
    if (ans.score !== null) {
      if (
        typeof ans.score !== 'number' ||
        !Number.isInteger(ans.score) ||
        ans.score < scale.min ||
        ans.score > 10
      ) {
        throw new PlanuiError(scale.min === 0 ? 'INVALID_SCALE_0_10' : 'INVALID_SCALE_1_10', String(ans.score));
      }
    }
  }
  assertValidIsoInstant(assessment.createdAt);
  assertValidIsoInstant(assessment.updatedAt);
  assertPositiveRevision(assessment.revision);
  return assessment;
}

export function sniffMediaMagicBytes(
  bytes: Uint8Array
): SupportedMediaMimeType | null {
  if (bytes.byteLength >= 3) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
  }
  if (bytes.byteLength >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png';
    }
  }
  if (bytes.byteLength >= 12) {
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  return null;
}

function tryExtractBinaryRasterDimensions(
  bytes: Uint8Array,
  mimeType: SupportedMediaMimeType
): { width: number; height: number } | null {
  if (mimeType === 'image/png') {
    // Minimal 16-byte PNG header fixtures (without width/height bytes) have < 24 bytes
    if (bytes.byteLength < 24) {
      return null;
    }
    const ihdrTag = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15]
    );
    if (ihdrTag !== 'IHDR') {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Missing PNG IHDR');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return { width, height };
  }

  if (mimeType === 'image/webp') {
    if (bytes.byteLength < 30) {
      return null;
    }
    const chunkFourCC = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15]
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (chunkFourCC === 'VP8X') {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
    if (chunkFourCC === 'VP8 ') {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
        throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Invalid VP8 frame');
      }
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      return { width, height };
    }
    if (chunkFourCC === 'VP8L') {
      if (bytes[20] !== 0x2f) {
        throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Invalid VP8L signature');
      }
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height =
        1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Unsupported WebP chunk');
  }

  if (mimeType === 'image/jpeg') {
    if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', 'Invalid JPEG SOI');
    }
    let offset = 2;
    while (offset + 4 <= bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.byteLength) break;
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.byteLength) {
        break;
      }
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        if (offset + 9 > bytes.byteLength) {
          throw new PlanuiError(
            'MEDIA_SIGNATURE_MISMATCH',
            'Truncated JPEG SOF'
          );
        }
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      offset += 2 + segmentLength;
    }
    return null;
  }

  return null;
}

export function validateMediaAssetMetaAndBytes(
  meta: MediaAssetMeta,
  bytes?: Uint8Array
): MediaAssetMeta {
  assertNonEmptyString(meta.id, 'INVALID_ID');
  const rawMime = String(meta.mimeType).toLowerCase();
  if (rawMime.includes('svg') || rawMime.includes('xml')) {
    throw new PlanuiError('ACTIVE_SVG_FORBIDDEN', meta.id);
  }
  if (
    meta.mimeType !== 'image/jpeg' &&
    meta.mimeType !== 'image/png' &&
    meta.mimeType !== 'image/webp'
  ) {
    throw new PlanuiError('UNSUPPORTED_MEDIA_TYPE', String(meta.mimeType));
  }
  if (
    meta.width <= 0 ||
    meta.height <= 0 ||
    meta.width > MAX_MEDIA_DIMENSION_PX ||
    meta.height > MAX_MEDIA_DIMENSION_PX ||
    meta.width * meta.height > MAX_MEDIA_DECODED_PIXELS ||
    meta.byteSize <= 0 ||
    meta.byteSize > MAX_SINGLE_MEDIA_BYTES
  ) {
    throw new PlanuiError('MEDIA_DIMENSIONS_EXCEEDED', meta.id);
  }
  if (bytes) {
    const headLen = Math.min(bytes.byteLength, 512);
    const asciiHead = new TextDecoder('utf-8', { fatal: false })
      .decode(bytes.subarray(0, headLen))
      .toLowerCase();
    if (
      asciiHead.includes('<svg') ||
      asciiHead.includes('<?xml') ||
      asciiHead.includes('<!doctype svg') ||
      asciiHead.includes('<script')
    ) {
      throw new PlanuiError('ACTIVE_SVG_FORBIDDEN', meta.id);
    }
    if (bytes.byteLength !== meta.byteSize) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', meta.id);
    }
    const detected = sniffMediaMagicBytes(bytes);
    if (!detected || detected !== meta.mimeType) {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', meta.id);
    }
    const binaryDims = tryExtractBinaryRasterDimensions(bytes, meta.mimeType);
    if (binaryDims) {
      if (
        binaryDims.width <= 0 ||
        binaryDims.height <= 0 ||
        binaryDims.width > MAX_MEDIA_DIMENSION_PX ||
        binaryDims.height > MAX_MEDIA_DIMENSION_PX ||
        binaryDims.width * binaryDims.height > MAX_MEDIA_DECODED_PIXELS
      ) {
        throw new PlanuiError(
          'MEDIA_DIMENSIONS_EXCEEDED',
          `${meta.id}:${binaryDims.width}x${binaryDims.height}`
        );
      }
      if (
        binaryDims.width !== meta.width ||
        binaryDims.height !== meta.height
      ) {
        throw new PlanuiError(
          'MEDIA_SIGNATURE_MISMATCH',
          `${meta.id}: meta ${meta.width}x${meta.height} != binary ${binaryDims.width}x${binaryDims.height}`
        );
      }
    }
  }
  assertValidIsoInstant(meta.createdAt);
  return meta;
}

export function validateInspirationItemRecord(
  item: InspirationItem,
  mediaIds?: ReadonlySet<string>,
  projectIds?: ReadonlySet<string>
): InspirationItem {
  assertNonEmptyString(item.id, 'INVALID_ID');
  if (item.projectId !== null) {
    assertNonEmptyString(item.projectId, 'INVALID_ID');
    if (projectIds && !projectIds.has(item.projectId)) {
      throw new PlanuiError('PROJECT_NOT_FOUND', item.projectId);
    }
  }
  if (item.collection !== undefined && !['preferred_life', 'saved'].includes(item.collection)) throw new PlanuiError('VALIDATION_FAILED');
  if (item.linkUrl != null || item.kind === 'link') {
    if (!item.linkUrl) {
      throw new PlanuiError('UNSAFE_INSPIRATION_URL');
    }
    try {
      const parsed = new URL(item.linkUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new PlanuiError('UNSAFE_INSPIRATION_URL', item.linkUrl);
      }
    } catch (err) {
      if (err instanceof PlanuiError) throw err;
      throw new PlanuiError('UNSAFE_INSPIRATION_URL', item.linkUrl);
    }
  }
  if (item.mediaId != null || item.kind === 'image') {
    if (!item.mediaId) {
      throw new PlanuiError('MISSING_REFERENCED_MEDIA', item.id);
    }
    if (mediaIds && !mediaIds.has(item.mediaId)) {
      throw new PlanuiError('MISSING_REFERENCED_MEDIA', item.mediaId);
    }
  }
  assertValidIsoInstant(item.createdAt);
  assertValidIsoInstant(item.updatedAt);
  assertPositiveRevision(item.revision);
  return item;
}

export function validateWishlistCategoryRecord(
  cat: WishlistCategory
): WishlistCategory {
  assertNonEmptyString(cat.id, 'INVALID_ID');
  assertNonEmptyString(cat.name, 'REQUIRED_TITLE');
  const raw = cat as unknown as Record<string, unknown>;
  if ('parentId' in raw && raw.parentId !== undefined && raw.parentId !== null) {
    throw new PlanuiError(
      'VALIDATION_FAILED',
      'Wishlist categories must be flat'
    );
  }
  assertValidIsoInstant(cat.createdAt);
  assertValidIsoInstant(cat.updatedAt);
  assertPositiveRevision(cat.revision);
  return cat;
}

export function validateWishItemRecord(
  wish: WishItem,
  categoryIds?: ReadonlySet<string>
): WishItem {
  assertNonEmptyString(wish.id, 'INVALID_ID');
  assertNonEmptyString(wish.title, 'REQUIRED_TITLE');

  if (wish.categoryId !== null) {
    assertNonEmptyString(wish.categoryId, 'INVALID_ID');
    if (categoryIds && !categoryIds.has(wish.categoryId)) {
      throw new PlanuiError('WISHLIST_CATEGORY_NOT_FOUND', wish.categoryId);
    }
  }

  assertValidWishlistTiming(wish.timing);
  assertValidWishFulfillmentState(wish.state);

  if (wish.state === 'fulfilled') {
    if (wish.fulfilledAt === null) {
      throw new PlanuiError('WISHLIST_FULFILLED_TIMESTAMP_MISMATCH', wish.id);
    }
    assertValidIsoInstant(wish.fulfilledAt);
  } else {
    if (wish.fulfilledAt !== null) {
      throw new PlanuiError('WISHLIST_FULFILLED_TIMESTAMP_MISMATCH', wish.id);
    }
  }

  validateExactPriceObject(wish.estimatedPrice);
  assertValidIsoInstant(wish.createdAt);
  assertValidIsoInstant(wish.updatedAt);
  assertPositiveRevision(wish.revision);
  return wish;
}

export function validateSettingsRecord(
  settings: PlanuiSettings
): PlanuiSettings {
  if (!settings || typeof settings !== 'object') {
    throw new PlanuiError('VALIDATION_FAILED', 'settings');
  }
  if (settings.roadmapLayer !== undefined && !['hidden', 'key_dates', 'periods'].includes(settings.roadmapLayer)) throw new PlanuiError('VALIDATION_FAILED');
  validateDailyPlans(settings.dailyPlans);
  if (settings.id !== 'singleton') {
    throw new PlanuiError('INVALID_ID', String(settings.id));
  }
  if (
    settings.theme !== 'system' &&
    settings.theme !== 'light' &&
    settings.theme !== 'dark'
  ) {
    throw new PlanuiError('VALIDATION_FAILED', 'settings.theme');
  }
  if (settings.timeZoneMode !== 'device' && settings.timeZoneMode !== 'manual') {
    throw new PlanuiError('VALIDATION_FAILED', 'settings.timeZoneMode');
  }
  if (settings.manualTimeZone !== null) {
    assertValidIanaZone(settings.manualTimeZone);
  }
  assertValidIanaZone(settings.lastDetectedTimeZone);
  if (
    settings.preferredWishlistCurrency !== null &&
    !isSupportedCurrencyCode(settings.preferredWishlistCurrency)
  ) {
    throw new PlanuiError(
      'WISHLIST_PRICE_UNSUPPORTED_CURRENCY',
      String(settings.preferredWishlistCurrency)
    );
  }
  if (settings.modules !== undefined && settings.modules !== null) {
    if (typeof settings.modules !== 'object') {
      throw new PlanuiError('VALIDATION_FAILED', 'settings.modules');
    }
    const m = settings.modules;
    if (
      typeof m.habitsEnabled !== 'boolean' ||
      typeof m.stateCheckInsEnabled !== 'boolean' ||
      typeof m.desiredLifeEnabled !== 'boolean' ||
      typeof m.wishlistEnabled !== 'boolean' ||
      (m.userConfigured !== undefined && typeof m.userConfigured !== 'boolean')
    ) {
      throw new PlanuiError('VALIDATION_FAILED', 'settings.modules flags');
    }
  }
  assertValidIsoInstant(settings.updatedAt);
  assertPositiveRevision(settings.revision);
  return settings;
}

export function validateDomainSnapshot(
  snapshot: PlanuiDomainSnapshot,
  mediaBlobsById?: ReadonlyMap<string, Uint8Array>
): PlanuiDomainSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new PlanuiError('VALIDATION_FAILED', 'snapshot');
  }

  const requiredArrayKeys: (keyof Omit<PlanuiDomainSnapshot, 'settings'>)[] = [
    'folders',
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
  for (const key of requiredArrayKeys) {
    if (!Array.isArray(snapshot[key])) {
      throw new PlanuiError('VALIDATION_FAILED', `snapshot.${key}`);
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
        lifeAreaQuestionIds.size > 0 &&
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
      lifeAreaQuestionIds.size > 0 &&
      !lifeAreaQuestionIds.has(p.lifeAreaId)
    ) {
      throw new PlanuiError('VALIDATION_FAILED', `project.lifeAreaId:${p.lifeAreaId}`);
    }
    if (projectIds.has(p.id)) throw new PlanuiError('INVALID_ID', p.id);
    projectIds.add(p.id);
  }

  const stageProjectMap = new Map<string, string>();
  for (const s of snapshot.stages) {
    validateStageRecord(s, projectIds, goalIds);
    if (stageProjectMap.has(s.id)) throw new PlanuiError('INVALID_ID', s.id);
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
      lifeAreaQuestionIds.size > 0 &&
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
    validateWishItemRecord(w, wishlistCategoryIds);
    if (wishIds.has(w.id)) {
      throw new PlanuiError('INVALID_ID', w.id);
    }
    wishIds.add(w.id);
  }

  validateSettingsRecord(snapshot.settings);

  return snapshot;
}
