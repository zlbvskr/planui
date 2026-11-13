import React from "react";
import { PlanuiDomainSnapshot } from "../../domain/types";
import { Section } from "../../ui/headers";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";
import { StoragePersistenceEstimate } from "./settingsPresentation";

interface StorageSheetProps {
  storageSheetOpen: boolean;
  setStorageSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  storageStatusLineUk: string;
  storageEstimate: StoragePersistenceEstimate;
  handleRequestPersistentStorage: () => Promise<void>;
  isRequestingPersistence: boolean;
  snapshot: PlanuiDomainSnapshot;
}

export function StorageSheet({
  storageSheetOpen,
  setStorageSheetOpen,
  storageStatusLineUk,
  storageEstimate,
  handleRequestPersistentStorage,
  isRequestingPersistence,
  snapshot,
}: StorageSheetProps) {
  return (
    <Sheet
      title="Сховище"
      isOpen={storageSheetOpen}
      onClose={() => setStorageSheetOpen(false)}
    >
      <div className="space-y-4">
        <Section title="Стан сховища">
          <Row
            title={storageStatusLineUk}
            secondary="Встановіть на головний екран, щоб дані не очищувалися"
            trailing={
              <span
                className="text-xs font-medium text-[var(--text-secondary)]"
                data-testid="persistent-storage-status"
              >
                {storageEstimate.persisted === true
                  ? "Захищено"
                  : storageEstimate.persisted === false
                    ? "Стандартний режим"
                    : "Локально"}
              </span>
            }
          />
          {storageEstimate.persisted !== true && (
            <Row
              title="Захист від автоочищення"
              trailing={
                <button
                  type="button"
                  onClick={() => void handleRequestPersistentStorage()}
                  disabled={isRequestingPersistence}
                  data-testid="request-persistent-storage-button"
                  className="min-h-[44px] px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {isRequestingPersistence ? "Запит…" : "Запросити захист"}
                </button>
              }
            />
          )}
        </Section>

        <Section title="Обсяг записів на пристрої">
          <Row
            title="Папки, цілі, проєкти"
            trailing={`${snapshot.folders.length} / ${snapshot.goals?.length ?? 0} / ${snapshot.projects.length}`}
          />
          <Row
            title="Завдання та події"
            trailing={`${snapshot.tasks.length} / ${snapshot.events.length}`}
          />
          <Row
            title="Звички та записи стану"
            trailing={`${snapshot.habits.length} / ${snapshot.personalRecords.length}`}
          />
          <Row
            title="Натхнення та бажання"
            trailing={`${snapshot.inspirationItems.length} / ${snapshot.wishes.length}`}
          />
        </Section>
      </div>
    </Sheet>
  );
}
