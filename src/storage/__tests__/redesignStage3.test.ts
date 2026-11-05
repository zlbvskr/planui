import { it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarGrid } from "../../components/calendar/CalendarGrid";
import {
  projectMonthCalendarGrid,
  projectScheduleForDate,
  detectScheduleConflicts,
} from "../../domain/scheduling";
import {
  calculateMonthWorkSummary,
  instantiateWorkShiftFromTemplate,
  generateFinitePeriodRosterPreview,
} from "../../domain/roster";
import { sessionFromDuration } from "../../domain/today";
import type { ShiftTemplate, CalendarEvent } from "../../domain/types";
import { InMemoryTransactionalEngine } from "../db";
import { PlanuiRepositories } from "../repositories";
import { seedUiFixture, UI_CLOCK, UI_ZONE } from "../../test/ui-fixture";
const tpl: ShiftTemplate = {
  id: "night",
  name: "Нічна",
  code: "Н",
  startLocalTime: "20:00",
  endLocalTime: "08:00",
  endDateOffsetDays: 1,
  color: "work",
  note: null,
  createdAt: UI_CLOCK,
  updatedAt: UI_CLOCK,
  revision: 1,
};
it("Stage 3: one night shift bridges a month boundary with two connected cell segments", () => {
  const { event } = instantiateWorkShiftFromTemplate({
    id: "boundary",
    template: tpl,
    startLocalDate: "2026-10-31",
    zoneId: UI_ZONE,
    nowIso: UI_CLOCK,
  });
  const grid = projectMonthCalendarGrid({
    selectedDate: "2026-11-01",
    actualTodayDate: "2026-11-05",
    displayZone: UI_ZONE,
    events: [event],
    tasks: [],
    reservations: [],
    dayOffAnnotations: [],
    secondaryFilter: "all",
  });
  const start = grid.cells.find((c) => c.localDate === "2026-10-31")!,
    end = grid.cells.find((c) => c.localDate === "2026-11-01")!;
  assert.equal(
    start.dayProjection.timelineItems[0].sourceId,
    end.dayProjection.timelineItems[0].sourceId,
  );
  assert.equal(
    start.dayProjection.timelineItems[0].segment.displayStartLocalTime,
    "20:00",
  );
  assert.equal(
    end.dayProjection.timelineItems[0].segment.displayEndLocalTime,
    "08:00",
  );
  const html = renderToStaticMarkup(
    React.createElement(CalendarGrid, { grid, onSelect: () => {} }),
  );
  assert.equal((html.match(/data-source="boundary"/g) ?? []).length, 2);
  assert.match(html, /data-from-previous="true"/);
  assert.match(html, /data-into-next="true"/);
  assert.equal(
    calculateMonthWorkSummary({
      referenceDateInMonth: "2026-11-01",
      displayZone: UI_ZONE,
      events: [event],
      dayOffAnnotations: [],
    }).intersectingShiftCount,
    1,
  );
});
it("Stage 3: overriding one generated instance preserves all other cycle records", async () => {
  const repos = new PlanuiRepositories(new InMemoryTransactionalEngine());
  await repos.getOrInitSettings(UI_CLOCK);
  await repos.saveShiftTemplate(tpl);
  const preview = generateFinitePeriodRosterPreview({
    startDate: "2026-11-01",
    endDate: "2026-11-08",
    cycleTemplateSequence: [tpl, tpl, null, null],
    selectedWeekdaysMondayFirst: [0, 1, 2, 3, 4, 5, 6],
    action: { kind: "template_shift", template: tpl },
    lockedZoneId: UI_ZONE,
    existingEvents: [],
    existingReservations: [],
    existingDayOffAnnotations: [],
    nowIso: UI_CLOCK,
  });
  await repos.applyRosterBatchTransactionally({
    eventsToSave: preview.eventsToSave,
    dayOffAnnotationsToSave: preview.dayOffAnnotationsToSave,
    eventIdsToDelete: [],
    dayOffAnnotationIdsToDelete: [],
  });
  const before = (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot;
  const target = before.events[0];
  await repos.rescheduleCalendarEventTransactionally(
    target.id,
    {
      kind: "timed",
      interval: sessionFromDuration("2026-11-01", "19:00", 720, UI_ZONE),
    },
    UI_CLOCK,
    target.revision,
  );
  const after = (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot;
  assert.deepEqual(
    after.events.filter((e) => e.id !== target.id),
    before.events.filter((e) => e.id !== target.id),
  );
  assert.deepEqual(after.dayOffAnnotations, before.dayOffAnnotations);
});
it("Stage 3: collision guard detects shift and recovery overlaps; moving a session retains its deadline", async () => {
  const engine = new InMemoryTransactionalEngine();
  const { snapshot } = await seedUiFixture(engine);
  const repos = new PlanuiRepositories(engine);
  const shift = instantiateWorkShiftFromTemplate({
    id: "guard",
    template: tpl,
    startLocalDate: "2026-11-20",
    zoneId: UI_ZONE,
    nowIso: UI_CLOCK,
  }).event;
  const recovery: CalendarEvent = {
    ...shift,
    id: "sleep-guard",
    title: "Сон",
    type: "sleep",
    schedule: {
      kind: "timed",
      interval: sessionFromDuration("2026-11-21", "09:00", 120, UI_ZONE),
    },
  };
  for (const [date, time] of [
    ["2026-11-20", "21:00"],
    ["2026-11-21", "09:30"],
  ]) {
    const candidate = sessionFromDuration(date, time, 30, UI_ZONE);
    assert.equal(
      detectScheduleConflicts({
        candidateStartInstant: candidate.startInstant,
        candidateEndInstant: candidate.endInstant,
        displayZone: UI_ZONE,
        events: [shift, recovery],
        tasks: [],
        reservations: [],
      }).hasConflicts,
      true,
    );
  }
  const task = snapshot.tasks.find((t) => t.deadline)!;
  const id = "moving-session";
  await repos.saveReservationTransactionally({
    id,
    taskId: task.id,
    interval: sessionFromDuration("2026-11-20", "15:00", 30, UI_ZONE),
    state: "active",
    releaseMetadata: null,
    createdAt: UI_CLOCK,
    updatedAt: UI_CLOCK,
    revision: 1,
  });
  await repos.rescheduleReservationTransactionally(
    id,
    sessionFromDuration("2026-11-22", "15:00", 30, UI_ZONE),
    UI_CLOCK,
    1,
  );
  assert.deepEqual(
    (await repos.captureCoherentSnapshot(UI_CLOCK)).snapshot.tasks.find(
      (t) => t.id === task.id,
    )?.deadline,
    task.deadline,
  );
});
it("Stage 3: shared day projection retains DST day lengths", () => {
  const project = (date: string) =>
    projectScheduleForDate({
      localDate: date,
      displayZone: "Europe/Kyiv",
      events: [],
      reservations: [],
      tasks: [],
      dayOffAnnotations: [],
    }).dayDurationMinutes;
  assert.equal(project("2026-03-29"), 1380);
  assert.equal(project("2026-10-25"), 1500);
});
