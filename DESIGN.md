# PLANUI design contract v3 ("soft light"). If code disagrees with this file, change the code.
## 1. PRODUCT RULES
- Local-first PWA, Ukrainian UI. No streaks that reset, no debt/overdue counters, no completion %, no free/busy-minutes stats, no life score. Life-area ratings change only by the user. Never suggest sleep times. No silent rollover (unfinished items go to a triage sheet). An overnight shift is ONE record counted once.
- Everything creatable (task, habit, event, shift, goal, project, wish, folder) can have: Сфера (life area), Папка (folder), manual order. Task, habit, goal, project and wish can also have Вимір (unit, target, current, quick-log +1 / +5 / своє).
- COLOR: an item's color = its life area's color; no area = neutral. A life area's color = its last saved rating: 1 red -> 10 green (oklch hue 25 -> 145, L .72, C .15), unrated = neutral slate. Shifts keep yellow (day) / violet (night) unless linked to an area; the sun/moon icon stays.
- Optional modules: Звички, Список бажань. When off they have NO entry points anywhere.
- Removed for good: Minimum Day, State check-in, Weekly review, planning overview, Calendar Day and Графік views, calendar filters, the ideal-life gallery (now ONE editable text at the bottom of "Цілі"), "Напрями" (replaced by folders).
## 2. STRUCTURE
- Tabs: Сьогодні, Проєкти, Я. The calendar is NOT a tab.
- DOCK (floating at the bottom, safe-area aware, 16px margins): left = ONE frosted container with a contextual bar above the 3-tab capsule; right = a vertical stack: calendar button above the + orb. Contextual bar: Сьогодні: День | Завдання | Звички; Проєкти: Проєкти | Цілі; Я: Статистика | Список бажань | Налаштування; calendar open: Місяць | Тиждень. The selected segment shows icon + label; the others collapse to icon-only if the labels don't fit. Calendar button = round, opens the calendar window above everything on every tab, shows ✕ while open. + orb = Add sheet for the current context (turns to × while open).
- TAB TAP: (a) an overlay is open -> close the topmost overlay only; (b) else the current tab is not at its home state (sub-screen, scrolled, non-default segment/date) -> reset it to home; (c) else switch to the tapped tab. Tabs and the calendar always open in the default state (today, Month, root, scrolled to top); never restore what the user changed.
- OVERLAYS (sheets, alert sheets, popovers, calendar window) sit above the content and BELOW the dock; the dock stays visible and tappable.
- ADD CONTEXTS: Сьогодні: Зміна, Подія, Завдання, Звичка; Проєкти (Проєкти view): Папка, Проєкт, Завдання; Цілі: Ціль; Я: Завдання, Звичка, Бажання; Список бажань: Бажання, Папка; calendar window: Подія, Зміна, Завдання. Everything syncs across tabs.
- LIST ORDER everywhere (Today, calendar day list): Звички (a visually separate band above everything), then Зміна, then Події, then Завдання; inside a category by time, then manual order. Manual reorder by long-press drag, no time needed.
- FOLDERS (nested) exist for tasks, habits, projects, wishes. In Проєкти: folders anywhere; inside folders only projects and tasks.
## 3. VISUAL LANGUAGE
Mood: soft, airy, optimistic, tactile; lots of white space; pastel tints; glossy gel orbs; floating pill navigation. Light is the primary theme; dark is a token-derived variant (inverted surfaces, same hues).
- Canvas #F3F4F8 + two large blurred pastel blobs (peach/yellow top-right, mint/blue bottom-left, ~35%), static.
- Cards white, radius 28; big containers radius 36-40; inner tiles radius 20; pills full. Shadow 0 1px 2px rgba(20,24,40,.04), 0 12px 32px rgba(20,24,40,.08); 1px white inner highlight; hairline rgba(20,24,40,.05). Tinted card = item color at 14% over white, no border.
- Ink: text #0E1014, secondary #5C6272, tertiary #8B91A0 (never for essential text). Near-black ink #101014 = primary actions and SELECTION.
- SELECTION = INK: selected pill/tab = ink fill + white text; selected option card = 2px ink outline; selected day = ink circle + white number; 2-3 way segmented bars = a frosted track with a white pill thumb + soft shadow. TODAY marker = vivid blue #3D6BFF (day ring/chip + dashed vertical now-line).
- Buttons: primary = ink pill, white text, 56px, full-width in sheet footers; secondary = frosted white pill; tertiary = ink text; destructive = coral tint. Quick Add uses a trailing round ink "↑".
- FROSTED GLASS (floating layer only: dock, round buttons, segmented tracks, sheets, toasts): rgba(255,255,255,.62), backdrop-filter blur(20px) saturate(160%), 1px white inner stroke, soft shadow; solid white fallback for reduced transparency. Content never uses backdrop blur. Chips on colored cards are flat translucent white fills.
- EVENT BAR (events, shifts, timeline, calendar): solid gradient fill in the item color (lighter top -> deeper bottom), white text, radius 20, a leading frosted circle with the icon, optional trailing frosted status chip; a lifted/dragged bar = translucent + stronger shadow. Tasks = tinted cards with a tinted check circle.
- GEL ORB (life areas, pickers, tiles, empty states): glossy sphere in the item color from CSS radial gradients + specular highlight + soft colored shadow; no images.
- DAY OFF = diagonal gray hatch tile. Shift hues: day #F6C343 -> #F2A81D, night #7B61FF -> #5B3FE0. Recovery mint #34C3A0. Deadline/milestone coral #FF6B5E.
- TYPE: Manrope variable (Latin + Cyrillic) bundled locally; large title 32/700 (-0.02em); card title 17/600; body 16/400; meta 13/500 secondary; big numerals 36/600 tabular. Accent: Lora Italic (Cyrillic) 20/500 ONLY for personal text ("Моє бажане життя", empty-state lines). Never load fonts from CDNs.
- ICONS: one <Icon> component, thin line (stroke 1.6, 22px, round caps); inside a white 36px circle on tinted cards. No emoji, no text glyphs.
- Spacing: gutters 20, section gap 24, card padding 16-20, row min 56; prefer spacing to lines (dividers rgba(20,24,40,.06)).
## 4. COMPONENTS (one implementation each, in src/ui)
Button, RoundButton, Segmented, PillRow, Card/Section/Row (value preview or "Не заповнено", chevron, toggle), TintedCard, EventBar, Orb, Sheet, AlertSheet, Toast, InlineBanner, Slider (unset = neutral track, hollow thumb, value "-"), Toggle (ink when on), EmptyState (orb + one line + one action), DateField/TimeField/DurationField (custom pickers, never visible native inputs), Dock.
- Sheet: frosted white, radius 36 top, grabber, title left + round close right, scrolling body, STICKY footer with the primary action; no "Закрити"/"Скасувати" buttons; swipe/tap-outside dismiss; above the dock.
- Toast: floating frosted capsule above the dock, fixed position, one at a time, 3.5s, optional "Скасувати".
- Header: large title (+ subtitle only if informative), round frosted buttons on the SAME row at the right, 12px gap. Sub-screen: round back button + compact title + actions on the same row.
## 5. TEXT
Sentence-case Ukrainian, no uppercase transform, no developer phrasing, no ISO dates, no time-zone names outside Settings. All dates/times/durations via ONE formatter ("Четвер, 5 листопада", "чт, 5 листопада", "17:30", "1 год 30 хв", never seconds). Counters only when > 0. Text longer than ~90 chars goes behind an ⓘ info sheet or is deleted. Empty state = orb + one line + one action.
## 6. MOTION
Soft springs; only transform/opacity; interruptible; reduced motion = short fades.
## 7. APP-LIKE BEHAVIOR
No zoom (viewport meta + touch-action pan-x pan-y on html/body/root/scrollers + manipulation + cancelled gesture events); inputs >= 16px; rem units with --text-scale; overscroll-behavior none; no hover-only styles.
