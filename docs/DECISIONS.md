# PLANUI Architectural Decisions & Contract Reconciliation

## 1. Stage 1 Reconciliation of Obsolete Requirements (Section 1.4)

Per C01 and Stage 1 Section 1.4, the following obsolete requirements from any hypothetical older prompt iterations are explicitly rejected and superseded by the C01–C22 Master Contract:

| Obsolete Concept | Master Contract Rule (Enforced) |
|---|---|
| Dark-only theme | **Superseded (C16)**: Support `system` (default), `light`, and `dark` themes with persisted manual choice. |
| Fixed `Europe/Kyiv` default time zone | **Superseded (C08)**: Initial zone mode follows the device (`Intl` IANA detection). If detection fails, explicitly prompt the user to choose; never silently default to Kyiv. |
| 3-folder depth limit | **Superseded (C05)**: No arbitrary folder-depth cap. Enforce cycle, self-parenting, and descendant-move prevention with depth-safe iterative traversal and single-container mobile rendering with ancestor breadcrumb path. |
| Separate global Goals / Life Vision hierarchy | **Superseded (C02, C05)**: No separate Goals or Life Vision destination. Goals are project outcomes (`desiredOutcome`); subgoals are flat project stages. |
| Always-expanded Tomorrow in Today view | **Superseded (C12)**: Next calendar date in Today starts expanded by default, can be collapsed to a meaningful summary (including overnight carryover), and persists the user's preference (`tomorrowExpandedInToday`). |
| JSON-only backup | **Superseded (C20)**: Complete backup is a single `.zip` archive containing `manifest.json`, `data.json`, and `media/` with SHA-256 checksums and pre-replacement recovery snapshots. |
| Independent Work Shift engine | **Superseded (C09, C13)**: Work shifts are specialized `CalendarEventRecord` entries sharing the exact same temporal representation, display, conflict, occupancy, edit, persistence, and backup mechanisms. |
| Compressed-list-only Today view | **Superseded (C12)**: Today uses a proportional timeline with a readable 24-hour time rail and distinguishable overlap lanes, shared with Calendar Day view. |
| Automatic task rollover / automatic sleep & travel buffers | **Superseded (C02, C06, C09)**: Never automatically move past tasks into Today. Never automatically generate sleep, rest, or travel buffers (only manually created events are allowed). |

---

## 2. Explicit Rejection of Unintended Wishlist Expansion (C02, C15, C19, C20)

Per C02, C15, and Stage 1 Section 1.4, Wishlist is strictly bounded as a compact subsection inside `Me` (`Я -> Список бажань`):

1. **No Sixth Primary Destination**: Navigation has exactly 5 primary items (`Календар`, `Плани`, `Сьогодні`, `Звички`, `Я`). Wishlist lives inside `Я`.
2. **No Budgeting, Expense Tracking, or Purchase Ledger**: Marking a wish `fulfilled` (`Виконано`) records fulfillment intent/history only—it never creates an expense, deducts from a balance, or tracks spending.
3. **No Exchange Rates or Cross-Currency Totals**: Each priced wish stores its own explicit ISO-4217 currency code and exact decimal amount. Changing the preferred default currency affects future price inputs only and never converts or relabels existing wishes. No cross-currency sums or network exchange-rate lookups are permitted.
4. **No External Price Fetching or Shopping Feeds**: Zero network scraping, product URL previews, or purchase recommendations.
5. **No Nested Category Trees**: Wishlist categories form a single flat list (`WishlistCategoryRecord` has no `parentId`), completely separate from Plans folders, projects, and life areas.
6. **No Calendar or Task Coupling**: Wishes never occupy calendar time, never appear on Today/Calendar, and never auto-convert into tasks or projects.

---

## 3. Separation of Blocking Questions vs. Reversible Implementation Choices (Section 1.5)

### 3.1 Blocking Questions
- **None**. The workspace is a clean starter scaffold and the C01–C22 Master Contract in the system prompt is completely self-contained. No legacy files or missing external specifications are required to proceed to Stage 2.

### 3.2 Reversible Technical Implementation Choices

| Area | Chosen Approach | Rationale & Reversibility |
|---|---|---|
| **Frontend Stack** | Retain existing React 19 + TypeScript 7 + Vite 8 + Tailwind CSS v4 + `lucide-react` + `motion` | Already installed and verified in the starter scaffold (`package.json`); fast compilation (`320ms` production build); zero overlapping UI/state libraries (C22). |
| **Unit Test Runner** | Node's built-in `node:test` + `node:assert/strict` executed via `./node_modules/.bin/tsx --test` | Already installed in workspace (`tsx v4.23.15`, `node v22.23.4`); zero extra test-runner dependencies needed. |
| **Temporal Implementation** | Pure TypeScript temporal module (`src/domain/temporal.ts`) wrapping standard `Intl.DateTimeFormat` IANA zone resolution + deterministic proleptic Gregorian calendar math (compatible with TC39 `Temporal` semantics) | Avoids heavy third-party moment/date-fns bloat while guaranteeing exact separation of `InstantISO`, `ZonedTimeRecord`, and `LocalDateString`, plus explicit DST gap/fold detection. |
| **ZIP Archive Codec** | Deterministic client-side ZIP reader/writer (`src/storage/backup/zipCodec.ts`) using Web `CompressionStream` / `DecompressionStream` (`deflate-raw`) and `crypto.subtle.digest('SHA-256')` with strict streamed byte-counter guards | Native to modern Safari/Chromium/Node 22; requires zero native binary dependencies and enforces exact streamed decompression bomb limits before touching IndexedDB. |
| **Exact Money Representation** | Integer minor units (`amountMinor: number`, `exponent: 0 | 2 | 3`) paired with canonical decimal string (`canonicalDecimal: string`) and `currency: IsoCurrencyCode` | Eliminates binary floating-point rounding defects while remaining trivial to serialize, validate, and format via `Intl.NumberFormat('uk-UA', ...)`. |

---

## 4. Product Revision: PLANUI-LIFE-ALIGNMENT-1 (Stage M0 Supersessions)

The active product revision `PLANUI-LIFE-ALIGNMENT-1` supersedes earlier product decisions as follows:

| Former Decision (Stages 1–11) | Superseding Decision (PLANUI-LIFE-ALIGNMENT-1) | Migration / Compatibility Rationale |
|---|---|---|
| **Five Primary Destinations** (`Календар`, `Плани`, `Сьогодні`, `Звички`, `Я`) | **Four Primary Destinations**: `Сьогодні` → `Календар` → `Напрями` → `Я`. Settings become secondary within `Я`. | Streamlines daily alignment. Habits and Settings move inside destinations without destroying data. |
| **No Distinct Goals** (Goals were only project `desiredOutcome` fields) | **Distinct Goal Entity**: A Direction contains goals, projects, and direct tasks. A Goal contains projects or direct tasks. Projects do not require a goal. | Gives long-term intentions clear structure without recursive goal trees or nested projects. |
| **"Плани" Destination Name** | **"Напрями" (Directions)**: Organizes active work (folders, goals, projects, tasks). | Preserves all existing folder trees (unbounded depth), project/task IDs. Directions organize activity; life areas describe parts of life (not interchangeable). |
| **Mandatory Standalone "Звички" Primary Tab** | **Optional Habits Module in "Сьогодні"**: Habits become an embedded optional module with no top-level tab. | Can be disabled without deleting records or backup entries. Adds work-day context rules and minimum versions. |
| **Continuing Standalone Diary in "Я"** | **Short Optional State Check-ins + Legacy Archive**: State check-ins focus on mood, energy, tension, optional sleep. | No new long diary prompts. All existing personal journal entries are preserved in an accessible legacy archive. |
| **8 Life Area Questions** | **Editable 10-Area Starter Set + Reviews**: 10 life areas with optional 0–10 satisfaction, attention preference, and 1 change. | All historical 8-question records, wording, scales, and versions are preserved immutably. |
| **Wishlist Buy/Fulfilled Binary** | **Extended Statuses**: `Хочу` (want), `Куплено` (bought), `Більше не актуально` (no longer relevant), optional links, images, project links. | Preserves legacy fulfilled/archived wishes without inventing purchases or dates. Preserves exact currencies and minor-unit amounts. |
| **No Project Roadmap** | **"Дорожня карта" Projection**: Canonical view of goals, projects, stages, checkpoints. | Roadmap periods/checkpoints never occupy calendar hours. Only explicit reservations or blocking events occupy time. |
| **Monolithic Module Presence** | **Safe Optional Module Disabling**: Modules (Habits, Wishlist, Reviews, Roadmap) can be toggled off. | Disabling never deletes data, never un-blocks calendar time, and never removes records from ZIP backups. |
| **Psychological / Life Scoring** | **Anti-Diagnosis Invariant**: Non-judgmental life alignment framing only. | No therapeutic promises, psychological tests, life scores, or punitive debt calculations. |



## M4 implementation decisions (2026-11-04)

- Persist precision on canonical goals/projects/stages, not duplicate roadmap records. Preserve legacy free-text goal timing without interpreting it.
- Reuse the existing flat stages store with mutually exclusive projectId/goalId ownership. Goal stages have no nested stages and do not alter task ownership.
- Store ranges as half-open calendar dates; show an inclusive final day in the Ukrainian form. Months and quarters are approximate planning intervals, not deadlines. Checkpoints have independent exact dates or remain undated.
- Keep deadline markers tied to their original canonical fields. Calendar and roadmap share the same revision-guarded editing operation.
- Calendar roadmap visibility defaults to hidden and persists in settings; disabled layers keep all metadata and backups intact. Global roadmap shows active work initially; other states require explicit selection.
- Use a separate bounded informational calendar lane and readable mobile lists with disclosure for overflow. Never add hidden all-day events, reduce free time, or infer overdue tasks.
- Show clear period/parent, period/deadline and checkpoint inconsistencies. Related records move only through explicit user edits. Dependency graphs and automatic scheduling are omitted from this release; no placeholder controls.


## M5 implementation decisions (2026-11-04)

- Keep Today modes separate and reuse the existing shared timeline. The second date follows at the same scale; collapse is the existing persisted preference.
- Store focus by calendar date as references, not task copies; retain an optional intention note. Suggest up to three already dated open tasks, never auto-select or limit the saved selection.
- Minimal day is a manual visual preference. Keep deadline/session tasks and blocking schedule information visible regardless of priority, with explicit general-list access. It performs zero scheduling mutations.
- Offer optional manually selected effort labels Невеликі / Середні / Значні. No energy/focus inference from personal check-ins.
- Date assignment/without-date changes require an exact reviewed preview including every affected active reservation, retained historical intervals, current truncation and original bounds. Guard task and reservation revisions before applying. Single current cancellation releases only the remainder; future cancellation preserves its historical record.
- Keep session context in sessionStorage and daily focus in authoritative settings/ZIP. Saved interaction overrides initial auto-reveal; date/mode switches and clock ticks do not repeatedly jump to now.
- Keep dependency policy and all later migration stages outside M5.


## M6 latest approved scope (2026-11-04)

- The explicit user request assigns life areas and lightweight reviews to M6. It takes precedence over the earlier M6-habits/M7-life-areas plan. Do not claim habit minimum/context/work-day rules implemented; keep that work deferred without silently inventing a new stage assignment.
- Fresh areas use the user's exact ten names. Existing/custom/eight-area IDs and names remain unchanged. Explicit starter mapping adds metadata without renaming; explicit addition creates an independent area. Similar names never cause a merge.
- Reuse lifeAreaQuestions as canonical editable areas and lifeAreaAssessments for history. Optional metadata supports archive, merge alias, ordering and good-enough definition. A merge retains source identity, confirms reviewed links/revisions, updates direct references transactionally and never touches historical assessments.
- New reviews use an explicit inclusive date period and 0–10 metadata. Null differs from zero, false or deliberately empty text. Missing legacy scale means 1–10, never conversion to zero-based values. Preserve original identity, wording, version, definitions, periods and answers; normal saved assessments are immutable.
- Reuse M1 effective inheritance and direct precedence. Add optional direct links only where needed for directions/tasks/events; project habits and reservations dynamically. No duplicate assignments, total score, life ranking or automatic score changes from work completion.
- Review-to-action steps use ordinary editors or explicit confirmation. Answers themselves have no scheduling effects. Manual planning review requires no report, recurrence, notification permission or journal.

## M7 latest approved scope (2026-11-04)

- The explicit M7 request delivers state check-ins and preferred life together; former M8/M9 feature labels are superseded, without reassigning deferred habits.
- Extend unified PersonalRecord and InspirationItem; do not split or copy legacy text/scored entries or relabel all inspiration as preferred life.
- Keep the existing mood/energy/tension 1–5 labels. Version-1 subjective sleep quality rises from very poor to very good. Sleep duration is integer minutes 0–1440; zero and absence differ. Never infer sleep from events.
- New forms have no diary field. Editing a check-in preserves original text and timestamps; historical text is readable/copyable/exportable and removable only through explicit deletion.
- Missing inspiration collection means saved inspiration. A new preferred-life fragment never automatically creates a planning entity. HTTP/S links require user opening; no external fetches.
- Database/ZIP v6 retains all old stores and supports v1–v5 imports. No reset, seed or destructive migration.

## M8 latest approved scope (2026-11-04)

- Explicit M8 supersedes the prior “no timed habit reservations” restriction and delivers the formerly deferred habit alignment. Preserve the completed local M7 baseline separately from the independent Pages PR; implement no later stage here.
- Reuse the existing full habit editor inside Today and one habit/date history. A session-owned no_entry row is a stable pending occurrence, not a completed log or unrelated task.
- Minimum wording stays text-only. An explicit minimum action records partial plus the actual minimum wording; it never compares units or automatically satisfies the ordinary target/weekly count. Ordinary completion is counted once per date regardless of session count.
- Explicit day-off markers are authoritative classification, independent of actual occupied intervals. Overnight carry-in may coexist with a valid day-off marker. Blank dates never imply days off. Logged rule/target/day-off interpretation is pinned; future unlogged opportunities reflect explicit effective revisions and current date markers.
- Completion and intentional skip release only this occurrence's pending remainder, retaining elapsed occupancy and original timing metadata. Partial/minimum actions retain sessions; manual single-session release leaves completion untouched. Clearing a log retains referenced occurrence identity and never reactivates released sessions.
- Pause/module disable preserve all definitions, logs, states, intervals and backup coverage. Disabled-module session completion remains an explicit calendar action. No automatic alarms, wake-time inference, repetition, allocations, progression or accumulated debt.
