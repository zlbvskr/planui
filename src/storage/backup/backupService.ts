import { assertValidIsoInstant } from '../../domain/temporal';
import { PlanuiError } from '../../i18n/errorsUk';
import { BackupFileInventoryEntry, BackupManifest, MediaBlobRecord, PLANUI_APP_VERSION, PLANUI_BACKUP_FORMAT, PLANUI_BACKUP_VERSION, PLANUI_DB_SCHEMA_VERSION, PlanuiDomainSnapshot, RecoverySnapshotRecord, SupportedMediaMimeType } from '../../domain/types';
import { validateDomainSnapshot } from '../../domain/validation';
import { ALL_STORE_NAMES, STORE_NAMES, createDefaultLifeAreaQuestions, createDefaultSettings } from '../db';
import { PlanuiRepositories } from '../repositories';
import { BACKUP_LIMITS, ZipInputFile, createZipArchive, extractAndVerifyZipArchive, sha256Hex } from './zipCodec';

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

const validatedPreviews = new WeakMap<ValidatedBackupPreview, ValidatedBackupPreview>();

export interface ValidatedBackupPreview {
  manifest: BackupManifest;
  snapshot: PlanuiDomainSnapshot;
  mediaBlobs: Map<string, Uint8Array>;
  totalExpandedBytes: number;
  totalRecordsCount: number;
  warningsUk?: string[];
}

function countDomainSnapshotRecords(snapshot: PlanuiDomainSnapshot): number {
  return (
    snapshot.folders.length +
    (snapshot.goals ? snapshot.goals.length : 0) +
    snapshot.projects.length +
    snapshot.stages.length +
    snapshot.tasks.length +
    snapshot.reservations.length +
    snapshot.events.length +
    snapshot.shiftTemplates.length +
    snapshot.dayOffAnnotations.length +
    snapshot.habits.length +
    snapshot.habitEntries.length +
    snapshot.personalRecords.length +
    snapshot.lifeAreaQuestions.length +
    snapshot.lifeAreaAssessments.length +
    snapshot.inspirationItems.length +
    snapshot.mediaMeta.length +
    snapshot.wishlistCategories.length +
    snapshot.wishes.length
  );
}


function migrateSupportedDomainSnapshot(
  rawSnapshot: unknown,
  manifest: Pick<BackupManifest, 'format' | 'backupVersion' | 'dbSchemaVersion'>
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
    manifest.backupVersion !== 1 ||
    manifest.dbSchemaVersion !== 1
  ) {
    throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
  }

  const rawObj = rawSnapshot as Record<string, unknown>;
  const unwrapped =
    rawObj.format === PLANUI_BACKUP_FORMAT &&
    rawObj.data &&
    typeof rawObj.data === 'object'
      ? (rawObj.data as Record<string, unknown>)
      : rawObj;

  const obj = { ...unwrapped };
  if (
    obj.settings &&
    typeof obj.settings === 'object' &&
    'dbSchemaVersion' in obj.settings &&
    (typeof obj.settings.dbSchemaVersion !== 'number' ||
      obj.settings.dbSchemaVersion !== PLANUI_DB_SCHEMA_VERSION)
  ) {
    throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
  }

  return {
    snapshot: obj as unknown as PlanuiDomainSnapshot,
    wasPreWishlistMigrated: false,
    warningsUk: [],
  };
}

async function validateBrowserMediaDecoding(snapshot: PlanuiDomainSnapshot, mediaBlobs: ReadonlyMap<string, Uint8Array>): Promise<void> {
  // Non-browser environments may have no image decoder. Browsers must decode, with an Image fallback.
  if (typeof createImageBitmap !== 'function' && typeof Image === 'undefined') return;
  for (const meta of snapshot.mediaMeta) {
    const blob = new Blob([mediaBlobs.get(meta.id)! as BlobPart], {type: meta.mimeType});
    let width: number, height: number;
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width; height = bitmap.height;
        bitmap.close();
      } else {
        const url = URL.createObjectURL(blob);
        try {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element); element.onerror = reject; element.src = url;
          });
          width = image.naturalWidth; height = image.naturalHeight;
        } finally { URL.revokeObjectURL(url); }
      }
    } catch { throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH'); }
    if (width !== meta.width || height !== meta.height) throw new PlanuiError('MEDIA_SIGNATURE_MISMATCH');
  }
}

async function buildBackupZipFromSnapshot(
  snapshot: PlanuiDomainSnapshot,
  mediaBlobs: ReadonlyMap<string, Uint8Array>,
  nowIso: string
): Promise<{ zipBytes: Uint8Array; manifest: BackupManifest }> {
  validateDomainSnapshot(snapshot, mediaBlobs);
  await validateBrowserMediaDecoding(snapshot, mediaBlobs);

  const encoder = new TextEncoder();
  const dataPayload = {
    format: PLANUI_BACKUP_FORMAT,
    version: PLANUI_BACKUP_VERSION,
    exportedAt: nowIso,
    data: snapshot,
    ...snapshot,
  };
  const dataJsonString = JSON.stringify(dataPayload, null, 2);
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
    version: PLANUI_BACKUP_VERSION,
    backupVersion: PLANUI_BACKUP_VERSION,
    appVersion: PLANUI_APP_VERSION,
    dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
    exportedAt: nowIso,
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

  let expanded = 0;
  if (allZipInputs.length > BACKUP_LIMITS.MAX_ENTRY_COUNT) throw new PlanuiError('BACKUP_BOMB_DETECTED');
  for (const file of allZipInputs) {
    expanded += file.bytes.length;
    const max = file.path === 'data.json' ? BACKUP_LIMITS.MAX_DATA_JSON_BYTES : file.path === 'manifest.json' ? BACKUP_LIMITS.MAX_MANIFEST_BYTES : BACKUP_LIMITS.MAX_SINGLE_MEDIA_BYTES;
    if (file.bytes.length > max) throw new PlanuiError('BACKUP_BOMB_DETECTED');
  }
  if (expanded > BACKUP_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) throw new PlanuiError('BACKUP_BOMB_DETECTED');
  const foldedPaths = allZipInputs.map(file => file.path.normalize('NFC').toLowerCase());
  if (new Set(foldedPaths).size !== foldedPaths.length) throw new PlanuiError('BACKUP_DUPLICATE_ENTRY');
  const zipBytes = await createZipArchive(allZipInputs);
  if (zipBytes.length > BACKUP_LIMITS.MAX_ARCHIVE_BYTES) throw new PlanuiError('BACKUP_BOMB_DETECTED');
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
    migrateSupportedDomainSnapshot(recoveryRecord.snapshot, {
      format: PLANUI_BACKUP_FORMAT, backupVersion: PLANUI_BACKUP_VERSION,
      dbSchemaVersion: recoveryRecord.dbSchemaVersion,
    }).snapshot,
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
  try {
    if (signal?.aborted) {
      throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
    }

    
    const isPKZip =
      zipBytes.byteLength >= 4 &&
      zipBytes[0] === 0x50 &&
      zipBytes[1] === 0x4b;

    if (!isPKZip) {
      if (zipBytes.byteLength > limits.MAX_DATA_JSON_BYTES) {
        throw new PlanuiError('BACKUP_BOMB_DETECTED', 'JSON backup exceeds limit');
      }
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(decoder.decode(zipBytes)) as Record<string, unknown>;
      } catch {
        throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Invalid backup file');
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        parsed.format !== PLANUI_BACKUP_FORMAT ||
        parsed.version !== 1 ||
        typeof parsed.exportedAt !== 'string' ||
        !parsed.data ||
        typeof parsed.data !== 'object'
      ) {
        throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
      }
      assertValidIsoInstant(parsed.exportedAt);
      const { snapshot, warningsUk } = migrateSupportedDomainSnapshot(
        parsed.data,
        {
          format: PLANUI_BACKUP_FORMAT,
          backupVersion: 1,
          dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
        }
      );
      const mediaBlobs = new Map<string, Uint8Array>();
      try {
        validateDomainSnapshot(snapshot, mediaBlobs);
      } catch (error) {
        if (error instanceof PlanuiError) throw error;
        throw new PlanuiError('VALIDATION_FAILED');
      }
      const manifest: BackupManifest = {
        format: PLANUI_BACKUP_FORMAT,
        version: 1,
        backupVersion: 1,
        appVersion: PLANUI_APP_VERSION,
        dbSchemaVersion: PLANUI_DB_SCHEMA_VERSION,
        exportedAt: parsed.exportedAt,
        createdAt: parsed.exportedAt,
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
        files: [],
      };
      const totalRecordsCount = countDomainSnapshotRecords(snapshot);
      const preview: ValidatedBackupPreview = {
        manifest,
        snapshot,
        mediaBlobs,
        totalExpandedBytes: zipBytes.byteLength,
        totalRecordsCount,
        warningsUk,
      };
      validatedPreviews.set(preview, structuredClone(preview));
      return preview;
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
      !Number.isInteger(manifest.backupVersion) ||
      manifest.backupVersion < 1 ||
      manifest.backupVersion > PLANUI_BACKUP_VERSION ||
      !Number.isInteger(manifest.dbSchemaVersion) ||
      manifest.dbSchemaVersion < 1 ||
      manifest.dbSchemaVersion > PLANUI_DB_SCHEMA_VERSION
    ) {
      throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
    }

    assertValidIsoInstant(manifest.createdAt);
    if (typeof manifest.appVersion !== 'string' || !manifest.appVersion.trim()) throw new PlanuiError('BACKUP_UNSUPPORTED_VERSION');
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
      if (!inv || typeof inv.path !== 'string' || !Number.isSafeInteger(inv.byteSize) || inv.byteSize < 0 ||
          typeof inv.sha256Hex !== 'string' || !/^[a-f0-9]{64}$/.test(inv.sha256Hex) ||
          (inv.path !== 'data.json' && !/^media\/[^/]+\.(jpg|png|webp)$/.test(inv.path)) ||
          (inv.path === 'data.json' && inv.mimeType !== 'application/json')) {
        throw new PlanuiError('BACKUP_UNEXPECTED_FILE');
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

    try { validateDomainSnapshot(snapshot); }
    catch (error) {
      if (error instanceof PlanuiError) throw error;
      throw new PlanuiError('VALIDATION_FAILED');
    }
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

    try { validateDomainSnapshot(snapshot, mediaBlobs); }
    catch (error) {
      if (error instanceof PlanuiError) throw error;
      throw new PlanuiError('VALIDATION_FAILED');
    }
    await validateBrowserMediaDecoding(snapshot, mediaBlobs);
    const canonicalPaths = new Set(['manifest.json', 'data.json', ...snapshot.mediaMeta.map(meta => `media/${meta.id}.${extensionForMimeType(meta.mimeType)}`)]);
    if ([...extracted.keys()].some(path => !canonicalPaths.has(path))) throw new PlanuiError('BACKUP_UNEXPECTED_FILE');

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

    if (Object.keys(manifest.entityCounts).some(key => !(key in actualCounts))) throw new PlanuiError('BACKUP_ENTITY_COUNT_MISMATCH');
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

    const totalRecordsCount = countDomainSnapshotRecords(snapshot);
    const preview: ValidatedBackupPreview = {
      manifest,
      snapshot,
      mediaBlobs,
      totalExpandedBytes,
      totalRecordsCount,
      warningsUk,
    };
    validatedPreviews.set(preview, structuredClone(preview));
    return preview;
  } catch (error) {
    if (error instanceof PlanuiError) throw error;
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
  }
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
  nextDbGeneration: number;
}> {
  if (!options.explicitUserConfirmation) {
    throw new PlanuiError('BACKUP_CONFIRMATION_REQUIRED');
  }

  const trustedPreview = validatedPreviews.get(validatedPreview);
  if (!trustedPreview) throw new PlanuiError('VALIDATION_FAILED');
  validatedPreview = structuredClone(trustedPreview);

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
    const nextDbGeneration =
      await repositories.runReplacementTransaction(
        ALL_STORE_NAMES,
        async (tx) => {
          const { snapshot: currentLiveSnapshot } = await repositories.captureSnapshotInTransaction(tx, nowIso);
          recoveryRecord.snapshot = currentLiveSnapshot;
          if (options.simulateRecoverySnapshotFailure) {
            throw new PlanuiError('RECOVERY_SNAPSHOT_FAILED');
          }

          const existingRecoveries = await tx.getAll<RecoverySnapshotRecord>(
            STORE_NAMES.recoverySnapshots
          );

          const allRecoveriesSorted = [
            recoveryRecord,
            ...existingRecoveries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          ];

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
          await tx.put(STORE_NAMES.recoverySnapshots, recoveryRecord);

          const incoming = validatedPreview.snapshot;
          await writeSnapshotIntoDomainStoresInTx(tx, incoming);

          for (const [mediaId, bytes] of validatedPreview.mediaBlobs.entries()) {
            const meta = incoming.mediaMeta.find((m) => m.id === mediaId)!;
            const existingBlob = await tx.get<MediaBlobRecord>(STORE_NAMES.mediaBlobs, mediaId);
            if (existingBlob && (existingBlob.bytes.length !== bytes.length ||
                existingBlob.bytes.some((value, index) => value !== bytes[index]))) {
              throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH');
            }
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

    repositories.syncKnownDbGeneration(nextDbGeneration);
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: nextDbGeneration,
      timestamp: nowIso,
    });

    return { recoverySnapshotId, nextDbGeneration };
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
  nextDbGeneration: number;
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

  const migratedTarget = migrateSupportedDomainSnapshot(targetRecord.snapshot, {
    format: PLANUI_BACKUP_FORMAT, backupVersion: PLANUI_BACKUP_VERSION,
    dbSchemaVersion: targetRecord.dbSchemaVersion,
  }).snapshot;
  validateDomainSnapshot(migratedTarget, targetBlobs);
  for (const meta of migratedTarget.mediaMeta) {
    if (await sha256Hex(targetBlobs.get(meta.id)!) !== meta.sha256Hex) throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH');
  }

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
    const nextDbGeneration =
      await repositories.runReplacementTransaction(
        ALL_STORE_NAMES,
        async (tx) => {
          const { snapshot: currentLiveSnapshot } = await repositories.captureSnapshotInTransaction(tx, nowIso);
          preRestoreRecord.snapshot = currentLiveSnapshot;
          const stillPresent = await tx.get<RecoverySnapshotRecord>(STORE_NAMES.recoverySnapshots, targetRecoverySnapshotId);
          if (!stillPresent || JSON.stringify(stillPresent) !== JSON.stringify(targetRecord)) {
            throw new PlanuiError('RECOVERY_SNAPSHOT_NOT_FOUND');
          }
          if (options.simulateRecoverySnapshotFailure) {
            throw new PlanuiError('RECOVERY_SNAPSHOT_FAILED');
          }

          const existingRecoveries = await tx.getAll<RecoverySnapshotRecord>(
            STORE_NAMES.recoverySnapshots
          );

          const allRecoveriesSorted = [
            preRestoreRecord,
            ...existingRecoveries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          ];

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
          await tx.put(STORE_NAMES.recoverySnapshots, preRestoreRecord);

          const incoming = migratedTarget;
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

    repositories.syncKnownDbGeneration(nextDbGeneration);
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: nextDbGeneration,
      timestamp: nowIso,
    });

    return { preRestoreSnapshotId, nextDbGeneration };
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
  nextDbGeneration: number;
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
    const nextDbGeneration =
      await repositories.runReplacementTransaction(
        ALL_STORE_NAMES,
        async (tx) => {
          const { snapshot: currentLiveSnapshot } = await repositories.captureSnapshotInTransaction(tx, nowIso);
          if (preResetRecord) preResetRecord.snapshot = currentLiveSnapshot;
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

            const allRecoveriesSorted = [
              preResetRecord,
              ...existingRecoveries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            ];

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
            await tx.put(STORE_NAMES.recoverySnapshots, preResetRecord);

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

    repositories.syncKnownDbGeneration(nextDbGeneration);
    repositories.tabSync.broadcast({
      type: 'IMPORT_FINISHED',
      tabId: repositories.tabSync.tabId,
      dbGeneration: nextDbGeneration,
      timestamp: nowIso,
    });

    return { preResetSnapshotId, nextDbGeneration };
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
