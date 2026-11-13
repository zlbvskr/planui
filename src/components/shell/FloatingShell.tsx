import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../../ui/icons';
import { CandySvgSprite } from '../../ui/CandySvgSprite';
import { PrimaryDestinationId, UK_STRINGS } from '../../i18n/uk';
import { CalendarViewMode, DirectionsSubMode, MeSubViewMode, PRIMARY_NAV_ITEMS, TabDestinationId } from '../../state/shellStore';
import { TodayMode } from '../../domain/types';
import { AmbientCanvas, animateSpringTransform, captureOrbRect, easings, ensureMotionRootAttribute, isReducedMotion, runInterruptibleAnimation, springs, tweens, usePressFeedback, useSelectionThumb, wasRecentPopState } from '../../ui/motion';
import { closeTopmostOverlay, getTopmostOverlayId, getViewportLayerRoot, hasOpenOverlay, syncOverlayScrollLock, useOverlayRegistration } from '../../ui/overlayStack';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function hasFocusedTextInput(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || active === document.documentElement) {
    return false;
  }
  const tag = active.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = ((active as HTMLInputElement).type || 'text').toLowerCase();
    const nonKeyboardTypes = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !nonKeyboardTypes.has(type);
  }
  if (active.isContentEditable) return true;
  return false;
}

interface ContextualSegmentOption {
  value: string;
  label: string;
  icon: IconName;
  testId?: string;
}

interface DockProps {
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
  onCenterCreateLongPress?: () => void;
}

function DockContextualButton({
  option,
  selected,
  onClick,
}: {
  option: ContextualSegmentOption;
  selected: boolean;
  onClick: () => void;
}) {
  const press = usePressFeedback<HTMLButtonElement>(true);
  return (
    <button
      ref={press.ref}
      type="button"
      data-motion="idle"
      aria-label={option.label}
      aria-pressed={selected}
      data-selected={selected ? 'true' : 'false'}
      data-testid={option.testId ?? `dock-context-${option.value}`}
      onClick={onClick}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      className="dock-ctx-btn ui-pressable"
    >
      <Icon name={option.icon} size={16} strokeWidth={selected ? 2 : 1.75} />
      <span className="dock-ctx-label">{option.label}</span>
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
      <span className="dock-tab-label">{label}</span>
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
  onCenterCreateLongPress,
}) => {
  const dockRef = useRef<HTMLDivElement>(null);
  const calPress = usePressFeedback<HTMLButtonElement>(true);
  const orbPress = usePressFeedback<HTMLButtonElement>(true);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const clearOrbLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

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
      { value: 'settings', label: 'Налаштування', icon: 'gear' },
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

  const { containerRef: ctxTrackRef, thumbRef: ctxThumbRef } =
    useSelectionThumb(activeContextValue || '__none__', {
      dynamicLayout: true,
      spring: springs.smooth,
      layoutKey: `${contextGroupKey}:${contextualOptions.length}:${activeContextValue}`,
    });

  const { containerRef: tabTrackRef, thumbRef: tabThumbRef } =
    useSelectionThumb(activeDestination, {
      dynamicLayout: true,
      spring: springs.smooth,
    });

  // Measure dock height and top edge into --dock-h and --overlay-bottom via ResizeObserver
  useIsomorphicLayoutEffect(() => {
    const el = dockRef.current;
    if (!el || typeof document === 'undefined') return;
    const updateDockMetrics = () => {
      const rect = el.getBoundingClientRect();
      const h = Math.round(rect.height);
      if (h > 0) {
        document.documentElement.style.setProperty('--dock-h', `${h}px`);
        document.documentElement.style.setProperty('--dock-height', `${h}px`);
        const vvH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        if (rect.top > 0 && vvH > rect.top) {
          const fromBottomToDockTop = Math.max(h, Math.round(vvH - rect.top));
          document.documentElement.style.setProperty(
            '--overlay-bottom',
            `${fromBottomToDockTop + 12}px`
          );
        }
      }
    };
    updateDockMetrics();
    window.addEventListener('resize', updateDockMetrics, { passive: true });
    window.visualViewport?.addEventListener('resize', updateDockMetrics);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateDockMetrics);
      ro.observe(el);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', updateDockMetrics);
        window.visualViewport?.removeEventListener('resize', updateDockMetrics);
      };
    }
    return () => {
      window.removeEventListener('resize', updateDockMetrics);
      window.visualViewport?.removeEventListener('resize', updateDockMetrics);
    };
  }, []);

  // Contextual bar content change = crossfade 160ms + 4px translateY while container keeps height
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
              { opacity: 0, transform: 'translate3d(0, 4px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            {
              durationMs: 160,
              easing: easings.out,
              root: track,
              willChange: 'transform, opacity',
            }
          );
        }
      });
    }
  }, [contextGroupKey, ctxTrackRef]);

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
    calendar: 'calendar',
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
          {/* Row 1: Contextual bar (height 44px) */}
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
                onClick={() => handleContextSelect(opt.value)}
              />
            ))}
          </div>

          {/* Row 2: Tab capsule (height 52px, three equal-width segments + single INK glossy thumb) */}
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

        {/* Right vertical stack: two identical 52px round buttons with 16px gap (total 120px) */}
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
                <Icon name="calendar" size={22} strokeWidth={1.75} />
              </span>
              <span
                className="dock-cal-icon dock-cal-icon-close"
                aria-hidden={!isCalendarOpen ? 'true' : undefined}
              >
                <Icon name="x" size={22} strokeWidth={1.75} />
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
              if (longPressFiredRef.current) {
                longPressFiredRef.current = false;
                return;
              }
              captureOrbRect(e.currentTarget);
              onCenterCreateClick();
            }}
            onPointerDown={(e) => {
              orbPress.onPointerDown(e);
              longPressFiredRef.current = false;
              clearOrbLongPress();
              if (!isEditorOpen && onCenterCreateLongPress && e.button === 0) {
                const btnEl = e.currentTarget;
                longPressTimerRef.current = window.setTimeout(() => {
                  longPressTimerRef.current = null;
                  longPressFiredRef.current = true;
                  captureOrbRect(btnEl);
                  onCenterCreateLongPress();
                }, 480);
              }
            }}
            onPointerUp={(e) => {
              clearOrbLongPress();
              orbPress.onPointerUp(e);
            }}
            onPointerCancel={(e) => {
              clearOrbLongPress();
              orbPress.onPointerCancel(e);
            }}
            onPointerLeave={(e) => {
              clearOrbLongPress();
              orbPress.onPointerLeave(e);
            }}
            onContextMenu={(e) => {
              if (longPressFiredRef.current) {
                e.preventDefault();
              }
            }}
            className="planui-dock-orb ui-pressable"
          >
            <span
              className="planui-dock-orb-glyph"
              style={{
                transform: isEditorOpen ? 'rotate(45deg)' : 'rotate(0deg)',
              }}
            >
              <Icon name="plus" size={22} strokeWidth={2} />
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

interface CalendarWindowProps {
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

  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      if (windowRef.current) {
        const focusable = windowRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus({ preventScroll: true });
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (getTopmostOverlayId() !== 'calendar-window') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && windowRef.current) {
        const focusables = Array.from(
          windowRef.current.querySelectorAll<HTMLElement>(
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
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen, onClose]);

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
      if (!win || wasRecentPopState()) {
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
        tabIndex={-1}
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
  onCenterCreateLongPress?: () => void;
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
  onCenterCreateLongPress,
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

  // Ensure the shared fixed viewport layer exists synchronously before children/portals mount
  const viewportLayerRoot =
    typeof document !== 'undefined' ? getViewportLayerRoot() : null;

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    getViewportLayerRoot();
    syncOverlayScrollLock();

    const root = document.documentElement;
    let rafId = 0;

    const applyVisualViewport = () => {
      rafId = 0;
      const vv = window.visualViewport;
      const innerH = window.innerHeight;
      const vvh = vv ? Math.round(vv.height) : innerH;
      const vvt = vv ? Math.round(vv.offsetTop) : 0;

      root.style.setProperty('--vvh', `${vvh}px`);
      root.style.setProperty('--vvt', `${vvt}px`);

      const focusedInput = hasFocusedTextInput();
      const kbOpen = Boolean(vv && vv.height < innerH - 120 && focusedInput);

      if (kbOpen && vv) {
        const kbOffset = Math.max(0, Math.round(innerH - vv.height - vv.offsetTop));
        root.setAttribute('data-keyboard-open', 'true');
        root.style.setProperty('--kb-offset', `${kbOffset}px`);
        root.style.setProperty('--vv-height', `${vvh}px`);
      } else {
        root.removeAttribute('data-keyboard-open');
        root.style.setProperty('--kb-offset', '0px');
        root.style.removeProperty('--vv-height');
      }
    };

    const scheduleVvUpdate = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(applyVisualViewport);
      }
    };

    const handleVvScroll = () => {
      if (hasFocusedTextInput() || hasOpenOverlay()) {
        window.scrollTo(0, 0);
      }
      scheduleVvUpdate();
    };

    const handleFocusChange = () => {
      if (hasFocusedTextInput()) {
        window.scrollTo(0, 0);
      }
      scheduleVvUpdate();
    };

    applyVisualViewport();

    window.visualViewport?.addEventListener('resize', scheduleVvUpdate);
    window.visualViewport?.addEventListener('scroll', handleVvScroll);
    window.addEventListener('resize', scheduleVvUpdate);
    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.visualViewport?.removeEventListener('resize', scheduleVvUpdate);
      window.visualViewport?.removeEventListener('scroll', handleVvScroll);
      window.removeEventListener('resize', scheduleVvUpdate);
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
    };
  }, []);

  const handleCalendarButtonPress = () => {
    if (hasOpenOverlay()) {
      const topmostId = getTopmostOverlayId();
      if (topmostId && topmostId !== 'calendar-window') {
        closeTopmostOverlay();
        return;
      }
    }
    onToggleCalendarWindow();
  };

  const viewportLayerChildren = (
    <>
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
        onCenterCreateLongPress={onCenterCreateLongPress}
      />
    </>
  );

  return (
    <div
      data-testid="shell-background-root"
      className="min-h-dvh flex flex-col relative selection:bg-blue-500/20"
      style={{
        color: 'var(--text-primary)',
      }}
    >
      <CandySvgSprite />
      <AmbientCanvas />
      {topStatusSlot && (
        <div
          className="sticky top-0 z-30 w-full px-3 pt-2 pointer-events-none"
          style={{
            paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
          }}
        >
          <div className="max-w-[560px] mx-auto pointer-events-auto">
            {topStatusSlot}
          </div>
        </div>
      )}

      <main
        id="planui-main-content"
        className="flex-1 min-w-0 w-full max-w-[560px] mx-auto px-5 pt-3 planui-main-canvas relative z-10"
      >
        {children}
      </main>

      {viewportLayerRoot
        ? createPortal(viewportLayerChildren, viewportLayerRoot)
        : viewportLayerChildren}
    </div>
  );
};


