import { PlanuiError } from "../i18n/errorsUk";

export function assertNonEmptyString(
  val: unknown,
  errorCode: "INVALID_ID" | "REQUIRED_TITLE" = "REQUIRED_TITLE",
): string {
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new PlanuiError(errorCode);
  }
  return val.trim();
}

export function assertPositiveRevision(rev: unknown): number {
  if (typeof rev !== "number" || !Number.isSafeInteger(rev) || rev < 1) {
    throw new PlanuiError("INVALID_REVISION", String(rev));
  }
  return rev;
}

export function assertOptionalScale1To5(val: unknown): void {
  if (val === null || val === undefined) return;
  if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 5) {
    throw new PlanuiError("INVALID_SCALE_1_5", String(val));
  }
}
