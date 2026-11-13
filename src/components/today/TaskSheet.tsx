import { MeasureField } from "../create/MeasureField";
import {
  logTaskMeasure,
  saveTaskChanges,
  toggleTaskCompleted,
} from "./taskActions";
import { TaskOptionsPanel } from "./TaskOptionsPanel";
import {
  abandonTask,
  pauseTask,
  shrinkTaskScope,
  splitTaskSteps,
} from "./taskScopeActions";
import { TaskScopePanel } from "./TaskScopePanel";

import { useEffect, useMemo, useState } from "react";

import { WhenField } from "../create/WhenField";

import { SphereField } from "../create/SphereField";

import { MoreGrid } from "../create/MoreGrid";

import { AlertSheet, Sheet } from "../../ui/sheets";

import { Button } from "../../ui/buttons";

import { Checkbox } from "../../ui/Checkbox";

import { Icon } from "../../ui/icons";

import { InlineBanner } from "../../ui/feedback";

import { Orb } from "../../ui/Orb";

import { ParameterChip } from "../../ui/parameters";

import { Pill } from "../../ui/selection";

import { Row } from "../../ui/rows";

import { Section } from "../../ui/headers";

import { areaIdentity, resolveArea } from "../../domain/modelHelpers";

import { formatInstantInZone } from "../../domain/temporal";

import {
  CalendarEvent,
  Folder,
  Goal,
  LifeAreaQuestion,
  Measure,
  Project,
  Task,
  TaskEffort,
  TaskOwnership,
  TaskReservation,
} from "../../domain/types";

import { PlanuiRepositories } from "../../storage/repositories";

import { formatSessionSummaryUk } from "./planningTime";

import { SessionSheet } from "./SessionSheet";

export interface TaskSheetProps {
  isOpen?: boolean;
  task?: Task | null;
  event?: CalendarEvent | null;
  initialReservationId?: string;
  reviewAction?: string;
  initialDate?: string;
  initialTime?: string;
  date?: string;
  todayDate?: string;
  zone?: string;
  activeZone?: string;
  tasks: readonly Task[];
  events: readonly CalendarEvent[];
  reservations: readonly TaskReservation[];
  folders?: readonly Folder[];
  projects?: readonly Project[];
  goals?: readonly Goal[];
  lifeAreas?: readonly LifeAreaQuestion[];
  assessments?: readonly import("../../domain/types").LifeAreaAssessment[];
  repositories: PlanuiRepositories;
  onSaved?: (msg?: string) => Promise<unknown> | void;
  onDataChanged?: (msg?: string) => Promise<unknown> | void;
  onClose: () => void;
}

export function TaskSheet({
  isOpen = true,
  task: propTask,
  event: propEvent,
  initialReservationId,
  reviewAction,
  initialDate,
  initialTime,
  date: propDate,
  todayDate,
  zone: propZone,
  activeZone,
  tasks,
  events,
  reservations,
  folders = [],
  projects = [],
  goals = [],
  lifeAreas = [],
  assessments = [],
  repositories,
  onSaved: propOnSaved,
  onDataChanged,
  onClose,
}: TaskSheetProps) {
  const date = propDate ?? todayDate ?? new Date().toISOString().slice(0, 10);
  const zone = propZone ?? activeZone ?? "UTC";
  const onSaved = useMemo(
    () => propOnSaved ?? onDataChanged ?? (() => undefined),
    [propOnSaved, onDataChanged],
  );
  const liveTask = useMemo(
    () =>
      propTask ? (tasks.find((t) => t.id === propTask.id) ?? propTask) : null,
    [propTask, tasks],
  );
  const liveEvent = useMemo(
    () =>
      propEvent
        ? (events.find((e) => e.id === propEvent.id) ?? propEvent)
        : null,
    [propEvent, events],
  );

  const isEventMode = Boolean(liveEvent && !liveTask);

  const activeTaskReservations = useMemo(
    () =>
      liveTask
        ? reservations
            .filter((r) => r.taskId === liveTask.id && r.state === "active")
            .sort((a, b) =>
              a.interval.startInstant.localeCompare(b.interval.startInstant),
            )
        : [],
    [liveTask, reservations],
  );

  const primaryReservation = useMemo(
    () =>
      (initialReservationId
        ? activeTaskReservations.find((r) => r.id === initialReservationId)
        : null) ??
      activeTaskReservations[0] ??
      null,
    [initialReservationId, activeTaskReservations],
  );

  const [title, setTitle] = useState(liveTask?.title ?? liveEvent?.title ?? "");
  const [whenDate, setWhenDate] = useState<string>(
    initialDate ??
      primaryReservation?.interval.originStartLocalDate ??
      liveTask?.plannedDate ??
      (liveEvent
        ? liveEvent.schedule.kind === "timed"
          ? liveEvent.schedule.interval.originStartLocalDate
          : liveEvent.schedule.startLocalDate
        : ""),
  );
  const [whenTime, setWhenTime] = useState<string>(
    (
      initialTime ??
      primaryReservation?.interval.originStartLocalTime ??
      (liveEvent?.schedule.kind === "timed"
        ? liveEvent.schedule.interval.originStartLocalTime
        : "") ??
      ""
    ).slice(0, 5),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    liveTask?.estimatedDurationMinutes ??
      (primaryReservation
        ? Math.max(
            15,
            Math.round(
              (Date.parse(primaryReservation.interval.endInstant) -
                Date.parse(primaryReservation.interval.startInstant)) /
                60000,
            ),
          )
        : liveEvent?.schedule.kind === "timed"
          ? Math.max(
              15,
              Math.round(
                (Date.parse(liveEvent.schedule.interval.endInstant) -
                  Date.parse(liveEvent.schedule.interval.startInstant)) /
                  60000,
              ),
            )
          : 30),
  );
  const [effort, setEffort] = useState<TaskEffort | null>(
    liveTask?.effort ?? null,
  );
  const [deadlineDate, setDeadlineDate] = useState<string>(
    liveTask?.deadline
      ? liveTask.deadline.kind === "date_only"
        ? liveTask.deadline.localDate
        : liveTask.deadline.instant.slice(0, 10)
      : "",
  );

  const [editMoreOpen, setEditMoreOpen] = useState(false);
  const [openChip, setOpenChip] = useState<string | null>(null);
  useEffect(() => {
    if (openChip)
      requestAnimationFrame(() =>
        document
          .querySelector(
            '[data-testid="task-sheet"] [data-create-inline-panel]',
          )
          ?.scrollIntoView({ block: "nearest", behavior: "instant" }),
      );
  }, [openChip]);
  const toggleChip = (key: string) =>
    setOpenChip((current) => (current === key ? null : key));
  const [areaId, setAreaId] = useState<string>(
    liveTask?.areaId ??
      liveTask?.lifeAreaId ??
      liveEvent?.areaId ??
      liveEvent?.lifeAreaId ??
      "",
  );
  const [parentKey, setParentKey] = useState<string>(() => {
    if (liveTask) {
      if (liveTask.ownership.kind === "project") {
        return `project:${liveTask.ownership.projectId}`;
      }
      if (liveTask.ownership.kind === "goal") {
        return `goal:${liveTask.ownership.goalId}`;
      }
      const fId =
        liveTask.folderId ??
        (liveTask.ownership.kind === "folder"
          ? liveTask.ownership.folderId
          : liveTask.ownership.kind === "standalone"
            ? liveTask.ownership.folderId
            : null);
      if (fId) return `folder:${fId}`;
    }
    if (liveEvent?.folderId) return `folder:${liveEvent.folderId}`;
    return "";
  });

  const [measure, setMeasure] = useState<Measure | null>(
    liveTask?.measure ?? null,
  );
  const [sessionSheetState, setSessionSheetState] = useState<{
    open: boolean;
    reservationId?: string | null;
  }>({ open: false, reservationId: null });
  const [lighterMode, setLighterMode] = useState<
    null | "shrink" | "split" | "pause"
  >(() =>
    reviewAction === "Зменшити обсяг"
      ? "shrink"
      : reviewAction === "Розділити"
        ? "split"
        : reviewAction === "Поставити на паузу"
          ? "pause"
          : null,
  );
  const [shrinkDuration, setShrinkDuration] = useState<number>(15);
  const [splitLines, setSplitLines] = useState<string>("");
  const [abandonAlertOpen, setAbandonAlertOpen] = useState(
    reviewAction === "Відмовитися",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAreas = useMemo(
    () => lifeAreas.filter((a) => !a.archived && !a.mergedIntoId),
    [lifeAreas],
  );

  const resolvedAreaInfo = useMemo(() => {
    const tempItem = {
      ...(liveTask ?? liveEvent),
      areaId: areaId || null,
      lifeAreaId: areaId || null,
      folderId: parentKey.startsWith("folder:") ? parentKey.slice(7) : null,
      projectId: parentKey.startsWith("project:") ? parentKey.slice(8) : null,
      goalId: parentKey.startsWith("goal:") ? parentKey.slice(5) : null,
    };
    return resolveArea(tempItem, {
      folders,
      projects,
      goals,
      lifeAreas: activeAreas,
      assessments,
    });
  }, [
    liveTask,
    liveEvent,
    areaId,
    parentKey,
    folders,
    projects,
    goals,
    activeAreas,
    assessments,
  ]);

  const handleToggleCompleted = () =>
    toggleTaskCompleted({ liveTask, setBusy, repositories, onSaved, setError });

  const handleQuickLogMeasure = (delta: number) =>
    logTaskMeasure(
      { liveTask, measure, repositories, setMeasure, onSaved, setError },
      delta,
    );

  const buildOwnershipFromKey = (
    key: string,
  ): {
    ownership: TaskOwnership;
    folderId: string | null;
  } => {
    if (key.startsWith("project:")) {
      const projectId = key.slice(8);
      return {
        ownership: {
          kind: "project",
          projectId,
          stageId:
            liveTask?.ownership.kind === "project" &&
            liveTask.ownership.projectId === projectId
              ? liveTask.ownership.stageId
              : null,
        },
        folderId: null,
      };
    }
    if (key.startsWith("goal:")) {
      return {
        ownership: { kind: "goal", goalId: key.slice(5) },
        folderId: null,
      };
    }
    if (key.startsWith("folder:")) {
      const fId = key.slice(7);
      return {
        ownership: { kind: "folder", folderId: fId },
        folderId: fId,
      };
    }
    return {
      ownership: { kind: "standalone", folderId: null },
      folderId: null,
    };
  };

  const handleSaveDone = () =>
    saveTaskChanges({
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
    });

  const handleShrinkScope = () =>
    shrinkTaskScope({
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
    });

  const handleSplitIntoSteps = () =>
    splitTaskSteps({
      liveTask,
      splitLines,
      setError,
      setBusy,
      repositories,
      setSplitLines,
      setLighterMode,
      onSaved,
    });

  const handlePauseItem = () =>
    pauseTask({
      liveTask,
      setBusy,
      setError,
      repositories,
      setWhenDate,
      setWhenTime,
      setLighterMode,
      onSaved,
      onClose,
    });

  const handleAbandonConfirm = () =>
    abandonTask({
      setBusy,
      setError,
      isEventMode,
      liveEvent,
      repositories,
      onSaved,
      onClose,
      liveTask,
      setAbandonAlertOpen,
    });

  const connectionOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: "", label: "Без папки / проєкту" },
    ];
    for (const f of folders) {
      opts.push({ value: `folder:${f.id}`, label: `Папка: ${f.name}` });
    }
    for (const p of projects.filter((pr) => !pr.archived)) {
      opts.push({ value: `project:${p.id}`, label: `Проєкт: ${p.title}` });
    }
    for (const g of goals.filter((gl) => !gl.archived)) {
      opts.push({ value: `goal:${g.id}`, label: `Ціль: ${g.title}` });
    }
    return opts;
  }, [folders, projects, goals]);

  if (!isOpen || (!liveTask && !liveEvent)) return null;

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        title={isEventMode ? "Подія" : "Завдання"}
        footer={
          <Button
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={() => void handleSaveDone()}
            data-testid="task-sheet-done-button"
          >
            Готово
          </Button>
        }
      >
        <div className="space-y-4" data-testid="task-sheet">
          {error && <InlineBanner tone="error">{error}</InlineBanner>}

          <div className="flex items-center gap-3 px-1">
            {!isEventMode && liveTask ? (
              <div data-testid="task-sheet-check-circle">
                <Checkbox
                  checked={liveTask.state === "completed"}
                  label={
                    liveTask.state === "completed"
                      ? "Повернути у відкриті"
                      : "Позначити виконаним"
                  }
                  onChange={() => void handleToggleCompleted()}
                />
              </div>
            ) : (
              <span className="w-8 h-8 rounded-full inline-grid place-items-center shrink-0">
                <Orb color={areaIdentity(resolvedAreaInfo)} size={20} />
              </span>
            )}
            <input
              type="text"
              aria-label="Назва"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="task-sheet-title-input"
              className="flex-1 min-w-0 bg-transparent border-0 text-xl font-extrabold text-[var(--text-primary)] focus:outline-none"
            />
          </div>

          <WhenField
            date={whenDate}
            today={formatInstantInZone(Date.now(), zone).localDate}
            onDateChange={(next) => {
              setWhenDate(next);
              if (!next) setWhenTime("");
            }}
            onOpen={() => toggleChip("datetime")}
            selected={openChip === "datetime"}
            allowUndated={!isEventMode}
          >
            {whenDate && (
              <div className="create-time-controls">
                <ParameterChip
                  icon="clock"
                  label="Час"
                  value={whenTime || null}
                  onClick={() => toggleChip("datetime")}
                  selected={openChip === "datetime"}
                />
                <ParameterChip
                  icon="clock"
                  label="Тривалість"
                  value={`${durationMinutes} хв`}
                  onClick={() => toggleChip("duration")}
                  selected={openChip === "duration"}
                />
                <div className="create-duration-presets">
                  {[15, 30, 45, 60, 90].map((value) => (
                    <Pill
                      key={value}
                      selected={durationMinutes === value}
                      onClick={() => setDurationMinutes(value)}
                    >
                      {value}
                    </Pill>
                  ))}
                </div>
              </div>
            )}
          </WhenField>
          <SphereField
            areas={activeAreas}
            value={areaId}
            onChange={setAreaId}
            onOpen={() => toggleChip("area")}
            selected={openChip === "area"}
          />
          <MoreGrid
            open={editMoreOpen}
            onToggle={() => {
              setEditMoreOpen(!editMoreOpen);
              setOpenChip(null);
            }}
          >
            {!isEventMode && (
              <ParameterChip
                icon="sparkles"
                label="Зусилля"
                value={
                  effort === "small"
                    ? "Невеликі"
                    : effort === "medium"
                      ? "Середні"
                      : effort === "large"
                        ? "Значні"
                        : null
                }
                onClick={() => toggleChip("effort")}
              />
            )}
            <ParameterChip
              icon="folder"
              label="Куди"
              value={
                connectionOptions.find((option) => option.value === parentKey)
                  ?.label
              }
              onClick={() => toggleChip("parent")}
            />
            {!isEventMode && (
              <ParameterChip
                icon="calendar"
                label="Дедлайн"
                value={deadlineDate || null}
                onClick={() => toggleChip("deadline")}
              />
            )}
          </MoreGrid>
          {openChip && (
            <TaskOptionsPanel
              openChip={openChip}
              whenDate={whenDate}
              setWhenDate={setWhenDate}
              whenTime={whenTime}
              setWhenTime={setWhenTime}
              durationMinutes={durationMinutes}
              setDurationMinutes={setDurationMinutes}
              activeAreas={activeAreas}
              areaId={areaId}
              setAreaId={setAreaId}
              parentKey={parentKey}
              connectionOptions={connectionOptions}
              setParentKey={setParentKey}
              projects={projects}
              goals={goals}
              effort={effort}
              setEffort={setEffort}
              deadlineDate={deadlineDate}
              setDeadlineDate={setDeadlineDate}
            />
          )}

          {!isEventMode && measure && (
            <Section title="Вимір">
              <MeasureField
                measure={measure}
                color={areaIdentity(
                  activeAreas.find((area) => area.id === areaId),
                )}
                onLog={handleQuickLogMeasure}
              />
            </Section>
          )}

          {!isEventMode && liveTask && (
            <Section title="Сеанси">
              {activeTaskReservations.map((res) => {
                const dur = Math.max(
                  15,
                  Math.round(
                    (Date.parse(res.interval.endInstant) -
                      Date.parse(res.interval.startInstant)) /
                      60000,
                  ),
                );
                return (
                  <Row
                    key={res.id}
                    title={formatSessionSummaryUk(
                      res.interval.originStartLocalDate,
                      res.interval.originStartLocalTime.slice(0, 5),
                      dur,
                      zone,
                    )}
                    onClick={() =>
                      setSessionSheetState({
                        open: true,
                        reservationId: res.id,
                      })
                    }
                    trailing={
                      <button
                        type="button"
                        aria-label="Скасувати сеанс"
                        onClick={(e) => {
                          e.stopPropagation();
                          void repositories
                            .cancelSingleReservationTransactionally(
                              res.id,
                              "cancel",
                              new Date().toISOString(),
                              res.revision,
                            )
                            .then(() => onSaved("Сеанс скасовано"));
                        }}
                        className="ui-round"
                      >
                        <Icon name="x" size={16} />
                      </button>
                    }
                  />
                );
              })}
              <Row
                title="+ Запланувати сеанс"
                onClick={() =>
                  setSessionSheetState({ open: true, reservationId: null })
                }
                data-testid="open-session-sheet-row"
              />
            </Section>
          )}

          {!isEventMode && liveTask && (
            <TaskScopePanel
              setLighterMode={setLighterMode}
              lighterMode={lighterMode}
              shrinkDuration={shrinkDuration}
              setShrinkDuration={setShrinkDuration}
              busy={busy}
              handleShrinkScope={handleShrinkScope}
              splitLines={splitLines}
              setSplitLines={setSplitLines}
              handleSplitIntoSteps={handleSplitIntoSteps}
              handlePauseItem={handlePauseItem}
            />
          )}

          <div className="pt-1">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => setAbandonAlertOpen(true)}
              data-testid="task-sheet-abandon-button"
            >
              Відмовитися
            </Button>
          </div>
        </div>
      </Sheet>

      {liveTask && (
        <SessionSheet
          isOpen={sessionSheetState.open}
          onClose={() =>
            setSessionSheetState({ open: false, reservationId: null })
          }
          date={whenDate || date}
          zone={zone}
          initialTime={whenTime || initialTime || "09:00"}
          initialDurationMinutes={durationMinutes}
          task={liveTask}
          reservationId={sessionSheetState.reservationId}
          tasks={tasks}
          events={events}
          reservations={reservations}
          repositories={repositories}
          onSaved={onSaved}
        />
      )}

      <AlertSheet
        isOpen={abandonAlertOpen}
        onClose={() => setAbandonAlertOpen(false)}
        title={
          isEventMode ? "Відмовитися від події?" : "Відмовитися від справи?"
        }
        description={
          isEventMode
            ? "Подію буде скасовано та прибрано з активного розкладу."
            : "Справу буде позначено скасованою, а заплановані сеанси звільнено."
        }
        confirmLabel="Відмовитися"
        onConfirm={() => void handleAbandonConfirm()}
      />
    </>
  );
}
