import { useId, type ReactNode } from 'react';
import { Icon } from '../../ui/icons';

export function MoreGrid({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return <div className="create-more">
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="create-more-toggle" data-testid="create-more-toggle">Ще <Icon name="chevron-down" size={16} /></button>
    {open && <div id={id} className="create-more-grid" data-testid="create-more-grid">{children}</div>}
  </div>;
}
