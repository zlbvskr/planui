import { collectDescendantFolderIds, validateFolderHierarchy } from './folders';
import { EntityId, Folder, Goal, Project, TaskOwnership } from './types';




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
    folderId?: EntityId | null;
  },
  context: {
    goalsById: ReadonlyMap<EntityId, Goal>;
    projectsById: ReadonlyMap<EntityId, Project>;
    foldersById?: ReadonlyMap<EntityId, Folder>;
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

  if (!inheritedLifeAreaId && context.foldersById) {
    const owner = entity.ownership;
    const project = owner?.kind === 'project' ? context.projectsById.get(owner.projectId) : undefined;
    const goalId = owner?.kind === 'goal' ? owner.goalId : project?.goalId ?? entity.goalId;
    const goal = goalId ? context.goalsById.get(goalId) : undefined;
    const folderId = owner?.kind === 'folder' || owner?.kind === 'standalone' ? owner.folderId : entity.folderId ?? project?.folderId ?? goal?.folderId;
    inheritedLifeAreaId = folderId ? context.foldersById.get(folderId)?.lifeAreaId ?? null : null;
  }
  const effectiveLifeAreaId = directLifeAreaId ?? inheritedLifeAreaId;

  return {
    directLifeAreaId,
    inheritedLifeAreaId,
    effectiveLifeAreaId,
  };
}
