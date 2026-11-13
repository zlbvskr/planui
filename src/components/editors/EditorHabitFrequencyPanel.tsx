import React from "react";
import { Pill } from "../../ui/selection";

interface EditorHabitFrequencyPanelProps {
  habitFreqKind: "daily" | "weekly" | "days_off" | "after_wakeup";
  setHabitFreqKind: React.Dispatch<
    React.SetStateAction<"daily" | "weekly" | "days_off" | "after_wakeup">
  >;
  habitTimesPerWeek: number;
  setHabitTimesPerWeek: React.Dispatch<React.SetStateAction<number>>;
}

export function EditorHabitFrequencyPanel({
  habitFreqKind,
  setHabitFreqKind,
  habitTimesPerWeek,
  setHabitTimesPerWeek,
}: EditorHabitFrequencyPanelProps) {
  return (
    <div
      className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-2.5"
      data-testid="inline-panel-frequency"
    >
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["daily", "Щодня"],
            ["weekly", "N разів на тиждень"],
            ["days_off", "У вихідні від роботи"],
            ["after_wakeup", "Після пробудження"],
          ] as const
        ).map(([key, label]) => (
          <Pill
            key={key}
            selected={habitFreqKind === key}
            onClick={() => setHabitFreqKind(key)}
          >
            {label}
          </Pill>
        ))}
      </div>
      {habitFreqKind === "weekly" && (
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Pill
              key={n}
              selected={habitTimesPerWeek === n}
              onClick={() => setHabitTimesPerWeek(n)}
            >
              {n}
            </Pill>
          ))}
        </div>
      )}
    </div>
  );
}
