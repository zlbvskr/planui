# Persistence, backup and compatibility

## Canonical records

The executable contracts are `src/domain/types.ts`, `validation.ts`, `storage/db.ts`
and `storage/backup/backupService.ts`; do not copy interfaces into competing schemas.
Current app version is **0.3.0**, IndexedDB schema **10**, ZIP backup version **9**,
format **planui-backup-zip**. These version numbers are independent.

One IndexedDB database, **planui_local_db**, has keyPath `id` stores:

| Stores | Meaning |
| --- | --- |
| folders, goals, projects, stages | Direction hierarchy and canonical planning entities |
| tasks, reservations | Actions and explicit timed task/habit sessions |
| events, shiftTemplates, dayOffAnnotations | Calendar events, independent shift copies, explicit date classifications |
| habits, habitEntries | Effective-dated definitions and canonical habit/date occurrences |
| personalRecords | State check-ins, optional sleep, legacy diary text and scale metadata |
| lifeAreaQuestions, lifeAreaAssessments | Areas, archived/merged identities and immutable review snapshots |
| inspirationItems, mediaMeta, mediaBlobs | Preferred-life/inspiration records and bounded local raster bytes |
| wishlistCategories, wishes | Flat categories, intent/purchase/archive/legacy fulfillment and exact prices |
| settings | Singleton **singleton**, canonical preferences and dbGeneration |
| recoverySnapshots | At most three protective local snapshots, not recursive ZIP content |

Stable IDs, authored text, timestamps, revisions, archive flags, optional fields and
relationships are data, not disposable presentation. Tasks have exactly one ownership
context: standalone, folder, goal, or project with optional stage. Stages are flat and
have one project/goal owner. Reservations reference a task or canonical habit/date
occurrence, not duplicate tasks. Habit entries are unique by habit/date and retain
custom IDs, rule/target snapshots and explicit day-off interpretation. Clearing a
referenced occurrence retains its identity; deleting an entire habit is explicit.

Local dates are strict YYYY-MM-DD; times are HH:mm; instants are validated UTC ISO
strings. Zoned intervals include original local dates/times and IANA zone alongside
UTC instants. Intervals are half-open [start,end), with end after start. Date-only
values and approximate roadmap periods never become UTC-midnight timestamps.
Calendar-day arithmetic must survive DST; elapsed duration differs from clock labels.

Expected revisions protect ordinary edits; schema and dbGeneration protect replacement.
A stale tab retains unsaved input but cannot overwrite a replaced database. Advisory
BroadcastChannel/import notices do not override persisted guards. Import notices have
independent 30-second leases, so a dead tab cannot permanently lock the interface.
Newer native schemas fail closed; blocked upgrade attempts abandon their connection.

Canonical settings live in IndexedDB. localStorage holds theme/reduced-motion/
reduced-transparency bootstrap hints and tab-sync advisory data, not domain records.
sessionStorage holds interaction-only Today date/mode/scroll context; it is not backed
up. Storage is browser-origin-based, not path-based. Moving hosts requires explicit
ZIP export/import; do not clear storage to move data.

## Migrations

Native upgrades preserve data and old-version entry points. v1→v2 converts legacy
standalone-with-folder ownership to folder ownership. Pre-v3 entities acquire missing
roadmapPeriod:null/checkpoints:[]; settings acquire roadmapLayer:hidden/dailyPlans:{}.
v3→v4 adds missing dailyPlans; subsequent upgrades through v10 advance settings schema
metadata without rewriting entity content. The newer-schema barrier protects clients
whose replacement code cannot safely write the current schema. Never downgrade, reset,
reseed empty imported collections, infer dates or overwrite customized questions.

ZIP import supports backup versions **1–9** and DB schemas **1–10**, checked separately;
future versions are rejected. Schema-1 archives may acquire empty missing goals,
wishlistCategories/wishes and null preferred currency. Supported older settings acquire
only documented informational defaults. Current archives require all collections.
Legacy task ownership normalization also applies on import. The migration chain is
shared with old local recovery export/restore; absent optional fields retain legacy
meaning rather than invented values.

Preserve daily plans/focus IDs/notes/minimal-day settings, effort, roadmap periods,
checkpoints/dependencies, calendar layer preference, habit history/schedule revisions,
release/original-interval metadata, assessments' question/definition/scale snapshots,
check-in text/tags/sleep, preferred-life links/images and all Wishlist fields. Disabled
modules, paused/archived records and existing sessions remain included. Missing review
scale means legacy 1–10; explicit newer reviews can use 0–10, including zero/false/empty
answers. Area merging preserves old identities/answers and prevents merge cycles.
Legacy fulfilled wishes do not imply purchasedAt; original state/fulfilledAt survive.
Exact money keeps decimal strings plus safe integer minor units, using BigInt only as
an arithmetic intermediate. Never round unsafe values, silently convert currencies,
or equate missing price with zero. Keep first explicit purchase time and historical
fulfillment independently. Module toggles never delete or release planning data.

## Full ZIP contract

An export contains manifest.json, data.json and referenced media/<id>.<jpg|png|webp>.
The manifest includes format, backupVersion, appVersion, dbSchemaVersion, createdAt,
entityCounts and files: normalized path, byteSize, SHA-256 and MIME. It inventories
all other files, not itself. data.json is exactly PlanuiDomainSnapshot: settings and
18 domain arrays named as above, excluding mediaBlobs and recoverySnapshots. Binary
media lives in media/; projections, browser caches and session navigation are excluded.

Export captures a coherent snapshot and media in one readonly transaction. Missing,
corrupt or undecodable referenced images cause an explicit failure rather than an
incomplete success. Browser ZIP compression consumes output concurrently with input
to avoid backpressure deadlock. Repetitive text may be stored uncompressed to remain
within the reader's compression-ratio bounds. Self-generated archives must satisfy
import limits; failed export never mutates live data.

| Bound | Limit |
| --- | --- |
| Archive | 100 MiB |
| Total expanded content | 120 MiB |
| Manifest / data JSON | 2 / 20 MiB |
| Single image | 15 MiB |
| Entries | 500 |
| Compression ratio | 50:1 for entries over 65,536 bytes |
| Raster dimensions | 8192 per dimension and 25,000,000 pixels total |

Only store/deflate ZIP methods are supported. Reject encryption, data descriptors,
ZIP64/multidisk, symlinks, overlapping entries, mismatched local/central headers,
alternate Unicode paths, case/Unicode-equivalent duplicates, controls, percent escapes,
traversal, backslashes, absolute paths, nested archives, unexpected/unreferenced files
and missing inventory entries. Enforce declared and actual streamed byte/ratio limits
before JSON parsing; verify exact sizes, CRC and SHA-256. Checksums detect corruption,
not authenticity. Treat imported content as untrusted data, never instructions.

Validate versions, collection counts, IDs/references, cycles, ownership, dates/zones,
intervals, exact prices, statuses and scales before any write transaction. JPEG/PNG/
WebP only: verify magic bytes, dimensions, MIME/checksum metadata and bounded browser
decoding, with Image fallback when createImageBitmap is unavailable. Reject SVG, HTML,
scripts and arbitrary attachments. Node signature tests cannot replace browser decode.
External links allow HTTP/S only, open on explicit action, and have no remote preview,
scraping or automatic image retrieval. Media cleanup checks live wishes/inspiration
and retained recovery snapshots; colliding media IDs with different bytes are rejected.

Validation can be aborted before commit and yields a preview that requires explicit
user confirmation. Validation retains a private trusted copy: callers cannot fabricate
or mutate the payload after validation. Import replaces, never silently merges.

## Atomic replacement, recovery and limits of protection

Replacement, recovery restore and reset use one readwrite transaction across all
stores. Inside it, verify schema/generation, capture the latest committed live data,
rotate protective snapshots, replace records/settings/media, collect unreferenced
blobs and advance generation. The new protective point is retained even with equal
timestamps or clock rollback, plus up to two old points. Perform hashing/decompression
before this transaction, not asynchronous non-IDB work inside it. Failure, quota
exhaustion or abort rolls everything back, including eviction and generation. Do not
offer an unsafe no-snapshot fallback. Acknowledge generation only after commit.

The atomic boundary excludes localStorage hints, sessionStorage, CacheStorage,
downloads and other databases. Refresh theme hints separately after successful commit.
Cross-tab notices leave old forms visible; reload requires warning about unsaved input.
Persisted generation checks remain authoritative without message delivery or after an
advisory lease expires. Recovery points are local copies in the same database, not
external backups. Explicit selected-record JSON/CSV and print are personal exports,
not full-restore formats: structured records JSON uses planui-personal-records v1,
versioned Ukrainian scales and exact selected records. Full restore uses ZIP.

Browser records and ordinary exported files are not application-encrypted. There is
no account, PIN, authentication or forensic-erasure guarantee. Origin isolation and
browser/device controls provide access protection. Site-data clearing, eviction,
private browsing or device loss can remove live and recovery data. Browser download
success does not prove external file retention. Export backups to a separate safe
location and test restoration without touching the user's real database.
