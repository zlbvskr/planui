import { addDaysToLocalDate, formatInstantInZone } from "../../domain/temporal";

export const HOUR_H = 64;

export const DAY_H = 24 * HOUR_H;

export const WINDOW_RADIUS = 180;

export const CENTER_INDEX = WINDOW_RADIUS;

export const TOTAL_DAYS = 2 * WINDOW_RADIUS + 1;

export const TOTAL_SCROLL_H = TOTAL_DAYS * DAY_H;

export function diffDays(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso + "T12:00:00Z") - Date.parse(fromIso + "T12:00:00Z")) /
      86400000,
  );
}

export function dateAtIndex(anchorIso: string, index: number): string {
  return addDaysToLocalDate(anchorIso, index - CENTER_INDEX);
}

export function indexOfDate(anchorIso: string, targetIso: string): number {
  return CENTER_INDEX + diffDays(anchorIso, targetIso);
}

export const EMPTY: readonly never[] = [];

export const FIXED_HOURS = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: `${String(hour).padStart(2, "0")}:00`,
  topPx: hour * HOUR_H,
}));

export function parseWallClockMinutes(timeStr: string, isEnd = false): number {
  if (timeStr === "24:00") return 1440;
  const parts = timeStr.split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  const total =
    (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
  if (isEnd && total === 0) return 1440;
  return Math.max(0, Math.min(1440, total));
}

export function getNowWallClockInZone(
  nowMs: number,
  zone: string,
): {
  localDate: string;
  localTime: string;
  nowMinutes: number;
} {
  const formatted = formatInstantInZone(new Date(nowMs).toISOString(), zone);
  const nowMinutes = parseWallClockMinutes(formatted.localTime, false);
  return {
    localDate: formatted.localDate,
    localTime: formatted.localTime,
    nowMinutes,
  };
}
