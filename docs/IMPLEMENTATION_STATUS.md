# PLANUI Implementation Status & Workspace Inventory

## 1. Environment & Workspace Inspection (Stage 1.1)

### 1.1 Available Capabilities
- **File Inspection & Editing**: Available (`view_file`, `list_dir`, `write_to_file`, `replace_file_content`).
- **Command Execution**: Available (`run_command` executing on Linux / Node `v22.23.4`, npm `10.9.9`, `tsx v4.23.15`).
- **Version Control**: No `.git` directory is initialized in `/app/applet` (`git status` returns `exit code 128: fatal: not a git repository`). Checkpoints are tracked deterministically in `docs/IMPLEMENTATION_STATUS.md`.

### 1.2 Actual Workspace Inventory (Pre-Stage 1)
The workspace contains only the generated AI Studio React + TypeScript + Vite starter scaffold:
- `/.env.example` — Starter template environment variable placeholders (`GEMINI_API_KEY`, `APP_URL`).
- `/.gitignore` — Standard Node/Vite ignore file.
- `/bun.lock` — Lockfile for the starter dependencies.
- `/index.html` — Starter HTML shell (`<div id="root"></div>` loading `/src/main.tsx`).
- `/metadata.json` — Starter AI Studio metadata file.
- `/package.json` — Starter package manifest (`react@19.0.1`, `react-dom@19.0.1`, `vite@8.3.0`, `@tailwindcss/vite@4.3.3`, `tailwindcss@4.3.3`, `lucide-react@0.546.0`, `motion@12.23.24`, `tsx@4.21.0`, `typescript@7.0.2`, plus unused starter packages `@google/genai`, `express`, `dotenv`).
- `/src/App.tsx` — Minimal starter placeholder returning `<div></div>`.
- `/src/index.css` — Tailwind CSS v4 import (`@import "tailwindcss";`).
- `/src/main.tsx` — React 19 `createRoot` mount.
- `/tsconfig.json` — TypeScript bundler configuration (`ES2022`, `react-jsx`, `@/*` path alias).
- `/vite.config.ts` — Vite configuration with `@vitejs/plugin-react` and `@tailwindcss/vite`.

### 1.3 Existing PLANUI / Wishlist Code Assessment
- **Existing PLANUI Domain/UI Code**: None. The workspace is a clean starter scaffold.
- **Existing Database / Migrations / Backup / Media / PWA Code**: None yet implemented.
- **Existing Wishlist / Category Implementation**: None yet implemented. Full Wishlist & flat category ownership is mapped to Stage 2 (storage, exact money utilities, backup schema) and Stage 10 (Me -> Wishlist UI, category management, settings currency preference).

---

## 2. Baseline Verification Results (Stage 1.2)

Commands run against the unmodified workspace prior to creating documentation:

1. `git status --short`
   - **Outcome**: Exit code `128` (`fatal: not a git repository (or any of the parent directories): .git`).
2. `node -v && npm -v`
   - **Outcome**: Exit code `0` (`v22.23.4`, `10.9.9`).
3. `npm run lint` (`tsc --noEmit`)
   - **Outcome**: Exit code `0` (0 errors).
4. `npm run build` (`vite build`)
   - **Outcome**: Exit code `0` (`✓ 16 modules transformed`, built in `320ms`). Non-fatal Vite 8 deprecation note on `__dirname` in `vite.config.ts`.
5. `npm run clean && ./node_modules/.bin/tsx --version`
   - **Outcome**: Exit code `0` (`rm -rf dist server.js`, `tsx v4.23.15`, `node v22.23.4`).
6. **Existing Unit/Automated Tests**: No test files (`*.test.ts`) exist yet in the starter scaffold.

---

## 3. 13-Stage Execution Plan & Status (Stage 1.5)

| Stage | Title | Primary Scope | Status |
|---|---|---|---|
| **Stage 1** | **Workspace Audit and Persistent Contract** | Inspect workspace, run baseline checks, persist complete C01–C22 Master Contract and architecture/data/design/backup/test/decision/status docs | **Completed** |
| **Stage 2** | **Local Data and Early Backup** | IndexedDB schema (`planui_db` v1), runtime validators, folder cycle prevention, exact money utilities, Wishlist & category stores, revision-checked repositories, multi-tab sync, early ZIP backup export/validation & round-trip tests | **Completed** |
| **Stage 3** | **Design System and Floating Shell** | Semantic light/dark/system tokens, Ukrainian (`uk-UA`) localization foundation, 5-destination floating navigation capsule, separate global creation button, shared modal/sheet editor host with dirty-form & focus guards | **Completed** |
| **Stage 4** | **Plans and Organization** | Unbounded folders (single-container mobile browser + ancestor breadcrumb, rehome/recursive delete), projects, flat stages, accurate progress calculation, tasks, checklists, checklist-to-task promotion, batch actions | **Completed** |
| **Stage 5** | **Shared Temporal Engine and Scheduling** | Device/manual IANA time zones, calendar arithmetic, DST handling, task reservations, transactional task completion/cancellation releasing unused reservations, events & overnight shift projection, union-based unoccupied gap engine | **Completed** |
| **Stage 6** | **Day Timeline and Today** | Shared proportional 24h timeline, overlap lanes, Today workspace (header, nearest commitment, compact habits, collapsible untimed tasks, timeline, divider, collapsible next calendar day with overnight carryover), gap task picker | **Completed** |
| **Stage 7** | **Month/Week Calendar** | Month grid (7×6, adjacent-month dates, `00:00–12:00–24:00` local-clock work strip with overnight segments, compact markers), readable phone Week view & wide-screen Week timeline, shared Calendar Day view | **Completed** |
| **Stage 8** | **Work Roster** | Shift templates, Work Schedule batch editor, explicit day-off annotations, finite period shift generator, deterministic Ukrainian/local text roster parser with preview & warnings, accurate month intersection summaries | **Completed** |
| **Stage 9** | **Habits** | Daily, weekday, and weekly-frequency habits, binary/numeric targets, effective-dated rule revisions, local-date entries (including previous-date night-shift logging), transparent rule-appropriate streaks, Today integration | **Completed** |
| **Stage 10** | **Personal Space, Wishlist, and Media** | Unified Personal Records (quick state + journal, 1–5 mood/energy/stress scales), 8 editable Life Area questions (1–10 assessments), Inspiration with validated local JPEG/PNG/WebP images, Wishlist (`Зараз`/`Пізніше`/`Колись`, flat categories, exact price & currency preference), Settings | **Completed** |
| **Stage 11** | **Complete Backup/Recovery Integration** | Full ZIP export/import UI with preview, hostile archive & checksum/reference validation, bounded pre-replacement recovery snapshots (up to 3), media garbage-collection protection, full round-trip verification | **Completed** |
| **Stage 12** | **PWA and Platform Refinement** | Web App Manifest, original PLANUI icons, offline service worker caching (separated from IndexedDB lifecycle), safe update prompt, keyboard/safe-area/viewport audit (`320`–`1440px`) | Pending |
| **Stage 13** | **Final Audit** | Comprehensive C01–C22 acceptance verification, unit + integration + browser test execution, final documentation and release checkpoint | Pending |

---

## 4. Checkpoints

- **Checkpoint `STAGE-01-COMPLETE` (2026-11-02)**:
  - Audited starter workspace without modifying any source code, dependencies, configuration, or user data.
  - Created all 9 persistent specification documents under `/docs/`.
  - Verified baseline `npm run lint` and `npm run build` pass cleanly.
- **Checkpoint `STAGE-02-COMPLETE` (2026-11-02)**:
  - Implemented Ukrainian error catalog (`src/i18n/errorsUk.ts`), canonical domain & temporal types (`src/domain/types.ts`, `src/domain/temporal.ts`), exact integer minor-unit money & Wishlist utilities (`src/domain/wishlist.ts`), iterative depth-safe folder graph operations (`src/domain/folders.ts`), and runtime schema/reference/media validators (`src/domain/validation.ts`).
  - Implemented authoritative local database (`src/storage/db.ts`), multi-tab sync coordinator (`src/storage/tabSync.ts`), transactional revision-guarded repositories (`src/storage/repositories.ts`), bounded ZIP archive codec (`src/storage/backup/zipCodec.ts`), and full C20 backup/validation/recovery-snapshot/atomic-replacement service (`src/storage/backup/backupService.ts`).
  - Added and verified Stage 2 automated test suite (`src/storage/__tests__/stage2.test.ts`).
- **Checkpoint `STAGE-03-COMPLETE` (2026-11-02)**:
  - Implemented Ukrainian (`uk-UA`) localization dictionary (`src/i18n/uk.ts`), zero-flash theme/accessibility bootstrap (`index.html`), C16 semantic color & WCAG AA verified contrast tokens, C17 floating capsule material with static blur/no-blur/reduced-transparency fallbacks, and C18 motion tokens (`src/index.css`).
  - Implemented 5-destination navigation state, static-host hash routing, per-destination context & scroll preservation, and contextual creation registry (`src/state/shellStore.ts`).
  - Implemented shared UI primitives and accessible `ModalSheet` with focus trap/return, visible Ukrainian close button, `inert` background handling, and dirty-form confirmation (`src/components/ui/primitives.tsx`).
  - Implemented inset floating navigation capsule + separate global creation button (`+`) with desktop sidebar adaptation and measured bottom scroll clearance (`src/components/shell/FloatingShell.tsx`), shared contextual creation editor (`src/components/editors/SharedEditorHost.tsx`), and working Basic Settings (`src/views/BasicSettingsView.tsx`, `src/App.tsx`).
  - Verified with Stage 2 & Stage 3 unit tests (`src/storage/__tests__/stage3.test.ts`), `npm run lint`, `npm run build`, and Playwright browser verification across `320`, `375`, `390`, `430`, `768`, `1024`, and `1440` CSS px.
- **Checkpoint `STAGE-04-COMPLETE` (2026-11-02)**:
  - Implemented pure Plans domain utilities (`src/domain/plans.ts`) for project progress calculation (`calculateProjectTaskProgress`), unresolved project task inspection (`getUnresolvedProjectTasks`), non-punitive temporal notice classification (`classifyTaskTemporalNotice`), recursive folder delete impact calculation (`computeFolderDeleteImpact`), cycle-safe allowed folder move targets (`getAllowedMoveTargetFolders`), and abbreviated ancestor breadcrumb paths (`buildAbbreviatedBreadcrumbs`).
  - Extended transactional repositories (`src/storage/repositories.ts`) with `moveTaskOwnershipTransactionally`, `cancelTaskTransactionally`, `deleteTaskTransactionally`, `promoteChecklistItemToTaskTransactionally`, `reorderFoldersTransactionally`, `reorderStagesTransactionally`, `deleteStageTransactionally`, `completeProjectExplicitlyTransactionally`, `archiveProjectTransactionally`, `deleteProjectTransactionally`, and `batchUpdateTasksTransactionally`.
  - Updated contextual creation and editor host (`src/state/shellStore.ts`, `src/components/editors/SharedEditorHost.tsx`, `src/i18n/uk.ts`, `src/components/ui/primitives.tsx`) to support `project` and `stage` creation, visibly editable prefilled folder/project/stage/target-date context, and portal-mounted `ModalSheet` dialogs.
  - Implemented full `Плани` view (`src/views/PlansView.tsx`, `src/App.tsx`) supporting unbounded folder drill-down, ancestor breadcrumbs + full path modal, folder move/reorder/delete (default rehome vs. confirmed recursive delete with impact counts), project detail view with flat stages, accurate progress calculation, explicit project completion and archive dialogs, task editor with checklist & checklist-to-task promotion, and non-punitive batch actions.
  - Verified with Stage 4 unit & transactional integration tests (`src/storage/__tests__/stage4.test.ts`), `npm run lint`, `npm run build`, and Playwright browser verification.
- **Checkpoint `STAGE-05-COMPLETE` (2026-11-02)**:
  - Extended pure zone-aware temporal utilities (`src/domain/temporal.ts`) with explicit DST gap/fold detection (`resolveLocalDateTimeCandidates`, `resolveLocalDateTimeExplicitly`), date-boundary calculation (`getLocalDateBoundariesInZone`), elapsed vs. clock-label duration (`calculateDurationSummary`), multi-day projection (`projectIntervalOntoLocalDates`), interval set algebra (`clipInterval`, `intersectIntervals`, `unionIntervals`, `subtractIntervals`), overnight end-date suggestion (`suggestEndDateForClockRange`), and original zone context exposure (`getOriginalZoneDisplayContext`).
  - Implemented shared scheduling, conflict, and availability engine (`src/domain/scheduling.ts`) computing union-based occupied vs. unoccupied windows without double-counting overlaps (`calculateWindowAvailability`), detecting overlaps (`detectIntervalConflicts`), and projecting day schedules across events, work shifts, and task reservations (`projectScheduleForDate`).
  - Extended transactional repositories (`src/storage/repositories.ts`) with `scheduleTaskReservationTransactionally`, `updateTaskReservationTransactionally`, `cancelTaskReservationTransactionally`, `removeTaskCurrentPlanningTransactionally`, `reopenTaskTransactionally`, `undoTaskLifecycleTransactionally` (revision-checked bounded undo with overlap reporting), `saveCalendarEventTransactionally`, `cancelCalendarEventTransactionally`, `deleteCalendarEventTransactionally`, and `recheckDeviceTimeZone`.
  - Enabled shared Event and Work Shift creation in `src/state/shellStore.ts` and `src/components/editors/SharedEditorHost.tsx` with overnight hints, equal-clock guards, and conscious overlap confirmation; integrated task reservation management and lifecycle undo in `src/views/PlansView.tsx` and `src/App.tsx`.
  - Verified with Stage 5 unit & backup round-trip tests (`src/storage/__tests__/stage5.test.ts`), full 24-test suite pass, `npm run lint`, `npm run build`, and Playwright browser verification.
- **Checkpoint `STAGE-06-COMPLETE` (2026-11-02)**:
  - Extended pure scheduling & timeline layout utilities (`src/domain/temporal.ts`, `src/domain/scheduling.ts`) with `elapsedStartOffsetMinutes`/`elapsedEndOffsetMinutes` on projected day segments, `buildDayTimelineHourRail` (24h/23h spring-forward/25h fall-back DST rail), `classifyTimelineItemVisualState` (`past`, `current`, `future`, `completed`, `canceled`, `released`, `conflict`), `layoutTimelineOverlapLanes`, `computeCurrentTimeIndicatorPosition`, `computeNearestCommitment`, `computeCollapsedNextDaySummary`, `collectOlderUnresolvedAndOverdueTasks`, and `evaluateGapTaskSessionProposal`.
  - Implemented shared proportional 24h timeline (`src/components/timeline/SharedDayTimeline.tsx`) reused across both `Сьогодні` and `Календар -> День`, featuring proportional vertical positioning, distinguishable overlap lanes, dense cluster inspection sheet, `>=44px` touch hit areas that never alter stored duration, DST skipped/repeated hour badges, source-identity continuation badges, and unoccupied gap buttons.
  - Implemented `TodayWorkspaceView` (`src/views/TodayWorkspaceView.tsx`), `GapTaskPickerSheet` (`src/components/timeline/GapTaskPickerSheet.tsx`), and `EventDetailSheet` (`src/components/timeline/EventDetailSheet.tsx`), wired into `src/App.tsx` with persisted `todayNextDayCollapsed` preference, 1-minute/foreground clock updates, and non-disruptive midnight rollover notices.
  - Verified with Stage 6 automated test suite (`src/storage/__tests__/stage6.test.ts`, 28/28 tests passing across Stages 2–6), `npm run lint`, `npm run build`, and Playwright browser verification.
- **Checkpoint `STAGE-07-COMPLETE` (2026-11-02)**:
  - Extended calendar arithmetic and Monday-first grid/week builders (`src/domain/temporal.ts`: `getMondayFirstWeekdayIndex`, `addMonthsToLocalDate`, `getFirstDayOfMonth`, `getLastDayOfMonth`, `getMondayOfWeek`, `buildWeekDates`, `buildMonthGridDates`, `formatUkrainianMonthYearHeading`, `formatUkrainianWeekRangeHeading`, `formatUkrainianShortDayMonth`).
  - Extended calendar projection engine (`src/domain/scheduling.ts`: `formatSegmentCompactClockLabel`, `buildWorkStripSegmentsForDate`, `applyCalendarSecondaryFilter`, `projectMonthCell`, `projectMonthCalendarGrid`, `selectCalendarDateFromCell`, `projectWeekCalendarOverview`).
  - Implemented full Month, Week, and Day Calendar Workspace (`src/views/CalendarWorkspaceView.tsx`, `src/state/shellStore.ts`, `src/i18n/uk.ts`, `src/App.tsx`, `src/components/ui/primitives.tsx`) sharing `selectedDate`, `secondaryFilter`, `SharedDayTimeline`, `GapTaskPickerSheet`, `EventDetailSheet`, and `SharedEditorHost`.
  - Verified with Stage 7 automated test suite (`src/storage/__tests__/stage7.test.ts`, 33/33 tests passing across Stages 2–7), `npm run lint`, `npm run build`, and Playwright CLI browser verification across `320`, `375`, `390`, `430`, `768`, `1024`, and `1440` CSS px viewports and `125%` enlarged text.
- **Checkpoint `STAGE-08-COMPLETE` (2026-11-03)**:
  - Implemented pure Work Roster domain engine (`src/domain/roster.ts`) covering template copy instantiation (`instantiateWorkShiftFromTemplate`), custom shift builders (`buildCustomWorkShiftEvent`), explicit day-off annotation builders (`buildDayOffAnnotationRecord`), nonconsecutive multi-date batch preview (`prepareMultiDateRosterBatch`), finite period generator (`generateFinitePeriodRosterPreview`), deterministic local text parser (`parseDeterministicRosterText`), and month boundary intersection summaries (`calculateMonthWorkSummary`).
  - Extended transactional repositories (`src/storage/repositories.ts`, `src/i18n/errorsUk.ts`) with case-insensitive unique shift template code validation (`saveShiftTemplate`), non-mutating template deletion (`deleteShiftTemplateTransactionally`), single day-off annotation CRUD (`saveDayOffAnnotationTransactionally`, `deleteDayOffAnnotationTransactionally`), atomic multi-store roster batch application (`applyRosterBatchTransactionally`), and revision-checked bounded undo (`undoRosterBatchTransactionally`).
  - Enabled contextual `day_off` (`Вихідний день`) creation and template prefill inside `src/state/shellStore.ts` and `src/components/editors/SharedEditorHost.tsx`.
  - Implemented the Ukrainian Work Schedule subview (`src/components/roster/WorkRosterSubview.tsx`, wired into `src/views/CalendarWorkspaceView.tsx` and `src/App.tsx`) with explicit browse vs. multi-date batch states, shift template manager, finite period generator modal, deterministic local text parser modal with error-row exclusion and mixed-state carryover handling, and month work summary card.
  - Verified with Stage 8 automated test suite (`src/storage/__tests__/stage8.test.ts`, 38/38 tests passing across Stages 2–8), `npm run lint`, `npm run build`, and Playwright CLI browser verification.
- **Checkpoint `STAGE-09-COMPLETE` (2026-11-03)**:
  - Implemented pure Habits domain engine (`src/domain/habits.ts`) supporting `daily`, `selected_weekdays`, and `weekly_frequency` rules, `binary` and `numeric` targets with Ukrainian units, effective-dated rule revisions (`getEffectiveHabitRuleRevisionForDate`, `appendEffectiveHabitRuleRevision`), explicit local-date evaluations (`evaluateHabitOnDate`: `completed`, `partial`, `skipped`, `no_entry`, `not_scheduled`, `paused`), previous-date night-shift recording helper (`getPreviousLocalDateForNightShift`), weekly/monthly history summaries (`computeHabitWeekProgress`, `computeHabitMonthProgress`), transparent rule-appropriate streaks (`computeHabitStreakSummary`: `weekly_target_streak` vs. `scheduled_days_streak`), Today block filtering (`selectHabitsForTodayBlock`), and delete impact calculation (`computeHabitDeleteImpact`).
  - Strengthened runtime validation (`src/domain/validation.ts`, `src/i18n/errorsUk.ts`) and extended transactional repositories (`src/storage/repositories.ts`) with `saveHabit`, `saveHabitRuleRevisionTransactionally`, `updateHabitStateTransactionally`, `recordHabitEntryForDateTransactionally`, `deleteHabitEntryTransactionally`, and `deleteHabitWithHistoryTransactionally`.
  - Enabled `habit` (`Нова звичка`) in the shared global creation registry (`src/state/shellStore.ts`) and shared contextual editor host (`src/components/editors/SharedEditorHost.tsx`).
  - Implemented the Ukrainian Habits workspace (`src/views/HabitsWorkspaceView.tsx`, wired into `src/App.tsx`) and connected the interactive compact habits block in `src/views/TodayWorkspaceView.tsx` to the shared entries store with selected-date relevance and one-tap previous-date night-shift toggle.
  - Verified with Stage 9 automated unit & backup round-trip test suite (`src/storage/__tests__/stage9.test.ts`, 43/43 tests passing across Stages 2–9), `npm run lint`, `npm run build`, and Playwright CLI browser verification across desktop (`1440×900`) and mobile (`390×844`).
- **Checkpoint `STAGE-10-COMPLETE` (2026-11-03)**:
  - Implemented pure Personal Space, Life Areas, Inspiration, and Local Raster Media domain engine (`src/domain/personalSpace.ts`) covering Ukrainian 1–5 mood/energy/stress scales with explicit stress direction (`PERSONAL_STATE_QUESTIONS_UK`), in-place state-to-journal text updates (`updatePersonalRecordInPlace`), 8 editable Ukrainian life-area questions with historical wording/version snapshots (`updateLifeAreaQuestionWording`, `buildLifeAreaAssessmentSnapshot`), binary JPEG/PNG/WebP header & dimension inspection (`parseRasterImageDimensions`, `validateAndPrepareRasterMedia`), active SVG rejection, safe HTTP/HTTPS URL validation (`validateSafeHttpUrl`), temporary Object URL lifecycle management (`MediaObjectUrlRegistry`), and recovery-snapshot-aware media reference checks (`isMediaReferencedByLiveOrSnapshots`).
  - Extended Wishlist & Exact Money domain service (`src/domain/wishlist.ts`) with `buildWishItemRecord` (title-only creation with default `later` = `Пізніше` timing, progressive price/currency validation, explicit first-price currency onboarding), `fulfillWishItem`, `reopenWishItem`, `setWishArchivedState`, `sortWishlistCategories`, `computeWishlistCategoryDeleteImpact`, and `filterAndGroupWishes` (`Усі категорії`, `Без категорії`, and flat user categories).
  - Extended transactional repositories (`src/storage/repositories.ts`) with `deletePersonalRecordTransactionally`, `deleteLifeAreaAssessmentTransactionally`, `saveInspirationWithMediaTransactionally`, `deleteInspirationItemTransactionally` (preserving media assets still referenced by retained recovery snapshots), `reorderWishlistCategoriesTransactionally`, `deleteWishItemTransactionally`, `deleteWishlistCategoryTransactionally` (defaulting wishes to uncategorized without deleting wishes), and updated `deleteProjectTransactionally` to unlink inspiration items (`projectId: null`).
  - Enabled `inspiration`, `wish`, and `wishlist_category` in the shared contextual creation registry (`src/state/shellStore.ts`) and shared modal editor host (`src/components/editors/SharedEditorHost.tsx`, `src/i18n/uk.ts`), and added preferred wishlist currency and quick links to existing Work Roster, Habits, and Wishlist Category editors in `src/views/BasicSettingsView.tsx`.
  - Implemented the Ukrainian `MeWorkspaceView` (`src/views/MeWorkspaceView.tsx`, wired into `src/App.tsx`) featuring quiet drill-down overview rows (`10.1`), unified Personal Records (`10.2`), Life Areas (`10.3`), Inspiration & Local Media (`10.4`), Wishlist (`10.5`–`10.7`), and Settings (`10.1`, `C15`).
  - Verified with Stage 10 unit, binary raster, repository, and full ZIP backup round-trip tests (`src/storage/__tests__/stage10.test.ts`, 49/49 tests passing across all 8 suites), `npm run lint`, `npm run build`, and Playwright CLI browser verification.
- **Checkpoint `STAGE-11-COMPLETE` (2026-11-03)**:
  - Hardened pre-import validation (`src/domain/validation.ts`, `src/storage/backup/zipCodec.ts`, `src/storage/backup/backupService.ts`) with cancelable `AbortSignal` support (`BACKUP_VALIDATION_ABORTED`), `manifest.entityCounts` verification (`BACKUP_ENTITY_COUNT_MISMATCH`), binary raster header dimension & pixel-budget verification (`parseRasterImageDimensions` vs. `meta.width`/`meta.height`, `MAX_MEDIA_DIMENSION_PX = 8192`, `MAX_MEDIA_DECODED_PIXELS = 25,000,000`), disguised SVG/XML payload rejection (`ACTIVE_SVG_FORBIDDEN`), duplicate ID checks across all 17 collections, cross-entity reference integrity (`project.lifeAreaId`, `habit.projectId`, `habit.lifeAreaId`, `inspirationItem.projectId`), and documented pre-Wishlist v1 schema migration (`migrateSupportedDomainSnapshot`).
  - Enforced persistent `dbGeneration` stale-tab protection (`STALE_DB_GENERATION_CONFLICT`) across all write transactions in `src/storage/repositories.ts` and connected `BroadcastChannel` generation/entity updates in `src/App.tsx`.
  - Implemented recovery snapshot restoration (`restoreFromRecoverySnapshotTransactionally`), recovery snapshot ZIP export (`exportRecoverySnapshotZip`), protected snapshot deletion (`deleteRecoverySnapshotTransactionally` with `ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED`), and controlled PLANUI data reset (`resetAllPlanuiDataTransactionally` with `RESET_CONFIRMATION_REQUIRED` and snapshot retention/clearing options).
  - Completed the Ukrainian Settings, Storage Persistence, Backup/Restore, Recovery Snapshots, and Controlled Reset UX in `src/views/BasicSettingsView.tsx` (`src/views/MeWorkspaceView.tsx`, `src/i18n/uk.ts`, `src/i18n/errorsUk.ts`).
  - Verified with Stage 11 adversarial test suite (`src/storage/__tests__/stage11.test.ts`, 54/54 tests passing across all 9 suites), `npm run lint`, `npm run build`, and Playwright CLI browser verification at desktop (`1440×900`) and mobile (`390×844`).




