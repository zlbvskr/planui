import { addDaysToLocalDate, assertValidLocalDate } from './temporal';

export interface SmartParseResult {
  date?: string;
  time?: string;
  durationMinutes?: number;
  title: string;
  label: string;
}
const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const weekdays = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', 'п’ятницю', 'суботу'];
const token = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}_:])(?:${pattern})(?![\\p{L}\\p{N}_:])`, 'giu');
const dateString = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const validDate = (date: string) => { try { assertValidLocalDate(date); return true; } catch { return false; } };

/** Pure, conservative Ukrainian parser. Caller supplies the local day in the active zone.
 * Multiple dates/times/durations are ambiguous and yield no suggestion. No state is mutated.
 */
export function smartParse(text: string, today: string): SmartParseResult | null {
  assertValidLocalDate(today);
  const normalized = text.toLocaleLowerCase('uk').replace(/['ʼ]/g, '’');
  const spans: { start: number; end: number }[] = [];
  const result: SmartParseResult = { title: text, label: '' };
  const labels: string[] = [];
  const dateMatches = [...normalized.matchAll(token(`сьогодні|післязавтра|завтра|через +[0-9]+ +(?:дні|днів|день)|(?:у|в) +(?:${weekdays.join('|')})|[0-9]{1,2} +(?:${months.join('|')})(?: +[0-9]{4})?`))];
  const timeMatches = [...normalized.matchAll(token('(?:о +)?[0-9]{1,2}:[0-9]{2}'))];
  const durationMatches = [...normalized.matchAll(token('півгодини|[0-9]+ +(?:години|годину|годин|год|хвилини|хвилину|хвилин|хв)(?:\\.)?'))];
  if ([dateMatches, timeMatches, durationMatches].some(matches => matches.length > 1)) return null;
  const remember = (match: RegExpMatchArray) => spans.push({ start: match.index!, end: match.index! + match[0].length });
  const date = dateMatches[0];
  if (date) {
    const phrase = date[0];
    if (['сьогодні', 'завтра', 'післязавтра'].includes(phrase)) result.date = addDaysToLocalDate(today, ['сьогодні', 'завтра', 'післязавтра'].indexOf(phrase));
    else if (phrase.startsWith('через')) {
      const days = Number(phrase.match(/[0-9]+/)![0]);
      if (days < 1 || days > 3650) return null;
      result.date = addDaysToLocalDate(today, days);
    } else if (/^(у|в) /.test(phrase)) {
      const target = weekdays.indexOf(phrase.replace(/^(у|в) +/, ''));
      const current = new Date(`${today}T12:00:00Z`).getUTCDay();
      result.date = addDaysToLocalDate(today, (target - current + 7) % 7 || 7);
    } else {
      const [day, month, year] = phrase.split(/ +/);
      const monthNumber = months.indexOf(month) + 1;
      let y = Number(year || today.slice(0, 4));
      let value = dateString(y, monthNumber, Number(day));
      if (!year) {
        // Search forward for Feb 29 as well as ordinary dates, at most one leap cycle.
        while ((!validDate(value) || value < today) && y < Number(today.slice(0, 4)) + 4) value = dateString(++y, monthNumber, Number(day));
      }
      if (!validDate(value)) return null;
      result.date = value;
    }
    labels.push(phrase); remember(date);
  }
  const time = timeMatches[0];
  if (time) {
    const [hours, minutes] = time[0].replace(/^о +/, '').split(':').map(Number);
    if (hours > 23 || minutes > 59) return null;
    result.time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    labels.push(result.time); remember(time);
  }
  const duration = durationMatches[0];
  if (duration) {
    const value = duration[0] === 'півгодини' ? 30 : Number(duration[0].match(/[0-9]+/)![0]) * (duration[0].includes('год') ? 60 : 1);
    if (value < 5 || value > 1440) return null;
    result.durationMinutes = value;
    labels.push(`${value} хв`); remember(duration);
  }
  if (!spans.length) return null;
  let title = text;
  for (const span of spans.sort((a, b) => b.start - a.start)) title = title.slice(0, span.start) + title.slice(span.end);
  result.title = title.replace(/\s+/g, ' ').replace(/^[\s,;·]+|[\s,;·]+$/g, '').trim();
  if (!result.title) return null;
  result.label = labels.join(' · ');
  return result;
}
