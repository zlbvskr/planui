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
## V2 · D0 foundation
Presentation only. Preserve every feature, local data, schema, offline/PWA and `/planui/`.
## NO-ZOOM
Viewport: width=device-width, initial/minimum/maximum-scale=1, user-scalable=no, viewport-fit=cover.
html/body touch-action manipulation; #root pan-x pan-y; non-passive gesturestart/change/end cancellation.
Inputs/selects/textareas >=16px; text-size-adjust 100%; overscroll none; transparent tap highlight.
Chrome is not selectable; inputs and user-authored notes/quotes remain selectable (`data-user-content`).
Root --text-scale: 100%, 112%, 125%; all typography rem; verify 125% without overflow.
## TOKENS
Dark canvas #05060A; large indigo 22%, wine 18%, teal 10% radial glows.
Context --context-hue cross-fades to deep blue for night/sleep and amber for creativity.
Content s1 #11131A, s2 #181B24, s3 #20242F; .07 hairline and .05 top highlight.
Text #F5F6FA, secondary rgba(235,238,250,.64), tertiary .42 only for optional empty values.
Light mirrors the hierarchy with dark AA text. Radii 12 / 20 / 28 / pill.
Day amber #F6B84A; night indigo #7C8CFF; sleep teal #4FC3D9; success #5BD68A; collision #F0A93B.
Life areas/directions use ten --area-N OKLCH hues at equal lightness/chroma.
Icon tile 32px, radius 10, 16% hue fill; ItemCard 14% fill and 38% border.
Floating glass rgba(24,27,36,.55), blur 24px saturate 180%, specular rim, 0 12px 32px black .35 shadow.
Solid fallback without backdrop-filter or with reduced transparency. Respect reduced motion.
## SELECTION
Selected pills/chips and week day circles: near-white .92 fill, dark text, no coral outline.
Segmented thumb: lighter glass, specular rim, primary text; equal widths, one line, 44px targets.
Coral #FF6B6B is reserved for primary actions, now-line and + orb, never selection.
Pill counts only for non-default filters and only when >0.
## BUTTONS
Primary: coral with dark AA text, 52px, full-width in forms/sheet footers; disabled/busy states.
Secondary tinted pill; tertiary coral text; destructive explicit. Quick Add may use a trailing round arrow-up.
Headers: title and right-aligned 44px actions in ONE row, 12px gaps.
## SHEETS
Glass rgba(24,27,36,.62), blur 28px, scrim black .35; page remains visibly blurred behind.
Grabber, left title, round icon close, scroll body, sticky primary footer above keyboard/safe area; max 92dvh.
Use the Sheet footer slot for persistent actions. Never generic Закрити/Скасувати text buttons.
Keep Escape, outside tap, swipe, focus trap and dirty-edit confirmation behavior.
## TOASTS
Toast: one fixed glass capsule above tabs, icon + one line + optional undo, 3.5 seconds, downward swipe dismissal.
One toast message at a time; never in layout flow. InlineBanner: calm tint, icon + at most two lines.
## ICONS
All icons pass through src/ui/icons.tsx Icon, inline SVG stroke 1.75, normally 20/22px.
No emoji or text-glyph icons. Preserve user-authored text verbatim.
Named set includes sun/moon/bed/route/briefcase/calendar/check/target/folder/leaf/stamp/user/users/compass,
heart-pulse/brain/palette/wallet/book-open/home/sparkles/gift/image/quote/link/clock/info/more/plus,
chevrons/x/arrow-up/search/filter/star/trash (more-horizontal and trash2 are canonical SVG names).
## TYPE
System stack. Large title 2.125/2.5rem bold, -.02em; title 1.375/1.75rem semibold.
Headline/body 1.0625/1.375rem; subhead .9375/1.25; footnote .8125/1.125; caption .75/1.
Item title 1/1.25rem semibold, meta .8125rem; section .8125rem secondary semibold, 8px above group.
Nothing above 1.375rem outside page headers. Times use tabular numerals.
Rows have truncated right value previews; absent values say Не заповнено (secondary for AA; tertiary is decorative).
Unset slider: neutral track, hollow central thumb, dash, no fill; touch positions the thumb, drag shows a bubble.
EmptyState: centered icon tile, one line, optional action/suggestions. Never displace real content.
Timeline cards: <44px title · time; 44–72px title + meta; >72px title + step + meta; ellipsis, no internal menu.
## DEV GALLERY
/dev/gallery is DEV-only, excluded from production. Exercise every primitive/state, both themes and 100/125% scale.
Capture WebKit 390×844 screenshots and report actual lint/build/unit/hygiene results plus remaining failure counts.
