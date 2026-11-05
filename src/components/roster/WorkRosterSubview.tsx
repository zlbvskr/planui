import {
  Check,
  Clock,
  Edit3,
  FileText,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { formatMinutesCompactUk } from '../../domain/formatting';
import {
  MultiDateBatchActionSpec,
  ProposedRosterItem,
  RosterBatchPreview,
  calculateMonthWorkSummary,
  generateFinitePeriodRosterPreview,
  instantiateWorkShiftFromTemplate,
  parseDeterministicRosterText,
  prepareMultiDateRosterBatch,
} from '../../domain/roster';
import {
  ProjectedMonthCalendarGrid,
  ProjectedMonthCell,
  projectScheduleForDate,
} from '../../domain/scheduling';
import { formatUkrainianDateHeading, parseLocalDateParts } from '../../domain/temporal';
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  IanaTimeZone,
  LocalDateString,
  ShiftTemplate,
  Task,
  TaskReservation,
} from '../../domain/types';
import { ImplementedCreationActionKind } from '../../state/shellStore';
import { PlanuiRepositories, RosterBatchUndoToken } from '../../storage/repositories';
import {
  Button,
  Card,
  FeedbackBanner,
  InputField,
  ModalSheet,
  SegmentedControl,
  SelectField,
  TextAreaField,
} from '../ui/primitives';

export interface WorkRosterSubviewProps {
  selectedDate: LocalDateString;
  actualTodayDate: LocalDateString;
  displayZone: IanaTimeZone;
  monthGrid: ProjectedMonthCalendarGrid;
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  tasks: readonly Task[];
  dayOffAnnotations: readonly DayOffAnnotation[];
  shiftTemplates: readonly ShiftTemplate[];
  repositories: PlanuiRepositories;
  onSelectDate: (nextDate: LocalDateString) => void;
  onInspectEvent: (event: CalendarEvent) => void;
  onCancelEvent: (eventId: EntityId, revision: number) => Promise<void> | void;
  onOpenGlobalCreation: (preferredAction?: ImplementedCreationActionKind) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
}

type RosterInteractionMode = 'browse' | 'multi_date_edit';
type BatchActionChoiceKind =
  | 'template_shift'
  | 'custom_shift'
  | 'day_off'
  | 'clear_date';


function createId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatProposedItemSummaryUk(item: ProposedRosterItem): string {
  if (item.kind === 'clear_date') {
    return 'Очистити робочі зміни та вихідні на цю дату';
  }
  if (item.kind === 'day_off') {
    const code = item.dayOffToSave?.code ?? 'В';
    return `Вихідний (${code})`;
  }
  if (item.eventToSave && item.eventToSave.schedule.kind === 'timed') {
    const iv = item.eventToSave.schedule.interval;
    return `${item.eventToSave.title} (${iv.originStartLocalTime}–${
      iv.originEndLocalTime
    }${item.isOvernight ? ` → ${iv.originEndLocalDate}` : ''}, ${formatMinutesCompactUk(
      item.elapsedDurationMinutes
    )})`;
  }
  return 'Робоча зміна';
}

const WEEKDAY_OPTIONS_MONDAY_FIRST: ReadonlyArray<{
  index0To6: number;
  shortUk: string;
}> = [
  { index0To6: 0, shortUk: 'Пн' },
  { index0To6: 1, shortUk: 'Вт' },
  { index0To6: 2, shortUk: 'Ср' },
  { index0To6: 3, shortUk: 'Чт' },
  { index0To6: 4, shortUk: 'Пт' },
  { index0To6: 5, shortUk: 'Сб' },
  { index0To6: 6, shortUk: 'Нд' },
];

export const WorkRosterSubview: React.FC<WorkRosterSubviewProps> = ({
  selectedDate,
  displayZone,
  monthGrid,
  events,
  reservations,
  tasks,
  dayOffAnnotations,
  shiftTemplates,
  repositories,
  onSelectDate,
  onInspectEvent,
  onCancelEvent,
  onOpenGlobalCreation,
  onDataChanged,
  onModalStateChange,
}) => {
  const { year: activeYear, month: activeMonth } = useMemo(
    () => parseLocalDateParts(selectedDate) ?? { year: 2026, month: 11, day: 1 },
    [selectedDate]
  );

  // 8.1 Clear browse vs multi-date edit mode
  const [interactionMode, setInteractionMode] =
    useState<RosterInteractionMode>('browse');

  // 8.3 Multi-date batch state
  const [selectedBatchDates, setSelectedBatchDates] = useState<
    LocalDateString[]
  >([]);
  const [batchActionKind, setBatchActionKind] =
    useState<BatchActionChoiceKind>('template_shift');
  const [batchTemplateId, setBatchTemplateId] = useState<string>('');
  const [batchCustomTitle, setBatchCustomTitle] =
    useState<string>('Робоча зміна');
  const [batchCustomCode, setBatchCustomCode] = useState<string>('РЗ');
  const [batchCustomStart, setBatchCustomStart] = useState<string>('08:00');
  const [batchCustomEnd, setBatchCustomEnd] = useState<string>('20:00');
  const [batchCustomOffset, setBatchCustomOffset] = useState<0 | 1>(0);
  const [batchCustomNote, setBatchCustomNote] = useState<string>('');
  const [batchDayOffCode, setBatchDayOffCode] = useState<string>('В');
  const [batchDayOffNote, setBatchDayOffNote] = useState<string>('');
  const [batchConfirmConflicts, setBatchConfirmConflicts] =
    useState<boolean>(false);
  const [isApplyingBatch, setIsApplyingBatch] = useState<boolean>(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Revision-safe undo state (8.3)
  const [lastUndoToken, setLastUndoToken] =
    useState<RosterBatchUndoToken | null>(null);

  // 8.2 Template editor modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] =
    useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(
    null
  );
  const [tplName, setTplName] = useState<string>('');
  const [tplCode, setTplCode] = useState<string>('');
  const [tplStart, setTplStart] = useState<string>('08:00');
  const [tplEnd, setTplEnd] = useState<string>('20:00');
  const [tplOffset, setTplOffset] = useState<0 | 1>(0);
  const [tplNote, setTplNote] = useState<string>('');
  const [tplError, setTplError] = useState<string | null>(null);

  // 8.4 Finite period generator modal state
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState<boolean>(false);
  const [periodStart, setPeriodStart] = useState<LocalDateString>(
    `${String(activeYear).padStart(4, '0')}-${String(activeMonth).padStart(
      2,
      '0'
    )}-01`
  );
  const [periodEnd, setPeriodEnd] = useState<LocalDateString>(
    `${String(activeYear).padStart(4, '0')}-${String(activeMonth).padStart(
      2,
      '0'
    )}-14`
  );
  const [cyclePattern,setCyclePattern]=useState('');
  const [cycleEveryDays, setCycleEveryDays] = useState('');
  const [periodWeekdays, setPeriodWeekdays] = useState<number[]>([0, 2, 4]);
  const [periodActionKind, setPeriodActionKind] = useState<
    'template_shift' | 'custom_shift' | 'day_off'
  >('template_shift');
  const [periodTemplateId, setPeriodTemplateId] = useState<string>('');
  const [periodCustomTitle, setPeriodCustomTitle] =
    useState<string>('Зміна за періодом');
  const [periodCustomCode, setPeriodCustomCode] = useState<string>('ЗП');
  const [periodCustomStart, setPeriodCustomStart] = useState<string>('09:00');
  const [periodCustomEnd, setPeriodCustomEnd] = useState<string>('21:00');
  const [periodCustomOffset, setPeriodCustomOffset] = useState<0 | 1>(0);
  const [periodDayOffCode, setPeriodDayOffCode] = useState<string>('В');
  const [periodConfirmConflicts, setPeriodConfirmConflicts] =
    useState<boolean>(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

  // 8.5 Deterministic local text parser modal state
  const [isTextParserModalOpen, setIsTextParserModalOpen] =
    useState<boolean>(false);
  const [rawRosterText, setRawRosterText] = useState<string>('');
  const [excludedLineNumbers, setExcludedLineNumbers] = useState<number[]>([]);
  const [parserConfirmConflicts, setParserConfirmConflicts] =
    useState<boolean>(false);
  const [parserError, setParserError] = useState<string | null>(null);

  const notifyModalChange = (open: boolean) => {
    onModalStateChange?.(open);
  };

  // Effective selected template for batch/period
  const effectiveBatchTemplate = useMemo(
    () =>
      shiftTemplates.find((t) => t.id === batchTemplateId) ??
      shiftTemplates[0] ??
      null,
    [shiftTemplates, batchTemplateId]
  );

  const effectivePeriodTemplate = useMemo(
    () =>
      shiftTemplates.find((t) => t.id === periodTemplateId) ??
      shiftTemplates[0] ??
      null,
    [shiftTemplates, periodTemplateId]
  );

  // 8.6 Month Work Summary
  const monthSummary = useMemo(
    () =>
      calculateMonthWorkSummary({
        referenceDateInMonth: selectedDate,
        displayZone,
        events,
        dayOffAnnotations,
      }),
    [selectedDate, displayZone, events, dayOffAnnotations]
  );

  const boundaryCrossingNoteUk = useMemo(() => {
    if (monthSummary.boundaryCrossingShiftCount === 0) return null;
    return `У місяці є ${
      monthSummary.boundaryCrossingShiftCount
    } зміна(и), що перетинають межу сусіднього місяця: у межах поточного місяця враховано ${formatMinutesCompactUk(
      monthSummary.intersectingWorkMinutes
    )}, а повна тривалість цих змін разом з усіма змінами становить ${formatMinutesCompactUk(
      monthSummary.fullShiftsTotalMinutes
    )}.`;
  }, [monthSummary]);

  // Selected date schedule projection for browse inspector
  const selectedDayProjection = useMemo(
    () =>
      projectScheduleForDate({
        localDate: selectedDate,
        displayZone,
        events,
        reservations,
        tasks,
        dayOffAnnotations,
        includeReleasedReservations: false,
      }),
    [
      selectedDate,
      displayZone,
      events,
      reservations,
      tasks,
      dayOffAnnotations,
    ]
  );

  const selectedDateWorkItems = useMemo(
    () =>
      selectedDayProjection.timelineItems.filter(
        (item) => item.sourceKind === 'work_shift'
      ),
    [selectedDayProjection]
  );

  const selectedDateRawDayOffs = useMemo(
    () => dayOffAnnotations.filter((a) => a.localDate === selectedDate),
    [dayOffAnnotations, selectedDate]
  );

  // Build current MultiDateBatchActionSpec for 8.3 multi-date mode
  const currentBatchActionSpec =
    useMemo<MultiDateBatchActionSpec | null>(() => {
      if (batchActionKind === 'template_shift') {
        if (!effectiveBatchTemplate) return null;
        return {
          kind: 'template_shift',
          template: effectiveBatchTemplate,
        };
      }
      if (batchActionKind === 'custom_shift') {
        return {
          kind: 'custom_shift',
          title: batchCustomTitle.trim() || 'Робоча зміна',
          shiftCode: batchCustomCode.trim() || null,
          startLocalTime: batchCustomStart,
          endLocalTime: batchCustomEnd,
          endDateOffsetDays: batchCustomOffset,
          color: 'work',
          note: batchCustomNote.trim() || null,
        };
      }
      if (batchActionKind === 'day_off') {
        return {
          kind: 'day_off',
          code: batchDayOffCode.trim() || 'В',
          note: batchDayOffNote.trim() || null,
        };
      }
      return { kind: 'clear_date' };
    }, [
      batchActionKind,
      effectiveBatchTemplate,
      batchCustomTitle,
      batchCustomCode,
      batchCustomStart,
      batchCustomEnd,
      batchCustomOffset,
      batchCustomNote,
      batchDayOffCode,
      batchDayOffNote,
    ]);

  // 8.3 Live preview for multi-date selection
  const multiDateBatchPreview = useMemo<RosterBatchPreview | null>(() => {
    if (
      interactionMode !== 'multi_date_edit' ||
      selectedBatchDates.length === 0 ||
      !currentBatchActionSpec
    ) {
      return null;
    }
    try {
      return prepareMultiDateRosterBatch({
        selectedDates: selectedBatchDates,
        action: currentBatchActionSpec,
        lockedZoneId: displayZone,
        existingEvents: events,
        existingReservations: reservations,
        existingDayOffAnnotations: dayOffAnnotations,
        nowIso: '2026-11-01T12:00:00.000Z',
      });
    } catch {
      return null;
    }
  }, [
    interactionMode,
    selectedBatchDates,
    currentBatchActionSpec,
    displayZone,
    events,
    reservations,
    dayOffAnnotations,
  ]);

  // 8.4 Live preview for finite period generation
  const periodPreviewState = useMemo<{
    preview: RosterBatchPreview | null;
    errorUk: string | null;
  }>(() => {
    if (!isPeriodModalOpen) return { preview: null, errorUk: null };
    let actionSpec: Exclude<
      MultiDateBatchActionSpec,
      { kind: 'clear_date' }
    > | null = null;
    if (periodActionKind === 'template_shift') {
      if (!effectivePeriodTemplate) {
        return {
          preview: null,
          errorUk:
            'Оберіть шаблон зміни або перемкніть дію на «Власний інтервал зміни».',
        };
      }
      actionSpec = {
        kind: 'template_shift',
        template: effectivePeriodTemplate,
      };
    } else if (periodActionKind === 'custom_shift') {
      actionSpec = {
        kind: 'custom_shift',
        title: periodCustomTitle.trim() || 'Зміна за періодом',
        shiftCode: periodCustomCode.trim() || null,
        startLocalTime: periodCustomStart,
        endLocalTime: periodCustomEnd,
        endDateOffsetDays: periodCustomOffset,
        color: 'work',
        note: null,
      };
    } else {
      actionSpec = {
        kind: 'day_off',
        code: periodDayOffCode.trim() || 'В',
        note: null,
      };
    }

    try {
      const preview = generateFinitePeriodRosterPreview({
        startDate: periodStart,
        endDate: periodEnd,
        cycleTemplateSequence: cyclePattern.trim()?cyclePattern.split(',').map(code=>{const key=code.trim();if(key==='-')return null;const template=shiftTemplates.find(template=>template.code===key);if(!template)throw new Error(`Невідомий код шаблону: ${key}`);return template;}):undefined,
        cycleEveryDays: cycleEveryDays ? Number(cycleEveryDays) : undefined,
        selectedWeekdaysMondayFirst: periodWeekdays,
        action: actionSpec,
        lockedZoneId: displayZone,
        existingEvents: events,
        existingReservations: reservations,
        existingDayOffAnnotations: dayOffAnnotations,
        nowIso: '2026-11-01T12:00:00.000Z',
      });
      return { preview, errorUk: null };
    } catch (err) {
      return {
        preview: null,
        errorUk:
          err instanceof Error
            ? err.message
            : 'Некоректний період генерації (максимум 366 днів).',
      };
    }
  }, [
    isPeriodModalOpen,
    periodActionKind,
    effectivePeriodTemplate,
    periodCustomTitle,
    periodCustomCode,
    periodCustomStart,
    periodCustomEnd,
    periodCustomOffset,
    periodDayOffCode,
    periodStart,
    periodEnd,
    periodWeekdays,
    cycleEveryDays,
    cyclePattern,
    shiftTemplates,
    displayZone,
    events,
    reservations,
    dayOffAnnotations,
  ]);

  // 8.5 Live preview for deterministic local text parser
  const textParserPreview = useMemo<RosterBatchPreview | null>(() => {
    if (!isTextParserModalOpen) return null;
    return parseDeterministicRosterText({
      rawText: rawRosterText,
      targetYear: activeYear,
      targetMonth1To12: activeMonth,
      lockedZoneId: displayZone,
      templates: shiftTemplates,
      existingEvents: events,
      existingReservations: reservations,
      existingDayOffAnnotations: dayOffAnnotations,
      excludedLineNumbers: new Set(excludedLineNumbers),
      nowIso: '2026-11-01T12:00:00.000Z',
    });
  }, [
    isTextParserModalOpen,
    rawRosterText,
    activeYear,
    activeMonth,
    displayZone,
    shiftTemplates,
    events,
    reservations,
    dayOffAnnotations,
    excludedLineNumbers,
  ]);

  const handleCellClick = (cell: ProjectedMonthCell) => {
    if (interactionMode === 'browse') {
      onSelectDate(cell.localDate);
      return;
    }
    // In multi_date_edit mode: toggle date selection without painting unselected dates
    setBatchError(null);
    setSelectedBatchDates((prev) =>
      prev.includes(cell.localDate)
        ? prev.filter((d) => d !== cell.localDate)
        : [...prev, cell.localDate].sort()
    );
  };

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTplName('');
    setTplCode('');
    setTplStart('08:00');
    setTplEnd('20:00');
    setTplOffset(0);
    setTplNote('');
    setTplError(null);
    setIsTemplateModalOpen(true);
    notifyModalChange(true);
  };

  const handleOpenEditTemplate = (tpl: ShiftTemplate) => {
    setEditingTemplate(tpl);
    setTplName(tpl.name);
    setTplCode(tpl.code);
    setTplStart(tpl.startLocalTime);
    setTplEnd(tpl.endLocalTime);
    setTplOffset(tpl.endDateOffsetDays);
    setTplNote(tpl.note ?? '');
    setTplError(null);
    setIsTemplateModalOpen(true);
    notifyModalChange(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTplError(null);
    try {
      const nowIso = new Date().toISOString();
      const record: ShiftTemplate = {
        id: editingTemplate ? editingTemplate.id : createId(),
        name: tplName.trim(),
        code: tplCode.trim().toUpperCase(),
        startLocalTime: tplStart,
        endLocalTime: tplEnd,
        endDateOffsetDays: tplOffset,
        color: 'work',
        note: tplNote.trim() ? tplNote.trim() : null,
        createdAt: editingTemplate ? editingTemplate.createdAt : nowIso,
        updatedAt: nowIso,
        revision: editingTemplate ? editingTemplate.revision + 1 : 1,
      };
      await repositories.saveShiftTemplate(
        record,
        editingTemplate?.revision
      );
      setIsTemplateModalOpen(false);
      notifyModalChange(false);
      await onDataChanged(
        editingTemplate
          ? `Шаблон «${record.name}» (${record.code}) оновлено.`
          : `Шаблон «${record.name}» (${record.code}) створено.`
      );
    } catch (err) {
      setTplError(
        err instanceof Error ? err.message : 'Не вдалося зберегти шаблон зміни.'
      );
    }
  };

  const handleDeleteTemplate = async (tpl: ShiftTemplate) => {
    try {
      await repositories.deleteShiftTemplateTransactionally(tpl.id);
      await onDataChanged(
        `Шаблон «${tpl.name}» видалено. Усі раніше застосовані зміни в календарі збережено без змін.`
      );
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : 'Не вдалося видалити шаблон.'
      );
    }
  };

  const handleQuickApplyTemplateToSelectedDate = async (tpl: ShiftTemplate) => {
    setBatchError(null);
    try {
      const nowIso = new Date().toISOString();
      const { event } = instantiateWorkShiftFromTemplate({
        id: createId(),
        template: tpl,
        startLocalDate: selectedDate,
        zoneId: displayZone,
        nowIso,
      });
      await repositories.saveCalendarEvent(event);
      await onDataChanged(
        `Зміну «${tpl.name}» додано на ${formatUkrainianDateHeading(selectedDate)}.`
      );
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : 'Не вдалося застосувати шаблон зміни.'
      );
    }
  };

  const handleCommitMultiDateBatch = async () => {
    if (!multiDateBatchPreview) return;
    setBatchError(null);

    if (!multiDateBatchPreview.canCommit) {
      setBatchError(
        'Виправте параметри дії перед пакетним збереженням.'
      );
      return;
    }

    if (
      multiDateBatchPreview.requiresConflictConfirmation &&
      !batchConfirmConflicts
    ) {
      setBatchError(
        'Підтвердьте свідоме застосування попри конфлікти розкладу або змініть вибір дат.'
      );
      return;
    }

    setIsApplyingBatch(true);
    try {
      const res = await repositories.applyRosterBatchTransactionally({
        eventsToSave: [...multiDateBatchPreview.eventsToSave],
        dayOffAnnotationsToSave: [
          ...multiDateBatchPreview.dayOffAnnotationsToSave,
        ],
        eventIdsToDelete: [...multiDateBatchPreview.eventIdsToDelete],
        dayOffAnnotationIdsToDelete: [
          ...multiDateBatchPreview.dayOffAnnotationIdsToDelete,
        ],
      });
      setLastUndoToken(res.undoToken);
      const appliedCount = selectedBatchDates.length;
      setSelectedBatchDates([]);
      setBatchConfirmConflicts(false);
      await onDataChanged(
        `Пакетно оновлено графік для ${appliedCount} дат(и). Доступна безпечна відміна.`
      );
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : 'Не вдалося виконати пакетне збереження.'
      );
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const handleUndoLastBatch = async () => {
    if (!lastUndoToken) return;
    setBatchError(null);
    try {
      const res = await repositories.undoRosterBatchTransactionally(
        lastUndoToken
      );
      setLastUndoToken(null);
      if (res.preservedLaterEditsCount > 0) {
        await onDataChanged(
          `Скасовано пакетне внесення (${res.restoredEventsCount} змін, ${res.restoredDayOffsCount} вихідних). Збережено ${res.preservedLaterEditsCount} запис(ів), які були змінені пізніше.`
        );
      } else {
        await onDataChanged(
          `Пакетне внесення скасовано (${res.restoredEventsCount} змін, ${res.restoredDayOffsCount} вихідних).`
        );
      }
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : 'Не вдалося скасувати пакетне внесення.'
      );
    }
  };

  const handleCommitPeriodGenerator = async () => {
    if (periodPreviewState.errorUk) {
      setPeriodError(periodPreviewState.errorUk);
      return;
    }
    const preview = periodPreviewState.preview;
    if (!preview) return;
    setPeriodError(null);

    if (preview.activeItems.length === 0) {
      setPeriodError('У вибраному періоді немає дат для зазначених днів тижня.');
      return;
    }
    if (
      preview.requiresConflictConfirmation &&
      !periodConfirmConflicts
    ) {
      setPeriodError(
        'Підтвердьте свідоме створення змін попри перетини в розкладі.'
      );
      return;
    }

    try {
      const res = await repositories.applyRosterBatchTransactionally({
        eventsToSave: [...preview.eventsToSave],
        dayOffAnnotationsToSave: [...preview.dayOffAnnotationsToSave],
        eventIdsToDelete: [...preview.eventIdsToDelete],
        dayOffAnnotationIdsToDelete: [...preview.dayOffAnnotationIdsToDelete],
      });
      setLastUndoToken(res.undoToken);
      setIsPeriodModalOpen(false);
      notifyModalChange(false);
      setPeriodConfirmConflicts(false);
      await onDataChanged(
        `Згенеровано незалежні записи на період для ${preview.activeItems.length} дат(и).`
      );
    } catch (err) {
      setPeriodError(
        err instanceof Error
          ? err.message
          : 'Не вдалося застосувати генерацію на період.'
      );
    }
  };

  const handleCommitTextParser = async () => {
    if (!textParserPreview) return;
    setParserError(null);

    if (!textParserPreview.canCommit) {
      setParserError(
        'Виправте або позначте для пропуску всі рядки з помилками перед збереженням.'
      );
      return;
    }
    if (
      textParserPreview.requiresConflictConfirmation &&
      !parserConfirmConflicts
    ) {
      setParserError(
        'Підтвердьте свідоме збереження змін попри перетини у розкладі.'
      );
      return;
    }

    try {
      const res = await repositories.applyRosterBatchTransactionally({
        eventsToSave: [...textParserPreview.eventsToSave],
        dayOffAnnotationsToSave: [...textParserPreview.dayOffAnnotationsToSave],
        eventIdsToDelete: [...textParserPreview.eventIdsToDelete],
        dayOffAnnotationIdsToDelete: [
          ...textParserPreview.dayOffAnnotationIdsToDelete,
        ],
      });
      setLastUndoToken(res.undoToken);
      setIsTextParserModalOpen(false);
      notifyModalChange(false);
      setRawRosterText('');
      setExcludedLineNumbers([]);
      setParserConfirmConflicts(false);
      await onDataChanged(
        `Розпізнано та збережено графік (${textParserPreview.eventsToSave.length} змін, ${textParserPreview.dayOffAnnotationsToSave.length} вихідних).`
      );
    } catch (err) {
      setParserError(
        err instanceof Error
          ? err.message
          : 'Не вдалося зберегти розпізнаний графік.'
      );
    }
  };

  const handleRemoveDayOff = async (annotationId: EntityId) => {
    try {
      await repositories.deleteDayOffAnnotationTransactionally(annotationId);
      await onDataChanged('Позначку вихідного знято.');
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : 'Не вдалося зняти позначку вихідного.'
      );
    }
  };

  return (
    <div className="space-y-4" data-testid="work-roster-subview">
      <details className="roster-tools"><summary>{monthSummary.intersectingShiftCount > 0 ? `${monthSummary.intersectingShiftCount} змін · ` : ''}Інструменти графіка</summary>
      {/* 8.6 Month Work Summary Card */}
      <Card
        data-testid="roster-month-summary"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Підсумок робочого графіка за місяць
            </p>
            <h2
              className="text-lg font-bold capitalize sm:text-xl"
              style={{ color: 'var(--text-primary)' }}
            >
              {monthGrid.monthHeadingUk}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setPeriodStart(
                  `${String(activeYear).padStart(4, '0')}-${String(
                    activeMonth
                  ).padStart(2, '0')}-01`
                );
                setPeriodEnd(
                  `${String(activeYear).padStart(4, '0')}-${String(
                    activeMonth
                  ).padStart(2, '0')}-14`
                );
                setPeriodError(null);
                setIsPeriodModalOpen(true);
                notifyModalChange(true);
              }}
              data-testid="open-period-generator-button"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Генерація на період</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setParserError(null);
                setExcludedLineNumbers([]);
                setIsTextParserModalOpen(true);
                notifyModalChange(true);
              }}
              data-testid="open-text-parser-button"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>Текстове внесення</span>
            </Button>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-2.5 rounded-xl p-3 text-xs sm:grid-cols-4"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <div>
            <span
              className="block text-[11px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              ◆ Кількість робочих змін
            </span>
            <span
              data-testid="roster-summary-shift-count"
              className="text-base font-bold"
              style={{ color: 'var(--color-work-text)' }}
            >
              {monthSummary.intersectingShiftCount}
            </span>
            <span
              className="block text-[10px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Зміни враховано один раз
            </span>
          </div>

          <div>
            <span
              className="block text-[11px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Робочий час у межах місяця
            </span>
            <span
              data-testid="roster-summary-intersecting-duration"
              className="text-base font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatMinutesCompactUk(monthSummary.intersectingWorkMinutes)}
            </span>
            {monthSummary.boundaryCrossingShiftCount > 0 && (
              <span
                className="block text-[10px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Повна тривалість змін:{' '}
                {formatMinutesCompactUk(monthSummary.fullShiftsTotalMinutes)}
              </span>
            )}
          </div>

          <div>
            <span
              className="block text-[11px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              ○ Підтверджені вихідні
            </span>
            <span
              data-testid="roster-summary-dayoff-count"
              className="text-base font-bold"
              style={{ color: 'var(--color-dayoff-text)' }}
            >
              {monthSummary.explicitDayOffCount}
            </span>
            {monthSummary.mixedDayOffCarryoverCount > 0 && (
              <span
                className="block text-[10px]"
                style={{ color: 'var(--color-work-text)' }}
              >
                З них із переходом ночі:{' '}
                {monthSummary.mixedDayOffCarryoverCount}
              </span>
            )}
          </div>

          <div>
            <span
              className="block text-[11px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Шаблони змін
            </span>
            <span
              className="text-base font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {shiftTemplates.length}
            </span>
            <span
              className="block text-[10px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Зміни зберігаються окремо від шаблону
            </span>
          </div>
        </div>

        {boundaryCrossingNoteUk && (
          <p
            data-testid="roster-boundary-crossing-note"
            className="rounded-xl px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--color-work-tint)',
              color: 'var(--color-work-text)',
            }}
          >
            {boundaryCrossingNoteUk}
          </p>
        )}
      </Card>

      {/* Revision-safe Undo Banner (8.3) */}
      {lastUndoToken && (
        <div
          data-testid="roster-undo-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--color-work)',
            color: 'var(--text-primary)',
          }}
        >
          <span>
            Пакетне внесення збережено. Ви можете безпечно скасувати його (пізніші ручні зміни не будуть перезаписані).
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleUndoLastBatch}
              data-testid="roster-undo-button"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Скасувати пакетне внесення</span>
            </Button>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => setLastUndoToken(null)}
            >
              Приховати
            </Button>
          </div>
        </div>
      )}

      {batchError && (
        <FeedbackBanner
          tone="error"
          message={batchError}
          onDismiss={() => setBatchError(null)}
        />
      )}

      {/* 8.1 & 8.3 Explicit Browse vs Multi-Date Edit Mode Bar */}
      <Card
        data-testid="roster-interaction-mode-bar"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[260px] flex-1 sm:max-w-md">
            <SegmentedControl<RosterInteractionMode>
              ariaLabel="Режим роботи з графіком"
              value={interactionMode}
              onChange={(nextMode) => {
                setInteractionMode(nextMode);
                setBatchError(null);
                if (nextMode === 'browse') {
                  setSelectedBatchDates([]);
                }
              }}
              options={[
                {
                  value: 'browse',
                  label: 'Перегляд',
                },
                {
                  value: 'multi_date_edit',
                  label: 'Обрати дати',
                },
              ]}
            />
          </div>

          <p
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {interactionMode === 'browse'
              ? 'У режимі перегляду натискання на клітинку лише відкриває деталі дати без випадкового внесення змін.'
              : `Режим пакетного вибору: обрано дат — ${selectedBatchDates.length}. Невибрані дати залишаються без змін.`}
          </p>
        </div>

        {/* 8.3 Multi-Date Batch Configuration & Preview */}
        {interactionMode === 'multi_date_edit' && (
          <div
            data-testid="roster-multi-date-panel"
            className="space-y-3 border-t pt-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="Дія для вибраних дат"
                value={batchActionKind}
                onChange={(e) => {
                  setBatchActionKind(e.target.value as BatchActionChoiceKind);
                  setBatchConfirmConflicts(false);
                }}
                options={[
                  {
                    value: 'template_shift',
                    label: 'Застосувати шаблон робочої зміни',
                  },
                  {
                    value: 'custom_shift',
                    label: 'Власний інтервал зміни (без шаблону)',
                  },
                  {
                    value: 'day_off',
                    label: 'Позначити явний вихідний (В)',
                  },
                  {
                    value: 'clear_date',
                    label: 'Очистити зміни та вихідні на вибрані дати',
                  },
                ]}
                data-testid="roster-batch-action-kind"
              />

              {batchActionKind === 'template_shift' && (
                <div>
                  {shiftTemplates.length === 0 ? (
                    <div
                      className="rounded-xl p-3 text-xs"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Ще немає створених шаблонів. Створіть шаблон нижче або оберіть «Власний інтервал зміни».
                    </div>
                  ) : (
                    <SelectField
                      label="Шаблон зміни"
                      value={effectiveBatchTemplate?.id ?? ''}
                      onChange={(e) => setBatchTemplateId(e.target.value)}
                      options={shiftTemplates.map((t) => ({
                        value: t.id,
                        label: `${t.code} — ${t.name} (${t.startLocalTime}–${
                          t.endLocalTime
                        }${t.endDateOffsetDays === 1 ? ' +1 доба' : ''})`,
                      }))}
                      data-testid="roster-batch-template-select"
                    />
                  )}
                </div>
              )}

              {batchActionKind === 'day_off' && (
                <div className="grid grid-cols-2 gap-2">
                  <InputField
                    label="Код вихідного"
                    value={batchDayOffCode}
                    onChange={(e) => setBatchDayOffCode(e.target.value)}
                    data-testid="roster-batch-dayoff-code"
                  />
                  <InputField
                    label="Нотатка"
                    placeholder="Вихідний"
                    value={batchDayOffNote}
                    onChange={(e) => setBatchDayOffNote(e.target.value)}
                    data-testid="roster-batch-dayoff-note"
                  />
                </div>
              )}
            </div>

            {batchActionKind === 'custom_shift' && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <InputField
                  label="Назва зміни"
                  value={batchCustomTitle}
                  onChange={(e) => setBatchCustomTitle(e.target.value)}
                  data-testid="roster-batch-custom-title"
                />
                <InputField
                  label="Код"
                  value={batchCustomCode}
                  onChange={(e) => setBatchCustomCode(e.target.value)}
                  data-testid="roster-batch-custom-code"
                />
                <InputField
                  label="Початок"
                  type="time"
                  value={batchCustomStart}
                  onChange={(e) => setBatchCustomStart(e.target.value)}
                  data-testid="roster-batch-custom-start"
                />
                <InputField
                  label="Завершення"
                  type="time"
                  value={batchCustomEnd}
                  onChange={(e) => setBatchCustomEnd(e.target.value)}
                  data-testid="roster-batch-custom-end"
                />
                <SelectField
                  label="Завершення дати"
                  value={String(batchCustomOffset)}
                  onChange={(e) =>
                    setBatchCustomOffset(Number(e.target.value) as 0 | 1)
                  }
                  options={[
                    { value: '0', label: 'Того ж дня (+0)' },
                    { value: '1', label: 'Наступної доби (+1)' },
                  ]}
                  data-testid="roster-batch-custom-offset"
                />
              </div>
            )}

            {/* Selected dates & preview */}
            <div
              className="rounded-xl p-3 text-xs space-y-2"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Обрані дати ({selectedBatchDates.length}):{' '}
                  {selectedBatchDates.length === 0
                    ? 'натисніть на потрібні дати в сітці місяця нижче'
                    : selectedBatchDates.join(', ')}
                </span>
                {selectedBatchDates.length > 0 && (
                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    onClick={() => setSelectedBatchDates([])}
                    data-testid="roster-batch-clear-selection"
                  >
                    Очистити вибір
                  </Button>
                )}
              </div>

              {multiDateBatchPreview &&
                multiDateBatchPreview.activeItems.length > 0 && (
                  <div
                    data-testid="roster-batch-preview-list"
                    className="space-y-1.5 pt-1"
                  >
                    {multiDateBatchPreview.activeItems.map((item) => (
                      <div
                        key={item.previewKey}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5"
                        style={{ backgroundColor: 'var(--bg-surface)' }}
                      >
                        <span className="font-medium">
                          {item.localDate}: {formatProposedItemSummaryUk(item)}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.isMixedDayOffCarryover && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                              style={{
                                backgroundColor: 'var(--color-work-tint)',
                                color: 'var(--color-work-text)',
                              }}
                            >
                              ◆ Перехід із попередньої ночі
                            </span>
                          )}
                          {item.diagnostics.map((d, idx) => (
                            <span
                              key={idx}
                              className="rounded px-1.5 py-0.5 text-[11px]"
                              style={{
                                backgroundColor:
                                  d.severity === 'error' ||
                                  d.severity === 'warning'
                                    ? 'var(--color-brand-tint)'
                                    : 'var(--bg-elevated)',
                                color:
                                  d.severity === 'error' ||
                                  d.severity === 'warning'
                                    ? 'var(--color-brand-text)'
                                    : 'var(--text-secondary)',
                              }}
                            >
                              {d.messageUk}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              {multiDateBatchPreview?.requiresConflictConfirmation && (
                <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchConfirmConflicts}
                    onChange={(e) =>
                      setBatchConfirmConflicts(e.target.checked)
                    }
                    className="h-4 w-4 accent-[#B93E4B]"
                    data-testid="roster-batch-confirm-conflicts"
                  />
                  <span>
                    Я підтверджую свідоме застосування попри перетин із наявними записами
                  </span>
                </label>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={
                    isApplyingBatch ||
                    selectedBatchDates.length === 0 ||
                    !multiDateBatchPreview ||
                    !multiDateBatchPreview.canCommit
                  }
                  onClick={handleCommitMultiDateBatch}
                  data-testid="roster-batch-commit-button"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Застосувати до вибраних дат ({selectedBatchDates.length})
                  </span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      </details>
      {/* Main Two-Column Layout: Month Roster Grid + Templates & Selected Date Inspector */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)] xl:items-start">
        {/* Month Grid with Browse or Multi-Date Selection */}
        <Card className="!p-2 sm:!p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {interactionMode === 'browse'
                ? 'Зміни та вихідні'
                : 'Сітка графіка (натискайте на дати для пакетного вибору)'}
            </span>
            <span
              className="text-[11px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              ◆ зміна · ○ вихідний
            </span>
          </div>

          <div
            className="grid grid-cols-7 gap-1 text-center"
            aria-hidden="true"
          >
            {monthGrid.weekdayHeadersUk.map((dayLabel) => (
              <div
                key={dayLabel}
                className="py-1 text-xs font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                {dayLabel}
              </div>
            ))}
          </div>

          <div
            role="group"
            aria-label="Сітка графіка роботи за місяць"
            data-testid="roster-month-grid"
            className="grid grid-cols-7 gap-1 sm:gap-1.5"
          >
            {monthGrid.cells.map((cell) => {
              const isBatchSelected = selectedBatchDates.includes(
                cell.localDate
              );
              const isBrowseSelected =
                interactionMode === 'browse' && cell.isSelected;
              const isToday = cell.isToday;
              const inMonth = cell.inActiveMonth;

              return (
                <button
                  key={cell.localDate}
                  type="button"
                  onClick={() => handleCellClick(cell)}
                  aria-label={`${cell.dayNumber} ${cell.visibleBadges.map(badge => badge.nonColorSymbol + badge.compactLabel.replace(/:00/g, '')).join(' ')} ${cell.overflowCount ? '+' + cell.overflowCount : ''}. ${cell.accessibleSummaryUk}`}
                  aria-pressed={
                    interactionMode === 'multi_date_edit'
                      ? isBatchSelected
                      : isBrowseSelected
                  }
                  data-testid={`roster-month-cell-${cell.localDate}`}
                  data-batch-selected={isBatchSelected ? 'true' : 'false'}
                  data-is-neutral={
                    cell.isNeutralUnknownDate ? 'true' : 'false'
                  }
                  className="group relative flex min-h-[52px] sm:min-h-[72px] w-full min-w-0 flex-col justify-between rounded-xl p-1 sm:p-1.5 text-left transition-colors focus:outline-none"
                  style={{
                    backgroundColor: isBatchSelected
                      ? 'var(--color-work-tint)'
                      : isBrowseSelected
                      ? 'var(--color-brand-tint)'
                      : isToday
                      ? 'var(--bg-elevated)'
                      : inMonth
                      ? 'transparent'
                      : 'transparent',
                    border: isBatchSelected
                      ? '2px solid var(--color-work)'
                      : isBrowseSelected
                      ? '2px solid var(--color-brand)'
                      : isToday
                      ? '1.5px solid var(--color-brand)'
                      : inMonth
                      ? '1px solid transparent'
                      : '1px solid transparent',
                    opacity:
                      1,
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-0.5">
                    <span
                      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 text-xs font-bold leading-none sm:h-6 sm:min-w-[24px] sm:text-sm"
                      style={
                        isBatchSelected
                          ? {
                              backgroundColor: 'var(--color-work)',
                              color: '#FFFFFF',
                            }
                          : isBrowseSelected
                          ? {
                              backgroundColor: 'var(--color-brand)',
                              color: '#FFFFFF',
                            }
                          : {
                              color: inMonth
                                ? 'var(--text-primary)'
                                : 'var(--text-secondary)',
                            }
                      }
                    >
                      {cell.dayNumber}
                    </span>

                    {isBatchSelected && (
                      <span
                        className="rounded px-1 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: 'var(--color-work)',
                          color: '#FFFFFF',
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="my-0.5 flex w-full min-w-0 flex-col gap-0.5 overflow-hidden">
                    {cell.visibleBadges.map((badge) => {
                      const badgeStyle =
                        badge.semanticRole === 'work'
                          ? {
                              backgroundColor: 'var(--color-work-tint)',
                              color: 'var(--color-work-text)',
                            }
                          : badge.semanticRole === 'dayoff'
                          ? {
                              backgroundColor: 'var(--color-dayoff-tint)',
                              color: 'var(--color-dayoff-text)',
                            }
                          : {
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-secondary)',
                            };
                      const mobileShortLabel = badge.compactLabel.replace(/:00/g, '');
                      return (
                        <span
                          key={badge.id}
                          aria-hidden="true"
                          className="block w-full overflow-hidden whitespace-nowrap rounded px-0.5 sm:px-1 py-0.5 text-[10px] font-semibold leading-tight tracking-tight"
                          style={{ color: badgeStyle.color }}
                        >
                          <span className="sm:hidden">
                            {badge.nonColorSymbol}
                            {mobileShortLabel}
                          </span>
                          <span className="hidden sm:inline">
                            {badge.nonColorSymbol} {badge.compactLabel}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  {/* Thin local-clock work strip */}
                  <div className="mt-auto w-full pt-0.5" aria-hidden="true" hidden={cell.workStripSegments.length === 0}>
                    <div
                      className="relative h-1.5 w-full overflow-hidden rounded-full"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        className="absolute inset-y-0 left-1/2 w-px"
                        style={{ backgroundColor: 'var(--border-strong)' }}
                      />
                      {cell.workStripSegments.map((seg) => (
                        <div
                          key={seg.segmentKey}
                          className="absolute inset-y-0 rounded-full"
                          style={{
                            backgroundColor: 'var(--color-work)',
                            left: `${seg.leftPercent}%`,
                            width: `${Math.max(4, seg.widthPercent)}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Column: Selected Date Roster Inspector & Shift Templates Manager */}
        <div className="space-y-4">
          {/* Selected Date Roster Inspector */}
          <Card
            data-testid="roster-selected-date-card"
            className="space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Обрана дата в графіку
                </p>
                <h3
                  className="text-base font-bold capitalize"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatUkrainianDateHeading(selectedDate)}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenGlobalCreation('shift')}
                  data-testid="roster-add-shift-button"
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Додати зміну</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenGlobalCreation('day_off')}
                  data-testid="roster-add-dayoff-button"
                >
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Вихідний</span>
                </Button>
              </div>
            </div>

            {/* Day-off annotations on selected date */}
            {selectedDateRawDayOffs.length > 0 && (
              <div className="space-y-1.5">
                {selectedDateRawDayOffs.map((ann) => (
                  <div
                    key={ann.id}
                    data-testid={`roster-dayoff-item-${ann.localDate}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--color-dayoff-tint)',
                      border: '1px solid var(--color-dayoff)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div>
                      <span
                        className="font-semibold"
                        style={{ color: 'var(--color-dayoff-text)' }}
                      >
                        ○ Позначено вихідний ({ann.code ?? 'В'})
                      </span>
                      {ann.note && (
                        <p
                          className="mt-0.5 text-[11px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {ann.note}
                        </p>
                      )}
                      {selectedDateWorkItems.length > 0 && (
                        <p
                          className="mt-0.5 text-[11px] font-medium"
                          style={{ color: 'var(--color-work-text)' }}
                        >
                          ◆ Змішаний стан: на цю дату також припадає частина робочої зміни (наприклад, перехід після нічної зміни).
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      onClick={() => handleRemoveDayOff(ann.id)}
                      data-testid={`remove-day-off-${ann.id}`}
                    >
                      Зняти
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Work shifts on selected date */}
            {selectedDateWorkItems.length === 0 ? (
              <p
                className="rounded-xl border border-dashed px-3 py-2.5 text-xs"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {selectedDateRawDayOffs.length > 0
                  ? 'На цю дату немає робочих змін (підтверджений вихідний).'
                  : 'Невідомо / без записів робочих змін чи вихідного на цю дату. Порожня дата не вважається автоматичним вихідним.'}
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDateWorkItems.map((item) => {
                  const ev = events.find((e) => e.id === item.sourceId);
                  return (
                    <div
                      key={item.itemKey}
                      data-testid={`roster-shift-item-${item.sourceId}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-xs"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderLeft: '4px solid var(--color-work)',
                      }}
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 font-bold">
                          <span>
                            ◆ {item.segment.displayStartLocalTime}–
                            {item.segment.displayEndLocalTime}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] font-normal"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {formatMinutesCompactUk(
                              item.segment.elapsedDurationMinutes
                            )}
                          </span>
                        </div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        {(item.segment.continuesBeforeDayStart ||
                          item.segment.continuesAfterDayEnd) && (
                          <p
                            className="text-[11px]"
                            style={{ color: 'var(--color-work-text)' }}
                          >
                            Повний інтервал зміни:{' '}
                            {item.segment.originClockRangeLabel}
                          </p>
                        )}
                      </div>

                      {ev && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="subtle"
                            size="sm"
                            onClick={() => onInspectEvent(ev)}
                            data-testid={`roster-edit-shift-${ev.id}`}
                          >
                            Редагувати
                          </Button>
                          <Button
                            type="button"
                            variant="subtle"
                            size="sm"
                            onClick={() => onCancelEvent(ev.id, ev.revision)}
                            data-testid={`roster-cancel-shift-${ev.id}`}
                          >
                            Скасувати
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 8.2 Shift Templates Manager */}
          <Card
            data-testid="roster-templates-section"
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3
                  className="text-base font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Шаблони змін
                </h3>
                <p
                  className="text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Редагування або видалення шаблону ніколи не перезаписує вже створені зміни.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleOpenCreateTemplate}
                data-testid="roster-create-template-button"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Новий шаблон</span>
              </Button>
            </div>

            {shiftTemplates.length === 0 ? (
              <p
                className="rounded-xl border border-dashed px-3 py-3 text-xs"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Немає шаблонів змін. Створіть шаблон (наприклад, «Д1» 08:00–20:00 або «Н1» 20:00–08:00 +1 доба) для швидкого заповнення графіка.
              </p>
            ) : (
              <div className="space-y-2">
                {shiftTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    data-testid={`shift-template-card-${tpl.code}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 font-bold"
                          style={{
                            backgroundColor: 'var(--color-work-tint)',
                            color: 'var(--color-work-text)',
                          }}
                        >
                          {tpl.code}
                        </span>
                        <span className="text-sm font-semibold">
                          {tpl.name}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        {tpl.startLocalTime}–{tpl.endLocalTime}
                        {tpl.endDateOffsetDays === 1
                          ? ' (+1 доба, нічний перехід)'
                          : ' (того ж дня)'}
                      </p>
                      {tpl.note && (
                        <p
                          className="text-[11px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {tpl.note}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleQuickApplyTemplateToSelectedDate(tpl)
                        }
                        data-testid={`apply-template-to-selected-date-${tpl.code}`}
                      >
                        На {selectedDate.slice(8, 10)}.{selectedDate.slice(5, 7)}
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        size="sm"
                        onClick={() => handleOpenEditTemplate(tpl)}
                        data-testid={`edit-template-${tpl.code}`}
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Змінити</span>
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        size="sm"
                        onClick={() => handleDeleteTemplate(tpl)}
                        data-testid={`delete-template-${tpl.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Видалити</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 8.2 Modal: Create / Edit Shift Template */}
      <ModalSheet
        isOpen={isTemplateModalOpen}
        title={
          editingTemplate
            ? 'Редагувати шаблон зміни'
            : 'Новий шаблон робочої зміни'
        }
        subtitle="Зміни, створені за шаблоном, зберігаються як незалежні події."
        isDirty={tplName.trim().length > 0 || tplCode.trim().length > 0}
        onClose={() => {
          setIsTemplateModalOpen(false);
          notifyModalChange(false);
        }}
      >
        <form
          onSubmit={handleSaveTemplate}
          className="space-y-3.5"
          data-testid="shift-template-form"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField
              label="Назва шаблону"
              placeholder="Наприклад: Денна зміна"
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              data-testid="template-name-input"
              required
            />
            <InputField
              label="Короткий код (для швидкого вводу)"
              placeholder="Наприклад: Д1 або Н1"
              value={tplCode}
              onChange={(e) => setTplCode(e.target.value)}
              data-testid="template-code-input"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InputField
              label="Час початку"
              type="time"
              value={tplStart}
              onChange={(e) => setTplStart(e.target.value)}
              data-testid="template-start-input"
              required
            />
            <InputField
              label="Час завершення"
              type="time"
              value={tplEnd}
              onChange={(e) => {
                const nextEnd = e.target.value;
                setTplEnd(nextEnd);
                if (nextEnd < tplStart) {
                  setTplOffset(1);
                }
              }}
              data-testid="template-end-input"
              required
            />
            <SelectField
              label="Дата завершення"
              value={String(tplOffset)}
              onChange={(e) => setTplOffset(Number(e.target.value) as 0 | 1)}
              options={[
                { value: '0', label: 'Того ж дня (+0)' },
                { value: '1', label: 'Наступної доби (+1)' },
              ]}
              data-testid="template-offset-select"
            />
          </div>

          <TextAreaField
            label="Нотатка шаблону (необов’язково)"
            placeholder="Наприклад: Стандартна зміна у відділенні"
            value={tplNote}
            onChange={(e) => setTplNote(e.target.value)}
            data-testid="template-note-input"
          />

          {tplError && (
            <FeedbackBanner
              tone="error"
              message={tplError}
              onDismiss={() => setTplError(null)}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsTemplateModalOpen(false);
                notifyModalChange(false);
              }}
            >
              Скасувати
            </Button>
            <Button
              type="submit"
              variant="primary"
              data-testid="template-save-button"
            >
              Зберегти шаблон
            </Button>
          </div>
        </form>
      </ModalSheet>

      {/* 8.4 Modal: Finite Period Generator */}
      <ModalSheet
        isOpen={isPeriodModalOpen}
        title="Генерація графіка на скінченний період"
        subtitle="Додайте зміни лише на вибрані дати."
        isDirty={false}
        onClose={() => {
          setIsPeriodModalOpen(false);
          notifyModalChange(false);
        }}
      >
        <div
          className="space-y-4"
          data-testid="roster-period-generator-modal"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField
              label="Початок періоду"
              type="date"
              lang="uk"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              data-testid="period-start-date-input"
            />
            <InputField
              label="Кінець періоду (включно)"
              type="date"
              lang="uk"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              data-testid="period-end-date-input"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium">
              Дні тижня (якщо цикл не задано)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_OPTIONS_MONDAY_FIRST.map((w) => {
                const active = periodWeekdays.includes(w.index0To6);
                return (
                  <button
                    key={w.index0To6}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setPeriodWeekdays((prev) =>
                        prev.includes(w.index0To6)
                          ? prev.filter((d) => d !== w.index0To6)
                          : [...prev, w.index0To6].sort()
                      )
                    }
                    data-testid={`period-weekday-toggle-${w.index0To6 + 1}`}
                    className="min-h-[40px] min-w-[44px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--color-work)',
                            color: '#FFFFFF',
                          }
                        : {
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)',
                          }
                    }
                  >
                    {w.shortUk}
                  </button>
                );
              })}
            </div>
          </div>

          <InputField label="Послідовність циклу" value={cyclePattern} onChange={e=>setCyclePattern(e.target.value)} hint="Коди ваших шаблонів через кому; - означає вихідний. Наприклад: Д,Н,-,-. Повторюється лише в обраному періоді." />
          <InputField label="Повтор кожні N днів (необов’язково)" type="number" min="1" max="366" value={cycleEveryDays} onChange={e => setCycleEveryDays(e.target.value)} hint="Цикл розгортається лише в обраному періоді. Редагування однієї зміни не змінює решту." />
          <SelectField
            label="Дія для відібраних дат періоду"
            value={periodActionKind}
            onChange={(e) =>
              setPeriodActionKind(
                e.target.value as 'template_shift' | 'custom_shift' | 'day_off'
              )
            }
            options={[
              {
                value: 'template_shift',
                label: 'Застосувати шаблон зміни',
              },
              {
                value: 'custom_shift',
                label: 'Власний інтервал зміни',
              },
              {
                value: 'day_off',
                label: 'Позначити вихідні дні (В)',
              },
            ]}
            data-testid="period-action-kind-select"
          />

          {periodActionKind === 'template_shift' && (
            <SelectField
              label="Шаблон зміни"
              value={effectivePeriodTemplate?.id ?? ''}
              onChange={(e) => setPeriodTemplateId(e.target.value)}
              options={shiftTemplates.map((t) => ({
                value: t.id,
                label: `${t.code} — ${t.name} (${t.startLocalTime}–${t.endLocalTime})`,
              }))}
              data-testid="period-template-select"
            />
          )}

          {periodActionKind === 'custom_shift' && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <InputField
                label="Назва"
                value={periodCustomTitle}
                onChange={(e) => setPeriodCustomTitle(e.target.value)}
                data-testid="period-custom-title"
              />
              <InputField
                label="Початок"
                type="time"
                value={periodCustomStart}
                onChange={(e) => setPeriodCustomStart(e.target.value)}
                data-testid="period-custom-start"
              />
              <InputField
                label="Завершення"
                type="time"
                value={periodCustomEnd}
                onChange={(e) => setPeriodCustomEnd(e.target.value)}
                data-testid="period-custom-end"
              />
              <SelectField
                label="Дата завершення"
                value={String(periodCustomOffset)}
                onChange={(e) =>
                  setPeriodCustomOffset(Number(e.target.value) as 0 | 1)
                }
                options={[
                  { value: '0', label: 'Того ж дня (+0)' },
                  { value: '1', label: 'Наступної доби (+1)' },
                ]}
                data-testid="period-custom-offset"
              />
            </div>
          )}

          {periodActionKind === 'day_off' && (
            <InputField
              label="Код вихідного"
              value={periodDayOffCode}
              onChange={(e) => setPeriodDayOffCode(e.target.value)}
              data-testid="period-dayoff-code"
            />
          )}

          {/* Preview of generated finite period records */}
          <div
            data-testid="period-generator-preview"
            className="rounded-xl p-3 text-xs space-y-2"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {periodPreviewState.errorUk ? (
              <p style={{ color: 'var(--color-brand-text)' }}>
                {periodPreviewState.errorUk}
              </p>
            ) : periodPreviewState.preview ? (
              <>
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    Попередній перегляд (
                    {periodPreviewState.preview.activeItems.length} дат у поясі{' '}
                    {periodPreviewState.preview.lockedZoneId}):
                  </span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                  {periodPreviewState.preview.activeItems.map((item) => (
                    <div
                      key={item.previewKey}
                      className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <span>
                        {item.localDate}: {formatProposedItemSummaryUk(item)}
                      </span>
                      {item.hasConflictWarning && (
                        <span style={{ color: 'var(--color-brand-text)' }}>
                          ! Конфлікт
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {periodPreviewState.preview?.requiresConflictConfirmation && (
              <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={periodConfirmConflicts}
                  onChange={(e) =>
                    setPeriodConfirmConflicts(e.target.checked)
                  }
                  className="h-4 w-4 accent-[#B93E4B]"
                  data-testid="period-confirm-conflicts-checkbox"
                />
                <span>
                  Я підтверджую свідоме створення змін попри перетини
                </span>
              </label>
            )}
          </div>

          {periodError && (
            <FeedbackBanner
              tone="error"
              message={periodError}
              onDismiss={() => setPeriodError(null)}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsPeriodModalOpen(false);
                notifyModalChange(false);
              }}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCommitPeriodGenerator}
              data-testid="period-generator-commit-button"
            >
              Створити незалежні записи
            </Button>
          </div>
        </div>
      </ModalSheet>

      {/* 8.5 Modal: Deterministic Local Text Parser */}
      <ModalSheet
        isOpen={isTextParserModalOpen}
        title="Детерміноване текстове внесення графіка"
        subtitle={`Цільовий місяць: ${monthGrid.monthHeadingUk} (${activeYear}-${String(
          activeMonth
        ).padStart(2, '0')}) • Часовий пояс: ${displayZone}`}
        isDirty={rawRosterText.trim().length > 0}
        onClose={() => {
          setIsTextParserModalOpen(false);
          notifyModalChange(false);
        }}
      >
        <div
          className="space-y-4"
          data-testid="roster-text-parser-modal"
        >
          <div
            className="rounded-xl p-3 text-xs space-y-1.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                Підтримуваний синтаксис (по одному запису на рядок):
              </span>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => {
                  const firstCode = shiftTemplates[0]?.code ?? '08:00-20:00';
                  setRawRosterText(
                    `5 ${firstCode}\n6 20:00-08:00\n7 В\n10 09:00-18:00 Зміна у відділенні`
                  );
                  setExcludedLineNumbers([]);
                }}
                data-testid="text-parser-insert-sample-button"
              >
                Вставити приклад
              </Button>
            </div>
            <ul
              className="list-disc pl-4 space-y-0.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <li>
                <strong>День + код шаблону:</strong> <code>5 Д1</code> або{' '}
                <code>12 Н1</code>
              </li>
              <li>
                <strong>День + ручний інтервал:</strong>{' '}
                <code>7 08:00-20:00</code> або нічний перехід{' '}
                <code>8 20:00-08:00</code> (або явно <code>+1</code>)
              </li>
              <li>
                <strong>День + код вихідного:</strong> <code>4 В</code> або{' '}
                <code>9 ВИХ</code>
              </li>
            </ul>
          </div>

          <TextAreaField
            label="Рядки графіка на поточний місяць"
            placeholder={'5 Д1\n6 20:00-08:00\n7 В'}
            value={rawRosterText}
            onChange={(e) => {
              setRawRosterText(e.target.value);
              setParserError(null);
            }}
            data-testid="text-parser-textarea"
          />

          {/* Live Deterministic Parse Preview */}
          {textParserPreview && textParserPreview.items.length > 0 && (
            <div
              data-testid="text-parser-preview-container"
              className="space-y-2.5 rounded-xl p-3 text-xs"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Розібрано рядків: {textParserPreview.items.length} (дієвих:{' '}
                  {textParserPreview.activeItems.filter(
                    (i) => !i.hasBlockingError
                  ).length}
                  , з помилками: {textParserPreview.blockingErrorCount})
                </span>
                {textParserPreview.blockingErrorCount > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const errLines = textParserPreview.items
                        .filter(
                          (r) =>
                            r.hasBlockingError &&
                            r.sourceLineNumber !== undefined
                        )
                        .map((r) => r.sourceLineNumber!);
                      setExcludedLineNumbers((prev) =>
                        Array.from(new Set([...prev, ...errLines]))
                      );
                    }}
                    data-testid="text-parser-exclude-error-rows-button"
                  >
                    Виключити всі рядки з помилками
                  </Button>
                )}
              </div>

              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {textParserPreview.items.map((row, rowIdx) => {
                  const lineNum = row.sourceLineNumber ?? rowIdx + 1;
                  const isExcluded = Boolean(row.excluded);
                  const isValid = !row.hasBlockingError;
                  const errorDiagnostics = row.diagnostics.filter(
                    (d) => d.severity === 'error'
                  );
                  const warnDiagnostics = row.diagnostics.filter(
                    (d) =>
                      d.severity !== 'error' &&
                      !(row.isMixedDayOffCarryover && d.code === 'MIXED_DAY_OFF_WITH_OVERNIGHT_CARRYOVER')
                  );

                  return (
                    <div
                      key={row.previewKey}
                      data-testid={`text-parser-row-${lineNum}`}
                      data-row-valid={isValid ? 'true' : 'false'}
                      data-row-excluded={isExcluded ? 'true' : 'false'}
                      className="rounded-lg p-2.5 space-y-1"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border:
                          !isValid && !isExcluded
                            ? '1.5px solid var(--color-brand)'
                            : '1px solid var(--border-subtle)',
                        opacity: isExcluded ? 0.55 : 1,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                            style={{ backgroundColor: 'var(--bg-elevated)' }}
                          >
                            #{lineNum}: {row.rawLineText}
                          </span>
                          {isValid ? (
                            <span
                              className="font-semibold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {row.localDate}:{' '}
                              {formatProposedItemSummaryUk(row)}
                            </span>
                          ) : (
                            <span
                              className="font-semibold"
                              style={{ color: 'var(--color-brand-text)' }}
                            >
                              Помилка рядка
                            </span>
                          )}
                        </div>

                        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setExcludedLineNumbers((prev) =>
                                checked
                                  ? [...prev, lineNum]
                                  : prev.filter((n) => n !== lineNum)
                              );
                            }}
                            data-testid={`text-parser-exclude-row-${lineNum}`}
                          />
                          <span>Пропустити рядок</span>
                        </label>
                      </div>

                      {row.isAutoNextDaySuggested && (
                        <p
                          className="text-[11px]"
                          style={{ color: 'var(--color-work-text)' }}
                        >
                          ◆ Автоматично визначено перехід на наступну добу (+1 доба).
                        </p>
                      )}

                      {row.isMixedDayOffCarryover && (
                        <p
                          data-testid={`text-parser-mixed-carryover-${lineNum}`}
                          className="text-[11px] font-medium"
                          style={{ color: 'var(--color-work-text)' }}
                        >
                          ◆ Змішаний стан: вихідний у день, куди переходить завершення попередньої нічної зміни (дозволено).
                        </p>
                      )}

                      {errorDiagnostics.map((errDiag, idx) => (
                        <p
                          key={idx}
                          className="text-[11px] font-semibold"
                          style={{ color: 'var(--color-brand-text)' }}
                        >
                          ✕ {errDiag.messageUk}
                        </p>
                      ))}

                      {warnDiagnostics.map((warnDiag, idx) => (
                        <p
                          key={idx}
                          className="text-[11px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          ! {warnDiag.messageUk}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>

              {textParserPreview.requiresConflictConfirmation && (
                <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parserConfirmConflicts}
                    onChange={(e) =>
                      setParserConfirmConflicts(e.target.checked)
                    }
                    className="h-4 w-4 accent-[#B93E4B]"
                    data-testid="text-parser-confirm-conflicts-checkbox"
                  />
                  <span>
                    Я підтверджую свідоме збереження попри перетини в розкладі
                  </span>
                </label>
              )}
            </div>
          )}

          {parserError && (
            <FeedbackBanner
              tone="error"
              message={parserError}
              onDismiss={() => setParserError(null)}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsTextParserModalOpen(false);
                notifyModalChange(false);
              }}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!textParserPreview || !textParserPreview.canCommit}
              onClick={handleCommitTextParser}
              data-testid="text-parser-commit-button"
            >
              Зберегти розпізнаний графік
            </Button>
          </div>
        </div>
      </ModalSheet>
    </div>
  );
};
