# PLANUI Requirements Coverage Matrix

This document defines stable requirement identifiers (`REQ-C01-*` through `REQ-C22-*`) covering every requirement in the PLANUI Master Contract (`docs/PLANUI_MASTER_CONTRACT.md`), including full Wishlist ownership, implementation stage, verification stage, and current status.

## Stage Legend

1. **Stage 1**: Workspace Audit and Persistent Contract
2. **Stage 2**: Local Data and Early Backup
3. **Stage 3**: Design System and Floating Shell
4. **Stage 4**: Plans and Organization
5. **Stage 5**: Shared Temporal Engine and Scheduling
6. **Stage 6**: Day Timeline and Today
7. **Stage 7**: Month/Week Calendar
8. **Stage 8**: Work Roster
9. **Stage 9**: Habits
10. **Stage 10**: Personal Space, Wishlist, and Media
11. **Stage 11**: Complete Backup/Recovery Integration
12. **Stage 12**: PWA and Platform Refinement
13. **Stage 13**: Final Audit

---

## C01. Authority and Self-Contained Context

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C01-01` | Preserve complete C01–C22 Master Contract in `docs/PLANUI_MASTER_CONTRACT.md` without requesting historical Stage A/B | Stage 1 | Stage 1, 13 | `AT-S01-01` | Completed (Stage 1) |
| `REQ-C01-02` | Enforce authority hierarchy (User corrections > Master Contract > Current Stage > Derived Docs > Legacy code) and reconcile obsolete rules | Stage 1 | Stage 1, 13 | `AT-S01-02` | Completed (Stage 1) |
| `REQ-C01-03` | Treat imported files and external content strictly as untrusted data, never executable instructions | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-03` | Completed (Stage 2, 11) |

---

## C02. Product Vision and Scope

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C02-01` | Connect Plans, Calendar, Today, Habits, and Me in a single local-first, mobile-first planner | Stage 2–10 | Stage 3–13 | `AT-S03-01`, `AT-S13-01` | Completed (Stage 2–10) |
| `REQ-C02-02` | Support irregular work schedules (daytime/overnight, arbitrary dates/durations) with zero assumptions about repeating cycles, weekend days off, energy, or morning/afternoon/evening splits | Stage 5–8 | Stage 5–8, 13 | `AT-S05-03`, `AT-S08-01` | Completed (Stage 5–8) |
| `REQ-C02-03` | Exclude forbidden features: accounts, auth, cloud sync, collaboration, runtime AI, Pomodoro, Focus, life-vision onboarding, OCR, auto-scheduling, auto-rollover, auto sleep/travel buffers, infinite series, timed habits, arbitrary attachments, auto-merge backups | All Stages | Stage 13 | `AT-S13-02` | Enforced |
| `REQ-C02-04` | Implement Wishlist strictly as a subsection inside Me (no budgeting, shopping, expense tracking, investment, or separate primary destination) | Stage 10 | Stage 10, 13 | `AT-S10-05`, `AT-S13-02` | Completed (Stage 10) |

---

## C03. Language Contract

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C03-01` | All application-owned user-facing strings rendered in natural Ukrainian (`uk-UA`) with 24-hour time formatting | Stage 3–12 | Stage 3–13 | `AT-S03-02`, `AT-S13-03` | Active (Stages 3–10 Completed) |
| `REQ-C03-02` | Wishlist subsection uses natural Ukrainian equivalent ("Список бажань") and timing groups meaning Now, Later, Someday ("Зараз", "Пізніше", "Колись") | Stage 10 | Stage 10, 13 | `AT-S10-06` | Completed (Stage 10) |
| `REQ-C03-03` | Never auto-translate user-authored text; preserve PLANUI brand, ISO currency codes, and IANA zone identifiers; never expose raw English library errors | Stage 2–12 | Stage 2–13 | `AT-S03-02`, `AT-S13-03` | Active (Stages 2–10 Completed) |

---

## C04. Navigation and Shared Creation

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C04-01` | Five primary destinations in mobile order: Calendar ("Календар"), Plans ("Плани"), Today ("Сьогодні" — center), Habits ("Звички"), Me ("Я"); exactly one active at a time | Stage 3 | Stage 3, 13 | `AT-S03-01` | Completed (Stage 3) |
| `REQ-C04-02` | Preserve per-destination context: selected date, calendar mode, open container, active filters, navigation position, and scroll state | Stage 3–10 | Stage 3, 6, 7, 13 | `AT-S03-03` | Completed (Stage 3–10) |
| `REQ-C04-03` | One persistent global creation button separate from floating navigation, opening a contextual creation sheet/menu and shared editor host | Stage 3–10 | Stage 3, 4, 10, 13 | `AT-S03-04` | Completed (Stage 3–10) |
| `REQ-C04-04` | Contextual creation priorities per screen (Calendar, Work Schedule, Plans, Project, Habits, Me overview, Wishlist) showing only implemented actions | Stage 3–10 | Stage 4–10, 13 | `AT-S03-04`, `AT-S04-04`, `AT-S10-07` | Completed (Stage 3–10) |
| `REQ-C04-05` | Prefilled context (date, time, folder, project, stage, wishlist category) visibly editable; creating a task in Plans does not schedule for Today; creating a wish does not create a task or calendar entry | Stage 4, 5, 10 | Stage 4, 5, 10, 13 | `AT-S04-04`, `AT-S10-07` | Completed (Stage 4, 5, 10) |

---

## C05. Folders, Projects, and Stages

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C05-01` | Folders organize folders, projects, and standalone tasks with no arbitrary depth cap; cycle/self-parent/descendant-move prevention and depth-safe iterative traversal | Stage 2, 4 | Stage 2, 4, 13 | `AT-S04-01` | Completed (Stage 4) |
| `REQ-C05-02` | Mobile single-container view with ancestor breadcrumb path (and full path access when abbreviated); default rehome on nonempty folder delete vs. confirmed recursive delete with impact counts | Stage 4 | Stage 4, 13 | `AT-S04-02` | Completed (Stage 4) |
| `REQ-C05-03` | Projects support title, description, desired outcome, completion criteria, target date, folder, life area, stages, tasks, descriptive collaborator text, states (active/paused/completed), and separate archive flag | Stage 2, 4 | Stage 2, 4, 13 | `AT-S04-03` | Completed (Stage 4) |
| `REQ-C05-04` | Stages form one flat ordered level inside a project; project progress = completed tasks / all non-canceled project tasks (stages & checklist items excluded; hidden completed included; honest empty state) | Stage 4 | Stage 4, 13 | `AT-S04-03` | Completed (Stage 4) |
| `REQ-C05-05` | Explicit project completion showing unresolved tasks without silent auto-completion; archiving offers explicit retain-planning or remove-planning choice | Stage 4, 5 | Stage 4, 5, 13 | `AT-S04-05`, `AT-S05-06` | Completed (Stage 4, 5) |

---

## C06. Tasks, Priorities, and Deadlines

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C06-01` | Task fields: stable ID, title, description, state (open/completed/canceled), priority (high/normal/low, default normal), deadline (date-only or exact instant), estimated duration, planning state, ownership (standalone+optional folder OR project+optional valid stage), one-level checklist | Stage 2, 4 | Stage 2, 4, 13 | `AT-S04-04` | Completed (Stage 4) |
| `REQ-C06-02` | Priority never auto-escalates; moving between projects clears or explicitly replaces stage; checklist items can be promoted to ordinary tasks | Stage 4 | Stage 4, 13 | `AT-S04-04` | Completed (Stage 4) |
| `REQ-C06-03` | Date-only deadlines never drift via UTC conversion; distinguish overdue deadline, elapsed planning, and open task on past date; no auto-rollover to today; non-punitive batch actions | Stage 4, 5 | Stage 4, 5, 6, 13 | `AT-S04-04`, `AT-S05-04` | Completed (Stage 4, 5) |

---

## C07. Task Reservations and Lifecycle

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C07-01` | Exclusive planning states (no date, date-only intention, or timed reservations); transitioning to timed reservation explicitly replaces current date-only intention | Stage 2, 5 | Stage 5, 13 | `AT-S05-05` | Completed (Stage 5) |
| `REQ-C07-02` | Reservations reference task ID (no task duplication), support multiple sessions with simple 1-session primary UI; moving/resizing reservation preserves task deadline, priority, ownership, and estimated duration | Stage 5, 6 | Stage 5, 6, 13 | `AT-S05-05` | Completed (Stage 5) |
| `REQ-C07-03` | Elapsed reservation does not auto-complete or auto-reschedule; transactional task completion/cancellation releases unused future reservations and unused remainder of ongoing reservation while preserving original plan metadata | Stage 5 | Stage 5, 6, 13 | `AT-S05-06` | Completed (Stage 5) |
| `REQ-C07-04` | Reopening a task does not silently restore old reservations; revision-checked immediate undo restores state and reports any resulting overlaps | Stage 5 | Stage 5, 13 | `AT-S05-07` | Completed (Stage 5) |

---

## C08. Time Zones and Temporal Representation

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C08-01` | Strictly separate exact instants, local clock values with IANA zone context, and date-only calendar values (`YYYY-MM-DD`) | Stage 2, 5 | Stage 2, 5, 13 | `AT-S05-01` | Completed (Stage 2, 5) |
| `REQ-C08-02` | Device IANA zone detection with manual fallback prompt if detection fails (never silently default to Kyiv); persisted manual override; foreground zone-change detection in device mode | Stage 5, 10 | Stage 5, 10, 13 | `AT-S05-02` | Completed (Stage 5) |
| `REQ-C08-03` | Half-open intervals `[start, end)` with `end > start`; calendar date arithmetic (never 24h ms math); DST gap/overlap disambiguation and accurate elapsed duration vs. clock labels | Stage 5 | Stage 5, 13 | `AT-S05-01`, `AT-S05-03` | Completed (Stage 5) |

---

## C09. Calendar Events and Work Shifts

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C09-01` | Events support ID, title, note, type, palette color, timed interval or all-day dates, blocking flag, active/canceled state, and zone context; no task checkboxes on events | Stage 2, 5, 6 | Stage 5, 6, 7, 13 | `AT-S05-08` | Completed (Stage 5) |
| `REQ-C09-02` | Work shifts are specialized events sharing the same storage, projection, conflict, occupancy, and backup pipeline; overnight status is derived from start/end dates & zone (single record with projected day segments) | Stage 2, 5, 8 | Stage 5, 6, 7, 8, 13 | `AT-S05-08`, `AT-S08-01` | Completed (Stage 5, 8) |
| `REQ-C09-03` | Equal start/end clocks require explicit clarification (never silently infer 24h); sleep/travel/rest are manual events only | Stage 5, 8 | Stage 5, 8, 13 | `AT-S05-08` | Completed (Stage 5) |

---

## C10. Availability and Load

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C10-01` | Compute unoccupied gaps by subtracting the union of effective blocking intervals (work, active reservations, blocking events, manual blocking rest/sleep/travel) from viewing window; overlaps do not double-count | Stage 5 | Stage 5, 6, 13 | `AT-S05-09` | Completed (Stage 5) |
| `REQ-C10-02` | Non-blocking items (deadlines, priorities, date-only tasks, day-off markers, habits, journal, life areas, inspiration, wishes) and canceled/released intervals never block time | Stage 5, 10 | Stage 5, 10, 13 | `AT-S05-09`, `AT-S10-05` | Completed (Stage 5) |
| `REQ-C10-03` | Contextual gap action opens existing-task picker with search/project filter, editable session length, partial-session support, and overlap warning without silent shifting | Stage 5, 6 | Stage 6, 13 | `AT-S06-04` | Completed (Stage 6) |

---

## C11. Calendar Representations

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C11-01` | Month, Week, and Day modes sharing one projection and selected-date context; Monday-first weeks, Ukrainian locale, 24h time, one-action Today return | Stage 6, 7 | Stage 6, 7, 13 | `AT-S07-01` | Completed (Stage 6, 7) |
| `REQ-C11-02` | Month grid: 7 equal columns, 6 stable rows, adjacent-month dates selectable; mobile cells show date number, compact times, type markers, thin 00:00–12:00–24:00 work strip (including overnight carryover), bounded overflow, no personal-event titles | Stage 7 | Stage 7, 13 | `AT-S07-02` | Completed (Stage 7) |
| `REQ-C11-03` | Readable phone Week mode (no 7 squeezed hourly columns on narrow viewports; timeline columns on wide screens); Calendar Day reuses Today timeline | Stage 6, 7 | Stage 6, 7, 13 | `AT-S07-03` | Completed (Stage 6, 7) |

---

## C12. Today Workspace

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C12-01` | Today layout: selected date/weekday, date navigation, Today return, nearest commitment, compact habits, collapsible untimed tasks, proportional timeline, clear divider, and collapsible next calendar date with overnight carryover | Stage 6 | Stage 6, 13 | `AT-S06-01` | Completed (Stage 6) |
| `REQ-C12-02` | Proportional timeline with readable time rail, distinguishable overlap lanes, min 44px touch targets without altering stored duration, and honest DST gap/repeat display | Stage 6 | Stage 6, 13 | `AT-S06-02` | Completed (Stage 6) |
| `REQ-C12-03` | Current-time indicator only on date containing now (updated ~1/min and on foregrounding); preserve scroll state; midnight context transition without ejecting user; no injection of undated/yesterday tasks | Stage 6 | Stage 6, 13 | `AT-S06-03` | Completed (Stage 6) |

---

## C13. Work Roster

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C13-01` | Shift templates (name, code, local start/end, explicit end-date offset, color, note); applied shifts copy values so template edits/deletes never mutate past/existing shifts | Stage 2, 8 | Stage 8, 13 | `AT-S08-01` | Completed (Stage 8) |
| `REQ-C13-02` | Roster batch editor: custom shifts, nonconsecutive dates, explicit day-off annotations, finite period generator, preview before commit, transactional batch apply, and revision-safe undo | Stage 8 | Stage 8, 13 | `AT-S08-02` | Completed (Stage 8) |
| `REQ-C13-03` | Deterministic local text parser (day + template code, day + manual range, next-day offset, day-off code) with validation warnings and mixed-state carryover handling; month summary by intersecting duration | Stage 8 | Stage 8, 13 | `AT-S08-03` | Completed (Stage 8) |

---

## C14. Habits

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C14-01` | Habits support name, description/icon, optional life area/project link, daily / selected-weekday / weekly-frequency rules, binary or numeric target+units, active/paused/archived states | Stage 2, 9 | Stage 9, 13 | `AT-S09-01` | Completed (Stage 9) |
| `REQ-C14-02` | Local-date entries (`YYYY-MM-DD`) supporting previous-date recording after night shifts; distinguish completed, partial, intentionally skipped, no entry, not scheduled, paused; prevent duplicate binary entries | Stage 9 | Stage 9, 13 | `AT-S09-02` | Completed (Stage 9) |
| `REQ-C14-03` | Effective-dated schedule revisions preserving historical interpretation; transparent rule-appropriate streaks; shared entries between Today and Habits | Stage 9 | Stage 9, 13 | `AT-S09-03` | Completed (Stage 9) |

---

## C15. Personal Space, Wishlist, and Settings

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C15-01` | Unified Personal Records model (timestamp, optional text, optional 1–5 mood/energy/stress scales with Ukrainian questions where high stress is not positive, optional tags) shared by quick state and journal | Stage 2, 10 | Stage 10, 13 | `AT-S10-01` | Completed (Stage 10) |
| `REQ-C15-02` | Life Areas: 8 editable Ukrainian questions with 1–10 labeled answers, partial assessments allowed, question wording/version and period preserved, no radar-first UI or overall life score | Stage 2, 10 | Stage 10, 13 | `AT-S10-02` | Completed (Stage 10) |
| `REQ-C15-03` | Inspiration items: text, quote, validated HTTP/HTTPS link, validated local image (JPEG/PNG/WebP magic bytes, dimensions, decoded memory limit; reject SVG/arbitrary files), favorite, project link | Stage 2, 10 | Stage 10, 13 | `AT-S10-03` | Completed (Stage 10) |
| `REQ-C15-04` | Wishlist data model: stable ID, required title, optional plain-text note, optional single flat category ID, timing group (`now` / `later` / `someday`, default `later`), optional exact price + ISO currency, active/fulfilled state, timestamps, separate archive state | Stage 2, 10 | Stage 2, 10, 11, 13 | `AT-S02-03`, `AT-S10-04` | Completed (Stage 2, 10) |
| `REQ-C15-05` | Wishlist categories: single flat user-created list (ID, name, order); virtual "All Categories" and "Uncategorized" filters; deleting a category defaults to leaving wishes uncategorized without deleting wishes | Stage 2, 10 | Stage 2, 10, 13 | `AT-S02-03`, `AT-S10-04` | Completed (Stage 2, 10) |
| `REQ-C15-06` | Exact money representation (validated decimal/minor-unit integer, never binary float math); allow zero, reject negative/NaN/infinite; localized Ukrainian formatting; preferred currency saved after explicit choice and applied only to future defaults | Stage 2, 10 | Stage 2, 10, 13 | `AT-S02-04`, `AT-S10-05` | Completed (Stage 2, 10) |
| `REQ-C15-07` | Wishlist UX & boundaries: title-only progressive disclosure creation, compact category & timing filter, fulfilled/archived history access, zero calendar/task coupling, zero exchange rates/cross-currency totals/budgets/external price lookup | Stage 10 | Stage 10, 13 | `AT-S10-05`, `AT-S10-07` | Completed (Stage 10) |
| `REQ-C15-08` | Settings inside Me: theme, time zone, accessibility/display preferences, wishlist preferred currency, storage status, backup/restore, recovery snapshots, app version, reset, and links to habit/roster/category editors | Stage 10, 11, 12 | Stage 10, 11, 12, 13 | `AT-S10-08`, `AT-S11-01` | Completed (Stage 10, 11) |

---

## C16. Design System

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C16-01` | Restrained iOS-inspired visual hierarchy with system/light/dark themes (default system, persisted manual override), no fake device frames or macOS window chrome | Stage 3 | Stage 3, 13 | `AT-S03-05` | Completed (Stage 3) |
| `REQ-C16-02` | Semantic color palette with verified WCAG AA contrast (and documented contrast adjustments where initial tokens require text/border refinement), restrained tints/markers, no neon or saturated category cards | Stage 1, 3 | Stage 3, 13 | `AT-S03-05` | Completed (Stage 3) |
| `REQ-C16-03` | System font stack (body ~17px, secondary ~15px, caption ~13px, large title 32–34px, mobile inputs >=16px), 4–32px spacing scale, >=44x44px primary touch targets | Stage 3 | Stage 3, 13 | `AT-S03-06` | Completed (Stage 3) |

---

## C17. Floating Navigation and Global Button

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C17-01` | Inset floating navigation capsule (12–16px side gaps, bottom safe-area + external gap, ~60–68px height, unclipped enlarged text, translucent/blur with fallback and reduced-transparency support) | Stage 3 | Stage 3, 13 | `AT-S03-01`, `AT-S03-07` | Completed (Stage 3) |
| `REQ-C17-02` | Separate global creation button positioned above the panel at the right (~48–52px, 12–16px gap), reserved bottom scroll clearance | Stage 3 | Stage 3, 13 | `AT-S03-04` | Completed (Stage 3) |
| `REQ-C17-03` | Modal/sheet and keyboard behavior: hide global button, make background nav inert, trap/restore focus, provide visible close button, protect dirty forms, prevent unpredictable keyboard jumping | Stage 3 | Stage 3, 4, 10, 13 | `AT-S03-08` | Completed (Stage 3) |

---

## C18. Motion, Accessibility, and Responsiveness

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C18-01` | Motion tokens (120ms micro, 180ms small, 210ms screen, 240ms modal, `cubic-bezier(0.16, 1, 0.3, 1)`) respecting `prefers-reduced-motion` and `prefers-reduced-transparency` | Stage 3 | Stage 3, 12, 13 | `AT-S03-06` | Completed (Stage 3) |
| `REQ-C18-02` | WCAG AA contrast, visible focus rings, semantic HTML controls, Ukrainian accessible names, non-color status cues, and button alternatives to gestures | Stage 3–12 | Stage 3–13 | `AT-S03-06`, `AT-S12-03` | Shell Completed (Stage 3) |
| `REQ-C18-03` | Responsive adaptation (mobile floating capsule + sheets; tablet/desktop sidebar + list/detail split) verified across 320, 375, 390, 430, 768, 1024, 1440 CSS px | Stage 3, 12 | Stage 3, 6, 7, 12, 13 | `AT-S03-07`, `AT-S12-03` | Shell Completed (Stage 3) |

---

## C19. Local Storage and Integrity

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C19-01` | Single transactional IndexedDB database with explicit schema version, runtime validation, migrations, revision counters, and indexes; never clear data on error or overwrite with demo data | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-01`, `AT-S11-05` | Completed (Stage 2, 11) |
| `REQ-C19-02` | Atomic multi-store transactions for moves, task lifecycle + reservation release, roster batches, wishlist category deletion/reassignment, backup restore, and media references; heavy work outside write tx | Stage 2, 4, 5, 8, 10, 11 | Stage 2, 5, 8, 10, 11, 13 | `AT-S02-02`, `AT-S10-04`, `AT-S11-04` | Completed (Stage 2–11) |
| `REQ-C19-03` | Multi-tab coordination via `BroadcastChannel` + IndexedDB revision & `dbGeneration` checks to prevent stale form overwrites and coordinate imports/version upgrades; isolated test DB instances | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-02`, `AT-S11-05` | Completed (Stage 2, 11) |

---

## C20. Full Backup and Recovery

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C20-01` | Complete ZIP backup (`manifest.json`, `data.json`, `media/`) covering all domains including Wishlist categories, wishes, exact prices, currencies, timing, fulfillment/archive states, and preferred currency | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-01` | Completed (Stage 2, 11) |
| `REQ-C20-02` | Pre-import validation outside write tx: ZIP container safety (no traversal, symlinks, nested archives, zip bombs, oversized expansion), SHA-256 checksums, entity count checks, schema/reference integrity, folder cycle check, temporal/zone validity, wishlist & exact money validation, media magic-byte/dimension checks, and cancelable AbortSignal | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-02`, `AT-S11-03` | Completed (Stage 2, 11) |
| `REQ-C20-03` | Preview and explicit replacement confirmation (no auto-merge); pre-replacement recovery snapshot (retaining up to 3 snapshots); abort replacement if snapshot creation fails; restore/export/delete snapshots safely; preserve referenced media | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-04` | Completed (Stage 2, 11) |

---

## C21. PWA, Offline, and Privacy

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C21-01` | Static HTTPS operation with zero backend/cloud/AI/telemetry dependencies; original PLANUI icons, manifest, and standalone PWA support | Stage 12 | Stage 12, 13 | `AT-S12-01` | Planned |
| `REQ-C21-02` | Offline asset caching after initial load (including backup and wishlist chunks); separate asset-cache and IndexedDB lifecycles; safe update notification that never reloads over dirty editors | Stage 12 | Stage 12, 13 | `AT-S12-02` | Planned |
| `REQ-C21-03` | Honest privacy & storage disclosures in Ukrainian (origin-local data, unencrypted local storage/ZIP, no background notification guarantees) | Stage 10, 12 | Stage 10, 12, 13 | `AT-S12-01` | Planned |

---

## C22. Engineering and Stage Execution

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C22-01` | Retain lightweight React/TypeScript/Vite setup, modular domain services, pure temporal & exact-money utilities, deterministic unit tests, and staged execution with honest reporting | Stage 1–13 | Stage 1–13 | `AT-S01-01`..`AT-S13-04` | Active (Stage 1 Completed) |
