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
  format: 'planui-backup-zip';
  backupVersion: 8;                  // Supports backup v1–v8; DB schemas v1–v9
  appVersion: string;                // e.g. "0.3.0"
  dbSchemaVersion: number;           // Current: 9
  createdAt: string;                 // UTC ISO-8601 instant
  entityCounts: {
    folders: number;
    goals: number;                   // Added in M1
    projects: number;
    stages: number;
    tasks: number;
    reservations: number;
    events: number;
    shiftTemplates: number;
    dayOffAnnotations: number;
    habits: number;
    habitEntries: number;
    personalRecords: number;
    lifeAreaQuestions: number;
    lifeAreaAssessments: number;
    inspirationItems: number;
    mediaMeta: number;
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
// The actual serialized payload is PlanuiDomainSnapshot from src/domain/types.ts.
export interface BackupDataPayload {
  settings: PlanuiSettings;
  folders: Folder[];
  goals: Goal[];
  projects: Project[];
  stages: ProjectStage[];
  tasks: Task[];
  reservations: TaskReservation[];
  events: CalendarEvent[];
  shiftTemplates: ShiftTemplate[];
  dayOffAnnotations: DayOffAnnotation[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  personalRecords: PersonalRecord[];
  lifeAreaQuestions: LifeAreaQuestion[];
  lifeAreaAssessments: LifeAreaAssessment[];
  inspirationItems: InspirationItem[];
  mediaMeta: MediaAssetMeta[];
  wishlistCategories: WishlistCategory[];
  wishes: WishItem[];
}
```

### Coherent Export Guarantee
Before constructing the ZIP, the exporter reads all domain stores and `media_blobs` inside a single read-only IndexedDB transaction (or verifies that every `InspirationItemRecord.mediaId` is present in `media_blobs`). If any referenced media blob is missing or corrupted in live storage, the export reports the exact integrity error rather than silently omitting the file and claiming a complete backup.

---

## 4. Security & Resource Limits (C20)

All limits are explicit memory/security bounds (never folder-depth limits):

| Resource / Security Parameter | Limit | Reason |
|---|---|---|
| Maximum ZIP archive file size | `100 MiB` (`104,857,600` bytes) | Prevents browser tab OOM during local parsing |
| Maximum total uncompressed size | `120 MiB` (`125,829,120` bytes) | Decompression bomb protection (actual streamed bytes counted, never trusting ZIP header size alone) |
| Maximum compression ratio per entry | `50 : 1` (for entries > 64 KB) | Rejects synthetic zip bombs early |
| Maximum ZIP entry count | `500` entries | Prevents central-directory exhaustion (`manifest.json` + `data.json` + up to 498 media images) |
| Maximum `manifest.json` size | `2 MiB` | Bounds manifest JSON parse |
| Maximum `data.json` size | `20 MiB` | Bounds domain JSON parse |
| Maximum single image file size | `15 MiB` | Bounds individual media blob allocation |
| Maximum image dimensions | `8192 × 8192` px (`<= 25,000,000` total pixels / approximately `100 MB` RGBA decoded) | Prevents canvas/bitmap decoder crash on mobile Safari |
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
   - Validate `manifest.format === 'planui-backup-zip'` and independently supported `backupVersion` / `dbSchemaVersion`.
   - Validate every record in `data.json`:
     - Unique IDs across each collection; valid timestamps (`InstantISO`), calendar dates (`YYYY-MM-DD`), 24h times (`HH:mm`), and `Intl` IANA time zones.
     - **Folders**: Every `parentId` exists in `folders`; iterative cycle check confirms zero cycles and zero self-parenting regardless of depth.
     - **Projects & Tasks**: Every `task.folderId` or `project.folderId` exists; standalone tasks do not set `projectId`/`stageId`; project tasks reference an existing `projectId` and a `stageId` belonging to that project; `planningMode` matches `plannedDate` presence.
     - **Reservations & Events**: Exactly one owner: `reservation.taskId` exists in `tasks`, or `habitOccurrence` references its canonical habit/date entry; all intervals satisfy `startInstant < endInstant`; palette colors and event kinds are valid.
     - **Habits**: Every `habitEntry.habitId` exists in `habits`; no duplicate `(habitId, localDate)` pairs; `ruleRevisions` is non-empty and sorted.
     - **Personal Space**: Scales are within `1..5` (personal records) or `1..10` (life areas); inspiration links use only `http:` or `https:`; every `inspirationItem.mediaId` exists in `mediaMeta` and has a matching binary file in `media/`.
     - **Wishlist**: Every `wish.categoryId` is `null` or exists in `wishlistCategories`; `timing` is `'now' | 'later' | 'someday'`; `state` is `'active' | 'fulfilled'`; `estimatedPrice` is either `null` or has a valid ISO-4217 `currency`, non-negative safe integer `amountMinor`, and matching `amountDecimal`; `settings.preferredWishlistCurrency` is `null` or a valid ISO-4217 currency code.
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



## M4 / v3 roadmap compatibility

Canonical goals/projects/stages include optional roadmapPeriod precision and ordered checkpoints in data.json; settings include roadmapLayer. Checkpoint counts do not add manifest collections because checkpoints are embedded in their single owner. Flat stages retain the existing stages collection and ID; a stage may now have projectId: null and one valid goalId.

Import accepts archive/schema versions 1, 2, 3, 4 and 5; newer versions remain rejected. Older snapshots acquire null periods, empty checkpoints and hidden-layer settings, preserving all existing IDs, target dates, timing text, reservations, events, prices, currencies and media. Stored settings are normalized to the current schema (5). No dates are inferred. Turning the layer off never removes records from ZIP backups. Recovery snapshots continue to capture the complete canonical snapshot.

M4 tests round-trip v3 through ZIP validation and isolated atomic replacement and verify legacy snapshot migration. This updates the payload documentation to the actual serializer's existing collection names; it does not introduce a new envelope or rename persisted fields.


## M5 / v4 Today compatibility

Task.effort and settings.dailyPlans are serialized in their existing canonical collections, including focus task IDs, note and minimalDay for every saved calendar date. No new manifest collection counts or duplicated tasks are introduced. Layer/module visibility never omits this metadata. Recovery snapshots include the same fields.

Live v3-to-v4 upgrade adds dailyPlans: {} and the schema version while preserving existing settings, next-day preference, dbGeneration and record revisions. Older live versions also acquire the earlier roadmap defaults. v1/v2/v3 archive imports acquire empty daily plans and preserve all previous data. Missing effort is left unspecified; no focus is generated. v4 validation rejects malformed date keys, duplicate/invalid focus IDs, invalid preference shapes or unsupported effort values.

Interaction-only date/mode/scroll in sessionStorage is excluded from ZIP. The persisted next-day collapse preference, daily focus and minimal-day choices remain included. Tests verify v4 ZIP validation/atomic replacement in isolated storage, supported legacy migration, and simulated upgrade callbacks. Full native-browser migration verification remains pending.


## M6 / v5 life-area and review compatibility

Existing lifeAreaQuestions and lifeAreaAssessments collections contain the optional archive/merge/definition/starter metadata and explicit new review scale/question/definition/attention/useful-change snapshots. New optional folder/task/event lifeAreaId references remain in their canonical collections. No new manifest collection counts, renamed IDs, task copies or journal store are introduced.

The v4-to-v5 live upgrade only advances settings.dbSchemaVersion, without cursoring or modifying area or assessment stores. Older supported upgrade pipelines retain all their original area IDs, customization and review bytes. Supported v1–v4 ZIP import similarly preserves area/review objects; absent historical scale continues to mean 1–10. An existing empty area collection is not automatically reseeded after import or reload.

Validation handles new 0–10 and legacy 1–10 scales independently, partial answers including zero/false/empty text, explicit period order, optional definitions, direct references and retained merge targets/cycle prevention. New and legacy records, including archived source identities and their original historical answers, round-trip through v5 ZIP and recovery snapshots. Tests validate and atomically import actual ZIPs for every supported older version in isolated databases. Merging areas never deletes past answers or edits their snapshots.

## M7 / v6 check-in and preferred-life compatibility

Current database and ZIP format versions are 6. v1–v6 import is supported. Live v5→v6 upgrade advances only settings schema metadata; existing personal records, inspiration and media are untouched. Optional sleep/scale/collection/area/goal fields serialize in the existing arrays, including disabled modules and recovery snapshots. Missing fields are interpreted at read time, never inferred from schedules or historical text. Validate optional sleep ranges, scale version, goal/area references, HTTP/S links on every kind and media references independently of links. Local raster validation, size limits, atomic media writes, quota errors and retained recovery media use the existing infrastructure.

Explicit local selected-record export: UTF-8 JSON, `format: "planui-personal-records"`, `version: 1`, `scales` (Ukrainian version-1 labels), `legacyScaleVersion: 1`, and `records` containing exact selected PersonalRecord objects, including text, IDs, timestamps, zone, tags, scores and optional sleep. Export never modifies records and does not depend on module enablement. This is a personal-use structured export, not an import format or clinical report; full restore continues to use ZIP.

## M8 / v7 habits and canonical session compatibility

Current database and ZIP format versions are 7; imports support v1–v7. Live v6→v7 upgrade changes only settings schema metadata. It never clears or reseeds stores and never rewrites legacy definitions or log values. The older migration pipeline remains intact.

Existing habits, habitEntries and reservations arrays carry the optional context/minimum/reminder/direction data, immutable schedules, interpretation snapshots and canonical habit-session pointers. No additional archive file/store is introduced. Disabled and paused modules retain these arrays in full ZIPs and recovery snapshots. Import validates ownership exclusivity, habit/date/entry references, rule snapshots, day-off metadata, minimum text, duplicate habit/date rows and the existing interval/ZIP/media limits.

New no_entry identity rows represent explicitly planned occurrences only. Restoring preserves custom IDs and released/original intervals. Clearing a referenced occurrence keeps its identity; explicit confirmed whole-habit deletion removes only that habit's entries and sessions. v7 archives require a v7-capable reader. Old supported archives with absent new fields preserve their existing data and semantics without automatic inferred dates, minimum targets or allocations.

## M9 / v8 Wishlist compatibility

Current DB/ZIP versions are 8; v1–v8 imports remain supported. The native v7→v8 upgrade changes only settings.dbSchemaVersion. It does not rewrite wishes, categories, prices, timestamps, archive flags or module preferences, and never clears/reseeds data or invents purchasedAt.

New optional purchase/link/media/project fields serialize in the existing wishes array. The existing categories, timing groups, legacy fulfillment fields, ExactPrice representation, media metadata and media/ bytes remain intact. Old fulfilled/archived records without purchase fields round-trip unchanged. BigInt intermediates are converted to exact safe integers before persistence, so JSON/ZIP price compatibility is unchanged.

Import validates current statuses, explicit purchase timestamps, safe protocols, project/category/media references, exact prices and existing raster content/size/checksum rules. Local file selection additionally requires successful browser decoding; broken images have a Ukrainian local fallback rather than remote loading. Disabled Wishlist data/media and all purchase/archive/legacy scopes remain in full exports and recovery snapshots. Reference-aware cleanup considers all live wishes/inspiration and retained recovery snapshots before releasing bytes. No new archive files/stores or automatic conversions are added.

Browser ZIP writing drains CompressionStream concurrently to avoid a Chromium backpressure stall; format, checksums and limits are unchanged. The existing explicit import preview/confirmation is retained and remains clickable inside Settings. Disabled-module export/import was executed in an isolated browser with wishes and actual local images.


## M10 integration and recovery hardening (current)

Database schema **9**, ZIP format **8**, app version **0.3.0**. The schema bump is a compatibility barrier for older clients whose replacement path bypassed generation guards. It changes only settings schema metadata; no entity, relationship, text, price, timestamp, ID or history is rewritten. Native upgrades accept old database versions 1–8. Backup versions 1–8 with database schemas 1–9 are supported; future versions are refused. Older local recovery snapshots use the same migration chain on restoration/export. Current archives must contain every required collection; legacy omissions are filled only for the documented v1 migration.

Complete payload coverage is `PlanuiDomainSnapshot` in `src/domain/types.ts`: all 18 domain arrays, settings, and referenced media bytes. Checkpoints, schedule versions/snapshots, lifecycle/release metadata and daily plans are embedded in their canonical records. Directions/folders, goals, projects, stages, tasks, dates/deadlines, reservations (including habit sessions), events/shifts, explicit days off/templates, habits/logs, life areas/question/scale/review snapshots, check-ins/sleep/legacy diary, preferred life/saved inspiration, Wishlist categories/statuses/legacy fulfillment/exact prices/currencies/timing/links/images all survive. Manual zones, explicit module preferences and archive flags are included even when every optional module is disabled. Derived projections, session navigation, resource caches and recursive recovery history remain excluded.

Validation rejects inconsistent local/central ZIP headers, encrypted/data-descriptor/unsupported flags, ZIP64/multidisk archives, symlinks, overlapping entries, alternate Unicode paths, case/Unicode-equivalent duplicate paths, controls/percent escapes/traversal and unexpected or unreferenced files. This is the supported subset produced by PLANUI, not a general-purpose ZIP reader. Per-entry declared and streamed limits apply before JSON parsing; aggregate limits and CRC/SHA-256 are checked. Browser imports additionally decode bounded images before a preview is accepted. Non-browser tests validate raster signatures/dimensions; they do not substitute for browser decoding. Checksums detect corruption, not authenticity. The conservative runtime limits above correct earlier documentation drift; no limit was raised.

A successful validation owns a private copy of its preview payload. Callers cannot fabricate a preview or change the validated records/media before replacement. Repetitive user text is stored uncompressed when compression would exceed the reader's ratio bound; successful exports satisfy the same size bounds as imports. Failed export never changes live data.

Replacement, recovery restoration and reset acquire one read-write transaction covering **all stores in the single `planui_local_db` IndexedDB database**. Within that transaction they verify stored schema/generation, capture the latest committed live snapshot, evict older recovery points, write the new protective point, replace records/settings/media, collect unreferenced blobs and rotate generation. The newly created recovery point is always retained, including equal timestamps or clock rollback. Up to two previous points remain. No non-IDB asynchronous hashing/decompression runs inside this transaction. Failure, abort or quota exhaustion rolls the entire operation back, including eviction and generation. No unsafe no-snapshot fallback is performed. Export and explicit snapshot management remain available. Existing blob IDs are immutable: an incoming ID with different bytes is rejected to protect recovery images.

This atomic boundary does **not** include localStorage's theme hint, sessionStorage, CacheStorage, downloads or another database. The theme hint is refreshed separately after commit and has no canonical data. Recovery points are local copies in the same browser database, not external backups. Ordinary ZIP/JSON and browser records are not application-encrypted. Browser-origin isolation and device/browser access controls are the actual protection; PLANUI adds no authentication/PIN/encryption. Clearing site data, storage eviction, private browsing or device loss can remove live data and recovery points. Explicit reset/deletion does not promise forensic secure erasure. The browser cannot confirm final external file persistence.

Generation is acknowledged only after successful commit. Receiving replacement notices does not reload or silently discard stale forms: the old input stays visible, writes fail, and an explicit reload warns about losing unsaved input. Persisted guards also work without BroadcastChannel delivery. Import notices are advisory independent 30-second leases; interrupted tabs cannot permanently lock the UI. IndexedDB locking/generation checks remain authoritative after a lease expires. Newer native schemas fail closed with a localized message; blocked upgrade attempts are abandoned without leaking a connection.

Evidence and reproducible commands: `docs/RELEASE_CHECKLIST.md`, `src/storage/__tests__/stageM10.test.ts`, and `scripts/check-m10-browser.mjs`. Final PWA/deployment/device verification is outside M10.
