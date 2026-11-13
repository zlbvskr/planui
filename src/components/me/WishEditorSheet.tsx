import React from "react";
import { itemColor, logMeasure } from "../../domain/modelHelpers";
import type { Folder, Goal } from "../../domain/types";
import {
  LifeAreaQuestion,
  Project,
  WishItem,
  WishlistCategory,
  WishlistTimingGroup,
  WishPurchaseStatus,
} from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";
import { GlossyButton } from "../../ui/buttons";
import { AmountField, SelectField } from "../../ui/fields";
import { Icon3D } from "../../ui/Icon3D";
import { InputField, TextAreaField } from "../../ui/primitives";
import { Segmented } from "../../ui/selection";
import { Sheet } from "../../ui/sheets";
import { MeasureField } from "../create/MeasureField";
import { ParamRow } from "../create/ParamRow";

interface WishEditorSheetProps {
  isWishSheetOpen: boolean;
  setIsWishSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeleteWishConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  editingWishItem: WishItem | null;
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: LifeAreaQuestion[];
  };
  isSavingWish: boolean;
  handleSaveWishSheet: (e: React.FormEvent) => Promise<void>;
  wishFormError: string | null;
  repositories: PlanuiRepositories;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
  wishTitleInput: string;
  setWishTitleInput: React.Dispatch<React.SetStateAction<string>>;
  wishPriceInput: string;
  setWishPriceInput: React.Dispatch<React.SetStateAction<string>>;
  wishCurrencyInput: string;
  setWishCurrencyInput: React.Dispatch<React.SetStateAction<string>>;
  isCreatingCategoryInline: boolean;
  wishCategoryInput: string;
  setIsCreatingCategoryInline: React.Dispatch<React.SetStateAction<boolean>>;
  setWishCategoryInput: React.Dispatch<React.SetStateAction<string>>;
  setInlineCategoryName: React.Dispatch<React.SetStateAction<string>>;
  sortedCategories: WishlistCategory[];
  inlineCategoryName: string;
  wishTimingInput: WishlistTimingGroup;
  setWishTimingInput: React.Dispatch<React.SetStateAction<WishlistTimingGroup>>;
  wishStatusInput: WishPurchaseStatus;
  setWishStatusInput: React.Dispatch<React.SetStateAction<WishPurchaseStatus>>;
  wishNoteInput: string;
  setWishNoteInput: React.Dispatch<React.SetStateAction<string>>;
  wishLinkInput: string;
  setWishLinkInput: React.Dispatch<React.SetStateAction<string>>;
}

export function WishEditorSheet({
  isWishSheetOpen,
  setIsWishSheetOpen,
  setShowDeleteWishConfirm,
  editingWishItem,
  modelContext,
  isSavingWish,
  handleSaveWishSheet,
  wishFormError,
  repositories,
  onDataChanged,
  wishTitleInput,
  setWishTitleInput,
  wishPriceInput,
  setWishPriceInput,
  wishCurrencyInput,
  setWishCurrencyInput,
  isCreatingCategoryInline,
  wishCategoryInput,
  setIsCreatingCategoryInline,
  setWishCategoryInput,
  setInlineCategoryName,
  sortedCategories,
  inlineCategoryName,
  wishTimingInput,
  setWishTimingInput,
  wishStatusInput,
  setWishStatusInput,
  wishNoteInput,
  setWishNoteInput,
  wishLinkInput,
  setWishLinkInput,
}: WishEditorSheetProps) {
  return (
    <Sheet
      isOpen={isWishSheetOpen}
      onClose={() => {
        setIsWishSheetOpen(false);
        setShowDeleteWishConfirm(false);
      }}
      title={
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon3D
            name={editingWishItem?.iconKey || editingWishItem?.icon || "gift"}
            color={
              editingWishItem
                ? itemColor(editingWishItem, modelContext)
                : undefined
            }
            size={32}
            shape="squircle"
          />
          <h2 className="text-[17px] leading-[22px] font-[800] text-[var(--text-primary)] truncate">
            {editingWishItem ? editingWishItem.title : "Нове бажання"}
          </h2>
        </div>
      }
      footer={
        <div className="w-full flex items-center gap-2">
          <GlossyButton
            variant="mint"
            type="submit"
            form="wishlist-edit-form"
            disabled={isSavingWish}
            className="flex-1 justify-center"
            data-testid={
              editingWishItem
                ? "confirm-save-wish-button"
                : "wishlist-quick-submit-button"
            }
          >
            Зберегти
          </GlossyButton>
          {editingWishItem && (
            <button
              type="button"
              onClick={() => setShowDeleteWishConfirm(true)}
              data-testid={`delete-wish-button-${editingWishItem.id}`}
              className="ui-pill px-4 py-2 text-xs text-[var(--color-danger)] font-semibold cursor-pointer shrink-0"
            >
              Видалити
            </button>
          )}
        </div>
      }
    >
      <form
        id="wishlist-edit-form"
        onSubmit={handleSaveWishSheet}
        className="space-y-3"
      >
        {wishFormError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)]"
          >
            {wishFormError}
          </div>
        )}

        {editingWishItem?.measure && (
          <MeasureField
            measure={editingWishItem.measure}
            color={itemColor(editingWishItem, modelContext)}
            onLog={async (delta) => {
              await repositories.saveWishItem(
                logMeasure(editingWishItem, delta),
                editingWishItem.revision,
              );
              await onDataChanged();
            }}
          />
        )}

        <InputField
          label="Назва"
          value={wishTitleInput}
          onChange={(e) => setWishTitleInput(e.target.value)}
          placeholder="Що ви хочете придбати або спробувати?"
          data-testid={
            editingWishItem
              ? "edit-wish-title-input"
              : "wishlist-quick-title-input"
          }
        />

        <ParamRow label="Ціна">
          <AmountField
            label="Орієнтовна сума"
            value={wishPriceInput}
            onChange={(val) => setWishPriceInput(val)}
            currency={wishCurrencyInput}
            onCurrencyChange={(cur) => setWishCurrencyInput(cur)}
            placeholder="85 000"
            amountTestId={
              editingWishItem
                ? "edit-wish-price-input"
                : "wishlist-quick-price-input"
            }
            currencyTestId={
              editingWishItem
                ? "edit-wish-currency-select"
                : "wishlist-quick-currency-select"
            }
          />
        </ParamRow>

        <div className="space-y-1.5">
          <SelectField
            label="Категорія"
            value={isCreatingCategoryInline ? "__create__" : wishCategoryInput}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__create__") {
                setIsCreatingCategoryInline(true);
                setWishCategoryInput("");
              } else {
                setIsCreatingCategoryInline(false);
                setWishCategoryInput(val);
                setInlineCategoryName("");
              }
            }}
            data-testid={
              editingWishItem
                ? "edit-wish-category-select"
                : "wishlist-quick-category-select"
            }
            options={[
              { value: "", label: "Без категорії" },
              ...sortedCategories.map((c) => ({
                value: c.id,
                label: c.name,
              })),
              { value: "__create__", label: "+ Нова категорія" },
            ]}
          />
          {isCreatingCategoryInline && (
            <InputField
              label="Назва нової категорії"
              value={inlineCategoryName}
              onChange={(e) => setInlineCategoryName(e.target.value)}
              placeholder="Наприклад: Для музики"
              autoFocus
            />
          )}
        </div>

        <ParamRow label="Група">
          <Segmented<WishlistTimingGroup>
            label="Група"
            value={wishTimingInput}
            onChange={setWishTimingInput}
            options={[
              { value: "now", label: "Зараз" },
              { value: "later", label: "Пізніше" },
              { value: "someday", label: "Колись" },
            ]}
          />
        </ParamRow>

        <div className="flex flex-col gap-1.5">
          <label className="ui-field-label px-1">Статус</label>
          <Segmented<WishPurchaseStatus>
            label="Статус"
            value={wishStatusInput}
            onChange={setWishStatusInput}
            options={[
              { value: "want", label: "Хочу" },
              { value: "purchased", label: "Куплено" },
              { value: "not_relevant", label: "Неактуально" },
            ]}
          />
        </div>

        <TextAreaField
          label="Нотатка"
          value={wishNoteInput}
          onChange={(e) => setWishNoteInput(e.target.value)}
          rows={3}
          placeholder="Посилання, опис, деталі або розмір..."
          data-testid="edit-wish-note-input"
        />

        <InputField
          label="Посилання"
          type="url"
          value={wishLinkInput}
          onChange={(e) => setWishLinkInput(e.target.value)}
          placeholder="https://"
        />
      </form>
    </Sheet>
  );
}
