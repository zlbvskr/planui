# GitHub Pages deployment

Target: https://zlbvskr.github.io/planui/ (branch `main`). This change is based on
main's M6 baseline; the separate, unpublished local M7 work is not included.

## Build and routing

Node.js 24 LTS, locked dependencies (`npm ci`). Vite production base is `/planui/`;
`npm run dev` remains at `/` with HMR and no service worker. Hash navigation is
retained, so refreshing a bookmark does not need a server-side SPA rewrite.
HTML manifest/favicon/touch-icon references use `%BASE_URL%`; Vite rewrites the
source entry, CSS and bundled JavaScript. There are no remote fonts or essential
external assets. User-provided external links still need a network connection.

`npm run check:dist` verifies the shell, JS/CSS, icons, relative manifest URLs,
complete precache references and absence of unresolved build placeholders.

## PWA behavior

Manifest `id`, `start_url` and `scope` are relative to the manifest. Registration
uses `import.meta.env.BASE_URL` with `updateViaCache: none`. Existing PWA UI and
lifecycle code were present but disconnected on main; they are now connected to
App and Settings. The existing safe-update button remains blocked while a modal
or inline personal/review editor is open, conservatively even before edits.

The build plugin reads Vite's resolved base/outDir, enumerates emitted files,
and hashes their bytes plus the worker source and base. Every precache URL stays
inside `/planui/`. Install fetches the complete asset set before writing; network
or cache-write failure does not replace the active worker. Activation deletes
only obsolete caches in this registration's scope namespace. It never touches
IndexedDB, localStorage, user media or sibling apps' caches.

The installed worker serves the matching cached shell and hashed assets until
explicit safe-update activation, preventing mixed old/new release assets.
Only same-origin GET navigation within its scope and enumerated app assets are
handled. Requests outside `/planui/`, unknown runtime resources and non-GET
requests pass through. Returning online or to a visible tab checks for updates;
reopening the app also invokes normal browser registration update checks.

A first successful online load is required before offline use. Native OS PWA
installation and device-specific permission dialogs require manual device checks;
a headless browser test is not equivalent to installing on a phone.

## CI/CD and enabling Pages

`.github/workflows/deploy.yml` validates pull requests and pushes to main. Only
main pushes/manual runs can deploy, and the deploy job depends on a successful
build job. CI runs type checks, all automated tests, production build, artifact
validation and Chromium production/PWA checks. `contents: read` is the default permission; only the deploy job gains
`pages: write` and `id-token: write`. Concurrency cancels obsolete production runs
and isolates PR verification. Official upload-pages-artifact/deploy-pages actions
publish only `dist`.

In the repository: **Settings → Pages → Build and deployment → Source → GitHub
Actions**. Ensure Actions are enabled and the `github-pages` environment permits
main. Merge the PR, then inspect **Actions → Deploy PLANUI to GitHub Pages**.
A manual **Run workflow** on main is also available. No token or secret is needed
in the frontend or workflow. Do not choose “Deploy from a branch” for source files.

At inspection time (2026-11-04), Pages already reported `build_type: workflow`,
so no source-mode change was required. The live URL returned HTTP 200, but its
HTML referenced `/src/main.tsx` and root-level icons/manifest: this was a source
publication, not the verified production artifact. The new workflow cannot
publish the PR's fixes until they are merged into main. The referenced `/src/main.tsx` was independently requested and returned HTTP 404.
A successful existing Pages run is not evidence that this PR has deployed.

## Local verification

```sh
npm ci
npm run lint
npm test
npm run build
npm run check:dist
npx playwright install chromium
npm run test:pages
```

Use `CHROMIUM_PATH=/usr/bin/chromium` when Chromium is preinstalled. The browser
harness serves actual production files under `/planui/` with real 404s, uses an
isolated profile and temporary release fixtures, and never clears user storage.
It exercises navigation, local data, ZIP export/import, offline reload, worker
scope, failed update rejection, explicit activation and scope-only cache cleanup.
A second release fixture changes HTML and the worker version; a broken fixture
has a missing precache file. These simulate deployment lifecycles locally; they
do not constitute an actual GitHub deployment or native OS installation.

## Data and server requirements

No storage keys, database names, schema versions, migration logic or backup
formats change. Browser storage is origin-based, not URL-path-based: sibling
projects on zlbvskr.github.io share the origin. Existing data on another origin
(e.g. AI Studio or localhost) is not automatically copied; export ZIP there and
explicitly import it on Pages. Do not reset storage to move hosts.

The frontend uses no server APIs or secret credentials. Starter express/dotenv/
Google GenAI packages are unused by the production application; no backend is
started and no secret is bundled. The obsolete AI Studio API-key setup text was
removed. Any future secret-key API feature needs a separately secured backend;
GitHub Pages cannot safely host such a secret itself.

## Browser compatibility fixes found during verification

The existing ZIP compressor awaited write/close before consuming readable output.
Chromium can apply backpressure and leave export waiting indefinitely. Reading
and writing now proceed concurrently; the ZIP format, validation limits and
stored data are unchanged. A forced-backpressure regression test and real
browser ZIP export/import verify the fix.

Settings confirmation panels render inline inside the shell. The prior modal
signal made the entire shell inert, including the import confirmation button.
The shell now separates hiding floating controls/PWA update blocking from
background inertness, so inline settings confirmations remain interactive while
portaled dialogs continue to disable their background. No confirmation is bypassed.

## Results

Clean `npm ci`, `npm run lint`, 119 automated tests, production build and all 10
precache resource checks passed. The production Chromium harness passed at
390×844 and rendered at 1440×900, with no page exceptions, critical console errors or unexpected resource
HTTP errors. Vite preview was separately checked at /planui/ (including JavaScript
MIME), and development at / with working HMR/source entry. Installability diagnostics returned no errors in a disposable normal
profile. Offline tests set both request emulation and navigator network state via
CDP, which are separate Chromium settings. ZIP export/restore, task/localStorage
preservation, blocked activation during editing, incomplete update rejection,
explicit activation and scope-only cache cleanup passed.

The existing build warning about a JavaScript chunk exceeding 500 kB remains;
it does not fail the build. Native OS installation and physical devices are not
verified. New production deployment is pending PR merge and a successful Pages
workflow. The existing public source deployment is known broken as described above.
