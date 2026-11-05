import { formatDuration, formatDate } from '../../lib/format';
import { PillMenu as SelectField } from '../ui/design';
import { WishExtrasFields, emptyWishExtras, resolveWishExtras } from '../wishlist/WishExtrasFields';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  FolderPlus,
  HeartPulse,
  Calendar as CalendarIcon,
  Folder as FolderIcon,
  Briefcase,
  Layers,
  Clock,
  AlertTriangle,
  Sun,
  Repeat,
  Sparkles,
  Gift,
  Tag,
  Target,
} from 'lucide-react';
import { PrimaryDestinationId, UK_STRINGS } from '../../i18n/uk';
import {
  DestinationContextMap,
  EditableCreationContext,
  ImplementedCreationActionKind,
  getContextualCreationActions,
  CREATION_ACTION_REGISTRY,
} from '../../state/shellStore';
import {
  CalendarEvent,
  CalendarEventType,
  EventPaletteColor,
  Folder,
  Goal,
  GoalState,
  HabitFrequencyRule,
  HabitTargetSpec,
  IanaTimeZone,
  InspirationItemKind,
  LifeAreaQuestion,
  Project,
  ProjectStage,
  ShiftTemplate,
  SupportedCurrencyCode,
  Task,
  TaskDeadline,
  TaskOwnership,
  TaskPlanningState,
  TaskPriority,
  TaskReservation,
  WishlistCategory,
  WishlistTimingGroup,
} from '../../domain/types';
import {
  addDaysToLocalDate,
  buildZonedIntervalFromLocalInput,
  resolveAllDayEventOccupancyInterval,
  suggestEndDateForClockRange,
} from '../../domain/temporal';
import { detectScheduleConflicts } from '../../domain/scheduling';
import { ISO_WEEKDAYS_UK } from '../../domain/habits';
import {
  ENERGY_SCALE_LABELS_UK,
  MOOD_SCALE_LABELS_UK,
  PERSONAL_STATE_QUESTIONS_UK,
  STRESS_SCALE_LABELS_UK,
  buildInspirationItemRecord,
  normalizeSimpleTags,
  validateAndPrepareRasterMedia,
} from '../../domain/personalSpace';
import {
  SUPPORTED_CURRENCIES,
  WISHLIST_TIMING_LABELS_UK,
  buildWishItemRecord,
} from '../../domain/wishlist';
import { PlanuiRepositories } from '../../storage/repositories';
import {
  Button,
  InputField,
  ModalSheet,
  SegmentedControl,
  TextAreaField,
  FeedbackBanner,
} from '../ui/primitives';

export interface SharedEditorHostProps {
  isOpen: boolean;
  globalQuickAdd?: boolean;
  activeDestination: PrimaryDestinationId;
  contexts?: DestinationContextMap;
  initialContext: EditableCreationContext;
  initialActionKind?: ImplementedCreationActionKind;
  activeZone?: IanaTimeZone;
  folders: Folder[];
  goals?: Goal[];
  projects?: Project[];
  stages?: ProjectStage[];
  tasks?: Task[];
  reservations?: TaskReservation[];
  events?: CalendarEvent[];
  shiftTemplates?: readonly ShiftTemplate[];
  lifeAreaQuestions?: readonly LifeAreaQuestion[];
  wishlistCategories?: readonly WishlistCategory[];
  preferredWishlistCurrency?: SupportedCurrencyCode | null;
  enabledModules?: {
    habitsEnabled?: boolean;
    stateCheckInsEnabled?: boolean;
    desiredLifeEnabled?: boolean;
    wishlistEnabled?: boolean;
  };
  repositories: PlanuiRepositories;
  onClose: () => void;
  onEntityCreated: (feedbackMessage: string) => void;
}

export const SharedEditorHost: React.FC<SharedEditorHostProps> = ({
  isOpen,
  globalQuickAdd = false,
  activeDestination,
  contexts,
  initialContext,
  initialActionKind,
  activeZone = 'Europe/Kyiv',
  folders,
  goals = [],
  projects = [],
  stages = [],
  tasks = [],
  reservations = [],
  events = [],
  shiftTemplates = [],
  lifeAreaQuestions = [],
  wishlistCategories = [],
  preferredWishlistCurrency = null,
  enabledModules,
  repositories,
  onClose,
  onEntityCreated,
}) => {
  const quickKinds: ImplementedCreationActionKind[] = ['task', 'shift', 'event', 'goal', 'project', ...(enabledModules?.habitsEnabled !== false ? ['habit' as const] : []), ...(enabledModules?.stateCheckInsEnabled !== false ? ['personal_record' as const] : []), ...(enabledModules?.wishlistEnabled !== false ? ['wish' as const] : [])];
  const availableActions = globalQuickAdd ? quickKinds.map(kind => CREATION_ACTION_REGISTRY.find(action => action.kind === kind)!) : getContextualCreationActions(
    activeDestination,
    contexts,
    enabledModules
  );
  const defaultAction =
    initialActionKind ??
    (availableActions[0]?.kind as ImplementedCreationActionKind) ??
    'task';

  const [selectedAction, setSelectedAction] =
    useState<ImplementedCreationActionKind>(defaultAction);

  // 5.2: Open editors retain their temporal zone context until resolved explicitly
  const [lockedEditorZone, setLockedEditorZone] =
    useState<IanaTimeZone>(activeZone);

  // Editable prefilled context (C04: Prefilled date, folder, project, stage, wishlist category must be visible and editable)
  const [editableContext, setEditableContext] =
    useState<EditableCreationContext>(initialContext);

  // Task fields
  const [quickPanel, setQuickPanel] = useState<string | null>(null);
  const [taskEffort, setTaskEffort] = useState<Task['effort']>(null);
  const [taskLifeArea, setTaskLifeArea] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normal');
  const [taskEstimate, setTaskEstimate] = useState<string>('');
  const [taskDeadlineKind, setTaskDeadlineKind] = useState<
    'none' | 'date_only' | 'exact_instant'
  >('none');
  const [taskDeadlineDate, setTaskDeadlineDate] = useState<string>('');
  const [taskDeadlineInstant, setTaskDeadlineInstant] = useState<string>('');
  const [taskPlanningMode, setTaskPlanningMode] =
    useState<TaskPlanningState>('unplanned');
  const [taskResStartTime, setTaskResStartTime] = useState('10:00');
  const [taskResEndTime, setTaskResEndTime] = useState('11:00');
  const [taskResEndDate, setTaskResEndDate] = useState<string>('');

  // Event & Shift shared fields (5.3 & 8.2)
  const [eventTitle, setEventTitle] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('personal');
  const [eventColor, setEventColor] = useState<EventPaletteColor>('personal');
  const [eventScheduleKind, setEventScheduleKind] = useState<
    'timed' | 'all_day'
  >('timed');
  const [eventStartDate, setEventStartDate] = useState<string>('');
  const [eventStartTime, setEventStartTime] = useState<string>('09:00');
  const [eventEndDate, setEventEndDate] = useState<string>('');
  const [eventEndTime, setEventEndTime] = useState<string>('10:00');
  const [eventIsBlocking, setEventIsBlocking] = useState<boolean>(true);
  const [shiftCode, setShiftCode] = useState<string>('');
  const [selectedShiftTemplateId, setSelectedShiftTemplateId] =
    useState<string>('');
  const [confirmConsciousOverlap, setConfirmConsciousOverlap] =
    useState<boolean>(false);

  // Day-off annotation fields (8.1 / 8.3)
  const [dayOffDate, setDayOffDate] = useState<string>('');
  const [dayOffCode, setDayOffCode] = useState<string>('В');
  const [dayOffNote, setDayOffNote] = useState<string>('');

  // Goal fields (Stage M1 / M3)
  const [goalTitle, setGoalTitle] = useState('');
  const [goalPurpose, setGoalPurpose] = useState('');
  const [goalCriteria, setGoalCriteria] = useState('');
  const [goalIntention, setGoalIntention] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState<string | null>(null);
  const [goalTargetPeriod, setGoalTargetPeriod] = useState<string>('');
  const [goalState, setGoalState] = useState<GoalState>('active');
  const [goalFolderId, setGoalFolderId] = useState<string>('');
  const [goalLifeAreaId, setGoalLifeAreaId] = useState<string>('');
  const [goalNextActionTaskId, setGoalNextActionTaskId] = useState<string>('');

  // Project fields
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDesiredOutcome, setProjectDesiredOutcome] = useState('');
  const [projectCriteria, setProjectCriteria] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectTargetDate, setProjectTargetDate] = useState<string | null>(
    null
  );
  const [projectCollaborators, setProjectCollaborators] = useState('');
  const [projectGoalId, setProjectGoalId] = useState<string>('');

  // Stage fields
  const [stageTitle, setStageTitle] = useState('');
  const [stageExpectedOutcome, setStageExpectedOutcome] = useState('');
  const [stageTargetDate, setStageTargetDate] = useState<string | null>(null);

  // Folder fields
  const [folderName, setFolderName] = useState('');

  // Personal record fields (10.2)
  const [recordSleep, setRecordSleep] = useState('');
  const [recordSleepQuality, setRecordSleepQuality] = useState('');
  const [recordText, setRecordText] = useState('');
  const [recordMood, setRecordMood] = useState<string>('');
  const [recordEnergy, setRecordEnergy] = useState<string>('');
  const [recordStress, setRecordStress] = useState<string>('');
  const [recordTagsInput, setRecordTagsInput] = useState<string>('');

  // Inspiration fields (10.4)
  const [inspirationKind, setInspirationKind] =
    useState<InspirationItemKind>('text');
  const [inspirationTitle, setInspirationTitle] = useState('');
  const [inspirationTextContent, setInspirationTextContent] = useState('');
  const [inspirationSafeUrl, setInspirationSafeUrl] = useState('');
  const [inspirationIsFavorite, setInspirationIsFavorite] = useState(false);
  const [inspirationImageFile, setInspirationImageFile] = useState<{
    bytes: Uint8Array;
    mimeType: string;
    fileName: string;
  } | null>(null);

  // Wish & Wishlist Category fields (10.5 - 10.7)
  const [wishExtras,setWishExtras] = useState(emptyWishExtras);
  const [wishTitle, setWishTitle] = useState('');
  const [wishNote, setWishNote] = useState('');
  const [wishTiming, setWishTiming] = useState<WishlistTimingGroup>('later');
  const [wishPriceInput, setWishPriceInput] = useState('');
  const [wishCurrencyInput, setWishCurrencyInput] = useState<
    SupportedCurrencyCode | ''
  >('');
  const [showWishDetails, setShowWishDetails] = useState(false);
  const [wishlistCategoryName, setWishlistCategoryName] = useState('');

  // Habit fields (Stage 9: 9.1 / 9.3 / 9.4)
  const [habitMinimum, setHabitMinimum] = useState('');
  const [habitCue, setHabitCue] = useState('');
  const [habitReminder, setHabitReminder] = useState('');
  const [habitFolder, setHabitFolder] = useState('');
  const [habitName, setHabitName] = useState('');
  const [habitDescription, setHabitDescription] = useState('');
  const [habitIcon, setHabitIcon] = useState<string>('repeat');
  const [habitLifeAreaId, setHabitLifeAreaId] = useState<string>('');
  const [habitRuleKind, setHabitRuleKind] = useState<
    'daily' | 'days_off' | 'selected_weekdays' | 'weekly_frequency'
  >('daily');
  const [habitWeekdaysIso, setHabitWeekdaysIso] = useState<number[]>([
    1, 3, 5,
  ]);
  const [habitTimesPerWeek, setHabitTimesPerWeek] = useState<string>('3');
  const [habitTargetKind, setHabitTargetKind] = useState<'binary' | 'numeric'>(
    'binary'
  );
  const [habitTargetValue, setHabitTargetValue] = useState<string>('2000');
  const [habitUnitUk, setHabitUnitUk] = useState<string>('мл');
  const [habitEffectiveFromDate, setHabitEffectiveFromDate] =
    useState<string>('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const wasOpenRef = React.useRef(false);

  // Reset form state cleanly ONLY when the sheet transitions from closed to open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      const contextualDefault =
        initialActionKind ??
        (getContextualCreationActions(activeDestination, contexts)[0]
          ?.kind as ImplementedCreationActionKind) ??
        'task';
      setSelectedAction(contextualDefault);
      setLockedEditorZone(activeZone);

      const defaultDate =
        initialContext.targetDate ?? new Date().toISOString().slice(0, 10);

      setEditableContext({
        ...initialContext,
        projectId:
          initialContext.projectId ??
          (contextualDefault === 'stage' && projects.length > 0
            ? projects[0].id
            : null),
      });

      setTaskTitle('');
      setTaskEffort(null);
      setTaskLifeArea('');
      setTaskDescription('');
      setTaskPriority('normal');
      setTaskEstimate('');
      setTaskDeadlineKind('none');
      setTaskDeadlineDate('');
      setTaskDeadlineInstant('');
      setTaskPlanningMode(
        initialContext.targetDate !== null ? 'date_only' : 'unplanned'
      );
      setTaskResStartTime('10:00');
      setTaskResEndTime('11:00');
      setTaskResEndDate(defaultDate);

      const isShift = contextualDefault === 'shift';
      setEventTitle('');
      setEventNote('');
      setEventType(isShift ? 'work_shift' : 'personal');
      setEventColor(isShift ? 'work' : 'personal');
      setEventScheduleKind('timed');
      setEventStartDate(defaultDate);
      setEventStartTime(isShift ? '08:00' : '09:00');
      setEventEndDate(defaultDate);
      setEventEndTime(isShift ? '20:00' : '10:00');
      setEventIsBlocking(true);
      setShiftCode('');
      setSelectedShiftTemplateId('');
      setConfirmConsciousOverlap(false);

      setDayOffDate(defaultDate);
      setDayOffCode('В');
      setDayOffNote('');

      setGoalTitle('');
      setGoalPurpose('');
      setGoalCriteria('');
      setGoalIntention('');
      setGoalTargetDate(null);
      setGoalTargetPeriod('');
      setGoalState('active');
      setGoalFolderId(initialContext.folderId ?? '');
      setGoalLifeAreaId('');
      setGoalNextActionTaskId('');

      setProjectTitle('');
      setProjectDesiredOutcome('');
      setProjectCriteria('');
      setProjectDescription('');
      setProjectTargetDate(null);
      setProjectCollaborators('');
      setProjectGoalId(initialContext.goalId ?? '');

      setStageTitle('');
      setStageExpectedOutcome('');
      setStageTargetDate(null);

      setFolderName('');
      setRecordSleep('');
      setRecordSleepQuality('');
      setRecordText('');
      setRecordMood('');
      setRecordEnergy('');
      setRecordStress('');
      setRecordTagsInput('');

      setInspirationKind('text');
      setInspirationTitle('');
      setInspirationTextContent('');
      setInspirationSafeUrl('');
      setInspirationIsFavorite(false);
      setInspirationImageFile(null);

      setWishExtras(emptyWishExtras(initialContext.projectId??''));
      setWishTitle('');
      setWishNote('');
      setWishTiming('later');
      setWishPriceInput('');
      setWishCurrencyInput(preferredWishlistCurrency ?? '');
      setShowWishDetails(false);
      setWishlistCategoryName('');

      setHabitMinimum(''); setHabitCue(''); setHabitReminder(''); setHabitFolder('');
      setHabitName('');
      setHabitDescription('');
      setHabitIcon('repeat');
      setHabitLifeAreaId('');
      setHabitRuleKind('daily');
      setHabitWeekdaysIso([1, 3, 5]);
      setHabitTimesPerWeek('3');
      setHabitTargetKind('binary');
      setHabitTargetValue('2000');
      setHabitUnitUk('мл');
      setHabitEffectiveFromDate(defaultDate);

      setErrorMessage(null);
      setIsSaving(false);
    } else if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [
    isOpen,
    activeDestination,
    initialContext,
    initialActionKind,
    activeZone,
    contexts,
    projects,
    goals,
    preferredWishlistCurrency,
  ]);

  // Compute whether the user has entered unsaved changes (C17 dirty input protection)
  const isDirty =
    taskEffort !== null || taskLifeArea !== '' ||
    taskTitle.trim().length > 0 ||
    taskDescription.trim().length > 0 ||
    goalTitle.trim().length > 0 ||
    goalPurpose.trim().length > 0 ||
    goalCriteria.trim().length > 0 ||
    goalIntention.trim().length > 0 ||
    goalTargetPeriod.trim().length > 0 ||
    eventTitle.trim().length > 0 ||
    eventNote.trim().length > 0 ||
    dayOffNote.trim().length > 0 ||
    projectTitle.trim().length > 0 ||
    projectDesiredOutcome.trim().length > 0 ||
    projectCriteria.trim().length > 0 ||
    projectDescription.trim().length > 0 ||
    projectCollaborators.trim().length > 0 ||
    stageTitle.trim().length > 0 ||
    stageExpectedOutcome.trim().length > 0 ||
    folderName.trim().length > 0 ||
    habitMinimum.trim().length > 0 || habitCue.trim().length > 0 || habitReminder.trim().length > 0 || habitFolder !== '' ||
    habitName.trim().length > 0 ||
    habitDescription.trim().length > 0 ||
    recordSleep !== '' || recordSleepQuality !== '' || recordText.trim().length > 0 ||
    recordMood !== '' ||
    recordEnergy !== '' ||
    recordStress !== '' ||
    recordTagsInput.trim().length > 0 ||
    inspirationTitle.trim().length > 0 ||
    inspirationTextContent.trim().length > 0 ||
    inspirationSafeUrl.trim().length > 0 ||
    inspirationImageFile !== null ||
    Boolean(wishExtras.linkUrl||wishExtras.projectId||wishExtras.preparedMedia||wishExtras.validating||wishExtras.imageError) ||
    wishTitle.trim().length > 0 ||
    wishNote.trim().length > 0 ||
    wishPriceInput.trim().length > 0 ||
    wishlistCategoryName.trim().length > 0;

  // 5.3 Check overnight clock suggestion and equal-clocks ambiguity for Event / Shift
  const eventClockHint = useMemo(() => {
    if (
      (selectedAction !== 'event' && selectedAction !== 'shift') ||
      eventScheduleKind !== 'timed' ||
      !eventStartDate
    ) {
      return null;
    }
    return suggestEndDateForClockRange(
      eventStartDate,
      eventStartTime,
      eventEndTime
    );
  }, [
    selectedAction,
    eventScheduleKind,
    eventStartDate,
    eventStartTime,
    eventEndTime,
  ]);

  // 5.3 / 5.4 Real-time conflict detection for timed events, shifts, and task reservations
  const conflictPreview = useMemo(() => {
    try {
      if (selectedAction === 'event' || selectedAction === 'shift') {
        if (!eventIsBlocking) {
          return { hasConflicts: false, conflicts: [], warningMessageUk: null };
        }
        if (eventScheduleKind === 'timed') {
          if (!eventStartDate || !eventEndDate) {
            return {
              hasConflicts: false,
              conflicts: [],
              warningMessageUk: null,
            };
          }
          const built = buildZonedIntervalFromLocalInput({
            startLocalDate: eventStartDate,
            startLocalTime: eventStartTime,
            endLocalDate: eventEndDate,
            endLocalTime: eventEndTime,
            originZone: lockedEditorZone,
          });
          return detectScheduleConflicts({
            candidateStartInstant: built.interval.startInstant,
            candidateEndInstant: built.interval.endInstant,
            displayZone: lockedEditorZone,
            events,
            reservations,
            tasks,
          });
        } else {
          if (!eventStartDate || !eventEndDate) {
            return {
              hasConflicts: false,
              conflicts: [],
              warningMessageUk: null,
            };
          }
          const endExclusive = addDaysToLocalDate(eventEndDate, 1);
          const occ = resolveAllDayEventOccupancyInterval({
            kind: 'all_day',
            startLocalDate: eventStartDate,
            endLocalDateExclusive: endExclusive,
            originZone: lockedEditorZone,
          });
          return detectScheduleConflicts({
            candidateStartInstant: occ.startInstant,
            candidateEndInstant: occ.endInstant,
            displayZone: lockedEditorZone,
            events,
            reservations,
            tasks,
          });
        }
      }

      if (selectedAction === 'task' && taskPlanningMode === 'timed') {
        const startDate =
          editableContext.targetDate ?? new Date().toISOString().slice(0, 10);
        const endDate = taskResEndDate || startDate;
        const built = buildZonedIntervalFromLocalInput({
          startLocalDate: startDate,
          startLocalTime: taskResStartTime,
          endLocalDate: endDate,
          endLocalTime: taskResEndTime,
          originZone: lockedEditorZone,
        });
        return detectScheduleConflicts({
          candidateStartInstant: built.interval.startInstant,
          candidateEndInstant: built.interval.endInstant,
          displayZone: lockedEditorZone,
          events,
          reservations,
          tasks,
        });
      }
    } catch {
      // Ignore while user is typing incomplete date/time
    }
    return { hasConflicts: false, conflicts: [], warningMessageUk: null };
  }, [
    selectedAction,
    eventIsBlocking,
    eventScheduleKind,
    eventStartDate,
    eventStartTime,
    eventEndDate,
    eventEndTime,
    lockedEditorZone,
    events,
    reservations,
    tasks,
    taskPlanningMode,
    editableContext.targetDate,
    taskResStartTime,
    taskResEndTime,
    taskResEndDate,
  ]);

  const folderOptions = [
    { value: '', label: UK_STRINGS.creation.rootFolderOption },
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  const projectOptions = [
    { value: '', label: UK_STRINGS.creation.noProjectOption },
    ...projects.map((p) => ({ value: p.id, label: p.title })),
  ];

  const activeProjectStages = stages
    .filter((s) => s.projectId !== null && s.projectId === editableContext.projectId)
    .sort((a, b) => a.order - b.order);

  const stageOptions = [
    { value: '', label: UK_STRINGS.creation.noStageOption },
    ...activeProjectStages.map((s) => ({ value: s.id, label: s.title })),
  ];

  const goalOptions = [
    { value: '', label: 'Без прив’язки до цілі' },
    ...goals.map((g) => ({ value: g.id, label: g.title })),
  ];

  const openTaskOptions = [
    { value: '', label: UK_STRINGS.creation.goalForm.noNextActionOption },
    ...tasks
      .filter((t) => t.state === 'open')
      .map((t) => ({ value: t.id, label: t.title })),
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (selectedAction === 'task') {
        const hasTargetDate =
          editableContext.targetDate !== null &&
          editableContext.targetDate.trim().length > 0;

        let parsedDeadline: TaskDeadline | null = null;
        if (taskDeadlineKind === 'date_only' && taskDeadlineDate.trim()) {
          parsedDeadline = {
            kind: 'date_only',
            localDate: taskDeadlineDate.trim(),
          };
        } else if (
          taskDeadlineKind === 'exact_instant' &&
          taskDeadlineInstant.trim()
        ) {
          const dt = new Date(taskDeadlineInstant.trim());
          if (!Number.isNaN(dt.getTime())) {
            parsedDeadline = {
              kind: 'exact_instant',
              instant: dt.toISOString(),
              zoneId: lockedEditorZone,
            };
          }
        }

        const parsedEstimate =
          taskEstimate.trim().length > 0 ? Number(taskEstimate.trim()) : null;

        const ownership: TaskOwnership = editableContext.projectId
          ? {
              kind: 'project',
              projectId: editableContext.projectId,
              stageId: editableContext.stageId || null,
            }
          : editableContext.goalId
          ? {
              kind: 'goal',
              goalId: editableContext.goalId,
            }
          : editableContext.folderId
          ? {
              kind: 'folder',
              folderId: editableContext.folderId,
            }
          : {
              kind: 'standalone',
              folderId: null,
            };

        if (taskPlanningMode === 'timed') {
          if (conflictPreview.hasConflicts && !confirmConsciousOverlap) {
            throw new Error(
              UK_STRINGS.creation.eventForm.overlapConfirmationRequiredError
            );
          }
          const startDate =
            editableContext.targetDate ?? new Date().toISOString().slice(0, 10);
          const endDate = taskResEndDate || startDate;
          const built = buildZonedIntervalFromLocalInput({
            startLocalDate: startDate,
            startLocalTime: taskResStartTime,
            endLocalDate: endDate,
            endLocalTime: taskResEndTime,
            originZone: lockedEditorZone,
          });

          await repositories.saveTask({
            id,
            title: taskTitle,
            description: taskDescription.trim() ? taskDescription.trim() : null,
            state: 'open',
            priority: taskPriority,
            effort: taskEffort,
            lifeAreaId: taskLifeArea || null,
            deadline: parsedDeadline,
            estimatedDurationMinutes: parsedEstimate,
            planningState: 'unplanned',
            plannedDate: null,
            ownership,
            checklist: [],
            createdAt: nowIso,
            updatedAt: nowIso,
            completedAt: null,
            canceledAt: null,
            revision: 1,
          });

          const resId =
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          await repositories.saveReservationTransactionally({
            id: resId,
            taskId: id,
            interval: built.interval,
            state: 'active',
            releaseMetadata: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            revision: 1,
          });
        } else {
          await repositories.saveTask({
            id,
            title: taskTitle,
            description: taskDescription.trim() ? taskDescription.trim() : null,
            state: 'open',
            priority: taskPriority,
            effort: taskEffort,
            lifeAreaId: taskLifeArea || null,
            deadline: parsedDeadline,
            estimatedDurationMinutes: parsedEstimate,
            planningState: hasTargetDate ? 'date_only' : 'unplanned',
            plannedDate: hasTargetDate ? editableContext.targetDate : null,
            ownership,
            checklist: [],
            createdAt: nowIso,
            updatedAt: nowIso,
            completedAt: null,
            canceledAt: null,
            revision: 1,
          });
        }

        onEntityCreated(UK_STRINGS.creation.taskForm.savedFeedback);
        onClose();
        return;
      }

      if (selectedAction === 'event' || selectedAction === 'shift') {
        if (conflictPreview.hasConflicts && !confirmConsciousOverlap) {
          throw new Error(
            UK_STRINGS.creation.eventForm.overlapConfirmationRequiredError
          );
        }

        const effectiveType: CalendarEventType =
          selectedAction === 'shift' ? 'work_shift' : eventType;
        const effectiveScheduleKind =
          effectiveType === 'work_shift' ? 'timed' : eventScheduleKind;

        const schedule =
          effectiveScheduleKind === 'timed'
            ? ({
                kind: 'timed',
                interval: buildZonedIntervalFromLocalInput({
                  startLocalDate: eventStartDate,
                  startLocalTime: eventStartTime,
                  endLocalDate: eventEndDate,
                  endLocalTime: eventEndTime,
                  originZone: lockedEditorZone,
                }).interval,
              } as const)
            : ({
                kind: 'all_day',
                startLocalDate: eventStartDate,
                endLocalDateExclusive: addDaysToLocalDate(eventEndDate, 1),
                originZone: lockedEditorZone,
              } as const);

        await repositories.saveCalendarEvent({
          id,
          title: eventTitle,
          note: eventNote.trim() ? eventNote.trim() : null,
          type: effectiveType,
          color: effectiveType === 'work_shift' ? 'work' : eventColor,
          schedule,
          isBlocking: effectiveType === 'work_shift' ? true : eventIsBlocking,
          state: 'active',
          workProperties:
            effectiveType === 'work_shift'
              ? {
                  shiftName: eventTitle.trim(),
                  shiftCode: shiftCode.trim() ? shiftCode.trim() : null,
                  sourceTemplateId: selectedShiftTemplateId || null,
                }
              : null,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });

        onEntityCreated(
          effectiveType === 'work_shift'
            ? UK_STRINGS.creation.eventForm.savedShiftFeedback
            : UK_STRINGS.creation.eventForm.savedEventFeedback
        );
        onClose();
        return;
      }

      if (selectedAction === 'day_off') {
        const targetDayOffDate =
          dayOffDate.trim() ||
          editableContext.targetDate ||
          nowIso.slice(0, 10);
        await repositories.saveDayOffAnnotationTransactionally({
          id,
          localDate: targetDayOffDate,
          sourceZone: lockedEditorZone,
          code: dayOffCode.trim() ? dayOffCode.trim().toUpperCase() : 'В',
          note: dayOffNote.trim() ? dayOffNote.trim() : null,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        onEntityCreated(`Дату ${targetDayOffDate} позначено як вихідний.`);
        onClose();
        return;
      }

      if (selectedAction === 'goal') {
        if (!goalTitle.trim()) {
          setErrorMessage('Будь ласка, вкажіть назву цілі.');
          setIsSaving(false);
          return;
        }

        const effectiveFolderId =
          editableContext.folderId || (goalFolderId ? goalFolderId : null);
        const siblingGoalsCount = goals.filter(
          (g) => g.folderId === effectiveFolderId
        ).length;

        await repositories.saveGoal({
          id,
          title: goalTitle.trim(),
          description: null,
          purposeUk: goalPurpose.trim() ? goalPurpose.trim() : null,
          completionCriteriaUk: goalCriteria.trim() ? goalCriteria.trim() : null,
          nextActionTaskId: goalNextActionTaskId.trim()
            ? goalNextActionTaskId.trim()
            : null,
          timing:
            goalTargetDate || goalTargetPeriod.trim()
              ? {
                  targetDate: goalTargetDate || null,
                  targetPeriodUk: goalTargetPeriod.trim()
                    ? goalTargetPeriod.trim()
                    : null,
                }
              : null,
          folderId: effectiveFolderId,
          lifeAreaId: goalLifeAreaId.trim() ? goalLifeAreaId.trim() : null,
          implementationIntentionUk: goalIntention.trim()
            ? goalIntention.trim()
            : null,
          state: goalState,
          archived: false,
          order: siblingGoalsCount,
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: goalState === 'completed' ? nowIso : null,
          revision: 1,
        });

        onEntityCreated(UK_STRINGS.creation.goalForm.savedFeedback);
        onClose();
        return;
      }

      if (selectedAction === 'project') {
        await repositories.saveProject({
          id,
          title: projectTitle,
          description: projectDescription.trim()
            ? projectDescription.trim()
            : null,
          desiredOutcome: projectDesiredOutcome.trim()
            ? projectDesiredOutcome.trim()
            : null,
          completionCriteria: projectCriteria.trim()
            ? projectCriteria.trim()
            : null,
          targetDate: projectTargetDate || null,
          folderId: editableContext.folderId || null,
          goalId:
            editableContext.goalId || (projectGoalId ? projectGoalId : null),
          lifeAreaId: null,
          collaboratorText: projectCollaborators.trim()
            ? projectCollaborators.trim()
            : null,
          state: 'active',
          archived: false,
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null,
          revision: 1,
        });
        onEntityCreated(UK_STRINGS.creation.projectForm.savedFeedback);
        onClose();
        return;
      }

      if (selectedAction === 'stage') {
        const targetProjectId =
          editableContext.projectId ?? (projects[0]?.id || '');
        const existingStagesCount = stages.filter(
          (s) => s.projectId === targetProjectId
        ).length;
        await repositories.saveStage({
          id,
          projectId: targetProjectId,
          title: stageTitle,
          expectedOutcome: stageExpectedOutcome.trim()
            ? stageExpectedOutcome.trim()
            : null,
          targetDate: stageTargetDate || null,
          order: existingStagesCount,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        onEntityCreated(UK_STRINGS.creation.stageForm.savedFeedback);
        onClose();
        return;
      }

      if (selectedAction === 'folder') {
        const siblingFoldersCount = folders.filter(
          (f) => f.parentId === (editableContext.folderId || null)
        ).length;
        await repositories.saveFolder({
          id,
          name: folderName,
          parentId: editableContext.folderId || null,
          order: siblingFoldersCount,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        onEntityCreated(UK_STRINGS.creation.folderForm.savedFeedback);
        onClose();
        return;
      }

      if (selectedAction === 'habit') {
        const effectiveFrom =
          habitEffectiveFromDate.trim() ||
          editableContext.targetDate ||
          nowIso.slice(0, 10);

        let rule: HabitFrequencyRule;
        if (habitRuleKind === 'days_off') { rule = {kind: 'days_off'};
        } else if (habitRuleKind === 'daily') {
          rule = { kind: 'daily' };
        } else if (habitRuleKind === 'selected_weekdays') {
          rule = {
            kind: 'selected_weekdays',
            weekdaysIso: [...habitWeekdaysIso].sort((a, b) => a - b),
          };
        } else {
          rule = {
            kind: 'weekly_frequency',
            timesPerWeek: Number(habitTimesPerWeek),
          };
        }

        const target: HabitTargetSpec =
          habitTargetKind === 'binary'
            ? { kind: 'binary' }
            : {
                kind: 'numeric',
                targetValue: Number(habitTargetValue),
                unitUk: habitUnitUk.trim(),
              };

        const revId =
          typeof crypto !== 'undefined' &&
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        await repositories.saveHabit({
          id,
          name: habitName,
          minimumVersionUk: habitMinimum.trim() || null, contextCueUk: habitCue.trim() || null, reminderIntentionUk: habitReminder.trim() || null, folderId: editableContext.projectId ? null : habitFolder || null,
          description: habitDescription.trim() ? habitDescription.trim() : null,
          icon: habitIcon.trim() ? habitIcon.trim() : null,
          lifeAreaId: habitLifeAreaId ? habitLifeAreaId : null,
          projectId: editableContext.projectId || null,
          state: 'active',
          ruleRevisions: [
            {
              id: revId,
              effectiveFromLocalDate: effectiveFrom,
              rule,
              target,
              createdAt: nowIso,
            },
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        onEntityCreated(`Звичку «${habitName.trim()}» створено.`);
        onClose();
        return;
      }

      if (selectedAction === 'personal_record') {
        const parsedMood = recordMood
          ? (Number(recordMood) as 1 | 2 | 3 | 4 | 5)
          : null;
        const parsedEnergy = recordEnergy
          ? (Number(recordEnergy) as 1 | 2 | 3 | 4 | 5)
          : null;
        const parsedStress = recordStress
          ? (Number(recordStress) as 1 | 2 | 3 | 4 | 5)
          : null;
        const parsedTags = normalizeSimpleTags(
          recordTagsInput ? recordTagsInput.split(',') : []
        );

        await repositories.savePersonalRecord({
          id,
          recordedAt: nowIso,
          localDate: editableContext.targetDate ?? nowIso.slice(0, 10),
          zoneId: lockedEditorZone,
          text: null,
          scaleVersion: 1,
          sleepMinutes: recordSleep === '' ? null : Number(recordSleep),
          sleepQuality: recordSleepQuality === '' ? null : Number(recordSleepQuality) as 1 | 2 | 3 | 4 | 5,
          mood: parsedMood,
          energy: parsedEnergy,
          stress: parsedStress,
          tags: parsedTags,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        onEntityCreated(UK_STRINGS.creation.recordForm.savedFeedback);
        onClose();
        return;
      }

      if (selectedAction === 'inspiration') {
        let preparedMedia:
          | { meta: import('../../domain/types').MediaAssetMeta; bytes: Uint8Array }
          | undefined = undefined;
        let optFeedback = '';
        if (inspirationKind === 'image') {
          if (!inspirationImageFile) {
            throw new Error(
              'Оберіть растрове зображення (JPEG, PNG або WebP) для збереження в розділі Натхнення.'
            );
          }
          const mediaId =
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const prepared = await validateAndPrepareRasterMedia({
            id: mediaId,
            bytes: inspirationImageFile.bytes,
            declaredMimeType: inspirationImageFile.mimeType,
            nowIso,
          });
          preparedMedia = prepared;
          if (prepared.meta.optimizationNoteUk) {
            optFeedback = ` (${prepared.meta.optimizationNoteUk})`;
          }
        }

        const item = buildInspirationItemRecord({
          id,
          kind: inspirationKind,
          title: inspirationTitle,
          contentText: inspirationTextContent,
          linkUrl: inspirationSafeUrl,
          mediaId: preparedMedia?.meta.id ?? null,
          isFavorite: inspirationIsFavorite,
          projectId: editableContext.projectId || null,
          nowIso,
        });
        await repositories.saveInspirationWithMediaTransactionally(
          { ...item, collection: 'preferred_life' },
          preparedMedia
        );
        onEntityCreated(`Елемент натхнення збережено${optFeedback}.`);
        onClose();
        return;
      }

      if (selectedAction === 'wish') {
        const built = buildWishItemRecord({
          id,
          title: wishTitle,
          ...resolveWishExtras(wishExtras),
          note: wishNote,
          categoryId: editableContext.wishlistCategoryId || null,
          timing: wishTiming,
          rawPriceAmount: wishPriceInput,
          currencyCode: wishCurrencyInput ? wishCurrencyInput : null,
          preferredCurrency: preferredWishlistCurrency,
          nowIso,
        });

        await repositories.saveWishItem(built.wish,undefined,{media:wishExtras.preparedMedia??undefined});

        // 10.7: When a price is entered and no preferred currency existed, save the explicit choice
        if (built.explicitCurrencySelected && !preferredWishlistCurrency) {
          await repositories.updateSettingsPatch({
            preferredWishlistCurrency: built.explicitCurrencySelected,
          });
        }

        onEntityCreated(`Бажання «${built.wish.title}» додано до списку бажань.`);
        onClose();
        return;
      }

      if (selectedAction === 'wishlist_category') {
        const nextOrder = wishlistCategories.length;
        await repositories.saveWishlistCategory({
          id,
          name: wishlistCategoryName,
          order: nextOrder,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        onEntityCreated(
          `Категорію бажань «${wishlistCategoryName.trim()}» створено.`
        );
        onClose();
        return;
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Не вдалося зберегти запис.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const moodScaleOptions = [
    { value: '', label: UK_STRINGS.creation.recordForm.notSelectedOption },
    { value: '1', label: MOOD_SCALE_LABELS_UK[1] },
    { value: '2', label: MOOD_SCALE_LABELS_UK[2] },
    { value: '3', label: MOOD_SCALE_LABELS_UK[3] },
    { value: '4', label: MOOD_SCALE_LABELS_UK[4] },
    { value: '5', label: MOOD_SCALE_LABELS_UK[5] },
  ];

  const energyScaleOptions = [
    { value: '', label: UK_STRINGS.creation.recordForm.notSelectedOption },
    { value: '1', label: ENERGY_SCALE_LABELS_UK[1] },
    { value: '2', label: ENERGY_SCALE_LABELS_UK[2] },
    { value: '3', label: ENERGY_SCALE_LABELS_UK[3] },
    { value: '4', label: ENERGY_SCALE_LABELS_UK[4] },
    { value: '5', label: ENERGY_SCALE_LABELS_UK[5] },
  ];

  const stressScaleOptions = [
    { value: '', label: UK_STRINGS.creation.recordForm.notSelectedOption },
    { value: '1', label: STRESS_SCALE_LABELS_UK[1] },
    { value: '2', label: STRESS_SCALE_LABELS_UK[2] },
    { value: '3', label: STRESS_SCALE_LABELS_UK[3] },
    { value: '4', label: STRESS_SCALE_LABELS_UK[4] },
    { value: '5', label: STRESS_SCALE_LABELS_UK[5] },
  ];

  return (
    <ModalSheet
      transitionName="planui-create"
      quickAdd={globalQuickAdd}
      isOpen={isOpen}
      title={globalQuickAdd ? 'Швидке додавання' : UK_STRINGS.creation.sheetTitleChooseAction}
      subtitle={globalQuickAdd ? undefined : UK_STRINGS.creation.sheetSubtitleContext}
      isDirty={isDirty}
      onClose={onClose}
    >
      <form onSubmit={handleSave} className={globalQuickAdd ? "quick-add-form space-y-4" : "space-y-4"} noValidate>
        {selectedAction === 'task' && (            <InputField
              label={UK_STRINGS.creation.taskForm.titleLabel}
              placeholder={globalQuickAdd ? 'Що потрібно зробити?' : UK_STRINGS.creation.taskForm.titlePlaceholder}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              data-testid="create-task-title-input"
              autoFocus
              required
            />
)}
        {/* Contextual Action Switcher — Only shows implemented actions, prioritized by active destination */}
        <div
          role="radiogroup"
          aria-label={UK_STRINGS.creation.sheetTitleChooseAction}
          className="flex gap-2 overflow-x-auto pb-2"
        >
          {availableActions.map((act) => {
            const active = selectedAction === act.kind;
            const Icon =
              act.kind === 'task'
                ? CheckSquare
                : act.kind === 'goal'
                ? Target
                : act.kind === 'project'
                ? Briefcase
                : act.kind === 'stage'
                ? Layers
                : act.kind === 'folder'
                ? FolderPlus
                : act.kind === 'event'
                ? CalendarIcon
                : act.kind === 'shift'
                ? Clock
                : act.kind === 'day_off'
                ? Sun
                : act.kind === 'habit'
                ? Repeat
                : act.kind === 'inspiration'
                ? Sparkles
                : act.kind === 'wish'
                ? Gift
                : act.kind === 'wishlist_category'
                ? Tag
                : HeartPulse;
            return (
              <button
                key={act.kind}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`create-action-tab-${act.kind}`}
                onClick={() => {
                  const nextKind = act.kind as ImplementedCreationActionKind;
                  setSelectedAction(nextKind);
                  if (
                    nextKind === 'stage' &&
                    !editableContext.projectId &&
                    projects.length > 0
                  ) {
                    setEditableContext((prev) => ({
                      ...prev,
                      projectId: projects[0].id,
                    }));
                  }
                  if (nextKind === 'shift') {
                    setEventType('work_shift');
                    setEventColor('work');
                    setEventScheduleKind('timed');
                    setEventIsBlocking(true);
                  } else if (nextKind === 'event') {
                    setEventType('personal');
                    setEventColor('personal');
                  }
                  setErrorMessage(null);
                }}
                className="min-h-[44px] shrink-0 px-3 py-2 rounded-full flex items-center gap-2 text-left planui-transition-micro cursor-pointer"
                style={{
                  backgroundColor: active
                    ? 'var(--bg-pressed)'
                    : 'var(--bg-elevated)',
                  border: active
                    ? '1.5px solid var(--color-brand)'
                    : '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Icon
                  className="w-5 h-5 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-[14px] font-semibold leading-tight">
                    {globalQuickAdd ? ({task:'Справа',shift:'Зміна',event:'Подія',goal:'Ціль',habit:'Звичка',personal_record:'Стан',wish:'Бажання',project:'Проєкт'} as Record<string,string>)[act.kind] ?? act.labelUk : act.labelUk}
                  </div>
                  <div
                    className="hidden"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {act.descriptionUk}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {globalQuickAdd && selectedAction === 'task' && <div className="quick-options">
          <button type="button" className="ui-pill" aria-expanded={quickPanel==='date'} onClick={()=>setQuickPanel(quickPanel==='date'?null:'date')}>Дата й час{editableContext.targetDate ? ` · ${formatDate(editableContext.targetDate,{day:'numeric',month:'short'})}` : ''}</button>
          <button type="button" className="ui-pill" aria-expanded={quickPanel==='duration'} onClick={()=>setQuickPanel(quickPanel==='duration'?null:'duration')}>Тривалість{taskEstimate ? ` · ${formatDuration(Number(taskEstimate))}` : ''}</button>
          <SelectField label="Зусилля" value={taskEffort??''} onChange={e=>setTaskEffort((e.target.value||null) as Task['effort'])} options={[{value:'',label:'Без оцінки'},{value:'small',label:'•'},{value:'medium',label:'••'},{value:'large',label:'•••'}]} />
          <button type="button" className="ui-pill" aria-expanded={quickPanel==='direction'} onClick={()=>setQuickPanel(quickPanel==='direction'?null:'direction')}>Напрям{editableContext.folderId ? ` · ${folders.find(f=>f.id===editableContext.folderId)?.name??''}` : ''}</button>
          <SelectField label="Сфера" value={taskLifeArea} onChange={e=>setTaskLifeArea(e.target.value)} options={[{value:'',label:'Успадкувати'},...lifeAreaQuestions.filter(a=>!a.archived&&!a.mergedIntoId).map(a=>({value:a.id,label:a.questionTextUk}))]} />
        </div>}
        <details className={globalQuickAdd && selectedAction==='task' ? 'quick-context-panel' : ''} open={globalQuickAdd && selectedAction==='task' ? quickPanel==='date'||quickPanel==='direction' : selectedAction !== 'task'}>
          <summary className="min-h-[44px] py-3 cursor-pointer">Дата / час · Напрям / проєкт</summary>
        {/* Editable Prefilled Context Block (C04: Prefilled date/folder/project/stage must be visible and editable) */}
        <div
          className="p-3.5 rounded-2xl space-y-3"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
          data-testid="editable-creation-context"
        >
          <div className="flex items-center justify-between text-[13px] font-medium">
            <span style={{ color: 'var(--text-secondary)' }}>
              {UK_STRINGS.creation.contextSummaryTitle}
            </span>
            <span
              className="px-2 py-0.5 rounded-md text-[12px]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              {UK_STRINGS.nav[editableContext.originDestination]} •{' '}
              {lockedEditorZone}
            </span>
          </div>

          {selectedAction === 'task' && (
            <div className="space-y-3">
              {/* Task Planning State Selector (5.4: unplanned, date_only, timed) */}
              <div className="space-y-1.5">
                <span
                  className="text-[13px] font-medium block"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {UK_STRINGS.creation.taskForm.planningModeLabel}
                </span>
                <SegmentedControl<TaskPlanningState>
                  ariaLabel={UK_STRINGS.creation.taskForm.planningModeLabel}
                  value={taskPlanningMode}
                  onChange={(mode) => {
                    setTaskPlanningMode(mode);
                    if (mode === 'unplanned') {
                      setEditableContext((prev) => ({
                        ...prev,
                        targetDate: null,
                      }));
                    } else {
                      const fallbackDate =
                        editableContext.targetDate ??
                        new Date().toISOString().slice(0, 10);
                      setEditableContext((prev) => ({
                        ...prev,
                        targetDate: fallbackDate,
                      }));
                      setTaskResEndDate(fallbackDate);
                    }
                  }}
                  options={[
                    {
                      value: 'unplanned',
                      label: UK_STRINGS.creation.taskForm.planningNoDate,
                    },
                    {
                      value: 'date_only',
                      label: UK_STRINGS.creation.taskForm.planningDateOnly,
                    },
                    {
                      value: 'timed',
                      label: UK_STRINGS.creation.taskForm.planningTimed,
                    },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date intention */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="creation-context-date"
                    className="text-[13px] font-medium flex items-center gap-1.5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{UK_STRINGS.creation.fieldTargetDate}</span>
                  </label>
                  {editableContext.targetDate === null ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="hidden"
                        data-testid="creation-context-date-input"
                        value=""
                        readOnly
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onClick={() => {
                          const todayStr = new Date()
                            .toISOString()
                            .slice(0, 10);
                          setEditableContext((prev) => ({
                            ...prev,
                            targetDate: todayStr,
                          }));
                          setTaskPlanningMode('date_only');
                        }}
                        data-testid="creation-set-date-button"
                      >
                        <span>
                          {UK_STRINGS.creation.taskForm.planningNoDate} — обрати
                          дату
                        </span>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        id="creation-context-date"
                        type="date"
                        lang="uk"
                        data-testid="creation-context-date-input"
                        value={editableContext.targetDate}
                        onChange={(e) => {
                          const val = e.target.value ? e.target.value : null;
                          setEditableContext((prev) => ({
                            ...prev,
                            targetDate: val,
                          }));
                          if (val) {
                            setTaskResEndDate(val);
                          } else {
                            setTaskPlanningMode('unplanned');
                          }
                        }}
                        className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditableContext((prev) => ({
                            ...prev,
                            targetDate: null,
                          }));
                          setTaskPlanningMode('unplanned');
                        }}
                        data-testid="creation-clear-date-button"
                      >
                        {UK_STRINGS.creation.clearDateIntention}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Project selector (or Standalone) */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="creation-context-project"
                    className="text-[13px] font-medium flex items-center gap-1.5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{UK_STRINGS.creation.fieldProjectContext}</span>
                  </label>
                  <select
                    id="creation-context-project"
                    data-testid="creation-context-project-select"
                    value={editableContext.projectId ?? ''}
                    onChange={(e) => {
                      const nextProjectId = e.target.value
                        ? e.target.value
                        : null;
                      setEditableContext((prev) => ({
                        ...prev,
                        projectId: nextProjectId,
                        stageId: null,
                        folderId: nextProjectId ? null : prev.folderId,
                      }));
                    }}
                    className="w-full min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {projectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {taskPlanningMode === 'timed' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <InputField
                    label={
                      UK_STRINGS.creation.taskForm.reservationStartTimeLabel
                    }
                    type="time"
                    value={taskResStartTime}
                    onChange={(e) => setTaskResStartTime(e.target.value)}
                    data-testid="create-task-res-start-time"
                  />
                  <InputField
                    label={UK_STRINGS.creation.taskForm.reservationEndTimeLabel}
                    type="time"
                    value={taskResEndTime}
                    onChange={(e) => setTaskResEndTime(e.target.value)}
                    data-testid="create-task-res-end-time"
                  />
                  <InputField
                    label={UK_STRINGS.creation.taskForm.reservationEndDateLabel}
                    type="date"
                    lang="uk"
                    value={
                      taskResEndDate ||
                      editableContext.targetDate ||
                      new Date().toISOString().slice(0, 10)
                    }
                    onChange={(e) => setTaskResEndDate(e.target.value)}
                    data-testid="create-task-res-end-date"
                  />
                </div>
              )}

              {/* Either Standalone Folder OR Project Stage */}
              {editableContext.projectId ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="creation-context-stage"
                    className="text-[13px] font-medium flex items-center gap-1.5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{UK_STRINGS.creation.fieldStageContext}</span>
                  </label>
                  <select
                    id="creation-context-stage"
                    data-testid="creation-context-stage-select"
                    value={editableContext.stageId ?? ''}
                    onChange={(e) =>
                      setEditableContext((prev) => ({
                        ...prev,
                        stageId: e.target.value ? e.target.value : null,
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {stageOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="creation-context-goal"
                      className="text-[13px] font-medium flex items-center gap-1.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Target className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ціль</span>
                    </label>
                    <select
                      id="creation-context-goal"
                      data-testid="creation-context-goal-select"
                      value={editableContext.goalId ?? ''}
                      onChange={(e) => {
                        const nextGoalId = e.target.value ? e.target.value : null;
                        const linkedGoal = goals.find((g) => g.id === nextGoalId);
                        setEditableContext((prev) => ({
                          ...prev,
                          goalId: nextGoalId,
                          folderId:
                            nextGoalId && linkedGoal?.folderId
                              ? linkedGoal.folderId
                              : prev.folderId,
                        }));
                      }}
                      className="w-full min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {goalOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="creation-context-folder"
                      className="text-[13px] font-medium flex items-center gap-1.5"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <FolderIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{UK_STRINGS.creation.fieldFolderContext}</span>
                    </label>
                    <select
                      id="creation-context-folder"
                      data-testid="creation-context-folder-select"
                      value={editableContext.folderId ?? ''}
                      onChange={(e) =>
                        setEditableContext((prev) => ({
                          ...prev,
                          folderId: e.target.value ? e.target.value : null,
                        }))
                      }
                      className="w-full min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {folderOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedAction === 'goal' && (
            <SelectField
              label={UK_STRINGS.creation.goalForm.folderLabel}
              options={folderOptions}
              value={editableContext.folderId ?? ''}
              onChange={(e) =>
                setEditableContext((prev) => ({
                  ...prev,
                  folderId: e.target.value ? e.target.value : null,
                }))
              }
              data-testid="creation-goal-folder-select"
            />
          )}

          {selectedAction === 'project' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label={UK_STRINGS.creation.projectForm.folderLabel}
                options={folderOptions}
                value={editableContext.folderId ?? ''}
                onChange={(e) =>
                  setEditableContext((prev) => ({
                    ...prev,
                    folderId: e.target.value ? e.target.value : null,
                  }))
                }
                data-testid="creation-project-folder-select"
              />
              <SelectField
                label="Ціль (необов’язково)"
                options={goalOptions}
                value={editableContext.goalId ?? ''}
                onChange={(e) =>
                  setEditableContext((prev) => ({
                    ...prev,
                    goalId: e.target.value ? e.target.value : null,
                  }))
                }
                data-testid="creation-project-goal-select"
              />
            </div>
          )}

          {selectedAction === 'stage' && (
            <SelectField
              label={UK_STRINGS.creation.stageForm.projectLabel}
              options={projects.map((p) => ({ value: p.id, label: p.title }))}
              value={editableContext.projectId ?? (projects[0]?.id || '')}
              onChange={(e) =>
                setEditableContext((prev) => ({
                  ...prev,
                  projectId: e.target.value ? e.target.value : null,
                }))
              }
              data-testid="creation-stage-project-select"
            />
          )}

          {selectedAction === 'folder' && (
            <SelectField
              label={UK_STRINGS.creation.folderForm.parentFolderLabel}
              options={folderOptions}
              value={editableContext.folderId ?? ''}
              onChange={(e) =>
                setEditableContext((prev) => ({
                  ...prev,
                  folderId: e.target.value ? e.target.value : null,
                }))
              }
            />
          )}

          {selectedAction === 'inspiration' && (
            <SelectField
              label="Пов’язаний проєкт (необов’язково)"
              options={projectOptions}
              value={editableContext.projectId ?? ''}
              onChange={(e) =>
                setEditableContext((prev) => ({
                  ...prev,
                  projectId: e.target.value ? e.target.value : null,
                }))
              }
              data-testid="creation-inspiration-project-select"
            />
          )}

          {selectedAction === 'wish' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label="Категорія бажання (необов’язково)"
                options={[
                  { value: '', label: 'Без категорії' },
                  ...wishlistCategories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
                value={editableContext.wishlistCategoryId ?? ''}
                onChange={(e) =>
                  setEditableContext((prev) => ({
                    ...prev,
                    wishlistCategoryId: e.target.value ? e.target.value : null,
                  }))
                }
                data-testid="creation-wish-category-select"
              />
              <div className="space-y-1.5">
                <span
                  className="text-[13px] font-medium block"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Часовий орієнтир (намір)
                </span>
                <SegmentedControl<WishlistTimingGroup>
                  ariaLabel="Часовий орієнтир бажання"
                  value={wishTiming}
                  onChange={setWishTiming}
                  options={[
                    { value: 'now', label: WISHLIST_TIMING_LABELS_UK.now },
                    { value: 'later', label: WISHLIST_TIMING_LABELS_UK.later },
                    {
                      value: 'someday',
                      label: WISHLIST_TIMING_LABELS_UK.someday,
                    },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        </details>
        {selectedAction === 'task' && !globalQuickAdd && <div className="flex flex-wrap gap-2">
          <SelectField label="Зусилля" value={taskEffort ?? ''} onChange={e => setTaskEffort((e.target.value || null) as Task['effort'])} options={[{value:'',label:'Не задано'},{value:'small',label:'•'},{value:'medium',label:'••'},{value:'large',label:'•••'}]} />
          <SelectField label="Сфера життя" value={taskLifeArea} onChange={e => setTaskLifeArea(e.target.value)} options={[{value:'',label:'Успадкувати'},...lifeAreaQuestions.filter(area => !area.archived && !area.mergedIntoId).map(area => ({value:area.id,label:area.questionTextUk}))]} />
        </div>}
        {/* Specific Form Fields by Action */}
        {selectedAction === 'task' && (
          <details className={globalQuickAdd ? "quick-duration-panel space-y-3.5" : "space-y-3.5"} open={globalQuickAdd ? quickPanel==='duration' : undefined}><summary className="min-h-[44px] py-3 cursor-pointer">Тривалість · Дедлайн · Деталі</summary>
            <TextAreaField
              label={UK_STRINGS.creation.taskForm.descriptionLabel}
              placeholder={UK_STRINGS.creation.taskForm.descriptionPlaceholder}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
            />
            <div className="space-y-1.5">
              <span
                className="text-[15px] font-medium block"
                style={{ color: 'var(--text-primary)' }}
              >
                {UK_STRINGS.creation.taskForm.priorityLabel}
              </span>
              <SegmentedControl<TaskPriority>
                ariaLabel={UK_STRINGS.creation.taskForm.priorityLabel}
                value={taskPriority}
                onChange={setTaskPriority}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label={UK_STRINGS.creation.taskForm.estimateLabel}
                placeholder={UK_STRINGS.creation.taskForm.estimatePlaceholder}
                type="number"
                min={1}
                value={taskEstimate}
                onChange={(e) => setTaskEstimate(e.target.value)}
                data-testid="create-task-estimate-input"
              />
              <SelectField
                label={UK_STRINGS.creation.taskForm.deadlineTypeLabel}
                value={taskDeadlineKind}
                onChange={(e) =>
                  setTaskDeadlineKind(
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
                data-testid="create-task-deadline-kind-select"
              />
            </div>

            {taskDeadlineKind === 'date_only' && (
              <InputField
                label={UK_STRINGS.creation.taskForm.deadlineDateLabel}
                type="date"
                lang="uk"
                value={taskDeadlineDate}
                onChange={(e) => setTaskDeadlineDate(e.target.value)}
                data-testid="create-task-deadline-date-input"
              />
            )}

            {taskDeadlineKind === 'exact_instant' && (
              <InputField
                label={UK_STRINGS.creation.taskForm.deadlineInstantLabel}
                type="datetime-local"
                lang="uk"
                value={taskDeadlineInstant}
                onChange={(e) => setTaskDeadlineInstant(e.target.value)}
                data-testid="create-task-deadline-instant-input"
              />
            )}
          </details>
        )}

        {/* 5.3 / 8.2 Shared Event & Work Shift Form */}
        {(selectedAction === 'event' || selectedAction === 'shift') && (
          <div className="space-y-3.5" data-testid="create-event-shift-form">
            {selectedAction === 'event' && <div className="flex flex-wrap gap-2" aria-label="Особисті блоки">{[{title:'Сон',type:'sleep'},{title:'Відновлення',type:'rest'},{title:'Дорога',type:'travel'},{title:'Підготовка до зміни',type:'personal'},{title:'Особистий час після роботи',type:'rest'}].map(preset => <Button key={preset.title} onClick={() => {setEventTitle(preset.title);setEventType(preset.type as CalendarEventType);setEventIsBlocking(true);setEventColor('rest');}}>{preset.title}</Button>)}</div>}
            {selectedAction === 'shift' && shiftTemplates.length > 0 && (
              <SelectField
                label="Заповнити за шаблоном зміни (необов’язково)"
                value={selectedShiftTemplateId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedShiftTemplateId(nextId);
                  const tpl = shiftTemplates.find((t) => t.id === nextId);
                  if (tpl) {
                    setEventTitle(tpl.name);
                    setShiftCode(tpl.code);
                    setEventStartTime(tpl.startLocalTime);
                    setEventEndTime(tpl.endLocalTime);
                    const startD =
                      eventStartDate ||
                      editableContext.targetDate ||
                      new Date().toISOString().slice(0, 10);
                    setEventEndDate(
                      tpl.endDateOffsetDays === 1
                        ? addDaysToLocalDate(startD, 1)
                        : startD
                    );
                    if (tpl.note) {
                      setEventNote(tpl.note);
                    }
                  }
                }}
                options={[
                  { value: '', label: 'Власний інтервал зміни (без шаблону)' },
                  ...shiftTemplates.map((t) => ({
                    value: t.id,
                    label: `${t.code} — ${t.name} (${t.startLocalTime}–${t.endLocalTime}${
                      t.endDateOffsetDays === 1 ? ' +1 доба' : ''
                    })`,
                  })),
                ]}
                data-testid="create-shift-template-select"
              />
            )}

            <InputField
              label={UK_STRINGS.creation.eventForm.titleLabel}
              placeholder={
                selectedAction === 'shift'
                  ? UK_STRINGS.creation.eventForm.titlePlaceholderShift
                  : UK_STRINGS.creation.eventForm.titlePlaceholderEvent
              }
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              data-testid="create-event-title-input"
              required
            />

            {selectedAction === 'event' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField
                  label={UK_STRINGS.creation.eventForm.typeLabel}
                  value={eventType}
                  onChange={(e) => {
                    const nextType = e.target.value as CalendarEventType;
                    setEventType(nextType);
                    if (nextType === 'work_shift') {
                      setEventColor('work');
                      setEventScheduleKind('timed');
                      setEventIsBlocking(true);
                    } else if (
                      nextType === 'rest' ||
                      nextType === 'sleep' ||
                      nextType === 'travel'
                    ) {
                      setEventColor('rest');
                    } else {
                      setEventColor('personal');
                    }
                  }}
                  options={[
                    {
                      value: 'personal',
                      label: UK_STRINGS.creation.eventForm.typePersonal,
                    },
                    {
                      value: 'travel',
                      label: UK_STRINGS.creation.eventForm.typeTravel,
                    },
                    {
                      value: 'rest',
                      label: UK_STRINGS.creation.eventForm.typeRest,
                    },
                    {
                      value: 'sleep',
                      label: UK_STRINGS.creation.eventForm.typeSleep,
                    },
                    {
                      value: 'work_shift',
                      label: UK_STRINGS.creation.eventForm.typeWorkShift,
                    },
                  ]}
                  data-testid="create-event-type-select"
                />

                <SelectField
                  label={UK_STRINGS.creation.eventForm.colorLabel}
                  value={eventColor}
                  onChange={(e) =>
                    setEventColor(e.target.value as EventPaletteColor)
                  }
                  options={[
                    {
                      value: 'personal',
                      label: UK_STRINGS.creation.eventForm.colorPersonal,
                    },
                    {
                      value: 'work',
                      label: UK_STRINGS.creation.eventForm.colorWork,
                    },
                    {
                      value: 'rest',
                      label: UK_STRINGS.creation.eventForm.colorRest,
                    },
                    {
                      value: 'dayoff',
                      label: UK_STRINGS.creation.eventForm.colorDayoff,
                    },
                    {
                      value: 'brand',
                      label: UK_STRINGS.creation.eventForm.colorBrand,
                    },
                  ]}
                />
              </div>
            )}

            {(selectedAction === 'shift' || eventType === 'work_shift') && (
              <InputField
                label={UK_STRINGS.creation.eventForm.shiftCodeLabel}
                placeholder={UK_STRINGS.creation.eventForm.shiftCodePlaceholder}
                value={shiftCode}
                onChange={(e) => setShiftCode(e.target.value)}
                data-testid="create-shift-code-input"
              />
            )}

            {selectedAction === 'event' && eventType !== 'work_shift' && (
              <div className="space-y-1.5">
                <span
                  className="text-[14px] font-medium block"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {UK_STRINGS.creation.eventForm.scheduleKindLabel}
                </span>
                <SegmentedControl<'timed' | 'all_day'>
                  ariaLabel={UK_STRINGS.creation.eventForm.scheduleKindLabel}
                  value={eventScheduleKind}
                  onChange={setEventScheduleKind}
                  options={[
                    {
                      value: 'timed',
                      label: UK_STRINGS.creation.eventForm.scheduleTimed,
                    },
                    {
                      value: 'all_day',
                      label: UK_STRINGS.creation.eventForm.scheduleAllDay,
                    },
                  ]}
                />
              </div>
            )}

            {/* Start / End Dates and Times visibly shown (5.3) */}
            {eventScheduleKind === 'timed' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    label={UK_STRINGS.creation.eventForm.startDateLabel}
                    type="date"
                    lang="uk"
                    value={eventStartDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setEventStartDate(nextStart);
                      if (eventEndDate < nextStart) {
                        setEventEndDate(nextStart);
                      }
                    }}
                    data-testid="create-event-start-date-input"
                    required
                  />
                  <InputField
                    label={UK_STRINGS.creation.eventForm.startTimeLabel}
                    type="time"
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    data-testid="create-event-start-time-input"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    label={UK_STRINGS.creation.eventForm.endDateLabel}
                    type="date"
                    lang="uk"
                    value={eventEndDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    data-testid="create-event-end-date-input"
                    required
                  />
                  <InputField
                    label={UK_STRINGS.creation.eventForm.endTimeLabel}
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      setEventEndTime(nextEnd);
                      const hint = suggestEndDateForClockRange(
                        eventStartDate,
                        eventStartTime,
                        nextEnd
                      );
                      if (
                        hint.isOvernightSuggestion &&
                        eventEndDate === eventStartDate
                      ) {
                        setEventEndDate(hint.suggestedEndLocalDate);
                      }
                    }}
                    data-testid="create-event-end-time-input"
                    required
                  />
                </div>

                {/* Overnight / Equal Clocks Helper */}
                {eventClockHint?.isOvernightSuggestion &&
                  eventEndDate === eventStartDate && (
                    <div
                      className="p-3 rounded-xl flex items-center justify-between gap-2 text-[13px]"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span>
                        Час завершення раніше за початок — можливо, це нічний
                        перехід на {eventClockHint.suggestedEndLocalDate}?
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setEventEndDate(eventClockHint.suggestedEndLocalDate)
                        }
                        data-testid="apply-overnight-date-button"
                      >
                        {
                          UK_STRINGS.creation.eventForm
                            .applyNextDaySuggestionButton
                        }
                      </Button>
                    </div>
                  )}

                {eventEndDate > eventStartDate && (
                  <div
                    className="px-3 py-2 rounded-xl text-[13px] font-medium flex items-center gap-2"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--color-work)',
                    }}
                    data-testid="overnight-shift-badge"
                  >
                    <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {UK_STRINGS.creation.eventForm.overnightSuggestedBadge}:{' '}
                      {eventStartDate} {eventStartTime} → {eventEndDate}{' '}
                      {eventEndTime}
                    </span>
                  </div>
                )}

                {eventClockHint?.isAmbiguousEqualClocks &&
                  eventEndDate === eventStartDate && (
                    <FeedbackBanner
                      tone="error"
                      message={UK_STRINGS.creation.eventForm.equalClocksWarning}
                    />
                  )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputField
                  label={UK_STRINGS.creation.eventForm.startDateLabel}
                  type="date"
                  lang="uk"
                  value={eventStartDate}
                  onChange={(e) => {
                    setEventStartDate(e.target.value);
                    if (eventEndDate < e.target.value) {
                      setEventEndDate(e.target.value);
                    }
                  }}
                  required
                />
                <InputField
                  label={
                    UK_STRINGS.creation.eventForm.allDayEndInclusiveLabel
                  }
                  type="date"
                  lang="uk"
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  required
                />
              </div>
            )}

            {selectedAction === 'event' && eventType !== 'work_shift' && (
              <label className="flex items-start justify-between gap-3 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div className="space-y-0.5">
                  <div className="text-[14px] font-medium">
                    {UK_STRINGS.creation.eventForm.blockingLabel}
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {UK_STRINGS.creation.eventForm.blockingDescription}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={eventIsBlocking}
                  onChange={(e) => setEventIsBlocking(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-[#B93E4B] cursor-pointer"
                  data-testid="create-event-blocking-checkbox"
                />
              </label>
            )}

            <TextAreaField
              label={UK_STRINGS.creation.eventForm.noteLabel}
              placeholder={UK_STRINGS.creation.eventForm.notePlaceholder}
              value={eventNote}
              onChange={(e) => setEventNote(e.target.value)}
              data-testid="create-event-note-input"
            />
          </div>
        )}

        {/* 8.1 / 8.3 Explicit Day-Off Annotation Form */}
        {selectedAction === 'day_off' && (
          <div className="space-y-3.5" data-testid="create-day-off-form">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label="Дата вихідного дня"
                type="date"
                lang="uk"
                value={dayOffDate}
                onChange={(e) => setDayOffDate(e.target.value)}
                data-testid="create-day-off-date-input"
                required
              />
              <InputField
                label="Код позначки"
                placeholder="Наприклад: В або ВИХ"
                value={dayOffCode}
                onChange={(e) => setDayOffCode(e.target.value)}
                data-testid="create-day-off-code-input"
                required
              />
            </div>
            <TextAreaField
              label="Нотатка (необов’язково)"
              placeholder="Наприклад: Вихідний за графіком"
              value={dayOffNote}
              onChange={(e) => setDayOffNote(e.target.value)}
              data-testid="create-day-off-note-input"
            />
          </div>
        )}

        {/* 5.3 / 5.4 Overlap Warning & Conscious Confirmation Checkbox */}
        {conflictPreview.hasConflicts && conflictPreview.warningMessageUk && (
          <div
            className="p-3.5 rounded-2xl space-y-2.5 border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--color-brand)',
            }}
            data-testid="schedule-conflict-warning-box"
          >
            <div className="flex items-start gap-2.5 text-[13px]">
              <AlertTriangle
                className="w-5 h-5 shrink-0 mt-0.5"
                style={{ color: 'var(--color-brand-text)' }}
                aria-hidden="true"
              />
              <span>{conflictPreview.warningMessageUk}</span>
            </div>
            <label className="flex items-center gap-2.5 text-[13px] font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={confirmConsciousOverlap}
                onChange={(e) => setConfirmConsciousOverlap(e.target.checked)}
                className="w-4 h-4 accent-[#B93E4B] cursor-pointer"
                data-testid="confirm-conscious-overlap-checkbox"
              />
              <span>
                {UK_STRINGS.creation.eventForm.confirmConsciousOverlapLabel}
              </span>
            </label>
          </div>
        )}

        {selectedAction === 'goal' && (
          <div className="space-y-3.5" data-testid="create-goal-form">
            <InputField
              label={UK_STRINGS.creation.goalForm.titleLabel}
              placeholder={UK_STRINGS.creation.goalForm.titlePlaceholder}
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              data-testid="create-goal-title-input"
              required
            />
            <TextAreaField
              label={UK_STRINGS.creation.goalForm.purposeLabel}
              placeholder={UK_STRINGS.creation.goalForm.purposePlaceholder}
              value={goalPurpose}
              onChange={(e) => setGoalPurpose(e.target.value)}
              data-testid="create-goal-purpose-input"
            />
            <TextAreaField
              label={UK_STRINGS.creation.goalForm.criteriaLabel}
              placeholder={UK_STRINGS.creation.goalForm.criteriaPlaceholder}
              value={goalCriteria}
              onChange={(e) => setGoalCriteria(e.target.value)}
              data-testid="create-goal-criteria-input"
            />
            <TextAreaField
              label={UK_STRINGS.creation.goalForm.implementationIntentionLabel}
              placeholder={
                UK_STRINGS.creation.goalForm.implementationIntentionPlaceholder
              }
              value={goalIntention}
              onChange={(e) => setGoalIntention(e.target.value)}
              data-testid="create-goal-intention-input"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label={UK_STRINGS.creation.goalForm.stateLabel}
                value={goalState}
                onChange={(e) => setGoalState(e.target.value as GoalState)}
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
                data-testid="create-goal-state-select"
              />
              <SelectField
                label={UK_STRINGS.creation.goalForm.nextActionLabel}
                value={goalNextActionTaskId}
                onChange={(e) => setGoalNextActionTaskId(e.target.value)}
                options={openTaskOptions}
                data-testid="create-goal-next-action-select"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label={UK_STRINGS.creation.goalForm.targetDateLabel}
                type="date"
                lang="uk"
                value={goalTargetDate ?? ''}
                onChange={(e) => setGoalTargetDate(e.target.value || null)}
                data-testid="create-goal-target-date-input"
              />
              <InputField
                label={UK_STRINGS.creation.goalForm.targetPeriodLabel}
                placeholder="Наприклад: Q3 2026 або До кінця року"
                value={goalTargetPeriod}
                onChange={(e) => setGoalTargetPeriod(e.target.value)}
                data-testid="create-goal-target-period-input"
              />
            </div>
          </div>
        )}

        {selectedAction === 'project' && (
          <div className="space-y-3.5">
            <InputField
              label={UK_STRINGS.creation.projectForm.titleLabel}
              placeholder={UK_STRINGS.creation.projectForm.titlePlaceholder}
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              data-testid="create-project-title-input"
              required
            />
            <TextAreaField
              label={UK_STRINGS.creation.projectForm.desiredOutcomeLabel}
              placeholder={
                UK_STRINGS.creation.projectForm.desiredOutcomePlaceholder
              }
              value={projectDesiredOutcome}
              onChange={(e) => setProjectDesiredOutcome(e.target.value)}
              data-testid="create-project-outcome-input"
            />
            <TextAreaField
              label={UK_STRINGS.creation.projectForm.criteriaLabel}
              placeholder={UK_STRINGS.creation.projectForm.criteriaPlaceholder}
              value={projectCriteria}
              onChange={(e) => setProjectCriteria(e.target.value)}
              data-testid="create-project-criteria-input"
            />
            <TextAreaField
              label={UK_STRINGS.creation.projectForm.descriptionLabel}
              placeholder={
                UK_STRINGS.creation.projectForm.descriptionPlaceholder
              }
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span
                  className="text-[15px] font-medium block"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {UK_STRINGS.creation.projectForm.targetDateLabel}
                </span>
                {projectTargetDate === null ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() =>
                      setProjectTargetDate(
                        new Date().toISOString().slice(0, 10)
                      )
                    }
                    data-testid="create-project-set-date-button"
                  >
                    Без дати — обрати дату
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      lang="uk"
                      value={projectTargetDate}
                      onChange={(e) =>
                        setProjectTargetDate(
                          e.target.value ? e.target.value : null
                        )
                      }
                      data-testid="create-project-target-date-input"
                      className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setProjectTargetDate(null)}
                    >
                      {UK_STRINGS.creation.clearDateIntention}
                    </Button>
                  </div>
                )}
              </div>
              <InputField
                label={UK_STRINGS.creation.projectForm.collaboratorsLabel}
                placeholder={
                  UK_STRINGS.creation.projectForm.collaboratorsPlaceholder
                }
                value={projectCollaborators}
                onChange={(e) => setProjectCollaborators(e.target.value)}
                data-testid="create-project-collaborators-input"
              />
            </div>
          </div>
        )}

        {selectedAction === 'stage' && (
          <div className="space-y-3.5">
            <InputField
              label={UK_STRINGS.creation.stageForm.titleLabel}
              placeholder={UK_STRINGS.creation.stageForm.titlePlaceholder}
              value={stageTitle}
              onChange={(e) => setStageTitle(e.target.value)}
              data-testid="create-stage-title-input"
              required
            />
            <TextAreaField
              label={UK_STRINGS.creation.stageForm.expectedOutcomeLabel}
              placeholder={
                UK_STRINGS.creation.stageForm.expectedOutcomePlaceholder
              }
              value={stageExpectedOutcome}
              onChange={(e) => setStageExpectedOutcome(e.target.value)}
              data-testid="create-stage-outcome-input"
            />
            <div className="space-y-1.5">
              <span
                className="text-[15px] font-medium block"
                style={{ color: 'var(--text-primary)' }}
              >
                {UK_STRINGS.creation.stageForm.targetDateLabel}
              </span>
              {stageTargetDate === null ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setStageTargetDate(new Date().toISOString().slice(0, 10))
                  }
                >
                  Без дати — обрати дату
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    lang="uk"
                    value={stageTargetDate}
                    onChange={(e) =>
                      setStageTargetDate(
                        e.target.value ? e.target.value : null
                      )
                    }
                    className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-[16px]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setStageTargetDate(null)}
                  >
                    {UK_STRINGS.creation.clearDateIntention}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedAction === 'folder' && (
          <div className="space-y-3.5">
            <InputField
              label={UK_STRINGS.creation.folderForm.nameLabel}
              placeholder={UK_STRINGS.creation.folderForm.namePlaceholder}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              data-testid="create-folder-name-input"
              required
            />
          </div>
        )}

        {selectedAction === 'habit' && (
          <div className="space-y-3.5" data-testid="create-habit-form">
            <InputField
              label="Назва звички"
              placeholder="Наприклад: Пити воду, Зарядка або Практика на інструменті"
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              data-testid="create-habit-name-input"
              required
            />

            <TextAreaField
              label="Опис або підказка (необов’язково)"
              placeholder="Що саме вважається виконанням цієї дії..."
              value={habitDescription}
              onChange={(e) => setHabitDescription(e.target.value)}
              data-testid="create-habit-description-input"
            />

            <InputField label="Мінімальна версія (текст, необов’язково)" value={habitMinimum} onChange={e => setHabitMinimum(e.target.value)} />
            <InputField label="Контекст / підказка (необов’язково)" placeholder="Наприклад: після пробудження" value={habitCue} onChange={e => setHabitCue(e.target.value)} />
            <InputField label="Мій намір нагадати собі (без будильника)" value={habitReminder} onChange={e => setHabitReminder(e.target.value)} />
            <SelectField label="Напрям (без проєкту)" value={editableContext.projectId ? '' : habitFolder} disabled={Boolean(editableContext.projectId)} onChange={e => setHabitFolder(e.target.value)} options={[{value:'',label:'Без напряму'},...folders.map(f => ({value:f.id,label:f.name}))]} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SelectField
                label="Піктограма"
                value={habitIcon}
                onChange={(e) => setHabitIcon(e.target.value)}
                options={[
                  { value: 'repeat', label: '↻ Регулярний ритм' },
                  { value: 'water', label: '💧 Вода / здоров’я' },
                  { value: 'run', label: '🏃 Рух / фізична форма' },
                  { value: 'sleep', label: '🌙 Сон і відновлення' },
                  { value: 'music', label: '🎵 Музика / творчість' },
                  { value: 'book', label: '📖 Читання / навчання' },
                ]}
                data-testid="create-habit-icon-select"
              />

              <SelectField
                label="Проєкт (необов’язково)"
                options={projectOptions}
                value={editableContext.projectId ?? ''}
                onChange={(e) =>
                  setEditableContext((prev) => ({
                    ...prev,
                    projectId: e.target.value ? e.target.value : null,
                  }))
                }
                data-testid="create-habit-project-select"
              />

              <SelectField
                label="Сфера життя (необов’язково)"
                options={[
                  { value: '', label: 'Без прив’язки до сфери' },
                  ...lifeAreaQuestions.filter(area => !area.archived && !area.mergedIntoId).map((la) => ({
                    value: la.id,
                    label: la.questionTextUk,
                  })),
                ]}
                value={habitLifeAreaId}
                onChange={(e) => setHabitLifeAreaId(e.target.value)}
                data-testid="create-habit-life-area-select"
              />
            </div>

            <div className="space-y-2">
              <span
                className="text-[14px] font-medium block"
                style={{ color: 'var(--text-primary)' }}
              >
                Правило розкладу (час лише за ручним плануванням)
              </span>
              <SegmentedControl<
                'daily' | 'days_off' | 'selected_weekdays' | 'weekly_frequency'
              >
                ariaLabel="Правило розкладу звички"
                value={habitRuleKind}
                onChange={setHabitRuleKind}
                options={[
                  { value: 'daily', label: 'Щодня' },
                  { value: 'days_off', label: 'Позначені вихідні' },
                  { value: 'selected_weekdays', label: 'Обрані дні' },
                  { value: 'weekly_frequency', label: 'Разів на тиждень' },
                ]}
              />

              {habitRuleKind === 'selected_weekdays' && (
                <div
                  className="pt-1 space-y-1.5"
                  data-testid="create-habit-weekdays-group"
                >
                  <span
                    className="text-[12px] block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Оберіть заплановані дні тижня (понеділок — неділя):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ISO_WEEKDAYS_UK.map((wd) => {
                      const selected = habitWeekdaysIso.includes(wd.iso);
                      return (
                        <button
                          key={wd.iso}
                          type="button"
                          aria-pressed={selected}
                          data-testid={`create-habit-weekday-${wd.iso}`}
                          onClick={() =>
                            setHabitWeekdaysIso((prev) =>
                              prev.includes(wd.iso)
                                ? prev.filter((d) => d !== wd.iso)
                                : [...prev, wd.iso].sort((a, b) => a - b)
                            )
                          }
                          className="min-w-[44px] min-h-[44px] px-2.5 py-1.5 rounded-xl text-[13px] font-semibold cursor-pointer planui-transition-micro"
                          style={{
                            backgroundColor: selected
                              ? 'var(--color-brand)'
                              : 'var(--bg-elevated)',
                            color: selected ? '#FFFFFF' : 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {wd.shortUk}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {habitRuleKind === 'weekly_frequency' && (
                <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    label="Кількість разів на тиждень (1–7)"
                    type="number"
                    min={1}
                    max={7}
                    value={habitTimesPerWeek}
                    onChange={(e) => setHabitTimesPerWeek(e.target.value)}
                    data-testid="create-habit-times-per-week-input"
                    required
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span
                className="text-[14px] font-medium block"
                style={{ color: 'var(--text-primary)' }}
              >
                Тип цілі на день
              </span>
              <SegmentedControl<'binary' | 'numeric'>
                ariaLabel="Тип цілі звички"
                value={habitTargetKind}
                onChange={setHabitTargetKind}
                options={[
                  { value: 'binary', label: 'Бінарна (Виконано / Пропущено)' },
                  { value: 'numeric', label: 'Числова ціль з одиницями' },
                ]}
              />

              {habitTargetKind === 'numeric' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <InputField
                    label="Денна норма (число > 0)"
                    type="number"
                    min={1}
                    step="any"
                    value={habitTargetValue}
                    onChange={(e) => setHabitTargetValue(e.target.value)}
                    data-testid="create-habit-target-value-input"
                    required
                  />
                  <InputField
                    label="Одиниці вимірювання"
                    placeholder="Наприклад: мл, хв, стор., разів"
                    value={habitUnitUk}
                    onChange={(e) => setHabitUnitUk(e.target.value)}
                    data-testid="create-habit-unit-input"
                    required
                  />
                </div>
              )}
            </div>

            <InputField
              label="Правило діє з дати"
              type="date"
              lang="uk"
              value={habitEffectiveFromDate}
              onChange={(e) => setHabitEffectiveFromDate(e.target.value)}
              data-testid="create-habit-effective-date-input"
              required
            />
          </div>
        )}

        {selectedAction === 'personal_record' && (
          <div className="space-y-3.5" data-testid="create-personal-record-form">
            <InputField label="Тривалість сну, хвилини (необов’язково)" type="number" min="0" max="1440" step="1" value={recordSleep} onChange={e => setRecordSleep(e.target.value)} />
            <SelectField label="Суб’єктивна якість сну" value={recordSleepQuality} onChange={e => setRecordSleepQuality(e.target.value)} options={[{value: '', label: 'Не вказано'}, ...['Дуже погана', 'Погана', 'Посередня', 'Добра', 'Дуже добра'].map((label,i) => ({value: String(i+1), label}))]} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SelectField
                label={PERSONAL_STATE_QUESTIONS_UK.mood}
                options={moodScaleOptions}
                value={recordMood}
                onChange={(e) => setRecordMood(e.target.value)}
                data-testid="create-record-mood-select"
              />
              <SelectField
                label={PERSONAL_STATE_QUESTIONS_UK.energy}
                options={energyScaleOptions}
                value={recordEnergy}
                onChange={(e) => setRecordEnergy(e.target.value)}
                data-testid="create-record-energy-select"
              />
              <SelectField
                label={PERSONAL_STATE_QUESTIONS_UK.stress}
                options={stressScaleOptions}
                value={recordStress}
                onChange={(e) => setRecordStress(e.target.value)}
                data-testid="create-record-stress-select"
              />
            </div>
            <p
              className="text-[12px] m-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {PERSONAL_STATE_QUESTIONS_UK.stressDirectionNotice}
            </p>
            <InputField
              label="Прості теги (через кому, необов’язково)"
              placeholder="Наприклад: нічна зміна, відновлення, думки"
              value={recordTagsInput}
              onChange={(e) => setRecordTagsInput(e.target.value)}
              data-testid="create-record-tags-input"
            />
          </div>
        )}

        {selectedAction === 'inspiration' && (
          <div className="space-y-3.5" data-testid="create-inspiration-form">
            <div className="space-y-1.5">
              <span
                className="text-[14px] font-medium block"
                style={{ color: 'var(--text-primary)' }}
              >
                Тип елемента натхнення
              </span>
              <SegmentedControl<InspirationItemKind>
                ariaLabel="Тип елемента натхнення"
                value={inspirationKind}
                onChange={setInspirationKind}
                options={[
                  { value: 'text', label: 'Нотатка' },
                  { value: 'quote', label: 'Цитата' },
                  { value: 'link', label: 'Посилання' },
                  { value: 'image', label: 'Зображення' },
                ]}
              />
            </div>

            <InputField
              label="Заголовок або автор (необов’язково)"
              placeholder="Коротка назва або джерело"
              value={inspirationTitle}
              onChange={(e) => setInspirationTitle(e.target.value)}
              data-testid="create-inspiration-title-input"
            />

            {(inspirationKind === 'text' || inspirationKind === 'quote') && (
              <TextAreaField
                label={
                  inspirationKind === 'quote'
                    ? 'Текст цитати'
                    : 'Текст ідеї або спостереження'
                }
                placeholder="Запишіть думку, ідею або цитату..."
                value={inspirationTextContent}
                onChange={(e) => setInspirationTextContent(e.target.value)}
                data-testid="create-inspiration-text-input"
                required
              />
            )}

            {inspirationKind === 'link' && (
              <div className="space-y-2.5">
                <InputField
                  label="Безпечне посилання (лише HTTP або HTTPS)"
                  placeholder="https://example.com"
                  type="url"
                  value={inspirationSafeUrl}
                  onChange={(e) => setInspirationSafeUrl(e.target.value)}
                  data-testid="create-inspiration-url-input"
                  required
                />
                <TextAreaField
                  label="Коментар (необов’язково)"
                  placeholder="Чому це посилання важливе..."
                  value={inspirationTextContent}
                  onChange={(e) => setInspirationTextContent(e.target.value)}
                />
              </div>
            )}

            {inspirationKind === 'image' && (
              <div className="space-y-2.5">
                <label className="block space-y-1.5">
                  <span
                    className="text-[14px] font-medium block"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Локальне растрове зображення (JPEG, PNG або WebP)
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    data-testid="create-inspiration-image-input"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        setInspirationImageFile(null);
                        return;
                      }
                      const buf = await file.arrayBuffer();
                      setInspirationImageFile({
                        bytes: new Uint8Array(buf),
                        mimeType: file.type,
                        fileName: file.name,
                      });
                    }}
                    className="w-full text-[14px]"
                  />
                </label>
                <p
                  className="text-[12px] m-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Підтримуються лише безпечні растрові формати JPEG, PNG та WebP.
                  Активний SVG і сторонні вкладення відхиляються.
                </p>
                <TextAreaField
                  label="Підпис (необов’язково)"
                  placeholder="Нотатка до зображення..."
                  value={inspirationTextContent}
                  onChange={(e) => setInspirationTextContent(e.target.value)}
                />
              </div>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer text-[14px]">
              <input
                type="checkbox"
                checked={inspirationIsFavorite}
                onChange={(e) => setInspirationIsFavorite(e.target.checked)}
                data-testid="create-inspiration-favorite-checkbox"
                className="w-4 h-4 accent-[#B93E4B]"
              />
              <span>Позначити як вибране</span>
            </label>
          </div>
        )}

        {selectedAction === 'wish' && (
          <div className="space-y-3.5" data-testid="create-wish-form">
            <InputField
              label="Назва бажання"
              placeholder="Що саме ви хочете придбати або спробувати?"
              value={wishTitle}
              onChange={(e) => setWishTitle(e.target.value)}
              data-testid="create-wish-title-input"
              required
            />

            <div className="flex items-center justify-between">
              <span
                className="text-[12px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Достатньо лише назви. Бажання не створює справ чи подій у календарі.
              </span>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => setShowWishDetails((prev) => !prev)}
                data-testid="toggle-wish-progressive-details"
              >
                {showWishDetails
                  ? 'Сховати деталі'
                  : 'Додаткові відомості'}
              </Button>
            </div>

            {showWishDetails && (
              <div
                className="space-y-3 pt-1 border-t"
                style={{ borderColor: 'var(--border-subtle)' }}
                data-testid="wish-progressive-details-section"
              >
                <WishExtrasFields value={wishExtras} onChange={setWishExtras} projects={projects} onError={setErrorMessage}/>
                <TextAreaField
                  label="Нотатка (необов’язково)"
                  placeholder="Деталі, характеристики або роздуми..."
                  value={wishNote}
                  onChange={(e) => setWishNote(e.target.value)}
                  data-testid="create-wish-note-input"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    label="Орієнтовна вартість (необов’язково)"
                    placeholder="Наприклад: 1250,50 або 0"
                    inputMode="decimal"
                    value={wishPriceInput}
                    onChange={(e) => setWishPriceInput(e.target.value)}
                    data-testid="create-wish-price-input"
                  />

                  <SelectField
                    label={
                      preferredWishlistCurrency
                        ? `Валюта (за замовчуванням ${preferredWishlistCurrency})`
                        : 'Валюта (обов’язково під час першої ціни)'
                    }
                    value={wishCurrencyInput}
                    onChange={(e) =>
                      setWishCurrencyInput(
                        e.target.value as SupportedCurrencyCode | ''
                      )
                    }
                    options={[
                      {
                        value: '',
                        label: preferredWishlistCurrency
                          ? `Використати ${preferredWishlistCurrency}`
                          : '— Оберіть валюту —',
                      },
                      ...Object.values(SUPPORTED_CURRENCIES).map((c) => ({
                        value: c.code,
                        label: c.labelUk,
                      })),
                    ]}
                    data-testid="create-wish-currency-select"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {selectedAction === 'wishlist_category' && (
          <div className="space-y-3.5" data-testid="create-wishlist-category-form">
            <InputField
              label="Назва категорії бажань"
              placeholder="Наприклад: Музика, Дім, Подорожі або Книги"
              value={wishlistCategoryName}
              onChange={(e) => setWishlistCategoryName(e.target.value)}
              data-testid="create-wishlist-category-name-input"
              required
            />
          </div>
        )}

        {errorMessage && (
          <FeedbackBanner
            tone="error"
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          {!globalQuickAdd && <Button variant="secondary" onClick={onClose}>{UK_STRINGS.app.cancelButton}</Button>}
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving}
            data-testid="shared-editor-submit-button"
          >
            {globalQuickAdd ? '↑ Додати' : UK_STRINGS.app.saveButton}
          </Button>
        </div>
      </form>
    </ModalSheet>
  );
};
