---
id: task-4
title: Bay board: card grid with promoted project headers
created: 2026-08-24
---

## Goal

Replace the single-column guide list with design B from the approved mockups
(https://claude.ai/code/artifact/1e702456-4239-4fb4-bdfd-8e91a6beb26e): one bay
per project, a responsive card grid inside each, and the bay header promoted
from the current faint 10.5px ink3 line to a real header — cyan tick, display-
font uppercase project name in full ink, mono guide count. The promoted header
IS the fix for "project names are almost not visible". Depends on task-3.

## Plan

1. `GuidesView.tsx`: rename the group markup to bays — `.bay` wrapping
   `.bay-h` (tick span + name + count "N guides" / "1 guide") and the grid.
   Headers render unconditionally: even a board filtered to one project later
   keeps its header, since the header is now the project's name on screen.
2. `styles.css`:
   - `.guides-list` becomes `.guides-grid`:
     `display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px`.
   - `.bay-h`: flex baseline row, `border-bottom:1px solid var(--hairline)`,
     padding-bottom 5px; `.bay-tick` 14×3px `var(--cyan)`; `.bay-name`
     display font 14px/700 uppercase `var(--ink)` letter-spacing .07em;
     `.bay-count` mono 9.5px `var(--ink3)`. Remove `.guides-group-h`.
3. `GuideCard`: flex column (the named-areas grid was for the row layout) —
   title on top, footer row pinned with `margin-top:auto` holding the type pill
   and the mono meta (date · read / NN%). Pill classes and read/part colors
   unchanged.
4. Keep every `.guides-card` padding/gap in one rule so task-8's
   `[data-density="compact"]` override is a single block later.
5. Spot-check midnight and daylight themes — the tick and header ink must hold
   on the light palette too.

## Test cases

- jsdom: bay header shows project name and correct count; cards show title,
  pill, date, and progress states (read / percent / absent).
- Existing GuidesView tests updated for the new class names.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

The board renders bays with promoted headers and card grids; a phone-width
viewport collapses each grid to one column; tests and typecheck pass.

## Outcome

2026-08-24 — done, on branch `worktree-task-4-bay-board`.

`GuidesView` renders one `.bay` per project: `.bay-h` holding an empty
`.bay-tick` span, `.bay-name`, and a `.bay-count` that says "N guides" or
"1 guide", above a `.guides-grid`. `GuideCard` became a flex column with the
pill and meta wrapped in `.guides-card-foot`, pinned by `margin-top:auto` —
without that wrapper the two could not be pushed to the bottom of a cell a
taller neighbour had stretched, which is every cell in a card grid.

Two deviations from the plan as written, both to make it work rather than to
change it:

- `.bay-tick` is `align-self:center`, alone among the header's children. An
  empty inline box takes its bottom margin edge as its baseline, so under the
  header's `align-items:baseline` the tick rendered *under* the name like a
  stray underscore instead of beside it.
- `.guides-card-foot .pill { flex: none }` was added. The pill is a flex item
  now rather than a grid area, and would otherwise shrink below its own text.

Spot-checked in the browser against the live registry at 1280px and 375px:
midnight shows the cyan tick and full-ink name against `--strip` cards;
daylight's `--cyan` (#136d78) and `--ink` (#231f1a) both hold on the light
board, and the hairline rule under the header stays visible. At 375px each
grid collapses to one column (220px floor against ~327px of content), and no
console errors.

`pnpm run typecheck` — exit 0:

```
$ tsc --noEmit
TYPECHECK_EXIT=0
```

`pnpm test`:

```
Test Suites: 23 passed, 23 total
Tests:       178 passed, 178 total
Snapshots:   0 total
Time:        21.545 s
Ran all test suites.
```

174 tests at the branch point, 178 now: four new jsdom cases cover the bay
count's singular/plural, the per-bay tick, the per-bay grid nesting, and the
card footer.

Committed as `3a9125c` and merged into `main` as `02d6f3f`, no conflicts. The
worktree at `.claude/worktrees/task-4-bay-board` was left on disk. Re-verified
on the merged main:

```
$ pnpm test
Test Suites: 23 passed, 23 total
Tests:       178 passed, 178 total

$ pnpm run build
dist/assets/barlow-condensed-latin-700-normal-v1xN8_Wq.woff2  22.44 kB
dist/assets/index-0MiiDE0x.css                                19.62 kB │ gzip: 4.06 kB
dist/assets/GuidesView-BzTCEXTr.js                             2.42 kB │ gzip: 0.89 kB
✓ built in 771ms
```

Worth noting from that build: Barlow Condensed 700 is now in the bundle, where
task-3's was not. `.bay-name` is the first thing in the shell to ask for the
display font at 700 — the section titles and the old group heading were both
600 — so the header renders in real Barlow Condensed Bold rather than a
browser-synthesised one. Anything later that wants a heavier display weight is
already paying for this face.
