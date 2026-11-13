import React from "react";
import { itemColor } from "../../domain/modelHelpers";
import {
  Folder,
  Goal,
  LifeAreaAssessment,
  LifeAreaQuestion,
  Project,
  ProjectStage,
} from "../../domain/types";
import { formatShortDate } from "../../lib/format";
import { DestinationContextMap } from "../../state/shellStore";
import { GlossyButton, RoundButton } from "../../ui/buttons";
import { Section } from "../../ui/headers";
import { Icon3D } from "../../ui/Icon3D";
import { Icon } from "../../ui/icons";
import { Orb } from "../../ui/Orb";
import { Row } from "../../ui/rows";
import { Sheet } from "../../ui/sheets";
import { STATE_LABELS_GOAL, STATE_ORB_HUE } from "./planPresentation";

interface GoalDetailSheetProps {
  activeGoal: Goal;
  setActiveGoalId: React.Dispatch<React.SetStateAction<string | null>>;
  onUpdatePlansContext: (
    patch: Partial<DestinationContextMap["plans"]>,
  ) => void;
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: readonly LifeAreaQuestion[];
    lifeAreas: readonly LifeAreaQuestion[];
    lifeAreaAssessments: readonly LifeAreaAssessment[];
  };
  setGoalMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setStatusSheetTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "project"; project: Project }
      | { kind: "goal"; goal: Goal }
      | null
    >
  >;
  renderEntityDetailCard: (
    entity: Project | Goal,
    kind: "project" | "goal",
  ) => React.JSX.Element;
  stages: ProjectStage[];
  setStageSheetTarget: React.Dispatch<
    React.SetStateAction<{
      goalId?: string;
      projectId?: string;
      stage?: ProjectStage;
    } | null>
  >;
}

export function GoalDetailSheet({
  activeGoal,
  setActiveGoalId,
  onUpdatePlansContext,
  modelContext,
  setGoalMenuOpen,
  setStatusSheetTarget,
  renderEntityDetailCard,
  stages,
  setStageSheetTarget,
}: GoalDetailSheetProps) {
  return (
    <Sheet
      isOpen={Boolean(activeGoal)}
      onClose={() => {
        setActiveGoalId(null);
        onUpdatePlansContext({ activeGoalId: null });
      }}
      title={
        <div className="flex items-center gap-2.5 min-w-0 pr-1">
          <div className="w-8 h-8 rounded-[9px] flex items-center justify-center bg-white/70 shadow-sm border border-black/5 flex-shrink-0">
            <Icon3D
              name={activeGoal.icon || activeGoal.iconKey || "target"}
              color={itemColor(activeGoal, modelContext)}
              size={20}
            />
          </div>
          <span className="text-[17px] leading-[22px] font-extrabold text-ink truncate flex-1">
            {activeGoal.title}
          </span>
          <RoundButton
            size={44}
            aria-label="Дії з ціллю"
            onClick={(e) => {
              e.stopPropagation();
              setGoalMenuOpen(true);
            }}
          >
            <Icon name="more-horizontal" size={16} />
          </RoundButton>
        </div>
      }
      footer={
        <GlossyButton
          variant="mint"
          fullWidth
          onClick={() => {
            setActiveGoalId(null);
            onUpdatePlansContext({ activeGoalId: null });
          }}
        >
          Готово
        </GlossyButton>
      }
    >
      <div className="space-y-4 py-1">
        <div className="flex items-center">
          <button
            type="button"
            className="ui-pill is-active min-h-[44px] flex items-center gap-2 px-3.5 py-1.5 cursor-pointer flex-shrink-0"
            style={{
              boxShadow:
                "inset 0 0 0 2px var(--ring-pink), inset 0 1px 0 #FFFFFF, 0 4px 10px -2px var(--ring-pink-glow)",
            }}
            onClick={() =>
              setStatusSheetTarget({ kind: "goal", goal: activeGoal })
            }
            aria-label={`Статус: ${STATE_LABELS_GOAL[activeGoal.state]}`}
          >
            <Orb hue={STATE_ORB_HUE[activeGoal.state]} size={20} />
            <span className="text-[13.5px] leading-[18px] font-bold">
              {STATE_LABELS_GOAL[activeGoal.state]}
            </span>
          </button>
        </div>

        {renderEntityDetailCard(activeGoal, "goal")}

        <Section title="Етапи">
          <div className="space-y-2">
            {stages
              .filter((s) => s.goalId === activeGoal.id)
              .sort((a, b) => a.order - b.order)
              .map((st) => (
                <Row
                  key={st.id}
                  hideOrb
                  leading={
                    <span className="text-sm font-extrabold text-amber-500">
                      ◆
                    </span>
                  }
                  title={st.title}
                  meta={
                    st.dependsOnStageIds?.length
                      ? `Після: ${st.dependsOnStageIds
                          .map((id) => stages.find((s) => s.id === id)?.title)
                          .filter(Boolean)
                          .join(", ")}`
                      : undefined
                  }
                  value={
                    st.targetDate ? formatShortDate(st.targetDate) : undefined
                  }
                  chevron
                  onClick={() =>
                    setStageSheetTarget({
                      goalId: activeGoal.id,
                      stage: st,
                    })
                  }
                />
              ))}
            <Row
              hideOrb
              leading={<Icon name="plus" size={18} />}
              title="Додати етап"
              onClick={() =>
                setStageSheetTarget({
                  goalId: activeGoal.id,
                })
              }
            />
          </div>
        </Section>
      </div>
    </Sheet>
  );
}
