import { CalendarGrid } from "../calendar/CalendarGrid";
import {
  Section,
  Row,
  Sheet,
  Segmented,
  ActionMenu,
  DateField,
  TimeField,
  SelectField,
  Toggle,
  RoundButton,
} from "../../ui";
import {
  formatDate,
  formatMonthYear,
  formatTimeRange,
  sentenceCase,
} from "../../lib/format";
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
} from "lucide-react";
import React, { useMemo, useState, useEffect } from "react";
import { formatMinutesCompactUk } from "../../domain/formatting";
import {
  MultiDateBatchActionSpec,
  ProposedRosterItem,
  RosterBatchPreview,
  calculateMonthWorkSummary,
  generateFinitePeriodRosterPreview,
  instantiateWorkShiftFromTemplate,
  parseDeterministicRosterText,
  prepareMultiDateRosterBatch,
} from "../../domain/roster";
import {
  ProjectedMonthCalendarGrid,
  ProjectedMonthCell,
  projectScheduleForDate,
} from "../../domain/scheduling";
import {
  formatUkrainianDateHeading,
  parseLocalDateParts,
  addMonthsToLocalDate,
} from "../../domain/temporal";
import {
  CalendarEvent,
  DayOffAnnotation,
  EntityId,
  IanaTimeZone,
  LocalDateString,
  ShiftTemplate,
  Task,
  TaskReservation,
} from "../../domain/types";
import { ImplementedCreationActionKind } from "../../state/shellStore";
import {
  PlanuiRepositories,
  RosterBatchUndoToken,
} from "../../storage/repositories";
import {
  Button,
  Card,
  FeedbackBanner,
  InputField as LegacyInputField,
  ModalSheet,
  SegmentedControl,
  TextAreaField,
} from "../ui/primitives";

function InputField(props: React.ComponentProps<typeof LegacyInputField>) {
  if (props.type === "date" || props.type === "time") {
    const { type, hint, error, ...field } = props;
    const Field = type === "date" ? DateField : TimeField;
    return <Field {...field} value={String(props.value ?? "")} />;
  }
  return <LegacyInputField {...props} />;
}
function BooleanControl({
  checked,
  onChange,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Toggle
      label={props["aria-label"] ?? "Підтвердити вибір"}
      checked={Boolean(checked)}
      onChange={(value) =>
        onChange?.({
          target: { checked: value },
        } as React.ChangeEvent<HTMLInputElement>)
      }
    />
  );
}
export interface WorkRosterSubviewProps {
  stampMode?: boolean;
  initialTool?: "period" | "text" | null;
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
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind,
  ) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void> | void;
  onModalStateChange?: (isOpen: boolean) => void;
}

type RosterInteractionMode = "browse" | "multi_date_edit";
type BatchActionChoiceKind =
  "template_shift" | "custom_shift" | "day_off" | "clear_date";

function createId(): string {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatProposedItemSummaryUk(item: ProposedRosterItem): string {
  if (item.kind === "clear_date") {
    return "Очистити робочі зміни та вихідні на цю дату";
  }
  if (item.kind === "day_off") {
    const code = item.dayOffToSave?.code ?? "В";
    return `Вихідний (${code})`;
  }
  if (item.eventToSave && item.eventToSave.schedule.kind === "timed") {
    const iv = item.eventToSave.schedule.interval;
    return `${item.eventToSave.title} (${iv.originStartLocalTime}–${
      iv.originEndLocalTime
    }${item.isOvernight ? ` → ${iv.originEndLocalDate}` : ""}, ${formatMinutesCompactUk(
      item.elapsedDurationMinutes,
    )})`;
  }
  return "Робоча зміна";
}

const WEEKDAY_OPTIONS_MONDAY_FIRST: ReadonlyArray<{
  index0To6: number;
  shortUk: string;
}> = [
  { index0To6: 0, shortUk: "Пн" },
  { index0To6: 1, shortUk: "Вт" },
  { index0To6: 2, shortUk: "Ср" },
  { index0To6: 3, shortUk: "Чт" },
  { index0To6: 4, shortUk: "Пт" },
  { index0To6: 5, shortUk: "Сб" },
  { index0To6: 6, shortUk: "Нд" },
];

export const WorkRosterSubview: React.FC<WorkRosterSubviewProps> = ({
  selectedDate,
  stampMode = false,
  initialTool = null,
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
  const [stampTab, setStampTab] = useState<"stamp" | "templates">("stamp");
  const [armed, setArmed] = useState<ShiftTemplate | null>(null);
  const [dayActions, setDayActions] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEnd, setRepeatEnd] = useState(selectedDate);
  const [repeatWork, setRepeatWork] = useState("2"),
    [repeatRest, setRepeatRest] = useState("2");
  const [stampBusy, setStampBusy] = useState(false);
  const [confirmPaint, setConfirmPaint] = useState<RosterBatchPreview | null>(
    null,
  );
  useEffect(() => {
    if (initialTool === "period") setIsPeriodModalOpen(true);
    if (initialTool === "text") setIsTextParserModalOpen(true);
  }, [initialTool]);
  const { year: activeYear, month: activeMonth } = useMemo(
    () =>
      parseLocalDateParts(selectedDate) ?? { year: 2026, month: 11, day: 1 },
    [selectedDate],
  );

  // 8.1 Clear browse vs multi-date edit mode
  const [interactionMode, setInteractionMode] =
    useState<RosterInteractionMode>("browse");

  // 8.3 Multi-date batch state
  const [selectedBatchDates, setSelectedBatchDates] = useState<
    LocalDateString[]
  >([]);
  const [batchActionKind, setBatchActionKind] =
    useState<BatchActionChoiceKind>("template_shift");
  const [batchTemplateId, setBatchTemplateId] = useState<string>("");
  const [batchCustomTitle, setBatchCustomTitle] =
    useState<string>("Робоча зміна");
  const [batchCustomCode, setBatchCustomCode] = useState<string>("РЗ");
  const [batchCustomStart, setBatchCustomStart] = useState<string>("08:00");
  const [batchCustomEnd, setBatchCustomEnd] = useState<string>("20:00");
  const [batchCustomOffset, setBatchCustomOffset] = useState<0 | 1>(0);
  const [batchCustomNote, setBatchCustomNote] = useState<string>("");
  const [batchDayOffCode, setBatchDayOffCode] = useState<string>("В");
  const [batchDayOffNote, setBatchDayOffNote] = useState<string>("");
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
    null,
  );
  const [tplName, setTplName] = useState<string>("");
  const [tplCode, setTplCode] = useState<string>("");
  const [tplStart, setTplStart] = useState<string>("08:00");
  const [tplEnd, setTplEnd] = useState<string>("20:00");
  const [tplOffset, setTplOffset] = useState<0 | 1>(0);
  const [tplNote, setTplNote] = useState<string>("");
  const [tplError, setTplError] = useState<string | null>(null);

  // 8.4 Finite period generator modal state
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState<boolean>(false);
  const [periodStart, setPeriodStart] = useState<LocalDateString>(
    `${String(activeYear).padStart(4, "0")}-${String(activeMonth).padStart(
      2,
      "0",
    )}-01`,
  );
  const [periodEnd, setPeriodEnd] = useState<LocalDateString>(
    `${String(activeYear).padStart(4, "0")}-${String(activeMonth).padStart(
      2,
      "0",
    )}-14`,
  );
  const [cyclePattern, setCyclePattern] = useState("");
  const [cycleEveryDays, setCycleEveryDays] = useState("");
  const [periodWeekdays, setPeriodWeekdays] = useState<number[]>([0, 2, 4]);
  const [periodActionKind, setPeriodActionKind] = useState<
    "template_shift" | "custom_shift" | "day_off"
  >("template_shift");
  const [periodTemplateId, setPeriodTemplateId] = useState<string>("");
  const [periodCustomTitle, setPeriodCustomTitle] =
    useState<string>("Зміна за періодом");
  const [periodCustomCode, setPeriodCustomCode] = useState<string>("ЗП");
  const [periodCustomStart, setPeriodCustomStart] = useState<string>("09:00");
  const [periodCustomEnd, setPeriodCustomEnd] = useState<string>("21:00");
  const [periodCustomOffset, setPeriodCustomOffset] = useState<0 | 1>(0);
  const [periodDayOffCode, setPeriodDayOffCode] = useState<string>("В");
  const [periodConfirmConflicts, setPeriodConfirmConflicts] =
    useState<boolean>(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

  // 8.5 Deterministic local text parser modal state
  const [isTextParserModalOpen, setIsTextParserModalOpen] =
    useState<boolean>(false);
  const [rawRosterText, setRawRosterText] = useState<string>("");
  const [excludedLineNumbers, setExcludedLineNumbers] = useState<number[]>([]);
  const [parserConfirmConflicts, setParserConfirmConflicts] =
    useState<boolean>(false);
  const [parserError, setParserError] = useState<string | null>(null);

  useEffect(() => {
    onModalStateChange?.(
      dayActions ||
        repeatOpen ||
        Boolean(confirmPaint) ||
        isTemplateModalOpen ||
        isPeriodModalOpen ||
        isTextParserModalOpen,
    );
    return () => onModalStateChange?.(false);
  }, [
    dayActions,
    repeatOpen,
    Boolean(confirmPaint),
    isTemplateModalOpen,
    isPeriodModalOpen,
    isTextParserModalOpen,
  ]);

  const notifyModalChange = (open: boolean) => {
    onModalStateChange?.(open);
  };

  // Effective selected template for batch/period
  const effectiveBatchTemplate = useMemo(
    () =>
      shiftTemplates.find((t) => t.id === batchTemplateId) ??
      shiftTemplates[0] ??
      null,
    [shiftTemplates, batchTemplateId],
  );

  const effectivePeriodTemplate = useMemo(
    () =>
      shiftTemplates.find((t) => t.id === periodTemplateId) ??
      shiftTemplates[0] ??
      null,
    [shiftTemplates, periodTemplateId],
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
    [selectedDate, displayZone, events, dayOffAnnotations],
  );

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
    [selectedDate, displayZone, events, reservations, tasks, dayOffAnnotations],
  );

  const selectedDateWorkItems = useMemo(
    () =>
      selectedDayProjection.timelineItems.filter(
        (item) => item.sourceKind === "work_shift",
      ),
    [selectedDayProjection],
  );

  const selectedDateRawDayOffs = useMemo(
    () => dayOffAnnotations.filter((a) => a.localDate === selectedDate),
    [dayOffAnnotations, selectedDate],
  );

  // Build current MultiDateBatchActionSpec for 8.3 multi-date mode
  const currentBatchActionSpec =
    useMemo<MultiDateBatchActionSpec | null>(() => {
      if (batchActionKind === "template_shift") {
        if (!effectiveBatchTemplate) return null;
        return {
          kind: "template_shift",
          template: effectiveBatchTemplate,
        };
      }
      if (batchActionKind === "custom_shift") {
        return {
          kind: "custom_shift",
          title: batchCustomTitle.trim() || "Робоча зміна",
          shiftCode: batchCustomCode.trim() || null,
          startLocalTime: batchCustomStart,
          endLocalTime: batchCustomEnd,
          endDateOffsetDays: batchCustomOffset,
          color: "work",
          note: batchCustomNote.trim() || null,
        };
      }
      if (batchActionKind === "day_off") {
        return {
          kind: "day_off",
          code: batchDayOffCode.trim() || "В",
          note: batchDayOffNote.trim() || null,
        };
      }
      return { kind: "clear_date" };
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
      interactionMode !== "multi_date_edit" ||
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
        nowIso: new Date().toISOString(),
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
      { kind: "clear_date" }
    > | null = null;
    if (periodActionKind === "template_shift") {
      if (!effectivePeriodTemplate) {
        return {
          preview: null,
          errorUk:
            "Оберіть шаблон зміни або перемкніть дію на «Власний інтервал зміни».",
        };
      }
      actionSpec = {
        kind: "template_shift",
        template: effectivePeriodTemplate,
      };
    } else if (periodActionKind === "custom_shift") {
      actionSpec = {
        kind: "custom_shift",
        title: periodCustomTitle.trim() || "Зміна за періодом",
        shiftCode: periodCustomCode.trim() || null,
        startLocalTime: periodCustomStart,
        endLocalTime: periodCustomEnd,
        endDateOffsetDays: periodCustomOffset,
        color: "work",
        note: null,
      };
    } else {
      actionSpec = {
        kind: "day_off",
        code: periodDayOffCode.trim() || "В",
        note: null,
      };
    }

    try {
      const preview = generateFinitePeriodRosterPreview({
        startDate: periodStart,
        endDate: periodEnd,
        cycleTemplateSequence: cyclePattern.trim()
          ? cyclePattern.split(",").map((code) => {
              const key = code.trim();
              if (key === "-") return null;
              const template = shiftTemplates.find(
                (template) => template.code === key,
              );
              if (!template) throw new Error(`Невідомий код шаблону: ${key}`);
              return template;
            })
          : undefined,
        cycleEveryDays: cycleEveryDays ? Number(cycleEveryDays) : undefined,
        selectedWeekdaysMondayFirst: periodWeekdays,
        action: actionSpec,
        lockedZoneId: displayZone,
        existingEvents: events,
        existingReservations: reservations,
        existingDayOffAnnotations: dayOffAnnotations,
        nowIso: new Date().toISOString(),
      });
      return { preview, errorUk: null };
    } catch (err) {
      return {
        preview: null,
        errorUk:
          err instanceof Error
            ? err.message
            : "Некоректний період генерації (максимум 366 днів).",
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
      nowIso: new Date().toISOString(),
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
    if (interactionMode === "browse") {
      onSelectDate(cell.localDate);
      return;
    }
    // In multi_date_edit mode: toggle date selection without painting unselected dates
    setBatchError(null);
    setSelectedBatchDates((prev) =>
      prev.includes(cell.localDate)
        ? prev.filter((d) => d !== cell.localDate)
        : [...prev, cell.localDate].sort(),
    );
  };

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTplName("");
    setTplCode("");
    setTplStart("08:00");
    setTplEnd("20:00");
    setTplOffset(0);
    setTplNote("");
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
    setTplNote(tpl.note ?? "");
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
        color: "work",
        note: tplNote.trim() ? tplNote.trim() : null,
        createdAt: editingTemplate ? editingTemplate.createdAt : nowIso,
        updatedAt: nowIso,
        revision: editingTemplate ? editingTemplate.revision + 1 : 1,
      };
      await repositories.saveShiftTemplate(record, editingTemplate?.revision);
      setIsTemplateModalOpen(false);
      notifyModalChange(false);
      await onDataChanged(
        editingTemplate
          ? `Шаблон «${record.name}» (${record.code}) оновлено.`
          : `Шаблон «${record.name}» (${record.code}) створено.`,
      );
    } catch (err) {
      setTplError(
        err instanceof Error
          ? err.message
          : "Не вдалося зберегти шаблон зміни.",
      );
    }
  };

  const handleDeleteTemplate = async (tpl: ShiftTemplate) => {
    try {
      await repositories.deleteShiftTemplateTransactionally(tpl.id);
      await onDataChanged(
        `Шаблон «${tpl.name}» видалено. Усі раніше застосовані зміни в календарі збережено без змін.`,
      );
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : "Не вдалося видалити шаблон.",
      );
    }
  };

  const handleCommitMultiDateBatch = async () => {
    if (!multiDateBatchPreview) return;
    setBatchError(null);

    if (!multiDateBatchPreview.canCommit) {
      setBatchError("Виправте параметри дії перед пакетним збереженням.");
      return;
    }

    if (
      multiDateBatchPreview.requiresConflictConfirmation &&
      !batchConfirmConflicts
    ) {
      setBatchError(
        "Підтвердьте свідоме застосування попри конфлікти розкладу або змініть вибір дат.",
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
        `Пакетно оновлено графік для ${appliedCount} дат(и). Доступна безпечна відміна.`,
      );
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : "Не вдалося виконати пакетне збереження.",
      );
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const handleUndoLastBatch = async () => {
    if (!lastUndoToken) return;
    setBatchError(null);
    try {
      const res =
        await repositories.undoRosterBatchTransactionally(lastUndoToken);
      setLastUndoToken(null);
      if (res.preservedLaterEditsCount > 0) {
        await onDataChanged(
          `Скасовано пакетне внесення (${res.restoredEventsCount} змін, ${res.restoredDayOffsCount} вихідних). Збережено ${res.preservedLaterEditsCount} запис(ів), які були змінені пізніше.`,
        );
      } else {
        await onDataChanged(
          `Пакетне внесення скасовано (${res.restoredEventsCount} змін, ${res.restoredDayOffsCount} вихідних).`,
        );
      }
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : "Не вдалося скасувати пакетне внесення.",
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
      setPeriodError(
        "У вибраному періоді немає дат для зазначених днів тижня.",
      );
      return;
    }
    if (preview.requiresConflictConfirmation && !periodConfirmConflicts) {
      setPeriodError(
        "Підтвердьте свідоме створення змін попри перетини в розкладі.",
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
        `Згенеровано незалежні записи на період для ${preview.activeItems.length} дат(и).`,
      );
    } catch (err) {
      setPeriodError(
        err instanceof Error
          ? err.message
          : "Не вдалося застосувати генерацію на період.",
      );
    }
  };

  const handleCommitTextParser = async () => {
    if (!textParserPreview) return;
    setParserError(null);

    if (!textParserPreview.canCommit) {
      setParserError(
        "Виправте або позначте для пропуску всі рядки з помилками перед збереженням.",
      );
      return;
    }
    if (
      textParserPreview.requiresConflictConfirmation &&
      !parserConfirmConflicts
    ) {
      setParserError(
        "Підтвердьте свідоме збереження змін попри перетини у розкладі.",
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
      setRawRosterText("");
      setExcludedLineNumbers([]);
      setParserConfirmConflicts(false);
      await onDataChanged(
        `Розпізнано та збережено графік (${textParserPreview.eventsToSave.length} змін, ${textParserPreview.dayOffAnnotationsToSave.length} вихідних).`,
      );
    } catch (err) {
      setParserError(
        err instanceof Error
          ? err.message
          : "Не вдалося зберегти розпізнаний графік.",
      );
    }
  };

  const handleRemoveDayOff = async (annotationId: EntityId) => {
    try {
      await repositories.deleteDayOffAnnotationTransactionally(annotationId);
      await onDataChanged("Позначку вихідного знято.");
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : "Не вдалося зняти позначку вихідного.",
      );
    }
  };

  const startPeriod = () => {
    setPeriodStart(selectedDate.slice(0, 7) + "-01");
    setPeriodEnd(selectedDate.slice(0, 7) + "-14");
    setPeriodError(null);
    setIsPeriodModalOpen(true);
    notifyModalChange(true);
  };
  const builtins: ShiftTemplate[] = [
    {
      id: "preset-day",
      name: "Денна",
      code: "Д",
      startLocalTime: "08:00",
      endLocalTime: "20:00",
      endDateOffsetDays: 0,
      color: "work",
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
    },
    {
      id: "preset-night",
      name: "Нічна",
      code: "Н",
      startLocalTime: "20:00",
      endLocalTime: "08:00",
      endDateOffsetDays: 1,
      color: "work",
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
    },
  ];
  const arm = async (template: ShiftTemplate) => {
    try {
      if (template.id.startsWith("preset-")) {
        const saved = { ...template, id: createId() };
        await repositories.saveShiftTemplate(saved);
        setArmed(saved);
        await onDataChanged();
      } else setArmed(template);
    } catch {
      setBatchError("Не вдалося обрати шаблон.");
    }
  };
  const commitPaint = async (preview: RosterBatchPreview) => {
    setStampBusy(true);
    try {
      const result = await repositories.applyRosterBatchTransactionally({
        eventsToSave: preview.eventsToSave,
        dayOffAnnotationsToSave: preview.dayOffAnnotationsToSave,
        eventIdsToDelete: preview.eventIdsToDelete,
        dayOffAnnotationIdsToDelete: preview.dayOffAnnotationIdsToDelete,
      });
      setLastUndoToken(result.undoToken);
      setConfirmPaint(null);
      await onDataChanged();
    } catch {
      setBatchError("Не вдалося зберегти зміни.");
    } finally {
      setStampBusy(false);
    }
  };
  const paint = async (
    dates: string[],
    action: MultiDateBatchActionSpec = armed
      ? { kind: "template_shift", template: armed }
      : { kind: "day_off", code: "В", note: null },
  ) => {
    if (stampBusy) return;
    try {
      const preview = prepareMultiDateRosterBatch({
        selectedDates: dates,
        action,
        lockedZoneId: displayZone,
        existingEvents: events,
        existingReservations: reservations,
        existingDayOffAnnotations: dayOffAnnotations,
        nowIso: new Date().toISOString(),
      });
      if (!preview.canCommit) {
        setBatchError("Перевірте обрані дати.");
        return;
      }
      if (preview.requiresConflictConfirmation) setConfirmPaint(preview);
      else await commitPaint(preview);
    } catch {
      setBatchError("Не вдалося підготувати зміни.");
    }
  };
  const choose = (cell: ProjectedMonthCell) => {
    if (!stampMode) {
      handleCellClick(cell);
      setDayActions(interactionMode === "browse");
      return;
    }
    onSelectDate(cell.localDate);
    if (cell.markerCounts.workShiftsCount || cell.hasExplicitDayOff)
      setDayActions(true);
    else if (armed) void paint([cell.localDate]);
    else setDayActions(true);
  };
  const summary = [
    monthSummary.intersectingShiftCount
      ? `${monthSummary.intersectingShiftCount} зміни`
      : null,
    monthSummary.explicitDayOffCount
      ? `${monthSummary.explicitDayOffCount} вихідні`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="roster-stage3" data-testid="work-roster-subview">
      {stampMode ? (
        <Segmented
          label="Розділ штампа"
          value={stampTab}
          onChange={setStampTab}
          options={[
            { value: "stamp", label: "Штамп" },
            { value: "templates", label: "Шаблони" },
          ]}
        />
      ) : (
        <>
          <p className="roster-summary" data-testid="roster-month-summary">
            {sentenceCase(formatDate(selectedDate, { month: "long" }))}
            {summary ? `: ${summary}` : ""}
          </p>
          <div className="roster-mode">
            <Segmented
              label="Робота з графіком"
              value={interactionMode}
              onChange={(v) => {
                setInteractionMode(v);
                setSelectedBatchDates([]);
              }}
              options={[
                { value: "browse", label: "Перегляд" },
                { value: "multi_date_edit", label: "Пакетний вибір" },
              ]}
            />
            <ActionMenu
              label="Інструменти графіка"
              items={[
                { label: "Генерація на період", onSelect: startPeriod },
                {
                  label: "Текстове внесення",
                  onSelect: () => {
                    setIsTextParserModalOpen(true);
                    notifyModalChange(true);
                  },
                },
                { label: "Шаблони", onSelect: () => setStampTab("templates") },
              ]}
            />
          </div>
        </>
      )}
      {batchError && <p role="alert">{batchError}</p>}
      {stampTab === "templates" ? (
        <>
          <Section title="Шаблони змін">
            {shiftTemplates.map((t) => (
              <Row
                key={t.id}
                title={t.name}
                secondary={formatTimeRange(t.startLocalTime, t.endLocalTime)}
                trailing={
                  <ActionMenu
                    label={`Шаблон: ${t.name}`}
                    items={[
                      {
                        label: "Редагувати",
                        onSelect: () => handleOpenEditTemplate(t),
                      },
                      {
                        label: "Видалити",
                        onSelect: () => void handleDeleteTemplate(t),
                      },
                    ]}
                  />
                }
              />
            ))}
            <Row
              title="+ Новий шаблон"
              trailing={
                <RoundButton
                  aria-label="Новий шаблон"
                  onClick={handleOpenCreateTemplate}
                >
                  +
                </RoundButton>
              }
            />
          </Section>
          <p className="roster-footnote">
            Редагування шаблону не змінює вже створені зміни
          </p>
          {!stampMode && (
            <button
              className="ui-pill"
              type="button"
              onClick={() => setStampTab("stamp")}
            >
              До графіка
            </button>
          )}
        </>
      ) : (
        <>
          {stampMode && (
            <div
              className="ui-pill-row"
              data-ui="pill-row"
              role="group"
              aria-label="Шаблон для штампа"
            >
              {[
                ...shiftTemplates,
                ...builtins.filter(
                  (b) =>
                    !shiftTemplates.some(
                      (t) =>
                        t.code === b.code ||
                        (t.startLocalTime === b.startLocalTime &&
                          t.endLocalTime === b.endLocalTime &&
                          t.endDateOffsetDays === b.endDateOffsetDays),
                    ),
                ),
              ].map((t) => (
                <button
                  type="button"
                  className="ui-pill"
                  key={t.id}
                  aria-pressed={armed?.id === t.id || armed?.code === t.code}
                  onClick={() => void arm(t)}
                >
                  {t.name} {formatTimeRange(t.startLocalTime, t.endLocalTime)}
                </button>
              ))}
              <button
                type="button"
                className="ui-pill"
                onClick={handleOpenCreateTemplate}
              >
                + Нова
              </button>
            </div>
          )}
          {stampMode && (
            <div className="stamp-period">
              <RoundButton
                aria-label="Попередній місяць штампа"
                onClick={() =>
                  onSelectDate(addMonthsToLocalDate(selectedDate, -1))
                }
              >
                ‹
              </RoundButton>
              <span>
                {sentenceCase(formatMonthYear(selectedDate)).replace(
                  / р\.$/,
                  "",
                )}
              </span>
              <RoundButton
                aria-label="Наступний місяць штампа"
                onClick={() =>
                  onSelectDate(addMonthsToLocalDate(selectedDate, 1))
                }
              >
                ›
              </RoundButton>
            </div>
          )}
          <CalendarGrid
            grid={{...monthGrid,secondaryFilter:"work"}}
            compact={stampMode}
            markedDates={selectedBatchDates}
            onSelect={choose}
            onPaint={
              stampMode && armed ? (dates) => void paint(dates) : undefined
            }
          />
          {!stampMode && interactionMode === "multi_date_edit" && (
            <Section>
              <SelectField
                label="Дія"
                value={batchActionKind}
                onChange={(e) =>
                  setBatchActionKind(e.target.value as BatchActionChoiceKind)
                }
                options={[
                  { value: "template_shift", label: "Зміна за шаблоном" },
                  { value: "custom_shift", label: "Власна зміна" },
                  { value: "day_off", label: "Вихідний" },
                  { value: "clear_date", label: "Очистити дату" },
                ]}
              />
              {batchActionKind === "template_shift" && (
                <SelectField
                  label="Шаблон"
                  value={effectiveBatchTemplate?.id ?? ""}
                  onChange={(e) => setBatchTemplateId(e.target.value)}
                  options={shiftTemplates.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              )}
              {batchActionKind === "custom_shift" && (
                <>
                  <InputField
                    label="Код зміни"
                    value={batchCustomCode}
                    onChange={(e) => setBatchCustomCode(e.target.value)}
                  />
                  <TextAreaField
                    label="Нотатка"
                    value={batchCustomNote}
                    onChange={(e) => setBatchCustomNote(e.target.value)}
                  />
                  <SelectField
                    label="Завершення зміни"
                    value={String(batchCustomOffset)}
                    options={[
                      { value: "0", label: "Того ж дня" },
                      { value: "1", label: "Наступного дня" },
                    ]}
                    onChange={(e) =>
                      setBatchCustomOffset(Number(e.target.value) as 0 | 1)
                    }
                  />
                  <InputField
                    label="Назва зміни"
                    value={batchCustomTitle}
                    onChange={(e) => setBatchCustomTitle(e.target.value)}
                  />
                  <TimeField
                    label="Початок"
                    value={batchCustomStart}
                    onChange={(e) => setBatchCustomStart(e.target.value)}
                  />
                  <TimeField
                    label="Завершення"
                    value={batchCustomEnd}
                    onChange={(e) => {
                      setBatchCustomEnd(e.target.value);
                      setBatchCustomOffset(
                        e.target.value < batchCustomStart ? 1 : 0,
                      );
                    }}
                  />
                </>
              )}
              {batchActionKind === "day_off" && (
                <>
                  <InputField
                    label="Код вихідного"
                    value={batchDayOffCode}
                    onChange={(e) => setBatchDayOffCode(e.target.value)}
                  />
                  <TextAreaField
                    label="Нотатка вихідного"
                    value={batchDayOffNote}
                    onChange={(e) => setBatchDayOffNote(e.target.value)}
                  />
                </>
              )}
              {multiDateBatchPreview?.requiresConflictConfirmation && (
                <Row
                  title="Є перетин із розкладом"
                  trailing={
                    <Toggle
                      label="Застосувати з перетином"
                      checked={batchConfirmConflicts}
                      onChange={setBatchConfirmConflicts}
                    />
                  }
                />
              )}
              <Row
                title={
                  selectedBatchDates.length ? "Дати обрано" : "Оберіть дати"
                }
                trailing={
                  <button
                    type="button"
                    className="ui-primary"
                    disabled={!multiDateBatchPreview || isApplyingBatch}
                    onClick={() => void handleCommitMultiDateBatch()}
                  >
                    Застосувати
                  </button>
                }
              />
            </Section>
          )}
          {!stampMode &&
            interactionMode === "browse" &&
            !selectedDateWorkItems.length &&
            !selectedDateRawDayOffs.length && (
              <p className="calendar-muted-day">Немає запису</p>
            )}
          {stampMode && (
            <div className="stamp-dock">
              <Row
                title={
                  armed
                    ? `${armed.name} · ${formatTimeRange(armed.startLocalTime, armed.endLocalTime)} · Повтор`
                    : "Оберіть шаблон"
                }
                trailing={
                  <ActionMenu
                    label="Дії штампа"
                    items={[
                      {
                        label: "Прибрати штамп",
                        onSelect: () => setArmed(null),
                      },
                      { label: "Генерація на період", onSelect: startPeriod },
                      {
                        label: "Текстове внесення",
                        onSelect: () => setIsTextParserModalOpen(true),
                      },
                    ]}
                  />
                }
              />
              <Row
                title="Повтор циклу"
                trailing={
                  <RoundButton
                    aria-label="Повтор циклу"
                    disabled={!armed}
                    onClick={() => {
                      setRepeatEnd(selectedDate);
                      setRepeatOpen(true);
                    }}
                  >
                    ›
                  </RoundButton>
                }
              />
            </div>
          )}
        </>
      )}
      {lastUndoToken && (
        <button
          className="ui-pill"
          type="button"
          onClick={() => void handleUndoLastBatch()}
        >
          Скасувати внесення
        </button>
      )}
      <Sheet
        title={formatDate(selectedDate)}
        isOpen={dayActions}
        onClose={() => setDayActions(false)}
      >
        <Section>
          {!selectedDateWorkItems.length && !selectedDateRawDayOffs.length && (
            <Row title="Немає запису" />
          )}
          {selectedDateWorkItems.map((item) => (
            <Row
              key={item.sourceId}
              title={item.title}
              secondary={formatTimeRange(
                item.segment.displayStartLocalTime,
                item.segment.displayEndLocalTime,
              )}
              trailing={
                <ActionMenu
                  label={`Дії зміни: ${item.title}`}
                  items={[
                    {
                      label: "Змінити тільки цей день",
                      onSelect: () => {
                        const event = events.find(
                          (e) => e.id === item.sourceId,
                        );
                        if (event) {
                          setDayActions(false);
                          onInspectEvent(event);
                        }
                      },
                    },
                    {
                      label: "Вихідний",
                      onSelect: () => {
                        void paint([selectedDate], {
                          kind: "day_off",
                          code: "В",
                          note: null,
                        });
                        setDayActions(false);
                      },
                    },
                    {
                      label: "Видалити",
                      onSelect: () => {
                        const event = events.find(
                          (e) => e.id === item.sourceId,
                        );
                        if (event) void onCancelEvent(event.id, event.revision);
                        setDayActions(false);
                      },
                    },
                  ]}
                />
              }
            />
          ))}
          {selectedDateRawDayOffs.map((off) => (
            <Row
              key={off.id}
              title="Вихідний"
              trailing={
                <RoundButton
                  aria-label="Видалити вихідний"
                  onClick={() => void handleRemoveDayOff(off.id)}
                >
                  ×
                </RoundButton>
              }
            />
          ))}
          <Row
            title="Позначити вихідний"
            trailing={
              <RoundButton
                aria-label="Позначити вихідний"
                onClick={() => {
                  void paint([selectedDate], {
                    kind: "day_off",
                    code: "В",
                    note: null,
                  });
                  setDayActions(false);
                }}
              >
                ○
              </RoundButton>
            }
          />
          <Row
            title="Власна зміна або блок відновлення"
            trailing={
              <RoundButton
                aria-label="Створити запис"
                onClick={() => {
                  setDayActions(false);
                  onOpenGlobalCreation("event");
                }}
              >
                +
              </RoundButton>
            }
          />
        </Section>
      </Sheet>
      <Sheet
        title="Зберегти з перетином?"
        isOpen={Boolean(confirmPaint)}
        onClose={() => setConfirmPaint(null)}
      >
        <p className="review-amber">Обрані дні мають перетин із розкладом.</p>
        <button
          type="button"
          className="ui-primary"
          disabled={stampBusy}
          onClick={() => {
            if (confirmPaint) void commitPaint(confirmPaint);
          }}
        >
          Застосувати
        </button>
      </Sheet>
      <Sheet
        title="Повтор циклу"
        isOpen={repeatOpen}
        onClose={() => setRepeatOpen(false)}
      >
        <Section>
          <InputField
            label="Робочих днів"
            type="number"
            min={1}
            max={31}
            value={repeatWork}
            onChange={(e) => setRepeatWork(e.target.value)}
          />
          <InputField
            label="Днів перерви"
            type="number"
            min={0}
            max={31}
            value={repeatRest}
            onChange={(e) => setRepeatRest(e.target.value)}
          />
          <DateField
            label="До дати"
            value={repeatEnd}
            min={selectedDate}
            onChange={(e) => setRepeatEnd(e.target.value)}
          />
        </Section>
        <button
          type="button"
          className="ui-primary"
          disabled={stampBusy}
          onClick={() => {
            if (!armed) return;
            try {
              const work = Number(repeatWork),
                rest = Number(repeatRest);
              if (
                !Number.isInteger(work) ||
                work < 1 ||
                work > 31 ||
                !Number.isInteger(rest) ||
                rest < 0 ||
                rest > 31
              )
                throw Error();
              const preview = generateFinitePeriodRosterPreview({
                startDate: selectedDate,
                endDate: repeatEnd,
                cycleTemplateSequence: [
                  ...Array(work).fill(armed),
                  ...Array(rest).fill(null),
                ],
                selectedWeekdaysMondayFirst: [0, 1, 2, 3, 4, 5, 6],
                action: { kind: "template_shift", template: armed },
                lockedZoneId: displayZone,
                existingEvents: events,
                existingReservations: reservations,
                existingDayOffAnnotations: dayOffAnnotations,
                nowIso: new Date().toISOString(),
              });
              if (!preview.canCommit) throw Error();
              setRepeatOpen(false);
              if (preview.requiresConflictConfirmation)
                setConfirmPaint(preview);
              else void commitPaint(preview);
            } catch {
              setBatchError("Перевірте період і цикл.");
            }
          }}
        >
          Повторити цикл
        </button>
      </Sheet>

      {/* 8.2 Modal: Create / Edit Shift Template */}
      <Sheet
        isOpen={isTemplateModalOpen}
        title={
          editingTemplate
            ? "Редагувати шаблон зміни"
            : "Новий шаблон робочої зміни"
        }

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
                { value: "0", label: "Того ж дня (+0)" },
                { value: "1", label: "Наступної доби (+1)" },
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
              type="submit"
              variant="primary"
              data-testid="template-save-button"
            >
              Зберегти шаблон
            </Button>
          </div>
        </form>
      </Sheet>

      {/* 8.4 Modal: Finite Period Generator */}
      <Sheet
        isOpen={isPeriodModalOpen}
        title="Генерація графіка на скінченний період"
        subtitle="Додайте зміни лише на вибрані дати."
        isDirty={false}
        onClose={() => {
          setIsPeriodModalOpen(false);
          notifyModalChange(false);
        }}
      >
        <div className="space-y-4" data-testid="roster-period-generator-modal">
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
                          : [...prev, w.index0To6].sort(),
                      )
                    }
                    data-testid={`period-weekday-toggle-${w.index0To6 + 1}`}
                    className="min-h-[40px] min-w-[44px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: "var(--color-work)",
                            color: "#FFFFFF",
                          }
                        : {
                            backgroundColor: "var(--bg-elevated)",
                            color: "var(--text-secondary)",
                          }
                    }
                  >
                    {w.shortUk}
                  </button>
                );
              })}
            </div>
          </div>

          <InputField
            label="Послідовність циклу"
            value={cyclePattern}
            onChange={(e) => setCyclePattern(e.target.value)}
            hint="Коди ваших шаблонів через кому; - означає вихідний. Наприклад: Д,Н,-,-. Повторюється лише в обраному періоді."
          />
          <InputField
            label="Повтор кожні N днів (необов’язково)"
            type="number"
            min="1"
            max="366"
            value={cycleEveryDays}
            onChange={(e) => setCycleEveryDays(e.target.value)}
            hint="Цикл розгортається лише в обраному періоді. Редагування однієї зміни не змінює решту."
          />
          <SelectField
            label="Дія для відібраних дат періоду"
            value={periodActionKind}
            onChange={(e) =>
              setPeriodActionKind(
                e.target.value as "template_shift" | "custom_shift" | "day_off",
              )
            }
            options={[
              {
                value: "template_shift",
                label: "Застосувати шаблон зміни",
              },
              {
                value: "custom_shift",
                label: "Власний інтервал зміни",
              },
              {
                value: "day_off",
                label: "Позначити вихідні дні (В)",
              },
            ]}
            data-testid="period-action-kind-select"
          />

          {periodActionKind === "template_shift" && (
            <SelectField
              label="Шаблон зміни"
              value={effectivePeriodTemplate?.id ?? ""}
              onChange={(e) => setPeriodTemplateId(e.target.value)}
              options={shiftTemplates.map((t) => ({
                value: t.id,
                label: `${t.code} — ${t.name} (${t.startLocalTime}–${t.endLocalTime})`,
              }))}
              data-testid="period-template-select"
            />
          )}

          {periodActionKind === "custom_shift" && (
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
                  { value: "0", label: "Того ж дня (+0)" },
                  { value: "1", label: "Наступної доби (+1)" },
                ]}
                data-testid="period-custom-offset"
              />
            </div>
          )}

          {periodActionKind === "day_off" && (
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
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {periodPreviewState.errorUk ? (
              <p style={{ color: "var(--color-brand-text)" }}>
                {periodPreviewState.errorUk}
              </p>
            ) : periodPreviewState.preview ? (
              <>
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    Попередній перегляд (
                    {periodPreviewState.preview.activeItems.length} дат у поясі{" "}
                    {periodPreviewState.preview.lockedZoneId}):
                  </span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                  {periodPreviewState.preview.activeItems.map((item) => (
                    <div
                      key={item.previewKey}
                      className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1"
                      style={{ backgroundColor: "var(--bg-surface)" }}
                    >
                      <span>
                        {item.localDate}: {formatProposedItemSummaryUk(item)}
                      </span>
                      {item.hasConflictWarning && (
                        <span style={{ color: "var(--color-brand-text)" }}>
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
                <BooleanControl
                  type="checkbox"
                  checked={periodConfirmConflicts}
                  onChange={(e) => setPeriodConfirmConflicts(e.target.checked)}
                  className="h-4 w-4 accent-[#B93E4B]"
                  data-testid="period-confirm-conflicts-checkbox"
                />
                <span>Я підтверджую свідоме створення змін попри перетини</span>
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
              variant="primary"
              onClick={handleCommitPeriodGenerator}
              data-testid="period-generator-commit-button"
            >
              Створити незалежні записи
            </Button>
          </div>
        </div>
      </Sheet>

      {/* 8.5 Modal: Deterministic Local Text Parser */}
      <Sheet
        isOpen={isTextParserModalOpen}
        title="Детерміноване текстове внесення графіка"
        subtitle={`Цільовий місяць: ${monthGrid.monthHeadingUk} (${activeYear}-${String(
          activeMonth,
        ).padStart(2, "0")}) • Часовий пояс: ${displayZone}`}
        isDirty={rawRosterText.trim().length > 0}
        onClose={() => {
          setIsTextParserModalOpen(false);
          notifyModalChange(false);
        }}
      >
        <div className="space-y-4" data-testid="roster-text-parser-modal">
          <div
            className="rounded-xl p-3 text-xs space-y-1.5"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
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
                  const firstCode = shiftTemplates[0]?.code ?? "08:00-20:00";
                  setRawRosterText(
                    `5 ${firstCode}\n6 20:00-08:00\n7 В\n10 09:00-18:00 Зміна у відділенні`,
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
              style={{ color: "var(--text-secondary)" }}
            >
              <li>
                <strong>День + код шаблону:</strong> <code>5 Д1</code> або{" "}
                <code>12 Н1</code>
              </li>
              <li>
                <strong>День + ручний інтервал:</strong>{" "}
                <code>7 08:00-20:00</code> або нічний перехід{" "}
                <code>8 20:00-08:00</code> (або явно <code>+1</code>)
              </li>
              <li>
                <strong>День + код вихідного:</strong> <code>4 В</code> або{" "}
                <code>9 ВИХ</code>
              </li>
            </ul>
          </div>

          <TextAreaField
            label="Рядки графіка на поточний місяць"
            placeholder={"5 Д1\n6 20:00-08:00\n7 В"}
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
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Розібрано рядків: {textParserPreview.items.length} (дієвих:{" "}
                  {
                    textParserPreview.activeItems.filter(
                      (i) => !i.hasBlockingError,
                    ).length
                  }
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
                            r.sourceLineNumber !== undefined,
                        )
                        .map((r) => r.sourceLineNumber!);
                      setExcludedLineNumbers((prev) =>
                        Array.from(new Set([...prev, ...errLines])),
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
                    (d) => d.severity === "error",
                  );
                  const warnDiagnostics = row.diagnostics.filter(
                    (d) =>
                      d.severity !== "error" &&
                      !(
                        row.isMixedDayOffCarryover &&
                        d.code === "MIXED_DAY_OFF_WITH_OVERNIGHT_CARRYOVER"
                      ),
                  );

                  return (
                    <div
                      key={row.previewKey}
                      data-testid={`text-parser-row-${lineNum}`}
                      data-row-valid={isValid ? "true" : "false"}
                      data-row-excluded={isExcluded ? "true" : "false"}
                      className="rounded-lg p-2.5 space-y-1"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border:
                          !isValid && !isExcluded
                            ? "1.5px solid var(--color-brand)"
                            : "1px solid var(--border-subtle)",
                        opacity: isExcluded ? 0.55 : 1,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                            style={{ backgroundColor: "var(--bg-elevated)" }}
                          >
                            #{lineNum}: {row.rawLineText}
                          </span>
                          {isValid ? (
                            <span
                              className="font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {row.localDate}:{" "}
                              {formatProposedItemSummaryUk(row)}
                            </span>
                          ) : (
                            <span
                              className="font-semibold"
                              style={{ color: "var(--color-brand-text)" }}
                            >
                              Помилка рядка
                            </span>
                          )}
                        </div>

                        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                          <BooleanControl
                            type="checkbox"
                            checked={isExcluded}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setExcludedLineNumbers((prev) =>
                                checked
                                  ? [...prev, lineNum]
                                  : prev.filter((n) => n !== lineNum),
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
                          style={{ color: "var(--color-work-text)" }}
                        >
                          ◆ Автоматично визначено перехід на наступну добу (+1
                          доба).
                        </p>
                      )}

                      {row.isMixedDayOffCarryover && (
                        <p
                          data-testid={`text-parser-mixed-carryover-${lineNum}`}
                          className="text-[11px] font-medium"
                          style={{ color: "var(--color-work-text)" }}
                        >
                          ◆ Змішаний стан: вихідний у день, куди переходить
                          завершення попередньої нічної зміни (дозволено).
                        </p>
                      )}

                      {errorDiagnostics.map((errDiag, idx) => (
                        <p
                          key={idx}
                          className="text-[11px] font-semibold"
                          style={{ color: "var(--color-brand-text)" }}
                        >
                          ✕ {errDiag.messageUk}
                        </p>
                      ))}

                      {warnDiagnostics.map((warnDiag, idx) => (
                        <p
                          key={idx}
                          className="text-[11px]"
                          style={{ color: "var(--text-secondary)" }}
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
                  <BooleanControl
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
              variant="primary"
              disabled={!textParserPreview || !textParserPreview.canCommit}
              onClick={handleCommitTextParser}
              data-testid="text-parser-commit-button"
            >
              Зберегти розпізнаний графік
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
