# Stage 1 — Today Day / Tasks

Day: one reusable canvas shared with Calendar Day, timezone-aware midnight splits, sticky local day chips, strip/scroll synchronization, anchored day insertion and ±3-day mounting window.
Day: flat duration cards, focus/deadline/effort metadata, overnight disclosure, one future-gap suggestion per day, offscreen-now control above navigation.
Day: only the now marker ticks; memoized rows and days, content visibility for hours, neighboring projections computed in a worker without changing domain logic or persisted records.

Tasks: Focus / Today / Undated / Completed sections each use one row container; inbox includes tasks without a direction; the fourth focus item remains allowed.
Tasks: Today / All pills, one-line empty state with Add, completion and undo, gap-placement sheet and lifecycle actions through ActionMenu.
Tasks: planning retains revision checks and transactional conflict detection; efforts and OS date/time pickers remain available in the planning sheet.

## Visual evidence

WebKit 390×844, memory-only UI fixture, fixed 5 November 2026 05:41 Europe/Kyiv. No IndexedDB fixture writes.

| Mode | Before | After |
|---|---|---|
| Day dark | [before](before/day-dark.png) | [after](after/day-dark.png) |
| Day light | [before](before/day-light.png) | [after](after/day-light.png) |
| Day reduced transparency | [before](before/day-reduced-transparency.png) | [after](after/day-reduced-transparency.png) |
| Tasks dark | [before](before/tasks-dark.png) | [after](after/tasks-dark.png) |
| Tasks light | [before](before/tasks-light.png) | [after](after/tasks-light.png) |
| Tasks reduced transparency | [before](before/tasks-reduced-transparency.png) | [after](after/tasks-reduced-transparency.png) |
| Across midnight | — | [after](after/day-midnight-dark.png) |

## Verification

- `npm run lint`, `npm run build`, `npm test` (206 passing).
- `npm run test:stage1`: WebKit anchoring before/after day insertion, strip-to-07:00, manual-scroll synchronization, contiguous overnight edges, reduced motion, fourth focus item, completion/undo and gap sheet.
- `npm run test:ui-hygiene`: 16 cases (Day now / midnight, Tasks, existing Habits; filled/empty; dark/light). Baseline: 6 failures in 12 cases, all content-start placement. Stage 1: see [after report](after/hygiene.json).
- `npm run test:stage1-perf`: disposable production fixture build, Chromium CDP CPU ×4, 5 days ×60 items; 180 animation frames, 3,600 px forward and back. **Measured: 0 long tasks, 0 tasks >50 ms; rAF median 19 ms, p95 41 ms, maximum 53 ms; 5 mounted days, 52 mounted item blocks.** Raw durations and frame intervals: [performance.json](performance.json). The fixture build lives in `/tmp`, never in application artifacts.

Install WebKit/Chromium through Playwright and provide the pinned external axe runtime described in [tests/README.md](../../tests/README.md). Browser dependencies in this environment were extracted to `/tmp`; no application dependency was added.

## Risks / limits

Neighboring-day records arrive asynchronously from the local worker; geometry stays fixed while they load. The selected day's existing projection remains immediate. Measurement uses deterministic fixture data, not every device or arbitrary overlap density. The application build retains its existing >500 kB chunk warning. No schema, backup, offline or domain rule changes; worker assets participate in the existing PWA precache build.
