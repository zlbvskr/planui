# Release checklist — M10 checkpoint

Scope: PLANUI-LIFE-ALIGNMENT-1 M10 integration/recovery hardening, 2026-11-04. This is evidence for M10, not a final PWA/product release audit. Wishlist is M9; previous M10 Wishlist labels are historical.

| Check | Executed result |
|---|---|
| TypeScript | `npm run lint` — passed |
| Complete domain/storage regression | Command below — 168/168 tests passed, 19 suites, no skipped/cancelled tests |
| Production bundle | `npm run build` — passed; existing >500 kB chunk warning remains |
| Patch whitespace | `git diff --check` — passed |
| Native Chromium migration/recovery | Browser command below — passed in isolated contexts/databases |
| Runtime privacy review | Reviewed src/public/index runtime requests, URL handling and log calls: no analytics, remote preview fetches or sensitive runtime logs found; service-worker fetches are existing static-resource infrastructure |
| Full ZIP coverage | Existing Stage 11 all-collection/media fixture plus M1–M9 and M10 round-trips passed; disabled modules, archives, exact money, metadata and relationships retained |
| Canonical integration | M3/M4/M5/M8 plus M10 combined task/date/completion/habit/roadmap fixture passed; Stage 8 bounded roster generation/template independence suite passed |

Environment: Node 24.22.1, TypeScript 7, Vite 8.3.5, system headless Chromium 155 via externally installed Playwright. No browser dependency was added to the application bundle. The project has no `npm test` script; the complete actual test invocation was:

```sh
node --import tsx -e "Promise.all(require('node:fs').readdirSync('src/storage/__tests__').filter(f=>f.endsWith('.test.ts')).map(f=>import('./src/storage/__tests__/'+f)))"
```

For the browser scenario, start Vite on port 3006 and install/provide Playwright separately:

```sh
npm run dev -- --host 0.0.0.0 --port 3006
PLAYWRIGHT_MODULE_PATH=/tmp/planui-browser/node_modules/playwright/index.mjs \
  node scripts/check-m10-browser.mjs
```

`PLAYWRIGHT_MODULE_PATH` is optional when `playwright` resolves normally. `PLANUI_TEST_URL` and `CHROMIUM_PATH` may override the default dev URL and system Chromium path. The script uses isolated contexts only, including isolated intentionally corrupt image data; it never clears user storage.

Executed native-browser evidence:

- Native database entry points v1–v8 → v9 preserve original diary text, scores, IDs, timestamps, custom numeric habit logs/paused definitions, saved quotes, folder task ownership and exact fulfilled/archived Wishlist semantics. A v1 versionchange is intentionally aborted, the old database/version is confirmed intact, then retry succeeds. Repeated startup and ZIP export validation remain identical. Opening upgraded databases as version 8 fails with `VersionError`.
- Valid local PNG bytes decode and survive ZIP validation. A checksummed, matching-header but truncated raster fails import/export; the HTML Image fallback is also exercised with createImageBitmap temporarily unavailable.
- A native quota error injected after replacement clears/writes begin aborts the transaction; canonical records, generation and recovery history remain unchanged. This proves rollback behavior under the injected error, not every real OS/quota condition.
- Actual ZIP download, file selection, preview and explicit confirmation run through Settings. Another tab retains unsaved wish-editor text, shows a replacement warning and rejects stale saving. Live data remain the confirmed imported records. No page errors occur in this UI scenario.
- Opening a newer native schema shows a localized error and preserves its sentinel data.

Resolved findings: recovery capture/write race, unguarded replacement, pre-commit generation acknowledgement, mutable previews, recovery rotation under clock skew, immutable media collision, malformed ZIP/header/path/size validation, stale-tab auto-acknowledgement, permanent interrupted-tab advisory lock, blocked-open connection leak, documented-limit drift and invalid UTC rollover/precision acceptance. The M8 pending-cancellation test used the real clock and failed when its fixture session became ongoing; it now passes an explicit timestamp through an optional repository argument, preserving production wall-clock behavior and elapsed occupancy policy. Its old assertion equating DB/backup version numbers now checks each independently against the actual manifest.

Data implications: database schema 9 updates settings schema metadata only and closes older incompatible connections. ZIP format remains 8. Supported older archives and local snapshots migrate deterministically; entities, exact money, authored strings, temporal values and media IDs are preserved. A conflicting imported media ID with different bytes is rejected. Up to three local recovery points remain; failed/quota-limited operations retain existing data and points. No user database was reset or reseeded during implementation.

Pending beyond M10: final PWA install/offline/update/cache verification, GitHub Pages deployment verification and physical Safari/iOS/Android testing. Existing bundle-size warning is non-blocking but unresolved. Persistence approval, external-file retention, encryption and forensic secure deletion are not guaranteed. Local snapshots are not external backups. No access-protection layer was removed or invented. The separate Pages branch/PR is unchanged by M10.


## Pull Request preparation against current main

The current main now includes the previously separate GitHub Pages PR. It was merged into migration/m10 before publication, preserving the M7–M10 prerequisites and existing Pages behavior. The actual PR comparison includes M7–M10 because M7–M9 were still local prerequisites. This updates the earlier checkpoint statement that the Pages implementation was separate.

Post-merge checks executed: `npm ci --no-audit --no-fund`, `npm run lint`, `npm test` (**173/173**, including the five existing Pages/ZIP-stream tests), `npm run build`, `npm run check:dist`, and `git diff --check` all passed. The merged main supplies the npm test script and Playwright development dependency; the earlier M10-only command/environment description remains historical evidence.

`CHROMIUM_PATH=/usr/bin/chromium npm run test:pages` passed on the combined source/build under strict `/planui/` hosting, exercising navigation, task creation, storage and ZIP restore, offline/scope boundaries, failed worker install, explicit update activation and cache/data preservation at mobile and desktop viewport sizes. `node scripts/check-m10-browser.mjs` also passed against the restarted development server with locked dependencies: native upgrades/aborts/restart, raster decode, quota rollback, two-tab stale forms and newer-schema protection. A stale dev-server run timed out after reinstalling dependencies; restarting the server resolved it. No failing check remains.

The existing bundle-size warning and physical-device/native OS installation limits remain. Creating this PR does not deploy or merge it, and no new live deployment is claimed.
