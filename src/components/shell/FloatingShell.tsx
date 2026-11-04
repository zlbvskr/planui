import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Compass,
  SunMedium,
  User,
  Plus,
} from 'lucide-react';
import { PrimaryDestinationId, UK_STRINGS } from '../../i18n/uk';
import { PRIMARY_NAV_ITEMS } from '../../state/shellStore';

const NAV_ICONS: Record<PrimaryDestinationId, React.FC<{ className?: string }>> = {
  today: SunMedium,
  calendar: Calendar,
  directions: Compass,
  me: User,
};

export interface FloatingShellProps {
  activeDestination: PrimaryDestinationId;
  onSelectDestination: (dest: PrimaryDestinationId) => void;
  onOpenGlobalCreate: () => void;
  isModalOpen: boolean;
  isBackgroundInert?: boolean;
  children: React.ReactNode;
}

export const FloatingShell: React.FC<FloatingShellProps> = ({
  activeDestination,
  onSelectDestination,
  onOpenGlobalCreate,
  isModalOpen,
  isBackgroundInert = isModalOpen,
  children,
}) => {
  const [isInputFocusedOnMobile, setIsInputFocusedOnMobile] = useState(false);

  // C17: During keyboard entry, do not let both floating controls jump unpredictably above the keyboard.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const isTextControl =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable;
      if (isTextControl && window.innerWidth < 1024) {
        const inputType = (target as HTMLInputElement).type;
        if (
          inputType !== 'checkbox' &&
          inputType !== 'radio' &&
          inputType !== 'file' &&
          inputType !== 'button'
        ) {
          setIsInputFocusedOnMobile(true);
        }
      }
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) {
          setIsInputFocusedOnMobile(false);
          return;
        }
        const tag = active.tagName;
        const stillText =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          active.isContentEditable;
        if (!stillText) {
          setIsInputFocusedOnMobile(false);
        }
      }, 60);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  const hideFloatingControls = isModalOpen || isInputFocusedOnMobile;

  return (
    <div
      className="min-h-[100dvh] flex flex-col lg:flex-row"
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
      inert={isBackgroundInert ? true : undefined}
      aria-hidden={isBackgroundInert ? 'true' : undefined}
      data-testid="shell-background-root"
    >
      <a
        href="#planui-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: '2px solid var(--color-brand)',
        }}
      >
        {UK_STRINGS.app.skipToContent}
      </a>

      {/* Desktop Sidebar Navigation (>= 1024px) — C18 desktop adaptation with one global creation mechanism */}
      <aside
        aria-label={UK_STRINGS.app.desktopNavigationAria}
        className="hidden lg:flex lg:flex-col lg:w-[264px] lg:shrink-0 lg:sticky lg:top-0 lg:h-[100dvh] px-4 py-6 border-r justify-between"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
        data-testid="desktop-sidebar-nav"
      >
        <div className="space-y-6">
          <div className="px-3 flex items-center justify-between">
            <div>
              <span
                className="text-[20px] font-bold tracking-tight block leading-none"
                style={{ color: 'var(--text-primary)' }}
              >
                {UK_STRINGS.app.brand}
              </span>
              <span
                className="text-[12px] mt-1 block"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.app.subtitle}
              </span>
            </div>
          </div>

          {!isModalOpen && (
            <button
              type="button"
              onClick={onOpenGlobalCreate}
              aria-label={UK_STRINGS.app.globalCreateButtonAria}
              data-testid="desktop-global-create-button"
              className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl font-medium text-[15px] flex items-center justify-center gap-2 planui-transition-micro cursor-pointer active:scale-[0.98] dark:!text-[#111214]"
              style={{
                backgroundColor: 'var(--color-brand)',
                color: '#FFFFFF',
              }}
            >
              <Plus className="w-5 h-5 stroke-[2.25]" aria-hidden="true" />
              <span>{UK_STRINGS.app.globalCreateButtonLabel}</span>
            </button>
          )}

          <nav aria-label={UK_STRINGS.app.mainNavigationAria} className="space-y-1">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = NAV_ICONS[item.id];
              const isActive = activeDestination === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectDestination(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`desktop-nav-item-${item.id}`}
                  data-active={isActive ? 'true' : 'false'}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-[15px] font-medium planui-transition-micro cursor-pointer text-left"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: isActive
                      ? '1px solid var(--border-subtle)'
                      : '1px solid transparent',
                  }}
                >
                  <Icon
                    className="w-5 h-5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.labelUk}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div
          className="px-3 py-3 rounded-xl text-[12px] leading-relaxed"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
        >
          Локальне сховище браузера (IndexedDB) • 24-годинний формат
        </div>
      </aside>

      {/* Main Content Area with Measured Bottom Scroll Clearance on Mobile/Tablet */}
      <main
        id="planui-main-content"
        className="flex-1 w-full max-w-[1080px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 lg:py-8"
        style={{
          paddingBottom: 'var(--floating-scroll-clearance)',
        }}
        data-testid="main-scroll-container"
      >
        {children}
      </main>

      {/* Mobile & Tablet Floating Controls (< 1024px) — C17 */}
      {!hideFloatingControls && (
        <div
          className="lg:hidden fixed z-40 pointer-events-none"
          style={{
            left: '14px',
            right: '14px',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          data-testid="mobile-floating-zone"
        >
          <div className="max-w-[520px] mx-auto flex flex-col items-end">
            {/* Separate Global Creation Button above the capsule on the right (48–52px target, 14px gap) */}
            <button
              type="button"
              onClick={onOpenGlobalCreate}
              aria-label={UK_STRINGS.app.globalCreateButtonAria}
              data-testid="mobile-global-create-button"
              className="pointer-events-auto mb-[14px] w-[50px] h-[50px] min-w-[50px] min-h-[50px] rounded-full flex items-center justify-center planui-transition-micro cursor-pointer active:scale-95 dark:!text-[#111214]"
              style={{
                backgroundColor: 'var(--color-brand)',
                color: '#FFFFFF',
                boxShadow: 'var(--glass-shadow)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
              }}
            >
              <Plus className="w-6 h-6 stroke-[2.4]" aria-hidden="true" />
            </button>

            {/* Inset Floating Navigation Capsule (4 equal columns for 4 destinations) */}
            <nav
              aria-label={UK_STRINGS.app.mainNavigationAria}
              data-testid="mobile-floating-capsule"
              className="pointer-events-auto w-full min-h-[64px] px-1.5 py-1.5 rounded-[28px] planui-floating-capsule grid grid-cols-4 items-stretch gap-1"
            >
              {PRIMARY_NAV_ITEMS.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const isActive = activeDestination === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectDestination(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`mobile-nav-item-${item.id}`}
                    data-active={isActive ? 'true' : 'false'}
                    data-center={item.isCenter ? 'true' : 'false'}
                    className="min-h-[50px] min-w-[44px] px-1 py-1.5 rounded-[22px] flex flex-col items-center justify-center gap-0.5 planui-transition-micro cursor-pointer select-none"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--bg-pressed)'
                        : 'transparent',
                      color: isActive
                        ? 'var(--color-brand)'
                        : 'var(--text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <Icon
                      className="w-5 h-5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-[11px] sm:text-[12px] leading-tight text-center break-words max-w-full px-0.5">
                      {item.labelUk}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};
