/** Presentation only. Local dates are calendar dates, never implicitly device-zone instants. */
export const UI_LOCALE = 'uk-UA';
function localDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? date : null;
}
export function sentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase(UI_LOCALE);
  return lower.charAt(0).toLocaleUpperCase(UI_LOCALE) + lower.slice(1);
}
export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const date = localDate(value);
  return date ? new Intl.DateTimeFormat(UI_LOCALE, { ...options, timeZone: 'UTC' }).format(date).toLocaleLowerCase(UI_LOCALE) : '—';
}
export const formatSubtitle = (value: string) => sentenceCase(formatDate(value));
export const formatShortDate = (value: string) => formatDate(value, { weekday: 'short', day: 'numeric', month: 'long' });
export const formatDayMonth = (value: string) => formatDate(value, { day: 'numeric', month: 'long' });
export const formatMonthYear = (value: string) => formatDate(value, { month: 'long', year: 'numeric' });
export function formatDateRange(start: string, end: string, includeYear = false): string {
  const a = localDate(start); const b = localDate(end);
  if (!a || !b) return '—';
  if (start.slice(0, 7) === end.slice(0, 7)) return `${a.getUTCDate()}-${formatDate(end, { day: 'numeric', month: 'long', ...(includeYear ? { year: 'numeric' } : {}) })}`;
  return `${formatDate(start, { day: 'numeric', month: 'long', ...(start.slice(0,4) !== end.slice(0,4) ? {year:'numeric'} : {}) })} – ${formatDate(end, { day: 'numeric', month: 'long', ...(includeYear || start.slice(0,4) !== end.slice(0,4) ? {year:'numeric'} : {}) })}`;
}
export function formatInstant(value: string | number | Date, zone: string, options: Intl.DateTimeFormatOptions = {day:'numeric',month:'long',year:'numeric'}): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(+date)) return '—';
  return new Intl.DateTimeFormat(UI_LOCALE, {...options,timeZone:zone}).format(date).toLocaleLowerCase(UI_LOCALE);
}
export function formatTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match || +match[1] > 24 || +match[2] > 59 || (+match[1] === 24 && +match[2] !== 0)) return '—';
  return `${match[1].padStart(2,'0')}:${match[2]}`;
}
export function formatTimeRange(start: string, end: string, overnight = false): string {
  if (overnight) {
    return `${formatTime(start)} → ${formatTime(end)}`;
  }
  return `${formatTime(start)}–${formatTime(end)}`;
}
export function formatSegmentTimeRange(
  segment: {
    displayStartLocalTime: string;
    displayEndLocalTime: string;
    continuesBeforeDayStart?: boolean;
    continuesAfterDayEnd?: boolean;
  },
  originInterval?: {
    originStartLocalTime?: string;
    originEndLocalTime?: string;
    overnight?: boolean;
  } | null
): string {
  if (segment.continuesBeforeDayStart) {
    const realEnd = originInterval?.originEndLocalTime || segment.displayEndLocalTime;
    return `до ${formatTime(realEnd)}`;
  }
  if (segment.continuesAfterDayEnd || originInterval?.overnight) {
    const realStart = originInterval?.originStartLocalTime || segment.displayStartLocalTime;
    const realEnd = originInterval?.originEndLocalTime || segment.displayEndLocalTime;
    return `${formatTime(realStart)} → ${formatTime(realEnd)}`;
  }
  return `${formatTime(segment.displayStartLocalTime)}–${formatTime(segment.displayEndLocalTime)}`;
}
export function formatNumberUk(value: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat(UI_LOCALE, { maximumFractionDigits: maxFractionDigits }).format(value);
}
export function formatDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return '—';
  const minutes = Math.max(0, Math.round(totalMinutes)); const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return [hours ? `${hours} год` : '', rest || !hours ? `${rest} хв` : ''].filter(Boolean).join(' ');
}

