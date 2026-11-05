import {Section, Row, Slider, DateField, DurationField, Sheet, Toggle, Disclosure, ActionMenu, InfoSheet} from '../ui';
import { formatDate, formatInstant } from '../lib/format';
import { StateHistoryChart } from '../components/today/StateHistoryChart';
import type { CalendarEvent } from '../domain/types';
import { OptionalSlider } from '../components/ui/OptionalSlider';
import React, { useState } from 'react';
import type { PersonalRecord, Scale1To5 } from '../domain/types';
import { STATE_SCALE_V1, isCheckIn, downloadPersonalRecordsCsv, printPersonalRecords, downloadPersonalRecords } from '../domain/stateCheckIns';
import type { PlanuiRepositories } from '../storage/repositories';
import { Button, Card, InputField, SelectField } from '../components/ui/primitives';
export function StateCheckInsView({ records, events = [], today, zone, enabled, repositories, onChanged }: { records: PersonalRecord[]; events?: CalendarEvent[]; today: string; zone: string; enabled: boolean; repositories: PlanuiRepositories; onChanged: () => Promise<unknown> }) {
  const [archive, setArchive] = useState(false), [editing, setEditing] = useState<PersonalRecord | null>(null);
  const [date, setDate] = useState(today), [mood, setMood] = useState(''), [energy, setEnergy] = useState(''), [stress, setStress] = useState(''), [sleep, setSleep] = useState(''), [quality, setQuality] = useState('');
  const [sleepOpen,setSleepOpen]=useState(false), [exportOpen,setExportOpen]=useState(false);
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState('');
  const reset = () => { setEditing(null); setMood(''); setEnergy(''); setStress(''); setSleep(''); setQuality(''); setDate(today); };
  const scale = (s: string) => s === '' ? null : Number(s) as Scale1To5;
  const options = (labels: Record<number, string>) => [{ value: '', label: 'Не вказано' }, ...Object.entries(labels).map(([value, label]) => ({value, label}))];
  const save = async (e: React.FormEvent) => { e.preventDefault(); setError(''); try {
    const now = new Date().toISOString();
    await repositories.savePersonalRecord({ ...(editing ?? { id: crypto.randomUUID(), recordedAt: now, zoneId: zone, text: null, tags: [], createdAt: now, revision: 1 }), localDate: date, mood: scale(mood), energy: scale(energy), stress: scale(stress), sleepMinutes: sleep === '' ? null : Number(sleep), sleepQuality: scale(quality), scaleVersion: 1, updatedAt: now }, editing?.revision);
    reset(); await onChanged();
  } catch { setError('Не вдалося зберегти відмітку. Перевірте значення та спробуйте ще раз.'); } };
  return <div className="state-checkins space-y-4">
    <div className="hidden"><h2 className="font-semibold">Стан і відновлення</h2><p className="text-sm">Збіг змін стану й графіка не доводить причинного зв’язку. Застосунок не встановлює діагнозів.</p></div>
    <div className="flex justify-end"><ActionMenu label="Дії стану" items={[{label:'Добровільний експорт для фахівця PDF/CSV',onSelect:()=>setExportOpen(true)},{label:'Архів щоденника',onSelect:()=>setArchive(true)}]}/></div>
    {error && <p role="alert">{error}</p>}
    {enabled && !archive && <form onSubmit={save} className="space-y-4"><Section title="Як зараз">
      <DateField label={date===today?'Сьогодні':'Дата'} value={date} onChange={e=>setDate(e.target.value)}/>
      {([['Настрій',mood,setMood,'Низький','Високий'],['Енергія',energy,setEnergy,'Мало','Багато'],['Напруга',stress,setStress,'Спокій','Сильна']] as const).map(([label,value,setter,low,high])=><div className="state-slider-row" key={label}><Slider label={label} min={1} max={5} value={value===''?null:Number(value)} onChange={v=>setter(v==null?'':String(v))}/><div className="flex justify-between text-xs" style={{color:'var(--text-secondary)'}}><span>{low}</span><span>{high}</span></div></div>)}
      <Disclosure title="Сон" onClick={()=>setSleepOpen(true)}/>{editing?.text&&<Row title="Нотатка" secondary={editing.text}/>}
    </Section><button type="submit" className="ui-primary w-full">Зберегти</button>{editing&&<ActionMenu items={[{label:'Скинути редагування',onSelect:reset}]}/>}</form>}
    <Sheet isOpen={sleepOpen} title="Сон" onClose={()=>setSleepOpen(false)}><DurationField label="Тривалість сну" value={sleep===''?null:Number(sleep)} onChange={v=>setSleep(v==null?'':String(v))}/><Slider label="Якість сну" min={1} max={5} value={quality===''?null:Number(quality)} onChange={v=>setQuality(v==null?'':String(v))}/><button className="ui-primary" onClick={()=>setSleepOpen(false)}>Готово</button></Sheet>
    <Sheet isOpen={exportOpen} title="Добровільний експорт для фахівця" onClose={()=>setExportOpen(false)}><Section>{records.map(r=><Row key={r.id} title={formatDate(r.localDate)} trailing={<Toggle label={`Обрати ${formatDate(r.localDate)}`} checked={selected.includes(r.id)} onChange={v=>setSelected(v?[...selected,r.id]:selected.filter(id=>id!==r.id))}/>}/>)}</Section><Disclosure title="CSV" onClick={()=>downloadPersonalRecordsCsv(records,selected)}/><Disclosure title="PDF" onClick={()=>{if(!printPersonalRecords(records,selected))setError('Дозвольте вікно друку для PDF.');}}/><Disclosure title="JSON" onClick={()=>downloadPersonalRecords(records,selected)}/></Sheet>
    {!archive&&<Section title="Історія"><StateHistoryChart today={today} records={records} events={events} zone={zone}/><div className="flex items-center gap-2 px-4"><small>Збіг не доводить причинного зв’язку</small><InfoSheet title="Про відмітки стану">Відмітки добровільні. Застосунок не встановлює діагнозів і не замінює професійну допомогу. Збіг із графіком не доводить причинного зв’язку.</InfoSheet></div></Section>}
    <Section><Disclosure title={archive?'Історія стану':'Архів щоденника'} onClick={()=>setArchive(!archive)}/></Section>
    {[...records].filter(r => archive ? Boolean(r.text) : isCheckIn(r)).sort((a,b) => b.localDate.localeCompare(a.localDate) || b.recordedAt.localeCompare(a.recordedAt)).map(r => <Card key={r.id} title={`${formatDate(r.localDate,{dateStyle:'long'})} · ${formatInstant(r.recordedAt,r.zoneId,{timeStyle:'short'})}`}>

      {r.text && <><p className="whitespace-pre-wrap">{r.text}</p><Button onClick={async () => { try { await navigator.clipboard.writeText(r.text!); } catch { setError('Копіювання недоступне. Виділіть текст вручну.'); } }}>Копіювати текст</Button></>}
      <p>{[['Настрій',r.mood],['Енергія',r.energy],['Напруга',r.stress],['Сон, хв',r.sleepMinutes],['Якість сну',r.sleepQuality]].filter(([,v]) => v != null).map(([k,v]) => `${k}: ${v}`).join(' · ')}</p>
      {!archive && <Button onClick={() => { setEditing(r); setDate(r.localDate); setMood(r.mood == null ? '' : String(r.mood)); setEnergy(r.energy == null ? '' : String(r.energy)); setStress(r.stress == null ? '' : String(r.stress)); setSleep(r.sleepMinutes == null ? '' : String(r.sleepMinutes)); setQuality(r.sleepQuality == null ? '' : String(r.sleepQuality)); }}>Редагувати</Button>}
      <Button onClick={async () => { if (!window.confirm('Остаточно видалити цей запис разом із текстом та оцінками?')) return; try { await repositories.deletePersonalRecordTransactionally(r.id); if (editing?.id === r.id) reset(); await onChanged(); } catch { setError('Не вдалося видалити запис. Оновіть дані та повторіть.'); } }}>Видалити</Button>
    </Card>)}
  </div>;
}
