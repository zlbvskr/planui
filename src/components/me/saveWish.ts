import React from "react";
import { validateSafeHttpUrl } from "../../domain/personalSpace";
import {
  PlanuiSettings,
  WishItem,
  WishlistCategory,
  WishlistTimingGroup,
  WishPurchaseStatus,
} from "../../domain/types";
import { buildWishItemRecord } from "../../domain/wishlist";
import { PlanuiRepositories } from "../../storage/repositories";
import { getErrorMessageUk } from "./mePresentation";

interface SaveWishContext {
  setWishFormError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSavingWish: React.Dispatch<React.SetStateAction<boolean>>;
  wishCategoryInput: string;
  inlineCategoryName: string;
  sortedCategories: WishlistCategory[];
  repositories: PlanuiRepositories;
  editingWishId: string | null;
  wishes: WishItem[];
  wishTitleInput: string;
  wishNoteInput: string;
  wishTimingInput: WishlistTimingGroup;
  wishPriceInput: string;
  wishCurrencyInput: string;
  settings: PlanuiSettings;
  wishLinkInput: string;
  wishMediaIdInput: string | null;
  wishProjectInput: string;
  confirmWishCurrency: boolean;
  wishStatusInput: WishPurchaseStatus;
  onSettingsPatch: (patch: Partial<PlanuiSettings>) => void;
  setIsWishSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
}

export async function saveWish(
  {
    setWishFormError,
    setIsSavingWish,
    wishCategoryInput,
    inlineCategoryName,
    sortedCategories,
    repositories,
    editingWishId,
    wishes,
    wishTitleInput,
    wishNoteInput,
    wishTimingInput,
    wishPriceInput,
    wishCurrencyInput,
    settings,
    wishLinkInput,
    wishMediaIdInput,
    wishProjectInput,
    confirmWishCurrency,
    wishStatusInput,
    onSettingsPatch,
    setIsWishSheetOpen,
    onDataChanged,
  }: SaveWishContext,
  e: React.FormEvent,
) {
  e.preventDefault();
  setWishFormError(null);
  setIsSavingWish(true);
  try {
    const nowIso = new Date().toISOString();
    let resolvedCategoryId = wishCategoryInput || null;
    if (inlineCategoryName.trim()) {
      const catId = `wcat-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      const maxOrder = sortedCategories.reduce(
        (max, c) => Math.max(max, c.order),
        0,
      );
      await repositories.saveWishlistCategory({
        id: catId,
        name: inlineCategoryName.trim(),
        order: maxOrder + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });
      resolvedCategoryId = catId;
    }

    const existing = editingWishId
      ? wishes.find((w) => w.id === editingWishId)
      : undefined;
    const id =
      existing?.id ??
      `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { wish: builtWish, explicitCurrencySelected } = buildWishItemRecord({
      id,
      title: wishTitleInput,
      note: wishNoteInput || null,
      categoryId: resolvedCategoryId,
      timing: wishTimingInput,
      rawPriceAmount: wishPriceInput.trim()
        ? wishPriceInput.replace(/\s+/g, "")
        : null,
      currencyCode: wishPriceInput.trim() ? wishCurrencyInput : null,
      preferredCurrency: settings.preferredWishlistCurrency,
      nowIso,
      existingWish: existing,
      linkUrl: wishLinkInput.trim() ? validateSafeHttpUrl(wishLinkInput) : null,
      mediaId: wishMediaIdInput,
      projectId: wishProjectInput || null,
      confirmCurrencyChange: confirmWishCurrency,
    });

    const savedWish: WishItem = existing
      ? {
          ...builtWish,
          purchaseStatus: wishStatusInput,
          purchasedAt:
            wishStatusInput === "purchased"
              ? (existing.purchasedAt ?? nowIso)
              : (existing.purchasedAt ?? null),
        }
      : {
          ...builtWish,
          purchaseStatus: "want",
          purchasedAt: null,
        };

    await repositories.saveWishItem(savedWish, existing?.revision, {
      confirmCurrencyChange: confirmWishCurrency,
    });

    if (
      explicitCurrencySelected &&
      explicitCurrencySelected !== settings.preferredWishlistCurrency
    ) {
      await repositories.updateSettingsPatch(
        { preferredWishlistCurrency: explicitCurrencySelected },
        nowIso,
      );
      onSettingsPatch({
        preferredWishlistCurrency: explicitCurrencySelected,
      });
    }

    setIsWishSheetOpen(false);
    await onDataChanged(existing ? "Бажання оновлено" : "Бажання додано");
  } catch (err) {
    setWishFormError(getErrorMessageUk(err));
  } finally {
    setIsSavingWish(false);
  }
}
