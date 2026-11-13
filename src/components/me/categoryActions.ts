import React from "react";
import { WishlistCategory } from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";
import { getErrorMessageUk } from "./mePresentation";

interface createCategoryContext {
  setCategoryError: React.Dispatch<React.SetStateAction<string | null>>;
  categoryName: string;
  sortedCategories: WishlistCategory[];
  repositories: PlanuiRepositories;
  setCategoryName: React.Dispatch<React.SetStateAction<string>>;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
}

export async function createCategory(
  {
    setCategoryError,
    categoryName,
    sortedCategories,
    repositories,
    setCategoryName,
    onDataChanged,
  }: createCategoryContext,
  e: React.FormEvent,
) {
  e.preventDefault();
  setCategoryError(null);
  const trimmed = categoryName.trim();
  if (!trimmed) {
    setCategoryError("Введіть назву категорії.");
    return;
  }
  try {
    const nowIso = new Date().toISOString();
    const id = `wcat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const maxOrder = sortedCategories.reduce(
      (max, c) => Math.max(max, c.order),
      0,
    );
    const cat: WishlistCategory = {
      id,
      name: trimmed,
      order: maxOrder + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repositories.saveWishlistCategory(cat);
    setCategoryName("");
    await onDataChanged("Категорію створено");
  } catch (err) {
    setCategoryError(getErrorMessageUk(err));
  }
}

interface renameCategoryContext {
  setCategoryError: React.Dispatch<React.SetStateAction<string | null>>;
  editingCategoryName: string;
  repositories: PlanuiRepositories;
  setEditingCategoryId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingCategoryName: React.Dispatch<React.SetStateAction<string>>;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
}

export async function renameCategory(
  {
    setCategoryError,
    editingCategoryName,
    repositories,
    setEditingCategoryId,
    setEditingCategoryName,
    onDataChanged,
  }: renameCategoryContext,
  cat: WishlistCategory,
) {
  setCategoryError(null);
  const trimmed = editingCategoryName.trim();
  if (!trimmed) {
    setCategoryError("Назва категорії не може бути порожньою.");
    return;
  }
  try {
    const nowIso = new Date().toISOString();
    await repositories.saveWishlistCategory(
      {
        ...cat,
        name: trimmed,
        updatedAt: nowIso,
        revision: cat.revision + 1,
      },
      cat.revision,
    );
    setEditingCategoryId(null);
    setEditingCategoryName("");
    await onDataChanged("Категорію перейменовано");
  } catch (err) {
    setCategoryError(getErrorMessageUk(err));
  }
}

interface moveCategoryContext {
  sortedCategories: WishlistCategory[];
  repositories: PlanuiRepositories;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
  setCategoryError: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function moveCategory(
  {
    sortedCategories,
    repositories,
    onDataChanged,
    setCategoryError,
  }: moveCategoryContext,
  index: number,
  direction: -1 | 1,
) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= sortedCategories.length) return;
  const current = sortedCategories[index];
  const neighbor = sortedCategories[targetIndex];
  try {
    const nowIso = new Date().toISOString();
    await repositories.saveWishlistCategory(
      {
        ...current,
        order: neighbor.order,
        updatedAt: nowIso,
        revision: current.revision + 1,
      },
      current.revision,
    );
    await repositories.saveWishlistCategory(
      {
        ...neighbor,
        order: current.order,
        updatedAt: nowIso,
        revision: neighbor.revision + 1,
      },
      neighbor.revision,
    );
    await onDataChanged();
  } catch (err) {
    setCategoryError(getErrorMessageUk(err));
  }
}

import { EntityId } from "../../domain/types";
import { WishlistCategoryFilter } from "../../domain/wishlist";

interface deleteCategoryContext {
  setCategoryError: React.Dispatch<React.SetStateAction<string | null>>;
  repositories: PlanuiRepositories;
  setConfirmDeleteCategoryId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  wishlistCategoryFilter: string;
  handleSelectCategoryFilter: (next: WishlistCategoryFilter) => void;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
}

export async function deleteCategory(
  {
    setCategoryError,
    repositories,
    setConfirmDeleteCategoryId,
    wishlistCategoryFilter,
    handleSelectCategoryFilter,
    onDataChanged,
  }: deleteCategoryContext,
  categoryId: EntityId,
) {
  setCategoryError(null);
  try {
    const nowIso = new Date().toISOString();
    await repositories.deleteWishlistCategoryTransactionally(
      categoryId,
      nowIso,
    );
    setConfirmDeleteCategoryId(null);
    if (wishlistCategoryFilter === categoryId) {
      handleSelectCategoryFilter("all");
    }
    await onDataChanged("Категорію видалено");
  } catch (err) {
    setCategoryError(getErrorMessageUk(err));
  }
}
