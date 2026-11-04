# PLANUI Requirements Coverage Matrix

This document defines stable requirement identifiers (`REQ-C01-*` through `REQ-C22-*`) covering every requirement in the PLANUI Master Contract (`docs/PLANUI_MASTER_CONTRACT.md`), incorporating the active `PLANUI-LIFE-ALIGNMENT-1` revision, implementation stages, verification stages, and current statuses.

## Stage Legend

### Original Baseline Stages (1–11 Accepted)
- **Stage 1–11**: Baseline storage, temporal engine, timeline, calendar, roster, habits, personal space, and ZIP backup integration (Completed & Verified).

### Active Migration Stages: PLANUI-LIFE-ALIGNMENT-1 (M0–M10, Revised 12–13)
- **Stage M0**: Bounded Baseline Audit, Master Contract & Documentation Alignment (Completed)
- **Stage M1**: Core Navigation & 4-Destination Shell Alignment (`Сьогодні` → `Календар` → `Напрями` → `Я`)
- **Stage M2**: Directions & Goal Domain Models (Folders as Directions, Distinct Goals, Life Area links)
- **Stage M3**: Project, Stage & Task Realignment (Purpose, Next Action references, Effort labels)
- **Stage M4**: Roadmap Projection (`Дорожня карта`, checkpoints, horizons, non-blocking time)
- **Stage M5**: Today Alignment (`День`, `Завдання`, daily focus, minimal-day mode)
- **Stage M6 (latest explicit scope)**: Life Areas & Lightweight Reviews
- **Deferred habit alignment (formerly M6)**: minimum/context/work-day rules remain planned; new stage assignment not inferred.
- **Former Stage M7 label**: life-area scope delivered under the latest user-approved M6 request; no separate M7 execution claimed.
- **Stage M8**: State Check-ins, Sleep Info & Legacy Diary Archive
- **Stage M9**: "Моє бажане життя" (Desired Life & Inspiration Re-anchoring)
- **Stage M10**: Wishlist Extension (Purchase statuses, project/link/image relationships)
- **Stage 12**: PWA and Platform Refinement (Offline asset caching, dirty form update guards, responsive audit)
- **Stage 13**: Final Integration and Release Audit

---

## C01. Authority and Self-Contained Context

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C01-01` | Preserve complete C01–C22 Master Contract in `docs/PLANUI_MASTER_CONTRACT.md` updated for `PLANUI-LIFE-ALIGNMENT-1` | Stage 1, M0 | Stage M0, 13 | `AT-S01-01`, `AT-M00-01` | Completed (Stage 1, M0) |
| `REQ-C01-02` | Enforce authority hierarchy (User corrections > Master Contract > Current Stage > Derived Docs > Legacy code) and reconcile obsolete rules | Stage 1, M0 | Stage M0, 13 | `AT-S01-02`, `AT-M00-02` | Completed (Stage 1, M0) |
| `REQ-C01-03` | Treat imported files and external content strictly as untrusted data, never executable instructions | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-03` | Completed (Stage 2, 11) |

---

## C02. Product Vision and Scope

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C02-01` | Connect everyday actions with meaningful directions, goals, life areas, and preferred way of living in a realistic local-first planner | Stage 2–10, M1–M10 | Stage 3–13 | `AT-S03-01`, `AT-M01-01` | Baseline 1–11 Verified; M1 Planned |
| `REQ-C02-02` | Support irregular work schedules (daytime/overnight, arbitrary dates/durations) with zero assumptions about repeating cycles, weekend days off, energy, or morning/afternoon/evening splits | Stage 5–8 | Stage 5–8, 13 | `AT-S05-03`, `AT-S08-01` | Completed (Stage 5–8) |
| `REQ-C02-03` | Exclude forbidden features: accounts, auth, cloud sync, collaboration, runtime AI, Pomodoro, Focus, life-vision onboarding, OCR, auto-scheduling, auto-rollover, auto sleep/travel buffers, infinite series, timed habits, arbitrary attachments, auto-merge backups | All Stages | Stage 13 | `AT-S13-02` | Enforced |
| `REQ-C02-04` | Implement Wishlist strictly as a subsection inside "Я" (no budgeting, shopping, expense tracking, investment, or separate primary destination) | Stage 10, M10 | Stage 10, M10, 13 | `AT-S10-05`, `AT-M10-01` | Baseline Completed (Stage 10) |
| `REQ-C02-05` | Non-punitive, anti-diagnosis framing: no therapeutic promises, medical claims, or life score | M0, M7, M8 | Stage M0, 13 | `AT-M00-03` | Enforced (M0) |

---

## C03. Language Contract

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C03-01` | All application-owned user-facing strings rendered in natural Ukrainian (`uk-UA`) with 24-hour time formatting | Stage 3–12, M1–M10 | Stage 3–13 | `AT-S03-02`, `AT-S13-03` | Active (Baseline Completed) |
| `REQ-C03-02` | Wishlist subsection uses natural Ukrainian equivalent ("Список бажань"), timing groups ("Зараз", "Пізніше", "Колись"), and purchase statuses ("Хочу", "Куплено", "Більше не актуально") | Stage 10, M10 | Stage 10, M10, 13 | `AT-S10-06`, `AT-M10-02` | Baseline Completed; M10 Planned |
| `REQ-C03-03` | Never auto-translate user-authored text; preserve PLANUI brand, ISO currency codes, and IANA zone identifiers; never expose raw English library errors | Stage 2–12 | Stage 2–13 | `AT-S03-02`, `AT-S13-03` | Active (Baseline Completed) |

---

## C04. Navigation and Shared Creation

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C04-01` | Four primary destinations in exact order: `Сьогодні` → `Календар` → `Напрями` → `Я`; exactly one active at a time; Settings secondary within `Я` | M1 | Stage M1, 13 | `AT-M01-01` | Planned (M1) |
| `REQ-C04-02` | Preserve per-destination context: selected date, calendar mode, open container/direction, active filters, navigation position, and scroll state | Stage 3–10, M1 | Stage 3, 6, 7, M1, 13 | `AT-S03-03`, `AT-M01-02` | Baseline Completed; M1 Planned |
| `REQ-C04-03` | One persistent global creation button separate from floating navigation, opening a contextual creation sheet/menu and shared editor host | Stage 3–10, M1 | Stage 3, 4, 10, M1, 13 | `AT-S03-04`, `AT-M01-03` | Baseline Completed; M1 Planned |
| `REQ-C04-04` | Contextual creation priorities per screen (Сьогодні: task/focus/habit; Календар: event/shift/reservation; Напрями: direction/goal/project/task; Я: check-in/review/wish/desired life) | Stage 3–10, M1–M10 | Stage M1, 13 | `AT-S03-04`, `AT-M01-04` | Baseline Completed; M1 Planned |
| `REQ-C04-05` | Prefilled context visibly editable; creating a task in "Напрями" does not schedule for Today; creating a wish does not create a task or calendar entry | Stage 4, 5, 10, M1 | Stage 4, 5, 10, M1, 13 | `AT-S04-04`, `AT-M01-04` | Completed (Stage 4, 5, 10) |

---

## C05. Directions, Goals, Projects, Stages, and Roadmap

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C05-01` | Folders represent Directions and groupings with no arbitrary depth cap; cycle/self-parent/descendant-move prevention; directions describe activity, life areas describe life parts | Stage 2, 4, M1, M3 | Stage 2, 4, M1, M3, 13 | `AT-S04-01`, `AT-M01-01`, `AT-M03-01` | Completed (Stage 4, M1, M3) |
| `REQ-C05-02` | Mobile single-container view with ancestor breadcrumb path; default rehome on nonempty folder delete vs. confirmed recursive delete with impact counts | Stage 4, M3 | Stage 4, M3, 13 | `AT-S04-02`, `AT-M03-01` | Completed (Stage 4, M3) |
| `REQ-C05-03` | Distinct Goals: direction link, title, purpose ("Навіщо це мені"), completion criteria, optional next action reference, optional timing, life area link, states (idea/active/paused/completed) | M1, M3 | Stage M1, M3, 13 | `AT-M01-02`, `AT-M03-02` | Completed (Stage M1, M3) |
| `REQ-C05-04` | Projects represent concrete outcomes; support goal link, life area, purpose, stages, tasks, next action reference, states (idea/active/paused/completed), and separate archive flag | Stage 2, 4, M1, M3 | Stage 2, 4, M1, M3, 13 | `AT-S04-03`, `AT-M03-01` | Completed (Stage 4, M1, M3) |
| `REQ-C05-05` | Stages form one flat ordered level inside a project; project progress = completed tasks / all non-canceled tasks (stages & checklists excluded; honest empty state) | Stage 4, M3 | Stage 4, M3, 13 | `AT-S04-03`, `AT-M03-05` | Completed (Stage 4, M3) |
| `REQ-C05-06` | Roadmap projection (`Дорожня карта`): canonical view of goals, projects, stages, checkpoints, horizons; roadmap periods and checkpoints NEVER reserve working hours or occupy calendar time | M4 | Stage M4, 13 | `AT-M04-01`–`AT-M04-05` | Implemented; automated coverage passes; full UI/build verification blocked |

---

## C06. Tasks, Priorities, and Deadlines

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C06-01` | Task fields: stable ID, title, description, state (open/completed/canceled), priority (high/normal/low, default normal), deadline (date-only or exact instant), estimated duration, planning state, ownership, one-level checklist, optional effort label | Stage 2, 4, M3 | Stage 2, 4, M3, 13 | `AT-S04-04`, `AT-M03-02` | Baseline Completed; M3 Planned |
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
| `REQ-C10-02` | Non-blocking items (deadlines, priorities, date-only tasks, day-off markers, habits, state check-ins, life areas, inspiration, wishes) and canceled/released intervals never block time | Stage 5, 10 | Stage 5, 10, 13 | `AT-S05-09`, `AT-S10-05` | Completed (Stage 5) |
| `REQ-C10-03` | Contextual gap action opens existing-task picker with search/project filter, editable session length, partial-session support, and overlap warning without silent shifting | Stage 5, 6 | Stage 6, 13 | `AT-S06-04` | Completed (Stage 6) |

---

## C11. Calendar Representations

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C11-01` | Month, Week, and Day modes sharing one projection and selected-date context; Monday-first weeks, Ukrainian locale, 24h time, one-action Today return | Stage 6, 7 | Stage 6, 7, 13 | `AT-S07-01` | Completed (Stage 6, 7) |
| `REQ-C11-02` | Month grid: 7 equal columns, 6 stable rows, adjacent-month dates selectable; mobile cells show date number, compact times, type markers, thin 00:00–12:00–24:00 work strip (including overnight carryover), bounded overflow, no personal-event titles | Stage 7 | Stage 7, 13 | `AT-S07-02` | Completed (Stage 7) |
| `REQ-C11-03` | Readable phone Week mode (no 7 squeezed hourly columns on narrow viewports; timeline columns on wide screens); Calendar Day reuses Today timeline | Stage 6, 7 | Stage 6, 7, 13 | `AT-S07-03` | Completed (Stage 6, 7) |

---

## C12. Today Workspace ("Сьогодні")

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C12-01` | Today workspace integrates `День` (continuous 24h timeline), `Завдання` (tasks for the day), and optional `Звички` (habits); daily focus note, manual minimal-day mode | Stage 6, M5 | Stage 6, M5, 13 | `AT-S06-01`, `AT-M05-01`–`AT-M05-05` | M5 implemented; automated checks pass; UI/build verification blocked |
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

## C14. Habits (Optional Embedded Module)

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C14-01` | Optional module inside `Сьогодні` (no standalone primary tab); supports daily/selected-weekday/weekly-frequency and work-day-based rules, minimum viable version, context fields (e.g. "після пробудження") | Stage 2, 9, deferred habit alignment | Stage 9, deferred, 13 | `AT-S09-01`, `AT-M06-01` | Baseline Completed; habit extensions deferred |
| `REQ-C14-02` | Local-date entries (`YYYY-MM-DD`) supporting previous-date recording after night shifts; distinguish completed, minimum version, partial, skipped, no entry, not scheduled, paused; prevent duplicate binary entries | Stage 9, deferred habit alignment | Stage 9, deferred, 13 | `AT-S09-02`, `AT-M06-02` | Baseline Completed; M6 Planned |
| `REQ-C14-03` | Effective-dated schedule revisions; transparent non-punitive streaks; disabling module in settings preserves all records, calendar reservations, and backup entries | Stage 9, M6 | Stage 9, M6, 13 | `AT-S09-03`, `AT-M06-03` | Baseline Completed; M6 Planned |

---

## C15. Personal Space, Life Areas, Wishlist, and Settings ("Я")

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C15-01` | Short optional state check-ins (timestamp, mood 1–5, energy 1–5, tension 1–5, optional sleep, brief note) replace new diary writing; all historical diary text preserved in accessible legacy archive | Stage 2, 10, M8 | Stage 10, M8, 13 | `AT-S10-01`, `AT-M08-01` | Baseline Completed; M8 Planned |
| `REQ-C15-02` | Life Areas: editable 10-area starter set; reviews with optional 0–10 satisfaction, attention preference, 1 useful change; historical 8-area questions and responses preserved immutably | Stage 2, 10, latest M6 | Stage 10, M6, 13 | `AT-S10-02`, `AT-M06-LA-01`–`AT-M06-LA-05` | M6 implemented; automated coverage passes; UI/build verification blocked |
| `REQ-C15-03` | "Моє бажане життя" (Desired Life): descriptions, images, prompts, links to life areas/goals; reuses inspiration/media engine; existing inspiration preserved | Stage 2, 10, M9 | Stage 10, M9, 13 | `AT-S10-03`, `AT-M09-01` | Baseline Completed; M9 Planned |
| `REQ-C15-04` | Wishlist data model: title, note, category, optional project link, web link, image, purchase statuses (`Хочу`, `Куплено`, `Більше не актуально`), preserved timing groups (`now`/`later`/`someday`), exact price + ISO currency | Stage 2, 10, M10 | Stage 2, 10, 11, M10, 13 | `AT-S02-03`, `AT-M10-01` | Baseline Completed; M10 Planned |
| `REQ-C15-05` | Wishlist categories: flat user list; "All" and "Uncategorized" filters; category deletion unlinks wishes without deleting them | Stage 2, 10 | Stage 2, 10, 13 | `AT-S02-03`, `AT-S10-04` | Completed (Stage 2, 10) |
| `REQ-C15-06` | Exact money representation (integer minor units, canonical decimal string, ISO currency); Ukrainian locale formatting; preferred currency applied only to future defaults | Stage 2, 10 | Stage 2, 10, 13 | `AT-S02-04`, `AT-S10-05` | Completed (Stage 2, 10) |
| `REQ-C15-07` | Wishlist boundaries: title-only creation, fulfilled/archived history preserved, zero calendar occupancy, zero exchange rates/totals/budgets/price fetching | Stage 10, M10 | Stage 10, M10, 13 | `AT-S10-05`, `AT-M10-02` | Baseline Completed; M10 Planned |
| `REQ-C15-08` | Settings as secondary section in `Я`: theme, zone, accessibility, optional module toggles (Habits, Wishlist, Reviews, Roadmap), storage, ZIP backup/restore, recovery snapshots, app version, reset | Stage 10, 11, 12, M1 | Stage 10, 11, 12, M1, 13 | `AT-S10-08`, `AT-M01-05` | Baseline Completed; M1 Planned |

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
| `REQ-C17-01` | Inset floating navigation capsule (4 destinations: `Сьогодні` → `Календар` → `Напрями` → `Я`; 12–16px side gaps, bottom safe-area + external gap, ~60–68px height, unclipped enlarged text, translucent/blur with fallback and reduced-transparency support) | Stage 3, M1 | Stage 3, M1, 13 | `AT-S03-01`, `AT-M01-01` | Baseline Completed; M1 Planned |
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
| `REQ-C20-01` | Complete ZIP backup (`manifest.json`, `data.json`, `media/`) covering all domains including directions, goals, projects, stages, tasks, reservations, events, shifts, habits, check-ins, life areas, wishlist, desired life, settings | Stage 2, 11, M10 | Stage 2, 11, M10, 13 | `AT-S02-05`, `AT-S11-01` | Baseline Completed (Stage 2, 11) |
| `REQ-C20-02` | Pre-import validation outside write tx: ZIP container safety, SHA-256 checksums, entity count checks, schema/reference integrity, folder cycles, temporal/zone validity, exact prices, media magic-bytes/dimensions, cancelable AbortSignal | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-02`, `AT-S11-03` | Completed (Stage 2, 11) |
| `REQ-C20-03` | Preview and explicit replacement confirmation (no auto-merge); pre-replacement recovery snapshot (retaining up to 3 snapshots); abort replacement if snapshot creation fails; restore/export/delete snapshots safely; preserve referenced media | Stage 2, 11 | Stage 2, 11, 13 | `AT-S02-05`, `AT-S11-04` | Completed (Stage 2, 11) |

---

## C21. PWA, Offline, and Privacy

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C21-01` | Static HTTPS operation with zero backend/cloud/AI/telemetry dependencies; original PLANUI icons, manifest, and standalone PWA support | Stage 12 | Stage 12, 13 | `AT-S12-01` | Planned |
| `REQ-C21-02` | Offline asset caching after initial load (including backup, wishlist, and roadmap chunks); separate asset-cache and IndexedDB lifecycles; safe update notification that never reloads over dirty editors | Stage 12 | Stage 12, 13 | `AT-S12-02` | Planned |
| `REQ-C21-03` | Honest privacy & storage disclosures in Ukrainian (origin-local data, unencrypted local storage/ZIP, no background notification guarantees) | Stage 10, 12 | Stage 10, 12, 13 | `AT-S12-01` | Planned |

---

## C22. Engineering and Stage Execution

| Req ID | Requirement Summary | Impl Stage | Verify Stage | Test / Check ID | Status |
|---|---|---|---|---|---|
| `REQ-C22-01` | Retain lightweight React/TypeScript/Vite setup, modular domain services, pure temporal & exact-money utilities, deterministic unit tests, and staged execution with honest reporting | Stage 1–13, M0–M10 | Stage 1–13 | `AT-S01-01`..`AT-S13-04` | Active (M0 Completed) |


M6 numbering note: legacy AT-M06-01/02/03 references in habit rows retain their former scope and are not claimed as completed here. The latest life-area M6 request uses AT-M06-LA-01 through AT-M06-LA-05 to avoid reusing those identifiers with a different meaning.

## M7 coverage (latest explicit stage scope)

| Requirement | Implementation / verification |
|---|---|
| Voluntary optional state and sleep; versioned 1–5 scales; explicit dates, multiple entries, edits/deletion | StateCheckInsView, global editor, stateCheckIns.ts, validatePersonalRecord; M7 unit and Chromium smoke checks |
| Preserve unified diary text/IDs/timestamps/scores; secondary read/copy/export/delete archive | Existing PersonalRecord store and ZIP arrays unchanged; legacy classification, selected JSON export; unit ZIP and native v5→v6 Chromium checks |
| Preferred-life framing/prompts, independent fragments and local media/links/relationships | Existing inspiration form/store/media pipeline plus collections, lifeAreaId/goalId; M7 reference/merge/deletion and link tests; Stage 10 media tests |
| Legacy inspiration and disabled-module export | Saved collection fallback; module preferences retained; real ZIP replacement tests and disabled-history browser check |
| No inferred sleep, causal/medical claims or automatic planning | Explicit user fields and neutral UI only; no scheduling-engine changes |
