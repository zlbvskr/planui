# PLANUI Design System Specification

## 1. Visual Direction & Core Rules (C16–C18)

- **Restrained iOS-Inspired Craft**: Clean typographic hierarchy, neutral surfaces, subtle borders, coherent stroke icons (`lucide-react`), progressive disclosure, and responsive touch targets.
- **No Fake Hardware Chrome**: Never render fake phone bezels, dynamic islands, status bars, or macOS traffic-light window controls.
- **Themes**: `system` (default, tracks `prefers-color-scheme`), `light`, and `dark`. Persisted in IndexedDB (`settings.theme`) and mirrored to `localStorage` (`planui_theme_bootstrap`) for zero-flash startup.

---

## 2. Semantic Color Tokens & WCAG AA Contrast Audit (C16, C18)

### 2.1 Base Neutral & Brand Tokens

| Semantic Role | CSS Variable | Light Value | Dark Value | Contrast Audit & Notes |
|---|---|---|---|---|
| Canvas | `--bg-canvas` | `#F5F5F7` | `#000000` | Primary viewport background |
| Surface | `--bg-surface` | `#FFFFFF` | `#111214` | Cards, sheets, timeline background |
| Elevated | `--bg-elevated` | `#ECEEF1` | `#1B1D21` | Grouped controls, subtle chips, modals |
| Pressed Neutral | `--bg-pressed` | `#E1E4E9` | `#272A30` | Active/pressed interactive states |
| Primary Text | `--text-primary` | `#18191C` | `#F5F5F7` | **Light**: `17.6:1` on Surface, `16.0:1` on Canvas, `14.8:1` on Elevated, `13.4:1` on Pressed (Passes AAA). **Dark**: `19.3:1` on Canvas, `17.1:1` on Surface, `15.4:1` on Elevated, `13.2:1` on Pressed (Passes AAA). |
| Secondary Text | `--text-secondary` | `#5D626C` | `#ADB1BA` | **Light**: `6.14:1` on `#FFFFFF`, `5.59:1` on `#F5F5F7`, `5.17:1` on `#ECEEF1`, `4.69:1` on `#E1E4E9` (All pass WCAG AA >= 4.5:1). **Dark**: `9.82:1` on `#000000`, `8.68:1` on `#111214`, `7.85:1` on `#1B1D21`, `6.74:1` on `#272A30` (All pass WCAG AA >= 4.5:1). |
| Brand Red | `--color-brand` | `#B93E4B` | `#F08B95` | **Light**: `5.25:1` on `#FFFFFF`, `4.78:1` on `#F5F5F7`. *Contrast Adjustment on Elevated/Pressed*: On `#ECEEF1` (`4.42:1`) and `#E1E4E9` (`4.01:1`), text/icon foreground uses `--color-brand-text: #A63340` (`5.14:1` on `#E1E4E9`) so small text always exceeds `4.5:1`. **Dark**: `#F08B95` has `7.75:1` on `#111214` and `6.02:1` on `#272A30` (Passes AA). For filled primary buttons in dark mode, dark text `#18191C` on `#F08B95` gives `7.96:1` (Passes AAA). |

### 2.2 Domain Semantic Accent Tokens & Documented Contrast Adjustments

Per C16 ("Check actual contrast. Adjust failing tokens consistently and document the reason. Do not silently change semantic roles"):

| Domain Role | Base Token (Light / Dark) | Contrast Check on Surface (`#FFFFFF` / `#111214`) & Pressed (`#E1E4E9` / `#272A30`) | Documented Text/Foreground Token Adjustment |
|---|---|---|---|
| **Work** | `#876238` / `#C6A172` | Light `#876238`: `5.47:1` on `#FFFFFF`, `4.59:1` on `#ECEEF1`, `4.17:1` on `#E1E4E9`. Dark `#C6A172`: `7.77:1` on `#111214`, `6.04:1` on `#272A30`. | Base `#876238` / `#C6A172` is retained for borders, work-strip bars, and markers. When rendering small label text on light Elevated/Pressed or tinted work surfaces, use `--color-work-text-light: #75532E` (`5.12:1` on `#E1E4E9`). |
| **Day Off** | `#3F705A` / `#8AB49E` | Light `#3F705A`: `5.65:1` on `#FFFFFF`, `4.75:1` on `#ECEEF1`, `4.31:1` on `#E1E4E9`. Dark `#8AB49E`: `8.32:1` on `#111214`, `6.46:1` on `#272A30`. | Base `#3F705A` / `#8AB49E` retained for markers/badges. For small text on light Pressed/tinted backgrounds, use `--color-dayoff-text-light: #35614D` (`5.08:1` on `#E1E4E9`). |
| **Personal Event** | `#3D689F` / `#89AEE0` | Light `#3D689F`: `5.77:1` on `#FFFFFF`, `4.85:1` on `#ECEEF1`, `4.40:1` on `#E1E4E9`. Dark `#89AEE0`: `8.16:1` on `#111214`, `6.34:1` on `#272A30`. | Base `#3D689F` / `#89AEE0` retained for event edges/markers. For small text on light Pressed/tinted surfaces, use `--color-personal-text-light: #345B8C` (`5.10:1` on `#E1E4E9`). |
| **Task Reservation** | `#745298` / `#B9A1DE` | Light `#745298`: `6.02:1` on `#FFFFFF`, `5.06:1` on `#ECEEF1`, `4.59:1` on `#E1E4E9` (Passes AA everywhere). Dark `#B9A1DE`: `7.93:1` on `#111214`, `6.16:1` on `#272A30` (Passes AA everywhere). | Passes >= 4.5:1 across all neutral surfaces in both themes without adjustment. |
| **Rest** | `#606A7D` / `#A1ABC0` | Light `#606A7D`: `5.44:1` on `#FFFFFF`, `4.57:1` on `#ECEEF1`, `4.14:1` on `#E1E4E9`. Dark `#A1ABC0`: `8.05:1` on `#111214`, `6.25:1` on `#272A30`. | Base `#606A7D` / `#A1ABC0` retained for markers/borders. For small text on light Pressed/tinted surfaces, use `--color-rest-text-light: #525B6C` (`4.98:1` on `#E1E4E9`). |

### 2.3 Timeline Block & Card Surface Pattern
- Event and reservation blocks on the timeline use a restrained 10–14% alpha tint of their semantic accent over `--bg-surface`, paired with a crisp `3px` left accent border in the base semantic color and `--text-primary` (`#18191C` / `#F5F5F7`) for titles and times. This guarantees >12:1 contrast for primary event text while preserving immediate semantic color recognition.
- Wishlist timing groups (`Зараз`, `Пізніше`, `Колись`) use neutral surface/elevated segmentation and typography rather than introducing a separate rainbow palette (C16).

---

## 3. Typography & Spacing Scale (C16)

### 3.1 System Font Stack
```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
```
No remote web fonts are required or fetched.

### 3.2 Type Scale
- **Large Screen Title**: `clamp(1.875rem, 4vw, 2.125rem)` (`32–34px`), line-height `1.15`, weight `700`, tracking `-0.02em`.
- **Section Heading**: `1.25rem` (`20px`), line-height `1.3`, weight `600`.
- **Body / Primary Item Title**: `1.0625rem` (`17px`), line-height `1.45`, weight `400` / `500`.
- **Secondary Text / Metadata**: `0.9375rem` (`15px`), line-height `1.4`, weight `400`.
- **Caption / Compact Grid Label**: `0.8125rem` (`13px`), line-height `1.3`, weight `500`.
- **Form Controls (`<input>`, `<select>`, `<textarea>`)**: Minimum `1rem` (`16px`) on mobile viewports to prevent iOS Safari automatic focus zoom.

### 3.3 Spacing & Touch Targets
- **Spacing Scale**: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`.
- **Mobile Horizontal Padding**: `16px` (`320–375px` viewports) to `20px` (`390–430px` viewports).
- **Primary Touch Targets**: Minimum `44px × 44px` hit area for all interactive buttons, navigation items, checkboxes, and timeline block handles. Timeline blocks shorter than 44px visually use a transparent centered hit-area extension without altering the stored interval duration (C12).

---

## 4. Floating Navigation Capsule & Global Creation Button (C17)

### 4.1 Mobile Floating Navigation Capsule
- **Destinations (Left to Right)**:
  1. `Календар` (Calendar)
  2. `Плани` (Plans)
  3. `Сьогодні` (Today — center position, navigation only, active only when selected)
  4. `Звички` (Habits)
  5. `Я` (Me)
- **Geometry**:
  - Inset from left and right viewport edges by `12–16px`.
  - Inset from bottom by `calc(env(safe-area-inset-bottom, 0px) + 12px)`.
  - Base height `64px` (`min-height: 60px`), expanding gracefully with `min-height` if user text enlargement is active so Ukrainian labels never clip.
  - Shape: `border-radius: 9999px` (capsule) or `28px` soft rounded panel with a `1px` subtle inner border (`rgba(24, 25, 28, 0.08)` in light, `rgba(245, 245, 247, 0.12)` in dark).
- **Material & Fallbacks**:
  - Standard: `background: rgba(255, 255, 255, 0.78)` (light) / `rgba(27, 29, 33, 0.78)` (dark) with `backdrop-filter: blur(20px) saturate(180%)`.
  - `@supports not (backdrop-filter: blur(1px))`: `rgba(255, 255, 255, 0.94)` (light) / `rgba(27, 29, 33, 0.94)` (dark).
  - Reduced Transparency (`prefers-reduced-transparency: reduce` or user setting): Solid `--bg-elevated` with a `1px` high-contrast border.

### 4.2 Separate Persistent Global Creation Button
- Positioned above the right edge of the floating navigation capsule (`right: 16px`, `bottom: calc(env(safe-area-inset-bottom, 0px) + 88px)`—providing a clear `12–16px` vertical gap above the `64px` capsule).
- Size: `50px × 50px` circular/squircle button, never merged into the navigation capsule.
- Reserved Bottom Scroll Clearance: Main scrollable views reserve `calc(env(safe-area-inset-bottom, 0px) + 156px)` padding at the bottom so content can always scroll completely clear of both floating controls.

### 4.3 Modal, Sheet, and Keyboard Discipline
- When any modal or bottom-sheet editor is open:
  - The global creation button is hidden (`opacity: 0; pointer-events: none` / unmounted).
  - The underlying main view and navigation capsule receive `inert` and `aria-hidden="true"`.
  - Focus is trapped inside the dialog/sheet and restored to the trigger on close.
  - Every sheet provides an explicit visible Ukrainian close button (`Скасувати` / `Закрити`) in addition to backdrop/Escape dismissal, and prompts for confirmation if the form has unsaved ("dirty") user edits.
- When the virtual keyboard opens inside an editor (`visualViewport` resize or input focus), floating navigation and global creation controls remain hidden while the editor's own header/footer action bar handles submission.

---

## 5. Motion & Responsive Breakpoints (C18)

### 5.1 Motion Tokens
- `--duration-micro: 120ms` (button press, toggle, checkbox)
- `--duration-small: 180ms` (popover, filter switch, accordion)
- `--duration-screen: 210ms` (destination or container transition)
- `--duration-modal: 240ms` (bottom sheet or dialog enter/exit)
- `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`
- Under `@media (prefers-reduced-motion: reduce)` or when user enables Reduced Motion in Settings, transition durations collapse to `0ms` / instant opacity swap.

### 5.2 Responsive Viewports
- **Phone (`320px`, `375px`, `390px`, `430px`)**: Single-container drill-down in Plans, compact Month cells with work strip, readable stacked/day-strip Week mode (never 7 cramped hourly columns), bottom floating navigation capsule + global creation button.
- **Tablet & Desktop (`768px`, `1024px`, `1440px`)**: Left navigation rail/sidebar with the same 5 destinations and one global creation button, master-detail split in Plans/Me/Habits, multi-column Week timeline on wide screens, and constrained readable form widths (`max-width: 640px`).
