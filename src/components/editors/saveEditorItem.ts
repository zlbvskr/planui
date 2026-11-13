import React from "react";
import { instantiateWorkShiftFromTemplate } from "../../domain/roster";
import { configureMeasure } from "../../domain/sphereInsights";
import type { FolderKind } from "../../domain/types";
import {
  CalendarEvent,
  Folder,
  Goal,
  Habit,
  HabitFrequencyRule,
  Project,
  ShiftTemplate,
  Task,
  TaskEffort,
  TaskOwnership,
  WishlistTimingGroup,
} from "../../domain/types";
import { buildWishItemRecord } from "../../domain/wishlist";
import type { EditableCreationContext } from "../../state/shellStore";
import { ImplementedCreationActionKind } from "../../state/shellStore";
import type { PlanuiRepositories } from "../../storage/repositories";
import { supportsMeasure } from "./editorContext";
import {
  buildAllDaySchedule,
  buildZonedIntervalFromLocalRange,
  buildZonedIntervalFromStartAndDuration,
} from "./editorSchedule";

interface SaveEditorItemContext {
  title: string;
  activeType: ImplementedCreationActionKind;
  hasStampedAny: boolean;
  onClose: () => void;
  onEntityCreated: (
    toastMessageUk: string,
    undoFn?: () => void,
  ) => Promise<void> | void;
  selectedShiftTemplate: ShiftTemplate | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  itemDate: string;
  todayDate: string;
  areaId: string;
  folderId: string;
  activeZone: string;
  repositories: PlanuiRepositories;
  measureUnit: string;
  measureTarget: string;
  habitStepAmount: string;
  measureCurrent: string;
  measureDirection: "more" | "less";
  projectId: string;
  isAllDay: boolean;
  itemTime: string;
  hasDuration: boolean;
  durationMinutes: number;
  effort: TaskEffort | null;
  tasks: readonly Task[];
  isMultiDay: boolean;
  itemEndDate: string;
  events: readonly CalendarEvent[];
  habitFreqKind: "daily" | "weekly" | "days_off" | "after_wakeup";
  habitTimesPerWeek: number;
  habitMinimumUk: string;
  projectTargetDate: string;
  initialContext: EditableCreationContext & {
    areaId?: string;
    targetTime?: string;
  };
  iconKey:
    | "laptop"
    | "sprout"
    | "palm"
    | "camera"
    | "books"
    | "rocket"
    | "music"
    | "plane"
    | "star"
    | "gift"
    | "heart"
    | "home"
    | null;
  projects: readonly Project[];
  goalTermEnd: string;
  goalTermStart: string;
  goals: readonly Goal[];
  wishTiming: WishlistTimingGroup;
  wishPrice: string;
  wishCurrency:
    | "UAH"
    | "USD"
    | "EUR"
    | "PLN"
    | "GBP"
    | "CHF"
    | "CZK"
    | "CAD"
    | "JPY";
  preferredWishlistCurrency:
    | "UAH"
    | "USD"
    | "EUR"
    | "PLN"
    | "GBP"
    | "CHF"
    | "CZK"
    | "CAD"
    | "JPY"
    | null;
  currentFolderKind: FolderKind;
  folders: readonly Folder[];
}

export async function saveEditorItem(
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
  }: SaveEditorItemContext,
  e?: React.FormEvent,
) {
  e?.preventDefault();
  const trimmed = title.trim();

  if (activeType === "shift") {
    if (hasStampedAny && !trimmed) {
      onClose();
      await onEntityCreated("Додано");
      return;
    }
    if (!trimmed && !selectedShiftTemplate) {
      if (hasStampedAny) {
        onClose();
        return;
      }
      setError("Введіть назву зміни або оберіть шаблон.");
      return;
    }
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      const targetDate = itemDate || todayDate;
      const tplToUse: ShiftTemplate = selectedShiftTemplate ?? {
        id: `stpl-adhoc-${Date.now()}`,
        name: trimmed || "Денна",
        start: "08:00",
        end: "20:00",
        kind: trimmed.toLowerCase().includes("ніч") ? "night" : "day",
        code: (trimmed.slice(0, 2) || "ДН").toUpperCase(),
        startLocalTime: trimmed.toLowerCase().includes("ніч")
          ? "20:00"
          : "08:00",
        endLocalTime: trimmed.toLowerCase().includes("ніч") ? "08:00" : "20:00",
        endDateOffsetDays: trimmed.toLowerCase().includes("ніч") ? 1 : 0,
        color: "work",
        note: null,
        areaId: areaId || null,
        folderId: folderId || null,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      };
      if (!hasStampedAny) {
        const { event: builtEv } = instantiateWorkShiftFromTemplate({
          id: `shift-${targetDate}-${Date.now()}`,
          template: tplToUse,
          startLocalDate: targetDate,
          zoneId: activeZone,
          nowIso,
        });
        const shiftRecord: CalendarEvent = {
          ...builtEv,
          title: trimmed || tplToUse.name,
          areaId: areaId || tplToUse.areaId || null,
          lifeAreaId: areaId || tplToUse.areaId || null,
          folderId: folderId || null,
        };
        const res = await repositories.applyRosterBatchTransactionally(
          {
            eventsToSave: [shiftRecord],
            dayOffAnnotationsToSave: [],
            eventIdsToDelete: [],
          },
          nowIso,
        );
        onClose();
        await onEntityCreated("Додано", () => {
          void repositories
            .undoRosterBatchTransactionally(
              res.undoToken,
              new Date().toISOString(),
            )
            .then(() => onEntityCreated(""));
        });
        return;
      }
      onClose();
      await onEntityCreated("Додано");
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати зміну.");
    } finally {
      setBusy(false);
    }
    return;
  }

  if (!trimmed) {
    setError("Введіть назву.");
    return;
  }

  setBusy(true);
  setError(null);
  const nowIso = new Date().toISOString();
  try {
    const measure = supportsMeasure(activeType)
      ? configureMeasure(
          null,
          {
            unit:
              measureUnit || (measureTarget || habitStepAmount ? "од." : ""),
            target: measureTarget || habitStepAmount,
            current: measureCurrent,
            direction: measureDirection,
          },
          nowIso,
        )
      : null;
    if (activeType === "task") {
      const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ownership: TaskOwnership = projectId
        ? { kind: "project", projectId, stageId: null }
        : folderId
          ? { kind: "folder", folderId }
          : { kind: "standalone", folderId: null };

      const isTimed = Boolean(!isAllDay && itemTime && itemDate);
      const taskRecord: Task = {
        id,
        title: trimmed,
        description: null,
        state: "open",
        priority: "normal",
        deadline: null,
        estimatedDurationMinutes:
          hasDuration || isTimed ? durationMinutes : null,
        effort,
        planningState: isTimed ? "timed" : itemDate ? "date_only" : "unplanned",
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
          activeZone,
        );
        await repositories.saveReservationTransactionally({
          id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          taskId: id,
          interval,
          state: "active",
          releaseMetadata: null,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
      }

      onClose();
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteTaskTransactionally(id)
          .then(() => onEntityCreated(""));
      });
      return;
    }

    if (activeType === "event") {
      const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startD = itemDate || todayDate;
      const schedule = isAllDay
        ? buildAllDaySchedule(
            startD,
            isMultiDay && itemEndDate >= startD ? itemEndDate : startD,
            activeZone,
          )
        : isMultiDay && itemEndDate > startD
          ? {
              kind: "timed" as const,
              interval: buildZonedIntervalFromLocalRange(
                startD,
                (itemTime || "09:00").slice(0, 5),
                itemEndDate,
                "18:00",
                activeZone,
              ),
            }
          : {
              kind: "timed" as const,
              interval: buildZonedIntervalFromStartAndDuration(
                startD,
                (itemTime || "17:30").slice(0, 5),
                Math.max(15, durationMinutes || 60),
                activeZone,
              ),
            };

      const eventRecord: CalendarEvent = {
        id,
        title: trimmed,
        note: null,
        type: "personal",
        color: "personal",
        schedule,
        isBlocking: true,
        state: "active",
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
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteCalendarEventTransactionally(id)
          .then(() => onEntityCreated(""));
      });
      return;
    }

    if (activeType === "habit") {
      const id = `habit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const rule: HabitFrequencyRule =
        habitFreqKind === "weekly"
          ? { kind: "weekly_frequency", timesPerWeek: habitTimesPerWeek }
          : habitFreqKind === "days_off"
            ? { kind: "days_off" }
            : { kind: "daily" };

      const stepVal = habitStepAmount.trim()
        ? Number(habitStepAmount.replace(",", "."))
        : (measure?.target ?? null);

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
          habitFreqKind === "after_wakeup" ? "Після пробудження" : null,
        reminderIntentionUk: null,
        measure,
        state: "active",
        ruleRevisions: [
          {
            id: `hrev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            effectiveFromLocalDate: todayDate,
            rule,
            target:
              stepVal != null && Number.isFinite(stepVal) && stepVal > 0
                ? {
                    kind: "numeric",
                    targetValue: stepVal,
                    unitUk: measure?.unit || measureUnit.trim() || "од.",
                  }
                : { kind: "binary" },
            createdAt: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      };

      await repositories.saveHabit(habitRecord);
      onClose();
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteHabitWithHistoryTransactionally(id)
          .then(() => onEntityCreated(""));
      });
      return;
    }

    if (activeType === "project") {
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
        iconKey: iconKey ?? null,
        measure,
        order: projects.length,
        collaboratorText: null,
        state: "active",
        archived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        completedAt: null,
        revision: 1,
      };
      await repositories.saveProject(projRecord);
      onClose();
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteProjectTransactionally(
            id,
            "delete_tasks",
            new Date().toISOString(),
          )
          .then(() => onEntityCreated(""));
      });
      return;
    }

    if (activeType === "goal") {
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
        iconKey: iconKey ?? null,
        implementationIntentionUk: null,
        measure,
        state: "active",
        archived: false,
        order: goals.length,
        createdAt: nowIso,
        updatedAt: nowIso,
        completedAt: null,
        revision: 1,
      };
      await repositories.saveGoal(goalRecord);
      onClose();
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteGoalTransactionally(
            id,
            "delete_direct_tasks",
            new Date().toISOString(),
          )
          .then(() => onEntityCreated(""));
      });
      return;
    }

    if (activeType === "wish") {
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
        iconKey: iconKey ?? null,
        measure,
      });
      onClose();
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteWishItemTransactionally(id, new Date().toISOString())
          .then(() => onEntityCreated(""));
      });
      return;
    }

    if (activeType === "folder") {
      const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const folderRecord: Folder = {
        id,
        kind: currentFolderKind,
        name: trimmed,
        parentId: folderId || null,
        areaId: areaId || null,
        lifeAreaId: areaId || null,
        iconKey: iconKey ?? null,
        order: folders.length,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      };
      await repositories.saveFolder(folderRecord);
      onClose();
      await onEntityCreated("Додано", () => {
        void repositories
          .deleteFolderTransactionally(
            id,
            "rehome_to_parent",
            new Date().toISOString(),
          )
          .then(() => onEntityCreated(""));
      });
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не вдалося зберегти запис.");
  } finally {
    setBusy(false);
  }
}
