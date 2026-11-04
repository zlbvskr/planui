import { OptionalSlider } from '../components/ui/OptionalSlider';
import React, { useState } from 'react';
import type { PersonalRecord, Scale1To5 } from '../domain/types';
import { STATE_SCALE_V1, isCheckIn, downloadPersonalRecordsCsv, printPersonalRecords, downloadPersonalRecords } from '../domain/stateCheckIns';
import type { PlanuiRepositories } from '../storage/repositories';
import { Button, Card, InputField, SelectField } from '../components/ui/primitives';
export function StateCheckInsView({ records, today, zone, enabled, repositories, onChanged }: { records: PersonalRecord[]; today: string; zone: string; enabled: boolean; repositories: PlanuiRepositories; onChanged: () => Promise<unknown> }) {
  const [archive, setArchive] = useState(false), [editing, setEditing] = useState<PersonalRecord | null>(null);
  const [date, setDate] = useState(today), [mood, setMood] = useState(''), [energy, setEnergy] = useState(''), [stress, setStress] = useState(''), [sleep, setSleep] = useState(''), [quality, setQuality] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState('');
  const reset = () => { setEditing(null); setMood(''); setEnergy(''); setStress(''); setSleep(''); setQuality(''); setDate(today); };
  const scale = (s: string) => s === '' ? null : Number(s) as Scale1To5;
  const options = (labels: Record<number, string>) => [{ value: '', label: 'Не вказано' }, ...Object.entries(labels).map(([value, label]) => ({value, label}))];
  const save = async (e: React.FormEvent) => { e.preventDefault(); setError(''); try {
    const now = new Date().toISOString();
    await repositories.savePersonalRecord({ ...(editing ?? { id: crypto.randomUUID(), recordedAt: now, zoneId: zone, text: null, tags: [], createdAt: now, revision: 1 }), localDate: date, mood: scale(mood), energy: scale(energy), stress: scale(stress), sleepMinutes: sleep === '' ? null : Number(sleep), sleepQuality: scale(quality), scaleVersion: 1, updatedAt: now }, editing?.revision);
    reset(); await onChanged();
  } catch { setError('Не вдалося зберегти відмітку. Перевірте значення та спробуйте ще раз.'); } };
  return <div className="space-y-4">
    <div className="planui-floating-header"><h2 className="font-semibold">Стан і відновлення</h2><p className="text-sm">Збіг змін стану й графіка не доводить причинного зв’язку. Застосунок не встановлює діагнозів.</p></div>
    <Button onClick={() => setArchive(!archive)}>{archive ? 'Історія стану' : 'Архів щоденника'}</Button>
    {error && <p role="alert">{error}</p>}
    {enabled && !archive && <Card title={editing ? 'Редагувати відмітку' : 'Коротка відмітка стану'} subtitle="Усі поля добровільні. Сон вказуєте лише ви. Шкали 1–5, версія 1."><form onSubmit={save} className="space-y-3">
      <InputField label="Дата" type="date" required value={date} onChange={e => setDate(e.target.value)} />
      <OptionalSlider label="Настрій" value={mood === '' ? null : Number(mood)} onChange={value => setMood(value === null ? '' : String(value))} />
      <OptionalSlider label="Енергія" value={energy === '' ? null : Number(energy)} onChange={value => setEnergy(value === null ? '' : String(value))} />
      <OptionalSlider label="Напруга (1 — спокій, 5 — сильна напруга)" value={stress === '' ? null : Number(stress)} onChange={value => setStress(value === null ? '' : String(value))} />
      <InputField label="Тривалість сну, хвилини (необов’язково)" type="number" min="0" max="1440" step="1" value={sleep} onChange={e => setSleep(e.target.value)} />
      <SelectField label="Суб’єктивна якість сну" value={quality} options={options(STATE_SCALE_V1.sleepQuality)} onChange={e => setQuality(e.target.value)} />
      <Button type="submit">Зберегти</Button>{editing && <Button onClick={reset}>Скасувати</Button>}
    </form></Card>}
    <p>{archive ? 'Історичні тексти збережено разом із початковими оцінками й часом.' : 'Відмітки відображають ваші відповіді, без висновків про причини або здоров’я.'}</p>
    <Button disabled={!selected.length} onClick={() => downloadPersonalRecords(records, selected)}>Експортувати вибрані записи (JSON)</Button>
    <Button disabled={!selected.length} onClick={() => downloadPersonalRecordsCsv(records, selected)}>Експортувати вибрані записи (CSV)</Button>
    <Button disabled={!selected.length} onClick={() => { if (!printPersonalRecords(records, selected)) setError('Дозвольте відкриття вікна друку для експорту PDF.'); }}>Друк / PDF вибраних записів</Button>
    {[...records].filter(r => archive ? Boolean(r.text) : isCheckIn(r)).sort((a,b) => b.localDate.localeCompare(a.localDate) || b.recordedAt.localeCompare(a.recordedAt)).map(r => <Card key={r.id} title={`${new Intl.DateTimeFormat('uk-UA', {timeZone: 'UTC', dateStyle: 'long'}).format(new Date(r.localDate))} · ${new Intl.DateTimeFormat('uk-UA', {timeZone: r.zoneId, timeStyle: 'short'}).format(new Date(r.recordedAt))}`}>
      <label><input type="checkbox" checked={selected.includes(r.id)} onChange={e => setSelected(e.target.checked ? [...selected,r.id] : selected.filter(id => id !== r.id))} /> Обрати для експорту</label>
      {r.text && <><p className="whitespace-pre-wrap">{r.text}</p><Button onClick={async () => { try { await navigator.clipboard.writeText(r.text!); } catch { setError('Копіювання недоступне. Виділіть текст вручну.'); } }}>Копіювати текст</Button></>}
      <p>{[['Настрій',r.mood],['Енергія',r.energy],['Напруга',r.stress],['Сон, хв',r.sleepMinutes],['Якість сну',r.sleepQuality]].filter(([,v]) => v != null).map(([k,v]) => `${k}: ${v}`).join(' · ')}</p>
      {!archive && <Button onClick={() => { setEditing(r); setDate(r.localDate); setMood(r.mood == null ? '' : String(r.mood)); setEnergy(r.energy == null ? '' : String(r.energy)); setStress(r.stress == null ? '' : String(r.stress)); setSleep(r.sleepMinutes == null ? '' : String(r.sleepMinutes)); setQuality(r.sleepQuality == null ? '' : String(r.sleepQuality)); }}>Редагувати</Button>}
      <Button onClick={async () => { if (!window.confirm('Остаточно видалити цей запис разом із текстом та оцінками?')) return; try { await repositories.deletePersonalRecordTransactionally(r.id); if (editing?.id === r.id) reset(); await onChanged(); } catch { setError('Не вдалося видалити запис. Оновіть дані та повторіть.'); } }}>Видалити</Button>
    </Card>)}
  </div>;
}
