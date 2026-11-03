import { PrimaryDestinationId, UK_STRINGS } from '../i18n/uk';
import { TaskPriority, TaskState, ThemePreference } from '../domain/types';
import { CalendarSecondaryFilter } from '../domain/scheduling';

export interface PrimaryNavItem {
  id: PrimaryDestinationId;
  labelUk: string;
  hashPath: string;
  isCenter: boolean;
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { id: 'calendar', labelUk: UK_STRINGS.nav.calendar, hashPath: '#/calendar', isCenter: false },
  { id: 'plans', labelUk: UK_STRINGS.nav.plans, hashPath: '#/plans', isCenter: false },
  { id: 'today', labelUk: UK_STRINGS.nav.today, hashPath: '#/today', isCenter: true },
  { id: 'habits', labelUk: UK_STRINGS.nav.habits, hashPath: '#/habits', isCenter: false },
  { id: 'me', labelUk: UK_STRINGS.nav.me, hashPath: '#/me', isCenter: false },
] as const;

export type CalendarViewMode = 'month' | 'week' | 'day' | 'work_schedule';
export type HabitsFilterMode = 'active' | 'paused' | 'archived';
export type MeSubViewMode =
  | 'overview'
  | 'records'
  | 'life_areas'
  | 'inspiration'
  | 'wishlist'
  | 'settings';
export type PlansTaskStateFilter = 'all' | TaskState;
export type PlansPriorityFilter = 'all' | TaskPriority;

export interface DestinationContextMap {
  calendar: {
    selectedDate: string;
    mode: CalendarViewMode;
    secondaryFilter: CalendarSecondaryFilter;
    scrollTop: number;
  };
  plans: {
    activeFolderId: string | null;
    activeProjectId: string | null;
    searchQuery: string;
    taskStateFilter: PlansTaskStateFilter;
    priorityFilter: PlansPriorityFilter;
    showCompletedTasks: boolean;
    showArchivedProjects: boolean;
    scrollTop: number;
  };
  today: {
    selectedDate: string;
    nextDayCollapsed: boolean;
    untimedCollapsed: boolean;
    scrollTop: number;
  };
  habits: {
    selectedDate: string;
    filter: HabitsFilterMode;
    scrollTop: number;
  };
  me: {
    subView: MeSubViewMode;
    activeWishlistCategoryId?: string | null;
    scrollTop: number;
  };
}

export function createInitialDestinationContextMap(todayDate: string): DestinationContextMap {
  return {
    calendar: {
      selectedDate: todayDate,
      mode: 'month',
      secondaryFilter: 'all',
      scrollTop: 0,
    },
    plans: {
      activeFolderId: null,
      activeProjectId: null,
      searchQuery: '',
      taskStateFilter: 'all',
      priorityFilter: 'all',
      showCompletedTasks: true,
      showArchivedProjects: false,
      scrollTop: 0,
    },
    today: {
      selectedDate: todayDate,
      nextDayCollapsed: false,
      untimedCollapsed: false,
      scrollTop: 0,
    },
    habits: {
      selectedDate: todayDate,
      filter: 'active',
      scrollTop: 0,
    },
    me: {
      subView: 'overview',
      activeWishlistCategoryId: null,
      scrollTop: 0,
    },
  };
}

export function updateDestinationContext<K extends PrimaryDestinationId>(
  map: DestinationContextMap,
  destination: K,
  patch: Partial<DestinationContextMap[K]>
): DestinationContextMap {
  return {
    ...map,
    [destination]: {
      ...map[destination],
      ...patch,
    },
  };
}

export function parseDestinationFromHash(hash: string): PrimaryDestinationId {
  const cleaned = hash.replace(/^#\/?/, '').split(/[/?]/)[0]?.toLowerCase() ?? '';
  switch (cleaned) {
    case 'calendar':
      return 'calendar';
    case 'plans':
      return 'plans';
    case 'today':
      return 'today';
    case 'habits':
      return 'habits';
    case 'me':
      return 'me';
    default:
      return 'today';
  }
}

export function formatHashForDestination(destination: PrimaryDestinationId): string {
  return `#/${destination}`;
}

export type CreationActionKind =
  | 'task'
  | 'project'
  | 'stage'
  | 'folder'
  | 'personal_record'
  | 'event'
  | 'shift'
  | 'day_off'
  | 'habit'
  | 'inspiration'
  | 'wish'
  | 'wishlist_category';

export interface CreationActionDescriptor {
  kind: CreationActionKind;
  labelUk: string;
  descriptionUk: string;
  implementedInCurrentStage: boolean;
  prioritizedInDestinations: PrimaryDestinationId[];
  prioritizedInMeSubViews?: MeSubViewMode[];
  prioritizedInCalendarModes?: CalendarViewMode[];
}

export const CREATION_ACTION_REGISTRY: readonly CreationActionDescriptor[] = [
  {
    kind: 'task',
    labelUk: UK_STRINGS.creation.actions.task.label,
    descriptionUk: UK_STRINGS.creation.actions.task.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['plans', 'today', 'calendar'],
  },
  {
    kind: 'project',
    labelUk: UK_STRINGS.creation.actions.project.label,
    descriptionUk: UK_STRINGS.creation.actions.project.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['plans'],
  },
  {
    kind: 'stage',
    labelUk: UK_STRINGS.creation.actions.stage.label,
    descriptionUk: UK_STRINGS.creation.actions.stage.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['plans'],
  },
  {
    kind: 'folder',
    labelUk: UK_STRINGS.creation.actions.folder.label,
    descriptionUk: UK_STRINGS.creation.actions.folder.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['plans'],
  },
  {
    kind: 'personal_record',
    labelUk: UK_STRINGS.creation.actions.personal_record.label,
    descriptionUk: UK_STRINGS.creation.actions.personal_record.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['me', 'today'],
    prioritizedInMeSubViews: ['records', 'settings', 'wishlist'],
  },
  {
    kind: 'event',
    labelUk: UK_STRINGS.creation.actions.event.label,
    descriptionUk: UK_STRINGS.creation.actions.event.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['calendar', 'today'],
  },
  {
    kind: 'shift',
    labelUk: UK_STRINGS.creation.actions.shift.label,
    descriptionUk: UK_STRINGS.creation.actions.shift.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['calendar', 'today'],
    prioritizedInCalendarModes: ['work_schedule', 'month', 'week', 'day'],
  },
  {
    kind: 'day_off',
    labelUk: 'Позначка вихідного',
    descriptionUk: 'Явна позначка вихідного дня у графіку роботи',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['calendar'],
    prioritizedInCalendarModes: ['work_schedule', 'month', 'week', 'day'],
  },
  {
    kind: 'habit',
    labelUk: 'Нова звичка',
    descriptionUk: 'Підтримувальна регулярна дія за правилом без часових слотів',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['habits', 'today'],
  },
  {
    kind: 'inspiration',
    labelUk: 'Елемент натхнення',
    descriptionUk: 'Цитата, безпечне посилання або локальне зображення',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['me'],
    prioritizedInMeSubViews: ['overview', 'inspiration'],
  },
  {
    kind: 'wish',
    labelUk: 'Нове бажання',
    descriptionUk: 'Бажана річ або враження у списку бажань («Зараз», «Пізніше», «Колись»)',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['me'],
    prioritizedInMeSubViews: ['overview', 'wishlist'],
  },
  {
    kind: 'wishlist_category',
    labelUk: 'Категорія списку бажань',
    descriptionUk: 'Плоска категорія для впорядкування списку бажань',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['me'],
    prioritizedInMeSubViews: ['wishlist'],
  },
] as const;

export type ImplementedCreationActionKind =
  | 'task'
  | 'project'
  | 'stage'
  | 'folder'
  | 'event'
  | 'shift'
  | 'day_off'
  | 'habit'
  | 'personal_record'
  | 'inspiration'
  | 'wish'
  | 'wishlist_category';

export interface EditableCreationContext {
  originDestination: PrimaryDestinationId;
  targetDate: string | null;
  folderId: string | null;
  projectId: string | null;
  stageId: string | null;
  wishlistCategoryId: string | null;
}

export function buildInitialCreationContext(
  activeDestination: PrimaryDestinationId,
  contexts: DestinationContextMap
): EditableCreationContext {
  if (activeDestination === 'plans') {
    return {
      originDestination: 'plans',
      targetDate: null,
      folderId: contexts.plans.activeFolderId,
      projectId: contexts.plans.activeProjectId,
      stageId: null,
      wishlistCategoryId: null,
    };
  }
  if (activeDestination === 'calendar') {
    return {
      originDestination: 'calendar',
      targetDate: contexts.calendar.selectedDate,
      folderId: null,
      projectId: null,
      stageId: null,
      wishlistCategoryId: null,
    };
  }
  if (activeDestination === 'today') {
    return {
      originDestination: 'today',
      targetDate: contexts.today.selectedDate,
      folderId: null,
      projectId: null,
      stageId: null,
      wishlistCategoryId: null,
    };
  }
  if (activeDestination === 'habits') {
    return {
      originDestination: 'habits',
      targetDate: contexts.habits.selectedDate,
      folderId: null,
      projectId: null,
      stageId: null,
      wishlistCategoryId: null,
    };
  }
  if (activeDestination === 'me') {
    return {
      originDestination: 'me',
      targetDate: contexts.today.selectedDate,
      folderId: null,
      projectId: null,
      stageId: null,
      wishlistCategoryId: contexts.me.activeWishlistCategoryId ?? null,
    };
  }
  return {
    originDestination: activeDestination,
    targetDate: null,
    folderId: null,
    projectId: null,
    stageId: null,
    wishlistCategoryId: null,
  };
}

/**
 * C04 contextual creation prioritization:
 * - Calendar: event, task, shift
 * - Work Schedule: shift, day_off, event, task
 * - Plans (container view): task, project, folder, stage
 * - Project (inside an open project): task, stage, project, folder
 * - Today: task, event, shift, habit, personal_record
 * - Habits: habit, task, event, personal_record
 * - Me: personal_record, task
 * Do not show all creation types in one oversized menu. Only show implemented actions.
 */
export function getContextualCreationActions(
  activeDestination: PrimaryDestinationId,
  contexts?: DestinationContextMap
): CreationActionDescriptor[] {
  const implemented = CREATION_ACTION_REGISTRY.filter((a) => a.implementedInCurrentStage);
  const byKind = new Map(implemented.map((a) => [a.kind, a]));

  if (activeDestination === 'calendar') {
    if (contexts?.calendar.mode === 'work_schedule') {
      const order: ImplementedCreationActionKind[] = [
        'shift',
        'day_off',
        'event',
        'task',
      ];
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    const order: ImplementedCreationActionKind[] = [
      'event',
      'task',
      'shift',
      'day_off',
    ];
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  if (activeDestination === 'plans') {
    if (contexts?.plans.activeProjectId) {
      const order: ImplementedCreationActionKind[] = [
        'task',
        'stage',
        'project',
        'folder',
      ];
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    const order: ImplementedCreationActionKind[] = [
      'task',
      'project',
      'folder',
      'stage',
    ];
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  if (activeDestination === 'today') {
    const order: ImplementedCreationActionKind[] = [
      'task',
      'event',
      'shift',
      'habit',
      'personal_record',
    ];
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  if (activeDestination === 'habits') {
    const order: ImplementedCreationActionKind[] = [
      'habit',
      'task',
      'event',
      'personal_record',
    ];
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  if (activeDestination === 'me') {
    const subView = contexts?.me.subView ?? 'overview';
    if (subView === 'wishlist') {
      const order: ImplementedCreationActionKind[] = [
        'wish',
        'wishlist_category',
        'personal_record',
        'task',
      ];
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    if (subView === 'inspiration') {
      const order: ImplementedCreationActionKind[] = [
        'inspiration',
        'personal_record',
        'wish',
        'task',
      ];
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    const order: ImplementedCreationActionKind[] = [
      'personal_record',
      'inspiration',
      'wish',
      'task',
    ];
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  const order: ImplementedCreationActionKind[] = ['task', 'event', 'personal_record'];
  return order.map((k) => byKind.get(k)!).filter(Boolean);
}

export const THEME_BOOTSTRAP_STORAGE_KEY = 'planui_theme_bootstrap';
export const REDUCED_MOTION_STORAGE_KEY = 'planui_reduced_motion';
export const REDUCED_TRANSPARENCY_STORAGE_KEY = 'planui_reduced_transparency';

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}

export function applyThemeAndAccessibilityToDocument(
  themePreference: ThemePreference,
  reducedMotion: boolean,
  reducedTransparency: boolean
): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return resolveEffectiveTheme(themePreference, false);
  }
  const sysDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = resolveEffectiveTheme(themePreference, sysDark);

  const root = document.documentElement;
  root.classList.toggle('dark', effective === 'dark');
  root.setAttribute('data-theme', effective);
  root.setAttribute('data-theme-mode', themePreference);

  if (reducedMotion) {
    root.setAttribute('data-reduced-motion', 'true');
  } else {
    root.removeAttribute('data-reduced-motion');
  }

  if (reducedTransparency) {
    root.setAttribute('data-reduced-transparency', 'true');
  } else {
    root.removeAttribute('data-reduced-transparency');
  }

  const metaTheme = document.getElementById('planui-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', effective === 'dark' ? '#000000' : '#F5F5F7');
  }

  try {
    localStorage.setItem(THEME_BOOTSTRAP_STORAGE_KEY, themePreference);
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, reducedMotion ? 'true' : 'false');
    localStorage.setItem(REDUCED_TRANSPARENCY_STORAGE_KEY, reducedTransparency ? 'true' : 'false');
  } catch {
    // Ignore
  }

  return effective;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

export function wcagContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
