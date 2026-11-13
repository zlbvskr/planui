import { Folder, WishlistCategory } from '../domain/types';
import { DEMO_AREA_KEYS, DEMO_PREFIX } from './common';

export const DEMO_FOLDERS = {
  taskHome: `${DEMO_PREFIX}folder-task-home`,
  taskRepair: `${DEMO_PREFIX}folder-task-repair`,
  taskLearning: `${DEMO_PREFIX}folder-task-learning`,
  taskWork: `${DEMO_PREFIX}folder-task-work`,
  taskPersonal: `${DEMO_PREFIX}folder-task-personal`,
  habitMorning: `${DEMO_PREFIX}folder-habit-morning`,
  habitEvening: `${DEMO_PREFIX}folder-habit-evening`,
  projCreativity: `${DEMO_PREFIX}folder-proj-creativity`,
  projLearning: `${DEMO_PREFIX}folder-proj-learning`,
  projWork: `${DEMO_PREFIX}folder-proj-work`,
  projPersonal: `${DEMO_PREFIX}folder-proj-personal`,
  projHome: `${DEMO_PREFIX}folder-proj-home`,
} as const;

export const DEMO_WISH_CATEGORIES = {
  tech: `${DEMO_PREFIX}wish-cat-tech`,
  travel: `${DEMO_PREFIX}wish-cat-travel`,
  growth: `${DEMO_PREFIX}wish-cat-growth`,
  music: `${DEMO_PREFIX}wish-cat-music`,
} as const;

export function buildDemoFolders(nowIso: string): Folder[] {
  const f = (id: string, name: string, kind: Folder['kind'], parentId: string | null = null, areaId?: string, order = 0): Folder =>
    ({ id, name, kind, parentId, areaId, lifeAreaId: areaId, isDemo: true, order, createdAt: nowIso, updatedAt: nowIso, revision: 1 });

  return [
    f(DEMO_FOLDERS.taskHome, 'Дім', 'tasks', null, DEMO_AREA_KEYS.home, 0),
    f(DEMO_FOLDERS.taskRepair, 'Ремонт', 'tasks', DEMO_FOLDERS.taskHome, DEMO_AREA_KEYS.home, 1),
    f(DEMO_FOLDERS.taskLearning, 'Навчання', 'tasks', null, DEMO_AREA_KEYS.learning, 2),
    f(DEMO_FOLDERS.taskWork, 'Робота', 'tasks', null, DEMO_AREA_KEYS.work, 3),
    f(DEMO_FOLDERS.taskPersonal, 'Особисте', 'tasks', null, DEMO_AREA_KEYS.relationships, 4),
    f(DEMO_FOLDERS.habitMorning, 'Ранок', 'habits', null, undefined, 0),
    f(DEMO_FOLDERS.habitEvening, 'Вечір', 'habits', null, undefined, 1),
    f(DEMO_FOLDERS.projCreativity, 'Творчість', 'projects', null, DEMO_AREA_KEYS.creativity, 0),
    f(DEMO_FOLDERS.projLearning, 'Навчання', 'projects', null, DEMO_AREA_KEYS.learning, 1),
    f(DEMO_FOLDERS.projWork, 'Робота', 'projects', null, DEMO_AREA_KEYS.work, 2),
    f(DEMO_FOLDERS.projPersonal, 'Особисте', 'projects', null, DEMO_AREA_KEYS.relationships, 3),
    f(DEMO_FOLDERS.projHome, 'Дім', 'projects', DEMO_FOLDERS.projPersonal, DEMO_AREA_KEYS.home, 4),
  ];
}

export function buildDemoWishlistCategories(nowIso: string): WishlistCategory[] {
  const c = (id: string, name: string, order: number): WishlistCategory =>
    ({ id, name, order, isDemo: true, createdAt: nowIso, updatedAt: nowIso, revision: 1 });
  return [
    c(DEMO_WISH_CATEGORIES.tech, 'Техніка', 0),
    c(DEMO_WISH_CATEGORIES.travel, 'Подорожі', 1),
    c(DEMO_WISH_CATEGORIES.growth, 'Розвиток', 2),
    c(DEMO_WISH_CATEGORIES.music, 'Для музики', 3),
  ];
}
