import React from "react";
import { EntityId, WishItem, WishlistCategory } from "../../domain/types";
import { computeWishlistCategoryDeleteImpact } from "../../domain/wishlist";
import { GlossyButton } from "../../ui/buttons";
import { Section } from "../../ui/headers";
import { Icon } from "../../ui/icons";
import { InputField } from "../../ui/primitives";
import { Row } from "../../ui/rows";
import { ActionMenu, Sheet } from "../../ui/sheets";

interface WishlistCategorySheetProps {
  isCategoryManagerOpen: boolean;
  setIsCategoryManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingCategoryId: React.Dispatch<React.SetStateAction<string | null>>;
  setConfirmDeleteCategoryId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setCategoryError: React.Dispatch<React.SetStateAction<string | null>>;
  categoryError: string | null;
  handleCreateCategory: (e: React.FormEvent) => Promise<void>;
  categoryName: string;
  setCategoryName: React.Dispatch<React.SetStateAction<string>>;
  sortedCategories: WishlistCategory[];
  editingCategoryId: string | null;
  confirmDeleteCategoryId: string | null;
  wishes: WishItem[];
  editingCategoryName: string;
  setEditingCategoryName: React.Dispatch<React.SetStateAction<string>>;
  handleSaveRenameCategory: (cat: WishlistCategory) => Promise<void>;
  handleMoveCategoryOrder: (index: number, direction: -1 | 1) => Promise<void>;
  handleConfirmDeleteCategory: (categoryId: EntityId) => Promise<void>;
}

export function WishlistCategorySheet({
  isCategoryManagerOpen,
  setIsCategoryManagerOpen,
  setEditingCategoryId,
  setConfirmDeleteCategoryId,
  setCategoryError,
  categoryError,
  handleCreateCategory,
  categoryName,
  setCategoryName,
  sortedCategories,
  editingCategoryId,
  confirmDeleteCategoryId,
  wishes,
  editingCategoryName,
  setEditingCategoryName,
  handleSaveRenameCategory,
  handleMoveCategoryOrder,
  handleConfirmDeleteCategory,
}: WishlistCategorySheetProps) {
  return (
    <Sheet
      isOpen={isCategoryManagerOpen}
      onClose={() => {
        setIsCategoryManagerOpen(false);
        setEditingCategoryId(null);
        setConfirmDeleteCategoryId(null);
        setCategoryError(null);
      }}
      title="Категорії бажань"
      footer={
        <div className="w-full">
          <GlossyButton
            variant="mint"
            onClick={() => {
              setIsCategoryManagerOpen(false);
              setEditingCategoryId(null);
              setConfirmDeleteCategoryId(null);
              setCategoryError(null);
            }}
            className="w-full justify-center"
          >
            Готово
          </GlossyButton>
        </div>
      }
    >
      <div className="space-y-4">
        {categoryError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)]"
          >
            {categoryError}
          </div>
        )}

        <form
          onSubmit={handleCreateCategory}
          className="flex flex-col gap-2 [&>*]:w-full"
        >
          <div className="flex-1">
            <InputField
              label="Нова категорія"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Наприклад: Книги, Дім, Хобі"
              data-testid="new-wishlist-category-input"
            />
          </div>
          <button
            type="submit"
            data-testid="create-wishlist-category-button"
            className="ui-primary"
          >
            Додати
          </button>
        </form>

        {sortedCategories.length === 0 ? (
          <Section>
            <Row title="Категорій поки немає" />
          </Section>
        ) : (
          <Section title="Ваші категорії">
            {sortedCategories.map((cat, idx) => {
              const isRenaming = editingCategoryId === cat.id;
              const isConfirmingDelete = confirmDeleteCategoryId === cat.id;
              const impact = computeWishlistCategoryDeleteImpact(
                cat.id,
                wishes,
              );

              return (
                <div
                  key={cat.id}
                  className="p-3 border-b last:border-b-0 border-[var(--border-subtle)] space-y-2"
                  data-testid={`wishlist-category-row-${cat.id}`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        className="ui-input-field flex-1"
                        data-testid={`rename-category-input-${cat.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveRenameCategory(cat)}
                        data-testid={`save-rename-category-${cat.id}`}
                        className="ui-pill text-xs px-3 py-2"
                      >
                        Зберегти
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCategoryId(null)}
                        className="min-h-[44px] px-3 rounded-xl text-xs"
                        aria-label="Скасувати"
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {cat.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Бажань: {impact.affectedWishesCount}
                        </p>
                      </div>
                      <ActionMenu
                        label={`Дії категорії: ${cat.name}`}
                        items={[
                          ...(idx > 0
                            ? [
                                {
                                  label: "Вище",
                                  onSelect: () =>
                                    void handleMoveCategoryOrder(idx, -1),
                                },
                              ]
                            : []),
                          ...(idx < sortedCategories.length - 1
                            ? [
                                {
                                  label: "Нижче",
                                  onSelect: () =>
                                    void handleMoveCategoryOrder(idx, 1),
                                },
                              ]
                            : []),
                          {
                            label: "Перейменувати",
                            onSelect: () => {
                              setEditingCategoryId(cat.id);
                              setEditingCategoryName(cat.name);
                            },
                          },
                          {
                            label: "Видалити",
                            onSelect: () => setConfirmDeleteCategoryId(cat.id),
                          },
                        ]}
                      />
                    </div>
                  )}

                  {isConfirmingDelete && (
                    <div
                      className="p-2.5 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 space-y-2"
                      data-testid={`confirm-delete-category-box-${cat.id}`}
                    >
                      <p className="text-xs text-[var(--color-danger)]">
                        Категорію буде видалено, а бажання залишаться без
                        категорії.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleConfirmDeleteCategory(cat.id)
                          }
                          data-testid={`confirm-delete-category-btn-${cat.id}`}
                          className="min-h-[44px] px-3 rounded-xl bg-[var(--color-danger)] text-white text-xs font-medium"
                        >
                          Видалити
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCategoryId(null)}
                          className="min-h-[44px] px-3 rounded-xl text-xs"
                          aria-label="Скасувати"
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        )}
      </div>
    </Sheet>
  );
}
