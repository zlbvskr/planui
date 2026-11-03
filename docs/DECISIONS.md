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
