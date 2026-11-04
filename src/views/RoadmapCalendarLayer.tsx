import React, { useState } from 'react';
import { PlanuiSettings, RoadmapLayer } from '../domain/types';
import { RoadmapSource, projectRoadmap, roadmapMarkers, dateLabelUk, RoadmapItem } from '../domain/roadmap';
import { addDaysToLocalDate } from '../domain/temporal';
import { PlanuiRepositories } from '../storage/repositories';
import { Button, Card, SelectField } from '../components/ui/primitives';
import { RoadmapItemEditor } from './RoadmapView';

export function RoadmapCalendarLayer({ source, settings, repositories, startDate, endDateExclusive, selectedDate, onChanged }: { source: RoadmapSource; settings: PlanuiSettings; repositories: PlanuiRepositories; startDate: string; endDateExclusive: string; selectedDate: string; onChanged: () => Promise<void> | void }) {
  const [editing, setEditing] = useState<RoadmapItem | null>(null);
  const [error, setError] = useState('');
  const layer = settings.roadmapLayer ?? 'hidden';
  const items = projectRoadmap(source);
  const groups = [];
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
  return <Card className="space-y-3" data-testid="calendar-roadmap-layer">
    <h3 className="font-semibold">Дорожня карта</h3>
    <SelectField label="Інформаційний шар календаря" value={layer} options={[{ value: 'hidden', label: 'Приховано' }, { value: 'key_dates', label: 'Лише ключові дати' }, { value: 'periods', label: 'Ключові дати та періоди етапів і проєктів' }]} onChange={async e => { try { setError(''); await repositories.saveSettings({ ...settings, roadmapLayer: e.target.value as RoadmapLayer }, settings.revision); await onChanged(); } catch { setError('Не вдалося зберегти вигляд. Оновіть дані та спробуйте знову.'); } }} />
    {error && <p role="alert">{error}</p>}
    {layer !== 'hidden' && <>
      <p className="text-sm">Активні плани за видимий період. Інформаційні позначки не займають час. Плани без дат доступні в «Напрями → Дорожня карта».</p>
      {groups.length === 0 && <p>Немає ключових дат або періодів.</p>}
      {selectedGroup ? renderDay(selectedGroup) : groups.length > 0 && <p>На обрану дату позначок немає.</p>}
      {otherGroups.length > 0 && <details><summary className="min-h-[44px] cursor-pointer">Інші дати: {otherGroups.length}</summary>{otherGroups.map(renderDay)}</details>}
      {editing && <div className="border rounded-xl p-3"><RoadmapItemEditor key={`${editing.owner.kind}:${editing.owner.id}:${editing.record.revision}`} item={editing} relatedTasks={source.tasks} relatedItems={projectRoadmap(source, ['active', 'idea', 'paused', 'completed'])} repositories={repositories} onChanged={onChanged} onCancel={() => setEditing(null)} /></div>}
    </>}
  </Card>;
}
