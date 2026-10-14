# Plan review 1 — `docs/superpowers/plans/2026-10-14-ui-redesign.md`

Reviewed against `docs/superpowers/specs/2026-10-14-ui-redesign-design.md` (317 lines), the guide-manager working tree at `c3c4b303` and the
claude-agents-dashboard working tree at `19aa2b2` (branch `management-redesign`). Every path, export, test string and token value named below was
checked in the repo; nothing in either document was edited.

## Verdict

**APPROVE WITH FIXES.** No Critical findings. Nine Important findings, all local to a line or a step; none changes the task order or the spec mapping.
The plan can be executed once those lines are corrected.

## Checklist coverage

| # | Check | Result |
|---|---|---|
| 1 | Every spec section / test case has a task | Yes. Spec §1 → T3, §2 → T2+T4, §3 → T1+T5, §4 → T6, §5 → T7, §6 → T8, §7 → T9. Spec `Testing` `rail` tree cases all in T2 (`guideTree`, `favoriteTree`, `resolveScope`); `continueReading` cases all in T1. Spec line 73 (per-bay count goes) → T7. Spec §4 "refetch once on back" → T6. Review Focus 1–5 each have a named test (T1, T4, T2, T7, T1+T5). |
| 2 | Values / copy match the spec exactly | Yes for every string and number I could compare: shell copy list (plan 31–34), storage keys (39), magenta ink values and contrast figures (155–156 — recomputed in node over `--strip`: 4.65 / 4.74 / 5.99 / 4.54 / 5.46, raw 4.01 / 4.32), rail metrics (240 / 24 / 44→36 / 16 / 12 / 3×16, 60 px `--mnav-h`), breakpoints 640 / 768 / 1280, Daylight literals, `THEMES` Daylight label/hint. One copy ambiguity: finding I-4. |
| 3 | Paths and exports are real | All 13 `Create` files absent; all `Modify` and test files present at the stated paths. Exceptions: finding I-1 (`project/tokens.json` does not exist in the dashboard repo) and I-2 (`client/src/main.tsx` is a real file the plan should modify but does not list). |
| 4 | Interfaces consumed are produced earlier, same spelling | Yes. `shortDate / isInProgress / isStarted / boardCounts / continueReading` (T1) → T5/T7; `lessonPosition` (T1) → T5; `guideTree / favoriteTree / resolveScope / ALL / RailRow` (T2) → T4; icons list and `ProgressBar / SegmentedBar` (T3) → T4–T8; `guideScope / favScope / onScope` (T4) → T5/T7. Spelling consistent throughout. |
| 5 | Order / prerequisites | Sound: helpers (T1–T2) before consumers, tokens/base CSS (T3) before any component, AppShell lift (T4) before the views that read lifted state (T5, T7), viewer header (T6) after the board, settings (T8) independent, phone/docs last. |
| 6 | Tests fail-before and pin behaviour | Every task has a "write failing test → run, expect failure → implement → run, expect pass" cycle with the suite named. Fail-before is real for the new cases. Weak spots: finding I-5 (a step targets a string a suite does not contain), I-6 (a fixture that does not exist), I-7 (a count the implementer could copy rather than derive), I-8 (`aria-controls` target unnamed), I-9 (two elements with text `3` in one assertion). |
| 7 | Plan's own conventions | Followed: behaviour + exact values + edge cases, no literal code blocks, size budgets stated as soft, one commit per task with a conventional subject. |

## Important

**I-1 — plan:142 — `project/tokens.json` does not exist, and the shipped CSS gives no literals for four themes.**
"values from the dashboard's `project/tokens.json` and its shipped CSS". `ls /Users/andrejajevtic/Documents/custom-projects/claude-agents-dashboard/project/`
has no `tokens.json` and no `README.md` — those files live only in the claude.ai design-system artifact the spec cites at spec:6. The shipped CSS
(`claude-agents-dashboard/client/src/styles.css:46-61`) defines the dark-theme role tokens as `color-mix()` / `var()` expressions, e.g.
`--green-fill:color-mix(in oklab,var(--green) 70%,var(--strip))`, `--green-tint:color-mix(in srgb,var(--green) 18%,transparent)`,
`--amber-tint:... 11%`, `--mustard-tint:... 13%`, `--amber-ink:var(--amber)`, `--amber-solid:var(--amber)`, `--green-solid:var(--green)`. Only Daylight
has literals (`:94-110`). So for the four dark themes × ten tokens the implementer has nothing to copy, and `test/theme-tokens.test.ts:29` parses only
six-digit hex (`--token:\s*(#[0-9a-f]{6})`) — a `color-mix()` value would be invisible to the suite's separation assertions.
→ Replace the file name with the artifact URL from spec:6, and state the derivation per token: tints = base colour at 18 % (green) / 11 % (amber) /
13 % (mustard) over transparent, written as `rgba()` or as a pre-mixed hex over `--strip`; solids / inks = the theme's own base token hex; fills =
`color-mix(in oklab, green 70%, --strip)` resolved to hex (state whether hex is required for the theme-tokens suite to see them).

**I-2 — plan:135 (Task 3 Files) — `client/src/main.tsx` and `package.json` are missing from the font change.**
`client/src/main.tsx:4-12` imports `@fontsource/barlow/400.css`, `/600.css`, `@fontsource/barlow-condensed/600.css`, `/700.css`,
`@fontsource/ibm-plex-mono/400.css`, `/600.css`, with the comment "Imported here rather than linked from a CDN so the app works offline and over a
tailnet with no external hosts." `package.json:25-27` carries the three `@fontsource/*` deps. The plan's Task 3 touches `client/index.html` (Google
Fonts `<link>`, as spec:65 decides) but never `main.tsx`, so Barlow and Barlow Condensed keep shipping in the bundle under "one face" (plan:30), and
nobody is told that `@fontsource/ibm-plex-mono` must *stay* because `--mono` survives (spec:36 "every name … still resolves"; `.fav-body` and the
viewer kicker use it).
→ Add `client/src/main.tsx` and `package.json` to Task 3 Files; step: drop the four Barlow imports and the two `@fontsource/barlow*` deps, keep
`@fontsource/ibm-plex-mono`; rewrite the main.tsx comment (the "no external hosts" claim becomes false for the UI face, which spec:307 accepts).

**I-3 — plan:82 — the rationale for the date-only case misstates what the registry writes.**
`shortDate('2026-01-03', …) → 'Jan 3' (date-only ISO, as registry `updated` values look)`. `bin/register.js:42-43,123` writes
`guide.updated = now` with `now = new Date().toISOString()` — full ISO with time, e.g. the live registry's `"updated":"2026-08-24T20:16:36.844Z"`.
The test case is still worth keeping (parse robustness, and `createdAt` on favorites is also full ISO), but an implementer who trusts the parenthetical
may special-case date-only strings and skip the time-bearing form the registry actually sends.
→ Keep the case; change the rationale to "date-only input must also parse" and add a full-ISO case (`'2026-01-03T09:30:00.000Z'` → `'Jan 3'`) with a
note on time-zone handling (jest runs in the host TZ — `jest.config.ts` sets none — so pick inputs that cannot roll over a day boundary, or format in
UTC).

**I-4 — plan:33 / 247 / 257 — `Search titles` is listed as exact copy without saying which attribute it is.**
Today `GuidesView.tsx:486-491` renders `aria-label="Search guides" placeholder="search titles"`, and `test/guides-view.test.tsx:93,345` query by
`getByLabelText('Search guides')`. The plan's copy list (33) and Task 5 (247, 257) say `Search titles` but never say whether that is the placeholder,
the aria-label, or both — and Task 5 Step 1 says to keep existing cases passing in meaning. An implementer who sets `aria-label="Search titles"` breaks
`guides-view.test.tsx:345`'s control-label list for a reason the plan did not state; one who leaves the label alone and only changes the placeholder
matches the plan but no test pins the new placeholder.
→ State both: placeholder `Search titles`, aria-label stays `Search guides` (or changes, with the test line to retarget). Same for `Search favorites`
(FavoritesView aria-label `Search favorites` at `test/favorites-view.test.tsx:245`).

**I-5 — plan:223 — Task 4 Step 3 targets a string `app-landing.test.tsx` does not contain.**
"update only the `loading…` string to `Loading…`." `grep -c 'loading…' test/app-landing.test.tsx` → 0. The `loading…` assertions live in
`test/guides-view.test.tsx:78` and `test/guides-series.test.tsx:100` (the `Suspense` fallback at `App.tsx:74` and the board copy at
`GuidesView.tsx:533`). The step as written has nothing to do and the implementer may conclude the landing suite is already green for the wrong reason.
→ Point the step at `guides-view.test.tsx:78` and `guides-series.test.tsx:100` (or fold it into Task 5 Step 1, which already lists the new empty-state
copy at plan:252) and have Step 3 say the landing suite is expected to pass with no edit.

**I-6 — plan:92-93 — "the existing series fixture in `series.test.ts`" does not exist.**
`test/series.test.ts` builds every path inline through a local `g(path)` helper; there is no shared fixture and no path shaped like
`/p/b1-brief/b1-brief-1-a.html`. The parenthetical alternative is the only usable instruction.
→ Drop "the existing series fixture" and specify the three paths outright, plus the expected `lessonPosition` values for each (e.g. lesson 2 of 3 →
`{ index: 2, total: 3 }`, or whatever shape T1 Produces names) and the loose-guide case (`null`).

**I-7 — plan:266 — the `1 started` count is given as a literal, not derived from the fixture.**
`test/guides-series.test.tsx:46-56` has three lessons: `indexes` and `replication` carry progress objects, `storage-engine` has `progress: null`. The
plan's own rule "(a lesson opened at 0 % is not started)" decides the count, but the plan does not say which fixture lesson sits at 0 %. If the
implementer copies `1 started` while both progress-bearing lessons have `furthestPercent > 0`, the test is wrong and the implementation gets bent to
match it.
→ State the fixture values the count depends on (`furthestPercent` per lesson) or instruct "derive from the fixture, do not copy", and define
`isStarted` precisely in T1 (plan:84-86 already does: `furthestPercent > 0` — reference it here).

**I-8 — plan:202 — `aria-controls` → "the rail's id", but the rail has no id and the plan never names one.**
`client/src/components/SideRail.tsx:38` renders `<nav className="rail" aria-label="Sections">` with no `id`. The dashboard's shipped rail uses
`<nav id="rail-nav" …>` and the burger `aria-controls="rail-nav"` (`claude-agents-dashboard/client/src/components/SideRail.tsx`). Without a named id
the burger's `aria-controls` cannot be asserted in Task 4 Step 1 and two implementers would pick two ids.
→ Name it: `id="rail-nav"`, and add it to the Step 1 assertion list.

**I-9 — plan:207-208 — "Guides row shows `3`, tree rows `All projects 3`" puts two elements with text `3` under one assertion.**
With the fixture `alpha 2`, `beta 1`, the section row count and the `All projects` tree row both render `3`. `getByText('3')` throws on duplicates and
the plan gives no selector.
→ Give the structure the tests should query: e.g. `.rail-link[aria-current] .rail-count` for the section count and `.rail-sublink` rows read as
`textContent` (`All projects3` or with the separator the implementation uses). State the count element's class once in T4 "Produces" so T5/T7 do not
re-invent it.

## Minor (do not block)

**M-1 — plan:31 / 198 / 206 — `GUIDE MANAGER` as "wordmark text".** `test/side-rail.test.tsx:44` asserts `toContain('Manager')` on the `h1`, i.e.
today the DOM text is `Guide Manager` and uppercase would be CSS. The plan should say whether the DOM carries `GUIDE MANAGER` literally (then the
existing assertion changes) or `Guide Manager` with `text-transform` (then the test should not assert the uppercase form, since jsdom does not apply
it).

**M-2 — plan:178-232 — `SideRail.tsx:24-28` docblock goes stale.** It says narrowing belongs "in the Guides toolbar"; after T4 the rail owns scope.
Add "rewrite the SideRail docblock" to Task 4 Step 5 (the repo's comment density is an invariant in `CLAUDE.md` Conventions).

**M-3 — plan:166 — "whatever the current ids are".** They are known: `test/settings.test.ts:15` and `client/src/lib/settings.ts:18-24` list
`midnight graphite amber nightshift daylight`. Say so; the hedge invites the implementer to go look.

**M-4 — plan:342-347 — `settings-view.test.tsx` has more to retarget than Step 1 lists.** Lines 30-37 assert "three display rows and three reading
rows" under the old group names `Display · this device` / `Reading` (`SettingsView.tsx:69,132`), and `'Daylight Strip'` appears at 32 and 97. Step 1
covers the new headings and the `Daylight` click, which implies these, but naming the lines saves a round of failures.

**M-5 — plan:168 — the header comment should record the branch, not only the hash.** Dashboard `HEAD` `19aa2b2` is on `management-redesign`, not
`main`; a future reader checking the hash against `main` will not find it.

**M-6 — plan:291 — "re-measure the subtrahend".** Current value is `2 * var(--body-pad) - 62px` at `client/src/styles.css:425`; fine as a step, but
the plan could say what the 62 px was (viewer head height + gap) so the implementer knows what to re-measure.

**M-7 — plan:305-334 (Task 7) — no test is named for the drag / `PUT /api/favorites/order` guard.** Spec §5 says order and drag are unchanged;
`test/favorites-view.test.tsx:617` onward already covers it. Add "existing reorder cases pass unchanged" to Task 7 Step 1 so the retarget does not
drop them by accident.

**M-8 — plan:252 / 39 — `collapsedBays` removal.** `test/guides-view.test.tsx:232-270,390` drive bay fold via `aria-expanded` on `button.bay-h` and
read `guide-manager.collapsedBays`; plan:265 adds a "no read or write" spy, good. Also list the old cases to delete so the suite does not keep
asserting the attribute on a header that no longer folds.

**M-9 — plan:363 — `CLAUDE.md` edits.** Both targets exist as described (`CLAUDE.md:38-41` Layout entry, `:107` reset invariant). Consider also
amending the Favorites bullet that says the favorites view groups "into per-project bays" if T7 drops the bay header count (spec:73).

## Things checked and found correct (for the record)

- Dashboard Daylight defines no `--amber`; plan:143-144's handling is right.
- Magenta ink values and all six contrast ratios match the spec to two decimals.
- `useGuides` 300 ms coalesced refetch (`client/src/hooks/useGuides.ts:80`) and `GuidesView`'s refetch-on-back are the mechanisms T6 names.
- `resetGuide` order (`DELETE` → `refetch()` → `setResetNonce`, `GuidesView.tsx:338-350`) is preserved by T6; the three reset tests at
  `test/guides-view.test.tsx:531-580` query by `/reset|sure/i`, which still matches the plan's `Reset` / `Sure?` copy.
- Deep-link consumption (`GuidesView.tsx:258-292`) is untouched by the plan and `test/favorites-deeplink.test.tsx:134-217` keeps passing in meaning.
- `font-scale-css.test.ts` pins (`:root {\n  --body-pad` before `[data-density="compact"] {`, every viewport unit divided by `var(--font-scale`) are
  honoured by T3's "must pass unchanged" and the `:root` block at `styles.css:35-52` is where the plan says it is.
- `theme-tokens.test.ts`'s block regex requires the five `[data-theme]` blocks in the existing order with `:root,` prefix on midnight; T3 keeps it.
