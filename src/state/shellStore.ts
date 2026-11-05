import { AnyDestinationId, PrimaryDestinationId, UK_STRINGS } from '../i18n/uk';
import { TaskPriority, TaskState, ThemePreference, TodayMode } from '../domain/types';
import { CalendarSecondaryFilter } from '../domain/scheduling';

export interface PrimaryNavItem {
  id: PrimaryDestinationId;
  labelUk: string;
  hashPath: string;
  isCenter: boolean;
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { id: 'today', labelUk: UK_STRINGS.nav.today, hashPath: '#/today', isCenter: false },
  { id: 'calendar', labelUk: UK_STRINGS.nav.calendar, hashPath: '#/calendar', isCenter: false },
  { id: 'directions', labelUk: UK_STRINGS.nav.directions, hashPath: '#/directions', isCenter: false },
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

export interface DirectionsDestinationContext {
  activeFolderId: string | null;
  activeGoalId?: string | null;
  activeProjectId: string | null;
  searchQuery: string;
  taskStateFilter: PlansTaskStateFilter;
  priorityFilter: PlansPriorityFilter;
  showCompletedTasks: boolean;
  showArchivedProjects: boolean;
  scrollTop: number;
}

export interface DestinationContextMap {
  today: {
    selectedDate: string;
    nextDayCollapsed: boolean;
    untimedCollapsed: boolean;
    habitsExpanded?: boolean;
    mode?: TodayMode;
    modeScrollTops?: Partial<Record<TodayMode, number>>;
    hasInteraction?: boolean;
    scrollTop: number;
  };
  calendar: {
    selectedDate: string;
    mode: CalendarViewMode;
    secondaryFilter: CalendarSecondaryFilter;
    scrollTop: number;
  };
  directions: DirectionsDestinationContext;
  me: {
    subView: MeSubViewMode;
    activeWishlistCategoryId?: string | null;
    scrollTop: number;
  };
  // Backwards compatibility aliases for existing components and tests
  plans: DirectionsDestinationContext;
  habits: {
    selectedDate: string;
    filter: HabitsFilterMode;
    scrollTop: number;
  };
}

export function createInitialDestinationContextMap(todayDate: string): DestinationContextMap {
  const directionsCtx: DirectionsDestinationContext = {
    activeFolderId: null,
    activeGoalId: null,
    activeProjectId: null,
    searchQuery: '',
    taskStateFilter: 'all',
    priorityFilter: 'all',
    showCompletedTasks: true,
    showArchivedProjects: false,
    scrollTop: 0,
  };

  return {
    today: {
      selectedDate: todayDate,
      mode: 'day',
      hasInteraction: false,
      nextDayCollapsed: false,
      untimedCollapsed: false,
      scrollTop: 0,
    },
    calendar: {
      selectedDate: todayDate,
      mode: 'month',
      secondaryFilter: 'all',
      scrollTop: 0,
    },
    directions: directionsCtx,
    me: {
      subView: 'overview',
      activeWishlistCategoryId: null,
      scrollTop: 0,
    },
    plans: directionsCtx,
    habits: {
      selectedDate: todayDate,
      filter: 'active',
      scrollTop: 0,
    },
  };
}

export function updateDestinationContext<K extends PrimaryDestinationId | 'plans' | 'habits'>(
  map: DestinationContextMap,
  destination: K,
  patch: Partial<any>
): DestinationContextMap {
  if (destination === 'plans' || destination === 'directions') {
    const updated: DirectionsDestinationContext = {
      ...(map.directions ?? map.plans),
      ...patch,
    };
    return {
      ...map,
      directions: updated,
      plans: updated,
    };
  }

  return {
    ...map,
    [destination]: {
      ...(map as any)[destination],
      ...patch,
    },
  };
}

export function parseDestinationFromHash(hash: string): PrimaryDestinationId {
  const cleaned = hash.replace(/^#\/?/, '').split(/[/?]/)[0]?.toLowerCase() ?? '';
  switch (cleaned) {
    case 'today':
      return 'today';
    case 'calendar':
      return 'calendar';
    case 'directions':
    case 'plans': // Former Plans route migrated to Directions context
      return 'directions';
    case 'me':
    case 'diary': // Former diary/records routes lead to accessible legacy history in 'me'
    case 'records':
    case 'settings':
    case 'wishlist':
    case 'inspiration':
    case 'life_areas':
      return 'me';
    case 'habits': // Former Habits route opens Today
      return 'today';
    default:
      return 'today';
  }
}

export function extractSubViewFromHash(hash: string): MeSubViewMode | null {
  const cleaned = hash.replace(/^#\/?/, '').split(/[/?]/)[0]?.toLowerCase() ?? '';
  if (cleaned === 'diary' || cleaned === 'records') {
    return 'records';
  }
  if (cleaned === 'settings') {
    return 'settings';
  }
  if (cleaned === 'wishlist') {
    return 'wishlist';
  }
  if (cleaned === 'inspiration') {
    return 'inspiration';
  }
  if (cleaned === 'life_areas') {
    return 'life_areas';
  }
  return null;
}

export function formatHashForDestination(destination: PrimaryDestinationId | AnyDestinationId): string {
  if (destination === 'plans') return '#/directions';
  if (destination === 'habits') return '#/today';
  return `#/${destination}`;
}

export type CreationActionKind =
  | 'task'
  | 'goal'
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
  prioritizedInDestinations: (PrimaryDestinationId | 'plans' | 'habits')[];
  prioritizedInMeSubViews?: MeSubViewMode[];
  prioritizedInCalendarModes?: CalendarViewMode[];
}

export const CREATION_ACTION_REGISTRY: readonly CreationActionDescriptor[] = [
  {
    kind: 'task',
    labelUk: UK_STRINGS.creation.actions.task.label,
    descriptionUk: UK_STRINGS.creation.actions.task.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['today', 'calendar', 'directions', 'plans'],
  },
  {
    kind: 'goal',
    labelUk: 'Нова ціль',
    descriptionUk: 'Особиста ціль із критеріями завершення та наступним кроком',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['directions', 'plans'],
  },
  {
    kind: 'project',
    labelUk: UK_STRINGS.creation.actions.project.label,
    descriptionUk: UK_STRINGS.creation.actions.project.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['directions', 'plans'],
  },
  {
    kind: 'stage',
    labelUk: UK_STRINGS.creation.actions.stage.label,
    descriptionUk: UK_STRINGS.creation.actions.stage.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['directions', 'plans'],
  },
  {
    kind: 'folder',
    labelUk: UK_STRINGS.creation.actions.folder.label,
    descriptionUk: UK_STRINGS.creation.actions.folder.description,
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['directions', 'plans'],
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
    prioritizedInDestinations: ['today'],
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
  | 'goal'
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
  originDestination: PrimaryDestinationId | 'plans' | 'habits';
  targetDate: string | null;
  folderId: string | null;
  goalId: string | null;
  projectId: string | null;
  stageId: string | null;
  wishlistCategoryId: string | null;
}

export function buildInitialCreationContext(
  activeDestination: PrimaryDestinationId | 'plans' | 'habits',
  contexts: DestinationContextMap
): EditableCreationContext {
  if (activeDestination === 'directions' || activeDestination === 'plans') {
    const dir = contexts.directions ?? contexts.plans;
    return {
      originDestination: 'directions',
      targetDate: null,
      folderId: dir?.activeFolderId ?? null,
      goalId: dir?.activeGoalId ?? null,
      projectId: dir?.activeProjectId ?? null,
      stageId: null,
      wishlistCategoryId: null,
    };
  }
  if (activeDestination === 'calendar') {
    return {
      originDestination: 'calendar',
      targetDate: contexts.calendar.selectedDate,
      folderId: null,
      goalId: null,
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
      goalId: null,
      projectId: null,
      stageId: null,
      wishlistCategoryId: null,
    };
  }
  if (activeDestination === 'habits') {
    return {
      originDestination: 'today',
      targetDate: contexts.today.selectedDate,
      folderId: null,
      goalId: null,
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
      goalId: null,
      projectId: null,
      stageId: null,
      wishlistCategoryId: contexts.me.activeWishlistCategoryId ?? null,
    };
  }
  return {
    originDestination: 'today',
    targetDate: null,
    folderId: null,
    goalId: null,
    projectId: null,
    stageId: null,
    wishlistCategoryId: null,
  };
}

/**
 * Contextual creation prioritization for 4 destinations:
 * - "Сьогодні": task & event with selected date prefilled (+ habit/check-in if enabled)
 * - "Календар": creation in selected date/mode (event/task or shift/day_off)
 * - "Напрями": creation in current direction/goal/project
 * - "Я": appropriate creation for currently open enabled module
 * Compact action set, fast title-only task creation, no clutter.
 */
export function getContextualCreationActions(
  activeDestination: PrimaryDestinationId | 'plans' | 'habits',
  contextsOrModules?: DestinationContextMap | {
    habitsEnabled?: boolean;
    stateCheckInsEnabled?: boolean;
    desiredLifeEnabled?: boolean;
    wishlistEnabled?: boolean;
  },
  maybeModules?: {
    habitsEnabled?: boolean;
    stateCheckInsEnabled?: boolean;
    desiredLifeEnabled?: boolean;
    wishlistEnabled?: boolean;
  }
): CreationActionDescriptor[] {
  const isModulesObject = (obj: any): obj is { habitsEnabled?: boolean } =>
    obj && typeof obj === 'object' && ('habitsEnabled' in obj || 'stateCheckInsEnabled' in obj || 'desiredLifeEnabled' in obj || 'wishlistEnabled' in obj);

  const contexts = isModulesObject(contextsOrModules)
    ? undefined
    : (contextsOrModules as DestinationContextMap | undefined);
  const enabledModules = isModulesObject(contextsOrModules)
    ? contextsOrModules
    : maybeModules;

  const implemented = CREATION_ACTION_REGISTRY.filter((a) => a.implementedInCurrentStage);
  const byKind = new Map(implemented.map((a) => [a.kind, a]));

  const habitsOn = enabledModules?.habitsEnabled !== false;
  const stateCheckInsOn = enabledModules?.stateCheckInsEnabled !== false;
  const desiredLifeOn = enabledModules?.desiredLifeEnabled !== false;
  const wishlistOn = enabledModules?.wishlistEnabled !== false;

  if (activeDestination === 'today' || activeDestination === 'habits') {
    const order: ImplementedCreationActionKind[] = ['task', 'event'];
    if (habitsOn) order.push('habit');
    if (stateCheckInsOn) order.push('personal_record');
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

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

  if (activeDestination === 'directions' || activeDestination === 'plans') {
    const dir = contexts?.directions ?? contexts?.plans;
    if (dir?.activeProjectId) {
      const order: ImplementedCreationActionKind[] = [
        'task',
        'stage',
        'project',
        'goal',
      ];
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    const order: ImplementedCreationActionKind[] = [
      'task',
      'goal',
      'project',
      'folder',
      'stage',
    ];
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  if (activeDestination === 'me') {
    const subView = contexts?.me.subView ?? 'overview';
    if (subView === 'wishlist') {
      const order: ImplementedCreationActionKind[] = [];
      if (wishlistOn) {
        order.push('wish', 'wishlist_category');
      }
      order.push('task');
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    if (subView === 'inspiration') {
      const order: ImplementedCreationActionKind[] = [];
      if (desiredLifeOn) {
        order.push('inspiration');
      }
      order.push('task');
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    if (subView === 'records') {
      const order: ImplementedCreationActionKind[] = [];
      if (stateCheckInsOn) {
        order.push('personal_record');
      }
      order.push('task');
      return order.map((k) => byKind.get(k)!).filter(Boolean);
    }
    const order: ImplementedCreationActionKind[] = [];
    if (stateCheckInsOn) order.push('personal_record');
    if (desiredLifeOn) order.push('inspiration');
    if (wishlistOn) order.push('wish');
    order.push('task');
    return order.map((k) => byKind.get(k)!).filter(Boolean);
  }

  const order: ImplementedCreationActionKind[] = ['task', 'event'];
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
    const bgCanvas =
      typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(root).getPropertyValue('--bg-canvas').trim()
        : '';
    metaTheme.setAttribute('content', bgCanvas);
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
