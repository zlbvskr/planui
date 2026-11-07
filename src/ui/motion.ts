import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export interface SpringToken {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass?: number;
}

export const springs = {
  press: { stiffness: 520, damping: 38 },
  smooth: { stiffness: 320, damping: 30 },
  sheet: { stiffness: 380, damping: 36 },
  gentle: { stiffness: 220, damping: 26 },
} as const satisfies Record<string, SpringToken>;

export const tweens = {
  fast: 140,
  base: 220,
  slow: 360,
  reduced: 120,
} as const;

export const easings = {
  out: 'cubic-bezier(0.22,1,0.36,1)',
  emphasized: 'cubic-bezier(0.32,0.72,0,1)',
} as const;

export const MOTION_TOKENS = {
  springs,
  tweens,
  easings,
} as const;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Checks whether reduced motion is active via system preference OR the
 * Settings toggle ("Зменшити рух" -> data-reduced-motion="true" / localStorage).
 */
export function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  if (document.documentElement.getAttribute('data-reduced-motion') === 'true') {
    return true;
  }
  try {
    if (window.localStorage?.getItem('planui_reduced_motion') === 'true') {
      return true;
    }
  } catch {
    // Ignore storage access errors
  }
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return true;
  }
  return false;
}

const reducedMotionListeners = new Set<() => void>();
let reducedMotionInitialized = false;

function initReducedMotionSingleton(): void {
  if (reducedMotionInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  reducedMotionInitialized = true;
  const notify = () => {
    reducedMotionListeners.forEach((fn) => fn());
  };
  const mql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  mql?.addEventListener?.('change', notify);

  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduced-motion'],
  });

  window.addEventListener('storage', notify);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => isReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    initReducedMotionSingleton();
    const update = () => setReduced(isReducedMotion());
    update();
    reducedMotionListeners.add(update);
    return () => {
      reducedMotionListeners.delete(update);
    };
  }, []);

  return reduced;
}

/**
 * Evaluates a damped harmonic oscillator position (0 -> 1) at time t (seconds).
 */
export function evaluateSpringPosition(
  spring: SpringToken,
  tSeconds: number,
  initialVelocity = 0
): number {
  if (tSeconds <= 0) return 0;
  const m = spring.mass ?? 1;
  const k = spring.stiffness;
  const c = spring.damping;
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const env = Math.exp(-zeta * omega0 * tSeconds);
    const cosTerm = Math.cos(omegaD * tSeconds);
    const sinTerm =
      ((zeta * omega0 - initialVelocity) / omegaD) * Math.sin(omegaD * tSeconds);
    return 1 - env * (cosTerm + sinTerm);
  }
  if (zeta === 1) {
    const env = Math.exp(-omega0 * tSeconds);
    return 1 - env * (1 + (omega0 - initialVelocity) * tSeconds);
  }
  const s1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
  const s2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
  const c2 = (initialVelocity + s1) / (s1 - s2);
  const c1 = 1 - c2;
  return 1 - (c1 * Math.exp(s1 * tSeconds) + c2 * Math.exp(s2 * tSeconds));
}

export interface SpringCurve {
  readonly durationMs: number;
  readonly samples: readonly number[];
  readonly linearEasing: string;
}

const springCurveCache = new Map<string, SpringCurve>();

export function solveSpringCurve(
  spring: SpringToken,
  initialVelocity = 0,
  sampleCount = 24
): SpringCurve {
  const vRounded = Math.round(initialVelocity * 10) / 10;
  const key = `${spring.stiffness}:${spring.damping}:${spring.mass ?? 1}:${vRounded}:${sampleCount}`;
  const cached = springCurveCache.get(key);
  if (cached) return cached;

  let settleSeconds = 0.28;
  const dt = 0.008;
  for (let t = 0.04; t <= 0.85; t += dt) {
    const p = evaluateSpringPosition(spring, t, vRounded);
    const pNext = evaluateSpringPosition(spring, t + dt, vRounded);
    const v = Math.abs(pNext - p) / dt;
    if (Math.abs(1 - p) < 0.0025 && v < 0.015) {
      settleSeconds = t;
      break;
    }
  }
  const durationMs = Math.round(Math.min(620, Math.max(140, settleSeconds * 1000)));
  const samples: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const progress = i / (sampleCount - 1);
    if (i === 0) {
      samples.push(0);
    } else if (i === sampleCount - 1) {
      samples.push(1);
    } else {
      const val = evaluateSpringPosition(
        spring,
        (progress * durationMs) / 1000,
        vRounded
      );
      samples.push(Math.round(val * 10000) / 10000);
    }
  }
  const linearEasing = `linear(${samples.join(', ')})`;
  const curve: SpringCurve = { durationMs, samples, linearEasing };
  springCurveCache.set(key, curve);
  return curve;
}

// Pre-warm canonical spring curves so first interaction never computes them on the main thread
solveSpringCurve(springs.press, 0);
solveSpringCurve(springs.smooth, 0);
solveSpringCurve(springs.sheet, 0);
solveSpringCurve(springs.gentle, 0);

/**
 * Tracks active animations per animated root and globally on document.documentElement
 * so tests and components can inspect `data-motion="idle|running"`.
 */
let globalRunningCount = 0;
const rootRunningCounts = new WeakMap<Element, number>();
const activeElementAnimations = new WeakMap<
  HTMLElement,
  { anim: Animation; cleanup: () => void; startTime: number; duration: number }
>();

function syncGlobalMotionAttribute(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(
    'data-motion',
    globalRunningCount > 0 ? 'running' : 'idle'
  );
}

if (typeof document !== 'undefined') {
  syncGlobalMotionAttribute();
}

export function markMotionRunning(root?: Element | null): () => void {
  let done = false;
  globalRunningCount++;
  if (root) {
    const prev = rootRunningCounts.get(root) ?? 0;
    rootRunningCounts.set(root, prev + 1);
    if (prev === 0) {
      root.setAttribute('data-motion', 'running');
    }
  }
  return () => {
    if (done) return;
    done = true;
    globalRunningCount = Math.max(0, globalRunningCount - 1);
    if (root) {
      const next = Math.max(0, (rootRunningCounts.get(root) ?? 1) - 1);
      rootRunningCounts.set(root, next);
      if (next === 0) {
        root.setAttribute('data-motion', 'idle');
      }
    }
  };
}

export function ensureMotionRootAttribute(root: Element | null): void {
  if (!root) return;
  if (!root.hasAttribute('data-motion')) {
    const count = rootRunningCounts.get(root) ?? 0;
    root.setAttribute('data-motion', count > 0 ? 'running' : 'idle');
  }
}

export interface MotionAnimateOptions {
  readonly durationMs: number;
  readonly easing: string;
  readonly delayMs?: number;
  readonly root?: Element | null;
  readonly willChange?: 'transform' | 'opacity' | 'transform, opacity' | 'transform, opacity, clip-path';
  readonly onFinish?: () => void;
}

/**
 * Interruptible Web Animations API runner that strictly animates only
 * transform, opacity (and clip-path for orb morph), manages will-change only
 * during the animation, and updates data-motion="idle|running".
 */
export function runInterruptibleAnimation(
  el: HTMLElement | null,
  keyframes: Keyframe[],
  options: MotionAnimateOptions
): Animation | null {
  if (!el || typeof el.animate !== 'function') {
    options.onFinish?.();
    return null;
  }

  // Cancel any in-flight animation on this element so a new interaction retargets immediately
  const existing = activeElementAnimations.get(el);
  if (existing) {
    existing.cleanup();
    try {
      existing.anim.cancel();
    } catch {
      // Ignore
    }
  }

  const motionRoot = options.root ?? el.closest('[data-motion]') ?? el;
  ensureMotionRootAttribute(motionRoot);
  const releaseMotion = markMotionRunning(motionRoot);

  let finished = false;
  const finishCleanup = () => {
    if (finished) return;
    finished = true;
    if (options.willChange) {
      el.style.willChange = '';
    }
    activeElementAnimations.delete(el);
    releaseMotion();
  };

  try {
    if (options.willChange) {
      el.style.willChange = options.willChange;
    }
    const useFillBoth = Boolean((options.delayMs && options.delayMs > 0) || options.onFinish);
    const anim = el.animate(keyframes, {
      duration: Math.max(0, options.durationMs),
      delay: options.delayMs ?? 0,
      easing: options.easing,
      fill: useFillBoth ? 'both' : 'none',
    });

    activeElementAnimations.set(el, {
      anim,
      cleanup: finishCleanup,
      startTime: typeof performance !== 'undefined' ? performance.now() : 0,
      duration: options.durationMs,
    });

    const handleDone = () => {
      finishCleanup();
      if (useFillBoth) {
        try {
          anim.cancel();
        } catch {
          // Ignore
        }
      }
      options.onFinish?.();
    };

    anim.onfinish = handleDone;
    anim.oncancel = () => {
      finishCleanup();
    };
    return anim;
  } catch {
    finishCleanup();
    options.onFinish?.();
    return null;
  }
}

export function animateSpringTransform(
  el: HTMLElement | null,
  fromTransform: string,
  toTransform: string,
  spring: SpringToken = springs.smooth,
  options?: {
    fromOpacity?: number;
    toOpacity?: number;
    fromClipPath?: string;
    toClipPath?: string;
    initialVelocity?: number;
    root?: Element | null;
    onFinish?: () => void;
  }
): Animation | null {
  if (!el) {
    options?.onFinish?.();
    return null;
  }
  const reduced = isReducedMotion();
  if (reduced) {
    if (options?.fromOpacity !== undefined && options?.toOpacity !== undefined && options.fromOpacity !== options.toOpacity) {
      return runInterruptibleAnimation(
        el,
        [{ opacity: options.fromOpacity }, { opacity: options.toOpacity }],
        {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: options?.root,
          willChange: 'opacity',
          onFinish: options?.onFinish,
        }
      );
    }
    const motionRoot = options?.root ?? el.closest('[data-motion]') ?? el;
    ensureMotionRootAttribute(motionRoot);
    options?.onFinish?.();
    return null;
  }

  const curve = solveSpringCurve(spring, options?.initialVelocity ?? 0);
  const fromFrame: Keyframe = { transform: fromTransform };
  const toFrame: Keyframe = { transform: toTransform };

  const hasOpacity = options?.fromOpacity !== undefined && options?.toOpacity !== undefined;
  if (hasOpacity) {
    fromFrame.opacity = options.fromOpacity;
    toFrame.opacity = options.toOpacity;
  }
  const hasClipPath = Boolean(options?.fromClipPath && options?.toClipPath);
  if (options?.fromClipPath && options?.toClipPath) {
    fromFrame.clipPath = options.fromClipPath;
    toFrame.clipPath = options.toClipPath;
  }

  return runInterruptibleAnimation(el, [fromFrame, toFrame], {
    durationMs: curve.durationMs,
    easing: curve.linearEasing,
    root: options?.root,
    willChange: hasClipPath
      ? 'transform, opacity, clip-path'
      : hasOpacity
      ? 'transform, opacity'
      : 'transform',
    onFinish: options?.onFinish,
  });
}

interface ParsedTransform {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  txUnit: string;
  tyUnit: string;
}

function parseSimpleTransform(raw: string): ParsedTransform | null {
  if (!raw || raw === 'none') {
    return { tx: 0, ty: 0, sx: 1, sy: 1, txUnit: 'px', tyUnit: 'px' };
  }
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  let txUnit = 'px';
  let tyUnit = 'px';

  const t3d = raw.match(/translate3d\(\s*([+-]?\d*\.?\d+)(px|%)\s*,\s*([+-]?\d*\.?\d+)(px|%)/);
  if (t3d) {
    tx = parseFloat(t3d[1]);
    txUnit = t3d[2];
    ty = parseFloat(t3d[3]);
    tyUnit = t3d[4];
  } else {
    const txMatch = raw.match(/translateX\(\s*([+-]?\d*\.?\d+)(px|%)\s*\)/);
    if (txMatch) {
      tx = parseFloat(txMatch[1]);
      txUnit = txMatch[2];
    }
    const tyMatch = raw.match(/translateY\(\s*([+-]?\d*\.?\d+)(px|%)\s*\)/);
    if (tyMatch) {
      ty = parseFloat(tyMatch[1]);
      tyUnit = tyMatch[2];
    }
  }

  const scale2d = raw.match(/scale\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)/);
  if (scale2d) {
    sx = parseFloat(scale2d[1]);
    sy = parseFloat(scale2d[2]);
  } else {
    const scale1d = raw.match(/scale\(\s*([+-]?\d*\.?\d+)\s*\)/);
    if (scale1d) {
      sx = parseFloat(scale1d[1]);
      sy = sx;
    }
    const scaleXMatch = raw.match(/scaleX\(\s*([+-]?\d*\.?\d+)\s*\)/);
    if (scaleXMatch) sx = parseFloat(scaleXMatch[1]);
    const scaleYMatch = raw.match(/scaleY\(\s*([+-]?\d*\.?\d+)\s*\)/);
    if (scaleYMatch) sy = parseFloat(scaleYMatch[1]);
  }

  return { tx, ty, sx, sy, txUnit, tyUnit };
}

function interpolateTransform(from: string, to: string, t: number): string {
  const a = parseSimpleTransform(from);
  const b = parseSimpleTransform(to);
  if (!a || !b) return t < 0.5 ? from : to;
  const txUnit = a.tx !== 0 ? a.txUnit : b.txUnit;
  const tyUnit = a.ty !== 0 ? a.tyUnit : b.tyUnit;
  const tx = Math.round((a.tx + (b.tx - a.tx) * t) * 100) / 100;
  const ty = Math.round((a.ty + (b.ty - a.ty) * t) * 100) / 100;
  const sx = Math.round((a.sx + (b.sx - a.sx) * t) * 1000) / 1000;
  const sy = Math.round((a.sy + (b.sy - a.sy) * t) * 1000) / 1000;
  if (sx === 1 && sy === 1) {
    return `translate3d(${tx}${txUnit}, ${ty}${tyUnit}, 0)`;
  }
  return `translate3d(${tx}${txUnit}, ${ty}${tyUnit}, 0) scale(${sx}, ${sy})`;
}

function interpolateClipPath(from: string, to: string, t: number): string {
  // Format: inset(toppx rightpx bottompx leftpx round radiuspx)
  const re = /inset\(\s*([+-]?\d*\.?\d+)px\s+([+-]?\d*\.?\d+)px\s+([+-]?\d*\.?\d+)px\s+([+-]?\d*\.?\d+)px\s+round\s+([+-]?\d*\.?\d+)px\s*\)/;
  const ma = from.match(re);
  const mb = to.match(re);
  if (!ma || !mb) return t < 0.5 ? from : to;
  const lerp = (i: number) =>
    Math.round((parseFloat(ma[i]) + (parseFloat(mb[i]) - parseFloat(ma[i])) * t) * 10) / 10;
  return `inset(${lerp(1)}px ${lerp(2)}px ${lerp(3)}px ${lerp(4)}px round ${lerp(5)}px)`;
}

/**
 * Shared-element Quick Add orb geometry store.
 */
export interface OrbRectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly timestamp: number;
}

let lastOrbRect: OrbRectSnapshot | null = null;

export function captureOrbRect(el?: HTMLElement | null): OrbRectSnapshot | null {
  if (typeof document === 'undefined') return null;
  const target =
    el ??
    document.querySelector<HTMLElement>('[data-ui="create-orb"]') ??
    document.querySelector<HTMLElement>('[data-testid="nav-create-Action"]') ??
    document.querySelector<HTMLElement>('[data-testid="mobile-global-create-button"]') ??
    document.querySelector<HTMLElement>('[data-testid="desktop-global-create-button"]');
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  lastOrbRect = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: Math.min(rect.width, rect.height) / 2,
    timestamp: Date.now(),
  };
  return lastOrbRect;
}

export function getCapturedOrbRect(): OrbRectSnapshot | null {
  if (!lastOrbRect) return captureOrbRect();
  return lastOrbRect;
}

/**
 * Smoothly scrolls window to top over durationMs (default 300ms) using easings.out,
 * or jumps immediately when reduced motion is active.
 */
let activeScrollRaf = 0;
export function smoothScrollToTop(durationMs = 300): void {
  if (typeof window === 'undefined') return;
  if (activeScrollRaf) {
    window.cancelAnimationFrame(activeScrollRaf);
    activeScrollRaf = 0;
  }
  const startY = window.scrollY;
  if (startY <= 1 || isReducedMotion()) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    return;
  }
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const step = (now: number) => {
    const elapsed = Math.max(0, now - startTime);
    const t = Math.min(1, elapsed / durationMs);
    // Out cubic approximation of cubic-bezier(0.22, 1, 0.36, 1)
    const eased = 1 - Math.pow(1 - t, 3);
    const nextY = Math.round(startY * (1 - eased));
    window.scrollTo(0, nextY);
    if (t < 1 && nextY > 0) {
      activeScrollRaf = window.requestAnimationFrame(step);
    } else {
      activeScrollRaf = 0;
      window.scrollTo(0, 0);
    }
  };
  activeScrollRaf = window.requestAnimationFrame(step);
}

/**
 * Tracks browser popstate so navigation animations are skipped when triggered
 * by browser/OS back/forward gestures.
 */
let lastPopStateTimestamp = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    lastPopStateTimestamp = Date.now();
  });
}

export function wasRecentPopState(windowMs = 120): boolean {
  return Date.now() - lastPopStateTimestamp <= windowMs;
}

export function markPopStateForTest(): void {
  lastPopStateTimestamp = Date.now();
}

/**
 * Press feedback hook for Button, Row, RoundButton, Pill, ItemCard:
 * instant scale 0.97 + slight brightness in, spring press out.
 */
export function usePressFeedback<T extends HTMLElement = HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      if (!enabled) return;
      const el = ref.current ?? e.currentTarget;
      if (!el || ('disabled' in el && Boolean((el as unknown as { disabled?: boolean }).disabled))) return;
      el.setAttribute('data-pressed', 'true');
      ensureMotionRootAttribute(el);
      if (!isReducedMotion()) {
        el.style.transform = 'scale(0.97)';
      }
    },
    [enabled]
  );

  const release = useCallback(
    (e: React.PointerEvent<T>) => {
      const el = ref.current ?? e.currentTarget;
      if (!el || el.getAttribute('data-pressed') !== 'true') return;
      el.removeAttribute('data-pressed');
      if (isReducedMotion()) {
        el.style.transform = '';
        return;
      }
      el.style.transform = '';
      animateSpringTransform(el, 'scale(0.97)', 'scale(1)', springs.press, {
        root: el,
      });
    },
    []
  );

  return {
    ref,
    onPointerDown,
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
  };
}

/**
 * Shared selection thumb hook for Segmented, PillRow, TabBar, WeekStrip.
 * Slides ONE shared thumb between items using FLIP transform + springs.smooth.
 */
export function useSelectionThumb<T extends string>(
  value: T,
  options?: {
    targetSelector?: string;
    spring?: SpringToken;
    dynamicLayout?: boolean;
    layoutKey?: unknown;
  }
) {
  const containerRef = useRef<HTMLElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const prevRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(
    null
  );
  const cachedBoxesRef = useRef<WeakMap<HTMLElement, { left: number; top: number; width: number; height: number }>>(
    new WeakMap()
  );
  const prevValueRef = useRef<T>(value);
  const prevLayoutKeyRef = useRef<unknown>(options?.layoutKey);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    if (!container || !thumb) return;
    ensureMotionRootAttribute(container);

    if (prevLayoutKeyRef.current !== options?.layoutKey) {
      prevLayoutKeyRef.current = options?.layoutKey;
      cachedBoxesRef.current = new WeakMap();
    }

    const measureTarget = (el: HTMLElement) => {
      let left = 0;
      let top = 0;
      let width = el.offsetWidth;
      let height = el.offsetHeight;

      if (width > 0 && height > 0) {
        let cur: HTMLElement | null = el;
        while (cur && cur !== container) {
          left += cur.offsetLeft;
          top += cur.offsetTop;
          cur = cur.offsetParent as HTMLElement | null;
        }
      } else {
        const cRect = container.getBoundingClientRect();
        const tRect = el.getBoundingClientRect();
        if (cRect.width > 0 && tRect.width > 0) {
          left = tRect.left - cRect.left + container.scrollLeft;
          top = tRect.top - cRect.top + container.scrollTop;
          width = tRect.width;
          height = tRect.height;
        }
      }
      return { left, top, width, height };
    };

    if (!prevRectRef.current && !options?.dynamicLayout) {
      const items = container.querySelectorAll<HTMLElement>('button');
      items.forEach((btn) => {
        const t = options?.targetSelector
          ? btn.querySelector<HTMLElement>(options.targetSelector) ?? btn
          : btn;
        const box = measureTarget(t);
        if (box.width > 0 && box.height > 0) {
          cachedBoxesRef.current.set(t, box);
        }
      });
    }

    const activeButton = container.querySelector<HTMLElement>('[aria-pressed="true"], [data-active="true"]');
    if (!activeButton) {
      thumb.style.opacity = '0';
      return;
    }

    const targetEl = options?.targetSelector
      ? activeButton.querySelector<HTMLElement>(options.targetSelector) ?? activeButton
      : activeButton;

    let nextBox = options?.dynamicLayout ? undefined : cachedBoxesRef.current.get(targetEl);
    if (!nextBox || nextBox.width <= 0) {
      nextBox = measureTarget(targetEl);
      if (nextBox.width <= 0) return;
      cachedBoxesRef.current.set(targetEl, nextBox);
    }

    const prevBox = prevRectRef.current;

    if (!prevBox) {
      thumb.style.opacity = '1';
    }
    if (!prevBox || Math.abs(prevBox.width - nextBox.width) > 0.5) {
      thumb.style.width = `${nextBox.width}px`;
    }
    if (!prevBox || Math.abs(prevBox.height - nextBox.height) > 0.5) {
      thumb.style.height = `${nextBox.height}px`;
    }
    thumb.style.transform = `translate3d(${nextBox.left}px, ${nextBox.top}px, 0)`;

    const valueChanged = prevValueRef.current !== value;
    prevRectRef.current = nextBox;
    prevValueRef.current = value;

    if (!prevBox || !valueChanged) return;

    const dx = prevBox.left - nextBox.left;
    const dy = prevBox.top - nextBox.top;
    const sx = nextBox.width > 0 ? prevBox.width / nextBox.width : 1;
    const sy = nextBox.height > 0 ? prevBox.height / nextBox.height : 1;

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.02) {
      return;
    }

    if (isReducedMotion()) {
      runInterruptibleAnimation(
        thumb,
        [{ opacity: 0.6 }, { opacity: 1 }],
        {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: container,
          willChange: 'opacity',
        }
      );
      return;
    }

    const fromTransform = `translate3d(${prevBox.left}px, ${prevBox.top}px, 0) scale(${sx}, ${sy})`;
    const toTransform = `translate3d(${nextBox.left}px, ${nextBox.top}px, 0) scale(1, 1)`;
    animateSpringTransform(
      thumb,
      fromTransform,
      toTransform,
      options?.spring ?? springs.smooth,
      { root: container }
    );
  }, [value, options?.targetSelector, options?.dynamicLayout, options?.layoutKey]);

  return { containerRef, thumbRef };
}

/**
 * Passive scroll-driven header collapse hook writing ONE CSS variable --collapse (0..1)
 * inside requestAnimationFrame without any layout reads in the animation frame.
 */
export function useHeaderScrollCollapse(thresholdPx = 64) {
  const headerRef = useRef<HTMLElement | null>(null);
  const setCompact = useCallback((next: boolean) => {
    headerRef.current?.setAttribute('data-compact', String(next));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;
    let latestScrollY = window.scrollY;
    let lastCompact = latestScrollY > 120;

    const applyScroll = () => {
      rafId = 0;
      const ratio = Math.min(1, Math.max(0, latestScrollY / thresholdPx));
      const el = headerRef.current;
      if (el) {
        el.style.setProperty('--collapse', ratio.toFixed(3));
        const nextCompact = latestScrollY > 120;
        if (nextCompact !== lastCompact) {
          lastCompact = nextCompact;
          el.setAttribute('data-compact', String(nextCompact));
        }
      }
    };

    const onScroll = () => {
      latestScrollY = window.scrollY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(applyScroll);
      }
    };

    applyScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [thresholdPx]);

  return { headerRef, compact: false, setCompact };
}

/**
 * AnimatedList:
 * - enter = fade + translateY 8px (stagger 20ms, max 8 items)
 * - exit = fade + collapse
 * - insert/reorder = FLIP layout animation so siblings glide
 */
export function useAnimatedList(depKey?: unknown) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevBoxesRef = useRef<Map<string, { top: number; left: number }>>(new Map());
  const mountedKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const container = listRef.current;
    if (!container) return;
    ensureMotionRootAttribute(container);

    const children = (Array.from(container.children) as HTMLElement[]).slice(0, 12);
    const nextBoxes = new Map<string, { top: number; left: number }>();
    const nextKeys = new Set<string>();
    const reduced = isReducedMotion();

    children.forEach((child, idx) => {
      const key =
        child.getAttribute('data-list-key') ??
        child.getAttribute('data-testid') ??
        child.id ??
        `idx-${idx}`;
      nextKeys.add(key);
      nextBoxes.set(key, { top: child.offsetTop, left: child.offsetLeft });
    });

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevBoxesRef.current = nextBoxes;
      mountedKeysRef.current = nextKeys;
      children.slice(0, 8).forEach((child, idx) => {
        if (reduced) {
          runInterruptibleAnimation(
            child,
            [{ opacity: 0 }, { opacity: 1 }],
            {
              durationMs: tweens.reduced,
              easing: easings.out,
              root: container,
              willChange: 'opacity',
            }
          );
        } else {
          runInterruptibleAnimation(
            child,
            [
              { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            {
              durationMs: tweens.base,
              delayMs: Math.min(idx, 7) * 20,
              easing: easings.out,
              root: container,
              willChange: 'transform, opacity',
            }
          );
        }
      });
      return;
    }

    let enterCount = 0;
    children.forEach((child, idx) => {
      const key =
        child.getAttribute('data-list-key') ??
        child.getAttribute('data-testid') ??
        child.id ??
        `idx-${idx}`;
      const nextPos = nextBoxes.get(key);
      const prevPos = prevBoxesRef.current.get(key);

      if (!mountedKeysRef.current.has(key)) {
        const staggerIdx = Math.min(enterCount++, 7);
        if (reduced) {
          runInterruptibleAnimation(
            child,
            [{ opacity: 0 }, { opacity: 1 }],
            {
              durationMs: tweens.reduced,
              easing: easings.out,
              root: container,
              willChange: 'opacity',
            }
          );
        } else {
          runInterruptibleAnimation(
            child,
            [
              { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            {
              durationMs: tweens.base,
              delayMs: staggerIdx * 20,
              easing: easings.out,
              root: container,
              willChange: 'transform, opacity',
            }
          );
        }
      } else if (prevPos && nextPos && !reduced) {
        const dx = prevPos.left - nextPos.left;
        const dy = prevPos.top - nextPos.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          animateSpringTransform(
            child,
            `translate3d(${dx}px, ${dy}px, 0)`,
            'translate3d(0px, 0px, 0)',
            springs.smooth,
            { root: container }
          );
        }
      }
    });

    prevBoxesRef.current = nextBoxes;
    mountedKeysRef.current = nextKeys;
  }, [depKey]);

  return listRef;
}

export function AnimatedList({
  children,
  className = '',
  depKey,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { depKey?: unknown }) {
  const ref = useAnimatedList(depKey ?? React.Children.count(children));
  return React.createElement(
    'div',
    {
      ...props,
      ref,
      'data-motion': 'idle',
      className: `ui-animated-list ${className}`.trim(),
    },
    children
  );
}

/**
 * Sub-screen push/pop transition hook:
 * - push: new screen slides in from right (320ms, emphasized) while previous screen shifts -28% and dims
 * - pop: reverses (current slides out to right, parent shifts -28% -> 0% and undims)
 * - skips animation if navigation came from browser/OS back gesture (popstate)
 */
export function useSubScreenTransition<T extends string>(
  activeKey: T,
  isSubScreen: (key: T) => boolean | number
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevKeyRef = useRef<T>(activeKey);
  const ghostSnapshotRef = useRef<HTMLElement | null>(null);

  // Capture lightweight outgoing surface layer (<0.05ms, zero HTML re-parse)
  const captureOutgoingScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || isReducedMotion()) return;
    const clone = document.createElement('div');
    clone.className = 'ui-nav-ghost-card';
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    clone.style.minHeight = '320px';
    clone.style.borderRadius = '20px';
    clone.style.background = 'var(--bg-surface)';
    clone.style.opacity = '0.85';
    ghostSnapshotRef.current = clone;
  }, []);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = activeKey;

    if (!container) return;
    ensureMotionRootAttribute(container);
    if (prevKey === activeKey) return;

    if (wasRecentPopState()) {
      ghostSnapshotRef.current = null;
      return;
    }

    const prevDepth = Number(isSubScreen(prevKey));
    const nextDepth = Number(isSubScreen(activeKey));
    const direction: 'push' | 'pop' = nextDepth < prevDepth ? 'pop' : 'push';

    container.setAttribute('data-nav-direction', direction);

    if (isReducedMotion()) {
      ghostSnapshotRef.current = null;
      runInterruptibleAnimation(
        container,
        [{ opacity: 0 }, { opacity: 1 }],
        {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: container,
          willChange: 'opacity',
        }
      );
      return;
    }

    const ghost = ghostSnapshotRef.current;
    ghostSnapshotRef.current = null;
    const parent = container.parentElement;
    let ghostWrapper: HTMLDivElement | null = null;

    if (ghost && parent) {
      parent.style.position = 'relative';
      parent.style.overflowX = 'clip';
      ghostWrapper = document.createElement('div');
      ghostWrapper.className = 'ui-nav-ghost-layer';
      ghostWrapper.setAttribute('aria-hidden', 'true');
      ghostWrapper.style.position = 'absolute';
      ghostWrapper.style.inset = '0';
      ghostWrapper.style.pointerEvents = 'none';
      ghostWrapper.style.zIndex = direction === 'push' ? '0' : '2';
      ghostWrapper.appendChild(ghost);
      parent.appendChild(ghostWrapper);

      const ghostKeyframes: Keyframe[] =
        direction === 'push'
          ? [
              { transform: 'translate3d(0%, 0, 0)', opacity: 1 },
              { transform: 'translate3d(-28%, 0, 0)', opacity: 0.55 },
            ]
          : [
              { transform: 'translate3d(0%, 0, 0)', opacity: 1 },
              { transform: 'translate3d(100%, 0, 0)', opacity: 0.9 },
            ];

      runInterruptibleAnimation(ghostWrapper, ghostKeyframes, {
        durationMs: 320,
        easing: easings.emphasized,
        root: container,
        willChange: 'transform, opacity',
        onFinish: () => {
          ghostWrapper?.remove();
        },
      });
    }

    const incomingKeyframes: Keyframe[] =
      direction === 'push'
        ? [
            { transform: 'translate3d(100%, 0, 0)', opacity: 1 },
            { transform: 'translate3d(0%, 0, 0)', opacity: 1 },
          ]
        : [
            { transform: 'translate3d(-28%, 0, 0)', opacity: 0.55 },
            { transform: 'translate3d(0%, 0, 0)', opacity: 1 },
          ];

    runInterruptibleAnimation(container, incomingKeyframes, {
      durationMs: 320,
      easing: easings.emphasized,
      root: container,
      willChange: 'transform, opacity',
      onFinish: () => {
        ghostWrapper?.remove();
      },
    });
  }, [activeKey]);

  return { containerRef, captureOutgoingScreen };
}

/**
 * Long-press drag-reorder hook:
 * - lifts the dragged row (scale 1.02 + shadow on a separate opacity layer via data-dragging="true")
 * - siblings glide via FLIP (animateSpringTransform with springs.smooth)
 * - drop settles with springs.smooth
 */
export function useDragReorder<T extends { id: string }>(
  items: readonly T[],
  onReorder?: (reorderedIds: string[]) => void
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const stateRef = useRef<{
    id: string;
    el: HTMLElement;
    startY: number;
    currentY: number;
    timer: number | null;
    armed: boolean;
    order: string[];
  } | null>(null);

  const bindDragItem = useCallback(
    (id: string) => ({
      'data-drag-id': id,
      'data-dragging': draggingId === id ? 'true' : undefined,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (!onReorder || (e.target as HTMLElement).closest('button, a, input, [role="menu"]')) return;
        const el = e.currentTarget;
        const startY = e.clientY;
        const timer = window.setTimeout(() => {
          if (!stateRef.current || stateRef.current.id !== id) return;
          stateRef.current.armed = true;
          setDraggingId(id);
          el.setAttribute('data-dragging', 'true');
          if (!isReducedMotion()) {
            el.style.willChange = 'transform';
            el.style.zIndex = '30';
            el.style.transform = 'translate3d(0px, 0px, 0) scale(1.02)';
          }
          try {
            el.setPointerCapture?.(e.pointerId);
          } catch {
            // Ignore
          }
        }, 320);

        stateRef.current = {
          id,
          el,
          startY,
          currentY: startY,
          timer,
          armed: false,
          order: items.map((item) => item.id),
        };
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const st = stateRef.current;
        if (!st || st.id !== id) return;
        if (!st.armed) {
          if (Math.abs(e.clientY - st.startY) > 10) {
            if (st.timer) window.clearTimeout(st.timer);
            stateRef.current = null;
          }
          return;
        }
        st.currentY = e.clientY;
        const dy = e.clientY - st.startY;
        if (!isReducedMotion()) {
          st.el.style.transform = `translate3d(0px, ${Math.round(dy)}px, 0) scale(1.02)`;
        }
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const st = stateRef.current;
        if (!st || st.id !== id) return;
        if (st.timer) window.clearTimeout(st.timer);
        stateRef.current = null;
        if (!st.armed) return;

        const dy = e.clientY - st.startY;
        const rowHeight = st.el.offsetHeight || 56;
        const indexDelta = Math.round(dy / rowHeight);
        const currentIndex = st.order.indexOf(id);
        const nextIndex = Math.max(0, Math.min(st.order.length - 1, currentIndex + indexDelta));

        st.el.removeAttribute('data-dragging');
        st.el.style.willChange = '';
        st.el.style.zIndex = '';
        st.el.style.transform = '';
        setDraggingId(null);

        if (!isReducedMotion()) {
          animateSpringTransform(
            st.el,
            `translate3d(0px, ${Math.round(dy)}px, 0) scale(1.02)`,
            'translate3d(0px, 0px, 0) scale(1)',
            springs.smooth,
            { root: st.el }
          );
        }

        if (nextIndex !== currentIndex && currentIndex >= 0 && onReorder) {
          const nextOrder = [...st.order];
          const [moved] = nextOrder.splice(currentIndex, 1);
          nextOrder.splice(nextIndex, 0, moved);
          onReorder(nextOrder);
        }
      },
      onPointerCancel: () => {
        const st = stateRef.current;
        if (!st || st.id !== id) return;
        if (st.timer) window.clearTimeout(st.timer);
        stateRef.current = null;
        st.el.removeAttribute('data-dragging');
        st.el.style.willChange = '';
        st.el.style.zIndex = '';
        st.el.style.transform = '';
        setDraggingId(null);
      },
    }),
    [items, onReorder, draggingId]
  );

  return { draggingId, bindDragItem };
}

/**
 * Ambient canvas: two large blurred pastel blobs (peach/yellow top-right, mint/blue bottom-left, ~35%)
 * drifting very slowly (40-60s loop, transform only), paused when hidden or on reduced motion.
 */
export function AmbientCanvas() {
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const paused = reduced || hidden;

  return React.createElement(
    'div',
    {
      'aria-hidden': 'true',
      'data-ui': 'ambient-canvas',
      'data-paused': paused ? 'true' : 'false',
      className: 'ui-ambient-canvas',
    },
    React.createElement('span', { className: 'ui-ambient-layer ui-ambient-layer-1' }),
    React.createElement('span', { className: 'ui-ambient-layer ui-ambient-layer-2' })
  );
}

