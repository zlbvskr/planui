import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';
import { animateSpringTransform, easings, ensureMotionRootAttribute, isReducedMotion, runInterruptibleAnimation, springs, tweens } from './motion';
import { getViewportLayerRoot } from './overlayStack';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function Toast({
  message,
  onDismiss,
  undo,
  icon = 'check',
}: {
  message: string;
  onDismiss: () => void;
  undo?: () => void;
  icon?: IconName;
}) {
  const toastRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const lastYRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const dismiss = useRef(onDismiss);

  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  useIsomorphicLayoutEffect(() => {
    const el = toastRef.current;
    if (!el) return;
    ensureMotionRootAttribute(el);
    el.style.transform = '';
    el.style.opacity = '';
    runInterruptibleAnimation(
      el,
      [
        { opacity: 0, transform: 'translate3d(0px, 16px, 0)' },
        { opacity: 1, transform: 'translate3d(0px, 0px, 0)' },
      ],
      {
        durationMs: isReducedMotion() ? tweens.reduced : 240,
        easing: easings.out,
        root: el,
        willChange: 'transform, opacity',
      }
    );
  }, [message]);

  const toastNode = (
    <div
      ref={toastRef}
      data-ui="toast"
      data-motion="idle"
      className="ui-toast ui-ink-gel"
      role="status"
      aria-live="polite"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        startYRef.current = e.clientY;
        lastYRef.current = e.clientY;
        lastTRef.current = performance.now();
        velocityRef.current = 0;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (startYRef.current === null || !toastRef.current) return;
        const now = performance.now();
        const dt = Math.max(1, now - lastTRef.current);
        velocityRef.current = (e.clientY - lastYRef.current) / dt;
        lastYRef.current = e.clientY;
        lastTRef.current = now;
        const dy = e.clientY - startYRef.current;
        const clampedDy = dy < 0 ? dy * 0.25 : dy;
        toastRef.current.style.transform = `translate3d(0px, ${Math.round(clampedDy)}px, 0)`;
      }}
      onPointerUp={(e) => {
        if (startYRef.current === null) return;
        const dy = e.clientY - startYRef.current;
        const v = velocityRef.current;
        startYRef.current = null;
        if (dy > 30 || v > 0.4) {
          onDismiss();
        } else if (toastRef.current) {
          toastRef.current.style.transform = '';
          animateSpringTransform(
            toastRef.current,
            `translate3d(0px, ${Math.max(0, Math.round(dy))}px, 0)`,
            'translate3d(0px, 0px, 0)',
            springs.smooth,
            { root: toastRef.current }
          );
        }
      }}
      onPointerCancel={() => {
        startYRef.current = null;
        if (toastRef.current) {
          toastRef.current.style.transform = '';
        }
      }}
    >
      <Icon name={icon} />
      <span>{message}</span>
      {undo && (
        <>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <button
            type="button"
            className="ui-toast-undo"
            onClick={() => {
              undo();
              onDismiss();
            }}
          >
            Скасувати
          </button>
        </>
      )}
    </div>
  );

  const hostedToast = <div className="ui-toast-host">{toastNode}</div>;

  return typeof document !== 'undefined'
    ? createPortal(hostedToast, getViewportLayerRoot())
    : hostedToast;
}

export function InlineBanner({
  children,
  icon = 'info',
  tone = 'info',
  onDismiss,
}: {
  children: React.ReactNode;
  icon?: IconName;
  tone?: 'info' | 'success' | 'error' | 'amber' | 'warning';
  onDismiss?: () => void;
}) {
  return (
    <div
      data-ui="inline-banner"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      className="ui-inline-banner"
    >
      <Icon name={icon} />
      <span className="ui-banner-text">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрити"
          className="ui-round"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
