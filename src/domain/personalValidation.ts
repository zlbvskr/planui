import { PlanuiError } from "../i18n/errorsUk";

import {
  assertValidIanaZone,
  assertValidIsoInstant,
  assertValidLocalDate,
} from "./temporal";

import {
  InspirationItem,
  LifeAreaAssessment,
  LifeAreaQuestion,
  PersonalRecord,
  WishItem,
  WishlistCategory,
} from "./types";

import {
  assertValidWishFulfillmentState,
  assertValidWishlistTiming,
  validateExactPriceObject,
} from "./wishlist";

import { assertNonEmptyString } from "./validationInputs";

import { assertOptionalScale1To5 } from "./validationInputs";

import { assertPositiveRevision } from "./validationInputs";

export function validatePersonalRecord(rec: PersonalRecord): PersonalRecord {
  assertNonEmptyString(rec.id, "INVALID_ID");
  assertValidIsoInstant(rec.recordedAt);
  assertValidLocalDate(rec.localDate);
  assertValidIanaZone(rec.zoneId);
  assertOptionalScale1To5(rec.mood);
  assertOptionalScale1To5(rec.energy);
  assertOptionalScale1To5(rec.stress);
  assertOptionalScale1To5(rec.sleepQuality);
  if (rec.scaleVersion !== undefined && rec.scaleVersion !== 1)
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    rec.sleepMinutes != null &&
    (!Number.isInteger(rec.sleepMinutes) ||
      rec.sleepMinutes < 0 ||
      rec.sleepMinutes > 1440)
  )
    throw new PlanuiError("VALIDATION_FAILED");
  assertValidIsoInstant(rec.createdAt);
  assertValidIsoInstant(rec.updatedAt);
  assertPositiveRevision(rec.revision);
  return rec;
}

export function validateLifeAreaQuestion(
  q: LifeAreaQuestion,
): LifeAreaQuestion {
  if (q.archived !== undefined && typeof q.archived !== "boolean")
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    q.goodEnoughUk !== undefined &&
    q.goodEnoughUk !== null &&
    typeof q.goodEnoughUk !== "string"
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    q.mergedIntoId != null &&
    (typeof q.mergedIntoId !== "string" ||
      !q.mergedIntoId.trim() ||
      q.mergedIntoId === q.id ||
      !q.archived)
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    !Number.isFinite(q.order) ||
    !Number.isInteger(q.version) ||
    q.version < 1
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (
    q.starterKeys !== undefined &&
    (!Array.isArray(q.starterKeys) ||
      new Set(q.starterKeys).size !== q.starterKeys.length ||
      q.starterKeys.some((k) => typeof k !== "string" || !k.trim()))
  )
    throw new PlanuiError("VALIDATION_FAILED");
  assertNonEmptyString(q.id, "INVALID_ID");
  assertNonEmptyString(q.questionTextUk, "REQUIRED_TITLE");
  assertValidIsoInstant(q.updatedAt);
  assertPositiveRevision(q.revision);
  return q;
}

export function validateLifeAreaAssessment(
  assessment: LifeAreaAssessment,
): LifeAreaAssessment {
  assertNonEmptyString(assessment.id, "INVALID_ID");
  assertValidIsoInstant(assessment.recordedAt);
  assertValidLocalDate(assessment.periodStartLocalDate);
  assertValidLocalDate(assessment.periodEndLocalDate);
  if (assessment.periodStartLocalDate > assessment.periodEndLocalDate)
    throw new PlanuiError("VALIDATION_FAILED");
  const scale = assessment.scale ?? { min: 1, max: 10 };
  if (
    (scale.min !== 0 && scale.min !== 1) ||
    scale.max !== 10 ||
    (assessment.scale &&
      (typeof assessment.scale.labelUk !== "string" ||
        !assessment.scale.labelUk.trim()))
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (!Array.isArray(assessment.answers))
    throw new PlanuiError("VALIDATION_FAILED");
  const answerIds = new Set<string>();
  for (const ans of assessment.answers) {
    if (answerIds.has(ans.questionId)) throw new PlanuiError("INVALID_ID");
    answerIds.add(ans.questionId);
    if (
      !Number.isInteger(ans.questionVersionSnapshot) ||
      ans.questionVersionSnapshot < 1
    )
      throw new PlanuiError("VALIDATION_FAILED");
    if (
      ans.attentionNow !== undefined &&
      ans.attentionNow !== null &&
      typeof ans.attentionNow !== "boolean"
    )
      throw new PlanuiError("VALIDATION_FAILED");
    for (const value of [
      ans.note,
      ans.usefulChangeUk,
      ans.definitionSnapshotUk,
    ])
      if (value !== undefined && value !== null && typeof value !== "string")
        throw new PlanuiError("VALIDATION_FAILED");
    if (
      ans.satisfactionQuestionSnapshotUk !== undefined &&
      typeof ans.satisfactionQuestionSnapshotUk !== "string"
    )
      throw new PlanuiError("VALIDATION_FAILED");
    assertNonEmptyString(ans.questionId, "INVALID_ID");
    assertNonEmptyString(ans.questionTextSnapshotUk, "REQUIRED_TITLE");
    if (ans.score !== null) {
      if (
        typeof ans.score !== "number" ||
        !Number.isInteger(ans.score) ||
        ans.score < scale.min ||
        ans.score > 10
      ) {
        throw new PlanuiError(
          scale.min === 0 ? "INVALID_SCALE_0_10" : "INVALID_SCALE_1_10",
          String(ans.score),
        );
      }
    }
  }
  assertValidIsoInstant(assessment.createdAt);
  assertValidIsoInstant(assessment.updatedAt);
  assertPositiveRevision(assessment.revision);
  return assessment;
}

export function validateInspirationItemRecord(
  item: InspirationItem,
  mediaIds?: ReadonlySet<string>,
  projectIds?: ReadonlySet<string>,
): InspirationItem {
  assertNonEmptyString(item.id, "INVALID_ID");
  if (item.projectId !== null) {
    assertNonEmptyString(item.projectId, "INVALID_ID");
    if (projectIds && !projectIds.has(item.projectId)) {
      throw new PlanuiError("PROJECT_NOT_FOUND", item.projectId);
    }
  }
  if (
    item.collection !== undefined &&
    !["preferred_life", "saved"].includes(item.collection)
  )
    throw new PlanuiError("VALIDATION_FAILED");
  if (item.linkUrl != null || item.kind === "link") {
    if (!item.linkUrl) {
      throw new PlanuiError("UNSAFE_INSPIRATION_URL");
    }
    try {
      const parsed = new URL(item.linkUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new PlanuiError("UNSAFE_INSPIRATION_URL", item.linkUrl);
      }
    } catch (err) {
      if (err instanceof PlanuiError) throw err;
      throw new PlanuiError("UNSAFE_INSPIRATION_URL", item.linkUrl);
    }
  }
  if (item.mediaId != null || item.kind === "image") {
    if (!item.mediaId) {
      throw new PlanuiError("MISSING_REFERENCED_MEDIA", item.id);
    }
    if (mediaIds && !mediaIds.has(item.mediaId)) {
      throw new PlanuiError("MISSING_REFERENCED_MEDIA", item.mediaId);
    }
  }
  assertValidIsoInstant(item.createdAt);
  assertValidIsoInstant(item.updatedAt);
  assertPositiveRevision(item.revision);
  return item;
}

export function validateWishlistCategoryRecord(
  cat: WishlistCategory,
): WishlistCategory {
  assertNonEmptyString(cat.id, "INVALID_ID");
  assertNonEmptyString(cat.name, "REQUIRED_TITLE");
  const raw = cat as WishlistCategory & Record<string, unknown>;
  if (
    "parentId" in raw &&
    raw.parentId !== undefined &&
    raw.parentId !== null
  ) {
    throw new PlanuiError(
      "VALIDATION_FAILED",
      "Wishlist categories must be flat",
    );
  }
  assertValidIsoInstant(cat.createdAt);
  assertValidIsoInstant(cat.updatedAt);
  assertPositiveRevision(cat.revision);
  return cat;
}

export function validateWishItemRecord(
  wish: WishItem,
  categoryIds?: ReadonlySet<string>,
  mediaIds?: ReadonlySet<string>,
  projectIds?: ReadonlySet<string>,
): WishItem {
  assertNonEmptyString(wish.id, "INVALID_ID");
  assertNonEmptyString(wish.title, "REQUIRED_TITLE");
  if (
    wish.purchaseStatus !== undefined &&
    !["want", "purchased", "not_relevant"].includes(wish.purchaseStatus)
  )
    throw new PlanuiError("WISHLIST_INVALID_STATE");
  if (wish.purchasedAt != null) assertValidIsoInstant(wish.purchasedAt);
  if (wish.purchaseStatus === "purchased" && !wish.purchasedAt)
    throw new PlanuiError("VALIDATION_FAILED");
  if (wish.linkUrl != null) {
    try {
      const url = new URL(wish.linkUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      throw new PlanuiError("UNSAFE_INSPIRATION_URL");
    }
  }
  if (wish.mediaId != null) {
    assertNonEmptyString(wish.mediaId, "INVALID_ID");
    if (mediaIds && !mediaIds.has(wish.mediaId))
      throw new PlanuiError("MISSING_REFERENCED_MEDIA");
  }
  if (wish.projectId != null) {
    assertNonEmptyString(wish.projectId, "INVALID_ID");
    if (projectIds && !projectIds.has(wish.projectId))
      throw new PlanuiError("PROJECT_NOT_FOUND");
  }

  if (wish.categoryId !== null) {
    assertNonEmptyString(wish.categoryId, "INVALID_ID");
    if (categoryIds && !categoryIds.has(wish.categoryId)) {
      throw new PlanuiError("WISHLIST_CATEGORY_NOT_FOUND", wish.categoryId);
    }
  }

  assertValidWishlistTiming(wish.timing);
  assertValidWishFulfillmentState(wish.state);

  if (wish.state === "fulfilled") {
    if (wish.fulfilledAt === null) {
      throw new PlanuiError("WISHLIST_FULFILLED_TIMESTAMP_MISMATCH", wish.id);
    }
    assertValidIsoInstant(wish.fulfilledAt);
  } else {
    if (wish.fulfilledAt !== null) {
      throw new PlanuiError("WISHLIST_FULFILLED_TIMESTAMP_MISMATCH", wish.id);
    }
  }

  validateExactPriceObject(wish.estimatedPrice);
  assertValidIsoInstant(wish.createdAt);
  assertValidIsoInstant(wish.updatedAt);
  assertPositiveRevision(wish.revision);
  return wish;
}
