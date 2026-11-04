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
