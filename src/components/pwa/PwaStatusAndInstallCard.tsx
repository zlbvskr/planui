import React, { useState } from 'react';
import {
  Download,
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { PwaLifecycleState } from '../../pwa/pwaController';
import { Button, Card } from '../ui/primitives';

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
          className="px-4 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-[13px]"
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
          className="p-3.5 rounded-2xl border space-y-2 text-[13px]"
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
                className="text-[12px] m-0 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
                data-testid="pwa-update-blocked-reason"
              >
                {pwaState.updateSafety.blockedReasonUk}
              </p>
            )}
          {errorMessage && (
            <p
              className="text-[12px] m-0"
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

export interface PwaInstallAndOfflineCardProps {
  pwaState: PwaLifecycleState;
}

export const PwaInstallAndOfflineCard: React.FC<
  PwaInstallAndOfflineCardProps
> = ({ pwaState }) => {
  const [showFallbackGuide, setShowFallbackGuide] = useState(false);

  const swStatusTextUk = (() => {
    switch (pwaState.swStatus) {
      case 'cached_ready':
        return 'Офлайн-кеш активний (ядро, редактори, список бажань, резервні копії ZIP)';
      case 'update_available':
        return 'Нова версія ресурсів очікує безпечного перезавантаження';
      case 'registering':
        return 'Підготовка локального кешу ресурсів...';
      case 'error':
        return 'Кешування ресурсів обмежене середовищем перегляду (база даних IndexedDB працює повноцінно)';
      case 'unsupported':
        return 'Service Worker не підтримується в цьому середовищі';
    }
  })();

  return (
    <Card
      title="Встановлення PWA, офлайн-режим та оновлення"
      subtitle="Статична робота через HTTPS без серверів, облікових записів, хмарної синхронізації чи зовнішніх курсів валют."
      headerRight={
        <Smartphone
          className="w-5 h-5"
          style={{ color: 'var(--text-secondary)' }}
          aria-hidden="true"
        />
      }
    >
      <div className="space-y-3.5" data-testid="pwa-settings-card">
        <div
          className="p-3.5 rounded-xl space-y-2 border text-[13px]"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              {pwaState.isOnline ? (
                <Wifi
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--color-dayoff-text)' }}
                  aria-hidden="true"
                />
              ) : (
                <WifiOff
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--color-work-text)' }}
                  aria-hidden="true"
                />
              )}
              <span data-testid="pwa-network-status-label">
                {pwaState.isOnline
                  ? 'Мережа активна (усі операції виконуються локально)'
                  : 'Офлайн-режим (робота з локальним кешем та IndexedDB)'}
              </span>
            </div>
            <span
              className="text-[12px] px-2.5 py-0.5 rounded-lg"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
              }}
              data-testid="pwa-standalone-status-badge"
            >
              {pwaState.installAssessment.statusLabelUk}
            </span>
          </div>

          <div
            className="text-[12px] flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)' }}
            data-testid="pwa-sw-cache-status"
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{swStatusTextUk}</span>
          </div>
        </div>

        <p
          className="text-[12px] m-0 leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {pwaState.installAssessment.honestLimitationsUk}
        </p>

        {!pwaState.installAssessment.isInstalledStandalone && (
          <div className="space-y-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              {pwaState.installAssessment.canTriggerInstallPrompt && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void pwaState.triggerInstallPrompt()}
                  data-testid="pwa-install-prompt-button"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Встановити застосунок PLANUI</span>
                </Button>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFallbackGuide((prev) => !prev)}
                data-testid="pwa-toggle-install-guide-button"
              >
                <Info className="w-4 h-4" aria-hidden="true" />
                <span>
                  {showFallbackGuide
                    ? 'Сховати інструкцію зі встановлення'
                    : 'Як додати на початковий екран'}
                </span>
              </Button>
            </div>

            {showFallbackGuide && (
              <div
                className="p-3 rounded-xl text-[13px] leading-relaxed border"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                data-testid="pwa-fallback-install-guide"
              >
                {pwaState.installAssessment.fallbackInstructionsUk}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
