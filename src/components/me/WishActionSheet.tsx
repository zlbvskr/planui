import React from "react";
import { EntityId, WishItem, WishPurchaseStatus } from "../../domain/types";
import { getWishPurchaseStatus } from "../../domain/wishlist";
import { GlossyButton } from "../../ui/buttons";
import { Icon } from "../../ui/icons";
import { Orb } from "../../ui/Orb";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";

interface WishActionSheetProps {
  wishActionItem: WishItem | null;
  setWishActionItem: React.Dispatch<React.SetStateAction<WishItem | null>>;
  handleSetWishStatus: (
    wish: WishItem,
    status: WishPurchaseStatus,
  ) => Promise<void>;
  handleToggleArchiveWish: (wish: WishItem) => Promise<void>;
  openEditWishModal: (wish: WishItem) => void;
  handleDeleteWish: (wishId: EntityId) => Promise<void>;
}

export function WishActionSheet({
  wishActionItem,
  setWishActionItem,
  handleSetWishStatus,
  handleToggleArchiveWish,
  openEditWishModal,
  handleDeleteWish,
}: WishActionSheetProps) {
  return (
    <Sheet
      isOpen={wishActionItem !== null}
      onClose={() => setWishActionItem(null)}
      title={wishActionItem?.title ?? "Бажання"}
      footer={
        <div className="w-full">
          <GlossyButton
            variant="mint"
            onClick={() => setWishActionItem(null)}
            className="w-full justify-center"
          >
            Закрити
          </GlossyButton>
        </div>
      }
    >
      {wishActionItem && (
        <div className="space-y-1 pb-2">
          {getWishPurchaseStatus(wishActionItem) !== "purchased" && (
            <Row
              title="Куплено"
              leading={
                <Orb color="var(--color-mint)" size={24}>
                  <Icon name="check" size={12} color="#FFF" />
                </Orb>
              }
              onClick={() => {
                const w = wishActionItem;
                setWishActionItem(null);
                void handleSetWishStatus(w, "purchased");
              }}
            />
          )}
          {getWishPurchaseStatus(wishActionItem) !== "not_relevant" && (
            <Row
              title="Більше не актуально"
              leading={
                <Orb color="var(--color-neutral-slate)" size={24}>
                  <Icon name="x" size={12} color="#FFF" />
                </Orb>
              }
              onClick={() => {
                const w = wishActionItem;
                setWishActionItem(null);
                void handleSetWishStatus(w, "not_relevant");
              }}
            />
          )}
          <Row
            title={wishActionItem.archived ? "З архіву" : "В архів"}
            leading={
              <Orb color="var(--color-blue)" size={24}>
                <Icon name="folder" size={12} color="#FFF" />
              </Orb>
            }
            onClick={() => {
              const w = wishActionItem;
              setWishActionItem(null);
              void handleToggleArchiveWish(w);
            }}
          />
          <Row
            title="Редагувати"
            leading={
              <Orb color="var(--color-yellow)" size={24}>
                <Icon name="calendar" size={12} color="#FFF" />
              </Orb>
            }
            onClick={() => {
              const w = wishActionItem;
              setWishActionItem(null);
              openEditWishModal(w);
            }}
          />
          <Row
            title="Видалити"
            leading={
              <Orb color="var(--color-danger)" size={24}>
                <Icon name="trash" size={12} color="#FFF" />
              </Orb>
            }
            onClick={() => {
              const w = wishActionItem;
              setWishActionItem(null);
              void handleDeleteWish(w.id);
            }}
          />
        </div>
      )}
    </Sheet>
  );
}
