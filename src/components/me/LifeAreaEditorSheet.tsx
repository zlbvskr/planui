import React from "react";
import type { LifeAreaLink } from "../../domain/lifeAreas";
import { areaIdentity } from "../../domain/modelHelpers";
import type { SphereState } from "../../domain/sphereInsights";
import { LifeAreaQuestion } from "../../domain/types";
import { ImplementedCreationActionKind } from "../../state/shellStore";
import { GlossyButton } from "../../ui/buttons";
import { Icon3D } from "../../ui/Icon3D";
import { Icon } from "../../ui/icons";
import { TextAreaField } from "../../ui/primitives";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";
import { ScoreSlider } from "../../ui/SphereAnalytics";
import { ScoreRing } from "../../ui/spheres";
import { Toggle } from "../../ui/Toggle";

interface LifeAreaEditorSheetProps {
  selectedArea: LifeAreaQuestion | null;
  areaEditorOpen: boolean;
  setAreaEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sphereData: SphereState[];
  handleSaveSelectedArea: () => Promise<void>;
  scoreDraft: number | null;
  setScoreDraft: React.Dispatch<React.SetStateAction<number | null>>;
  definitionDraft: string;
  setDefinitionDraft: React.Dispatch<React.SetStateAction<string>>;
  focusDraft: boolean;
  setFocusDraft: React.Dispatch<React.SetStateAction<boolean>>;
  relatedLinks: LifeAreaLink[];
  setSelectedAreaId: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenGlobalCreation: (
    initialKind?: ImplementedCreationActionKind,
    prefill?: { areaId?: string },
  ) => void;
  setIsLinkPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function LifeAreaEditorSheet({
  selectedArea,
  areaEditorOpen,
  setAreaEditorOpen,
  sphereData,
  handleSaveSelectedArea,
  scoreDraft,
  setScoreDraft,
  definitionDraft,
  setDefinitionDraft,
  focusDraft,
  setFocusDraft,
  relatedLinks,
  setSelectedAreaId,
  onOpenGlobalCreation,
  setIsLinkPickerOpen,
}: LifeAreaEditorSheetProps) {
  return (
    <Sheet
      isOpen={selectedArea !== null && areaEditorOpen}
      onClose={() => setAreaEditorOpen(false)}
      title={
        selectedArea ? (
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <ScoreRing
              area={sphereData.find((a) => a.id === selectedArea.id)!}
              size={48}
            />
            <span className="text-[17px] font-[800] text-[var(--text-primary)] truncate">
              {selectedArea.questionTextUk}
            </span>
          </div>
        ) : (
          "Сфера життя"
        )
      }
      footer={
        selectedArea ? (
          <div className="w-full">
            <GlossyButton
              variant="mint"
              onClick={() => void handleSaveSelectedArea()}
              className="w-full justify-center"
            >
              Зберегти
            </GlossyButton>
          </div>
        ) : undefined
      }
    >
      {selectedArea && (
        <div className="space-y-4">
          <ScoreSlider
            area={selectedArea}
            value={scoreDraft}
            onChange={setScoreDraft}
          />

          <TextAreaField
            label="Що означає «достатньо добре» для мене"
            value={definitionDraft}
            onChange={(e) => setDefinitionDraft(e.target.value)}
            placeholder="Опишіть орієнтир для цієї сфери..."
            rows={3}
            className="w-full"
          />

          <Row
            title="Фокус зараз"
            secondary="Приділяти більше уваги у щоденному плануванні"
            trailing={
              <Toggle
                label="Фокус зараз"
                checked={focusDraft}
                onChange={(checked) => setFocusDraft(checked)}
              />
            }
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-extrabold text-[var(--text-primary)]">
                Що підтримує цю сферу
              </span>
            </div>
            {relatedLinks.length === 0 ? (
              <div className="p-3 text-center text-xs text-[var(--text-tertiary)] rounded-2xl bg-[var(--bg-input)]">
                Немає пов'язаних записів
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                {relatedLinks.map((l) => (
                  <Row
                    key={`${l.kind}-${l.id}`}
                    leading={
                      <Icon3D
                        name={
                          l.kind === "project"
                            ? "folder"
                            : l.kind === "goal"
                              ? "target"
                              : l.kind === "habit"
                                ? "repeat"
                                : "check"
                        }
                        color={areaIdentity(selectedArea)}
                        size={28}
                        shape="squircle"
                      />
                    }
                    title={l.title}
                    secondary={
                      l.kind === "project"
                        ? "Проєкт"
                        : l.kind === "goal"
                          ? "Ціль"
                          : l.kind === "habit"
                            ? "Звичка"
                            : "Завдання"
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <Row
              title="Додати крок"
              leading={
                <Icon3D
                  name="check"
                  size={28}
                  shape="squircle"
                  color={areaIdentity(selectedArea)}
                />
              }
              trailing={
                <Icon
                  name="plus"
                  size={18}
                  className="text-[var(--text-secondary)]"
                />
              }
              onClick={() => {
                setSelectedAreaId(null);
                onOpenGlobalCreation?.("task", { areaId: selectedArea?.id });
              }}
            />
            <Row
              title="Пов’язати запис"
              leading={
                <Icon3D
                  name="target"
                  size={28}
                  shape="squircle"
                  color={areaIdentity(selectedArea)}
                />
              }
              trailing={
                <Icon
                  name="chevron-right"
                  size={18}
                  className="text-[var(--text-secondary)]"
                />
              }
              onClick={() => setIsLinkPickerOpen(true)}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
