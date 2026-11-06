import {Icon} from '../ui/icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  PlanuiDomainSnapshot,
  PlanuiSettings,
  RecoverySnapshotRecord,
  SUPPORTED_CURRENCIES,
  SupportedCurrencyCode,
  ThemePreference,
} from '../domain/types';
import {
  detectDeviceTimeZone,
  isValidIanaZone,
} from '../domain/temporal';
import { PlanuiError } from '../i18n/errorsUk';
import { formatInstant } from '../lib/format';
import { downloadPersonalRecords, downloadPersonalRecordsCsv } from '../domain/stateCheckIns';
import { PwaLifecycleState } from '../pwa/pwaController';
import { PwaInstallAndOfflineView } from '../components/pwa/PwaStatusAndInstallCard';
import {
  applyThemeAndAccessibilityToDocument,
} from '../state/shellStore';
import {
  deleteRecoverySnapshotTransactionally,
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  exportRecoverySnapshotZip,
  MAX_RECOVERY_SNAPSHOTS,
  resetAllPlanuiDataTransactionally,
  restoreFromRecoverySnapshotTransactionally,
  validateBackupArchive,
  ValidatedBackupPreview,
} from '../storage/backup/backupService';
import { PlanuiRepositories } from '../storage/repositories';
import {
  Disclosure,
  Row,
  Section,
  Segmented,
  SelectField,
  Sheet,
  Toggle,
} from '../ui';

const COMMON_IANA_TIMEZONES = [
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Prague',
  'Europe/Vienna',
  'Europe/Vilnius',
  'Europe/Riga',
  'Europe/Tallinn',
  'Europe/Bucharest',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Tokyo',
  'UTC',
] as const;

function getErrorMessageUk(err: unknown): string {
  return err instanceof Error ? err.message : 'Сталася неочікувана помилка.';
}

export interface BasicSettingsViewProps {
  settings: PlanuiSettings;
  activeZone: string;
  snapshot: PlanuiDomainSnapshot;
  recoverySnapshots: RecoverySnapshotRecord[];
  repositories: PlanuiRepositories;
  onSettingsUpdated: (patch: Partial<PlanuiSettings>) => void;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  onOpenWorkRoster: () => void;
  onOpenHabits: () => void;
  onOpenWishlistCategories: () => void;
  onConfirmationStateChange?: (open: boolean) => void;
  pwaState?: PwaLifecycleState;
}

interface StoragePersistenceEstimate {
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

function formatBytesUk(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'Невідомо';
  }
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} КБ`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} МБ`;
}

function formatSnapshotReasonUk(reason: RecoverySnapshotRecord['reason']): string {
  switch (reason) {
    case 'pre_import_replacement':
      return 'Перед імпортом ZIP';
    case 'pre_recovery_restore':
      return 'Перед відновленням';
    case 'pre_reset':
      return 'Перед очищенням';
  }
}

function triggerBrowserZipDownload(zipBytes: Uint8Array, filename: string): void {
  const blob = new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/zip',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function canShareZipFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const testFile = new File([new Uint8Array([80, 75, 5, 6])], 'test.zip', {
      type: 'application/zip',
    });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

async function shareBrowserZipFile(
  zipBytes: Uint8Array,
  filename: string,
  titleUk: string
): Promise<boolean> {
  if (!canShareZipFiles()) return false;
  const file = new File([zipBytes as unknown as BlobPart], filename, {
    type: 'application/zip',
  });
  await navigator.share({
    title: titleUk,
    files: [file],
  });
  return true;
}

export const BasicSettingsView: React.FC<BasicSettingsViewProps> = ({
  settings,
  activeZone,
  snapshot,
  recoverySnapshots,
  repositories,
  onSettingsUpdated,
  onDataReplacedOrReset,
  onOpenWorkRoster,
  onOpenHabits,
  onOpenWishlistCategories,
  onConfirmationStateChange,
  pwaState,
}) => {
  const [customZoneInput, setCustomZoneInput] = useState<string>(
    settings.manualTimeZone ?? activeZone
  );
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Sheet states
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [storageSheetOpen, setStorageSheetOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Storage & Persistence state
  const [storageEstimate, setStorageEstimate] = useState<StoragePersistenceEstimate>({
    persisted: null,
    usageBytes: null,
    quotaBytes: null,
  });
  const [isRequestingPersistence, setIsRequestingPersistence] = useState(false);

  // Backup / Import / Restore / Reset state
  const [isBusyBackup, setIsBusyBackup] = useState(false);
  const [backupErrorUk, setBackupErrorUk] = useState<string | null>(null);
  const [backupSuccessUk, setBackupSuccessUk] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<ValidatedBackupPreview | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);

  // Recovery snapshot confirmation states
  const [confirmRestoreSnapshotId, setConfirmRestoreSnapshotId] = useState<string | null>(null);
  const [confirmDeleteOnlySnapshotId, setConfirmDeleteOnlySnapshotId] = useState<string | null>(null);

  // Reset all data confirmation states
  const [resetSnapshotHandling, setResetSnapshotHandling] = useState<
    'create_pre_reset_snapshot' | 'clear_all_snapshots'
  >('create_pre_reset_snapshot');
  const [resetConfirmedCheckbox, setResetConfirmedCheckbox] = useState(false);

  useEffect(() => {
    const anyConfirmationOpen = Boolean(
      pendingPreview ||
        confirmRestoreSnapshotId ||
        confirmDeleteOnlySnapshotId ||
        showResetConfirm ||
        backupSheetOpen ||
        storageSheetOpen
    );
    onConfirmationStateChange?.(anyConfirmationOpen);
    return () => onConfirmationStateChange?.(false);
  }, [
    pendingPreview,
    confirmRestoreSnapshotId,
    confirmDeleteOnlySnapshotId,
    showResetConfirm,
    backupSheetOpen,
    storageSheetOpen,
    onConfirmationStateChange,
  ]);

  const refreshStorageEstimate = async () => {
    if (typeof navigator === 'undefined' || !navigator.storage) return;
    try {
      const persisted =
        typeof navigator.storage.persisted === 'function'
          ? await navigator.storage.persisted()
          : null;
      const estimate =
        typeof navigator.storage.estimate === 'function'
          ? await navigator.storage.estimate()
          : null;
      setStorageEstimate({
        persisted,
        usageBytes: estimate?.usage ?? null,
        quotaBytes: estimate?.quota ?? null,
      });
    } catch {
      // Ignore browser storage inspection errors
    }
  };

  useEffect(() => {
    void refreshStorageEstimate();
  }, [snapshot.settings.dbGeneration, recoverySnapshots.length]);

  useEffect(() => {
    return () => {
      validationAbortRef.current?.abort();
    };
  }, []);

  const handleRequestPersistentStorage = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.persist !== 'function'
    ) {
      return;
    }
    setIsRequestingPersistence(true);
    try {
      await navigator.storage.persist();
      await refreshStorageEstimate();
    } catch {
      // Ignore
    } finally {
      setIsRequestingPersistence(false);
    }
  };

  const persistPatch = async (patch: Partial<PlanuiSettings>) => {
    setIsSavingSettings(true);
    setZoneError(null);
    try {
      const nowIso = new Date().toISOString();
      const updated = await repositories.updateSettingsPatch(patch, nowIso);
      applyThemeAndAccessibilityToDocument(
        updated.theme,
        updated.reducedMotionOverride,
        updated.reducedTransparencyOverride
      );
      onSettingsUpdated(patch);
    } catch (err) {
      setZoneError(getErrorMessageUk(err));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    await persistPatch({ theme });
  };

  const handleAccessibilityChange = async (
    key: 'reducedMotionOverride' | 'reducedTransparencyOverride',
    value: boolean
  ) => {
    await persistPatch({ [key]: value });
  };

  const handleModuleToggle = async (
    key: 'habitsEnabled' | 'stateCheckInsEnabled' | 'desiredLifeEnabled' | 'wishlistEnabled',
    enabled: boolean
  ) => {
    const currentModules = settings.modules ?? {
      habitsEnabled: false,
      stateCheckInsEnabled: false,
      desiredLifeEnabled: false,
      wishlistEnabled: false,
      userConfigured: true,
    };
    await persistPatch({
      modules: {
        ...currentModules,
        [key]: enabled,
        userConfigured: true,
      },
    });
  };

  const handleTimeZoneModeChange = async (mode: 'device' | 'manual') => {
    setZoneError(null);
    if (mode === 'device') {
      const detected = detectDeviceTimeZone() ?? activeZone;
      await persistPatch({
        timeZoneMode: 'device',
        manualTimeZone: null,
        lastDetectedTimeZone: detected,
      });
    } else {
      const candidate = settings.manualTimeZone ?? activeZone;
      setCustomZoneInput(candidate);
      await persistPatch({
        timeZoneMode: 'manual',
        manualTimeZone: candidate,
        lastDetectedTimeZone: candidate,
      });
    }
  };

  const handleSelectManualZone = async (zone: string) => {
    setCustomZoneInput(zone);
    if (!isValidIanaZone(zone)) {
      setZoneError(`Недійсний ідентифікатор часового поясу: ${zone}`);
      return;
    }
    await persistPatch({
      timeZoneMode: 'manual',
      manualTimeZone: zone,
      lastDetectedTimeZone: zone,
    });
  };

  const handlePreferredCurrencyChange = async (rawValue: string) => {
    const nextCurrency: SupportedCurrencyCode | null = rawValue
      ? (rawValue as SupportedCurrencyCode)
      : null;
    await persistPatch({ preferredWishlistCurrency: nextCurrency });
  };

  // Backup handlers
  const handleExportFullBackup = async () => {
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      const nowIso = new Date().toISOString();
      const { zipBytes } = await exportFullBackupZip(repositories, nowIso);
      const dateStamp = nowIso.slice(0, 10);
      triggerBrowserZipDownload(zipBytes, `planui-backup-${dateStamp}.zip`);
      setBackupSuccessUk('Резервну копію ZIP сформовано та завантажено.');
    } catch (err) {
      setBackupErrorUk(getErrorMessageUk(err));
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleShareFullBackup = async () => {
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      const nowIso = new Date().toISOString();
      const { zipBytes } = await exportFullBackupZip(repositories, nowIso);
      const dateStamp = nowIso.slice(0, 10);
      const shared = await shareBrowserZipFile(
        zipBytes,
        `planui-backup-${dateStamp}.zip`,
        'Резервна копія PLANUI'
      );
      if (shared) {
        setBackupSuccessUk('Резервну копію ZIP передано через меню поширення.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setBackupErrorUk(getErrorMessageUk(err));
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleBackupFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupSheetOpen(true);
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setPendingPreview(null);
    setPendingFileName(file.name);
    setIsBusyBackup(true);

    validationAbortRef.current?.abort();
    const abortController = new AbortController();
    validationAbortRef.current = abortController;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zipBytes = new Uint8Array(arrayBuffer);
      const preview = await validateBackupArchive(
        zipBytes,
        undefined,
        abortController.signal
      );
      setPendingPreview(preview);
    } catch (err) {
      setBackupErrorUk(getErrorMessageUk(err));
      setPendingFileName(null);
    } finally {
      setIsBusyBackup(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCancelImportPreview = () => {
    validationAbortRef.current?.abort();
    setPendingPreview(null);
    setPendingFileName(null);
    setBackupErrorUk(null);
  };

  const handleConfirmImportReplacement = async () => {
    if (!pendingPreview) return;
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      await executeAtomicBackupReplacement(repositories, pendingPreview, {
        explicitUserConfirmation: true,
        nowIso: new Date().toISOString(),
      });
      setPendingPreview(null);
      setPendingFileName(null);
      setBackupSheetOpen(false);
      await onDataReplacedOrReset('Дані відновлено з резервної копії ZIP.');
    } catch (err) {
      setBackupErrorUk(getErrorMessageUk(err));
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleExportRecoverySnapshot = async (snapshotId: string) => {
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      const nowIso = new Date().toISOString();
      const { zipBytes, recoveryRecord } = await exportRecoverySnapshotZip(
        repositories,
        snapshotId,
        nowIso
      );
      const dateStamp = recoveryRecord.createdAt.slice(0, 10);
      triggerBrowserZipDownload(
        zipBytes,
        `planui-recovery-${dateStamp}-${snapshotId.slice(-6)}.zip`
      );
      setBackupSuccessUk('Знімок відновлення експортовано у ZIP.');
    } catch (err) {
      setBackupErrorUk(getErrorMessageUk(err));
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleConfirmRestoreSnapshot = async (snapshotId: string) => {
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      await restoreFromRecoverySnapshotTransactionally(
        repositories,
        snapshotId,
        {
          explicitUserConfirmation: true,
          nowIso: new Date().toISOString(),
        }
      );
      setConfirmRestoreSnapshotId(null);
      setBackupSheetOpen(false);
      await onDataReplacedOrReset('Дані відновлено з точки відновлення.');
    } catch (err) {
      setBackupErrorUk(getErrorMessageUk(err));
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleDeleteRecoverySnapshot = async (
    snapshotId: string,
    allowOnlyPoint: boolean
  ) => {
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      await deleteRecoverySnapshotTransactionally(repositories, snapshotId, {
        allowDeleteOnlyRecoveryPoint: allowOnlyPoint,
      });
      setConfirmDeleteOnlySnapshotId(null);
      await onDataReplacedOrReset('Точку відновлення видалено.');
    } catch (err) {
      if (
        err instanceof PlanuiError &&
        err.code === 'ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED'
      ) {
        setConfirmDeleteOnlySnapshotId(snapshotId);
      } else {
        setBackupErrorUk(getErrorMessageUk(err));
      }
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleConfirmResetAllData = async () => {
    if (!resetConfirmedCheckbox) return;
    setBackupErrorUk(null);
    setBackupSuccessUk(null);
    setIsBusyBackup(true);
    try {
      await resetAllPlanuiDataTransactionally(repositories, {
        explicitUserConfirmation: true,
        snapshotHandling: resetSnapshotHandling,
        nowIso: new Date().toISOString(),
      });
      setShowResetConfirm(false);
      setResetConfirmedCheckbox(false);
      await onDataReplacedOrReset('Усі локальні дані очищено.');
    } catch (err) {
      setBackupErrorUk(getErrorMessageUk(err));
    } finally {
      setIsBusyBackup(false);
    }
  };

  const manualZoneOptions = [
    ...COMMON_IANA_TIMEZONES.map((z) => ({ value: z, label: z })),
    ...(customZoneInput &&
    !(COMMON_IANA_TIMEZONES as readonly string[]).includes(customZoneInput)
      ? [{ value: customZoneInput, label: customZoneInput }]
      : []),
  ];

  return (
    <div
      className="space-y-5"
      data-testid="basic-settings-view"
      data-ui="content-start"
    >
      {/* Hidden ZIP input mounted at root so automated tests or sheet buttons can trigger it */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleBackupFileSelected}
        disabled={isBusyBackup}
        className="hidden"
        data-testid="import-backup-file-input"
      />

      {/* 1. РОЗДІЛИ */}
      <div className="space-y-2" data-testid="optional-modules-settings">
        <Section title="Розділи">
          <Row
            title="Звички"
            secondary="Регулярні дії без жорстких слотів"
            trailing={
              <Toggle
                label="Звички"
                checked={settings.modules?.habitsEnabled ?? false}
                onChange={(v) => void handleModuleToggle('habitsEnabled', v)}
                disabled={isSavingSettings}
                testId="toggle-module-habits"
              />
            }
          />
          <Row
            title="Стан"
            secondary="Самопочуття, енергія, напруга та сон"
            trailing={
              <Toggle
                label="Стан"
                checked={settings.modules?.stateCheckInsEnabled ?? false}
                onChange={(v) => void handleModuleToggle('stateCheckInsEnabled', v)}
                disabled={isSavingSettings}
                testId="toggle-module-state-check-ins"
              />
            }
          />
          <Row
            title="Моє бажане життя"
            secondary="Описи, фото, цитати й орієнтири"
            trailing={
              <Toggle
                label="Моє бажане життя"
                checked={settings.modules?.desiredLifeEnabled ?? false}
                onChange={(v) => void handleModuleToggle('desiredLifeEnabled', v)}
                disabled={isSavingSettings}
                testId="toggle-module-desired-life"
              />
            }
          />
          <Row
            title="Список бажань"
            secondary="Бажані речі та ідеї без бюджетів"
            trailing={
              <Toggle
                label="Список бажань"
                checked={settings.modules?.wishlistEnabled ?? false}
                onChange={(v) => void handleModuleToggle('wishlistEnabled', v)}
                disabled={isSavingSettings}
                testId="toggle-module-wishlist"
              />
            }
          />
        </Section>
        <p className="text-xs text-[var(--text-secondary)] px-1">
          Вимкнення лише ховає розділ, дані зберігаються
        </p>
      </div>

      {/* 2. ВИГЛЯД */}
      <Section title="Вигляд">
        <div className="p-3">
          <Segmented<ThemePreference>
            label="Тема оформлення"
            value={settings.theme}
            onChange={(theme) => void handleThemeChange(theme)}
            options={[
              { value: 'system', label: 'Системна' },
              { value: 'light', label: 'Світла' },
              { value: 'dark', label: 'Темна' },
            ]}
          />
        </div>
        <Row
          title="Зменшити рух"
          secondary="Плавні переходи без анімацій"
          trailing={
            <Toggle
              label="Зменшити рух"
              checked={settings.reducedMotionOverride}
              onChange={(v) =>
                void handleAccessibilityChange('reducedMotionOverride', v)
              }
              disabled={isSavingSettings}
              testId="toggle-reduced-motion"
            />
          }
        />
        <Row
          title="Зменшити прозорість"
          secondary="Суцільний фон замість скла"
          trailing={
            <Toggle
              label="Зменшити прозорість"
              checked={settings.reducedTransparencyOverride}
              onChange={(v) =>
                void handleAccessibilityChange('reducedTransparencyOverride', v)
              }
              disabled={isSavingSettings}
              testId="toggle-reduced-transparency"
            />
          }
        />
      </Section>

      {/* 3. ЧАС */}
      <Section title="Час">
        <Row
          title="Часовий пояс"
          secondary={
            settings.timeZoneMode === 'device'
              ? 'За пристроєм'
              : 'Обраний вручну'
          }
          trailing={
            <span
              className="text-sm font-medium text-[var(--text-primary)]"
              data-testid="active-iana-zone"
            >
              {activeZone}
            </span>
          }
        />
        <div className="p-3 border-t border-[var(--border-subtle)]">
          <Segmented<'device' | 'manual'>
            label="Режим часового поясу"
            value={settings.timeZoneMode}
            onChange={(mode) => void handleTimeZoneModeChange(mode)}
            options={[
              { value: 'device', label: 'За пристроєм' },
              { value: 'manual', label: 'Вручну' },
            ]}
          />
        </div>
        {settings.timeZoneMode === 'manual' && (
          <div className="border-t border-[var(--border-subtle)]">
            <SelectField
              label="Обрати пояс"
              value={customZoneInput}
              onChange={(e) => void handleSelectManualZone(e.target.value)}
              options={manualZoneOptions}
              data-testid="manual-timezone-select"
            />
          </div>
        )}
        {zoneError && (
          <p role="alert" className="text-xs text-[var(--color-danger)] px-4 pb-3">
            {zoneError}
          </p>
        )}
      </Section>

      {/* 4. ПРИВАТНІСТЬ І ДАНІ */}
      <Section title="Приватність і дані">
        <Row
          title="Резервна копія"
          secondary="Експорт ZIP, відновлення, JSON і CSV"
          trailing={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleExportFullBackup()}
                disabled={isBusyBackup}
                data-testid={!backupSheetOpen ? 'export-backup-zip-button' : undefined}
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40"
              >
                ZIP
              </button>
              <button
                type="button"
                onClick={() => setBackupSheetOpen(true)}
                data-testid="open-backup-sheet-button"
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)]"
              >
                Відкрити
              </button>
            </div>
          }
        />

        <Disclosure
          title="Сховище"
          secondary={
            storageEstimate.persisted === true
              ? 'Постійне сховище захищено'
              : 'Локальна база на пристрої'
          }
          onClick={() => setStorageSheetOpen(true)}
          testId="open-storage-sheet-button"
        />

        {settings.modules?.wishlistEnabled !== false && (
          <SelectField
            label="Валюта бажань"
            value={settings.preferredWishlistCurrency ?? ''}
            onChange={(e) => void handlePreferredCurrencyChange(e.target.value)}
            data-testid="settings-preferred-currency-select"
            options={[
              { value: '', label: 'Без валюти' },
              ...Object.values(SUPPORTED_CURRENCIES).map((spec) => ({
                value: spec.code,
                label: spec.labelUk,
              })),
            ]}
          />
        )}

        <Disclosure
          title="Графік роботи та зміни"
          secondary="Шаблони змін і вихідні"
          onClick={onOpenWorkRoster}
          testId="settings-open-roster"
        />

        {settings.modules?.habitsEnabled !== false && (
          <Disclosure
            title="Керування звичками"
            secondary="Правила, пауза та архів"
            onClick={onOpenHabits}
            testId="settings-open-habits"
          />
        )}

        {settings.modules?.wishlistEnabled !== false && (
          <Disclosure
            title="Категорії списку бажань"
            secondary="Власні категорії бажань"
            onClick={onOpenWishlistCategories}
            testId="settings-open-wishlist-categories"
          />
        )}

        <Row
          title="Версія застосунку"
          secondary="Усі дані зберігаються локально"
          trailing={
            <span className="text-xs text-[var(--text-secondary)]">
              v{settings.appVersion} · сx. {settings.dbSchemaVersion}
            </span>
          }
        />

        <Disclosure
          title="Стерти всі дані"
          secondary="Очистити локальну базу на пристрої"
          onClick={() => {
            setShowResetConfirm(true);
            setResetConfirmedCheckbox(false);
          }}
          testId="open-reset-confirm-button"
        />
      </Section>

      {/* PWA offline & install status */}
      {pwaState && <PwaInstallAndOfflineView pwaState={pwaState} />}

      {/* SHEET 1: РЕЗЕРВНА КОПІЯ */}
      <Sheet
        title="Резервна копія"
        isOpen={backupSheetOpen}
        onClose={() => {
          if (!isBusyBackup) {
            setBackupSheetOpen(false);
          }
        }}
      >
        <div className="space-y-4">
          {backupErrorUk && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)]"
              data-testid="backup-error-banner"
            >
              {backupErrorUk}
            </div>
          )}

          {backupSuccessUk && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-500"
              data-testid="backup-success-banner"
            >
              {backupSuccessUk}
            </div>
          )}

          <Section title="Архів ZIP">
            <Row
              title="Експорт ZIP"
              secondary="Усі дані та локальні фото"
              trailing={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleExportFullBackup()}
                    disabled={isBusyBackup}
                    data-testid={backupSheetOpen ? 'export-backup-zip-button' : undefined}
                    className="ui-primary text-xs px-4 py-2"
                  >
                    Експорт ZIP
                  </button>
                  {canShareZipFiles() && (
                    <button
                      type="button"
                      onClick={() => void handleShareFullBackup()}
                      disabled={isBusyBackup}
                      data-testid="share-backup-zip-button"
                      className="min-h-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium"
                    >
                      Поділитися
                    </button>
                  )}
                </div>
              }
            />
            <Row
              title="Відновлення з ZIP"
              secondary="Перевірка перед заміною"
              trailing={
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusyBackup}
                  data-testid="trigger-import-backup-button"
                  className="min-h-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium"
                >
                  Обрати файл
                </button>
              }
            />
          </Section>

          {pendingPreview && (
            <div
              className="p-3.5 rounded-2xl border border-[var(--color-brand)]/40 bg-[var(--bg-elevated)] space-y-3"
              data-testid="import-replacement-preview"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Підтвердження заміни ({pendingFileName})
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Створено:{' '}
                {formatInstant(pendingPreview.manifest.createdAt, activeZone, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                · Розархівовано: {formatBytesUk(pendingPreview.totalExpandedBytes)}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Завдань: {pendingPreview.snapshot.tasks.length} · Подій:{' '}
                {pendingPreview.snapshot.events.length} · Бажань:{' '}
                {pendingPreview.snapshot.wishes.length}
              </p>
              {pendingPreview.warningsUk && pendingPreview.warningsUk.length > 0 && (
                <div className="space-y-1 text-xs text-amber-500">
                  {pendingPreview.warningsUk.map((w, idx) => (
                    <p key={idx}>{w}</p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleConfirmImportReplacement()}
                  disabled={isBusyBackup}
                  data-testid="confirm-import-replacement-button"
                  className="ui-primary text-xs px-4 py-2"
                >
                  Замінити локальні дані
                </button>
                <button
                  type="button"
                  onClick={handleCancelImportPreview}
                  disabled={isBusyBackup}
                  data-testid="cancel-import-preview-button"
                  className="min-h-[44px] px-4 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-medium"
                 aria-label="Скасувати">
                  <Icon name="x"/>
                </button>
              </div>
            </div>
          )}

          <Section title="JSON-CSV експорт">
            <Row
              title="Особисті записи та стан"
              secondary={`Усього записів: ${snapshot.personalRecords.length}`}
              trailing={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      downloadPersonalRecords(
                        snapshot.personalRecords,
                        snapshot.personalRecords.map((r) => r.id)
                      )
                    }
                    data-testid="settings-export-records-json"
                    className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium"
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadPersonalRecordsCsv(
                        snapshot.personalRecords,
                        snapshot.personalRecords.map((r) => r.id)
                      )
                    }
                    data-testid="settings-export-records-csv"
                    className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium"
                  >
                    CSV
                  </button>
                </div>
              }
            />
          </Section>

          <Section
            title={`Точки відновлення (${recoverySnapshots.length}/${MAX_RECOVERY_SNAPSHOTS})`}
          >
            {recoverySnapshots.length === 0 ? (
              <Row
                title="Точок відновлення поки немає"
                secondary="Створюються автоматично перед імпортом"
              />
            ) : (
              recoverySnapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="p-3 border-b last:border-b-0 border-[var(--border-subtle)] space-y-2"
                  data-testid={`recovery-snapshot-item-${snap.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {formatSnapshotReasonUk(snap.reason)}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {formatInstant(snap.createdAt, activeZone, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · Завдань: {snap.snapshot.tasks.length}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreSnapshotId(snap.id)}
                        disabled={isBusyBackup}
                        data-testid={`restore-recovery-snapshot-${snap.id}`}
                        className="min-h-[44px] px-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-medium"
                      >
                        Відновити
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportRecoverySnapshot(snap.id)}
                        disabled={isBusyBackup}
                        data-testid={`export-recovery-snapshot-${snap.id}`}
                        className="min-h-[44px] px-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-medium"
                      >
                        ZIP
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleDeleteRecoverySnapshot(snap.id, false)
                        }
                        disabled={isBusyBackup}
                        data-testid={`delete-recovery-snapshot-${snap.id}`}
                        className="min-h-[44px] px-2.5 rounded-xl text-xs font-medium text-[var(--color-danger)]"
                      >
                        <Icon name="x"/>
                      </button>
                    </div>
                  </div>

                  {confirmRestoreSnapshotId === snap.id && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] space-y-2">
                      <p className="text-xs text-[var(--text-secondary)]">
                        Поточні дані буде збережено у нову точку відновлення.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleConfirmRestoreSnapshot(snap.id)
                          }
                          disabled={isBusyBackup}
                          data-testid={`confirm-restore-snapshot-${snap.id}`}
                          className="ui-primary text-xs px-3 py-2"
                        >
                          Підтвердити відновлення
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRestoreSnapshotId(null)}
                          className="min-h-[44px] px-3 rounded-xl text-xs"
                         aria-label="Скасувати">
                          <Icon name="x"/>
                        </button>
                      </div>
                    </div>
                  )}

                  {confirmDeleteOnlySnapshotId === snap.id && (
                    <div className="p-2.5 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 space-y-2">
                      <p className="text-xs text-[var(--color-danger)]">
                        Це єдина точка відновлення. Видалити її остаточно?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteRecoverySnapshot(snap.id, true)
                          }
                          disabled={isBusyBackup}
                          data-testid={`confirm-delete-only-snapshot-${snap.id}`}
                          className="min-h-[44px] px-3 rounded-xl bg-[var(--color-danger)] text-white text-xs font-medium"
                        >
                          Видалити єдину точку
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteOnlySnapshotId(null)}
                          className="min-h-[44px] px-3 rounded-xl text-xs"
                         aria-label="Скасувати">
                          <Icon name="x"/>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </Section>
        </div>
      </Sheet>

      {/* SHEET 2: СХОВИЩЕ */}
      <Sheet
        title="Сховище"
        isOpen={storageSheetOpen}
        onClose={() => setStorageSheetOpen(false)}
      >
        <div className="space-y-4">
          <Section title="Стан сховища браузера">
            <Row
              title="Постійне сховище"
              trailing={
                <span
                  className="text-xs font-medium"
                  data-testid="persistent-storage-status"
                >
                  {storageEstimate.persisted === true
                    ? 'Захищено'
                    : storageEstimate.persisted === false
                    ? 'Стандартний режим'
                    : 'Перевірка…'}
                </span>
              }
            />
            <Row
              title="Використано"
              trailing={
                <span
                  className="text-xs text-[var(--text-secondary)]"
                  data-testid="storage-usage-quota"
                >
                  {formatBytesUk(storageEstimate.usageBytes)} з{' '}
                  {formatBytesUk(storageEstimate.quotaBytes)}
                </span>
              }
            />
            {storageEstimate.persisted !== true && (
              <Row
                title="Захист від автоочищення"
                trailing={
                  <button
                    type="button"
                    onClick={() => void handleRequestPersistentStorage()}
                    disabled={isRequestingPersistence}
                    data-testid="request-persistent-storage-button"
                    className="min-h-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium"
                  >
                    {isRequestingPersistence ? 'Запит…' : 'Запросити захист'}
                  </button>
                }
              />
            )}
          </Section>

          <Section title="Обсяг записів на пристрої">
            <Row
              title="Напрями, цілі, проєкти"
              trailing={`${snapshot.folders.length} / ${snapshot.goals?.length ?? 0} / ${snapshot.projects.length}`}
            />
            <Row
              title="Завдання та події"
              trailing={`${snapshot.tasks.length} / ${snapshot.events.length}`}
            />
            <Row
              title="Звички та записи стану"
              trailing={`${snapshot.habits.length} / ${snapshot.personalRecords.length}`}
            />
            <Row
              title="Натхнення та бажання"
              trailing={`${snapshot.inspirationItems.length} / ${snapshot.wishes.length}`}
            />
          </Section>
        </div>
      </Sheet>

      {/* SHEET 3: СТЕРТИ ВСІ ДАНІ (Double-Confirm Sheet) */}
      <Sheet
        title="Стерти всі дані"
        isOpen={showResetConfirm}
        onClose={() => {
          if (!isBusyBackup) {
            setShowResetConfirm(false);
            setResetConfirmedCheckbox(false);
          }
        }}
      >
        <div className="space-y-4" data-testid="reset-confirmation-dialog">
          <p className="text-sm text-[var(--text-secondary)]">
            Усі завдання, події, звички, нотатки та бажання буде видалено з цього пристрою.
          </p>

          <Section title="1. Точки відновлення">
            <div className="p-3">
              <Segmented<'create_pre_reset_snapshot' | 'clear_all_snapshots'>
                label="Точки відновлення перед очищенням"
                value={resetSnapshotHandling}
                onChange={setResetSnapshotHandling}
                options={[
                  { value: 'create_pre_reset_snapshot', label: 'Зберегти копію' },
                  { value: 'clear_all_snapshots', label: 'Видалити все' },
                ]}
              />
            </div>
          </Section>

          <Section title="2. Підтвердження">
            <Row
              title="Я розумію, що дані буде очищено"
              trailing={
                <Toggle
                  label="Я розумію, що локальні дані буде очищено"
                  checked={resetConfirmedCheckbox}
                  onChange={setResetConfirmedCheckbox}
                  disabled={isBusyBackup}
                  testId="reset-explicit-confirm-checkbox"
                />
              }
            />
          </Section>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleConfirmResetAllData()}
              disabled={!resetConfirmedCheckbox || isBusyBackup}
              data-testid="confirm-reset-all-data-button"
              className="w-full min-h-[44px] rounded-full bg-[var(--color-danger)] text-[var(--btn-primary-fg)] font-semibold px-5 py-3 disabled:opacity-40"
            >
              Підтвердити очищення даних
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
