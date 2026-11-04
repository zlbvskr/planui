# PLANUI

A local-first Ukrainian personal planner: Today, Calendar, Directions and Me.
It connects tasks, goals/projects, irregular work shifts, explicit scheduled sessions,
optional habits, life-area reviews, check-ins, preferred-life inspiration and Wishlist.
Data stays in browser IndexedDB; no account, backend, API key or runtime AI is required.

## Install and develop

Use Node.js 24 LTS (minimum 22.12) and npm:

```sh
npm ci
npm run dev
```

Development: http://localhost:3000/ with HMR, no service worker.
Production preview: http://127.0.0.1:4173/planui/ after building:

```sh
npm run lint
npm test
npm run build
npm run check:dist
npm run preview -- --host 127.0.0.1
```

lint runs TypeScript checking, not ESLint. Tests use isolated storage. For Chromium
production PWA/offline, ZIP backup and native storage checks:

```sh
npx playwright install chromium
npm run test:pages
npm run test:regression
```

Set CHROMIUM_PATH=/usr/bin/chromium when using a system installation.
Supplemental browser regressions require a running dev server:

```sh
PLANUI_TEST_URL=http://127.0.0.1:3000 node scripts/check-m10-browser.mjs
PLANUI_TEST_URL=http://127.0.0.1:3000 node scripts/test-redesign.mjs
PLANUI_TEST_URL=http://127.0.0.1:3000 node scripts/test-gap-closure.mjs
```

## Deploy

GitHub Pages production base is **/planui/**; preserve hash routing and relative
manifest/icon URLs. In repository Settings → Pages, choose **GitHub Actions**.
.github/workflows/deploy.yml validates PRs; only main pushes/manual runs deploy the
built dist artifact after checks. Enable Actions and allow main in the github-pages
environment. Inspect the actual workflow result before claiming a deployment. No
frontend secrets are needed or safe to embed. npm run clean removes local build output.

First successful online loading is required for offline use. The worker precaches a
complete release, stages updates and waits for explicit activation outside editing.
Core operation is offline; external links need network access. Browser installation
and permissions depend on the OS; native installation requires physical-device checks.

## Limitations and data safety

Keep external ZIP backups: local recovery points share the browser's failure modes.
There is no cloud sync, application encryption, secure-erasure guarantee or guaranteed
background reminder. Site-data clearing, eviction and device loss can remove data.
Storage belongs to the origin; a new host does not automatically inherit old data.
Use explicit ZIP export/import instead of clearing storage or copying raw stores.

Known remaining issues: a large single JS chunk; large view/repository modules;
automatic compatible resolution of the 2026 Lord Howe half-hour DST gap chooses
01:45 for nonexistent 02:15 instead of forward 02:45. Gap rejection and repeated-time
selection work in regression tests; the automatic-gap defect remains unfixed.
Chromium automation is not Safari/iOS/Android physical-device verification. Performance
microbenchmarks are not guarantees of real-device latency or FPS.

See [Architecture and product invariants](docs/ARCHITECTURE.md) and
[Persistence, backup and compatibility](docs/DATA_MODEL.md). These retain current
requirements and non-obvious constraints; executable TypeScript defines serialized
shapes and validators. Historical milestones are available in Git history.
