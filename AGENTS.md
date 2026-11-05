# PLANUI
React/Vite/TypeScript PWA: local-first, Ukrainian UI, GitHub Pages under `/planui/`.
Read `docs/PRODUCT.md` only when a product question is unclear; read `docs/DESIGN.md` before touching any UI.
Work only on `redesign/liquid-glass`, never `main`; make small, reviewable commits.
Never break user data, backups, export/restore, offline behavior or PWA installation/update behavior.
No schema change without a backward-compatible migration; design stages do not change schemas.
Never remove a feature: move secondary actions into a menu, sheet or info sheet.
Do only the named stage; do not touch domain/business logic during presentation work.
At most two visual iterations per screen; do not re-audit finished screens.
Verify with `npm run lint`, `npm run build`, `npm test`, and Playwright WebKit 390×844 on the UI fixture.
Run `npm run test:ui-hygiene` for the current UI baseline; failures are tracked until their assigned stage.
Never claim checks you did not run; distinguish baseline failures from passing checks.
Update the PR description with three lines per touched screen plus risks and actual verification.
Keep the final answer to at most five lines.
