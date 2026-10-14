# UI redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **This plan states behaviour and exact test cases, never literal code.** It overrides writing-plans' "code blocks required" rule on purpose: handed code
> gets transcribed verbatim, and a bug in the plan becomes a bug in the branch. Each task gives signatures, exact inputs and expected values, and edge cases;
> the implementer writes the code and the tests, and may disagree with the plan — say so in the task report rather than bending the code to fit. Line counts
> are soft targets, never a reason to drop a rule or a comment.

**Goal:** Redraw guide-manager's React shell under the dashboard's DESIGN.md — tokens, one face, the rail with per-project trees, a Continue reading row,
series sheets, the viewer header, favorites and settings as sheets, and a phone top bar — without touching the framed guide.

**Architecture:** Pure helpers first (`lib/dates.ts`, `lib/continue.ts`, `lib/rail.ts`, one addition to `lib/series.ts`), then tokens and the base stylesheet,
then the data hooks and project scope lift to `AppShell` so the rail can count and scope both sections, then each view is redrawn on top. `GuidesView.tsx`
keeps its state and splits its drawing into `ContinueReading`, `SeriesCard`, `GuideTile` and `ViewerHeader`.

**Tech Stack:** React 18 + Vite, TypeScript, jest (`--runInBand`, jsdom via docblock for component suites), @testing-library/react, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-14-ui-redesign-design.md` — read it beside this plan; section numbers below (§1–§7) are the spec's. Mocks:
https://claude.ai/artifact/NAkehDwVz1o8o4qkVs9uJb (where the spec and a mock disagree, the spec wins — it lists each difference).

## Global Constraints

- Nothing under `skills/`, `bin/`, `assets/` or `server/` is edited. No API change; everything derives from `GET /api/guides` and `GET /api/favorites`.
- Token *names* in `shared/theme.css` keep resolving: the `:root` alias block (`--fg --muted --line --card --panel --good --bad`) and the legacy alias line
  (`--bg --accent --text …`) stay. `--display` is deleted; `--mono` stays for `.fav-body pre, .fav-body code` only.
- Every role token is a literal in every `[data-theme]` block (hex, or `rgba()` for a tint) — no `color-mix()`, no `:root`-only role token. Each theme block
  still closes with `\n}` on its own line (the token test's block regex depends on it).
- One face in the shell: Hanken Grotesk 400/500/600/700 via Google Fonts in `client/index.html`, falling back to Plus Jakarta Sans then the system UI face.
- 11 px is the type floor. Sentence case in all shell copy; the rail kicker `GUIDE MANAGER` is the only uppercase text; type pills stay lowercase.
- Exact copy: `Loading…`, `Guides unavailable`, `Nothing registered yet`, `No matches`, `Couldn't load favorites`, `Add a note`, `Start over`, `Start over?`,
  `Remove?`, `Continue reading`, `last opened first`, `Search titles` (Guides search placeholder; its `aria-label` stays `Search guides`), `Search favorites` (placeholder and the existing `aria-label`),
  `All projects`, `Saved <date>`,
  `Stored in this browser · each device keeps its own`.
- Breakpoints: 640 (rail → top bar), 768 (Settings two columns; favorite snapshot stops scrolling sideways), 1280 (viewer fixed column).
- Text size: `.shell { zoom: var(--font-scale, 1) }`, never on `body`; every `vh`/`dvh`/`vw` inside `.shell` is divided by `var(--font-scale, 1)`.
- Density moves spacing only, through `--body-pad` / `--card-gap` / `--group-gap`; the `:root` defaults stay ahead of `[data-density="compact"]`.
- Storage keys unchanged and unmigrated: `guide-manager.project` (path or `'all'`), `guide-manager.favProject` (name or `'all'`), `guide-manager.filterType`,
  `guide-manager.sort`, `guide-manager.foldedSeries`, `guide-manager.section`. `guide-manager.collapsedBays` is no longer read or written (left in storage).
- Only the rail writes the two scope keys. A stored scope the data does not name renders as `All projects` and is **not** rewritten.
- `↺ reset` → `Start over` remains the only reset control; its order is `DELETE`, refetch, then iframe key bump strictly after the `DELETE` resolves.
- Comments explain *why*, at the repo's existing density; carry the *why* comments over when rewriting `styles.css`. New prose wraps at 160 columns.
- Tests are flat in `test/`; component suites start with a `@jest-environment jsdom` docblock. Run one suite with `pnpm test -- test/<name>`.

## Review Focus

1. **`progress.lastOpenedAt` missing or unparsable** — Continue reading must not throw or put that guide first; it sorts after every valid date, and its tile
   date shows the raw string. Test in Task 1.
2. **A deep link to a guide outside the stored scope** — `?open=<path>` opens the viewer even when the rail is scoped to another project; `‹ Guides` returns
   to the stored scope, which was not rewritten. Test in Task 4.
3. **Two registry projects with the same name at different paths** — the Guides tree shows two rows (keyed by path); the Favorites tree shows one row
   (keyed by name) carrying both projects' favorites. Test in Task 2.
4. **Removing the last favorite of the scoped project** — its tree row disappears, the view falls open to `All projects`, and `guide-manager.favProject`
   still holds the old name. Test in Task 7.
5. **A guide at `furthestPercent: 100` but `completed: false`** — counts as *in progress* (not *read*), appears in Continue reading at `100%`, and its tile
   shows a bar, not the `Read` pill. Test in Task 1 (helpers) and Task 5 (tile).

---

### Task 1: Date, progress and lesson helpers

**Files:**
- Create: `client/src/lib/dates.ts`, `client/src/lib/continue.ts`
- Modify: `client/src/lib/series.ts` (add one export; detection unchanged)
- Test: `test/dates.test.ts`, `test/continue-reading.test.ts`, `test/series.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `shortDate(value: string, now?: Date): string` — en-US short month and day in local time (`Sep 17`); adds `, YYYY` when the year differs from
    `now`'s (default `new Date()`); returns `value` unchanged when it does not parse (including `''`).
  - `isInProgress(g: GuideEntry): boolean` — `progress` non-null, `furthestPercent > 0`, not `completed`.
  - `isStarted(g: GuideEntry): boolean` — `furthestPercent > 0` or `completed`.
  - `boardCounts(guides: GuideEntry[]): { total: number; inProgress: number; read: number }`.
  - `continueReading(guides: GuideEntry[], limit: number): GuideEntry[]`.
  - `lessonPosition<T extends { path: string }>(guides: T[], path: string): { label: string; n: number; m: number } | null` in `series.ts` — runs
    `partitionSeries` over `guides`; for a lesson returns `seriesLabel(name)`, its 1-based position among the shelf's lessons in shelf order, and the
    lesson count; `null` for a loose guide or an unknown path.

- [ ] **Step 1: Write the failing tests.** Build `GuideEntry` fixtures with a small factory. Run date cases at `T12:00:00Z` so no local timezone moves the day.
  - `shortDate('2026-09-17T12:00:00Z', new Date('2026-10-14T12:00:00Z'))` → `'Sep 17'`
  - `shortDate('2025-09-17T12:00:00Z', new Date('2026-10-14T12:00:00Z'))` → `'Sep 17, 2025'`
  - `shortDate('2026-01-03', new Date('2026-10-14T12:00:00Z'))` → `'Jan 3'` (date-only parse robustness)
  - `shortDate('2026-08-24T20:16:36.844Z', new Date('2026-10-14T12:00:00Z'))` → `'Aug 24'` (full ISO, as `bin/register.js` writes `updated`). jest
    runs in the host timezone (`jest.config.ts` sets none), so no input may sit within 12 h of a day boundary
  - `shortDate('not-a-date')` → `'not-a-date'`; `shortDate('')` → `''`
  - `continueReading`: given A (furthest 40, lastOpenedAt `2026-10-12`), B (furthest 0), C (completed, furthest 100), D (`progress: null`), E (furthest 10,
    `2026-10-13`), F (furthest 100, **not** completed, `2026-10-01`) with limit 4 → `[E, A, F]`.
  - tie: two guides with the same `lastOpenedAt`, titles `Beta` and `Alpha` → `Alpha` first.
  - cap: six eligible guides, limit 4 → the four newest.
  - empty: `continueReading([], 4)` → `[]`.
  - Review Focus 1: a guide with `lastOpenedAt: 'garbage'` and furthest 30, alongside A → `[A, garbage-guide]`; no throw.
  - `boardCounts([A, B, C, D, E, F])` → `{ total: 6, inProgress: 3, read: 1 }` (A, E, F in progress — Review Focus 5; C read).
  - `isStarted`: B (furthest 0, `openCount` 3) → false; a completed guide at furthest 0 → true; A → true.
  - `lessonPosition`: over guides at `/p/b1-brief/b1-brief-1-a.html`, `/p/b1-brief/b1-brief-2-b.html`, `/p/b1-brief/b1-brief-3-c.html` and `/p/notes.html`
    (built with the suite's existing `g(path)` factory), `/p/b1-brief/b1-brief-2-b.html` → `{ label: seriesLabel('b1-brief'), n: 2, m: 3 }`; a loose `/p/notes.html` → `null`; an unknown path → `null`.
- [ ] **Step 2: Run them, expect failure** — `pnpm test -- test/dates test/continue-reading test/series`: module-not-found / not-a-function.
- [ ] **Step 3: Implement** the helpers. Ordering in `continueReading` parses `lastOpenedAt` once per guide; an unparsable date sorts as oldest.
- [ ] **Step 4: Run the three suites, expect PASS.**
- [ ] **Step 5: Commit** — `feat(client): date, progress and lesson-position helpers`.

### Task 2: Rail tree helpers

**Files:**
- Create: `client/src/lib/rail.ts`
- Test: `test/rail-tree.test.ts`

**Interfaces:**
- Consumes: `GuidesIndex`, `Favorite` from `shared/types.ts`.
- Produces:
  - `ALL = 'all'` (exported; replaces the private `ALL` constants in the views).
  - `interface RailRow { label: string; scope: string; count: number }`.
  - `guideTree(index: GuidesIndex): RailRow[]` — first `{ label: 'All projects', scope: 'all', count: <all guides> }`, then one row per project in index
    order, `scope` = project **path**, `count` = its guides (a project with 0 guides still gets a row with `0`).
  - `favoriteTree(favorites: Favorite[], index: GuidesIndex | null): RailRow[]` — first the `All projects` row with the total, then one row per project
    **name** that has at least one favorite: names the index knows in index order (first occurrence of a name), then names it does not know in first-seen
    order of `favorites`. `scope` = the name.
  - `resolveScope(rows: RailRow[] | null, stored: string): string` — `stored` when some row's `scope` equals it, else `'all'`. Never writes anything.

- [ ] **Step 1: Write the failing tests.**
  - index with projects `alpha` (`/a`, 2 guides) and `beta` (`/b`, 1 guide) → guideTree `[{All projects,'all',3},{alpha,'/a',2},{beta,'/b',1}]`.
  - project with 0 guides → present with count 0.
  - favorites: 3 for `beta`, 1 for `alpha`, given index order alpha, beta → `[{All projects,'all',4},{alpha,'alpha',1},{beta,'beta',3}]`.
  - project `gamma` in the index with no favorites → no `gamma` row in favoriteTree.
  - favorite for `orphan` (not in index), index null and non-null → `orphan` row appended after known names; with index null, rows in first-seen order.
  - Review Focus 3: index holds `dup` at `/x` (1 guide) and `dup` at `/y` (2 guides); favorites 1 for `dup` → guideTree has two `dup` rows (scopes `/x`,
    `/y`); favoriteTree has one `dup` row with count 1.
  - `resolveScope(rows, '/a')` → `'/a'`; `resolveScope(rows, '/gone')` → `'all'`; `resolveScope(null, '/a')` → `'all'`; `resolveScope(rows, 'all')` → `'all'`.
  - empty: `guideTree({projects: []})` → only the `All projects` row with 0; `favoriteTree([], null)` → only `All projects` with 0.
- [ ] **Step 2: Run, expect failure.** `pnpm test -- test/rail-tree`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(client): rail tree rows and scope resolution`.

### Task 3: Tokens, font, base stylesheet

**Files:**
- Modify: `shared/theme.css`, `client/index.html`, `client/src/styles.css`, `client/src/lib/settings.ts`, `client/src/main.tsx` (drop the four
  `@fontsource/barlow*` imports, keep `@fontsource/ibm-plex-mono` for `--mono`, rewrite the "no external hosts" comment — the face now loads from Google
  Fonts, spec Out of scope), `package.json` + `pnpm-lock.yaml` (`pnpm remove @fontsource/barlow @fontsource/barlow-condensed`)
- Create: `client/src/components/icons.tsx`, `client/src/components/ProgressBar.tsx`
- Test: `test/theme-tokens.test.ts`, `test/font-scale-css.test.ts` (must pass unchanged), `test/settings.test.ts`, `test/progress-bar.test.tsx`

**Interfaces:**
- Produces:
  - Tokens per §1, incl. `--magenta-tint` / `--magenta-ink` per theme and the role tokens `--green-fill --green-fill2 --green-solid --green-tint
    --amber-solid --amber-text --amber-tint --amber-ink --mustard-tint --mustard-ink`, values from `project/tokens.json` in the design-system **artifact** (https://claude.ai/artifact/XBMon4GJEdzip9WrojZYAj —
    read it with the Artifact tool; the dashboard repo has no `project/` dir). Where it lacks a value, derive it from the dashboard's shipped
    `client/src/styles.css`, which writes the dark themes' role tokens as `color-mix()`/`var()` (`:46-61`) — resolve each to a literal: tints are
    `rgba(<base>, .18)` green / `.11` amber / `.13` mustard; solids and inks are the base hex; `--green-fill`/`--green-fill2` are the oklab 70 % / 45 %
    mix of `--green` over `--strip`, computed once and written as hex. Daylight takes the shipped overrides' literals. The dashboard's Daylight block defines no `--amber`; guide-manager's Daylight block must still define every base
    token it defined before (copy the existing Daylight `--amber` forward if the dashboard has none) so the resolve check holds.
  - `icons.tsx`: named components `IconGuides`, `IconFavorites`, `IconSettings`, `IconChevronLeft`, `IconChevronDown`, `IconSearch`, `IconUp`, `IconDown`,
    `IconTop`, `IconClose`, `IconMenu`, `IconReset` — outline, 1.5 px stroke, 20×20 viewBox, `currentColor`, `aria-hidden="true"`, size prop defaulting 20.
  - `ProgressBar({ percent: number; label?: string })` and `SegmentedBar({ percents: number[] })` in `ProgressBar.tsx`.
  - Base classes in `styles.css` later tasks use: `.shell`, `.main`, `.wrap`, `.wrap.wide`, `.band` (+ `h1`, `p`), `.sec-h`, `.card` (sheet), `.toolbar`,
    `.input`, `.select`, `.btn`, `.btn.danger`, `.seg` (pill switch, `button.on`), `.switch` (pill switch for booleans), `.pill.study`, `.pill.tutor`,
    `.pill.read`, `.bar` (+ `.empty`), `.segbar`, `.key` (30×30 icon button), `.meta`, `.empty-line`. Class names are the implementer's call, but each later
    task names the ones it relies on — keep this list and theirs in step.

- [ ] **Step 1: Extend `theme-tokens.test.ts` (failing).**
  - `tokenByTheme` reads a 6-digit hex **or** an `rgba(r,g,b,a)` value; a helper composites an rgba tint over that theme's `--strip` hex.
  - for each of the five themes: contrast(`--magenta-ink`, composite(`--magenta-tint`, `--strip`)) ≥ 4.5. Expected magnitudes (±0.05): Midnight 4.65,
    Graphite 4.74, Amber 5.99, Nightshift 4.54, Daylight 5.46.
  - each role token above is defined in all five theme blocks.
  - `--accent`, `--bg`, `--fg`, `--muted`, `--line`, `--card`, `--panel`, `--good`, `--bad` each resolve (alias → target defined in every theme).
  - `--mono` is defined; `--display` appears nowhere in `shared/theme.css` or `client/src/styles.css`.
  - `color-mix(` appears nowhere in `shared/theme.css`.
  - the existing panel-separation assertion passes on the retuned Daylight (unchanged assertion).
- [ ] **Step 2: `ProgressBar` tests (failing)** in `test/progress-bar.test.tsx`: `percent 45` → fill width `45%`; `percent 0` → the bar carries the empty
  modifier and no fill element (flat track, no hatch); `percent 140` → `100%`; `percent -5` → empty; `SegmentedBar({percents:[25,0,100]})` → three
  segments with fills `25%`, empty, `100%`.
- [ ] **Step 3: `settings.test.ts`**: Daylight's label is `Daylight` and hint `light grey ground, white cards, dark ink`; theme ids unchanged
  (`midnight graphite amber nightshift daylight` — the list `test/settings.test.ts:15` already asserts).
- [ ] **Step 4: Run, expect the new assertions to fail.** `pnpm test -- test/theme-tokens test/progress-bar test/settings`.
- [ ] **Step 5: Implement** `theme.css` (header comment names the dashboard revision it now matches — `git -C ../claude-agents-dashboard log -1 --format=%h`),
  the font links (preconnect to `fonts.googleapis.com` and `fonts.gstatic.com` crossorigin, then the `css2` link for 400;500;600;700 `display=swap`),
  `settings.ts`, `icons.tsx`, `ProgressBar.tsx`, and the base layer of `styles.css`: body face and `tabular-nums`, `code, kbd, samp, pre { font-family:
  inherit }` with the `.fav-body` mono exception, type scale (comment each size with its DS name), radii, sheets with no border or shadow, the 36 px control
  family, `.seg` on a `--hairline2` track with the picked option on `--strip`, the hatched bar (10 px `--steel` track, radius 8, `--green-solid` fill, 45°
  hatch ≈2 px stripes at ≈8 % white), pills, focus ring (2 px solid `--cyan`), `prefers-reduced-motion`, density vars re-valued (card gap 16, card padding 24,
  main padding 32/40), breakpoints 640/768/1280. Keep every *why* comment that still applies.
- [ ] **Step 6: Run `pnpm test -- test/theme-tokens test/progress-bar test/settings test/font-scale-css`, expect PASS** (font-scale unchanged).
- [ ] **Step 7: Commit** — `feat(theme): DESIGN.md tokens, Hanken Grotesk, base stylesheet`.

### Task 4: Lift data and scope to AppShell; the rail

**Files:**
- Modify: `client/src/App.tsx`, `client/src/components/SideRail.tsx`, `client/src/components/guides/GuidesView.tsx` (props only, project select removed),
  `client/src/components/favorites/FavoritesView.tsx` (props only, project select removed), `client/src/styles.css` (rail + `.mnav` section)
- Test: `test/side-rail.test.tsx`, `test/app-projects.test.tsx`, `test/app-landing.test.tsx`, `test/guides-view.test.tsx`, `test/favorites-view.test.tsx`,
  `test/favorites-deeplink.test.tsx` (render through the new props/App)

**Interfaces:**
- Consumes: `guideTree`, `favoriteTree`, `resolveScope`, `ALL`, `RailRow` (Task 2); `IconGuides`, `IconFavorites`, `IconSettings`, `IconMenu`, `IconClose`
  (Task 3); `GuidesState`, `FavoritesState` (existing hooks).
- Produces:
  - `AppShell` calls `useGuides()` and `useFavorites()` once, owns `usePersistedState('guide-manager.project', ALL)` and
    `usePersistedState('guide-manager.favProject', ALL)`, derives rows (`null` while loading or on error) and resolved scopes.
  - `SideRail` props: `{ section: Section; onChange(s: Section): void; guideRows: RailRow[] | null; favRows: RailRow[] | null; guideScope: string;
    favScope: string; onScope(section: 'guides' | 'favorites', scope: string): void }` — `guideScope`/`favScope` are the **resolved** values.
  - `GuidesView` props: `{ guides: GuidesState; scope: string }` (resolved scope; `'all'` or a project path).
  - `FavoritesView` props: `{ favorites: FavoritesState; scope: string }` (resolved; `'all'` or a project name).
  - The views stay lazy chunks; only the hooks move. `App`'s `Suspense` fallback reads `Loading…`.

Rail behaviour (§2): wordmark (`GUIDE MANAGER` kicker, `› guides` prompt, static cursor); three section rows with icons; Guides and Favorites rows show
`rows[0].count` when rows are non-null, nothing otherwise; Settings no count. Active section row `aria-current="page"`. Under the active section (Guides or
Favorites) its tree renders when its rows are non-null; the picked tree row has `aria-current="true"`. Clicking a tree row calls `onScope(section, scope)`
then `onChange(section)`. Clicking a section row calls only `onChange`. The phone bar: a `header.mnav` **outside** `nav.rail` with the prompt and a ☰ button
(`aria-expanded`, `aria-controls="rail-nav"`, the rail carrying `id="rail-nav"` as the dashboard's does, `aria-label` `Open menu` / `Close menu`). While the menu is open the rail gets an open modifier and renders
**both** trees; picking any row closes it. No element inside `.rail` carries `aria-expanded`.

- [ ] **Step 1: Rewrite `side-rail.test.tsx` cases (failing).** Keep: `aria-label="Sections"`; `aria-current="page"` on the active row; reports the clicked
  section; wordmark: the DOM text stays `Guide Manager` (uppercase is CSS `text-transform`, which jsdom does not apply, so the existing
  `toContain('Manager')` holds) plus `› guides`; clicking the showing section's row calls `onChange` with it; `.rail [aria-expanded]` length 0 in
  both sections and with the menu open. Change: "exactly three buttons" → exactly three section rows (by their class or role, not all buttons). Add:
  - rows null → section rows show no count and no tree; rows given → the Guides section row's count element (`.rail-count`) reads `3`; the tree rows' (`.rail-sublink`) text
    contents are `All projects3`, `alpha2`, `beta1` (label and `.rail-count` inside each — query the two kinds separately, never `getByText('3')`).
  - section `guides` → Guides tree present, Favorites tree absent; section `settings` → no tree.
  - `guideScope '/a'` → the `alpha` row has `aria-current="true"`, `All projects` does not.
  - click `beta` under Guides → `onScope('guides','/b')` and `onChange('guides')`, in that order.
  - ☰ is inside `header.mnav`, not inside `.rail`, with `aria-controls="rail-nav"` matching the rail's `id`; `aria-expanded` false → click → true and both trees render → click a Favorites tree row → closed (false).
- [ ] **Step 2: `app-projects.test.tsx` (failing)**, through `App` with mocked fetches:
  - stored `guide-manager.project = '/b'` → board shows only beta's guides; rail `beta` row current.
  - click `alpha` in the rail → `localStorage['guide-manager.project'] === '/a'` and the board narrows to alpha.
  - stored `'/gone'` → `All projects` current, every project's guides shown, storage still `'/gone'`.
  - Favorites: same three cases against `guide-manager.favProject` with names.
  - guides fetch fails → Guides row has no count and no tree, the board shows `Guides unavailable`; the Favorites row still shows its count.
  - Review Focus 2: stored `'/b'`, URL `?open=<a guide in /a>` → the viewer opens on that guide; clicking `‹ Guides` shows the board scoped to beta;
    storage still `'/b'`.
  - a `{source:'guide-manager',kind:'progress'}` message posted twice within 300 ms → exactly one extra `GET /api/guides` (the existing coalescing case,
    now driven through `App`).
- [ ] **Step 3: `loading…` → `Loading…`** in the waits at `test/guides-view.test.tsx:78`, `test/guides-series.test.tsx:100` and
  `test/favorites-deeplink.test.tsx:179,187`. `app-landing.test.tsx` holds no such string and must pass with no edit beyond rendering through the new props.
- [ ] **Step 4: Run, expect failures.** `pnpm test -- test/side-rail test/app-projects test/app-landing`.
- [ ] **Step 5: Implement** the lift, the new `SideRail` (rewrite its docblock: scope now belongs to the rail, not the Guides toolbar), the props on both views (remove both project `<select>`s and their `usePersistedState` for the scope
  keys; the views filter by the `scope` prop), and the rail/`.mnav` CSS: 240 px rail, 24 px padding, 36 px rows desktop / 44 px in the phone menu, 16 px row
  radius, active row `--strip-hi` + 3×16 `--ink` bar, tree rule `--hairline2` at a 24 px indent with a 12 px tick, picked tree row `--ink` 500 with no
  fill, `.mnav` 60 px with an 11 px kicker, rail height in `dvh` divided by `--font-scale`.
- [ ] **Step 6: Update the view suites** (`guides-view`, `favorites-view`, `favorites-deeplink`) to render with the new props or through `App`; drop their
  project-select interactions (scope is now asserted in `app-projects`). Run the whole suite: `pnpm test`. Expect PASS.
- [ ] **Step 7: `pnpm run typecheck`**, then commit — `feat(client): rail owns project scope; data hooks lifted to AppShell`.

### Task 5: Guides board — band, toolbar, Continue reading, series, tiles

**Files:**
- Create: `client/src/components/guides/ContinueReading.tsx`, `SeriesCard.tsx`, `GuideTile.tsx`
- Modify: `client/src/components/guides/GuidesView.tsx`, `client/src/styles.css` (board section)
- Test: `test/guides-view.test.tsx`, `test/guides-series.test.tsx`

**Interfaces:**
- Consumes: `shortDate`, `boardCounts`, `continueReading`, `isStarted`, `lessonPosition` (Task 1); `ProgressBar`, `SegmentedBar`, icons (Task 3); `GuidesView`
  props (Task 4); `partitionSeries`, `seriesLabel` (existing).
- Produces: `ContinueReading({ guides: GuideEntry[]; lessonOf(path): {label,n,m}|null; onOpen(g): void })`, `SeriesCard({ group; folded; onFold; onOpen })`,
  `GuideTile({ guide; onOpen })`. Names of props are the implementer's; keep them stable for Task 6.

Behaviour (§3): band `Guides · <project name>` / `Guides · All projects` and `N guides · M in progress · K read` over the scope before search/type (singular
`1 guide`); toolbar search (`Search titles`), `All | Study | Tutor` `.seg` with a count each over the scope ignoring search, sort select right; Continue
reading (max 4, hidden while search non-empty or type ≠ All, hidden when empty; tile meta `<series> · n of m · <date>` for a lesson, date alone otherwise,
date from `progress.lastOpenedAt`); `Series` heading with count, sheets with `Series · N lessons · M started`, segmented bar, numbered rows (green dot once
completed), fold chevron keeping `guide-manager.foldedSeries`, forced open while a query runs without rewriting the fold; `Guides` heading with count, loose
tiles with type pill, `shortDate(updated)`, bar + percent or `Read` pill; All projects draws series + guides per project under the project name with its
counts, Continue once above; `collapsedBays` gone; empty/error lines `Loading…`, `Guides unavailable`, `Nothing registered yet`, `No matches`.

- [ ] **Step 1: Failing tests in `guides-view.test.tsx`** (fixture: one project, 8 guides — 3 lessons of one series, 5 loose; furthest/completed chosen so
  M and K are non-trivial):
  - band heading `Guides · <name>`, subtitle e.g. `8 guides · 5 in progress · 2 read` (compute from the fixture via the rules, not by copying).
  - switch counts `All 8`, `Study 0`, `Tutor 8` (or the fixture's split); typing a query leaves them unchanged; clicking `Tutor` writes
    `guide-manager.filterType` and narrows.
  - Continue reading lists the in-progress guides newest first, at most 4; hidden after typing a query; hidden after picking `Study`; absent when no guide is
    in progress.
  - a Continue tile for a lesson shows meta `<label> · 2 of 3 · Oct 12`; clicking it opens the viewer.
  - Review Focus 5: a loose guide at 100 % not completed shows `100%` and a bar, no `Read` pill; a completed one shows `Read`.
  - empty index → `Nothing registered yet`; fetch error → `Guides unavailable`; query with no hits → `No matches`; loading → `Loading…`.
  - All projects with two projects → two project headings, one Continue row; no element carries the old bay `aria-expanded`.
  - no `guide-manager.collapsedBays` read or write (spy on `localStorage`); delete the old bay-fold cases (`test/guides-view.test.tsx:232-270,390`,
    `button.bay-h` `aria-expanded`) rather than retargeting them.
- [ ] **Step 2: `guides-series.test.tsx`** — retarget to the sheet: subtitle `Series · 3 lessons · 2 started` for the suite's existing fixture (lesson 1 completed at 100, lesson 2 furthest 40, lesson 3 `progress: null`);
  add a case where lesson 3 has a progress row at furthest 0 → still `2 started` (opened at 0 % is not started);
  fold toggles `aria-expanded` on the chevron button and writes `guide-manager.foldedSeries`; folded hides the rows but keeps the title and segmented bar;
  remount keeps the fold; the existing "forces a folded shelf open while a query is running, without rewriting the fold" case kept with new selectors.
- [ ] **Step 3: Run, expect failure.** `pnpm test -- test/guides-view test/guides-series`.
- [ ] **Step 4: Implement** the three components and the board in `GuidesView` (state stays there). CSS: Continue grid of up to 4 equal columns; series grid
  `minmax(380px, 1fr)`; tile grid `minmax(260px, 1fr)`; rows bled to the sheet edges with hairlines; gaps mapped onto `--card-gap` / `--group-gap`.
- [ ] **Step 5: Run the two suites, then `pnpm test`.** Expect PASS.
- [ ] **Step 6: Commit** — `feat(guides): board redrawn — band, type switch, continue reading, series sheets, tiles`.

### Task 6: The viewer header and regimes

**Files:**
- Create: `client/src/components/guides/ViewerHeader.tsx`
- Modify: `client/src/components/guides/GuidesView.tsx`, `client/src/styles.css` (viewer section)
- Test: `test/guides-view.test.tsx` (viewer cases), `test/font-scale-css.test.ts` (unchanged, must pass)

**Interfaces:**
- Consumes: `lessonPosition` (Task 1), icons (Task 3).
- Produces: `ViewerHeader({ crumb: string; title: string; furthest: number; completed: boolean; onBack(): void; onReset(): void; armed: boolean })` — the
  arm state stays in `GuidesView` where it lives today (its disarm-on-guide-change rule is unchanged).

Behaviour (§4): `‹ Guides` (36 px, chevron + label) back and refetch once; crumb `<project> · <series> · n of m` for a lesson, `<project>` for a loose
guide, derived from the current index by the open path — the title alone when the index no longer holds the path, viewer stays open; title 19/500; pill
`<n>% furthest` hidden at 0, `Read` when completed; `Start over` → armed `Start over?` (red), second press runs DELETE → refetch → key bump after DELETE
resolves. CSS regimes: < 640 fixed overlay with `html.guide-locked`, sizes `100dvh`/`100vw` divided by `--font-scale`; 640–1279 in flow with a viewport floor
(re-measure the subtrahend for the new header height); ≥ 1280 `.wrap.wide` fixed column. Iframe flush inside a 16 px-radius clip, no border.

- [ ] **Step 1: Failing cases:**
  - open a lesson → crumb `<project> · <label> · 2 of 3`, title, pill `25% furthest`.
  - open a guide at furthest 0 → no pill; completed → pill `Read`.
  - `Start over` → text `Start over?`; second press → `DELETE /api/progress?…` issued; the iframe `key` (or `src` reload marker the existing test uses) changes
    only after the DELETE promise resolves (retarget the existing reset-order test; its deferred-promise structure stays).
  - a refetch that drops the open guide from the index → crumb equals the title, viewer still open.
  - `‹ Guides` → board shown, exactly one extra `GET /api/guides`.
- [ ] **Step 2: Run, expect failure.** `pnpm test -- test/guides-view`.
- [ ] **Step 3: Implement** `ViewerHeader` and the regimes.
- [ ] **Step 4: `pnpm test`**, expect PASS (font-scale suite included).
- [ ] **Step 5: Commit** — `feat(guides): viewer header with Start over; viewer regimes on 640/1280`.

### Task 7: Favorites

**Files:**
- Modify: `client/src/components/favorites/FavoritesView.tsx`, `FavoriteCard.tsx`, `client/src/styles.css` (favorites section)
- Test: `test/favorites-view.test.tsx`, `test/favorites-deeplink.test.tsx`, `test/app-projects.test.tsx` (Review Focus 4)

**Interfaces:**
- Consumes: `shortDate` (Task 1), `ALL` (Task 2), icons (Task 3), `FavoritesView` props (Task 4).

Behaviour (§5): band `Favorites · <name>` / `Favorites · All projects`, subtitle `N saved blocks from M guides · newest on top` (M = distinct `guidePath` in
scope; singular `1 saved block`, `1 guide`); search only (`Search favorites`); each favorite a sheet (max 820 px): grip (fine pointers), title 15/500 click to
rename, crumb text **unchanged** (`crumbText`) as a 13 px `--cyan` link deep-linking via `deeplink.ts`; keys ⤒ ↑ ↓ remove as 30×30 `.key` buttons with
their existing `aria-label`s; remove arms to a `Remove?` text button (red) keeping `aria-label="Confirm remove"`; note 13/400 `--ink2`, `Add a note` in
`--ink3` when empty, not italic; snapshot inset on `--board` radius 12, DS table styling, sideways scroll under 768; foot `Saved <shortDate(createdAt)>`;
All projects one section per project under its name, no collapse; `.fav-body pre, .fav-body code` keep `var(--mono)`; copy `Loading…`,
`Couldn't load favorites`, `No matches`, `EMPTY_COPY` unchanged; the per-bay `N favorite(s)` count is gone.

- [ ] **Step 1: Failing cases:**
  - band and subtitle: 3 favorites from 2 guides → `3 saved blocks from 2 guides · newest on top`; 1 from 1 → `1 saved block from 1 guide · newest on top`.
  - crumb text equals the existing `crumbText` output (`Title › a › b ↗`) and its `href` is `deeplinkHref(...)` — unchanged assertion in `favorites-deeplink`.
  - remove: first press → visible `Remove?`, `aria-label` `Confirm remove`; second → `DELETE`.
  - ⤒ `Move to top` still present and reorders; the existing reorder/drag cases (`test/favorites-view.test.tsx:617` onward) pass unchanged.
  - empty note → `Add a note`; foot `Saved Oct 11` for `createdAt 2026-10-11T12:00:00Z` (with a fixed `now` via jest fake timers or by injecting the date).
  - error → `Couldn't load favorites`; loading → `Loading…`; no hits → `No matches`.
  - Review Focus 4 (in `app-projects`): `favProject = 'beta'`, beta has one favorite, remove it (both presses) → the rail's `beta` row is gone, the view shows
    `Favorites · All projects`, `localStorage['guide-manager.favProject'] === 'beta'`.
- [ ] **Step 2: Run, expect failure.** `pnpm test -- test/favorites-view test/favorites-deeplink test/app-projects`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `pnpm test`**, expect PASS.
- [ ] **Step 5: Commit** — `feat(favorites): favorites as sheets; scope from the rail`.

### Task 8: Settings

**Files:**
- Modify: `client/src/components/settings/SettingsView.tsx`, `SettingsRow.tsx`, `client/src/styles.css` (settings section)
- Test: `test/settings-view.test.tsx`

Behaviour (§6): band `Settings` / `Stored in this browser · each device keeps its own`; cards Appearance (Theme swatches with `aria-pressed`, picked ringed
`--cyan`, row hint = picked theme's hint; Density `.seg`; Text size select), Reading aid (Bionic reading `role="switch"` with `aria-checked`; Fixation and
Every `.seg`), Startup (Opens on select); two hand-balanced columns from 768 (Appearance left; Reading aid then Startup right), one column below. Rows boxless,
name 15/500 over a 13 px hint, control right. `SettingsRow` stays the one row component.

- [ ] **Step 1: Failing cases:** three card headings `Appearance`, `Reading aid`, `Startup`; clicking `Daylight` sets `aria-pressed` true on it and the
  row hint reads `light grey ground, white cards, dark ink`; the Bionic switch has `role="switch"`, `aria-checked="false"` by default, click → `"true"` and
  the stored settings' `bionicOn` true (retarget lines that drove it by button name); Density/Fixation/Every still write their values.
- [ ] **Step 2: Run, expect failure.** `pnpm test -- test/settings-view`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `pnpm test`**, expect PASS.
- [ ] **Step 5: Commit** — `feat(settings): settings as cards; bionic as a switch`.

### Task 9: Phone pass, docs, verification

**Files:**
- Modify: `client/src/styles.css` (phone rules), `CLAUDE.md`
- Test: whole suite; browser check

- [ ] **Step 1: Phone CSS (§7):** one column with a 16 px gutter under 640; Continue reading a sideways-scrolling row of 240 px tiles; menu rows 44 px; no
  page-level horizontal scroll at 375 px.
- [ ] **Step 2: `CLAUDE.md`:** the Layout entry for `client/src/` (rail with per-project trees, no toolbar project select); rename the reset invariant to
  the viewer header's `Start over`; add "the project scope is a rail destination" (only the rail writes `guide-manager.project` / `guide-manager.favProject`;
  a stale value fails open to `All projects` without being rewritten); add the `--mono` one-reader invariant. Edit only those entries.
- [ ] **Step 3: `pnpm test`, `pnpm run typecheck`, `pnpm run build`** — all clean.
- [ ] **Step 4: Browser check** with the stack up (`pnpm run docker:up`; the web port is `GM_WEB_PORT` in `.env`), built-in browser: Midnight and Daylight,
  desktop and 375 px — rail tree, Continue reading, a series sheet, a viewer `Start over`, a favorite's armed remove, Settings in one and two columns, no
  horizontal scroll at 375. Note anything that differs from the mocks in the task report. If you started a server, stop it by its recorded pid.
- [ ] **Step 5: Commit** — `docs: CLAUDE.md invariants for the redesigned shell` (plus any phone CSS as `feat(client): phone layout`).
