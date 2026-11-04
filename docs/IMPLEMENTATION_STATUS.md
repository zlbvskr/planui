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
| **Stage 1–11** | **Original Core Baseline** | Workspace audit, local data, design system, folders/projects/tasks, temporal engine, timeline, calendar, roster, habits, me, and ZIP backup integration | **Completed & Verified** |
| **Stage M0** | **Baseline Audit & Documentation Alignment** | Baseline verification, fix repositories import, update master contract, decisions, requirements coverage, and implementation status for `PLANUI-LIFE-ALIGNMENT-1` | **Completed** |
| **Stage M1** | **Canonical Direction / Goal / Project / Task Model** | Folders as directions (unbounded depth, cycle prevention), distinct Goal entity, planning states, task ownership discriminated union, dynamic life-area inheritance, transactional repositories, schema v2 migration, v1/v2 ZIP backup round-trip, automated test suite | **Completed** |
| **Stage M2** | **4-Destination Shell & Core Navigation** | Realign navigation to `Сьогодні` → `Календар` → `Напрями` → `Я`; move Settings inside `Я`; update floating capsule and contextual creation | **Completed** |
| **Stage M3** | **Projects, Stages & Tasks Realignment** | Complete Directions, Goals, and Projects experience: hierarchy navigation, Goal CRUD, planning states, task ownership (4 kinds), transparent task counts, starter directions on explicit click | **Completed** |
| **Stage M4** | **Roadmap Projection (Дорожня карта)** | Canonical projection, explicit precision, checkpoints, optional calendar layer; zero occupancy | Implemented; full toolchain/browser verification blocked |
| **Stage M5** | **Today Workspace Alignment** | Separate day/tasks/optional habits modes; canonical dated focus, manual effort, minimal day, planning previews, context restoration | Implemented; full toolchain/browser verification blocked |
| **Stage M6 (latest approved scope)** | **Life Areas & Lightweight Reviews** | Editable ten-area framework, immutable review scales/history, transactional area merges, effective links and explicit planning-review actions | Implemented; full toolchain/browser verification blocked |
| **Deferred habit alignment (formerly M6)** | **Embedded Habits & Work-day Rules** | Minimum viable versions, context execution and work-day rules remain unimplemented | Planned; stage assignment not changed automatically |
| **Former Stage M7 label** | **Life Areas 10-Area Starter Set & Reviews** | Delivered within the latest user-approved M6 scope | Superseded stage label; no separate M7 execution claimed |
| **Stage M7 (latest approved scope)** | **Optional State Check-ins & Preferred Life** | Voluntary state/sleep, preserved diary archive, selected export, preferred-life fragments and saved inspiration | Implemented and verified |
| **Former M8/M9 labels** | **State Check-ins / Desired Life** | Delivered together under latest explicit M7 scope | Superseded labels |
| **Stage M10** | **Wishlist Extension & Purchase Statuses** | Extended purchase statuses (`Хочу`, `Куплено`, `Більше не актуально`), project/url/image links, preserve legacy records | Planned |
| **Stage 12** | **PWA and Platform Refinement** | Web App Manifest, original PLANUI icons, offline service worker caching, safe update prompt, responsive audit (`320`–`1440px`) | Planned |
| **Stage 13** | **Final Integration and Release Audit** | Comprehensive C01–C22 acceptance verification, unit + integration + browser test execution, release checklist | Planned |

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
- **Checkpoint `STAGE-M0-COMPLETE` (2026-11-03)**:
  - **Actual Workspace Baseline Audit**:
    * Inspected actual workspace tooling and tests: Node `v22.23.4`, npm `10.9.9`, TypeScript `v7.0.2`, `tsx v4.23.15`, React `19.0.1`, Vite `8.3.5`.
    * Resolved single missing import `PLANUI_DB_SCHEMA_VERSION` in `src/storage/repositories.ts` to restore clean typecheck and test runner execution.
    * Ran `npm run lint` (`tsc --noEmit`): **0 errors, exit code 0**.
    * Ran all 9 unit test suites (`src/storage/__tests__/*.test.ts`): **54/54 tests passing across all suites, exit code 0** (100% baseline pass).
    * Ran `npm run build` (`vite build`): **Built in 837ms, exit code 0**.
  - **Incorporated PLANUI-LIFE-ALIGNMENT-1 Approved Product Delta**:
    * Updated `docs/PLANUI_MASTER_CONTRACT.md` as the canonical product specification covering all 14 points of the life-alignment revision.
    * Updated `docs/DECISIONS.md` marking superseded decisions (5 tabs -> 4 tabs; no goals -> distinct goals; standalone habits -> embedded module; standalone diary -> short check-ins + legacy archive; 8 areas -> 10 starter areas + reviews; Wishlist purchase statuses; Roadmap projection).
    * Updated `docs/REQUIREMENTS_COVERAGE.md` with stable requirement identifiers and stage mapping across M0–M10, Stage 12, and Stage 13.
  - **Generated PLANUI-LIFE-ALIGNMENT-1 Migration Map**:
    * *Unchanged Entities & IDs*: `folders` (Directions hierarchy), `projects`, `stages`, `tasks`, `reservations`, `events`, `shiftTemplates`, `dayOffAnnotations`, `habits`, `habitEntries`, `personalRecords`, `lifeAreaQuestions`, `lifeAreaAssessments`, `inspirationItems`, `mediaMeta`, `mediaBlobs`, `wishlistCategories`, `wishes`, `settings`, `recoverySnapshots`.
    * *New Entities & Schema Realignment*:
      - `goals`: Distinct Goal entity linked to direction folders, containing projects or direct tasks, with purpose ("Навіщо це мені"), completion criteria, optional next action reference, timing, and life area links.
      - `projects`: Extended with purpose, completion criteria, next action task reference, and goal linkage (`goalId`).
      - `tasks`: Extended with optional effort labels (`minimal` | `moderate` | `deep` / `легке` | `помірне` | `глибоке`).
      - `roadmap`: Virtual projection of canonical goals, projects, stages, checkpoints, and horizons; strictly non-blocking (zero calendar occupancy).
      - `today`: Embedded `День` (timeline), `Завдання` (tasks), optional `Звички` (habits); daily focus note, manual minimal-day mode.
      - `habits`: Embedded in `Сьогодні`; minimum viable versions, execution contexts ("після пробудження", "після зміни"), work-day rules, safe disable toggle.
      - `lifeAreas`: 10-area holistic starter set; periodic reviews (`satisfactionScore` 0–10, attention preference, 1 change); immutable preservation of all 8 historical questions and answers.
      - `stateCheckIns`: Short check-ins (mood, energy, tension 1–5, optional sleep info); all diary text preserved in an accessible legacy archive.
      - `desiredLife`: "Моє бажане життя" descriptions, local raster images, prompts, life area & goal links; existing inspiration preserved.
      - `wishlist`: Extended purchase statuses (`Хочу`, `Куплено`, `Більше не актуально`), project links, web links, images; exact money & ISO currencies preserved; legacy records preserved.
    * *Legacy Preservation*: All 8-area questions and assessments preserved immutably; all personal journal text preserved in legacy archive; all fulfilled/archived wishes preserved without fabricating purchase dates; all habit revision histories preserved.
    * *Compatibility & Safety*: Disabling optional modules never deletes records, never drops items from ZIP backups, and never alters occupied calendar time. Schema migration to version 2 will be backward-compatible with v1 stores and backups.

- **Checkpoint `STAGE-M1-COMPLETE` (2026-11-03)**:
  - **Canonical Model Implemented**:
    * Retained existing `folders` store as the unbounded hierarchy for Directions without creating competing trees.
    * Added canonical `Goal` entity (`GoalRecord`) with purpose (`purposeUk`, "Навіщо це мені"), completion criteria (`completionCriteriaUk`), reference to canonical next action (`nextActionTaskId`), timing metadata (`timing.targetDate`, `timing.targetPeriodUk`), direct life-area link (`lifeAreaId`), implementation intention (`implementationIntentionUk`, "Якщо..., то..."), and orthogonal archiving (`archived: boolean`).
    * Planning entity states: `idea`, `active`, `paused`, `completed` for both goals and projects.
    * Single canonical task ownership discriminated union (`TaskOwnership`):
      `{ kind: 'standalone'; folderId?: null }` (standalone without direction)
      `{ kind: 'folder'; folderId: EntityId }` (direction/folder task)
      `{ kind: 'goal'; goalId: EntityId }` (direct goal task)
      `{ kind: 'project'; projectId: EntityId; stageId: EntityId | null }` (project task; inherits context from project)
      *Maintained backwards compatibility for v1 `{ kind: 'standalone'; folderId: string }` during validation and migration.*
    * Dynamic life-area inheritance (`resolveEffectiveLifeArea`): direct assignment takes precedence; otherwise inherited dynamically from parent Goal or Project's Goal without duplicating or mutating records down trees.
    * Goal progress calculation (`calculateGoalProgress`): honest percentage based on countable direct tasks and associated project tasks (excluding canceled).
  - **Persistence, Storage & Migrations**:
    * Incremented `PLANUI_DB_SCHEMA_VERSION` to `2`.
    * Added `goals` object store to `STORE_NAMES`, `ALL_STORE_NAMES`, and `DOMAIN_DATA_STORES` with indexes `by_folderId`, `by_lifeAreaId`, `by_state`, `by_archived`.
    * Upgraded `IndexedDbStorageEngine.onupgradeneeded` to safely migrate v1 stores to v2 (auto-converting `{ kind: 'standalone', folderId: 'xyz' }` to `{ kind: 'folder', folderId: 'xyz' }`).
    * Implemented Goal repository transactions: `saveGoal`, `deleteGoalTransactionally` (with safe unlinking of child projects and rehoming/deletion of direct tasks), `archiveGoalTransactionally`, and updated `saveProject`, `saveTask`, `moveTaskOwnershipTransactionally`.
  - **ZIP Backup & Restore Compatibility**:
    * Incremented `PLANUI_BACKUP_VERSION` to `2`.
    * Included `entityCounts.goals` and `goals` array in `data.json`.
    * Upgraded `migrateSupportedDomainSnapshot` in `backupService.ts` to support both v1 and v2 archives, ensuring v1 archives import seamlessly with default `goals = []` and migrated task ownership.
  - **Verification**:
    * Added new automated test suite `src/storage/__tests__/stageM1.test.ts` (7/7 tests passing).
    * Total automated test suite: **61/61 tests passing across 10 suites (100% pass rate)**.
    * Type check (`npm run lint` / `tsc --noEmit`): **0 errors**.

- **Checkpoint `STAGE-M2-COMPLETE` (2026-11-04)**:
  - **Four Primary Destinations Shell Implemented**:
    * Enforced the canonical order of exactly 4 primary destinations: 1. `Сьогодні` (`today`), 2. `Календар` (`calendar`), 3. `Напрями` (`directions`), 4. `Я` (`me`).
    * Active styling applied strictly to the selected destination alone.
    * Settings positioned strictly as secondary within `Я`, never as a fifth primary tab.
    * Mobile floating capsule re-architected with `grid grid-cols-4`, safe-area spacing, and separate floating `+` button.
    * Desktop sidebar navigation with intentional `lg:w-[264px]` sidebar and `max-w-[1080px]` content container.
  - **Route & Bookmark Migration**:
    * Former `#/plans` routes seamlessly open `#/directions` without broken bookmarks.
    * Former `#/habits` routes open `#/today`.
    * Former diary and records routes (`#/diary`, `#/records`) open `#/me` with `subView: 'records'` (accessible legacy history, zero dead pages).
    * `#/settings` opens `#/me` with `subView: 'settings'`.
  - **Optional Modules Preferences & Safe Auto-Enable**:
    * Added `OptionalModulesSettings` (`habitsEnabled`, `stateCheckInsEnabled`, `desiredLifeEnabled`, `wishlistEnabled`, `userConfigured`) in `PlanuiSettings`.
    * Fresh installations start with all 4 optional modules disabled by default.
    * Existing installations and upgrades auto-enable populated features so user records are never silently hidden.
    * Disabling a module never deletes user records, never cancels existing reservations, and never omits data from ZIP backups.
    * Added dedicated "Додаткові модулі" controls in Settings with individual toggles.
  - **Contextual Creation Actions**:
    * Priority-ordered, compact creation options per destination.
    * Today: task and event (with pre-filled date) + habit and personal check-in when enabled.
    * Calendar: event, task, shift, day-off.
    * Directions: task, goal, project, stage, folder.
    * Me: contextual creation tailored to currently enabled modules (personal record, wish, wishlist category).
  - **Verification**:
    * Added comprehensive automated test suite `src/storage/__tests__/stageM2.test.ts` (7/7 tests passing).
    * Total test suite: **68/68 tests passing across all 11 suites (100% pass rate)**.
    * Typecheck (`npm run lint` / `tsc --noEmit`): **0 errors**.
    * Production build (`npm run build` / `vite build`): **Passes cleanly**.
    * Browser verification with Playwright CLI at desktop (`1440×900`) and mobile (`390×844`): confirmed 4 primary destinations in order, URL synchronization, bookmark migration, and non-destructive module toggles.

- **Checkpoint `STAGE-M3-COMPLETE` (2026-11-04)**:
  - **Directions Hierarchy Experience**:
    * Structured on canonical folder hierarchy, preserving existing names and IDs.
    * Mobile navigation drills down strictly one level/context at a time (`activeFolderId` → `activeGoalId` → `activeProjectId`), preventing infinite tree expansion on phone screens.
    * Breadcrumbs provide ancestor paths with modal access for depths > 3.
    * Cycle-safe folder moves powered by `getAllowedMoveTargetFolders`.
    * Default rehoming deletion (`rehome_to_parent`) vs. explicit recursive deletion with impact counts.
    * Starter directions suggestion card rendered on empty root container only via explicit user click (`Додати базові напрями (Дім, Робота, Самовдосконалення)`), never automatically populating workspace.
  - **Goals & Projects Experience**:
    * Clear conceptual and visual distinction: Goal (intended outcome), Project (finishable work body), Task (executable action), Habit (repeated practice).
    * Supported relationships: Goal with direct tasks and no project; Goal with projects; Project without goal; Tasks directly in direction; Standalone tasks.
    * Progressive disclosure: title is sufficient to create, optional purpose, criteria, canonical next action, timing metadata, life-area link, if-then implementation intention.
    * Planning states (`Ідея`, `Активна`, `На паузі`, `Досягнута`) with visual separation of active commitments from ideas and paused work.
    * Goal completion is an explicit user action, never inferred automatically.
  - **Canonical Task Ownership & Progress**:
    * Task editor supports all 4 ownership variants (`standalone`, `folder`, `goal`, `project`).
    * Transparent project progress counts (`completedTasks / totalCountableTasks`), never contaminated by checklist rows.
    * 1-level checklist with promotion of checklist item to independent task.
    * Transactional goal deletion with choice between `unlink_children` and `delete_direct_tasks`.
  - **Verification**:
    * Created automated test suite `src/storage/__tests__/stageM3.test.ts` (5/5 tests passing).
    * Full test suite: **73/73 tests passing across all 12 suites (100% pass rate)**.
    * Typecheck (`npm run lint` / `tsc --noEmit`): **0 errors**.
    * Production build (`npm run build` / `vite build`): **Passes cleanly**.



- **Checkpoint M4 implementation (2026-11-04), verification incomplete**:
  - Global active-by-default roadmap grouped by canonical direction paths, and goal/project detail roadmaps. Explicit idea/paused/completed filters. Undated plans and checkpoints remain accessible. No generated plans.
  - Reused flat stages; each stage belongs to exactly one project or one goal. Button-based stage/checkpoint reordering and shared Ukrainian date forms work without dragging.
  - Canonical goals/projects/stages store optional month, quarter, or half-open calendar-date periods and ordered checkpoints. Existing deadline fields remain authoritative. Both calendar and roadmap call revision-guarded updateRoadmapItem; no related dates, tasks, reservations, events, or shifts cascade.
  - Persistent calendar layer: hidden, key dates, or key dates plus stage/project periods. Separate date-grouped informational lane with per-date and date-group overflow disclosure; unchanged work/event/task layout and availability engine.
  - Schema and ZIP format v3. v1/v2 import supported; live upgrade adds empty metadata and hidden-layer defaults without inferred dates. Goal deletion cleans its owned stages. No storage reset or reseeding.
  - Verification: 14 M4 tests pass, including simulated IndexedDB v2-to-v3 upgrade callback, ZIP replacement in isolated memory storage, leap/month/year/quarter boundaries, time-zone invariance, stale edits, and 300-minute real reservation/shift occupancy preservation. Full regression: 87/87 tests pass across 13 suites. Tests executed with Node 26 built-in TypeScript stripping and a temporary local import adapter, because tsx was unavailable.
  - Local TypeScript 6.0.3 compiler: domain/storage semantic checks (strictNullChecks) pass; changed React files transpile with zero syntax diagnostics. This is supplementary verification, not the project's configured full type check.
  - npm run lint fails because tsc is unavailable; npm dependency installation failed (sandbox DNS failure, then EACCES outside sandbox). npm run build fails because vite is unavailable. Production build and browser/device behavior require the actual dependencies. No browser/device verification claimed.
  - Dependency graphs and automatic scheduling are explicitly out of scope. Stopped at M4; M5 and later remain planned.

  - Separate pre-existing issue: docs/BACKUP_FORMAT.md section 4 states 150 MB archive / 1,000 entries, while zipCodec.ts enforces 100 MB / 500 entries (other limit differences also exist). M4 does not change those policies; align them in a separate backup-policy correction.


- **Checkpoint M5 implementation (2026-11-04), verification incomplete**:
  - Separate Ukrainian modes День / Завдання / optional Звички. Kept the shared proportional timeline, selected date followed by next date at the same scale, overnight segments, and persisted next-day collapse choice. No project/statistics/Wishlist dashboard added.
  - Added relevant-task projection plus explicit general-list access; distinguishes deadlines, date-only assignments, sessions and estimates. Released future placeholders never become current commitments. Existing past/current/future/completed timeline states retained.
  - Settings.dailyPlans stores per-calendar-date canonical task IDs, optional focus note and manual minimalDay. Up to three dated-task suggestions require explicit selection; more than three focus items are allowed. Task.effort is optional small/medium/large with Ukrainian labels. No state-check-in inference.
  - Minimal day changes only focus/view metadata. Deadlines and session-related tasks stay visible; non-Day modes show a compact blocking-record/deadline/occupied-time summary. Full general-list access remains available. Priority is not used as a mandatory flag.
  - Added task planning sheet from tasks and timeline sessions: explicit date/time/elapsed-duration editing, additional sessions, conflict warning with intentional-overlap confirmation, and exact date-only/without-date or single-reservation cancellation previews. Reviewed task/reservation revisions are checked; original interval metadata and historical records are retained. Current-reservation release retains its elapsed blocking slice.
  - Reused existing lifecycle completion/reopening operations; no completion at planned end, no automatic reservation restoration, no deadline changes during scheduling.
  - Today restores date/mode/scroll in sessionStorage, with in-memory per-mode scroll on mode switches. Current-time reveal is gated by first-entry context, never clock ticks. Explicit date/current-time actions remain available. Session context is optional and not backed up; disabling sessionStorage does not block the app.
  - Schema/ZIP format v4; live v3 settings upgrade adds an empty dailyPlans map, earlier versions retain existing migrations, and imports support v1/v2/v3/v4. Missing effort remains unspecified. No user storage reset or seed.
  - Automated suite: 100/100 tests pass across 14 suites, including 13 M5 tests. Executed with Node 26 and the existing temporary TypeScript import adapter because tsx is unavailable. M4 upgrade assertions were advanced to the current version without removing their preservation checks.
  - Supplementary local TypeScript 6.0.3 semantic check for domain/storage/context and syntax checks for all 6 affected React files: zero diagnostics.
  - npm run lint fails: missing tsc. npm run build fails: missing vite. Dependencies remain unavailable following the M4 installation failures. Full configured project type check, production build, browser scroll/focus/keyboard/device verification and native IndexedDB upgrade remain unverified. The upgrade callback is tested with isolated mock records.
  - Stopped at M5. M6 and later remain planned. The previously recorded backup-limit documentation mismatch remains outside this stage.


- **Checkpoint M6 implementation (2026-11-04), verification incomplete**:
  - Followed the latest explicit M6 request for life areas/reviews, superseding the earlier M6-habits/M7-life-areas numbering. Habit minimum versions/context/work-day rules are not implemented in this stage and remain separately deferred.
  - Genuinely fresh initialization provides the exact ten editable Ukrainian areas. Existing areas are never overwritten or reseeded, including an existing empty area store. Upgrades offer explicit starter add/mapping, with no name-similarity matching. Added rename, standing definition, hide/archive and non-drag ordering.
  - Added new 0–10 reviews with explicit inclusive calendar-date periods, optional two-week suggestion, independent null/zero/false/empty answers, immutable question/name/identity/version/definition/scale snapshots and accessible history. Existing missing scale metadata stays interpreted as legacy 1–10. Normal save cannot overwrite a historical assessment; no history is removed by area edits or merges.
  - Life-area reviews no longer auto-enable the unrelated state-check-in module; saved enabled preferences and actual personal-record detection remain preserved.
  - Reused M1 effective-link resolution for goals/projects/tasks, extending the projection to directions, habits, events and reservations. Direct links override inherited links and records are deduplicated without copying assignments. Added optional direct area references to folders/tasks/events.
  - Confirmed area merge transaction reassigns direct live relationships, dynamically updates inherited results, retains the source area as an archived identity, transfers starter mappings, and never rewrites historical assessment records. Source/target revisions and reviewed effective-link signatures prevent stale merges. Injected failure proves full rollback.
  - Explicit actions: title-only next-task editor without a date; reviewed existing-record linking; related roadmap inspection; normal project navigation to reduce scope; confirmed pause without time changes; M5 task-planning preview for selected future-time release. Unsaved review answers prompt before navigating into a plan.
  - Added manual short planning review in Я: shifts, blocking and non-blocking events, dated tasks/reservations, current goals, unoccupied time and active project reduction/pause. It creates no journal, schedule, recurring task or permission prompt.
  - Schema/ZIP v5 reuses existing stores and preserves v1–v4 imports. Live v4 upgrade changes only settings schema metadata; existing areas and assessments remain untouched. Both new and legacy review data and merge identities survive real ZIP validation/atomic replacement in isolated memory databases.
  - Automated suite: 114/114 tests pass across 15 suites, including 14 M6 tests. Executed with Node 26 plus the existing temporary TypeScript import adapter. The Stage 10 fresh-start assertions now require ten areas and explicitly initialize their fresh fixture; legacy eight-area preservation has dedicated M6 coverage.
  - Supplementary local TypeScript 6.0.3 domain/storage semantic checks and syntax checks for all 5 affected React files pass with zero diagnostics. npm run lint fails (tsc unavailable); npm run build fails (vite unavailable). The previously unavailable dependencies remain a blocker. No browser/device checks or native IndexedDB upgrade are claimed; upgrade callback tests use isolated mocks.
  - Stop at the requested M6 scope. Remaining stages and the pre-existing backup-limit documentation mismatch are not included.


- **Checkpoint M7 (2026-11-04)**:
  - Implemented the explicitly requested combined state-check-in/preferred-life stage. No later feature stages or deferred habit alignment implemented.
  - Reused unified personal records with optional version-1 scales and sleep; no new diary form. Independent same-day records, explicit dates, editing and confirmed deletion; preserved text, original timestamps, IDs, tags and scores. Secondary archive supports read/copy/selected JSON export. Disabled modules retain history and backups.
  - Reused inspiration/media for “Моє бажане життя”, its framing and optional prompts, local images, safe links, life-area/goal/project relationships. Existing quotes/notes/favorites/images/links remain in saved inspiration. No external fetching or automatic planning. Fragment relationships participate in area merges; goal deletion safely unlinks them.
  - Schema/ZIP v6; metadata-only live upgrade, v1–v6 imports, no reset or reseeding. Selected JSON export format documented in BACKUP_FORMAT.md.
  - Installed existing dependencies with --legacy-peer-deps to accommodate the existing Vite/esbuild peer-resolution conflict; no manifest/dependency changes. Two pre-existing compiler issues received type-only fixes (roadmap group annotation and optional legacy manifest field deletion).
  - Final verification: npm run lint passes; npm run build passes (non-blocking >500 kB bundle warning); full automated suite 120/120 passes across 16 suites, including 6 M7 tests. Tests ran with node --import tsx and explicit suite imports (the sandbox blocks the tsx CLI IPC socket). git diff --check passes.
  - Isolated Chromium: 390×844 create/edit/multiple records, zero sleep, quality, selected JSON download, archive separation, preferred-life text/link, saved collection and disabled-state history pass without page errors. Desktop 1440×900 rendering checked. Separate native IndexedDB v5→v6 upgrade preserves exact legacy text/scored entries and quote, with archive/saved access verified.
  - No remaining M7 blocker. Physical-device behavior, OS clipboard permission handling and exhaustive accessibility audit remain unverified. The previously recorded backup-limit documentation mismatch remains outside M7. Stopped after M7.
