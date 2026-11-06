import {animate, cancelMotion, reducedMotion, springFrames, useReducedMotion} from './motion';
import {useLayoutEffect} from 'react';
import {creationOrigin} from '../components/shell/creationTransition';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle2, Info } from './icons';
import { UK_STRINGS } from '../i18n/uk';
import { DateField, PillRow, Segmented, SelectField, TimeField } from './contract';

export { SelectField };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger' | 'tertiary' | 'destructive';
  size?: 'md' | 'sm' | 'icon';
  fullWidth?: boolean;
  busy?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  busy = false,
  className = '',
  children,
  ...props
}) => {
  const dismissLabel = typeof children === 'string' && ['Закрити','Скасувати'].includes(children.trim()) ? children.trim() : undefined;
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl planui-transition-micro select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const sizeClasses =
    size === 'icon'
      ? 'min-w-[44px] min-h-[44px] p-2.5'
      : size === 'sm'
      ? 'min-h-[40px] px-3.5 py-2 text-[0.9375rem]'
      : 'min-h-[44px] px-4 py-2.5 text-[1rem]';

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          backgroundColor: 'var(--color-brand)',
          color: 'var(--btn-primary-fg)',
          border: '1px solid transparent',
        }
      : (variant === 'danger' || variant === 'destructive')
      ? {
          backgroundColor: 'var(--color-brand-tint)',
          color: 'var(--color-brand-text)',
          border: '1px solid var(--border-subtle)',
        }
      : (variant === 'subtle' || variant === 'tertiary')
      ? {
          backgroundColor: 'transparent',
          color: 'var(--text-primary)',
          border: '1px solid transparent',
        }
      : {
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
        };

  return (
    <button
      type="button"
      aria-label={dismissLabel}
      aria-busy={busy || undefined}
      data-variant={variant}
      className={`ui-button ${baseClasses} ${sizeClasses} ${fullWidth ? 'w-full' : ''} active:scale-[0.98] ${className}`}
      style={variantStyle}
      {...props}
      disabled={busy || props.disabled}
    >
      {busy ? 'Зачекайте…' : dismissLabel ? <X/> : children}
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
  contract = false,
  isDirty = false,
  footer,
  onClose,
  children,
}) => {
  const [viewport, setViewport] = useState({ height: 0, bottom: 0 });
  const reduced=useReducedMotion();
  const [present,setPresent]=useState(isOpen);
  const scrimRef=useRef<HTMLDivElement>(null);
  const drag=useRef<{y:number;last:number;time:number;velocity:number;height:number;offset:number}|null>(null);
  const origin=useRef<DOMRect|null>(null);
  useLayoutEffect(()=>{if(isOpen&&!present){setPresent(true);return;}const el=dialogRef.current;if(!el)return;
    const box=el.getBoundingClientRect();
    if(isOpen)origin.current=transitionName?creationOrigin:null;
    const orb=origin.current;
    const orbTransform=orb?`translate(${orb.left-box.left}px,${orb.top-box.top}px) scale(${orb.width/box.width},${orb.height/box.height})`:'translateY(100%)';
    const start=isOpen?orbTransform:(getComputedStyle(el).transform==='none'?'translateY(0px)':getComputedStyle(el).transform);
    const end=isOpen?'translateY(0px)':orbTransform;
    const frames=orb?[{transform:start,clipPath:isOpen?'inset(0 round 50%)':'inset(0 round 28px)'},{transform:end,clipPath:isOpen?'inset(0 round 28px)':'inset(0 round 50%)'}]:isOpen?springFrames(100,0,'sheet','transform',n=>`translateY(${n}%)`):[{transform:start},{transform:end}];
    void animate(el,frames,{duration:isOpen?600:360}).then(()=>{if(!isOpen)setPresent(false);});
    void animate(scrimRef.current,[{opacity:isOpen?0:1},{opacity:isOpen?1:0}],{duration:220});
    if(isOpen)void animate(el.querySelector('.ui-sheet-body'),[{opacity:0},{opacity:1}],{duration:140,delay:80});
    const background=document.querySelector<HTMLElement>('[data-testid=shell-background-root]');
    if(background){background.style.transform=isOpen&&!reduced?'scale(.97)':'';background.style.opacity=isOpen?'.75':'1';void animate(background,[{transform:reduced?'none':isOpen?'scale(1)':'scale(.97)',opacity:isOpen?1:.75},{transform:reduced?'none':isOpen?'scale(.97)':'scale(1)',opacity:isOpen?.75:1}],{duration:360});}
  },[isOpen,present,reduced]);
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const v = window.visualViewport;
      if (v) {
        setViewport({
          height: v.height,
          bottom: Math.max(0, window.innerHeight - v.height - v.offsetTop),
        });
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
  const dialogRef = useRef<HTMLDivElement>(null);
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

  const requestClose = () => {
    if (isDirty) {
      setShowDirtyConfirm(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('[role=dialog]')).at(-1) !== dialogRef.current) return;
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

  if (!isOpen && !present) return null;

  const beginDrag=(y:number,target:EventTarget|null)=>{
    const el=dialogRef.current;if(!el||!isOpen||reduced)return false;
    const element=target as Element;if(element.closest('button,input,textarea,select,a'))return false;
    const body=element.closest('.ui-sheet-body');if(body&&body.scrollTop>0)return false;
    cancelMotion(el);drag.current={y,last:y,time:performance.now(),velocity:0,height:el.getBoundingClientRect().height,offset:0};el.dataset.motion='running';el.style.willChange='transform';return true;
  };
  const moveDrag=(y:number)=>{const d=drag.current,el=dialogRef.current;if(!d||!el)return;const now=performance.now();d.velocity=(y-d.last)/Math.max(1,now-d.time);d.last=y;d.time=now;const delta=y-d.y;d.offset=delta<0?-Math.sqrt(-delta)*3:delta;el.style.transform=`translateY(${d.offset}px)`;};
  const endDrag=()=>{const d=drag.current,el=dialogRef.current;if(!d||!el)return;drag.current=null;if(d.offset>d.height*.3||(d.offset>0&&d.velocity>.5)){requestClose();}el.style.transform='';void animate(el,springFrames(d.offset,0,'sheet'),{duration:600});};

  const modalContent = (
    <div
      ref={scrimRef} data-motion="idle"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        bottom: viewport.bottom,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        data-motion="idle"
        onPointerDown={e=>{if(e.pointerType!=='touch'&&beginDrag(e.clientY,e.target))e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(e.pointerType!=='touch')moveDrag(e.clientY);}}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onTouchStart={e=>{beginDrag(e.touches[0].clientY,e.target);}}
        onTouchMove={e=>{if(drag.current){if(e.cancelable)e.preventDefault();moveDrag(e.touches[0].clientY);}}}
        onTouchEnd={endDrag} onTouchCancel={endDrag}
        data-quick-add={quickAdd || undefined}
        data-ui="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="planui-floating-capsule w-full sm:max-w-[540px] max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden planui-transition-modal"
        style={{
          viewTransitionName: transitionName,
          maxHeight: viewport.height ? viewport.height * 0.92 : undefined,
          backgroundColor: 'var(--sheet-bg)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        <div
          className="quick-grabber"
        >
          <i />
        </div>
        <header
          className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2
              id={titleId}
              className="text-[1.1875rem] font-semibold m-0 leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-[0.875rem] m-0 mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={requestClose}
            aria-label={UK_STRINGS.app.closeButton}
            data-testid="modal-close-button"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            
          </Button>
        </header>

        <div className="ui-sheet-body p-5 overflow-y-auto space-y-4">{children}</div>
        {footer&&<footer className="ui-sheet-footer">{footer}</footer>}

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
