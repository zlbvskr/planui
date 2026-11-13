import { useCallback, useEffect, useState } from 'react';
import { PlanuiError } from '../i18n/errorsUk';
import { hasOpenOverlay, subscribeOverlayStack } from '../ui/overlayStack';

export type DirtyEditorKind =
  | 'shared_modal_editor'
  | 'task_editor'
  | 'journal_editor'
  | 'wish_editor'
  | 'wishlist_category_editor'
  | 'roster_editor'
  | 'habit_editor'
  | 'settings_confirmation';

interface UpdateReloadSafetyEvaluation {
  canReloadNow: boolean;
  blockedReasonUk: string | null;
  activeDirtyContexts: DirtyEditorKind[];
}

/**
 * 12.3 UPDATES: Pure evaluator verifying that a Service Worker update never
 * reloads over dirty task, journal, wish, or category editors.
 */
function evaluateUpdateReloadSafety(params: {
  hasWaitingWorker: boolean;
  dirtyEditors: readonly DirtyEditorKind[];
}): UpdateReloadSafetyEvaluation {
  const uniqueDirty = Array.from(new Set(params.dirtyEditors));
  if (!params.hasWaitingWorker) {
    return {
      canReloadNow: false,
      blockedReasonUk: 'Немає очікуючого оновлення для активації.',
      activeDirtyContexts: uniqueDirty,
    };
  }
  if (uniqueDirty.length > 0) {
    return {
      canReloadNow: false,
      blockedReasonUk:
        'Оновлення відкладено: відкрито редактор із незбереженими даними. Збережіть або закрийте форму, щоб безпечно застосувати оновлення без втрати введеного тексту.',
      activeDirtyContexts: uniqueDirty,
    };
  }
  return {
    canReloadNow: true,
    blockedReasonUk: null,
    activeDirtyContexts: [],
  };
}

interface InstallEnvironmentAssessment {
  isInstalledStandalone: boolean;
  canTriggerInstallPrompt: boolean;
  isIosSafari: boolean;
  statusLabelUk: string;
  fallbackInstructionsUk: string;
  honestLimitationsUk: string;
}

/**
 * 12.1 DEPLOYMENT: Pure detector for PWA installation state and platform-honest
 * Ukrainian fallback instructions without Apple branding or false OS launch promises.
 */
function detectInstallEnvironment(params: {
  userAgent: string;
  isStandaloneMediaMatch: boolean;
  navigatorStandalone?: boolean;
  hasBeforeInstallPrompt: boolean;
}): InstallEnvironmentAssessment {
  const isInstalledStandalone =
    Boolean(params.isStandaloneMediaMatch) ||
    params.navigatorStandalone === true;

  const ua = (params.userAgent || '').toLowerCase();
  const isIosDevice = /iphone|ipad|ipod/.test(ua);
  const isWebKit = /webkit/.test(ua) && !/crios|fxios|edgios|opios/.test(ua);
  const isIosSafari = isIosDevice && isWebKit;

  const statusLabelUk = isInstalledStandalone
    ? 'Запущено як встановлений застосунок (автономний режим вікна)'
    : params.hasBeforeInstallPrompt
    ? 'Доступне пряме встановлення застосунку з браузера'
    : 'Робота у вкладці браузера (доступне ручне додавання на екран)';

  const fallbackInstructionsUk = isIosDevice
    ? 'Щоб додати PLANUI на початковий екран смартфона чи планшета: відкрийте меню «Поділитися» у панелі браузера та оберіть пункт «На початковий екран» («Add to Home Screen»).'
    : 'Щоб встановити PLANUI як окремий застосунок: скористайтеся кнопкою «Встановити застосунок» нижче або відкрийте меню браузера (⋮) і оберіть «Встановити застосунок» / «Додати на головний екран».';

  const honestLimitationsUk =
    'Офлайн-режим працює для всього інтерфейсу, списку бажань, точних цін і резервного копіювання ZIP лише після першого успішного завантаження ресурсів через HTTPS. Зовнішні вебпосилання потребують мережі. Кеш ресурсів інтерфейсу відокремлений від вашої бази даних IndexedDB.';

  return {
    isInstalledStandalone,
    canTriggerInstallPrompt:
      !isInstalledStandalone && Boolean(params.hasBeforeInstallPrompt),
    isIosSafari,
    statusLabelUk,
    fallbackInstructionsUk,
    honestLimitationsUk,
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type ServiceWorkerCacheStatus =
  | 'unsupported'
  | 'registering'
  | 'cached_ready'
  | 'update_available'
  | 'error';

export interface PwaLifecycleState {
  isOnline: boolean;
  swStatus: ServiceWorkerCacheStatus;
  hasWaitingUpdate: boolean;
  installAssessment: InstallEnvironmentAssessment;
  updateSafety: UpdateReloadSafetyEvaluation;
  triggerInstallPrompt: () => Promise<boolean>;
  applyWaitingUpdateSafely: () => void;
}

export function usePwaLifecycle(
  dirtyEditors: readonly DirtyEditorKind[]
): PwaLifecycleState {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;
    const navStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true;
    return mql || navStandalone;
  });
  const [swStatus, setSwStatus] = useState<ServiceWorkerCacheStatus>(() =>
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? 'registering'
      : 'unsupported'
  );
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    let mql: MediaQueryList | null = null;
    const handleDisplayModeChange = (ev: MediaQueryListEvent) => {
      setIsStandalone(ev.matches);
    };
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(display-mode: standalone)');
      mql.addEventListener('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mql) {
        mql.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setSwStatus('unsupported');
      return;
    }

    // Development uses Vite HMR directly, without a persistent asset worker.
    if (import.meta.env.DEV) { setSwStatus('unsupported'); return; }

    let isMounted = true;
    let registration: ServiceWorkerRegistration | null = null;
    const checkUpdate = () => {
      if (document.visibilityState !== 'visible') return;
      const syncWaiting = () => { if (isMounted && registration?.waiting) { setWaitingWorker(registration.waiting); setSwStatus('update_available'); } };
      syncWaiting();
      void registration?.update().then(syncWaiting).catch(() => {});
    };

    const registerSw = async () => {
      try {
        const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
          updateViaCache: 'none',
        });
        if (!isMounted) return;
        registration = reg;
        window.addEventListener('online', checkUpdate);
        window.addEventListener('focus', checkUpdate);
        document.addEventListener('visibilitychange', checkUpdate);

        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setSwStatus('update_available');
        } else if (reg.active) {
          setSwStatus('cached_ready');
        }

        const observeInstalling = () => {
          const installing = reg.installing;
          if (!installing) return;
          const inspectState = () => {
            if (!isMounted) return;
            if (installing.state === 'redundant' && !reg.active) setSwStatus('error');
            if (installing.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                setWaitingWorker(reg.waiting ?? installing);
                setSwStatus('update_available');
              } else {
                setSwStatus('cached_ready');
              }
            }
          };
          installing.addEventListener('statechange', inspectState);
          inspectState();
        };
        reg.addEventListener('updatefound', observeInstalling);
        observeInstalling();

      } catch {
        if (isMounted) {
          setSwStatus('error');
        }
      }
    };

    void registerSw();

    return () => {
      isMounted = false;
      window.removeEventListener('online', checkUpdate);
      window.removeEventListener('focus', checkUpdate);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, []);

  const [overlayOpen, setOverlayOpen] = useState<boolean>(() => hasOpenOverlay());

  useEffect(() => {
    setOverlayOpen(hasOpenOverlay());
    return subscribeOverlayStack(() => {
      setOverlayOpen(hasOpenOverlay());
    });
  }, []);

  const effectiveDirtyEditors: readonly DirtyEditorKind[] = overlayOpen
    ? Array.from(new Set<DirtyEditorKind>([...dirtyEditors, 'shared_modal_editor']))
    : dirtyEditors;

  const installAssessment = detectInstallEnvironment({
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    isStandaloneMediaMatch: isStandalone,
    navigatorStandalone:
      typeof navigator !== 'undefined'
        ? (navigator as unknown as { standalone?: boolean }).standalone
        : false,
    hasBeforeInstallPrompt: Boolean(deferredPrompt),
  });

  const updateSafety = evaluateUpdateReloadSafety({
    hasWaitingWorker: Boolean(waitingWorker),
    dirtyEditors: effectiveDirtyEditors,
  });

  const triggerInstallPrompt = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsStandalone(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const applyWaitingUpdateSafely = useCallback(() => {
    const safety = evaluateUpdateReloadSafety({
      hasWaitingWorker: Boolean(waitingWorker),
      dirtyEditors: hasOpenOverlay()
        ? Array.from(new Set<DirtyEditorKind>([...dirtyEditors, 'shared_modal_editor']))
        : dirtyEditors,
    });
    if (!safety.canReloadNow || !waitingWorker) {
      throw new PlanuiError('UPDATE_BLOCKED_BY_DIRTY_EDITOR');
    }
    const handleControllerChange = () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      );
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange
    );
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingWorker, dirtyEditors]);

  return {
    isOnline,
    swStatus,
    hasWaitingUpdate: Boolean(waitingWorker),
    installAssessment,
    updateSafety,
    triggerInstallPrompt,
    applyWaitingUpdateSafely,
  };
}
