import React from "react";
import { itemColor } from "../../domain/modelHelpers";
import {
  EntityId,
  Folder,
  Goal,
  LifeAreaAssessment,
  LifeAreaQuestion,
  Project,
  Task,
} from "../../domain/types";
import {
  DestinationContextMap,
  ImplementedCreationActionKind,
} from "../../state/shellStore";
import { PlanuiRepositories } from "../../storage/repositories";
import { GlossyButton, RoundButton } from "../../ui/buttons";
import { Section } from "../../ui/headers";
import { Icon } from "../../ui/icons";
import { Orb } from "../../ui/Orb";
import { Row } from "../../ui/rows";
import { AlertSheet, Sheet } from "../../ui/sheets";
import {
  STATE_LABELS_PROJECT,
  STATE_ORB_HUE,
  formatTaskDeadline,
} from "./planPresentation";

interface ProjectDetailProps {
  subScreenRef: React.RefObject<HTMLDivElement | null>;
  onUpdatePlansContext: (
    patch: Partial<DestinationContextMap["plans"]>,
  ) => void;
  activeProject: Project;
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
  projectTasks: Task[];
  modelContext: {
    folders: Folder[];
    projects: Project[];
    goals: Goal[];
    areas: readonly LifeAreaQuestion[];
    lifeAreas: readonly LifeAreaQuestion[];
    lifeAreaAssessments: readonly LifeAreaAssessment[];
  };
  onToggleTaskState: ((taskId: EntityId) => Promise<void> | void) | undefined;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  statusSheetTarget:
    | { kind: "project"; project: Project }
    | { kind: "goal"; goal: Goal }
    | null;
  repositories: PlanuiRepositories;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
  setRenameTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | { kind: "goal"; goal: Goal }
      | null
    >
  >;
  setRenameValue: React.Dispatch<React.SetStateAction<string>>;
  setMoveTarget: React.Dispatch<
    React.SetStateAction<
      | { kind: "folder"; folder: Folder }
      | { kind: "project"; project: Project }
      | null
    >
  >;
  setMoveTargetFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  setDeleteProjectAlert: React.Dispatch<React.SetStateAction<Project | null>>;
  deleteProjectAlert: Project | null;
  customLogEntity: { kind: "project" | "goal"; id: string } | null;
  setCustomLogEntity: React.Dispatch<
    React.SetStateAction<{ kind: "project" | "goal"; id: string } | null>
  >;
  customLogDelta: string;
  setCustomLogDelta: React.Dispatch<React.SetStateAction<string>>;
  handleQuickLog: (
    entity: Project | Goal,
    kind: "project" | "goal",
    delta: number,
  ) => Promise<void>;
  renderFieldEditorSheet: () => React.JSX.Element | null;
}

export function ProjectDetail({
  subScreenRef,
  onUpdatePlansContext,
  activeProject,
  setStatusSheetTarget,
  renderEntityDetailCard,
  projectTasks,
  modelContext,
  onToggleTaskState,
  onOpenGlobalCreation,
  statusSheetTarget,
  repositories,
  onDataChanged,
  setRenameTarget,
  setRenameValue,
  setMoveTarget,
  setMoveTargetFolderId,
  setDeleteProjectAlert,
  deleteProjectAlert,
  customLogEntity,
  setCustomLogEntity,
  customLogDelta,
  setCustomLogDelta,
  handleQuickLog,
  renderFieldEditorSheet,
}: ProjectDetailProps) {
  return (
    <div
      ref={subScreenRef}
      className="personal-surface project-detail-subscreen space-y-4 pb-28"
      data-testid="project-detail"
    >
      <div className="flex items-center justify-between gap-2.5 pt-1">
        <RoundButton
          size={44}
          aria-label="Назад до проєктів"
          onClick={() => onUpdatePlansContext({ activeProjectId: null })}
        >
          <Icon name="chevron-left" size={18} />
        </RoundButton>
        <h1 className="flex-1 text-[20px] leading-[24px] font-extrabold text-ink truncate">
          {activeProject.title}
        </h1>
        <button
          type="button"
          className="ui-pill is-active min-h-[44px] flex items-center gap-2 px-3.5 py-1.5 cursor-pointer flex-shrink-0"
          style={{
            boxShadow:
              "inset 0 0 0 2px var(--ring-pink), inset 0 1px 0 #FFFFFF, 0 4px 10px -2px var(--ring-pink-glow)",
          }}
          onClick={() =>
            setStatusSheetTarget({ kind: "project", project: activeProject })
          }
          aria-label={`Статус: ${STATE_LABELS_PROJECT[activeProject.state]}`}
        >
          <Orb hue={STATE_ORB_HUE[activeProject.state]} size={20} />
          <span className="text-[13.5px] leading-[18px] font-bold">
            {STATE_LABELS_PROJECT[activeProject.state]}
          </span>
        </button>
      </div>

      {renderEntityDetailCard(activeProject, "project")}

      <Section title="Завдання">
        <div className="space-y-2">
          {projectTasks.map((t) => {
            const taskColor = itemColor(t, modelContext);
            const metaParts: string[] = [];
            if (t.estimatedDurationMinutes)
              metaParts.push(`${t.estimatedDurationMinutes} хв`);
            if (t.deadline) metaParts.push(formatTaskDeadline(t.deadline));
            return (
              <Row
                key={t.id}
                orbColor={taskColor}
                title={t.title}
                meta={metaParts.join(" · ") || undefined}
                checked={t.state === "completed"}
                done={t.state === "completed"}
                glowColor={taskColor}
                checkLabel={
                  t.state === "completed"
                    ? "Позначити відкритим"
                    : "Позначити виконаним"
                }
                onToggleCheck={() => onToggleTaskState?.(t.id)}
              />
            );
          })}
          <Row
            hideOrb
            leading={<Icon name="plus" size={18} />}
            title="Додати завдання"
            onClick={() => onOpenGlobalCreation("task")}
          />
        </div>
      </Section>

      <div
        className="sticky z-20 pt-2"
        style={{ bottom: "calc(var(--dock-h, 120px) + 16px)" }}
      >
        <div className="flex gap-2">
          <GlossyButton
            variant="mint"
            fullWidth
            onClick={() => onOpenGlobalCreation("task")}
          >
            Додати
          </GlossyButton>
          <GlossyButton
            variant="mint"
            fullWidth
            onClick={() => onUpdatePlansContext({ activeProjectId: null })}
          >
            Готово
          </GlossyButton>
        </div>
      </div>

      {statusSheetTarget?.kind === "project" && (
        <Sheet
          isOpen
          title={activeProject.title}
          onClose={() => setStatusSheetTarget(null)}
        >
          <div className="space-y-2 py-1">
            {(["active", "idea", "paused", "completed"] as const).map((st) => (
              <Row
                key={st}
                leading={<Orb hue={STATE_ORB_HUE[st]} size={20} />}
                title={STATE_LABELS_PROJECT[st]}
                selected={activeProject.state === st}
                onClick={async () => {
                  setStatusSheetTarget(null);
                  await repositories.saveProject(
                    {
                      ...activeProject,
                      state: st,
                      completedAt:
                        st === "completed" ? new Date().toISOString() : null,
                    },
                    activeProject.revision,
                  );
                  await onDataChanged();
                }}
              />
            ))}
            <Row
              hideOrb
              title="Перейменувати"
              onClick={() => {
                setStatusSheetTarget(null);
                setRenameTarget({ kind: "project", project: activeProject });
                setRenameValue(activeProject.title);
              }}
            />
            <Row
              hideOrb
              title="Перемістити в папку"
              onClick={() => {
                setStatusSheetTarget(null);
                setMoveTarget({ kind: "project", project: activeProject });
                setMoveTargetFolderId(activeProject.folderId ?? null);
              }}
            />
            <Row
              hideOrb
              title="Видалити проєкт"
              className="text-rose-600"
              onClick={() => {
                setStatusSheetTarget(null);
                setDeleteProjectAlert(activeProject);
              }}
            />
          </div>
        </Sheet>
      )}

      <AlertSheet
        isOpen={Boolean(deleteProjectAlert)}
        title={`Видалити проєкт «${deleteProjectAlert?.title}»?`}
        description="Усі незавершені справи буде переміщено до папки."
        confirmLabel="Видалити"
        destructive
        onClose={() => setDeleteProjectAlert(null)}
        onConfirm={async () => {
          if (!deleteProjectAlert) return;
          await repositories.deleteProjectTransactionally(
            deleteProjectAlert.id,
            "rehome_to_folder",
            new Date().toISOString(),
          );
          setDeleteProjectAlert(null);
          onUpdatePlansContext({ activeProjectId: null });
          await onDataChanged("Проєкт видалено");
        }}
      />

      {customLogEntity && (
        <Sheet
          title="Записати вимір"
          isOpen={Boolean(customLogEntity)}
          onClose={() => setCustomLogEntity(null)}
        >
          <div className="space-y-4 p-2">
            <input
              type="number"
              className="ui-input-field w-full"
              value={customLogDelta}
              onChange={(e) => setCustomLogDelta(e.target.value)}
              placeholder="Введіть додане значення..."
              autoFocus
            />
            <GlossyButton
              variant="mint"
              fullWidth
              disabled={!customLogDelta.trim()}
              onClick={async () => {
                const delta = Number(customLogDelta);
                if (Number.isFinite(delta)) {
                  await handleQuickLog(activeProject, "project", delta);
                }
                setCustomLogEntity(null);
                setCustomLogDelta("");
              }}
            >
              Записати
            </GlossyButton>
          </div>
        </Sheet>
      )}

      {renderFieldEditorSheet()}
    </div>
  );
}
