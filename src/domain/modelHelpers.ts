import type { CSSProperties } from 'react';
import type { CalendarEvent, Folder, Goal, LifeAreaAssessment, LifeAreaQuestion, Measure, Project, Task } from './types';

export interface Shift {
  id: string;
  type?: 'day' | 'night';
  lifeAreaId?: string | null;
  areaId?: string | null;
}

export const NEUTRAL_SLATE = 'var(--color-neutral-slate)';
export const SHIFT_DAY_COLOR = 'var(--shift-day)';
export const SHIFT_NIGHT_COLOR = 'var(--shift-night)';


export const ORB_PALETTE = {
  pink: 'var(--orb-pink)',
  yellow: 'var(--orb-yellow)',
  orange: 'var(--orb-orange)',
  coral: 'var(--orb-coral)',
  green: 'var(--orb-green)',
  mint: 'var(--orb-mint)',
  blue: 'var(--orb-blue)',
  purple: 'var(--orb-purple)',
  slate: 'var(--orb-slate)',
} as const;

export type OrbHue = keyof typeof ORB_PALETTE;

export const USER_GLYPHS = [
  'laptop',
  'sprout',
  'palm',
  'camera',
  'books',
  'rocket',
  'music',
  'plane',
  'star',
  'gift',
  'heart',
  'home',
] as const;

export type UserGlyphName = (typeof USER_GLYPHS)[number];



const AREA_RATING_RAMP_RGB: readonly [number, number, number][] = [
  [255, 90, 95],   // 1.0  #FF5A5F
  [255, 138, 91],  // 3.25 #FF8A5B
  [255, 200, 74],  // 5.50 #FFC84A
  [184, 219, 98],  // 7.75 #B8DB62
  [51, 213, 160],  // 10.0 #33D5A0
];

function interpolateAreaRatingRgb(rating: number): [number, number, number] {
  const clamped = Math.max(1, Math.min(10, rating));
  const t = (clamped - 1) / 9;
  const scaled = t * (AREA_RATING_RAMP_RGB.length - 1);
  const idx = Math.min(AREA_RATING_RAMP_RGB.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = AREA_RATING_RAMP_RGB[idx];
  const b = AREA_RATING_RAMP_RGB[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

function parseColorToRgb(input?: string | null): [number, number, number] {
  const fallback: [number, number, number] = [155, 151, 184];
  if (!input || typeof input !== 'string') return fallback;
  const trimmed = input.trim();

  if (trimmed.startsWith('var(')) {
    if (trimmed.includes('--orb-pink') || trimmed.includes('--accent-primary') || trimmed.includes('--color-pink')) {
      return [255, 79, 163];
    }
    if (trimmed.includes('--orb-yellow') || trimmed.includes('--color-yellow') || trimmed.includes('--shift-day')) {
      return [255, 200, 74];
    }
    if (trimmed.includes('--orb-orange') || trimmed.includes('--orb-coral') || trimmed.includes('--color-coral')) {
      return [255, 130, 120];
    }
    if (trimmed.includes('--orb-green') || trimmed.includes('--orb-mint') || trimmed.includes('--color-mint') || trimmed.includes('--accent-success')) {
      return [51, 213, 160];
    }
    if (trimmed.includes('--orb-blue') || trimmed.includes('--color-blue')) {
      return [101, 191, 255];
    }
    if (trimmed.includes('--orb-purple') || trimmed.includes('--color-purple')) {
      return [172, 123, 250];
    }
    if (trimmed.includes('--shift-night')) {
      return [109, 56, 220];
    }
    if (trimmed.includes('--empty-orb-base')) {
      return [180, 184, 210];
    }
    return fallback;
  }

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
    } else if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
    }
    return fallback;
  }

  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i);
  if (rgbMatch) {
    return [
      Math.min(255, Math.max(0, Number(rgbMatch[1]))),
      Math.min(255, Math.max(0, Number(rgbMatch[2]))),
      Math.min(255, Math.max(0, Number(rgbMatch[3]))),
    ];
  }

  const oklchMatch = trimmed.match(/oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (oklchMatch) {
    const h = Number(oklchMatch[3]);
    const t = Math.min(1, Math.max(0, (h - 25) / 120));
    const rating = 1 + t * 9;
    return interpolateAreaRatingRgb(rating);
  }

  return fallback;
}

/**
 * Chooses readable text color (#121216 ink or #FFFFFF white) on a colored chip/bar by luminance
 * guaranteeing WCAG contrast >= 4.5:1 (ink when relative luminance > 0.20, white when <= 0.20).
 */
export function getContrastTextColor(bgColor?: string | null): '#121216' | '#FFFFFF' {
  const [r, g, b] = parseColorToRgb(bgColor);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.20 ? '#121216' : '#FFFFFF';
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixRgb(
  base: [number, number, number],
  target: [number, number, number],
  targetWeight: number
): [number, number, number] {
  const w = Math.min(1, Math.max(0, targetWeight));
  const bw = 1 - w;
  return [
    Math.round(base[0] * bw + target[0] * w),
    Math.round(base[1] * bw + target[1] * w),
    Math.round(base[2] * bw + target[2] * w),
  ];
}


export function tintChipStyle(color?: string | null): CSSProperties {
  const rgb = parseColorToRgb(color);
  const baseHex = rgbToHex(rgb);
  const tintHex = rgbToHex(mixRgb([255, 255, 255], rgb, 0.18));
  return {
    backgroundColor: tintHex,
    color: '#121216',
    borderLeft: `3px solid ${baseHex}`,
  };
}

/**
 * Extracts a short chip label: first word of title, stripped of leading symbols, truncated to maxChars.
 */
export function firstWordChipLabel(rawTitle?: string | null, maxChars = 8): string {
  if (!rawTitle) return '';
  const cleaned = rawTitle.replace(/^[◆•·\-\s]+/, '').trim();
  if (!cleaned) return '';
  const firstWord = cleaned.split(/\s+/)[0]?.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'«»]/g, '') ?? '';
  return Array.from(firstWord).slice(0, maxChars).join('');
}


export type OrbVarsStyle = CSSProperties & Record<'--c' | '--c-light' | '--c-dark', string>;

export function orbVars(color?: string | null): OrbVarsStyle {
  const rgb = parseColorToRgb(color);
  const baseHex = rgbToHex(rgb);
  const lightHex = rgbToHex(mixRgb(rgb, [255, 255, 255], 0.35));
  const darkHex = rgbToHex(mixRgb(rgb, [0, 0, 0], 0.25));
  return {
    '--c': baseHex,
    '--c-light': lightHex,
    '--c-dark': darkHex,
  };
}


export function areaColor(rating?: number | null): string {
  if (rating == null || !Number.isFinite(rating) || rating < 1 || rating > 10) {
    return NEUTRAL_SLATE;
  }
  return rgbToHex(interpolateAreaRatingRgb(rating));
}

export const AREA_IDENTITIES = {
  physical: { base: '#2EC4B6', glyph: 'leaf' },
  mental: { base: '#AC7BFA', glyph: 'lotus' },
  recovery: { base: '#65BFFF', glyph: 'hourglass' },
  relationships: { base: '#FF4FA3', glyph: 'people' },
  creativity: { base: '#D86BE0', glyph: 'palette' },
  work: { base: '#7C8CFF', glyph: 'briefcase' },
  finances: { base: '#E8C27A', glyph: 'wallet' },
  learning: { base: '#3FC8E0', glyph: 'book' },
  home: { base: '#D9A98B', glyph: 'house' },
  meaning: { base: '#B7B3D6', glyph: 'compass' },
} as const;

/** Stable identity independent of rating. Custom areas without a starter key stay neutral. */
export function areaIdentity(area?: string | { id: string; starterKeys?: readonly string[] } | null): string {
  const id = typeof area === 'string' ? area : area?.id;
  const keys = typeof area === 'object' ? area?.starterKeys ?? [] : [];
  const paletteKeys = Object.keys(AREA_IDENTITIES) as (keyof typeof AREA_IDENTITIES)[];
  const key = keys.find(k => Object.hasOwn(AREA_IDENTITIES, k))
    ?? paletteKeys.find((k, index) => k === id || `life-q-${index + 1}` === id);
  return key ? AREA_IDENTITIES[key as keyof typeof AREA_IDENTITIES].base : NEUTRAL_SLATE;
}

/** Same rating ramp as areaColor; material tints follow orbVars (35% white, 25% black). */
export function scoreColor(value?: number | null): { base: string; light: string; deep: string; glow: string } {
  const base = areaColor(value);
  const rgb = parseColorToRgb(base);
  return {
    base,
    light: rgbToHex(mixRgb(rgb, [255, 255, 255], 0.35)),
    deep: rgbToHex(mixRgb(rgb, [0, 0, 0], 0.25)),
    glow: `rgba(${rgb.join(', ')}, 0.35)`,
  };
}

interface AreaLike {
  id: string;
  starterKeys?: readonly string[];
  name?: string;
  questionTextUk?: string;
  rating?: number | null;
  focus?: boolean | null;
  icon?: string;
}

export interface ModelContext {
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  areas?: readonly (LifeAreaQuestion | AreaLike)[];
  lifeAreas?: readonly (LifeAreaQuestion | AreaLike)[];
  assessments?: readonly LifeAreaAssessment[];
}

export interface ResolvedAreaInfo {
  id: string;
  name: string;
  rating: number | null;
  focus?: boolean;
  icon?: string;
  starterKeys?: readonly string[];
}

const STARTER_AREA_NAMES: Record<string, string> = {
  'life-q-1': 'Фізичне самопочуття',
  'life-q-2': 'Психічний стан',
  'life-q-3': 'Відновлення',
  'life-q-4': 'Стосунки',
  'life-q-5': 'Творчість',
  'life-q-6': 'Робота',
  'life-q-7': 'Фінанси',
  'life-q-8': 'Навчання',
  'life-q-9': 'Дім і побут',
  'life-q-10': 'Сенс і напрямок',
};

function isRawInternalId(str?: string | null): boolean {
  if (!str) return true;
  const trimmed = str.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return true;
  return /^(life-q-|demo-|folder-|proj-|goal-|task-|habit-|event-|rev-|wish-)/i.test(trimmed);
}

export function resolveItemAreaId(
  item?: {
    areaId?: string | null;
    lifeAreaId?: string | null;
    folderId?: string | null;
    projectId?: string | null;
    goalId?: string | null;
    ownership?: Task['ownership'];
  } | null,
  context?: ModelContext
): string | undefined {
  if (!item) return undefined;
  const direct = item.areaId ?? item.lifeAreaId;
  if (direct) return direct;

  const folders = context?.folders ?? [];
  const projects = context?.projects ?? [];
  const goals = context?.goals ?? [];

  const resolveFolderArea = (folderId?: string | null): string | undefined => {
    let cur = folderId ?? null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const folder = folders.find((f) => f.id === cur);
      if (!folder) break;
      if (folder.areaId || folder.lifeAreaId) return folder.areaId ?? folder.lifeAreaId ?? undefined;
      cur = folder.parentId ?? null;
    }
    return undefined;
  };

  const resolveProjectArea = (targetProjId?: string | null): string | undefined => {
    if (!targetProjId) return undefined;
    const proj = projects.find((p) => p.id === targetProjId);
    if (!proj) return undefined;
    if (proj.areaId || proj.lifeAreaId) return proj.areaId ?? proj.lifeAreaId ?? undefined;
    if (proj.goalId) {
      const g = goals.find((goal) => goal.id === proj.goalId);
      if (g && (g.areaId || g.lifeAreaId)) return g.areaId ?? g.lifeAreaId ?? undefined;
      if (g?.folderId) {
        const fa = resolveFolderArea(g.folderId);
        if (fa) return fa;
      }
    }
    if (proj.folderId) {
      const fa = resolveFolderArea(proj.folderId);
      if (fa) return fa;
    }
    return undefined;
  };

  const own = item.ownership;
  if (own) {
    if (own.kind === 'project') {
      const pa = resolveProjectArea(own.projectId);
      if (pa) return pa;
    } else if (own.kind === 'goal') {
      const targetGoalId = own.goalId;
      const g = goals.find((goal) => goal.id === targetGoalId);
      if (g) {
        if (g.areaId || g.lifeAreaId) return g.areaId ?? g.lifeAreaId ?? undefined;
        if (g.folderId) {
          const fa = resolveFolderArea(g.folderId);
          if (fa) return fa;
        }
      }
    } else if (own.kind === 'folder') {
      const fa = resolveFolderArea(own.folderId);
      if (fa) return fa;
    } else if (own.kind === 'standalone' && own.folderId) {
      const fa = resolveFolderArea(own.folderId);
      if (fa) return fa;
    }
  }

  if (item.projectId) {
    const pa = resolveProjectArea(item.projectId);
    if (pa) return pa;
  }

  if (item.goalId) {
    const g = goals.find((goal) => goal.id === item.goalId);
    if (g && (g.areaId || g.lifeAreaId)) return g.areaId ?? g.lifeAreaId ?? undefined;
    if (g?.folderId) {
      const fa = resolveFolderArea(g.folderId);
      if (fa) return fa;
    }
  }

  if (item.folderId) {
    const fa = resolveFolderArea(item.folderId);
    if (fa) return fa;
  }

  return undefined;
}

// Resolves an item's area: own area -> project/goal area -> folder area -> none
export function resolveArea(
  item?: {
    id?: string;
    areaId?: string | null;
    lifeAreaId?: string | null;
    folderId?: string | null;
    projectId?: string | null;
    goalId?: string | null;
    parentId?: string | null;
    ownership?: Task['ownership'];
  } | null,
  context?: ModelContext
): ResolvedAreaInfo | null {
  if (!item) return null;
  let areaId = resolveItemAreaId(item, context);
  if (!areaId && item.parentId && context?.folders) {
    areaId = resolveItemAreaId({ folderId: item.parentId }, context);
  }
  if (!areaId) return null;

  const areas = (context?.areas ?? context?.lifeAreas ?? []) as readonly AreaLike[];
  const area = areas.find((a) => a.id === areaId);

  let latestScore: number | null = area?.rating ?? null;
  if ((latestScore == null || latestScore < 1 || latestScore > 10) && context?.assessments && context.assessments.length > 0) {
    for (let i = context.assessments.length - 1; i >= 0; i--) {
      const ans = context.assessments[i].answers?.find((x) => x.questionId === areaId);
      if (ans && typeof ans.score === 'number' && ans.score >= 1 && ans.score <= 10) {
        latestScore = ans.score;
        break;
      }
    }
  }

  const candidateName = area?.name ?? area?.questionTextUk ?? STARTER_AREA_NAMES[areaId] ?? '';
  const cleanName = isRawInternalId(candidateName) ? '' : candidateName;

  return {
    id: areaId,
    name: cleanName,
    rating: latestScore !== null && latestScore >= 1 && latestScore <= 10 ? latestScore : null,
    focus: area?.focus ?? undefined,
    icon: area?.icon,
    starterKeys: area?.starterKeys,
  };
}

// Resolves item's area display name: the area NAME, or nothing (""); never a raw id
export function areaName(
  item?: {
    id?: string;
    areaId?: string | null;
    lifeAreaId?: string | null;
    folderId?: string | null;
    projectId?: string | null;
    goalId?: string | null;
    parentId?: string | null;
    ownership?: Task['ownership'];
  } | null,
  context?: ModelContext
): string {
  const resolved = resolveArea(item, context);
  if (!resolved || !resolved.name || isRawInternalId(resolved.name)) return '';
  return resolved.name;
}

function isShiftItem(
  item?: {
    type?: string;
    kind?: string;
    workProperties?: CalendarEvent['workProperties'];
  } | null
): boolean {
  if (!item) return false;
  return (
    item.type === 'work_shift' ||
    item.type === 'shift' ||
    item.kind === 'day' ||
    item.kind === 'night' ||
    Boolean(item.workProperties)
  );
}

export function isNightShiftItem(
  shift?: {
    type?: string;
    kind?: string;
    title?: string;
    name?: string;
    schedule?: any;
    workProperties?: CalendarEvent['workProperties'];
  } | null
): boolean {
  if (!shift) return false;
  if (
    shift.type === 'night' ||
    shift.kind === 'night' ||
    /ніч|night/i.test(shift.title ?? '') ||
    /ніч|night/i.test(shift.name ?? '') ||
    /ніч|night/i.test(shift.workProperties?.shiftName ?? '')
  ) {
    return true;
  }
  if (shift.schedule?.kind === 'timed' && shift.schedule.interval?.overnight) {
    return true;
  }
  return false;
}

/**
 * Shift Color Rule: shifts are ALWAYS yellow (day, var(--shift-day)) or violet (night, var(--shift-night)),
 * never the area color.
 */
export function shiftColor(
  shift?: {
    type?: string;
    kind?: string;
    title?: string;
    name?: string;
    schedule?: any;
    workProperties?: CalendarEvent['workProperties'];
  } | null
): string {
  return isNightShiftItem(shift) ? SHIFT_NIGHT_COLOR : SHIFT_DAY_COLOR;
}

/**
 * Returns the linked area's identity color for a shift (or null if no area is linked),
 * used to render a small orb or 3px rail alongside the yellow/violet shift fill.
 */
export function shiftAreaColor(
  shift?: {
    id?: string;
    areaId?: string | null;
    lifeAreaId?: string | null;
    folderId?: string | null;
    projectId?: string | null;
    goalId?: string | null;
    parentId?: string | null;
    ownership?: Task['ownership'];
  } | null,
  context?: ModelContext
): string | null {
  const resolved = resolveArea(shift, context);
  if (!resolved) return null;
  return areaIdentity(resolved);
}

// Shifts keep yellow/violet; other items use the linked area's stable identity.
export function itemColor(
  item?: {
    id?: string;
    type?: string;
    kind?: string;
    title?: string;
    name?: string;
    areaId?: string | null;
    lifeAreaId?: string | null;
    folderId?: string | null;
    projectId?: string | null;
    goalId?: string | null;
    parentId?: string | null;
    ownership?: Task['ownership'];
    schedule?: any;
    workProperties?: CalendarEvent['workProperties'];
  } | null,
  context?: ModelContext
): string {
  if (!item) return NEUTRAL_SLATE;
  if (isShiftItem(item)) {
    return shiftColor(item);
  }
  const resolved = resolveArea(item, context);
  if (resolved) {
    return areaIdentity(resolved);
  }
  return NEUTRAL_SLATE;
}

// Updates an entity's measure current value by delta and records { ts, delta } in the log
export function logMeasure<T extends { measure?: Measure | null; updatedAt?: string }>(
  entity: T,
  delta: number,
  ts?: string
): T {
  const currentMeasure: Measure = entity.measure ?? {
    unit: '',
    target: null,
    current: 0,
    log: [],
  };
  const nextCurrent = Math.max(0, Number(((currentMeasure.current ?? 0) + delta).toFixed(2)));
  const nextLog = [
    ...(currentMeasure.log ?? []),
    { ts: ts ?? new Date().toISOString(), delta: Number((nextCurrent - (currentMeasure.current ?? 0)).toFixed(2)) },
  ];
  return {
    ...entity,
    measure: {
      ...currentMeasure,
      current: nextCurrent,
      log: nextLog,
    },
    ...(entity.updatedAt !== undefined ? { updatedAt: new Date().toISOString() } : {}),
  };
}

export function getManualOrder(
  item?: { manualOrder?: number; order?: number } | null,
  fallback = 0
): number {
  if (!item) return fallback;
  if (typeof item.manualOrder === 'number' && Number.isFinite(item.manualOrder)) {
    return item.manualOrder;
  }
  if (typeof item.order === 'number' && Number.isFinite(item.order)) {
    return item.order;
  }
  return fallback;
}

// Reorders an item array from `from` index to `to` index, rewriting order
export function reorder<T extends { order?: number }>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result.map((item, idx) => ({
    ...item,
    order: idx,
  }));
}
