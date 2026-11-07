import { reminderFallsInSleep } from "../../components/habits/SleepReminderNote";
import { selectTaskReviewState } from "../../domain/projections";
import { it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransactionalEngine } from "../db";
import { PlanuiRepositories } from "../repositories";
import { seedUiFixture, UI_CLOCK, UI_ZONE } from "../../test/ui-fixture";
import { projectTodayTasks, sessionFromDuration } from "../../domain/today";

it("Stage 2: calendar and habit list share one completion; pausing preserves history", async () => {
  const engine = new InMemoryTransactionalEngine();
  await seedUiFixture(engine);
  const repos = new PlanuiRepositories(engine);
  const date = "2026-11-05";
  await repos.scheduleHabitSession({
    id: "stage2-session",
    habitId: "stretch",
    localDate: date,
    interval: sessionFromDuration(date, "12:00", 10, UI_ZONE),
    expectedHabitRevision: 1,
    confirmOverlap: true,
    nowIso: UI_CLOCK,
  });
  await repos.recordHabitEntryForDateTransactionally({
    habitId: "stretch",
    localDate: date,
    input: { kind: "minimum" },
    nowIso: UI_CLOCK,
  });
  await repos.recordHabitEntryForDateTransactionally({
    habitId: "stretch",
    localDate: date,
    input: { kind: "complete" },
    nowIso: UI_CLOCK,
  });
  const before = (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot;
  assert.equal(
    before.habitEntries.filter(
      (e) => e.habitId === "stretch" && e.localDate === date,
    ).length,
    1,
  );
  const habit = before.habits.find((h) => h.id === "stretch")!;
  await repos.updateHabitStateTransactionally(
    habit.id,
    "paused",
    UI_CLOCK,
    habit.revision,
  );
  const after = (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot;
  assert.deepEqual(after.habitEntries, before.habitEntries);
  assert.equal(after.habits.find((h) => h.id === habit.id)!.state, "paused");
});
it("Stage 2: Minimum Day retains deadlines and limits optional steps; triage projection never writes", async () => {
  const engine = new InMemoryTransactionalEngine();
  const { snapshot } = await seedUiFixture(engine);
  const repos = new PlanuiRepositories(engine);
  const before = (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot;
  const date = "2026-11-05";
  const plan = {
    minimalDay: true,
    focusTaskIds: snapshot.tasks.map((t) => t.id),
    focusNoteUk: null,
  };
  const projection = projectTodayTasks(
    snapshot.tasks,
    snapshot.reservations,
    date,
    UI_ZONE,
    plan,
  );
  assert.ok(
    projection.visible.filter(
      (t) =>
        !t.deadline &&
        !snapshot.reservations.some(
          (r) => r.taskId === t.id && r.state === "active",
        ),
    ).length <= 1,
  );
  for (const task of projection.relevant.filter((t) => t.deadline))
    assert.ok(projection.visible.includes(task));
  for (const task of snapshot.tasks)
    selectTaskReviewState(task, date, snapshot.reservations, UI_ZONE);
  assert.deepEqual(
    (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot,
    before,
  );
});
it("Stage 2: sleep note observes user sleep blocks, including midnight, without changing events", async () => {
  const engine = new InMemoryTransactionalEngine();
  const { snapshot } = await seedUiFixture(engine);
  const base = snapshot.events[0];
  const sleep = {
    ...base,
    type: "sleep" as const,
    state: "active" as const,
    schedule: {
      kind: "timed" as const,
      interval: sessionFromDuration("2026-11-05", "22:00", 480, "UTC"),
    },
  };
  const copy = structuredClone(sleep);
  assert.equal(
    reminderFallsInSleep("О 23:00", "2026-11-05", "UTC", [sleep]),
    true,
  );
  assert.equal(
    reminderFallsInSleep("03:00", "2026-11-06", "UTC", [sleep]),
    true,
  );
  assert.equal(
    reminderFallsInSleep("08:00", "2026-11-06", "UTC", [sleep]),
    false,
  );
  assert.deepEqual(sleep, copy);
});
