# Review 2 — `docs/superpowers/specs/2026-10-14-ui-redesign-design.md`

- **Reviewer:** Fable 5.1 subagent, fresh context, files and checklist only.
- **Verdict:** **APPROVE WITH FIXES**
- **Document revision reviewed:** working tree at `d1fd1fef` ("docs: address spec review 1"), 310 lines.
- **Sources checked:** the repo (`shared/theme.css`, `client/src/**`, `assets/**`, `server/src/**`, `test/**`, `~/.guide-manager/registry.json`
  and the 16 guide files it names), the sibling repo (`claude-agents-dashboard/.claude/DESIGN.md`, `client/src/styles.css`, `client/index.html`,
  `client/src/components/SideRail.tsx`), and the design-system artifact's `project/tokens.json` and `project/README.md`.

`<doc>` below is the spec. `<dash>` is `/Users/andrejajevtic/Documents/custom-projects/claude-agents-dashboard`.

## Summary

Review 1's findings are all addressed in this revision (C1 font-scale, I1 rail figures, I2 `--mono`/`--display` readers, I3 snapshot `<pre>`, I4 crumb,
I5 `⤒`, I6 case, I7 dates, I8 viewer regimes, I9 token test, I10 `aria-expanded`, I11 counts, I12 artifact paths). Nothing in the document as written
ships wrong behaviour or breaks a CLAUDE.md invariant, so there is no Critical. What remains is one place where the spec contradicts the source it
says wins, two stated facts that are false (one of them harmless because the stylesheet is rewritten whole), a token the reading aid reads that the
spec's keep-list and test-list both omit, and three behaviours an implementer would have to guess at (search over a folded series, the rail when an
index fails to load, and the definition of "M guides" in the Favorites band).

The contrast arithmetic in §1 was recomputed and holds: Midnight 4.03 / 4.66, Graphite 4.31 / 4.74, Amber CRT 5.99, Nightshift 4.54, Daylight 5.45
(the spec's 4.01 / 4.32 / 4.65 / 5.46 differ only by hex rounding of the composited tint).

## Critical

None.

## Important

### I1 — `<doc>:100-102` the picked sub-nav row "takes `--strip-hi`" — the shipped CSS the spec says wins gives it no fill

`<doc>:93-94` states "Every rail figure below is from that file; where DESIGN.md or the design-system README differ, the shipped CSS wins." The
shipped rule is `<dash>/client/src/styles.css:302`: `.rail-sublink.on{color:var(--ink);font-weight:500}` — colour and weight only, no background.
The `--strip-hi` fill exists only on the *section* row (`:275`, `.rail-link.on`). An implementer reading §2's own rule copies the file and gets no
fill; one reading the bullet adds one; the two apps' rails then differ on exactly the thing §2 says they must not.

**Fix:** either drop `--strip-hi` from the picked-row bullet (match `:302`), or keep it and record it under "Decisions recorded" as a deliberate
departure from the shipped rail, so the "shipped CSS wins" sentence stays true.

### I2 — `<doc>:57, 278-281` the reading aid reads `--accent`, which is neither in the keep-list nor in the token test

`assets/bionic.css:17` is `color: var(--accent)`, and `shared/theme.css:93-95` documents it ("assets/bionic.css themes itself from --line, --panel,
--accent, --muted and --fg"). `--accent` is not in the `:root` alias block (`theme.css:97-110`) that `<doc>:57` keeps; it is on the *legacy alias*
line inside the `:root,[data-theme="midnight"]` block (`theme.css:37-42`, `--accent:var(--cyan)`), which the spec never names. `<doc>:44` ("take
the dashboard's current token block") would carry it over by accident — `<dash>/client/src/styles.css:36-41` still has the line — but `<doc>:238`
says "aliases … kept" without saying which, and the `theme-tokens` list at `<doc>:278-279` enumerates seven names and the base set, so a tidy-up that
drops the legacy line passes the test the spec specifies and un-colours the aid's panel accent. `<doc>:36`'s promise ("every name … the reading aid
… reads today still resolves") is the rule; the test as described cannot enforce it for this name.

**Fix:** name the legacy alias line (`--bg`…`--pink`, `theme.css:37-42`) as kept in §1, and add `--accent` (and `--bg`, read by the `study`
skill's template at `skills/study/references/visuals.md:280`, though every registered guide declares its own) to the `theme-tokens` resolve-list at
`<doc>:278`.

### I3 — `<doc>:54` "only the shell's `.rail-brand`/`.rail-kicker` read [`--display`]" is false

`client/src/styles.css` reads `var(--display)` at `:86` (`.rail-brand`), `:95` (`.rail-link`), `:145` (`.guides-title`) and `:246` (`.bay-name`);
`.rail-kicker` (`:90-92`) reads `--mono`, not `--display`. Harmless in effect — `<doc>:240` rewrites the whole stylesheet — but the sentence is the
justification for deleting a token that guides receive, and a reader checking it finds it wrong.

**Fix:** "only the shell's stylesheet reads it (`.rail-brand`, `.rail-link`, `.guides-title`, `.bay-name`), and that file is rewritten whole".

### I4 — `<doc>:148-149` folding under a search query is unspecified; today a folded series is forced open while a query runs

`client/src/components/guides/GuidesView.tsx:553` ("A folded bay is forced open while a query is running") and `test/guides-series.test.tsx:197`
("forces a folded shelf open while a query is running, without rewriting the fold") pin the current behaviour. The spec keeps `guide-manager.foldedSeries`
and says folding "hides the rows", but says nothing about search, and `<doc>:267-269` lists `guides-series` among the suites that must still prove
their behaviour. An implementer must guess whether a matching lesson inside a folded sheet is visible.

**Fix:** one sentence in §3.4: a folded sheet is forced open while the search field is non-empty, without rewriting the stored fold (today's rule),
or state that the rule is dropped and that test retargeted.

### I5 — `<doc>:123-126` the rail's behaviour when an index fails to load is unspecified

`useGuides`/`useFavorites` carry an `error` state (`GuidesView.tsx:169`, `FavoritesView.tsx:111`); the views render `Guides unavailable` /
`Couldn't load favorites`. Lifted to `AppShell`, the rail now consumes both. `<doc>:126` covers *loading* ("rows without counts until then") but not
*error*: does the Guides row show a count, a tree, nothing? Does a stored scope fail open to `All projects` when there is no index to check it
against? The checklist's "failure of each external call" is not met for the one new consumer.

**Fix:** state it — e.g. on error the section row draws with no count and no tree, and the scope row is not rendered; the view keeps carrying the
error copy.

### I6 — `<doc>:196` "N saved blocks from M guides" — M is undefined

A favorite carries both `guidePath` and `guideTitle` (`shared/types.ts:134, 142`). Two guides can share a title (two checkouts of one repo register the
same project twice, `FavoritesView.tsx:10-19`), and a renamed guide keeps its path. Counting by title and by path give different M.

**Fix:** "M = distinct `guidePath` among the favorites in scope".

## Minor

- `<doc>:45-46` attributes `--ink2 #525252` / `--ink3 #6b6b6b` to "DESIGN.md's neutrals"; DESIGN.md's text tokens are `#6E6E6E` / `#A0A0A0`
  (`<dash>/.claude/DESIGN.md:62-63`). The listed values are the dashboard's shipped Daylight (`styles.css:128`) and `tokens.json`'s, which is what
  `<doc>:44` names as the source — so the values are right and only the attribution is off. Say "the dashboard's shipped Daylight".
- `<doc>:56` "none of the 15 registered guides" — the registry holds 16 guides across 2 projects. The claim itself holds: no registered guide reads
  `--display`, `--mono` or `--font` (they read `--accent`, `--bg`, `--border`, `--text`, all of which they declare themselves).
- `<doc>:78` "No card borders" follows DESIGN.md §8.2 (`:228`, "no stroke and no shadow"); §5 (`:134`) and the design-system README both say a card
  carries a 1 px `hairline` border. The spec is entitled to pick §8.2, but should say it is overriding §5/README so the next reader does not "correct" it.
- `<doc>:96, 107` the phone bar copies the dashboard's `.mnav-brand`, whose kicker is `font-size:10px` (`<dash>/client/src/styles.css:362`) — below
  the 11 px floor `<doc>:69` sets. Parked (autopilot #3) with the recommendation to hold 11 px; a half-sentence in §2 settles it.
- `<doc>:182` the viewer crumb needs the project name and the lesson's `n of m`, but `ViewerState` (`GuidesView.tsx:70-74`) holds only `href`,
  `title`, `path`. Deriving both from the index by path is the obvious route; say so, and say what the crumb shows if a refetch drops the guide from
  the index while it is open (today the viewer stays open on its own state).
- `<doc>:100` "one row per project with its count" — a registry project with zero guides in the index: row with `0`, or no row? The test list
  (`<doc>:264-265`) answers this only for Favorites.
- `<doc>:203` 30 × 30 icon buttons sit inside a spec whose control family is 36 px (`<doc>:92, 135, 223`) and whose phone floor is 44 (`<doc>:229`,
  menu only). Not a contradiction — the family is for controls, these are keys — but worth one clause saying the keys are the exception and why.
- `<doc>:49` "the token test reads each theme's block" — `test/theme-tokens.test.ts:28` matches a block only when it closes with `\n}` and reads
  only six-digit hex (`:30`); the rewritten token block must keep that shape, and the spec's rgba extension (`<doc>:281`) covers the second limit but
  the plan should mention the first.
- `<doc>:44` the dashboard's Daylight block defines no `--amber` (`styles.css:124-140`; `tokens.json` lists `amber` for the four dark themes only), so
  under Daylight `--amber` resolves to Midnight's `#ffb03a`. Nothing in guide-manager reads it after the rewrite; note it so no one adds a reader.
- `<doc>:307` quotes the README's content rule as "name the thing in words, no symbol-as-label"; the README's wording is "Name the thing, not the
  action's mechanics". Paraphrase, not a quote — drop the quotation framing or quote it exactly.
- `<doc>:220` `role="switch"` for Bionic is new: today it is a `set-seg` `role="group"` of `aria-pressed` buttons (`SettingsRow.tsx:43-48`). Fine as a
  change, but `test/settings-view.test.tsx:102,114` drive it by button name; list it under the assertions that change.

## Checklist coverage

1. **Facts** — verified against the repo and the sibling repo: rail figures (240 / 24 / 36 / 44 / 16 / 3×16 / `.mnav` 60 / burger 44, `styles.css:235-368,406-417`),
   ☰ `aria-expanded` in `.mnav` (`SideRail.tsx:257-258`), `.seg` track/option (`:729-732`), `code{font-family:inherit}` (`:202`), `tabular-nums` (`:198`),
   Google Fonts link (`index.html:17-19`), DESIGN.md §8 280/40/22 (`:167-173`), README 32 px, `tokens.json` literal per-theme role values, breakpoints
   700/701-1200/1201 and the 62 px subtrahend (`client/src/styles.css:111,408,424,431`), `.shell{zoom}` (`:33`), density vars (`:36-52`),
   `:focus-visible` (`:631`), storage keys, every copy string in §1, `crumbText`, the four `aria-label`s, `sure?` in both views, `ViewerState`,
   764 lines, `GuidesView` reset order, `useGuides` 300 ms, test suite names and the assertions the spec says change. False: I3, Minor 2 and 1.
2. **Consistency** — I1 (shipped CSS vs bullet); contrast values recomputed and agree. Rail/viewer breakpoints agree across §1, §2, §4, §7.
3. **Edge cases** — I4, I5, I6, Minor 6–7. Empty index, zero-progress, ties, invalid dates, stale scope, concurrent refetch are covered.
4. **Copy** — exact and consistent; mock differences called out (`· card n`, missing `⤒`, heavier hatch, 280 rail).
5. **Scope** — non-goals named; nothing in scope depends on `render/`, `assets/`, `skills/`, `bin/` or the API. No `plugin:sync` needed, correctly.
6. **CLAUDE.md** — the one-reset-control, framed-guide, capture-script, favorites-order, sanitisation and port invariants are untouched or renamed
   with semantics intact; the `--mono`/one-face invariant is added. No `.claude/rules/` directory exists.
