import { useEffect, useId, useRef } from 'react';
import { markPopStateForTest } from './motion';

interface OverlayEntry {
  id: string;
  close: () => void;
}

const overlayStack: OverlayEntry[] = [];
const pushedScreenStack: OverlayEntry[] = [];
const listeners = new Set<() => void>();

let pushedHistoryCount = 0;
let ignoringProgrammaticBackCount = 0;
let handlingUserPopState = false;
let syncScheduled = false;

export function syncOverlayScrollLock(): void {
  if (typeof document === 'undefined') return;
  const open = overlayStack.length > 0;
  if (open) {
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.setAttribute('data-overlay-open', 'true');
  } else {
    document.body.style.overflow = '';
    document.body.style.overscrollBehavior = '';
    document.documentElement.removeAttribute('data-overlay-open');
  }
}

export function getViewportLayerRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('Document is not available');
  }
  let layer = document.getElementById('planui-viewport-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'planui-viewport-layer';
    layer.setAttribute('data-ui', 'viewport-layer');
    layer.className = 'planui-viewport-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

function notifyListeners() {
  syncOverlayScrollLock();
  for (const listener of listeners) {
    listener();
  }
}

function scheduleHistorySync() {
  if (typeof window === 'undefined' || syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(() => {
    syncScheduled = false;
    if (typeof window === 'undefined') return;
    const targetDepth = overlayStack.length + pushedScreenStack.length;
    if (targetDepth > pushedHistoryCount) {
      const toPush = targetDepth - pushedHistoryCount;
      for (let i = 0; i < toPush; i++) {
        pushedHistoryCount++;
        try {
          window.history.pushState(
            { planuiBack: true, depth: pushedHistoryCount },
            ''
          );
        } catch {
          // Ignore history restrictions in sandboxed environments
        }
      }
    } else if (targetDepth < pushedHistoryCount && !handlingUserPopState) {
      const delta = pushedHistoryCount - targetDepth;
      pushedHistoryCount = targetDepth;
      ignoringProgrammaticBackCount += delta;
      try {
        window.history.go(-delta);
      } catch {
        ignoringProgrammaticBackCount = Math.max(
          0,
          ignoringProgrammaticBackCount - delta
        );
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignoringProgrammaticBackCount > 0) {
      ignoringProgrammaticBackCount--;
      return;
    }
    if (overlayStack.length === 0 && pushedScreenStack.length === 0) {
      pushedHistoryCount = 0;
      return;
    }
    markPopStateForTest();
    handlingUserPopState = true;
    pushedHistoryCount = Math.max(0, pushedHistoryCount - 1);
    try {
      if (overlayStack.length > 0) {
        closeTopmostOverlay();
      } else if (pushedScreenStack.length > 0) {
        popTopmostPushedScreen();
      }
    } finally {
      queueMicrotask(() => {
        handlingUserPopState = false;
      });
    }
  });
}

function registerOverlay(id: string, close: () => void): () => void {
  const existingIdx = overlayStack.findIndex((o) => o.id === id);
  if (existingIdx !== -1) {
    overlayStack[existingIdx].close = close;
  } else {
    overlayStack.push({ id, close });
  }
  notifyListeners();
  scheduleHistorySync();

  return () => {
    const idx = overlayStack.findIndex((o) => o.id === id);
    if (idx !== -1) {
      overlayStack.splice(idx, 1);
      notifyListeners();
      scheduleHistorySync();
    }
  };
}

export function registerPushedScreen(id: string, pop: () => void): () => void {
  const existingIdx = pushedScreenStack.findIndex((s) => s.id === id);
  if (existingIdx !== -1) {
    pushedScreenStack[existingIdx].close = pop;
  } else {
    pushedScreenStack.push({ id, close: pop });
  }
  notifyListeners();
  scheduleHistorySync();

  return () => {
    const idx = pushedScreenStack.findIndex((s) => s.id === id);
    if (idx !== -1) {
      pushedScreenStack.splice(idx, 1);
      notifyListeners();
      scheduleHistorySync();
    }
  };
}

export function hasOpenOverlay(): boolean {
  return overlayStack.length > 0;
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

function popTopmostPushedScreen(): boolean {
  const top = pushedScreenStack[pushedScreenStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function subscribeOverlayStack(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useOverlayRegistration(
  isOpen: boolean,
  onClose: () => void,
  customId?: string
): void {
  const reactId = useId();
  const id = customId ?? reactId;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    return registerOverlay(id, () => closeRef.current());
  }, [isOpen, id]);
}
