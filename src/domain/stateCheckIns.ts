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

/** CSV is a human-readable export, not a complete backup archive. */
export function exportSelectedRecordsCsv(records: readonly PersonalRecord[], ids: readonly string[]): string {
  const selected = new Set(ids);
  const cell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [['id','date','recorded_at','timezone','mood_1_5','energy_1_5','stress_1_5','sleep_minutes','sleep_quality_1_5','text','tags']];
  for (const r of records.filter(r => selected.has(r.id))) rows.push([r.id,r.localDate,r.recordedAt,r.zoneId,r.mood,r.energy,r.stress,r.sleepMinutes,r.sleepQuality,r.text,r.tags.join('; ')]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
export function downloadPersonalRecordsCsv(records: readonly PersonalRecord[], ids: readonly string[]): void {
  const url=URL.createObjectURL(new Blob([exportSelectedRecordsCsv(records,ids)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a'); link.href=url; link.download='planui-state-records.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function printPersonalRecords(records: readonly PersonalRecord[], ids: readonly string[]): boolean {
  const popup=window.open('', '_blank');
  if (!popup) return false;
  popup.opener=null;
  popup.document.title='PLANUI — Відмітки стану';
  const heading=popup.document.createElement('h1');heading.textContent=popup.document.title;popup.document.body.append(heading);
  const note=popup.document.createElement('p');note.textContent='Добровільні відповіді. Настрій, енергія, напруга та якість сну: шкала 1–5. Для PDF оберіть «Зберегти як PDF» у діалозі друку.';popup.document.body.append(note);
  const selected=new Set(ids);
  for (const record of records.filter(record=>selected.has(record.id))) {
    const section=popup.document.createElement('section');section.style.breakInside='avoid';
    const title=popup.document.createElement('h2');title.textContent=`${record.localDate} · ${record.zoneId}`;
    const content=popup.document.createElement('p');content.style.whiteSpace='pre-wrap';content.textContent=[`Час запису: ${record.recordedAt}`,`Настрій: ${record.mood ?? '—'}; Енергія: ${record.energy ?? '—'}; Напруга: ${record.stress ?? '—'}`,`Сон: ${record.sleepMinutes ?? '—'} хв; Якість сну: ${record.sleepQuality ?? '—'}`,record.text ?? '',record.tags.join(', ')].join('\n');section.append(title,content);popup.document.body.append(section);
  }
  popup.focus();popup.print();return true;
}
