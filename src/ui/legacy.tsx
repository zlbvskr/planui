import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { UK_STRINGS } from '../i18n/uk';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger';
  size?: 'md' | 'sm' | 'icon';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl planui-transition-micro select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const sizeClasses =
    size === 'icon'
      ? 'min-w-[44px] min-h-[44px] p-2.5'
      : size === 'sm'
      ? 'min-h-[40px] px-3.5 py-2 text-[15px]'
      : 'min-h-[44px] px-4 py-2.5 text-[16px]';

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          backgroundColor: 'var(--color-brand)',
          color: '#FFFFFF',
          border: '1px solid transparent',
        }
      : variant === 'danger'
      ? {
          backgroundColor: 'var(--color-brand-tint)',
          color: 'var(--color-brand-text)',
          border: '1px solid var(--border-subtle)',
        }
      : variant === 'subtle'
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

  const isDarkPrimary = variant === 'primary';

  return (
    <button
      type="button"
      className={`${baseClasses} ${sizeClasses} ${fullWidth ? 'w-full' : ''} ${
        isDarkPrimary ? 'dark:!text-[#111214]' : ''
      } active:scale-[0.98] ${className}`}
      style={variantStyle}
      {...props}
    >
      {children}
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
  ...props
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={inputId}
        className="text-[15px] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      <input
        id={inputId}
        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-[16px] planui-transition-micro"
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
        <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          role="alert"
          className="text-[13px] font-medium flex items-center gap-1.5"
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
        className="text-[15px] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        className="w-full px-3.5 py-2.5 rounded-xl text-[16px] planui-transition-micro resize-y"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
        }}
        {...props}
      />
      {hint && (
        <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      )}
    </div>
  );
};

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly SelectFieldOption[];
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
  id,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={selectId}
        className="text-[15px] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      <select
        id={selectId}
        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-[16px] planui-transition-micro"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center p-1 rounded-xl gap-1 w-full sm:w-auto"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 py-1.5 rounded-lg text-[15px] font-medium planui-transition-micro cursor-pointer"
            style={{
              backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: active ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface CardProps {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  headerRight,
  children,
  className = '',
  'data-testid': dataTestId,
}) => {
  return (
    <section
      data-ui="group"
      data-testid={dataTestId}
      className={`rounded-3xl p-4 sm:p-6 ${className}`}
      style={{
        backgroundColor: 'var(--surface-card-elevated)',
        boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {(title || subtitle || headerRight) && (
        <header className="flex flex-wrap items-start justify-between gap-2.5 mb-3">
          <div className="min-w-[180px] flex-1">
            {title && (
              <h2
                className="text-[17px] font-semibold leading-snug m-0"
                style={{ color: 'var(--text-primary)' }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className="text-[14px] mt-0.5 mb-0 leading-normal"
                style={{ color: 'var(--text-secondary)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </header>
      )}
      {children}
    </section>
  );
};

export interface EmptyStateCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      className="rounded-2xl p-6 text-left flex flex-col items-start gap-3"
      style={{
        backgroundColor: 'var(--surface-card-elevated)',
        boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {icon && (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-[60ch]">
        <h3
          className="text-[17px] font-semibold m-0"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
        <p
          className="text-[15px] m-0 leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <div className="pt-1">
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

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
      className="rounded-xl px-4 py-3 border flex items-start justify-between gap-3 text-[15px]"
      style={toneStyles}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="leading-snug">{message}</span>
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

export interface ProgressBarProps {
  label: string;
  completedCount: number;
  totalCount: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  label,
  completedCount,
  totalCount,
}) => {
  const ratio = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;
  return (
    <div
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        <span>{label}</span>
        <span>
          {completedCount} / {totalCount}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={completedCount}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, totalCount)}
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
      >
        <div
          className="h-full rounded-full planui-transition-small"
          style={{
            width: `${ratio}%`,
            backgroundColor: 'var(--color-dayoff)',
          }}
        />
      </div>
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
  onClose,
  children,
}) => {
  const [viewport, setViewport] = useState({height: 0, bottom: 0});
  const dragStart = useRef<number | null>(null);
  useEffect(() => {
    if (!isOpen || !quickAdd) return;
    const update = () => { const v=window.visualViewport; if(v)setViewport({height:v.height,bottom:Math.max(0,window.innerHeight-v.height-v.offsetTop)}); };
    update(); window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
    return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};
  }, [isOpen,quickAdd]);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowDirtyConfirm(false);
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const timer = window.setTimeout(() => {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = root.querySelector<HTMLElement>('[data-testid="create-task-title-input"]') ?? root.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
        );
        if (focusable) {
          focusable.focus();
        } else {
          root.focus();
        }
      }, 20);
      return () => window.clearTimeout(timer);
    } else if (previousFocusRef.current) {
      try {
        previousFocusRef.current.focus();
      } catch {
        // Ignore
      }
      previousFocusRef.current = null;
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
      if (Array.from(document.querySelectorAll('[role=dialog]')).at(-1)!==dialogRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
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
        ).filter(element => element.getClientRects().length > 0);
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

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.48)', bottom: quickAdd ? viewport.bottom : undefined }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        data-quick-add={quickAdd || undefined}
        data-ui={contract ? "sheet" : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="planui-floating-capsule w-full sm:max-w-[540px] max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden planui-transition-modal"
        style={{
          viewTransitionName: transitionName,
          maxHeight: quickAdd && viewport.height ? viewport.height * .92 : undefined,
          backgroundColor: 'var(--glass-bg)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        {quickAdd && <div className="quick-grabber" onTouchStart={e=>{dragStart.current=e.touches[0].clientY;}} onTouchEnd={e=>{if(dragStart.current!==null&&e.changedTouches[0].clientY-dragStart.current>60)requestClose();dragStart.current=null;}}><i /></div>}
        <header
          className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2
              id={titleId}
              className="text-[19px] font-semibold m-0 leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-[14px] m-0 mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={requestClose}
            aria-label={UK_STRINGS.app.closeButton}
            data-testid="modal-close-button"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>{UK_STRINGS.app.closeButton}</span>
          </Button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4">{children}</div>

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
                className="text-[15px] font-semibold m-0"
                style={{ color: 'var(--text-primary)' }}
              >
                {UK_STRINGS.creation.dirtyConfirm.title}
              </p>
              <p
                className="text-[14px] m-0"
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
