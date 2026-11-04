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
  private remoteImportLeases = new Map<string, number>();

  constructor(channelName = 'planui_tab_sync_v1', private readonly now = () => Date.now()) {
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
            this.remoteImportLeases.set(msg.tabId, this.now() + 30_000);
          } else if (
            msg.type === 'IMPORT_FINISHED'
          ) {
            this.remoteImportLeases.delete(msg.tabId);
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
    // Advisory lease only: an interrupted tab must not lock the app forever.
    // IndexedDB serialization and the persisted generation are the write authority.
    for (const [tabId, expires] of this.remoteImportLeases) {
      if (expires <= this.now()) this.remoteImportLeases.delete(tabId);
    }
    if (this.remoteImportLeases.size > 0) {
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
