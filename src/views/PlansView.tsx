import {Icon} from '../ui/icons';
import {
  PageHeader,
  SubHeader,
  Segmented,
  PillRow,
  RoundButton,
  Section,
  Row,
  Toggle,
  ActionMenu,
  Sheet,
  EmptyState,
  Disclosure,
  DateField,
  TimeField,
} from "../ui";
import { formatDate, formatDuration } from "../lib/format";
import { PlanDetail } from "./PlanDetail";
import { RoadmapView } from './RoadmapView';
import React, { useMemo, useState } from 'react';
import {
  Folder as FolderIcon,
  CheckCircle2,
  Circle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  ArrowUpRight,
  Plus,
} from '../ui/icons';
import { UK_STRINGS } from '../i18n/uk';
import {
  CalendarEvent,
  ChecklistItem,
  Folder,
  Goal,
  GoalState,
  Project,
  ProjectStage,
  ProjectResultState,
  Task,
  TaskDeadline,
  TaskOwnership,
  TaskPriority,
  TaskReservation,
} from '../domain/types';
import {
  buildAbbreviatedBreadcrumbs,
  computeFolderDeleteImpact,
  getAllowedMoveTargetFolders,
  getUnresolvedProjectTasks,
} from '../domain/plans';
import {
  buildZonedIntervalFromLocalInput,
  computeElapsedDurationMinutes,
  suggestEndDateForClockRange,
} from '../domain/temporal';
import { detectScheduleConflicts } from '../domain/scheduling';
import {
  DestinationContextMap,
  ImplementedCreationActionKind,
  PlansPriorityFilter,
} from '../state/shellStore';
import {
  PlanuiRepositories,
  TaskLifecycleUndoToken,
} from '../storage/repositories';
import {
  Button,
  InputField,
  ModalSheet,
  SegmentedControl,
  SelectField,
  TextAreaField,
  FeedbackBanner,
} from '../components/ui/primitives';

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
  plansContext: DestinationContextMap['plans'];
  repositories: PlanuiRepositories;
  onUpdatePlansContext: (
    patch: Partial<DestinationContextMap['plans']>
  ) => void;
  onOpenGlobalCreation: (preferredAction?: ImplementedCreationActionKind) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
  onModalStateChange?: (isAnyModalOpen: boolean) => void;
}

export const PlansView: React.FC<PlansViewProps> = ({
  folders,
  goals = [],
  projects,
  stages,
  tasks,
  reservations,
  events = [],
  activeZone = '',
  actualTodayDate,
  plansContext,
  repositories,
  onUpdatePlansContext,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  // Modal states inside Plans
  const [showFullAncestorModal, setShowFullAncestorModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderEditName, setFolderEditName] = useState('');
  const [folderEditParentId, setFolderEditParentId] = useState<string | null>(
    null
  );

  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [folderDeleteStrategy, setFolderDeleteStrategy] = useState<
    'rehome_to_parent' | 'recursive_delete'
  >('rehome_to_parent');
  const [folderDeleteConfirmed, setFolderDeleteConfirmed] = useState(false);

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projEditTitle, setProjEditTitle] = useState('');
  const [projEditOutcome, setProjEditOutcome] = useState('');
  const [projEditCriteria, setProjEditCriteria] = useState('');
  const [projEditDescription, setProjEditDescription] = useState('');
  const [projEditTargetDate, setProjEditTargetDate] = useState<string | null>(
    null
  );
  const [projEditCollaborators, setProjEditCollaborators] = useState('');
  const [projEditFolderId, setProjEditFolderId] = useState<string | null>(null);
  const [projEditState, setProjEditState] =
    useState<ProjectResultState>('active');

  const [completingProject, setCompletingProject] = useState<Project | null>(
    null
  );
  const [archivingProject, setArchivingProject] = useState<Project | null>(
    null
  );
  const [archivePlanningChoice, setArchivePlanningChoice] = useState<
    'retain_planning' | 'remove_planning'
  >('retain_planning');
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [projectDeleteTaskMode, setProjectDeleteTaskMode] = useState<
    'rehome_to_folder' | 'delete_tasks'
  >('rehome_to_folder');

  // Goal modal states (Stage M3)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalEditTitle, setGoalEditTitle] = useState('');
  const [goalEditPurpose, setGoalEditPurpose] = useState('');
  const [goalEditCriteria, setGoalEditCriteria] = useState('');
  const [goalEditIntention, setGoalEditIntention] = useState('');
  const [goalEditTargetDate, setGoalEditTargetDate] = useState<string | null>(
    null
  );
  const [goalEditTargetPeriod, setGoalEditTargetPeriod] = useState('');
  const [goalEditFolderId, setGoalEditFolderId] = useState<string | null>(null);
  const [goalEditState, setGoalEditState] = useState<GoalState>('active');
  const [goalEditNextActionTaskId, setGoalEditNextActionTaskId] = useState<
    string | null
  >(null);

  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [goalDeleteMode, setGoalDeleteMode] = useState<
    'unlink_children' | 'delete_direct_tasks'
  >('unlink_children');

  const [editingStage, setEditingStage] = useState<ProjectStage | null>(null);
  const [stageEditTitle, setStageEditTitle] = useState('');
  const [stageEditOutcome, setStageEditOutcome] = useState('');

  // Task Detail / Editor Sheet state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const editingTask = useMemo(
    () => tasks.find((t) => t.id === editingTaskId) ?? null,
    [tasks, editingTaskId]
  );

  const [taskEditTitle, setTaskEditTitle] = useState('');
  const [taskEditDescription, setTaskEditDescription] = useState('');
  const [taskEditPriority, setTaskEditPriority] =
    useState<TaskPriority>('normal');
  const [taskEditPlannedDate, setTaskEditPlannedDate] = useState<string | null>(
    null
  );
  const [taskEditEstimate, setTaskEditEstimate] = useState<string>('');
  const [taskEditDeadlineKind, setTaskEditDeadlineKind] = useState<
    'none' | 'date_only' | 'exact_instant'
  >('none');
  const [taskEditDeadlineDate, setTaskEditDeadlineDate] = useState('');
  const [taskEditDeadlineInstant, setTaskEditDeadlineInstant] = useState('');
  const [taskEditOwnershipMode, setTaskEditOwnershipMode] = useState<
    'standalone' | 'folder' | 'goal' | 'project'
  >('standalone');
  const [taskEditFolderId, setTaskEditFolderId] = useState<string | null>(null);
  const [taskEditGoalId, setTaskEditGoalId] = useState<string | null>(null);
  const [taskEditProjectId, setTaskEditProjectId] = useState<string | null>(
    null
  );
  const [taskEditStageId, setTaskEditStageId] = useState<string | null>(null);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  // Stage 5: Bounded immediate lifecycle undo
  const [lastUndoToken, setLastUndoToken] =
    useState<TaskLifecycleUndoToken | null>(null);

  // Stage 5: Add / Reschedule Reservation Session state inside Task Sheet
  const [showAddSessionForm, setShowAddSessionForm] = useState(false);
  const [newSessionStartDate, setNewSessionStartDate] =
    useState(actualTodayDate);
  const [newSessionStartTime, setNewSessionStartTime] = useState('10:00');
  const [newSessionEndDate, setNewSessionEndDate] = useState(actualTodayDate);
  const [newSessionEndTime, setNewSessionEndTime] = useState('11:00');
  const [newSessionOverlapConfirmed, setNewSessionOverlapConfirmed] =
    useState(false);

  const [rescheduleResId, setRescheduleResId] = useState<string | null>(null);
  const [rescheduleStartDate, setRescheduleStartDate] =
    useState(actualTodayDate);
  const [rescheduleStartTime, setRescheduleStartTime] = useState('10:00');
  const [rescheduleEndDate, setRescheduleEndDate] = useState(actualTodayDate);
  const [rescheduleEndTime, setRescheduleEndTime] = useState('11:00');
  const [rescheduleOverlapConfirmed, setRescheduleOverlapConfirmed] =
    useState(false);

  const [modalError, setModalError] = useState<string | null>(null);

  const isAnyLocalModalOpen = Boolean(
    showFullAncestorModal ||
      editingFolder ||
      deletingFolder ||
      editingGoal ||
      deletingGoal ||
      editingProject ||
      completingProject ||
      archivingProject ||
      deletingProject ||
      editingStage ||
      editingTask
  );

  React.useEffect(() => {
    onModalStateChange?.(isAnyLocalModalOpen);
  }, [isAnyLocalModalOpen, onModalStateChange]);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === plansContext.activeFolderId) ?? null,
    [folders, plansContext.activeFolderId]
  );

  const activeGoal = useMemo(
    () => goals.find((g) => g.id === plansContext.activeGoalId) ?? null,
    [goals, plansContext.activeGoalId]
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === plansContext.activeProjectId) ?? null,
    [projects, plansContext.activeProjectId]
  );

  const breadcrumbData = useMemo(
    () => buildAbbreviatedBreadcrumbs(folders, plansContext.activeFolderId, 3),
    [folders, plansContext.activeFolderId]
  );

  const openTaskEditor = (task: Task) => {
    setModalError(null);
    setEditingTaskId(task.id);
    setTaskEditTitle(task.title);
    setTaskEditDescription(task.description ?? '');
    setTaskEditPriority(task.priority);
    setTaskEditPlannedDate(
      task.planningState === 'date_only' ? task.plannedDate : null
    );
    setTaskEditEstimate(
      task.estimatedDurationMinutes !== null
        ? String(task.estimatedDurationMinutes)
        : ''
    );
    if (!task.deadline) {
      setTaskEditDeadlineKind('none');
      setTaskEditDeadlineDate('');
      setTaskEditDeadlineInstant('');
    } else if (task.deadline.kind === 'date_only') {
      setTaskEditDeadlineKind('date_only');
      setTaskEditDeadlineDate(task.deadline.localDate);
      setTaskEditDeadlineInstant('');
    } else {
      setTaskEditDeadlineKind('exact_instant');
      setTaskEditDeadlineDate('');
      setTaskEditDeadlineInstant(task.deadline.instant.slice(0, 16));
    }

    if (task.ownership.kind === 'project') {
      setTaskEditOwnershipMode('project');
      setTaskEditProjectId(task.ownership.projectId);
      setTaskEditStageId(task.ownership.stageId);
      setTaskEditGoalId(null);
      setTaskEditFolderId(null);
    } else if (task.ownership.kind === 'goal') {
      setTaskEditOwnershipMode('goal');
      setTaskEditGoalId(task.ownership.goalId);
      setTaskEditFolderId(null);
      setTaskEditProjectId(null);
      setTaskEditStageId(null);
    } else if (task.ownership.kind === 'folder') {
      setTaskEditOwnershipMode('folder');
      setTaskEditFolderId(task.ownership.folderId);
      setTaskEditGoalId(null);
      setTaskEditProjectId(null);
      setTaskEditStageId(null);
    } else {
      setTaskEditOwnershipMode('standalone');
      setTaskEditFolderId(null);
      setTaskEditGoalId(null);
      setTaskEditProjectId(null);
      setTaskEditStageId(null);
    }
    setNewChecklistTitle('');
    setShowAddSessionForm(false);
    setRescheduleResId(null);
    setNewSessionStartDate(actualTodayDate);
    setNewSessionEndDate(actualTodayDate);
  };

  const openGoalEditModal = (goal: Goal) => {
    setModalError(null);
    setEditingGoal(goal);
    setGoalEditTitle(goal.title);
    setGoalEditPurpose(goal.purposeUk ?? '');
    setGoalEditCriteria(goal.completionCriteriaUk ?? '');
    setGoalEditIntention(goal.implementationIntentionUk ?? '');
    setGoalEditTargetDate(goal.timing?.targetDate ?? null);
    setGoalEditTargetPeriod(goal.timing?.targetPeriodUk ?? '');
    setGoalEditFolderId(goal.folderId);
    setGoalEditState(goal.state);
    setGoalEditNextActionTaskId(goal.nextActionTaskId);
  };

  const handleSaveGoalEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal || !goalEditTitle.trim()) return;
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      await repositories.saveGoal({
        ...editingGoal,
        title: goalEditTitle.trim(),
        purposeUk: goalEditPurpose.trim() ? goalEditPurpose.trim() : null,
        completionCriteriaUk: goalEditCriteria.trim()
          ? goalEditCriteria.trim()
          : null,
        implementationIntentionUk: goalEditIntention.trim()
          ? goalEditIntention.trim()
          : null,
        timing:
          goalEditTargetDate || goalEditTargetPeriod.trim()
            ? {
                targetDate: goalEditTargetDate || null,
                targetPeriodUk: goalEditTargetPeriod.trim()
                  ? goalEditTargetPeriod.trim()
                  : null,
              }
            : null,
        folderId: goalEditFolderId || null,
        state: goalEditState,
        nextActionTaskId: goalEditNextActionTaskId || null,
        updatedAt: nowIso,
        completedAt:
          goalEditState === 'completed'
            ? editingGoal.completedAt ?? nowIso
            : null,
        revision: editingGoal.revision + 1,
      });
      setEditingGoal(null);
      await onDataChanged('Ціль оновлено.');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося оновити ціль.'
      );
    }
  };

  const handleToggleGoalArchived = async (goal: Goal) => {
    setModalError(null);
    try {
      await repositories.archiveGoalTransactionally(
        goal.id,
        !goal.archived,
        new Date().toISOString(),
        goal.revision
      );
      await onDataChanged(
        goal.archived ? 'Ціль розархівовано.' : 'Ціль заархівовано.'
      );
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося змінити архів цілі.'
      );
    }
  };

  const openGoalDeleteModal = (goal: Goal) => {
    setModalError(null);
    setDeletingGoal(goal);
    setGoalDeleteMode('unlink_children');
  };

  const handleConfirmDeleteGoal = async () => {
    if (!deletingGoal) return;
    setModalError(null);
    try {
      await repositories.deleteGoalTransactionally(
        deletingGoal.id,
        goalDeleteMode,
        new Date().toISOString()
      );
      if (plansContext.activeGoalId === deletingGoal.id) {
        onUpdatePlansContext({ activeGoalId: null });
      }
      setDeletingGoal(null);
      await onDataChanged('Ціль видалено.');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося видалити ціль.'
      );
    }
  };

  const openFolderEditModal = (folder: Folder) => {
    setModalError(null);
    setEditingFolder(folder);
    setFolderEditName(folder.name);
    setFolderEditParentId(folder.parentId);
  };

  const openFolderDeleteModal = (folder: Folder) => {
    setModalError(null);
    setDeletingFolder(folder);
    setFolderDeleteStrategy('rehome_to_parent');
    setFolderDeleteConfirmed(false);
  };

  const openProjectEditModal = (project: Project) => {
    setModalError(null);
    setEditingProject(project);
    setProjEditTitle(project.title);
    setProjEditOutcome(project.desiredOutcome ?? '');
    setProjEditCriteria(project.completionCriteria ?? '');
    setProjEditDescription(project.description ?? '');
    setProjEditTargetDate(project.targetDate);
    setProjEditCollaborators(project.collaboratorText ?? '');
    setProjEditFolderId(project.folderId);
    setProjEditState(project.state);
  };

  // Filtered tasks helper
  const matchesTaskFilter = (task: Task): boolean => {
    const q = plansContext.searchQuery.trim().toLowerCase();
    if (q) {
      const inTitle = task.title.toLowerCase().includes(q);
      const inDesc = (task.description ?? '').toLowerCase().includes(q);
      const inChecklist = task.checklist.some((c) =>
        c.title.toLowerCase().includes(q)
      );
      if (!inTitle && !inDesc && !inChecklist) {
        return false;
      }
    }

    if (plansContext.taskStateFilter === 'open' && task.state !== 'open') {
      return false;
    }
    if (
      plansContext.taskStateFilter === 'completed' &&
      task.state !== 'completed'
    ) {
      return false;
    }
    if (
      plansContext.taskStateFilter === 'canceled' &&
      task.state !== 'canceled'
    ) {
      return false;
    }
    if (
      plansContext.taskStateFilter === 'all' &&
      !plansContext.showCompletedTasks &&
      task.state === 'completed'
    ) {
      return false;
    }

    if (
      plansContext.priorityFilter !== 'all' &&
      task.priority !== plansContext.priorityFilter
    ) {
      return false;
    }

    return true;
  };

  const isSearchActive =
    plansContext.searchQuery.trim().length > 0 ||
    plansContext.taskStateFilter !== 'all' ||
    plansContext.priorityFilter !== 'all';

  // Child folders in current container
  const childFolders = useMemo(() => {
    const q = plansContext.searchQuery.trim().toLowerCase();
    return folders
      .filter((f) => {
        if (q) {
          return f.name.toLowerCase().includes(q);
        }
        return f.parentId === plansContext.activeFolderId;
      })
      .sort((a, b) => a.order - b.order);
  }, [folders, plansContext.activeFolderId, plansContext.searchQuery]);

  // Projects in current container
  const [directionStatus,setDirectionStatus]=useState<'active'|'idea'|'paused'|'completed'>('active');
  const containerProjects = useMemo(() => {
    const q = plansContext.searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (p.state !== directionStatus) return false;
      if (!plansContext.showArchivedProjects && p.archived) {
        return false;
      }
      if (q) {
        return (
          p.title.toLowerCase().includes(q) ||
          (p.desiredOutcome ?? '').toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
        );
      }
      return p.folderId === plansContext.activeFolderId;
    });
  }, [
    directionStatus,
    projects,
    plansContext.activeFolderId,
    plansContext.showArchivedProjects,
    plansContext.searchQuery,
  ]);

  // Goals in current container
  const containerGoals = useMemo(() => {
    const q = plansContext.searchQuery.trim().toLowerCase();
    return goals.filter((g) => {
      if (g.state !== directionStatus) return false;
      if (!plansContext.showArchivedProjects && g.archived) {
        return false;
      }
      if (q) {
        return (
          g.title.toLowerCase().includes(q) ||
          (g.purposeUk ?? '').toLowerCase().includes(q) ||
          (g.completionCriteriaUk ?? '').toLowerCase().includes(q) ||
          (g.implementationIntentionUk ?? '').toLowerCase().includes(q)
        );
      }
      return g.folderId === plansContext.activeFolderId;
    });
  }, [
    directionStatus,
    goals,
    plansContext.activeFolderId,
    plansContext.showArchivedProjects,
    plansContext.searchQuery,
  ]);

  // Standalone tasks in current container (or all matching tasks when search is active)
  const containerTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!matchesTaskFilter(t)) return false;
      if (isSearchActive && !plansContext.activeProjectId && !plansContext.activeGoalId) {
        return true;
      }
      if (plansContext.activeFolderId === null) {
        return (
          t.ownership.kind === 'standalone' &&
          (t.ownership.folderId === null || t.ownership.folderId === undefined)
        );
      }
      return (
        (t.ownership.kind === 'folder' &&
          t.ownership.folderId === plansContext.activeFolderId) ||
        (t.ownership.kind === 'standalone' &&
          t.ownership.folderId === plansContext.activeFolderId)
      );
    });
  }, [
    tasks,
    plansContext.activeFolderId,
    plansContext.activeProjectId,
    plansContext.activeGoalId,
    plansContext.searchQuery,
    plansContext.taskStateFilter,
    plansContext.priorityFilter,
    plansContext.showCompletedTasks,
    isSearchActive,
  ]);

  // Projects and direct tasks for the active goal
  const activeGoalProjects = useMemo(() => {
    if (!activeGoal) return [];
    return projects.filter((p) => p.goalId === activeGoal.id);
  }, [projects, activeGoal]);

  const activeGoalTasks = useMemo(() => {
    if (!activeGoal) return [];
    return tasks.filter(
      (t) =>
        t.ownership.kind === 'goal' &&
        t.ownership.goalId === activeGoal.id &&
        matchesTaskFilter(t)
    );
  }, [
    tasks,
    activeGoal,
    plansContext.taskStateFilter,
    plansContext.priorityFilter,
    plansContext.showCompletedTasks,
  ]);

  const activeProjectAllTasks = useMemo(() => {
    if (!activeProject) return [];
    return tasks.filter(
      (t) =>
        t.ownership.kind === 'project' &&
        t.ownership.projectId === activeProject.id
    );
  }, [tasks, activeProject]);

  const activeProjectVisibleTasks = useMemo(() => {
    return activeProjectAllTasks.filter(matchesTaskFilter);
  }, [
    activeProjectAllTasks,
    plansContext.searchQuery,
    plansContext.taskStateFilter,
    plansContext.priorityFilter,
    plansContext.showCompletedTasks,
  ]);

  const handleReorderFolder = async (
    folderId: string,
    direction: 'up' | 'down'
  ) => {
    try {
      const target = folders.find((f) => f.id === folderId);
      if (!target) return;
      const siblings = folders
        .filter((f) => f.parentId === target.parentId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((f) => f.id === folderId);
      if (idx === -1) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;
      const reordered = [...siblings];
      const temp = reordered[idx];
      reordered[idx] = reordered[swapIdx];
      reordered[swapIdx] = temp;
      await repositories.reorderFoldersTransactionally(
        target.parentId,
        reordered.map((f) => f.id),
        new Date().toISOString()
      );
      await onDataChanged();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося змінити порядок папок.'
      );
    }
  };

  const handleSaveFolderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder) return;
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      await repositories.saveFolder({
        ...editingFolder,
        name: folderEditName,
        parentId: folderEditParentId,
        updatedAt: nowIso,
        revision: editingFolder.revision + 1,
      });
      setEditingFolder(null);
      await onDataChanged('Папку оновлено.');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося оновити папку.'
      );
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    setModalError(null);
    try {
      await repositories.deleteFolderTransactionally(
        deletingFolder.id,
        folderDeleteStrategy,
        new Date().toISOString()
      );
      if (plansContext.activeFolderId === deletingFolder.id) {
        onUpdatePlansContext({ activeFolderId: deletingFolder.parentId });
      }
      setDeletingFolder(null);
      await onDataChanged(UK_STRINGS.plansView.folderDeletedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося видалити папку.'
      );
    }
  };

  const handleSaveProjectEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      await repositories.saveProject({
        ...editingProject,
        title: projEditTitle,
        desiredOutcome: projEditOutcome.trim() ? projEditOutcome.trim() : null,
        completionCriteria: projEditCriteria.trim()
          ? projEditCriteria.trim()
          : null,
        description: projEditDescription.trim()
          ? projEditDescription.trim()
          : null,
        targetDate: projEditTargetDate || null,
        collaboratorText: projEditCollaborators.trim()
          ? projEditCollaborators.trim()
          : null,
        folderId: projEditFolderId || null,
        state: projEditState,
        completedAt:
          projEditState === 'completed'
            ? editingProject.completedAt ?? nowIso
            : null,
        updatedAt: nowIso,
        revision: editingProject.revision + 1,
      });
      setEditingProject(null);
      await onDataChanged(UK_STRINGS.plansView.projectUpdatedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося оновити проєкт.'
      );
    }
  };

  const handleConfirmCompleteProject = async () => {
    if (!completingProject) return;
    setModalError(null);
    try {
      await repositories.completeProjectExplicitlyTransactionally(
        completingProject.id,
        new Date().toISOString()
      );
      setCompletingProject(null);
      await onDataChanged(UK_STRINGS.plansView.projectCompletedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося завершити проєкт.'
      );
    }
  };

  const handleConfirmArchiveProject = async () => {
    if (!archivingProject) return;
    setModalError(null);
    try {
      await repositories.archiveProjectTransactionally(
        archivingProject.id,
        true,
        archivePlanningChoice,
        new Date().toISOString(),
        actualTodayDate
      );
      setArchivingProject(null);
      await onDataChanged(UK_STRINGS.plansView.projectArchivedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося архівувати проєкт.'
      );
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!deletingProject) return;
    setModalError(null);
    try {
      await repositories.deleteProjectTransactionally(
        deletingProject.id,
        projectDeleteTaskMode,
        new Date().toISOString()
      );
      if (plansContext.activeProjectId === deletingProject.id) {
        onUpdatePlansContext({ activeProjectId: null });
      }
      setDeletingProject(null);
      await onDataChanged(UK_STRINGS.plansView.projectDeletedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося видалити проєкт.'
      );
    }
  };

  const handleSaveStageEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage) return;
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      await repositories.saveStage({
        ...editingStage,
        title: stageEditTitle,
        expectedOutcome: stageEditOutcome.trim()
          ? stageEditOutcome.trim()
          : null,
        updatedAt: nowIso,
        revision: editingStage.revision + 1,
      });
      setEditingStage(null);
      await onDataChanged('Етап оновлено.');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося оновити етап.'
      );
    }
  };

  const handleUndoTaskLifecycle = async () => {
    if (!lastUndoToken) return;
    setModalError(null);
    try {
      await repositories.undoTaskLifecycleTransactionally(
        lastUndoToken,
        new Date().toISOString(),
        activeZone
      );
      setLastUndoToken(null);
      await onDataChanged(UK_STRINGS.scheduling.undoSuccessFeedback);
    } catch (err) {
      setLastUndoToken(null);
      setModalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося скасувати дію життєвого циклу справи.'
      );
    }
  };

  const handleAddReservationSession = async () => {
    if (!editingTask) return;
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      const built = buildZonedIntervalFromLocalInput({
        startLocalDate: newSessionStartDate,
        startLocalTime: newSessionStartTime,
        endLocalDate: newSessionEndDate,
        endLocalTime: newSessionEndTime,
        originZone: activeZone,
      });
      const conflictReport = detectScheduleConflicts({
        candidateStartInstant: built.interval.startInstant,
        candidateEndInstant: built.interval.endInstant,
        displayZone: activeZone,
        events,
        reservations,
        tasks,
      });
      if (conflictReport.hasConflicts && !newSessionOverlapConfirmed) {
        setModalError(
          conflictReport.warningMessageUk ??
            UK_STRINGS.creation.eventForm.overlapConfirmationRequiredError
        );
        return;
      }

      const newResId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      await repositories.saveReservationTransactionally({
        id: newResId,
        taskId: editingTask.id,
        interval: built.interval,
        state: 'active',
        releaseMetadata: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });
      setTaskEditPlannedDate(null);
      setShowAddSessionForm(false);
      setNewSessionOverlapConfirmed(false);
      await onDataChanged('Часовий резерв справи додано до розкладу.');
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося додати сесію до розкладу.'
      );
    }
  };

  const handleStartRescheduleReservation = (res: TaskReservation) => {
    setRescheduleResId(res.id);
    setRescheduleStartDate(res.interval.originStartLocalDate);
    setRescheduleStartTime(res.interval.originStartLocalTime);
    setRescheduleEndDate(res.interval.originEndLocalDate);
    setRescheduleEndTime(res.interval.originEndLocalTime);
    setRescheduleOverlapConfirmed(false);
    setModalError(null);
  };

  const handleSaveRescheduleReservation = async (res: TaskReservation) => {
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      const built = buildZonedIntervalFromLocalInput({
        startLocalDate: rescheduleStartDate,
        startLocalTime: rescheduleStartTime,
        endLocalDate: rescheduleEndDate,
        endLocalTime: rescheduleEndTime,
        originZone: res.interval.originZone,
      });
      const conflictReport = detectScheduleConflicts({
        candidateStartInstant: built.interval.startInstant,
        candidateEndInstant: built.interval.endInstant,
        excludeReservationId: res.id,
        events,
        reservations,
        tasks,
        displayZone: res.interval.originZone,
      });
      if (conflictReport.hasConflicts && !rescheduleOverlapConfirmed) {
        setModalError(
          conflictReport.warningMessageUk ??
            UK_STRINGS.creation.eventForm.overlapConfirmationRequiredError
        );
        return;
      }

      await repositories.rescheduleReservationTransactionally(
        res.id,
        built.interval,
        nowIso,
        res.revision
      );
      setRescheduleResId(null);
      setRescheduleOverlapConfirmed(false);
      await onDataChanged('Час сесії оновлено.');
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося змінити час сесії в розкладі.'
      );
    }
  };

  const handleCancelSingleReservation = async (res: TaskReservation) => {
    setModalError(null);
    try {
      const updated = await repositories.cancelSingleReservationTransactionally(
        res.id,
        'cancel',
        new Date().toISOString(),
        res.revision
      );
      if (updated.task?.planningState === 'unplanned') {
        setTaskEditPlannedDate(null);
      }
      await onDataChanged('Сесію скасовано.');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося скасувати сесію.'
      );
    }
  };

  const handleRemoveCurrentPlanningFromSheet = async () => {
    if (!editingTask) return;
    setModalError(null);
    try {
      await repositories.removeTaskCurrentPlanningTransactionally(
        editingTask.id,
        new Date().toISOString(),
        editingTask.revision
      );
      setTaskEditPlannedDate(null);
      await onDataChanged('Поточне планування справи знято.');
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося зняти поточне планування.'
      );
    }
  };

  const handleSaveTaskDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setModalError(null);
    const nowIso = new Date().toISOString();

    try {
      let parsedDeadline: TaskDeadline | null = null;
      if (taskEditDeadlineKind === 'date_only' && taskEditDeadlineDate.trim()) {
        parsedDeadline = {
          kind: 'date_only',
          localDate: taskEditDeadlineDate.trim(),
        };
      } else if (
        taskEditDeadlineKind === 'exact_instant' &&
        taskEditDeadlineInstant.trim()
      ) {
        const dt = new Date(taskEditDeadlineInstant.trim());
        if (!Number.isNaN(dt.getTime())) {
          parsedDeadline = {
            kind: 'exact_instant',
            instant: dt.toISOString(),
            zoneId: activeZone,
          };
        }
      }

      const parsedEstimate =
        taskEditEstimate.trim().length > 0
          ? Number(taskEditEstimate.trim())
          : null;

      const targetOwnership: TaskOwnership =
        taskEditOwnershipMode === 'project' && taskEditProjectId
          ? {
              kind: 'project',
              projectId: taskEditProjectId,
              stageId: taskEditStageId || null,
            }
          : taskEditOwnershipMode === 'goal' && taskEditGoalId
          ? {
              kind: 'goal',
              goalId: taskEditGoalId,
            }
          : taskEditOwnershipMode === 'folder' && taskEditFolderId
          ? {
              kind: 'folder',
              folderId: taskEditFolderId,
            }
          : {
              kind: 'standalone',
              folderId: null,
            };

      let baseTask = editingTask;
      const ownershipChanged =
        JSON.stringify(editingTask.ownership) !==
        JSON.stringify(targetOwnership);
      if (ownershipChanged) {
        baseTask = await repositories.moveTaskOwnershipTransactionally(
          editingTask.id,
          targetOwnership,
          nowIso,
          editingTask.revision
        );
      }

      const nextPlanningState =
        baseTask.planningState === 'timed'
          ? 'timed'
          : taskEditPlannedDate
          ? 'date_only'
          : 'unplanned';

      await repositories.saveTask({
        ...baseTask,
        title: taskEditTitle,
        description: taskEditDescription.trim()
          ? taskEditDescription.trim()
          : null,
        priority: taskEditPriority,
        deadline: parsedDeadline,
        estimatedDurationMinutes: parsedEstimate,
        planningState: nextPlanningState,
        plannedDate:
          nextPlanningState === 'date_only' ? taskEditPlannedDate : null,
        ownership: baseTask.ownership,
        updatedAt: nowIso,
        revision: baseTask.revision + 1,
      });

      setEditingTaskId(null);
      await onDataChanged(UK_STRINGS.plansView.taskUpdatedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося оновити справу.'
      );
    }
  };

  const handleTaskLifecycleFromSheet = async (
    targetState: 'open' | 'completed' | 'canceled'
  ) => {
    if (!editingTask) return;
    setModalError(null);
    const nowIso = new Date().toISOString();
    try {
      if (targetState === 'completed') {
        const res = await repositories.completeTaskTransactionally(
          editingTask.id,
          nowIso,
          editingTask.revision
        );
        setLastUndoToken(res.undoToken);
      } else if (targetState === 'canceled') {
        const res = await repositories.cancelTaskTransactionally(
          editingTask.id,
          nowIso,
          editingTask.revision
        );
        setLastUndoToken(res.undoToken);
      } else {
        setLastUndoToken(null);
        await repositories.reopenTaskTransactionally(
          editingTask.id,
          nowIso,
          editingTask.revision
        );
      }
      await onDataChanged(UK_STRINGS.plansView.taskUpdatedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося змінити стан справи.'
      );
    }
  };

  const handleDeleteTaskFromSheet = async () => {
    if (!editingTask) return;
    setModalError(null);
    try {
      await repositories.deleteTaskTransactionally(editingTask.id);
      setEditingTaskId(null);
      await onDataChanged(UK_STRINGS.plansView.taskDeletedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не вдалося видалити справу.'
      );
    }
  };

  // Checklist operations on the currently open editingTask
  const updateChecklist = async (nextItems: ChecklistItem[]) => {
    if (!editingTask) return;
    const normalized = nextItems.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));
    const nowIso = new Date().toISOString();
    await repositories.saveTask({
      ...editingTask,
      checklist: normalized,
      updatedAt: nowIso,
      revision: editingTask.revision + 1,
    });
    await onDataChanged();
  };

  const handleAddChecklistItem = async () => {
    if (!editingTask || !newChecklistTitle.trim()) return;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: ChecklistItem[] = [
      ...editingTask.checklist,
      {
        id,
        title: newChecklistTitle.trim(),
        completed: false,
        order: editingTask.checklist.length + 1,
      },
    ];
    setNewChecklistTitle('');
    await updateChecklist(next);
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    if (!editingTask) return;
    const next = editingTask.checklist.map((c) =>
      c.id === itemId ? { ...c, completed: !c.completed } : c
    );
    await updateChecklist(next);
  };

  const handleReorderChecklistItem = async (
    itemId: string,
    direction: 'up' | 'down'
  ) => {
    if (!editingTask) return;
    const sorted = [...editingTask.checklist].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((c) => c.id === itemId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const temp = sorted[idx];
    sorted[idx] = sorted[swapIdx];
    sorted[swapIdx] = temp;
    await updateChecklist(sorted);
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    if (!editingTask) return;
    const next = editingTask.checklist.filter((c) => c.id !== itemId);
    await updateChecklist(next);
  };

  const handlePromoteChecklistItem = async (itemId: string) => {
    if (!editingTask) return;
    const newTaskId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `promoted-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await repositories.promoteChecklistItemToTaskTransactionally(
        editingTask.id,
        itemId,
        newTaskId,
        new Date().toISOString()
      );
      await onDataChanged(UK_STRINGS.plansView.checklistPromotedFeedback);
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося перетворити крок на справу.'
      );
    }
  };

  const folderDeleteImpact = useMemo(() => {
    if (!deletingFolder) return null;
    return computeFolderDeleteImpact(
      folders,
      projects,
      tasks,
      deletingFolder.id
    );
  }, [deletingFolder, folders, projects, tasks]);

  const allowedMoveFoldersForEditingFolder = useMemo(() => {
    if (!editingFolder) return [];
    return getAllowedMoveTargetFolders(folders, editingFolder.id);
  }, [folders, editingFolder]);

  return (
    <div className="space-y-4 directions-stage4" data-testid="destination-view-plans">
      {activeGoal || activeProject ? (
        <SubHeader
          title={(activeProject ?? activeGoal)!.title}
          onBack={() => {
            setShowRoadmap(false);
            onUpdatePlansContext(
              activeProject
                ? { activeProjectId: null }
                : { activeGoalId: null },
            );
          }}
          actions={
            <ActionMenu
              label="Дії плану"
              items={[
                {
                  label: "Редагувати",
                  onSelect: () =>
                    activeProject
                      ? openProjectEditModal(activeProject)
                      : openGoalEditModal(activeGoal!),
                },
                {
                  label: "Архівувати",
                  onSelect: () =>
                    activeProject
                      ? setArchivingProject(activeProject)
                      : void handleToggleGoalArchived(activeGoal!),
                },
                {
                  label: "Видалити",
                  onSelect: () =>
                    activeProject
                      ? setDeletingProject(activeProject)
                      : openGoalDeleteModal(activeGoal!),
                },
              ]}
            />
          }
        />
      ) : (
        <PageHeader
          title="Напрями"
          actions={
            <>
              <RoundButton
                aria-label="Пошук"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <Search size={20} />
              </RoundButton>
              <RoundButton
                aria-label="Додати"
                onClick={() => onOpenGlobalCreation("folder")}
              >
                <Plus size={20} />
              </RoundButton>
            </>
          }
        >
          {searchOpen && (
            <InputField
              label="Пошук напрямів"
              value={plansContext.searchQuery}
              onChange={(e) =>
                onUpdatePlansContext({ searchQuery: e.target.value })
              }
            />
          )}
          <Segmented
            label="Простір напрямів"
            value={showRoadmap ? "roadmap" : "directions"}
            onChange={(v) => setShowRoadmap(v === "roadmap")}
            options={[
              { value: "directions", label: "Напрями" },
              { value: "roadmap", label: "Глобальна дорожня карта" },
            ]}
          />
          <div className="ui-pill-row" data-ui="pill-row">
            <PillRow
              label="Статус планів"
              value={directionStatus}
              onChange={setDirectionStatus}
              options={[
                { value: "active", label: "Активні" },
                { value: "idea", label: "Ідеї" },
                { value: "paused", label: "На паузі" },
                { value: "completed", label: "Завершені" },
              ]}
            />
            <button className="ui-pill" onClick={() => setFiltersOpen(true)}>
              Фільтри
              {(plansContext.priorityFilter !== "all" ||
                plansContext.showCompletedTasks ||
                plansContext.showArchivedProjects) && (
                <span className="stage4-badge">
                  {Number(plansContext.priorityFilter !== "all") +
                    Number(plansContext.showCompletedTasks) +
                    Number(plansContext.showArchivedProjects)}
                </span>
              )}
            </button>
          </div>
        </PageHeader>
      )}
      <div data-ui="content-start" />
      {modalError && (
        <FeedbackBanner
          tone="error"
          message={modalError}
          onDismiss={() => setModalError(null)}
        />
      )}
      {activeFolder && !activeGoal && !activeProject && (
        <nav className="stage4-path" aria-label="Шлях напряму">
          <RoundButton
            aria-label="До батьківського напряму"
            onClick={() =>
              onUpdatePlansContext({ activeFolderId: activeFolder.parentId })
            }
          >
            <Icon name="chevron-left"/>
          </RoundButton>
          <button
            onClick={() => onUpdatePlansContext({ activeFolderId: null })}
          >
            Усі напрями
          </button>
          {breadcrumbData.fullChain.map((f) => (
            <React.Fragment key={f.id}>
              <span><Icon name="chevron-right"/></span>
              <button
                onClick={() => onUpdatePlansContext({ activeFolderId: f.id })}
              >
                {f.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
      )}
      {(activeGoal || activeProject) && (
        <Segmented
          label="План"
          value={showRoadmap ? "roadmap" : "detail"}
          onChange={(v) => setShowRoadmap(v === "roadmap")}
          options={[
            { value: "detail", label: "Деталі" },
            { value: "roadmap", label: "Дорожня карта" },
          ]}
        />
      )}
      {showRoadmap ? (
        <RoadmapView
          source={{ folders, goals, projects, stages, tasks }}
          selectedState={directionStatus}
          repositories={repositories}
          onChanged={onDataChanged}
          initialOwner={
            activeProject
              ? { kind: "project", id: activeProject.id }
              : activeGoal
                ? { kind: "goal", id: activeGoal.id }
                : null
          }
          onInspect={(owner) => {
            setShowRoadmap(false);
            onUpdatePlansContext(
              owner.kind === "goal"
                ? { activeGoalId: owner.id, activeProjectId: null }
                : { activeProjectId: owner.id },
            );
          }}
        />
      ) : activeGoal || activeProject ? (
        <>
          <PlanDetail
            record={(activeProject ?? activeGoal)!}
            kind={activeProject ? "project" : "goal"}
            tasks={activeProject ? activeProjectVisibleTasks : activeGoalTasks}
            reservations={reservations}
            repositories={repositories}
            zone={activeZone}
            onChanged={onDataChanged}
            onTask={openTaskEditor}
            onAdd={() => onOpenGlobalCreation("task")}
          />
          {!activeProject && activeGoalProjects.length > 0 && (
            <Section title="Проєкти">
              {activeGoalProjects.map((p) => (
                <Disclosure
                  key={p.id}
                  title={p.title}
                  onClick={() =>
                    onUpdatePlansContext({ activeProjectId: p.id })
                  }
                />
              ))}
            </Section>
          )}
        </>
      ) : (
        <>
          {childFolders.length > 0 && (
            <Section title="Напрями">
              {childFolders.map((f, i) => {
                const gs = goals.filter(
                  (g) =>
                    g.folderId === f.id &&
                    g.state === directionStatus &&
                    !g.archived,
                );
                const ps = projects.filter(
                  (p) =>
                    p.folderId === f.id &&
                    p.state === directionStatus &&
                    !p.archived,
                );
                const ts = tasks.filter(
                  (t) =>
                    t.ownership.kind === "folder" &&
                    t.ownership.folderId === f.id &&
                    matchesTaskFilter(t),
                );
                return (
                  <Row
                    key={f.id}
                    leading={
                      <FolderIcon
                        size={22}
                        style={{ color: `hsl(${190 + i * 27} 55% 55%)` }}
                      />
                    }
                    title={
                      <button
                        className="stage4-open"
                        onClick={() =>
                          onUpdatePlansContext({ activeFolderId: f.id })
                        }
                      >
                        {f.name}
                      </button>
                    }
                    secondary={[
                      gs.length && `${gs.length} цілі`,
                      ps.length && `${ps.length} проєкти`,
                      ts.length && `${ts.length} справи`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    trailing={
                      <>
                        <span className="stage4-dot" role="img" aria-label="Активний" />
                        <ActionMenu
                          label={`Дії: ${f.name}`}
                          items={[
                            {
                              label: "Відкрити",
                              onSelect: () =>
                                onUpdatePlansContext({ activeFolderId: f.id }),
                            },
                            {
                              label: "Редагувати",
                              onSelect: () => openFolderEditModal(f),
                            },
                            {
                              label: "Перемістити",
                              onSelect: () => openFolderEditModal(f),
                            },
                            {
                              label: "Змінити порядок",
                              onSelect: () => setReorderOpen(true),
                            },
                            {
                              label: "Видалити",
                              onSelect: () => openFolderDeleteModal(f),
                            },
                          ]}
                        />
                      </>
                    }
                  />
                );
              })}
            </Section>
          )}
          {containerGoals.length + containerProjects.length > 0 && (
            <Section title={activeFolder?.name ?? "Цілі й проєкти"}>
              {[
                ...containerGoals,
                ...containerProjects.filter((p) => !p.goalId),
              ].map((p) => {
                const own = tasks.filter((t) =>
                  t.ownership.kind === "goal"
                    ? t.ownership.goalId === p.id
                    : t.ownership.kind === "project" &&
                      t.ownership.projectId === p.id,
                );
                return (
                  <Disclosure
                    key={p.id}
                    title={
                      (
                        <>
                          {p.title}
                          <span className="stage4-progress">
                            <span
                              style={{
                                width: `${own.length ? (own.filter((t) => t.state === "completed").length / own.length) * 100 : 0}%`,
                              }}
                            />
                          </span>
                        </>
                      ) as unknown as string
                    }
                    secondary={
                      tasks.find((t) => t.id === p.nextActionTaskId)?.title ??
                      "Наступний крок не визначено"
                    }
                    onClick={() =>
                      onUpdatePlansContext(
                        "purposeUk" in p && "timing" in p
                          ? { activeGoalId: p.id, activeProjectId: null }
                          : { activeProjectId: p.id },
                      )
                    }
                  />
                );
              })}
            </Section>
          )}
          {activeFolder && containerTasks.length > 0 && (
            <Section title="Справи">
              {containerTasks.map((t) => (
                <Disclosure
                  key={t.id}
                  title={t.title}
                  onClick={() => openTaskEditor(t)}
                />
              ))}
            </Section>
          )}
          {childFolders.length +
            containerGoals.length +
            containerProjects.length ===
            0 && (
            <EmptyState
              text="Ще немає напрямів"
              action="Додати"
              onAction={() => onOpenGlobalCreation("folder")}
            />
          )}
        </>
      )}
      <Sheet
        title="Фільтри"
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
      >
        <SelectField
          label="Пріоритет"
          value={plansContext.priorityFilter}
          onChange={(e) =>
            onUpdatePlansContext({
              priorityFilter: e.target.value as PlansPriorityFilter,
            })
          }
          options={[
            { value: "all", label: "Усі" },
            { value: "high", label: "Високий" },
            { value: "normal", label: "Звичайний" },
            { value: "low", label: "Низький" },
          ]}
        />
        <Row
          title="Показувати завершені"
          trailing={
            <Toggle
              label="Показувати завершені"
              checked={plansContext.showCompletedTasks}
              onChange={(v) => onUpdatePlansContext({ showCompletedTasks: v })}
            />
          }
        />
        <Row
          title="Показувати архівні"
          trailing={
            <Toggle
              label="Показувати архівні"
              checked={plansContext.showArchivedProjects}
              onChange={(v) =>
                onUpdatePlansContext({ showArchivedProjects: v })
              }
            />
          }
        />
        <Button variant="primary" onClick={() => setFiltersOpen(false)}>
          Готово
        </Button>
      </Sheet>
      <Sheet
        title="Змінити порядок"
        isOpen={reorderOpen}
        onClose={() => setReorderOpen(false)}
      >
        {childFolders.map((f) => (
          <Row
            key={f.id}
            title={f.name}
            trailing={
              <ActionMenu
                label={`Порядок: ${f.name}`}
                items={[
                  {
                    label: "Вище",
                    onSelect: () => void handleReorderFolder(f.id, "up"),
                  },
                  {
                    label: "Нижче",
                    onSelect: () => void handleReorderFolder(f.id, "down"),
                  },
                ]}
              />
            }
          />
        ))}
      </Sheet>
      <div>
        {/* MODAL 1: Full Ancestor Path Modal (when folder depth > 3) */}
      <ModalSheet
        isOpen={showFullAncestorModal}
        title={UK_STRINGS.plansView.fullAncestorPathTitle}
        onClose={() => setShowFullAncestorModal(false)}
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              onUpdatePlansContext({
                activeFolderId: null,
                activeProjectId: null,
              });
              setShowFullAncestorModal(false);
            }}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-2 text-left cursor-pointer"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <FolderIcon
              className="w-4 h-4"
              style={{ color: 'var(--color-work)' }}
              aria-hidden="true"
            />
            <span className="font-medium">
              {UK_STRINGS.destinations.plans.rootBreadcrumb}
            </span>
          </button>
          {breadcrumbData.fullChain.map((folder, index) => (
            <button
              key={folder.id}
              type="button"
              data-testid={`full-path-item-${folder.name}`}
              onClick={() => {
                onUpdatePlansContext({
                  activeFolderId: folder.id,
                  activeProjectId: null,
                });
                setShowFullAncestorModal(false);
              }}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-2 text-left cursor-pointer"
              style={{
                backgroundColor:
                  folder.id === plansContext.activeFolderId
                    ? 'var(--bg-pressed)'
                    : 'var(--bg-elevated)',
                paddingLeft: `${12 + Math.min(index, 8) * 12}px`,
              }}
            >
              <FolderIcon
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-work)' }}
                aria-hidden="true"
              />
              <span className="font-medium">{folder.name}</span>
            </button>
          ))}
        </div>
      </ModalSheet>

      {/* MODAL 2: Edit / Move Folder Modal (prevents cycles & moves into descendants) */}
      <ModalSheet
        isOpen={Boolean(editingFolder)}
        title={UK_STRINGS.plansView.editFolderTitle}
        onClose={() => setEditingFolder(null)}
      >
        {editingFolder && (
          <form onSubmit={handleSaveFolderEdit} className="space-y-4">
            <InputField
              label={UK_STRINGS.creation.folderForm.nameLabel}
              value={folderEditName}
              onChange={(e) => setFolderEditName(e.target.value)}
              data-testid="edit-folder-name-input"
              required
            />
            <SelectField
              label={UK_STRINGS.plansView.moveFolderParentLabel}
              value={folderEditParentId ?? ''}
              onChange={(e) =>
                setFolderEditParentId(e.target.value ? e.target.value : null)
              }
              options={[
                { value: '', label: UK_STRINGS.creation.rootFolderOption },
                ...allowedMoveFoldersForEditingFolder.map((f) => ({
                  value: f.id,
                  label: f.name,
                })),
              ]}
              data-testid="edit-folder-parent-select"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditingFolder(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="save-folder-edit-button"
              >
                {UK_STRINGS.app.saveButton}
              </Button>
            </div>
          </form>
        )}
      </ModalSheet>

      {/* MODAL 3: Delete Folder Modal (Default rehome; separate confirmation & counts for recursive delete) */}
      <ModalSheet
        isOpen={Boolean(deletingFolder)}
        title={UK_STRINGS.plansView.deleteFolderTitle}
        onClose={() => setDeletingFolder(null)}
      >
        {deletingFolder && folderDeleteImpact && (
          <div className="space-y-4" data-testid="delete-folder-modal">
            <p className="text-[0.875rem] m-0">
              Папка: <strong>{deletingFolder.name}</strong>
            </p>
            <div
              className="p-3 rounded-xl text-[0.8125rem] font-medium"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
              data-testid="delete-folder-impact-summary"
            >
              {UK_STRINGS.plansView.deleteFolderImpactSummary(
                folderDeleteImpact.descendantFolderCount,
                folderDeleteImpact.projectCount,
                folderDeleteImpact.totalTaskCount
              )}
            </div>

            <div className="space-y-2">
              <label
                className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <input
                  type="radio"
                  name="folderDeleteStrategy"
                  checked={folderDeleteStrategy === 'rehome_to_parent'}
                  onChange={() => {
                    setFolderDeleteStrategy('rehome_to_parent');
                    setFolderDeleteConfirmed(false);
                  }}
                  data-testid="folder-delete-strategy-rehome"
                  className="mt-1"
                />
                <span className="text-[0.875rem]">
                  {UK_STRINGS.plansView.deleteFolderRehomeOption}
                </span>
              </label>

              <label
                className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <input
                  type="radio"
                  name="folderDeleteStrategy"
                  checked={folderDeleteStrategy === 'recursive_delete'}
                  onChange={() => setFolderDeleteStrategy('recursive_delete')}
                  data-testid="folder-delete-strategy-recursive"
                  className="mt-1"
                />
                <span className="text-[0.875rem]">
                  {UK_STRINGS.plansView.deleteFolderRecursiveOption}
                </span>
              </label>
            </div>

            {folderDeleteStrategy === 'recursive_delete' && (
              <Row
                title={UK_STRINGS.plansView.deleteFolderRecursiveConfirmCheckbox}
                trailing={
                  <Toggle
                    label={UK_STRINGS.plansView.deleteFolderRecursiveConfirmCheckbox}
                    checked={folderDeleteConfirmed}
                    onChange={setFolderDeleteConfirmed}
                    data-testid="folder-delete-recursive-confirm-checkbox"
                  />
                }
              />
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeletingFolder(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                variant="danger"
                disabled={
                  folderDeleteStrategy === 'recursive_delete' &&
                  !folderDeleteConfirmed
                }
                onClick={() => void handleConfirmDeleteFolder()}
                data-testid="confirm-delete-folder-button"
              >
                {UK_STRINGS.app.deleteButton}
              </Button>
            </div>
          </div>
        )}
      </ModalSheet>

      {/* MODAL 4: Edit Project Modal */}
      <ModalSheet
        isOpen={Boolean(editingProject)}
        title={UK_STRINGS.plansView.editProjectButton}
        onClose={() => setEditingProject(null)}
      >
        {editingProject && (
          <form onSubmit={handleSaveProjectEdit} className="space-y-3.5">
            <InputField
              label={UK_STRINGS.creation.projectForm.titleLabel}
              value={projEditTitle}
              onChange={(e) => setProjEditTitle(e.target.value)}
              data-testid="edit-project-title-input"
              required
            />
            <SelectField
              label={UK_STRINGS.creation.projectForm.folderLabel}
              value={projEditFolderId ?? ''}
              onChange={(e) =>
                setProjEditFolderId(e.target.value ? e.target.value : null)
              }
              options={[
                { value: '', label: UK_STRINGS.creation.rootFolderOption },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
              data-testid="edit-project-folder-select"
            />
            <SelectField
              label="Стан проєкту"
              value={projEditState}
              onChange={(e) =>
                setProjEditState(e.target.value as ProjectResultState)
              }
              options={[
                {
                  value: 'active',
                  label: UK_STRINGS.plansView.projectStateActive,
                },
                {
                  value: 'paused',
                  label: UK_STRINGS.plansView.projectStatePaused,
                },
                {
                  value: 'completed',
                  label: UK_STRINGS.plansView.projectStateCompleted,
                },
              ]}
              data-testid="edit-project-state-select"
            />
            <TextAreaField
              label={UK_STRINGS.creation.projectForm.desiredOutcomeLabel}
              value={projEditOutcome}
              onChange={(e) => setProjEditOutcome(e.target.value)}
            />
            <TextAreaField
              label={UK_STRINGS.creation.projectForm.criteriaLabel}
              value={projEditCriteria}
              onChange={(e) => setProjEditCriteria(e.target.value)}
            />
            <TextAreaField
              label={UK_STRINGS.creation.projectForm.descriptionLabel}
              value={projEditDescription}
              onChange={(e) => setProjEditDescription(e.target.value)}
            />
            <InputField
              label={UK_STRINGS.creation.projectForm.collaboratorsLabel}
              value={projEditCollaborators}
              onChange={(e) => setProjEditCollaborators(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setEditingProject(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="save-project-edit-button"
              >
                {UK_STRINGS.app.saveButton}
              </Button>
            </div>
          </form>
        )}
      </ModalSheet>

      {/* MODAL 5: Explicit Project Completion Modal (Shows unresolved tasks without completing them silently) */}
      <ModalSheet
        isOpen={Boolean(completingProject)}
        title={UK_STRINGS.plansView.completeProjectModalTitle}
        onClose={() => setCompletingProject(null)}
      >
        {completingProject && (
          <div className="space-y-4" data-testid="complete-project-modal">
            {(() => {
              const unresolved = getUnresolvedProjectTasks(
                tasks,
                completingProject.id
              );
              if (unresolved.length === 0) {
                return (
                  <p className="text-[0.875rem] m-0">
                    {UK_STRINGS.plansView.completeProjectAllResolvedNote}
                  </p>
                );
              }
              return (
                <div className="space-y-2.5">
                  <p className="text-[0.875rem] m-0">
                    {UK_STRINGS.plansView.completeProjectUnresolvedWarning(
                      unresolved.length
                    )}
                  </p>
                  <ul
                    className="p-3 rounded-xl space-y-1.5 m-0 list-disc pl-6 text-[0.875rem]"
                    style={{ backgroundColor: 'var(--bg-elevated)' }}
                    data-testid="complete-project-unresolved-list"
                  >
                    {unresolved.map((u) => (
                      <li key={u.id}>{u.title}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setCompletingProject(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmCompleteProject()}
                data-testid="confirm-complete-project-button"
              >
                {UK_STRINGS.plansView.completeProjectConfirmButton}
              </Button>
            </div>
          </div>
        )}
      </ModalSheet>

      {/* MODAL 6: Archive Project Modal (Explicit retain-planning vs remove-planning choice) */}
      <ModalSheet
        isOpen={Boolean(archivingProject)}
        title={UK_STRINGS.plansView.archiveProjectModalTitle}
        onClose={() => setArchivingProject(null)}
      >
        {archivingProject && (
          <div className="space-y-4" data-testid="archive-project-modal">
            <p
              className="text-[0.875rem] m-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {UK_STRINGS.plansView.archiveProjectSubtitle}
            </p>
            <div className="space-y-2">
              <label
                className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <input
                  type="radio"
                  name="archivePlanningChoice"
                  checked={archivePlanningChoice === 'retain_planning'}
                  onChange={() => setArchivePlanningChoice('retain_planning')}
                  data-testid="archive-project-retain-radio"
                  className="mt-1"
                />
                <span className="text-[0.875rem]">
                  {UK_STRINGS.plansView.archiveRetainPlanningOption}
                </span>
              </label>
              <label
                className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <input
                  type="radio"
                  name="archivePlanningChoice"
                  checked={archivePlanningChoice === 'remove_planning'}
                  onChange={() => setArchivePlanningChoice('remove_planning')}
                  data-testid="archive-project-remove-radio"
                  className="mt-1"
                />
                <span className="text-[0.875rem]">
                  {UK_STRINGS.plansView.archiveRemovePlanningOption}
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setArchivingProject(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmArchiveProject()}
                data-testid="confirm-archive-project-button"
              >
                {UK_STRINGS.plansView.archiveProjectConfirmButton}
              </Button>
            </div>
          </div>
        )}
      </ModalSheet>

      {/* MODAL 7: Delete Project Modal */}
      <ModalSheet
        isOpen={Boolean(deletingProject)}
        title={UK_STRINGS.plansView.deleteProjectModalTitle}
        onClose={() => setDeletingProject(null)}
      >
        {deletingProject && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <input
                  type="radio"
                  name="projectDeleteTaskMode"
                  checked={projectDeleteTaskMode === 'rehome_to_folder'}
                  onChange={() => setProjectDeleteTaskMode('rehome_to_folder')}
                  className="mt-1"
                />
                <span className="text-[0.875rem]">
                  {UK_STRINGS.plansView.deleteProjectRehomeOption}
                </span>
              </label>
              <label
                className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <input
                  type="radio"
                  name="projectDeleteTaskMode"
                  checked={projectDeleteTaskMode === 'delete_tasks'}
                  onChange={() => setProjectDeleteTaskMode('delete_tasks')}
                  className="mt-1"
                />
                <span className="text-[0.875rem]">
                  {UK_STRINGS.plansView.deleteProjectDeleteTasksOption}
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeletingProject(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleConfirmDeleteProject()}
                data-testid="confirm-delete-project-button"
              >
                {UK_STRINGS.app.deleteButton}
              </Button>
            </div>
          </div>
        )}
      </ModalSheet>

      {/* MODAL 8: Edit Stage Modal */}
      <ModalSheet
        isOpen={Boolean(editingStage)}
        title={UK_STRINGS.plansView.editStageButton}
        onClose={() => setEditingStage(null)}
      >
        {editingStage && (
          <form onSubmit={handleSaveStageEdit} className="space-y-3.5">
            <InputField
              label={UK_STRINGS.creation.stageForm.titleLabel}
              value={stageEditTitle}
              onChange={(e) => setStageEditTitle(e.target.value)}
              required
            />
            <TextAreaField
              label={UK_STRINGS.creation.stageForm.expectedOutcomeLabel}
              value={stageEditOutcome}
              onChange={(e) => setStageEditOutcome(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditingStage(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button type="submit" variant="primary">
                {UK_STRINGS.app.saveButton}
              </Button>
            </div>
          </form>
        )}
      </ModalSheet>

      {/* MODAL 9: Task Detail & Editor Sheet (with Ownership Move & Checklist Promotion) */}
      <ModalSheet
        isOpen={Boolean(editingTask)}
        title={UK_STRINGS.plansView.editTaskTitle}
        onClose={() => setEditingTaskId(null)}
      >
        {editingTask && (
          <div className="space-y-5" data-testid="task-detail-sheet">
            {/* Lifecycle State Controls */}
            <div
              className="p-3 rounded-xl flex flex-wrap items-center justify-between gap-2"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <div className="text-[0.8125rem] font-medium">
                Стан:{' '}
                <strong>
                  {editingTask.state === 'open'
                    ? UK_STRINGS.plansView.taskStateOpen
                    : editingTask.state === 'completed'
                    ? UK_STRINGS.plansView.taskStateCompleted
                    : UK_STRINGS.plansView.taskStateCanceled}
                </strong>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {editingTask.state !== 'completed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleTaskLifecycleFromSheet('completed')}
                    data-testid="sheet-complete-task-button"
                  >
                    {UK_STRINGS.plansView.completeTaskButton}
                  </Button>
                )}
                {editingTask.state !== 'canceled' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleTaskLifecycleFromSheet('canceled')}
                    data-testid="sheet-cancel-task-button"
                  >
                    {UK_STRINGS.plansView.cancelTaskButton}
                  </Button>
                )}
                {editingTask.state !== 'open' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleTaskLifecycleFromSheet('open')}
                    data-testid="sheet-reopen-task-button"
                  >
                    {UK_STRINGS.plansView.reopenTaskButton}
                  </Button>
                )}
                {lastUndoToken &&
                  lastUndoToken.taskId === editingTask.id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleUndoTaskLifecycle()}
                      data-testid="sheet-undo-task-lifecycle-button"
                    >
                      {UK_STRINGS.scheduling.undoActionButton}
                    </Button>
                  )}
              </div>
            </div>

            {/* Stage 5: Task Reservations & Sessions in Schedule (5.4 / C07) */}
            <div
              className="p-3.5 rounded-2xl space-y-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
              data-testid="task-reservations-section"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[0.875rem] font-semibold">
                  {UK_STRINGS.scheduling.reservationsHeading}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {editingTask.planningState !== 'unplanned' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleRemoveCurrentPlanningFromSheet()}
                      data-testid="sheet-remove-current-planning-button"
                    >
                      {UK_STRINGS.scheduling.removeCurrentPlanningButton}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddSessionForm((v) => !v);
                      setRescheduleResId(null);
                      setNewSessionOverlapConfirmed(false);
                    }}
                    data-testid="sheet-toggle-add-session-button"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{UK_STRINGS.scheduling.addSessionButton}</span>
                  </Button>
                </div>
              </div>

              {(() => {
                const taskReservations = reservations.filter(
                  (r) => r.taskId === editingTask.id
                );
                if (taskReservations.length === 0) {
                  return (
                    <p
                      className="text-[0.8125rem] m-0"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {UK_STRINGS.scheduling.noReservationsNote}
                    </p>
                  );
                }
                return (
                  <ul className="space-y-2 m-0 p-0 list-none">
                    {taskReservations.map((res) => {
                      const durationMin = computeElapsedDurationMinutes(
                        res.interval.startInstant,
                        res.interval.endInstant
                      );
                      const isReschedulingThis = rescheduleResId === res.id;
                      return (
                        <li
                          key={res.id}
                          data-testid={`task-reservation-row-${res.id}`}
                          className="p-2.5 rounded-xl space-y-2"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="text-[0.8125rem] font-semibold">
                                {formatDate(res.interval.originStartLocalDate)}{' '}
                                {res.interval.originStartLocalTime} –{' '}
                                {formatDate(res.interval.originEndLocalDate)}{' '}
                                {res.interval.originEndLocalTime} ({formatDuration(durationMin)})
                              </div>
                              <div
                                className="text-[0.6875rem] font-medium"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {res.state === 'active'
                                  ? UK_STRINGS.scheduling.sessionActiveBadge
                                  : res.state === 'released'
                                  ? UK_STRINGS.scheduling.sessionReleasedBadge
                                  : UK_STRINGS.scheduling.sessionCanceledBadge}
                              </div>
                            </div>

                            {res.state === 'active' && (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    handleStartRescheduleReservation(res)
                                  }
                                  data-testid={`reschedule-reservation-button-${res.id}`}
                                >
                                  {UK_STRINGS.scheduling.rescheduleSessionButton}
                                </Button>
                                <Button
                                  variant="subtle"
                                  size="sm"
                                  onClick={() =>
                                    void handleCancelSingleReservation(res)
                                  }
                                  data-testid={`cancel-reservation-button-${res.id}`}
                                >
                                  {UK_STRINGS.scheduling.cancelSessionButton}
                                </Button>
                              </div>
                            )}
                          </div>

                          {res.releaseMetadata && (
                            <div
                              className="p-2 rounded-lg text-[0.6875rem] space-y-0.5"
                              style={{
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-secondary)',
                              }}
                              data-testid={`reservation-release-history-${res.id}`}
                            >
                              <div>
                                Початковий план до вивільнення:{' '}
                                {res.releaseMetadata.originalStartInstant
                                  .slice(0, 16)
                                  .replace('T', ' ')}{' '}
                                –{' '}
                                {res.releaseMetadata.originalEndInstant
                                  .slice(0, 16)
                                  .replace('T', ' ')}
                              </div>
                              <div>
                                {UK_STRINGS.scheduling.historyDisclaimer}
                              </div>
                            </div>
                          )}

                          {isReschedulingThis && (
                            <div
                              className="p-2.5 rounded-xl space-y-2.5"
                              style={{ backgroundColor: 'var(--bg-elevated)' }}
                              data-testid={`reschedule-reservation-form-${res.id}`}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <DateField
                                  label={
                                    UK_STRINGS.creation.eventForm.startDateLabel
                                  }
                                  value={rescheduleStartDate}
                                  onChange={(e) => {
                                    setRescheduleStartDate(e.target.value);
                                    setRescheduleOverlapConfirmed(false);
                                  }}
                                  data-testid="reschedule-start-date-input"
                                />
                                <TimeField
                                  label={
                                    UK_STRINGS.creation.eventForm.startTimeLabel
                                  }
                                  value={rescheduleStartTime}
                                  onChange={(e) => {
                                    setRescheduleStartTime(e.target.value);
                                    setRescheduleOverlapConfirmed(false);
                                  }}
                                  data-testid="reschedule-start-time-input"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <DateField
                                  label={
                                    UK_STRINGS.creation.eventForm.endDateLabel
                                  }
                                  value={rescheduleEndDate}
                                  onChange={(e) => {
                                    setRescheduleEndDate(e.target.value);
                                    setRescheduleOverlapConfirmed(false);
                                  }}
                                  data-testid="reschedule-end-date-input"
                                />
                                <TimeField
                                  label={
                                    UK_STRINGS.creation.eventForm.endTimeLabel
                                  }
                                  value={rescheduleEndTime}
                                  onChange={(e) => {
                                    setRescheduleEndTime(e.target.value);
                                    setRescheduleOverlapConfirmed(false);
                                  }}
                                  data-testid="reschedule-end-time-input"
                                />
                              </div>
                              <Row
                                title={
                                  UK_STRINGS.creation.eventForm
                                    .confirmConsciousOverlapLabel
                                }
                                trailing={
                                  <Toggle
                                    label={
                                      UK_STRINGS.creation.eventForm
                                        .confirmConsciousOverlapLabel
                                    }
                                    checked={rescheduleOverlapConfirmed}
                                    onChange={setRescheduleOverlapConfirmed}
                                    data-testid="reschedule-overlap-confirm-checkbox"
                                  />
                                }
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setRescheduleResId(null)}
                                >
                                  {UK_STRINGS.app.cancelButton}
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() =>
                                    void handleSaveRescheduleReservation(res)
                                  }
                                  data-testid="save-reschedule-reservation-button"
                                >
                                  {UK_STRINGS.app.saveButton}
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}

              {showAddSessionForm && (
                <div
                  className="p-3 rounded-xl space-y-2.5"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                  data-testid="add-reservation-session-form"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <DateField
                      label={UK_STRINGS.creation.eventForm.startDateLabel}
                      value={newSessionStartDate}
                      onChange={(e) => {
                        setNewSessionStartDate(e.target.value);
                        setNewSessionEndDate(e.target.value);
                        setNewSessionOverlapConfirmed(false);
                      }}
                      data-testid="new-session-start-date-input"
                    />
                    <TimeField
                      label={UK_STRINGS.creation.eventForm.startTimeLabel}
                      value={newSessionStartTime}
                      onChange={(e) => {
                        setNewSessionStartTime(e.target.value);
                        setNewSessionOverlapConfirmed(false);
                      }}
                      data-testid="new-session-start-time-input"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <DateField
                      label={UK_STRINGS.creation.eventForm.endDateLabel}
                      value={newSessionEndDate}
                      onChange={(e) => {
                        setNewSessionEndDate(e.target.value);
                        setNewSessionOverlapConfirmed(false);
                      }}
                      data-testid="new-session-end-date-input"
                    />
                    <TimeField
                      label={UK_STRINGS.creation.eventForm.endTimeLabel}
                      value={newSessionEndTime}
                      onChange={(e) => {
                        setNewSessionEndTime(e.target.value);
                        setNewSessionOverlapConfirmed(false);
                      }}
                      data-testid="new-session-end-time-input"
                    />
                  </div>
                  {(() => {
                    const sug = suggestEndDateForClockRange(
                      newSessionStartDate,
                      newSessionStartTime,
                      newSessionEndTime
                    );
                    if (
                      sug.isOvernightSuggestion &&
                      newSessionEndDate === newSessionStartDate
                    ) {
                      return (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setNewSessionEndDate(sug.suggestedEndLocalDate)
                          }
                        >
                          {UK_STRINGS.creation.eventForm.applyNextDaySuggestionButton} (
                          {formatDate(sug.suggestedEndLocalDate)})
                        </Button>
                      );
                    }
                    return null;
                  })()}
                  <Row
                    title={
                      UK_STRINGS.creation.eventForm
                        .confirmConsciousOverlapLabel
                    }
                    trailing={
                      <Toggle
                        label={
                          UK_STRINGS.creation.eventForm
                            .confirmConsciousOverlapLabel
                        }
                        checked={newSessionOverlapConfirmed}
                        onChange={setNewSessionOverlapConfirmed}
                        data-testid="new-session-overlap-confirm-checkbox"
                      />
                    }
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddSessionForm(false)}
                    >
                      {UK_STRINGS.app.cancelButton}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleAddReservationSession()}
                      data-testid="confirm-add-session-button"
                    >
                      {UK_STRINGS.scheduling.addSessionButton}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* One-level Checklist with explicit promotion to ordinary task (4.3) */}
            <div
              className="p-3.5 rounded-2xl space-y-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
              data-testid="task-checklist-section"
            >
              <div className="text-[0.875rem] font-semibold">
                {UK_STRINGS.plansView.checklistHeading}
              </div>

              {editingTask.checklist.length === 0 ? (
                <p
                  className="text-[0.8125rem] m-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {UK_STRINGS.plansView.checklistEmpty}
                </p>
              ) : (
                <ul className="space-y-2 m-0 p-0 list-none">
                  {[...editingTask.checklist]
                    .sort((a, b) => a.order - b.order)
                    .map((item, idx, arr) => (
                      <li
                        key={item.id}
                        data-testid={`checklist-item-${item.title}`}
                        className="p-2.5 rounded-xl flex items-center justify-between gap-2"
                        style={{ backgroundColor: 'var(--bg-surface)' }}
                      >
                        <button
                          type="button"
                          onClick={() => void handleToggleChecklistItem(item.id)}
                          className="flex items-center gap-2.5 text-left flex-1 cursor-pointer"
                        >
                          {item.completed ? (
                            <CheckCircle2
                              className="w-4 h-4 shrink-0"
                              style={{ color: 'var(--color-dayoff)' }}
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle
                              className="w-4 h-4 shrink-0"
                              style={{ color: 'var(--text-secondary)' }}
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={`text-[0.875rem] ${
                              item.completed ? 'line-through opacity-70' : ''
                            }`}
                          >
                            {item.title}
                          </span>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="subtle"
                            size="icon"
                            disabled={idx === 0}
                            aria-label={`${UK_STRINGS.plansView.moveUpAria}: ${item.title}`}
                            onClick={() =>
                              void handleReorderChecklistItem(item.id, 'up')
                            }
                          >
                            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="subtle"
                            size="icon"
                            disabled={idx === arr.length - 1}
                            aria-label={`${UK_STRINGS.plansView.moveDownAria}: ${item.title}`}
                            onClick={() =>
                              void handleReorderChecklistItem(item.id, 'down')
                            }
                          >
                            <ArrowDown
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`${UK_STRINGS.plansView.promoteChecklistToTaskAria}: ${item.title}`}
                            data-testid={`promote-checklist-item-${item.title}`}
                            onClick={() =>
                              void handlePromoteChecklistItem(item.id)
                            }
                          >
                            <ArrowUpRight
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                            <span>
                              {UK_STRINGS.plansView.promoteChecklistButton}
                            </span>
                          </Button>
                          <Button
                            variant="subtle"
                            size="icon"
                            aria-label={`${UK_STRINGS.app.deleteButton}: ${item.title}`}
                            onClick={() =>
                              void handleDeleteChecklistItem(item.id)
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder={UK_STRINGS.plansView.addChecklistPlaceholder}
                  data-testid="new-checklist-item-input"
                  className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-[1rem]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleAddChecklistItem()}
                  data-testid="add-checklist-item-button"
                >
                  {UK_STRINGS.plansView.addChecklistButton}
                </Button>
              </div>
            </div>

            {/* Main Task Form */}
            <form onSubmit={handleSaveTaskDetails} className="space-y-3.5">
              <InputField
                label={UK_STRINGS.creation.taskForm.titleLabel}
                value={taskEditTitle}
                onChange={(e) => setTaskEditTitle(e.target.value)}
                data-testid="edit-task-title-input"
                required
              />
              <TextAreaField
                label={UK_STRINGS.creation.taskForm.descriptionLabel}
                value={taskEditDescription}
                onChange={(e) => setTaskEditDescription(e.target.value)}
              />

              <div className="space-y-1.5">
                <span className="text-[0.9375rem] font-medium block">
                  {UK_STRINGS.creation.taskForm.priorityLabel}
                </span>
                <SegmentedControl<TaskPriority>
                  ariaLabel={UK_STRINGS.creation.taskForm.priorityLabel}
                  value={taskEditPriority}
                  onChange={setTaskEditPriority}
                  options={[
                    {
                      value: 'low',
                      label: UK_STRINGS.creation.taskForm.priorityLow,
                    },
                    {
                      value: 'normal',
                      label: UK_STRINGS.creation.taskForm.priorityNormal,
                    },
                    {
                      value: 'high',
                      label: UK_STRINGS.creation.taskForm.priorityHigh,
                    },
                  ]}
                />
              </div>

              {/* Ownership relinking (Standalone Folder OR Project + Stage) */}
              <div
                className="p-3.5 rounded-2xl space-y-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <SelectField
                  label={UK_STRINGS.plansView.ownershipModeLabel}
                  value={taskEditOwnershipMode}
                  onChange={(e) => {
                    const mode = e.target.value as
                      | 'standalone'
                      | 'folder'
                      | 'goal'
                      | 'project';
                    setTaskEditOwnershipMode(mode);
                    if (
                      mode === 'project' &&
                      !taskEditProjectId &&
                      projects.length > 0
                    ) {
                      setTaskEditProjectId(projects[0].id);
                      setTaskEditStageId(null);
                    }
                    if (
                      mode === 'goal' &&
                      !taskEditGoalId &&
                      goals.length > 0
                    ) {
                      setTaskEditGoalId(goals[0].id);
                    }
                    if (
                      mode === 'folder' &&
                      !taskEditFolderId &&
                      folders.length > 0
                    ) {
                      setTaskEditFolderId(folders[0].id);
                    }
                  }}
                  options={[
                    {
                      value: 'standalone',
                      label: UK_STRINGS.plansView.ownershipStandalone,
                    },
                    {
                      value: 'folder',
                      label: UK_STRINGS.plansView.ownershipFolder,
                    },
                    {
                      value: 'goal',
                      label: UK_STRINGS.plansView.ownershipGoal,
                    },
                    {
                      value: 'project',
                      label: UK_STRINGS.plansView.ownershipProject,
                    },
                  ]}
                  data-testid="edit-task-ownership-mode-select"
                />

                {taskEditOwnershipMode === 'folder' && (
                  <SelectField
                    label={UK_STRINGS.creation.fieldFolderContext}
                    value={taskEditFolderId ?? ''}
                    onChange={(e) =>
                      setTaskEditFolderId(
                        e.target.value ? e.target.value : null
                      )
                    }
                    options={folders.map((f) => ({
                      value: f.id,
                      label: f.name,
                    }))}
                    data-testid="edit-task-folder-select"
                  />
                )}

                {taskEditOwnershipMode === 'goal' && (
                  <SelectField
                    label="Ціль"
                    value={taskEditGoalId ?? ''}
                    onChange={(e) =>
                      setTaskEditGoalId(
                        e.target.value ? e.target.value : null
                      )
                    }
                    options={goals.map((g) => ({
                      value: g.id,
                      label: g.title,
                    }))}
                    data-testid="edit-task-goal-select"
                  />
                )}

                {taskEditOwnershipMode === 'project' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SelectField
                      label={UK_STRINGS.creation.fieldProjectContext}
                      value={taskEditProjectId ?? ''}
                      onChange={(e) => {
                        setTaskEditProjectId(
                          e.target.value ? e.target.value : null
                        );
                        // Moving between projects clears old stage (C06)
                        setTaskEditStageId(null);
                      }}
                      options={projects.map((p) => ({
                        value: p.id,
                        label: p.title,
                      }))}
                      data-testid="edit-task-project-select"
                    />
                    <SelectField
                      label={UK_STRINGS.creation.fieldStageContext}
                      value={taskEditStageId ?? ''}
                      onChange={(e) =>
                        setTaskEditStageId(
                          e.target.value ? e.target.value : null
                        )
                      }
                      options={[
                        {
                          value: '',
                          label: UK_STRINGS.creation.noStageOption,
                        },
                        ...stages
                          .filter((s) => s.projectId === taskEditProjectId)
                          .sort((a, b) => a.order - b.order)
                          .map((s) => ({ value: s.id, label: s.title })),
                      ]}
                      data-testid="edit-task-stage-select"
                    />
                  </div>
                )}
              </div>

              {/* Date-only intention & Estimate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[0.9375rem] font-medium block">
                    {UK_STRINGS.creation.fieldTargetDate}
                  </span>
                  {taskEditPlannedDate === null ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => setTaskEditPlannedDate(actualTodayDate)}
                      data-testid="edit-task-set-planned-date-button"
                    >
                      Без дати — обрати дату
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <DateField
                        label={UK_STRINGS.creation.fieldTargetDate}
                        value={taskEditPlannedDate}
                        onChange={(e) =>
                          setTaskEditPlannedDate(e.target.value ? e.target.value : null)
                        }
                        data-testid="edit-task-planned-date-input"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTaskEditPlannedDate(null)}
                        data-testid="edit-task-clear-planned-date-button"
                      >
                        {UK_STRINGS.creation.clearDateIntention}
                      </Button>
                    </div>
                  )}
                </div>

                <InputField
                  label={UK_STRINGS.creation.taskForm.estimateLabel}
                  placeholder={UK_STRINGS.creation.taskForm.estimatePlaceholder}
                  type="number"
                  min={1}
                  value={taskEditEstimate}
                  onChange={(e) => setTaskEditEstimate(e.target.value)}
                  data-testid="edit-task-estimate-input"
                />
              </div>

              {/* Deadline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField
                  label={UK_STRINGS.creation.taskForm.deadlineTypeLabel}
                  value={taskEditDeadlineKind}
                  onChange={(e) =>
                    setTaskEditDeadlineKind(
                      e.target.value as 'none' | 'date_only' | 'exact_instant'
                    )
                  }
                  options={[
                    {
                      value: 'none',
                      label: UK_STRINGS.creation.taskForm.deadlineNone,
                    },
                    {
                      value: 'date_only',
                      label: UK_STRINGS.creation.taskForm.deadlineDateOnly,
                    },
                    {
                      value: 'exact_instant',
                      label: UK_STRINGS.creation.taskForm.deadlineExactInstant,
                    },
                  ]}
                  data-testid="edit-task-deadline-kind-select"
                />

                {taskEditDeadlineKind === 'date_only' && (
                  <DateField
                    label={UK_STRINGS.creation.taskForm.deadlineDateLabel}
                    value={taskEditDeadlineDate}
                    onChange={(e) => setTaskEditDeadlineDate(e.target.value)}
                    data-testid="edit-task-deadline-date-input"
                  />
                )}

                {taskEditDeadlineKind === 'exact_instant' && (
                  <InputField
                    label={UK_STRINGS.creation.taskForm.deadlineInstantLabel}
                    type="datetime-local"
                    lang="uk"
                    value={taskEditDeadlineInstant}
                    onChange={(e) => setTaskEditDeadlineInstant(e.target.value)}
                    data-testid="edit-task-deadline-instant-input"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleDeleteTaskFromSheet()}
                  data-testid="sheet-delete-task-button"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>{UK_STRINGS.plansView.deleteTaskButton}</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setEditingTaskId(null)}
                  >
                    {UK_STRINGS.app.cancelButton}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    data-testid="sheet-save-task-button"
                  >
                    {UK_STRINGS.app.saveButton}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </ModalSheet>

      {/* MODAL 10: Goal Edit Modal (Stage M1 / M3) */}
      <ModalSheet
        isOpen={Boolean(editingGoal)}
        title={UK_STRINGS.plansView.editGoalModalTitle}
        onClose={() => setEditingGoal(null)}
      >
        {editingGoal && (
          <form
            onSubmit={handleSaveGoalEdit}
            className="space-y-4"
            data-testid="edit-goal-form"
          >
            {modalError && (
              <div
                className="p-3 rounded-xl text-[0.875rem]"
                style={{
                  backgroundColor: 'var(--color-brand-tint)',
                  color: 'var(--color-brand-text)',
                }}
              >
                {modalError}
              </div>
            )}

            <InputField
              label={UK_STRINGS.creation.goalForm.titleLabel}
              placeholder={UK_STRINGS.creation.goalForm.titlePlaceholder}
              value={goalEditTitle}
              onChange={(e) => setGoalEditTitle(e.target.value)}
              required
              data-testid="edit-goal-title-input"
            />

            <SelectField
              label={UK_STRINGS.creation.goalForm.stateLabel}
              value={goalEditState}
              onChange={(e) => setGoalEditState(e.target.value as GoalState)}
              options={[
                {
                  value: 'idea',
                  label: UK_STRINGS.creation.goalForm.stateIdea,
                },
                {
                  value: 'active',
                  label: UK_STRINGS.creation.goalForm.stateActive,
                },
                {
                  value: 'paused',
                  label: UK_STRINGS.creation.goalForm.statePaused,
                },
                {
                  value: 'completed',
                  label: UK_STRINGS.creation.goalForm.stateCompleted,
                },
              ]}
              data-testid="edit-goal-state-select"
            />

            <SelectField
              label={UK_STRINGS.creation.goalForm.folderLabel}
              value={goalEditFolderId ?? ''}
              onChange={(e) =>
                setGoalEditFolderId(e.target.value ? e.target.value : null)
              }
              options={[
                { value: '', label: UK_STRINGS.creation.rootFolderOption },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
              data-testid="edit-goal-folder-select"
            />

            <InputField
              label={UK_STRINGS.creation.goalForm.purposeLabel}
              placeholder={UK_STRINGS.creation.goalForm.purposePlaceholder}
              value={goalEditPurpose}
              onChange={(e) => setGoalEditPurpose(e.target.value)}
              data-testid="edit-goal-purpose-input"
            />

            <InputField
              label={UK_STRINGS.creation.goalForm.criteriaLabel}
              placeholder={UK_STRINGS.creation.goalForm.criteriaPlaceholder}
              value={goalEditCriteria}
              onChange={(e) => setGoalEditCriteria(e.target.value)}
              data-testid="edit-goal-criteria-input"
            />

            <InputField
              label={UK_STRINGS.creation.goalForm.implementationIntentionLabel}
              placeholder={
                UK_STRINGS.creation.goalForm.implementationIntentionPlaceholder
              }
              value={goalEditIntention}
              onChange={(e) => setGoalEditIntention(e.target.value)}
              data-testid="edit-goal-intention-input"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateField
                label={UK_STRINGS.creation.goalForm.targetDateLabel}
                value={goalEditTargetDate ?? ''}
                onChange={(e) => setGoalEditTargetDate(e.target.value ? e.target.value : null)}
                data-testid="edit-goal-target-date-input"
              />
              <InputField
                label={UK_STRINGS.creation.goalForm.targetPeriodLabel}
                placeholder={UK_STRINGS.creation.goalForm.targetPeriodLabel}
                value={goalEditTargetPeriod}
                onChange={(e) => setGoalEditTargetPeriod(e.target.value)}
                data-testid="edit-goal-target-period-input"
              />
            </div>

            <SelectField
              label={UK_STRINGS.creation.goalForm.nextActionLabel}
              value={goalEditNextActionTaskId ?? ''}
              onChange={(e) =>
                setGoalEditNextActionTaskId(
                  e.target.value ? e.target.value : null
                )
              }
              options={[
                {
                  value: '',
                  label: UK_STRINGS.creation.goalForm.noNextActionOption,
                },
                ...tasks
                  .filter((t) => t.state === 'open')
                  .map((t) => ({ value: t.id, label: t.title })),
              ]}
              data-testid="edit-goal-next-action-select"
            />

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button
                variant="secondary"
                onClick={() => setEditingGoal(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="edit-goal-submit-button"
              >
                {UK_STRINGS.app.saveButton}
              </Button>
            </div>
          </form>
        )}
      </ModalSheet>

      {/* MODAL 11: Goal Delete Modal (Stage M1 / M3) */}
      <ModalSheet
        isOpen={Boolean(deletingGoal)}
        title={UK_STRINGS.plansView.deleteGoalModalTitle}
        onClose={() => setDeletingGoal(null)}
      >
        {deletingGoal && (
          <div className="space-y-4" data-testid="delete-goal-modal">
            {modalError && (
              <div
                className="p-3 rounded-xl text-[0.875rem]"
                style={{
                  backgroundColor: 'var(--color-brand-tint)',
                  color: 'var(--color-brand-text)',
                }}
              >
                {modalError}
              </div>
            )}

            <p
              className="text-[0.875rem] m-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              Ви збираєтеся видалити ціль{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {deletingGoal.title}
              </strong>
              . Оберіть дію для пов&apos;язаних справ та проєктів:
            </p>

            <div className="space-y-2">
              <label
                className="p-3 rounded-xl flex items-start gap-3 cursor-pointer"
                style={{
                  backgroundColor:
                    goalDeleteMode === 'unlink_children'
                      ? 'var(--bg-elevated)'
                      : 'var(--bg-surface)',
                  border:
                    goalDeleteMode === 'unlink_children'
                      ? '1.5px solid var(--color-brand)'
                      : '1px solid var(--border-subtle)',
                }}
              >
                <input
                  type="radio"
                  name="goalDeleteMode"
                  value="unlink_children"
                  checked={goalDeleteMode === 'unlink_children'}
                  onChange={() => setGoalDeleteMode('unlink_children')}
                  className="mt-0.5"
                  data-testid="goal-delete-unlink-radio"
                />
                <div>
                  <div className="text-[0.875rem] font-medium">
                    {UK_STRINGS.plansView.goalDeleteUnlinkChildren}
                  </div>
                </div>
              </label>

              <label
                className="p-3 rounded-xl flex items-start gap-3 cursor-pointer"
                style={{
                  backgroundColor:
                    goalDeleteMode === 'delete_direct_tasks'
                      ? 'var(--bg-elevated)'
                      : 'var(--bg-surface)',
                  border:
                    goalDeleteMode === 'delete_direct_tasks'
                      ? '1.5px solid var(--color-brand)'
                      : '1px solid var(--border-subtle)',
                }}
              >
                <input
                  type="radio"
                  name="goalDeleteMode"
                  value="delete_direct_tasks"
                  checked={goalDeleteMode === 'delete_direct_tasks'}
                  onChange={() => setGoalDeleteMode('delete_direct_tasks')}
                  className="mt-0.5"
                  data-testid="goal-delete-tasks-radio"
                />
                <div>
                  <div className="text-[0.875rem] font-medium">
                    {UK_STRINGS.plansView.goalDeleteDirectTasks}
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button
                variant="secondary"
                onClick={() => setDeletingGoal(null)}
              >
                {UK_STRINGS.app.cancelButton}
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleConfirmDeleteGoal()}
                data-testid="confirm-delete-goal-button"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>{UK_STRINGS.app.deleteButton}</span>
              </Button>
            </div>
          </div>
        )}
      </ModalSheet>
      </div>
    </div>
  );
};
