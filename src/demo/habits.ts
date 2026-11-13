import { Habit, HabitEntry } from '../domain/types';
import { atDate, DEMO_AREA_KEYS, DEMO_PREFIX } from './common';
import { DEMO_FOLDERS } from './folders';

export const DEMO_HABIT_IDS = {
  stretching: `${DEMO_PREFIX}habit-stretching`,
  reading: `${DEMO_PREFIX}habit-reading`,
  walking: `${DEMO_PREFIX}habit-walking`,
  water: `${DEMO_PREFIX}habit-water`,
  englishWords: `${DEMO_PREFIX}habit-english-words`,
  callLovedOnes: `${DEMO_PREFIX}habit-call-loved-ones`,
  meditation: `${DEMO_PREFIX}habit-meditation`,
} as const;

export function buildDemoHabits(
  baseToday: string,
  nowIso: string
): { habits: Habit[]; habitEntries: HabitEntry[] } {
  const d0 = atDate(0, baseToday);
  const dm2 = atDate(-2, baseToday);
  const dm3 = atDate(-3, baseToday);
  const dm4 = atDate(-4, baseToday);
  const dm5 = atDate(-5, baseToday);
  const dm6 = atDate(-6, baseToday);

  const h = (id: string, name: string, desc: string, icon: string, cue: string, minV: string | null, folderId: string | null, areaId: string, rule: Habit['ruleRevisions'][0]['rule'], target: Habit['ruleRevisions'][0]['target'], extra: Partial<Habit> = {}): Habit => ({
    id, name, description: desc, icon, contextCueUk: cue, minimumVersionUk: minV, reminderIntentionUk: null,
    folderId, lifeAreaId: areaId, areaId, projectId: null, state: extra.state ?? 'active', measure: extra.measure ?? null,
    ruleRevisions: [{ id: `${id}-rev`, effectiveFromLocalDate: dm6, rule, target, createdAt: nowIso }],
    isDemo: true, createdAt: nowIso, updatedAt: nowIso, revision: 1,
  });

  const habits: Habit[] = [
    h(DEMO_HABIT_IDS.stretching, 'Розтяжка', 'М’яка розминка на все тіло', 'sparkles', 'Після пробудження', '3 рухи', DEMO_FOLDERS.habitMorning, DEMO_AREA_KEYS.health, { kind: 'daily' }, { kind: 'binary' }),
    h(DEMO_HABIT_IDS.reading, 'Читання', 'Книга з психології', 'book', 'Ввечері перед сном', '2 сторінки', null, DEMO_AREA_KEYS.learning, { kind: 'weekly_frequency', timesPerWeek: 3 }, { kind: 'numeric', targetValue: 15, unitUk: 'стор.' }, { measure: { unit: 'стор.', target: 300, current: 120, log: [{ ts: nowIso, delta: 15 }] } }),
    h(DEMO_HABIT_IDS.walking, 'Прогулянка', 'Прогулянка без навушників', 'heart', 'У вихідні від роботи', '10 хв', null, DEMO_AREA_KEYS.recovery, { kind: 'days_off' }, { kind: 'binary' }),
    h(DEMO_HABIT_IDS.water, 'Вода', 'Підтримка водного балансу', 'sparkles', 'Впродовж дня', null, DEMO_FOLDERS.habitMorning, DEMO_AREA_KEYS.health, { kind: 'daily' }, { kind: 'numeric', targetValue: 8, unitUk: 'склянок' }, { measure: { unit: 'склянок', target: 8, current: 5, log: [{ ts: nowIso, delta: 5 }] } }),
    h(DEMO_HABIT_IDS.englishWords, 'Англійські слова', 'Повторення 10 слів', 'book', 'В дорозі або після обіду', '3 слова', null, DEMO_AREA_KEYS.learning, { kind: 'daily' }, { kind: 'numeric', targetValue: 10, unitUk: 'слів' }),
    h(DEMO_HABIT_IDS.callLovedOnes, 'Дзвінок близьким', 'Тепла розмова з рідними', 'heart', 'У вихідний вечір', null, DEMO_FOLDERS.habitEvening, DEMO_AREA_KEYS.relationships, { kind: 'weekly_frequency', timesPerWeek: 2 }, { kind: 'binary' }),
    h(DEMO_HABIT_IDS.meditation, 'Медитація', '5 хвилин усвідомленого дихання', 'lotus', 'Після пробудження', '1 хвилина', null, DEMO_AREA_KEYS.mental, { kind: 'daily' }, { kind: 'binary' }, { state: 'paused' }),
  ];

  const e = (id: string, habitId: string, localDate: string, status: HabitEntry['status'], num: number | null, minCompleted?: string): HabitEntry =>
    ({ id: `${DEMO_PREFIX}entry-${id}-${localDate}`, habitId, localDate, status, numericValue: num, minimumCompletedUk: minCompleted ?? null, note: null, isDemo: true, recordedAt: nowIso, updatedAt: nowIso, revision: 1 });

  const habitEntries: HabitEntry[] = [
    e('stretch', DEMO_HABIT_IDS.stretching, dm6, 'completed', 1),
    e('stretch', DEMO_HABIT_IDS.stretching, dm5, 'completed', 1),
    e('stretch', DEMO_HABIT_IDS.stretching, dm4, 'partial', 0.5, '3 рухи'),
    e('stretch', DEMO_HABIT_IDS.stretching, dm3, 'completed', 1),
    e('stretch', DEMO_HABIT_IDS.stretching, dm2, 'completed', 1),
    e('reading', DEMO_HABIT_IDS.reading, dm5, 'completed', 15),
    e('reading', DEMO_HABIT_IDS.reading, dm3, 'completed', 15),
    e('reading', DEMO_HABIT_IDS.reading, dm2, 'completed', 15),
    e('water', DEMO_HABIT_IDS.water, d0, 'partial', 5),
  ];

  return { habits, habitEntries };
}
