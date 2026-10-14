# Review 1 — `docs/superpowers/specs/2026-10-14-ui-redesign-design.md`

Verdict: **REVISE**

Reviewer: subagent (Fable 5.1), 2026-10-14. Checked against the repo at `cd2bec43`, the sibling repo `../claude-agents-dashboard` (`.claude/DESIGN.md`,
`client/src/styles.css`, `client/index.html`) and the design-system artifact https://claude.ai/artifact/XBMon4GJEdzip9WrojZYAj (`project/README.md`,
`project/tokens.json`, `project/components/RailLink/README.md`). `<doc>` below is the spec; every other path is repo-relative unless it starts with
`../claude-agents-dashboard/`.

Method: every factual claim in §1–§9 was checked by reading the named file; the five WCAG figures in §1 and the `--green`-on-`--green-tint` pairs were
recomputed (sRGB luminance, `color-mix` composited over `--strip`); the registry's 16 guide files were scanned for `var(--…)` reads to settle the "guide
pages read `--mono`/`--display`" claim.

Verified correct (no finding): the magenta contrast figures (4.01 / 4.32 / 4.65 / 4.74 / 5.99 / 4.54 / 5.46, all exact); the Daylight neutrals (match
`../claude-agents-dashboard/client/src/styles.css:124-139` and `tokens.json`); the four dark themes being hue-identical between repos; the Hanken Grotesk
`<link>` form (`../claude-agents-dashboard/client/index.html`); the dashboard having deleted `--mono`/`--display` (DESIGN.md §8.1); the alias block and
header comment of `shared/theme.css`; `THEMES` Daylight label/hint (`client/src/lib/settings.ts:23`); the storage keys and their fail-open reads
(`GuidesView.tsx:23-53`, `FavoritesView.tsx:20-24,141`); `useGuides`' 300 ms coalesced refetch (`client/src/hooks/useGuides.ts`); `GuidesView.tsx` being
764 lines; the empty-state strings; `‹ Guides` / `↺ reset` and its DELETE → refetch → key-bump order; `⠿` under `@media (pointer: fine)`; the italic note;
the nine named test suites existing; `theme.css` being linked into every rendered page (`server/src/render/render.util.ts:96`); `.wrap.wide` and the
`body.deck-host main` dependency; `--mnav-h: 60px`; the dashboard's rail `aria` conventions.

## Critical

### C1 — The `styles.css` rewrite never mentions `--font-scale` / `.shell{zoom}`, and `test/font-scale-css.test.ts` is not in the "updated, not deleted" list

- `<doc>:210` — `client/src/styles.css` "rewritten to the DS; class names change where the structure changes".
- `<doc>:236-247` — the suites to update: `side-rail`, `guides-view`, `guides-series`, `favorites-view`, `favorites-deeplink`, `settings-view`,
  `app-projects`, `app-landing`, `theme-tokens`. `font-scale-css` is absent, and `grep -n 'font-scale|zoom'` over the spec finds nothing but the Settings
  row label at line 189.
- `test/font-scale-css.test.ts` reads `client/src/styles.css` as text and asserts: every line with a viewport unit (`vh`, `vw`, `dvh`, …) divides it by
  `var(--font-scale` (exempting body's `min-height: 100vh`); `.shell\s*\{\s*zoom:\s*var\(--font-scale, 1\)\s*\}` exists; no `body{zoom}`; `:root {\n  --body-pad`
  precedes `[data-density="compact"] {`; and the compact block contains `--body-pad:` and matches no `/color|background|font-size/`.
- Today those rules are load-bearing: `client/src/styles.css:33` `.shell{zoom:var(--font-scale,1)}`, `:78-82` `.rail{... height:calc(100vh / var(--font-scale,1))}`,
  `:126-130` `.wrap.wide{height:calc(100vh / var(--font-scale,1) - 2*var(--body-pad))}`, `:408-419` the phone viewer `height:calc(100dvh / var(--font-scale,1));
  width:calc(100vw / var(--font-scale,1))`. The Text size setting (`<doc>:189`, kept) works only because of them.
- Building as written: a DS rewrite that writes `height: 100vh` / `100dvh` for the new 60 px top bar, the menu or the viewer, or restructures the `:root`
  density block, fails `pnpm test` and ships a Text size control that overflows the rail/viewer at any value but 1.

Fix: add to §1 (or a new "Invariants kept" line in §9) that `.shell{zoom:var(--font-scale,1)}` stays the one scaling mechanism, every viewport unit in
`styles.css` is divided by `--font-scale`, and the `:root` density block keeps its shape; list `font-scale-css` at `<doc>:236` with the rule it must still
prove.

## Important

### I1 — `<doc>:80-81,85,88` "Built to the dashboard's shipped rail" — the figures given are DESIGN.md's, not what ships

- The spec says 40 px rows, 20 px icons, a 3 × 22 px active bar and a 26 px sub-nav indent come from "what `claude-agents-dashboard/client/src/styles.css`
  actually ships".
- Shipped (`../claude-agents-dashboard/client/src/styles.css`): `:406` `.rail{flex:0 0 240px;padding:24px}` (matches); `:416` desktop `.rail-link{min-height:36px}`
  (not 40; the 44 px at `:263` is the phone menu); `.rail-ic{width:16px;height:16px}` (not 20 — the SVG *viewBox* is 20, the box is 16); `.rail-link.on::before
  {width:3px;height:16px}` (not 22); `.rail-sub{margin:2px 0 2px 24px}` (not 26). 40 / 20 / 22 / 26 are DESIGN.md §8's figures (`.claude/DESIGN.md:165-173`).
- The design-system artifact's `project/components/RailLink/README.md` says 44 px rows, a 16 px icon, a 3 × 16 px bar — a third set.
- `<doc>:81,270` also say "the design-system README agrees" on 240 with 24 px padding: `project/README.md` names the 240 px rail only in the breakpoints
  line, and its `space-8` token says "Rail padding: 32px" — 240 agrees, 24 does not.

Fix: pick one source per figure and say which; if the intent is "what ships", the row is 36 px (44 on the phone), the icon box 16 px, the bar 3 × 16, the
indent 24 px. Correct the README claim to "240 px agrees; the README's 32 px rail padding is not followed".

### I2 — `<doc>:53,258` "here the guide pages read them [`--mono`, `--display`]" is false

- No `var(--mono)`, `var(--display)` or `var(--font)` read exists in `skills/`, `assets/`, `server/src/` or `shared/` (grep), and none of the 16 registered
  guide files reads them either (the scan found `--fg`, `--panel`, `--muted`, `--line`, `--card`, `--good`, `--bad`, `--strip`, `--cyan`, `--ink` only).
- The readers are the shell's own stylesheet: `client/src/styles.css` `.rail-brand{font-family:var(--display)}`, `.rail-kicker{font-family:var(--mono)}`,
  `:538-541` `.fav-body pre{font-family:var(--mono)}`, `:584` `.set-hint code`.
- Keeping the two tokens is harmless, but the stated reason is wrong and `<doc>:245` builds a test assertion on it ("every token name a guide … reads").

Fix: either drop them with the shell (the dashboard's rule, `project/README.md`: "There is no display face, no monospace") or keep them with an honest
reason ("kept so an old vendored guide that reads them does not fall to the UA default"), and strike them from the "a guide reads" list at `<doc>:245`.

### I3 — `<doc>:63` `code, kbd, samp, pre { font-family: inherit }` + `<doc>:176` "the snapshot as today" collide on favorites' `<pre>`

- Today `.fav-body pre` is set in `var(--mono)` at 11.5 px on `--steel` (`client/src/styles.css:538-541`). With the global inherit rule and `--mono` no
  longer used by the shell (`<doc>:53` "The shell stops using both"), a saved code block renders in Hanken Grotesk. A favorite is a snapshot of what the reader
  saw (CLAUDE.md "A favorite is a snapshot with an address"); the guide rendered that `<pre>` in a monospace face.
- The spec's table re-draw rule for `.fav-body` (`<doc>:176`) is silent on code.

Fix: state the snapshot's code face explicitly — exempt `.fav-body pre, .fav-body code` from the inherit rule (keeping `var(--mono)`, which is one more
honest reason for I2), or decide they go proportional and say so under Decisions.

### I4 — `<doc>:171` the crumb `<guide title> · card n` drops today's headings and is undefined for doc and null anchors

- Today: `FavoriteCard.tsx:133` `crumbText = \`${[favorite.guideTitle, ...favorite.crumb].join(' › ')} ↗\`` — the `Favorite.crumb: string[]` context headings
  are the only on-card record of *where* in the guide the block sits; `test/favorites-view.test.tsx:217` asserts `'Personalpronomen › §1 · Die Tabelle › Die Tabelle ↗'`.
- `GuidePosition` (`shared/types.ts`) is `{kind:'deck', cardIndex, …}` **or** `{kind:'doc', anchorId?}`, and `Favorite.anchor` may be `null`. "card n" has no value
  for a doc guide or a null anchor; the spec gives no fallback, and `n` is not said to be 1-based (`cardIndex` is 0-based; `favorites-deeplink.test.tsx` uses
  `cardIndex: 12`).

Fix: specify the crumb per anchor kind (`deck` → `… · card n` with n = cardIndex + 1; `doc`/null → title alone, or today's heading trail), and say whether
`favorite.crumb` stays in the text; name the `favorites-view` assertion that changes.

### I5 — `<doc>:172` lists "↑, ↓ and remove"; `<doc>:180` says ordering is unchanged — `Move to top` (⤒) is dropped by omission

- `FavoriteCard.tsx:398-403` renders `⤒` with `aria-label="Move to top"`; `useFavorites.ts:37` ("↑/↓/⤒/drag all funnel through here") and
  `onMove: (to: 'up' | 'down' | 'top')` (`FavoriteCard.tsx:57`) carry it; `test/favorites-view.test.tsx:440-474` proves it.
- Two sections of the spec disagree on whether it exists after the redesign; an implementer must guess, and the test list at `<doc>:236` does not resolve it.

Fix: either add ⤒ to the keys (30 × 30, `aria-label="Move to top"`) or record its removal under Decisions and in the `favorites-view` update. (Parked with
autopilot: keep it.)

### I6 — `<doc>:65` "Sentence case everywhere" vs `<doc>:140` lowercase empty states, and §5's error/empty copy is unaddressed

- `<doc>:140` keeps `loading…`, `guides unavailable`, `nothing registered yet`, `no matches` lowercase; `<doc>:173` changes `add a note` → `Add a note`
  (`FavoriteCard.tsx:440`, asserted at `test/favorites-view.test.tsx:419-425`); the Suspense fallback `loading…` in `App.tsx` and Favorites'
  `couldn't load favorites` (`FavoritesView.tsx:34`, asserted at `test/favorites-view.test.tsx:199`), its `EMPTY_COPY` (`:32`, sentence case already) and
  `no matches` (`:216`) are not mentioned at all. Favorites' `N favorite(s)` bay count (`FavoritesView.tsx`) is not mentioned either.
- The spec contradicts its own rule and leaves half the strings to a guess, which is exactly where copy tests break.

Fix: one sentence naming the exception ("existing lowercase empty/error lines stay as they are; only new copy is sentence case") or sentence-case them all
and list the affected assertions (`guides-view`, `favorites-view`).

### I7 — `<date>` fields and formats are unspecified on four surfaces

- `<doc>:125` Continue tile `… · <date>`, `<doc>:133` sheet, `<doc>:135` guide tile, `<doc>:178` `Saved <date>`.
- Today the guide card shows `guide.updated.slice(0, 10)` (`GuidesView.tsx:752`) and the favorite foot `favorite.createdAt.slice(0, 10)` (`FavoriteCard.tsx:450`);
  the Continue tile has no precedent — `lastOpenedAt` (its sort key at `<doc>:126`) or `updated`? The design-system README (`project/README.md`, Content)
  wants relative meta ("3 min ago"), which would change both tests.

Fix: per surface, name the field and the format (ISO `YYYY-MM-DD` as today, or relative), and say which it is for the Continue tile.

### I8 — The viewer's phone and desktop layouts are not re-specified under the 640/768 breakpoints (`<doc>:74,151,160-162,196-199`)

- Today: below 700 px the viewer is a fixed full-screen overlay (`client/src/styles.css:408-419`, `position:fixed; inset:0; z-index:40`) with
  `html.guide-locked{overflow:hidden}` (`:431-433`); 701–1200 px uses a min-height (`:424-425`); ≥1201 px `.wrap.wide` is a fixed-height flex column (`:126-130`).
- `<doc>:74` removes the 700/1201 rules and `<doc>:151` says "The rail stays", which an overlay does not do; §7 describes the board on the phone but not the
  viewer. Whether the phone viewer stays an overlay (and keeps `guide-locked`) is a guess, and the overlay's `100dvh / var(--font-scale)` lines are the ones
  C1 is about.

Fix: one paragraph per breakpoint for the viewer: below 640 (overlay or in-flow under the top bar; `guide-locked` kept or dropped), 640–1023, ≥1024, each with
how the iframe height is derived.

### I9 — `<doc>:245-246` "defined for all five themes" cannot hold as written for `--mono`, `--display`, the aliases or the role tokens

- `shared/theme.css` defines `--mono`, `--display`, `--font` only in the `:root,[data-theme="midnight"]` block and the seven aliases in a trailing `:root` block;
  `<doc>:48` says the role tokens are "defined in every theme", but the dashboard defines them once in `:root` as `color-mix(...)` with Daylight overriding
  by literal (`../claude-agents-dashboard/client/src/styles.css:9-63,124-139`). `test/theme-tokens.test.ts`'s `tokenByTheme` only extracts `#xxxxxx` hex values
  per `[data-theme]` block, so neither `color-mix` values nor `:root` inheritance are visible to it.
- The `--magenta-ink` contrast assertion at `<doc>:247` likewise needs a value the helper can read (`#d181ab` is hex, but `--magenta-tint` as `color-mix`
  is not).

Fix: say "resolves in every theme" and state how the test resolves it (extend the helper to fall back to `:root`, or require the `theme.css` port to write
every role token as a literal per theme — which `tokens.json` already supplies as rgba/hex).

### I10 — `<doc>:94-95` ☰ with `aria-expanded` inside `.rail` vs `test/side-rail.test.tsx:60-65` and `<doc>:97`

- The suite asserts `document.querySelectorAll('.rail [aria-expanded]')` has length 0 and that the rail holds exactly 3 buttons (`:27`); `<doc>:97` restates
  "No row carries `aria-expanded`", but the ☰ is inside "the same `.rail` element" (`<doc>:94`). Also, the dashboard does *not* reuse `.rail` as the top bar:
  it has a separate `.mnav` (60 px, `../claude-agents-dashboard/client/src/styles.css:358,368`) with `.rail` as the dropdown (`:235`).

Fix: say the ☰ is the one `aria-expanded` element and the selector in `side-rail` narrows to rows (`.rail-link`), or follow the dashboard's `.mnav` + `.rail`
split; drop "same `.rail` element" if the split is taken.

### I11 — `<doc>:120,130` counts and "M started" are undefined

- `All | Study | Tutor` "with a count per option": counted over the scope (project) only, or over scope + search? Hidden-by-search guides counted or not?
- `Series · N lessons · M started`: does a `completed` lesson count as started? Does one with `openCount > 0` and `furthestPercent 0`?

Fix: define both in one line each (recommended: counts follow the scope and ignore the search; "started" = `progress !== null`).

### I12 — `<doc>:6,81,270` cite `README.md` / `tokens.json` at the artifact root; they live at `project/README.md` and `project/tokens.json`

- An implementer reading the artifact by path gets "no file is published at that path". Minor in effect, but it is a stated fact about an outside source.

Fix: correct the paths.

## Minor

- `<doc>:143` hatch "~16 % on the dark themes, ~28 % on Daylight" deviates from DESIGN.md §2's "~8% white over the fill" (`.claude/DESIGN.md:81`) with no
  Decisions entry. Add one or use 8 %.
- `<doc>:72` names three density properties; `client/src/styles.css:36-53` carries seven (`--body-pad`, `--card-pad`, `--card-gap`, `--card-inner-gap`,
  `--bay-gap`, `--group-gap`, `--set-pad`). Say which of the other four survive the rewrite.
- `<doc>:101` "the `ALL` sentinel" — `ALL` is the constant's name; the stored value is `'all'` (`GuidesView.tsx:53`, `FavoritesView.tsx:24`). Say `'all'`.
- `<doc>:120` switch options `Study` / `Tutor` vs `<doc>:146` pills `study` / `tutor`: two casings of the same category on one screen. Intentional under
  "sentence case for labels, lowercase for pills"? Say so.
- `<doc>:156` the armed label today is `sure?` (`GuidesView.tsx:375`); `Start over?` replaces it — note the `guides-view` assertion that changes.
- `<doc>:172` remove today arms as `sure?` with `aria-label="Confirm remove"` (`FavoriteCard.tsx:409-414`; asserted at `test/favorites-view.test.tsx:513-540`).
  `Remove?` changes the text; say whether the `aria-label` pair stays.
- `<doc>:48` "defined in every theme" — see I9; also `tokens.json` gives `green-tint`/`amber-tint`/`mustard-tint` as rgba, not `color-mix`; say which form
  `theme.css` takes.
- `<doc>:88` "DESIGN.md §8's centreline indent" — §8 says 26 = 16 + half of a 20 px icon; with 16 px icons (I1) the centreline is 24, which is what ships.
- `<doc>:124` "`last opened first` meta beside it" and `<doc>:126` sort `lastOpenedAt` desc, ties by title — fine; but say whether a guide with
  `progress.completed` is a Continue tile (recommended: no).
- `<doc>:137-139` `collapsedBays` "left unread": `test/guides-view.test.tsx:232-235` asserts `aria-expanded` on bay headers — list it among the retargeted
  assertions.
- `<doc>:187` `role="switch"` for the Bionic toggle: today's `aria-pressed` swatch buttons (`SettingsView.tsx:81`) are a different pattern; say the Theme
  swatches keep `aria-pressed` (they are a radio-like group, not switches).
- `<doc>:210` "rewritten to the DS": CLAUDE.md asks for the existing comment density (why, at length) — a rewrite should carry the why-comments over, not
  start from a bare stylesheet. One line.
- `<doc>:61-62` the dashboard also sets `font-variant-numeric: tabular-nums` on `body` (`../claude-agents-dashboard/client/src/styles.css:198`), which the
  README calls out ("Figures line up"); the spec's percent columns want it. Add it to §1.
- `<doc>:56` Daylight's hint: the spec says what it "stops saying" but not the new text — give the string (tests assert hints by text).

## Checklist coverage

1. Facts about code/data/outside sources: I1, I2, I12 false; the rest verified (see the list at the top).
2. Internal consistency: I5 (172 vs 180), I6 (65 vs 140/173), I9 (48 vs 245), I10 (94 vs 97); example values recomputed and exact.
3. Edge cases: I4 (doc/null anchor), I11 (counts, started), I7 (dates), I8 (viewer per breakpoint). Empty/zero/duplicate/stale-key cases are covered by
   `<doc>:101-104,140`.
4. Copy: I4, I5, I6, I7 and the Minor copy notes.
5. Scope: out-of-scope list at `<doc>:261-266` is named; nothing in scope depends on it. I5 is the one silent scope change.
6. CLAUDE.md hard rules: C1 (font-scale invariant, guarded by a test), I3 (favorite is a snapshot). The single reset control, the deep-link rule, the
   sanitise-at-render rule and the `guide-manager.*` key rule are respected as written.
