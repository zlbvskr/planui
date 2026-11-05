import {
  Section,
  Row,
  Sheet,
  ActionMenu,
  Toggle,
  EmptyState,
  InfoSheet,
  SelectField,
  DateField,
} from "../ui";
import { previewStageShift } from "../domain/stageDependencies";
import type { ProjectStage } from "../domain/types";
import React, { useState } from "react";
import {
  Folder,
  PlanningEntityState,
  RoadmapCheckpoint,
  RoadmapPeriod,
  RoadmapOwner,
  Task,
} from "../domain/types";
import {
  RoadmapItem,
  RoadmapSource,
  projectRoadmap,
  periodLabelUk,
  dateLabelUk,
  roadmapWarnings,
  periodInterval,
  requiresStageDateReview,
} from "../domain/roadmap";
import { addDaysToLocalDate } from "../domain/temporal";
import { PlanuiRepositories } from "../storage/repositories";
import { Button, Card, InputField } from "../components/ui/primitives";

const stateLabels: Record<PlanningEntityState, string> = {
  active: "Активні",
  idea: "Ідеї",
  paused: "На паузі",
  completed: "Завершені",
};
const kindLabels = { goal: "Ціль", project: "Проєкт", stage: "Етап" };

export function RoadmapItemEditor({
  item,
  repositories,
  onChanged,
  onCancel,
  relatedItems = [],
  relatedTasks = [],
}: {
  item: RoadmapItem;
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void> | void;
  onCancel: () => void;
  relatedItems?: RoadmapItem[];
  relatedTasks?: readonly Task[];
}) {
  const [dependencies, setDependencies] = useState<string[]>(
    (item.record as ProjectStage).dependsOnStageIds ?? [],
  );
  const stageRecords = relatedItems
    .filter((record) => record.owner.kind === "stage")
    .map((record) => record.record as ProjectStage);
  const period = item.record.roadmapPeriod;
  const [precision, setPrecision] = useState(period?.precision ?? "undated");
  const [month, setMonth] = useState(
    period?.precision === "month" ? period.month : "",
  );
  const [year, setYear] = useState(
    period?.precision === "quarter" ? String(period.year) : "",
  );
  const [quarter, setQuarter] = useState(
    period?.precision === "quarter" ? String(period.quarter) : "1",
  );
  const [start, setStart] = useState(
    period?.precision === "range" ? period.startDate : "",
  );
  const [end, setEnd] = useState(
    period?.precision === "range"
      ? addDaysToLocalDate(period.endDateExclusive, -1)
      : "",
  );
  const [deadline, setDeadline] = useState(item.deadline ?? "");
  const [points, setPoints] = useState<RoadmapCheckpoint[]>(
    [...(item.record.checkpoints ?? [])].sort((a, b) => a.order - b.order),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewSubsequent, setReviewSubsequent] = useState(false);
  function draftPeriod(): RoadmapPeriod | null {
    if (precision === "month") return { precision, month };
    if (precision === "quarter")
      return {
        precision,
        year: Number(year),
        quarter: Number(quarter) as 1 | 2 | 3 | 4,
      };
    if (precision === "range")
      return {
        precision,
        startDate: start,
        endDateExclusive: addDaysToLocalDate(end, 1),
      };
    return null;
  }
  let warnings: string[] = [];
  try {
    const preview: RoadmapItem = {
      ...item,
      deadline: deadline || null,
      record: {
        ...item.record,
        roadmapPeriod: draftPeriod(),
        checkpoints: points,
      },
    };
    if (preview.record.roadmapPeriod)
      periodInterval(preview.record.roadmapPeriod);
    const related = [
      ...relatedItems.filter(
        (i) => i.owner.kind !== item.owner.kind || i.owner.id !== item.owner.id,
      ),
      preview,
    ];
    warnings = related
      .filter(
        (i) =>
          (i.owner.kind === preview.owner.kind &&
            i.owner.id === preview.owner.id) ||
          (i.parent?.kind === preview.owner.kind &&
            i.parent.id === preview.owner.id),
      )
      .flatMap((i) =>
        roadmapWarnings(i, related, relatedTasks).map(
          (w) => `${i.title}: ${w}`,
        ),
      );
  } catch {
    /* Incomplete input is validated on submit. */
  }
  async function save(
    e: React.FormEvent,
    keepSubsequent = false,
    shiftDependents = false,
  ) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const roadmapPeriod = draftPeriod();
      if (roadmapPeriod) periodInterval(roadmapPeriod);
      if (
        !keepSubsequent &&
        requiresStageDateReview(item, relatedItems, roadmapPeriod)
      ) {
        setReviewSubsequent(true);
        return;
      }
      if (item.owner.kind === "stage")
        await repositories.updateStageGraph(
          item.owner.id,
          {
            roadmapPeriod,
            targetDate: deadline || null,
            checkpoints: points.map((c, order) => ({ ...c, order })),
            dependsOnStageIds: dependencies,
          },
          Object.fromEntries(
            stageRecords.map((stage) => [stage.id, stage.revision]),
          ),
          shiftDependents,
        );
      else
        await repositories.updateRoadmapItem(
          item.owner,
          {
            roadmapPeriod,
            deadline: deadline || null,
            checkpoints: points.map((c, order) => ({ ...c, order })),
          },
          item.record.revision,
        );
      await onChanged();
      onCancel();
    } catch {
      setError(
        "Не вдалося зберегти. Перевірте дати, порядок меж і назви контрольних точок. Якщо запис змінився, закрийте форму та відкрийте знову.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-3 min-w-0"
      onSubmit={save}
      aria-label={`Дати: ${item.title}`}
    >
      <h4 className="font-semibold">{item.title}</h4>
      <SelectField
        label="Точність планування"
        value={precision}
        onChange={(e) => setPrecision(e.target.value as typeof precision)}
        options={[
          { value: "undated", label: "Без періоду" },
          { value: "month", label: "Місяць" },
          { value: "quarter", label: "Квартал" },
          { value: "range", label: "Діапазон дат" },
        ]}
      />
      {precision === "month" && (
        <InputField
          label="Місяць"
          type="month"
          required
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      )}
      {precision === "quarter" && (
        <div className="grid grid-cols-2 gap-2">
          <InputField
            label="Рік"
            type="number"
            min="1"
            max="9998"
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <SelectField
            label="Квартал"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            options={[1, 2, 3, 4].map((q) => ({
              value: String(q),
              label: `${q} квартал`,
            }))}
          />
        </div>
      )}
      {precision === "range" && (
        <div className="grid sm:grid-cols-2 gap-2">
          <DateField
            label="Початок"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <DateField
            label="Останній день (включно)"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      )}
      {item.owner.kind === "stage" && (
        <fieldset>
          <legend>Залежить від етапів</legend>
          {stageRecords
            .filter((stage) => stage.id !== item.owner.id)
            .map((stage) => (
              <label
                key={stage.id}
                className="flex min-h-[44px] gap-2 items-center"
              >
                <Toggle
                  label={stage.title}
                  checked={dependencies.includes(stage.id)}
                  onChange={() =>
                    setDependencies(
                      dependencies.includes(stage.id)
                        ? dependencies.filter((id) => id !== stage.id)
                        : [...dependencies, stage.id],
                    )
                  }
                />
                {stage.title}
              </label>
            ))}
        </fieldset>
      )}
      <DateField
        label="Термін завершення"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />
      <fieldset className="space-y-3">
        <legend className="font-semibold">Контрольні точки</legend>
        {points.map((point, index) => (
          <div key={point.id} className="space-y-2 border rounded-xl p-3">
            <InputField
              label={`Назва точки ${index + 1}`}
              required
              value={point.title}
              onChange={(e) =>
                setPoints(
                  points.map((c) =>
                    c.id === point.id ? { ...c, title: e.target.value } : c,
                  ),
                )
              }
            />
            <DateField
              label={`Дата точки ${index + 1} (необов’язково)`}
              value={point.localDate ?? ""}
              onChange={(e) =>
                setPoints(
                  points.map((c) =>
                    c.id === point.id
                      ? { ...c, localDate: e.target.value || null }
                      : c,
                  ),
                )
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={index === 0}
                aria-label={`Вище: ${point.title}`}
                onClick={() => {
                  const next = [...points];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  setPoints(next);
                }}
              >
                Вище
              </Button>
              <Button
                disabled={index === points.length - 1}
                aria-label={`Нижче: ${point.title}`}
                onClick={() => {
                  const next = [...points];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  setPoints(next);
                }}
              >
                Нижче
              </Button>
              <Button
                onClick={() =>
                  setPoints(points.filter((c) => c.id !== point.id))
                }
              >
                Прибрати точку
              </Button>
            </div>
          </div>
        ))}
        <Button
          onClick={() =>
            setPoints([
              ...points,
              {
                id: crypto.randomUUID(),
                title: "",
                localDate: null,
                order: points.length,
              },
            ])
          }
        >
          Додати контрольну точку
        </Button>
      </fieldset>

      {warnings.length > 0 && (
        <div role="status">
          <p className="font-semibold">Перевірте узгодженість плану:</p>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          <p>Пов’язані елементи можна відкрити в напрямах і змінити окремо.</p>
        </div>
      )}
      {reviewSubsequent && (
        <Sheet
          isOpen
          title="Залежні етапи"
          onClose={() => setReviewSubsequent(false)}
        >
          <p>Переглянути й зсунути наступні етапи чи залишити їхні дати?</p>
          <ul>
            {relatedItems
              .filter(
                (other) =>
                  other.owner.kind === "stage" &&
                  other.owner.id !== item.owner.id &&
                  other.parent?.id === item.parent?.id,
              )
              .map((other) => (
                <li key={other.owner.id}>
                  {other.title} · {periodLabelUk(other.record.roadmapPeriod)}
                </li>
              ))}
          </ul>
          <Button onClick={(e) => void save(e, true, true)}>
            Підтвердити перенесення залежних етапів
          </Button>
          <ul>
            {(() => {
              try {
                return previewStageShift(
                  stageRecords,
                  item.owner.id,
                  draftPeriod(),
                )
                  .filter((stage) => stage.id !== item.owner.id)
                  .map((stage) => (
                    <li key={stage.id}>
                      {stage.title}: {periodLabelUk(stage.roadmapPeriod)}
                    </li>
                  ));
              } catch {
                return <li>Перевірте дати й залежності.</li>;
              }
            })()}
          </ul>
          <Button onClick={(e) => void save(e, true)}>
            Залишити їхні дати й зберегти
          </Button>
          <Button onClick={() => setReviewSubsequent(false)}>
            Повернутися до перегляду
          </Button>
        </Sheet>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          Зберегти дати
        </Button>
      </div>
    </form>
  );
}

export function RoadmapView({
  source,
  repositories,
  onChanged,
  initialOwner = null,
  onInspect,
  selectedState = "active",
}: {
  selectedState?: PlanningEntityState;
  source: RoadmapSource;
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void> | void;
  initialOwner?: RoadmapOwner | null;
  onInspect?: (owner: RoadmapOwner) => void;
}) {
  const [states, setStates] = useState<PlanningEntityState[]>(["active"]);
  const [editing, setEditing] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const all = projectRoadmap(source, ["active", "idea", "paused", "completed"]);
  const items = projectRoadmap(source, [selectedState]).filter(
    (i) =>
      !initialOwner ||
      (i.owner.kind === initialOwner.kind && i.owner.id === initialOwner.id) ||
      (i.parent?.kind === initialOwner.kind &&
        i.parent.id === initialOwner.id) ||
      (initialOwner.kind === "goal" &&
        i.owner.kind === "stage" &&
        source.projects.some(
          (p) =>
            p.goalId === initialOwner.id &&
            p.id === i.parent?.id &&
            i.parent.kind === "project",
        )),
  );
  const detailOrder: string[] = [];
  const addOwner = (owner: RoadmapOwner) => {
    detailOrder.push(owner.kind + ":" + owner.id);
    for (const stage of [...source.stages]
      .filter((s) =>
        owner.kind === "goal"
          ? s.goalId === owner.id
          : s.projectId === owner.id,
      )
      .sort((a, b) => a.order - b.order))
      detailOrder.push("stage:" + stage.id);
  };
  if (initialOwner) {
    addOwner(initialOwner);
    if (initialOwner.kind === "goal")
      for (const project of source.projects.filter(
        (p) => p.goalId === initialOwner.id,
      ))
        addOwner({ kind: "project", id: project.id });
  }
  const ordered = [...items].sort((a, b) => {
    if (initialOwner)
      return (
        detailOrder.indexOf(a.owner.kind + ":" + a.owner.id) -
        detailOrder.indexOf(b.owner.kind + ":" + b.owner.id)
      );
    const date = (i: RoadmapItem) =>
      i.record.roadmapPeriod
        ? periodInterval(i.record.roadmapPeriod).startDate
        : (i.deadline ?? "9999-99-99");
    return date(a).localeCompare(date(b));
  });
  async function action(work: () => Promise<unknown>) {
    try {
      setError("");
      await work();
      await onChanged();
    } catch {
      setError("Не вдалося змінити етапи. Оновіть дані та спробуйте знову.");
    }
  }
  const groups = new Map<string | null, RoadmapItem[]>();
  for (const item of ordered) {
    const group = groups.get(item.folderId) ?? [];
    group.push(item);
    groups.set(item.folderId, group);
  }
  return (
    <div className="stage4-roadmap" data-testid="roadmap">
      {error && <p role="alert">{error}</p>}
      {!items.length && <EmptyState text="Ще немає етапів" />}
      {[...groups].map(([folderId, group]) => (
        <Section
          key={folderId ?? "none"}
          title={directionPath(source.folders ?? [], folderId)}
        >
          {group.map((item) => {
            const key = item.owner.kind + ":" + item.owner.id;
            return (
              <div
                key={key}
                className="stage4-stage"
                data-roadmap-period="informational"
              >
                <Row
                  title={item.title}
                  secondary={kindLabels[item.owner.kind]}
                  trailing={
                    <ActionMenu
                      label={`Дії: ${item.title}`}
                      items={[
                        {
                          label: "Змінити дати й точки",
                          onSelect: () => setEditing(key),
                        },
                        ...(item.owner.kind === "stage" && item.parent
                          ? [
                              {
                                label: "Змінити порядок: на початок",
                                onSelect: () =>
                                  void action(() =>
                                    repositories.reorderRoadmapStages(
                                      item.parent as {
                                        kind: "goal" | "project";
                                        id: string;
                                      },
                                      [
                                        item.owner.id,
                                        ...source.stages
                                          .filter(
                                            (s) =>
                                              (item.parent?.kind === "goal"
                                                ? s.goalId === item.parent.id
                                                : s.projectId ===
                                                  item.parent?.id) &&
                                              s.id !== item.owner.id,
                                          )
                                          .sort((a, b) => a.order - b.order)
                                          .map((s) => s.id),
                                      ],
                                    ),
                                  ),
                              },
                            ]
                          : []),
                        ...(onInspect
                          ? [
                              {
                                label: "Відкрити план",
                                onSelect: () =>
                                  onInspect(
                                    item.owner.kind === "stage"
                                      ? item.parent!
                                      : item.owner,
                                  ),
                              },
                            ]
                          : []),
                      ]}
                    />
                  }
                />
                {roadmapWarnings(item, all, source.tasks).length > 0 && (
                  <InfoSheet title="Узгодженість плану">
                    {roadmapWarnings(item, all, source.tasks).map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </InfoSheet>
                )}
                <div className="stage4-period">
                  {periodLabelUk(item.record.roadmapPeriod)}
                </div>
                {(item.record as ProjectStage).dependsOnStageIds?.length ? (
                  <div className="stage4-connector">
                    Після:{" "}
                    {(item.record as ProjectStage)
                      .dependsOnStageIds!.map(
                        (id) => source.stages.find((s) => s.id === id)?.title,
                      )
                      .join(" · ")}
                  </div>
                ) : null}
                {item.deadline && (
                  <Row title="Термін" trailing={dateLabelUk(item.deadline)} />
                )}
                {(item.record.checkpoints ?? []).map((c) => (
                  <Row
                    key={c.id}
                    leading={<span>◇</span>}
                    title={c.title}
                    trailing={
                      c.localDate ? dateLabelUk(c.localDate) : undefined
                    }
                  />
                ))}
                <Sheet
                  title="Дати й контрольні точки"
                  isOpen={editing === key}
                  onClose={() => setEditing(null)}
                >
                  <RoadmapItemEditor
                    item={item}
                    relatedItems={all}
                    relatedTasks={source.tasks}
                    repositories={repositories}
                    onChanged={onChanged}
                    onCancel={() => setEditing(null)}
                  />
                </Sheet>
              </div>
            );
          })}
        </Section>
      ))}
      {initialOwner && initialOwner.kind !== "stage" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const now = new Date().toISOString();
              await repositories.saveStage({
                id: crypto.randomUUID(),
                projectId:
                  initialOwner.kind === "project" ? initialOwner.id : null,
                goalId: initialOwner.kind === "goal" ? initialOwner.id : null,
                title: newTitle,
                expectedOutcome: null,
                targetDate: null,
                order: source.stages.length,
                createdAt: now,
                updatedAt: now,
                revision: 1,
              });
              setNewTitle("");
            });
          }}
        >
          <InputField
            label="Назва нового етапу"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button type="submit">Додати етап</Button>
        </form>
      )}
    </div>
  );
}

function directionPath(folders: readonly Folder[], id: string | null): string {
  const names: string[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const folder = folders.find((f) => f.id === id);
    if (!folder) break;
    names.unshift(folder.name);
    id = folder.parentId;
  }
  return names.join(" / ") || "Без напряму";
}
