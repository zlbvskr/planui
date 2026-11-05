# Stage 7 — Visual Consistency Sweep

## Touched Screens & Primitives (3 lines per touched area)

### 1. Hygiene Route Matrix (`tests/ui-hygiene.spec.ts`, `tests/ui-runtime.ts`)
- Expanded `ROUTES` from 31 to 40 routes covering every screen, sheet, and sub-screen across `Сьогодні`, `Календар`, `Напрями`, and `Я` (`filled` + `empty`, `dark` + `light`).
- Added multi-viewport (`320×568`, `430×932`), `reduced-transparency`, `prefers-contrast: more`, and `200%` browser text zoom (`34px` root font-size) sweeps.
- Fixed route-to-route navigation reset and scoped sheet button locators (`calendar-templates`, `me-wishlist-categories`) so all 160 baseline cases pass with 0 findings.

### 2. Source Guards & Product Invariants (`src/ui/__tests__/sourceGuards.test.ts`, `scripts/run-tests.mjs`)
- Added a static source guard unit test scanning `src/` for raw date rendering outside `src/lib/format.ts`, `Europe/Kyiv` outside Settings, `uppercase`, `<select`, raw `date`/`time`/`checkbox` inputs, `▶`/`▼`, `(0)` counters, hex colors outside CSS tokens, and duplicated `Card`/`Section`/`Pill` definitions.
- Added a product-invariant scan across all user-facing strings forbidding `серія`, `streak`, `борг`, `прострочен`, `рейтинг`, `загальний бал`, `незайнято`, and `хв` totals outside `<InfoSheet>` negations.
- Registered the suite in `scripts/run-tests.mjs` (all 220 unit tests across 25 suites pass).

### 3. Shared Primitives, Tokens & Dead Code Removal (`src/index.css`, `src/ui/contract.tsx`, `src/components/ui/primitives.tsx`)
- Added missing `--color-danger: var(--color-brand);` token in `:root`, softened light-mode `.ui-toggle > span` thumb contrast, and widened 7-column calendar/week grids at `@media (max-width: 340px)` so all day cells maintain `>= 44px` targets on `320×568`.
- Added keyboard navigation (`ArrowRight`, `ArrowLeft`, `Home`, `End`) to `PillRow`, focus restoration and swipe-down/backdrop/`Esc` dismissal to `Sheet`, and `200%` text-zoom wrapping rules.
- Removed unused `src/ui/OptionalSlider.tsx`, `src/components/ui/OptionalSlider.tsx`, dead primitives (`Surface`, `TopBar`, `GlassBar`, `Card`, `EmptyStateCard`, `ProgressBar`), and unused legacy CSS rules.

### 4. Сьогодні, Звички & Події (`src/views/TodayWorkspaceView.tsx`, `src/components/today/TaskPlanningSheet.tsx`, `src/components/habits/HabitSessionSheet.tsx`, `src/components/timeline/EventDetailSheet.tsx`)
- Replaced raw ISO dates and minute counters in `TaskPlanningSheet`, `HabitSessionSheet`, and `EventDetailSheet` with `formatDate`, `formatTime`, and `formatDuration` from `src/lib/format.ts`.
- Simplified the `"Переглянути попередні плани"` row in `TodayWorkspaceView` so the trailing label does not duplicate `"Переглянути"` or clip the title.
- Replaced product-invariant wording (`прострочених`, `незайнято`, `серія`) with neutral Ukrainian phrasing.

### 5. Напрями & Календар (`src/views/PlansView.tsx`, `src/components/roster/WorkRosterSubview.tsx`)
- Replaced raw ISO date strings in `PlansView` and `WorkRosterSubview` with `formatDate` from `src/lib/format.ts`.
- Removed dead helper functions (`statusTextUk`, `horizonTextUk`) and unused imports in `PlansView`.
- Preserved 7-column calendar and week strip touch targets (`>= 44px`) on `320×568` viewports.

### 6. Я, Налаштування & PWA (`src/views/BasicSettingsView.tsx`, `src/components/pwa/PwaStatusAndInstallCard.tsx`)
- Removed the redundant `"Скасувати"` footer button from the `"Стерти всі дані"` confirmation sheet in `BasicSettingsView` so sheets keep a single primary action and close via `×`, backdrop, swipe, or `Esc`.
- Fixed `--color-danger` button styling on `"Так, стерти всі дані"` in both light and dark modes.
- Replaced hardcoded hex colors in `PwaStatusAndInstallCard` SVG icon with `currentColor` and `var(--color-calendar-selected-fg)`.

---

## Bundle & CSS Size (Before vs. After)

| Asset | Before Stage 7 Cleanup | After Stage 7 Cleanup | Delta |
|---|---:|---:|---:|
| JS bundle (`dist/assets/index-*.js`) | `1,280.39 kB` (`1,280,390 B`) | `1,269.02 kB` (`1,269,022 B`) | **`-11.37 kB` (`-11,368 B`)** |
| CSS bundle (`dist/assets/index-*.css`) | `73.32 kB` (`73,325 B`) | `65.98 kB` (`65,980 B`) | **`-7.35 kB` (`-7,345 B`)** |
| Worker bundle (`dist/assets/projection.worker-*.js`) | `29.80 kB` (`29,802 B`) | `29.80 kB` (`29,802 B`) | `0 B` |

---

## Contact Sheets (Outside Repo)

- Dark contact sheet (40 screens): `/tmp/planui-contact-dark.png`
- Light contact sheet (40 screens): `/tmp/planui-contact-light.png`

---

## Screen Table (40 Routes — Before & After Screenshot Paths)

| Route ID | Screen / Sheet | Before Screenshot Paths (Dark / Light) | After Screenshot Paths (Dark / Light, Filled & Empty) |
|---|---|---|---|
| `me-hub` | Я — головний хаб | `docs/stage5/me-hub-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-hub-{dark,light}-{filled,empty}.png` |
| `me-areas` | Сфери життя | `docs/stage5/me-areas-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-areas-{dark,light}-{filled,empty}.png` |
| `me-area-sheet` | Аркуш сфери життя | `docs/stage5/me-area-sheet-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-area-sheet-{dark,light}-{filled,empty}.png` |
| `me-areas-review` | Огляд сфер | `docs/stage5/me-areas-review-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-areas-review-{dark,light}-{filled,empty}.png` |
| `me-planning` | Короткий огляд планування | `docs/stage5/me-planning-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-planning-{dark,light}-{filled,empty}.png` |
| `me-state` | Стан — сьогодні | `docs/stage5/me-state-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-state-{dark,light}-{filled,empty}.png` |
| `me-state-sleep` | Стан — сон | `/tmp/planui-stage7-before/me-state-sleep-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-state-sleep-{dark,light}-{filled,empty}.png` |
| `me-inspiration` | Моє бажане життя | `/tmp/planui-stage6/me-inspiration-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-inspiration-{dark,light}-{filled,empty}.png` |
| `me-inspiration-sheet` | Аркуш натхнення / додавання | `/tmp/planui-stage6/me-inspiration-sheet-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-inspiration-sheet-{dark,light}-{filled,empty}.png` |
| `me-wishlist` | Список бажань | `/tmp/planui-stage6/me-wishlist-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-wishlist-{dark,light}-{filled,empty}.png` |
| `me-wishlist-add` | Аркуш додавання бажання | `/tmp/planui-stage6/me-wishlist-add-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-wishlist-add-{dark,light}-{filled,empty}.png` |
| `me-wishlist-categories` | Аркуш категорій списку бажань | `/tmp/planui-stage7-before/me-wishlist-categories-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-wishlist-categories-{dark,light}-{filled,empty}.png` |
| `me-settings` | Налаштування | `/tmp/planui-stage6/me-settings-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-settings-{dark,light}-{filled,empty}.png` |
| `me-settings-backup` | Аркуш резервної копії | `/tmp/planui-stage6/me-settings-backup-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-settings-backup-{dark,light}-{filled,empty}.png` |
| `me-settings-reset` | Аркуш скидання даних | `/tmp/planui-stage7-before/me-settings-reset-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/me-settings-reset-{dark,light}-{filled,empty}.png` |
| `today-day` | Сьогодні — День | `docs/stage1/after/day-{dark,light}.png` | `/tmp/planui-stage7/today-day-{dark,light}-{filled,empty}.png` |
| `today-day-midnight` | Сьогодні — День (опівніч) | `docs/stage1/after/day-midnight-dark.png` | `/tmp/planui-stage7/today-day-midnight-{dark,light}-{filled,empty}.png` |
| `today-tasks` | Сьогодні — Завдання | `docs/stage1/after/tasks-{dark,light}.png` | `/tmp/planui-stage7/today-tasks-{dark,light}-{filled,empty}.png` |
| `today-habits` | Сьогодні — Звички | `/tmp/planui-stage7-before/today-habits-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/today-habits-{dark,light}-{filled,empty}.png` |
| `quick-task` | Швидке створення завдання | `/tmp/planui-stage7-before/quick-task-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/quick-task-{dark,light}-{filled,empty}.png` |
| `quick-event` | Швидке створення події | `/tmp/planui-stage7-before/quick-event-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/quick-event-{dark,light}-{filled,empty}.png` |
| `quick-habit` | Швидке створення звички | `/tmp/planui-stage7-before/quick-habit-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/quick-habit-{dark,light}-{filled,empty}.png` |
| `triage` | Попередні плани (тріаж) | `/tmp/planui-stage7-before/triage-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/triage-{dark,light}-{filled,empty}.png` |
| `weekly` | Щотижневий огляд (крок 1) | `/tmp/planui-stage7-before/weekly-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/weekly-{dark,light}-{filled,empty}.png` |
| `weekly-step-2` | Щотижневий огляд (крок 2) | `/tmp/planui-stage7-before/weekly-step-2-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/weekly-step-2-{dark,light}-{filled,empty}.png` |
| `weekly-step-3` | Щотижневий огляд (крок 3) | `/tmp/planui-stage7-before/weekly-step-3-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/weekly-step-3-{dark,light}-{filled,empty}.png` |
| `weekly-step-4` | Щотижневий огляд (крок 4) | `/tmp/planui-stage7-before/weekly-step-4-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/weekly-step-4-{dark,light}-{filled,empty}.png` |
| `directions-root` | Напрями — корінь | `docs/stage4/directions-root-dark-filled.png` | `/tmp/planui-stage7/directions-root-{dark,light}-{filled,empty}.png` |
| `directions-folder` | Напрями — папка | `docs/stage4/directions-folder-dark-filled.png` | `/tmp/planui-stage7/directions-folder-{dark,light}-{filled,empty}.png` |
| `directions-goal` | Напрями — ціль | `docs/stage4/directions-goal-dark-filled.png` | `/tmp/planui-stage7/directions-goal-{dark,light}-{filled,empty}.png` |
| `directions-project` | Напрями — проєкт | `docs/stage4/directions-project-dark-filled.png` | `/tmp/planui-stage7/directions-project-{dark,light}-{filled,empty}.png` |
| `directions-roadmap` | Глобальна дорожня карта | `docs/stage4/directions-roadmap-dark-filled.png` | `/tmp/planui-stage7/directions-roadmap-{dark,light}-{filled,empty}.png` |
| `directions-goal-roadmap` | Дорожня карта цілі | `docs/stage4/directions-goal-roadmap-dark-filled.png` | `/tmp/planui-stage7/directions-goal-roadmap-{dark,light}-{filled,empty}.png` |
| `directions-filters` | Аркуш фільтрів напрямів | `docs/stage4/directions-filters-dark-filled.png` | `/tmp/planui-stage7/directions-filters-{dark,light}-{filled,empty}.png` |
| `calendar-month` | Календар — Місяць | `/tmp/planui-stage7-before/calendar-month-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/calendar-month-{dark,light}-{filled,empty}.png` |
| `calendar-week` | Календар — Тиждень | `/tmp/planui-stage7-before/calendar-week-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/calendar-week-{dark,light}-{filled,empty}.png` |
| `calendar-day` | Календар — День | `/tmp/planui-stage7-before/calendar-day-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/calendar-day-{dark,light}-{filled,empty}.png` |
| `calendar-roster` | Календар — Графік | `/tmp/planui-stage7-before/calendar-roster-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/calendar-roster-{dark,light}-{filled,empty}.png` |
| `calendar-stamp` | Календар — Штамп змін | `/tmp/planui-stage7-before/calendar-stamp-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/calendar-stamp-{dark,light}-{filled,empty}.png` |
| `calendar-templates` | Календар — Шаблони змін | `/tmp/planui-stage7-before/calendar-templates-{dark,light}-{filled,empty}.png` | `/tmp/planui-stage7/calendar-templates-{dark,light}-{filled,empty}.png` |

---

## Actual Verification

- `npm run lint`: passed (`tsc --noEmit`, 0 errors).
- `npm run build`: passed (`tsc && vite build && node scripts/check-dist.mjs`).
- `npm test`: passed (**220/220 tests across 25 suites**, including `Stage 7 source guards and product invariants`).
- `npm run test:ui-hygiene`: passed (**160/160 baseline cases across 40 routes**, `dark` + `light`, `filled` + `empty`, 0 hygiene or axe violations).
- Extended WebKit verification (`320×568`, `430×932`, `reduced-transparency`, `prefers-contrast: more`, `200%` text zoom, sheet close by swipe/backdrop/`Esc` + focus return, keyboard navigation on `Segmented` and `PillRow`, zero tab-switch layout shift, tab bar padding `>= bar + safe area + 24`, and optional modules hiding all entry points when disabled): passed.

---

## Remaining Risks

- Large primary JS chunk warning from Vite (`~1.27 MB` minified before gzip) remains because all local-first repositories, ZIP/CSV/PDF exporters, and views bundle into the offline-first SPA shell.
- At `200%` root font-size (`34px`) on `320×568`, deeply nested user-authored titles truncate with an ellipsis rather than wrapping past 2 lines inside compact rows.
- System native `<input type="date" | "time">` pickers inside `DateField` and `TimeField` rely on the host browser's native popover rendering when activated.
