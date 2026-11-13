import React from "react";
import {
  areaIdentity,
  type UserGlyphName as UserIconKey,
} from "../../domain/modelHelpers";
import { addDaysToLocalDate } from "../../domain/temporal";
import {
  CalendarEvent,
  ShiftTemplate,
  SupportedCurrencyCode,
  TaskEffort,
  WishlistTimingGroup,
} from "../../domain/types";
import { ImplementedCreationActionKind } from "../../state/shellStore";
import { Button } from "../../ui/buttons";
import { AmountField, DateField, DurationField } from "../../ui/fields";
import { Section } from "../../ui/headers";
import { InputField } from "../../ui/primitives";
import { Pill } from "../../ui/selection";
import { MeasureField } from "../create/MeasureField";
import { EditorDateTimePanel } from "./EditorDateTimePanel";
import { EditorFolderPanel } from "./EditorFolderPanel";
import { EditorHabitFrequencyPanel } from "./EditorHabitFrequencyPanel";
import { EditorIconPanel } from "./EditorIconPanel";
import { ShiftStampPanel } from "./ShiftStampPanel";
import { ShiftTemplatePicker } from "./ShiftTemplatePicker";
import { ShiftTemplateSheet } from "./ShiftTemplateSheet";
import { USER_GLYPHS } from "./editorContext";
import { InlineChipKey } from "./editorTypes";
import { saveEditorItem } from "./saveEditorItem";
import { saveShiftTemplate } from "./saveShiftTemplate";
import { applyRosterCycle, stampRosterDate } from "./stampRoster";

import { smartParse } from "../../domain/smartParse";

import { SpherePicker } from "../create/SpherePicker";

import { useEffect, useMemo, useRef, useState } from "react";

import { AlertSheet } from "../../ui/sheets";

import { Icon } from "../../ui/icons";

import { InlineBanner } from "../../ui/feedback";

import { Orb } from "../../ui/Orb";

import { ParameterChip } from "../../ui/parameters";

import { Segmented } from "../../ui/selection";

import {
  buildMonthGridDates,
  parseLocalDateParts,
} from "../../domain/temporal";

import { Measure } from "../../domain/types";

import { formatDuration, formatShortDate } from "../../lib/format";

import { CreateSheet } from "../create/CreateSheet";

import { TypeRail } from "../create/TypeRail";

import { ParamRow } from "../create/ParamRow";

import { WhenField } from "../create/WhenField";

import { SphereField } from "../create/SphereField";

import { MoreGrid } from "../create/MoreGrid";

import { SharedEditorHostProps } from "./editorTypes";

import { todayLocalDateInZone } from "./editorContext";

import { getContextTypes } from "./editorContext";

import { getDefaultContextType } from "./editorContext";

import { getFolderKindForType } from "./editorContext";

import { flattenFoldersForSelect } from "./editorContext";

import { supportsMeasure } from "./editorContext";

import { TYPE_CREATION_META } from "./editorContext";

import { MONTH_NAMES_NOMINATIVE_UK } from "./editorContext";

export const SharedEditorHost: React.FC<SharedEditorHostProps> = ({
  isOpen,
  activeDestination,
  contexts,
  initialContext,
  initialActionKind,
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
  onClose: closeSheet,
  onEntityCreated,
}) => {
  const todayDate = useMemo(
    () => todayLocalDateInZone(activeZone),
    [activeZone],
  );

  const availableTypes = useMemo(
    () => getContextTypes(activeDestination, contexts),
    [activeDestination, contexts],
  );

  const keepOpenRef = useRef(false);
  const savedRef = useRef(false);
  const onClose = () => {
    if (keepOpenRef.current) savedRef.current = true;
    else closeSheet();
  };
  const [moreOpen, setMoreOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const [areaSource, setAreaSource] = useState<string | undefined>();

  const [activeType, setActiveType] = useState<ImplementedCreationActionKind>(
    () =>
      getDefaultContextType(
        activeDestination,
        contexts,
        availableTypes,
        initialActionKind,
      ),
  );

  const [title, setTitle] = useState("");
  const [appliedHint, setAppliedHint] = useState<null | {
    source: string;
    label: string;
    date: string;
    endDate: string;
    time: string;
    duration: number;
    hasDuration: boolean;
    allDay: boolean;
    multiDay: boolean;
  }>(null);
  const [sphereSession, setSphereSession] = useState(0);
  const [openChip, setOpenChip] = useState<InlineChipKey | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [areaId, setAreaId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>(
    initialContext.folderId ?? "",
  );
  const [iconKey, setIconKey] = useState<UserIconKey | null>(null);
  const [measureDirection, setMeasureDirection] = useState<"more" | "less">(
    "more",
  );
  const [measureUnit, setMeasureUnit] = useState<string>("");
  const [measureTarget, setMeasureTarget] = useState<string>("");
  const [measureCurrent, setMeasureCurrent] = useState<string>("0");
  const [habitStepAmount, setHabitStepAmount] = useState<string>("");
  const [itemDate, setItemDate] = useState<string>(
    initialContext.targetDate ?? todayDate,
  );
  const [itemEndDate, setItemEndDate] = useState<string>(
    initialContext.targetDate ?? todayDate,
  );
  const [itemTime, setItemTime] = useState<string>("");
  const [isAllDay, setIsAllDay] = useState<boolean>(false);
  const [isMultiDay, setIsMultiDay] = useState<boolean>(false);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [hasDuration, setHasDuration] = useState<boolean>(false);
  const [effort, setEffort] = useState<TaskEffort | null>(null);
  const [projectId, setProjectId] = useState<string>(
    initialContext.projectId ?? "",
  );
  const [habitFreqKind, setHabitFreqKind] = useState<
    "daily" | "weekly" | "days_off" | "after_wakeup"
  >("daily");
  const [habitTimesPerWeek, setHabitTimesPerWeek] = useState<number>(3);
  const [habitMinimumUk, setHabitMinimumUk] = useState<string>("");
  const [projectTargetDate, setProjectTargetDate] = useState<string>("");
  const [goalTermStart, setGoalTermStart] = useState<string>(todayDate);
  const [goalTermEnd, setGoalTermEnd] = useState<string>("");
  const [wishPrice, setWishPrice] = useState<string>("");
  const [wishCurrency, setWishCurrency] = useState<SupportedCurrencyCode>(
    preferredWishlistCurrency ?? "UAH",
  );
  const [wishTiming, setWishTiming] = useState<WishlistTimingGroup>("later");
  const [stampMonthYear, setStampMonthYear] = useState<{
    year: number;
    month: number;
  }>(() => {
    const p = parseLocalDateParts(initialContext.targetDate ?? todayDate);
    return { year: p?.year ?? 2026, month: p?.month ?? 1 };
  });
  const [stampTool, setStampTool] = useState<string>("");
  const [hasStampedAny, setHasStampedAny] = useState(false);
  const [tplSheetOpen, setTplSheetOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<ShiftTemplate | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplStart, setTplStart] = useState("08:00");
  const [tplEnd, setTplEnd] = useState("20:00");
  const [tplKind, setTplKind] = useState<"day" | "night">("day");
  const [tplKindManual, setTplKindManual] = useState(false);
  const [tplAreaId, setTplAreaId] = useState<string>("");
  const [tplAreaOpen, setTplAreaOpen] = useState(false);
  const [actionTpl, setActionTpl] = useState<ShiftTemplate | null>(null);
  const [deletingTpl, setDeletingTpl] = useState<ShiftTemplate | null>(null);
  const tplLongPressTimerRef = useRef<number | null>(null);

  const [cycleWorkDays, setCycleWorkDays] = useState<number>(2);
  const [cycleOffDays, setCycleOffDays] = useState<number>(2);
  const [cycleStartDate, setCycleStartDate] = useState<string>(
    initialContext.targetDate ?? todayDate,
  );
  const [cycleUntilDate, setCycleUntilDate] = useState<string>(
    addDaysToLocalDate(initialContext.targetDate ?? todayDate, 27),
  );
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
      initialActionKind,
    );
    setMoreOpen(false);
    setActivated(false);
    setActiveType(defaultType);
    setTitle("");
    setAppliedHint(null);
    setSphereSession((v) => v + 1);
    setOpenChip(null);
    const parentProject = projects.find(
      (project) => project.id === initialContext.projectId,
    );
    const parentGoal = goals.find(
      (goal) => goal.id === (parentProject?.goalId ?? initialContext.goalId),
    );
    const inheritedArea =
      parentProject?.areaId ||
      parentProject?.lifeAreaId ||
      parentGoal?.areaId ||
      parentGoal?.lifeAreaId ||
      "";
    setAreaId(initialContext.areaId || inheritedArea);
    setAreaSource(
      !initialContext.areaId && inheritedArea
        ? parentProject
          ? "з проєкту"
          : "з цілі"
        : undefined,
    );
    setFolderId(initialContext.folderId ?? "");
    setIconKey(null);
    setMeasureDirection("more");
    setMeasureUnit("");
    setMeasureTarget("");
    setMeasureCurrent("0");
    setHabitStepAmount("");
    const baseDate = initialContext.targetDate ?? todayDate;
    setItemDate(baseDate);
    setItemEndDate(baseDate);
    setItemTime(
      initialContext.targetTime ?? (defaultType === "event" ? "17:30" : ""),
    );
    setIsAllDay(false);
    setIsMultiDay(false);
    setDurationMinutes(60);
    setHasDuration(defaultType === "event");
    setEffort(null);
    setProjectId(initialContext.projectId ?? "");
    setHabitFreqKind("daily");
    setHabitTimesPerWeek(3);
    setHabitMinimumUk("");
    setProjectTargetDate("");
    setGoalTermStart(todayDate);
    setGoalTermEnd("");
    setWishPrice("");
    setWishCurrency(preferredWishlistCurrency ?? "UAH");
    setWishTiming("later");
    setStampTool(shiftTemplates[0]?.id ?? "");
    setHasStampedAny(false);
    setTplSheetOpen(false);
    setEditingTpl(null);
    setActionTpl(null);
    setDeletingTpl(null);
    setError(null);
  }, [
    isOpen,
    activeDestination,
    contexts,
    initialActionKind,
    availableTypes,
    initialContext.folderId,
    initialContext.projectId,
    initialContext.targetDate,
    initialContext.targetTime,
    initialContext.areaId,
    todayDate,
    preferredWishlistCurrency,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      if (!openChip) {
        titleInputRef.current?.focus({ preventScroll: true });
      }
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const activeAreas = useMemo(
    () => lifeAreaQuestions.filter((a) => !a.archived && !a.mergedIntoId),
    [lifeAreaQuestions],
  );

  const selectedArea = useMemo(
    () => activeAreas.find((a) => a.id === areaId) ?? null,
    [activeAreas, areaId],
  );

  const selectedTplArea = useMemo(
    () => activeAreas.find((a) => a.id === tplAreaId) ?? null,
    [activeAreas, tplAreaId],
  );

  const currentFolderKind = useMemo(
    () => getFolderKindForType(activeType, activeDestination, contexts),
    [activeType, activeDestination, contexts],
  );

  const folderOptions = useMemo(() => {
    const matching = folders.filter(
      (f) => !f.kind || f.kind === currentFolderKind,
    );
    return flattenFoldersForSelect(matching);
  }, [folders, currentFolderKind]);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === folderId) ?? null,
    [folders, folderId],
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const allShiftTemplates = shiftTemplates;

  const selectedShiftTemplate = useMemo(
    () => allShiftTemplates.find((t) => t.id === stampTool) ?? null,
    [allShiftTemplates, stampTool],
  );

  useEffect(() => {
    if (
      activeType === "shift" &&
      stampTool !== "" &&
      stampTool !== "day_off" &&
      !allShiftTemplates.some((t) => t.id === stampTool)
    ) {
      setStampTool(allShiftTemplates[0]?.id ?? "");
    }
  }, [activeType, stampTool, allShiftTemplates]);

  // Tapping a chip opens its inline panel and hides the keyboard
  const toggleChip = (key: InlineChipKey) => {
    setOpenChip((prev) => {
      const next = prev === key ? null : key;
      if (next !== null) {
        titleInputRef.current?.blur();
        if (
          typeof document !== "undefined" &&
          document.activeElement instanceof HTMLElement
        ) {
          document.activeElement.blur();
        }
      }
      return next;
    });
  };

  const buildCurrentMeasure = (): Measure | null => {
    const unit = measureUnit.trim();
    const targetNum = measureTarget.trim()
      ? Number(measureTarget.replace(",", "."))
      : null;
    const stepNum = habitStepAmount.trim()
      ? Number(habitStepAmount.replace(",", "."))
      : null;
    const currentNum = measureCurrent.trim()
      ? Number(measureCurrent.replace(",", "."))
      : 0;
    const effectiveTarget =
      targetNum !== null && Number.isFinite(targetNum)
        ? targetNum
        : stepNum !== null && Number.isFinite(stepNum)
          ? stepNum
          : null;
    if (!unit && effectiveTarget === null) return null;
    return {
      direction: measureDirection,
      unit: unit || "од.",
      target: effectiveTarget,
      current: Number.isFinite(currentNum) ? currentNum : 0,
      log: [],
    };
  };

  const measureValueText = useMemo(() => {
    const m = buildCurrentMeasure();
    if (!m) return null;
    if (m.target != null) {
      return `${m.current} / ${m.target} ${m.unit}`.trim();
    }
    return `${m.current} ${m.unit}`.trim();
  }, [measureUnit, measureTarget, measureCurrent, habitStepAmount]);

  const durationValueText = useMemo(() => {
    if (!hasDuration && !itemTime) return null;
    return formatDuration(durationMinutes);
  }, [hasDuration, itemTime, durationMinutes]);

  const effortValueText = useMemo(() => {
    if (effort === "small") return "Невеликі";
    if (effort === "medium") return "Середні";
    if (effort === "large") return "Значні";
    return null;
  }, [effort]);

  const habitFrequencyValueText = useMemo(() => {
    if (habitFreqKind === "daily") return "Щодня";
    if (habitFreqKind === "weekly") return `${habitTimesPerWeek} р./тижд.`;
    if (habitFreqKind === "days_off") return "У вихідні";
    return "Після сну";
  }, [habitFreqKind, habitTimesPerWeek]);

  const openTemplateCreationSheet = () => {
    titleInputRef.current?.blur();
    setEditingTpl(null);
    setTplName("");
    setTplStart("08:00");
    setTplEnd("20:00");
    setTplKind("day");
    setTplKindManual(false);
    setTplAreaId(areaId || "");
    setTplAreaOpen(false);
    setTplSheetOpen(true);
  };

  const openEditTemplateSheet = (tpl: ShiftTemplate) => {
    titleInputRef.current?.blur();
    setEditingTpl(tpl);
    setTplName(tpl.name);
    const startHm = (tpl.start ?? tpl.startLocalTime ?? "08:00").slice(0, 5);
    const endHm = (tpl.end ?? tpl.endLocalTime ?? "20:00").slice(0, 5);
    setTplStart(startHm);
    setTplEnd(endHm);
    setTplKind(tpl.kind ?? (tpl.endDateOffsetDays === 1 ? "night" : "day"));
    setTplKindManual(true);
    setTplAreaId(tpl.areaId ?? "");
    setTplAreaOpen(false);
    setActionTpl(null);
    setTplSheetOpen(true);
  };
  const handleStampDate = (localDate: string) =>
    stampRosterDate(
      {
        stampTool,
        allShiftTemplates,
        events,
        dayOffAnnotations,
        activeZone,
        areaId,
        title,
        folderId,
        repositories,
        setHasStampedAny,
        onEntityCreated,
        setError,
      },
      localDate,
    );

  const handleApplyCyclePattern = () =>
    applyRosterCycle({
      allShiftTemplates,
      stampTool,
      setBusy,
      setError,
      cycleWorkDays,
      cycleOffDays,
      cycleStartDate,
      cycleUntilDate,
      events,
      activeZone,
      title,
      areaId,
      folderId,
      dayOffAnnotations,
      repositories,
      setHasStampedAny,
      setOpenChip,
      onEntityCreated,
    });

  const handleSaveTemplate = () =>
    saveShiftTemplate({
      tplName,
      tplStart,
      tplEnd,
      editingTpl,
      shiftTemplates,
      tplKind,
      tplAreaId,
      areaId,
      folderId,
      repositories,
      setStampTool,
      title,
      setTitle,
      setTplSheetOpen,
      setEditingTpl,
      onEntityCreated,
    });

  const handleDeleteTemplateConfirm = async () => {
    if (!deletingTpl) return;
    try {
      await repositories.deleteShiftTemplateTransactionally(deletingTpl.id);
      if (stampTool === deletingTpl.id) {
        setStampTool("");
      }
      setDeletingTpl(null);
      await onEntityCreated("Шаблон видалено");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося видалити шаблон.",
      );
      setDeletingTpl(null);
    }
  };

  const handleSaveItem = (e?: React.FormEvent) =>
    saveEditorItem(
      {
        title,
        activeType,
        hasStampedAny,
        onClose,
        onEntityCreated,
        selectedShiftTemplate,
        setError,
        setBusy,
        itemDate,
        todayDate,
        areaId,
        folderId,
        activeZone,
        repositories,
        measureUnit,
        measureTarget,
        habitStepAmount,
        measureCurrent,
        measureDirection,
        projectId,
        isAllDay,
        itemTime,
        hasDuration,
        durationMinutes,
        effort,
        tasks,
        isMultiDay,
        itemEndDate,
        events,
        habitFreqKind,
        habitTimesPerWeek,
        habitMinimumUk,
        projectTargetDate,
        initialContext,
        iconKey,
        projects,
        goalTermEnd,
        goalTermStart,
        goals,
        wishTiming,
        wishPrice,
        wishCurrency,
        preferredWishlistCurrency,
        currentFolderKind,
        folders,
      },
      e,
    );
  const stampCells = useMemo(
    () =>
      buildMonthGridDates(
        `${String(stampMonthYear.year).padStart(4, "0")}-${String(
          stampMonthYear.month,
        ).padStart(2, "0")}-01`,
      ),
    [stampMonthYear],
  );

  const shiftsByStartDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (
        ev.state === "active" &&
        ev.type === "work_shift" &&
        ev.schedule.kind === "timed"
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

  const isStampReady =
    stampTool === "day_off" ||
    allShiftTemplates.some((t) => t.id === stampTool);

  const currentTypeMeta = TYPE_CREATION_META[activeType];
  const railTypes = availableTypes.includes(activeType)
    ? availableTypes
    : [activeType, ...availableTypes];
  const selectDate = (nextDate: string) => {
    setItemDate(nextDate);
    setProjectTargetDate(nextDate);
    setGoalTermEnd(nextDate);
    if (nextDate && itemEndDate < nextDate) setItemEndDate(nextDate);
    if (!nextDate) {
      setItemTime("");
      setHasDuration(false);
    }
  };
  const selectArea = (id: string) => {
    setAreaId(id);
    setAreaSource(undefined);
  };
  const saveFromUI = async (another = false) => {
    if (busy || keepOpenRef.current) return;
    keepOpenRef.current = another;
    savedRef.current = false;
    try {
      await handleSaveItem();
      if (another && savedRef.current) {
        setAppliedHint(null);
        setSphereSession((v) => v + 1);
        setTitle("");
        setOpenChip(null);
        titleInputRef.current?.focus({ preventScroll: true });
      }
    } finally {
      keepOpenRef.current = false;
    }
  };
  const isSubmitDisabled =
    busy ||
    (activeType === "shift"
      ? !title.trim() && !hasStampedAny && !selectedShiftTemplate
      : !title.trim());

  const renderAreaGridPanel = (
    currentAreaId: string,
    onSelectArea: (id: string) => void,
  ) => (
    <SpherePicker
      areas={activeAreas}
      value={currentAreaId}
      onChange={onSelectArea}
    />
  );
  const parsedHint =
    activeType === "task" || activeType === "event"
      ? smartParse(title, todayDate)
      : null;
  const toggleHint = () => {
    if (appliedHint) {
      setTitle(appliedHint.source);
      setItemDate(appliedHint.date);
      setItemEndDate(appliedHint.endDate);
      setItemTime(appliedHint.time);
      setDurationMinutes(appliedHint.duration);
      setHasDuration(appliedHint.hasDuration);
      setIsAllDay(appliedHint.allDay);
      setIsMultiDay(appliedHint.multiDay);
      setAppliedHint(null);
    } else if (parsedHint) {
      setAppliedHint({
        source: title,
        label: parsedHint.label,
        date: itemDate,
        endDate: itemEndDate,
        time: itemTime,
        duration: durationMinutes,
        hasDuration,
        allDay: isAllDay,
        multiDay: isMultiDay,
      });
      if (parsedHint.date || (parsedHint.time && !itemDate)) {
        const date = parsedHint.date ?? todayDate;
        setItemDate(date);
        setItemEndDate(date);
        setIsMultiDay(false);
      }
      if (parsedHint.time) {
        setItemTime(parsedHint.time);
        setIsAllDay(false);
      }
      if (parsedHint.durationMinutes) {
        setDurationMinutes(parsedHint.durationMinutes);
        setHasDuration(true);
        setIsAllDay(false);
      }
      setTitle(parsedHint.title);
    }
  };

  const chip = (
    key: InlineChipKey,
    label: string,
    icon: React.ComponentProps<typeof ParameterChip>["icon"],
    value?: string | null,
    testId = `chip-${key}`,
  ) => (
    <ParameterChip
      icon={icon}
      label={label}
      value={value}
      selected={openChip === key}
      aria-expanded={openChip === key}
      onClick={() => toggleChip(key)}
      data-testid={testId}
    />
  );
  const sphere = (
    <SphereField
      key={sphereSession}
      areas={activeAreas}
      value={areaId}
      onChange={selectArea}
      onOpen={() => toggleChip("area")}
      selected={openChip === "area"}
      inherited={areaSource}
    />
  );

  return (
    <>
      <CreateSheet
        isOpen={isOpen}
        onClose={closeSheet}
        type={activeType}
        panel={openChip}
        rail={
          <TypeRail
            types={railTypes}
            value={activeType}
            meta={TYPE_CREATION_META}
            onChange={(type) => {
              const sharedDate =
                activeType === "project"
                  ? projectTargetDate
                  : activeType === "goal"
                    ? goalTermEnd
                    : itemDate;
              selectDate(sharedDate);
              setAppliedHint(null);
              setActiveType(type);
              setOpenChip(null);
              setError(null);
              if (type === "event") {
                if (!itemDate) selectDate(todayDate);
                if (!itemTime) setItemTime("17:30");
                setHasDuration(true);
              }
            }}
          />
        }
        footer={
          <div className="create-footer">
            <button
              type="button"
              className="create-another"
              disabled={isSubmitDisabled || activeType === "shift"}
              onClick={() => void saveFromUI(true)}
              data-testid="shared-editor-add-another-button"
            >
              <Icon name="plus" size={18} />
              Ще одне
            </button>
            <button
              type="button"
              disabled={isSubmitDisabled}
              data-testid="shared-editor-submit-button"
              onClick={() => void saveFromUI()}
              className={`ui-btn ui-glossy-btn ui-btn-mint ui-btn-glossy-3d ui-add-form-submit ${activated ? "create-submit-activated" : ""}`}
            >
              <span className="ui-btn-label">{currentTypeMeta.ctaLabel}</span>
            </button>
          </div>
        }
      >
        <div className="stage2-quick space-y-3" data-testid="quick-add-sheet">
          {error && <InlineBanner tone="error">{error}</InlineBanner>}

          <form
            className="quick-add-title-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveFromUI();
            }}
          >
            <input
              ref={titleInputRef}
              type="text"
              lang="uk"
              autoCapitalize="sentences"
              enterKeyHint="done"
              aria-label="Назва"
              value={title}
              onChange={(e) => {
                setAppliedHint(null);
                setTitle(e.target.value);
                if (e.target.value.length) setActivated(true);
              }}
              onFocus={() => {
                if (openChip) {
                  setOpenChip(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveFromUI();
                }
              }}
              placeholder={currentTypeMeta.placeholder}
              data-testid="create-task-title-input"
              className="quick-add-title-input"
            />
          </form>
          {(activeType === "task" || activeType === "event") &&
            (appliedHint || parsedHint) && (
              <button
                type="button"
                className="create-smart-hint"
                data-testid="smart-parse-hint"
                aria-pressed={!!appliedHint}
                onClick={toggleHint}
              >
                ✦ {appliedHint?.label ?? parsedHint?.label} ·{" "}
                {appliedHint ? "Скасувати" : "Застосувати"}
              </button>
            )}

          <div
            data-testid="quick-add-option-chips"
            className="create-parameters"
          >
            {(activeType === "task" || activeType === "event") && (
              <>
                <WhenField
                  date={itemDate}
                  today={todayDate}
                  onDateChange={selectDate}
                  onOpen={() => toggleChip("datetime")}
                  selected={openChip === "datetime"}
                  allowUndated={activeType === "task"}
                >
                  {itemDate && (
                    <div className="create-time-controls">
                      {chip(
                        "datetime",
                        isAllDay ? "Весь день" : "Час",
                        "clock",
                        isAllDay ? null : itemTime || null,
                        "chip-time",
                      )}
                      {!isAllDay && (
                        <>
                          {chip(
                            "duration",
                            "Тривалість",
                            "clock",
                            durationValueText,
                          )}
                          <div className="create-duration-presets">
                            {[15, 30, 45, 60, 90].map((value) => (
                              <Pill
                                key={value}
                                selected={
                                  hasDuration && durationMinutes === value
                                }
                                onClick={() => {
                                  setDurationMinutes(value);
                                  setHasDuration(true);
                                }}
                              >
                                {value} хв
                              </Pill>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </WhenField>
                {sphere}
              </>
            )}
            {activeType === "habit" && (
              <>
                <WhenField label="Як часто">
                  {chip(
                    "frequency",
                    "Як часто",
                    "repeat",
                    habitFrequencyValueText,
                  )}
                </WhenField>
                {sphere}
              </>
            )}
            {(activeType === "project" || activeType === "goal") && (
              <>
                <WhenField label="Термін">
                  {activeType === "project"
                    ? chip(
                        "project_deadline",
                        "Термін",
                        "calendar",
                        projectTargetDate
                          ? formatShortDate(projectTargetDate)
                          : null,
                        "chip-project-deadline",
                      )
                    : chip(
                        "goal_term",
                        "Термін",
                        "calendar",
                        goalTermEnd
                          ? `${formatShortDate(goalTermStart)} – ${formatShortDate(goalTermEnd)}`
                          : null,
                        "chip-goal-term",
                      )}
                </WhenField>
                {sphere}
              </>
            )}
            {activeType === "wish" && (
              <ParamRow label="Бажання">
                {chip(
                  "wish_price",
                  "Ціна",
                  "wallet",
                  wishPrice ? `${wishPrice} ${wishCurrency}` : null,
                  "chip-wish-price",
                )}
                {chip(
                  "wish_group",
                  "Група",
                  "clock",
                  wishTiming === "now"
                    ? "Зараз"
                    : wishTiming === "later"
                      ? "Пізніше"
                      : "Колись",
                  "chip-wish-group",
                )}
              </ParamRow>
            )}
            {activeType === "shift" && (
              <ParamRow label="Зміна">
                <Segmented
                  label="Тип зміни"
                  value={selectedShiftTemplate?.kind ?? "day"}
                  onChange={(kind: "day" | "night") => {
                    const template = allShiftTemplates.find(
                      (template) =>
                        (template.kind ??
                          (template.endDateOffsetDays ? "night" : "day")) ===
                        kind,
                    );
                    if (template) setStampTool(template.id);
                  }}
                  options={[
                    { value: "day", label: "День" },
                    { value: "night", label: "Ніч" },
                  ]}
                />
                {allShiftTemplates.length ? (
                  chip(
                    "shift_template",
                    "Шаблон",
                    "sun",
                    selectedShiftTemplate?.name,
                    "chip-shift-template",
                  )
                ) : (
                  <ParameterChip
                    icon="plus"
                    label="Створити шаблон"
                    onClick={openTemplateCreationSheet}
                    data-testid="shift-create-first-template-btn"
                  />
                )}
                {chip(
                  "shift_dates",
                  "Дати",
                  "calendar",
                  MONTH_NAMES_NOMINATIVE_UK[stampMonthYear.month - 1],
                  "chip-shift-dates",
                )}
              </ParamRow>
            )}
            {activeType === "folder" && (
              <>
                <ParamRow label="Куди">
                  {chip(
                    "folder",
                    "Батьківська папка",
                    "folder",
                    selectedFolder?.name,
                  )}
                </ParamRow>
                {sphere}
              </>
            )}
            {[
              "task",
              "event",
              "habit",
              "project",
              "goal",
              "wish",
              "shift",
            ].includes(activeType) && (
              <MoreGrid
                open={moreOpen}
                onToggle={() => {
                  setMoreOpen(!moreOpen);
                  setOpenChip(null);
                }}
              >
                {activeType === "task" &&
                  chip("effort", "Зусилля", "sparkles", effortValueText)}
                {(activeType === "task" || activeType === "event") &&
                  chip("project", "Проєкт", "folder", selectedProject?.title)}
                {activeType === "habit" &&
                  chip("minimum", "Мінімум", "check", habitMinimumUk)}
                {!["event", "shift"].includes(activeType) &&
                  chip("folder", "Папка", "folder", selectedFolder?.name)}
                {["project", "goal", "wish"].includes(activeType) &&
                  chip(
                    "icon",
                    "Значок",
                    "sparkles",
                    USER_GLYPHS.find((glyph) => glyph.key === iconKey)?.label,
                  )}
                {supportsMeasure(activeType) &&
                  chip("measure", "Вимір", "bar-chart", measureValueText)}
                {activeType === "shift" &&
                  chip(
                    "shift_repeat",
                    "Повтор",
                    "repeat",
                    `${cycleWorkDays} через ${cycleOffDays}`,
                    "shift-cycle-repeat-row",
                  )}
                {(activeType === "shift" || activeType === "wish") &&
                  chip(
                    "area",
                    "Сфера",
                    <Orb color={areaIdentity(selectedArea)} size={16} />,
                    selectedArea?.questionTextUk,
                    activeType === "shift"
                      ? "shift-stamp-area-chip"
                      : "chip-area",
                  )}
              </MoreGrid>
            )}
          </div>

          {/* One inline panel; Sheet owns viewport scrolling and keyboard clearance. */}
          <div
            key={openChip ?? "closed"}
            className="create-inline-panel"
            data-create-inline-panel={openChip || undefined}
          >
            <div>
              {openChip === "area" &&
                renderAreaGridPanel(areaId, (nextId) => {
                  selectArea(nextId);
                  setOpenChip(null);
                })}

              {openChip === "folder" && (
                <EditorFolderPanel
                  setFolderId={setFolderId}
                  setOpenChip={setOpenChip}
                  folderId={folderId}
                  folderOptions={folderOptions}
                />
              )}

              {openChip === "measure" && (
                <div data-testid="inline-panel-measure">
                  <MeasureField
                    color={areaIdentity(selectedArea)}
                    draft={{
                      unit: measureUnit,
                      target: measureTarget,
                      current: measureCurrent,
                      direction: measureDirection,
                    }}
                    onDraftChange={(draft) => {
                      setMeasureUnit(draft.unit);
                      setMeasureTarget(draft.target);
                      setMeasureCurrent(draft.current);
                      setMeasureDirection(draft.direction);
                    }}
                    step={habitStepAmount}
                    onStepChange={
                      activeType === "habit" ? setHabitStepAmount : undefined
                    }
                  />
                </div>
              )}

              {openChip === "icon" && (
                <EditorIconPanel
                  iconKey={iconKey}
                  setIconKey={setIconKey}
                  setOpenChip={setOpenChip}
                  selectedArea={selectedArea}
                />
              )}

              {openChip === "datetime" && (
                <EditorDateTimePanel
                  itemDate={itemDate}
                  todayDate={todayDate}
                  selectDate={selectDate}
                  itemEndDate={itemEndDate}
                  setItemEndDate={setItemEndDate}
                  activeType={activeType}
                  setItemTime={setItemTime}
                  isAllDay={isAllDay}
                  itemTime={itemTime}
                  setIsAllDay={setIsAllDay}
                  isMultiDay={isMultiDay}
                  setIsMultiDay={setIsMultiDay}
                />
              )}

              {openChip === "duration" && (
                <div
                  className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)]"
                  data-testid="inline-panel-duration"
                >
                  <DurationField
                    label="Тривалість"
                    value={durationMinutes}
                    presets={[15, 30, 45, 60, 90, 120]}
                    onChange={(val) => {
                      setDurationMinutes(val ?? 60);
                      setHasDuration(val !== null);
                    }}
                  />
                </div>
              )}

              {openChip === "effort" && (
                <div
                  className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] flex flex-wrap gap-2"
                  data-testid="inline-panel-effort"
                >
                  {(
                    [
                      ["small", "Невеликі"],
                      ["medium", "Середні"],
                      ["large", "Значні"],
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

              {openChip === "project" && (
                <div
                  className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] flex flex-wrap gap-2"
                  data-testid="inline-panel-project"
                >
                  <Pill
                    selected={!projectId}
                    onClick={() => {
                      setProjectId("");
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
                          const goal = goals.find(
                            (goal) => goal.id === proj.goalId,
                          );
                          const inherited =
                            proj.areaId ||
                            proj.lifeAreaId ||
                            goal?.areaId ||
                            goal?.lifeAreaId;
                          if (inherited) {
                            setAreaId(inherited);
                            setAreaSource("з проєкту");
                          }
                          setOpenChip(null);
                        }}
                      >
                        {proj.title}
                      </Pill>
                    ))}
                </div>
              )}

              {openChip === "frequency" && (
                <EditorHabitFrequencyPanel
                  habitFreqKind={habitFreqKind}
                  setHabitFreqKind={setHabitFreqKind}
                  habitTimesPerWeek={habitTimesPerWeek}
                  setHabitTimesPerWeek={setHabitTimesPerWeek}
                />
              )}

              {openChip === "minimum" && (
                <div className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)]">
                  <InputField
                    label="Мінімальний варіант"
                    value={habitMinimumUk}
                    onChange={(e) => setHabitMinimumUk(e.target.value)}
                    placeholder="Наприклад: 2 хвилини або 1 сторінка"
                  />
                </div>
              )}

              {openChip === "project_deadline" && (
                <Section>
                  <DateField
                    label="Термін"
                    value={projectTargetDate}
                    onChange={(e) => selectDate(e.target.value)}
                  />
                </Section>
              )}

              {openChip === "goal_term" && (
                <Section>
                  <DateField
                    label="Початок"
                    value={goalTermStart}
                    onChange={(e) => setGoalTermStart(e.target.value)}
                  />
                  <DateField
                    label="Дедлайн"
                    value={goalTermEnd}
                    onChange={(e) => selectDate(e.target.value)}
                  />
                </Section>
              )}

              {openChip === "wish_price" && (
                <div className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-2.5">
                  <AmountField
                    label="Ціна"
                    value={wishPrice}
                    onChange={(val) => {
                      setWishPrice(val);
                      if (val.trim() && !Number.isNaN(Number(val))) {
                        setMeasureTarget(val.trim());
                        if (!measureUnit) {
                          setMeasureUnit(
                            wishCurrency === "UAH" ? "грн" : wishCurrency,
                          );
                        }
                      }
                    }}
                    currency={wishCurrency}
                    onCurrencyChange={(nextCur) => {
                      const cur = nextCur as SupportedCurrencyCode;
                      setWishCurrency(cur);
                      if (wishPrice.trim()) {
                        setMeasureUnit(cur === "UAH" ? "грн" : cur);
                      }
                    }}
                    placeholder="3 500"
                  />
                </div>
              )}

              {openChip === "wish_group" && (
                <div className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] flex flex-wrap gap-2">
                  {(
                    [
                      ["now", "Зараз"],
                      ["later", "Пізніше"],
                      ["someday", "Колись"],
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

              {openChip === "shift_template" && (
                <ShiftTemplatePicker
                  allShiftTemplates={allShiftTemplates}
                  stampTool={stampTool}
                  setStampTool={setStampTool}
                  title={title}
                  setTitle={setTitle}
                  setOpenChip={setOpenChip}
                  setActionTpl={setActionTpl}
                  tplLongPressTimerRef={tplLongPressTimerRef}
                  openTemplateCreationSheet={openTemplateCreationSheet}
                  actionTpl={actionTpl}
                  openEditTemplateSheet={openEditTemplateSheet}
                  setDeletingTpl={setDeletingTpl}
                />
              )}

              {openChip === "shift_dates" && (
                <ShiftStampPanel
                  allShiftTemplates={allShiftTemplates}
                  stampTool={stampTool}
                  setStampTool={setStampTool}
                  title={title}
                  setTitle={setTitle}
                  isStampReady={isStampReady}
                  setStampMonthYear={setStampMonthYear}
                  stampMonthYear={stampMonthYear}
                  isPointerStampingRef={isPointerStampingRef}
                  stampedInGestureRef={stampedInGestureRef}
                  stampCells={stampCells}
                  shiftsByStartDate={shiftsByStartDate}
                  dayOffByDate={dayOffByDate}
                  todayDate={todayDate}
                  handleStampDate={handleStampDate}
                />
              )}

              {openChip === "shift_repeat" && (
                <div
                  className="p-3 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-milky)] space-y-2.5"
                  data-testid="inline-panel-shift-repeat"
                >
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
                        className="mt-1 ui-input-field"
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
                        className="mt-1 ui-input-field"
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
                    disabled={busy || allShiftTemplates.length === 0}
                    onClick={() => void handleApplyCyclePattern()}
                  >
                    Заповнити за циклом
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CreateSheet>

      <ShiftTemplateSheet
        tplSheetOpen={tplSheetOpen}
        setTplSheetOpen={setTplSheetOpen}
        setEditingTpl={setEditingTpl}
        editingTpl={editingTpl}
        tplName={tplName}
        handleSaveTemplate={handleSaveTemplate}
        setTplName={setTplName}
        tplStart={tplStart}
        setTplStart={setTplStart}
        tplKindManual={tplKindManual}
        setTplKind={setTplKind}
        tplEnd={tplEnd}
        setTplEnd={setTplEnd}
        tplKind={tplKind}
        setTplKindManual={setTplKindManual}
        selectedTplArea={selectedTplArea}
        tplAreaOpen={tplAreaOpen}
        setTplAreaOpen={setTplAreaOpen}
        renderAreaGridPanel={renderAreaGridPanel}
        tplAreaId={tplAreaId}
        setTplAreaId={setTplAreaId}
      />

      <AlertSheet
        isOpen={Boolean(deletingTpl)}
        onClose={() => setDeletingTpl(null)}
        title={`Видалити шаблон «${deletingTpl?.name ?? ""}»?`}
        description="Уже проставлені в календарі зміни залишаться без змін."
        confirmLabel="Видалити"
        cancelLabel="Не зараз"
        destructive
        onConfirm={() => void handleDeleteTemplateConfirm()}
      />
    </>
  );
};
