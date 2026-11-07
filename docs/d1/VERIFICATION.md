# Stage D1 — Motion System Verification & PR Summary

## Dependency & Bundle Size Report
- **Decision**: Implemented with zero external runtime dependencies using CSS transitions + Web Animations API (`Element.animate()`) + analytical damped harmonic oscillator spring solver (`solveSpringKeyframes`) + FLIP in `src/ui/motion.ts` (avoiding `motion` / `framer-motion` overhead altogether).
- **Measured Initial-JS Bundle Size (`dist/assets/index-*.js`)**:
  - **Baseline (`22229e3`)**: `944,151 B` raw / `252,871 B` gzipped (`246.94 KB`)
  - **Stage D1**: `968,722 B` raw / `260,327 B` gzipped (`254.23 KB`)
  - **Delta**: `+24,571 B` raw / **`+7,456 B` (`+7.28 KB`) gzipped** (`<= 30 KB` budget).

## Touched Screens & Areas (Three Lines Each)

### 1. Motion Tokens & Primitives (`src/ui/motion.ts`, `src/ui/contract.tsx`, `src/ui/legacy.tsx`, `src/ui/feedback.tsx`)
- Added `springs` (`press` 520/38, `smooth` 320/30, `sheet` 380/36, `gentle` 220/26), `tweens` (`fast` 140ms, `base` 220ms, `slow` 360ms), `easings` (`out`, `emphasized`), and `useReducedMotion()` synced with OS `prefers-reduced-motion` and Settings `"Зменшити рух"`.
- Wired `usePressFeedback` (`scale(0.97)` + brightness in, `springs.press` out) into `Button`, `Row`, `RoundButton`, `Pill`, and `ItemCard`, plus shared FLIP selection thumbs (`useSelectionThumb` with `springs.smooth`) into `Segmented`, `PillRow`, `TabBar`, and `WeekStrip`.
- Upgraded `Disclosure` (`grid-template-rows: 0fr -> 1fr`, chevron `0deg -> 90deg`), `Sheet`/`ModalSheet` (`springs.sheet` + drag-to-dismiss with rubber-band resistance + background scale), `ActionMenu` (`scale(0.92) -> 1`), `Toast` (spring slide + swipe dismiss), `Toggle` (`springs.press` + scaleX stretch), and `Slider` (`scale(1.18)` active thumb).

### 2. Navigation, Shell & Ambient Canvas (`src/components/shell/FloatingShell.tsx`, `src/App.tsx`, `src/components/shell/creationTransition.ts`)
- Wired shared-element Quick Add `+` orb morph (`captureOrbRect` + `clip-path: inset(... round 28px)` + `springs.sheet`) from the floating dock into the creation `Sheet` and back on dismiss without ghosting or clipping.
- Added directional tab transition choreography (`useTabTransition` with `160ms` cross-fade + `6px` directional shift), `useScrollCollapse` (`--collapse: 0..1` via `requestAnimationFrame`), and floating dock collapse (`translateY(28px) scale(0.94)` on scroll down, spring back on scroll up).
- Added 3-layer pre-blurred `AmbientCanvas` (`42s–58s` transform-only drift loop) that automatically pauses when `document.hidden`, on reduced motion, and during fast scrolling.

### 3. Today, Calendar, Plans & Me (`src/views/TodayWorkspaceView.tsx`, `src/components/today/TodayTasksPanel.tsx`, `src/views/CalendarWorkspaceView.tsx`, `src/views/PlansView.tsx`, `src/views/MeWorkspaceView.tsx`)
- Added task completion choreography in `TodayTasksPanel`: check icon spring scale (`0 -> 1.15 -> 1`), title strike-through reveal (`scaleX 0 -> 1`, `180ms`), row dim (`opacity 0.55`), `220ms` hold, and FLIP layout glide for siblings via `AnimatedList`.
- Added directional slide transitions (`useDirectionalSlide`) for Calendar period navigation (`Попередній`/`Наступний період`), `Segmented` mode cross-fades (`Місяць`/`Тиждень`/`День`/`Графік`), and `WeekStrip` shared selection thumb.
- Added iOS-style sub-screen push/pop (`useSubScreenTransition`, `320ms` `easings.emphasized` with `-28%` parent parallax shift & dim, skipping animation on browser `popstate`) in `PlansView` and `MeWorkspaceView`, plus `"Зменшити рух"` toggle in Settings.

### 4. Component Gallery (`/dev/gallery`, `src/dev/gallery/index.tsx`, `docs/DESIGN.md`)
- Expanded `/dev/gallery` with interactive Stage D1 motion harnesses: `AnimatedList` add/remove/reorder FLIP demo, Quick Add `+` orb shared-element morph into `Sheet`, interactive sheet drag-to-dismiss, and `Toast` swipe-down dismiss.
- Documented the 4 springs, 3 tweens, 2 easings, and hard compositor rules (`transform`/`opacity`/`clip-path` only, scoped `will-change`, reduced motion `<= 120ms` opacity fade) in `docs/DESIGN.md` (`## MOTION`, `<= 20` lines).
- Verified `/dev/gallery` remains excluded from the production bundle (`npm run check:dist`).

## Risks & Mitigations
- **Compositor & Layout Thrash**: Enforced `transform` and `opacity` (plus `clip-path` for orb morph) only; FLIP geometry reads happen once in `useLayoutEffect` before starting WAAPI animations, never inside animation frames.
- **Interruptibility & Reduced Motion**: `runInterruptibleAnimation` cancels in-flight animations before retargeting; `useReducedMotion()` collapses all transitions to `<= 120ms` opacity fades with zero travel/scale/drift.
- **Storage & PWA Safety**: Presentation-only changes; `reducedMotion` is an optional boolean on `PlanuiSettings` (`settings.reducedMotion`), preserving all existing snapshots, IndexedDB stores, backups, offline behavior, and `/planui/` base path.

## Actual Verification Run
- `npm run lint`: **PASS** (`tsc --noEmit`, 0 errors)
- `npm test`: **PASS** (223/223 unit & domain tests, including `src/ui/__tests__/motion.test.ts`)
- `npm run build` & `npm run check:dist`: **PASS** (`+7.28 KB` gzipped JS; `/dev/gallery` excluded from dist)
- `npm run test:d0`: **PASS** (all 4 dark/light × 100%/125% gallery hygiene + axe AA checks)
- `npm run test:d1`: **PASS** (390×844 gallery primitives, orb morph, sheet drag, toast swipe, Today task completion choreography, Calendar directional slide, Me push/pop, Settings `"Зменшити рух"`, and Chromium 4x CPU throttle performance with 0 longtasks > 50ms and 0 consecutive dropped frames)
- `npm run test:ui-primitives` & `npm run test:stage1`: **PASS**
- `npm run test:ui-hygiene`: **PASS** (0 baseline failures across all 160 route × theme × fixture cases)
