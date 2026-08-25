---
id: task-7
title: Guides toolbar: search, filter, sort
created: 2026-08-24
---

## Goal

One toolbar row above the bays — search input plus three selects (project,
type, sort) — per the approved mockups
(https://claude.ai/code/artifact/1e702456-4239-4fb4-bdfd-8e91a6beb26e). Search
matches titles only (never content). Depends on task-4 (bays), task-5 (fold
state to auto-expand), task-6 (createdAt to sort by).

## Plan

1. `GuidesView.tsx` bar gains, in order: search input, project select, type
   select, sort select. All filtering/sorting is client-side over the fetched
   index — no server or vite.config.ts proxy change (the invariant list is
   untouched because no new asset path appears).
2. Search: case-insensitive substring over `guide.title`. Plain `useState` —
   deliberately not persisted; a remembered query would look like a broken
   board next visit.
3. Project select: "All projects" + one option per registered project (label
   name, value path). Persisted as `usePersistedState('guide-manager.project',
   'all')` — the same key the drawer used, values compatible. Port the old
   fail-open: a stored path no longer in the index reads as "all", so a stale
   scope can never blank the board silently.
4. Type select: All / study / tutor, persisted `'guide-manager.filterType'`.
5. Sort select, persisted `'guide-manager.sort'`, applied WITHIN each bay
   (bays themselves stay in index order):
   - `created` (default): createdAt desc — newest first;
   - `name`: title asc via localeCompare;
   - `type`: study before tutor, title asc inside each.
6. Composition: project narrows to one bay (its header stays — it is the name
   on screen); search/type hide non-matching cards and any bay left empty. Two
   distinct empty states: "nothing registered yet" (empty index) vs "no
   matches" (filters ate everything, offer nothing else).
7. Auto-expand: while the query is non-empty, a collapsed bay containing a
   match renders expanded — derived at render time, the stored
   `collapsedBays` value untouched (see the pointer left by task-5).
8. Styling per mockup: steel wells, hairline borders, mono 10px; native
   `<select>` elements styled like the removed `.guides-scope`. The row wraps
   on phone widths.

## Test cases

- jsdom: search narrows cards, hides emptied bays, auto-expands a collapsed
  bay with a match, and leaves stored fold state unchanged.
- Type filter and project select narrow correctly; stale stored project path
  falls open to All.
- Sort orders within a bay for all three keys (createdAt desc, name asc, type
  study-first).
- Search + filter + sort composed together produce the intersection, sorted.
- Persistence round-trips for project, type, sort; search resets on remount.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

All three controls compose correctly, the empty states are distinguishable,
phone layout wraps, and tests and typecheck pass.

## Outcome

2026-08-24 — done, on branch `worktree-task-7-guides-toolbar`, **uncommitted**.
Five files: `client/src/components/guides/GuidesView.tsx`,
`client/src/styles.css`, `test/guides-view.test.tsx`,
`test/app-projects.test.tsx`, `CLAUDE.md`.

The bar now holds `.guides-tools` — a search `<input type="search">` and three
native `<select>`s (Project, Type, Sort), in that order, each named by an
`aria-label` rather than a visible caption. Everything they do is a pass over
the already-fetched index inside `GuidesView`: no route answers the toolbar, so
`vite.config.ts`'s proxy list is untouched, exactly as the plan required.

Filtering composes as an intersection — `matches()` is one predicate over type
and title — and the survivors are sorted per bay by `sortGuides()`, never across
bays, so the board's own order stays the registry's. `createdAt` is compared as
a string rather than through `Date.parse`: `bin/register.js` writes it with
`toISOString()` and the API fills a legacy entry's gap from `updated`, written
the same way, so lexicographic order *is* chronological order — and an
unparseable value sorts predictably instead of turning into `NaN` and leaving
the comparator inconsistent.

The auto-expand landed exactly where task-5's pointer said it would:
`open = !collapsedBays.includes(p.path) || needle !== ''`, derived at render
with the stored fold untouched, so clearing the query drops each bay straight
back to what it was folded to. Bays the filters empty are dropped whole, header
and all, which is what makes that line safe — every bay still on the board holds
a match, so a non-empty query is on its own enough to open this one.

Four deviations / decisions worth recording:

- **`test/app-projects.test.tsx`'s "ignores a remembered project scope without
  clearing it" is now "honours a project scope remembered from the removed
  drawer".** That test asserted the *interim* behaviour, and its own comment said
  so: the drawer's key was left in localStorage precisely because this task was
  going to read it again. Inverting it is the test that the promise was kept.
  `renderApp()` grew a `settled` parameter, because a board that starts narrowed
  no longer has 'Alpha Guide' on it to wait for.
- **The shared fixture gained a third guide** (`Omega Notes`, study, createdAt
  between the other two) and the two existing `createdAt`s were spread apart.
  With the old fixture all three sort keys produced the same order, so a sort
  test would have passed on a board that was not sorting at all.
- **`.guides-tools` is `align-items:stretch`, not `center`.** Rendered, an input
  and a select do not resolve the same height from the same padding and font —
  the search box came out 21px against the selects' 23px, which on a 23px
  instrument row reads as one control sitting wrong. Stretch levels each flex
  line and keeps doing so if the padding is ever touched.
- **`.guides-select` is capped at `max-width:190px`** (lifted inside the phone
  breakpoint, where the flex basis owns the width). A `<select>` sizes itself to
  its widest option, so without the cap one project directory named after a long
  branch sets the width of the whole toolbar.

Checked in a browser against the real stylesheet at 1280, 820 and 375px. The row
sits at the far end of the bar on desktop and tablet with nothing truncated; at
375px it wraps to its own full-width line — search on one row, the three selects
sharing the next. There, "All projects" and "Newest first" lose two or three
characters to the UA's ellipsis. Left that way deliberately: an attempt to buy
them back with tighter tracking and padding gained exactly one character, and the
alternatives are a third row of controls on the screen with the least vertical
room, or labels shortened until "All projects" reads as a category rather than as
the current value. Focus is the cyan rule (`rgb(85, 208, 221)` measured on the
focused input, UA outline off), and the daylight palette was checked too.

Verification:

```
$ pnpm run typecheck
$ tsc --noEmit
                                    (no output, exit 0)

$ pnpm test
Test Suites: 23 passed, 23 total
Tests:       198 passed, 198 total
Snapshots:   0 total
Time:        21.803 s
Ran all test suites.

$ pnpm run build
dist/assets/index-uYgWa94m.css      20.92 kB │ gzip:  4.35 kB
dist/assets/GuidesView-gUMkY8vl.js   4.40 kB │ gzip:  1.56 kB
dist/assets/index-5C5nAHl3.js      146.81 kB │ gzip: 47.63 kB
✓ built in 1.37s
```

Baseline before the change was 23 suites / 183 tests; the 15 new ones are the
toolbar's.
