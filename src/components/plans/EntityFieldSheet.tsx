import React from "react";
import { LifeAreaQuestion } from "../../domain/types";
import { GlossyButton } from "../../ui/buttons";
import { Tile3D } from "../../ui/cards";
import { DateField } from "../../ui/fields";
import { Icon3D } from "../../ui/Icon3D";
import { Sheet } from "../../ui/sheets";
import { MeasureField } from "../create/MeasureField";
import { ParamRow } from "../create/ParamRow";
import { SphereField } from "../create/SphereField";
import { WhenField } from "../create/WhenField";
import { USER_GLYPHS } from "./planPresentation";

interface RenderEntityFieldSheetContext {
  activeDetailEditor: {
    kind: "project" | "goal";
    entityId: string;
    field:
      | "purpose"
      | "criteria"
      | "nextStep"
      | "targetDate"
      | "area"
      | "icon"
      | "measure";
  } | null;
  setActiveDetailEditor: React.Dispatch<
    React.SetStateAction<{
      kind: "project" | "goal";
      entityId: string;
      field:
        | "purpose"
        | "criteria"
        | "nextStep"
        | "targetDate"
        | "area"
        | "icon"
        | "measure";
    } | null>
  >;
  editorTextValue: string;
  setEditorTextValue: React.Dispatch<React.SetStateAction<string>>;
  editorIntentionValue: string;
  setEditorIntentionValue: React.Dispatch<React.SetStateAction<string>>;
  editorStartDateValue: string | null;
  setEditorStartDateValue: React.Dispatch<React.SetStateAction<string | null>>;
  editorDateValue: string | null;
  setEditorDateValue: React.Dispatch<React.SetStateAction<string | null>>;
  lifeAreaQuestions: readonly LifeAreaQuestion[];
  editorAreaValue: string | null;
  setEditorAreaValue: React.Dispatch<React.SetStateAction<string | null>>;
  editorIconValue: string;
  setEditorIconValue: React.Dispatch<React.SetStateAction<string>>;
  measureUnit: string;
  measureTarget: string;
  measureCurrent: string;
  measureDirection: "more" | "less";
  setMeasureUnit: React.Dispatch<React.SetStateAction<string>>;
  setMeasureTarget: React.Dispatch<React.SetStateAction<string>>;
  setMeasureCurrent: React.Dispatch<React.SetStateAction<string>>;
  setMeasureDirection: React.Dispatch<React.SetStateAction<"more" | "less">>;
  handleSaveFieldEditor: () => Promise<void>;
}

export function renderEntityFieldSheet({
  activeDetailEditor,
  setActiveDetailEditor,
  editorTextValue,
  setEditorTextValue,
  editorIntentionValue,
  setEditorIntentionValue,
  editorStartDateValue,
  setEditorStartDateValue,
  editorDateValue,
  setEditorDateValue,
  lifeAreaQuestions,
  editorAreaValue,
  setEditorAreaValue,
  editorIconValue,
  setEditorIconValue,
  measureUnit,
  measureTarget,
  measureCurrent,
  measureDirection,
  setMeasureUnit,
  setMeasureTarget,
  setMeasureCurrent,
  setMeasureDirection,
  handleSaveFieldEditor,
}: RenderEntityFieldSheetContext) {
  if (!activeDetailEditor) return null;
  const { field, kind } = activeDetailEditor;
  const isGoal = kind === "goal";
  const title = {
    purpose: "Для чого це мені",
    criteria: "Який результат означатиме завершення",
    nextStep: "Наступний крок",
    targetDate: "Орієнтовний термін",
    area: "Сфера",
    icon: "Значок",
    measure: "Вимір",
  }[field];

  return (
    <Sheet
      title={title}
      isOpen={Boolean(activeDetailEditor)}
      onClose={() => setActiveDetailEditor(null)}
    >
      <div className="space-y-4 p-2">
        {field === "purpose" && (
          <div className="space-y-2">
            <textarea
              className="ui-textarea-field w-full"
              rows={4}
              value={editorTextValue}
              onChange={(e) => setEditorTextValue(e.target.value)}
              placeholder="Опишіть, чому це важливо..."
              autoFocus
            />
          </div>
        )}

        {field === "criteria" && (
          <div className="space-y-2">
            <textarea
              className="ui-textarea-field w-full"
              rows={4}
              value={editorTextValue}
              onChange={(e) => setEditorTextValue(e.target.value)}
              placeholder="Як саме ви зрозумієте, що результат досягнуто..."
              autoFocus
            />
          </div>
        )}

        {field === "nextStep" && (
          <div className="space-y-3">
            <label className="text-sm font-bold text-secondary block">
              Наступний крок:
            </label>
            <input
              type="text"
              className="ui-input-field w-full"
              value={editorTextValue}
              onChange={(e) => setEditorTextValue(e.target.value)}
              placeholder="Що зробити найперше..."
              autoFocus
            />
            <label className="text-sm font-bold text-secondary block">
              Якщо - то:
            </label>
            <input
              type="text"
              className="ui-input-field w-full"
              value={editorIntentionValue}
              onChange={(e) => setEditorIntentionValue(e.target.value)}
              placeholder="Якщо настане умова, то я зроблю..."
            />
          </div>
        )}

        {field === "targetDate" && (
          <WhenField label="Термін">
            {isGoal && (
              <DateField
                label="Початок"
                value={editorStartDateValue ?? ""}
                onChange={(e) =>
                  setEditorStartDateValue(e.target.value || null)
                }
              />
            )}
            <DateField
              label={isGoal ? "Кінець терміну" : "Орієнтовна дата"}
              value={editorDateValue ?? ""}
              onChange={(e) => setEditorDateValue(e.target.value || null)}
            />
            {(editorDateValue || editorStartDateValue) && (
              <button
                type="button"
                className="text-sm text-rose-500 font-bold mt-1"
                onClick={() => {
                  setEditorStartDateValue(null);
                  setEditorDateValue(null);
                }}
              >
                Очистити термін
              </button>
            )}
          </WhenField>
        )}

        {field === "area" && (
          <ParamRow label="Сфера">
            <SphereField
              areas={lifeAreaQuestions}
              value={editorAreaValue ?? ""}
              onChange={(id) => setEditorAreaValue(id || null)}
              expanded
            />
          </ParamRow>
        )}

        {field === "icon" && (
          <div className="grid grid-cols-4 gap-2.5 py-1">
            {USER_GLYPHS.map((g) => {
              const selected = editorIconValue === g.key;
              return (
                <Tile3D
                  key={g.key}
                  selected={selected}
                  radius={18}
                  className="flex flex-col items-center gap-1.5 p-2.5"
                  onClick={() => setEditorIconValue(g.key)}
                >
                  <Icon3D name={g.key} size={44} />
                  <span
                    className={`text-[12px] font-bold truncate max-w-full ${
                      selected ? "text-[#06281F]" : "text-ink"
                    }`}
                  >
                    {g.label}
                  </span>
                </Tile3D>
              );
            })}
          </div>
        )}

        {field === "measure" && (
          <MeasureField
            draft={{
              unit: measureUnit,
              target: measureTarget,
              current: measureCurrent,
              direction: measureDirection,
            }}
            onDraftChange={(draft) => {
              setMeasureUnit(draft.unit);
              setMeasureTarget(draft.target);
              setMeasureCurrent(draft.current);
              setMeasureDirection(draft.direction);
            }}
          />
        )}

        <div className="pt-2">
          <GlossyButton
            variant="mint"
            fullWidth
            onClick={() => void handleSaveFieldEditor()}
          >
            Зберегти
          </GlossyButton>
        </div>
      </div>
    </Sheet>
  );
}
