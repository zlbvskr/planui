import { useEffect, useMemo, useState } from "react";

import { Sheet } from "../../ui/sheets";

import { Button } from "../../ui/buttons";

import { DateField, SelectField } from "../../ui/fields";

import { InlineBanner } from "../../ui/feedback";

import { InputField } from "../../ui/primitives";

import { Pill } from "../../ui/selection";

import { Row } from "../../ui/rows";

import { Section } from "../../ui/headers";

import { Toggle } from "../../ui/Toggle";

import { addDaysToLocalDate } from "../../domain/temporal";

import { ProjectStage, RoadmapPeriod } from "../../domain/types";

import { PlanuiRepositories } from "../../storage/repositories";

export interface StageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  owner?: { kind: "goal" | "project"; id: string };
  goalId?: string | null;
  projectId?: string | null;
  stage?: ProjectStage | null;
  stages: readonly ProjectStage[];
  todayDate?: string;
  repositories: PlanuiRepositories;
  onSaved: (msg?: string) => Promise<unknown> | void;
}

type StagePeriodPreset =
  | "this_month"
  | "next_month"
  | "this_quarter"
  | "custom";

function computeRoadmapPeriodFromPreset(
  preset: StagePeriodPreset,
  todayDate: string,
  customStart: string,
  customEnd: string,
): RoadmapPeriod {
  const [yStr, mStr] = todayDate.split("-");
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || 1;

  if (preset === "this_month") {
    return {
      precision: "month",
      month: `${year}-${String(month).padStart(2, "0")}`,
    };
  }
  if (preset === "next_month") {
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    return {
      precision: "month",
      month: `${nextY}-${String(nextM).padStart(2, "0")}`,
    };
  }
  if (preset === "this_quarter") {
    const q = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    return {
      precision: "quarter",
      year,
      quarter: q,
    };
  }
  const safeStart = customStart || todayDate;
  const safeEnd =
    customEnd && customEnd > safeStart
      ? customEnd
      : addDaysToLocalDate(safeStart, 14);
  return {
    precision: "range",
    startDate: safeStart,
    endDateExclusive: safeEnd,
  };
}

export function StageSheet({
  isOpen,
  onClose,
  owner: propOwner,
  goalId,
  projectId,
  stage,
  stages,
  todayDate = new Date().toISOString().slice(0, 10),
  repositories,
  onSaved,
}: StageSheetProps) {
  const owner = useMemo(
    () =>
      propOwner ??
      (goalId
        ? { kind: "goal" as const, id: goalId }
        : { kind: "project" as const, id: projectId ?? "" }),
    [propOwner, goalId, projectId],
  );
  const siblingStages = useMemo(
    () =>
      stages
        .filter((s) =>
          owner.kind === "goal"
            ? s.goalId === owner.id
            : s.projectId === owner.id,
        )
        .filter((s) => s.id !== stage?.id)
        .sort((a, b) => a.order - b.order),
    [stages, owner, stage?.id],
  );

  const [title, setTitle] = useState(stage?.title ?? "");
  const [preset, setPreset] = useState<StagePeriodPreset>("this_month");
  const [customStart, setCustomStart] = useState(todayDate);
  const [customEnd, setCustomEnd] = useState(addDaysToLocalDate(todayDate, 14));
  const [hasCheckpointDate, setHasCheckpointDate] = useState(
    Boolean(stage?.targetDate),
  );
  const [checkpointDate, setCheckpointDate] = useState(
    stage?.targetDate ?? todayDate,
  );
  const [afterStageId, setAfterStageId] = useState<string>(
    stage?.dependsOnStageIds?.[0] ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDependents, setConfirmDependents] = useState(false);

  const dependentStages = useMemo(
    () =>
      stage
        ? siblingStages.filter((s) =>
            (s.dependsOnStageIds ?? []).includes(stage.id),
          )
        : [],
    [siblingStages, stage],
  );

  useEffect(() => {
    if (!isOpen) return;
    setTitle(stage?.title ?? "");
    if (stage?.roadmapPeriod?.precision === "range") {
      setPreset("custom");
      setCustomStart(stage.roadmapPeriod.startDate);
      setCustomEnd(stage.roadmapPeriod.endDateExclusive);
    } else if (stage?.roadmapPeriod?.precision === "quarter") {
      setPreset("this_quarter");
    } else {
      setPreset("this_month");
    }
    setHasCheckpointDate(Boolean(stage?.targetDate));
    setCheckpointDate(stage?.targetDate ?? todayDate);
    setAfterStageId(stage?.dependsOnStageIds?.[0] ?? "");
    setError(null);
    setConfirmDependents(false);
  }, [isOpen, stage, todayDate]);

  const executeSave = async (shiftDependents: boolean) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введіть назву етапу.");
      return;
    }
    setBusy(true);
    setError(null);
    const nowIso = new Date().toISOString();
    try {
      const roadmapPeriod = computeRoadmapPeriodFromPreset(
        preset,
        todayDate,
        customStart,
        customEnd,
      );
      const nextTargetDate =
        hasCheckpointDate && checkpointDate ? checkpointDate : null;
      const record: ProjectStage = {
        id:
          stage?.id ??
          `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        projectId: owner.kind === "project" ? owner.id : null,
        goalId: owner.kind === "goal" ? owner.id : null,
        title: trimmed,
        expectedOutcome: stage?.expectedOutcome ?? null,
        targetDate: nextTargetDate,
        roadmapPeriod,
        checkpoints: stage?.checkpoints ?? [],
        dependsOnStageIds: afterStageId ? [afterStageId] : [],
        order: stage?.order ?? siblingStages.length,
        createdAt: stage?.createdAt ?? nowIso,
        updatedAt: nowIso,
        revision: stage ? stage.revision + 1 : 1,
      };

      await repositories.saveStage(record, stage?.revision);
      if (stage && dependentStages.length > 0 && shiftDependents) {
        const allGoalStages = stages.filter((s) =>
          owner.kind === "goal"
            ? s.goalId === owner.id
            : s.projectId === owner.id,
        );
        try {
          await repositories.updateStageGraph(
            stage.id,
            {
              roadmapPeriod,
              targetDate: nextTargetDate,
              checkpoints: record.checkpoints,
              dependsOnStageIds: record.dependsOnStageIds,
            },
            Object.fromEntries(
              allGoalStages.map((s) => [
                s.id,
                s.id === stage.id ? record.revision : s.revision,
              ]),
            ),
            true,
          );
        } catch {}
      }
      await onSaved(stage ? "Етап оновлено" : "Етап додано");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося зберегти етап.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введіть назву етапу.");
      return;
    }
    if (stage && dependentStages.length > 0 && !confirmDependents) {
      const nextPeriod = computeRoadmapPeriodFromPreset(
        preset,
        todayDate,
        customStart,
        customEnd,
      );
      const nextTargetDate =
        hasCheckpointDate && checkpointDate ? checkpointDate : null;
      const periodChanged =
        JSON.stringify(stage.roadmapPeriod) !== JSON.stringify(nextPeriod);
      const dateChanged = (stage.targetDate ?? null) !== nextTargetDate;
      if (periodChanged || dateChanged) {
        setConfirmDependents(true);
        return;
      }
    }
    await executeSave(false);
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={stage ? "Етап" : "Новий етап"}
      footer={
        confirmDependents ? (
          <div className="space-y-2 w-full">
            <p className="text-xs font-bold text-[var(--text-secondary)] px-1">
              Цей етап має залежні етапи (
              {dependentStages.map((s) => s.title).join(", ")}). Зсунути їхні
              дати також?
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={busy}
                onClick={() => void executeSave(false)}
              >
                Залишити дати
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy}
                onClick={() => void executeSave(true)}
                data-testid="stage-sheet-confirm-shift"
              >
                Зсунути залежні
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={() => void handleSave()}
            data-testid="stage-sheet-submit"
          >
            {stage ? "Зберегти" : "Додати"}
          </Button>
        )
      }
    >
      <div className="space-y-4" data-testid="stage-sheet">
        {error && <InlineBanner tone="error">{error}</InlineBanner>}

        <InputField
          label="Назва етапу"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Наприклад: Підготувати основу"
          data-testid="stage-sheet-name-input"
        />

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] px-1">
            Період
          </p>
          <div className="ui-pill-row" role="group" aria-label="Період етапу">
            {(
              [
                ["this_month", "Цей місяць"],
                ["next_month", "Наступний місяць"],
                ["this_quarter", "Цей квартал"],
                ["custom", "Свій період"],
              ] as const
            ).map(([key, label]) => (
              <Pill
                key={key}
                selected={preset === key}
                onClick={() => setPreset(key)}
                data-testid={`stage-period-pill-${key}`}
              >
                {label}
              </Pill>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <Section>
            <DateField
              label="Початок періоду"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <DateField
              label="Кінець періоду"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </Section>
        )}

        <Section>
          <Row
            title="Контрольна дата"
            trailing={
              <Toggle
                label="Контрольна дата"
                checked={hasCheckpointDate}
                onChange={setHasCheckpointDate}
              />
            }
          />
          {hasCheckpointDate && (
            <DateField
              label="Дата"
              value={checkpointDate}
              onChange={(e) => setCheckpointDate(e.target.value)}
            />
          )}
          <SelectField
            label="Після етапу"
            value={afterStageId}
            onChange={(e) => setAfterStageId(e.target.value)}
            options={[
              { value: "", label: "Незалежно" },
              ...siblingStages.map((s) => ({
                value: s.id,
                label: s.title,
              })),
            ]}
          />
        </Section>
      </div>
    </Sheet>
  );
}
