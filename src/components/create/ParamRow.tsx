import type { HTMLAttributes, ReactNode } from 'react';

export function ParamRow({ label, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { label?: string; children: ReactNode }) {
  return <div {...props} role="group" aria-label={props['aria-label'] ?? label} className={`create-param-row ${className}`}>
    {label && <div className="create-param-label">{label}</div>}
    <div className="create-param-controls">{children}</div>
  </div>;
}
