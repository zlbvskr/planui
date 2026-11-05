import { Pill } from '../components/ui/design';
import React, { useState } from 'react';
import { PlanuiSettings, RoadmapLayer } from '../domain/types';
import { RoadmapSource, projectRoadmap, roadmapMarkers, dateLabelUk, RoadmapItem } from '../domain/roadmap';
import { addDaysToLocalDate } from '../domain/temporal';
import { PlanuiRepositories } from '../storage/repositories';
import { Button, Card, SelectField } from '../components/ui/primitives';
import { RoadmapItemEditor } from './RoadmapView';

export function RoadmapCalendarLayer({ source, settings, repositories, startDate, endDateExclusive, selectedDate, onChanged, controlsOnly = false }: { source: RoadmapSource; settings: PlanuiSettings; repositories: PlanuiRepositories; startDate: string; endDateExclusive: string; selectedDate: string; onChanged: () => Promise<void> | void; controlsOnly?: boolean }) {
  const [editing, setEditing] = useState<RoadmapItem | null>(null);
  const [error, setError] = useState('');
  const layer = settings.roadmapLayer ?? 'hidden';
  const items = projectRoadmap(source);
  const groups: { date: string; markers: ReturnType<typeof roadmapMarkers> }[] = [];
  for (let date = startDate; date < endDateExclusive; date = addDaysToLocalDate(date, 1)) {
    const markers = roadmapMarkers(items, date, layer);
    if (markers.length) groups.push({ date, markers });
  }
  const selectedGroup = groups.find(group => group.date === selectedDate);
  const otherGroups = groups.filter(group => group.date !== selectedDate);
  const renderDay = ({ date, markers }: typeof groups[number]) => <div key={date} className="border-t py-2 space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
    <h4 className="font-semibold">{dateLabelUk(date)}</h4>
    <ul className="space-y-1">{markers.slice(0, 2).map(marker => <li key={marker.key}><button type="button" className="min-h-[44px] text-left break-words underline" onClick={() => setEditing(marker.item)}>◇ {marker.labelUk}</button></li>)}</ul>
    {markers.length > 2 && <details><summary className="min-h-[44px] cursor-pointer">Ще {markers.length - 2} позначок</summary><ul>{markers.slice(2).map(marker => <li key={marker.key}><button type="button" className="min-h-[44px] text-left break-words underline" onClick={() => setEditing(marker.item)}>◇ {marker.labelUk}</button></li>)}</ul></details>}
  </div>;
  if (controlsOnly) return <details className="calendar-layer-menu"><summary className="ui-pill">Плани{layer !== 'hidden' ? ' · увімкнено' : ''}</summary><div className="calendar-layer-options" role="group" aria-label="Плани в календарі">{([{value:'hidden',label:'Приховати'},{value:'key_dates',label:'Ключові дати'},{value:'periods',label:'Дати й періоди'}] as const).map(option => <Pill key={option.value} selected={layer === option.value} onClick={async () => { try { setError(''); await repositories.saveSettings({...settings,roadmapLayer:option.value},settings.revision); await onChanged(); } catch {setError('Не вдалося зберегти вигляд. Спробуйте знову.');} }}>{option.label}</Pill>)}{error && <p role="alert">{error}</p>}</div></details>;
  if (layer === 'hidden') return null;
  return <Card className="space-y-3" data-testid="calendar-roadmap-layer">
    <h3 className="font-semibold">Плани на ці дати</h3>
    {error && <p role="alert">{error}</p>}
    <>

      {groups.length === 0 && <p>На ці дати планів поки немає.</p>}
      {selectedGroup ? renderDay(selectedGroup) : groups.length > 0 && <p>На обрану дату позначок немає.</p>}
      {otherGroups.length > 0 && <details><summary className="min-h-[44px] cursor-pointer">Інші дати: {otherGroups.length}</summary>{otherGroups.map(renderDay)}</details>}
      {editing && <div className="border rounded-xl p-3"><RoadmapItemEditor key={`${editing.owner.kind}:${editing.owner.id}:${editing.record.revision}`} item={editing} relatedTasks={source.tasks} relatedItems={projectRoadmap(source, ['active', 'idea', 'paused', 'completed'])} repositories={repositories} onChanged={onChanged} onCancel={() => setEditing(null)} /></div>}
    </>
  </Card>;
}
