import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  DateField,
  DurationField,
  Icon,
  InlineBanner,
  InputField,
  Orb,
  Pill,
  RoundButton,
  Row,
  Section,
  SelectField,
  Sheet,
  TimeField,
  Toggle,
} from '../../ui';
import { areaColor } from '../../domain/modelHelpers';
import {
  buildDayOffAnnotationRecord,
  instantiateWorkShiftFromTemplate,
} from '../../domain/roster';
import {
  addDaysToLocalDate,
  buildMonthGridDates,
  buildZonedIntervalFromLocalInput,
  formatInstantInZone,
  MONDAY_FIRST_WEEKDAY_SHORT_UK,
  parseLocalDateParts,
  resolveLocalDateTimeToInstant,
} from '../../domain/temporal';
import {
  CalendarEvent,
  DayOffAnnotation,
  EventTemporalSchedule,
  Folder,
  FolderKind,
  Goal,
  Habit,
  HabitFrequencyRule,
  LifeAreaQuestion,
  Measure,
  OptionalModulesSettings,
  Project,
  ProjectStage,
  ShiftTemplate,
  SUPPORTED_CURRENCIES,
  SupportedCurrencyCode,
  Task,
  TaskEffort,
  TaskOwnership,
  TaskReservation,
  WishlistCategory,
  WishlistTimingGroup,
  ZonedInterval,
} from '../../domain/types';
import { buildWishItemRecord } from '../../domain/wishlist';
import { AnyDestinationId } from '../../i18n/uk';
import { formatDuration, formatShortDate } from '../../lib/format';
import {
  DestinationContextMap,
  EditableCreationContext,
  ImplementedCreationActionKind,
} from '../../state/shellStore';
import { PlanuiRepositories } from '../../storage/repositories';

const MONTH_NAMES_NOMINATIVE_UK = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
] as const;

function todayLocalDateInZone(zone: string): string {
  try {
    return formatInstantInZone(Date.now(), zone).localDate;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildZonedIntervalFromStartAndDuration(
  localDate: string,
  startHm: string,
  durationMinutes: number,
  zone: string
): ZonedInterval {
  const startRes = resolveLocalDateTimeToInstant(localDate, startHm, zone);
  const endWall = formatInstantInZone(
    startRes.epochMs + Math.max(5, durationMinutes) * 60_000,
    zone
  );
  return buildZonedIntervalFromLocalInput({
    startLocalDate: localDate,
    startLocalTime: startHm,
    endLocalDate: endWall.localDate,
    endLocalTime: endWall.localTime,
    originZone: zone,
  }).interval;
}

function buildZonedIntervalFromLocalRange(
  startLocalDate: string,
  startLocalTime: string,
  endLocalDate: string,
  endLocalTime: string,
  originZone: string
): ZonedInterval {
  return buildZonedIntervalFromLocalInput({
    startLocalDate,
    startLocalTime,
    endLocalDate,
    endLocalTime,
    originZone,
  }).interval;
}

function buildAllDaySchedule(
  startLocalDate: string,
  endLocalDateInclusive: string,
  originZone: string
): EventTemporalSchedule {
  return {
    kind: 'all_day',
    startLocalDate,
    endLocalDateExclusive: addDaysToLocalDate(endLocalDateInclusive, 1),
    originZone,
  };
}

function buildDefaultShiftTemplates(nowIso: string): ShiftTemplate[] {
  return [
    {
      id: 'day_default',
      name: 'Денна',
      code: 'Д',
      startLocalTime: '08:00',
      endLocalTime: '20:00',
      endDateOffsetDays: 0,
      color: 'work',
      note: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
    {
      id: 'night_default',
      name: 'Нічна',
      code: 'Н',
      startLocalTime: '20:00',
      endLocalTime: '08:00',
      endDateOffsetDays: 1,
      color: 'work',
      note: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    },
  ];
}

function flattenFoldersForSelect(
  folders: readonly Folder[]
): { folder: Folder; depth: number }[] {
  const byParent = new Map<string | null, Folder[]>();
  const validIds = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    const pid = f.parentId && validIds.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(pid) ?? [];
    list.push(f);
    byParent.set(pid, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  const out: { folder: Folder; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (pid: string | null, depth: number) => {
    for (const f of byParent.get(pid) ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export interface SharedEditorHostProps {
  globalQuickAdd?: boolean;
  isOpen: boolean;
  activeDestination: AnyDestinationId;
  contexts: DestinationContextMap;
  initialContext: EditableCreationContext;
  initialActionKind?: ImplementedCreationActionKind;
  enabledModules?: OptionalModulesSettings;
  activeZone: string;
  folders: readonly Folder[];
  goals: readonly Goal[];
  projects: readonly Project[];
  stages: readonly ProjectStage[];
  tasks: readonly Task[];
  reservations: readonly TaskReservation[];
  events: readonly CalendarEvent[];
  shiftTemplates: readonly ShiftTemplate[];
  dayOffAnnotations?: readonly DayOffAnnotation[];
  lifeAreaQuestions?: readonly LifeAreaQuestion[];
  wishlistCategories: readonly WishlistCategory[];
  preferredWishlistCurrency: SupportedCurrencyCode | null;
  repositories: PlanuiRepositories;
  onClose: () => void;
  onEntityCreated: (
    toastMessageUk: string,
    undoFn?: () => void
  ) => Promise<void> | void;
}

const TYPE_LABELS_UK: Partial<Record<ImplementedCreationActionKind, string>> = {
  task: 'Завдання',
  event: 'Подія',
  shift: 'Зміна',
  habit: 'Звичка',
  folder: 'Папка',
  project: 'Проєкт',
  goal: 'Ціль',
  wish: 'Бажання',
};

const TYPE_PLACEHOLDERS_UK: Partial<Record<ImplementedCreationActionKind, string>> = {
  task: 'Нове завдання…',
  event: 'Нова подія…',
  shift: 'Графік змін',
  habit: 'Нова звичка…',
  folder: 'Назва папки…',
  project: 'Назва проєкту…',
  goal: 'Назва цілі…',
  wish: 'Нове бажання…',
};

const MEASURE_UNITS = ['стор.', 'км', 'год', 'грн', 'разів'] as const;

type InlineChipKey =
  | 'area'
  | 'folder'
  | 'measure'
  | 'datetime'
  | 'duration'
  | 'effort'
  | 'project'
  | 'frequency'
  | 'minimum'
  | 'project_deadline'
  | 'goal_term'
  | 'wish_price'
  | 'wish_group';

function getContextTypes(
  activeDestination: AnyDestinationId,
  contexts: DestinationContextMap
): ImplementedCreationActionKind[] {
  if (activeDestination === 'calendar') {
    return ['event', 'shift', 'task'];
  }

  if (activeDestination === 'directions' || activeDestination === 'plans') {
    const subMode =
      (contexts.directions ?? contexts.plans)?.subMode ?? 'projects';
    if (subMode === 'goals') {
      return ['goal'];
    }
    return ['folder', 'project', 'task'];
  }

  if (activeDestination === 'me') {
    if (contexts.me.subView === 'wishlist') {
      return ['wish', 'folder'];
    }
    return ['task', 'habit', 'wish'];
  }

  // Default: 'today' — fixed pill order; activeType preselects 'habit' in habits mode
  return ['task', 'event', 'shift', 'habit'];
}

function getDefaultContextType(
  activeDestination: AnyDestinationId,
  contexts: DestinationContextMap,
  availableTypes: readonly ImplementedCreationActionKind[],
  initialActionKind?: ImplementedCreationActionKind
): ImplementedCreationActionKind {
  if (initialActionKind && availableTypes.includes(initialActionKind)) {
    return initialActionKind;
  }
  if (
    (activeDestination === 'today' || activeDestination === 'habits') &&
    contexts.today.mode === 'habits' &&
    availableTypes.includes('habit')
  ) {
    return 'habit';
  }
  return availableTypes[0] ?? 'task';
}

function getFolderKindForType(
  type: ImplementedCreationActionKind,
  activeDestination: AnyDestinationId,
  contexts: DestinationContextMap
): FolderKind {
  if (type === 'habit') return 'habits';
  if (type === 'wish') return 'wishes';
  if (type === 'project' || type === 'goal') return 'projects';
  if (type === 'folder') {
    if (activeDestination === 'me' && contexts.me.subView === 'wishlist') {
      return 'wishes';
    }
    if (activeDestination === 'today' && contexts.today.mode === 'habits') {
      return 'habits';
    }
    if (activeDestination === 'directions' || activeDestination === 'plans') {
      return 'projects';
    }
  }
  return 'tasks';
}

function supportsMeasure(type: ImplementedCreationActionKind): boolean {
  return (
    type === 'task' ||
    type === 'habit' ||
    type === 'goal' ||
    type === 'project' ||
    type === 'wish'
  );
}

export const QuickAddSheet: React.FC<SharedEditorHostProps> = ({
  isOpen,
  activeDestination,
  contexts,
  initialContext,
  initialActionKind,
  enabledModules,
  activeZone,
  folders,
  goals,
  projects,
  tasks,
  events,
  shiftTemplates,
  dayOffAnnotations = [],
  lifeAreaQuestions = [],
  preferredWishlistCurrency,
  repositories,
  onClose,
  onEntityCreated,
}) => {
  const todayDate = useMemo(
    () => todayLocalDateInZone(activeZone),
    [activeZone]
  );

  const availableTypes = useMemo(
    () => getContextTypes(activeDestination, contexts),
    [activeDestination, contexts]
  );

  const [activeType, setActiveType] = useState<ImplementedCreationActionKind>(
    () =>
      getDefaultContextType(
        activeDestination,
        contexts,
        availableTypes,
        initialActionKind
      )
  );

  const [title, setTitle] = useState('');
  const [openChip, setOpenChip] = useState<InlineChipKey | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Common chip states
  const [areaId, setAreaId] = useState<string>('');
  const [folderId, setFolderId] = useState<string>(
    initialContext.folderId ?? ''
  );

  // Measure chip state
  const [measureUnit, setMeasureUnit] = useState<string>('');
  const [measureTarget, setMeasureTarget] = useState<string>('');
  const [measureCurrent, setMeasureCurrent] = useState<string>('0');

  // Task / Event chip states
  const [itemDate, setItemDate] = useState<string>(
    initialContext.targetDate ?? todayDate
  );
  const [itemEndDate, setItemEndDate] = useState<string>(
    initialContext.targetDate ?? todayDate
  );
  const [itemTime, setItemTime] = useState<string>('');
  const [isAllDay, setIsAllDay] = useState<boolean>(false);
  const [isMultiDay, setIsMultiDay] = useState<boolean>(false);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [hasDuration, setHasDuration] = useState<boolean>(false);
  const [effort, setEffort] = useState<TaskEffort | null>(null);
  const [projectId, setProjectId] = useState<string>(
    initialContext.projectId ?? ''
  );

  // Habit chip states
  const [habitFreqKind, setHabitFreqKind] = useState<
    'daily' | 'weekly' | 'days_off' | 'after_wakeup'
  >('daily');
  const [habitTimesPerWeek, setHabitTimesPerWeek] = useState<number>(3);
  const [habitMinimumUk, setHabitMinimumUk] = useState<string>('');

  // Project / Goal chip states
  const [projectTargetDate, setProjectTargetDate] = useState<string>('');
  const [goalTermStart, setGoalTermStart] = useState<string>(todayDate);
  const [goalTermEnd, setGoalTermEnd] = useState<string>('');

  // Wish chip states
  const [wishPrice, setWishPrice] = useState<string>('');
  const [wishCurrency, setWishCurrency] = useState<SupportedCurrencyCode>(
    preferredWishlistCurrency ?? 'UAH'
  );
  const [wishTiming, setWishTiming] = useState<WishlistTimingGroup>('later');

  // Shift ("Зміна") stamp flow states
  const [stampMonthYear, setStampMonthYear] = useState<{
    year: number;
    month: number;
  }>(() => {
    const p = parseLocalDateParts(initialContext.targetDate ?? todayDate);
    return { year: p?.year ?? 2026, month: p?.month ?? 1 };
  });
  const [stampTool, setStampTool] = useState<string>('day_default');
  const [newTplOpen, setNewTplOpen] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplStart, setNewTplStart] = useState('08:00');
  const [newTplEnd, setNewTplEnd] = useState('20:00');
  const [cycleWorkDays, setCycleWorkDays] = useState<number>(2);
  const [cycleOffDays, setCycleOffDays] = useState<number>(2);
  const [cycleStartDate, setCycleStartDate] = useState<string>(
    initialContext.targetDate ?? todayDate
  );
  const [cycleUntilDate, setCycleUntilDate] = useState<string>(
    addDaysToLocalDate(initialContext.targetDate ?? todayDate, 27)
  );
  const [cycleExpanded, setCycleExpanded] = useState(false);
  const isPointerStampingRef = useRef(false);
  const stampedInGestureRef = useRef<Set<string>>(new Set());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const defaultType = getDefaultContextType(
      activeDestination,
      contexts,
      availableTypes,
      initialActionKind
    );
    setActiveType(defaultType);
    setTitle('');
    setOpenChip(null);
    setAreaId('');
    setFolderId(initialContext.folderId ?? '');
    setMeasureUnit('');
    setMeasureTarget('');
    setMeasureCurrent('0');
    const baseDate = initialContext.targetDate ?? todayDate;
    setItemDate(baseDate);
    setItemEndDate(baseDate);
    setItemTime(defaultType === 'event' ? '17:30' : '');
    setIsAllDay(false);
    setIsMultiDay(false);
    setDurationMinutes(60);
    setHasDuration(defaultType === 'event');
    setEffort(null);
    setProjectId(initialContext.projectId ?? '');
    setHabitFreqKind('daily');
    setHabitTimesPerWeek(3);
    setHabitMinimumUk('');
    setProjectTargetDate('');
    setGoalTermStart(todayDate);
    setGoalTermEnd('');
    setWishPrice('');
    setWishCurrency(preferredWishlistCurrency ?? 'UAH');
    setWishTiming('later');
    setError(null);

    if (defaultType !== 'shift') {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
      });
    }
  }, [
    isOpen,
    activeDestination,
    contexts,
    initialActionKind,
    availableTypes,
    initialContext.folderId,
    initialContext.projectId,
    initialContext.targetDate,
    todayDate,
    preferredWishlistCurrency,
  ]);

  const activeAreas = useMemo(
    () => lifeAreaQuestions.filter((a) => !a.archived && !a.mergedIntoId),
    [lifeAreaQuestions]
  );

  const selectedArea = useMemo(
    () => activeAreas.find((a) => a.id === areaId) ?? null,
    [activeAreas, areaId]
  );

  const currentFolderKind = useMemo(
    () => getFolderKindForType(activeType, activeDestination, contexts),
    [activeType, activeDestination, contexts]
  );

  const folderOptions = useMemo(() => {
    const matching = folders.filter(
      (f) => !f.kind || f.kind === currentFolderKind
    );
    return flattenFoldersForSelect(matching);
  }, [folders, currentFolderKind]);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === folderId) ?? null,
    [folders, folderId]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  // Built-in + user shift templates for type === 'shift'
  const builtInTemplates = useMemo(
    () => buildDefaultShiftTemplates('2026-01-01T00:00:00.000Z'),
    []
  );
  const allShiftTemplates = useMemo(() => {
    const hasDay = shiftTemplates.some((t) => t.endDateOffsetDays === 0);
    const hasNight = shiftTemplates.some((t) => t.endDateOffsetDays === 1);
    const list: ShiftTemplate[] = [...shiftTemplates];
    if (!hasDay && builtInTemplates[0]) list.unshift(builtInTemplates[0]);
    if (!hasNight && builtInTemplates[1]) list.push(builtInTemplates[1]);
    return list;
  }, [shiftTemplates, builtInTemplates]);

  useEffect(() => {
    if (
      activeType === 'shift' &&
      stampTool !== 'day_off' &&
      !allShiftTemplates.some((t) => t.id === stampTool)
    ) {
      setStampTool(allShiftTemplates[0]?.id ?? 'day_off');
    }
  }, [activeType, stampTool, allShiftTemplates]);

  const toggleChip = (key: InlineChipKey) => {
    setOpenChip((prev) => (prev === key ? null : key));
  };

  const buildCurrentMeasure = (): Measure | null => {
    const unit = measureUnit.trim();
    const targetNum = measureTarget.trim() ? Number(measureTarget) : null;
    const currentNum = measureCurrent.trim() ? Number(measureCurrent) : 0;
    if (!unit && targetNum === null) return null;
    return {
      unit: unit || 'од.',
      target: Number.isFinite(targetNum) ? targetNum : null,
      current: Number.isFinite(currentNum) ? currentNum : 0,
      log: [],
    };
  };

  const measureChipLabel = useMemo(() => {
    const m = buildCurrentMeasure();
    if (!m) return 'Вимір';
    if (m.target != null) {
      return `${m.current} / ${m.target} ${m.unit}`.trim();
    }
    return `${m.current} ${m.unit}`.trim();
  }, [measureUnit, measureTarget, measureCurrent]);

  const dateTimeChipLabel = useMemo(() => {
    const datePart =
      itemDate === todayDate
        ? 'Сьогодні'
        : itemDate === addDaysToLocalDate(todayDate, 1)
        ? 'Завтра'
        : formatShortDate(itemDate);
    if (isAllDay) {
      return isMultiDay && itemEndDate > itemDate
        ? `${datePart} – ${formatShortDate(itemEndDate)}`
        : `${datePart} · Весь день`;
    }
    if (itemTime) {
      return `${datePart} ${itemTime.slice(0, 5)}`;
    }
    return datePart;
  }, [itemDate, itemEndDate, itemTime, isAllDay, isMultiDay, todayDate]);

  const durationChipLabel = useMemo(() => {
    if (!hasDuration && !itemTime) return 'Тривалість';
    return formatDuration(durationMinutes);
  }, [hasDuration, itemTime, durationMinutes]);

  const effortChipLabel = useMemo(() => {
    if (effort === 'small') return '•';
    if (effort === 'medium') return '••';
    if (effort === 'large') return '•••';
    return 'Зусилля';
  }, [effort]);

  const habitFrequencyChipLabel = useMemo(() => {
    if (habitFreqKind === 'daily') return 'Щодня';
    if (habitFreqKind === 'weekly') return `${habitTimesPerWeek} р./тижд.`;
    if (habitFreqKind === 'days_off') return 'У вихідні від роботи';
    return 'Після пробудження';
  }, [habitFreqKind, habitTimesPerWeek]);

  // Stamp single date in Зміна mode
  const handleStampDate = async (localDate: string) => {
    const nowIso = new Date().toISOString();
    try {
      // make sure any built-in template used is persisted first
      const selectedTpl = allShiftTemplates.find((t) => t.id === stampTool);
      if (
        selectedTpl &&
        !shiftTemplates.some((t) => t.id === selectedTpl.id)
      ) {
        await repositories.saveShiftTemplate({
          ...selectedTpl,
          areaId: areaId || null,
          updatedAt: nowIso,
        });
      }

      const existingShiftsOnDay = events.filter(
        (e) =>
          e.state === 'active' &&
          e.type === 'work_shift' &&
          e.schedule.kind === 'timed' &&
          e.schedule.interval.originStartLocalDate === localDate
      );
      const existingDayOff = dayOffAnnotations.find(
        (d) => d.localDate === localDate
      );

      const eventsToSave: CalendarEvent[] = [];
      const dayOffAnnotationsToSave: DayOffAnnotation[] = [];
      const eventIdsToDelete: string[] = [];
      const dayOffAnnotationIdsToDelete: string[] = [];

      if (stampTool === 'day_off') {
        if (existingDayOff) {
          dayOffAnnotationIdsToDelete.push(existingDayOff.id);
        } else {
          const ann = buildDayOffAnnotationRecord({
            id: `dayoff-${localDate}`,
            localDate,
            sourceZone: activeZone,
            code: 'В',
            note: null,
            nowIso,
          });
          dayOffAnnotationsToSave.push({
            ...ann,
            areaId: areaId || null,
          });
        }
      } else if (selectedTpl) {
        const sameTplShift = existingShiftsOnDay.find(
          (e) => e.workProperties?.sourceTemplateId === selectedTpl.id
        );
        if (sameTplShift && existingShiftsOnDay.length === 1) {
          eventIdsToDelete.push(sameTplShift.id);
        } else {
          for (const oldShift of existingShiftsOnDay) {
            eventIdsToDelete.push(oldShift.id);
          }
          const { event: builtEv } = instantiateWorkShiftFromTemplate({
            id: `shift-${localDate}-${selectedTpl.id}-${Date.now()}`,
            template: selectedTpl,
            startLocalDate: localDate,
            zoneId: activeZone,
            nowIso,
          });
          eventsToSave.push({
            ...builtEv,
            areaId: areaId || selectedTpl.areaId || null,
            lifeAreaId: areaId || selectedTpl.areaId || null,
            folderId: folderId || null,
          });
        }
      }

      if (
        eventsToSave.length > 0 ||
        dayOffAnnotationsToSave.length > 0 ||
        eventIdsToDelete.length > 0 ||
        dayOffAnnotationIdsToDelete.length > 0
      ) {
        await repositories.applyRosterBatchTransactionally(
          {
            eventsToSave,
            dayOffAnnotationsToSave,
            eventIdsToDelete,
            dayOffAnnotationIdsToDelete,
          },
          nowIso
        );
        await onEntityCreated('');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не вдалося оновити зміну.'
      );
    }
  };

  const handleApplyCyclePattern = async () => {
    const selectedTpl =
      allShiftTemplates.find((t) => t.id === stampTool) ??
      allShiftTemplates[0];
    if (!selectedTpl) return;
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      if (!shiftTemplates.some((t) => t.id === selectedTpl.id)) {
        await repositories.saveShiftTemplate({
          ...selectedTpl,
          areaId: areaId || null,
          updatedAt: nowIso,
        });
      }
      const eventsToSave: CalendarEvent[] = [];
      const dayOffAnnotationsToSave: DayOffAnnotation[] = [];
      const eventIdsToDelete: string[] = [];
      const workCount = Math.max(1, Math.min(14, cycleWorkDays));
      const offCount = Math.max(1, Math.min(14, cycleOffDays));
      const cycleLen = workCount + offCount;
      let cursor = cycleStartDate;
      let safety = 0;
      while (cursor <= cycleUntilDate && safety < 120) {
        const pos = safety % cycleLen;
        if (pos < workCount) {
          for (const oldShift of events.filter(
            (e) =>
              e.state === 'active' &&
              e.type === 'work_shift' &&
              e.schedule.kind === 'timed' &&
              e.schedule.interval.originStartLocalDate === cursor
          )) {
            if (!eventIdsToDelete.includes(oldShift.id)) {
              eventIdsToDelete.push(oldShift.id);
            }
          }
          const { event: builtEv } = instantiateWorkShiftFromTemplate({
            id: `shift-${cursor}-${selectedTpl.id}-${safety}-${Date.now()}`,
            template: selectedTpl,
            startLocalDate: cursor,
            zoneId: activeZone,
            nowIso,
          });
          eventsToSave.push({
            ...builtEv,
            areaId: areaId || selectedTpl.areaId || null,
            lifeAreaId: areaId || selectedTpl.areaId || null,
            folderId: folderId || null,
          });
        } else {
          const existingDayOff = dayOffAnnotations.find(
            (d) => d.localDate === cursor
          );
          const ann = buildDayOffAnnotationRecord({
            id: existingDayOff?.id ?? `dayoff-${cursor}`,
            localDate: cursor,
            sourceZone: activeZone,
            code: 'В',
            note: null,
            nowIso,
          });
          dayOffAnnotationsToSave.push({
            ...ann,
            revision: existingDayOff ? existingDayOff.revision + 1 : 1,
            areaId: areaId || null,
          });
        }
        cursor = addDaysToLocalDate(cursor, 1);
        safety++;
      }

      if (eventsToSave.length > 0 || dayOffAnnotationsToSave.length > 0) {
        const res = await repositories.applyRosterBatchTransactionally(
          {
            eventsToSave,
            dayOffAnnotationsToSave,
            eventIdsToDelete,
          },
          nowIso
        );
        setCycleExpanded(false);
        await onEntityCreated('Додано', () => {
          void repositories
            .undoRosterBatchTransactionally(res.undoToken, new Date().toISOString())
            .then(() => onEntityCreated(''));
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не вдалося заповнити цикл.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNewTemplate = async () => {
    const trimmed = newTplName.trim();
    if (!trimmed) return;
    const nowIso = new Date().toISOString();
    const isOvernight = newTplEnd <= newTplStart;
    const tpl: ShiftTemplate = {
      id: `stpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      code: trimmed.slice(0, 2).toUpperCase(),
      startLocalTime: newTplStart.slice(0, 5),
      endLocalTime: newTplEnd.slice(0, 5),
      endDateOffsetDays: isOvernight ? 1 : 0,
      color: 'work',
      note: null,
      areaId: areaId || null,
      folderId: folderId || null,
      createdAt: nowIso,
      updatedAt: nowIso,
      revision: 1,
    };
    await repositories.saveShiftTemplate(tpl);
    setStampTool(tpl.id);
    setNewTplName('');
    setNewTplOpen(false);
    await onEntityCreated('');
  };

  const handleSaveItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (activeType === 'shift') {
      onClose();
      return;
    }

    const trimmed = title.trim();
    if (!trimmed) {
      setError('Введіть назву.');
      return;
    }

    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    const measure = supportsMeasure(activeType) ? buildCurrentMeasure() : null;

    try {
      if (activeType === 'task') {
        const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const ownership: TaskOwnership = projectId
          ? { kind: 'project', projectId, stageId: null }
          : folderId
          ? { kind: 'folder', folderId }
          : { kind: 'standalone', folderId: null };

        const isTimed = Boolean(!isAllDay && itemTime);
        const taskRecord: Task = {
          id,
          title: trimmed,
          description: null,
          state: 'open',
          priority: 'normal',
          deadline: null,
          estimatedDurationMinutes:
            hasDuration || isTimed ? durationMinutes : null,
          effort,
          planningState: isTimed
            ? 'timed'
            : itemDate
            ? 'date_only'
            : 'unplanned',
          plannedDate: isTimed ? null : itemDate || null,
          ownership,
          folderId: folderId || null,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          measure,
          order: tasks.length,
          checklist: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null,
          canceledAt: null,
          revision: 1,
        };

        await repositories.saveTask(taskRecord);

        if (isTimed && itemDate) {
          const interval = buildZonedIntervalFromStartAndDuration(
            itemDate,
            itemTime.slice(0, 5),
            Math.max(15, durationMinutes || 30),
            activeZone
          );
          await repositories.saveReservationTransactionally(
            {
              id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              taskId: id,
              interval,
              state: 'active',
              releaseMetadata: null,
              createdAt: nowIso,
              updatedAt: nowIso,
              revision: 1,
            }
          );
        }

        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteTaskTransactionally(id)
            .then(() => onEntityCreated(''));
        });
        return;
      }

      if (activeType === 'event') {
        const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const startD = itemDate || todayDate;
        const schedule = isAllDay
          ? buildAllDaySchedule(
              startD,
              isMultiDay && itemEndDate >= startD ? itemEndDate : startD,
              activeZone
            )
          : isMultiDay && itemEndDate > startD
          ? {
              kind: 'timed' as const,
              interval: buildZonedIntervalFromLocalRange(
                startD,
                (itemTime || '09:00').slice(0, 5),
                itemEndDate,
                '18:00',
                activeZone
              ),
            }
          : {
              kind: 'timed' as const,
              interval: buildZonedIntervalFromStartAndDuration(
                startD,
                (itemTime || '17:30').slice(0, 5),
                Math.max(15, durationMinutes || 60),
                activeZone
              ),
            };

        const eventRecord: CalendarEvent = {
          id,
          title: trimmed,
          note: null,
          type: 'personal',
          color: 'personal',
          schedule,
          isBlocking: true,
          state: 'active',
          workProperties: null,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          folderId: folderId || null,
          order: events.length,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        };

        await repositories.saveCalendarEvent(eventRecord);
        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteCalendarEventTransactionally(id)
            .then(() => onEntityCreated(''));
        });
        return;
      }

      if (activeType === 'habit') {
        const id = `habit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const rule: HabitFrequencyRule =
          habitFreqKind === 'weekly'
            ? { kind: 'weekly_frequency', timesPerWeek: habitTimesPerWeek }
            : habitFreqKind === 'days_off'
            ? { kind: 'days_off' }
            : { kind: 'daily' };

        const habitRecord: Habit = {
          id,
          name: trimmed,
          description: null,
          icon: null,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          projectId: projectId || null,
          folderId: folderId || null,
          minimumVersionUk: habitMinimumUk.trim() || null,
          contextCueUk:
            habitFreqKind === 'after_wakeup' ? 'Після пробудження' : null,
          reminderIntentionUk: null,
          measure,
          state: 'active',
          ruleRevisions: [
            {
              id: `hrev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              effectiveFromLocalDate: todayDate,
              rule,
              target:
                measure && measure.target != null
                  ? {
                      kind: 'numeric',
                      targetValue: measure.target,
                      unitUk: measure.unit || 'од.',
                    }
                  : { kind: 'binary' },
              createdAt: nowIso,
            },
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        };

        await repositories.saveHabit(habitRecord);
        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteHabitWithHistoryTransactionally(id)
            .then(() => onEntityCreated(''));
        });
        return;
      }

      if (activeType === 'project') {
        const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const projRecord: Project = {
          id,
          title: trimmed,
          description: null,
          desiredOutcome: null,
          completionCriteria: null,
          targetDate: projectTargetDate || null,
          folderId: folderId || null,
          goalId: initialContext.goalId ?? null,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          measure,
          order: projects.length,
          collaboratorText: null,
          state: 'active',
          archived: false,
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null,
          revision: 1,
        };
        await repositories.saveProject(projRecord);
        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteProjectTransactionally(id, 'delete_tasks', new Date().toISOString())
            .then(() => onEntityCreated(''));
        });
        return;
      }

      if (activeType === 'goal') {
        const id = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const goalRecord: Goal = {
          id,
          title: trimmed,
          description: null,
          purposeUk: null,
          completionCriteriaUk: null,
          nextActionTaskId: null,
          timing: goalTermEnd
            ? { targetDate: goalTermEnd, targetPeriodUk: null }
            : null,
          termStart: goalTermStart || null,
          termEnd: goalTermEnd || null,
          folderId: folderId || null,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          implementationIntentionUk: null,
          measure,
          state: 'active',
          archived: false,
          order: goals.length,
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null,
          revision: 1,
        };
        await repositories.saveGoal(goalRecord);
        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteGoalTransactionally(
              id,
              'delete_direct_tasks',
              new Date().toISOString()
            )
            .then(() => onEntityCreated(''));
        });
        return;
      }

      if (activeType === 'wish') {
        const id = `wish-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { wish } = buildWishItemRecord({
          id,
          title: trimmed,
          note: null,
          categoryId: null,
          timing: wishTiming,
          rawPriceAmount: wishPrice.trim() ? wishPrice.trim() : null,
          currencyCode: wishPrice.trim() ? wishCurrency : null,
          preferredCurrency: preferredWishlistCurrency,
          nowIso,
        });
        await repositories.saveWishItem({
          ...wish,
          areaId: areaId || null,
          folderId: folderId || null,
          measure,
        });
        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteWishItemTransactionally(id, new Date().toISOString())
            .then(() => onEntityCreated(''));
        });
        return;
      }

      if (activeType === 'folder') {
        const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const folderRecord: Folder = {
          id,
          kind: currentFolderKind,
          name: trimmed,
          parentId: folderId || null,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          order: folders.length,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        };
        await repositories.saveFolder(folderRecord);
        onClose();
        await onEntityCreated('Додано', () => {
          void repositories
            .deleteFolderTransactionally(
              id,
              'rehome_to_parent',
              new Date().toISOString()
            )
            .then(() => onEntityCreated(''));
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не вдалося зберегти запис.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Month cells for type === 'shift'
  const stampCells = useMemo(
    () =>
      buildMonthGridDates(
        `${String(stampMonthYear.year).padStart(4, '0')}-${String(
          stampMonthYear.month
        ).padStart(2, '0')}-01`
      ),
    [stampMonthYear]
  );

  const shiftsByStartDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (
        ev.state === 'active' &&
        ev.type === 'work_shift' &&
        ev.schedule.kind === 'timed'
      ) {
        const d = ev.schedule.interval.originStartLocalDate;
        const arr = map.get(d) ?? [];
        arr.push(ev);
        map.set(d, arr);
      }
    }
    return map;
  }, [events]);

  const dayOffByDate = useMemo(() => {
    const set = new Set<string>();
    for (const d of dayOffAnnotations) {
      set.add(d.localDate);
    }
    return set;
  }, [dayOffAnnotations]);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={TYPE_LABELS_UK[activeType] ?? 'Створити'}
      quickAdd
      footer={
        activeType === 'shift' ? (
          <Button
            variant="primary"
            onClick={onClose}
            data-testid="shared-editor-submit-button"
          >
            Готово
          </Button>
        ) : (
          <div className="flex items-center justify-end w-full">
            <button
              type="button"
              disabled={busy || !title.trim()}
              aria-label="Додати"
              data-testid="shared-editor-submit-button"
              onClick={() => void handleSaveItem()}
              className="quick-add-submit-btn w-12 h-12 rounded-full bg-[var(--ink)] text-[var(--on-ink)] inline-grid place-items-center shadow-md disabled:opacity-25 cursor-pointer"
            >
              <Icon name="arrow-up" size={20} />
            </button>
          </div>
        )
      }
    >
      <div className="stage2-quick space-y-3" data-testid="quick-add-sheet">
        {error && <InlineBanner tone="error">{error}</InlineBanner>}

        {/* Big borderless 24px/600 title field (auto-focus; Enter saves title-only item; 1px hairline below) */}
        {activeType !== 'shift' && (
          <form
            className="quick-add-title-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveItem();
            }}
          >
            <input
              ref={titleInputRef}
              type="text"
              lang="uk"
              autoCapitalize="sentences"
              enterKeyHint="done"
              autoFocus
              aria-label="Назва"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSaveItem();
                }
              }}
              placeholder={TYPE_PLACEHOLDERS_UK[activeType] ?? 'Назва…'}
              data-testid="create-task-title-input"
              className="quick-add-title-input"
            />
          </form>
        )}

        {/* ONE scrolling row of type pills (selected = ink, fixed order, edge-to-edge) */}
        <div
          className="ui-pill-row quick-add-pill-row"
          role="radiogroup"
          aria-label="Тип запису"
          data-testid="quick-add-type-pills"
        >
          {availableTypes.map((typeKey) => (
            <Pill
              key={typeKey}
              selected={activeType === typeKey}
              onClick={() => {
                setActiveType(typeKey);
                setOpenChip(null);
              }}
              data-testid={`creation-type-pill-${typeKey}`}
            >
              {TYPE_LABELS_UK[typeKey] ?? typeKey}
            </Pill>
          ))}
        </div>

        {/* Type "Зміна" = the stamp flow inside QuickAddSheet (tall detent) */}
        {activeType === 'shift' ? (
          <div className="space-y-3" data-testid="quick-add-shift-stamp-flow">
            {/* Template pills (Денна 08:00-20:00, Нічна 20:00-08:00, + Нова, Вихідний, Сфера) */}
            <div
              className="ui-pill-row quick-add-pill-row"
              role="group"
              aria-label="Шаблони змін"
            >
              {allShiftTemplates.map((tpl) => {
                const isNight = tpl.endDateOffsetDays === 1;
                return (
                  <Pill
                    key={tpl.id}
                    selected={stampTool === tpl.id}
                    onClick={() => setStampTool(tpl.id)}
                    data-testid={`shift-template-pill-${tpl.id}`}
                  >
                    <Icon name={isNight ? 'moon' : 'sun'} size={14} />
                    <span>
                      {tpl.name} {tpl.startLocalTime.slice(0, 5)}-
                      {tpl.endLocalTime.slice(0, 5)}
                    </span>
                  </Pill>
                );
              })}
              <Pill
                selected={stampTool === 'day_off'}
                onClick={() => setStampTool('day_off')}
                data-testid="shift-stamp-dayoff-pill"
              >
                Вихідний
              </Pill>
              <Pill
                selected={newTplOpen}
                onClick={() => setNewTplOpen((v) => !v)}
                data-testid="shift-stamp-new-template-pill"
              >
                + Нова
              </Pill>
              <Pill
                selected={openChip === 'area'}
                onClick={() => toggleChip('area')}
                data-testid="shift-stamp-area-chip"
              >
                <Orb
                  color={areaColor(selectedArea?.rating ?? null)}
                  size={16}
                />
                <span>{selectedArea ? selectedArea.questionTextUk : 'Сфера'}</span>
              </Pill>
            </div>

            {newTplOpen && (
              <Section>
                <div className="p-3 space-y-2">
                  <InputField
                    label="Назва зміни"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    placeholder="Наприклад: Ранкова"
                  />
                  <TimeField
                    label="Початок"
                    value={newTplStart}
                    onChange={(e) => setNewTplStart(e.target.value)}
                  />
                  <TimeField
                    label="Кінець"
                    value={newTplEnd}
                    onChange={(e) => setNewTplEnd(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void handleSaveNewTemplate()}
                  >
                    Додати шаблон
                  </Button>
                </div>
              </Section>
            )}

            {openChip === 'area' && (
              <div
                className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2"
                data-testid="inline-panel-area"
              >
                <div className="flex flex-wrap gap-2">
                  <Pill
                    selected={!areaId}
                    onClick={() => {
                      setAreaId('');
                      setOpenChip(null);
                    }}
                  >
                    Без сфери
                  </Pill>
                  {activeAreas.slice(0, 10).map((area) => (
                    <Pill
                      key={area.id}
                      selected={areaId === area.id}
                      onClick={() => {
                        setAreaId(area.id);
                        setOpenChip(null);
                      }}
                    >
                      <Orb color={areaColor(area.rating ?? null)} size={18} />
                      <span>{area.questionTextUk}</span>
                    </Pill>
                  ))}
                </div>
              </div>
            )}

            {/* Compact month grid in stamp mode (tap/drag to stamp; marks update live) */}
            <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <RoundButton
                  aria-label="Попередній місяць"
                  onClick={() =>
                    setStampMonthYear((prev) =>
                      prev.month === 1
                        ? { year: prev.year - 1, month: 12 }
                        : { year: prev.year, month: prev.month - 1 }
                    )
                  }
                >
                  <Icon name="chevron-left" size={18} />
                </RoundButton>
                <span className="text-sm font-bold">
                  {MONTH_NAMES_NOMINATIVE_UK[stampMonthYear.month - 1]}{' '}
                  {stampMonthYear.year}
                </span>
                <RoundButton
                  aria-label="Наступний місяць"
                  onClick={() =>
                    setStampMonthYear((prev) =>
                      prev.month === 12
                        ? { year: prev.year + 1, month: 1 }
                        : { year: prev.year, month: prev.month + 1 }
                    )
                  }
                >
                  <Icon name="chevron-right" size={18} />
                </RoundButton>
              </div>

              <div
                className="calendar-grid calendar-grid-compact"
                onPointerUp={() => {
                  isPointerStampingRef.current = false;
                  stampedInGestureRef.current.clear();
                }}
                onPointerCancel={() => {
                  isPointerStampingRef.current = false;
                  stampedInGestureRef.current.clear();
                }}
              >
                <div className="calendar-weekdays">
                  {MONDAY_FIRST_WEEKDAY_SHORT_UK.map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div
                  className="calendar-cells"
                  data-testid="quick-add-stamp-month-grid"
                >
                  {stampCells.map((cell) => {
                    const dayShifts =
                      shiftsByStartDate.get(cell.localDate) ?? [];
                    const hasNight = dayShifts.some(
                      (s) =>
                        s.schedule.kind === 'timed' &&
                        s.schedule.interval.originEndLocalDate !==
                          s.schedule.interval.originStartLocalDate
                    );
                    const hasDay = dayShifts.length > 0 && !hasNight;
                    const isOff = dayOffByDate.has(cell.localDate);
                    return (
                      <button
                        type="button"
                        key={cell.localDate}
                        data-adjacent={!cell.inActiveMonth}
                        data-today={cell.localDate === todayDate}
                        data-calendar-date={cell.localDate}
                        onPointerDown={(e) => {
                          e.currentTarget.releasePointerCapture?.(e.pointerId);
                          isPointerStampingRef.current = true;
                          stampedInGestureRef.current = new Set([
                            cell.localDate,
                          ]);
                          void handleStampDate(cell.localDate);
                        }}
                        onPointerEnter={() => {
                          if (
                            isPointerStampingRef.current &&
                            !stampedInGestureRef.current.has(cell.localDate)
                          ) {
                            stampedInGestureRef.current.add(cell.localDate);
                            void handleStampDate(cell.localDate);
                          }
                        }}
                      >
                        <span className="calendar-day-number">
                          {cell.day}
                        </span>
                        <span className="calendar-marks">
                          {hasNight && (
                            <span
                              className="text-[var(--color-night-shift)]"
                              aria-label="Нічна зміна"
                            >
                              <Icon name="moon" size={12} />
                            </span>
                          )}
                          {hasDay && (
                            <span
                              className="text-[var(--color-day-shift-end)]"
                              aria-label="Денна зміна"
                            >
                              <Icon name="sun" size={12} />
                            </span>
                          )}
                          {!hasNight && !hasDay && isOff && (
                            <span className="calendar-off">В</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* "Повтор циклу" Row (pattern like 2 через 2 + until date) */}
            <Section>
              <Row
                title="Повтор циклу"
                secondary={`${cycleWorkDays} через ${cycleOffDays} · до ${formatShortDate(
                  cycleUntilDate
                )}`}
                onClick={() => setCycleExpanded((v) => !v)}
                data-testid="shift-cycle-repeat-row"
              />
              {cycleExpanded && (
                <div className="p-3 space-y-2.5 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[var(--text-secondary)] flex-1">
                      Робочих днів
                      <input
                        type="number"
                        min={1}
                        max={14}
                        value={cycleWorkDays}
                        onChange={(e) =>
                          setCycleWorkDays(Number(e.target.value) || 2)
                        }
                        className="mt-1 w-full min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                      />
                    </label>
                    <label className="text-xs text-[var(--text-secondary)] flex-1">
                      Вихідних
                      <input
                        type="number"
                        min={1}
                        max={14}
                        value={cycleOffDays}
                        onChange={(e) =>
                          setCycleOffDays(Number(e.target.value) || 2)
                        }
                        className="mt-1 w-full min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                      />
                    </label>
                  </div>
                  <DateField
                    label="Початок циклу"
                    value={cycleStartDate}
                    onChange={(e) => setCycleStartDate(e.target.value)}
                  />
                  <DateField
                    label="Повторювати до"
                    value={cycleUntilDate}
                    onChange={(e) => setCycleUntilDate(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void handleApplyCyclePattern()}
                  >
                    Заповнити за циклом
                  </Button>
                </div>
              )}
            </Section>
          </div>
        ) : (
          <>
            {/* ONE scrolling row of option chips that show their values */}
            <div
              className="ui-pill-row quick-add-pill-row"
              role="group"
              aria-label="Параметри запису"
              data-testid="quick-add-option-chips"
            >
              {/* Per-type chips first so date/time/duration are right at thumb reach */}
              {(activeType === 'task' || activeType === 'event') && (
                <>
                  <Pill
                    selected={openChip === 'datetime'}
                    onClick={() => toggleChip('datetime')}
                    data-testid="chip-datetime"
                  >
                    {dateTimeChipLabel}
                  </Pill>
                  <Pill
                    selected={openChip === 'duration'}
                    onClick={() => toggleChip('duration')}
                    data-testid="chip-duration"
                  >
                    {durationChipLabel}
                  </Pill>
                  <Pill
                    selected={openChip === 'effort'}
                    onClick={() => toggleChip('effort')}
                    data-testid="chip-effort"
                  >
                    {effortChipLabel}
                  </Pill>
                  <Pill
                    selected={openChip === 'project'}
                    onClick={() => toggleChip('project')}
                    data-testid="chip-project"
                  >
                    {selectedProject ? selectedProject.title : 'Проєкт'}
                  </Pill>
                </>
              )}

              {activeType === 'habit' && (
                <>
                  <Pill
                    selected={openChip === 'frequency'}
                    onClick={() => toggleChip('frequency')}
                    data-testid="chip-frequency"
                  >
                    {habitFrequencyChipLabel}
                  </Pill>
                  <Pill
                    selected={openChip === 'minimum'}
                    onClick={() => toggleChip('minimum')}
                    data-testid="chip-minimum"
                  >
                    {habitMinimumUk.trim()
                      ? `Мінімум: ${habitMinimumUk.trim()}`
                      : 'Мінімальний варіант'}
                  </Pill>
                </>
              )}

              {activeType === 'project' && (
                <Pill
                  selected={openChip === 'project_deadline'}
                  onClick={() => toggleChip('project_deadline')}
                  data-testid="chip-project-deadline"
                >
                  {projectTargetDate
                    ? formatShortDate(projectTargetDate)
                    : 'Орієнтовний термін'}
                </Pill>
              )}

              {activeType === 'goal' && (
                <Pill
                  selected={openChip === 'goal_term'}
                  onClick={() => toggleChip('goal_term')}
                  data-testid="chip-goal-term"
                >
                  {goalTermEnd
                    ? `${formatShortDate(goalTermStart)} – ${formatShortDate(
                        goalTermEnd
                      )}`
                    : 'Термін'}
                </Pill>
              )}

              {activeType === 'wish' && (
                <>
                  <Pill
                    selected={openChip === 'wish_price'}
                    onClick={() => toggleChip('wish_price')}
                    data-testid="chip-wish-price"
                  >
                    {wishPrice.trim()
                      ? `${wishPrice.trim()} ${wishCurrency}`
                      : 'Ціна + валюта'}
                  </Pill>
                  <Pill
                    selected={openChip === 'wish_group'}
                    onClick={() => toggleChip('wish_group')}
                    data-testid="chip-wish-group"
                  >
                    {wishTiming === 'now'
                      ? 'Зараз'
                      : wishTiming === 'later'
                      ? 'Пізніше'
                      : 'Колись'}
                  </Pill>
                </>
              )}

              {/* Chips for EVERY type: Сфера, Папка, and Вимір (for Завдання, Звичка, Ціль, Проєкт, Бажання) */}
              <Pill
                selected={openChip === 'area'}
                onClick={() => toggleChip('area')}
                data-testid="chip-area"
              >
                <Orb
                  color={areaColor(selectedArea?.rating ?? null)}
                  size={16}
                />
                <span>
                  {selectedArea ? selectedArea.questionTextUk : 'Сфера'}
                </span>
              </Pill>

              <Pill
                selected={openChip === 'folder'}
                onClick={() => toggleChip('folder')}
                data-testid="chip-folder"
              >
                {selectedFolder
                  ? selectedFolder.name
                  : activeType === 'folder'
                  ? 'Батьківська папка'
                  : 'Папка'}
              </Pill>

              {supportsMeasure(activeType) && (
                <Pill
                  selected={openChip === 'measure'}
                  onClick={() => toggleChip('measure')}
                  data-testid="chip-measure"
                >
                  {measureChipLabel}
                </Pill>
              )}
            </div>

            {/* INLINE panel under the chips (animated height, no nested sheets) */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
              style={{
                gridTemplateRows: openChip ? '1fr' : '0fr',
                opacity: openChip ? 1 : 0,
              }}
            >
              <div className="overflow-hidden min-h-0">
                {openChip === 'area' && (
                  <div
                    className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2"
                    data-testid="inline-panel-area"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Pill
                        selected={!areaId}
                        onClick={() => {
                          setAreaId('');
                          setOpenChip(null);
                        }}
                      >
                        Без сфери
                      </Pill>
                      {activeAreas.slice(0, 10).map((area) => (
                        <Pill
                          key={area.id}
                          selected={areaId === area.id}
                          onClick={() => {
                            setAreaId(area.id);
                            setOpenChip(null);
                          }}
                          data-testid={`area-orb-option-${area.id}`}
                        >
                          <Orb
                            color={areaColor(area.rating ?? null)}
                            size={18}
                          />
                          <span>{area.questionTextUk}</span>
                        </Pill>
                      ))}
                    </div>
                  </div>
                )}

                {openChip === 'folder' && (
                  <div
                    className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1.5"
                    data-testid="inline-panel-folder"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFolderId('');
                        setOpenChip(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium ${
                        !folderId
                          ? 'bg-[var(--ink)] text-[var(--on-ink)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      Без папки
                    </button>
                    {folderOptions.map((opt) => (
                      <button
                        key={opt.folder.id}
                        type="button"
                        onClick={() => {
                          setFolderId(opt.folder.id);
                          setOpenChip(null);
                        }}
                        style={{ paddingLeft: `${12 + opt.depth * 16}px` }}
                        className={`w-full text-left pr-3 py-2 rounded-xl text-sm font-medium ${
                          folderId === opt.folder.id
                            ? 'bg-[var(--ink)] text-[var(--on-ink)]'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {opt.folder.name}
                      </button>
                    ))}
                  </div>
                )}

                {openChip === 'measure' && (
                  <div
                    className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2.5"
                    data-testid="inline-panel-measure"
                  >
                    <div className="ui-pill-row" role="group" aria-label="Одиниця виміру">
                      {MEASURE_UNITS.map((u) => (
                        <Pill
                          key={u}
                          selected={measureUnit === u}
                          onClick={() => setMeasureUnit(u)}
                        >
                          {u}
                        </Pill>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <InputField
                        label="Поточне"
                        value={measureCurrent}
                        onChange={(e) => setMeasureCurrent(e.target.value)}
                        inputMode="decimal"
                      />
                      <InputField
                        label={
                          activeType === 'habit' ? 'За виконання / ціль' : 'Ціль'
                        }
                        value={measureTarget}
                        onChange={(e) => setMeasureTarget(e.target.value)}
                        inputMode="decimal"
                        placeholder="300"
                      />
                      <InputField
                        label="Одиниця"
                        value={measureUnit}
                        onChange={(e) => setMeasureUnit(e.target.value)}
                        placeholder="стор."
                      />
                    </div>
                  </div>
                )}

                {openChip === 'datetime' && (
                  <Section>
                    <DateField
                      label="Дата"
                      value={itemDate}
                      onChange={(e) => {
                        setItemDate(e.target.value);
                        if (itemEndDate < e.target.value) {
                          setItemEndDate(e.target.value);
                        }
                      }}
                    />
                    {!isAllDay && (
                      <TimeField
                        label="Час"
                        value={itemTime}
                        onChange={(e) => setItemTime(e.target.value.slice(0, 5))}
                      />
                    )}
                    <Row
                      title="Весь день"
                      trailing={
                        <Toggle
                          label="Весь день"
                          checked={isAllDay}
                          onChange={setIsAllDay}
                        />
                      }
                    />
                    <Row
                      title="Кілька днів"
                      trailing={
                        <Toggle
                          label="Кілька днів"
                          checked={isMultiDay}
                          onChange={setIsMultiDay}
                        />
                      }
                    />
                    {isMultiDay && (
                      <DateField
                        label="Дата завершення"
                        value={itemEndDate}
                        onChange={(e) => setItemEndDate(e.target.value)}
                      />
                    )}
                  </Section>
                )}

                {openChip === 'duration' && (
                  <Section>
                    <DurationField
                      label="Тривалість"
                      value={durationMinutes}
                      onChange={(val) => {
                        setDurationMinutes(val ?? 60);
                        setHasDuration(true);
                      }}
                    />
                  </Section>
                )}

                {openChip === 'effort' && (
                  <div
                    className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-wrap gap-2"
                    data-testid="inline-panel-effort"
                  >
                    {(
                      [
                        ['small', 'Невеликі'],
                        ['medium', 'Середні'],
                        ['large', 'Значні'],
                      ] as const
                    ).map(([key, label]) => (
                      <Pill
                        key={key}
                        selected={effort === key}
                        onClick={() => {
                          setEffort((prev) => (prev === key ? null : key));
                          setOpenChip(null);
                        }}
                      >
                        {label}
                      </Pill>
                    ))}
                  </div>
                )}

                {openChip === 'project' && (
                  <div
                    className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-wrap gap-2"
                    data-testid="inline-panel-project"
                  >
                    <Pill
                      selected={!projectId}
                      onClick={() => {
                        setProjectId('');
                        setOpenChip(null);
                      }}
                    >
                      Без проєкту
                    </Pill>
                    {projects
                      .filter((p) => !p.archived)
                      .map((proj) => (
                        <Pill
                          key={proj.id}
                          selected={projectId === proj.id}
                          onClick={() => {
                            setProjectId(proj.id);
                            setOpenChip(null);
                          }}
                        >
                          {proj.title}
                        </Pill>
                      ))}
                  </div>
                )}

                {openChip === 'frequency' && (
                  <div
                    className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2.5"
                    data-testid="inline-panel-frequency"
                  >
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['daily', 'Щодня'],
                          ['weekly', 'N разів на тиждень'],
                          ['days_off', 'У вихідні від роботи'],
                          ['after_wakeup', 'Після пробудження'],
                        ] as const
                      ).map(([key, label]) => (
                        <Pill
                          key={key}
                          selected={habitFreqKind === key}
                          onClick={() => setHabitFreqKind(key)}
                        >
                          {label}
                        </Pill>
                      ))}
                    </div>
                    {habitFreqKind === 'weekly' && (
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <Pill
                            key={n}
                            selected={habitTimesPerWeek === n}
                            onClick={() => setHabitTimesPerWeek(n)}
                          >
                            {n}
                          </Pill>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {openChip === 'minimum' && (
                  <div className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <InputField
                      label="Мінімальний варіант"
                      value={habitMinimumUk}
                      onChange={(e) => setHabitMinimumUk(e.target.value)}
                      placeholder="Наприклад: 2 хвилини або 1 сторінка"
                    />
                  </div>
                )}

                {openChip === 'project_deadline' && (
                  <Section>
                    <DateField
                      label="Орієнтовний термін"
                      value={projectTargetDate}
                      onChange={(e) => setProjectTargetDate(e.target.value)}
                    />
                  </Section>
                )}

                {openChip === 'goal_term' && (
                  <Section>
                    <DateField
                      label="Початок"
                      value={goalTermStart}
                      onChange={(e) => setGoalTermStart(e.target.value)}
                    />
                    <DateField
                      label="Дедлайн"
                      value={goalTermEnd}
                      onChange={(e) => setGoalTermEnd(e.target.value)}
                    />
                  </Section>
                )}

                {openChip === 'wish_price' && (
                  <div className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <InputField
                        label="Ціна"
                        value={wishPrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWishPrice(val);
                          // Prefill the Вимір target per DESIGN.md
                          if (val.trim() && !Number.isNaN(Number(val))) {
                            setMeasureTarget(val.trim());
                            if (!measureUnit) {
                              setMeasureUnit(
                                wishCurrency === 'UAH' ? 'грн' : wishCurrency
                              );
                            }
                          }
                        }}
                        inputMode="decimal"
                        placeholder="3500"
                      />
                      <SelectField
                        label="Валюта"
                        value={wishCurrency}
                        options={Object.values(SUPPORTED_CURRENCIES).map((spec) => ({
                          value: spec.code,
                          label: spec.code,
                        }))}
                        onChange={(next: any) => {
                          const nextCur = (next?.target?.value ?? next) as SupportedCurrencyCode;
                          setWishCurrency(nextCur);
                          if (wishPrice.trim()) {
                            setMeasureUnit(
                              nextCur === 'UAH' ? 'грн' : nextCur
                            );
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {openChip === 'wish_group' && (
                  <div className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-wrap gap-2">
                    {(
                      [
                        ['now', 'Зараз'],
                        ['later', 'Пізніше'],
                        ['someday', 'Колись'],
                      ] as const
                    ).map(([key, label]) => (
                      <Pill
                        key={key}
                        selected={wishTiming === key}
                        onClick={() => {
                          setWishTiming(key);
                          setOpenChip(null);
                        }}
                      >
                        {label}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};

export { QuickAddSheet as SharedEditorHost };
