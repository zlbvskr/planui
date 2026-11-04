import type { PersonalRecord } from './types';
import { MOOD_SCALE_LABELS_UK, ENERGY_SCALE_LABELS_UK, STRESS_SCALE_LABELS_UK } from './personalSpace';
export const STATE_SCALE_V1 = { version: 1, mood: MOOD_SCALE_LABELS_UK, energy: ENERGY_SCALE_LABELS_UK, stress: STRESS_SCALE_LABELS_UK, sleepQuality: { 1: 'Дуже погана', 2: 'Погана', 3: 'Посередня', 4: 'Добра', 5: 'Дуже добра' } } as const;
export function isCheckIn(r: PersonalRecord): boolean {
  return r.scaleVersion === 1 || r.mood != null || r.energy != null || r.stress != null || r.sleepMinutes != null || r.sleepQuality != null;
}
export function exportSelectedRecords(records: readonly PersonalRecord[], ids: readonly string[]): string {
  const selected = new Set(ids);
  return JSON.stringify({ format: 'planui-personal-records', version: 1, scales: STATE_SCALE_V1, legacyScaleVersion: 1, records: records.filter(r => selected.has(r.id)) }, null, 2);
}
export function downloadPersonalRecords(records: readonly PersonalRecord[], ids: readonly string[]) {
  const url = URL.createObjectURL(new Blob([exportSelectedRecords(records, ids)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'planui-personal-records.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
