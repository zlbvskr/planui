import React, { useState } from 'react';
import {
  RefreshCw,
  WifiOff,
} from '../../ui/icons';
import { PwaLifecycleState } from '../../pwa/pwaController';
import { Disclosure, Row, Section, Sheet, Button } from '../../ui';

export interface PwaStatusBannerProps {
  pwaState: PwaLifecycleState;
}

export const PwaStatusBanner: React.FC<PwaStatusBannerProps> = ({
  pwaState,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApplyUpdate = () => {
    setErrorMessage(null);
    try {
      pwaState.applyWaitingUpdateSafely();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Не вдалося застосувати оновлення.'
      );
    }
  };

  if (pwaState.isOnline && !pwaState.hasWaitingUpdate) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="pwa-status-banner-container">
      {!pwaState.isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-[0.8125rem]"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
          data-testid="pwa-offline-banner"
        >
          <div className="flex items-center gap-2.5">
            <WifiOff
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--color-work-text)' }}
              aria-hidden="true"
            />
            <span>
              <strong>Офлайн-режим:</strong> інтерфейс, розклад, список бажань,
              точні ціни та експорт ZIP працюють із локального сховища браузера.
              Зовнішні вебпосилання недоступні без мережі.
            </span>
          </div>
        </div>
      )}

      {pwaState.hasWaitingUpdate && (
        <div
          role="region"
          aria-label="Доступне оновлення застосунку"
          className="p-3.5 rounded-2xl border space-y-2 text-[0.8125rem]"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--color-brand)',
            color: 'var(--text-primary)',
          }}
          data-testid="pwa-update-banner"
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 font-medium">
              <RefreshCw
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-brand-text)' }}
                aria-hidden="true"
              />
              <span>
                Доступне оновлення ресурсів PLANUI (ваша база даних IndexedDB не
                змінюється й не видаляється).
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!pwaState.updateSafety.canReloadNow}
              onClick={handleApplyUpdate}
              data-testid="pwa-apply-update-button"
            >
              Оновити застосунок
            </Button>
          </div>
          {!pwaState.updateSafety.canReloadNow &&
            pwaState.updateSafety.blockedReasonUk && (
              <p
                className="text-[0.75rem] m-0 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
                data-testid="pwa-update-blocked-reason"
              >
                {pwaState.updateSafety.blockedReasonUk}
              </p>
            )}
          {errorMessage && (
            <p
              className="text-[0.75rem] m-0"
              style={{ color: 'var(--color-brand-text)' }}
            >
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export interface PwaInstallAndOfflineViewProps {
  pwaState: PwaLifecycleState;
}

export const PwaInstallAndOfflineView: React.FC<
  PwaInstallAndOfflineViewProps
> = ({ pwaState }) => {
  const [showFallbackGuide, setShowFallbackGuide] = useState(false);

  const swStatusTextUk = (() => {
    switch (pwaState.swStatus) {
      case 'cached_ready':
        return 'Офлайн-кеш активний';
      case 'update_available':
        return 'Доступне оновлення ресурсів';
      case 'registering':
        return 'Підготовка локального кешу…';
      case 'error':
        return 'Локальна база IndexedDB активна';
      case 'unsupported':
        return 'Стандартний режим браузера';
    }
  })();

  return (
    <div data-testid="pwa-settings-card">
      <Section title="Офлайн і встановлення">
        <Row
          title={
            <span data-testid="pwa-network-status-label">
              {pwaState.isOnline
                ? 'Мережа активна (локальна робота)'
                : 'Офлайн-режим (локальний кеш)'}
            </span>
          }
          secondary={swStatusTextUk}
          trailing={
            <span
              className="text-xs font-medium text-[var(--text-secondary)]"
              data-testid="pwa-standalone-status-badge"
            >
              {pwaState.installAssessment.statusLabelUk}
            </span>
          }
        />
        <Row
          title="Стан офлайн-оболонки"
          secondary="Усі дані зберігаються на пристрої"
          trailing={
            <span
              className="text-xs text-[var(--text-secondary)]"
              data-testid="pwa-sw-cache-status"
            >
              {pwaState.swStatus === 'cached_ready' ? 'Готово' : 'Локально'}
            </span>
          }
        />
        {!pwaState.installAssessment.isInstalledStandalone &&
          pwaState.installAssessment.canTriggerInstallPrompt && (
            <Row
              title="Встановити застосунок"
              secondary="Запуск з головного екрана"
              trailing={
                <button
                  type="button"
                  onClick={() => void pwaState.triggerInstallPrompt()}
                  className="ui-primary text-xs px-4 py-2"
                  data-testid="pwa-install-prompt-button"
                >
                  Встановити
                </button>
              }
            />
          )}
        {!pwaState.installAssessment.isInstalledStandalone && (
          <Disclosure
            title="Як додати на початковий екран"
            secondary="Підказка для iOS, Android і ПК"
            onClick={() => setShowFallbackGuide(true)}
            testId="pwa-toggle-install-guide-button"
          />
        )}
      </Section>

      <Sheet
        title="Як додати на початковий екран"
        isOpen={showFallbackGuide}
        onClose={() => setShowFallbackGuide(false)}
      >
        <div
          className="space-y-3 text-sm text-[var(--text-secondary)]"
          data-testid="pwa-fallback-install-guide"
          data-ui="info-sheet"
        >
          <p>{pwaState.installAssessment.fallbackInstructionsUk}</p>
          <p>{pwaState.installAssessment.honestLimitationsUk}</p>
        </div>
      </Sheet>
    </div>
  );
};
