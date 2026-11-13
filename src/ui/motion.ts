import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, } from 'react';

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

export const motionDurations = { tap: 110, selection: 180, content: 220, sheet: 280, exit: 160, reduced: 100 } as const;

export const tweens = {
  fast: motionDurations.tap,
  base: motionDurations.content,
  slow: motionDurations.sheet,
  reduced: motionDurations.reduced,
  t180: 180,
  t240: 240,
  t300: 300,
  short: 180,
  medium: 240,
  long: 300,
} as const;

export const easings = {
  out: 'cubic-bezier(0.22,1,0.36,1)',
  emphasized: 'cubic-bezier(0.32,0.72,0,1)',
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

function markMotionRunning(root?: Element | null): () => void {
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

  const reduced = isReducedMotion();
  const frames = reduced ? keyframes.map(frame => ({ opacity: frame.opacity })).filter(frame => frame.opacity !== undefined) : keyframes;
  // Spatial-only transitions have no reduced-motion work; commit lifecycle immediately.
  if (reduced && frames.length === 0) {
    const existing = activeElementAnimations.get(el);
    existing?.cleanup();
    existing?.anim.cancel();
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
    const anim = el.animate(frames, {
      duration: Math.max(0, reduced ? Math.min(motionDurations.reduced, options.durationMs) : options.durationMs),
      delay: reduced ? 0 : options.delayMs ?? 0,
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
    durationMs: spring === springs.press ? motionDurations.tap : spring === springs.sheet ? motionDurations.sheet : spring === springs.smooth ? motionDurations.selection : motionDurations.content,
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

export function transitionCreation(update: () => void): void {
  captureOrbRect();
  update();
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
        el.style.transform = 'translateY(1px) scale(0.97)';
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
      animateSpringTransform(el, 'translateY(1px) scale(0.97)', 'translateY(0px) scale(1)', springs.press, {
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
  const wasHiddenRef = useRef<boolean>(false);

  const measureAndPosition = useCallback(
    (animate: boolean) => {
      const container = containerRef.current;
      const thumb = thumbRef.current;
      if (!container || !thumb) return;
      ensureMotionRootAttribute(container);

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

      const activeButton = container.querySelector<HTMLElement>(
        '[aria-selected="true"], [aria-pressed="true"], [data-selected="true"], [data-active="true"]'
      );
      if (!activeButton || value === ('__none__' as T) || value === ('' as T)) {
        thumb.style.opacity = '0';
        wasHiddenRef.current = true;
        prevValueRef.current = value;
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
      const wasHidden = wasHiddenRef.current;
      wasHiddenRef.current = false;

      thumb.style.opacity = '1';
      if (!prevBox || Math.abs(prevBox.width - nextBox.width) > 0.5) {
        thumb.style.width = `${nextBox.width}px`;
      }
      if (!prevBox || Math.abs(prevBox.height - nextBox.height) > 0.5) {
        thumb.style.height = `${nextBox.height}px`;
      }
      thumb.style.transform = `translate3d(${nextBox.left}px, ${nextBox.top}px, 0)`;

      const valueChanged = prevValueRef.current !== value;
      const layoutChanged = prevLayoutKeyRef.current !== options?.layoutKey;
      prevRectRef.current = nextBox;
      prevValueRef.current = value;
      prevLayoutKeyRef.current = options?.layoutKey;

      if (!animate || !prevBox || (!valueChanged && !layoutChanged)) return;

      if (wasHidden) {
        runInterruptibleAnimation(
          thumb,
          [{ opacity: 0 }, { opacity: 1 }],
          {
            durationMs: isReducedMotion() ? tweens.reduced : tweens.fast,
            easing: easings.out,
            root: container,
            willChange: 'opacity',
          }
        );
        return;
      }

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

      const fromTransform =
        Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02
          ? `translate3d(${prevBox.left}px, ${prevBox.top}px, 0) scale(${sx}, ${sy})`
          : `translate3d(${prevBox.left}px, ${prevBox.top}px, 0)`;
      const toTransform =
        Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02
          ? `translate3d(${nextBox.left}px, ${nextBox.top}px, 0) scale(1, 1)`
          : `translate3d(${nextBox.left}px, ${nextBox.top}px, 0)`;

      animateSpringTransform(
        thumb,
        fromTransform,
        toTransform,
        options?.spring ?? springs.smooth,
        { root: container }
      );
    },
    [value, options?.targetSelector, options?.dynamicLayout, options?.layoutKey, options?.spring]
  );

  useIsomorphicLayoutEffect(() => {
    if (prevLayoutKeyRef.current !== options?.layoutKey) {
      cachedBoxesRef.current = new WeakMap();
    }
    measureAndPosition(true);
  }, [measureAndPosition, options?.layoutKey]);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      cachedBoxesRef.current = new WeakMap();
      measureAndPosition(false);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [measureAndPosition]);

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

    if (prevDepth === nextDepth || isReducedMotion()) {
      ghostSnapshotRef.current = null;
      container.setAttribute('data-nav-direction', 'fade');
      runInterruptibleAnimation(
        container,
        [{ opacity: 0 }, { opacity: 1 }],
        {
          durationMs: isReducedMotion() ? tweens.reduced : tweens.fast,
          easing: easings.out,
          root: container,
          willChange: 'opacity',
        }
      );
      return;
    }

    const direction: 'push' | 'pop' = nextDepth < prevDepth ? 'pop' : 'push';

    container.setAttribute('data-nav-direction', direction);

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
        durationMs: 300,
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
      durationMs: 300,
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

const AMBIENT_ART = import.meta.glob('../assets/art/blob-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function AmbientCanvas() {
  return React.createElement(
    'div',
    {
      'aria-hidden': 'true',
      'data-ui': 'ambient-canvas',
      className: 'ui-ambient-canvas',
    },
    React.createElement('span', {
      'aria-hidden': 'true',
      className: 'ui-ambient-top-glow',
    }),
    React.createElement('span', {
      'aria-hidden': 'true',
      className: 'ui-ambient-blob ui-ambient-blob-mint',
      style: { backgroundImage: AMBIENT_ART['../assets/art/blob-mint.webp'] ? `url("${AMBIENT_ART['../assets/art/blob-mint.webp']}")` : undefined },
    }),
    ...['coral', 'lavender'].map(name => React.createElement('span', {
      key: name,
      className: `ui-ambient-blob ui-ambient-blob-${name}`,
      style: { backgroundImage: AMBIENT_ART[`../assets/art/blob-${name}.webp`] ? `url("${AMBIENT_ART[`../assets/art/blob-${name}.webp`]}")` : undefined },
    })),
    React.createElement('span', {
      'aria-hidden': 'true',
      className: 'ui-ambient-blob ui-ambient-blob-pink',
      style: { backgroundImage: AMBIENT_ART['../assets/art/blob-pink.webp'] ? `url("${AMBIENT_ART['../assets/art/blob-pink.webp']}")` : undefined },
    })
  );
}


/** Cancels obsolete frames and resumes from the currently displayed number. */
export function useMotionNumber(target: number, duration = 280): number {
  const [value,setValue] = useState(() => isReducedMotion() ? target : 0);
  const current = useRef(value);
  useEffect(() => {
    if (isReducedMotion()) {current.current=target;setValue(target);return;}
    const from=current.current,start=performance.now();let frame=0;
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/duration);current.current=from+(target-from)*(1-(1-t)**3);setValue(current.current);if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[target,duration]);
  return value;
}

export function useMotionEntrance<T extends HTMLElement>(key: unknown, stagger = false) {
  const ref=useRef<T>(null);
  useEffect(()=>{
    const root=ref.current;if(!root)return;
    const nodes=stagger ? Array.from(root.querySelectorAll('[role="button"]')) as HTMLElement[] : [root];
    const animations=nodes.map((node,i)=>runInterruptibleAnimation(node,[{opacity:0,transform:'translateY(6px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{durationMs:280,delayMs:stagger?i*40:0,easing:easings.out}));
    return()=>animations.forEach(animation=>animation?.cancel());
  },[key,stagger]);
  return ref;
}
