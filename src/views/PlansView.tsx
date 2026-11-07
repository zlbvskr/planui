import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import {
  PageHeader,
  RoundButton,
  PillRow,
  Card,
  Section,
  Row,
  TintedCard,
  Orb,
  ActionMenu,
  Sheet,
  AlertSheet,
  EmptyState,
  DateField,
  StageSheet,
} from "../ui";
import {
  easings,
  ensureMotionRootAttribute,
  isReducedMotion,
  runInterruptibleAnimation,
  tweens,
  useSubScreenTransition,
} from "../ui/motion";
import { formatDate, formatShortDate, formatTimeRange } from "../lib/format";
import { areaColor, itemColor, logMeasure, resolveArea } from "../domain/modelHelpers";

function formatTaskDeadline(deadline: Task["deadline"]): string {
  if (!deadline) return "";
  if (deadline.kind === "date_only") return formatShortDate(deadline.localDate);
  return formatShortDate(deadline.instant.slice(0, 10));
}
import {
  CalendarEvent,
  EntityId,
  Folder,
  Goal,
  LifeAreaQuestion,
  PlanuiSettings,
  Project,
  ProjectStage,
  Task,
  TaskReservation,
} from "../domain/types";
import {
  DestinationContextMap,
  ImplementedCreationActionKind,
} from "../state/shellStore";
import { PlanuiRepositories } from "../storage/repositories";
import { previewStageShift } from "../domain/stageDependencies";
import { computeFolderDeleteImpact, getAllowedMoveTargetFolders } from "../domain/plans";

export interface PlansViewProps {
  folders: Folder[];
  goals: Goal[];
  projects: Project[];
  stages: ProjectStage[];
  tasks: Task[];
  reservations: TaskReservation[];
  events?: CalendarEvent[];
  activeZone?: string;
  actualTodayDate: string;
  plansContext: DestinationContextMap["plans"];
  settings?: PlanuiSettings;
  lifeAreaQuestions?: readonly LifeAreaQuestion[];
  repositories: PlanuiRepositories;
  onUpdatePlansContext: (patch: Partial<DestinationContextMap["plans"]>) => void;
  onOpenGlobalCreation: (preferredAction?: ImplementedCreationActionKind) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
  onModalStateChange?: (isAnyModalOpen: boolean) => void;
  onToggleTaskState?: (taskId: EntityId) => Promise<void> | void;
}

const MONTH_NAMES_UK = [
  "Січ", "Лют", "Бер", "Кві", "Тра", "Чер",
  "Лип", "Сер", "Вер", "Жов", "Лис", "Гру",
];

export const PlansView: React.FC<PlansViewProps> = ({
  folders,
  goals = [],
  projects = [],
  stages = [],
  tasks = [],
  reservations = [],
  events = [],
  activeZone = "UTC",
  actualTodayDate,
  plansContext,
  settings,
  lifeAreaQuestions = [],
  repositories,
  onUpdatePlansContext,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
  onToggleTaskState,
}) => {
  const isGoalsView = plansContext.subMode === "goals";
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(plansContext.searchQuery ?? "");
  const [statusFilter, setStatusFilter] = useState<"active" | "idea" | "paused" | "completed">("active");

  // Timeline year state (defaults to today's year)
  const currentActualYear = Number(actualTodayDate.slice(0, 4)) || 2026;
  const [timelineYear, setTimelineYear] = useState(currentActualYear);

  // Active folder navigation
  const activeFolderId = plansContext.activeFolderId ?? null;

  // Selected project for detail sub-screen
  const activeProjectId = plansContext.activeProjectId ?? null;
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  // Selected goal for goal sheet
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);

  // Folder editing modals
  const [renameFolder, setRenameFolder] = useState<Folder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [moveFolder, setMoveFolder] = useState<Folder | null>(null);
  const [moveFolderTargetParentId, setMoveFolderTargetParentId] = useState<string | null>(null);
  const [deleteFolderAlert, setDeleteFolderAlert] = useState<Folder | null>(null);

  // Project editing modals
  const [newFolderSheet, setNewFolderSheet] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteProjectAlert, setDeleteProjectAlert] = useState<Project | null>(null);

  // Detail row editing sheet (for both project and goal)
  const [activeDetailEditor, setActiveDetailEditor] = useState<{
    kind: "project" | "goal";
    entityId: string;
    field: "purpose" | "criteria" | "nextStep" | "targetDate" | "area" | "measure";
  } | null>(null);

  const [editorTextValue, setEditorTextValue] = useState("");
  const [editorDateValue, setEditorDateValue] = useState<string | null>(null);
  const [editorAreaValue, setEditorAreaValue] = useState<string | null>(null);
  const [editorIntentionValue, setEditorIntentionValue] = useState("");
  const [measureUnit, setMeasureUnit] = useState("");
  const [measureTarget, setMeasureTarget] = useState("");

  // Custom log measure prompt modal
  const [customLogEntity, setCustomLogEntity] = useState<{ kind: "project" | "goal"; id: string } | null>(null);
  const [customLogDelta, setCustomLogDelta] = useState("");

  // Goal stages editing
  const [stageSheetTarget, setStageSheetTarget] = useState<{
    goalId?: string;
    projectId?: string;
    stage?: ProjectStage;
  } | null>(null);
  const [stageShiftAlert, setStageShiftAlert] = useState<{
    stage: ProjectStage;
    affectedStages: ProjectStage[];
  } | null>(null);

  // "Моє бажане життя" text state
  const [myLifeText, setMyLifeText] = useState(settings?.myLife ?? "");
  const myLifeDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    setMyLifeText(settings?.myLife ?? "");
  }, [settings?.myLife]);

  useEffect(() => {
    const isAnyModal =
      Boolean(activeGoal) ||
      Boolean(renameFolder) ||
      Boolean(moveFolder) ||
      Boolean(deleteFolderAlert) ||
      Boolean(deleteProjectAlert) ||
      Boolean(activeDetailEditor) ||
      Boolean(customLogEntity) ||
      Boolean(stageSheetTarget) ||
      Boolean(stageShiftAlert) ||
      newFolderSheet;
    onModalStateChange?.(isAnyModal);
    return () => onModalStateChange?.(false);
  }, [
    activeGoal,
    renameFolder,
    moveFolder,
    deleteFolderAlert,
    deleteProjectAlert,
    activeDetailEditor,
    customLogEntity,
    stageSheetTarget,
    stageShiftAlert,
    newFolderSheet,
  ]);

  // Model context for resolving area colors
  const modelContext = useMemo(
    () => ({ folders, projects, goals, areas: lifeAreaQuestions }),
    [folders, projects, goals, lifeAreaQuestions],
  );

  // Breadcrumbs chain for active folder
  const folderChain = useMemo(() => {
    if (!activeFolderId) return [];
    const chain: Folder[] = [];
    let currentId: string | null = activeFolderId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const f = folders.find((item) => item.id === currentId);
      if (!f) break;
      chain.unshift(f);
      currentId = f.parentId;
    }
    return chain;
  }, [folders, activeFolderId]);

  const currentFolder = folderChain.at(-1) ?? null;

  const subScreenKey = activeProject
    ? `project:${activeProject.id}`
    : activeFolderId
      ? `folder:${activeFolderId}`
      : `root:${isGoalsView ? "goals" : "projects"}`;
  const { containerRef: subScreenRef } = useSubScreenTransition(
    subScreenKey,
    (key) => {
      if (key.startsWith("project:")) return 2;
      if (key.startsWith("folder:")) return 1;
      return 0;
    },
  );

  const timelineGridRef = useRef<HTMLDivElement>(null);
  const prevTimelineYearRef = useRef<number>(timelineYear);

  useLayoutEffect(() => {
    const el = timelineGridRef.current;
    if (!el) return;
    ensureMotionRootAttribute(el);
    if (prevTimelineYearRef.current !== timelineYear) {
      const dir = timelineYear > prevTimelineYearRef.current ? 1 : -1;
      prevTimelineYearRef.current = timelineYear;
      if (isReducedMotion()) {
        runInterruptibleAnimation(el, [{ opacity: 0 }, { opacity: 1 }], {
          durationMs: tweens.reduced,
          easing: easings.out,
          root: el,
          willChange: "opacity",
        });
      } else {
        const offsetPx = dir >= 0 ? 24 : -24;
        runInterruptibleAnimation(
          el,
          [
            { opacity: 0, transform: `translate3d(${offsetPx}px, 0, 0)` },
            { opacity: 1, transform: "translate3d(0px, 0, 0)" },
          ],
          {
            durationMs: tweens.base,
            easing: easings.out,
            root: el,
            willChange: "transform, opacity",
          },
        );
      }
    }
  }, [timelineYear]);

  // Filter projects by status: ideas NEVER appear among active
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesDesc = (p.description ?? "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }
      // Folder filter: if inside a folder, show project if p.folderId === activeFolderId
      if (activeFolderId !== null) {
        if (p.folderId !== activeFolderId) return false;
      } else {
        // At root: show projects with no folder (or matching search across folders)
        if (!searchQuery.trim() && p.folderId !== null) return false;
      }
      // Status filter
      return p.state === statusFilter;
    });
  }, [projects, activeFolderId, searchQuery, statusFilter]);

  // Child folders in current view
  const currentChildFolders = useMemo(() => {
    return folders.filter((f) => {
      if (searchQuery.trim()) {
        return f.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return f.parentId === activeFolderId;
    });
  }, [folders, activeFolderId, searchQuery]);

  // Tasks in current folder (if inside folder)
  const currentFolderTasks = useMemo(() => {
    if (!activeFolderId) return [];
    return tasks.filter((t) => t.folderId === activeFolderId && t.ownership.kind !== "project");
  }, [tasks, activeFolderId]);

  // Goals with terms for the timeline
  const timedGoals = useMemo(() => {
    return goals.filter((g) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!g.title.toLowerCase().includes(q) && !(g.description ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return Boolean(g.termStart || g.termEnd || g.timing?.targetDate);
    });
  }, [goals, searchQuery]);

  // Goals without a term
  const undatedGoals = useMemo(() => {
    return goals.filter((g) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!g.title.toLowerCase().includes(q) && !(g.description ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return !g.termStart && !g.termEnd && !g.timing?.targetDate;
    });
  }, [goals, searchQuery]);

  // Autosave for "Моє бажане життя"
  const handleMyLifeChange = (text: string) => {
    setMyLifeText(text);
    if (myLifeDebounceRef.current) clearTimeout(myLifeDebounceRef.current);
    myLifeDebounceRef.current = window.setTimeout(async () => {
      if (!settings) return;
      try {
        await repositories.saveSettings(
          {
            ...settings,
            myLife: text,
            updatedAt: new Date().toISOString(),
          },
          settings.revision,
        );
        await onDataChanged();
      } catch (e) {
        console.error("Failed to save myLife", e);
      }
    }, 600);
  };

  // Quick measure logging (+1, +5, custom)
  const handleQuickLog = async (entity: Project | Goal, delta: number) => {
    const isGoal = "termStart" in entity || "completionCriteriaUk" in entity;
    const updated = logMeasure(entity, delta);
    try {
      if (isGoal) {
        await repositories.saveGoal(updated as Goal, entity.revision);
      } else {
        await repositories.saveProject(updated as Project, entity.revision);
      }
      await onDataChanged(`Вимір оновлено: +${delta} ${entity.measure?.unit ?? ""}`);
    } catch (e) {
      console.error("Failed to log measure", e);
    }
  };

  // Open detail field editor
  const openFieldEditor = (
    entity: Project | Goal,
    field: "purpose" | "criteria" | "nextStep" | "targetDate" | "area" | "measure",
  ) => {
    const isGoal = "termStart" in entity || "completionCriteriaUk" in entity;
    const kind = isGoal ? "goal" : "project";

    if (field === "purpose") {
      setEditorTextValue(entity.purposeUk ?? "");
    } else if (field === "criteria") {
      setEditorTextValue(
        isGoal
          ? (entity as Goal).completionCriteriaUk ?? ""
          : (entity as Project).completionCriteria ?? "",
      );
    } else if (field === "nextStep") {
      const intention = isGoal
        ? (entity as Goal).implementationIntentionUk ?? ""
        : (entity as Project).purposeUk ?? "";
      setEditorTextValue(entity.nextActionTaskId ?? "");
      setEditorIntentionValue(intention);
    } else if (field === "targetDate") {
      setEditorDateValue(
        isGoal
          ? (entity as Goal).termEnd ?? (entity as Goal).timing?.targetDate ?? null
          : (entity as Project).targetDate ?? null,
      );
    } else if (field === "area") {
      setEditorAreaValue(entity.areaId ?? entity.lifeAreaId ?? null);
    } else if (field === "measure") {
      setMeasureUnit(entity.measure?.unit ?? "");
      setMeasureTarget(entity.measure?.target ? String(entity.measure.target) : "");
    }

    setActiveDetailEditor({ kind, entityId: entity.id, field });
  };

  // Save detail field editor
  const handleSaveFieldEditor = async () => {
    if (!activeDetailEditor) return;
    const { kind, entityId, field } = activeDetailEditor;
    const isGoal = kind === "goal";
    const entity = isGoal
      ? goals.find((g) => g.id === entityId)
      : projects.find((p) => p.id === entityId);
    if (!entity) return;

    let patch: Partial<Project & Goal> = {};

    if (field === "purpose") {
      patch = { purposeUk: editorTextValue.trim() || null };
    } else if (field === "criteria") {
      patch = isGoal
        ? { completionCriteriaUk: editorTextValue.trim() || null }
        : { completionCriteria: editorTextValue.trim() || null };
    } else if (field === "nextStep") {
      patch = isGoal
        ? {
            nextActionTaskId: editorTextValue.trim() || null,
            implementationIntentionUk: editorIntentionValue.trim() || null,
          }
        : {
            nextActionTaskId: editorTextValue.trim() || null,
          };
    } else if (field === "targetDate") {
      patch = isGoal
        ? {
            termEnd: editorDateValue,
            timing: editorDateValue ? { targetDate: editorDateValue, targetPeriodUk: null } : null,
          }
        : { targetDate: editorDateValue };
    } else if (field === "area") {
      patch = { areaId: editorAreaValue, lifeAreaId: editorAreaValue };
    } else if (field === "measure") {
      if (!measureUnit.trim()) {
        patch = { measure: null };
      } else {
        const currentM = entity.measure ?? { unit: measureUnit.trim(), current: 0, log: [] };
        patch = {
          measure: {
            ...currentM,
            unit: measureUnit.trim(),
            target: measureTarget.trim() ? Number(measureTarget) : null,
          },
        };
      }
    }

    try {
      if (isGoal) {
        await repositories.saveGoal({ ...entity, ...patch } as Goal, entity.revision);
      } else {
        await repositories.saveProject({ ...entity, ...patch } as Project, entity.revision);
      }
      await onDataChanged("Зміни збережено");
      setActiveDetailEditor(null);
    } catch (e) {
      console.error("Failed to save field editor", e);
    }
  };

  // PROJECT DETAIL SUB-SCREEN
  if (activeProject) {
    const projectArea = resolveArea(activeProject, modelContext);
    const areaColorCode = projectArea ? itemColor(activeProject, modelContext) : "var(--color-neutral-slate)";
    const projectTasks = tasks.filter(
      (t) => t.ownership.kind === "project" && t.ownership.projectId === activeProject.id,
    );
    const projectReservations = reservations.filter((r) =>
      projectTasks.some((t) => t.id === r.taskId),
    );

    const stateLabels: Record<Project["state"], string> = {
      active: "Активний",
      idea: "Ідея",
      paused: "На паузі",
      completed: "Завершений",
    };

    return (
      <div
        ref={subScreenRef}
        className="project-detail-subscreen"
        data-testid="project-detail"
      >
        {/* Header: round back, title, status pill menu, ⋯ */}
        <div className="subscreen-header">
          <RoundButton
            aria-label="Назад до проєктів"
            onClick={() => onUpdatePlansContext({ activeProjectId: null })}
          >
            <Icon name="chevron-left" size={20} />
          </RoundButton>
          <div className="subscreen-title-area">
            <h1 className="subscreen-title">{activeProject.title}</h1>
          </div>
          <div className="subscreen-actions">
            {/* Status pill menu */}
            <ActionMenu
              label={`Статус: ${stateLabels[activeProject.state]}`}
              items={(["active", "idea", "paused", "completed"] as const).map(
                (st) => ({
                  label: stateLabels[st],
                  onSelect: () => {
                    void repositories
                      .saveProject(
                        {
                          ...activeProject,
                          state: st,
                          completedAt:
                            st === "completed" ? new Date().toISOString() : null,
                        },
                        activeProject.revision,
                      )
                      .then(() => onDataChanged());
                  },
                }),
              )}
            >
              <span className="status-pill-select ui-pressable">
                {stateLabels[activeProject.state]}
              </span>
            </ActionMenu>
            <ActionMenu
              label="Дії з проєктом"
              items={[
                {
                  label: "Змінити назву",
                  onSelect: () => {
                    const newTitle = window.prompt("Назва проєкту:", activeProject.title);
                    if (newTitle && newTitle.trim()) {
                      void repositories
                        .saveProject({ ...activeProject, title: newTitle.trim() }, activeProject.revision)
                        .then(() => onDataChanged());
                    }
                  },
                },
                {
                  label: "Видалити проєкт",
                  onSelect: () => setDeleteProjectAlert(activeProject),
                },
              ]}
            />
          </div>
        </div>

        {/* ONE white card of Rows with value previews */}
        <Card className="project-detail-card">
          <Row
            title="Для чого це мені"
            value={activeProject.purposeUk || undefined}
            chevron
            onClick={() => openFieldEditor(activeProject, "purpose")}
          />
          <Row
            title="Який результат означатиме завершення"
            value={activeProject.completionCriteria || undefined}
            chevron
            onClick={() => openFieldEditor(activeProject, "criteria")}
          />
          <Row
            title="Наступний крок"
            value={
              activeProject.nextActionTaskId
                ? tasks.find((t) => t.id === activeProject.nextActionTaskId)?.title ?? activeProject.nextActionTaskId
                : undefined
            }
            secondary={
              activeProject.purposeUk ? `Якщо — то: ${activeProject.purposeUk}` : undefined
            }
            chevron
            onClick={() => openFieldEditor(activeProject, "nextStep")}
          />
          <Row
            title="Орієнтовний термін"
            value={activeProject.targetDate ? formatDate(activeProject.targetDate) : undefined}
            chevron
            onClick={() => openFieldEditor(activeProject, "targetDate")}
          />
          <Row
            title="Сфера"
            leading={<Orb color={areaColorCode} size={18} />}
            value={projectArea?.name || undefined}
            chevron
            onClick={() => openFieldEditor(activeProject, "area")}
          />
          <Row
            title="Вимір"
            value={
              activeProject.measure
                ? `${activeProject.measure.current} / ${activeProject.measure.target ?? "—"} ${activeProject.measure.unit}`
                : undefined
            }
            trailing={
              activeProject.measure ? (
                <div className="measure-quick-logs" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="measure-log-pill"
                    onClick={() => handleQuickLog(activeProject, 1)}
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    className="measure-log-pill"
                    onClick={() => handleQuickLog(activeProject, 5)}
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    className="measure-log-pill"
                    onClick={() => setCustomLogEntity({ kind: "project", id: activeProject.id })}
                  >
                    Своє
                  </button>
                </div>
              ) : undefined
            }
            chevron={!activeProject.measure}
            onClick={() => openFieldEditor(activeProject, "measure")}
          />
        </Card>

        {/* Deadline row if targetDate exists */}
        {activeProject.targetDate && (
          <Section title="Термін">
            <Row
              leading={<Icon name="calendar" size={18} />}
              title="Кінцевий термін виконання"
              trailing={formatDate(activeProject.targetDate)}
            />
          </Section>
        )}

        {/* Section "Завдання": rows + a "+" row */}
        <Section title="Завдання">
          {projectTasks.map((t) => (
            <Row
              key={t.id}
              leading={
                <button
                  type="button"
                  className="planui-task-check-circle"
                  aria-label={t.state === "completed" ? "Позначити відкритим" : "Позначити виконаним"}
                  onClick={() => onToggleTaskState?.(t.id)}
                >
                  <span className={`planui-check-dot ${t.state === "completed" ? "done" : ""}`}>
                    {t.state === "completed" && <Icon name="check" size={13} />}
                  </span>
                </button>
              }
              title={t.title}
              secondary={t.deadline ? `Термін: ${formatTaskDeadline(t.deadline)}` : undefined}
            />
          ))}
          <Row
            leading={<Icon name="plus" size={18} />}
            title="+ Додати завдання"
            className="row-action-add"
            onClick={() => onOpenGlobalCreation("task")}
          />
        </Section>

        {/* Scheduled work sessions shown separately */}
        <Section title="Заплановані сесії">
          {projectReservations.length > 0 ? (
            projectReservations.map((r) => (
              <Row
                key={r.id}
                leading={<Icon name="clock" size={18} />}
                title={formatShortDate(r.interval.originStartLocalDate)}
                trailing={formatTimeRange(r.interval.originStartLocalTime, r.interval.originEndLocalTime)}
              />
            ))
          ) : (
            <Row title="Немає запланованих сесій" secondary="Заплануйте час у календарі" />
          )}
        </Section>

        {/* Delete Project Alert */}
        <AlertSheet
          isOpen={Boolean(deleteProjectAlert)}
          title={`Видалити проєкт «${deleteProjectAlert?.title}»?`}
          description="Усі незавершені справи можна перенести до папки або видалити."
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

        {/* Field Editor Sheet */}
        {renderFieldEditorSheet()}
      </div>
    );
  }

  // RENDER FIELD EDITOR SHEET
  function renderFieldEditorSheet() {
    if (!activeDetailEditor) return null;
    const { field, kind } = activeDetailEditor;
    const title =
      field === "purpose"
        ? "Для чого це мені"
        : field === "criteria"
          ? "Який результат означатиме завершення"
          : field === "nextStep"
            ? "Наступний крок"
            : field === "targetDate"
              ? "Орієнтовний термін"
              : field === "area"
                ? "Сфера життя"
                : "Вимір";

    return (
      <Sheet
        title={title}
        isOpen={Boolean(activeDetailEditor)}
        onClose={() => setActiveDetailEditor(null)}
      >
        <div className="space-y-4 p-2">
          {field === "purpose" && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Сенс і мета:</label>
              <textarea
                className="ui-textarea-field"
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
              <label className="text-sm font-semibold">Критерії досягнення:</label>
              <textarea
                className="ui-textarea-field"
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
              <label className="text-sm font-semibold">Наступна конкретна дія:</label>
              <input
                type="text"
                className="ui-input-field"
                value={editorTextValue}
                onChange={(e) => setEditorTextValue(e.target.value)}
                placeholder="Що зробити найперше..."
                autoFocus
              />
              <label className="text-sm font-semibold">Якщо — то (імплементація):</label>
              <input
                type="text"
                className="ui-input-field"
                value={editorIntentionValue}
                onChange={(e) => setEditorIntentionValue(e.target.value)}
                placeholder="Якщо станеться X, я зроблю Y..."
              />
            </div>
          )}

          {field === "targetDate" && (
            <div className="space-y-2">
              <DateField
                label="Орієнтовна дата"
                value={editorDateValue ?? ""}
                onChange={(e) => setEditorDateValue(e.target.value || null)}
              />
              {editorDateValue && (
                <button
                  type="button"
                  className="text-xs text-rose-500 font-medium mt-2"
                  onClick={() => setEditorDateValue(null)}
                >
                  Очистити дату
                </button>
              )}
            </div>
          )}

          {field === "area" && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Оберіть сферу життя:</label>
              <div className="space-y-1">
                <Row
                  leading={<Orb color="var(--color-neutral-slate)" size={18} />}
                  title="Без сфери"
                  trailing={editorAreaValue === null ? <Icon name="check" size={18} /> : undefined}
                  onClick={() => setEditorAreaValue(null)}
                />
                {lifeAreaQuestions.map((area) => (
                  <Row
                    key={area.id}
                    leading={<Orb color={areaColor(area.rating)} size={18} />}
                    title={area.questionTextUk}
                    trailing={editorAreaValue === area.id ? <Icon name="check" size={18} /> : undefined}
                    onClick={() => setEditorAreaValue(area.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {field === "measure" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold">Одиниця виміру (стор., км, год):</label>
                <input
                  type="text"
                  className="ui-input-field"
                  value={measureUnit}
                  onChange={(e) => setMeasureUnit(e.target.value)}
                  placeholder="наприклад, стор."
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Цільове значення (опціонально):</label>
                <input
                  type="number"
                  className="ui-input-field"
                  value={measureTarget}
                  onChange={(e) => setMeasureTarget(e.target.value)}
                  placeholder="наприклад, 300"
                />
              </div>
            </div>
          )}

          <div className="pt-4">
            <button
              type="button"
              className="ui-btn ui-btn-primary w-full"
              onClick={handleSaveFieldEditor}
            >
              Зберегти
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  // GOALS TIMELINE COMPUTATIONS
  const timelineMonths = Array.from({ length: 12 }, (_, i) => ({
    index: i,
    label: MONTH_NAMES_UK[i],
  }));

  const actualTodayYear = Number(actualTodayDate.slice(0, 4));
  const actualTodayMonth = Number(actualTodayDate.slice(5, 7)) - 1;
  const actualTodayDay = Number(actualTodayDate.slice(8, 10));
  const isCurrentYearTimeline = timelineYear === actualTodayYear;
  const todayLinePercent = isCurrentYearTimeline
    ? ((actualTodayMonth + (actualTodayDay - 1) / 30) / 12) * 100
    : null;

  return (
    <div
      ref={subScreenRef}
      className="plans-workspace-p7"
      data-testid="destination-view-directions"
    >
      {/* Header: large title "Проєкти" / "Цілі" + round frosted search button (expands into field); NO "+" in header */}
      <PageHeader title={isGoalsView ? "Цілі" : "Проєкти"}>
        <div className="header-actions">
          <RoundButton
            aria-label="Пошук"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Icon name="search" size={18} />
          </RoundButton>
        </div>
      </PageHeader>

      {/* Expandable search bar */}
      {searchOpen && (
        <div className="plan-search-expand-bar">
          <Icon name="search" size={16} />
          <input
            type="text"
            className="plan-search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onUpdatePlansContext({ searchQuery: e.target.value });
            }}
            placeholder={isGoalsView ? "Пошук цілей..." : "Пошук проєктів, папок..."}
            autoFocus
          />
          <button
            type="button"
            className="plan-search-clear"
            onClick={() => {
              setSearchQuery("");
              onUpdatePlansContext({ searchQuery: "" });
              setSearchOpen(false);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* VIEW 1: ПРОЄКТИ */}
      {!isGoalsView && (
        <div className="projects-container space-y-4">
          {/* Status pill row: Активні (ink), Ідеї, На паузі, Завершені */}
          <PillRow
            label="Статус проєктів"
            value={statusFilter}
            options={[
              { value: "active", label: "Активні" },
              { value: "idea", label: "Ідеї" },
              { value: "paused", label: "На паузі" },
              { value: "completed", label: "Завершені" },
            ]}
            onChange={(v) => setStatusFilter(v as any)}
          />

          {/* Breadcrumb path with round back button inside folders */}
          {activeFolderId && currentFolder && (
            <div className="folder-breadcrumbs">
              <RoundButton
                aria-label="Вгору"
                onClick={() =>
                  onUpdatePlansContext({ activeFolderId: currentFolder.parentId })
                }
              >
                <Icon name="chevron-left" size={18} />
              </RoundButton>
              <div className="breadcrumb-path">
                <span
                  className="breadcrumb-root"
                  onClick={() => onUpdatePlansContext({ activeFolderId: null })}
                >
                  Проєкти
                </span>
                {folderChain.map((f, i) => (
                  <React.Fragment key={f.id}>
                    <span className="breadcrumb-sep">/</span>
                    <span
                      className={`breadcrumb-item ${i === folderChain.length - 1 ? "active" : ""}`}
                      onClick={() => onUpdatePlansContext({ activeFolderId: f.id })}
                    >
                      {f.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Folder rows */}
          {currentChildFolders.length > 0 && (
            <div className="folder-list space-y-2">
              {currentChildFolders.map((folder) => {
                const folderArea = resolveArea(folder, modelContext);
                const orbColor = folderArea ? itemColor(folder, modelContext) : "var(--color-neutral-slate)";
                const pCount = projects.filter((p) => p.folderId === folder.id).length;
                const tCount = tasks.filter((t) => t.folderId === folder.id).length;
                const countParts: string[] = [];
                if (pCount > 0) countParts.push(`${pCount} ${pCount === 1 ? "проєкт" : pCount < 5 ? "проєкти" : "проєктів"}`);
                if (tCount > 0) countParts.push(`${tCount} ${tCount === 1 ? "завдання" : tCount < 5 ? "завдання" : "завдань"}`);
                const countString = countParts.join(" · ");

                return (
                  <div
                    key={folder.id}
                    className="folder-row ui-pressable"
                    onClick={() => onUpdatePlansContext({ activeFolderId: folder.id })}
                  >
                    <Orb color={orbColor} size={22} />
                    <div className="folder-info">
                      <span className="folder-name">{folder.name}</span>
                      {countString ? <small className="folder-count">{countString}</small> : null}
                    </div>
                    <Icon name="chevron-right" size={18} />
                    <div onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        label={`Дії з ${folder.name}`}
                        items={[
                          {
                            label: "Перейменувати",
                            onSelect: () => {
                              setRenameFolder(folder);
                              setRenameFolderName(folder.name);
                            },
                          },
                          {
                            label: "Перемістити",
                            onSelect: () => {
                              setMoveFolder(folder);
                              setMoveFolderTargetParentId(folder.parentId);
                            },
                          },
                          {
                            label: "Видалити",
                            onSelect: () => setDeleteFolderAlert(folder),
                          },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Project rows: tinted card in area color */}
          {filteredProjects.length > 0 && (
            <div className="project-list space-y-3">
              {filteredProjects.map((p) => {
                const pColor = itemColor(p, modelContext);
                const hasMeasure = Boolean(p.measure && p.measure.unit);
                const measurePct = p.measure?.target
                  ? Math.min(100, Math.round(((p.measure.current ?? 0) / p.measure.target) * 100))
                  : 0;
                const nextStepTask = p.nextActionTaskId
                  ? tasks.find((t) => t.id === p.nextActionTaskId)
                  : tasks.find((t) => t.ownership.kind === "project" && t.ownership.projectId === p.id && t.state === "open");

                return (
                  <TintedCard
                    key={p.id}
                    color={pColor}
                    className="project-row-card"
                    onClick={() => onUpdatePlansContext({ activeProjectId: p.id })}
                  >
                    <div className="project-card-header">
                      <Orb color={pColor} size={20} />
                      <h3 className="project-card-title">{p.title}</h3>
                      <div onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                          label={`Дії: ${p.title}`}
                          items={[
                            {
                              label: "Відкрити",
                              onSelect: () => onUpdatePlansContext({ activeProjectId: p.id }),
                            },
                            {
                              label: "Видалити проєкт",
                              onSelect: () => setDeleteProjectAlert(p),
                            },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Slim progress bar with measure or next step */}
                    {hasMeasure && p.measure ? (
                      <div className="project-measure-block">
                        <div className="project-measure-track">
                          <div
                            className="project-measure-fill"
                            style={{ width: `${measurePct}%`, background: pColor }}
                          />
                        </div>
                        <span className="project-measure-text">
                          {p.measure.current} / {p.measure.target ?? "—"} {p.measure.unit}
                        </span>
                      </div>
                    ) : nextStepTask ? (
                      <p className="project-next-step">
                        Наступний крок: {nextStepTask.title}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="project-add-step-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFieldEditor(p, "nextStep");
                        }}
                      >
                        Додати наступний крок
                      </button>
                    )}
                  </TintedCard>
                );
              })}
            </div>
          )}

          {/* Tasks in folder (if in folder) */}
          {activeFolderId && currentFolderTasks.length > 0 && (
            <Section title="Завдання папки">
              {currentFolderTasks.map((t) => (
                <Row
                  key={t.id}
                  leading={
                    <button
                      type="button"
                      className="planui-task-check-circle"
                      onClick={() => onToggleTaskState?.(t.id)}
                    >
                      <span className={`planui-check-dot ${t.state === "completed" ? "done" : ""}`}>
                        {t.state === "completed" && <Icon name="check" size={13} />}
                      </span>
                    </button>
                  }
                  title={t.title}
                  secondary={t.deadline ? `Термін: ${formatTaskDeadline(t.deadline)}` : undefined}
                />
              ))}
            </Section>
          )}

          {/* Empty state: orb + "Тут з'являться ваші проєкти" + buttons */}
          {currentChildFolders.length === 0 && filteredProjects.length === 0 && (
            <div className="projects-empty-block" data-testid="projects-empty">
              <Orb color="var(--color-neutral-slate)" size={56} />
              <p className="empty-title">Тут з&apos;являться ваші проєкти</p>
              <div className="empty-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={() => {
                    setNewFolderName("");
                    setNewFolderSheet(true);
                  }}
                >
                  Створити папку
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  onClick={() => onOpenGlobalCreation("project")}
                >
                  Створити проєкт
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ЦІЛІ */}
      {isGoalsView && (
        <div className="goals-container space-y-6">
          {/* Timeline ~1 year ahead: header row with year and ‹ › */}
          <div className="goals-timeline-box">
            <div className="timeline-header">
              <span className="timeline-year-label">{timelineYear}</span>
              <div className="timeline-nav">
                <RoundButton
                  aria-label="Попередній рік"
                  onClick={() => setTimelineYear((y) => y - 1)}
                >
                  <Icon name="chevron-left" size={18} />
                </RoundButton>
                <RoundButton
                  aria-label="Наступний рік"
                  onClick={() => setTimelineYear((y) => y + 1)}
                >
                  <Icon name="chevron-right" size={18} />
                </RoundButton>
              </div>
            </div>

            {/* 12-Month Scale */}
            <div ref={timelineGridRef} className="timeline-grid-wrapper">
              <div className="timeline-month-scale">
                {timelineMonths.map((m) => (
                  <span key={m.index} className="timeline-month-label">
                    {m.label}
                  </span>
                ))}
              </div>

              {/* Blue today line */}
              {todayLinePercent !== null && (
                <div
                  className="timeline-today-line"
                  style={{ left: `${todayLinePercent}%` }}
                  title="Сьогодні"
                />
              )}

              {/* Goal bars spanning termStart to termEnd */}
              <div className="timeline-bars-container space-y-2 pt-2">
                {timedGoals.map((g, barIdx) => {
                  const gColor = itemColor(g, modelContext);
                  const startStr = g.termStart || g.timing?.targetDate || g.termEnd || `${timelineYear}-01-01`;
                  const endStr = g.termEnd || g.timing?.targetDate || g.termStart || `${timelineYear}-12-31`;

                  const yStartMs = Date.UTC(timelineYear, 0, 1);
                  const yEndMs = Date.UTC(timelineYear, 11, 31, 23, 59, 59);
                  const totalYMs = yEndMs - yStartMs;

                  const sMs = new Date(`${startStr}T00:00:00Z`).getTime();
                  const eMs = new Date(`${endStr}T23:59:59Z`).getTime();

                  // Skip if completely outside this year
                  if (eMs < yStartMs || sMs > yEndMs) return null;

                  const leftPct = Math.max(0, ((Math.max(sMs, yStartMs) - yStartMs) / totalYMs) * 100);
                  const rightPct = Math.min(100, ((Math.min(eMs, yEndMs) - yStartMs) / totalYMs) * 100);
                  const widthPct = Math.max(6, rightPct - leftPct);

                  // Stages diamonds
                  const goalStages = stages.filter((s) => s.goalId === g.id && s.targetDate);

                  return (
                    <div key={g.id} className="timeline-goal-row">
                      <div
                        className="timeline-goal-bar ui-pressable"
                        style={
                          {
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            background: `linear-gradient(180deg, ${gColor} 0%, ${gColor} 100%)`,
                            "--bar-idx": Math.min(barIdx, 7),
                          } as React.CSSProperties
                        }
                        onClick={() => setActiveGoal(g)}
                        title={g.title}
                      >
                        <span className="timeline-goal-title">{g.title}</span>

                        {/* Diamonds for stages */}
                        {goalStages.map((st) => {
                          const stMs = new Date(`${st.targetDate}T12:00:00Z`).getTime();
                          if (stMs < sMs || stMs > eMs) return null;
                          const stRelPct = Math.min(95, Math.max(5, ((stMs - sMs) / (eMs - sMs || 1)) * 100));

                          return (
                            <span
                              key={st.id}
                              className="stage-diamond-marker"
                              style={{ left: `${stRelPct}%` }}
                              title={`Етап: ${st.title} (${st.targetDate})`}
                            >
                              ◆
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section: Goals without a term (Без строку) */}
          {undatedGoals.length > 0 && (
            <Section title="Без строку">
              {undatedGoals.map((g) => {
                const gColor = itemColor(g, modelContext);
                return (
                  <Row
                    key={g.id}
                    leading={<Orb color={gColor} size={18} />}
                    title={g.title}
                    secondary={g.purposeUk || undefined}
                    chevron
                    onClick={() => setActiveGoal(g)}
                  />
                );
              })}
            </Section>
          )}

          {/* Empty state for goals */}
          {goals.length === 0 && (
            <div className="projects-empty-block" data-testid="goals-empty">
              <Orb color="var(--color-neutral-slate)" size={56} />
              <p className="empty-title">У вас поки немає цілей</p>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={() => onOpenGlobalCreation("goal")}
              >
                Створити ціль
              </button>
            </div>
          )}

          {/* 4. At the very BOTTOM of the Цілі page: "Моє бажане життя" */}
          <TintedCard color="var(--accent-primary)" className="my-life-box">
            <span className="my-life-tag">Моє бажане життя</span>
            <textarea
              className="my-life-textarea"
              rows={3}
              value={myLifeText}
              onChange={(e) => handleMyLifeChange(e.target.value)}
              placeholder="Опишіть, як ви бачите своє ідеальне життя"
            />
          </TintedCard>
        </div>
      )}

      {/* GOAL DETAIL SHEET */}
      {activeGoal && (
        <Sheet
          title={activeGoal.title}
          isOpen={Boolean(activeGoal)}
          onClose={() => setActiveGoal(null)}
        >
          <div className="space-y-4 p-1">
            <Card className="goal-detail-card">
              <Row
                title="Для чого це мені"
                value={activeGoal.purposeUk || undefined}
                chevron
                onClick={() => openFieldEditor(activeGoal, "purpose")}
              />
              <Row
                title="Який результат означатиме завершення"
                value={activeGoal.completionCriteriaUk || undefined}
                chevron
                onClick={() => openFieldEditor(activeGoal, "criteria")}
              />
              <Row
                title="Наступний крок"
                value={
                  activeGoal.nextActionTaskId
                    ? tasks.find((t) => t.id === activeGoal.nextActionTaskId)?.title ?? activeGoal.nextActionTaskId
                    : undefined
                }
                secondary={
                  activeGoal.implementationIntentionUk
                    ? `Якщо — то: ${activeGoal.implementationIntentionUk}`
                    : undefined
                }
                chevron
                onClick={() => openFieldEditor(activeGoal, "nextStep")}
              />
              <Row
                title="Орієнтовний термін"
                value={
                  activeGoal.termStart && activeGoal.termEnd
                    ? `${formatShortDate(activeGoal.termStart)} – ${formatShortDate(activeGoal.termEnd)}`
                    : activeGoal.termEnd
                      ? formatDate(activeGoal.termEnd)
                      : undefined
                }
                chevron
                onClick={() => openFieldEditor(activeGoal, "targetDate")}
              />
              <Row
                title="Сфера"
                leading={
                  <Orb
                    color={itemColor(activeGoal, modelContext)}
                    size={18}
                  />
                }
                value={resolveArea(activeGoal, modelContext)?.name || undefined}
                chevron
                onClick={() => openFieldEditor(activeGoal, "area")}
              />
              <Row
                title="Вимір"
                value={
                  activeGoal.measure
                    ? `${activeGoal.measure.current} / ${activeGoal.measure.target ?? "—"} ${activeGoal.measure.unit}`
                    : undefined
                }
                trailing={
                  activeGoal.measure ? (
                    <div className="measure-quick-logs" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="measure-log-pill"
                        onClick={() => handleQuickLog(activeGoal, 1)}
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        className="measure-log-pill"
                        onClick={() => handleQuickLog(activeGoal, 5)}
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        className="measure-log-pill"
                        onClick={() => setCustomLogEntity({ kind: "goal", id: activeGoal.id })}
                      >
                        Своє
                      </button>
                    </div>
                  ) : undefined
                }
                chevron={!activeGoal.measure}
                onClick={() => openFieldEditor(activeGoal, "measure")}
              />
            </Card>

            {/* Section "Етапи": stage rows + "+ Додати етап" */}
            <Section title="Етапи">
              {stages
                .filter((s) => s.goalId === activeGoal.id)
                .map((st) => (
                  <Row
                    key={st.id}
                    leading={<span className="text-sm font-bold text-amber-500">◆</span>}
                    title={st.title}
                    secondary={
                      st.dependsOnStageIds?.length
                        ? `Після: ${st.dependsOnStageIds.map((id) => stages.find((s) => s.id === id)?.title).filter(Boolean).join(", ")}`
                        : undefined
                    }
                    trailing={st.targetDate ? formatShortDate(st.targetDate) : undefined}
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
                leading={<Icon name="plus" size={18} />}
                title="+ Додати етап"
                className="row-action-add"
                onClick={() =>
                  setStageSheetTarget({
                    goalId: activeGoal.id,
                  })
                }
              />
            </Section>

            {/* Section "Завдання": linked tasks */}
            <Section title="Завдання цілі">
              {tasks
                .filter((t) => t.ownership.kind === "goal" && t.ownership.goalId === activeGoal.id)
                .map((t) => (
                  <Row
                    key={t.id}
                    leading={
                      <button
                        type="button"
                        className="planui-task-check-circle"
                        onClick={() => onToggleTaskState?.(t.id)}
                      >
                        <span className={`planui-check-dot ${t.state === "completed" ? "done" : ""}`}>
                          {t.state === "completed" && <Icon name="check" size={13} />}
                        </span>
                      </button>
                    }
                    title={t.title}
                    secondary={t.deadline ? `Термін: ${formatTaskDeadline(t.deadline)}` : undefined}
                  />
                ))}
              <Row
                leading={<Icon name="plus" size={18} />}
                title="+ Додати завдання"
                className="row-action-add"
                onClick={() => onOpenGlobalCreation("task")}
              />
            </Section>

            {/* Section "Проєкти цілі" */}
            {projects.filter((p) => p.goalId === activeGoal.id).length > 0 && (
              <Section title="Проєкти цілі">
                {projects
                  .filter((p) => p.goalId === activeGoal.id)
                  .map((p) => (
                    <Row
                      key={p.id}
                      leading={<Orb color={itemColor(p, modelContext)} size={18} />}
                      title={p.title}
                      chevron
                      onClick={() => {
                        setActiveGoal(null);
                        onUpdatePlansContext({ subMode: "projects", activeProjectId: p.id });
                      }}
                    />
                  ))}
              </Section>
            )}
          </div>
        </Sheet>
      )}

      {/* STAGE SHEET MODAL */}
      {stageSheetTarget && (
        <StageSheet
          isOpen={Boolean(stageSheetTarget)}
          goalId={stageSheetTarget.goalId}
          projectId={stageSheetTarget.projectId}
          stage={stageSheetTarget.stage}
          stages={stages.filter((s) =>
            stageSheetTarget.goalId ? s.goalId === stageSheetTarget.goalId : s.projectId === stageSheetTarget.projectId,
          )}
          todayDate={actualTodayDate}
          repositories={repositories}
          onClose={() => setStageSheetTarget(null)}
          onSaved={async () => {
            setStageSheetTarget(null);
            await onDataChanged("Етап збережено");
          }}
        />
      )}

      {/* NEW FOLDER SHEET */}
      <Sheet
        title="Нова папка"
        isOpen={newFolderSheet}
        onClose={() => setNewFolderSheet(false)}
      >
        <div className="space-y-4 p-2">
          <label className="text-sm font-semibold">Назва папки:</label>
          <input
            type="text"
            className="ui-input-field"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Введіть назву..."
            autoFocus
          />
          <button
            type="button"
            className="ui-btn ui-btn-primary w-full"
            disabled={!newFolderName.trim()}
            onClick={async () => {
              if (!newFolderName.trim()) return;
              await repositories.saveFolder({
                id: `folder-${Date.now()}`,
                name: newFolderName.trim(),
                parentId: activeFolderId,
                order: currentChildFolders.length,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                revision: 1,
              });
              setNewFolderSheet(false);
              setNewFolderName("");
              await onDataChanged("Папку створено");
            }}
          >
            Створити папку
          </button>
        </div>
      </Sheet>

      {/* RENAME FOLDER SHEET */}
      {renameFolder && (
        <Sheet
          title="Перейменувати папку"
          isOpen={Boolean(renameFolder)}
          onClose={() => setRenameFolder(null)}
        >
          <div className="space-y-4 p-2">
            <input
              type="text"
              className="ui-input-field"
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="ui-btn ui-btn-primary w-full"
              disabled={!renameFolderName.trim()}
              onClick={async () => {
                if (!renameFolderName.trim()) return;
                await repositories.saveFolder(
                  { ...renameFolder, name: renameFolderName.trim() },
                  renameFolder.revision,
                );
                setRenameFolder(null);
                await onDataChanged("Папку перейменовано");
              }}
            >
              Зберегти
            </button>
          </div>
        </Sheet>
      )}

      {/* MOVE FOLDER SHEET */}
      {moveFolder && (
        <Sheet
          title="Перемістити папку"
          isOpen={Boolean(moveFolder)}
          onClose={() => setMoveFolder(null)}
        >
          <div className="space-y-3 p-2">
            <p className="text-sm text-gray-500">Оберіть нове розташування:</p>
            <div className="space-y-1">
              <Row
                title="Корінь проєктів"
                trailing={moveFolderTargetParentId === null ? <Icon name="check" size={18} /> : undefined}
                onClick={() => setMoveFolderTargetParentId(null)}
              />
              {getAllowedMoveTargetFolders(folders, moveFolder.id).map((f) => (
                <Row
                  key={f.id}
                  title={f.name}
                  trailing={moveFolderTargetParentId === f.id ? <Icon name="check" size={18} /> : undefined}
                  onClick={() => setMoveFolderTargetParentId(f.id)}
                />
              ))}
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-primary w-full mt-4"
              onClick={async () => {
                await repositories.saveFolder(
                  { ...moveFolder, parentId: moveFolderTargetParentId },
                  moveFolder.revision,
                );
                setMoveFolder(null);
                await onDataChanged("Папку переміщено");
              }}
            >
              Перемістити
            </button>
          </div>
        </Sheet>
      )}

      {/* DELETE FOLDER ALERT */}
      {deleteFolderAlert && (
        <AlertSheet
          isOpen={Boolean(deleteFolderAlert)}
          title={`Видалити папку «${deleteFolderAlert.name}»?`}
          description="Усі вкладені проєкти та завдання буде переміщено вище."
          confirmLabel="Видалити"
          destructive
          onClose={() => setDeleteFolderAlert(null)}
          onConfirm={async () => {
            await repositories.deleteFolderTransactionally(
              deleteFolderAlert.id,
              "rehome_to_parent",
              new Date().toISOString(),
            );
            setDeleteFolderAlert(null);
            if (activeFolderId === deleteFolderAlert.id) {
              onUpdatePlansContext({ activeFolderId: deleteFolderAlert.parentId });
            }
            await onDataChanged("Папку видалено");
          }}
        />
      )}

      {/* CUSTOM LOG MEASURE MODAL */}
      {customLogEntity && (
        <Sheet
          title="Записати вимір"
          isOpen={Boolean(customLogEntity)}
          onClose={() => setCustomLogEntity(null)}
        >
          <div className="space-y-4 p-2">
            <label className="text-sm font-semibold">Введіть додане значення:</label>
            <input
              type="number"
              className="ui-input-field"
              value={customLogDelta}
              onChange={(e) => setCustomLogDelta(e.target.value)}
              placeholder="наприклад, 10"
              autoFocus
            />
            <button
              type="button"
              className="ui-btn ui-btn-primary w-full"
              disabled={!customLogDelta.trim()}
              onClick={async () => {
                const delta = Number(customLogDelta);
                if (Number.isFinite(delta)) {
                  const entity = customLogEntity.kind === "goal"
                    ? goals.find((g) => g.id === customLogEntity.id)
                    : projects.find((p) => p.id === customLogEntity.id);
                  if (entity) {
                    await handleQuickLog(entity, delta);
                  }
                }
                setCustomLogEntity(null);
                setCustomLogDelta("");
              }}
            >
              Записати
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
};
