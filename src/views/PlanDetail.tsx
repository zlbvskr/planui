import React, { useState } from "react";
import type { Goal, Project, Task, TaskReservation } from "../domain/types";
import type { PlanuiRepositories } from "../storage/repositories";
import {
  ActionMenu,
  Section,
  Disclosure,
  Sheet,
  SelectField,
  DateField,
  Row,
} from "../ui";
import { InputField, Button } from "../components/ui/primitives";
import { periodLabelUk } from "../domain/roadmap";
import { formatDayMonth, formatInstant, formatMonthYear } from "../lib/format";
const labels = [
  "Для чого це мені",
  "Який результат означатиме завершення",
  "Наступний крок",
  "Орієнтовний термін",
  "Які сфери життя це підтримує",
];
export function PlanDetail({
  record: r,
  kind,
  tasks,
  reservations,
  repositories,
  onChanged,
  onTask,
  onAdd,
}: {
  record: Goal | Project;
  kind: "goal" | "project";
  tasks: Task[];
  reservations: TaskReservation[];
  repositories: PlanuiRepositories;
  onChanged: () => Promise<void>;
  onTask: (t: Task) => void;
  onAdd: () => void;
}) {
  const [editor, setEditor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [date, setDate] = useState("");
  const [intention, setIntention] = useState("");
  const [error, setError] = useState("");
  const [precision, setPrecision] = useState<"month" | "quarter">("month");
  const [month, setMonth] = useState("");
  const [quarter, setQuarter] = useState("1");
  const [year, setYear] = useState("2026");
  const [areas, setAreas] = useState<
    { id: string; titleUk?: string; questionTextUk: string }[]
  >([]);
  React.useEffect(() => {
    void repositories
      .captureCoherentSnapshot(new Date().toISOString())
      .then((s) => setAreas(s.snapshot.lifeAreaQuestions));
  }, [repositories]);
  const goal = kind === "goal" ? (r as Goal) : null;
  const values = [
    r.purposeUk ?? "",
    goal?.completionCriteriaUk ?? (r as Project).completionCriteria ?? "",
    r.nextActionTaskId ?? "",
    goal?.timing?.targetPeriodUk ?? "",
    r.lifeAreaId ?? "",
  ];
  async function save(patch: Partial<Goal & Project>) {
    try {
      setError("");
      const next = {
        ...r,
        ...patch,
        revision: r.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      if (kind === "goal") await repositories.saveGoal(next as Goal);
      else await repositories.saveProject(next as Project);
      await onChanged();
      setEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    }
  }
  return (
    <>
      <div className="stage4-status">
        <ActionMenu
          label="Статус плану"
          items={(["idea", "active", "paused", "completed"] as const).map(
            (state, i) => ({
              label: ["Ідея", "Активний", "На паузі", "Завершений"][i],
              onSelect: () =>
                void save({
                  state,
                  completedAt:
                    state === "completed" ? new Date().toISOString() : null,
                }),
            }),
          )}
        >
          {
            {
              idea: "Ідея",
              active: "Активний",
              paused: "На паузі",
              completed: "Завершений",
            }[r.state]
          }{" "}
          ⌄
        </ActionMenu>
      </div>
      <Section>
        {labels.map((label, i) => (
          <Disclosure
            key={label}
            title={label}
            secondary={
              i === 2
                ? tasks.find((t) => t.id === r.nextActionTaskId)?.title
                : i === 4
                  ? areas.find((a) => a.id === r.lifeAreaId)?.questionTextUk
                  : i === 3
                    ? r.roadmapPeriod
                      ? periodLabelUk(r.roadmapPeriod)
                      : values[i] ||
                        (goal?.timing?.targetDate
                          ? formatDayMonth(goal.timing.targetDate)
                          : undefined)
                    : values[i] || undefined
            }
            onClick={() => {
              setDraft(values[i]);
              setPrecision(
                r.roadmapPeriod?.precision === "quarter" ? "quarter" : "month",
              );
              setMonth(
                r.roadmapPeriod?.precision === "month"
                  ? r.roadmapPeriod.month
                  : "",
              );
              setQuarter(
                r.roadmapPeriod?.precision === "quarter"
                  ? String(r.roadmapPeriod.quarter)
                  : "1",
              );
              setYear(
                r.roadmapPeriod?.precision === "quarter"
                  ? String(r.roadmapPeriod.year)
                  : "2026",
              );
              setDate(
                goal?.timing?.targetDate ?? (r as Project).targetDate ?? "",
              );
              setIntention(goal?.implementationIntentionUk ?? "");
              setEditor(i);
            }}
          />
        ))}
      </Section>
      <Section title="Кроки й справи">
        {tasks.map((t) => (
          <Disclosure key={t.id} title={t.title} onClick={() => onTask(t)} />
        ))}
        <Disclosure title="+ Додати справу" onClick={onAdd} />
      </Section>
      {tasks.some((t) => t.deadline) && (
        <Section title="Терміни">
          {tasks
            .filter((t) => t.deadline)
            .map((t) => (
              <Row
                key={t.id}
                title={t.title}
                trailing={
                  <span className="stage4-badge">
                    {t.deadline?.kind === "date_only"
                      ? formatDayMonth(t.deadline.localDate)
                      : t.deadline?.kind === "exact_instant"
                        ? formatInstant(t.deadline.instant, "Europe/Kyiv")
                        : ""}
                  </span>
                }
              />
            ))}
        </Section>
      )}
      {reservations.some((s) => tasks.some((t) => t.id === s.taskId)) && (
        <Section title="Робочі сесії">
          {reservations
            .filter((s) => tasks.some((t) => t.id === s.taskId))
            .map((s) => (
              <Row
                key={s.id}
                title={tasks.find((t) => t.id === s.taskId)?.title}
                secondary={
                  formatInstant(
                    s.interval.startInstant,
                    s.interval.originZone,
                    { hour: "2-digit", minute: "2-digit" },
                  ) +
                  " – " +
                  formatInstant(s.interval.endInstant, s.interval.originZone, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
              />
            ))}
        </Section>
      )}
      <Sheet
        title={labels[editor ?? 0]}
        isOpen={editor !== null}
        onClose={() => setEditor(null)}
      >
        {editor === 2 ? (
          <>
            <SelectField
              label="Справа"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              options={[
                { value: "", label: "Не визначено" },
                ...tasks.map((t) => ({ value: t.id, label: t.title })),
              ]}
            />
            {goal && (
              <InputField
                label="Якщо — то (необов’язково)"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
              />
            )}
          </>
        ) : editor === 4 ? (
          <div className="stage4-area-chips" role="group" aria-label="Сфери життя">
            {[{id:'',questionTextUk:'Успадкувати'},...areas].map(a=><button type="button" className="ui-pill" key={a.id} aria-pressed={draft===a.id} onClick={()=>setDraft(a.id)}>{a.questionTextUk}</button>)}
          </div>
        ) : editor === 3 ? (
          <>
            <SelectField
              label="Період"
              value={precision}
              onChange={(e) =>
                setPrecision(e.target.value as "month" | "quarter")
              }
              options={[
                { value: "month", label: "Місяць" },
                { value: "quarter", label: "Квартал" },
              ]}
            />
            {precision === "month" ? (
              <div className="ui-native-field" role="group" aria-label="Місяць">
                <Row
                  title="Місяць"
                  trailing={
                    month ? formatMonthYear(month + "-01") : "Не визначено"
                  }
                />
                <input
                  aria-label="Місяць"
                  type="month"
                  data-ui="native-overlay"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
            ) : (
              <>
                <InputField
                  label="Рік"
                  type="number"
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
              </>
            )}
          </>
        ) : (
          <InputField
            label={labels[editor ?? 0]}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              editor === 3 ? "Листопад 2026 / IV квартал 2026" : undefined
            }
          />
        )}
        {editor === 3 && (
          <DateField
            label="Точна дата (необов’язково)"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <Button
          variant="primary"
          onClick={() =>
            void save(
              editor === 0
                ? { purposeUk: draft || null }
                : editor === 1
                  ? kind === "goal"
                    ? { completionCriteriaUk: draft || null }
                    : { completionCriteria: draft || null }
                  : editor === 2
                    ? {
                        nextActionTaskId: draft || null,
                        ...(goal
                          ? { implementationIntentionUk: intention || null }
                          : {}),
                      }
                    : editor === 3
                      ? {
                          roadmapPeriod:
                            precision === "month"
                              ? month
                                ? { precision: "month", month }
                                : null
                              : {
                                  precision: "quarter",
                                  year: Number(year),
                                  quarter: Number(quarter) as 1 | 2 | 3 | 4,
                                },
                          ...(goal
                            ? {
                                timing: {
                                  targetDate: date || null,
                                  targetPeriodUk: null,
                                },
                              }
                            : { targetDate: date || null }),
                        }
                      : { lifeAreaId: draft || null },
            )
          }
        >
          Зберегти
        </Button>
      </Sheet>
    </>
  );
}
