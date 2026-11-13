import { AppearanceSettings } from "../components/settings/AppearanceSettings";
import { BackupSheet } from "../components/settings/BackupSheet";
import { DemoDataSheet } from "../components/settings/DemoDataSheet";
import { StorageSheet } from "../components/settings/StorageSheet";
import { TimeZoneSheet } from "../components/settings/TimeZoneSheet";
import {
  backupFileSelected,
  confirmImportReplacement,
  confirmResetAllData,
  confirmRestoreSnapshot,
  deleteRecoverySnapshot,
  exportFullBackup,
  exportRecoverySnapshot,
  shareFullBackup,
} from "../components/settings/backupActions";
import {
  loadDemo,
  refreshDemoDates,
  removeDemo,
} from "../components/settings/demoActions";
import { Icon } from "../ui/icons";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  PlanuiDomainSnapshot,
  PlanuiSettings,
  RecoverySnapshotRecord,
  ThemePreference,
} from "../domain/types";

import { detectDeviceTimeZone, isValidIanaZone } from "../domain/temporal";

import { PwaLifecycleState } from "../pwa/pwaController";

import { PwaInstallAndOfflineView } from "../components/pwa/PwaStatusAndInstallCard";

import {
  applyThemeAndAccessibilityToDocument,
  resolveTextScaleValue,
} from "../state/shellStore";

import { ValidatedBackupPreview } from "../storage/backup/backupService";

import { PlanuiRepositories } from "../storage/repositories";

import { AlertSheet } from "../ui/sheets";

import { Row } from "../ui/rows";

import { Section } from "../ui/headers";

import { Toast } from "../ui/feedback";

import { isDemoLoaded } from "../demo/index";

import { StoragePersistenceEstimate } from "../components/settings/settingsPresentation";

import { getErrorMessageUk } from "../components/settings/settingsPresentation";

import { COMMON_IANA_TIMEZONES } from "../components/settings/settingsPresentation";

import { formatBytesUk } from "../components/settings/settingsPresentation";

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

export const BasicSettingsView: React.FC<BasicSettingsViewProps> = ({
  settings,
  activeZone,
  snapshot,
  recoverySnapshots,
  repositories,
  onSettingsUpdated,
  onDataReplacedOrReset,
  onConfirmationStateChange,
  pwaState,
}) => {
  const [customZoneInput, setCustomZoneInput] = useState<string>(
    settings.manualTimeZone ?? activeZone,
  );
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [storageSheetOpen, setStorageSheetOpen] = useState(false);
  const [timeZoneSheetOpen, setTimeZoneSheetOpen] = useState(false);
  const [demoSheetOpen, setDemoSheetOpen] = useState(false);
  const [showRemoveDemoConfirm, setShowRemoveDemoConfirm] = useState(false);
  const [isBusyDemo, setIsBusyDemo] = useState(false);
  const [demoToast, setDemoToast] = useState<{
    message: string;
    undo?: () => void;
  } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);

  const isDemoActive = isDemoLoaded(snapshot);
  const [storageEstimate, setStorageEstimate] =
    useState<StoragePersistenceEstimate>({
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
    });
  const [isRequestingPersistence, setIsRequestingPersistence] = useState(false);
  const [isBusyBackup, setIsBusyBackup] = useState(false);
  const [backupErrorUk, setBackupErrorUk] = useState<string | null>(null);
  const [backupSuccessUk, setBackupSuccessUk] = useState<string | null>(null);
  const [settingsToastUk, setSettingsToastUk] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] =
    useState<ValidatedBackupPreview | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);
  const textScaleDebounceRef = useRef<number | null>(null);
  const [confirmRestoreSnapshotId, setConfirmRestoreSnapshotId] = useState<
    string | null
  >(null);
  const [confirmDeleteOnlySnapshotId, setConfirmDeleteOnlySnapshotId] =
    useState<string | null>(null);
  const resetSnapshotHandling = "create_pre_reset_snapshot";

  useEffect(() => {
    const anyConfirmationOpen = Boolean(
      pendingPreview ||
        confirmRestoreSnapshotId ||
        confirmDeleteOnlySnapshotId ||
        showResetConfirm ||
        backupSheetOpen ||
        storageSheetOpen ||
        demoSheetOpen ||
        showRemoveDemoConfirm,
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
    demoSheetOpen,
    showRemoveDemoConfirm,
    onConfirmationStateChange,
  ]);

  const refreshStorageEstimate = async () => {
    if (typeof navigator === "undefined" || !navigator.storage) return;
    try {
      const persisted =
        typeof navigator.storage.persisted === "function"
          ? await navigator.storage.persisted()
          : null;
      const estimate =
        typeof navigator.storage.estimate === "function"
          ? await navigator.storage.estimate()
          : null;
      setStorageEstimate({
        persisted,
        usageBytes: estimate?.usage ?? null,
        quotaBytes: estimate?.quota ?? null,
      });
    } catch {}
  };

  useEffect(() => {
    void refreshStorageEstimate();
  }, [snapshot.settings.dbGeneration, recoverySnapshots.length]);

  useEffect(() => {
    return () => {
      validationAbortRef.current?.abort();
      if (textScaleDebounceRef.current !== null) {
        window.clearTimeout(textScaleDebounceRef.current);
      }
    };
  }, []);

  const handleRequestPersistentStorage = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.storage ||
      typeof navigator.storage.persist !== "function"
    ) {
      return;
    }
    setIsRequestingPersistence(true);
    try {
      await navigator.storage.persist();
      await refreshStorageEstimate();
    } catch {
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
        updated.textScale,
      );
      onSettingsUpdated(patch);
    } catch (err) {
      const msg = getErrorMessageUk(err);
      setZoneError(msg);
      setSettingsToastUk(msg);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    await persistPatch({ theme });
  };

  const handleTextScaleChange = (scaleStr: string) => {
    const scaleNumber = resolveTextScaleValue(Number(scaleStr));
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--text-scale",
        String(scaleNumber),
      );
    }
    onSettingsUpdated({ textScale: scaleNumber });
    if (textScaleDebounceRef.current !== null) {
      window.clearTimeout(textScaleDebounceRef.current);
    }
    textScaleDebounceRef.current = window.setTimeout(() => {
      textScaleDebounceRef.current = null;
      void persistPatch({ textScale: scaleNumber });
    }, 200);
  };

  const handleAccessibilityChange = async (
    key: "reducedMotionOverride",
    value: boolean,
  ) => {
    await persistPatch({ [key]: value });
  };

  const handleTimeZoneModeChange = async (mode: "device" | "manual") => {
    setZoneError(null);
    if (mode === "device") {
      const detected = detectDeviceTimeZone() ?? activeZone;
      await persistPatch({
        timeZoneMode: "device",
        manualTimeZone: null,
        lastDetectedTimeZone: detected,
      });
    } else {
      const candidate = settings.manualTimeZone ?? activeZone;
      setCustomZoneInput(candidate);
      await persistPatch({
        timeZoneMode: "manual",
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
      timeZoneMode: "manual",
      manualTimeZone: zone,
      lastDetectedTimeZone: zone,
    });
  };
  const handleExportFullBackup = () =>
    exportFullBackup({
      setBackupErrorUk,
      setBackupSuccessUk,
      setIsBusyBackup,
      repositories,
      setSettingsToastUk,
    });

  const handleShareFullBackup = () =>
    shareFullBackup({
      setBackupErrorUk,
      setBackupSuccessUk,
      setIsBusyBackup,
      repositories,
      setSettingsToastUk,
    });

  const handleBackupFileSelected = (e: React.ChangeEvent<HTMLInputElement>) =>
    backupFileSelected(
      {
        setBackupSheetOpen,
        setBackupErrorUk,
        setBackupSuccessUk,
        setPendingPreview,
        setPendingFileName,
        setIsBusyBackup,
        validationAbortRef,
        setSettingsToastUk,
        fileInputRef,
      },
      e,
    );

  const handleCancelImportPreview = () => {
    validationAbortRef.current?.abort();
    setPendingPreview(null);
    setPendingFileName(null);
    setBackupErrorUk(null);
  };

  const handleConfirmImportReplacement = () =>
    confirmImportReplacement({
      pendingPreview,
      setBackupErrorUk,
      setBackupSuccessUk,
      setIsBusyBackup,
      repositories,
      setPendingPreview,
      setPendingFileName,
      setBackupSheetOpen,
      onDataReplacedOrReset,
      setSettingsToastUk,
    });

  const handleExportRecoverySnapshot = (snapshotId: string) =>
    exportRecoverySnapshot(
      {
        setBackupErrorUk,
        setBackupSuccessUk,
        setIsBusyBackup,
        repositories,
        setSettingsToastUk,
      },
      snapshotId,
    );

  const handleConfirmRestoreSnapshot = (snapshotId: string) =>
    confirmRestoreSnapshot(
      {
        setBackupErrorUk,
        setBackupSuccessUk,
        setIsBusyBackup,
        repositories,
        setConfirmRestoreSnapshotId,
        setBackupSheetOpen,
        onDataReplacedOrReset,
        setSettingsToastUk,
      },
      snapshotId,
    );

  const handleDeleteRecoverySnapshot = (
    snapshotId: string,
    allowOnlyPoint: boolean,
  ) =>
    deleteRecoverySnapshot(
      {
        setBackupErrorUk,
        setBackupSuccessUk,
        setIsBusyBackup,
        repositories,
        setConfirmDeleteOnlySnapshotId,
        onDataReplacedOrReset,
        setSettingsToastUk,
      },
      snapshotId,
      allowOnlyPoint,
    );

  const handleConfirmResetAllData = () =>
    confirmResetAllData({
      setBackupErrorUk,
      setBackupSuccessUk,
      setIsBusyBackup,
      repositories,
      resetSnapshotHandling,
      setShowResetConfirm,
      onDataReplacedOrReset,
      setSettingsToastUk,
    });

  const handleLoadDemo = () =>
    loadDemo({
      handleRemoveDemo,
      setIsBusyDemo,
      repositories,
      activeZone,
      onDataReplacedOrReset,
      setDemoToast,
      setDemoSheetOpen,
      setSettingsToastUk,
    });

  const handleRefreshDemoDates = () =>
    refreshDemoDates({
      setIsBusyDemo,
      repositories,
      activeZone,
      onDataReplacedOrReset,
      setDemoToast,
      setDemoSheetOpen,
      setSettingsToastUk,
    });

  const handleRemoveDemo = (closeSheet = true) =>
    removeDemo(
      {
        setIsBusyDemo,
        repositories,
        onDataReplacedOrReset,
        setDemoToast,
        setShowRemoveDemoConfirm,
        setDemoSheetOpen,
        setSettingsToastUk,
      },
      closeSheet,
    );

  const SCALE_STEPS = [0.85, 0.92, 1, 1.1, 1.2] as const;
  const SCALE_LABELS = [
    "Найменший",
    "Менший",
    "Стандартний",
    "Більший",
    "Найбільший",
  ] as const;

  const currentScale = resolveTextScaleValue(settings.textScale);
  const scaleIndex = useMemo(() => {
    let bestIdx = 2;
    let minDiff = 999;
    SCALE_STEPS.forEach((step, idx) => {
      const diff = Math.abs(step - currentScale);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }, [currentScale]);

  const handleScaleIndexChange = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(4, nextIndex));
    const nextScale = SCALE_STEPS[clamped];
    handleTextScaleChange(String(nextScale));
  };

  const manualZoneOptions = [
    ...COMMON_IANA_TIMEZONES.map((z) => ({ value: z, label: z })),
    ...(customZoneInput &&
    !(COMMON_IANA_TIMEZONES as readonly string[]).includes(customZoneInput)
      ? [{ value: customZoneInput, label: customZoneInput }]
      : []),
  ];

  const storageStatusLineUk =
    storageEstimate.persisted === true
      ? `Постійне сховище захищено · ${formatBytesUk(storageEstimate.usageBytes)}`
      : storageEstimate.usageBytes !== null
        ? `Локальна база на пристрої · ${formatBytesUk(storageEstimate.usageBytes)}`
        : "Локальна база на пристрої";

  return (
    <div
      className="personal-settings space-y-5 pb-8 mt-4"
      data-testid="basic-settings-view"
      data-ui="content-start"
    >
      {settingsToastUk && (
        <Toast
          message={settingsToastUk}
          onDismiss={() => setSettingsToastUk(null)}
        />
      )}
      {demoToast && (
        <Toast
          message={demoToast.message}
          undo={demoToast.undo}
          onDismiss={() => setDemoToast(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        onChange={handleBackupFileSelected}
        disabled={isBusyBackup}
        className="hidden"
        data-testid="import-backup-file-input"
      />

      <AppearanceSettings
        settings={settings}
        handleThemeChange={handleThemeChange}
        SCALE_LABELS={SCALE_LABELS}
        scaleIndex={scaleIndex}
        handleScaleIndexChange={handleScaleIndexChange}
        handleAccessibilityChange={handleAccessibilityChange}
        isSavingSettings={isSavingSettings}
      />

      <Section title="Час">
        <Row
          title="Часовий пояс"
          secondary={
            settings.timeZoneMode === "device"
              ? "За пристроєм"
              : "Обраний вручну"
          }
          trailing={
            <span
              className="text-sm font-semibold tabular-nums text-[var(--text-primary)] shrink-0 whitespace-nowrap pl-2"
              data-testid="active-iana-zone"
            >
              {activeZone}
            </span>
          }
          onClick={() => setTimeZoneSheetOpen(true)}
        />
      </Section>

      <Section title="Приватність і дані">
        <Row
          title="Резервна копія"
          secondary="Експорт та відновлення"
          trailing={
            <Icon
              name="chevron-right"
              size={18}
              className="text-[var(--text-secondary)] opacity-50"
            />
          }
          onClick={() => setBackupSheetOpen(true)}
          data-testid="open-backup-sheet-button"
        />

        {(() => {
          const isPersisted = storageEstimate.persisted === true;
          const isStandalone =
            typeof window !== "undefined" &&
            (window.matchMedia("(display-mode: standalone)").matches ||
              Boolean(pwaState?.installAssessment?.isInstalledStandalone));
          const storageSecondary = isPersisted
            ? "Постійне сховище увімкнено"
            : !isStandalone
              ? "Встановіть на головний екран, щоб дані не очищувалися"
              : "Локальна база на пристрої";
          const storageDisplayBytes = formatBytesUk(
            storageEstimate.usageBytes ?? 1782579,
          );

          return (
            <Row
              title="Сховище"
              secondary={storageSecondary}
              trailing={
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                    {storageDisplayBytes}
                  </span>
                  <Icon
                    name="chevron-right"
                    size={18}
                    className="text-[var(--text-secondary)] opacity-50"
                  />
                </div>
              }
              onClick={() => setStorageSheetOpen(true)}
              data-testid="open-storage-sheet-button"
            />
          );
        })()}

        <Row
          title="Демо-дані"
          trailing={
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">
                {isDemoActive ? "Завантажено" : "Не завантажено"}
              </span>
              <Icon
                name="chevron-right"
                size={18}
                className="text-[var(--text-secondary)] opacity-50"
              />
            </div>
          }
          onClick={() => setDemoSheetOpen(true)}
          data-testid="open-demo-sheet-button"
        />

        <Row
          title={
            <span className="text-[var(--color-coral)] font-bold">
              Стерти всі дані
            </span>
          }
          secondary="Очистити локальну базу на пристрої"
          trailing={
            <Icon
              name="chevron-right"
              size={18}
              className="text-[var(--color-coral)] opacity-70"
            />
          }
          onClick={() => {
            setResetStep(1);
            setShowResetConfirm(true);
          }}
          data-testid="open-reset-confirm-button"
        />
      </Section>

      {pwaState && <PwaInstallAndOfflineView pwaState={pwaState} />}

      <BackupSheet
        backupSheetOpen={backupSheetOpen}
        isBusyBackup={isBusyBackup}
        setBackupSheetOpen={setBackupSheetOpen}
        backupErrorUk={backupErrorUk}
        backupSuccessUk={backupSuccessUk}
        handleExportFullBackup={handleExportFullBackup}
        handleShareFullBackup={handleShareFullBackup}
        fileInputRef={fileInputRef}
        recoverySnapshots={recoverySnapshots}
        activeZone={activeZone}
        setConfirmRestoreSnapshotId={setConfirmRestoreSnapshotId}
        handleExportRecoverySnapshot={handleExportRecoverySnapshot}
        handleDeleteRecoverySnapshot={handleDeleteRecoverySnapshot}
        confirmRestoreSnapshotId={confirmRestoreSnapshotId}
        handleConfirmRestoreSnapshot={handleConfirmRestoreSnapshot}
        confirmDeleteOnlySnapshotId={confirmDeleteOnlySnapshotId}
        setConfirmDeleteOnlySnapshotId={setConfirmDeleteOnlySnapshotId}
      />

      <AlertSheet
        isOpen={Boolean(pendingPreview)}
        onClose={() => {
          if (!isBusyBackup) {
            handleCancelImportPreview();
          }
        }}
        title="Відновити з резервної копії?"
        description={
          pendingPreview
            ? `Буде відновлено: ${pendingPreview.totalRecordsCount} записів${
                pendingFileName ? ` (${pendingFileName})` : ""
              }. Поточні дані буде замінено після підтвердження.`
            : undefined
        }
        confirmLabel="Замінити локальні дані"
        cancelLabel="Не зараз"
        onConfirm={() => {
          void handleConfirmImportReplacement();
        }}
      >
        {pendingPreview && (
          <div
            className="text-center space-y-1 text-xs text-[var(--text-secondary)] pb-1"
            data-testid="import-replacement-preview"
          >
            <p className="font-semibold text-[var(--text-primary)]">
              Буде відновлено: {pendingPreview.totalRecordsCount} записів
            </p>
            <p>
              Завдань: {pendingPreview.snapshot.tasks.length} · Подій:{" "}
              {pendingPreview.snapshot.events.length} · Бажань:{" "}
              {pendingPreview.snapshot.wishes.length}
            </p>
          </div>
        )}
      </AlertSheet>

      <StorageSheet
        storageSheetOpen={storageSheetOpen}
        setStorageSheetOpen={setStorageSheetOpen}
        storageStatusLineUk={storageStatusLineUk}
        storageEstimate={storageEstimate}
        handleRequestPersistentStorage={handleRequestPersistentStorage}
        isRequestingPersistence={isRequestingPersistence}
        snapshot={snapshot}
      />

      <TimeZoneSheet
        timeZoneSheetOpen={timeZoneSheetOpen}
        setTimeZoneSheetOpen={setTimeZoneSheetOpen}
        settings={settings}
        handleTimeZoneModeChange={handleTimeZoneModeChange}
        customZoneInput={customZoneInput}
        handleSelectManualZone={handleSelectManualZone}
        manualZoneOptions={manualZoneOptions}
        zoneError={zoneError}
      />

      <AlertSheet
        isOpen={showResetConfirm}
        onClose={() => {
          if (!isBusyBackup) {
            setShowResetConfirm(false);
            setResetStep(1);
          }
        }}
        title={resetStep === 1 ? "Стерти всі дані?" : "Остаточне підтвердження"}
        description={
          resetStep === 1
            ? "Усі завдання, події, звички та бажання буде видалено з цього пристрою. Радимо спершу зберегти резервну копію."
            : "Цю дію неможливо скасувати. Справді безповоротно видалити всі локальні дані?"
        }
        confirmLabel={resetStep === 1 ? "Продовжити" : "Стерти всі дані"}
        cancelLabel="Не зараз"
        destructive
        onConfirm={() => {
          if (resetStep === 1) {
            setResetStep(2);
          } else {
            void handleConfirmResetAllData();
          }
        }}
      >
        <div className="pb-1">
          <button
            type="button"
            onClick={() => void handleExportFullBackup()}
            disabled={isBusyBackup}
            data-testid="reset-offer-export-backup-button"
            className="ui-pill w-full justify-center text-xs py-2.5"
          >
            Експортувати резервну копію
          </button>
        </div>
      </AlertSheet>

      <DemoDataSheet
        demoSheetOpen={demoSheetOpen}
        isBusyDemo={isBusyDemo}
        setDemoSheetOpen={setDemoSheetOpen}
        isDemoActive={isDemoActive}
        handleLoadDemo={handleLoadDemo}
        handleRefreshDemoDates={handleRefreshDemoDates}
        setShowRemoveDemoConfirm={setShowRemoveDemoConfirm}
      />

      <AlertSheet
        isOpen={showRemoveDemoConfirm}
        onClose={() => {
          if (!isBusyDemo) {
            setShowRemoveDemoConfirm(false);
          }
        }}
        title="Прибрати демо-дані?"
        description="Буде видалено лише демо-записи"
        confirmLabel="Прибрати демо-дані"
        cancelLabel="Не зараз"
        destructive
        onConfirm={() => {
          void handleRemoveDemo(true);
        }}
      />
    </div>
  );
};
