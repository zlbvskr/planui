import { Icon } from './icons';
import { formatSubtitle } from '../lib/format';
import React from 'react';
import { usePressFeedback, useSelectionThumb } from './motion';
import { useOverlayRegistration } from './overlayStack';

export function Pill({
  selected = false,
  className = '',
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  const press = usePressFeedback<HTMLButtonElement>(!props.disabled);
  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
      {...props}
      aria-pressed={selected}
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
      className={`ui-pill ui-pressable ${className}`.trim()}
    />
  );
}

export type DayMarkerSpec =
  | 'night'
  | 'day'
  | 'day_off'
  | {
      shift?: 'night' | 'day';
      dayOff?: boolean;
      eventColors?: string[];
    };

export function WeekStrip({
  date,
  today,
  markers = {},
  onChange,
}: {
  date: string;
  today: string;
  markers?: Record<string, DayMarkerSpec>;
  onChange: (date: string) => void;
}) {
  const start = new Date(date + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const touch = React.useRef<number | null>(null);
  const { containerRef, thumbRef } = useSelectionThumb(date, {
    targetSelector: 'strong',
  });
  const move = (days: number) => {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    onChange(d.toISOString().slice(0, 10));
  };

  const getMarkerData = (val: string) => {
    const m = markers[val];
    if (!m) return null;
    if (typeof m === 'string') {
      if (m === 'night' || m === 'day') return { shift: m };
      if (m === 'day_off') return { dayOff: true };
      return null;
    }
    return m;
  };

  return (
    <div className="ui-week-wrapper" data-ui="week-strip-wrapper">
      <div className="ui-week-row" data-ui="week-strip">
        <button
          type="button"
          className="ui-round ui-week-nav ui-pressable planui-floating-capsule"
          aria-label="Попередній тиждень"
          data-testid="week-strip-prev"
          onClick={() => move(-7)}
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <div
          ref={containerRef as React.RefObject<HTMLDivElement>}
          data-motion="idle"
          className="ui-week"
          aria-label="Тиждень"
          onTouchStart={(e) => {
            touch.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touch.current !== null) {
              const delta = e.changedTouches[0].clientX - touch.current;
              if (Math.abs(delta) > 48) move(delta < 0 ? 7 : -7);
            }
            touch.current = null;
          }}
        >
          <span
            ref={thumbRef}
            aria-hidden="true"
            data-ui="selection-thumb"
            className="ui-selection-thumb ui-week-thumb"
          />
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((label, index) => {
            const d = new Date(start);
            d.setUTCDate(d.getUTCDate() + index);
            const value = d.toISOString().slice(0, 10);
            const m = getMarkerData(value);
            const hasShift = m?.shift;
            const hasDayOff = m?.dayOff;
            const eventDots = (m?.eventColors ?? []).slice(0, 2);

            return (
              <button
                type="button"
                key={value}
                aria-pressed={value === date}
                aria-current={value === today ? 'date' : undefined}
                aria-label={formatSubtitle(value)}
                onClick={() => onChange(value)}
              >
                <span>{label}</span>
                <strong>{d.getUTCDate()}</strong>
                <small
                  aria-label={
                    hasShift === 'night'
                      ? 'Нічна зміна'
                      : hasShift === 'day'
                      ? 'Денна зміна'
                      : hasDayOff
                      ? 'Вихідний день'
                      : eventDots.length > 0
                      ? 'Події'
                      : undefined
                  }
                  className="ui-week-markers-row"
                >
                  {hasShift ? (
                    <span
                      className="ui-week-shift-icon"
                      style={{
                        color:
                          hasShift === 'night'
                            ? 'var(--color-shift-night-start)'
                            : 'var(--color-shift-day-start)',
                      }}
                    >
                      <Icon
                        name={hasShift === 'night' ? 'moon' : 'sun'}
                        size={12}
                      />
                    </span>
                  ) : hasDayOff ? (
                    <span className="ui-week-dot-hatched" />
                  ) : null}
                  {eventDots.map((c, i) => (
                    <span
                      key={i}
                      className="ui-week-event-dot"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </small>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="ui-round ui-week-nav ui-pressable planui-floating-capsule"
          aria-label="Наступний тиждень"
          data-testid="week-strip-next"
          onClick={() => move(7)}
        >
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
      {date !== today && (
        <div className="ui-week-today-container">
          <button
            type="button"
            className="ui-week-today-pill ui-pressable"
            onClick={() => onChange(today)}
            aria-label="Повернутися до сьогодні"
            data-testid="week-strip-today-jump"
          >
            Сьогодні
          </button>
        </div>
      )}
    </div>
  );
}

export function PillMenu({
  label,
  options,
  value,
  onChange,
  disabled,
  ...props
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value?: string | number | readonly string[];
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  disabled?: boolean;
  [key: string]: unknown;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const id = React.useId();
  useOverlayRegistration(open, () => setOpen(false));
  return (
    <div
      className="ui-menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ui-pill ui-pressable"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        data-testid={props['data-testid'] as string | undefined}
      >
        {label}
        {value ? ` · ${options.find((o) => o.value === value)?.label ?? value}` : ''}
        <Icon name="chevron-down" size={16} />
      </button>
      {open && (
        <div id={id} className="ui-menu-options" role="group" aria-label={label}>
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              aria-pressed={o.value === value}
              onClick={() => {
                onChange?.({
                  target: { value: o.value },
                  currentTarget: { value: o.value },
                } as React.ChangeEvent<HTMLSelectElement>);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export {
  PageHeader,
  SubHeader,
  SubHeaderActions,
  Segmented,
  PillRow,
  RoundButton,
  Card,
  Section,
  Row,
  ItemCard,
  TintedCard,
  EventBar,
  Orb,
  Toggle,
  Slider,
  DateField,
  TimeField,
  SelectField,
  DurationField,
  ActionMenu,
  InfoSheet,
  Sheet,
  AlertSheet,
  EmptyState,
  Disclosure,
} from './contract';

export { Icon, type IconName } from './icons';

export { Toast, InlineBanner } from './feedback';

export {
  Button,
  type ButtonProps,
  InputField,
  type InputFieldProps,
  TextAreaField,
  type TextAreaFieldProps,
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentOption,
  FeedbackBanner,
  type FeedbackBannerProps,
  ModalSheet,
  type ModalSheetProps,
} from './legacy';

export { Dock, CalendarWindow, type DockProps, type CalendarWindowProps } from '../components/shell/FloatingShell';
export { onTabTap, isTabAtHome, type TabDestinationId } from '../state/shellStore';
export { QuickAddSheet, SharedEditorHost, type SharedEditorHostProps } from '../components/editors/SharedEditorHost';
export {
  TaskSheet,
  TaskPlanningSheet,
  SessionSheet,
  StageSheet,
  formatSessionSummaryUk,
  computeFreeWindowsForDay,
  type TaskSheetProps,
  type SessionSheetProps,
  type StageSheetProps,
} from '../components/today/TaskPlanningSheet';
