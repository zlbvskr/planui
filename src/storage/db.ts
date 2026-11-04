import { createStarterAreas } from '../domain/lifeAreas';
import { PlanuiError } from '../i18n/errorsUk';
import {
  PLANUI_APP_VERSION,
  PLANUI_DB_SCHEMA_VERSION,
  PlanuiSettings,
  LifeAreaQuestion,
} from '../domain/types';
import { detectDeviceTimeZone } from '../domain/temporal';

export const STORE_NAMES = {
  folders: 'folders',
  goals: 'goals',
  projects: 'projects',
  stages: 'stages',
  tasks: 'tasks',
  reservations: 'reservations',
  events: 'events',
  shiftTemplates: 'shiftTemplates',
  dayOffAnnotations: 'dayOffAnnotations',
  habits: 'habits',
  habitEntries: 'habitEntries',
  personalRecords: 'personalRecords',
  lifeAreaQuestions: 'lifeAreaQuestions',
  lifeAreaAssessments: 'lifeAreaAssessments',
  inspirationItems: 'inspirationItems',
  mediaMeta: 'mediaMeta',
  mediaBlobs: 'mediaBlobs',
  wishlistCategories: 'wishlistCategories',
  wishes: 'wishes',
  settings: 'settings',
  recoverySnapshots: 'recoverySnapshots',
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export const ALL_STORE_NAMES: StoreName[] = Object.values(STORE_NAMES);

export function createDefaultLifeAreaQuestions(
  nowIso: string
): LifeAreaQuestion[] {
  return createStarterAreas(nowIso);
}

export function createDefaultSettings(nowIso: string): PlanuiSettings {
  const detected = detectDeviceTimeZone() ?? 'Europe/Kyiv';
  return {
    dailyPlans: {},
    roadmapLayer: 'hidden',
    id: 'singleton',
    theme: 'system',
    timeZoneMode: 'device',
    manualTimeZone: null,
    lastDetectedTimeZone: detected,
    todayNextDayCollapsed: false,
    reducedMotionOverride: false,
    reducedTransparencyOverride: false,
    preferredWishlistCurrency: null,
    modules: {
      habitsEnabled: false,
      stateCheckInsEnabled: false,
      desiredLifeEnabled: false,
      wishlistEnabled: false,
    },
    dbGeneration: 1,
    appVersion: PLANUI_APP_VERSION,
    dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
    updatedAt: nowIso,
    revision: 1,
  };
}

export interface StorageTransactionContext {
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  put<T extends { id: string }>(store: StoreName, record: T): Promise<void>;
  delete(store: StoreName, id: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export interface StorageEngine {
  readonly dbName: string;
  runTransaction<R>(
    storeNames: readonly StoreName[],
    mode: 'readonly' | 'readwrite',
    work: (tx: StorageTransactionContext) => Promise<R> | R
  ): Promise<R>;
  close(): void;
}

function deepCloneRecord<T>(val: T): T {
  if (val === undefined || val === null) return val;
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val)) as T;
}

export class InMemoryTransactionalEngine implements StorageEngine {
  public readonly dbName: string;
  private stores = new Map<StoreName, Map<string, unknown>>();
  private txQueue: Promise<unknown> = Promise.resolve();

  constructor(dbName = 'planui_test_memory_db') {
    this.dbName = dbName;
    for (const store of ALL_STORE_NAMES) {
      this.stores.set(store, new Map<string, unknown>());
    }
  }

  public async runTransaction<R>(
    storeNames: readonly StoreName[],
    mode: 'readonly' | 'readwrite',
    work: (tx: StorageTransactionContext) => Promise<R> | R
  ): Promise<R> {
    const execute = async (): Promise<R> => {
      const backups = new Map<StoreName, Map<string, unknown>>();
      if (mode === 'readwrite') {
        for (const name of storeNames) {
          const current = this.stores.get(name)!;
          const copy = new Map<string, unknown>();
          for (const [k, v] of current.entries()) {
            copy.set(k, deepCloneRecord(v));
          }
          backups.set(name, copy);
        }
      }

      const assertStoreIncluded = (store: StoreName) => {
        if (!storeNames.includes(store)) {
          throw new Error(`Store ${store} not in transaction scope`);
        }
      };

      const txContext: StorageTransactionContext = {
        get: async <T>(store: StoreName, id: string): Promise<T | undefined> => {
          assertStoreIncluded(store);
          const item = this.stores.get(store)!.get(id);
          return item === undefined ? undefined : (deepCloneRecord(item) as T);
        },
        getAll: async <T>(store: StoreName): Promise<T[]> => {
          assertStoreIncluded(store);
          const list = Array.from(this.stores.get(store)!.values());
          return list.map((item) => deepCloneRecord(item) as T);
        },
        put: async <T extends { id: string }>(
          store: StoreName,
          record: T
        ): Promise<void> => {
          assertStoreIncluded(store);
          if (mode !== 'readwrite') {
            throw new Error('Cannot write in readonly transaction');
          }
          this.stores.get(store)!.set(record.id, deepCloneRecord(record));
        },
        delete: async (store: StoreName, id: string): Promise<void> => {
          assertStoreIncluded(store);
          if (mode !== 'readwrite') {
            throw new Error('Cannot delete in readonly transaction');
          }
          this.stores.get(store)!.delete(id);
        },
        clear: async (store: StoreName): Promise<void> => {
          assertStoreIncluded(store);
          if (mode !== 'readwrite') {
            throw new Error('Cannot clear in readonly transaction');
          }
          this.stores.get(store)!.clear();
        },
      };

      try {
        return await work(txContext);
      } catch (err) {
        if (mode === 'readwrite') {
          for (const [name, backupMap] of backups.entries()) {
            this.stores.set(name, backupMap);
          }
        }
        throw err;
      }
    };

    const next = this.txQueue.then(execute, execute);
    this.txQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  public close(): void {
    // No-op for in-memory engine
  }
}

export class IndexedDbStorageEngine implements StorageEngine {
  public readonly dbName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName = 'planui_local_db') {
    this.dbName = dbName;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, PLANUI_DB_SCHEMA_VERSION);

      req.onblocked = () => {
        reject(new PlanuiError('DB_VERSION_BLOCKED'));
      };

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion;

        for (const storeName of ALL_STORE_NAMES) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            if (storeName === STORE_NAMES.folders) {
              store.createIndex('by_parentId', 'parentId', { unique: false });
            } else if (storeName === STORE_NAMES.goals) {
              store.createIndex('by_folderId', 'folderId', { unique: false });
              store.createIndex('by_lifeAreaId', 'lifeAreaId', { unique: false });
              store.createIndex('by_state', 'state', { unique: false });
              store.createIndex('by_archived', 'archived', { unique: false });
            } else if (storeName === STORE_NAMES.projects) {
              store.createIndex('by_folderId', 'folderId', { unique: false });
              store.createIndex('by_goalId', 'goalId', { unique: false });
              store.createIndex('by_state', 'state', { unique: false });
            } else if (storeName === STORE_NAMES.stages) {
              store.createIndex('by_projectId', 'projectId', { unique: false });
            } else if (storeName === STORE_NAMES.tasks) {
              store.createIndex('by_state', 'state', { unique: false });
              store.createIndex('by_plannedDate', 'plannedDate', {
                unique: false,
              });
            } else if (storeName === STORE_NAMES.reservations) {
              store.createIndex('by_taskId', 'taskId', { unique: false });
              store.createIndex('by_state', 'state', { unique: false });
            } else if (storeName === STORE_NAMES.habitEntries) {
              store.createIndex('by_habitId', 'habitId', { unique: false });
              store.createIndex('by_localDate', 'localDate', { unique: false });
            } else if (storeName === STORE_NAMES.wishes) {
              store.createIndex('by_categoryId', 'categoryId', {
                unique: false,
              });
              store.createIndex('by_timing', 'timing', { unique: false });
              store.createIndex('by_state', 'state', { unique: false });
            }
          }
        }

        // v3 adds metadata without inferring any dates or changing old records.
        if (oldVersion < 3 && req.transaction) {
          for (const name of [STORE_NAMES.goals, STORE_NAMES.projects, STORE_NAMES.stages, STORE_NAMES.settings]) {
            const cursorRequest = req.transaction.objectStore(name).openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              const record = cursor.value;
              if (name === STORE_NAMES.settings) {
                record.roadmapLayer ??= 'hidden';
                record.dailyPlans ??= {};
                record.dbSchemaVersion = PLANUI_DB_SCHEMA_VERSION;
              } else {
                record.roadmapPeriod ??= null;
                record.checkpoints ??= [];
              }
              cursor.update(record);
              cursor.continue();
            };
          }
        }

        // v4: optional effort and per-calendar-date focus; never infer content.
        if (oldVersion >= 3 && oldVersion < 4 && req.transaction) {
          const request = req.transaction.objectStore(STORE_NAMES.settings).openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            cursor.update({ ...cursor.value, dailyPlans: cursor.value.dailyPlans ?? {}, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION });
            cursor.continue();
          };
        }

        // v5/v6 advance storage metadata only; existing personal records, inspiration, areas and assessments remain intact.
        if (oldVersion >= 4 && oldVersion < 6 && req.transaction) {
          const request = req.transaction.objectStore(STORE_NAMES.settings).openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            cursor.update({ ...cursor.value, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION });
            cursor.continue();
          };
        }

        // Migration from schema version 1 to 2
        if (oldVersion < 2 && req.transaction) {
          const taskStore = req.transaction.objectStore(STORE_NAMES.tasks);
          const cursorReq = taskStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const task = cursor.value;
              let changed = false;
              if (task && task.ownership) {
                if (task.ownership.kind === 'standalone' && task.ownership.folderId !== null) {
                  // In v1, standalone with folderId meant folder task
                  task.ownership = {
                    kind: 'folder',
                    folderId: task.ownership.folderId,
                  };
                  changed = true;
                }
              }
              if (changed) {
                cursor.update(task);
              }
              cursor.continue();
            }
          };
        }
      };

      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      req.onerror = () => {
        this.dbPromise = null;
        reject(new PlanuiError('DB_OPEN_FAILED'));
      };
    });

    return this.dbPromise;
  }

  public async runTransaction<R>(
    storeNames: readonly StoreName[],
    mode: 'readonly' | 'readwrite',
    work: (tx: StorageTransactionContext) => Promise<R> | R
  ): Promise<R> {
    const db = await this.openDatabase();
    return new Promise<R>((resolve, reject) => {
      const tx = db.transaction(storeNames as string[], mode);
      let workResult: R;
      let workResolved = false;
      let rejected = false;

      const wrapRequest = <T>(req: IDBRequest<T>): Promise<T> =>
        new Promise<T>((res, rej) => {
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error ?? new PlanuiError('DB_OPEN_FAILED'));
        });

      const txContext: StorageTransactionContext = {
        get: <T>(store: StoreName, id: string) =>
          wrapRequest<T | undefined>(tx.objectStore(store).get(id)),
        getAll: <T>(store: StoreName) =>
          wrapRequest<T[]>(tx.objectStore(store).getAll()),
        put: async <T extends { id: string }>(store: StoreName, record: T) => {
          await wrapRequest(tx.objectStore(store).put(record));
        },
        delete: async (store: StoreName, id: string) => {
          await wrapRequest(tx.objectStore(store).delete(id));
        },
        clear: async (store: StoreName) => {
          await wrapRequest(tx.objectStore(store).clear());
        },
      };

      tx.oncomplete = () => {
        if (!rejected && workResolved) {
          resolve(workResult);
        }
      };

      tx.onabort = () => {
        if (!rejected) {
          rejected = true;
          reject(tx.error ?? new PlanuiError('DB_OPEN_FAILED'));
        }
      };

      tx.onerror = () => {
        if (!rejected) {
          rejected = true;
          reject(tx.error ?? new PlanuiError('DB_OPEN_FAILED'));
        }
      };

      Promise.resolve()
        .then(() => work(txContext))
        .then((res) => {
          workResult = res;
          workResolved = true;
        })
        .catch((err) => {
          rejected = true;
          try {
            tx.abort();
          } catch {
            // Ignore if already aborted
          }
          reject(err);
        });
    });
  }

  public close(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
    }
  }
}

export function createStorageEngine(dbName?: string): StorageEngine {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDbStorageEngine(dbName);
  }
  return new InMemoryTransactionalEngine(dbName);
}
