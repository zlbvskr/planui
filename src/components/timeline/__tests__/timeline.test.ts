import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectScheduleForDate } from "../../../domain/scheduling";
import { createUiFixture } from "../../../test/ui-fixture";
import { dayHeight, dayOffset, futureGaps } from "../viewport";
import { formatShortDate } from "../../../lib/format";

const zone = "Europe/Kyiv";
const snapshot = createUiFixture().snapshot;
const project = (date: string) =>
  projectScheduleForDate({ localDate: date, displayZone: zone, ...snapshot });
describe("continuous timeline presentation", () => {
  it("queries overnight records by overlap, retaining a single source across flat split edges", () => {
    const a = project("2026-11-06").timelineItems.find(
      (i) => i.sourceId === "night-6",
    )!;
    const b = project("2026-11-07").timelineItems.find(
      (i) => i.sourceId === "night-6",
    )!;
    assert.ok(a.segment.continuesAfterDayEnd);
    assert.ok(b.segment.continuesBeforeDayStart);
    assert.equal(a.sourceId, b.sourceId);
    assert.equal(
      a.segment.elapsedDurationMinutes + b.segment.elapsedDurationMinutes,
      720,
    );
    assert.equal(snapshot.events.filter((e) => e.id === a.sourceId).length, 1);
  });
  it("uses elapsed zoned geometry and local labels on both DST boundaries", () => {
    assert.equal(dayHeight("2026-03-29", zone), 23 * 56);
    assert.equal(dayHeight("2026-10-25", zone), 25 * 56);
    assert.equal(dayOffset("2026-03-29", 1, zone), 23 * 56);
    assert.equal(dayOffset("2026-10-25", 1, zone), 25 * 56);
    assert.match(formatShortDate("2026-03-29"), /29 березня/);
    assert.match(formatShortDate("2026-10-25"), /25 жовтня/);
  });
  it("only suggests future gaps of at least 30 minutes outside blocking sleep and shifts", () => {
    const p = project("2026-11-05");
    const now = Date.parse("2026-11-05T13:45:00Z");
    const gaps = futureGaps(p.availability.unoccupiedGaps, now);
    assert.ok(gaps.length);
    assert.ok(
      gaps.every(
        (g) =>
          g.startMs >= now &&
          g.durationMinutes >= 30 &&
          g.durationMinutes < 1440,
      ),
    );
    const sleep = snapshot.events.find((e) => e.type === "sleep")!;
    if (sleep.schedule.kind === "timed") {
      const { startInstant, endInstant } = sleep.schedule.interval;
      assert.ok(
        gaps.every(
          (g) =>
            g.startMs >= Date.parse(endInstant) ||
            g.endMs <= Date.parse(startInstant),
        ),
      );
    }
    assert.deepEqual(
      futureGaps(
        p.availability.unoccupiedGaps,
        Date.parse(p.availability.windowEndInstant),
      ),
      [],
    );
  });
});
