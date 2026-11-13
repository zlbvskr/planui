import { PlanuiSettings, ThemePreference } from "../../domain/types";
import { Section } from "../../ui/headers";
import { Row } from "../../ui/rows";
import { Segmented } from "../../ui/selection";
import { Toggle } from "../../ui/Toggle";

interface AppearanceSettingsProps {
  settings: PlanuiSettings;
  handleThemeChange: (theme: ThemePreference) => Promise<void>;
  SCALE_LABELS: readonly [
    "Найменший",
    "Менший",
    "Стандартний",
    "Більший",
    "Найбільший",
  ];
  scaleIndex: number;
  handleScaleIndexChange: (nextIndex: number) => void;
  handleAccessibilityChange: (
    key: "reducedMotionOverride",
    value: boolean,
  ) => Promise<void>;
  isSavingSettings: boolean;
}

export function AppearanceSettings({
  settings,
  handleThemeChange,
  SCALE_LABELS,
  scaleIndex,
  handleScaleIndexChange,
  handleAccessibilityChange,
  isSavingSettings,
}: AppearanceSettingsProps) {
  return (
    <Section title="Вигляд">
      <Row
        title="Тема"
        trailing={
          <div className="w-[210px] max-w-full">
            <Segmented<ThemePreference>
              label="Тема оформлення"
              value={settings.theme}
              onChange={(theme) => void handleThemeChange(theme)}
              options={[
                { value: "system", label: "Системна" },
                { value: "light", label: "Світла" },
                { value: "dark", label: "Темна" },
              ]}
            />
          </div>
        }
      />
      <div className="p-3.5 space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Розмір тексту
          </span>
          <span className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
            {SCALE_LABELS[scaleIndex]}
          </span>
        </div>
        <div className="flex items-center gap-4 px-2">
          <span className="text-xs font-bold text-[var(--text-secondary)] select-none shrink-0">
            А
          </span>
          <div className="relative flex-1 py-2">
            <div className="settings-scale-track h-2 w-full rounded-full bg-[var(--bg-inset)] relative">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)] transition-colors duration-150"
                style={{ width: `${(scaleIndex / 4) * 100}%` }}
              />
              <div className="absolute inset-0 flex justify-between items-center px-0.5 pointer-events-none">
                {[0, 1, 2, 3, 4].map((tick) => (
                  <span
                    key={tick}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      tick <= scaleIndex
                        ? "bg-white/80"
                        : "bg-[var(--border-checkbox)]"
                    }`}
                  />
                ))}
              </div>
              <span
                className="settings-scale-thumb absolute top-1/2 w-6 h-6 rounded-full bg-[var(--bg-surface)] border-2 border-[var(--accent-primary)] shadow-md transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150"
                style={{ left: `${(scaleIndex / 4) * 100}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={scaleIndex}
              onChange={(e) => handleScaleIndexChange(Number(e.target.value))}
              aria-label="Розмір тексту"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-lg font-bold text-[var(--text-secondary)] select-none shrink-0">
            А
          </span>
        </div>
        <div
          className="p-3 rounded-2xl bg-[var(--bg-input)] text-center text-[var(--text-primary)] transition-colors duration-150"
          style={{ fontSize: `calc(1rem * var(--text-scale, 1))` }}
        >
          Так виглядатиме текст
        </div>
      </div>
      <Row
        title="Зменшити рух"
        secondary="Плавні переходи без анімацій"
        trailing={
          <Toggle
            label="Зменшити рух"
            checked={settings.reducedMotionOverride}
            onChange={(v) =>
              void handleAccessibilityChange("reducedMotionOverride", v)
            }
            disabled={isSavingSettings}
            testId="toggle-reduced-motion"
          />
        }
      />
    </Section>
  );
}
