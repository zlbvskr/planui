# PLANUI Data Model and Storage Specification

## 1. Version Separation & Database Identity

- **Application Version**: `1.0.0` (semver string tracking application build).
- **Database Name**: `planui_db` (isolated test runs use `planui_test_<uuid>`).
- **Database Schema Version**: `1` (integer passed to `indexedDB.open('planui_db', 1)`).
- **Backup Format Identifier & Version**: `format: "planui-backup"`, `backupFormatVersion: 1`.
- **Bootstrap Theme Cache**: `localStorage.getItem('planui_theme_bootstrap')` (`"system" | "light" | "dark"`) is the only permitted `localStorage` entry to prevent initial paint flash before IndexedDB opens. All canonical settings live in the `settings` object store.

---

## 2. Common Scalar & Temporal Types

```ts
export type EntityId = string;          // UUIDv4 or deterministic ULID/UUID
export type InstantISO = string;        // UTC ISO-8601 instant, e.g. "2026-11-02T08:15:00.000Z"
export type LocalDateString = string;   // Strict "YYYY-MM-DD" calendar date
export type LocalTimeString = string;   // Strict "HH:mm" 24-hour clock value ("00:00" .. "23:59")
export type IanaZoneId = string;        // Valid IANA time zone identifier, e.g. "Europe/Kyiv", "America/New_York"
export type IsoCurrencyCode = string;   // Valid 3-letter uppercase ISO 4217 code, e.g. "UAH", "EUR", "USD", "PLN", "GBP", "JPY"
export type RevisionNumber = number;    // Positive integer >= 1, incremented on every write
```

---

## 3. Object Stores & Entity Schemas

### 3.1 `folders` (KeyPath: `id`)
Organizes subfolders, projects, and standalone tasks with unbounded depth and strict cycle prevention.
- **Indexes**: `by_parentId` (`parentId`), `by_order` (`order`).

```ts
export interface FolderRecord {
  id: EntityId;
  name: string;                    // Non-empty trimmed string
  parentId: EntityId | null;       // null = root level; never self or descendant
  order: number;                   // Finite sort index within parent
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.2 `projects` (KeyPath: `id`)
Represents concrete outcomes (replaces any separate global goal hierarchy).
- **Indexes**: `by_folderId` (`folderId`), `by_state` (`state`), `by_archived` (`isArchived`), `by_lifeAreaId` (`lifeAreaId`).

```ts
export type ProjectState = 'active' | 'paused' | 'completed';

export interface ProjectStage {
  id: EntityId;
  title: string;
  description?: string;            // Expected stage outcome / description
  targetDate?: LocalDateString | null;
  order: number;
}

export interface ProjectRecord {
  id: EntityId;
  title: string;
  description?: string;
  desiredOutcome: string;          // Concrete outcome description
  completionCriteria?: string;
  targetDate?: LocalDateString | null;
  folderId: EntityId | null;
  lifeAreaId?: string | null;
  collaboratorsText?: string;      // Descriptive text only; never creates accounts/sharing
  state: ProjectState;
  isArchived: boolean;             // Separate from result state
  stages: ProjectStage[];          // Flat single-level ordered array inside project
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
  completedAt?: InstantISO | null;
}
```

### 3.3 `tasks` (KeyPath: `id`)
Represents specific actionable items.
- **Indexes**: `by_folderId` (`folderId`), `by_projectId` (`projectId`), `by_state` (`state`), `by_plannedDate` (`plannedDate`), `by_planningMode` (`planningMode`).

```ts
export type TaskState = 'open' | 'completed' | 'canceled';
export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskPlanningMode = 'undated' | 'date_only' | 'timed';

export type TaskDeadline =
  | { kind: 'date_only'; date: LocalDateString }
  | { kind: 'instant'; instant: InstantISO; timeZone: IanaZoneId };

export interface ChecklistItem {
  id: EntityId;
  title: string;
  order: number;
  isCompleted: boolean;
}

export interface TaskRecord {
  id: EntityId;
  title: string;
  description?: string;
  state: TaskState;
  priority: TaskPriority;          // Default: 'normal'; never auto-escalated
  deadline?: TaskDeadline | null;
  estimatedMinutes?: number | null;// Positive integer minutes when provided
  planningMode: TaskPlanningMode;
  plannedDate?: LocalDateString | null; // Populated ONLY when planningMode === 'date_only'
  // Ownership invariant:
  // Either standalone (projectId = null, stageId = null, folderId = string | null)
  // Or project-owned (projectId = string, stageId = valid stage ID in project | null, folderId = null)
  folderId: EntityId | null;
  projectId: EntityId | null;
  stageId: EntityId | null;
  checklist: ChecklistItem[];      // Flat single level; supports promotion to TaskRecord
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
  completedAt?: InstantISO | null;
  canceledAt?: InstantISO | null;
}
```

### 3.4 `task_reservations` (KeyPath: `id`)
Timed scheduling blocks referencing an existing `TaskRecord` (never duplicating the task).
- **Indexes**: `by_taskId` (`taskId`), `by_state` (`state`), `by_startInstant` (`startInstant`), `by_startLocalDate` (`startLocalDate`).

```ts
export type ReservationState =
  | 'active'                       // Currently scheduled and blocking time
  | 'completed_on_time'            // Task completed after reservation end
  | 'released_partial'             // Task completed/canceled while reservation was ongoing
  | 'released_future'              // Task completed/canceled before reservation started
  | 'canceled';                    // Explicitly removed/canceled reservation

export interface TaskReservationRecord {
  id: EntityId;
  taskId: EntityId;
  state: ReservationState;
  // Effective interval (for 'released_partial', endInstant is truncated to completion instant)
  startInstant: InstantISO;
  endInstant: InstantISO;
  timeZone: IanaZoneId;
  startLocalDate: LocalDateString;
  startLocalTime: LocalTimeString;
  endLocalDate: LocalDateString;
  endLocalTime: LocalTimeString;
  // Original planned interval preserved for history & bounded undo
  originalPlannedStartInstant: InstantISO;
  originalPlannedEndInstant: InstantISO;
  originalStartLocalDate: LocalDateString;
  originalStartLocalTime: LocalTimeString;
  originalEndLocalDate: LocalDateString;
  originalEndLocalTime: LocalTimeString;
  releasedAt?: InstantISO | null;
  releaseReason?: 'task_completed' | 'task_canceled' | 'manual_release' | 'project_archived' | null;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```
*Note on Stage 5 Lifecycle & Bounded Undo*:
- Completing or canceling a task runs inside a single IndexedDB transaction over `tasks` and `task_reservations`:
  - Future active reservations (`startInstant >= actionInstant`) transition to `'released_future'`.
  - Ongoing active reservations (`startInstant < actionInstant && endInstant > actionInstant`) transition to `'released_partial'` with `endInstant` truncated to `actionInstant` while `originalPlannedStartInstant` and `originalPlannedEndInstant` remain intact.
  - Past active reservations (`endInstant <= actionInstant`) transition to `'completed_on_time'` on task completion (or remain past planned intervals) and are never labeled as actual tracked work.
- Bounded immediate undo (`TaskLifecycleUndoToken`) verifies both task and reservation `revision` numbers before restoring prior state; if revisions changed in the interim, undo rejects with `STALE_WRITE_CONFLICT`. Restored intervals are checked against current active commitments and report overlaps without auto-shifting or auto-resolving conflicts.

### 3.5 `calendar_events` (KeyPath: `id`)
Unified store for personal calendar events, manual rest/sleep/travel intervals, and work shifts (C09).
- **Indexes**: `by_kind` (`kind`), `by_state` (`state`), `by_startInstant` (`startInstant`), `by_startLocalDate` (`startLocalDate`).

```ts
export type CalendarEventKind = 'personal' | 'work_shift' | 'rest' | 'sleep' | 'travel';
export type CalendarEventState = 'active' | 'canceled';
export type EventPaletteColor = 'work' | 'day_off' | 'personal' | 'reservation' | 'rest' | 'brand';

export interface CalendarEventRecord {
  id: EntityId;
  kind: CalendarEventKind;
  title: string;                   // Shift name/type when kind === 'work_shift'
  note?: string;
  color: EventPaletteColor;
  isAllDay: boolean;
  isBlocking: boolean;             // True for work shifts, blocking personal events, blocking rest/sleep/travel
  state: CalendarEventState;
  // Timed or Blocking All-Day interval boundaries:
  startInstant: InstantISO;
  endInstant: InstantISO;          // Strictly > startInstant (half-open [start, end))
  timeZone: IanaZoneId;            // Record creation/source zone
  startLocalDate: LocalDateString;
  startLocalTime: LocalTimeString; // "00:00" when isAllDay === true
  endLocalDate: LocalDateString;   // Exclusive end date for all-day, or local end date for timed
  endLocalTime: LocalTimeString;
  // Work-shift specific optional metadata (copied on instantiation; independent of later template edits):
  shiftCode?: string | null;
  sourceTemplateId?: EntityId | null;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```
*Note on Overnight Shifts*: Crossing midnight is derived dynamically (`startLocalDate !== endLocalDate` in the display/record zone)—there is no separate boolean `isOvernight` field that could become contradictory.

### 3.6 `shift_templates` (KeyPath: `id`)
Reusable templates for the Work Schedule editor (C13).
- **Indexes**: `by_code` (`code`, unique), `by_order` (`order`).

```ts
export interface ShiftTemplateRecord {
  id: EntityId;
  name: string;
  code: string;                    // Short user code, e.g. "Д", "Н", "S1"
  startLocalTime: LocalTimeString;
  endLocalTime: LocalTimeString;
  endDateOffsetDays: 0 | 1;        // Explicit 0 (same day) or 1 (next day)
  color: EventPaletteColor;
  note?: string;
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.7 `day_off_annotations` (KeyPath: `id`)
Explicit day-off markers with source-zone context (C08, C10, C13). Non-blocking; does not erase overnight carryover from a previous night's shift.
- **Indexes**: `by_localDate` (`localDate`).

```ts
export interface DayOffAnnotationRecord {
  id: EntityId;
  localDate: LocalDateString;
  sourceTimeZone: IanaZoneId;
  code?: string;                   // e.g. "В" (Вихідний)
  note?: string;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.8 `habits` (KeyPath: `id`) & `habit_entries` (KeyPath: `id`)
Supportive recurring actions with effective-dated schedule revisions (C14).
- **`habits` Indexes**: `by_state` (`state`), `by_order` (`order`).
- **`habit_entries` Indexes**: `by_habitId_date` (`[habitId, localDate]`, unique), `by_localDate` (`localDate`).

```ts
export type HabitState = 'active' | 'paused' | 'archived';

export type HabitScheduleRule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; daysOfWeek: number[] } // 1 = Monday .. 7 = Sunday
  | { kind: 'weekly_frequency'; timesPerWeek: number }; // 1 .. 7

export type HabitTarget =
  | { kind: 'binary' }
  | { kind: 'numeric'; targetValue: number; unit: string };

export interface HabitRuleRevision {
  effectiveFromDate: LocalDateString; // Sorted ascending; preserves past history under old rules
  scheduleRule: HabitScheduleRule;
  target: HabitTarget;
}

export interface HabitRecord {
  id: EntityId;
  name: string;
  description?: string;
  icon?: string;
  lifeAreaId?: string | null;
  projectId?: EntityId | null;
  state: HabitState;
  ruleHistory: HabitRuleRevision[];   // At least one revision
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}

export type HabitEntryStatus = 'completed' | 'partial' | 'skipped';

export interface HabitEntryRecord {
  id: EntityId;
  habitId: EntityId;
  localDate: LocalDateString;         // Explicit local calendar date; never shifted by zone changes
  status: HabitEntryStatus;           // 'skipped' is never counted as completion
  numericValue?: number | null;       // Present for numeric habits
  note?: string;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.9 `personal_records` (KeyPath: `id`)
Unified model for quick state check-ins and journal entries (C15).
- **Indexes**: `by_recordedAt` (`recordedAt`), `by_localDate` (`localDate`).

```ts
export type Scale1To5 = 1 | 2 | 3 | 4 | 5;

export interface PersonalRecord {
  id: EntityId;
  recordedAt: InstantISO;
  localDate: LocalDateString;
  timeZone: IanaZoneId;
  text?: string;
  mood?: Scale1To5 | null;            // "Як ви почуваєтесь просто зараз?" (1..5)
  energy?: Scale1To5 | null;          // "Скільки у вас зараз енергії?" (1..5)
  stress?: Scale1To5 | null;          // "Який рівень напруги ви відчуваєте?" (1..5; high is NOT positive)
  tags: string[];
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.10 `life_area_questions` (KeyPath: `id`) & `life_area_assessments` (KeyPath: `id`)
Editable Ukrainian reflection questions and 1–10 periodic assessments preserving question wording/version (C15).

```ts
export type Scale1To10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LifeAreaQuestionRecord {
  id: string;                         // Stable slug ID (e.g. 'physical_wellbeing', 'sleep_recovery', ...)
  titleUk: string;
  questionTextUk: string;
  version: number;                    // Incremented when user edits question wording
  order: number;
  revision: RevisionNumber;
  updatedAt: InstantISO;
}

export interface LifeAreaAnswerSnapshot {
  areaId: string;
  score: Scale1To10;
  note?: string;
  questionTextSnapshotUk: string;     // Preserves exact wording at time of answer
  questionVersionSnapshot: number;
}

export interface LifeAreaAssessmentRecord {
  id: EntityId;
  recordedAt: InstantISO;
  localDate: LocalDateString;
  periodLabelUk: string;              // e.g. "Останній тиждень"
  answers: LifeAreaAnswerSnapshot[];  // Partial assessments allowed (1..8 answers)
  generalNote?: string;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.11 `inspiration_items` (KeyPath: `id`) & `media_blobs` (KeyPath: `id`)
Local inspiration cards and validated image storage (JPEG, PNG, WebP only; active SVG rejected).

```ts
export type InspirationKind = 'text' | 'quote' | 'link' | 'image';
export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface InspirationItemRecord {
  id: EntityId;
  kind: InspirationKind;
  title?: string;
  contentText?: string;
  quoteAuthor?: string;
  linkUrl?: string | null;            // Validated strictly for https:// or http:// protocol
  mediaId?: EntityId | null;          // References media_blobs.id when kind === 'image'
  isFavorite: boolean;
  projectId?: EntityId | null;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}

export interface MediaBlobRecord {
  id: EntityId;
  mimeType: SupportedImageMime;
  byteSize: number;
  width: number;
  height: number;
  sha256Hex: string;
  wasOptimized: boolean;
  optimizationNoteUk?: string;
  blob: Blob;
  createdAt: InstantISO;
}
```

### 3.12 `wishlist_categories` (KeyPath: `id`) & `wishes` (KeyPath: `id`)
Approved Wishlist subsection inside Me (C15).

- **`wishlist_categories` Indexes**: `by_order` (`order`).
- **`wishes` Indexes**: `by_categoryId` (`categoryId`), `by_timingGroup` (`timingGroup`), `by_state` (`state`), `by_archived` (`isArchived`).

```ts
export type WishTimingGroup = 'now' | 'later' | 'someday'; // Ukrainian: "Зараз", "Пізніше" (default), "Колись"
export type WishState = 'active' | 'fulfilled';

export interface ExactPrice {
  // Exact decimal representation: never binary float math
  amountMinor: number;                // Non-negative safe integer in minor units (e.g. 125050 for 1250.50 UAH)
  exponent: 0 | 2 | 3;                // ISO 4217 minor unit digits (e.g. 2 for UAH/EUR/USD/PLN/GBP, 0 for JPY)
  canonicalDecimal: string;           // Canonical string, e.g. "1250.50" or "0.00"
  currency: IsoCurrencyCode;          // Explicit ISO 4217 currency code
}

export interface WishlistCategoryRecord {
  id: EntityId;
  name: string;                       // Non-empty trimmed string; flat level only (no parentId)
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}

export interface WishRecord {
  id: EntityId;
  title: string;                      // Required non-empty title
  note?: string;                      // Optional plain-text note
  categoryId: EntityId | null;        // Zero or one flat category; null = uncategorized
  timingGroup: WishTimingGroup;       // Default: 'later' ("Пізніше"); never auto-moved
  price: ExactPrice | null;           // null = no price specified (distinct from 0.00)
  state: WishState;                   // 'fulfilled' does NOT create an expense or transaction
  isArchived: boolean;                // Separate archive state preserving content & fulfillment state
  fulfilledAt?: InstantISO | null;
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}
```

### 3.13 `settings` (KeyPath: `id`, singleton key `'app_settings'`)
Application preferences and metadata.

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
export type TimeZoneMode = 'device' | 'manual';

export interface AppSettingsRecord {
  id: 'app_settings';
  theme: ThemePreference;             // Default: 'system'
  timeZoneMode: TimeZoneMode;         // Default: 'device'
  manualTimeZone: IanaZoneId | null;
  lastDetectedDeviceTimeZone: IanaZoneId | null;
  tomorrowExpandedInToday: boolean;   // Default: true; remembers user collapse/expand choice
  preferredWishlistCurrency: IsoCurrencyCode | null; // Default: null until user explicitly selects
  reducedMotionOverride: boolean | null;
  reducedTransparencyOverride: boolean | null;
  databaseGenerationId: string;       // Rotated on full backup replacement
  revision: RevisionNumber;
  updatedAt: InstantISO;
}
```

### 3.14 `recovery_snapshots` (KeyPath: `id`)
Bounded local pre-replacement snapshots (up to 3 retained when space permits, C20).

```ts
export interface RecoverySnapshotRecord {
  id: EntityId;
  createdAt: InstantISO;
  reason: 'pre_restore';
  summaryUk: string;
  byteSize: number;
  sha256Hex: string;
  referencedMediaIds: EntityId[];     // Protects media_blobs from GC while snapshot is retained
  dataJson: string;                   // Serialized domain snapshot (excluding recursive snapshots)
}
```
