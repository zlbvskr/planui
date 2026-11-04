import { flushSync } from 'react-dom';

/** Shared-element morph where supported; normal React update elsewhere. */
export function transitionCreation(update: () => void): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true';
  const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
  if (!reduced && doc.startViewTransition) {
    const transition = doc.startViewTransition(() => flushSync(update));
    void transition.finished.catch(() => { /* Rendering may skip snapshots, but update has still committed. */ });
  } else update();
}
