import { Button } from "../../ui/buttons";
import { DurationField } from "../../ui/fields";
import { Section } from "../../ui/headers";
import { Row } from "../../ui/rows";
import { InfoSheet } from "../../ui/sheets";

interface TaskScopePanelProps {
  setLighterMode: React.Dispatch<
    React.SetStateAction<"split" | "shrink" | "pause" | null>
  >;
  lighterMode: "split" | "shrink" | "pause" | null;
  shrinkDuration: number;
  setShrinkDuration: React.Dispatch<React.SetStateAction<number>>;
  busy: boolean;
  handleShrinkScope: () => Promise<void>;
  splitLines: string;
  setSplitLines: React.Dispatch<React.SetStateAction<string>>;
  handleSplitIntoSteps: () => Promise<void>;
  handlePauseItem: () => Promise<void>;
}

export function TaskScopePanel({
  setLighterMode,
  lighterMode,
  shrinkDuration,
  setShrinkDuration,
  busy,
  handleShrinkScope,
  splitLines,
  setSplitLines,
  handleSplitIntoSteps,
  handlePauseItem,
}: TaskScopePanelProps) {
  return (
    <Section
      title="Зробити легше"
      trailing={
        <InfoSheet title="Зробити легше">
          <p>
            Якщо завдання здається заважким зараз, зменшіть його до
            15-хвилинного першого кроку, розділіть на окремі підкроки або
            поставте на паузу (звільнивши розклад без видалення справи).
          </p>
        </InfoSheet>
      }
    >
      <Row
        title="Зменшити обсяг"
        onClick={() =>
          setLighterMode((m) => (m === "shrink" ? null : "shrink"))
        }
        data-testid="task-lighter-shrink"
      />
      {lighterMode === "shrink" && (
        <div className="p-3 space-y-2 border-t border-[var(--border-subtle)]">
          <DurationField
            label="Нова оцінка часу"
            value={shrinkDuration}
            onChange={(v) => setShrinkDuration(v ?? 15)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void handleShrinkScope()}
          >
            Зберегти менший обсяг
          </Button>
        </div>
      )}

      <Row
        title="Розділити на кроки"
        onClick={() => setLighterMode((m) => (m === "split" ? null : "split"))}
        data-testid="task-lighter-split"
      />
      {lighterMode === "split" && (
        <div className="p-3 space-y-2 border-t border-[var(--border-subtle)]">
          <textarea
            rows={3}
            value={splitLines}
            onChange={(e) => setSplitLines(e.target.value)}
            placeholder="Кожен крок з нового рядка…"
            className="ui-textarea-field w-full"
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void handleSplitIntoSteps()}
          >
            Додати кроки
          </Button>
        </div>
      )}

      <Row
        title="Поставити на паузу"
        onClick={() => void handlePauseItem()}
        data-testid="task-lighter-pause"
      />
    </Section>
  );
}
