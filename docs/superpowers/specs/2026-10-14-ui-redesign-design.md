# UI redesign — the shell on DESIGN.md, adapted for a reading tool — design

- **Date:** 2026-10-14
- **Status:** approved shape (design sections and mocks approved in session), ready for an implementation plan
- **Source of the visual language:** `../claude-agents-dashboard/.claude/DESIGN.md` (§1–§8) and the *Claude Agents Dashboard* design system
  (https://claude.ai/artifact/XBMon4GJEdzip9WrojZYAj — `project/README.md` + `project/tokens.json`).
- **Mocks:** https://claude.ai/artifact/NAkehDwVz1o8o4qkVs9uJb — five artboards: Guides · one project (Daylight), Viewer (Midnight), Favorites · one
  project (Daylight), Settings (Midnight), Phone (interactive menu). Every artboard has a `theme` tweak covering all five palettes. Titles, percents and
  favorite snapshots in them are real data from this machine's registry, not filler.

## Problem

The React shell is still the dashboard as it looked when it was ported in August: Barlow plus IBM Plex Mono, uppercase mono micro-labels at 9–11 px,
bordered "strip" cards, cyan inset underlines on every segmented control, and a project `<select>` in each toolbar. The dashboard has since been redrawn
against DESIGN.md — one face (Hanken Grotesk), an 11 px floor, sentence case, borderless 16 px sheets on the ground, a rail with a sub-nav tree, one 36 px
control family — and the two apps no longer read as siblings.

Copying the dashboard's screens is not the goal. The dashboard is a monitor read at a glance; guide-manager is a reading tool you come back to. The
redesign takes DESIGN.md's *rules* and re-draws guide-manager's own *layouts* under them, and it adds the one thing a reader returning to the board wants
first: where they left off.

## Goals

1. The shell follows DESIGN.md: tokens, type scale, spacing, radii, elevation, iconography, the rail, the card language, the control family.
2. The project becomes a rail destination (DESIGN.md §8.5's "the scope is a destination"), not a toolbar filter — in Guides and in Favorites.
3. A **Continue reading** row on the Guides board.
4. Series read as one object: a sheet with a segmented progress bar over numbered lesson rows.
5. Works at phone width over the tailnet: below 640 px the rail becomes a top bar with a menu.

## Non-goals (scope)

- **The framed guide is untouched.** No change to `server/src/render/*`, the render shell's `.topbar`/`.crumbs`, `assets/*.js` (bionic, progress,
  favorites capture and its `FRAME_CSS`/`SHELL_CSS`), or anything the `study`/`tutor` skills generate. Nothing under `skills/`, `bin/` or `assets/` is
  edited, so no `plugin:sync` is needed.
- **Token *values* do reach the guides**, because `shared/theme.css` is linked into every rendered page. That is accepted: the retuned Daylight changes how
  a guide looks under Daylight. Token *names* do not change — every name a guide, the reading aid or the capture script reads today still resolves.
- No server or API change. Everything new is derived on the client from `GET /api/guides` and `GET /api/favorites` as they stand.
- No new setting, and no theme added or removed.

## 1. Foundation — tokens and type

### Tokens (`shared/theme.css`)

- Take the dashboard's current token block (`../claude-agents-dashboard/client/src/styles.css`, the five `[data-theme]` blocks) as the palette: Midnight,
  Graphite, Amber CRT and Nightshift unchanged in hue, **Daylight retuned** to the dashboard's shipped Daylight (`--board #f4f4f3`, `--steel #ededec`,
  `--strip #ffffff`, `--strip-hi #f2f2f1`, `--hairline #eaeae8`, `--hairline2 #dcdcda`, `--ink #131313`, `--ink2 #525252`, `--ink3 #6b6b6b`, darkened
  state inks), and the role tokens the dashboard added: `--green-fill`, `--green-fill2`, `--green-solid`, `--green-tint`, `--amber-solid`,
  `--amber-text`, `--amber-tint`, `--amber-ink`, `--mustard-tint`, `--mustard-ink` — written as a **literal in every `[data-theme]` block** (hex, or
  `rgba()` for a tint), values from `project/tokens.json`. No `color-mix()` and no `:root`-only role token: the token test reads each theme's block.
- One new pair the dashboard does not have, because guide-manager colours its `tutor` pill magenta: `--magenta-tint` (`--magenta` at 14 % over the
  surface in the dark themes, 11 % in Daylight) and `--magenta-ink` for the text on it. `--magenta` itself fails 4.5:1 on its own tint in Midnight (4.01)
  and Graphite (4.32), so `--magenta-ink` is `--magenta` mixed toward `--ink` just far enough to clear it: Midnight `#d181ab` (4.65), Graphite `#c789ab`
  (4.74); Amber CRT (5.99), Nightshift (4.54) and Daylight (5.46) keep `--magenta`. Measured over `--strip`, the surface a pill sits on.
- **`--display` is deleted** (only the shell stylesheet reads it — `client/src/styles.css`, which is rewritten whole). **`--mono` stays**, for one reader: a
  favorite's snapshot `<pre>`/`code` (`.fav-body pre`), which keeps the monospace the guide showed it in — a snapshot is what the reader saw. No guide
  page, asset or render-shell rule reads either token (checked: none of the 16 registered guides, `assets/`, `server/src/`, `skills/`).
- The `:root` alias block (`--fg`, `--muted`, `--line`, `--card`, `--panel`, `--good`, `--bad`) stays as it is, and so does the legacy alias line
  (`--bg`, `--accent`, `--text`, …): `assets/bionic.css` reads `--accent`, and a guide's own CSS may read `--bg`.
- The header comment's "Ported verbatim from …" claim is updated to say which dashboard revision it now matches.
- `THEMES` in `client/src/lib/settings.ts`: ids unchanged (stored settings keep working). Daylight's label becomes `Daylight` and its hint `light grey ground, white cards, dark ink`
  (it stops saying "manila paper").

### Type

- **One face in the shell:** Hanken Grotesk 400/500/600/700, loaded by a Google Fonts `<link>` in `client/index.html` (preconnect + `css2`, as the
  dashboard does), falling back to Plus Jakarta Sans and the system UI face. The guide pages do not load it and keep their own faces.
- `body` sets `font-variant-numeric: tabular-nums`. `code, kbd, samp, pre { font-family: inherit }` inside the shell, so a code span is marked by its fill
  — **except inside a favorite's snapshot** (`.fav-body pre, .fav-body code` keep `var(--mono)`), per the snapshot rule above.
- The DS type scale, used by name in the stylesheet's comments: `metric-lg` 30/700, `title` 19/500, `row-name` 15/500, `nav`/`percent` 14,
  `body`/`label` 13, `meta` 12, `pill`/`kicker` 11. **11 px is the floor.** Sentence case everywhere in the shell's own copy, empty states included; the
  rail kicker is the only uppercase text. The strings that change case: `Loading…` (Guides, Favorites, App's `Suspense` fallback), `Guides unavailable`,
  `Nothing registered yet`, `No matches` (Guides and Favorites), `Couldn't load favorites`, `Add a note`. `EMPTY_COPY` is already sentence case. The
  per-bay `N favorite(s)` count goes with the bay heading's redraw (§5). The test assertions on the old strings change with them.

### Spacing, radii, elevation

- 4 px base, 8 px rhythm. Card gap 16, card padding 24 (20 on small tiles), main padding 32/40 at desktop.
- Radii: 12 controls, 16 cards and rail rows, 999 pills/dots/switches, nothing square.
- No card borders, no card shadows: a sheet is `--strip` on the `--board` ground and the contrast separates. Only popovers float (none are added here).
- Density keeps its contract — spacing only, never a colour or a font size. The existing `--body-pad`/`--card-gap`/`--group-gap` custom properties are
  kept and re-valued; the plan maps each new gap onto one of them so compact still tightens the whole board.
- **Text size keeps its one mechanism:** `.shell { zoom: var(--font-scale, 1) }`, never on `body`. Every viewport length written inside the zoomed subtree
  (`vh`, `dvh`, `vw` — the rail's height, the phone menu, the viewer) is divided by `var(--font-scale, 1)`; `px` lengths are not. The `:root` density
  defaults stay ahead of the `[data-density="compact"]` block, and that block moves only spacing. All three are pinned by `test/font-scale-css.test.ts`.
- Breakpoints move to the DS set: **640** (rail → top bar, replacing today's 700), **768** (Settings opens to two columns) and **1280** (the viewer's
  fixed-height column, replacing today's 1201; §4).
- Focus: a 2 px solid `--cyan` outline on every interactive element (the existing `:focus-visible` rule, re-coloured). Motion off under
  `prefers-reduced-motion`.

## 2. The rail (`SideRail`)

Built to the dashboard's **shipped** rail (`claude-agents-dashboard/client/src/styles.css`), not DESIGN.md §8's mock figures, so the two apps' rails
match: **240 px** wide with 24 px padding, **36 px** rows on desktop and **44 px** in the phone menu, 14/500 labels in `--ink2`, outline icons in `--ink`
12 px from the label, 16 px row padding and radius. Every rail figure below is from that file; where DESIGN.md or the design-system README differ, the
shipped CSS wins.

- **Wordmark:** an 11 px `GUIDE MANAGER` kicker over a `› guides` prompt at 22/600 with a static block cursor (nothing in this app "works", so it does not
  blink).
- **Active row:** a `--strip-hi` fill plus a 3 px × 16 px `--ink` bar, radius 999, vertically centred, flush left. Never a label colour change. Hover darkens the label only.
- **Rows:** Guides (with the total guide count, `meta` style, right-aligned), Favorites (total favorites), Settings (no count).
- **Sub-nav tree** under Guides and under Favorites: `All projects` first, then one row per project with its count. 14/400 labels, ellipsised; a 1 px
  `--hairline2` tree rule at a 24 px indent with a 12 px tick per row. The picked row takes `--ink` and 500 — no fill, as the dashboard's
  `.rail-sublink.on` ships it; the fill and bar mark the section row only.
- **Which trees are open:** on desktop, only the active section's tree. On the phone menu, every tree (DESIGN.md §8: any destination one tap away).
- **Clicking a project row** switches to that section *and* sets its scope, in one step. Clicking the section row itself keeps the stored scope.
- **Icons** are inline SVG, outline, 1.5 px stroke, 20×20 viewBox, `currentColor`: an open book (Guides), a bookmark (Favorites), sliders (Settings).
  They live in one small `icons.tsx` so the rail and the phone menu draw the same glyphs.
- **Below 640 px:** as the dashboard does it — a separate `.mnav` top bar, 60 px (prompt left, its kicker held at the 11 px floor rather than the
  dashboard's 10 px; a 44 × 44 ☰ right), and the `.rail` itself becomes the
  full-width menu that drops under it. The ☰ is the **one** element with `aria-expanded`, and it lives in `.mnav`, outside `.rail`. Picking any row closes the menu. The bar does not auto-hide on scroll (YAGNI; the dashboard's scroll behaviour can follow later).
- The rail keeps `aria-label="Sections"` and `aria-current="page"` on the active section row; the active project row carries `aria-current="true"`. No
  row carries `aria-expanded` — a row that navigates does not announce a panel (the existing rule in `SideRail`'s docblock; `test/side-rail.test.tsx`'s
  `.rail [aria-expanded]` assertion stays as it is). Its "exactly three buttons" assertion becomes "exactly three section rows", since project rows are
  buttons too.

### Scope state

- The Guides scope is the **existing** key `guide-manager.project` (a project *path*, or `'all'`); the Favorites scope is the **existing** key
  `guide-manager.favProject` (a project *name*, or `'all'`). Nothing is migrated: whatever a device has stored becomes its rail selection.
- Fail-open, as today: a stored scope the current data does not name renders as `All projects` without rewriting the stored value.
- Only the rail writes these keys. The toolbars lose their project `<select>`s.

### Data for the rail

The rail needs both indexes on every section (the counts), so `useGuides()` and `useFavorites()` move up to `AppShell` and their results pass down as
props. Their behaviour is unchanged — `useGuides`' coalesced 300 ms refetch on a framed guide's `{source:'guide-manager',kind:'progress'}` message, and
`GuidesView`'s refetch on the way back from the viewer, both still happen exactly once per trigger. The lazy section chunks stay lazy; only the data hooks
move. The rail draws its trees from the data as soon as it has loaded and shows rows without counts until then. If a
fetch fails, that section's row shows no count and no tree, and the section itself shows its existing error copy; the other section is unaffected.

## 3. The Guides board

Top to bottom (mock: *Guides · one project*):

1. **Band** (not a card) on the ground: `Guides · <project name>` or `Guides · All projects` at 19/500 with the separator in `--ink3`, and one 13 px
   `--ink3` line: `N guides · M in progress · K read`, counted over the scope (before search/type filters). *In progress* = `furthestPercent > 0` and not
   `completed`; *read* = `completed`.
2. **Toolbar** in the 36 px family, wrapping at narrow widths: a search field (`Search titles`), an `All | Study | Tutor` segmented switch with a count per
   option (counted over the scope, ignoring search — the counts say what the switch would show, not what the query left), and the sort select pushed right. The type switch replaces the type `<select>` and keeps writing `guide-manager.filterType`; the sort keeps
   `guide-manager.sort`. The segmented switch is DESIGN.md's pill switch: a `--hairline2` track (on the ground — §8.3's rule) with the picked option raised
   on `--strip`.
3. **Continue reading** — a `Continue reading` heading (15/500, a `last opened first` meta beside it) over up to **4** tiles. A tile: the type pill and a
   meta line (`<series> · n of m · <date>` for a lesson, the date alone otherwise; the date is `progress.lastOpenedAt`), the title at 15/500, the furthest percent at 30/700, and a 10 px
   progress bar. Clicking opens the viewer. The row:
   - lists guides in scope with `furthestPercent > 0` and not `completed`, ordered by `lastOpenedAt` descending, ties by title;
   - is hidden while the search field is non-empty or the type switch is not `All` — it answers "where was I", not the query;
   - is hidden when empty.
4. **Series** — a `Series` heading with the count, then series sheets in a grid (min 380 px columns). A sheet: the series label at 19/500 with a
   `Series · N lessons · M started` subtitle (*started* = `furthestPercent > 0` or `completed`; a lesson opened and left at 0 % is not started), a fold chevron at top right, a **segmented bar** (one 10 px segment per lesson, 4 px gaps, each filled to that
   lesson's `furthestPercent`), then the lessons as boxless rows bled to the sheet's edges with a hairline between: a 28 px numbered dot (green tint once
   `completed`), the title at 15/500 over `type · date`, a 72 px mini bar and the percent at 14/600. Folding keeps `guide-manager.foldedSeries` and hides the
   rows, leaving the title and the segmented bar. Series detection is `lib/series.ts` as it stands. While a
   search query runs, a folded series is drawn open without rewriting the stored fold, as today; clearing the query restores it.
5. **Guides** — a `Guides` heading with the count, then the loose guides as tiles in a grid (min 260 px columns): the type pill and date, the title at
   15/500, and a foot of a progress bar plus the percent — or a green `Read` pill once `completed`.
6. **All projects** draws sections 4–5 once per project, each under the project name at 19/500 with its counts as a subtitle. Section 3 is drawn once, across
   every project, above them. The per-project collapse (`guide-manager.collapsedBays`) is dropped: the rail is how you narrow to one project now. The key
   is left in storage, unread.
7. **Empty and error states** keep their wording, sentence-cased (§1: `Loading…`, `Guides unavailable`, `Nothing registered yet`, `No matches`),
   restyled as a 13 px `--ink3` line centred in the column.
8. **Dates.** Series rows and guide tiles show the guide's `updated` (what today's card shows); Continue tiles show `progress.lastOpenedAt`; favorites
   show `createdAt`. All are formatted by one helper as a short local date — `Sep 17`, with the year added (`Sep 17, 2025`) when it is not the current
   year — replacing today's ISO `slice(0, 10)`.

**Progress bars** are one component: a 10 px `--steel` track, radius 8, filled with `--green-solid` under a fine 45° hatch (≈2 px stripes, ≈8 % white over
the fill) — DESIGN.md §2's signature texture and figure (the mocks drew it heavier; the build follows §2). An empty bar is the flat track with no hatch.

**Type pills** (11/500, radius 999): `study` is `--mustard-ink` on `--mustard-tint`, `tutor` is `--magenta-ink` on `--magenta-tint`, `Read` is `--green` on
`--green-tint`. They are categories, so they do not claim the state colours' meanings beyond what they already carry today. Pills stay lowercase (`study`, `tutor`) as
today — they are tags, not labels; the switch's options are sentence case (`Study`, `Tutor`).

## 4. The viewer

Mock: *Viewer*. Above the iframe, a band-style header that wraps on a narrow width. Its placement per width keeps today's three regimes, on the new
breakpoints:

- **< 640 px:** the viewer is a fixed full-screen overlay (as today below 700), over the top bar; `html.guide-locked` stays and keeps refusing the scroll
  chain while a guide is open. Its height and width are `100dvh` / `100vw` divided by `--font-scale`.
- **640–1279 px:** in flow beside the rail; the iframe body gets a viewport-derived floor (today's 701–1200 rule, its subtrahend re-measured for the new
  header height).
- **≥ 1280 px:** the rail stays and `.wrap.wide` becomes the fixed-height column with the board scrolling inside it (today's ≥ 1201 rule).

The header:

- a 36 px `‹ Guides` button (chevron icon + label) — unchanged behaviour: back to the board, refetching once;
- a title block: a 13 px `--ink3` crumb `<project> · <series> · n of m` (series part only for a lesson), derived from the index by
  the open guide's path — if a refetch drops the guide from the index while it is open, the crumb shows the title alone and the viewer stays open; over the title at 19/500;
- a pill `<furthest>% furthest` (hidden at 0 and once `completed`, where it reads `Read`);
- **`Start over`** — the existing `↺ reset` control relabelled, as a 36 px button with a counter-clockwise arrow icon. Its armed state turns the label to
  `Start over?` in `--red` with a `--red` outline (today's armed text is `sure?`; the `guides-view` assertion on it changes). Its sequence is unchanged and still the only reset control: `DELETE`, refetch, then bump the iframe key
  strictly after the `DELETE` resolves.

The iframe fills the rest of the column flush, inside a 16 px-radius clip and with no sheet or border of its own: the guide paints its own background. The
`.wrap.wide` constraint the render shell relies on (`body.deck-host main` dropping its `max-width`) is preserved — the redesign changes the wrapper's
padding, not the fact that it constrains the frame.

## 5. Favorites

Mock: *Favorites · one project*. Scoped by the rail exactly as Guides is.

- **Band:** `Favorites · <project>` / `Favorites · All projects`, subtitle `N saved blocks from M guides · newest on top`, where M is the number of distinct
  `guidePath`s among the favorites in scope.
- **Toolbar:** the search field only (the project select is gone).
- **A favorite** is a §8.2 sheet (`--strip`, radius 16, padding 20/24), max column width 820 px:
  - head: the drag grip (`⠿`, fine pointers only, as today), the title at 15/500 (click to rename in place, as today), and under it the crumb as a 13 px
    `--cyan` link. **Its text is unchanged** — `guideTitle` then `favorite.crumb` joined by ` › `, with the trailing ` ↗` (`FavoriteCard.tsx`'s
    `crumbText`) — so it works the same for deck, doc and `null` anchors; only its styling changes. It keeps deep-linking via `lib/deeplink.ts`. (The
    mocks' `· card n` crumb was a placeholder and is not built);
  - the keys: **⤒ Move to top**, ↑, ↓ and remove as 30 × 30 px icon buttons with their existing `aria-label`s (the mocks omitted ⤒; it stays). Remove keeps its two-step arm; armed, it widens to a `Remove?` text button in
    `--red`, keeping today's `aria-label="Confirm remove"` (only the visible `sure?` text changes, and its `favorites-view` assertion);
  - the note: 13/400 `--ink2` when set, an `Add a note` line in `--ink3` when empty; click to edit in place, as today. No longer italic;
  - the snapshot: the sanitised HTML as today, set inside a `--board`-filled inset at radius 12, with table styling re-drawn to the DS (hairline rows, 12 px
    `--ink3` headers, no cell boxes). It scrolls sideways inside itself under 768 px rather than widening the page;
  - a 12 px `--ink3` foot: `Saved <date>`.
- **All projects** draws one section per project under its name at 19/500 — the bay without the collapse control.
- Ordering, drag, `PUT /api/favorites/order` and the `dataTransfer` same-project guard are unchanged.
- Sanitisation stays where it is (`lib/sanitize.ts`, at render). Nothing here changes what is stored.

## 6. Settings

Mock: *Settings*. A band (`Settings`, subtitle `Stored in this browser · each device keeps its own`), then §8.2 cards in two hand-balanced columns from 768
px, one column below:

- **Appearance** (left): Theme (five swatch buttons in a row, keeping `aria-pressed` — a radio-like group, not switches, the picked one ringed in `--cyan`; the row's hint is the picked theme's
  hint), Density (segmented switch), Text size (select).
- **Reading aid** (right, top): Bionic reading (a pill switch, `role="switch"` — today a `role="group"` of `aria-pressed` buttons, so `settings-view`'s
  Bionic assertions change), Fixation and Every (segmented switches).
- **Startup** (right, bottom): Opens on (select).

Rows are boxless: name at 15/500 over a 13 px `--ink3` hint, the control right, 16 px vertical padding, a hairline between. Every control is the 36 px
family. Hints keep their current wording, shortened only where the mock had to. `SettingsRow` stays the one row component.

## 7. Phone (< 640 px)

Mock: *Phone*. The top bar and menu from §2; the band, toolbar and sections stack in one column with a 16 px gutter. Continue reading becomes a row of
240 px tiles that scrolls sideways inside itself. Every touch target in the menu is 44 px. No page-level horizontal scroll at 375 px.

## Structure — files touched

`GuidesView.tsx` is 764 lines today and this redesign rewrites most of its markup, so it is split along the lines the new board draws. Each unit takes props
and renders; the state stays where it is today.

| File | Change |
|---|---|
| `shared/theme.css` | token block replaced as in §1; `--magenta-tint` and `--magenta-ink` added; aliases and `--mono` kept, `--display` deleted |
| `client/index.html` | Hanken Grotesk `<link>`s |
| `client/src/styles.css` | rewritten to the DS; class names change where the structure changes; the *why* comments carry over (CLAUDE.md's density) |
| `client/src/App.tsx` | owns `useGuides`/`useFavorites`, passes data to the rail and the views |
| `client/src/components/SideRail.tsx` | rail, trees, phone bar + menu |
| `client/src/components/icons.tsx` | new — the three section icons plus chevron, search, arrows, close, reset |
| `client/src/components/guides/GuidesView.tsx` | keeps viewer/board state and the deep-link opening; delegates drawing |
| `client/src/components/guides/ContinueReading.tsx` | new |
| `client/src/components/guides/SeriesCard.tsx` | new |
| `client/src/components/guides/GuideTile.tsx` | new |
| `client/src/components/guides/ViewerHeader.tsx` | new — back, crumb, title, percent pill, Start over |
| `client/src/components/ProgressBar.tsx` | new — the one bar (also used segmented) |
| `client/src/components/favorites/FavoritesView.tsx`, `FavoriteCard.tsx` | restyled, project select removed, data from props |
| `client/src/components/settings/SettingsView.tsx`, `SettingsRow.tsx` | card layout, pill switch |
| `client/src/lib/continue.ts` | new — `continueReading(guides, limit)` |
| `client/src/lib/rail.ts` | new — the tree rows (`label`, `scope value`, `count`) for each section from the two indexes |
| `client/src/lib/dates.ts` | new — the short-date helper (§3.8) |
| `client/src/lib/settings.ts` | Daylight's label and hint |
| `CLAUDE.md` | invariants updated (below) |

## Testing

New pure helpers get unit tests (cases, not code — the plan states exact inputs and expected values):

- `continueReading`: excludes `furthestPercent === 0`, excludes `completed`, excludes guides with `progress: null`; orders by `lastOpenedAt` descending;
  breaks a tie by title; caps at the limit; returns `[]` for an empty index.
- `rail` tree: `All projects` first with the total; one row per project in the index's order; guides keyed by path and favorites by name; counts
  match; a project with zero favorites does not get a Favorites row.

Existing suites are updated to the new structure, not deleted: `side-rail`, `guides-view`, `guides-series`, `favorites-view`, `favorites-deeplink`,
`settings-view`, `app-projects`, `app-landing`, `theme-tokens`, `font-scale-css` (its viewport-unit, `.shell` zoom and density-order checks must pass
against the rewritten stylesheet unchanged). Behaviour each must still prove:

- choosing a project in the rail writes `guide-manager.project` / `guide-manager.favProject` and the board/favorites narrow; a stale stored value renders
  `All projects` and is not rewritten;
- the type switch filters and writes `guide-manager.filterType`; Continue reading hides while search or type is active;
- a deep link `?open=<path>` still lands on Guides and opens the viewer, whatever the stored scope;
- the bay-header `aria-expanded` assertions (`guides-view`) are removed with the bays' collapse control, and replaced by the series fold's;
- `Start over` keeps its order: the iframe key changes only after the `DELETE` resolves (the existing reset test, retargeted);
- a progress message from a framed guide triggers one coalesced refetch with the hooks lifted to `AppShell`;
- `theme-tokens`: every token the reading aid and the render shell read (`--accent`, `--bg`, `--fg`, `--muted`, `--line`, `--card`, `--panel`, `--good`, `--bad` in the
  `:root` alias block, and the base set in each theme block) still **resolves** for all five themes, and `--mono` is still defined; the panel-separation
  assertion still holds on the retuned Daylight; `--magenta-ink` on `--magenta-tint` over `--strip` clears 4.5:1 in every theme — the test's
  `tokenByTheme` helper is extended to read an `rgba()` tint and composite it over that theme's `--strip`.
- the date helper: same-year and other-year inputs, and an invalid string (falls back to the raw value).

Checked by eye in the built-in browser after the suites pass: Midnight and Daylight, at desktop width and at 375 px, against the mocks — the rail tree,
Continue reading, a series sheet, a viewer reset, a favorite with its armed remove, Settings in one and two columns.

## Invariants to update in `CLAUDE.md`

- The Layout entry for `client/src/`: the side rail carries per-project sub-nav trees for Guides and Favorites; the toolbars carry no project select.
- "Starting a guide over has exactly one control": rename it to the viewer header's `Start over` (same semantics).
- New: **the project scope is a rail destination.** Only the rail writes `guide-manager.project` and `guide-manager.favProject`; a stale value fails open
  to `All projects` without being rewritten.
- New: **`--mono` stays in `shared/theme.css` for one reader, a favorite's snapshot `<pre>`/`code`** — the snapshot shows what the reader saw. Everything
  else in the shell is one face.

## Out of scope

- Restyling the render shell, the in-guide resume notice, or the favorites picker inside the frame.
- Auto-hiding the phone top bar on scroll.
- Self-hosting the font (it loads from Google Fonts, like the dashboard's).
- An account/header chip, popovers, or any surface the dashboard has and this app has no data for.

## Decisions recorded

- **Rail figures from the dashboard's shipped CSS.** DESIGN.md §8 says 280 px wide, 40 px rows and a 22 px bar, and the design-system README says 32 px
  padding; the dashboard ships 240 / 24 / 36 / 16. Matching what ships keeps the two apps' rails identical. (The first cut of the mocks drew 280; they were corrected.)
- **`↺ reset` → `Start over`.** The README's content rule — "Name the thing, not the action's mechanics" — and a symbol is not a name. Semantics unchanged.
- **Data hooks lifted to `AppShell`** so the rail can count both indexes; the alternative (counts only on the open section) would make the rail's numbers
  appear and vanish as you move between sections.
- **`collapsedBays` dropped**, not migrated — narrowing to one project is the rail's job now.
