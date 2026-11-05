# PLANUI UI contract
## STRUCTURE
Page = canvas. Top-level tab header = large title (+ subtitle only if it carries information, e.g. the date), round glass icon buttons top-right, ONE glass segmented control; on scroll it collapses into a compact sticky glass bar.
Sub-screen header = round glass back chevron + compact title (no big title + subtitle, no text "back" button).
Sheets = grabber, title, swipe or tap-outside to dismiss, no "Закрити"/"Скасувати" text buttons, one primary action.
## CONTAINERS
One level only. Section = small label + ONE rounded container (radius 20, elevated surface) of Rows separated by hairlines.
Flat tinted ItemCards only for real objects (task, shift, direction, habit). No card in a card, no accordion in a card, no free-floating text disclosures.
## ROWS
Min 56px; optional leading icon tile; title; <= 1 secondary line; trailing value, chevron, toggle or "⋯". Max 2 text lines.
## CONTROLS
Switch toggles, never checkboxes. Segmented <= 4 segments, one line, no counters.
Filters = ONE horizontally scrollable pill row with a clear selected state.
Visible native controls are forbidden: DateField/TimeField/SelectField = a styled Row showing the formatted value with an invisible native input overlaying it (OS picker on tap; data-ui="native-overlay"; the Row carries the accessible name).
Sliders show the value on the right and "-" until touched; reset lives in a menu, no "Без відповіді" buttons.
Menus = ActionMenu popover or sheet.
## TEXT
Sentence-case Ukrainian, no uppercase transforms, no developer phrasing, no ISO dates, no timezone label outside Settings.
ALL dates, times, durations go through src/lib/format.ts ("Четвер, 5 листопада" subtitle, "чт, 5 листопада", "2-8 листопада", "17:30", "1 год 30 хв").
Counters only when > 0.
## EXPLANATIONS
Any text > ~90 characters or 2 lines moves behind an ⓘ InfoSheet or is deleted.
Empty state = one line + one button, <= 96px, never above real content.
## DENSITY
The first viewport shows real content: the header block <= 260px at 390x844.
One primary action per screen. One accent color.
## RESPECT THE PRODUCT
Never show aggregate free/busy statistics (minutes, hours) as content; never suggest sleep times; no streaks, debt, overdue counters, completion %, life scores.
A disabled optional module has NO entry points anywhere (tab rows, pills, Quick Add types, chips).
## GLASS
Only on the sticky bar, segmented, round buttons, pill rows, tab capsule + orb, sheets, a slider thumb while dragged.
Never on content, never glass on glass; solid fallback for reduced transparency / no backdrop-filter; respect reduced motion.
## KILL LIST
UI-explaining placeholders, repeated titles, zero stats, "▶" text triangles, native selects/date inputs/checkboxes, text buttons used as links, stray "...".
