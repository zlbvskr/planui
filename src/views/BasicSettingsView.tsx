import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  ShieldAlert,
  Database,
  Sun,
  Globe,
  Eye,
  Gift,
  Sliders,
  Share2,
  RotateCcw,
  Trash2,
  XCircle,
  HeartHandshake,
  Layers,
  Repeat,
  Sparkles,
} from 'lucide-react';
import { UK_STRINGS } from '../i18n/uk';
import { PlanuiError } from '../i18n/errorsUk';
import {
  PLANUI_BACKUP_VERSION,
  PlanuiDomainSnapshot,
  PlanuiSettings,
  RecoverySnapshotRecord,
  SupportedCurrencyCode,
  ThemePreference,
} from '../domain/types';
import { SUPPORTED_CURRENCIES } from '../domain/wishlist';
import { PlanuiRepositories } from '../storage/repositories';
import { BACKUP_LIMITS } from '../storage/backup/zipCodec';
import {
  ValidatedBackupPreview,
  deleteRecoverySnapshotTransactionally,
  executeAtomicBackupReplacement,
  exportFullBackupZip,
  exportRecoverySnapshotZip,
  resetAllPlanuiDataTransactionally,
  restoreFromRecoverySnapshotTransactionally,
  validateBackupArchive,
} from '../storage/backup/backupService';
import {
  Button,
  Card,
  FeedbackBanner,
  SegmentedControl,
  SelectField,
} from '../components/ui/primitives';

const COMMON_IANA_ZONES = [
  { value: 'Europe/Kyiv', label: 'Europe/Kyiv (Київ)' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw (Варшава)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (Берлін)' },
  { value: 'Europe/London', label: 'Europe/London (Лондон)' },
  { value: 'America/New_York', label: 'America/New_York (Нью-Йорк)' },
  { value: 'America/Chicago', label: 'America/Chicago (Чикаго)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Лос-Анджелес)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Токіо)' },
  { value: 'UTC', label: 'UTC (Всесвітній координований час)' },
];

function formatBytesUk(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function getRecoveryReasonLabelUk(
  reason: RecoverySnapshotRecord['reason']
): string {
  switch (reason) {
    case 'pre_import_replacement':
      return UK_STRINGS.settings.recoveryReasonPreImport;
    case 'pre_recovery_restore':
      return UK_STRINGS.settings.recoveryReasonPreRestore;
    case 'pre_reset':
      return UK_STRINGS.settings.recoveryReasonPreReset;
  }
}

export interface BasicSettingsViewProps {
  settings: PlanuiSettings;
  snapshot: PlanuiDomainSnapshot;
  recoverySnapshots: RecoverySnapshotRecord[];
  repositories: PlanuiRepositories;
  onSettingsPatch: (patch: Partial<PlanuiSettings>) => void;
  onDataReplaced: () => Promise<void>;
  onOpenWorkRoster?: () => void;
  onOpenHabits?: () => void;
  onOpenWishlistCategories?: () => void;
  onLocalModalOpenChange?: (open: boolean) => void;
}

export const BasicSettingsView: React.FC<BasicSettingsViewProps> = ({
  settings,
  snapshot,
  recoverySnapshots,
  repositories,
  onSettingsPatch,
  onDataReplaced,
  onOpenWorkRoster,
  onOpenHabits,
  onOpenWishlistCategories,
  onLocalModalOpenChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationAbortRef = useRef<AbortController | null>(null);

  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isValidatingImport, setIsValidatingImport] = useState(false);
  const [pendingPreview, setPendingPreview] =
    useState<ValidatedBackupPreview | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [recoveryFailedFallback, setRecoveryFailedFallback] = useState(false);

  const [persistenceState, setPersistenceState] = useState<
    'granted' | 'not_granted' | 'unsupported'
  >('unsupported');
  const [storageEstimateText, setStorageEstimateText] = useState<string | null>(
    null
  );

  const [restoreConfirmSnapshot, setRestoreConfirmSnapshot] =
    useState<RecoverySnapshotRecord | null>(null);
  const [deleteOnlyPointSnapshot, setDeleteOnlyPointSnapshot] =
    useState<RecoverySnapshotRecord | null>(null);

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetSnapshotMode, setResetSnapshotMode] = useState<
    'create_pre_reset_snapshot' | 'clear_all_snapshots'
  >('create_pre_reset_snapshot');
  const [resetConfirmedCheckbox, setResetConfirmedCheckbox] = useState(false);

  const hasOpenConfirmation = Boolean(
    pendingPreview ||
      restoreConfirmSnapshot ||
      deleteOnlyPointSnapshot ||
      isResetDialogOpen
  );

  useEffect(() => {
    onLocalModalOpenChange?.(hasOpenConfirmation);
    return () => {
      onLocalModalOpenChange?.(false);
    };
  }, [hasOpenConfirmation, onLocalModalOpenChange]);

  const refreshStoragePersistenceAndQuota = async () => {
    if (typeof navigator === 'undefined' || !navigator.storage) {
      setPersistenceState('unsupported');
      return;
    }
    try {
      if (typeof navigator.storage.persisted === 'function') {
        const persisted = await navigator.storage.persisted();
        setPersistenceState(persisted ? 'granted' : 'not_granted');
      } else {
        setPersistenceState('unsupported');
      }
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        if (typeof est.usage === 'number' && typeof est.quota === 'number') {
          setStorageEstimateText(
            `${formatBytesUk(est.usage)} з ${formatBytesUk(est.quota)}`
          );
        }
      }
    } catch {
      setPersistenceState('unsupported');
    }
  };

  useEffect(() => {
    void refreshStoragePersistenceAndQuota();
  }, [snapshot, recoverySnapshots]);

  const handleRequestPersistentStorage = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.persist !== 'function'
    ) {
      setPersistenceState('unsupported');
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      setPersistenceState(granted ? 'granted' : 'not_granted');
      setFeedback({
        tone: granted ? 'success' : 'info',
        message: granted
          ? UK_STRINGS.settings.persistenceGranted
          : UK_STRINGS.settings.persistenceNotGranted,
      });
    } catch {
      setFeedback({
        tone: 'info',
        message: UK_STRINGS.settings.persistenceUnsupported,
      });
    }
  };

  const canShareZipFile = (): boolean => {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function' ||
      typeof File === 'undefined'
    ) {
      return false;
    }
    try {
      const testFile = new File([new Uint8Array([80, 75])], 'planui.zip', {
        type: 'application/zip',
      });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  };

  const persistPatch = async (patch: Partial<PlanuiSettings>) => {
    onSettingsPatch(patch);
    try {
      const saved = await repositories.updateSettingsPatch(patch);
      onSettingsPatch(saved);
    } catch (err) {
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося зберегти налаштування.',
      });
    }
  };

  const triggerBrowserZipDownload = (
    zipBytes: Uint8Array,
    fileName: string
  ) => {
    const blob = new Blob([zipBytes as unknown as BlobPart], {
      type: 'application/zip',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleExportZip = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const { zipBytes, manifest } = await exportFullBackupZip(repositories);
      const dateStamp = manifest.createdAt.slice(0, 10);
      triggerBrowserZipDownload(zipBytes, `planui-backup-${dateStamp}.zip`);
      setFeedback({
        tone: 'success',
        message: UK_STRINGS.settings.exportHonestStatus,
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Помилка під час експорту резервної копії.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareZip = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const { zipBytes, manifest } = await exportFullBackupZip(repositories);
      const dateStamp = manifest.createdAt.slice(0, 10);
      const fileName = `planui-backup-${dateStamp}.zip`;
      const file = new File([zipBytes as unknown as BlobPart], fileName, {
        type: 'application/zip',
      });
      await navigator.share({
        title: fileName,
        files: [file],
      });
      setFeedback({
        tone: 'success',
        message: UK_STRINGS.settings.exportHonestStatus,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося поділитися файлом резервної копії.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelValidation = () => {
    if (validationAbortRef.current) {
      validationAbortRef.current.abort();
      validationAbortRef.current = null;
    }
    setIsValidatingImport(false);
    setFeedback({
      tone: 'info',
      message: 'Перевірку файлу резервної копії скасовано.',
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFeedback(null);
    setPendingPreview(null);
    setRecoveryFailedFallback(false);

    const abortController = new AbortController();
    validationAbortRef.current = abortController;
    setIsValidatingImport(true);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const validated = await validateBackupArchive(
        bytes,
        BACKUP_LIMITS,
        abortController.signal
      );
      setPendingPreview(validated);
      setFeedback({
        tone: 'info',
        message: UK_STRINGS.settings.importValidationSuccess,
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося перевірити файл резервної копії.',
      });
    } finally {
      validationAbortRef.current = null;
      setIsValidatingImport(false);
    }
  };

  const handleConfirmImportReplacement = async () => {
    if (!pendingPreview) return;
    setIsReplacing(true);
    setFeedback(null);
    setRecoveryFailedFallback(false);
    try {
      await executeAtomicBackupReplacement(repositories, pendingPreview, {
        explicitUserConfirmation: true,
      });
      setPendingPreview(null);
      await onDataReplaced();
      setFeedback({
        tone: 'success',
        message: UK_STRINGS.settings.importSuccess,
      });
    } catch (err) {
      if (err instanceof PlanuiError && (err.code === 'RECOVERY_SNAPSHOT_FAILED' || err.code === 'STORAGE_QUOTA_EXCEEDED')) {
        setRecoveryFailedFallback(true);
      }
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Помилка під час заміни даних із резервної копії.',
      });
    } finally {
      setIsReplacing(false);
    }
  };

  const handleConfirmRestoreSnapshot = async () => {
    if (!restoreConfirmSnapshot) return;
    setIsReplacing(true);
    setFeedback(null);
    setRecoveryFailedFallback(false);
    try {
      await restoreFromRecoverySnapshotTransactionally(
        repositories,
        restoreConfirmSnapshot.id,
        { explicitUserConfirmation: true }
      );
      setRestoreConfirmSnapshot(null);
      await onDataReplaced();
      setFeedback({
        tone: 'success',
        message: UK_STRINGS.settings.restoreSnapshotSuccess,
      });
    } catch (err) {
      if (err instanceof PlanuiError && (err.code === 'RECOVERY_SNAPSHOT_FAILED' || err.code === 'STORAGE_QUOTA_EXCEEDED')) {
        setRecoveryFailedFallback(true);
      }
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося відновити дані зі знімка.',
      });
    } finally {
      setIsReplacing(false);
    }
  };

  const handleExportRecoverySnapshotZip = async (
    snap: RecoverySnapshotRecord
  ) => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const { zipBytes } = await exportRecoverySnapshotZip(
        repositories,
        snap.id
      );
      const dateStamp = snap.createdAt.slice(0, 10);
      triggerBrowserZipDownload(
        zipBytes,
        `planui-recovery-${dateStamp}-${snap.id.slice(-6)}.zip`
      );
      setFeedback({
        tone: 'success',
        message: UK_STRINGS.settings.exportHonestStatus,
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося експортувати знімок відновлення.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteRecoverySnapshotRequest = async (
    snap: RecoverySnapshotRecord,
    allowDeleteOnly = false
  ) => {
    if (recoverySnapshots.length === 1 && !allowDeleteOnly) {
      setDeleteOnlyPointSnapshot(snap);
      return;
    }
    try {
      await deleteRecoverySnapshotTransactionally(repositories, snap.id, {
        allowDeleteOnlyRecoveryPoint: allowDeleteOnly,
      });
      setDeleteOnlyPointSnapshot(null);
      await onDataReplaced();
      setFeedback({
        tone: 'info',
        message: UK_STRINGS.settings.deleteSnapshotSuccess,
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося видалити знімок відновлення.',
      });
    }
  };

  const handleConfirmResetPlanui = async () => {
    if (!resetConfirmedCheckbox) return;
    setIsReplacing(true);
    setFeedback(null);
    setRecoveryFailedFallback(false);
    try {
      await resetAllPlanuiDataTransactionally(repositories, {
        explicitUserConfirmation: true,
        snapshotHandling: resetSnapshotMode,
      });
      setIsResetDialogOpen(false);
      setResetConfirmedCheckbox(false);
      await onDataReplaced();
      setFeedback({
        tone: 'success',
        message: UK_STRINGS.settings.resetSuccess,
      });
    } catch (err) {
      if (err instanceof PlanuiError && (err.code === 'RECOVERY_SNAPSHOT_FAILED' || err.code === 'STORAGE_QUOTA_EXCEEDED')) {
        setRecoveryFailedFallback(true);
      }
      setFeedback({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Не вдалося скинути локальні дані PLANUI.',
      });
    } finally {
      setIsReplacing(false);
    }
  };

  const activeZone =
    settings.timeZoneMode === 'manual' && settings.manualTimeZone
      ? settings.manualTimeZone
      : settings.lastDetectedTimeZone;

  return (
    <div className="space-y-4" data-testid="basic-settings-view">
      {feedback && (
        <FeedbackBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* 0. Optional Modules Configuration */}
      <Card
        title={UK_STRINGS.settings.sectionModules}
        subtitle={UK_STRINGS.settings.sectionModulesSubtitle}
        headerRight={
          <Layers
            className="w-5 h-5"
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          />
        }
      >
        <div className="space-y-3.5">
          {/* Habits */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-[15px] font-medium">
                <Repeat className="w-4 h-4" style={{ color: 'var(--color-work)' }} aria-hidden="true" />
                <span>{UK_STRINGS.settings.moduleHabitsLabel}</span>
              </div>
              <div
                className="text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.settings.moduleHabitsDescription}
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-module-habits"
              checked={Boolean(settings.modules?.habitsEnabled)}
              onChange={(e) =>
                persistPatch({
                  modules: {
                    habitsEnabled: e.target.checked,
                    stateCheckInsEnabled: Boolean(settings.modules?.stateCheckInsEnabled),
                    desiredLifeEnabled: Boolean(settings.modules?.desiredLifeEnabled),
                    wishlistEnabled: Boolean(settings.modules?.wishlistEnabled),
                    userConfigured: true,
                  },
                })
              }
              className="w-5 h-5 mt-1 shrink-0 accent-[#B93E4B] cursor-pointer"
            />
          </label>

          {/* State Check-ins */}
          <div
            className="border-t pt-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[15px] font-medium">
                  <HeartHandshake className="w-4 h-4" style={{ color: 'var(--color-brand)' }} aria-hidden="true" />
                  <span>{UK_STRINGS.settings.moduleStateCheckInsLabel}</span>
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.settings.moduleStateCheckInsDescription}
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-module-state-check-ins"
                checked={Boolean(settings.modules?.stateCheckInsEnabled)}
                onChange={(e) =>
                  persistPatch({
                    modules: {
                      habitsEnabled: Boolean(settings.modules?.habitsEnabled),
                      stateCheckInsEnabled: e.target.checked,
                      desiredLifeEnabled: Boolean(settings.modules?.desiredLifeEnabled),
                      wishlistEnabled: Boolean(settings.modules?.wishlistEnabled),
                      userConfigured: true,
                    },
                  })
                }
                className="w-5 h-5 mt-1 shrink-0 accent-[#B93E4B] cursor-pointer"
              />
            </label>
          </div>

          {/* Desired Life / Inspiration */}
          <div
            className="border-t pt-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[15px] font-medium">
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--color-personal)' }} aria-hidden="true" />
                  <span>{UK_STRINGS.settings.moduleDesiredLifeLabel}</span>
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.settings.moduleDesiredLifeDescription}
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-module-desired-life"
                checked={Boolean(settings.modules?.desiredLifeEnabled)}
                onChange={(e) =>
                  persistPatch({
                    modules: {
                      habitsEnabled: Boolean(settings.modules?.habitsEnabled),
                      stateCheckInsEnabled: Boolean(settings.modules?.stateCheckInsEnabled),
                      desiredLifeEnabled: e.target.checked,
                      wishlistEnabled: Boolean(settings.modules?.wishlistEnabled),
                      userConfigured: true,
                    },
                  })
                }
                className="w-5 h-5 mt-1 shrink-0 accent-[#B93E4B] cursor-pointer"
              />
            </label>
          </div>

          {/* Wishlist */}
          <div
            className="border-t pt-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[15px] font-medium">
                  <Gift className="w-4 h-4" style={{ color: 'var(--color-dayoff)' }} aria-hidden="true" />
                  <span>{UK_STRINGS.settings.moduleWishlistLabel}</span>
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.settings.moduleWishlistDescription}
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-module-wishlist"
                checked={Boolean(settings.modules?.wishlistEnabled)}
                onChange={(e) =>
                  persistPatch({
                    modules: {
                      habitsEnabled: Boolean(settings.modules?.habitsEnabled),
                      stateCheckInsEnabled: Boolean(settings.modules?.stateCheckInsEnabled),
                      desiredLifeEnabled: Boolean(settings.modules?.desiredLifeEnabled),
                      wishlistEnabled: e.target.checked,
                      userConfigured: true,
                    },
                  })
                }
                className="w-5 h-5 mt-1 shrink-0 accent-[#B93E4B] cursor-pointer"
              />
            </label>
          </div>
        </div>
      </Card>

      {/* 1. Theme & Appearance */}
      <Card
        title={UK_STRINGS.settings.sectionAppearance}
        subtitle={UK_STRINGS.settings.themeDescription}
        headerRight={<Sun className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
      >
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-[15px] font-medium">
              {UK_STRINGS.settings.themeLabel}
            </span>
            <SegmentedControl<ThemePreference>
              ariaLabel={UK_STRINGS.settings.themeLabel}
              value={settings.theme}
              onChange={(nextTheme) => persistPatch({ theme: nextTheme })}
              options={[
                { value: 'system', label: UK_STRINGS.settings.themeSystem },
                { value: 'light', label: UK_STRINGS.settings.themeLight },
                { value: 'dark', label: UK_STRINGS.settings.themeDark },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* 2. Accessibility, Motion & Transparency */}
      <Card
        title={UK_STRINGS.settings.sectionAccessibility}
        headerRight={<Eye className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
      >
        <div className="space-y-4">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="space-y-0.5">
              <div className="text-[15px] font-medium">
                {UK_STRINGS.settings.reducedMotionLabel}
              </div>
              <div
                className="text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.settings.reducedMotionDescription}
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-reduced-motion"
              checked={settings.reducedMotionOverride}
              onChange={(e) =>
                persistPatch({ reducedMotionOverride: e.target.checked })
              }
              className="w-5 h-5 mt-1 shrink-0 accent-[#B93E4B] cursor-pointer"
            />
          </label>

          <div
            className="border-t pt-3.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-[15px] font-medium">
                  {UK_STRINGS.settings.reducedTransparencyLabel}
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.settings.reducedTransparencyDescription}
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-reduced-transparency"
                checked={settings.reducedTransparencyOverride}
                onChange={(e) =>
                  persistPatch({
                    reducedTransparencyOverride: e.target.checked,
                  })
                }
                className="w-5 h-5 mt-1 shrink-0 accent-[#B93E4B] cursor-pointer"
              />
            </label>
          </div>
        </div>
      </Card>

      {/* 3. Time Zone & Calendar Context */}
      <Card
        title={UK_STRINGS.settings.sectionTimeZone}
        headerRight={<Globe className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
      >
        <div className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-[15px] font-medium">
              {UK_STRINGS.settings.timeZoneModeLabel}
            </span>
            <SegmentedControl<'device' | 'manual'>
              ariaLabel={UK_STRINGS.settings.timeZoneModeLabel}
              value={settings.timeZoneMode}
              onChange={(mode) =>
                persistPatch({
                  timeZoneMode: mode,
                  manualTimeZone:
                    mode === 'manual'
                      ? settings.manualTimeZone ?? settings.lastDetectedTimeZone
                      : settings.manualTimeZone,
                })
              }
              options={[
                {
                  value: 'device',
                  label: UK_STRINGS.settings.timeZoneModeDevice,
                },
                {
                  value: 'manual',
                  label: UK_STRINGS.settings.timeZoneModeManual,
                },
              ]}
            />
          </div>

          <div
            className="p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[14px]"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              {UK_STRINGS.settings.activeZoneLabel}:
            </span>
            <span className="font-mono font-semibold" data-testid="active-iana-zone">
              {activeZone}
            </span>
          </div>

          {settings.timeZoneMode === 'manual' && (
            <SelectField
              label={UK_STRINGS.settings.manualZoneSelectLabel}
              options={COMMON_IANA_ZONES}
              value={settings.manualTimeZone ?? settings.lastDetectedTimeZone}
              onChange={(e) =>
                persistPatch({
                  timeZoneMode: 'manual',
                  manualTimeZone: e.target.value,
                })
              }
            />
          )}
        </div>
      </Card>

      {/* 3b. Wishlist Currency Default & Quick Editor Links (10.1 & 10.7 / C15) */}
      <Card
        title="Список бажань та швидкі переходи до редакторів"
        subtitle="Валюта за замовчуванням застосовується лише до нових орієнтовних цін і ніколи не перераховує та не змінює валюту вже збережених бажань."
        headerRight={
          <Gift
            className="w-5 h-5"
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          />
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Валюта списку бажань за замовчуванням"
            value={settings.preferredWishlistCurrency ?? ''}
            onChange={(e) =>
              persistPatch({
                preferredWishlistCurrency: e.target.value
                  ? (e.target.value as SupportedCurrencyCode)
                  : null,
              })
            }
            options={[
              {
                value: '',
                label: 'Не обрано — запитувати під час першого введення ціни',
              },
              ...Object.values(SUPPORTED_CURRENCIES).map((c) => ({
                value: c.code,
                label: c.labelUk,
              })),
            ]}
            data-testid="settings-preferred-wishlist-currency-select"
          />

          {(onOpenWorkRoster || onOpenHabits || onOpenWishlistCategories) && (
            <div
              className="border-t pt-3.5 space-y-2.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2 text-[14px] font-medium">
                <Sliders
                  className="w-4 h-4"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-hidden="true"
                />
                <span>Повторне використання наявних редакторів</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {onOpenWorkRoster && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onOpenWorkRoster}
                    data-testid="settings-link-work-roster"
                  >
                    Робочий графік і шаблони змін
                  </Button>
                )}
                {onOpenHabits && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onOpenHabits}
                    data-testid="settings-link-habits"
                  >
                    Редактор звичок
                  </Button>
                )}
                {onOpenWishlistCategories && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onOpenWishlistCategories}
                    data-testid="settings-link-wishlist-categories"
                  >
                    Категорії списку бажань
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 4. Local Storage, Full ZIP Backup & Recovery (11.1 - 11.5) */}
      <Card
        title={UK_STRINGS.settings.sectionStorageBackup}
        headerRight={<Database className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p
              className="text-[14px] m-0 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.settings.localPrivacyNotice}
            </p>
            <p
              className="text-[13px] m-0 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.settings.privateModeRiskNotice}
            </p>
          </div>

          {/* Feature-detected Storage Persistence & Quota */}
          <div
            className="p-3.5 rounded-xl space-y-2 border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            data-testid="storage-persistence-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium">
                  {UK_STRINGS.settings.persistenceLabel}
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--text-secondary)' }}
                  data-testid="storage-persistence-status"
                >
                  {persistenceState === 'granted'
                    ? UK_STRINGS.settings.persistenceGranted
                    : persistenceState === 'not_granted'
                    ? UK_STRINGS.settings.persistenceNotGranted
                    : UK_STRINGS.settings.persistenceUnsupported}
                  {storageEstimateText
                    ? ` · ${UK_STRINGS.settings.storageQuotaLabel}: ${storageEstimateText}`
                    : ''}
                </div>
              </div>
              {persistenceState === 'not_granted' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRequestPersistentStorage}
                  data-testid="request-persistent-storage-button"
                >
                  {UK_STRINGS.settings.persistenceRequestButton}
                </Button>
              )}
            </div>
            <p
              className="text-[12px] m-0 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.settings.persistenceNote}
            </p>
          </div>

          {/* Complete Domain Inventory Summary */}
          <div
            className="p-3.5 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
            data-testid="storage-counts-summary"
          >
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Папки / Проєкти</div>
              <div className="text-[16px] font-semibold">
                {snapshot.folders.length} / {snapshot.projects.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Справи / Резервації
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.tasks.length} / {snapshot.reservations.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Події та зміни / Шаблони
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.events.length} / {snapshot.shiftTemplates.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Звички / Записи звичок
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.habits.length} / {snapshot.habitEntries.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Особисті записи / Оцінки сфер
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.personalRecords.length} /{' '}
                {snapshot.lifeAreaAssessments.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Натхнення / Медіафайли
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.inspirationItems.length} / {snapshot.mediaMeta.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Бажання / Категорії
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.wishes.length} / {snapshot.wishlistCategories.length}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Позначки вихідних
              </div>
              <div className="text-[16px] font-semibold">
                {snapshot.dayOffAnnotations.length}
              </div>
            </div>
          </div>

          {/* Export / Share / Import Controls */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="secondary"
                onClick={handleExportZip}
                disabled={isExporting || isReplacing}
                data-testid="export-backup-zip-button"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>
                  {isExporting
                    ? UK_STRINGS.settings.exportInProgress
                    : UK_STRINGS.settings.exportBackupButton}
                </span>
              </Button>

              {canShareZipFile() && (
                <Button
                  variant="secondary"
                  onClick={handleShareZip}
                  disabled={isExporting || isReplacing}
                  data-testid="share-backup-zip-button"
                >
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                  <span>{UK_STRINGS.settings.shareBackupButton}</span>
                </Button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileChange}
                className="hidden"
                data-testid="import-backup-file-input"
              />
              <Button
                variant="secondary"
                disabled={isValidatingImport || isReplacing}
                onClick={() => fileInputRef.current?.click()}
                data-testid="import-backup-zip-button"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>
                  {isValidatingImport
                    ? UK_STRINGS.settings.importValidationInProgress
                    : UK_STRINGS.settings.importBackupButton}
                </span>
              </Button>

              {isValidatingImport && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={handleCancelValidation}
                  data-testid="cancel-backup-validation-button"
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  <span>{UK_STRINGS.settings.importCancelValidationAction}</span>
                </Button>
              )}
            </div>
            <p
              className="text-[12px] m-0 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.settings.checksumHonestNote}
            </p>
          </div>

          {/* Recovery Failure Fallback Panel (11.5) */}
          {recoveryFailedFallback && (
            <div
              role="alert"
              className="p-4 rounded-2xl space-y-2.5 border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--color-brand)',
              }}
              data-testid="recovery-failed-fallback-panel"
            >
              <div className="text-[15px] font-semibold">
                {UK_STRINGS.settings.recoveryFailedFallbackTitle}
              </div>
              <p
                className="text-[13px] m-0 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.settings.recoveryFailedFallbackHint}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportZip}
                  data-testid="fallback-export-live-zip-button"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>{UK_STRINGS.settings.exportBackupButton}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Explicit Import Preview & Replacement Confirmation (11.4) */}
          {pendingPreview && (
            <div
              role="region"
              aria-label={UK_STRINGS.settings.importPreviewTitle}
              className="p-4 rounded-2xl space-y-3 border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--color-brand)',
              }}
              data-testid="import-replacement-preview"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: 'var(--color-brand-text)' }}
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h3 className="text-[15px] font-semibold m-0">
                    {UK_STRINGS.settings.importPreviewTitle}
                  </h3>
                  <p
                    className="text-[13px] m-0 leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {UK_STRINGS.settings.importPreviewWarning}
                  </p>
                </div>
              </div>

              {pendingPreview.warningsUk &&
                pendingPreview.warningsUk.length > 0 && (
                  <div
                    className="p-2.5 rounded-xl text-[13px] space-y-1"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    data-testid="import-preview-warnings"
                  >
                    {pendingPreview.warningsUk.map((w, idx) => (
                      <div key={idx}>{w}</div>
                    ))}
                  </div>
                )}

              <div className="text-[13px] grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  Папки в архіві:{' '}
                  <strong>{pendingPreview.snapshot.folders.length}</strong>
                </div>
                <div>
                  Проєкти в архіві:{' '}
                  <strong>{pendingPreview.snapshot.projects.length}</strong>
                </div>
                <div>
                  Справи в архіві:{' '}
                  <strong>{pendingPreview.snapshot.tasks.length}</strong>
                </div>
                <div>
                  Події та зміни:{' '}
                  <strong>{pendingPreview.snapshot.events.length}</strong>
                </div>
                <div>
                  Звички / Записи:{' '}
                  <strong>
                    {pendingPreview.snapshot.habits.length} /{' '}
                    {pendingPreview.snapshot.habitEntries.length}
                  </strong>
                </div>
                <div>
                  Особисті записи:{' '}
                  <strong>
                    {pendingPreview.snapshot.personalRecords.length}
                  </strong>
                </div>
                <div>
                  Бажання / Категорії:{' '}
                  <strong>
                    {pendingPreview.snapshot.wishes.length} /{' '}
                    {pendingPreview.snapshot.wishlistCategories.length}
                  </strong>
                </div>
                <div>
                  Натхнення / Медіа:{' '}
                  <strong>
                    {pendingPreview.snapshot.inspirationItems.length} /{' '}
                    {pendingPreview.snapshot.mediaMeta.length}
                  </strong>
                </div>
                <div>
                  Розмір після розпакування:{' '}
                  <strong>
                    {formatBytesUk(pendingPreview.totalExpandedBytes)}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPendingPreview(null)}
                >
                  {UK_STRINGS.settings.importCancelAction}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isReplacing}
                  onClick={handleConfirmImportReplacement}
                  data-testid="confirm-import-replacement-button"
                >
                  {UK_STRINGS.settings.importConfirmAction}
                </Button>
              </div>
            </div>
          )}

          {/* Local Recovery Snapshots (11.5) */}
          <div
            className="border-t pt-3.5 space-y-2.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="space-y-1">
              <div className="text-[14px] font-medium">
                {UK_STRINGS.settings.recoverySnapshotsTitle}
              </div>
              <p
                className="text-[12px] m-0 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.settings.recoverySnapshotsHint}
              </p>
            </div>

            {recoverySnapshots.length === 0 ? (
              <p
                className="text-[13px] m-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                {UK_STRINGS.settings.noRecoverySnapshots}
              </p>
            ) : (
              <ul
                className="space-y-2 m-0 p-0 list-none text-[13px]"
                data-testid="recovery-snapshots-list"
              >
                {recoverySnapshots.map((snap) => (
                  <li
                    key={snap.id}
                    className="p-3 rounded-xl space-y-2"
                    style={{ backgroundColor: 'var(--bg-elevated)' }}
                    data-testid={`recovery-snapshot-item-${snap.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {getRecoveryReasonLabelUk(snap.reason)}
                        </div>
                        <div
                          className="text-[12px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {snap.createdAt.slice(0, 19).replace('T', ' ')} ·
                          Справ: {snap.snapshot.tasks.length} · Подій:{' '}
                          {snap.snapshot.events.length} · Бажань:{' '}
                          {snap.snapshot.wishes.length} · Медіа:{' '}
                          {snap.snapshot.mediaMeta.length}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isReplacing}
                          onClick={() => setRestoreConfirmSnapshot(snap)}
                          data-testid={`restore-snapshot-button-${snap.id}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {UK_STRINGS.settings.restoreSnapshotAction}
                          </span>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isExporting}
                          onClick={() => handleExportRecoverySnapshotZip(snap)}
                          data-testid={`export-snapshot-button-${snap.id}`}
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {UK_STRINGS.settings.exportSnapshotAction}
                          </span>
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={isReplacing}
                          onClick={() =>
                            handleDeleteRecoverySnapshotRequest(snap, false)
                          }
                          data-testid={`delete-snapshot-button-${snap.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {UK_STRINGS.settings.deleteSnapshotAction}
                          </span>
                        </Button>
                      </div>
                    </div>

                    {restoreConfirmSnapshot?.id === snap.id && (
                      <div
                        className="p-3 rounded-xl space-y-2 border mt-2"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--color-brand)',
                        }}
                        data-testid="confirm-restore-snapshot-box"
                      >
                        <div className="font-semibold">
                          {UK_STRINGS.settings.restoreSnapshotConfirmTitle}
                        </div>
                        <p
                          className="text-[12px] m-0 leading-relaxed"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {UK_STRINGS.settings.restoreSnapshotConfirmWarning}
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setRestoreConfirmSnapshot(null)}
                          >
                            {UK_STRINGS.settings.importCancelAction}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isReplacing}
                            onClick={handleConfirmRestoreSnapshot}
                            data-testid="confirm-restore-snapshot-submit"
                          >
                            {UK_STRINGS.settings.restoreSnapshotConfirmButton}
                          </Button>
                        </div>
                      </div>
                    )}

                    {deleteOnlyPointSnapshot?.id === snap.id && (
                      <div
                        className="p-3 rounded-xl space-y-2 border mt-2"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--color-brand)',
                        }}
                        data-testid="confirm-delete-only-snapshot-box"
                      >
                        <p className="text-[12px] m-0 leading-relaxed">
                          {UK_STRINGS.settings.deleteOnlySnapshotWarning}
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeleteOnlyPointSnapshot(null)}
                          >
                            {UK_STRINGS.settings.importCancelAction}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              handleDeleteRecoverySnapshotRequest(snap, true)
                            }
                            data-testid="confirm-delete-only-snapshot-submit"
                          >
                            {UK_STRINGS.settings.deleteOnlySnapshotConfirmButton}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Controlled Reset of PLANUI Data (11.6) */}
          <div
            className="border-t pt-3.5 space-y-2.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium">
                  {UK_STRINGS.settings.resetSectionTitle}
                </div>
                <p
                  className="text-[12px] m-0 leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.settings.resetSectionHint}
                </p>
              </div>
              {!isResetDialogOpen && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsResetDialogOpen(true);
                    setResetConfirmedCheckbox(false);
                  }}
                  data-testid="open-reset-planui-dialog-button"
                >
                  {UK_STRINGS.settings.resetOpenDialogButton}
                </Button>
              )}
            </div>

            {isResetDialogOpen && (
              <div
                role="region"
                aria-label={UK_STRINGS.settings.resetSectionTitle}
                className="p-4 rounded-2xl space-y-3 border"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--color-brand)',
                }}
                data-testid="reset-planui-confirmation-dialog"
              >
                <div className="space-y-2 text-[13px]">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reset-snapshot-mode"
                      checked={
                        resetSnapshotMode === 'create_pre_reset_snapshot'
                      }
                      onChange={() =>
                        setResetSnapshotMode('create_pre_reset_snapshot')
                      }
                      className="mt-1 accent-[var(--color-brand)]"
                      data-testid="reset-mode-keep-snapshot"
                    />
                    <span>{UK_STRINGS.settings.resetKeepSnapshotOption}</span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reset-snapshot-mode"
                      checked={resetSnapshotMode === 'clear_all_snapshots'}
                      onChange={() =>
                        setResetSnapshotMode('clear_all_snapshots')
                      }
                      className="mt-1 accent-[var(--color-brand)]"
                      data-testid="reset-mode-clear-snapshots"
                    />
                    <span>{UK_STRINGS.settings.resetClearSnapshotsOption}</span>
                  </label>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer text-[13px] pt-1">
                  <input
                    type="checkbox"
                    checked={resetConfirmedCheckbox}
                    onChange={(e) =>
                      setResetConfirmedCheckbox(e.target.checked)
                    }
                    className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]"
                    data-testid="reset-confirm-checkbox"
                  />
                  <span>{UK_STRINGS.settings.resetConfirmCheckboxLabel}</span>
                </label>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsResetDialogOpen(false);
                      setResetConfirmedCheckbox(false);
                    }}
                  >
                    {UK_STRINGS.settings.importCancelAction}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!resetConfirmedCheckbox || isReplacing}
                    onClick={handleConfirmResetPlanui}
                    data-testid="confirm-reset-planui-submit"
                  >
                    {UK_STRINGS.settings.resetConfirmButton}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div
            className="text-[12px] pt-1 flex flex-wrap items-center justify-between gap-2"
            style={{ color: 'var(--text-secondary)' }}
            data-testid="settings-version-footer"
          >
            <span>{UK_STRINGS.settings.appVersionLabel}</span>
            <span className="font-mono">
              PLANUI {settings.appVersion} · DB v{settings.dbSchemaVersion} ·
              Backup v{PLANUI_BACKUP_VERSION} · Gen {settings.dbGeneration}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};
