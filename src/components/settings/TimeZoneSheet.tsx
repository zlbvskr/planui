import React from "react";
import { PlanuiSettings } from "../../domain/types";
import { SelectField } from "../../ui/fields";
import { Segmented } from "../../ui/selection";
import { Sheet } from "../../ui/sheets";

interface TimeZoneSheetProps {
  timeZoneSheetOpen: boolean;
  setTimeZoneSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  settings: PlanuiSettings;
  handleTimeZoneModeChange: (mode: "device" | "manual") => Promise<void>;
  customZoneInput: string;
  handleSelectManualZone: (zone: string) => Promise<void>;
  manualZoneOptions: { value: string; label: string }[];
  zoneError: string | null;
}

export function TimeZoneSheet({
  timeZoneSheetOpen,
  setTimeZoneSheetOpen,
  settings,
  handleTimeZoneModeChange,
  customZoneInput,
  handleSelectManualZone,
  manualZoneOptions,
  zoneError,
}: TimeZoneSheetProps) {
  return (
    <Sheet
      title="Часовий пояс"
      isOpen={timeZoneSheetOpen}
      onClose={() => setTimeZoneSheetOpen(false)}
    >
      <div className="space-y-4">
        <Segmented<"device" | "manual">
          label="Режим часового поясу"
          value={settings.timeZoneMode}
          onChange={(mode) => void handleTimeZoneModeChange(mode)}
          options={[
            { value: "device", label: "За пристроєм" },
            { value: "manual", label: "Вручну" },
          ]}
        />
        {settings.timeZoneMode === "manual" && (
          <SelectField
            label="Обрати пояс"
            value={customZoneInput}
            onChange={(e) => void handleSelectManualZone(e.target.value)}
            options={manualZoneOptions}
            data-testid="manual-timezone-select"
          />
        )}
        {zoneError && (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {zoneError}
          </p>
        )}
      </div>
    </Sheet>
  );
}
