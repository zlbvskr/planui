import { Task } from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";

interface toggleTaskCompletedContext {
  liveTask: Task | null;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  onSaved: (msg?: string) => Promise<unknown> | void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function toggleTaskCompleted({
  liveTask,
  setBusy,
  repositories,
  onSaved,
  setError,
}: toggleTaskCompletedContext) {
  if (liveTask) {
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      if (liveTask.state === "open") {
        await repositories.completeTaskTransactionally(
          liveTask.id,
          nowIso,
          liveTask.revision,
        );
      } else {
        await repositories.reopenTaskTransactionally(
          liveTask.id,
          nowIso,
          liveTask.revision,
        );
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка оновлення.");
    } finally {
      setBusy(false);
    }
  }
}

import { logMeasure } from "../../domain/modelHelpers";
import { Measure } from "../../domain/types";

interface logTaskMeasureContext {
  liveTask: Task | null;
  measure: Measure | null;
  repositories: PlanuiRepositories;
  setMeasure: React.Dispatch<React.SetStateAction<Measure | null>>;
  onSaved: (msg?: string) => Promise<unknown> | void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function logTaskMeasure(
  {
    liveTask,
    measure,
    repositories,
    setMeasure,
    onSaved,
    setError,
  }: logTaskMeasureContext,
  delta: number,
) {
  if (!liveTask || !Number.isFinite(delta) || delta === 0) return;
  const nowIso = new Date().toISOString();
  const updatedTask = logMeasure(
    { ...liveTask, measure: measure ?? liveTask.measure },
    delta,
    nowIso,
  );
  try {
    await repositories.saveTask(
      {
        ...updatedTask,
        updatedAt: nowIso,
      },
      liveTask.revision,
    );
    setMeasure(updatedTask.measure ?? null);
    await onSaved();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не вдалося оновити вимір.");
    throw err;
  }
}

import { addDaysToLocalDate } from "../../domain/temporal";
import {
  CalendarEvent,
  TaskEffort,
  TaskOwnership,
  TaskReservation,
} from "../../domain/types";
import {
  buildZonedIntervalFromStartAndDuration,
  localDateAndTimeToInstant,
} from "./planningTime";

interface SaveTaskChangesContext {
  title: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  isEventMode: boolean;
  liveEvent: CalendarEvent | null;
  whenDate: string;
  whenTime: string;
  durationMinutes: number;
  zone: string;
  repositories: PlanuiRepositories;
  areaId: string;
  parentKey: string;
  onSaved: (msg?: string) => Promise<unknown> | void;
  onClose: () => void;
  liveTask: Task | null;
  buildOwnershipFromKey: (key: string) => {
    ownership: TaskOwnership;
    folderId: string | null;
  };
  deadlineDate: string;
  effort: TaskEffort | null;
  measure: Measure | null;
  primaryReservation: TaskReservation;
  activeTaskReservations: TaskReservation[];
}

export async function saveTaskChanges({
  title,
  setError,
  setBusy,
  isEventMode,
  liveEvent,
  whenDate,
  whenTime,
  durationMinutes,
  zone,
  repositories,
  areaId,
  parentKey,
  onSaved,
  onClose,
  liveTask,
  buildOwnershipFromKey,
  deadlineDate,
  effort,
  measure,
  primaryReservation,
  activeTaskReservations,
}: SaveTaskChangesContext) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    setError("Назва не може бути порожньою.");
    return;
  }
  setBusy(true);
  setError(null);
  const nowIso = new Date().toISOString();

  try {
    if (isEventMode && liveEvent) {
      const targetDate =
        whenDate ||
        (liveEvent.schedule.kind === "timed"
          ? liveEvent.schedule.interval.originStartLocalDate
          : liveEvent.schedule.startLocalDate);
      const schedule = whenTime
        ? {
            kind: "timed" as const,
            interval: buildZonedIntervalFromStartAndDuration(
              targetDate,
              whenTime.slice(0, 5),
              Math.max(5, durationMinutes || 30),
              zone,
            ),
          }
        : {
            kind: "all_day" as const,
            startLocalDate: targetDate,
            endLocalDateExclusive: addDaysToLocalDate(targetDate, 1),
            originZone: zone,
          };

      await repositories.saveCalendarEvent(
        {
          ...liveEvent,
          title: trimmedTitle,
          areaId: areaId || null,
          lifeAreaId: areaId || null,
          folderId: parentKey.startsWith("folder:") ? parentKey.slice(7) : null,
          schedule,
          updatedAt: nowIso,
        },
        liveEvent.revision,
      );
      await onSaved("Збережено");
      onClose();
      return;
    }

    if (liveTask) {
      const { ownership, folderId } = buildOwnershipFromKey(parentKey);
      const deadline = deadlineDate
        ? {
            kind: "exact_instant" as const,
            instant: localDateAndTimeToInstant(deadlineDate, "23:59", zone),
            zoneId: zone,
          }
        : null;

      let currentRev = liveTask.revision;
      const baseTask: Task = {
        ...liveTask,
        title: trimmedTitle,
        estimatedDurationMinutes: durationMinutes || null,
        effort,
        deadline,
        areaId: areaId || null,
        lifeAreaId: areaId || null,
        folderId,
        ownership,
        measure,
        updatedAt: nowIso,
      };

      const savedTask = await repositories.saveTask(baseTask, currentRev);
      currentRev = savedTask.revision;

      if (whenDate && whenTime) {
        const interval = buildZonedIntervalFromStartAndDuration(
          whenDate,
          whenTime.slice(0, 5),
          Math.max(5, durationMinutes || 30),
          zone,
        );
        if (primaryReservation) {
          await repositories.rescheduleReservationTransactionally(
            primaryReservation.id,
            interval,
            nowIso,
            primaryReservation.revision,
          );
        } else {
          await repositories.saveReservationTransactionally({
            id: crypto.randomUUID(),
            taskId: liveTask.id,
            interval,
            state: "active",
            releaseMetadata: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            revision: 1,
          });
        }
      } else if (whenDate && !whenTime && activeTaskReservations.length === 0) {
        await repositories.setTaskDateOnlyPlanningTransactionally(
          liveTask.id,
          whenDate,
          nowIso,
          currentRev,
        );
      }

      await onSaved("Збережено");
      onClose();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не вдалося зберегти зміни.");
  } finally {
    setBusy(false);
  }
}
