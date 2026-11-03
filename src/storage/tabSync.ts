import { PlanuiError } from '../i18n/errorsUk';

export type TabSyncMessage =
  | {
      type: 'ENTITY_MUTATED';
      stores: string[];
      dbGeneration: number;
      timestamp: string;
    }
  | {
      type: 'IMPORT_STARTED';
      tabId: string;
      timestamp: string;
    }
  | {
      type: 'IMPORT_FINISHED';
      tabId: string;
      dbGeneration: number;
      timestamp: string;
    };

export class TabSyncCoordinator {
  public readonly tabId: string;
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<(msg: TabSyncMessage) => void>();
  private remoteImportLockTabId: string | null = null;

  constructor(channelName = 'planui_tab_sync_v1') {
    this.tabId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (event: MessageEvent<TabSyncMessage>) => {
          const msg = event.data;
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'IMPORT_STARTED' && msg.tabId !== this.tabId) {
            this.remoteImportLockTabId = msg.tabId;
          } else if (
            msg.type === 'IMPORT_FINISHED' &&
            this.remoteImportLockTabId === msg.tabId
          ) {
            this.remoteImportLockTabId = null;
          }
          for (const listener of this.listeners) {
            listener(msg);
          }
        };
        (this.channel as unknown as { unref?: () => void }).unref?.();
      } catch {
        this.channel = null;
      }
    }
  }

  public assertNoRemoteImportInProgress(): void {
    if (this.remoteImportLockTabId !== null) {
      throw new PlanuiError('IMPORT_ALREADY_IN_PROGRESS');
    }
  }

  public broadcast(msg: TabSyncMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch {
        // Ignore closed channel
      }
    }
  }

  public subscribe(listener: (msg: TabSyncMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}
