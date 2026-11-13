import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UK_STRINGS } from '../i18n/uk';
import { Button } from './buttons';
import { DateField, TimeField } from './fields';
import { AlertCircle, CheckCircle2, Info, X } from './icons';
import { animateSpringTransform, easings, ensureMotionRootAttribute, getCapturedOrbRect, isReducedMotion, runInterruptibleAnimation, springs, tweens, wasRecentPopState } from './motion';

import { getViewportLayerRoot, useOverlayRegistration } from './overlayStack';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  {
    label,
    hint,
    error,
    id,
    className = '',
    type = 'text',
    ...props
  },
  forwardedRef
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  if (type === 'date' || type === 'time') {
    const Field = type === 'date' ? DateField : TimeField;
    return <Field {...props} id={inputId} label={label} value={String(props.value ?? '')} />;
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      {label && (
        <label
          htmlFor={inputId}
          className="ui-field-label px-1"
        >
          {label}
        </label>
      )}
      <input
        ref={forwardedRef}
        id={inputId}
        type={type}
        data-ui="input-field"
        className={`ui-input-field ${error ? 'is-error' : ''}`.trim()}
        aria-invalid={error ? 'true' : undefined}
        {...props}
      />
      {hint && !error && (
        <span className="ui-meta px-1">
          {hint}
        </span>
      )}
      {error && (
        <span
          role="alert"
          className="ui-meta font-bold flex items-center gap-1.5 px-1 text-[var(--accent-danger)]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
});

export interface TextAreaFieldProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField(
    {
      label,
      hint,
      id,
      className = '',
      rows = 3,
      ...props
    },
    forwardedRef
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;

    return (
      <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
        {label && (
          <label
            htmlFor={fieldId}
            className="ui-field-label px-1"
          >
            {label}
          </label>
        )}
        <textarea
          ref={forwardedRef}
          id={fieldId}
          rows={rows}
          data-ui="textarea-field"
          className="ui-textarea-field resize-y"
          {...props}
        />
        {hint && (
          <span className="ui-meta px-1">
            {hint}
          </span>
        )}
      </div>
    );
  }
);

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
    document.getElementById('planui-main-content') ??
    document.querySelector<HTMLElement>('.planui-main-canvas');
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
  title: React.ReactNode;
  subtitle?: string;
  transitionName?: string;
  quickAdd?: boolean;
  morphFromRect?: { left: number; top: number; width: number; height: number; right?: number; bottom?: number } | null;
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
  morphFromRect = null,
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
    if (!isOpen || typeof window === 'undefined' || typeof document === 'undefined') return;
    const root = document.documentElement;
    const isInputFocused = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return false;
      if (active.tagName === 'TEXTAREA' || active.isContentEditable) return true;
      if (active.tagName === 'INPUT') {
        const t = ((active as HTMLInputElement).type || 'text').toLowerCase();
        return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(t);
      }
      return false;
    };
    const update = () => {
      const v = window.visualViewport;
      const innerH = window.innerHeight;
      if (v) {
        const nextHeight = Math.round(v.height);
        const nextTop = Math.round(v.offsetTop);
        const nextBottom = Math.max(0, Math.round(innerH - v.height - v.offsetTop));
        root.style.setProperty('--vvh', `${nextHeight}px`);
        root.style.setProperty('--vvt', `${nextTop}px`);
        const kbOpen = v.height < innerH - 120 && isInputFocused();
        if (kbOpen) {
          root.setAttribute('data-keyboard-open', 'true');
          root.style.setProperty('--kb-offset', `${nextBottom}px`);
          root.style.setProperty('--vv-height', `${nextHeight}px`);
        } else {
          root.removeAttribute('data-keyboard-open');
          root.style.setProperty('--kb-offset', '0px');
          root.style.removeProperty('--vv-height');
        }
        setViewport((prev) =>
          prev.height === nextHeight && prev.bottom === (kbOpen ? nextBottom : 0)
            ? prev
            : { height: nextHeight, bottom: kbOpen ? nextBottom : 0 }
        );
      }
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      if (activeOpenSheetCount === 0) {
        root.removeAttribute('data-keyboard-open');
        root.style.setProperty('--kb-offset', '0px');
        root.style.removeProperty('--vv-height');
      }
    };
  }, [isOpen, quickAdd]);

  const titleId = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);

  const restoreFocus = () => {
    const prior = previousFocusRef.current;
    const el = prior && document.contains(prior) ? prior : document.querySelector<HTMLElement>('[data-ui="create-orb"]');
    if (el && typeof document !== 'undefined' && document.contains(el)) {
      try {
        el.focus({ preventScroll: true });
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
        const explicitInput =
          root.querySelector<HTMLElement>('[data-testid="create-task-title-input"]') ??
          root.querySelector<HTMLElement>(
            'input[autofocus]:not([disabled]), textarea[autofocus]:not([disabled]), input[type="text"]:not([disabled]):not([data-ui="native-overlay"]), textarea:not([disabled])'
          );
        if (explicitInput) {
          explicitInput.focus({ preventScroll: true });
        } else {
          root.focus({ preventScroll: true });
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

      if (morphFromRect) {
        usedOrbMorphRef.current = null;
        dialog.removeAttribute('data-orb-morph');
        if (reduced) {
          runInterruptibleAnimation(dialog, [{ opacity: 0 }, { opacity: 1 }], {
            durationMs: tweens.reduced,
            easing: easings.out,
            root: dialog,
            willChange: 'opacity',
          });
          return;
        }
        const sRect = dialog.getBoundingClientRect();
        if (sRect.width > 0 && sRect.height > 0 && morphFromRect.width > 0 && morphFromRect.height > 0) {
          const fromRight = morphFromRect.right ?? morphFromRect.left + morphFromRect.width;
          const fromBottom = morphFromRect.bottom ?? morphFromRect.top + morphFromRect.height;
          const dx = Math.round(fromRight - sRect.right);
          const dy = Math.round(fromBottom - sRect.bottom);
          const sx = Math.max(0.25, Math.min(1.5, morphFromRect.width / sRect.width));
          const sy = Math.max(0.25, Math.min(1.5, morphFromRect.height / sRect.height));
          dialog.style.transformOrigin = 'bottom right';
          runInterruptibleAnimation(
            dialog,
            [
              {
                opacity: 0.92,
                transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
              },
              {
                opacity: 1,
                transform: 'translate3d(0px, 0px, 0) scale(1, 1)',
              },
            ],
            {
              durationMs: 280,
              easing: easings.emphasized,
              root: dialog,
              willChange: 'transform, opacity',
              onFinish: () => {
                dialog.style.transformOrigin = '';
              },
            }
          );
          return;
        }
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
          const sheetClip = 'inset(0px 0px 0px 0px round 32px)';
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
      if (wasRecentPopState()) {
        setClosing(false);
        return;
      }
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
        if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus({ preventScroll: true });
          return;
        }
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

  const cancelDrag = () => {
    dragStateRef.current = null;
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.removeAttribute('data-dragging');
      dialog.style.transform = '';
      dialog.style.willChange = '';
    }
    if (scrimRef.current) scrimRef.current.style.opacity = '';
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

  const isKeyboardOpen = viewport.bottom > 60;

  const modalContent = (
    <div
      ref={scrimRef}
      data-ui="sheet-scrim"
      data-keyboard-open={isKeyboardOpen ? 'true' : undefined}
      data-closing={!isOpen ? 'true' : undefined}
      className="ui-sheet-scrim"
      style={{
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
        data-quick-add={quickAdd ? 'true' : undefined}
        data-keyboard-open={isKeyboardOpen ? 'true' : undefined}
        data-ui="sheet"
        data-motion="idle"
        data-closing={!isOpen ? 'true' : undefined}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
        aria-hidden={!isOpen ? 'true' : undefined}
        aria-labelledby={quickAdd || typeof title !== 'string' ? undefined : titleId}
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className="ui-sheet planui-floating-capsule planui-transition-modal"
        style={{
          viewTransitionName: transitionName,
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
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onTouchCancel={cancelDrag}
        >
          <i />
        </div>
        <header
          ref={headerRef}
          className="ui-sheet-header"
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
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onTouchCancel={cancelDrag}
        >
          <div className="min-w-0 flex-1">
            {quickAdd ? (
              typeof title !== 'string' ? (
                title
              ) : null
            ) : typeof title !== 'string' && React.isValidElement(title) ? (
              title
            ) : (
              <>
                <h2
                  id={titleId}
                  className="ui-sheet-title truncate"
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
              </>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label={UK_STRINGS.app.closeButton}
            data-testid="modal-close-button"
            className="sheet-close-btn ui-sheet-close ui-pressable shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div
          ref={bodyRef}
          className="ui-sheet-body"
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
    ? createPortal(modalContent, getViewportLayerRoot())
    : modalContent;
};
