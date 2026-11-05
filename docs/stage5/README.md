# Stage 5

Only the personal hub, life areas, planning overview and state presentation are changed. No schema or domain algorithm changes.

- Hub: grouped overview, personal modules and settings; disabled optional modules have no hub entry.
- Areas: ten rows fit the first 390×844 viewport, with manual scores and focus indicators.
- Area sheet: definition, manual score, focus, related records and explicit actions; effort cannot write scores.
- Review sheet: per-area optional answers, progress and quick actions; session-scoped 7/14/30-day rhythm.
- Planning: range filters and three sections; no aggregate free-time statistics.
- State: optional scales, date/sleep fields, compact entries, 14-day shift overlays, archive and export sheets.

## Actual verification

`npm run lint`, `npm run build`, `npm test` (214/214) and `npm run test:stage5` passed. The WebKit functional test checks all ten areas in the first viewport, no score writes from opening details or completing a task, explicit score saving and shift overlays.

`ROUTES` includes all six stage screens, tested in dark/light and filled/empty fixtures at 390×844. Final hygiene/axe results: **24 cases, 0 findings**, after an isolated four-case retry. The first final matrix had one page startup timeout under concurrent browser load (23 clean cases); `hygiene-first-check.json` preserves it. `hygiene-retry.json` records all four isolated area-sheet cases passing. `hygiene-baseline.json`/`.md` combine those exact cases, without suppressing rules. Screenshots show the second visual pass; the light area sheet was recaptured after its contrast correction.

The unfiltered hygiene sweep was started but interrupted under resource pressure, so it is **not a full-suite pass**. Its raw output is preserved in `full-hygiene-interrupted.log`; existing out-of-stage findings remain tracked in `docs/stage4/full-hygiene.md`. WebKit libraries were unpacked outside the repository into `/tmp`; its bundle wrapper overrides LD_LIBRARY_PATH, requiring a disposable browser copy with those libraries. No test dependencies were added to the application.

## Risks

The review rhythm controls the current session period and creates no reminders. Splitting creates an independent area; link reassignment remains explicit and preserves the original history. PDF uses the system print dialog. The production build still warns about a large JavaScript chunk. Settings/merge/split/export flows retain existing repository operations but are not covered by the six-route screenshot matrix.
