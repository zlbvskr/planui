import {
  collectDescendantFolderIds,
  getFolderAncestorChain,
  validateFolderHierarchy,
} from './folders';
import { compareLocalDates } from './temporal';
import {
  EntityId,
  Folder,
  IsoInstantString,
  LocalDateString,
  Project,
  Task,
  TaskReservation,
} from './types';

/**
 * C05 & 4.5 Project Progress Calculation
 * - Completed tasks divided by all non-canceled project tasks.
 * - Do not count stages or checklist items as extra tasks.
 * - Hidden completed tasks remain in the calculation.
 * - Show an honest empty state when there are no countable tasks (percentage = null).
 */
export interface ProjectTaskProgress {
  completedCount: number;
  openCount: number;
  canceledCount: number;
  totalCountable: number;
  percentage: number | null;
  hasCountableTasks: boolean;
}

export function calculateProjectTaskProgress(
  tasks: readonly Task[],
  projectId: EntityId
): ProjectTaskProgress {
  let completedCount = 0;
  let openCount = 0;
  let canceledCount = 0;

  for (const task of tasks) {
    if (
      task.ownership.kind === 'project' &&
      task.ownership.projectId === projectId
    ) {
      if (task.state === 'completed') {
        completedCount++;
      } else if (task.state === 'open') {
        openCount++;
      } else if (task.state === 'canceled') {
        canceledCount++;
      }
    }
  }

  const totalCountable = completedCount + openCount;
  const hasCountableTasks = totalCountable > 0;
  const percentage = hasCountableTasks
    ? Math.round((completedCount / totalCountable) * 100)
    : null;

  return {
    completedCount,
    openCount,
    canceledCount,
    totalCountable,
    percentage,
    hasCountableTasks,
  };
}

/**
 * C05 & 4.4 Explicit Project Completion Check
 * Returns all open (unresolved) tasks belonging to the project so the UI can display them
 * before project completion without completing them silently.
 */
export function getUnresolvedProjectTasks(
  tasks: readonly Task[],
  projectId: EntityId
): Task[] {
  return tasks.filter(
    (t) =>
      t.ownership.kind === 'project' &&
      t.ownership.projectId === projectId &&
      t.state === 'open'
  );
}

/**
 * C06 & 4.5 Temporal Notice Classification
 * Distinguishes:
 * 1. Overdue deadline (`isDeadlineOverdue`)
 * 2. Elapsed timed planning (`isElapsedTimedPlanning`)
 * 3. Open task assigned to a past local date (`isPastPlannedDate`)
 * Never labels elapsed planning or past planned date as "overdue" if no deadline has passed.
 */
export interface TaskTemporalNotice {
  isDeadlineOverdue: boolean;
  isPastPlannedDate: boolean;
  isElapsedTimedPlanning: boolean;
}

export function classifyTaskTemporalNotice(
  task: Task,
  reservations: readonly TaskReservation[],
  todayLocalDate: LocalDateString,
  nowIso: IsoInstantString
): TaskTemporalNotice {
  if (task.state !== 'open') {
    return {
      isDeadlineOverdue: false,
      isPastPlannedDate: false,
      isElapsedTimedPlanning: false,
    };
  }

  let isDeadlineOverdue = false;
  if (task.deadline !== null) {
    if (task.deadline.kind === 'date_only') {
      isDeadlineOverdue =
        compareLocalDates(task.deadline.localDate, todayLocalDate) < 0;
    } else if (task.deadline.kind === 'exact_instant') {
      isDeadlineOverdue =
        Date.parse(task.deadline.instant) < Date.parse(nowIso);
    }
  }

  const isPastPlannedDate =
    task.planningState === 'date_only' &&
    task.plannedDate !== null &&
    compareLocalDates(task.plannedDate, todayLocalDate) < 0;

  const nowMs = Date.parse(nowIso);
  const activeTaskReservations = reservations.filter(
    (r) => r.taskId === task.id && r.state === 'active'
  );
  const isElapsedTimedPlanning =
    activeTaskReservations.length > 0 &&
    activeTaskReservations.every(
      (r) => Date.parse(r.interval.endInstant) <= nowMs
    );

  return {
    isDeadlineOverdue,
    isPastPlannedDate,
    isElapsedTimedPlanning,
  };
}

/**
 * C05 & 4.1 Folder Deletion Impact Counts
 */
export interface FolderDeletionImpact {
  descendantFolderCount: number; // excludes the root folder being deleted
  totalFoldersToDelete: number; // includes the root folder being deleted
  projectCount: number;
  standaloneTaskCount: number;
  projectTaskCount: number;
  totalTaskCount: number;
  isNonEmpty: boolean;
}

export function computeFolderDeleteImpact(
  folders: readonly Folder[],
  projects: readonly Project[],
  tasks: readonly Task[],
  folderId: EntityId
): FolderDeletionImpact {
  const subtreeIds = collectDescendantFolderIds(folders, folderId);
  const affectedProjectIds = new Set<EntityId>();

  for (const proj of projects) {
    if (proj.folderId !== null && subtreeIds.has(proj.folderId)) {
      affectedProjectIds.add(proj.id);
    }
  }

  let standaloneTaskCount = 0;
  let projectTaskCount = 0;

  for (const task of tasks) {
    if (
      task.ownership.kind === 'standalone' &&
      task.ownership.folderId !== null &&
      subtreeIds.has(task.ownership.folderId)
    ) {
      standaloneTaskCount++;
    } else if (
      task.ownership.kind === 'project' &&
      affectedProjectIds.has(task.ownership.projectId)
    ) {
      projectTaskCount++;
    }
  }

  const descendantFolderCount = Math.max(0, subtreeIds.size - 1);
  const projectCount = affectedProjectIds.size;
  const totalTaskCount = standaloneTaskCount + projectTaskCount;

  return {
    descendantFolderCount,
    totalFoldersToDelete: subtreeIds.size,
    projectCount,
    standaloneTaskCount,
    projectTaskCount,
    totalTaskCount,
    isNonEmpty:
      descendantFolderCount > 0 || projectCount > 0 || totalTaskCount > 0,
  };
}

/**
 * C05 & 4.1 Cycle-Safe Folder Move Targets
 * Returns folders that `movingFolderId` can safely be moved into (excluding itself and its descendants).
 */
export function getAllowedMoveTargetFolders(
  folders: readonly Folder[],
  movingFolderId: EntityId
): Folder[] {
  validateFolderHierarchy(folders);
  const forbiddenIds = collectDescendantFolderIds(folders, movingFolderId);
  return folders.filter((f) => !forbiddenIds.has(f.id));
}

/**
 * C05 & 4.1 Manageable Breadcrumb Path with Full Ancestor Access
 */
export interface BreadcrumbPresentation {
  isAbbreviated: boolean;
  visibleLeading: Folder[];
  hiddenMiddle: Folder[];
  visibleTrailing: Folder[];
  fullChain: Folder[];
}

export function buildAbbreviatedBreadcrumbs(
  folders: readonly Folder[],
  activeFolderId: EntityId | null,
  maxVisible = 3
): BreadcrumbPresentation {
  if (!activeFolderId) {
    return {
      isAbbreviated: false,
      visibleLeading: [],
      hiddenMiddle: [],
      visibleTrailing: [],
      fullChain: [],
    };
  }
  const fullChain = getFolderAncestorChain(folders, activeFolderId);
  if (fullChain.length <= maxVisible) {
    return {
      isAbbreviated: false,
      visibleLeading: fullChain,
      hiddenMiddle: [],
      visibleTrailing: [],
      fullChain,
    };
  }

  return {
    isAbbreviated: true,
    visibleLeading: [fullChain[0]],
    hiddenMiddle: fullChain.slice(1, fullChain.length - (maxVisible - 1)),
    visibleTrailing: fullChain.slice(fullChain.length - (maxVisible - 1)),
    fullChain,
  };
}
