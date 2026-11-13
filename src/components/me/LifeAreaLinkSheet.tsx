import React from "react";
import {
  LifeAreaQuestion,
  PlanuiDomainSnapshot,
  Project,
  WishItem,
} from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";
import { GlossyButton } from "../../ui/buttons";
import { Icon } from "../../ui/icons";
import { Orb } from "../../ui/Orb";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";

interface LifeAreaLinkSheetProps {
  isLinkPickerOpen: boolean;
  setIsLinkPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedArea: LifeAreaQuestion | null;
  projects: Project[];
  repositories: PlanuiRepositories;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
  snapshot: PlanuiDomainSnapshot;
  wishes: WishItem[];
}

export function LifeAreaLinkSheet({
  isLinkPickerOpen,
  setIsLinkPickerOpen,
  selectedArea,
  projects,
  repositories,
  onDataChanged,
  snapshot,
  wishes,
}: LifeAreaLinkSheetProps) {
  return (
    <Sheet
      isOpen={isLinkPickerOpen}
      onClose={() => setIsLinkPickerOpen(false)}
      title="Пов'язати запис зі сферою"
      footer={
        <div className="w-full">
          <GlossyButton
            variant="mint"
            onClick={() => setIsLinkPickerOpen(false)}
            className="w-full justify-center"
          >
            Закрити
          </GlossyButton>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-secondary)]">
          Оберіть елемент, щоб пов'язати його зі сферою «
          {selectedArea?.questionTextUk}»:
        </p>
        <div className="max-h-[60vh] overflow-y-auto space-y-1">
          {projects
            .filter((p) => p.lifeAreaId !== selectedArea?.id && !p.archived)
            .map((p) => (
              <Row
                key={p.id}
                leading={
                  <Orb color="var(--color-neutral-slate)" size={24}>
                    <Icon
                      name="folder"
                      size={12}
                      color="rgba(255, 255, 255, 0.95)"
                    />
                  </Orb>
                }
                title={p.title}
                secondary="Проєкт"
                onClick={async () => {
                  if (!selectedArea) return;
                  await repositories.setLifeAreaLink(
                    "project",
                    p.id,
                    selectedArea.id,
                    p.revision,
                  );
                  await onDataChanged("Проєкт пов'язано зі сферою");
                  setIsLinkPickerOpen(false);
                }}
              />
            ))}

          {snapshot.habits
            .filter(
              (h) =>
                h.lifeAreaId !== selectedArea?.id && h.state !== "archived",
            )
            .map((h) => (
              <Row
                key={h.id}
                leading={
                  <Orb color="var(--color-neutral-slate)" size={24}>
                    <Icon
                      name="repeat"
                      size={12}
                      color="rgba(255, 255, 255, 0.95)"
                    />
                  </Orb>
                }
                title={h.name}
                secondary="Звичка"
                onClick={async () => {
                  if (!selectedArea) return;
                  await repositories.setLifeAreaLink(
                    "habit",
                    h.id,
                    selectedArea.id,
                    h.revision,
                  );
                  await onDataChanged("Звичку пов'язано зі сферою");
                  setIsLinkPickerOpen(false);
                }}
              />
            ))}

          {snapshot.tasks
            .filter(
              (t) => t.state === "open" && t.lifeAreaId !== selectedArea?.id,
            )
            .slice(0, 30)
            .map((t) => (
              <Row
                key={t.id}
                leading={
                  <Orb color="var(--color-neutral-slate)" size={24}>
                    <Icon
                      name="check"
                      size={12}
                      color="rgba(255, 255, 255, 0.95)"
                    />
                  </Orb>
                }
                title={t.title}
                secondary="Завдання"
                onClick={async () => {
                  if (!selectedArea) return;
                  await repositories.setLifeAreaLink(
                    "task",
                    t.id,
                    selectedArea.id,
                    t.revision,
                  );
                  await onDataChanged("Завдання пов'язано зі сферою");
                  setIsLinkPickerOpen(false);
                }}
              />
            ))}

          {wishes
            .filter((w) => w.areaId !== selectedArea?.id && !w.archived)
            .map((w) => (
              <Row
                key={w.id}
                leading={
                  <Orb color="var(--color-neutral-slate)" size={24}>
                    <Icon
                      name="gift"
                      size={12}
                      color="rgba(255, 255, 255, 0.95)"
                    />
                  </Orb>
                }
                title={w.title}
                secondary="Бажання"
                onClick={async () => {
                  if (!selectedArea) return;
                  const updatedWish: WishItem = {
                    ...w,
                    areaId: selectedArea.id,
                    updatedAt: new Date().toISOString(),
                    revision: w.revision + 1,
                  };
                  await repositories.saveWishItem(updatedWish, w.revision);
                  await onDataChanged("Бажання пов'язано зі сферою");
                  setIsLinkPickerOpen(false);
                }}
              />
            ))}
        </div>
      </div>
    </Sheet>
  );
}
