import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../ui/icons';
import { PrimaryDestinationId, UK_STRINGS } from '../../i18n/uk';
import {
  CalendarViewMode,
  DirectionsSubMode,
  MeSubViewMode,
  PRIMARY_NAV_ITEMS,
  TabDestinationId,
} from '../../state/shellStore';
import { TodayMode } from '../../domain/types';
import {
  AmbientCanvas,
  animateSpringTransform,
  captureOrbRect,
  easings,
  ensureMotionRootAttribute,
  isReducedMotion,
  runInterruptibleAnimation,
  springs,
  tweens,
  usePressFeedback,
  useSelectionThumb,
} from '../../ui/motion';
import {
  closeTopmostOverlay,
  getTopmostOverlayId,
  hasOpenOverlay,
  useOverlayRegistration,
} from '../../ui/overlayStack';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ContextualSegmentOption {
  value: string;
  label: string;
  icon: IconName;
  testId?: string;
}

export interface DockProps {
  activeDestination: TabDestinationId;
  todayMode: TodayMode;
  directionsSubMode: DirectionsSubMode;
  meSubView: MeSubViewMode;
  calendarMode: CalendarViewMode;
  isCalendarOpen: boolean;
  isEditorOpen: boolean;
  habitsEnabled?: boolean;
  wishlistEnabled?: boolean;
  onTabPress: (destination: TabDestinationId) => void;
  onChangeTodayMode: (mode: TodayMode) => void;
  onChangeDirectionsSubMode: (mode: DirectionsSubMode) => void;
  onChangeMeSubView: (subView: MeSubViewMode) => void;
  onChangeCalendarMode: (mode: 'month' | 'week') => void;
  onToggleCalendarWindow: () => void;
  onCenterCreateClick: () => void;
}

function DockContextualButton({
  option,
  selected,
  compactUnselected,
  onClick,
}: {
  option: ContextualSegmentOption;
  selected: boolean;
  compactUnselected: boolean;
  onClick: () => void;
}) {
  const press = usePressFeedback<HTMLButtonElement>(true);
  const hideLabel = compactUnselected && !selected;
  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
      aria-label={option.label}
      aria-pressed={selected}
      data-selected={selected ? 'true' : 'false'}
      data-compact-unselected={hideLabel ? 'true' : undefined}
      data-testid={option.testId ?? `dock-context-${option.value}`}
      onClick={onClick}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      className="dock-ctx-btn ui-pressable"
    >
      <Icon name={option.icon} size={16} />
      {!hideLabel && <span className="dock-ctx-label">{option.label}</span>}
    </button>
  );
}

function DockTabButton({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: TabDestinationId;
  label: string;
  icon: IconName;
  active: boolean;
  onClick: () => void;
}) {
  const press = usePressFeedback<HTMLButtonElement>(true);
  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
      onClick={onClick}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-active={active ? 'true' : 'false'}
      data-testid={`nav-tab-${id}`}
      className="dock-tab-btn ui-pressable"
    >
      <Icon name={icon} size={20} strokeWidth={active ? 2 : 1.75} />
      {active && (
        <span
          className="dock-tab-label-wrap"
          data-active="true"
          data-expanded="true"
        >
          <span className="dock-tab-label">{label}</span>
        </span>
      )}
    </button>
  );
}

export const Dock: React.FC<DockProps> = ({
  activeDestination,
  todayMode,
  directionsSubMode,
  meSubView,
  calendarMode,
  isCalendarOpen,
  isEditorOpen,
  onTabPress,
  onChangeTodayMode,
  onChangeDirectionsSubMode,
  onChangeMeSubView,
  onChangeCalendarMode,
  onToggleCalendarWindow,
  onCenterCreateClick,
}) => {
  const dockRef = useRef<HTMLDivElement>(null);
  const calPress = usePressFeedback<HTMLButtonElement>(true);
  const orbPress = usePressFeedback<HTMLButtonElement>(true);
  const [todayNarrow, setTodayNarrow] = useState(false);

  const contextGroupKey = isCalendarOpen ? 'calendar' : activeDestination;
  const prevContextGroupRef = useRef(contextGroupKey);

  const contextualOptions: ContextualSegmentOption[] = React.useMemo(() => {
    if (isCalendarOpen) {
      return [
        { value: 'month', label: 'Місяць', icon: 'calendar' },
        { value: 'week', label: 'Тиждень', icon: 'clock' },
      ];
    }
    if (activeDestination === 'today') {
      return [
        { value: 'day', label: 'День', icon: 'sun' },
        { value: 'tasks', label: 'Завдання', icon: 'check' },
        { value: 'habits', label: 'Звички', icon: 'repeat' },
      ];
    }
    if (activeDestination === 'directions') {
      return [
        { value: 'projects', label: 'Проєкти', icon: 'folder' },
        { value: 'goals', label: 'Цілі', icon: 'target' },
      ];
    }
    return [
      { value: 'records', label: 'Статистика', icon: 'bar-chart' },
      { value: 'wishlist', label: 'Бажання', icon: 'gift' },
      { value: 'settings', label: 'Налаштування', icon: 'settings' },
    ];
  }, [isCalendarOpen, activeDestination]);

  const activeContextValue = React.useMemo(() => {
    if (isCalendarOpen) {
      return calendarMode === 'week' ? 'week' : 'month';
    }
    if (activeDestination === 'today') {
      return todayMode ?? 'day';
    }
    if (activeDestination === 'directions') {
      return directionsSubMode ?? 'projects';
    }
    if (
      meSubView === 'records' ||
      meSubView === 'wishlist' ||
      meSubView === 'settings'
    ) {
      return meSubView;
    }
    return '';
  }, [
    isCalendarOpen,
    calendarMode,
    activeDestination,
    todayMode,
    directionsSubMode,
    meSubView,
  ]);

  // In Я: at root nothing is selected (all 3 icon-only); when one is selected, selected shows icon + full label, unselected are icon-only.
  // In 2-segment bars (Проєкти|Цілі, Місяць|Тиждень) and Сьогодні: show all labels when they fit.
  const compactUnselected =
    !isCalendarOpen &&
    (activeDestination === 'me' ||
      (activeDestination === 'today' && todayNarrow));

  const { containerRef: ctxTrackRef, thumbRef: ctxThumbRef } =
    useSelectionThumb(activeContextValue || '__none__', {
      dynamicLayout: true,
      layoutKey: `${contextGroupKey}:${activeContextValue}:${compactUnselected ? 'compact' : 'full'}`,
    });

  const { containerRef: tabTrackRef, thumbRef: tabThumbRef } =
    useSelectionThumb(activeDestination, {
      dynamicLayout: true,
    });

  // Measure dock height into --dock-h (and --dock-height) via ResizeObserver
  useIsomorphicLayoutEffect(() => {
    const el = dockRef.current;
    if (!el || typeof document === 'undefined') return;
    const updateDockHeight = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) {
        document.documentElement.style.setProperty('--dock-h', `${h}px`);
        document.documentElement.style.setProperty('--dock-height', `${h}px`);
      }
    };
    updateDockHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateDockHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Animate contextual bar segments when context group changes (tab switch or calendar open)
  useIsomorphicLayoutEffect(() => {
    const track = ctxTrackRef.current;
    if (!track) return;
    if (prevContextGroupRef.current !== contextGroupKey) {
      prevContextGroupRef.current = contextGroupKey;
      const buttons = Array.from(track.querySelectorAll<HTMLElement>('button'));
      const reduced = isReducedMotion();
      buttons.forEach((btn) => {
        if (reduced) {
          runInterruptibleAnimation(btn, [{ opacity: 0 }, { opacity: 1 }], {
            durationMs: tweens.reduced,
            easing: easings.out,
            root: track,
            willChange: 'opacity',
          });
        } else {
          runInterruptibleAnimation(
            btn,
            [
              { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            {
              durationMs: 180,
              easing: easings.out,
              root: track,
              willChange: 'transform, opacity',
            }
          );
        }
      });
    }
  }, [contextGroupKey, ctxTrackRef]);

  useIsomorphicLayoutEffect(() => {
    const track = ctxTrackRef.current;
    if (!track) return;
    const updateFit = () => {
      const w = track.clientWidth || 260;
      setTodayNarrow(w < 215);
    };
    updateFit();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateFit);
      ro.observe(track);
      return () => ro.disconnect();
    }
  }, [ctxTrackRef]);

  const handleContextSelect = (val: string) => {
    if (isCalendarOpen) {
      onChangeCalendarMode(val === 'week' ? 'week' : 'month');
      return;
    }
    if (activeDestination === 'today') {
      onChangeTodayMode(val as TodayMode);
      return;
    }
    if (activeDestination === 'directions') {
      onChangeDirectionsSubMode(val as DirectionsSubMode);
      return;
    }
    if (activeDestination === 'me') {
      const next = val as MeSubViewMode;
      // Tapping the already-selected segment returns to the life-areas page ('overview')
      if (activeContextValue === next) {
        onChangeMeSubView('overview');
      } else {
        onChangeMeSubView(next);
      }
    }
  };

  const tabIcons: Record<TabDestinationId, IconName> = {
    today: 'sun',
    directions: 'folder',
    me: 'user',
  };

  return (
    <>
      <div className="planui-dock-fade" aria-hidden="true" />
      <div
        ref={dockRef}
        className="planui-dock"
        data-ui="dock"
        data-testid="bottom-dock"
      >
        <div
          className="planui-dock-left planui-floating-capsule"
          data-ui="dock-left"
        >
          {/* Row 1: Contextual bar (segmented 40px) */}
          <div
            ref={ctxTrackRef as React.RefObject<HTMLDivElement>}
            data-motion="idle"
            data-ui="dock-contextual-bar"
            data-testid="dock-contextual-bar"
            data-context-group={contextGroupKey}
            data-has-selection={activeContextValue ? 'true' : 'false'}
            role="group"
            aria-label="Контекстний перемикач"
            className="planui-dock-context-track"
          >
            <span
              ref={ctxThumbRef}
              aria-hidden="true"
              data-ui="selection-thumb"
              className="ui-selection-thumb planui-dock-context-thumb"
              style={{ opacity: activeContextValue ? 1 : 0 }}
            />
            {contextualOptions.map((opt) => (
              <DockContextualButton
                key={opt.value}
                option={opt}
                selected={opt.value === activeContextValue}
                compactUnselected={compactUnselected}
                onClick={() => handleContextSelect(opt.value)}
              />
            ))}
          </div>

          {/* Row 2: Tab capsule (height 52px) */}
          <nav
            ref={tabTrackRef as React.RefObject<HTMLElement>}
            data-motion="idle"
            aria-label={UK_STRINGS.app.mainNavigationAria}
            data-ui="dock-tabs"
            className="planui-dock-tabs"
          >
            <span
              ref={tabThumbRef}
              aria-hidden="true"
              data-ui="selection-thumb"
              className="ui-selection-thumb planui-dock-tab-thumb"
            />
            {PRIMARY_NAV_ITEMS.map((item) => (
              <DockTabButton
                key={item.id}
                id={item.id}
                label={item.labelUk}
                icon={tabIcons[item.id]}
                active={activeDestination === item.id}
                onClick={() => onTabPress(item.id)}
              />
            ))}
          </nav>
        </div>

        {/* Right vertical stack: Calendar button (48px) above + orb (56px) */}
        <div className="planui-dock-right" data-ui="dock-right">
          <button
            ref={calPress.ref}
            type="button"
            data-motion="idle"
            aria-label={isCalendarOpen ? 'Закрити календар' : 'Календар'}
            aria-pressed={isCalendarOpen}
            data-open={isCalendarOpen ? 'true' : 'false'}
            data-testid="dock-calendar-button"
            onClick={onToggleCalendarWindow}
            onPointerDown={calPress.onPointerDown}
            onPointerUp={calPress.onPointerUp}
            onPointerCancel={calPress.onPointerCancel}
            onPointerLeave={calPress.onPointerLeave}
            className="planui-dock-calendar-btn ui-pressable planui-floating-capsule"
          >
            <span
              className="dock-cal-icon-stack"
              data-open={isCalendarOpen ? 'true' : 'false'}
            >
              <span
                className="dock-cal-icon dock-cal-icon-cal"
                aria-hidden={isCalendarOpen ? 'true' : undefined}
              >
                <Icon name="calendar" size={20} />
              </span>
              <span
                className="dock-cal-icon dock-cal-icon-close"
                aria-hidden={!isCalendarOpen ? 'true' : undefined}
              >
                <Icon name="x" size={20} />
              </span>
            </span>
          </button>

          <button
            ref={orbPress.ref}
            type="button"
            data-motion="idle"
            data-ui="create-orb"
            data-open={isEditorOpen ? 'true' : 'false'}
            aria-label={
              isEditorOpen
                ? 'Закрити створення'
                : UK_STRINGS.app.globalCreateButtonAria
            }
            aria-expanded={isEditorOpen}
            data-testid="nav-create-Action"
            onClick={(e) => {
              captureOrbRect(e.currentTarget);
              onCenterCreateClick();
            }}
            onPointerDown={orbPress.onPointerDown}
            onPointerUp={orbPress.onPointerUp}
            onPointerCancel={orbPress.onPointerCancel}
            onPointerLeave={orbPress.onPointerLeave}
            className="planui-dock-orb ui-pressable"
          >
            <span
              className="planui-dock-orb-glyph"
              style={{
                transform: isEditorOpen ? 'rotate(45deg)' : 'rotate(0deg)',
              }}
            >
              <Icon name="plus" size={24} />
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

export interface CalendarWindowProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const CalendarWindow: React.FC<CalendarWindowProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  const [closing, setClosing] = useState(false);
  const wasOpenRef = useRef(isOpen);
  const windowRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    active: boolean;
    fromBody: boolean;
  } | null>(null);

  useOverlayRegistration(isOpen, onClose, 'calendar-window');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const bgRoot = document.querySelector<HTMLElement>('[data-testid="shell-background-root"]');
    if (!bgRoot) return;
    if (isOpen) {
      bgRoot.setAttribute('data-sheet-open', 'true');
    } else if (!document.querySelector('[data-ui="sheet"]:not([data-closing="true"])')) {
      bgRoot.removeAttribute('data-sheet-open');
    }
    return () => {
      if (!document.querySelector('[data-ui="sheet"]:not([data-closing="true"])')) {
        bgRoot.removeAttribute('data-sheet-open');
      }
    };
  }, [isOpen]);

  useIsomorphicLayoutEffect(() => {
    const win = windowRef.current;
    const scrim = scrimRef.current;
    const reduced = isReducedMotion();

    if (isOpen) {
      wasOpenRef.current = true;
      if (closing) setClosing(false);
      if (bodyRef.current) {
        bodyRef.current.scrollTop = 0;
      }
      if (!win) return;
      ensureMotionRootAttribute(win);
      win.style.transform = '';
      if (scrim) {
        runInterruptibleAnimation(scrim, [{ opacity: 0 }, { opacity: 1 }], {
          durationMs: reduced ? tweens.reduced : tweens.base,
          easing: easings.out,
          root: win,
          willChange: 'opacity',
        });
      }
      animateSpringTransform(
        win,
        'translate3d(0px, 100%, 0)',
        'translate3d(0px, 0%, 0)',
        springs.sheet,
        {
          fromOpacity: reduced ? 0 : 1,
          toOpacity: 1,
          root: win,
        }
      );
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (!win) {
        setClosing(false);
        return;
      }
      setClosing(true);
      if (scrim) {
        runInterruptibleAnimation(scrim, [{ opacity: 1 }, { opacity: 0 }], {
          durationMs: reduced ? tweens.reduced : tweens.base,
          easing: easings.out,
          root: win,
          willChange: 'opacity',
        });
      }
      animateSpringTransform(
        win,
        'translate3d(0px, 0%, 0)',
        'translate3d(0px, 100%, 0)',
        springs.sheet,
        {
          fromOpacity: 1,
          toOpacity: reduced ? 0 : 1,
          root: win,
          onFinish: () => setClosing(false),
        }
      );
    }
  }, [isOpen]);

  const isClosing = !isOpen && (closing || wasOpenRef.current);
  if (!isOpen && !isClosing) return null;

  const beginDrag = (clientY: number, fromBody = false) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    dragRef.current = {
      startY: clientY,
      lastY: clientY,
      lastT: now,
      velocity: 0,
      active: !fromBody,
      fromBody,
    };
  };

  const moveDrag = (clientY: number) => {
    const state = dragRef.current;
    const win = windowRef.current;
    if (!state || !win) return;
    const deltaY = clientY - state.startY;
    if (state.fromBody && !state.active) {
      if (bodyRef.current && bodyRef.current.scrollTop <= 0 && deltaY > 6) {
        state.active = true;
        state.startY = clientY;
      } else if (Math.abs(deltaY) > 6) {
        dragRef.current = null;
        return;
      } else {
        return;
      }
    }
    if (!state.active) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(1, now - state.lastT);
    state.velocity = (clientY - state.lastY) / dt;
    state.lastY = clientY;
    state.lastT = now;

    const activeDelta = clientY - state.startY;
    const offsetY = activeDelta < 0 ? activeDelta * 0.25 : activeDelta;
    if (!isReducedMotion()) {
      win.style.willChange = 'transform';
      win.style.transform = `translate3d(0px, ${Math.round(offsetY)}px, 0)`;
    }
  };

  const endDrag = (clientY: number) => {
    const state = dragRef.current;
    dragRef.current = null;
    const win = windowRef.current;
    if (!state || !state.active) return;
    const deltaY = clientY - state.startY;
    const velocity = state.velocity;
    const h = win?.getBoundingClientRect().height || 520;
    if (win) {
      win.style.willChange = '';
      win.style.transform = '';
    }
    if (velocity > 0.5 || deltaY > h * 0.3) {
      onClose();
    } else if (win && Math.abs(deltaY) > 2) {
      const fromOffset = Math.round(deltaY < 0 ? deltaY * 0.25 : deltaY);
      animateSpringTransform(
        win,
        `translate3d(0px, ${fromOffset}px, 0)`,
        'translate3d(0px, 0px, 0)',
        springs.sheet,
        { root: win }
      );
    }
  };

  return (
    <div
      ref={scrimRef}
      data-ui="calendar-window-scrim"
      data-testid="calendar-window-scrim"
      data-closing={!isOpen ? 'true' : undefined}
      style={{ pointerEvents: isOpen ? undefined : 'none' }}
      className="planui-calendar-window-scrim"
      onClick={(e) => {
        if (isOpen && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={windowRef}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
        aria-hidden={!isOpen ? 'true' : undefined}
        aria-label="Календар"
        data-ui="calendar-window"
        data-testid="calendar-window"
        data-motion="idle"
        className="planui-calendar-window planui-floating-capsule"
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
        <div
          className="planui-calendar-window-bar"
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
          <span className="planui-calendar-window-title">Календар</span>
          <button
            type="button"
            aria-label="Закрити календар"
            data-testid="calendar-window-close"
            onClick={onClose}
            className="sheet-close-btn ui-pressable"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div
          ref={bodyRef}
          className="planui-calendar-window-body"
          data-testid="calendar-window-body"
          onTouchStart={(e) => {
            if (bodyRef.current && bodyRef.current.scrollTop <= 0) {
              beginDrag(e.touches[0].clientY, true);
            }
          }}
          onTouchMove={(e) => moveDrag(e.touches[0].clientY)}
          onTouchEnd={(e) => endDrag(e.changedTouches[0].clientY)}
        >
          {children}
        </div>
      </section>
    </div>
  );
};

export interface FloatingShellProps {
  activeDestination: PrimaryDestinationId;
  todayMode?: TodayMode;
  directionsSubMode?: DirectionsSubMode;
  meSubView?: MeSubViewMode;
  calendarMode?: CalendarViewMode;
  isCalendarOpen?: boolean;
  habitsEnabled?: boolean;
  wishlistEnabled?: boolean;
  onSelectDestination: (destination: TabDestinationId) => void;
  onChangeTodayMode?: (mode: TodayMode) => void;
  onChangeDirectionsSubMode?: (mode: DirectionsSubMode) => void;
  onChangeMeSubView?: (subView: MeSubViewMode) => void;
  onChangeCalendarMode?: (mode: 'month' | 'week') => void;
  onToggleCalendarWindow?: () => void;
  onCenterCreateClick: () => void;
  isEditorOpen: boolean;
  calendarWindowContent?: React.ReactNode;
  onCloseCalendarWindow?: () => void;
  topStatusSlot?: React.ReactNode;
  children: React.ReactNode;
}

export const FloatingShell: React.FC<FloatingShellProps> = ({
  activeDestination,
  todayMode = 'day',
  directionsSubMode = 'projects',
  meSubView = 'overview',
  calendarMode = 'month',
  isCalendarOpen = false,
  onSelectDestination,
  onChangeTodayMode = () => {},
  onChangeDirectionsSubMode = () => {},
  onChangeMeSubView = () => {},
  onChangeCalendarMode = () => {},
  onToggleCalendarWindow = () => {},
  onCenterCreateClick,
  isEditorOpen,
  calendarWindowContent,
  onCloseCalendarWindow = () => {},
  topStatusSlot,
  children,
}) => {
  const tabDest: TabDestinationId =
    activeDestination === 'directions' || activeDestination === 'me'
      ? activeDestination
      : 'today';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const root = document.documentElement;
    const updateVv = () => {
      const v = window.visualViewport;
      if (!v) return;
      const nextHeight = Math.round(v.height);
      const nextBottom = Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop));
      if (nextBottom > 60) {
        root.setAttribute('data-keyboard-open', 'true');
        root.style.setProperty('--kb-offset', `${nextBottom}px`);
        root.style.setProperty('--vv-height', `${nextHeight}px`);
      } else {
        root.removeAttribute('data-keyboard-open');
        root.style.setProperty('--kb-offset', '0px');
        root.style.removeProperty('--vv-height');
      }
    };
    updateVv();
    window.visualViewport?.addEventListener('resize', updateVv);
    window.visualViewport?.addEventListener('scroll', updateVv);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateVv);
      window.visualViewport?.removeEventListener('scroll', updateVv);
    };
  }, []);

  const handleCalendarButtonPress = () => {
    // Requirement 6: The calendar button also closes another open overlay first.
    if (hasOpenOverlay()) {
      const topmostId = getTopmostOverlayId();
      if (topmostId && topmostId !== 'calendar-window') {
        closeTopmostOverlay();
        return;
      }
    }
    onToggleCalendarWindow();
  };

  return (
    <div
      data-testid="shell-background-root"
      className="min-h-dvh flex flex-col relative selection:bg-blue-500/20"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      <AmbientCanvas />
      {topStatusSlot && (
        <div
          className="sticky top-0 z-30 w-full px-3 pt-2 pointer-events-none"
          style={{
            paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
          }}
        >
          <div className="max-w-[720px] mx-auto pointer-events-auto">
            {topStatusSlot}
          </div>
        </div>
      )}

      <main
        id="planui-main-content"
        className="flex-1 w-full max-w-[720px] mx-auto px-4 pt-3 planui-main-canvas relative z-10"
      >
        {children}
      </main>

      <CalendarWindow isOpen={isCalendarOpen} onClose={onCloseCalendarWindow}>
        {calendarWindowContent}
      </CalendarWindow>

      <Dock
        activeDestination={tabDest}
        todayMode={todayMode}
        directionsSubMode={directionsSubMode}
        meSubView={meSubView}
        calendarMode={calendarMode}
        isCalendarOpen={isCalendarOpen}
        isEditorOpen={isEditorOpen}
        onTabPress={onSelectDestination}
        onChangeTodayMode={onChangeTodayMode}
        onChangeDirectionsSubMode={onChangeDirectionsSubMode}
        onChangeMeSubView={onChangeMeSubView}
        onChangeCalendarMode={onChangeCalendarMode}
        onToggleCalendarWindow={handleCalendarButtonPress}
        onCenterCreateClick={onCenterCreateClick}
      />
    </div>
  );
};

