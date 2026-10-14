# Plan re-check: UI redesign — review 1 fixes

Scope: only the hunks in `plan-review1.diff` (plan lines 33-34, 83-85, 95-96, 138-140, 148-152, 174, 210, 215-218, 222, 233-234, 237, 276-279, 339).
Plan: `docs/superpowers/plans/2026-10-14-ui-redesign.md`. Spec: `docs/superpowers/specs/2026-10-14-ui-redesign-design.md`.

## Verdict

**APPROVE WITH FIXES** — one Important finding (two date fixtures break the plan's own timezone rule); everything else in the diff checks out against the code.

## Verified (no finding)

| Plan line | Claim | Evidence |
|---|---|---|
| 33 | `Search titles` placeholder, `aria-label` stays `Search guides`; `Search favorites` both | `client/src/components/guides/GuidesView.tsx:488-489`, `FavoritesView.tsx:190-191`; spec:138 names only the placeholder |
| 84 | `bin/register.js` writes `updated` as full ISO | `bin/register.js:43` `guide.updated = now` (ISO timestamp) |
| 85 | `jest.config.ts` sets no timezone | file read: no `TZ`/`timezone`/`globalSetup` |
| 95-96 | `series.test.ts` has a `g(path)` factory | `test/series.test.ts:60` |
| 138-140 | four `@fontsource/barlow*` imports, plex-mono kept, "no external hosts" comment; deps in `package.json` | `client/src/main.tsx:4-12`; `package.json:25-27`; `shared/theme.css:34` `--mono` is IBM Plex Mono; spec:307 Out of scope |
| 148 | artifact `XBMon4GJEdzip9WrojZYAj` holds `project/tokens.json`; dashboard repo has no `project/` | Artifact file listing (33 files, `project/tokens.json` 15 012 B); `ls ../claude-agents-dashboard/project` → no such file |
| 149-152 | dark role tokens as `color-mix()`/`var()` at `:46-61`; tints .18 / .11 / .13; fills oklab 70 % / 45 % over `--strip`; Daylight has no `--amber` | `../claude-agents-dashboard/client/src/styles.css:46-47,50,52,56,60-61`; Daylight block `:124-140` defines no `--amber` |
| 174 | `test/settings.test.ts:15` asserts the five ids | confirmed |
| 210 | rail `id="rail-nav"`, ☰ `aria-controls="rail-nav"` as the dashboard's | `../claude-agents-dashboard/client/src/components/SideRail.tsx:259,267` |
| 215-216 | existing `toContain('Manager')` | `test/side-rail.test.tsx:44` |
| 233-234 | `loading…` only at `guides-view:78`, `guides-series:100`, `favorites-deeplink:179,187`; none in `app-landing` | `grep -rn 'loading…' test/` (the `favorites-view:187` hit is a comment) |
| 237 | `SideRail` docblock places scope in the Guides toolbar | `client/src/components/SideRail.tsx:27-28` |
| 278-279 | fixture: lesson 1 completed at 100, lesson 2 furthest 40, lesson 3 `null` → `2 started` | `test/guides-series.test.tsx:45-62`; spec:149 defines *started* |

## Findings

### Important

**[I] plan:83-85 — two `shortDate` fixtures sit inside the 12 h window the same bullet forbids.** `'2026-01-03'` (line 83) parses as UTC midnight,
so on any host west of UTC (`TZ=America/*`) local time is Jan 2 and the expected `'Jan 3'` fails; `'2026-08-24T20:16:36.844Z'` (line 84) is 3 h 44 m
before the UTC day boundary, so on any host at UTC+4 or further east it renders `Aug 25`. Line 85 states the rule ("no input may sit within 12 h of a
day boundary") and both inputs break it; `jest.config.ts` sets no `TZ`, and the Produces block (line 69) says "in local time". → Keep the millisecond
shape `register.js` writes but centre it: `'2026-08-24T12:00:00.844Z'` → `'Aug 24'`. For the date-only case either state the behaviour the test pins
(a date-only value is a calendar date and is formatted without a timezone shift — then `'Jan 3'` holds everywhere) or drop the case; as written it
pins the host's timezone, not the helper.

### Minor

- plan:276-277 — the cited lines are approximate: the three bay-fold cases are `test/guides-view.test.tsx:230-272` and the "opens a folded bay that
  holds a match" case is `:379-394` (line 390 is one assertion inside it). The `:204-207` case "gives every bay header its own cyan tick"
  (`.bay-h .bay-tick`) also dies with the bays and is not listed.
- plan:339 — "`:617` onward" covers only the drag-drop case ("drops f3 onto f1"); the button reorder cases are `test/favorites-view.test.tsx:440`
  ("disables f1's Move up / Move to top …") and `:493` ("hides every reorder control …"). Cite all three.
- plan:151 — "Daylight takes the shipped overrides' literals": the dashboard's Daylight block still writes `--amber-tint` / `--mustard-tint` as
  `color-mix()` (`../claude-agents-dashboard/client/src/styles.css:136-137`). Say they resolve under the same rule to `rgba(196,118,31,.11)` /
  `rgba(154,135,18,.13)`.
- plan:217-218 — `.rail-count` and `.rail-sublink` are consumed by the test but appear nowhere in Task 4's Produces, while Task 3 (plan:158-160) asks
  each later task to name the classes it relies on; `.rail-count` has no dashboard precedent (only `.rail-sublink` does, `styles.css:299-302`). Add
  both to Task 4's Produces list.
- plan:215 — "the DOM text stays `Guide Manager`": today it is `Guide<br/>Manager` (`client/src/components/SideRail.tsx:34-38`, textContent
  `GuideManager`). `toContain('Manager')` holds either way; "becomes" is the accurate verb.

## Checklist walk

1. Coverage — the hunks add no new spec sections; the subtitle/`started` definition (spec:149), dates (spec:162), rail ids (spec:97-111), font
   source (spec:65, 307) each map to the tasks they already lived in.
2. Values — every copy string in the hunks matches the spec or the existing code; the only wrong expected values are the two date fixtures above.
3. Reality — every path, line number and name was grepped; see the table. Approximate line ranges noted as Minor.
4. Interfaces — `.rail-count` / `.rail-sublink` consumed without a Produces entry (Minor; same task produces them).
5. Order — unchanged by the diff.
6. Tests — the date cases would pass or fail by host timezone, which is the Important finding; the rest pin behaviour.
7. Conventions — behaviour-not-code and soft budgets are kept throughout the hunks.
