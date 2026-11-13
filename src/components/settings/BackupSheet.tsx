import React from "react";
import { RecoverySnapshotRecord } from "../../domain/types";
import { formatInstant } from "../../lib/format";
import { MAX_RECOVERY_SNAPSHOTS } from "../../storage/backup/backupService";
import { Section } from "../../ui/headers";
import { Icon } from "../../ui/icons";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";
import { canShareZipFiles } from "./backupFiles";
import { formatSnapshotReasonUk } from "./settingsPresentation";

interface BackupSheetProps {
  backupSheetOpen: boolean;
  isBusyBackup: boolean;
  setBackupSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  backupErrorUk: string | null;
  backupSuccessUk: string | null;
  handleExportFullBackup: () => Promise<void>;
  handleShareFullBackup: () => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  recoverySnapshots: RecoverySnapshotRecord[];
  activeZone: string;
  setConfirmRestoreSnapshotId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  handleExportRecoverySnapshot: (snapshotId: string) => Promise<void>;
  handleDeleteRecoverySnapshot: (
    snapshotId: string,
    allowOnlyPoint: boolean,
  ) => Promise<void>;
  confirmRestoreSnapshotId: string | null;
  handleConfirmRestoreSnapshot: (snapshotId: string) => Promise<void>;
  confirmDeleteOnlySnapshotId: string | null;
  setConfirmDeleteOnlySnapshotId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
}

export function BackupSheet({
  backupSheetOpen,
  isBusyBackup,
  setBackupSheetOpen,
  backupErrorUk,
  backupSuccessUk,
  handleExportFullBackup,
  handleShareFullBackup,
  fileInputRef,
  recoverySnapshots,
  activeZone,
  setConfirmRestoreSnapshotId,
  handleExportRecoverySnapshot,
  handleDeleteRecoverySnapshot,
  confirmRestoreSnapshotId,
  handleConfirmRestoreSnapshot,
  confirmDeleteOnlySnapshotId,
  setConfirmDeleteOnlySnapshotId,
}: BackupSheetProps) {
  return (
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
                  data-testid={
                    backupSheetOpen ? "export-backup-zip-button" : undefined
                  }
                  className="ui-pill text-xs px-4 py-2"
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
            title="Відновлення з файлу"
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
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
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
                      <Icon name="x" />
                    </button>
                  </div>
                </div>

                {confirmRestoreSnapshotId === snap.id && (
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] space-y-2">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Поточні дані буде збережено у нову точку відновлення.
                    </p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleConfirmRestoreSnapshot(snap.id)
                        }
                        disabled={isBusyBackup}
                        data-testid={`confirm-restore-snapshot-${snap.id}`}
                        className="ui-primary w-full"
                      >
                        Підтвердити відновлення
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreSnapshotId(null)}
                        className="min-h-[44px] px-3 rounded-xl text-xs"
                        aria-label="Скасувати"
                      >
                        <Icon name="x" />
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
                        aria-label="Скасувати"
                      >
                        <Icon name="x" />
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
  );
}
