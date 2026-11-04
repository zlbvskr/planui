import {
  collectDescendantFolderIds,
  getFolderAncestorChain,
  validateFolderHierarchy,
} from './folders';
import { compareLocalDates } from './temporal';
import {
  EntityId,
  Folder,
  Goal,
  IsoInstantString,
  LocalDateString,
  Project,
  Task,
  TaskOwnership,
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
    const isFolderTask =
      (task.ownership.kind === 'folder' && subtreeIds.has(task.ownership.folderId)) ||
      (task.ownership.kind === 'standalone' &&
        task.ownership.folderId &&
        subtreeIds.has(task.ownership.folderId));

    if (isFolderTask) {
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

/**
 * M1 / Goal Task Progress Calculation
 * Calculates countable progress across direct tasks and (optionally) projects of a goal.
 * Completed tasks divided by all non-canceled countable tasks.
 */
export interface GoalTaskProgress {
  directTasks: {
    completedCount: number;
    openCount: number;
    canceledCount: number;
    totalCountable: number;
  };
  projectTasks: {
    completedCount: number;
    openCount: number;
    canceledCount: number;
    totalCountable: number;
  };
  totalCountable: number;
  completedCount: number;
  percentage: number | null;
  hasCountableTasks: boolean;
}

export function calculateGoalProgress(
  goalId: EntityId,
  tasks: readonly Task[],
  projects: readonly Project[]
): GoalTaskProgress {
  const associatedProjectIds = new Set<EntityId>(
    projects.filter((p) => p.goalId === goalId).map((p) => p.id)
  );

  let directCompleted = 0;
  let directOpen = 0;
  let directCanceled = 0;

  let projectCompleted = 0;
  let projectOpen = 0;
  let projectCanceled = 0;

  for (const task of tasks) {
    if (task.ownership.kind === 'goal' && task.ownership.goalId === goalId) {
      if (task.state === 'completed') directCompleted++;
      else if (task.state === 'open') directOpen++;
      else if (task.state === 'canceled') directCanceled++;
    } else if (
      task.ownership.kind === 'project' &&
      associatedProjectIds.has(task.ownership.projectId)
    ) {
      if (task.state === 'completed') projectCompleted++;
      else if (task.state === 'open') projectOpen++;
      else if (task.state === 'canceled') projectCanceled++;
    }
  }

  const directTotal = directCompleted + directOpen;
  const projectTotal = projectCompleted + projectOpen;
  const totalCountable = directTotal + projectTotal;
  const totalCompleted = directCompleted + projectCompleted;

  const percentage =
    totalCountable > 0 ? Math.round((totalCompleted / totalCountable) * 100) : null;

  return {
    directTasks: {
      completedCount: directCompleted,
      openCount: directOpen,
      canceledCount: directCanceled,
      totalCountable: directTotal,
    },
    projectTasks: {
      completedCount: projectCompleted,
      openCount: projectOpen,
      canceledCount: projectCanceled,
      totalCountable: projectTotal,
    },
    totalCountable,
    completedCount: totalCompleted,
    percentage,
    hasCountableTasks: totalCountable > 0,
  };
}

/**
 * M1 / Life-Area Inheritance Resolution
 * Direct lifeAreaId takes precedence.
 * If unset, inherited from parent Goal (for a project or direct task) or Project's Goal.
 * Resolved dynamically without copying or overwriting descendant fields.
 */
export interface ResolvedLifeAreaContext {
  directLifeAreaId: EntityId | null;
  inheritedLifeAreaId: EntityId | null;
  effectiveLifeAreaId: EntityId | null;
}

export function resolveEffectiveLifeArea(
  entity: {
    lifeAreaId?: EntityId | null;
    ownership?: TaskOwnership;
    goalId?: EntityId | null;
  },
  context: {
    goalsById: ReadonlyMap<EntityId, Goal>;
    projectsById: ReadonlyMap<EntityId, Project>;
  }
): ResolvedLifeAreaContext {
  const directLifeAreaId = entity.lifeAreaId ?? null;
  let inheritedLifeAreaId: EntityId | null = null;

  if (entity.ownership) {
    if (entity.ownership.kind === 'goal') {
      const parentGoal = context.goalsById.get(entity.ownership.goalId);
      inheritedLifeAreaId = parentGoal?.lifeAreaId ?? null;
    } else if (entity.ownership.kind === 'project') {
      const parentProject = context.projectsById.get(entity.ownership.projectId);
      if (parentProject) {
        if (parentProject.lifeAreaId) {
          inheritedLifeAreaId = parentProject.lifeAreaId;
        } else if (parentProject.goalId) {
          const parentGoal = context.goalsById.get(parentProject.goalId);
          inheritedLifeAreaId = parentGoal?.lifeAreaId ?? null;
        }
      }
    }
  } else if (entity.goalId) {
    const parentGoal = context.goalsById.get(entity.goalId);
    inheritedLifeAreaId = parentGoal?.lifeAreaId ?? null;
  }

  const effectiveLifeAreaId = directLifeAreaId ?? inheritedLifeAreaId;

  return {
    directLifeAreaId,
    inheritedLifeAreaId,
    effectiveLifeAreaId,
  };
}
