import React from "react";
import { configureMeasure } from "../../domain/sphereInsights";
import { Goal, Project } from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";

interface SaveEntityFieldContext {
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
  goals: Goal[];
  projects: Project[];
  editorTextValue: string;
  editorIntentionValue: string;
  editorStartDateValue: string | null;
  editorDateValue: string | null;
  editorAreaValue: string | null;
  editorIconValue: string;
  measureUnit: string;
  measureTarget: string;
  measureCurrent: string;
  measureDirection: "more" | "less";
  repositories: PlanuiRepositories;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
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
}

export async function saveEntityField({
  activeDetailEditor,
  goals,
  projects,
  editorTextValue,
  editorIntentionValue,
  editorStartDateValue,
  editorDateValue,
  editorAreaValue,
  editorIconValue,
  measureUnit,
  measureTarget,
  measureCurrent,
  measureDirection,
  repositories,
  onDataChanged,
  setActiveDetailEditor,
}: SaveEntityFieldContext) {
  if (!activeDetailEditor) return;
  const { kind, entityId, field } = activeDetailEditor;
  const isGoal = kind === "goal";
  const entity = isGoal
    ? goals.find((g) => g.id === entityId)
    : projects.find((p) => p.id === entityId);
  if (!entity) return;

  try {
    let patch: Record<string, unknown> = {};

    if (field === "purpose") {
      patch = {
        whyUk: editorTextValue.trim() || null,
        purposeUk: editorTextValue.trim() || null,
      };
    } else if (field === "criteria") {
      patch = isGoal
        ? { completionCriteriaUk: editorTextValue.trim() || null }
        : { completionCriteria: editorTextValue.trim() || null };
    } else if (field === "nextStep") {
      patch = {
        nextActionTaskId: editorTextValue.trim() || null,
        implementationIntentionUk: editorIntentionValue.trim() || null,
      };
    } else if (field === "targetDate") {
      patch = isGoal
        ? {
            termStart: editorStartDateValue || null,
            termEnd: editorDateValue || null,
            timing: editorDateValue
              ? { targetDate: editorDateValue, targetPeriodUk: null }
              : null,
          }
        : { targetDate: editorDateValue || null };
    } else if (field === "area") {
      patch = {
        areaId: editorAreaValue ?? undefined,
        lifeAreaId: editorAreaValue,
      };
    } else if (field === "icon") {
      patch = { iconKey: editorIconValue };
    } else if (field === "measure") {
      if (!measureUnit.trim()) {
        patch = { measure: null };
      } else {
        patch = {
          measure: configureMeasure(entity.measure, {
            unit: measureUnit,
            target: measureTarget,
            current: measureCurrent,
            direction: measureDirection,
          }),
        };
      }
    }

    if (isGoal) {
      await repositories.saveGoal(
        { ...entity, ...patch } as Goal,
        entity.revision,
      );
    } else {
      await repositories.saveProject(
        { ...entity, ...patch } as Project,
        entity.revision,
      );
    }
    await onDataChanged("Зміни збережено");
    setActiveDetailEditor(null);
  } catch (e) {
    await onDataChanged(
      e instanceof Error ? e.message : "Не вдалося зберегти вимір.",
    );
  }
}
