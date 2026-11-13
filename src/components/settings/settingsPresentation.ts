import { RecoverySnapshotRecord } from "../../domain/types";

export const COMMON_IANA_TIMEZONES = [
  "Europe/Kyiv",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Prague",
  "Europe/Vienna",
  "Europe/Vilnius",
  "Europe/Riga",
  "Europe/Tallinn",
  "Europe/Bucharest",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Tokyo",
  "UTC",
] as const;

export function getErrorMessageUk(err: unknown): string {
  return err instanceof Error ? err.message : "Сталася неочікувана помилка.";
}

export interface StoragePersistenceEstimate {
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export function formatBytesUk(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "Невідомо";
  }
  const fmtInt = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
  const fmtDec = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (bytes < 1024) return `${fmtInt.format(bytes)} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${fmtDec.format(kb)} КБ`;
  const mb = kb / 1024;
  return `${fmtDec.format(mb)} МБ`;
}

export function formatSnapshotReasonUk(
  reason: RecoverySnapshotRecord["reason"],
): string {
  switch (reason) {
    case "pre_import_replacement":
      return "Перед імпортом ZIP";
    case "pre_recovery_restore":
      return "Перед відновленням";
    case "pre_reset":
      return "Перед очищенням";
  }
}
