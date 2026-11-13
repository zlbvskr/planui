import { Task, TaskEffort } from "../../domain/types";
import { PlanuiRepositories } from "../../storage/repositories";

interface shrinkTaskScopeContext {
  liveTask: Task | null;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  repositories: PlanuiRepositories;
  title: string;
  shrinkDuration: number;
  setDurationMinutes: React.Dispatch<React.SetStateAction<number>>;
  setEffort: React.Dispatch<React.SetStateAction<TaskEffort | null>>;
  setLighterMode: React.Dispatch<
    React.SetStateAction<"shrink" | "split" | "pause" | null>
  >;
  onSaved: (msg?: string) => Promise<unknown> | void;
}

export async function shrinkTaskScope({
  liveTask,
  setBusy,
  setError,
  repositories,
  title,
  shrinkDuration,
  setDurationMinutes,
  setEffort,
  setLighterMode,
  onSaved,
}: shrinkTaskScopeContext) {
  if (!liveTask) return;
  setBusy(true);
  setError(null);
  const nowIso = new Date().toISOString();
  try {
    await repositories.saveTask(
      {
        ...liveTask,
        title: title.trim() || liveTask.title,
        estimatedDurationMinutes: shrinkDuration,
        effort: "small",
        updatedAt: nowIso,
      },
      liveTask.revision,
    );
    setDurationMinutes(shrinkDuration);
    setEffort("small");
    setLighterMode(null);
    await onSaved("Обсяг зменшено");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Помилка збереження.");
  } finally {
    setBusy(false);
  }
}

interface splitTaskStepsContext {
  liveTask: Task | null;
  splitLines: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  setSplitLines: React.Dispatch<React.SetStateAction<string>>;
  setLighterMode: React.Dispatch<
    React.SetStateAction<"shrink" | "split" | "pause" | null>
  >;
  onSaved: (msg?: string) => Promise<unknown> | void;
}

export async function splitTaskSteps({
  liveTask,
  splitLines,
  setError,
  setBusy,
  repositories,
  setSplitLines,
  setLighterMode,
  onSaved,
}: splitTaskStepsContext) {
  if (!liveTask) return;
  const steps = splitLines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (steps.length < 2) {
    setError("Введіть щонайменше 2 кроки (кожен з нового рядка).");
    return;
  }
  setBusy(true);
  setError(null);
  const nowIso = new Date().toISOString();
  try {
    const nextChecklist = [
      ...liveTask.checklist,
      ...steps.map((stepTitle, idx) => ({
        id: `chk-${Date.now()}-${idx}`,
        title: stepTitle,
        order: liveTask.checklist.length + idx,
        completed: false,
      })),
    ];
    await repositories.saveTask(
      {
        ...liveTask,
        checklist: nextChecklist,
        updatedAt: nowIso,
      },
      liveTask.revision,
    );
    setSplitLines("");
    setLighterMode(null);
    await onSaved("Розділено на кроки");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Помилка збереження.");
  } finally {
    setBusy(false);
  }
}

interface pauseTaskContext {
  liveTask: Task | null;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  repositories: PlanuiRepositories;
  setWhenDate: React.Dispatch<React.SetStateAction<string>>;
  setWhenTime: React.Dispatch<React.SetStateAction<string>>;
  setLighterMode: React.Dispatch<
    React.SetStateAction<"shrink" | "split" | "pause" | null>
  >;
  onSaved: (msg?: string) => Promise<unknown> | void;
  onClose: () => void;
}

export async function pauseTask({
  liveTask,
  setBusy,
  setError,
  repositories,
  setWhenDate,
  setWhenTime,
  setLighterMode,
  onSaved,
  onClose,
}: pauseTaskContext) {
  if (!liveTask) return;
  setBusy(true);
  setError(null);
  try {
    await repositories.removeTaskCurrentPlanningTransactionally(
      liveTask.id,
      new Date().toISOString(),
      liveTask.revision,
    );
    setWhenDate("");
    setWhenTime("");
    setLighterMode(null);
    await onSaved("Поставлено на паузу");
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Помилка паузи.");
  } finally {
    setBusy(false);
  }
}

import { CalendarEvent } from "../../domain/types";

interface abandonTaskContext {
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  isEventMode: boolean;
  liveEvent: CalendarEvent | null;
  repositories: PlanuiRepositories;
  onSaved: (msg?: string) => Promise<unknown> | void;
  onClose: () => void;
  liveTask: Task | null;
  setAbandonAlertOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export async function abandonTask({
  setBusy,
  setError,
  isEventMode,
  liveEvent,
  repositories,
  onSaved,
  onClose,
  liveTask,
  setAbandonAlertOpen,
}: abandonTaskContext) {
  setBusy(true);
  setError(null);
  const nowIso = new Date().toISOString();
  try {
    if (isEventMode && liveEvent) {
      await repositories.cancelCalendarEventTransactionally(
        liveEvent.id,
        nowIso,
        liveEvent.revision,
      );
      await onSaved("Подію скасовано");
      onClose();
      return;
    }
    if (liveTask) {
      await repositories.cancelTaskTransactionally(
        liveTask.id,
        nowIso,
        liveTask.revision,
      );
      await onSaved("Справу скасовано");
      onClose();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Помилка скасування.");
  } finally {
    setBusy(false);
    setAbandonAlertOpen(false);
  }
}
