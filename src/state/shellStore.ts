import { CalendarSecondaryFilter } from '../domain/calendarProjection';
import { TaskPriority,TaskState,ThemePreference,TodayMode } from '../domain/types';
import { AnyDestinationId,PrimaryDestinationId,UK_STRINGS } from '../i18n/uk';
import { closeTopmostOverlay,hasOpenOverlay } from '../ui/overlayStack';

export type TabDestinationId = 'today' | 'directions' | 'me' | 'calendar';

export interface PrimaryNavItem {
  id: 'today' | 'directions' | 'me';
  labelUk: string;
  hashPath: string;
  isCenter: boolean;
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { id: 'today', labelUk: UK_STRINGS.nav.today, hashPath: '#/today', isCenter: false },
  { id: 'directions', labelUk: UK_STRINGS.nav.directions, hashPath: '#/directions', isCenter: false },
  { id: 'me', labelUk: UK_STRINGS.nav.me, hashPath: '#/me', isCenter: false },
] as const;

export type CalendarViewMode = 'month' | 'week';
export type HabitsFilterMode = 'active' | 'paused' | 'archived';
export type MeSubViewMode =
  | 'overview'
  | 'records'
  | 'life_areas'
  | 'inspiration'
  | 'wishlist'
  | 'settings';
type PlansTaskStateFilter = 'all' | TaskState;
type PlansPriorityFilter = 'all' | TaskPriority;
export type DirectionsSubMode = 'projects' | 'goals';

interface DirectionsDestinationContext {
  subMode?: DirectionsSubMode;
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
  // Backwards compatibility aliases for existing components
  plans: DirectionsDestinationContext;
  habits: {
    selectedDate: string;
    filter: HabitsFilterMode;
    scrollTop: number;
  };
}

export function createInitialDestinationContextMap(todayDate: string): DestinationContextMap {
  const directionsCtx: DirectionsDestinationContext = {
    subMode: 'projects',
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

function isTabAtHome(
  tab: TabDestinationId,
  contexts: DestinationContextMap,
  actualTodayDate: string,
  scrollY = typeof window !== 'undefined' ? window.scrollY : 0,
  extraSubScreenOpen = false
): boolean {
  if (extraSubScreenOpen) return false;
  if (scrollY > 8) return false;
  if (tab === 'today') {
    const mode = contexts.today.mode ?? 'day';
    return mode === 'day' && contexts.today.selectedDate === actualTodayDate;
  }
  if (tab === 'directions') {
    const dir = contexts.directions ?? contexts.plans;
    return (
      (dir.subMode ?? 'projects') === 'projects' &&
      dir.activeFolderId === null &&
      !dir.activeGoalId &&
      dir.activeProjectId === null &&
      !dir.searchQuery
    );
  }
  if (tab === 'me') {
    return (
      contexts.me.subView === 'overview' &&
      !contexts.me.activeWishlistCategoryId
    );
  }
  return true;
}

/**
 * Single documented tab-tap handler per DESIGN.md §2:
 * (a) If any overlay (Sheet / AlertSheet / popover / calendar window) is open -> close the topmost overlay and stop.
 * (b) If the current tab is not at home (sub-screen open, scrolled > 8px, non-default segment/date/month) -> reset it to home and stop.
 * (c) If target != current -> switch to target tab (starting fresh at default state).
 * (d) Otherwise nothing.
 * Contextual bar buttons never call this function.
 */
export function onTabTap(
  target: TabDestinationId,
  params: {
    current: TabDestinationId;
    contexts: DestinationContextMap;
    actualTodayDate: string;
    scrollY?: number;
    extraSubScreenOpen?: boolean;
    onResetCurrentTabToHome: (tab: TabDestinationId) => void;
    onSwitchTab: (target: TabDestinationId) => void;
  }
): 'closed-overlay' | 'reset-home' | 'switched-tab' | 'noop' {
  // (a) Overlay open -> close topmost overlay and stop
  if (hasOpenOverlay() && closeTopmostOverlay()) {
    return 'closed-overlay';
  }
  // (b) Current tab not at home -> reset current tab to home and stop
  const atHome = isTabAtHome(
    params.current,
    params.contexts,
    params.actualTodayDate,
    params.scrollY,
    params.extraSubScreenOpen
  );
  if (!atHome) {
    params.onResetCurrentTabToHome(params.current);
    return 'reset-home';
  }
  // (c) target != current -> switch to target tab
  if (target !== params.current) {
    params.onSwitchTab(target);
    return 'switched-tab';
  }
  // (d) otherwise nothing
  return 'noop';
}

export function parseDestinationFromHash(hash: string): TabDestinationId {
  const cleaned = hash.replace(/^#\/?/, '').split(/[/?]/)[0]?.toLowerCase() ?? '';
  switch (cleaned) {
    case 'today':
      return 'today';
    case 'directions':
    case 'plans':
      return 'directions';
    case 'me':
    case 'diary':
    case 'records':
    case 'settings':
    case 'wishlist':
    case 'inspiration':
    case 'life_areas':
      return 'me';
    case 'calendar':
    case 'habits':
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

type CreationActionKind =
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

interface CreationActionDescriptor {
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
    implementedInCurrentStage: false,
    prioritizedInDestinations: ['me'],
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
    prioritizedInCalendarModes: ['month', 'week'],
  },
  {
    kind: 'day_off',
    labelUk: 'Позначка вихідного',
    descriptionUk: 'Явна позначка вихідного дня у графіку роботи',
    implementedInCurrentStage: true,
    prioritizedInDestinations: ['calendar'],
    prioritizedInCalendarModes: ['month', 'week'],
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
    implementedInCurrentStage: false,
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

export const THEME_BOOTSTRAP_STORAGE_KEY = 'planui_theme_bootstrap';
export const REDUCED_MOTION_STORAGE_KEY = 'planui_reduced_motion';







export const TEXT_SCALE_STEPS = [0.85, 0.92, 1, 1.1, 1.2] as const;
export type TextScaleStep = (typeof TEXT_SCALE_STEPS)[number];

export function resolveTextScaleValue(
  textScale?: 'smallest' | 'smaller' | 'standard' | 'larger' | 'largest' | number | string | null
): TextScaleStep {
  if (typeof textScale === 'number') {
    if (textScale <= 0.88) return 0.85;
    if (textScale <= 0.96) return 0.92;
    if (textScale <= 1.05) return 1;
    if (textScale <= 1.15) return 1.1;
    return 1.2;
  }
  if (typeof textScale === 'string') {
    const parsed = Number(textScale);
    if (Number.isFinite(parsed) && parsed > 0) {
      return resolveTextScaleValue(parsed);
    }
  }
  switch (textScale) {
    case 'smallest':
      return 0.85;
    case 'smaller':
      return 0.92;
    case 'larger':
      return 1.1;
    case 'largest':
      return 1.2;
    case 'standard':
    default:
      return 1;
  }
}

function resolveEffectiveTheme(
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
  textScale?: 'smallest' | 'smaller' | 'standard' | 'larger' | 'largest' | number | string | null
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



  if (textScale !== undefined && textScale !== null) {
    const scaleVal = resolveTextScaleValue(textScale);
    root.style.setProperty('--text-scale', String(scaleVal));
  }

  const metaTheme = document.getElementById('planui-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', effective === 'dark' ? '#1A1625' : '#FFE7DC');
  }

  try {
    localStorage.setItem(THEME_BOOTSTRAP_STORAGE_KEY, themePreference);
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, reducedMotion ? 'true' : 'false');

  } catch {
    // Ignore
  }

  return effective;
}


