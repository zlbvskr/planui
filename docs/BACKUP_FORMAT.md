# PLANUI Full Backup and Recovery Specification

## 1. Archive Container Structure (C20)

A complete PLANUI backup is a single standard ZIP archive (`.zip`) containing:

```text
planui-backup-YYYY-MM-DDTHH-mm-ssZ.zip
├── manifest.json
├── data.json
└── media/
    ├── <mediaId_1>.jpg
    ├── <mediaId_2>.png
    └── <mediaId_3>.webp
```

- **Supported Compression Methods**: `0` (Store / Uncompressed) and `8` (Deflate).
- **Excluded Data**: Derived UI projections, service-worker resource caches, and `recovery_snapshots` (backups are never recursively nested inside backups).

---

## 2. `manifest.json` Schema

```ts
export interface BackupFileInventoryEntry {
  path: string;                      // Normalized relative path, e.g. "data.json" or "media/abc.webp"
  byteSize: number;                  // Exact uncompressed byte length
  sha256Hex: string;                 // Lowercase 64-char SHA-256 hex digest of uncompressed bytes
  mimeType: string;                  // "application/json" or validated image MIME
}

export interface BackupManifest {
  format: 'planui-backup';
  backupFormatVersion: 1;
  appVersion: string;                // e.g. "1.0.0"
  dbSchemaVersion: number;           // e.g. 1
  createdAt: string;                 // UTC ISO-8601 instant
  exportTimeZone: string;            // IANA zone active at export time
  counts: {
    folders: number;
    projects: number;
    tasks: number;
    taskReservations: number;
    calendarEvents: number;
    shiftTemplates: number;
    dayOffAnnotations: number;
    habits: number;
    habitEntries: number;
    personalRecords: number;
    lifeAreaQuestions: number;
    lifeAreaAssessments: number;
    inspirationItems: number;
    mediaBlobs: number;
    wishlistCategories: number;
    wishes: number;
  };
  files: BackupFileInventoryEntry[]; // Includes "data.json" and every "media/*" file (never manifest.json itself)
}
```
*Note*: `manifest.json` checksums every other file in the archive (`data.json` and each file under `media/`). It never attempts to recursively checksum itself.

---

## 3. `data.json` Schema

Contains the complete, coherent snapshot of all IndexedDB domain stores:

```ts
export interface BackupDataPayload {
  schemaVersion: 1;
  exportedAt: string;
  settings: AppSettingsRecord;       // Includes preferredWishlistCurrency, theme, timeZoneMode, manualTimeZone
  folders: FolderRecord[];
  projects: ProjectRecord[];
  tasks: TaskRecord[];
  taskReservations: TaskReservationRecord[];
  calendarEvents: CalendarEventRecord[];
  shiftTemplates: ShiftTemplateRecord[];
  dayOffAnnotations: DayOffAnnotationRecord[];
  habits: HabitRecord[];
  habitEntries: HabitEntryRecord[];
  personalRecords: PersonalRecord[];
  lifeAreaQuestions: LifeAreaQuestionRecord[];
  lifeAreaAssessments: LifeAreaAssessmentRecord[];
  inspirationItems: InspirationItemRecord[];
  mediaMetadata: Omit<MediaBlobRecord, 'blob'>[]; // Binary bytes stored in media/<id>.<ext>
  wishlistCategories: WishlistCategoryRecord[];
  wishes: WishRecord[];              // Includes exact prices, currency codes, timing groups, fulfillment & archive states
}
```

### Coherent Export Guarantee
Before constructing the ZIP, the exporter reads all domain stores and `media_blobs` inside a single read-only IndexedDB transaction (or verifies that every `InspirationItemRecord.mediaId` is present in `media_blobs`). If any referenced media blob is missing or corrupted in live storage, the export reports the exact integrity error rather than silently omitting the file and claiming a complete backup.

---

## 4. Security & Resource Limits (C20)

All limits are explicit memory/security bounds (never folder-depth limits):

| Resource / Security Parameter | Limit | Reason |
|---|---|---|
| Maximum ZIP archive file size | `150 MB` (`157,286,400` bytes) | Prevents browser tab OOM during local parsing |
| Maximum total uncompressed size | `200 MB` (`209,715,200` bytes) | Decompression bomb protection (actual streamed bytes counted, never trusting ZIP header size alone) |
| Maximum compression ratio per entry | `100 : 1` (for entries > 64 KB) | Rejects synthetic zip bombs early |
| Maximum ZIP entry count | `1,000` entries | Prevents central-directory exhaustion (`manifest.json` + `data.json` + up to 998 media images) |
| Maximum `manifest.json` size | `2 MB` | Bounds manifest JSON parse |
| Maximum `data.json` size | `50 MB` | Bounds domain JSON parse |
| Maximum single image file size | `15 MB` | Bounds individual media blob allocation |
| Maximum image dimensions | `8192 × 8192` px (`<= 33,554,432` total pixels / `128 MB` RGBA decoded) | Prevents canvas/bitmap decoder crash on mobile Safari |
| Allowed image formats | `image/jpeg`, `image/png`, `image/webp` | Verified by binary magic bytes (`FF D8 FF`, `89 50 4E 47`, `RIFF....WEBP`) + browser image decode check. Active SVG (`image/svg+xml`), HTML, scripts, and arbitrary attachments are strictly rejected. |

---

## 5. Deterministic Pre-Import Validation Pipeline

All validation runs **outside** the IndexedDB write transaction before any live data is touched:

1. **ZIP Container & Path Hygiene**:
   - Verify ZIP signature and central directory.
   - Normalize paths; reject any entry containing `..`, leading `/`, backslashes `\`, control characters, symlinks, encrypted flags, unsupported compression methods, duplicate normalized paths, nested `.zip` archives, or unexpected files outside `manifest.json`, `data.json`, and `media/<id>.<ext>`.
2. **Streamed Decompression & Checksum Verification**:
   - Decompress `manifest.json` while enforcing actual byte caps.
   - Decompress `data.json` and each `media/*` entry while counting actual output bytes (aborting immediately if exceeding cap or ratio), verifying exact byte length and SHA-256 hex digest against `manifest.files`, and verifying no extra or missing files exist.
3. **Schema & Domain Invariant Validation**:
   - Validate `manifest.format === 'planui-backup'` and supported `backupFormatVersion` / `schemaVersion`.
   - Validate every record in `data.json`:
     - Unique IDs across each collection; valid timestamps (`InstantISO`), calendar dates (`YYYY-MM-DD`), 24h times (`HH:mm`), and `Intl` IANA time zones.
     - **Folders**: Every `parentId` exists in `folders`; iterative cycle check confirms zero cycles and zero self-parenting regardless of depth.
     - **Projects & Tasks**: Every `task.folderId` or `project.folderId` exists; standalone tasks do not set `projectId`/`stageId`; project tasks reference an existing `projectId` and a `stageId` belonging to that project; `planningMode` matches `plannedDate` presence.
     - **Reservations & Events**: Every `reservation.taskId` exists in `tasks`; all intervals satisfy `startInstant < endInstant`; palette colors and event kinds are valid.
     - **Habits**: Every `habitEntry.habitId` exists in `habits`; no duplicate `(habitId, localDate)` pairs; `ruleHistory` is non-empty and sorted.
     - **Personal Space**: Scales are within `1..5` (personal records) or `1..10` (life areas); inspiration links use only `http:` or `https:`; every `inspirationItem.mediaId` exists in `mediaMetadata` and has a matching binary file in `media/`.
     - **Wishlist**: Every `wish.categoryId` is `null` or exists in `wishlistCategories`; `timingGroup` is `'now' | 'later' | 'someday'`; `state` is `'active' | 'fulfilled'`; `price` is either `null` or has a valid ISO-4217 `currency`, valid `exponent`, non-negative safe integer `amountMinor`, and matching `canonicalDecimal`; `settings.preferredWishlistCurrency` is `null` or a valid ISO-4217 currency code.
4. **Media Signature & Decode Verification**:
   - Inspect binary magic bytes of every `media/*` file and decode header dimensions to verify `width`, `height`, and pixel budget.

---

## 6. Preview, Pre-Replacement Recovery Snapshot, and Atomic Replacement (Stage 11)

1. **Cancelable Validation & Preview Confirmation (`11.4`)**:
   - `validateBackupArchive(zipBytes, limits, signal)` supports an optional `AbortSignal` so validation can be canceled cleanly before commit (`BACKUP_VALIDATION_ABORTED`).
   - Validates `manifest.entityCounts` against actual array lengths in `data.json` (`BACKUP_ENTITY_COUNT_MISMATCH`), checks binary raster headers (`parseRasterImageDimensions`) against declared `meta.width` / `meta.height` (`MEDIA_SIGNATURE_MISMATCH`) and pixel budget (`MAX_MEDIA_DIMENSION_PX = 8192`, `MAX_MEDIA_DECODED_PIXELS = 25,000,000`), and rejects disguised SVG/XML payloads (`ACTIVE_SVG_FORBIDDEN`).
   - Supports documented migration of pre-Wishlist supported v1 snapshots (`migrateSupportedDomainSnapshot`: populates `wishlistCategories: []`, `wishes: []`, and `settings.preferredWishlistCurrency: null` with a Ukrainian migration warning) while strictly rejecting unknown or future versions (`BACKUP_UNSUPPORTED_VERSION`).
   - Presents a Ukrainian preview summary showing record counts, unpacked byte size, and migration warnings, requiring explicit replacement confirmation (`BACKUP_CONFIRMATION_REQUIRED`; no automatic merging).
2. **Pre-Replacement Recovery Snapshots & Actions (`11.5`)**:
   - Before modifying live domain stores during import replacement (`reason: 'pre_import_replacement'`), snapshot restoration (`reason: 'pre_recovery_restore'`), or controlled reset (`reason: 'pre_reset'`), the current live snapshot is saved into `recoverySnapshots`.
   - Retains up to `MAX_RECOVERY_SNAPSHOTS = 3` snapshots, garbage-collecting only `mediaBlobs` that are unreferenced by both live `mediaMeta` and all retained `recoverySnapshots`.
   - **Hard Safety Gate**: If creating the pre-replacement recovery snapshot fails (`RECOVERY_SNAPSHOT_FAILED`), replacement stops immediately before modifying live stores, preserves 100% of live data, and offers external ZIP export and storage-management guidance.
   - **Recovery Snapshot Operations**:
     - `restoreFromRecoverySnapshotTransactionally`: Restores a retained snapshot atomically (creating a `pre_recovery_restore` snapshot of the current state first and rotating `dbGeneration`).
     - `exportRecoverySnapshotZip`: Exports any retained recovery snapshot directly as a verified `.zip` archive.
     - `deleteRecoverySnapshotTransactionally`: Deletes a retained snapshot and garbage-collects unreferenced media blobs; deleting the only remaining recovery snapshot requires explicit confirmation (`ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED`).
3. **Persistent Generation Guard & Controlled Reset (`11.6`)**:
   - Every normal repository write transaction verifies that the stored `settings.dbGeneration` matches the tab's `knownDbGeneration`, throwing `STALE_DB_GENERATION_CONFLICT` if another tab replaced, restored, or reset the database (protecting against stale-tab overwrites even without `BroadcastChannel` delivery).
   - `resetAllPlanuiDataTransactionally`: Resets only PLANUI-owned stores after explicit confirmation (`RESET_CONFIRMATION_REQUIRED`), allowing the user to either retain a `pre_reset` recovery snapshot or clear all recovery snapshots and media blobs.

