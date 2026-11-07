import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle2, Info } from './icons';
import { UK_STRINGS } from '../i18n/uk';
import { DateField, PillRow, Segmented, SelectField, TimeField } from './contract';
import {
  animateSpringTransform,
  easings,
  ensureMotionRootAttribute,
  getCapturedOrbRect,
  isReducedMotion,
  runInterruptibleAnimation,
  springs,
  tweens,
  usePressFeedback,
} from './motion';

import { useOverlayRegistration } from './overlayStack';

export { SelectField };

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger' | 'tertiary' | 'destructive';
  size?: 'md' | 'sm' | 'icon';
  fullWidth?: boolean;
  busy?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth,
  busy = false,
  className = '',
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}) => {
  const isDisabled = Boolean(busy || props.disabled);
  const press = usePressFeedback<HTMLButtonElement>(!isDisabled);
  const isPrimary = variant === 'primary';
  const isFullWidth = fullWidth ?? isPrimary;
  const dismissLabel =
    typeof children === 'string' && ['Закрити', 'Скасувати'].includes(children.trim())
      ? children.trim()
      : undefined;
  const baseClasses = isPrimary
    ? 'ui-primary inline-flex items-center justify-center gap-2 font-semibold rounded-full planui-transition-micro select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer'
    : 'inline-flex items-center justify-center gap-2 font-semibold rounded-full planui-transition-micro select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const sizeClasses = isPrimary
    ? 'min-h-[56px] px-6 py-3.5 text-[1rem]'
    : size === 'icon'
    ? 'min-w-[44px] min-h-[44px] p-2.5'
    : size === 'sm'
    ? 'min-h-[40px] px-4 py-2 text-[0.9375rem]'
    : 'min-h-[44px] px-5 py-2.5 text-[1rem]';

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          backgroundColor: 'var(--ink)',
          color: 'var(--on-ink)',
          border: '1px solid transparent',
        }
      : variant === 'danger' || variant === 'destructive'
      ? {
          backgroundColor: 'var(--color-danger-tint)',
          color: 'var(--color-danger)',
          border: '1px solid transparent',
        }
      : variant === 'subtle' || variant === 'tertiary'
      ? {
          backgroundColor: 'transparent',
          color: 'var(--text-primary)',
          border: '1px solid transparent',
        }
      : {
          backgroundColor: 'var(--glass-bg)',
          color: 'var(--text-primary)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        };

  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
      aria-label={dismissLabel}
      aria-busy={busy || undefined}
      data-variant={variant}
      className={`ui-button ui-pressable ${baseClasses} ${sizeClasses} ${
        isFullWidth ? 'w-full' : ''
      } ${className}`.trim()}
      style={variantStyle}
      {...props}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        press.onPointerUp(e);
        onPointerUp?.(e);
      }}
      onPointerCancel={(e) => {
        press.onPointerCancel(e);
        onPointerCancel?.(e);
      }}
      onPointerLeave={(e) => {
        press.onPointerLeave(e);
        onPointerLeave?.(e);
      }}
      disabled={isDisabled}
    >
      {busy ? 'Зачекайте…' : dismissLabel ? <X /> : children}
    </button>
  );
};

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  hint,
  error,
  id,
  className = '',
  type,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  if (type === 'date' || type === 'time') {
    const Field = type === 'date' ? DateField : TimeField;
    return <Field {...props} id={inputId} label={label} value={String(props.value ?? '')} />;
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={inputId}
        className="text-[0.9375rem] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-[1rem] planui-transition-micro"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: error
            ? '1.5px solid var(--color-brand)'
            : '1px solid var(--border-subtle)',
        }}
        aria-invalid={error ? 'true' : undefined}
        {...props}
      />
      {hint && !error && (
        <span className="text-[0.8125rem]" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          role="alert"
          className="text-[0.8125rem] font-medium flex items-center gap-1.5"
          style={{ color: 'var(--color-brand-text)' }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
};

export interface TextAreaFieldProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({
  label,
  hint,
  id,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={fieldId}
        className="text-[0.9375rem] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        className="w-full px-3.5 py-2.5 rounded-xl text-[1rem] planui-transition-micro resize-y"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
        }}
        {...props}
      />
      {hint && (
        <span className="text-[0.8125rem]" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      )}
    </div>
  );
};

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return options.length <= 4 ? (
    <Segmented label={ariaLabel} options={options} value={value} onChange={onChange} />
  ) : (
    <PillRow label={ariaLabel} options={options} value={value} onChange={onChange} />
  );
}

export interface FeedbackBannerProps {
  tone: 'success' | 'error' | 'info';
  message: string;
  onDismiss?: () => void;
}

export const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  tone,
  message,
  onDismiss,
}) => {
  const Icon =
    tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;

  const toneStyles: React.CSSProperties =
    tone === 'error'
      ? {
          backgroundColor: 'var(--color-brand-tint)',
          color: 'var(--color-brand-text)',
          borderColor: 'var(--color-brand)',
        }
      : tone === 'success'
      ? {
          backgroundColor: 'var(--color-dayoff-tint)',
          color: 'var(--color-dayoff-text)',
          borderColor: 'var(--color-dayoff)',
        }
      : {
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-strong)',
        };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="ui-inline-banner rounded-xl px-4 py-3 border flex items-start justify-between gap-3 text-[0.9375rem]"
      style={toneStyles}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="ui-banner-text leading-snug">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={UK_STRINGS.app.closeButton}
          className="min-w-[36px] min-h-[36px] -my-1 -mr-1 inline-flex items-center justify-center rounded-lg cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

let activeOpenSheetCount = 0;

function syncBackgroundScale(opening: boolean): void {
  if (typeof document === 'undefined') return;
  const bgRoot =
    document.querySelector<HTMLElement>('[data-testid="shell-background-root"]') ??
    document.querySelector<HTMLElement>('.planui-canvas');
  if (!bgRoot) return;
  ensureMotionRootAttribute(bgRoot);

  if (opening) {
    bgRoot.setAttribute('data-sheet-open', 'true');
  } else {
    bgRoot.removeAttribute('data-sheet-open');
  }
}

export interface ModalSheetProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  transitionName?: string;
  quickAdd?: boolean;
  contract?: boolean;
  isDirty?: boolean;
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

export const ModalSheet: React.FC<ModalSheetProps> = ({
  isOpen,
  title,
  subtitle,
  transitionName,
  quickAdd = false,
  isDirty = false,
  footer,
  onClose,
  children,
}) => {
  const [closing, setClosing] = useState(false);
  const wasOpenRef = useRef(isOpen);
  const [viewport, setViewport] = useState(() => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null;
    return v
      ? {
          height: v.height,
          bottom: Math.max(0, window.innerHeight - v.height - v.offsetTop),
        }
      : { height: 0, bottom: 0 };
  });
  const scrimRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const dragStateRef = useRef<{
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    active: boolean;
  } | null>(null);
  const usedOrbMorphRef = useRef<{
    orbClip: string;
    sheetClip: string;
  } | null>(null);

  const isClosing = !isOpen && (closing || wasOpenRef.current);

  useEffect(() => {
    if (!isOpen) return;
    activeOpenSheetCount++;
    if (activeOpenSheetCount === 1) {
      syncBackgroundScale(true);
    }
    return () => {
      activeOpenSheetCount = Math.max(0, activeOpenSheetCount - 1);
      if (activeOpenSheetCount === 0) {
        syncBackgroundScale(false);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const v = window.visualViewport;
      if (v) {
        const nextHeight = v.height;
        const nextBottom = Math.max(0, window.innerHeight - v.height - v.offsetTop);
        setViewport((prev) =>
          prev.height === nextHeight && prev.bottom === nextBottom
            ? prev
            : { height: nextHeight, bottom: nextBottom }
        );
      }
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [isOpen, quickAdd]);

  const titleId = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);

  const restoreFocus = () => {
    const el = previousFocusRef.current;
    if (el && typeof document !== 'undefined' && document.contains(el)) {
      try {
        el.focus();
      } catch {
        // Ignore
      }
      previousFocusRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShowDirtyConfirm(false);
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }
      const timer = window.setTimeout(() => {
        const root = dialogRef.current;
        if (!root) return;
        const focusable =
          root.querySelector<HTMLElement>('[data-testid="create-task-title-input"]') ??
          root.querySelector<HTMLElement>(
            'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
          );
        if (focusable) {
          focusable.focus();
        } else {
          root.focus();
        }
      }, 20);
      return () => {
        window.clearTimeout(timer);
        restoreFocus();
      };
    } else {
      restoreFocus();
    }
  }, [isOpen]);

  // Present and dismiss animations
  useIsomorphicLayoutEffect(() => {
    const dialog = dialogRef.current;
    const scrim = scrimRef.current;
    if (!dialog) {
      if (!isOpen) {
        wasOpenRef.current = false;
        setClosing(false);
      }
      return;
    }
    ensureMotionRootAttribute(dialog);

    const reduced = isReducedMotion();

    if (isOpen) {
      wasOpenRef.current = true;
      if (closing) setClosing(false);
      dialog.style.transform = '';
      dialog.style.clipPath = '';
      dialog.removeAttribute('data-dragging');

      if (scrim) {
        runInterruptibleAnimation(scrim, [{ opacity: 0 }, { opacity: 1 }], {
          durationMs: reduced ? tweens.reduced : tweens.base,
          easing: easings.out,
          root: dialog,
          willChange: 'opacity',
        });
      }

      const orb = getCapturedOrbRect();
      const isOrbMorphCandidate =
        !reduced &&
        orb !== null &&
        (transitionName === 'planui-create' || Date.now() - orb.timestamp < 900);

      if (isOrbMorphCandidate && orb) {
        const sWidth = dialog.offsetWidth;
        const sHeight = dialog.offsetHeight;
        const sLeft = dialog.offsetLeft;
        const sTop = dialog.offsetTop;
        if (sWidth > 0 && sHeight > 0) {
          const insetTop = Math.max(0, Math.round(orb.top - sTop));
          const insetRight = Math.max(0, Math.round(sLeft + sWidth - (orb.left + orb.width)));
          const insetBottom = Math.max(0, Math.round(sTop + sHeight - (orb.top + orb.height)));
          const insetLeft = Math.max(0, Math.round(orb.left - sLeft));
          const orbClip = `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px round ${Math.round(
            orb.radius
          )}px)`;
          const sheetClip = 'inset(0px 0px 0px 0px round 28px)';
          usedOrbMorphRef.current = { orbClip, sheetClip };
          dialog.setAttribute('data-orb-morph', 'true');

          animateSpringTransform(
            dialog,
            'translate3d(0px, 12px, 0) scale(0.96, 0.96)',
            'translate3d(0px, 0px, 0) scale(1, 1)',
            springs.sheet,
            {
              fromClipPath: orbClip,
              toClipPath: sheetClip,
              root: dialog,
            }
          );

          if (bodyRef.current) {
            runInterruptibleAnimation(
              bodyRef.current,
              [{ opacity: 0 }, { opacity: 1 }],
              {
                durationMs: tweens.fast,
                delayMs: 80,
                easing: easings.out,
                root: dialog,
                willChange: 'opacity',
              }
            );
          }
          return;
        }
      }

      usedOrbMorphRef.current = null;
      dialog.removeAttribute('data-orb-morph');
      animateSpringTransform(
        dialog,
        'translate3d(0px, 100%, 0)',
        'translate3d(0px, 0%, 0)',
        springs.sheet,
        {
          fromOpacity: reduced ? 0 : 1,
          toOpacity: 1,
          root: dialog,
        }
      );
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setClosing(true);
      if (scrim) {
        runInterruptibleAnimation(scrim, [{ opacity: 1 }, { opacity: 0 }], {
          durationMs: reduced ? tweens.reduced : tweens.base,
          easing: easings.out,
          root: dialog,
          willChange: 'opacity',
        });
      }

      if (usedOrbMorphRef.current && !reduced) {
        const { orbClip, sheetClip } = usedOrbMorphRef.current;
        animateSpringTransform(
          dialog,
          'translate3d(0px, 0px, 0) scale(1, 1)',
          'translate3d(0px, 12px, 0) scale(0.96, 0.96)',
          springs.sheet,
          {
            fromClipPath: sheetClip,
            toClipPath: orbClip,
            fromOpacity: 1,
            toOpacity: 0,
            root: dialog,
            onFinish: () => setClosing(false),
          }
        );
      } else {
        animateSpringTransform(
          dialog,
          'translate3d(0px, 0%, 0)',
          'translate3d(0px, 100%, 0)',
          springs.sheet,
          {
            fromOpacity: 1,
            toOpacity: reduced ? 0 : 1,
            root: dialog,
            onFinish: () => setClosing(false),
          }
        );
      }
    }
  }, [isOpen, transitionName]);

  const requestClose = () => {
    if (isDirty) {
      setShowDirtyConfirm(true);
    } else {
      onClose();
    }
  };

  useOverlayRegistration(isOpen, () => {
    if (isDirty) {
      setShowDirtyConfirm(false);
    }
    onClose();
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('[role=dialog]')).at(-1) !== dialogRef.current)
        return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (showDirtyConfirm) {
          setShowDirtyConfirm(false);
        } else if (isDirty) {
          setShowDirtyConfirm(true);
        } else {
          onClose();
        }
      } else if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => element.getClientRects().length > 0);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, showDirtyConfirm, onClose]);

  if (!isOpen && !isClosing) return null;

  const beginDrag = (clientY: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    dragStateRef.current = {
      startY: clientY,
      lastY: clientY,
      lastT: now,
      velocity: 0,
      active: true,
    };
    dialogRef.current?.setAttribute('data-dragging', 'true');
  };

  const moveDrag = (clientY: number) => {
    const state = dragStateRef.current;
    const dialog = dialogRef.current;
    if (!state || !state.active || !dialog) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(1, now - state.lastT);
    state.velocity = (clientY - state.lastY) / dt;
    state.lastY = clientY;
    state.lastT = now;

    const deltaY = clientY - state.startY;
    const offsetY = deltaY < 0 ? deltaY * 0.25 : deltaY;
    if (!isReducedMotion()) {
      dialog.style.willChange = 'transform';
      dialog.style.transform = `translate3d(0px, ${Math.round(offsetY)}px, 0)`;
    }
    if (scrimRef.current && deltaY > 0) {
      const h = dialog.getBoundingClientRect().height || 400;
      const ratio = Math.min(1, deltaY / h);
      scrimRef.current.style.opacity = String(Math.max(0.2, 1 - ratio * 0.7));
    }
  };

  const endDrag = (clientY: number) => {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    const dialog = dialogRef.current;
    if (!state || !state.active) return;

    const deltaY = clientY - state.startY;
    const velocity = state.velocity;
    const sheetHeight = dialog?.getBoundingClientRect().height || 400;

    if (dialog) {
      dialog.removeAttribute('data-dragging');
      dialog.style.willChange = '';
    }
    if (scrimRef.current) {
      scrimRef.current.style.opacity = '';
    }

    if (velocity > 0.5 || deltaY > sheetHeight * 0.3) {
      if (dialog) {
        dialog.style.transform = '';
      }
      requestClose();
    } else if (dialog) {
      const fromOffset = Math.round(deltaY < 0 ? deltaY * 0.25 : deltaY);
      dialog.style.transform = '';
      if (Math.abs(fromOffset) > 1) {
        animateSpringTransform(
          dialog,
          `translate3d(0px, ${fromOffset}px, 0)`,
          'translate3d(0px, 0px, 0)',
          springs.sheet,
          { root: dialog }
        );
      }
    }
  };

  const isKeyboardOpen = viewport.bottom > 40;
  const sheetBottomOffset = isKeyboardOpen
    ? `${viewport.bottom}px`
    : 'calc(var(--dock-height, 118px) + env(safe-area-inset-bottom, 0px) + 8px)';

  const modalContent = (
    <div
      ref={scrimRef}
      data-ui="sheet-scrim"
      data-closing={!isOpen ? 'true' : undefined}
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center px-3"
      style={{
        backgroundColor: 'rgba(16, 16, 20, 0.24)',
        bottom: isKeyboardOpen ? `${viewport.bottom}px` : 0,
        paddingBottom: isKeyboardOpen ? 0 : sheetBottomOffset,
        pointerEvents: isOpen ? undefined : 'none',
      }}
      onMouseDown={(e) => {
        if (isOpen && e.target === e.currentTarget) {
          requestClose();
        }
      }}
      onClick={(e) => {
        if (isOpen && e.target === e.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        data-quick-add={quickAdd || undefined}
        data-ui="sheet"
        data-motion="idle"
        data-closing={!isOpen ? 'true' : undefined}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
        aria-hidden={!isOpen ? 'true' : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ui-sheet planui-floating-capsule w-full sm:max-w-[540px] max-h-[82dvh] flex flex-col rounded-3xl overflow-hidden planui-transition-modal"
        style={{
          viewTransitionName: transitionName,
          maxHeight: viewport.height
            ? isKeyboardOpen
              ? viewport.height - 16
              : Math.max(260, viewport.height - 142)
            : undefined,
          backgroundColor: 'var(--glass-sheet-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          pointerEvents: isOpen ? undefined : 'none',
        }}
      >
        <div
          className="quick-grabber"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientY)}
          onTouchEnd={(e) => endDrag(e.changedTouches[0].clientY)}
          onPointerDown={(e) => {
            beginDrag(e.clientY);
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => moveDrag(e.clientY)}
          onPointerUp={(e) => endDrag(e.clientY)}
          onPointerCancel={(e) => endDrag(e.clientY)}
        >
          <i />
        </div>
        <header
          ref={headerRef}
          className="ui-sheet-header flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
          onTouchStart={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            beginDrag(e.touches[0].clientY);
          }}
          onTouchMove={(e) => moveDrag(e.touches[0].clientY)}
          onTouchEnd={(e) => endDrag(e.changedTouches[0].clientY)}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            beginDrag(e.clientY);
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => moveDrag(e.clientY)}
          onPointerUp={(e) => endDrag(e.clientY)}
          onPointerCancel={(e) => endDrag(e.clientY)}
        >
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[1.1875rem] font-semibold m-0 leading-snug truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-[0.875rem] m-0 mt-0.5 truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label={UK_STRINGS.app.closeButton}
            data-testid="modal-close-button"
            className="ui-round ui-pressable planui-floating-capsule shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div
          ref={bodyRef}
          className="ui-sheet-body p-5 overflow-y-auto space-y-4"
          onTouchStart={(e) => {
            if ((bodyRef.current?.scrollTop ?? 0) <= 0) {
              dragStateRef.current = {
                startY: e.touches[0].clientY,
                lastY: e.touches[0].clientY,
                lastT: typeof performance !== 'undefined' ? performance.now() : Date.now(),
                velocity: 0,
                active: false,
              };
            }
          }}
          onTouchMove={(e) => {
            const state = dragStateRef.current;
            if (!state) return;
            const dy = e.touches[0].clientY - state.startY;
            if (!state.active) {
              if (dy > 6 && (bodyRef.current?.scrollTop ?? 0) <= 0) {
                state.active = true;
                dialogRef.current?.setAttribute('data-dragging', 'true');
              } else if (dy < -4 || (bodyRef.current?.scrollTop ?? 0) > 0) {
                dragStateRef.current = null;
                return;
              }
            }
            if (state.active) {
              moveDrag(e.touches[0].clientY);
            }
          }}
          onTouchEnd={(e) => {
            if (dragStateRef.current?.active) {
              endDrag(e.changedTouches[0].clientY);
            } else {
              dragStateRef.current = null;
            }
          }}
        >
          {children}
        </div>
        {footer && <footer className="ui-sheet-footer">{footer}</footer>}

        {showDirtyConfirm && (
          <div
            role="alertdialog"
            aria-label={UK_STRINGS.creation.dirtyConfirm.title}
            className="px-5 py-4 border-t space-y-3 shrink-0"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
            }}
            data-testid="dirty-confirm-banner"
          >
            <div className="space-y-1">
              <p
                className="text-[0.9375rem] font-semibold m-0"
                style={{ color: 'var(--text-primary)' }}
              >
                {UK_STRINGS.creation.dirtyConfirm.title}
              </p>
              <p
                className="text-[0.875rem] m-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.creation.dirtyConfirm.message}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDirtyConfirm(false)}
                data-testid="dirty-keep-editing"
              >
                {UK_STRINGS.creation.dirtyConfirm.keepEditing}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setShowDirtyConfirm(false);
                  onClose();
                }}
                data-testid="dirty-discard-changes"
              >
                {UK_STRINGS.creation.dirtyConfirm.discardChanges}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
