import React from 'react';
import { ModalSheet } from './primitives';

export function Surface({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-surface ${className}`} />;
}
export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return <section className="ui-section">{title && <h2 className="ui-section-label">{title}</h2>}<Surface>{children}</Surface></section>;
}
export function Row({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-row ${className}`} />;
}
export function Pill({ selected = false, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return <button type="button" {...props} aria-pressed={selected} className={`ui-pill ${className}`} />;
}
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return <div className="ui-segmented" role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
export function EmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return <div className="ui-empty"><span>{text}</span>{action && <button type="button" onClick={onAction}>{action}</button>}</div>;
}
export function TopBar({ children }: { children: React.ReactNode }) {
  return <header className="ui-topbar planui-floating-capsule">{children}</header>;
}
// Keep the existing focus trap, dirty confirmation, portal and focus restoration.
export const Sheet = ModalSheet;

export function RoundButton({ className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`ui-round planui-floating-capsule ${className}`} />;
}
export function GlassBar({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-glass-bar planui-floating-capsule ${className}`} />;
}
export function ItemCard({ hue = 'var(--color-personal)', className = '', style, ...props }: React.HTMLAttributes<HTMLElement> & { hue?: string }) {
  return <article {...props} className={`ui-item-card ${className}`} style={{ '--item-hue': hue, ...style } as React.CSSProperties} />;
}
export function WeekStrip({ date, today, markers = {}, onChange }: { date: string; today: string; markers?: Record<string, 'night' | 'day'>; onChange: (date: string) => void }) {
  const start = new Date(date + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const touch = React.useRef<number | null>(null);
  const move = (days: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); onChange(d.toISOString().slice(0, 10)); };
  return <div className="ui-week" aria-label="Тиждень" onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { if (touch.current !== null) { const delta = e.changedTouches[0].clientX - touch.current; if (Math.abs(delta) > 48) move(delta < 0 ? 7 : -7); } touch.current = null; }}>
    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((label, index) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + index); const value = d.toISOString().slice(0, 10); return <button type="button" key={value} aria-pressed={value === date} aria-current={value === today ? 'date' : undefined} aria-label={new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)} onClick={() => onChange(value)}><span>{label}</span><strong>{d.getUTCDate()}</strong><small aria-label={markers[value] === 'night' ? 'Нічна зміна' : markers[value] === 'day' ? 'Денна зміна' : undefined}>{markers[value] === 'night' ? '☾' : markers[value] === 'day' ? '☀' : ''}</small></button>; })}
  </div>;
}
