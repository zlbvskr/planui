import { useEffect, useId } from 'react';

export interface OverlayEntry {
  id: string;
  close: () => void;
}

const overlayStack: OverlayEntry[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function registerOverlay(id: string, close: () => void): () => void {
  const existingIdx = overlayStack.findIndex((o) => o.id === id);
  if (existingIdx !== -1) {
    overlayStack.splice(existingIdx, 1);
  }
  overlayStack.push({ id, close });
  notifyListeners();

  return () => {
    const idx = overlayStack.findIndex((o) => o.id === id);
    if (idx !== -1) {
      overlayStack.splice(idx, 1);
      notifyListeners();
    }
  };
}

export function hasOpenOverlay(): boolean {
  return overlayStack.length > 0;
}

export function getOverlayCount(): number {
  return overlayStack.length;
}

export function getTopmostOverlayId(): string | null {
  const top = overlayStack[overlayStack.length - 1];
  return top ? top.id : null;
}

export function closeTopmostOverlay(): boolean {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function closeAllOverlaysExcept(keepId?: string): void {
  const copy = [...overlayStack].reverse();
  for (const entry of copy) {
    if (entry.id !== keepId) {
      entry.close();
    }
  }
}

export function subscribeOverlayStack(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useOverlayRegistration(isOpen: boolean, onClose: () => void, customId?: string): void {
  const reactId = useId();
  const id = customId ?? reactId;

  useEffect(() => {
    if (!isOpen) return;
    return registerOverlay(id, onClose);
  }, [isOpen, id, onClose]);
}
