import { useState } from 'react';
import { Orb } from '../../ui/Orb';
import { ParameterChip } from '../../ui/parameters';
import { Pill } from '../../ui/selection';
import type { LifeAreaQuestion } from '../../domain/types';
import { areaIdentity } from '../../domain/modelHelpers';
import { ParamRow } from './ParamRow';
import { SpherePicker } from './SpherePicker';

type SuggestedArea = LifeAreaQuestion & { priority?: number; priorityReason?: string };
export function SphereField({ areas, value, onChange, onOpen, selected, inherited, expanded = false }: {
  areas: readonly SuggestedArea[]; value: string; onChange: (id: string) => void;
  onOpen?: () => void; selected?: boolean; inherited?: string; expanded?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const active = areas.filter(area => !area.archived && !area.mergedIntoId);
  const area = active.find(area => area.id === value);
  const suggestions = active.filter(a => a.priority != null).sort((a, b) => b.priority! - a.priority! || a.order - b.order).slice(0, 3);
  const open = () => onOpen ? onOpen() : setPickerOpen(v => !v);
  const choose = (id: string) => { if (!suggestions.some(a => a.id === id)) setDismissed(true); onChange(id); setPickerOpen(false); };
  return <ParamRow label="Сфера" className="create-sphere-field">
    {!expanded && <ParameterChip key={value || 'none'} icon={<Orb color={areaIdentity(area)} size={20} />} label={`${area?.focus ? '✦ ' : ''}${area?.questionTextUk ?? 'Обрати сферу'}`} value={area?.rating != null ? `${area.rating}/10` : null} selected={selected || pickerOpen} onClick={open} aria-expanded={selected || pickerOpen || false} data-testid="chip-area" />}
    {!expanded && <Pill onClick={open}>Усі</Pill>}
    {inherited && <small className="create-inherited">{inherited}</small>}
    {expanded || pickerOpen ? <SpherePicker areas={active} value={value} onChange={choose} /> : <>
      {!area && !dismissed && suggestions.length > 0 && <>
        <small className="create-inherited">Підтягни</small>
        <Pill onClick={() => setDismissed(true)}>Не зараз</Pill>
        <div className="create-sphere-suggestions">{suggestions.map(option => <Pill key={option.id} onClick={() => choose(option.id)} data-testid={`area-orb-option-${option.id}`}><Orb color={areaIdentity(option)} size={14} /><span>{option.focus && '✦ '}{option.questionTextUk}<small className="create-sphere-reason">{option.priorityReason}</small></span></Pill>)}</div>
      </>}
    </>}
  </ParamRow>;
}
