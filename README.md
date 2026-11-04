# PLANUI

Local-first React + TypeScript + Vite planner. Application data stays in IndexedDB;
preferences also use localStorage. No server, account or API key is required.

## Development and verification

Use Node.js 24 LTS (minimum 22.12):

```sh
npm ci
npm run dev
```

Development runs at `http://localhost:3000/` with HMR and no service worker.
Production uses `/planui/`:

```sh
npm run lint
npm test
npm run build
npm run check:dist
npm run preview -- --host 127.0.0.1
```

Open the preview at `http://127.0.0.1:4173/planui/`.
For isolated production browser checks:

```sh
npx playwright install chromium
npm run test:pages
```

Alternatively set `CHROMIUM_PATH` to an installed Chromium executable.
See [GitHub Pages deployment and verification](docs/GITHUB_PAGES.md).
