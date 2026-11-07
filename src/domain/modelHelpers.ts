import {
  EntityId,
  Folder,
  Goal,
  IsoInstantString,
  LifeArea,
  LifeAreaQuestion,
  Measure,
  MeasureLogEntry,
  Project,
  Task,
} from './types';
import type { IconName } from '../ui/icons';

export const AREA_KEY_ICONS: Record<string, IconName> = {
  physical: 'heart-pulse',
  mental: 'brain',
  recovery: 'moon',
  relationships: 'users',
  creativity: 'palette',
  work: 'briefcase',
  finance: 'wallet',
  finances: 'wallet',
  learning: 'book-open',
  home: 'home',
  meaning: 'compass',
};

export const CANONICAL_AREA_ICONS: IconName[] = [
  'heart-pulse',
  'brain',
  'moon',
  'users',
  'palette',
  'briefcase',
  'wallet',
  'book-open',
  'home',
  'compass',
];

export function getAreaIcon(
  area?: { starterKeys?: readonly string[] | string[]; questionTextUk?: string; name?: string; id?: string } | null,
  fallbackIndex?: number
): IconName {
  if (!area) {
    if (typeof fallbackIndex === 'number' && fallbackIndex >= 0) {
      return CANONICAL_AREA_ICONS[fallbackIndex % CANONICAL_AREA_ICONS.length];
    }
    return 'compass';
  }

  if (area.starterKeys && area.starterKeys.length > 0) {
    for (const key of area.starterKeys) {
      const icon = AREA_KEY_ICONS[key.toLowerCase()];
      if (icon) return icon;
    }
  }

  const text = (area.questionTextUk ?? area.name ?? '').toLowerCase();
  if (text.includes('фізичн') || text.includes('здоров')) return 'heart-pulse';
  if (text.includes('психічн') || text.includes('ментал')) return 'brain';
  if (text.includes('відновлен') || text.includes('відпочин')) return 'moon';
  if (text.includes('стосунк') || text.includes('близьк')) return 'users';
  if (text.includes('творч') || text.includes('самовираж')) return 'palette';
  if (text.includes('робот') || text.includes('профес') || text.includes('кар’єр')) return 'briefcase';
  if (text.includes('фінанс') || text.includes('грош') || text.includes('матеріал')) return 'wallet';
  if (text.includes('навчан') || text.includes('розвит')) return 'book-open';
  if (text.includes('дім') || text.includes('побут') || text.includes('середовищ')) return 'home';
  if (text.includes('сенс') || text.includes('цінност') || text.includes('свобод')) return 'compass';

  if (typeof fallbackIndex === 'number' && fallbackIndex >= 0) {
    return CANONICAL_AREA_ICONS[fallbackIndex % CANONICAL_AREA_ICONS.length];
  }
  return 'compass';
}

/**
 * Context passed to model helpers to resolve inherited attributes.
 */
export interface ModelContext {
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly (LifeArea | LifeAreaQuestion)[];
  areas?: readonly (LifeArea | LifeAreaQuestion)[];
}

/**
 * Converts OKLCH (L=0.72, C=0.15, hue in degrees) to an sRGB hex fallback string.
 */
export function oklchToSrgbHex(l: number, c: number, hDeg: number): string {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLinear = +4.0767434091 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLinear = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLinear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const toGamma = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

  const r = Math.round(clamp(toGamma(clamp(rLinear))) * 255);
  const g = Math.round(clamp(toGamma(clamp(gLinear))) * 255);
  const bByte = Math.round(clamp(toGamma(clamp(bLinear))) * 255);

  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bByte)}`;
}

/**
 * Neutral slate fallback for unrated items per DESIGN.md.
 */
export const NEUTRAL_SLATE = 'var(--color-neutral-slate)';

/**
 * Shift colors per DESIGN.md: Day yellow, Night violet.
 */
export const SHIFT_DAY_COLOR = 'var(--color-shift-day-start)';
export const SHIFT_NIGHT_COLOR = 'var(--color-shift-night-start)';

/**
 * Checks if runtime browser supports CSS oklch color function.
 */
function supportsOklch(): boolean {
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', 'oklch(0.72 0.15 25)');
  }
  return false;
}

/**
 * areaColor(rating | null)
 * Per DESIGN.md:
 * - 1 red -> 10 green (oklch hue 25 -> 145, L .72, C .15)
 * - unrated = neutral slate
 * Uses CSS oklch() when supported with exact sRGB hex fallback.
 */
export function areaColor(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || rating < 1 || rating > 10) {
    return NEUTRAL_SLATE;
  }
  const fraction = (Math.min(10, Math.max(1, rating)) - 1) / 9;
  const hue = 25 + fraction * (145 - 25);
  const srgb = oklchToSrgbHex(0.72, 0.15, hue);
  if (supportsOklch()) {
    return `oklch(0.72 0.15 ${Math.round(hue)})`;
  }
  return srgb;
}

/**
 * Returns exact sRGB hex fallback for an area rating.
 */
export function areaColorSrgb(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || rating < 1 || rating > 10) {
    return NEUTRAL_SLATE;
  }
  const fraction = (Math.min(10, Math.max(1, rating)) - 1) / 9;
  const hue = 25 + fraction * (145 - 25);
  return oklchToSrgbHex(0.72, 0.15, hue);
}

/**
 * Returns CSS oklch string for an area rating.
 */
export function areaColorOklch(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || rating < 1 || rating > 10) {
    return 'oklch(0.65 0.02 260)';
  }
  const fraction = (Math.min(10, Math.max(1, rating)) - 1) / 9;
  const hue = 25 + fraction * (145 - 25);
  return `oklch(0.72 0.15 ${Math.round(hue)})`;
}

export type ResolvedAreaInfo = {
  id: EntityId;
  name?: string;
  rating?: number | null;
};

/**
 * resolveArea(item, context?)
 * Resolution priority:
 *   own area -> project/goal area -> folder area -> none
 */
export function resolveArea(
  item: any,
  context?: ModelContext
): ResolvedAreaInfo | null {
  if (!item) return null;

  const allAreas = context?.lifeAreas ?? context?.areas ?? [];
  const findAreaById = (id: EntityId | null | undefined): ResolvedAreaInfo | null => {
    if (!id) return null;
    const found = allAreas.find((a) => a.id === id);
    if (found) {
      const name = (found as any).questionTextUk ?? (found as any).name ?? '';
      return { id: found.id, name, rating: found.rating ?? null };
    }
    return { id, rating: null };
  };

  // 1. Own area
  const ownAreaId = item.areaId ?? item.lifeAreaId;
  if (ownAreaId) {
    return findAreaById(ownAreaId);
  }

  // 2. Project or Goal area
  const projects = context?.projects ?? [];
  const goals = context?.goals ?? [];

  // Direct goal link
  const directGoalId =
    item.goalId ??
    (item.ownership?.kind === 'goal' ? item.ownership.goalId : null);
  if (directGoalId) {
    const goal = goals.find((g) => g.id === directGoalId);
    if (goal) {
      const goalAreaId = goal.areaId ?? goal.lifeAreaId;
      if (goalAreaId) return findAreaById(goalAreaId);
      if (goal.folderId) {
        const folder = context?.folders?.find((f) => f.id === goal.folderId);
        const folderAreaId = folder?.areaId ?? folder?.lifeAreaId;
        if (folderAreaId) return findAreaById(folderAreaId);
      }
    }
  }

  // Direct project link
  const directProjectId =
    item.projectId ??
    (item.ownership?.kind === 'project' ? item.ownership.projectId : null);
  if (directProjectId) {
    const project = projects.find((p) => p.id === directProjectId);
    if (project) {
      const projAreaId = project.areaId ?? project.lifeAreaId;
      if (projAreaId) return findAreaById(projAreaId);
      if (project.goalId) {
        const goal = goals.find((g) => g.id === project.goalId);
        const goalAreaId = goal?.areaId ?? goal?.lifeAreaId;
        if (goalAreaId) return findAreaById(goalAreaId);
      }
      if (project.folderId) {
        const folder = context?.folders?.find((f) => f.id === project.folderId);
        const folderAreaId = folder?.areaId ?? folder?.lifeAreaId;
        if (folderAreaId) return findAreaById(folderAreaId);
      }
    }
  }

  // 3. Folder area
  const folderId =
    item.folderId ??
    (item.ownership?.kind === 'folder' ? item.ownership.folderId : null);
  if (folderId && context?.folders) {
    const folder = context.folders.find((f) => f.id === folderId);
    const folderAreaId = folder?.areaId ?? folder?.lifeAreaId;
    if (folderAreaId) return findAreaById(folderAreaId);
  }

  return null;
}

/**
 * itemColor(item, context?)
 * Per DESIGN.md:
 * - Shifts keep yellow (day) / violet (night) unless linked to an area
 * - Other items: areaColor(resolvedArea.rating) or neutral slate if no area
 */
export function itemColor(item: any, context?: ModelContext): string {
  if (!item) return NEUTRAL_SLATE;

  // Check if item is a shift
  const isShift =
    item.type === 'work_shift' ||
    item.kind === 'shift' ||
    Boolean(item.workProperties) ||
    typeof item.endDateOffsetDays === 'number';

  const resolved = resolveArea(item, context);
  if (resolved) {
    return areaColor(resolved.rating);
  }

  // Unlinked shift keeps yellow/violet
  if (isShift) {
    const isNight =
      item.endDateOffsetDays === 1 ||
      item.color === 'work' && item.isNight ||
      (item.schedule?.kind === 'timed' &&
        item.schedule.interval?.originStartLocalDate !==
          item.schedule.interval?.originEndLocalDate);
    return isNight ? SHIFT_NIGHT_COLOR : SHIFT_DAY_COLOR;
  }

  return NEUTRAL_SLATE;
}

/**
 * Helper to determine list category rank:
 * 0 = Habits band
 * 1 = Зміна
 * 2 = Подія
 * 3 = Завдання
 * 4 = Other
 */
function getItemCategoryRank(item: any): number {
  if (!item) return 4;
  if (item.kind === 'habit' || 'ruleRevisions' in item || 'habitId' in item) {
    return 0; // Habits band
  }
  if (
    item.type === 'work_shift' ||
    item.kind === 'shift' ||
    Boolean(item.workProperties) ||
    typeof item.endDateOffsetDays === 'number'
  ) {
    return 1; // Зміна
  }
  if (item.kind === 'event' || ('schedule' in item && item.type !== 'work_shift')) {
    return 2; // Подія
  }
  if (item.kind === 'task' || 'planningState' in item || 'checklist' in item) {
    return 3; // Завдання
  }
  return 4;
}

/**
 * Extracts a comparable time string (HH:mm) if present on an item.
 */
function getItemTimeString(item: any): string | null {
  if (!item) return null;
  if (typeof item.time === 'string') return item.time;
  if (typeof item.startLocalTime === 'string') return item.startLocalTime;
  if (item.schedule?.kind === 'timed' && item.schedule.interval?.originStartLocalTime) {
    return item.schedule.interval.originStartLocalTime;
  }
  if (item.interval?.originStartLocalTime) {
    return item.interval.originStartLocalTime;
  }
  return null;
}

/**
 * compareForList(a, b)
 * Per DESIGN.md §2:
 * "Звички (a visually separate band above everything), then Зміна, then Події, then Завдання;
 * inside a category by time, then manual order."
 */
export function compareForList(a: any, b: any): number {
  const catA = getItemCategoryRank(a);
  const catB = getItemCategoryRank(b);
  if (catA !== catB) {
    return catA - catB;
  }

  // Same category: compare time
  const timeA = getItemTimeString(a);
  const timeB = getItemTimeString(b);
  if (timeA && timeB && timeA !== timeB) {
    return timeA.localeCompare(timeB);
  }
  if (timeA && !timeB) return -1;
  if (!timeA && timeB) return 1;

  // Then compare manual order
  const orderA = typeof a?.order === 'number' ? a.order : 0;
  const orderB = typeof b?.order === 'number' ? b.order : 0;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  // Stable secondary tie-breaker
  const titleA = a?.title ?? a?.name ?? '';
  const titleB = b?.title ?? b?.name ?? '';
  return titleA.localeCompare(titleB);
}

/**
 * reorder(items, from, to)
 * Rewrites order = index after moving an element from index to index.
 */
export function reorder<T extends { order?: number }>(
  items: readonly T[],
  from: number,
  to: number
): T[] {
  const list = [...items];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return list.map((item, index) => ({ ...item, order: index }));
  }
  const [removed] = list.splice(from, 1);
  list.splice(to, 0, removed);
  return list.map((item, index) => ({ ...item, order: index }));
}

/**
 * logMeasure(item, delta, ts?)
 * Appends a log entry to item.measure and updates current value.
 */
export function logMeasure<T extends { measure?: Measure | null }>(
  item: T,
  delta: number,
  ts: IsoInstantString = new Date().toISOString()
): T {
  const currentMeasure = item.measure ?? {
    unit: '',
    target: null,
    current: 0,
    log: [],
  };
  const entry: MeasureLogEntry = { ts, delta };
  const updatedMeasure: Measure = {
    ...currentMeasure,
    current: (currentMeasure.current ?? 0) + delta,
    log: [...(currentMeasure.log ?? []), entry],
  };
  return {
    ...item,
    measure: updatedMeasure,
  };
}
