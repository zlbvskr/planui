import {
  addDaysToLocalDate,
  getLocalDateBoundariesInZone,
} from "../../domain/temporal";
import type { UnoccupiedTimeGap } from "../../domain/scheduling";
export const HOUR_HEIGHT = 56;
export const minutePixels = (minutes: number) => (minutes * HOUR_HEIGHT) / 60;
export function dayHeight(date: string, zone: string) {
  const b = getLocalDateBoundariesInZone(date, zone);
  return minutePixels((b.endMs - b.startMs) / 60000);
}
export function dayOffset(origin: string, offset: number, zone: string) {
  const a = getLocalDateBoundariesInZone(origin, zone);
  const b = getLocalDateBoundariesInZone(
    addDaysToLocalDate(origin, offset),
    zone,
  );
  return minutePixels((b.startMs - a.startMs) / 60000);
}
/** Suggestions never include elapsed time, whole-day placeholders or recovery occupancy. */
export function futureGaps(
  gaps: readonly UnoccupiedTimeGap[],
  nowMs: number,
  minimum = 30,
) {
  return gaps
    .filter(
      (gap) =>
        !(gap.startLocalTime === "00:00" && gap.endLocalTime === "24:00"),
    )
    .map((gap) => {
      const startMs = Math.max(gap.startMs, Math.ceil(nowMs / 60000) * 60000);
      return {
        ...gap,
        startMs,
        durationMinutes: (gap.endMs - startMs) / 60000,
      };
    })
    .filter((g) => g.durationMinutes >= minimum && g.durationMinutes < 1440);
}
