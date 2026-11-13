import { PlanuiError } from '../i18n/errorsUk';
import { EntityId, Folder } from './types';

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

