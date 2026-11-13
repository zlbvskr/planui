import type { ReactNode } from 'react';
import { ParameterChip } from '../../ui/parameters';
import { Pill } from '../../ui/selection';
import { addDaysToLocalDate } from '../../domain/temporal';
import { formatShortDate } from '../../lib/format';
import { ParamRow } from './ParamRow';

export function WhenField({ label = 'Коли', date, today, onDateChange, onOpen, selected, allowUndated = true, children, testId = 'chip-datetime' }: {
  label?: string; date?: string; today?: string; onDateChange?: (date: string) => void;
  onOpen?: () => void; selected?: boolean; allowUndated?: boolean; children?: ReactNode; testId?: string;
}) {
  return <ParamRow label={label}>
    {today && onDateChange && <div className="create-date-presets">
      <Pill selected={date === today} onClick={() => onDateChange(today)}>Сьогодні</Pill>
      <Pill selected={date === addDaysToLocalDate(today, 1)} onClick={() => onDateChange(addDaysToLocalDate(today, 1))}>Завтра</Pill>
      {allowUndated && <Pill selected={!date} onClick={() => onDateChange('')}>Без дати</Pill>}
      <ParameterChip icon="calendar" label={date && date !== today && date !== addDaysToLocalDate(today, 1) ? formatShortDate(date) : ''} aria-label="Обрати дату" onClick={onOpen} selected={selected} aria-expanded={selected} data-testid={testId} />
    </div>}
    {children}
  </ParamRow>;
}
