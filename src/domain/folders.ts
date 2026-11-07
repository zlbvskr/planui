import { PlanuiError } from '../i18n/errorsUk';
import { EntityId, Folder, FolderKind, Project, Task } from './types';

export function validateFolderHierarchy(
  folders: readonly Folder[],
  candidate?: { id: EntityId; parentId: EntityId | null }
): void {
  const parentMap = new Map<EntityId, EntityId | null>();
  for (const folder of folders) {
    if (!folder.id || typeof folder.id !== 'string') {
      throw new PlanuiError('INVALID_ID');
    }
    parentMap.set(folder.id, folder.parentId ?? null);
  }

  if (candidate) {
    if (candidate.parentId === candidate.id) {
      throw new PlanuiError('FOLDER_SELF_PARENT', candidate.id);
    }
    if (candidate.parentId !== null && !parentMap.has(candidate.parentId)) {
      throw new PlanuiError('FOLDER_PARENT_NOT_FOUND', candidate.parentId);
    }
    parentMap.set(candidate.id, candidate.parentId);
  }

  for (const [id, parentId] of parentMap.entries()) {
    if (parentId === id) {
      throw new PlanuiError('FOLDER_SELF_PARENT', id);
    }
    if (parentId !== null && !parentMap.has(parentId)) {
      throw new PlanuiError('FOLDER_PARENT_NOT_FOUND', parentId);
    }
  }

  const visitState = new Map<EntityId, 0 | 1 | 2>();
  for (const startId of parentMap.keys()) {
    if ((visitState.get(startId) ?? 0) !== 0) continue;

    const trail: EntityId[] = [];
    let curr: EntityId | null = startId;

    while (curr !== null) {
      const state = visitState.get(curr) ?? 0;
      if (state === 1) {
        throw new PlanuiError('FOLDER_CYCLE_DETECTED', curr);
      }
      if (state === 2) {
        break;
      }
      visitState.set(curr, 1);
      trail.push(curr);
      curr = parentMap.get(curr) ?? null;
    }

    for (const nodeId of trail) {
      visitState.set(nodeId, 2);
    }
  }
}

export function getFolderAncestorChain(
  folders: readonly Folder[],
  folderId: EntityId
): Folder[] {
  validateFolderHierarchy(folders);
  const byId = new Map<EntityId, Folder>();
  for (const f of folders) {
    byId.set(f.id, f);
  }

  const chain: Folder[] = [];
  let currentId: EntityId | null = folderId;
  const seen = new Set<EntityId>();

  while (currentId !== null) {
    if (seen.has(currentId)) {
      throw new PlanuiError('FOLDER_CYCLE_DETECTED', currentId);
    }
    seen.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) break;
    chain.push(folder);
    currentId = folder.parentId;
  }

  return chain.reverse();
}

export function collectDescendantFolderIds(
  folders: readonly Folder[],
  rootFolderId: EntityId
): Set<EntityId> {
  validateFolderHierarchy(folders);
  const childrenByParent = new Map<EntityId, EntityId[]>();
  for (const f of folders) {
    if (f.parentId !== null) {
      const list = childrenByParent.get(f.parentId) ?? [];
      list.push(f.id);
      childrenByParent.set(f.parentId, list);
    }
  }

  const result = new Set<EntityId>([rootFolderId]);
  const stack: EntityId[] = [rootFolderId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }

  return result;
}

/**
 * Creates a new Folder with nesting and optional area binding.
 */
export function createFolder(
  kind: FolderKind,
  name: string,
  options?: {
    id?: EntityId;
    parentId?: EntityId | null;
    areaId?: EntityId | null;
    order?: number;
    nowIso?: string;
  }
): Folder {
  const now = options?.nowIso ?? new Date().toISOString();
  return {
    id: options?.id ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: name.trim(),
    parentId: options?.parentId ?? null,
    areaId: options?.areaId ?? null,
    order: options?.order ?? 0,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

/**
 * Updates an existing folder while validating hierarchy to prevent cycles.
 */
export function updateFolder(
  folder: Folder,
  updates: Partial<Pick<Folder, 'name' | 'parentId' | 'areaId' | 'order' | 'kind'>>,
  allFolders?: readonly Folder[]
): Folder {
  const nextParentId = updates.parentId !== undefined ? (updates.parentId ?? null) : folder.parentId;
  if (allFolders && nextParentId !== folder.parentId) {
    validateFolderHierarchy(allFolders, { id: folder.id, parentId: nextParentId });
  }
  return {
    ...folder,
    ...updates,
    parentId: nextParentId,
    updatedAt: new Date().toISOString(),
    revision: folder.revision + 1,
  };
}

/**
 * Deletes a folder and all its descendants from a folders array.
 */
export function deleteFolderCascade(
  folders: readonly Folder[],
  folderIdToDelete: EntityId
): Folder[] {
  const idsToRemove = collectDescendantFolderIds(folders, folderIdToDelete);
  return folders.filter((f) => !idsToRemove.has(f.id));
}

/**
 * Moves an item between folders while preserving its manual order.
 */
export function moveItemToFolder<T extends { folderId?: EntityId | null; order?: number }>(
  item: T,
  targetFolderId: EntityId | null
): T {
  return {
    ...item,
    folderId: targetFolderId,
    // Note: order is preserved as required
  };
}

/**
 * In kind 'projects': a folder may contain child folders, projects, and tasks.
 * Returns the direct contents of a folder (or root when folderId is null).
 */
export function getProjectsFolderContents(
  folderId: EntityId | null,
  data: {
    folders?: readonly Folder[];
    projects?: readonly Project[];
    tasks?: readonly Task[];
  }
): {
  childFolders: Folder[];
  projects: Project[];
  tasks: Task[];
} {
  const childFolders = (data.folders ?? [])
    .filter((f) => (f.kind === undefined || f.kind === 'projects') && (f.parentId ?? null) === folderId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const projects = (data.projects ?? [])
    .filter((p) => (p.folderId ?? null) === folderId && !p.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const tasks = (data.tasks ?? [])
    .filter((t) => {
      const taskFolderId =
        t.folderId ??
        (t.ownership?.kind === 'folder'
          ? t.ownership.folderId
          : t.ownership?.kind === 'standalone'
            ? null
            : undefined);
      return taskFolderId !== undefined && (taskFolderId ?? null) === folderId;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return { childFolders, projects, tasks };
}

