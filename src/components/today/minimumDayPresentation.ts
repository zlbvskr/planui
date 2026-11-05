import type { DailyPlan, Task } from "../../domain/types";
/** Presentation only: a manual minimal day never edits the underlying plan. */
export function minimumDayTasks(
  tasks: readonly Task[],
  plan: DailyPlan,
): Task[] {
  if (!plan.minimalDay) return [...tasks];
  const optional = tasks.find(
    (t) =>
      t.state === "open" &&
      t.effort === "small" &&
      plan.focusTaskIds.includes(t.id) &&
      !t.deadline &&
      t.priority !== "high",
  );
  return tasks.filter(
    (t) =>
      Boolean(t.deadline) || t.priority === "high" || t.id === optional?.id,
  );
}
