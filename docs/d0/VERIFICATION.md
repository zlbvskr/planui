# D0 v2 verification

Presentation foundation only; no persisted model, storage, backup or PWA lifecycle changes.

- `npm run lint`: passed.
- `npm run build`: passed; existing >500 kB chunk warning remains.
- `npm test`: 220 passed, 0 failed.
- `npm run check:dist`: passed, `/planui/` and all 11 precache URLs preserved; DEV gallery excluded from production JS/CSS.
- `npm run test:pages`: passed in Chromium at 390px/1440px, including IndexedDB/localStorage, task creation, ZIP export/restore, offline reload, scope boundaries, failed worker recovery, explicit update activation, cache cleanup and data preservation.
- `npm run test:ui-hygiene`: 0 findings across all 160 cases (40 routes × dark/light × filled/empty). No remaining failures. JSON/Markdown case counts are included alongside this report.
- `npm run test:ui-primitives`: passed in WebKit 390×844, including DurationField footer save and menu/keyboard/pointer behavior.
- `npm run test:d0`: four WebKit gallery cases (dark/light × 100/125%), screenshots, foundation hygiene, axe AA, pointer slider/reset, sheet blur/reduced-transparency/height, fixed toast/swipe/3.5s expiry.

Screenshots: `gallery-{dark,light}-{100,125}.png`, `sheet-…`, `toast-…`.
Visually reviewed dark gallery/sheet and light 125% gallery/sheet; corrected spacing and empty-value contrast within two visual iterations.

## Decisions and practical limits

The requested .42-opacity tertiary token is retained for decoration. The readable empty-status label uses secondary text: .42 produced only 3.7:1 in axe, below AA.
Timeline overflow was fixed by separating the truncated metadata text from fixed-size SVG effort indicators. All prior card actions remain available in its tap-opened sheet.
Physical iPhone pinch/focus behavior, native OS installation and a real software keyboard were not exercised. No-zoom CSS and cancelable gesture events were verified in WebKit.
WebKit ran from a disposable `/tmp` copy with missing Debian libraries unpacked there; host validation was skipped for that copy, and browser execution, assertions and axe ran normally. No dependency was added to the application for these libraries or axe.
