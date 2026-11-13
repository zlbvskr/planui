import React from "react";
import { exportFullBackupZip } from "../../storage/backup/backupService";
import { PlanuiRepositories } from "../../storage/repositories";
import { triggerBrowserZipDownload } from "./backupFiles";
import { getErrorMessageUk } from "./settingsPresentation";

interface exportFullBackupContext {
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function exportFullBackup({
  setBackupErrorUk,
  setBackupSuccessUk,
  setIsBusyBackup,
  repositories,
  setSettingsToastUk,
}: exportFullBackupContext) {
  setBackupErrorUk(null);
  setBackupSuccessUk(null);
  setIsBusyBackup(true);
  try {
    const nowIso = new Date().toISOString();
    const { zipBytes } = await exportFullBackupZip(repositories, nowIso);
    const dateStamp = nowIso.slice(0, 10);
    triggerBrowserZipDownload(zipBytes, `planui-backup-${dateStamp}.zip`);
    setBackupSuccessUk("Резервну копію ZIP сформовано та завантажено.");
  } catch (err) {
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
  } finally {
    setIsBusyBackup(false);
  }
}

import { shareBrowserZipFile } from "./backupFiles";

interface shareFullBackupContext {
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function shareFullBackup({
  setBackupErrorUk,
  setBackupSuccessUk,
  setIsBusyBackup,
  repositories,
  setSettingsToastUk,
}: shareFullBackupContext) {
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
      "Резервна копія PLANUI",
    );
    if (shared) {
      setBackupSuccessUk("Резервну копію ZIP передано через меню поширення.");
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
  } finally {
    setIsBusyBackup(false);
  }
}

import {
  validateBackupArchive,
  ValidatedBackupPreview,
} from "../../storage/backup/backupService";

interface backupFileSelectedContext {
  setBackupSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingPreview: React.Dispatch<
    React.SetStateAction<ValidatedBackupPreview | null>
  >;
  setPendingFileName: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  validationAbortRef: React.RefObject<AbortController | null>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export async function backupFileSelected(
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
  }: backupFileSelectedContext,
  e: React.ChangeEvent<HTMLInputElement>,
) {
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
      abortController.signal,
    );
    setPendingPreview(preview);
  } catch (err) {
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
    setPendingFileName(null);
  } finally {
    setIsBusyBackup(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
}

import { executeAtomicBackupReplacement } from "../../storage/backup/backupService";

interface confirmImportReplacementContext {
  pendingPreview: ValidatedBackupPreview | null;
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setPendingPreview: React.Dispatch<
    React.SetStateAction<ValidatedBackupPreview | null>
  >;
  setPendingFileName: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function confirmImportReplacement({
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
}: confirmImportReplacementContext) {
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
    await onDataReplacedOrReset("Дані відновлено з резервної копії.");
  } catch (err) {
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
  } finally {
    setIsBusyBackup(false);
  }
}

import { exportRecoverySnapshotZip } from "../../storage/backup/backupService";

interface exportRecoverySnapshotContext {
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function exportRecoverySnapshot(
  {
    setBackupErrorUk,
    setBackupSuccessUk,
    setIsBusyBackup,
    repositories,
    setSettingsToastUk,
  }: exportRecoverySnapshotContext,
  snapshotId: string,
) {
  setBackupErrorUk(null);
  setBackupSuccessUk(null);
  setIsBusyBackup(true);
  try {
    const nowIso = new Date().toISOString();
    const { zipBytes, recoveryRecord } = await exportRecoverySnapshotZip(
      repositories,
      snapshotId,
      nowIso,
    );
    const dateStamp = recoveryRecord.createdAt.slice(0, 10);
    triggerBrowserZipDownload(
      zipBytes,
      `planui-recovery-${dateStamp}-${snapshotId.slice(-6)}.zip`,
    );
    setBackupSuccessUk("Знімок відновлення експортовано у ZIP.");
  } catch (err) {
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
  } finally {
    setIsBusyBackup(false);
  }
}

import { restoreFromRecoverySnapshotTransactionally } from "../../storage/backup/backupService";

interface confirmRestoreSnapshotContext {
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setConfirmRestoreSnapshotId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setBackupSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function confirmRestoreSnapshot(
  {
    setBackupErrorUk,
    setBackupSuccessUk,
    setIsBusyBackup,
    repositories,
    setConfirmRestoreSnapshotId,
    setBackupSheetOpen,
    onDataReplacedOrReset,
    setSettingsToastUk,
  }: confirmRestoreSnapshotContext,
  snapshotId: string,
) {
  setBackupErrorUk(null);
  setBackupSuccessUk(null);
  setIsBusyBackup(true);
  try {
    await restoreFromRecoverySnapshotTransactionally(repositories, snapshotId, {
      explicitUserConfirmation: true,
      nowIso: new Date().toISOString(),
    });
    setConfirmRestoreSnapshotId(null);
    setBackupSheetOpen(false);
    await onDataReplacedOrReset("Дані відновлено з точки відновлення.");
  } catch (err) {
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
  } finally {
    setIsBusyBackup(false);
  }
}

import { PlanuiError } from "../../i18n/errorsUk";
import { deleteRecoverySnapshotTransactionally } from "../../storage/backup/backupService";

interface deleteRecoverySnapshotContext {
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setConfirmDeleteOnlySnapshotId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function deleteRecoverySnapshot(
  {
    setBackupErrorUk,
    setBackupSuccessUk,
    setIsBusyBackup,
    repositories,
    setConfirmDeleteOnlySnapshotId,
    onDataReplacedOrReset,
    setSettingsToastUk,
  }: deleteRecoverySnapshotContext,
  snapshotId: string,
  allowOnlyPoint: boolean,
) {
  setBackupErrorUk(null);
  setBackupSuccessUk(null);
  setIsBusyBackup(true);
  try {
    await deleteRecoverySnapshotTransactionally(repositories, snapshotId, {
      allowDeleteOnlyRecoveryPoint: allowOnlyPoint,
    });
    setConfirmDeleteOnlySnapshotId(null);
    await onDataReplacedOrReset("Точку відновлення видалено.");
  } catch (err) {
    if (
      err instanceof PlanuiError &&
      err.code === "ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED"
    ) {
      setConfirmDeleteOnlySnapshotId(snapshotId);
    } else {
      const msg = getErrorMessageUk(err);
      setBackupErrorUk(msg);
      setSettingsToastUk(msg);
    }
  } finally {
    setIsBusyBackup(false);
  }
}

import { resetAllPlanuiDataTransactionally } from "../../storage/backup/backupService";

interface confirmResetAllDataContext {
  setBackupErrorUk: React.Dispatch<React.SetStateAction<string | null>>;
  setBackupSuccessUk: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBusyBackup: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  resetSnapshotHandling: "create_pre_reset_snapshot" | "clear_all_snapshots";
  setShowResetConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function confirmResetAllData({
  setBackupErrorUk,
  setBackupSuccessUk,
  setIsBusyBackup,
  repositories,
  resetSnapshotHandling,
  setShowResetConfirm,
  onDataReplacedOrReset,
  setSettingsToastUk,
}: confirmResetAllDataContext) {
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
    await onDataReplacedOrReset("Усі локальні дані очищено.");
  } catch (err) {
    const msg = getErrorMessageUk(err);
    setBackupErrorUk(msg);
    setSettingsToastUk(msg);
  } finally {
    setIsBusyBackup(false);
  }
}
