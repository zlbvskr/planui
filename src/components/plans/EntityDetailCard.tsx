import { areaName, itemColor } from "../../domain/modelHelpers";
import {
  Folder,
  Goal,
  LifeAreaAssessment,
  LifeAreaQuestion,
  Project,
  Task,
} from "../../domain/types";
import { formatDate, formatShortDate } from "../../lib/format";
import { MilkyCard } from "../../ui/cards";
import { RowTextValue } from "../../ui/rows";
import { MeasureField } from "../create/MeasureField";
import { ICON_LABELS_UK } from "./planPresentation";

interface RenderEntityDetailCardContext {
  tasks: Task[];
  openFieldEditor: (
    entity: Project | Goal,
    kind: "project" | "goal",
    field:
      | "purpose"
      | "criteria"
      | "nextStep"
      | "targetDate"
      | "area"
      | "icon"
      | "measure",
  ) => void;
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: readonly LifeAreaQuestion[];
    lifeAreas: readonly LifeAreaQuestion[];
    lifeAreaAssessments: readonly LifeAreaAssessment[];
  };
  handleQuickLog: (
    entity: Project | Goal,
    kind: "project" | "goal",
    delta: number,
  ) => Promise<void>;
}

export function renderPlanEntityDetailCard(
  {
    tasks,
    openFieldEditor,
    modelContext,
    handleQuickLog,
  }: RenderEntityDetailCardContext,
  entity: Project | Goal,
  kind: "project" | "goal",
) {
  const isGoal = kind === "goal";
  const whyVal = entity.whyUk || entity.purposeUk;
  const criteriaVal =
    entity.definitionOfDoneUk ||
    (isGoal
      ? (entity as Goal).completionCriteriaUk
      : (entity as Project).completionCriteriaUk ||
        (entity as Project).completionCriteria ||
        (entity as Project).desiredOutcome);
  const nextStepVal =
    entity.nextStepUk ||
    (entity.nextActionTaskId
      ? (tasks.find((t) => t.id === entity.nextActionTaskId)?.title ??
        entity.nextActionTaskId)
      : null);
  const intentionVal =
    entity.ifThenPlanUk ||
    (isGoal
      ? (entity as Goal).implementationIntentionUk
      : (entity as Project).implementationIntentionUk);
  const termVal =
    entity.horizon ||
    (isGoal
      ? (entity as Goal).termStart && (entity as Goal).termEnd
        ? `${formatShortDate((entity as Goal).termStart!)} – ${formatShortDate((entity as Goal).termEnd!)}`
        : (entity as Goal).termEnd
          ? formatDate((entity as Goal).termEnd!)
          : (entity as Goal).timing?.targetDate
            ? formatDate((entity as Goal).timing!.targetDate!)
            : null
      : (entity as Project).targetDate
        ? formatDate((entity as Project).targetDate!)
        : null);
  const iconKey =
    entity.icon || entity.iconKey || (isGoal ? "target" : "folder");

  return (
    <MilkyCard className="entity-detail-card space-y-2.5">
      <RowTextValue
        hideOrb
        title="Для чого це мені"
        value={whyVal || "Не заповнено"}
        chevron
        onClick={() => openFieldEditor(entity, kind, "purpose")}
      />
      <RowTextValue
        hideOrb
        title="Який результат означатиме завершення"
        value={criteriaVal || "Не заповнено"}
        chevron
        onClick={() => openFieldEditor(entity, kind, "criteria")}
      />
      <RowTextValue
        hideOrb
        title="Наступний крок"
        value={
          nextStepVal
            ? intentionVal
              ? `${nextStepVal} · ${intentionVal}`
              : nextStepVal
            : intentionVal
              ? intentionVal
              : "Не заповнено"
        }
        chevron
        onClick={() => openFieldEditor(entity, kind, "nextStep")}
      />
      <RowTextValue
        hideOrb
        title="Термін"
        value={termVal || "Не заповнено"}
        chevron
        onClick={() => openFieldEditor(entity, kind, "targetDate")}
      />
      <RowTextValue
        hideOrb
        title="Сфера"
        value={areaName(entity, modelContext) || "Обрати сферу"}
        chevron
        onClick={() => openFieldEditor(entity, kind, "area")}
      />
      <RowTextValue
        hideOrb
        title="Значок"
        value={ICON_LABELS_UK[iconKey] ?? iconKey}
        chevron
        onClick={() => openFieldEditor(entity, kind, "icon")}
      />
      <MeasureField
        measure={entity.measure}
        color={itemColor(entity, modelContext)}
        onLog={(delta) => handleQuickLog(entity, kind, delta)}
        onEdit={() => openFieldEditor(entity, kind, "measure")}
        sparkline={kind === "project"}
      />
    </MilkyCard>
  );
}
