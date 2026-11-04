# PLANUI Data Model and Storage Specification

## 1. Version Separation & Database Identity

- **Application Version**: `1.0.0` (semver string tracking application build).
- **Database Name**: `planui_db` (isolated test runs use `planui_test_<uuid>`).
- **Database Schema Version**: `2` (integer passed to `indexedDB.open('planui_db', 2)`).
- **Backup Format Identifier & Version**: `format: "planui-backup-zip"`, `backupVersion: 2` (v1 supported via backwards-compatible migration).
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
export type PlanningEntityState = 'idea' | 'active' | 'paused' | 'completed';
```

---

## 3. Object Stores & Entity Schemas

### 3.1 `folders` (KeyPath: `id`)
Organizes subfolders (directions/sub-directions), goals, projects, and standalone tasks with unbounded depth and strict cycle prevention.
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

### 3.2 `goals` (KeyPath: `id`) — Added in M1
Represents meaningful goals within directions or standalone.
- **Indexes**: `by_folderId` (`folderId`), `by_lifeAreaId` (`lifeAreaId`), `by_state` (`state`), `by_archived` (`archived`).

```ts
export interface GoalTimingMetadata {
  targetDate: LocalDateString | null;
  targetPeriodUk: string | null;
}

export interface GoalRecord {
  id: EntityId;
  title: string;
  description: string | null;
  purposeUk: string | null;              // "Навіщо це мені"
  completionCriteriaUk: string | null;   // "Як я зрозумію, що ціль досягнуто"
  nextActionTaskId: EntityId | null;     // Reference to canonical next-action task
  timing: GoalTimingMetadata | null;
  folderId: EntityId | null;             // Direction folder
  lifeAreaId: EntityId | null;           // Direct life-area link
  implementationIntentionUk: string | null; // "Якщо..., то..."
  state: PlanningEntityState;            // 'idea' | 'active' | 'paused' | 'completed'
  archived: boolean;                     // Orthogonal boolean flag
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
  completedAt: InstantISO | null;
}
```

### 3.3 `projects` (KeyPath: `id`)
Represents concrete outcomes. A project may belong directly to a direction folder or be associated with a goal (`goalId`).
- **Indexes**: `by_folderId` (`folderId`), `by_goalId` (`goalId`), `by_state` (`state`), `by_archived` (`archived`), `by_lifeAreaId` (`lifeAreaId`).

```ts
export interface ProjectStage {
  id: EntityId;
  projectId: EntityId;
  title: string;
  expectedOutcome: string | null;
  targetDate: LocalDateString | null;
  order: number;
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
}

export interface ProjectRecord {
  id: EntityId;
  title: string;
  description: string | null;
  desiredOutcome: string | null;
  completionCriteria: string | null;
  targetDate: LocalDateString | null;
  folderId: EntityId | null;
  goalId?: EntityId | null;              // M1: Optional goal link
  lifeAreaId: EntityId | null;
  collaboratorText: string | null;
  purposeUk?: string | null;             // M1: Purpose / sense
  completionCriteriaUk?: string | null;  // M1: Completion criteria
  nextActionTaskId?: EntityId | null;    // M1: Canonical next action
  state: PlanningEntityState;            // 'idea' | 'active' | 'paused' | 'completed'
  archived: boolean;                     // Separate from result state
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
  completedAt: InstantISO | null;
}
```

### 3.4 `tasks` (KeyPath: `id`)
Represents specific actionable items with single canonical ownership context.
- **Indexes**: `by_state` (`state`), `by_plannedDate` (`plannedDate`).

```ts
export type TaskState = 'open' | 'completed' | 'canceled';
export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskPlanningState = 'unplanned' | 'date_only' | 'timed';

export type TaskDeadline =
  | { kind: 'date_only'; localDate: LocalDateString }
  | { kind: 'exact_instant'; instant: InstantISO; zoneId: IanaZoneId };

export type TaskOwnership =
  | { kind: 'standalone'; folderId?: EntityId | null }
  | { kind: 'folder'; folderId: EntityId }
  | { kind: 'goal'; goalId: EntityId }
  | { kind: 'project'; projectId: EntityId; stageId: EntityId | null };

export interface ChecklistItem {
  id: EntityId;
  title: string;
  order: number;
  completed: boolean;
}

export interface TaskRecord {
  id: EntityId;
  title: string;
  description: string | null;
  state: TaskState;
  priority: TaskPriority;
  deadline: TaskDeadline | null;
  estimatedDurationMinutes: number | null;
  planningState: TaskPlanningState;
  plannedDate: LocalDateString | null;
  ownership: TaskOwnership;
  checklist: ChecklistItem[];
  revision: RevisionNumber;
  createdAt: InstantISO;
  updatedAt: InstantISO;
  completedAt: InstantISO | null;
  canceledAt: InstantISO | null;
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

### 3.10 lifeAreaQuestions and lifeAreaAssessments (canonical stores, schema v5)

Existing canonical area IDs and original wording remain authoritative. The runtime fields in src/domain/types.ts are:

```ts
interface LifeAreaQuestion {
  id: string;
  questionTextUk: string; // Current editable area name; legacy question wording is retained
  version: number;
  order: number;
  revision: number;
  updatedAt: string;
  archived?: boolean;
  mergedIntoId?: string | null;
  goodEnoughUk?: string | null;
  starterKeys?: string[];
}
interface LifeAreaAnswerItem {
  questionId: string;
  questionTextSnapshotUk: string;
  questionVersionSnapshot: number;
  score: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | null;
  note: string | null; // Original legacy note remains unchanged
  attentionNow?: boolean | null;
  usefulChangeUk?: string | null;
  definitionSnapshotUk?: string | null;
  satisfactionQuestionSnapshotUk?: string;
}
interface LifeAreaAssessment {
  id: string;
  recordedAt: string;
  periodStartLocalDate: string;
  periodEndLocalDate: string; // Inclusive calendar-date period, not an event interval
  scale?: { min: 0 | 1; max: 10; labelUk: string };
  answers: LifeAreaAnswerItem[];
  createdAt: string;
  updatedAt: string;
  revision: number;
}
```

New reviews explicitly persist a 0–10 scale and independently nullable score, attention and useful-change answers. Empty useful-change text is distinct from null. Missing scale metadata denotes the original 1–10 scale and rejects zero; old records are never normalized into a new scale. Normal assessment saves are create-only. Snapshots are never relabelled after area rename/archive/merge.

Merge keeps the source area ID/name and marks it archived with mergedIntoId. Direct live references are reassigned transactionally to the target; inherited context is recalculated without assignment copies. Validate target existence and reject cycles/self-merges. Starter mapping keys are explicit and never inferred from names.

Folder, Task and CalendarEvent now optionally carry lifeAreaId, supplementing the existing Goal/Project/Habit links. Planned actions inherit through their canonical task. M1 direct-over-inherited precedence remains in force. Optional fields absent in legacy records retain their original representation. No new object stores or duplicate review databases exist.

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


## M4 canonical roadmap metadata (schema v3)

Goal, Project and ProjectStage optionally extend RoadmapMetadata:

```ts
interface RoadmapMetadata {
  roadmapPeriod?:
    | { precision: 'month'; month: string } // YYYY-MM
    | { precision: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
    | { precision: 'range'; startDate: string; endDateExclusive: string }
    | null;
  checkpoints?: { id: string; title: string; localDate: string | null; order: number }[];
}
```

Missing/null periods mean undated, never a generated date. Intervals are calendar dates [startDate, endDateExclusive), with an inclusive final day only in the editor. A month/quarter's derived interval is a projection, never an editable deadline or UTC instant. Checkpoints are embedded in exactly one canonical owner and retain stable IDs and independent order; null dates are supported.

ProjectStage.projectId is now string | null, with optional goalId. Validation requires exactly one owner: a real project or a real goal. Existing project-stage records remain valid unchanged. There are no stage parent references or recursive stages. Goal-level stages do not become project-task owners.

Deadline markers read Goal.timing.targetDate, Project.targetDate or ProjectStage.targetDate directly. Goal.timing.targetPeriodUk remains preserved legacy text and is not parsed into precision. PlanuiSettings.roadmapLayer is optional hidden | key_dates | periods (default hidden). New metadata is included automatically in its canonical collection's ZIP data; no competing roadmap entity collection exists.


## M5 Today metadata (schema v4)

Task adds optional effort: null | 'small' | 'medium' | 'large'. Missing/null means unspecified; no migration infers a value. Existing task IDs, ownership, deadlines, estimates, history and lifecycle fields remain unchanged.

PlanuiSettings.dailyPlans is an optional dictionary keyed by the explicit YYYY-MM-DD calendar date:

```ts
interface DailyPlan {
  focusTaskIds: string[]; // unique canonical task references; no maximum count
  focusNoteUk: string | null;
  minimalDay: boolean;
}
```

The live migration adds an empty dictionary. Daily focus does not create task copies, dates or reservations. Saving validates newly selected task references and checks the prior plan for stale edits while merging other dates/preferences. Deleted-task IDs may remain as historical references and display "Справа більше недоступна"; they do not make an export invalid or fabricate a task. Record removal never clears the user's other focus history.

Minimal-day filtering keeps focus tasks, tasks with deadlines and tasks with retained sessions. It never changes source records or availability. Released future placeholders do not qualify as current dated work. Historical sessions remain inspectable. Effort is manually selected only.

Today selected date/mode/scroll is optional sessionStorage interaction context (planui.today-context.v1), excluded from domain backups. The existing persisted next-day collapse preference remains authoritative. The session fallback validates dates/modes/scroll and ignores corrupt context safely.

## M7 additive model, schema v6

`PersonalRecord` remains the single canonical record: optional `scaleVersion: 1`, `sleepMinutes: number | null` (integer 0–1440), `sleepQuality: Scale1To5 | null`. Absent fields on historical entries remain absent; existing mood/energy/stress values and text are never rewritten. `scaleVersion` points to the Ukrainian mood, energy, tension and sleep-quality labels in `STATE_SCALE_V1`. Missing historical scale metadata uses the original version-1 1–5 meanings. New explicit check-ins with no answers remain identifiable by scaleVersion; text-only legacy entries remain archive material.

`InspirationItem` adds optional `collection: 'preferred_life' | 'saved'`, `lifeAreaId`, `goalId`; existing `projectId`, favorites, kind, text, links and media remain canonical. Missing collection means saved inspiration, without rewriting stored records. A fragment can contain an image and safe link together. Goal deletion unlinks fragments transactionally; area merge includes fragments in the reviewed revision signature and transfers direct references. No new object stores or duplicated historical records.
