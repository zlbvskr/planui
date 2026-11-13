import React, { useState } from 'react';
import { RefreshCw, WifiOff } from '../../ui/icons';
import { PwaLifecycleState } from '../../pwa/pwaController';
import { Disclosure } from '../../ui/Disclosure';
import { Row } from '../../ui/rows';
import { Section } from '../../ui/headers';
import { Sheet } from '../../ui/sheets';

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

      {pwaState.hasWaitingUpdate && pwaState.updateSafety.canReloadNow && (
        <div
          role="region"
          aria-label="Доступна нова версія"
          className="ui-toast ui-ink-gel"
          data-testid="pwa-update-banner"
        >
          <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="ui-toast-message">Доступна нова версія</span>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <button
            type="button"
            onClick={handleApplyUpdate}
            className="ui-toast-undo"
            data-testid="pwa-apply-update-button"
          >
            Оновити
          </button>
          {errorMessage && (
            <span className="text-xs opacity-80">{errorMessage}</span>
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
