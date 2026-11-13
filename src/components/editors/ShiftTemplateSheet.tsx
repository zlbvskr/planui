import React from "react";
import { areaIdentity } from "../../domain/modelHelpers";
import type { LifeAreaQuestion } from "../../domain/types";
import { ShiftTemplate } from "../../domain/types";
import { Orb } from "../../ui/Orb";
import { Button } from "../../ui/buttons";
import { TimeField } from "../../ui/fields";
import { Section } from "../../ui/headers";
import { ParameterChip } from "../../ui/parameters";
import { InputField } from "../../ui/primitives";
import { Segmented } from "../../ui/selection";
import { Sheet } from "../../ui/sheets";
import { ParamRow } from "../create/ParamRow";

interface ShiftTemplateSheetProps {
  tplSheetOpen: boolean;
  setTplSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingTpl: React.Dispatch<React.SetStateAction<ShiftTemplate | null>>;
  editingTpl: ShiftTemplate | null;
  tplName: string;
  handleSaveTemplate: () => Promise<void>;
  setTplName: React.Dispatch<React.SetStateAction<string>>;
  tplStart: string;
  setTplStart: React.Dispatch<React.SetStateAction<string>>;
  tplKindManual: boolean;
  setTplKind: React.Dispatch<React.SetStateAction<"day" | "night">>;
  tplEnd: string;
  setTplEnd: React.Dispatch<React.SetStateAction<string>>;
  tplKind: "day" | "night";
  setTplKindManual: React.Dispatch<React.SetStateAction<boolean>>;
  selectedTplArea: LifeAreaQuestion | null;
  tplAreaOpen: boolean;
  setTplAreaOpen: React.Dispatch<React.SetStateAction<boolean>>;
  renderAreaGridPanel: (
    currentAreaId: string,
    onSelectArea: (id: string) => void,
  ) => React.JSX.Element;
  tplAreaId: string;
  setTplAreaId: React.Dispatch<React.SetStateAction<string>>;
}

export function ShiftTemplateSheet({
  tplSheetOpen,
  setTplSheetOpen,
  setEditingTpl,
  editingTpl,
  tplName,
  handleSaveTemplate,
  setTplName,
  tplStart,
  setTplStart,
  tplKindManual,
  setTplKind,
  tplEnd,
  setTplEnd,
  tplKind,
  setTplKindManual,
  selectedTplArea,
  tplAreaOpen,
  setTplAreaOpen,
  renderAreaGridPanel,
  tplAreaId,
  setTplAreaId,
}: ShiftTemplateSheetProps) {
  return (
    <Sheet
      isOpen={tplSheetOpen}
      onClose={() => {
        setTplSheetOpen(false);
        setEditingTpl(null);
      }}
      title={editingTpl ? "Редагувати шаблон" : "Новий шаблон зміни"}
      footer={
        <Button
          variant="primary"
          disabled={!tplName.trim()}
          onClick={() => void handleSaveTemplate()}
          data-testid="shift-template-save-button"
        >
          Зберегти
        </Button>
      }
    >
      <div className="space-y-4" data-testid="shift-template-sheet">
        <Section>
          <InputField
            label="Назва"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="Наприклад: Денна або Нічна"
            data-testid="shift-template-name-input"
          />
          <TimeField
            label="Початок"
            value={tplStart}
            onChange={(e) => {
              const val = e.target.value.slice(0, 5);
              setTplStart(val);
              if (!tplKindManual) {
                setTplKind(
                  tplEnd <= val || parseInt(val.slice(0, 2), 10) >= 18
                    ? "night"
                    : "day",
                );
              }
            }}
            data-testid="shift-template-start-input"
          />
          <TimeField
            label="Кінець"
            value={tplEnd}
            onChange={(e) => {
              const val = e.target.value.slice(0, 5);
              setTplEnd(val);
              if (!tplKindManual) {
                setTplKind(
                  val <= tplStart || parseInt(tplStart.slice(0, 2), 10) >= 18
                    ? "night"
                    : "day",
                );
              }
            }}
            data-testid="shift-template-end-input"
          />
          {tplEnd <= tplStart && (
            <p
              className="text-xs font-extrabold text-[var(--color-purple-deep)] px-3 pb-1"
              data-testid="shift-template-next-day-hint"
            >
              до наступного дня
            </p>
          )}
        </Section>

        <Segmented<"day" | "night">
          label="Тип зміни"
          value={tplKind}
          onChange={(nextKind) => {
            setTplKindManual(true);
            setTplKind(nextKind);
          }}
          options={[
            { value: "day", label: "Денна" },
            { value: "night", label: "Нічна" },
          ]}
        />

        <div className="space-y-2">
          <ParamRow label="Параметри шаблону">
            <ParameterChip
              icon={<Orb color={areaIdentity(selectedTplArea)} size={16} />}
              label="Сфера"
              value={selectedTplArea?.questionTextUk ?? null}
              selected={tplAreaOpen}
              onClick={() => setTplAreaOpen((v) => !v)}
              data-testid="shift-template-area-chip"
            />
          </ParamRow>
          {tplAreaOpen &&
            renderAreaGridPanel(tplAreaId, (nextId) => {
              setTplAreaId(nextId);
              setTplAreaOpen(false);
            })}
        </div>
      </div>
    </Sheet>
  );
}
