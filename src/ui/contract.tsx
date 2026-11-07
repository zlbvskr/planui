import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, ChevronLeft, ChevronRight, Info, MoreHorizontal, type IconName } from './icons';
import { ModalSheet, ModalSheetProps } from './legacy';
import { formatDate, formatDuration, formatTime } from '../lib/format';
import {
  animateSpringTransform,
  easings,
  ensureMotionRootAttribute,
  isReducedMotion,
  runInterruptibleAnimation,
  springs,
  tweens,
  useHeaderScrollCollapse,
  usePressFeedback,
  useSelectionThumb,
} from './motion';
import { useOverlayRegistration } from './overlayStack';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function moveGroupFocus<T extends string>(
  e: React.KeyboardEvent<HTMLElement>,
  options: readonly { value: T; label: string }[],
  onChange: (value: T) => void
) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const buttons = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  );
  if (!buttons.length) return;
  const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
  e.preventDefault();
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
      ? buttons.length - 1
      : (index + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
        buttons.length;
  buttons[next]?.focus();
  if (options[next]) onChange(options[next].value);
}

export function RoundButton({
  className = '',
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const press = usePressFeedback<HTMLButtonElement>(!props.disabled);
  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
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
      className={`ui-round ui-pressable planui-floating-capsule ${className}`.trim()}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { headerRef } = useHeaderScrollCollapse(64);

  return (
    <header
      ref={headerRef as React.RefObject<HTMLElement>}
      data-ui="page-header"
      data-compact="false"
      data-motion="idle"
    >
        <div className="ui-page-title">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="ui-header-actions">{actions}</div>
        </div>
      {children}
    </header>
  );
}

export function SubHeader({
  title,
  onBack,
  actions,
}: {
  title: string;
  onBack: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <header className="ui-sub-header" data-ui="sub-header">
      <RoundButton aria-label="Назад" onClick={onBack}>
        <ChevronLeft aria-hidden="true" size={20} />
      </RoundButton>
      <h1>{title}</h1>
      <div className="ui-header-actions" data-ui="subheader-actions">
        {actions}
      </div>
    </header>
  );
}

export function SubHeaderActions({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    setSlot(document.querySelector<HTMLElement>('[data-ui="subheader-actions"]'));
  }, []);

  if (slot) {
    return createPortal(children, slot);
  }
  return <div className="ui-header-actions">{children}</div>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  if (options.length > 4) throw new Error('Segmented supports at most four options');
  const { containerRef, thumbRef } = useSelectionThumb(value);
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      data-motion="idle"
      className="ui-segmented"
      role="group"
      aria-label={label}
      onKeyDown={(e) => moveGroupFocus(e, options, onChange)}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        data-ui="selection-thumb"
        className="ui-selection-thumb ui-segmented-thumb"
      />
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PillRowOptionButton({
  className = '',
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const press = usePressFeedback<HTMLButtonElement>(!props.disabled);
  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
      {...props}
      onClick={onClick}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      className={`ui-pill ui-pressable ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export function PillRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly {
    value: T;
    label: string;
    testId?: string;
    count?: number;
    isDefault?: boolean;
  }[];
  onChange: (v: T) => void;
}) {
  const { containerRef, thumbRef } = useSelectionThumb(value);
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      data-motion="idle"
      className="ui-pill-row"
      data-ui="pill-row"
      role="group"
      aria-label={label}
      onKeyDown={(e) => moveGroupFocus(e, options, onChange)}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        data-ui="selection-thumb"
        className="ui-selection-thumb ui-pill-thumb"
      />
      {options.map((o) => (
        <PillRowOptionButton
          key={o.value}
          data-testid={o.testId}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count && o.count > 0 && !o.isDefault && options[0] !== o ? (
            <small>{o.count}</small>
          ) : null}
        </PillRowOptionButton>
      ))}
    </div>
  );
}

export function Pill({
  selected,
  active,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  active?: boolean;
}) {
  const isPressed = selected ?? active ?? props['aria-pressed'];
  return (
    <PillRowOptionButton
      {...props}
      aria-pressed={isPressed}
      className={className}
    >
      {children}
    </PillRowOptionButton>
  );
}

export function Card({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ui="card"
      {...props}
      className={`ui-surface ui-card ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="ui-section ui-contract-section" aria-labelledby={title ? id : undefined}>
      {title && (
        <h2 id={id} className="ui-section-label">
          {title}
        </h2>
      )}
      <div className="ui-surface" data-ui="group">
        {children}
      </div>
    </section>
  );
}

type RowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title?: React.ReactNode;
  secondary?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  value?: string | null;
  chevron?: boolean;
};

export function Row({
  title,
  secondary,
  leading,
  trailing,
  value,
  chevron = false,
  children,
  className = '',
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: RowProps) {
  const press = usePressFeedback<HTMLDivElement>(true);
  return (
    <div
      ref={press.ref}
      data-motion="idle"
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
      className={`ui-row ui-pressable ${className}`.trim()}
      data-ui="row"
    >
      {leading && (
        <span className="ui-icon-tile" aria-hidden="true">
          {leading}
        </span>
      )}
      {title !== undefined ? (
        <div className="ui-row-text">
          <span>{title}</span>
          {secondary && <small>{secondary}</small>}
        </div>
      ) : (
        children
      )}
      {(trailing !== undefined || value !== undefined || chevron) && (
        <span className="ui-row-trailing">
          {trailing ??
            (value !== undefined ? (
              <span className={!value ? 'ui-unset' : undefined}>{value || 'Не заповнено'}</span>
            ) : null)}
          {chevron && <ChevronRight size={16} aria-hidden="true" />}
        </span>
      )}
    </div>
  );
}

export function ItemCard({
  hue = 'var(--color-personal)',
  className = '',
  style,
  height,
  title,
  meta,
  step,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & {
  hue?: string;
  height?: number;
  title?: string;
  meta?: string;
  step?: string;
}) {
  const press = usePressFeedback<HTMLElement>(true);
  return (
    <article
      ref={press.ref}
      data-motion="idle"
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
      data-ui="item-card"
      data-density={
        height === undefined ? undefined : height < 44 ? 'compact' : height <= 72 ? 'medium' : 'tall'
      }
      className={`ui-item-card ui-pressable ${className}`.trim()}
      style={{ '--item-hue': hue, ...style } as React.CSSProperties}
    >
      {title ? (
        <>
          <h3 data-user-content>
            {title}
            {height !== undefined && height < 44 && meta ? ` · ${meta}` : ''}
          </h3>
          {(height === undefined || height > 72) && step && <p>{step}</p>}
          {(height === undefined || height >= 44) && meta && (
            <span className="ui-item-meta">{meta}</span>
          )}
        </>
      ) : (
        children
      )}
    </article>
  );
}

export function TintedCard({
  color = 'var(--color-today)',
  hue,
  compact = false,
  icon,
  title,
  subtitle,
  meta,
  trailing,
  className = '',
  style,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & {
  color?: string;
  hue?: string;
  compact?: boolean;
  icon?: IconName | React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const press = usePressFeedback<HTMLElement>(true);
  const resolvedColor = hue ?? color;
  return (
    <article
      ref={press.ref}
      data-motion="idle"
      data-ui="tinted-card"
      data-compact={compact ? 'true' : undefined}
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
      className={`ui-tinted-card ui-pressable ${className}`.trim()}
      style={{ '--item-hue': resolvedColor, ...style } as React.CSSProperties}
    >
      {icon !== undefined && (
        <span className="ui-tinted-icon" aria-hidden="true">
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={18} /> : icon}
        </span>
      )}
      {title !== undefined ? (
        <div className="ui-tinted-body">
          <h3 data-user-content>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
          {meta && <span className="ui-item-meta">{meta}</span>}
        </div>
      ) : (
        children
      )}
      {trailing && <div className="ui-tinted-trailing">{trailing}</div>}
    </article>
  );
}

export function EventBar({
  color = 'var(--color-today)',
  colorEnd,
  icon,
  title,
  meta,
  status,
  lifted = false,
  className = '',
  style,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & {
  color?: string;
  colorEnd?: string;
  icon?: IconName | React.ReactNode;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  lifted?: boolean;
}) {
  const press = usePressFeedback<HTMLElement>(true);
  return (
    <article
      ref={press.ref}
      data-motion="idle"
      data-ui="event-bar"
      data-lifted={lifted ? 'true' : undefined}
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
      className={`ui-event-bar ui-pressable ${className}`.trim()}
      style={
        {
          '--event-color': color,
          ...(colorEnd ? { '--event-color-end': colorEnd } : {}),
          ...style,
        } as React.CSSProperties
      }
    >
      {icon !== undefined && (
        <span className="ui-event-bar-icon" aria-hidden="true">
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={18} /> : icon}
        </span>
      )}
      {title !== undefined ? (
        <div className="ui-event-bar-body">
          <h3 data-user-content>{title}</h3>
          {meta && <span className="ui-event-bar-meta">{meta}</span>}
        </div>
      ) : (
        children
      )}
      {status && <span className="ui-event-bar-status">{status}</span>}
    </article>
  );
}

export function Orb({
  color = 'var(--color-today)',
  size = 44,
  className = '',
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  color?: string;
  size?: number;
}) {
  return (
    <span
      data-ui="orb"
      aria-hidden={children ? undefined : 'true'}
      {...props}
      className={`ui-orb ${className}`.trim()}
      style={
        {
          '--c': color,
          '--orb-size': `${size}px`,
          width: `${size}px`,
          height: `${size}px`,
          ...style,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const prevCheckedRef = useRef(checked);

  useIsomorphicLayoutEffect(() => {
    const btn = buttonRef.current;
    const thumb = thumbRef.current;
    if (!btn || !thumb) return;
    ensureMotionRootAttribute(btn);
    if (prevCheckedRef.current === checked) return;
    prevCheckedRef.current = checked;

    const from = checked ? 'translate3d(0px, 0px, 0)' : 'translate3d(16px, 0px, 0)';
    const to = checked ? 'translate3d(16px, 0px, 0)' : 'translate3d(0px, 0px, 0)';
    animateSpringTransform(thumb, from, to, springs.press, { root: btn });
  }, [checked]);

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={testId}
      data-motion="idle"
      className="ui-toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span ref={thumbRef} aria-hidden="true" />
    </button>
  );
}

export function ActionMenu({
  label = 'Дії',
  items,
  children,
  testId,
}: {
  label?: string;
  items: readonly { label: string; onSelect: () => void; disabled?: boolean }[];
  children?: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useOverlayRegistration(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    const menu = ref.current?.querySelector<HTMLElement>('[role="menu"]');
    if (menu) {
      menu.showPopover?.();
      const box = trigger.current!.getBoundingClientRect();
      const size = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(16, Math.min(box.left, innerWidth - size.width - 16))}px`;
      menu.style.top = `${Math.max(16, Math.min(box.bottom + 8, innerHeight - size.height - 16))}px`;
      if (isReducedMotion()) {
        runInterruptibleAnimation(menu, [{ opacity: 0 }, { opacity: 1 }], {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: menu,
          willChange: 'opacity',
        });
      } else {
        runInterruptibleAnimation(
          menu,
          [
            { opacity: 0, transform: 'scale(0.95)' },
            { opacity: 1, transform: 'scale(1)' },
          ],
          {
            durationMs: tweens.fast,
            easing: easings.out,
            root: menu,
            willChange: 'transform, opacity',
          }
        );
      }
      menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    }
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="ui-action-menu" ref={ref}>
      <button
        type="button"
        data-testid={testId}
        className="ui-menu-trigger"
        ref={trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {children ?? <MoreHorizontal size={20} aria-hidden="true" />}
      </button>
      {open && (
        <div
          role="menu"
          popover="manual"
          aria-label={label}
          id={id}
          onKeyDown={(e) => {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
            );
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              const next =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                  ? buttons.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }
          }}
        >
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
                trigger.current?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Slider({
  label,
  value,
  min = 0,
  max = 10,
  step = 1,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const snapFromCenterRef = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!dragging || !bubbleRef.current) return;
    const bubble = bubbleRef.current;
    const root = rootRef.current;
    if (snapFromCenterRef.current !== null && !isReducedMotion()) {
      const dx = snapFromCenterRef.current;
      snapFromCenterRef.current = null;
      animateSpringTransform(
        bubble,
        `translate3d(${dx}px, 0px, 0) scale(0.92, 0.92)`,
        'translate3d(0px, 0px, 0) scale(1, 1)',
        springs.smooth,
        { fromOpacity: 0, toOpacity: 1, root }
      );
    } else {
      snapFromCenterRef.current = null;
      runInterruptibleAnimation(bubble, [{ opacity: 0 }, { opacity: 1 }], {
        durationMs: 120,
        easing: easings.out,
        root,
        willChange: 'opacity',
      });
    }
  }, [dragging]);

  return (
    <div
      ref={rootRef}
      data-motion="idle"
      className="ui-slider"
      data-dragging={dragging}
      data-unset={value === null}
      style={
        {
          '--slider-fill': value === null ? '0%' : `${((value - min) / (max - min)) * 100}%`,
        } as React.CSSProperties
      }
    >
      <div>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value ?? '-'}</output>
        <ActionMenu
          label={`Дії: ${label}`}
          items={[{ label: 'Скинути', onSelect: () => onChange(null) }]}
        />
      </div>
      <input
        id={id}
        aria-valuetext={value === null ? 'Не заповнено' : String(value)}
        className="planui-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? (min + max) / 2}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const nextVal = Math.max(
            min,
            Math.min(
              max,
              min + Math.round((((e.clientX - r.left) / r.width) * (max - min)) / step) * step
            )
          );
          if (value === null && r.width > 0) {
            const targetX = ((nextVal - min) / (max - min)) * r.width;
            const centerX = r.width * 0.5;
            snapFromCenterRef.current = centerX - targetX;
          }
          setDragging(true);
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onChange(nextVal);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      />
      {dragging && (
        <span
          ref={bubbleRef}
          className="ui-slider-bubble"
          style={{ left: value === null ? '50%' : `${((value - min) / (max - min)) * 100}%` }}
        >
          {value ?? '-'}
        </span>
      )}
    </div>
  );
}

export function Sheet({
  children,
  ...props
}: Omit<ModalSheetProps, 'quickAdd' | 'contract'>) {
  return (
    <ModalSheet {...props} quickAdd contract>
      {children}
    </ModalSheet>
  );
}

export function AlertSheet({
  title,
  description,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  destructive = false,
  isOpen,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Sheet
      title={title}
      subtitle={description}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        onConfirm ? (
          <div className="ui-alert-sheet-actions">
            <button
              type="button"
              className="ui-button"
              data-variant="secondary"
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={destructive ? 'ui-button' : 'ui-primary'}
              data-variant={destructive ? 'destructive' : 'primary'}
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        ) : undefined
      }
    >
      <div data-ui="alert-sheet">{children}</div>
    </Sheet>
  );
}

export function InfoSheet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RoundButton aria-label={`Інформація: ${title}`} onClick={() => setOpen(true)}>
        <Info size={20} aria-hidden="true" />
      </RoundButton>
      <Sheet title={title} isOpen={open} onClose={() => setOpen(false)}>
        <div data-ui="info-sheet">{children}</div>
      </Sheet>
    </>
  );
}

type NativeFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  label: string;
  value: string;
};

function NativeField({
  kind,
  label,
  value,
  onChange,
  ...props
}: NativeFieldProps & { kind: 'date' | 'time' }) {
  const id = useId();
  return (
    <div className="ui-native-field" role="group" aria-label={label}>
      <Row
        title={label}
        trailing={
          <>
            <span>
              {value ? (kind === 'date' ? formatDate(value) : formatTime(value)) : 'Не заповнено'}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </>
        }
      />
      <input
        {...props}
        id={props.id ?? id}
        type={kind}
        value={value}
        onChange={onChange}
        aria-label={label}
        data-ui="native-overlay"
      />
    </div>
  );
}

export function DateField(props: NativeFieldProps) {
  return <NativeField {...props} kind="date" />;
}

export function TimeField(props: NativeFieldProps) {
  return <NativeField {...props} kind="time" />;
}

export function SelectField({
  label,
  value,
  options,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  label: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="ui-native-field" role="group" aria-label={label}>
      <Row
        title={label}
        trailing={
          <>
            <span>{options.find((o) => o.value === value)?.label ?? 'Не заповнено'}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </>
        }
      />
      <select {...props} value={value} aria-label={label} data-ui="native-overlay">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DurationField({
  label = 'Тривалість',
  value,
  onChange,
  step = 15,
}: {
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? step);
  return (
    <>
      <button
        className="ui-disclosure"
        type="button"
        onClick={() => {
          setDraft(value ?? step);
          setOpen(true);
        }}
      >
        <Row
          title={label}
          trailing={
            <>
              <span>{value === null ? 'Не заповнено' : formatDuration(value)}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </>
          }
        />
      </button>
      <Sheet
        title={label}
        isOpen={open}
        onClose={() => setOpen(false)}
        footer={
          <button
            type="button"
            className="ui-primary"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Зберегти
          </button>
        }
      >
        <div className="ui-stepper">
          <button
            type="button"
            aria-label="Зменшити тривалість"
            disabled={draft <= step}
            onClick={() => setDraft(Math.max(step, draft - step))}
          >
            <Icon name="chevron-left" />
          </button>
          <output aria-live="polite">{formatDuration(draft)}</output>
          <button
            type="button"
            aria-label="Збільшити тривалість"
            onClick={() => setDraft(draft + step)}
          >
            <Icon name="plus" />
          </button>
        </div>
        <ActionMenu
          label="Дії тривалості"
          items={[
            {
              label: 'Скинути',
              onSelect: () => {
                onChange(null);
                setOpen(false);
              },
            },
          ]}
        />
      </Sheet>
    </>
  );
}

export function EmptyState({
  text,
  icon = 'sparkles',
  color = 'var(--color-today)',
  action,
  onAction,
  actionTestId,
  suggestions,
}: {
  text: string;
  icon?: IconName;
  color?: string;
  action?: string;
  onAction?: () => void;
  actionTestId?: string;
  suggestions?: readonly { label: string; onSelect: () => void; testId?: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    runInterruptibleAnimation(el, [{ opacity: 0 }, { opacity: 1 }], {
      durationMs: isReducedMotion() ? tweens.reduced : 160,
      easing: easings.out,
      root: el,
      willChange: 'opacity',
    });
  }, []);

  return (
    <div ref={ref} data-motion="idle" className="ui-empty" data-ui="empty-state">
      <Orb color={color} size={40} className="ui-icon-tile">
        <Icon name={icon} size={18} />
      </Orb>
      <span className="ui-empty-text">{text}</span>
      {action && (
        <button type="button" data-testid={actionTestId} onClick={onAction}>
          {action}
        </button>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="ui-pill-row" data-ui="empty-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className="ui-pill ui-pressable"
              data-testid={s.testId}
              onClick={s.onSelect}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Disclosure({
  title,
  secondary,
  onClick,
  testId,
}: {
  title: string;
  secondary?: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button type="button" data-testid={testId} className="ui-disclosure" onClick={onClick}>
      <Row
        title={title}
        secondary={secondary}
        trailing={<ChevronRight size={20} aria-hidden="true" />}
      />
    </button>
  );
}
