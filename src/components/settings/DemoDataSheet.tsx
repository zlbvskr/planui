import React from "react";
import { GlossyButton } from "../../ui/buttons";
import { Sheet } from "../../ui/sheets";

interface DemoDataSheetProps {
  demoSheetOpen: boolean;
  isBusyDemo: boolean;
  setDemoSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isDemoActive: boolean;
  handleLoadDemo: () => Promise<void>;
  handleRefreshDemoDates: () => Promise<void>;
  setShowRemoveDemoConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

export function DemoDataSheet({
  demoSheetOpen,
  isBusyDemo,
  setDemoSheetOpen,
  isDemoActive,
  handleLoadDemo,
  handleRefreshDemoDates,
  setShowRemoveDemoConfirm,
}: DemoDataSheetProps) {
  return (
    <Sheet
      title="Демо-дані"
      isOpen={demoSheetOpen}
      onClose={() => {
        if (!isBusyDemo) {
          setDemoSheetOpen(false);
        }
      }}
      footer={
        !isDemoActive ? (
          <div className="w-full">
            <GlossyButton
              variant="mint"
              onClick={() => void handleLoadDemo()}
              disabled={isBusyDemo}
              data-testid="load-demo-data-button"
              className="w-full justify-center"
            >
              {isBusyDemo ? "Завантаження…" : "Завантажити демо-дані"}
            </GlossyButton>
          </div>
        ) : (
          <div className="w-full flex items-center gap-2">
            <GlossyButton
              variant="mint"
              onClick={() => void handleRefreshDemoDates()}
              disabled={isBusyDemo}
              data-testid="refresh-demo-dates-button"
              className="flex-1 justify-center"
            >
              {isBusyDemo ? "Оновлення…" : "Оновити дати"}
            </GlossyButton>
            <button
              type="button"
              onClick={() => setShowRemoveDemoConfirm(true)}
              disabled={isBusyDemo}
              data-testid="trigger-remove-demo-button"
              className="ui-pill px-3 py-2 text-xs text-[var(--color-danger)] font-semibold cursor-pointer shrink-0"
            >
              Прибрати
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Приклади всіх розділів, щоб побачити, як виглядає застосунок. Ваші
          записи не змінюються.
        </p>
      </div>
    </Sheet>
  );
}
