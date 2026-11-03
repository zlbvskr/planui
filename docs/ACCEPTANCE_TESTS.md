# PLANUI Acceptance Tests and Verification Plan

## 1. Verification Philosophy (C22)

Every stage is verified against deterministic unit tests (`npx --yes tsx --test`), TypeScript compilation (`npm run lint`), production bundle build (`npm run build`), and browser DOM/visual inspection (`playwright-cli` across desktop and mobile viewports when UI is modified).

- **Isolated Test Storage**: All repository and backup tests use isolated in-memory or unique-named test database instances (`planui_test_<uuid>`) and never touch live user data.
- **Immediate Backup & Schema Extension**: Every stage that introduces or extends domain fields must immediately extend runtime validation, ZIP export/import, and round-trip tests.

---

## 2. Stage-by-Stage Acceptance Test Matrix

### Stage 1: Workspace Audit and Persistent Contract
- `AT-S01-01`: Complete C01–C22 Master Contract (including Wishlist) is persisted verbatim in `docs/PLANUI_MASTER_CONTRACT.md` alongside all 8 companion docs (`REQUIREMENTS_COVERAGE.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `DESIGN_SYSTEM.md`, `BACKUP_FORMAT.md`, `ACCEPTANCE_TESTS.md`, `DECISIONS.md`, `IMPLEMENTATION_STATUS.md`).
- `AT-S01-02`: Obsolete requirements and unintended Wishlist expansions are explicitly reconciled in `docs/DECISIONS.md`; no application code, dependencies, or user data are modified in Stage 1.

### Stage 2: Local Data and Early Backup
- `AT-S02-01` (**Schema & Validation**): Runtime validators accept valid records for all domain entities and reject malformed dates, invalid intervals (`end <= start`), invalid task ownership (both `folderId` and `projectId` set), and folder cycles (self-parenting, 2-node cycle, deep 50-level cycle).
- `AT-S02-02` (**Transactions & Revision Safety**): Repository writes increment `revision`; concurrent write with stale `expectedRevision` aborts transaction without partial mutation; load/migration errors preserve raw storage and never clear or overwrite with demo data.
- `AT-S02-03` (**Wishlist & Category Storage**): Creating, renaming, reordering, and deleting `wishlist_categories` works transactionally; deleting a category defaults to setting `categoryId = null` on associated wishes without deleting any wishes.
- `AT-S02-04` (**Exact Money Arithmetic**): `parseExactPrice` and `formatExactPriceUk` handle `0`, `0.00`, standard 2-decimal (`UAH`, `EUR`, `USD`, `PLN`, `GBP`) and 0-decimal (`JPY`) currencies, localized comma/dot decimal separators (`1250,50`), and strictly reject negative numbers, `NaN`, `Infinity`, >supported decimals, or missing currency codes. Distinguishes `price: null` (no price) from `0.00`.
- `AT-S02-05` (**Early Backup Round-Trip**): Exporting and validating a ZIP archive (`manifest.json`, `data.json`, `media/`) round-trips all core + Wishlist entities, verifies SHA-256 checksums, and rejects path traversal (`../`), corrupted checksums, and malformed JSON outside the write transaction.

### Stage 3: Design System and Floating Shell
- `AT-S03-01` (**5 Primary Destinations**): Floating navigation capsule renders `Календар`, `Плани`, `Сьогодні` (center), `Звички`, `Я`. Selecting any destination activates only that destination (`Сьогодні` is not styled as active when another tab is active).
- `AT-S03-02` (**Ukrainian Localization**): All UI labels, accessible names, dialogs, and empty states are natural Ukrainian with 24-hour time; zero raw English keys or untranslated library messages.
- `AT-S03-03` (**Context Preservation**): Switching between destinations preserves selected date, open container, active filter, and scroll position.
- `AT-S03-04` (**Global Creation Button**): Separate floating creation button sits above the right side of the navigation capsule (`12–16px` gap), opens contextual creation options for the active destination, and shares one editor host.
- `AT-S03-05` (**Theme & Contrast**): `system`, `light`, and `dark` themes apply semantic tokens matching WCAG AA contrast (`>= 4.5:1` normal text, `>= 3:1` large text) with zero fake device frames.
- `AT-S03-06` (**Typography, Touch Targets & Motion**): Mobile inputs `>= 16px`, interactive targets `>= 44x44px`, motion tokens respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- `AT-S03-07` (**Responsive Viewports**): Layout adapts cleanly across `320`, `375`, `390`, `430`, `768`, `1024`, and `1440` CSS px without horizontal overflow or clipped Ukrainian text.
- `AT-S03-08` (**Modal & Dirty-Form Guard**): Opening an editor sheet hides the global creation button, marks underlying navigation `inert`, traps focus, provides a visible close button, and prompts before discarding dirty edits.

### Stage 4: Plans and Organization
- `AT-S04-01` (**Unbounded Folder Hierarchy**): Create nested folders > 5 levels deep; prevent moving a folder into itself or any descendant; render single active container on mobile with ancestor breadcrumb path (and full path popover when abbreviated).
- `AT-S04-02` (**Folder Deletion Modes**): Deleting a nonempty folder defaults to rehoming child folders, projects, and standalone tasks to the parent container; recursive deletion requires separate confirmation displaying exact impact counts.
- `AT-S04-03` (**Projects, Stages & Progress**): Create projects with desired outcome, completion criteria, target date, collaborator text, and flat ordered stages. Project progress equals `completedTasks / nonCanceledProjectTasks` (excluding stages and checklist items, including hidden completed tasks, showing an honest empty state when `0` countable tasks exist).
- `AT-S04-04` (**Tasks & Checklists**): Create standalone and project/stage tasks with `high`/`normal`/`low` priority; creating a task in Plans leaves it undated unless a date is explicitly chosen; moving a task between projects clears or explicitly replaces `stageId`; promote a checklist item to an ordinary task.
- `AT-S04-05` (**Explicit Project Completion & Archiving**): Completing a project with open tasks displays unresolved tasks without silently completing them; archiving a project with future task reservations offers explicit retain-planning vs. remove-planning choices.

### Stage 5: Shared Temporal Engine and Scheduling
- `AT-S05-01` (**Temporal Separation & Calendar Arithmetic**): Unit tests verify `LocalDateString` (`YYYY-MM-DD`) arithmetic across month boundaries, leap years (`2028-02-29`), and DST transitions without 24-hour millisecond drift.
- `AT-S05-02` (**Time Zone Detection & Modes**): Device IANA zone is detected (or prompts user if unavailable; never defaults silently to Kyiv). Manual override persists; display zone switch re-projects instants without rewriting stored UTC instants or mutating open editors.
- `AT-S05-03` (**DST & Overnight Intervals**): Half-open intervals `[start, end)` compute exact elapsed duration across spring-forward (23h day) and fall-back (25h day) DST transitions and resolve nonexistent/ambiguous local clock inputs explicitly.
- `AT-S05-04` (**Deadlines vs. Elapsed Planning**): Date-only deadlines never shift across time zones; elapsed task reservations without a deadline are labeled as elapsed planning (never "Прострочено" / overdue); past incomplete tasks never auto-rollover into Today.
- `AT-S05-05` (**Task Reservations**): Scheduling a date-only task into a timed reservation explicitly replaces `date_only` mode with `timed` mode; moving/resizing a reservation preserves task priority, deadline, ownership, and estimated duration; supports multiple sessions.
- `AT-S05-06` (**Transactional Lifecycle Release**): Completing or canceling a task inside a single transaction updates the task everywhere, releases unused future reservations (`released_future`), truncates any ongoing reservation at completion time (`released_partial`), and preserves original planned start/end history.
- `AT-S05-07` (**Reopen & Revision-Safe Undo**): Reopening a completed task does not silently re-block released time; immediate bounded undo verifies `revision`, restores previous state, and reports any new overlaps without auto-moving commitments.
- `AT-S05-08` (**Events & Overnight Shifts**): Ordinary events have no completion checkboxes; equal start/end times require clarification; overnight shifts (`20:00` -> `08:00` next day) are stored as a single record and projected into two day segments that both open the same record on edit.
- `AT-S05-09` (**Availability & Union Gaps**): Overlapping blocking intervals do not double-count occupied time; non-blocking items (date-only tasks, day-off markers, habits, wishes, canceled/released blocks) do not reduce unoccupied gaps.

### Stage 6: Day Timeline and Today
- `AT-S06-01` (**Today Structure**): Renders selected date/weekday, date navigation, one-tap Today return, nearest commitment card, compact habits strip, collapsible untimed tasks, main proportional timeline, clear day divider, and collapsible next calendar date (with overnight carryover and persisted expand/collapse preference).
- `AT-S06-02` (**Proportional Timeline & Overlap Lanes**): Events, shifts, and reservations render proportionally to duration against a 24h rail; concurrent intervals render in distinct side-by-side lanes; short blocks keep >= 44px touch targets without changing stored duration.
- `AT-S06-03` (**Now Indicator & Scroll Stability**): Current-time line appears only on the date containing `now`; preserve user scroll after initial entry; midnight transition updates context without ejecting the user.
- `AT-S06-04` (**Contextual Gap Scheduling**): Tapping an unoccupied gap opens the existing-task picker with search and project filter, editable duration, partial-session support when estimate > gap, and explicit confirmation.

### Stage 7: Month/Week Calendar
- `AT-S07-01` (**Shared Calendar Projection**): Month, Week, and Day views share selected date and projection; Monday-first weeks, Ukrainian locale, one-tap Today return.
- `AT-S07-02` (**Month View & Work Strip**): 7 equal columns × 6 stable rows; selecting an adjacent-month cell switches active month and opens day details; mobile cells render date number, compact times, type markers, and the `00:00–12:00–24:00` local-clock work strip (showing overnight segments on both dates) without personal-event titles.
- `AT-S07-03` (**Readable Week Mode & Shared Day View**): Phone Week view remains completely legible at `320–430px` (no 7 squeezed hourly columns); wide screens (`>= 1024px`) offer multi-column timeline; Calendar Day reuses the Today timeline component.

### Stage 8: Work Roster
- `AT-S08-01` (**Shift Templates**): Create/edit/delete shift templates (`name`, `code`, `startLocalTime`, `endLocalTime`, `endDateOffsetDays`, `color`, `note`); modifying or deleting a template never alters existing applied shifts.
- `AT-S08-02` (**Batch Roster & Finite Period Generator**): Apply shifts and day-off markers across nonconsecutive dates or a finite date range with preview, transactional batch commit, and revision-safe undo.
- `AT-S08-03` (**Deterministic Text Parser & Month Summary**): Parse lines (`15 Д`, `16 08:00-20:00`, `17 20:00-08:00+1`, `18 В`), preview resolved dates/durations/warnings, block saving invalid rows, allow mixed-state overnight carryover onto a day off, and compute month work hours strictly from duration intersecting month boundaries (without counting split display segments as two shifts).

### Stage 9: Habits
- `AT-S09-01` (**Habit Rules & Targets**): Create daily, selected-weekday, and weekly-frequency (`N` times/week) habits with binary or numeric targets (`targetValue` + `unit`) and `active`/`paused`/`archived` states.
- `AT-S09-02` (**Local-Date Entries & Night-Shift Previous-Date Recording**): Record `completed`, `partial`, or `skipped` for today or previous date; `skipped` never counts as completed; duplicate binary entries for `(habitId, localDate)` are prevented; changing time zones never shifts stored `localDate`.
- `AT-S09-03` (**Effective-Dated Revisions & Streaks**): Editing a habit's schedule rule creates a new effective-dated revision without rewriting past compliance; weekly-frequency habits show weekly consistency rather than fake daily streaks; Today and Habits views stay in sync immediately.

### Stage 10: Personal Space, Wishlist, and Media
- `AT-S10-01` (**Personal Records**): Quick state and journal write to one `personal_records` store supporting multiple daily entries, minimal text editor, tags, and Ukrainian 1–5 scales for mood, energy, and tension/stress (where high tension is styled/labeled as high load, never a positive achievement).
- `AT-S10-02` (**Life Areas**): 8 editable Ukrainian life-area questions with 1–10 labeled scales; supports partial check-ins; saves question wording and version snapshot with each answer; no radar-first chart or composite life score.
- `AT-S10-03` (**Inspiration & Media Validation**): Supports text, quote, validated `http`/`https` link, and validated local images (`JPEG`, `PNG`, `WebP` verified by magic bytes and decoded dimensions; active `SVG` and arbitrary files rejected; image optimization explained in Ukrainian).
- `AT-S10-04` (**Wishlist & Flat Categories**): Create, edit, fulfill, archive, and delete wishes inside `Я -> Список бажань`; manage one flat level of categories (`Усі категорії`, `Без категорії`, and user categories); deleting a category rehomes its wishes to `Без категорії` (`categoryId: null`).
- `AT-S10-05` (**Wishlist Price, Currency & Isolation**): Progressive disclosure (only title required); optional exact price prompts for currency on first priced wish if no preferred currency is set; changing preferred currency in Settings/editor updates future defaults only and never relabels or converts existing wish prices; fulfilling a wish records no expense; wishes never appear on Calendar/Today or in Tasks.
- `AT-S10-06` (**Wishlist Ukrainian Copy & Timing Groups**): Uses natural Ukrainian labels (`Список бажань`, timing groups `Зараз`, `Пізніше` [default], `Колись`) and never moves wishes between timing groups automatically.
- `AT-S10-07` (**Contextual Creation in Me & Wishlist**): Global creation button prioritizes personal record, state entry, inspiration, and wish in Me overview, and prioritizes wish and wishlist category inside Wishlist.
- `AT-S10-08` (**Settings Integration**): Settings view exposes theme, time zone mode/override, accessibility toggles, preferred wishlist currency, storage metrics, links to roster/habit/wishlist-category editors, app version, and full reset.

### Stage 11: Complete Backup/Recovery Integration
- `AT-S11-01` (**Full Domain + Media + Wishlist Round-Trip**): Exported ZIP backup restores 100% of folders, projects, stages, tasks, checklists, reservations, events, shifts, templates, day-off annotations, habits, habit entries, personal records, life areas, inspiration items, binary media blobs, wishlist categories, wishes (with exact prices, currencies, timing, fulfillment, archive), and preferred wishlist currency.
- `AT-S11-02` (**Corrupted & Invalid Domain Rejection**): Pre-import validator rejects mismatched SHA-256 checksums, missing referenced media files, broken foreign keys (including invalid `wish.categoryId`), negative/malformed wish prices, and folder cycles before opening any write transaction.
- `AT-S11-03` (**Hostile Archive Rejection**): Validator rejects path traversal (`../`), absolute paths, symlinks, nested archives, active SVG/HTML payloads disguised as images, and decompression bombs exceeding byte/ratio caps.
- `AT-S11-04` (**Pre-Replacement Recovery Snapshot & Safe Abort**): Restoring a valid backup creates a pre-replacement snapshot (retaining up to 3 snapshots and protecting referenced media blobs), replaces live data atomically, and allows restoring from the recovery snapshot; if snapshot creation fails, replacement aborts before modifying live data.

### Stage 12: PWA and Platform Refinement
- `AT-S12-01` (**Manifest, Icons & Standalone Mode**): Valid `manifest.webmanifest` with Ukrainian metadata, original PLANUI icons, standalone display configuration, and honest Ukrainian guidance on local storage and browser-specific installation.
- `AT-S12-02` (**Service Worker Offline & Safe Update**): Service worker caches application shell and dynamic bundles (including backup and wishlist modules) for offline operation after initial load; cache cleanup never touches IndexedDB; app updates never auto-reload while an editor has unsaved changes.
- `AT-S12-03` (**Cross-Viewport & Accessibility Polish**): Full keyboard navigation, focus management, reduced motion/transparency compliance, and visual verification across all 7 required viewport widths (`320`–`1440px`).

### Stage 13: Final Audit
- `AT-S13-01`..`AT-S13-04`: End-to-end regression suite, full C01–C22 contract verification, zero prohibited features check, and final checkpoint documentation.
