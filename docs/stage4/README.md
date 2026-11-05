# Stage 4 — Directions, plan detail, Roadmap

Directions root: shared collapsing PageHeader, search, creation and one segmented control.
Status selection excludes Ideas from Active; filters use a sheet with switch controls.
Folder rows show nonzero counts and one action menu; unassigned tasks stay in Today.

Folder: compact navigable path and round parent chevron replace the breadcrumb card.
Goals and projects show a slim progress track with their next canonical task.
Direction move/delete and explicit reorder actions reuse the existing repository operations.

Goal detail: SubHeader and status menu introduce five editable planning rows.
Small sheets edit purpose, completion criteria, next task/intention, month/quarter/date and life area.
Direct goal tasks, child projects, deadlines and timed work sessions remain separate.

Project detail: the same five-row layout reuses the existing project record.
Task creation and task editors preserve the established ownership context.
Deadlines and work sessions are displayed independently of approximate planning periods.

Global Roadmap: period banners and dated diamond milestones replace boxed descriptions.
Status follows the parent header; dependencies appear as thin connectors in the narrow list.
Date/checkpoint editing opens a sheet and writes the same records used by Calendar.

Per-goal Roadmap: includes goal stages and child projects with their stages.
New stages and an explicit reorder menu retain planning actions.
Moving dates opens dependent review; dates change only after the user's explicit choice.

Filters: priority uses a styled native overlay; completed/archive settings use switches.
The pill reports only a nonzero active-filter count.
Tap outside, Escape and the sheet close control dismiss it without duplicating status selection.

Validation: `npm run lint`, `npm run build`, `npm test` (214 passing), and `npm run test:stage4` (WebKit 390×844) passed.
Focused hygiene: 28/28 dark/light × filled/empty cases pass, including axe; see hygiene.json and screenshots.
Full hygiene: 98/100 cases passed. Two light/filled Weekly Review secondary labels reported contrast 4.48:1 (required 4.5:1); all Stage 4 cases passed. See full-hygiene.json. The unchanged Weekly Review is tracked as an out-of-stage baseline finding, not suppressed. A focused repeat of all 16 Weekly Review cases passed (weekly-recheck.json), so the contrast finding is intermittent.

Risks: no persistence schema or domain logic changed. Existing records support one direct life-area link, so chips select one area and canonical inheritance remains intact. Optional if–then metadata exists on goals only. Empty fixture drill-down routes remain at the empty root because no owner exists. The existing Vite bundle-size warning remains. Secondary full editors retain existing behavior; they are outside the focused screenshot routes.
