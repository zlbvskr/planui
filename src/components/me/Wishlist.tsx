import React from "react";
import { itemColor } from "../../domain/modelHelpers";
import type { Folder, Goal } from "../../domain/types";
import { LifeAreaQuestion, Project, WishItem } from "../../domain/types";
import { WISHLIST_TIMING_LABELS_UK } from "../../domain/wishlist";
import { EmptyState } from "../../ui/EmptyState";
import { Icon3D } from "../../ui/Icon3D";
import { ProgressRing } from "../../ui/ProgressRing";
import { Row } from "../../ui/rows";
import { formatWishApproximatePriceUk } from "./mePresentation";

interface WishlistProps {
  groupedWishesByFolder: { name: string; items: WishItem[] }[];
  openWishCreationModal: () => void;
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: LifeAreaQuestion[];
  };
  setWishActionItem: React.Dispatch<React.SetStateAction<WishItem | null>>;
  openEditWishModal: (wish: WishItem) => void;
}

export function Wishlist({
  groupedWishesByFolder,
  openWishCreationModal,
  modelContext,
  setWishActionItem,
  openEditWishModal,
}: WishlistProps) {
  return (
    <div
      className="space-y-4 pb-[calc(var(--dock-h,116px)+32px)]"
      data-testid="me-subview-wishlist"
      data-ui="content-start"
    >
      {groupedWishesByFolder.length === 0 ? (
        <div className="py-12">
          <EmptyState
            context="wishlist"
            text="Список бажань порожній"
            action="Додати бажання"
            actionTestId="empty-add-wish-button"
            onAction={openWishCreationModal}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groupedWishesByFolder.map(({ name, items }) => (
            <div key={name} className="space-y-2">
              <h3 className="text-[17px] leading-[22px] font-[800] text-[var(--text-primary)] px-1 pt-2 pb-1">
                {name}
              </h3>
              {items.map((wish) => {
                const approxPrice = formatWishApproximatePriceUk(
                  wish.estimatedPrice,
                );
                const wishAreaColor = itemColor(wish, modelContext);
                const timingLabel = WISHLIST_TIMING_LABELS_UK[wish.timing];
                const subLine =
                  approxPrice ?? (wish.measure ? undefined : timingLabel);

                return (
                  <div
                    key={wish.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setWishActionItem(wish);
                    }}
                  >
                    <Row
                      data-testid={`wish-item-card-${wish.id}`}
                      className="min-h-[56px]"
                      leading={
                        <Icon3D
                          name={wish.iconKey || wish.icon || "gift"}
                          color={wishAreaColor}
                          size={36}
                          shape="squircle"
                        />
                      }
                      title={
                        <span className="text-[14.5px] leading-[19px] font-[700] text-[var(--text-primary)] line-clamp-1">
                          {wish.title}
                        </span>
                      }
                      secondary={
                        subLine ? (
                          <span className="text-[12px] leading-[16px] font-[600] text-[var(--text-secondary)]">
                            {subLine}
                          </span>
                        ) : undefined
                      }
                      trailing={
                        <div className="flex items-center gap-2 shrink-0">
                          {wish.measure ? (
                            <ProgressRing
                              current={wish.measure.current ?? undefined}
                              target={wish.measure.target ?? undefined}
                              color={wishAreaColor}
                              size={34}
                              strokeWidth={4.5}
                            />
                          ) : timingLabel && !approxPrice ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-[700] bg-[var(--bg-inset)] text-[var(--text-secondary)]">
                              {timingLabel}
                            </span>
                          ) : null}
                        </div>
                      }
                      onClick={() => openEditWishModal(wish)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
