import { PlanuiError } from '../../i18n/errorsUk';
import {
  BackupFileInventoryEntry,
  BackupManifest,
  MediaBlobRecord,
  PLANUI_APP_VERSION,
  PLANUI_BACKUP_FORMAT,
  PLANUI_BACKUP_VERSION,
  PLANUI_DB_SCHEMA_VERSION,
  PlanuiDomainSnapshot,
  RecoverySnapshotRecord,
  SupportedMediaMimeType,
} from '../../domain/types';
import { validateDomainSnapshot } from '../../domain/validation';
import {
  ALL_STORE_NAMES,
  STORE_NAMES,
  createDefaultLifeAreaQuestions,
  createDefaultSettings,
} from '../db';
import { PlanuiRepositories } from '../repositories';
import {
  BACKUP_LIMITS,
  ZipInputFile,
  createZipArchive,
  extractAndVerifyZipArchive,
  sha256Hex,
} from './zipCodec';

export const MAX_RECOVERY_SNAPSHOTS = 3;

const CLEARABLE_DOMAIN_STORES = [
  STORE_NAMES.folders,
  STORE_NAMES.goals,
  STORE_NAMES.projects,
  STORE_NAMES.stages,
  STORE_NAMES.tasks,
  STORE_NAMES.reservations,
  STORE_NAMES.events,
  STORE_NAMES.shiftTemplates,
  STORE_NAMES.dayOffAnnotations,
  STORE_NAMES.habits,
  STORE_NAMES.habitEntries,
  STORE_NAMES.personalRecords,
  STORE_NAMES.lifeAreaQuestions,
  STORE_NAMES.lifeAreaAssessments,
  STORE_NAMES.inspirationItems,
  STORE_NAMES.mediaMeta,
  STORE_NAMES.wishlistCategories,
  STORE_NAMES.wishes,
] as const;

function extensionForMimeType(mime: SupportedMediaMimeType): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}

export interface ValidatedBackupPreview {
  manifest: BackupManifest;
  snapshot: PlanuiDomainSnapshot;
  mediaBlobs: Map<string, Uint8Array>;
  totalExpandedBytes: number;
  warningsUk?: string[];
}

/**
 * 11.6: Documented deterministic migration for supported pre-Wishlist v1 snapshots.
 * If a valid v1 snapshot omitted `wishlistCategories`, `wishes`, or `settings.preferredWishlistCurrency`,
 * populates empty wishlist collections and null preferred currency without altering any existing records.
 */
export function migrateSupportedDomainSnapshot(
  rawSnapshot: unknown,
  manifest: BackupManifest
): {
  snapshot: PlanuiDomainSnapshot;
  wasPreWishlistMigrated: boolean;
  warningsUk: string[];
} {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') {
    throw new PlanuiError('VALIDATION_FAILED', 'snapshot');
  }
  if (
    manifest.format !== PLANUI_BACKUP_FORMAT ||
    (![1, 2, 3, 4, 5, 6, 7].includes(manifest.backupVersion)) ||
    (![1, 2, 3, 4, 5, 6, 7].includes(manifest.dbSchemaVersion))
  ) {
    throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
  }

  const obj = { ...(rawSnapshot as Record<string, unknown>) };
  const warningsUk: string[] = [];
  let wasPreWishlistMigrated = false;

  if (obj.wishlistCategories === undefined) {
    obj.wishlistCategories = [];
    wasPreWishlistMigrated = true;
  }
  if (obj.wishes === undefined) {
    obj.wishes = [];
    wasPreWishlistMigrated = true;
  }
  if (obj.settings && typeof obj.settings === 'object') {
    const settingsObj = { ...(obj.settings as Record<string, unknown>) };
    if (settingsObj.preferredWishlistCurrency === undefined) {
      settingsObj.preferredWishlistCurrency = null;
      wasPreWishlistMigrated = true;
    }
    obj.settings = settingsObj;
  }

  // v1/v2 imports acquire informational defaults only; preserve all original dates.
  if (manifest.dbSchemaVersion < 3) {
    for (const key of ['goals', 'projects', 'stages']) {
      if (Array.isArray(obj[key])) obj[key] = (obj[key] as unknown[]).map(record =>
        record && typeof record === 'object' ? { roadmapPeriod: null, checkpoints: [], ...record } : record
      );
    }
    if (obj.settings && typeof obj.settings === 'object') obj.settings = {
      roadmapLayer: 'hidden', ...obj.settings, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
    };
  }

  if (manifest.dbSchemaVersion < 4 && obj.settings && typeof obj.settings === 'object') {
    obj.settings = { dailyPlans: {}, ...obj.settings, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION };
  }

  if (manifest.dbSchemaVersion < 7 && obj.settings && typeof obj.settings === 'object') {
    obj.settings = { ...obj.settings, dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION };
  }

  // M1: Ensure goals collection exists and task ownership format is migrated from v1
  if (obj.goals === undefined) {
    obj.goals = [];
    warningsUk.push(
      'Виконано міграцію схеми v1: додано порожню колекцію цілей і збережено всі наявні записи.'
    );
  }

  if (Array.isArray(obj.tasks)) {
    obj.tasks = obj.tasks.map((taskItem: unknown) => {
      if (!taskItem || typeof taskItem !== 'object') return taskItem;
      const t = { ...(taskItem as Record<string, unknown>) };
      if (t.ownership && typeof t.ownership === 'object') {
        const own = { ...(t.ownership as Record<string, unknown>) };
        if (own.kind === 'standalone' && own.folderId !== null && own.folderId !== undefined) {
          t.ownership = {
            kind: 'folder',
            folderId: own.folderId,
          };
        }
      }
      return t;
    });
  }

  if (wasPreWishlistMigrated) {
    warningsUk.push(
      'Виконано міграцію підтримуваної схеми v1 (до появи списку бажань): додано порожні колекції бажань і збережено всі наявні записи.'
    );
  }

  return {
    snapshot: obj as unknown as PlanuiDomainSnapshot,
    wasPreWishlistMigrated,
    warningsUk,
  };
}

async function buildBackupZipFromSnapshot(
  snapshot: PlanuiDomainSnapshot,
  mediaBlobs: ReadonlyMap<string, Uint8Array>,
  nowIso: string
): Promise<{ zipBytes: Uint8Array; manifest: BackupManifest }> {
  validateDomainSnapshot(snapshot, mediaBlobs);

  const encoder = new TextEncoder();
  const dataJsonString = JSON.stringify(snapshot, null, 2);
  const dataJsonBytes = encoder.encode(dataJsonString);
  const dataJsonHash = await sha256Hex(dataJsonBytes);

  const inventory: BackupFileInventoryEntry[] = [
    {
      path: 'data.json',
      byteSize: dataJsonBytes.byteLength,
      sha256Hex: dataJsonHash,
      mimeType: 'application/json',
    },
  ];

  const zipInputs: ZipInputFile[] = [
    {
      path: 'data.json',
      bytes: dataJsonBytes,
    },
  ];

  for (const meta of snapshot.mediaMeta) {
    const bytes = mediaBlobs.get(meta.id);
    if (!bytes) {
      throw new PlanuiError('MISSING_REFERENCED_MEDIA', meta.id);
    }
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== meta.sha256Hex || bytes.byteLength !== meta.byteSize) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', meta.id);
    }
    const ext = extensionForMimeType(meta.mimeType);
    const mediaPath = `media/${meta.id}.${ext}`;
    inventory.push({
      path: mediaPath,
      byteSize: bytes.byteLength,
      sha256Hex: actualHash,
      mimeType: meta.mimeType,
    });
    zipInputs.push({
      path: mediaPath,
      bytes,
    });
  }

  const manifest: BackupManifest = {
    format: PLANUI_BACKUP_FORMAT,
    backupVersion: PLANUI_BACKUP_VERSION,
    appVersion: PLANUI_APP_VERSION,
    dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
    createdAt: nowIso,
    entityCounts: {
      folders: snapshot.folders.length,
      goals: snapshot.goals ? snapshot.goals.length : 0,
      projects: snapshot.projects.length,
      stages: snapshot.stages.length,
      tasks: snapshot.tasks.length,
      reservations: snapshot.reservations.length,
      events: snapshot.events.length,
      shiftTemplates: snapshot.shiftTemplates.length,
      dayOffAnnotations: snapshot.dayOffAnnotations.length,
      habits: snapshot.habits.length,
      habitEntries: snapshot.habitEntries.length,
      personalRecords: snapshot.personalRecords.length,
      lifeAreaQuestions: snapshot.lifeAreaQuestions.length,
      lifeAreaAssessments: snapshot.lifeAreaAssessments.length,
      inspirationItems: snapshot.inspirationItems.length,
      mediaMeta: snapshot.mediaMeta.length,
      wishlistCategories: snapshot.wishlistCategories.length,
      wishes: snapshot.wishes.length,
    },
    files: inventory,
  };

  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));
  const allZipInputs: ZipInputFile[] = [
    { path: 'manifest.json', bytes: manifestBytes },
    ...zipInputs,
  ];

  const zipBytes = await createZipArchive(allZipInputs);
  return { zipBytes, manifest };
}

export async function exportFullBackupZip(
  repositories: PlanuiRepositories,
  nowIso: string = new Date().toISOString()
): Promise<{ zipBytes: Uint8Array; manifest: BackupManifest }> {
  const { snapshot, mediaBlobs } =
    await repositories.captureCoherentSnapshot(nowIso);
  return buildBackupZipFromSnapshot(snapshot, mediaBlobs, nowIso);
}

export async function exportRecoverySnapshotZip(
  repositories: PlanuiRepositories,
  recoverySnapshotId: string,
  nowIso: string = new Date().toISOString()
): Promise<{
  zipBytes: Uint8Array;
  manifest: BackupManifest;
  recoveryRecord: RecoverySnapshotRecord;
}> {
  const { recoveryRecord, mediaBlobs } =
    await repositories.engine.runTransaction(
      [STORE_NAMES.recoverySnapshots, STORE_NAMES.mediaBlobs],
      'readonly',
      async (tx) => {
        const rec = await tx.get<RecoverySnapshotRecord>(
          STORE_NAMES.recoverySnapshots,
          recoverySnapshotId
        );
        if (!rec) {
          throw new PlanuiError(
            'RECOVERY_SNAPSHOT_NOT_FOUND',
            recoverySnapshotId
          );
        }
        const blobs = new Map<string, Uint8Array>();
        for (const meta of rec.snapshot.mediaMeta) {
          const blobRec = await tx.get<MediaBlobRecord>(
            STORE_NAMES.mediaBlobs,
            meta.id
          );
          if (!blobRec) {
            throw new PlanuiError('MISSING_REFERENCED_MEDIA', meta.id);
          }
          const bytes =
            blobRec.bytes instanceof Uint8Array
              ? blobRec.bytes
              : new Uint8Array(
                  Object.values(
                    blobRec.bytes as unknown as Record<string, number>
                  )
                );
          blobs.set(meta.id, bytes);
        }
        return { recoveryRecord: rec, mediaBlobs: blobs };
      }
    );

  const { zipBytes, manifest } = await buildBackupZipFromSnapshot(
    recoveryRecord.snapshot,
    mediaBlobs,
    nowIso
  );
  return { zipBytes, manifest, recoveryRecord };
}

export async function validateBackupArchive(
  zipBytes: Uint8Array,
  limits = BACKUP_LIMITS,
  signal?: AbortSignal
): Promise<ValidatedBackupPreview> {
  if (signal?.aborted) {
    throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
  }

  const extracted = await extractAndVerifyZipArchive(zipBytes, limits, signal);

  if (signal?.aborted) {
    throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
  }

  const manifestEntry = extracted.get('manifest.json');
  const dataEntry = extracted.get('data.json');
  if (!manifestEntry || !dataEntry) {
    throw new PlanuiError('BACKUP_MISSING_REQUIRED_FILES');
  }

  if (dataEntry.uncompressedSize > limits.MAX_DATA_JSON_BYTES) {
    throw new PlanuiError('BACKUP_BOMB_DETECTED', 'data.json exceeds limit');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let manifest: BackupManifest;
  let rawSnapshot: unknown;

  try {
    manifest = JSON.parse(decoder.decode(manifestEntry.bytes)) as BackupManifest;
    rawSnapshot = JSON.parse(decoder.decode(dataEntry.bytes));
  } catch {
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Invalid JSON');
  }

  if (
    !manifest ||
    manifest.format !== PLANUI_BACKUP_FORMAT ||
    typeof manifest.backupVersion !== 'number' ||
    manifest.backupVersion < 1 ||
    manifest.backupVersion > PLANUI_BACKUP_VERSION ||
    typeof manifest.dbSchemaVersion !== 'number' ||
    manifest.dbSchemaVersion < 1 ||
    manifest.dbSchemaVersion > PLANUI_DB_SCHEMA_VERSION
  ) {
    throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new PlanuiError('BACKUP_MISSING_REQUIRED_FILES');
  }

  if (manifest.files.some((f) => f.path === 'manifest.json')) {
    throw new PlanuiError('BACKUP_UNEXPECTED_FILE', 'manifest.json in inventory');
  }

  const expectedPaths = new Set<string>(['manifest.json']);
  for (const inv of manifest.files) {
    if (signal?.aborted) {
      throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
    }
    if (expectedPaths.has(inv.path)) {
      throw new PlanuiError('BACKUP_DUPLICATE_ENTRY', inv.path);
    }
    expectedPaths.add(inv.path);

    const actualFile = extracted.get(inv.path);
    if (!actualFile) {
      throw new PlanuiError('BACKUP_MISSING_REQUIRED_FILES', inv.path);
    }
    if (actualFile.uncompressedSize !== inv.byteSize) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', inv.path);
    }
    const actualSha = await sha256Hex(actualFile.bytes);
    if (actualSha !== inv.sha256Hex) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', inv.path);
    }
  }

  for (const actualPath of extracted.keys()) {
    if (!expectedPaths.has(actualPath)) {
      throw new PlanuiError('BACKUP_UNEXPECTED_FILE', actualPath);
    }
  }

  const { snapshot, wasPreWishlistMigrated, warningsUk } =
    migrateSupportedDomainSnapshot(rawSnapshot, manifest);

  const mediaBlobs = new Map<string, Uint8Array>();
  for (const meta of snapshot.mediaMeta ?? []) {
    if (signal?.aborted) {
      throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
    }
    const ext = extensionForMimeType(meta.mimeType);
    const expectedMediaPath = `media/${meta.id}.${ext}`;
    const mediaFile = extracted.get(expectedMediaPath);
    if (!mediaFile) {
      throw new PlanuiError('MISSING_REFERENCED_MEDIA', expectedMediaPath);
    }
    if (mediaFile.uncompressedSize > limits.MAX_SINGLE_MEDIA_BYTES) {
      throw new PlanuiError('MEDIA_DIMENSIONS_EXCEEDED', meta.id);
    }
    const invEntry = manifest.files.find((f) => f.path === expectedMediaPath);
    if (invEntry && invEntry.mimeType !== meta.mimeType) {
      throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH', expectedMediaPath);
    }
    if (invEntry && invEntry.sha256Hex !== meta.sha256Hex) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', expectedMediaPath);
    }
    mediaBlobs.set(meta.id, mediaFile.bytes);
  }

  validateDomainSnapshot(snapshot, mediaBlobs);

  // Verify manifest.entityCounts against actual snapshot collection counts
  if (!manifest.entityCounts || typeof manifest.entityCounts !== 'object') {
    throw new PlanuiError('BACKUP_ENTITY_COUNT_MISMATCH', 'entityCounts');
  }
  const actualCounts: Record<string, number> = {
    folders: snapshot.folders.length,
    goals: snapshot.goals ? snapshot.goals.length : 0,
    projects: snapshot.projects.length,
    stages: snapshot.stages.length,
    tasks: snapshot.tasks.length,
    reservations: snapshot.reservations.length,
    events: snapshot.events.length,
    shiftTemplates: snapshot.shiftTemplates.length,
    dayOffAnnotations: snapshot.dayOffAnnotations.length,
    habits: snapshot.habits.length,
    habitEntries: snapshot.habitEntries.length,
    personalRecords: snapshot.personalRecords.length,
    lifeAreaQuestions: snapshot.lifeAreaQuestions.length,
    lifeAreaAssessments: snapshot.lifeAreaAssessments.length,
    inspirationItems: snapshot.inspirationItems.length,
    mediaMeta: snapshot.mediaMeta.length,
    wishlistCategories: snapshot.wishlistCategories.length,
    wishes: snapshot.wishes.length,
  };

  for (const [key, actualLen] of Object.entries(actualCounts)) {
    const declaredLen = manifest.entityCounts[key];
    if (
      declaredLen === undefined &&
      key === 'goals' &&
      manifest.backupVersion === 1 &&
      actualLen === 0
    ) {
      continue;
    }
    if (
      declaredLen === undefined &&
      wasPreWishlistMigrated &&
      (key === 'wishlistCategories' || key === 'wishes') &&
      actualLen === 0
    ) {
      continue;
    }
    if (declaredLen !== actualLen) {
      throw new PlanuiError(
        'BACKUP_ENTITY_COUNT_MISMATCH',
        `${key}: declared ${String(declaredLen)} != actual ${actualLen}`
      );
    }
  }

  if (signal?.aborted) {
    throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
  }

  let totalExpandedBytes = 0;
  for (const f of extracted.values()) {
    totalExpandedBytes += f.uncompressedSize;
  }

  return {
    manifest,
    snapshot,
    mediaBlobs,
    totalExpandedBytes,
    warningsUk,
  };
}

async function writeSnapshotIntoDomainStoresInTx(
  tx: Parameters<Parameters<PlanuiRepositories['engine']['runTransaction']>[2]>[0],
  incoming: PlanuiDomainSnapshot
): Promise<void> {
  for (const storeName of CLEARABLE_DOMAIN_STORES) {
    await tx.clear(storeName);
  }
  for (const f of incoming.folders) await tx.put(STORE_NAMES.folders, f);
  if (Array.isArray(incoming.goals)) {
    for (const g of incoming.goals) await tx.put(STORE_NAMES.goals, g);
  }
  for (const p of incoming.projects) await tx.put(STORE_NAMES.projects, p);
  for (const s of incoming.stages) await tx.put(STORE_NAMES.stages, s);
  for (const t of incoming.tasks) await tx.put(STORE_NAMES.tasks, t);
  for (const r of incoming.reservations) {
    await tx.put(STORE_NAMES.reservations, r);
  }
  for (const ev of incoming.events) await tx.put(STORE_NAMES.events, ev);
  for (const tpl of incoming.shiftTemplates) {
    await tx.put(STORE_NAMES.shiftTemplates, tpl);
  }
  for (const ann of incoming.dayOffAnnotations) {
    await tx.put(STORE_NAMES.dayOffAnnotations, ann);
  }
  for (const h of incoming.habits) await tx.put(STORE_NAMES.habits, h);
  for (const he of incoming.habitEntries) {
    await tx.put(STORE_NAMES.habitEntries, he);
  }
  for (const pr of incoming.personalRecords) {
    await tx.put(STORE_NAMES.personalRecords, pr);
  }
  for (const lq of incoming.lifeAreaQuestions) {
    await tx.put(STORE_NAMES.lifeAreaQuestions, lq);
  }
  for (const la of incoming.lifeAreaAssessments) {
    await tx.put(STORE_NAMES.lifeAreaAssessments, la);
  }
  for (const ins of incoming.inspirationItems) {
    await tx.put(STORE_NAMES.inspirationItems, ins);
  }
  for (const mm of incoming.mediaMeta) {
    await tx.put(STORE_NAMES.mediaMeta, mm);
  }
  for (const wc of incoming.wishlistCategories) {
    await tx.put(STORE_NAMES.wishlistCategories, wc);
  }
  for (const w of incoming.wishes) await tx.put(STORE_NAMES.wishes, w);
}

async function garbageCollectUnreferencedMediaBlobsInTx(
  tx: Parameters<Parameters<PlanuiRepositories['engine']['runTransaction']>[2]>[0],
  liveMediaMeta: readonly { id: string }[],
  retainedRecoveries: readonly RecoverySnapshotRecord[]
): Promise<void> {
  const referencedMediaIds = new Set<string>();
  for (const mm of liveMediaMeta) {
    referencedMediaIds.add(mm.id);
  }
  for (const recSnap of retainedRecoveries) {
    for (const mm of recSnap.snapshot.mediaMeta) {
      referencedMediaIds.add(mm.id);
    }
  }

  const existingBlobs = await tx.getAll<MediaBlobRecord>(
    STORE_NAMES.mediaBlobs
  );
  for (const blob of existingBlobs) {
    if (!referencedMediaIds.has(blob.id)) {
      await tx.delete(STORE_NAMES.mediaBlobs, blob.id);
    }
  }
}

export interface ExecuteBackupReplacementOptions {
  explicitUserConfirmation: boolean;
  nowIso?: string;
  simulateRecoverySnapshotFailure?: boolean;
  simulateReplacementWriteFailure?: boolean;
}

export async function executeAtomicBackupReplacement(
  repositories: PlanuiRepositories,
  validatedPreview: ValidatedBackupPreview,
  options: ExecuteBackupReplacementOptions
): Promise<{
  recoverySnapshotId: string;
  newDbGeneration: number;
}> {
  if (!options.explicitUserConfirmation) {
    throw new PlanuiError('BACKUP_CONFIRMATION_REQUIRED');
  }

  repositories.tabSync.assertNoRemoteImportInProgress();
  const nowIso = options.nowIso ?? new Date().toISOString();

  const { snapshot: currentLiveSnapshot } =
    await repositories.captureCoherentSnapshot(nowIso);

  const recoverySnapshotId = `recovery-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const recoveryRecord: RecoverySnapshotRecord = {
    id: recoverySnapshotId,
    createdAt: nowIso,
    reason: 'pre_import_replacement',
    dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
    appVersion: PLANUI_APP_VERSION,
    snapshot: currentLiveSnapshot,
  };

  repositories.tabSync.broadcast({
    type: 'IMPORT_STARTED',
    tabId: repositories.tabSync.tabId,
    timestamp: nowIso,
  });

  try {
    const newDbGeneration =
      await repositories.runUnguardedReplacementTransaction(
        ALL_STORE_NAMES,
        async (tx) => {
          if (options.simulateRecoverySnapshotFailure) {
            throw new PlanuiError('RECOVERY_SNAPSHOT_FAILED');
          }

          const existingRecoveries = await tx.getAll<RecoverySnapshotRecord>(
            STORE_NAMES.recoverySnapshots
          );
          await tx.put(STORE_NAMES.recoverySnapshots, recoveryRecord);

          const allRecoveriesSorted = [
            ...existingRecoveries,
            recoveryRecord,
          ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          const retainedRecoveries = allRecoveriesSorted.slice(
            0,
            MAX_RECOVERY_SNAPSHOTS
          );
          const evictedRecoveries = allRecoveriesSorted.slice(
            MAX_RECOVERY_SNAPSHOTS
          );

          for (const evicted of evictedRecoveries) {
            await tx.delete(STORE_NAMES.recoverySnapshots, evicted.id);
          }

          const incoming = validatedPreview.snapshot;
          await writeSnapshotIntoDomainStoresInTx(tx, incoming);

          for (const [mediaId, bytes] of validatedPreview.mediaBlobs.entries()) {
            const meta = incoming.mediaMeta.find((m) => m.id === mediaId)!;
            const blobRec: MediaBlobRecord = {
              id: mediaId,
              mimeType: meta.mimeType,
              bytes: new Uint8Array(bytes),
            };
            await tx.put(STORE_NAMES.mediaBlobs, blobRec);
          }

          await garbageCollectUnreferencedMediaBlobsInTx(
            tx,
            incoming.mediaMeta,
            retainedRecoveries
          );

          if (options.simulateReplacementWriteFailure) {
            throw new Error('Simulated write failure during replacement');
          }

          const nextGen =
            Math.max(
              currentLiveSnapshot.settings.dbGeneration,
              incoming.settings.dbGeneration
            ) + 1;

          const updatedSettings = {
            ...incoming.settings,
            dbGeneration: nextGen,
            updatedAt: nowIso,
            revision: incoming.settings.revision + 1,
          };
          await tx.put(STORE_NAMES.settings, updatedSettings);

          return nextGen;
        }
      );

    repositories.syncKnownDbGeneration(newDbGeneration);
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: newDbGeneration,
      timestamp: nowIso,
    });

    return { recoverySnapshotId, newDbGeneration };
  } catch (err) {
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: currentLiveSnapshot.settings.dbGeneration,
      timestamp: nowIso,
    });
    throw err;
  }
}

export interface RestoreFromRecoverySnapshotOptions {
  explicitUserConfirmation: boolean;
  nowIso?: string;
  simulateRecoverySnapshotFailure?: boolean;
}

export async function restoreFromRecoverySnapshotTransactionally(
  repositories: PlanuiRepositories,
  targetRecoverySnapshotId: string,
  options: RestoreFromRecoverySnapshotOptions
): Promise<{
  preRestoreSnapshotId: string;
  newDbGeneration: number;
}> {
  if (!options.explicitUserConfirmation) {
    throw new PlanuiError('BACKUP_CONFIRMATION_REQUIRED');
  }

  repositories.tabSync.assertNoRemoteImportInProgress();
  const nowIso = options.nowIso ?? new Date().toISOString();

  const { snapshot: currentLiveSnapshot } =
    await repositories.captureCoherentSnapshot(nowIso);

  // Load and validate target recovery snapshot and its media blobs outside write transaction
  const { targetRecord, targetBlobs } =
    await repositories.engine.runTransaction(
      [STORE_NAMES.recoverySnapshots, STORE_NAMES.mediaBlobs],
      'readonly',
      async (tx) => {
        const rec = await tx.get<RecoverySnapshotRecord>(
          STORE_NAMES.recoverySnapshots,
          targetRecoverySnapshotId
        );
        if (!rec) {
          throw new PlanuiError(
            'RECOVERY_SNAPSHOT_NOT_FOUND',
            targetRecoverySnapshotId
          );
        }
        const blobs = new Map<string, Uint8Array>();
        for (const meta of rec.snapshot.mediaMeta) {
          const blobRec = await tx.get<MediaBlobRecord>(
            STORE_NAMES.mediaBlobs,
            meta.id
          );
          if (!blobRec) {
            throw new PlanuiError('MISSING_REFERENCED_MEDIA', meta.id);
          }
          const bytes =
            blobRec.bytes instanceof Uint8Array
              ? blobRec.bytes
              : new Uint8Array(
                  Object.values(
                    blobRec.bytes as unknown as Record<string, number>
                  )
                );
          blobs.set(meta.id, bytes);
        }
        return { targetRecord: rec, targetBlobs: blobs };
      }
    );

  validateDomainSnapshot(targetRecord.snapshot, targetBlobs);

  const preRestoreSnapshotId = `recovery-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const preRestoreRecord: RecoverySnapshotRecord = {
    id: preRestoreSnapshotId,
    createdAt: nowIso,
    reason: 'pre_recovery_restore',
    dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
    appVersion: PLANUI_APP_VERSION,
    snapshot: currentLiveSnapshot,
  };

  repositories.tabSync.broadcast({
    type: 'IMPORT_STARTED',
    tabId: repositories.tabSync.tabId,
    timestamp: nowIso,
  });

  try {
    const newDbGeneration =
      await repositories.runUnguardedReplacementTransaction(
        ALL_STORE_NAMES,
        async (tx) => {
          if (options.simulateRecoverySnapshotFailure) {
            throw new PlanuiError('RECOVERY_SNAPSHOT_FAILED');
          }

          const existingRecoveries = await tx.getAll<RecoverySnapshotRecord>(
            STORE_NAMES.recoverySnapshots
          );
          await tx.put(STORE_NAMES.recoverySnapshots, preRestoreRecord);

          const allRecoveriesSorted = [
            ...existingRecoveries,
            preRestoreRecord,
          ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          const retainedRecoveries = allRecoveriesSorted.slice(
            0,
            MAX_RECOVERY_SNAPSHOTS
          );
          const evictedRecoveries = allRecoveriesSorted.slice(
            MAX_RECOVERY_SNAPSHOTS
          );

          for (const evicted of evictedRecoveries) {
            await tx.delete(STORE_NAMES.recoverySnapshots, evicted.id);
          }

          const incoming = targetRecord.snapshot;
          await writeSnapshotIntoDomainStoresInTx(tx, incoming);

          await garbageCollectUnreferencedMediaBlobsInTx(
            tx,
            incoming.mediaMeta,
            retainedRecoveries
          );

          const nextGen =
            Math.max(
              currentLiveSnapshot.settings.dbGeneration,
              incoming.settings.dbGeneration
            ) + 1;

          const updatedSettings = {
            ...incoming.settings,
            dbGeneration: nextGen,
            updatedAt: nowIso,
            revision: incoming.settings.revision + 1,
          };
          await tx.put(STORE_NAMES.settings, updatedSettings);

          return nextGen;
        }
      );

    repositories.syncKnownDbGeneration(newDbGeneration);
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: newDbGeneration,
      timestamp: nowIso,
    });

    return { preRestoreSnapshotId, newDbGeneration };
  } catch (err) {
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: currentLiveSnapshot.settings.dbGeneration,
      timestamp: nowIso,
    });
    throw err;
  }
}

export interface DeleteRecoverySnapshotOptions {
  allowDeleteOnlyRecoveryPoint?: boolean;
}

export async function deleteRecoverySnapshotTransactionally(
  repositories: PlanuiRepositories,
  recoverySnapshotId: string,
  options?: DeleteRecoverySnapshotOptions
): Promise<{ remainingCount: number }> {
  repositories.tabSync.assertNoRemoteImportInProgress();

  return repositories.engine.runTransaction(
    [
      STORE_NAMES.recoverySnapshots,
      STORE_NAMES.mediaMeta,
      STORE_NAMES.mediaBlobs,
    ],
    'readwrite',
    async (tx) => {
      const existing = await tx.getAll<RecoverySnapshotRecord>(
        STORE_NAMES.recoverySnapshots
      );
      const target = existing.find((r) => r.id === recoverySnapshotId);
      if (!target) {
        throw new PlanuiError(
          'RECOVERY_SNAPSHOT_NOT_FOUND',
          recoverySnapshotId
        );
      }
      if (existing.length === 1 && !options?.allowDeleteOnlyRecoveryPoint) {
        throw new PlanuiError('ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED');
      }

      await tx.delete(STORE_NAMES.recoverySnapshots, recoverySnapshotId);
      const remaining = existing.filter((r) => r.id !== recoverySnapshotId);
      const liveMediaMeta = await tx.getAll<{ id: string }>(
        STORE_NAMES.mediaMeta
      );

      await garbageCollectUnreferencedMediaBlobsInTx(
        tx,
        liveMediaMeta,
        remaining
      );

      return { remainingCount: remaining.length };
    }
  );
}

export interface ResetAllPlanuiDataOptions {
  explicitUserConfirmation: boolean;
  snapshotHandling: 'create_pre_reset_snapshot' | 'clear_all_snapshots';
  nowIso?: string;
  simulateRecoverySnapshotFailure?: boolean;
}

export async function resetAllPlanuiDataTransactionally(
  repositories: PlanuiRepositories,
  options: ResetAllPlanuiDataOptions
): Promise<{
  preResetSnapshotId: string | null;
  newDbGeneration: number;
}> {
  if (!options.explicitUserConfirmation) {
    throw new PlanuiError('RESET_CONFIRMATION_REQUIRED');
  }

  repositories.tabSync.assertNoRemoteImportInProgress();
  const nowIso = options.nowIso ?? new Date().toISOString();

  const { snapshot: currentLiveSnapshot } =
    await repositories.captureCoherentSnapshot(nowIso);

  const preResetSnapshotId =
    options.snapshotHandling === 'create_pre_reset_snapshot'
      ? `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : null;

  const preResetRecord: RecoverySnapshotRecord | null = preResetSnapshotId
    ? {
        id: preResetSnapshotId,
        createdAt: nowIso,
        reason: 'pre_reset',
        dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
        appVersion: PLANUI_APP_VERSION,
        snapshot: currentLiveSnapshot,
      }
    : null;

  repositories.tabSync.broadcast({
    type: 'IMPORT_STARTED',
    tabId: repositories.tabSync.tabId,
    timestamp: nowIso,
  });

  try {
    const newDbGeneration =
      await repositories.runUnguardedReplacementTransaction(
        ALL_STORE_NAMES,
        async (tx) => {
          if (
            options.snapshotHandling === 'create_pre_reset_snapshot' &&
            options.simulateRecoverySnapshotFailure
          ) {
            throw new PlanuiError('RECOVERY_SNAPSHOT_FAILED');
          }

          if (options.snapshotHandling === 'clear_all_snapshots') {
            await tx.clear(STORE_NAMES.recoverySnapshots);
            await tx.clear(STORE_NAMES.mediaBlobs);
          } else if (preResetRecord) {
            const existingRecoveries = await tx.getAll<RecoverySnapshotRecord>(
              STORE_NAMES.recoverySnapshots
            );
            await tx.put(STORE_NAMES.recoverySnapshots, preResetRecord);

            const allRecoveriesSorted = [
              ...existingRecoveries,
              preResetRecord,
            ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

            const retainedRecoveries = allRecoveriesSorted.slice(
              0,
              MAX_RECOVERY_SNAPSHOTS
            );
            const evictedRecoveries = allRecoveriesSorted.slice(
              MAX_RECOVERY_SNAPSHOTS
            );

            for (const evicted of evictedRecoveries) {
              await tx.delete(STORE_NAMES.recoverySnapshots, evicted.id);
            }

            await garbageCollectUnreferencedMediaBlobsInTx(
              tx,
              [],
              retainedRecoveries
            );
          }

          for (const storeName of CLEARABLE_DOMAIN_STORES) {
            await tx.clear(storeName);
          }

          for (const q of createDefaultLifeAreaQuestions(nowIso)) {
            await tx.put(STORE_NAMES.lifeAreaQuestions, q);
          }

          const nextGen = currentLiveSnapshot.settings.dbGeneration + 1;
          const resetSettings = {
            ...createDefaultSettings(nowIso),
            dbGeneration: nextGen,
            revision: 1,
          };
          await tx.put(STORE_NAMES.settings, resetSettings);

          return nextGen;
        }
      );

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('planui_theme_bootstrap');
      } catch {
        // Ignore storage restrictions
      }
    }

    repositories.syncKnownDbGeneration(newDbGeneration);
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: newDbGeneration,
      timestamp: nowIso,
    });

    return { preResetSnapshotId, newDbGeneration };
  } catch (err) {
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: currentLiveSnapshot.settings.dbGeneration,
      timestamp: nowIso,
    });
    throw err;
  }
}
