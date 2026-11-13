import { renderPlanEntityDetailCard } from "../components/plans/EntityDetailCard";
import { renderEntityFieldSheet } from "../components/plans/EntityFieldSheet";
import { GoalDetailSheet } from "../components/plans/GoalDetailSheet";
import { GoalsTimeline } from "../components/plans/GoalsTimeline";
import { PlanContextMenu } from "../components/plans/PlanContextMenu";
import { PlanMoveSheet } from "../components/plans/PlanMoveSheet";
import { PlanRenameSheet } from "../components/plans/PlanRenameSheet";
import { ProjectDetail } from "../components/plans/ProjectDetail";
import { ProjectList } from "../components/plans/ProjectList";
import { saveEntityField } from "../components/plans/saveEntityField";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { HeroArt } from "../ui/art";

import { GlossyButton } from "../ui/buttons";

import { MilkyCard } from "../ui/cards";

import { PageHeader, Section } from "../ui/headers";

import { Row } from "../ui/rows";

import { Orb } from "../ui/Orb";

import { AlertSheet, Sheet } from "../ui/sheets";

import { EmptyState } from "../ui/EmptyState";

import { StageSheet } from "../components/today/StageSheet";

import { useSubScreenTransition } from "../ui/motion";

import { registerPushedScreen } from "../ui/overlayStack";

import {
  NEUTRAL_SLATE,
  areaName,
  getManualOrder,
  itemColor,
  logMeasure,
  reorder,
  resolveArea,
} from "../domain/modelHelpers";

import {
  CalendarEvent,
  EntityId,
  Folder,
  Goal,
  LifeAreaAssessment,
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

import { addMonthsToYearMonth } from "../components/plans/planPresentation";

import { STATE_ORB_HUE } from "../components/plans/planPresentation";

import { STATE_LABELS_GOAL } from "../components/plans/planPresentation";

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
  lifeAreaAssessments?: readonly LifeAreaAssessment[];
  repositories: PlanuiRepositories;
  onUpdatePlansContext: (
    patch: Partial<DestinationContextMap["plans"]>,
  ) => void;
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
  onModalStateChange?: (isAnyModalOpen: boolean) => void;
  onToggleTaskState?: (taskId: EntityId) => Promise<void> | void;
}

export const PlansView: React.FC<PlansViewProps> = ({
  folders,
  goals = [],
  projects = [],
  stages = [],
  tasks = [],
  actualTodayDate,
  plansContext,
  settings,
  lifeAreaQuestions = [],
  lifeAreaAssessments = [],
  repositories,
  onUpdatePlansContext,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
  onToggleTaskState,
}) => {
  const isGoalsView = plansContext.subMode === "goals";
  const [searchQuery, setSearchQuery] = useState(
    plansContext.searchQuery ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<
    "active" | "idea" | "paused" | "completed"
  >("active");
  const activeFolderId = plansContext.activeFolderId ?? null;
  const activeProjectId = plansContext.activeProjectId ?? null;
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );
  const [activeGoalId, setActiveGoalId] = useState<string | null>(
    plansContext.activeGoalId ?? null,
  );
  useEffect(() => {
    if (plansContext.activeGoalId) {
      setActiveGoalId(plansContext.activeGoalId);
    }
  }, [plansContext.activeGoalId]);

  const activeGoal = useMemo(
    () => goals.find((g) => g.id === activeGoalId) ?? null,
    [goals, activeGoalId],
  );

  const [goalMenuOpen, setGoalMenuOpen] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<
    | { kind: "folder"; folder: Folder }
    | { kind: "project"; project: Project }
    | null
  >(null);
  const [statusSheetTarget, setStatusSheetTarget] = useState<
    { kind: "project"; project: Project } | { kind: "goal"; goal: Goal } | null
  >(null);
  const [renameTarget, setRenameTarget] = useState<
    | { kind: "folder"; folder: Folder }
    | { kind: "project"; project: Project }
    | { kind: "goal"; goal: Goal }
    | null
  >(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveTarget, setMoveTarget] = useState<
    | { kind: "folder"; folder: Folder }
    | { kind: "project"; project: Project }
    | null
  >(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(
    null,
  );

  const [deleteFolderAlert, setDeleteFolderAlert] = useState<Folder | null>(
    null,
  );
  const [deleteProjectAlert, setDeleteProjectAlert] = useState<Project | null>(
    null,
  );
  const [deleteGoalAlert, setDeleteGoalAlert] = useState<Goal | null>(null);
  const [activeDetailEditor, setActiveDetailEditor] = useState<{
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
  } | null>(null);

  const [editorTextValue, setEditorTextValue] = useState("");
  const [editorStartDateValue, setEditorStartDateValue] = useState<
    string | null
  >(null);
  const [editorDateValue, setEditorDateValue] = useState<string | null>(null);
  const [editorAreaValue, setEditorAreaValue] = useState<string | null>(null);
  const [editorIconValue, setEditorIconValue] = useState<string>("folder");
  const [editorIntentionValue, setEditorIntentionValue] = useState("");
  const [measureDirection, setMeasureDirection] = useState<"more" | "less">(
    "more",
  );
  const [measureCurrent, setMeasureCurrent] = useState("0");
  const [measureUnit, setMeasureUnit] = useState("");
  const [measureTarget, setMeasureTarget] = useState("");
  const [customLogEntity, setCustomLogEntity] = useState<{
    kind: "project" | "goal";
    id: string;
  } | null>(null);
  const [customLogDelta, setCustomLogDelta] = useState("");
  const [stageSheetTarget, setStageSheetTarget] = useState<{
    goalId?: string;
    projectId?: string;
    stage?: ProjectStage;
  } | null>(null);
  const [myLifeText, setMyLifeText] = useState(settings?.myLife ?? "");
  const myLifeDebounceRef = useRef<number | null>(null);
  const myLifeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMyLifeText(settings?.myLife ?? "");
  }, [settings?.myLife]);

  useLayoutEffect(() => {
    const el = myLifeTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [myLifeText, isGoalsView]);

  useEffect(() => {
    const isAnyModal =
      Boolean(activeGoal) ||
      Boolean(contextMenuTarget) ||
      Boolean(statusSheetTarget) ||
      Boolean(renameTarget) ||
      Boolean(moveTarget) ||
      Boolean(deleteFolderAlert) ||
      Boolean(deleteProjectAlert) ||
      Boolean(deleteGoalAlert) ||
      Boolean(activeDetailEditor) ||
      Boolean(customLogEntity) ||
      Boolean(stageSheetTarget);
    onModalStateChange?.(isAnyModal);
    return () => onModalStateChange?.(false);
  }, [
    activeGoal,
    contextMenuTarget,
    statusSheetTarget,
    renameTarget,
    moveTarget,
    deleteFolderAlert,
    deleteProjectAlert,
    deleteGoalAlert,
    activeDetailEditor,
    customLogEntity,
    stageSheetTarget,
    onModalStateChange,
  ]);
  const modelContext = useMemo(
    () => ({
      folders,
      projects,
      goals,
      areas: lifeAreaQuestions,
      lifeAreas: lifeAreaQuestions,
      lifeAreaAssessments,
    }),
    [folders, projects, goals, lifeAreaQuestions, lifeAreaAssessments],
  );
  const projectFolders = useMemo(
    () => folders.filter((f) => !f.kind || f.kind === "projects"),
    [folders],
  );
  const folderChain = useMemo(() => {
    if (!activeFolderId) return [];
    const chain: Folder[] = [];
    let currentId: string | null = activeFolderId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const f = projectFolders.find((item) => item.id === currentId);
      if (!f) break;
      chain.unshift(f);
      currentId = f.parentId ?? null;
    }
    return chain;
  }, [projectFolders, activeFolderId]);

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
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const folder of folderChain) {
      cleanups.push(
        registerPushedScreen(`plans-folder:${folder.id}`, () => {
          onUpdatePlansContext({ activeFolderId: folder.parentId ?? null });
        }),
      );
    }
    if (activeProject) {
      cleanups.push(
        registerPushedScreen(`plans-project:${activeProject.id}`, () => {
          onUpdatePlansContext({ activeProjectId: null });
        }),
      );
    }
    return () => {
      for (let i = cleanups.length - 1; i >= 0; i--) {
        cleanups[i]();
      }
    };
  }, [folderChain, activeProject, onUpdatePlansContext]);
  const currentChildFolders = useMemo(() => {
    return projectFolders
      .filter((f) => {
        if (searchQuery.trim()) {
          return f.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return (f.parentId ?? null) === activeFolderId;
      })
      .sort(
        (a, b) =>
          getManualOrder(a) - getManualOrder(b) ||
          a.name.localeCompare(b.name, "uk"),
      );
  }, [projectFolders, activeFolderId, searchQuery]);
  const filteredProjects = useMemo(() => {
    return projects
      .filter((p) => {
        if (p.state !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = p.title.toLowerCase().includes(q);
          const matchesDesc = (p.description ?? "").toLowerCase().includes(q);
          return matchesTitle || matchesDesc;
        }
        if (activeFolderId !== null) {
          return p.folderId === activeFolderId;
        }
        return !p.folderId;
      })
      .sort(
        (a, b) =>
          getManualOrder(a) - getManualOrder(b) ||
          a.title.localeCompare(b.title, "uk"),
      );
  }, [projects, activeFolderId, searchQuery, statusFilter]);
  const currentFolderTasks = useMemo(() => {
    if (!activeFolderId) return [];
    return tasks
      .filter(
        (t) => t.folderId === activeFolderId && t.ownership.kind !== "project",
      )
      .sort((a, b) => getManualOrder(a) - getManualOrder(b));
  }, [tasks, activeFolderId]);
  const longPressTimerRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const didTriggerLongPressRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleReorderFolders = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= currentChildFolders.length)
      return;
    const reordered = reorder(currentChildFolders, fromIdx, toIdx);
    const nowIso = new Date().toISOString();
    try {
      for (const f of reordered) {
        const orig = currentChildFolders.find((item) => item.id === f.id);
        if (orig && orig.order !== f.order) {
          await repositories.saveFolder(
            { ...orig, order: f.order, updatedAt: nowIso },
            orig.revision,
          );
        }
      }
      await onDataChanged();
    } catch (e) {
      console.error("Failed to reorder folders", e);
    }
  };

  const handleReorderProjects = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= filteredProjects.length)
      return;
    const reordered = reorder(filteredProjects, fromIdx, toIdx);
    const nowIso = new Date().toISOString();
    try {
      for (const p of reordered) {
        const orig = filteredProjects.find((item) => item.id === p.id);
        if (orig && orig.order !== p.order) {
          await repositories.saveProject(
            { ...orig, order: p.order, updatedAt: nowIso },
            orig.revision,
          );
        }
      }
      await onDataChanged();
    } catch (e) {
      console.error("Failed to reorder projects", e);
    }
  };
  const timedGoals = useMemo(() => {
    return goals
      .filter((g) => Boolean(g.termStart || g.termEnd || g.timing?.targetDate))
      .sort((a, b) => getManualOrder(a) - getManualOrder(b));
  }, [goals]);
  const undatedGoals = useMemo(() => {
    return goals
      .filter((g) => !g.termStart && !g.termEnd && !g.timing?.targetDate)
      .sort((a, b) => getManualOrder(a) - getManualOrder(b));
  }, [goals]);
  const actualTodayYear = Number(actualTodayDate.slice(0, 4)) || 2026;
  const actualTodayMonth0 = (Number(actualTodayDate.slice(5, 7)) || 11) - 1;
  const actualTodayDay = Number(actualTodayDate.slice(8, 10)) || 8;

  const [monthRange, setMonthRange] = useState<{ start: number; end: number }>({
    start: -12,
    end: 36,
  });
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const [monthWidth, setMonthWidth] = useState<number>(30);
  const [visibleStartOffset, setVisibleStartOffset] = useState<number>(0);
  const initializedScrollRef = useRef(false);
  const prevStartMonthRef = useRef<number>(-12);
  const scrollRafRef = useRef<number>(0);
  const extendingEdgeRef = useRef<boolean>(false);
  useLayoutEffect(() => {
    if (!isGoalsView) {
      initializedScrollRef.current = false;
      return;
    }
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;

    const updateMeasure = () => {
      const w = scroller.clientWidth || 360;
      const computedMonthW = Math.max(30, Math.round(w / 12));
      setMonthWidth((prev) =>
        prev === computedMonthW ? prev : computedMonthW,
      );
    };

    updateMeasure();
    window.addEventListener("resize", updateMeasure);
    return () => window.removeEventListener("resize", updateMeasure);
  }, [isGoalsView]);
  useLayoutEffect(() => {
    if (!isGoalsView) return;
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;

    if (!initializedScrollRef.current) {
      initializedScrollRef.current = true;
      prevStartMonthRef.current = monthRange.start;
      const initialLeft = (0 - monthRange.start) * monthWidth;
      scroller.scrollLeft = initialLeft;
      setVisibleStartOffset(0);
      return;
    }

    if (monthRange.start !== prevStartMonthRef.current) {
      const prependedMonths = prevStartMonthRef.current - monthRange.start;
      prevStartMonthRef.current = monthRange.start;
      if (prependedMonths !== 0) {
        scroller.scrollLeft += prependedMonths * monthWidth;
      }
      extendingEdgeRef.current = false;
    } else {
      extendingEdgeRef.current = false;
    }
  }, [isGoalsView, monthWidth, monthRange.start, monthRange.end]);

  const timelineMonths = useMemo(() => {
    const count = monthRange.end - monthRange.start + 1;
    return Array.from({ length: count }, (_, idx) => {
      const offset = monthRange.start + idx;
      return {
        offset,
        ...addMonthsToYearMonth(actualTodayYear, actualTodayMonth0, offset),
      };
    });
  }, [monthRange.start, monthRange.end, actualTodayYear, actualTodayMonth0]);

  const totalTimelineWidth = timelineMonths.length * monthWidth;
  const timelineStartMs =
    timelineMonths[0]?.startMs ??
    Date.UTC(actualTodayYear, actualTodayMonth0, 1);
  const timelineEndMs =
    timelineMonths.at(-1)?.endMs ??
    Date.UTC(actualTodayYear + 1, actualTodayMonth0, 1);
  const todayMonthIndex = 0 - monthRange.start;
  const daysInTodayMonth =
    new Date(
      Date.UTC(actualTodayYear, actualTodayMonth0 + 1, 0),
    ).getUTCDate() || 30;
  const todayPx =
    (todayMonthIndex + (actualTodayDay - 1) / daysInTodayMonth) * monthWidth;

  const isTodayOffScreen =
    visibleStartOffset > 0 || visibleStartOffset + 11 < 0;

  const visibleRangeHeader = useMemo(() => {
    const firstM = addMonthsToYearMonth(
      actualTodayYear,
      actualTodayMonth0,
      visibleStartOffset,
    );
    const lastM = addMonthsToYearMonth(
      actualTodayYear,
      actualTodayMonth0,
      visibleStartOffset + 11,
    );
    return `${firstM.fullLabel} - ${lastM.fullLabel}`;
  }, [actualTodayYear, actualTodayMonth0, visibleStartOffset]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const scroller = timelineScrollerRef.current;
      if (!scroller) return;
      const sl = scroller.scrollLeft;
      const cw = scroller.clientWidth || 360;
      const rawIdx = sl / monthWidth;
      const roundedIdx = Math.round(rawIdx);
      const currentOffset = monthRange.start + roundedIdx;
      setVisibleStartOffset((prev) =>
        prev === currentOffset ? prev : currentOffset,
      );

      if (!extendingEdgeRef.current) {
        if (sl < 3 * monthWidth && monthRange.start > -120) {
          extendingEdgeRef.current = true;
          setMonthRange((prev) => ({ start: prev.start - 12, end: prev.end }));
        } else if (
          sl + cw > totalTimelineWidth - 3 * monthWidth &&
          monthRange.end < 120
        ) {
          extendingEdgeRef.current = true;
          setMonthRange((prev) => ({ start: prev.start, end: prev.end + 12 }));
        }
      }
    });
  }, [monthWidth, monthRange.start, monthRange.end, totalTimelineWidth]);

  const jumpTimelineMonths = (deltaMonths: number) => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
    const targetOffset = visibleStartOffset + deltaMonths;
    if (targetOffset < monthRange.start + 3 && monthRange.start > -120) {
      extendingEdgeRef.current = true;
      setMonthRange((prev) => ({ start: prev.start - 12, end: prev.end }));
    } else if (targetOffset + 12 > monthRange.end - 3 && monthRange.end < 120) {
      extendingEdgeRef.current = true;
      setMonthRange((prev) => ({ start: prev.start, end: prev.end + 12 }));
    }
    scroller.scrollBy({
      left: deltaMonths * monthWidth,
      behavior: "smooth",
    });
  };

  const scrollTimelineToToday = () => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
    const todayIdx = 0 - monthRange.start;
    scroller.scrollTo({
      left: Math.max(0, todayIdx * monthWidth),
      behavior: "smooth",
    });
  };
  const handleMyLifeChange = (text: string) => {
    setMyLifeText(text);
    if (myLifeDebounceRef.current) clearTimeout(myLifeDebounceRef.current);
    myLifeDebounceRef.current = window.setTimeout(async () => {
      try {
        await repositories.updateSettingsPatch(
          { myLife: text },
          new Date().toISOString(),
        );
        await onDataChanged();
      } catch (e) {
        console.error("Failed to save myLife", e);
      }
    }, 500);
  };
  const handleQuickLog = async (
    entity: Project | Goal,
    kind: "project" | "goal",
    delta: number,
  ) => {
    const isGoal = kind === "goal";
    const updated = logMeasure(entity, delta);
    try {
      if (isGoal) {
        await repositories.saveGoal(updated as Goal, entity.revision);
      } else {
        await repositories.saveProject(updated as Project, entity.revision);
      }
      await onDataChanged(
        `Вимір оновлено: +${delta} ${entity.measure?.unit ?? ""}`,
      );
    } catch (e) {
      throw e;
    }
  };
  const openFieldEditor = (
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
  ) => {
    const isGoal = kind === "goal";

    if (field === "purpose") {
      setEditorTextValue(entity.whyUk ?? entity.purposeUk ?? "");
    } else if (field === "criteria") {
      setEditorTextValue(
        isGoal
          ? ((entity as Goal).completionCriteriaUk ?? "")
          : ((entity as Project).completionCriteria ?? ""),
      );
    } else if (field === "nextStep") {
      const existingTaskTitle = entity.nextActionTaskId
        ? (tasks.find((t) => t.id === entity.nextActionTaskId)?.title ??
          entity.nextActionTaskId)
        : "";
      const intention = isGoal
        ? ((entity as Goal).implementationIntentionUk ?? "")
        : ((entity as Project).implementationIntentionUk ?? "");
      setEditorTextValue(existingTaskTitle);
      setEditorIntentionValue(intention);
    } else if (field === "targetDate") {
      if (isGoal) {
        setEditorStartDateValue((entity as Goal).termStart ?? actualTodayDate);
        setEditorDateValue(
          (entity as Goal).termEnd ??
            (entity as Goal).timing?.targetDate ??
            null,
        );
      } else {
        setEditorDateValue((entity as Project).targetDate ?? null);
      }
    } else if (field === "area") {
      setEditorAreaValue(entity.areaId ?? entity.lifeAreaId ?? null);
    } else if (field === "icon") {
      setEditorIconValue(entity.iconKey ?? (isGoal ? "target" : "folder"));
    } else if (field === "measure") {
      setMeasureDirection(entity.measure?.direction ?? "more");
      setMeasureCurrent(String(entity.measure?.current ?? 0));
      setMeasureUnit(entity.measure?.unit ?? "");
      setMeasureTarget(
        entity.measure?.target ? String(entity.measure.target) : "",
      );
    }

    setActiveDetailEditor({ kind, entityId: entity.id, field });
  };
  const handleSaveFieldEditor = () =>
    saveEntityField({
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
    });
  const renderEntityDetailCard = (
    entity: Project | Goal,
    kind: "project" | "goal",
  ) =>
    renderPlanEntityDetailCard(
      { tasks, openFieldEditor, modelContext, handleQuickLog },
      entity,
      kind,
    );
  const renderFieldEditorSheet = () =>
    renderEntityFieldSheet({
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
    });
  if (activeProject) {
    const projectTasks = tasks
      .filter(
        (t) =>
          t.ownership.kind === "project" &&
          t.ownership.projectId === activeProject.id,
      )
      .sort((a, b) => getManualOrder(a) - getManualOrder(b));

    return (
      <ProjectDetail
        subScreenRef={subScreenRef}
        onUpdatePlansContext={onUpdatePlansContext}
        activeProject={activeProject}
        setStatusSheetTarget={setStatusSheetTarget}
        renderEntityDetailCard={renderEntityDetailCard}
        projectTasks={projectTasks}
        modelContext={modelContext}
        onToggleTaskState={onToggleTaskState}
        onOpenGlobalCreation={onOpenGlobalCreation}
        statusSheetTarget={statusSheetTarget}
        repositories={repositories}
        onDataChanged={onDataChanged}
        setRenameTarget={setRenameTarget}
        setRenameValue={setRenameValue}
        setMoveTarget={setMoveTarget}
        setMoveTargetFolderId={setMoveTargetFolderId}
        setDeleteProjectAlert={setDeleteProjectAlert}
        deleteProjectAlert={deleteProjectAlert}
        customLogEntity={customLogEntity}
        setCustomLogEntity={setCustomLogEntity}
        customLogDelta={customLogDelta}
        setCustomLogDelta={setCustomLogDelta}
        handleQuickLog={handleQuickLog}
        renderFieldEditorSheet={renderFieldEditorSheet}
      />
    );
  }
  return (
    <div
      ref={subScreenRef}
      className={`personal-surface plans-workspace-p7 min-w-0 space-y-5 pb-28 ${!isGoalsView ? "workspace-projects" : ""}`}
      data-testid="destination-view-directions"
    >
      {!isGoalsView && (
        <ProjectList
          filteredProjects={filteredProjects}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onUpdatePlansContext={onUpdatePlansContext}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          activeFolderId={activeFolderId}
          currentFolder={currentFolder}
          folderChain={folderChain}
          currentChildFolders={currentChildFolders}
          modelContext={modelContext}
          projects={projects}
          tasks={tasks}
          didTriggerLongPressRef={didTriggerLongPressRef}
          dragStartYRef={dragStartYRef}
          dragIndexRef={dragIndexRef}
          clearLongPress={clearLongPress}
          longPressTimerRef={longPressTimerRef}
          setContextMenuTarget={setContextMenuTarget}
          handleReorderFolders={handleReorderFolders}
          openFieldEditor={openFieldEditor}
          handleReorderProjects={handleReorderProjects}
          currentFolderTasks={currentFolderTasks}
          onToggleTaskState={onToggleTaskState}
          onOpenGlobalCreation={onOpenGlobalCreation}
        />
      )}

      {isGoalsView && (
        <div className="goals-container min-w-0 space-y-5">
          <PageHeader
            title="Цілі"
            badgeShape={null}
            actions={<HeroArt name="target" size={64} />}
          />

          <GoalsTimeline
            visibleRangeHeader={visibleRangeHeader}
            isTodayOffScreen={isTodayOffScreen}
            scrollTimelineToToday={scrollTimelineToToday}
            jumpTimelineMonths={jumpTimelineMonths}
            timelineScrollerRef={timelineScrollerRef}
            handleTimelineScroll={handleTimelineScroll}
            totalTimelineWidth={totalTimelineWidth}
            timedGoals={timedGoals}
            timelineMonths={timelineMonths}
            monthWidth={monthWidth}
            todayPx={todayPx}
            modelContext={modelContext}
            actualTodayDate={actualTodayDate}
            timelineEndMs={timelineEndMs}
            timelineStartMs={timelineStartMs}
            stages={stages}
            setActiveGoalId={setActiveGoalId}
          />

          {undatedGoals.length > 0 && (
            <Section title="Без строку">
              <div className="space-y-2">
                {undatedGoals.map((g) => {
                  const gArea = resolveArea(g, modelContext);
                  const gColor = gArea
                    ? itemColor(g, modelContext)
                    : NEUTRAL_SLATE;
                  const gAreaLabel = areaName(g, modelContext);
                  return (
                    <Row
                      key={g.id}
                      icon3d={g.iconKey || "target"}
                      orbColor={gColor}
                      orbSize={36}
                      title={g.title}
                      meta={gAreaLabel || undefined}
                      chevron
                      onClick={() => setActiveGoalId(g.id)}
                    />
                  );
                })}
              </div>
            </Section>
          )}

          {goals.length === 0 && (
            <EmptyState
              context="goals"
              testId="goals-empty"
              title="Поки немає цілей"
              primaryAction={{
                label: "Створити ціль",
                variant: "mint",
                onClick: () => onOpenGlobalCreation("goal"),
              }}
            />
          )}

          <MilkyCard
            className="space-y-1.5"
            style={{
              borderRadius: "26px",
              background:
                "linear-gradient(180deg, rgba(255, 228, 217, 0.40) 0%, rgba(255, 236, 179, 0.40) 52%, rgba(255, 255, 255, 0.90) 100%)",
              marginBottom: "calc(var(--dock-h, 120px) + 24px)",
            }}
            data-testid="my-life-card"
          >
            <label
              htmlFor="my-life-textarea"
              className="block text-[12px] leading-[16px] font-bold text-[var(--text-secondary)]"
            >
              Моє бажане життя
            </label>
            <textarea
              ref={myLifeTextareaRef}
              id="my-life-textarea"
              className="w-full bg-transparent border-0 outline-none resize-none overflow-hidden text-ink placeholder:text-[var(--text-tertiary)]"
              style={{
                fontFamily: "var(--font-sans)",
                fontStyle: "normal",
                fontSize: "17px",
                fontWeight: 500,
                lineHeight: "26px",
                minHeight: "120px",
              }}
              value={myLifeText}
              onChange={(e) => {
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.max(120, e.currentTarget.scrollHeight)}px`;
                handleMyLifeChange(e.target.value);
              }}
              placeholder="Опишіть, як ви бачите своє ідеальне життя"
            />
          </MilkyCard>
        </div>
      )}

      {activeGoal && (
        <GoalDetailSheet
          activeGoal={activeGoal}
          setActiveGoalId={setActiveGoalId}
          onUpdatePlansContext={onUpdatePlansContext}
          modelContext={modelContext}
          setGoalMenuOpen={setGoalMenuOpen}
          setStatusSheetTarget={setStatusSheetTarget}
          renderEntityDetailCard={renderEntityDetailCard}
          stages={stages}
          setStageSheetTarget={setStageSheetTarget}
        />
      )}

      {goalMenuOpen && activeGoal && (
        <Sheet
          isOpen={goalMenuOpen}
          title={activeGoal.title}
          onClose={() => setGoalMenuOpen(false)}
        >
          <div className="space-y-2 py-1">
            <Row
              hideOrb
              title="Видалити"
              className="text-rose-600"
              onClick={() => {
                setGoalMenuOpen(false);
                setDeleteGoalAlert(activeGoal);
              }}
            />
          </div>
        </Sheet>
      )}

      {statusSheetTarget?.kind === "goal" && (
        <Sheet
          isOpen
          title={statusSheetTarget.goal.title}
          onClose={() => setStatusSheetTarget(null)}
        >
          <div className="space-y-2 py-1">
            {(["active", "idea", "paused", "completed"] as const).map((st) => (
              <Row
                key={st}
                leading={<Orb hue={STATE_ORB_HUE[st]} size={20} />}
                title={STATE_LABELS_GOAL[st]}
                selected={statusSheetTarget.goal.state === st}
                onClick={async () => {
                  const g = statusSheetTarget.goal;
                  setStatusSheetTarget(null);
                  await repositories.saveGoal(
                    {
                      ...g,
                      state: st,
                      completedAt:
                        st === "completed" ? new Date().toISOString() : null,
                    },
                    g.revision,
                  );
                  await onDataChanged();
                }}
              />
            ))}
          </div>
        </Sheet>
      )}

      {contextMenuTarget && (
        <PlanContextMenu
          contextMenuTarget={contextMenuTarget}
          setContextMenuTarget={setContextMenuTarget}
          setRenameTarget={setRenameTarget}
          setRenameValue={setRenameValue}
          setMoveTarget={setMoveTarget}
          setMoveTargetFolderId={setMoveTargetFolderId}
          currentChildFolders={currentChildFolders}
          handleReorderFolders={handleReorderFolders}
          filteredProjects={filteredProjects}
          handleReorderProjects={handleReorderProjects}
          setDeleteFolderAlert={setDeleteFolderAlert}
          setDeleteProjectAlert={setDeleteProjectAlert}
        />
      )}

      {stageSheetTarget && (
        <StageSheet
          isOpen={Boolean(stageSheetTarget)}
          goalId={stageSheetTarget.goalId}
          projectId={stageSheetTarget.projectId}
          stage={stageSheetTarget.stage}
          stages={stages.filter((s) =>
            stageSheetTarget.goalId
              ? s.goalId === stageSheetTarget.goalId
              : s.projectId === stageSheetTarget.projectId,
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

      {renameTarget && (
        <PlanRenameSheet
          renameTarget={renameTarget}
          setRenameTarget={setRenameTarget}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          repositories={repositories}
          onDataChanged={onDataChanged}
        />
      )}

      {moveTarget && (
        <PlanMoveSheet
          moveTarget={moveTarget}
          setMoveTarget={setMoveTarget}
          moveTargetFolderId={moveTargetFolderId}
          setMoveTargetFolderId={setMoveTargetFolderId}
          projectFolders={projectFolders}
          repositories={repositories}
          onDataChanged={onDataChanged}
        />
      )}

      <AlertSheet
        isOpen={Boolean(deleteFolderAlert)}
        title={`Видалити папку «${deleteFolderAlert?.name}»?`}
        description="Усі вкладені проєкти та завдання буде переміщено вище."
        confirmLabel="Видалити"
        destructive
        onClose={() => setDeleteFolderAlert(null)}
        onConfirm={async () => {
          if (!deleteFolderAlert) return;
          await repositories.deleteFolderTransactionally(
            deleteFolderAlert.id,
            "rehome_to_parent",
            new Date().toISOString(),
          );
          setDeleteFolderAlert(null);
          if (activeFolderId === deleteFolderAlert.id) {
            onUpdatePlansContext({
              activeFolderId: deleteFolderAlert.parentId ?? null,
            });
          }
          await onDataChanged("Папку видалено");
        }}
      />

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
          await onDataChanged("Проєкт видалено");
        }}
      />

      <AlertSheet
        isOpen={Boolean(deleteGoalAlert)}
        title={`Видалити ціль «${deleteGoalAlert?.title}»?`}
        description="Пов’язані проєкти залишаться активними."
        confirmLabel="Видалити"
        destructive
        onClose={() => setDeleteGoalAlert(null)}
        onConfirm={async () => {
          if (!deleteGoalAlert) return;
          await repositories.deleteGoalTransactionally(
            deleteGoalAlert.id,
            "unlink_children",
            new Date().toISOString(),
          );
          setDeleteGoalAlert(null);
          setActiveGoalId(null);
          onUpdatePlansContext({ activeGoalId: null });
          await onDataChanged("Ціль видалено");
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
                  const entity =
                    customLogEntity.kind === "goal"
                      ? goals.find((g) => g.id === customLogEntity.id)
                      : projects.find((p) => p.id === customLogEntity.id);
                  if (entity) {
                    await handleQuickLog(entity, customLogEntity.kind, delta);
                  }
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
};
