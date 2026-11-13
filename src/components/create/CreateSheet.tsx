import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Sheet } from '../../ui/sheets';
import { getCapturedOrbRect, isReducedMotion, runInterruptibleAnimation, easings } from '../../ui/motion';

export function CreateSheet({ isOpen, onClose, rail, footer, type, panel, children }: { isOpen: boolean; onClose: () => void; rail: ReactNode; footer: ReactNode; type: string; panel: string | null; children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const previous = useRef<{ type: string; height: number } | null>(null);
  const morph = useRef(getCapturedOrbRect());
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const sheet = body?.closest<HTMLElement>('[data-ui="sheet"]');
    if (!body || !sheet) return;
    sheet.setAttribute('aria-label', 'Створити запис');
    const measure = () => { previous.current = { type, height: sheet.offsetHeight }; };
    if (previous.current && previous.current.type !== type && !isReducedMotion()) {
      const delta = sheet.offsetHeight - previous.current.height;
      runInterruptibleAnimation(sheet, [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { durationMs: 220, easing: easings.out });
      runInterruptibleAnimation(body, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { durationMs: 220, easing: easings.out });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [type, isOpen]);
  useLayoutEffect(() => {
    if (!panel) return;
    const frame = requestAnimationFrame(() => bodyRef.current?.querySelector('[data-create-inline-panel]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [panel]);
  return <Sheet isOpen={isOpen} onClose={onClose} title={rail} quickAdd morphFromRect={morph.current} detent="medium" footer={footer}>
    <div ref={bodyRef} className="create-sheet-content">{children}</div>
  </Sheet>;
}
