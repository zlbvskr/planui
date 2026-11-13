import { validateDailyPlans } from "./today";

import { PlanuiError } from "../i18n/errorsUk";

import { assertValidIanaZone, assertValidIsoInstant } from "./temporal";

import { PLANUI_DB_SCHEMA_VERSION, PlanuiSettings } from "./types";

import { isSupportedCurrencyCode } from "./wishlist";

import { assertPositiveRevision } from "./validationInputs";

export function validateSettingsRecord(
  settings: PlanuiSettings,
): PlanuiSettings {
  if (!settings || typeof settings !== "object") {
    throw new PlanuiError("VALIDATION_FAILED", "settings");
  }
  if (
    !Number.isSafeInteger(settings.dbGeneration) ||
    settings.dbGeneration < 1 ||
    settings.dbGeneration >= Number.MAX_SAFE_INTEGER ||
    settings.dbSchemaVersion !== PLANUI_DB_SCHEMA_VERSION
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    settings.roadmapLayer !== undefined &&
    !["hidden", "key_dates", "periods"].includes(settings.roadmapLayer)
  )
    throw new PlanuiError("VALIDATION_FAILED");
  validateDailyPlans(settings.dailyPlans);
  if (settings.id !== "singleton") {
    throw new PlanuiError("INVALID_ID", String(settings.id));
  }
  if (
    settings.theme !== "system" &&
    settings.theme !== "light" &&
    settings.theme !== "dark"
  ) {
    throw new PlanuiError("VALIDATION_FAILED", "settings.theme");
  }
  if (
    settings.timeZoneMode !== "device" &&
    settings.timeZoneMode !== "manual"
  ) {
    throw new PlanuiError("VALIDATION_FAILED", "settings.timeZoneMode");
  }
  if (settings.manualTimeZone !== null) {
    assertValidIanaZone(settings.manualTimeZone);
  }
  assertValidIanaZone(settings.lastDetectedTimeZone);
  if (
    settings.preferredWishlistCurrency !== null &&
    !isSupportedCurrencyCode(settings.preferredWishlistCurrency)
  ) {
    throw new PlanuiError(
      "WISHLIST_PRICE_UNSUPPORTED_CURRENCY",
      String(settings.preferredWishlistCurrency),
    );
  }
  if (settings.modules !== undefined && settings.modules !== null) {
    if (typeof settings.modules !== "object") {
      throw new PlanuiError("VALIDATION_FAILED", "settings.modules");
    }
    const m = settings.modules;
    if (
      typeof m.habitsEnabled !== "boolean" ||
      typeof m.stateCheckInsEnabled !== "boolean" ||
      typeof m.desiredLifeEnabled !== "boolean" ||
      typeof m.wishlistEnabled !== "boolean" ||
      (m.userConfigured !== undefined && typeof m.userConfigured !== "boolean")
    ) {
      throw new PlanuiError("VALIDATION_FAILED", "settings.modules flags");
    }
  }
  assertValidIsoInstant(settings.updatedAt);
  assertPositiveRevision(settings.revision);
  return settings;
}
