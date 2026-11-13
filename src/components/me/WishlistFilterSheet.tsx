import React from "react";
import { WishlistCategory } from "../../domain/types";
import {
  WishlistCategoryFilter,
  WishlistTimingFilter,
  WishlistViewScope,
} from "../../domain/wishlist";
import { GlossyButton } from "../../ui/buttons";
import { Icon } from "../../ui/icons";
import { Row } from "../../ui/rows";
import { Segmented } from "../../ui/selection";
import { Sheet } from "../../ui/sheets";

interface WishlistFilterSheetProps {
  isWishFilterSheetOpen: boolean;
  setIsWishFilterSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWishlistTimingFilter: React.Dispatch<
    React.SetStateAction<WishlistTimingFilter>
  >;
  setWishlistViewScope: React.Dispatch<React.SetStateAction<WishlistViewScope>>;
  setWishlistCategoryFilter: React.Dispatch<React.SetStateAction<string>>;
  wishlistTimingFilter: WishlistTimingFilter;
  wishlistViewScope: WishlistViewScope;
  setIsCategoryManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  wishlistCategoryFilter: string;
  handleSelectCategoryFilter: (next: WishlistCategoryFilter) => void;
  sortedCategories: WishlistCategory[];
}

export function WishlistFilterSheet({
  isWishFilterSheetOpen,
  setIsWishFilterSheetOpen,
  setWishlistTimingFilter,
  setWishlistViewScope,
  setWishlistCategoryFilter,
  wishlistTimingFilter,
  wishlistViewScope,
  setIsCategoryManagerOpen,
  wishlistCategoryFilter,
  handleSelectCategoryFilter,
  sortedCategories,
}: WishlistFilterSheetProps) {
  return (
    <Sheet
      isOpen={isWishFilterSheetOpen}
      onClose={() => setIsWishFilterSheetOpen(false)}
      title="Фільтри"
      footer={
        <div className="w-full flex items-center gap-2">
          <GlossyButton
            variant="mint"
            onClick={() => setIsWishFilterSheetOpen(false)}
            className="flex-1 justify-center"
          >
            Застосувати
          </GlossyButton>
          <button
            type="button"
            onClick={() => {
              setWishlistTimingFilter("all");
              setWishlistViewScope("active");
              setWishlistCategoryFilter("all");
            }}
            className="ui-pill px-3 py-2 text-xs font-semibold cursor-pointer shrink-0"
          >
            Скинути
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-[var(--text-primary)] px-1">
            Група
          </span>
          <Segmented<WishlistTimingFilter>
            label="Група наміру"
            value={wishlistTimingFilter}
            onChange={setWishlistTimingFilter}
            options={[
              { value: "all", label: "Усі" },
              { value: "now", label: "Зараз" },
              { value: "later", label: "Пізніше" },
              { value: "someday", label: "Колись" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-bold text-[var(--text-primary)] px-1">
            Статус
          </span>
          <div className="space-y-1">
            {(
              [
                ["active", "Хочу (активні)"],
                ["purchased", "Куплено"],
                ["not_relevant", "Більше не актуально"],
                ["fulfilled", "Здійснено раніше"],
                ["archived", "Архів"],
              ] as const
            ).map(([scope, label]) => {
              const isSelected = wishlistViewScope === scope;
              return (
                <Row
                  key={scope}
                  title={label}
                  trailing={
                    isSelected ? (
                      <Icon
                        name="check"
                        size={18}
                        className="text-[var(--accent-primary)] font-bold"
                      />
                    ) : null
                  }
                  onClick={() => setWishlistViewScope(scope)}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              Категорія
            </span>
            <button
              type="button"
              onClick={() => {
                setIsWishFilterSheetOpen(false);
                setIsCategoryManagerOpen(true);
              }}
              className="text-xs text-[var(--accent-primary)] font-bold cursor-pointer"
            >
              Керувати категоріями
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
            <Row
              title="Усі категорії"
              trailing={
                wishlistCategoryFilter === "all" ? (
                  <Icon
                    name="check"
                    size={18}
                    className="text-[var(--accent-primary)] font-bold"
                  />
                ) : null
              }
              onClick={() => handleSelectCategoryFilter("all")}
            />
            {sortedCategories.map((cat) => {
              const isSelected = wishlistCategoryFilter === cat.id;
              return (
                <Row
                  key={cat.id}
                  title={cat.name}
                  trailing={
                    isSelected ? (
                      <Icon
                        name="check"
                        size={18}
                        className="text-[var(--accent-primary)] font-bold"
                      />
                    ) : null
                  }
                  onClick={() => handleSelectCategoryFilter(cat.id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
