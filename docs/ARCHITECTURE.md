# PLANUI Architecture

## 1. Architectural Principles

PLANUI is a local-first, offline-capable, mobile-first personal planner engineered as a static client-side single-page application (SPA) and Progressive Web App (PWA).

1. **Zero Mandatory Server Runtime**: All domain logic, persistence, scheduling, roster parsing, exact price validation, media inspection, and ZIP backup/restore execute deterministically in the browser.
2. **Single Source of Truth**: One transactional IndexedDB database (`planui_db`) holds all domain entities. Views (`Calendar`, `Plans`, `Today`, `Habits`, `Me`) are reactive projections over the same normalized records—never separate per-screen stores.
3. **Pure Domain & Temporal Core**: Temporal calculations, interval union/gap math, folder cycle detection, roster text parsing, habit streak evaluation, and exact decimal currency utilities are implemented as pure, framework-agnostic TypeScript modules under `src/domain/` and `src/utils/` so they can be verified deterministically with `node:test` (`npx --yes tsx --test`).
4. **Shared Contextual Creation & Editing**: One persistent global creation button and one shared modal/sheet editor host coordinate creation and editing across all five primary destinations, protecting unsaved input and maintaining accessibility focus.

---

## 2. Existing Workspace Reuse vs. Unused Starter Packages

### Reused from Starter Scaffold
- **Build & Runtime**: Vite 8 (`vite`), React 19 (`react`, `react-dom`), TypeScript 7 (`typescript`), `tsx` (for running `node:test` suites).
- **Styling & Icons**: Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`), Lucide icons (`lucide-react`), Motion (`motion` for restrained, reduced-motion-aware transitions).

### Present in `package.json` Made Inactive / Unused by Application
- `@google/genai`, `express`, `dotenv`: Present in the initial AI Studio template scaffold. Per C02 and C21 ("Do not introduce... runtime AI", "Core operation must work from static HTTPS hosting. No mandatory backend, cloud database, API key, paid runtime, or AI service"), PLANUI will **never** import or invoke `@google/genai` or require an Express backend.

---

## 3. Target Source Structure (Stages 2–12)

```text
/
├── docs/                          # Persistent contract & engineering documentation (Stage 1+)
├── public/                        # PWA icons, manifest.webmanifest, service worker assets (Stage 12)
├── src/
│   ├── i18n/                      # Ukrainian (uk-UA) dictionary, formatters, pluralization (Stage 3+)
│   ├── domain/                    # Pure domain models, validators, invariants, business logic
│   │   ├── types.ts               # Canonical TypeScript interfaces & schema version constants
│   │   ├── validation.ts          # Deterministic runtime schema & invariant validators
│   │   ├── folders.ts             # Cycle detection, ancestor paths, rehome/recursive delete
│   │   ├── projects.ts            # Progress math, stage ordering, completion/archive checks
│   │   ├── tasks.ts               # Task lifecycle, checklist promotion, deadline classification
│   │   ├── temporal.ts            # IANA zone handling, LocalDate math, DST & half-open intervals
│   │   ├── availability.ts        # Interval union, occupied totals, unoccupied gap calculation
│   │   ├── roster.ts              # Shift template instantiation, deterministic text parser, summaries
│   │   ├── habits.ts              # Effective-dated schedule rules, entry states, transparent streaks
│   │   ├── me.ts                  # Personal records, life area assessments, inspiration validation
│   │   ├── wishlist.ts            # Wishes, flat categories, timing groups, exact money arithmetic
│   │   └── __tests__/             # Fast node:test unit tests for all pure domain modules
│   ├── storage/                   # IndexedDB persistence, transactions, multi-tab coordination
│   │   ├── db.ts                  # IndexedDB connection, schema migrations, isolated test DB factory
│   │   ├── repositories.ts        # Transactional domain repositories with revision checking
│   │   ├── tabSync.ts             # BroadcastChannel + storage generation & stale-write detection
│   │   ├── mediaStore.ts          # Image magic-byte verification, dimension/memory checks, blob GC
│   │   └── backup/                # ZIP archive creation, CRC32/SHA-256 verification, snapshot restore
│   │       ├── zipCodec.ts        # Pure streaming/bounded ZIP reader & writer (store/deflate)
│   │       ├── exportBackup.ts    # Coherent snapshot export to manifest.json + data.json + media/
│   │       ├── validateBackup.ts  # Pre-import security, checksum, reference & domain validation
│   │       └── restoreBackup.ts   # Pre-replacement recovery snapshot + atomic live replacement
│   ├── state/                     # Reactive UI store & navigation context preservation
│   │   ├── appStore.ts            # Subscribable state over IndexedDB + tabSync
│   │   └── navigationStore.ts     # 5 primary destinations, per-tab scroll/filter/date context
│   ├── components/
│   │   ├── shell/                 # Responsive layout shell, FloatingNavCapsule, GlobalCreateButton
│   │   ├── editors/               # SharedEditorHost, dirty-form guard, contextual creation sheet
│   │   ├── timeline/              # Shared proportional DayTimeline (used by Today & Calendar Day)
│   │   └── ui/                    # Semantic accessible primitives (Dialog, Select, SegmentedControl)
│   └── views/
│       ├── calendar/              # MonthView (with work strip), WeekView, DayView, WorkScheduleView
│       ├── plans/                 # FolderBrowser, ProjectDetailView, TaskListView, BatchActionBar
│       ├── today/                 # TodayWorkspace (header, nearest commitment, habits, timeline, tomorrow)
│       ├── habits/                # HabitsView, HabitDetailSheet, EffectiveRuleEditor
│       └── me/                    # MeOverview, JournalAndStateView, LifeAreasView, InspirationView,
│                                  # WishlistView, SettingsAndBackupView
```

---

## 4. Core Architectural Subsystems

### 4.1 Temporal Engine (`src/domain/temporal.ts`)
- **Three Distinct Temporal Types**:
  1. `InstantISO` (UTC epoch milliseconds / ISO-8601 `Z` string) for exact moments (`createdAt`, `updatedAt`, `completedAt`, timed deadlines).
  2. `ZonedTimeRecord` (`startInstant`, `endInstant`, `timeZone: IanaZoneId`, `startLocalDate`, `startLocalTime`, `endLocalDate`, `endLocalTime`) for calendar events, work shifts, and task reservations.
  3. `LocalDateString` (`YYYY-MM-DD`) for date-only task intentions, date-only deadlines, habit entries, day-off markers, and informational all-day dates.
- **Zero 24-Hour Millisecond Drift**: All calendar date stepping (`addDays`, `daysBetween`, week/month grid construction) uses pure proleptic Gregorian calendar arithmetic (`Intl.DateTimeFormat` parts / `Temporal` polyfill-compatible helpers), never `ms + 86400000`.
- **Time Zone Governance**: Detects device IANA zone via `Intl.DateTimeFormat().resolvedOptions().timeZone`. If detection returns empty/`UTC` without confirmation or fails, prompts the user explicitly (never silently defaults to `Europe/Kyiv`). Supports manual zone override and foreground zone-change detection in device mode.

### 4.2 Transactional Storage & Multi-Tab Coordination (`src/storage/`)
- **Single IndexedDB Database**: All stores reside in one versioned IndexedDB database so cross-entity mutations (e.g., completing a task and releasing its future reservations, deleting a wishlist category and uncategorizing its wishes, applying a roster batch, or restoring a backup snapshot) execute in a single atomic IndexedDB `readwrite` transaction.
- **Revision-Guarded Writes**: Every mutable record carries a monotonically increasing integer `revision`. Editors capture the loaded `revision`; before committing, the repository transaction verifies `current.revision === expectedRevision`. If another tab modified the record, the transaction aborts and surfaces a Ukrainian conflict dialog rather than silently overwriting.
- **Multi-Tab Channel**: `BroadcastChannel('planui_sync')` broadcasts committed transaction summaries (`storeNames`, `generationId`, `revision`) so sibling tabs refresh projections immediately and lock UI during backup replacement.

### 4.3 Shared Proportional Timeline & Availability Engine
- Both `Today` and `Calendar -> Day` render the exact same `DayTimeline` component backed by `availability.ts`.
- Blocking intervals (work shifts, active task reservations, blocking events, manual blocking sleep/rest/travel) are merged into a canonical disjoint union over the viewing window `[windowStart, windowEnd)` to compute true occupied duration and unoccupied gaps.
- Overnight shifts are stored as a single event record and projected into day segments (`[shiftStart, midnight)` on Day 1 and `[midnight, shiftEnd)` on Day 2) so editing either segment opens the single underlying shift record.

### 4.4 Wishlist & Exact Money Subsystem (`src/domain/wishlist.ts`)
- **Strict Isolation from Tasks & Finance**: Wishes and flat wishlist categories live in dedicated object stores (`wishes`, `wishlist_categories`) inside the shared IndexedDB database. Wishes never project onto the calendar, never block availability, and never auto-convert into tasks or expenses.
- **Exact Decimal Representation**: Prices are stored as `{ amountMinor: number; currency: IsoCurrencyCode; formattedCanonical: string }` (or validated decimal string + integer minor units according to ISO-4217 currency exponent `0`, `2`, or `3`)—never IEEE-754 float math.


### M4: informational roadmap projection

src/domain/roadmap.ts projects canonical goals, projects and flat stages, filters planning states, derives calendar-date intervals and markers, validates metadata, and reports clear plan inconsistencies. src/views/RoadmapView.tsx supplies global/detail lists, undated items, explicit stage creation and non-drag ordering. The calendar's RoadmapCalendarLayer.tsx renders an independent informational date lane for the visible month/week/day range with explicit overflow, rather than adding all-day events or timed overlap lanes.

Both surfaces use PlanuiRepositories.updateRoadmapItem with expected revision. It changes only the selected canonical record; deadline edits write existing canonical fields. Period or checkpoint moves never call reservation/event/task planning operations. The existing scheduling engine receives no roadmap metadata and remains the only occupancy authority. Timed sessions continue through the existing task planner with task references; periods never create sessions.

No dependency graph, dependency controls, plan generator, or automatic scheduling engine is included in M4. Full browser/device verification remains pending the available project dependencies.


### M5 Today working space

src/domain/today.ts supplies date-aware task projection, explicit focus suggestions, daily-plan validation, exact planning-change previews, elapsed-duration session construction, and validated interaction restoration/current-time gating. TodayWorkspaceView reuses SharedDayTimeline for both consecutive dates at one scale and separates Day/Tasks/optional Habits presentation. components/today provides focus, task list and planning forms; existing gap selection and lifecycle code remain in use.

Focus/minimal-day writes update only the selected date in settings. Effort writes update only the canonical task metadata. Planning changes use existing transactional operations, with an optional reviewed reservation revision map for exact preview protection. New session creation can additionally guard the task revision/state. Single ongoing-reservation release retains its elapsed active interval and original bounds, matching lifecycle partial-release semantics.

Minimal-day rendering never filters scheduling inputs. Work/blocking records and deadlines remain in the Day timeline and a compact summary in other modes. Availability remains the union of the same blocking sources. Current-time positioning runs after first mount only if saved interaction does not take precedence; clock updates do not trigger it. Internal mode changes preserve separate in-memory scroll positions; session context restores the last selected date/mode/scroll without changing persisted planning.


### M6 latest approved scope: life areas and lightweight reviews

src/domain/lifeAreas.ts defines the exact ten-area framework, immutable new review snapshot builder, canonical effective relationship projection, merge preview signature, and read-only planning-review projection. It reuses resolveEffectiveLifeArea from M1 and the existing union-availability engine. LifeAreasReviewView replaces the old 1–10-only live form while rendering every legacy review using its original scale and stored snapshots. PlanningReviewPanel is a manual entry point inside Я, not a journal or recurrence engine.

Fresh initialization seeds only a genuinely new store with the editable ten-area defaults. Existing settings/area stores, including empty ones, do not trigger reseeding. Starter additions or mappings require explicit selection; names are never matched heuristically.

Area merge is a single transaction over areas and the live relationship stores. Confirm the reviewed source/target revisions and effective-link signature; reassign direct references only, retain the archived source identity and preserve historical assessments. The transaction does not include the assessment store and cannot rewrite scores or question snapshots. Normal assessment saving is create-only. Related tasks/plans/reservations are projected dynamically; no assignment copies or aggregate life scores exist.

Review answers alone write only a review record. Planning effects route through explicit linking/task editors, project pause confirmation, normal scope editors, the shared roadmap, or the M5 exact reservation/assignment preview. Manual planning review uses canonical events including non-blocking recovery, reservations and date/deadline tasks with origin-zone interval semantics and union occupancy. It never assumes free time implies usable energy.

This user-approved M6 scope supersedes the earlier habit-stage numbering only for the requested work; habit rule enhancements remain deferred. Native browser/device verification remains outstanding.
