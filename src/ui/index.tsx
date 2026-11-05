import { formatSubtitle } from '../lib/format';
import React from 'react';

export function Surface({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-surface ${className}`} />;
}

export function Pill({ selected = false, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return <button type="button" {...props} aria-pressed={selected} className={`ui-pill ${className}`} />;
}

export function TopBar({ children }: { children: React.ReactNode }) {
  return <header className="ui-topbar planui-floating-capsule">{children}</header>;
}

export function GlassBar({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-glass-bar planui-floating-capsule ${className}`} />;
}

export function WeekStrip({ date, today, markers = {}, onChange }: { date: string; today: string; markers?: Record<string, 'night' | 'day'>; onChange: (date: string) => void }) {
  const start = new Date(date + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const touch = React.useRef<number | null>(null);
  const move = (days: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); onChange(d.toISOString().slice(0, 10)); };
  return <div className="ui-week" aria-label="Тиждень" onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { if (touch.current !== null) { const delta = e.changedTouches[0].clientX - touch.current; if (Math.abs(delta) > 48) move(delta < 0 ? 7 : -7); } touch.current = null; }}>
    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((label, index) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + index); const value = d.toISOString().slice(0, 10); return <button type="button" key={value} aria-pressed={value === date} aria-current={value === today ? 'date' : undefined} aria-label={formatSubtitle(value)} onClick={() => onChange(value)}><span>{label}</span><strong>{d.getUTCDate()}</strong><small aria-label={markers[value] === 'night' ? 'Нічна зміна' : markers[value] === 'day' ? 'Денна зміна' : undefined}>{markers[value] === 'night' ? '☾' : markers[value] === 'day' ? '☀' : ''}</small></button>; })}
  </div>;
}

export function PillMenu({ label, options, value, onChange, disabled, ...props }: {label: string; options: readonly {value: string; label: string}[]; value?: string | number | readonly string[]; onChange?: React.ChangeEventHandler<HTMLSelectElement>; disabled?: boolean; [key: string]: unknown}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return <div className="ui-menu"><button type="button" className="ui-pill" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)} data-testid={props['data-testid'] as string | undefined}>{label}{value ? ` · ${options.find(o=>o.value===value)?.label??value}` : ''} ⌄</button>{open&&<div id={id} className="ui-menu-options" role="group" aria-label={label}>{options.map(o=><button type="button" key={o.value} aria-pressed={o.value===value} onClick={()=>{onChange?.({target:{value:o.value},currentTarget:{value:o.value}} as React.ChangeEvent<HTMLSelectElement>);setOpen(false);}}>{o.label}</button>)}</div>}</div>;
}

export { PageHeader, SubHeader, Segmented, PillRow, RoundButton, Section, Row, ItemCard, Toggle, Slider, DateField, TimeField, SelectField, DurationField, ActionMenu, InfoSheet, Sheet, EmptyState, Disclosure } from './contract';
