---
id: task-5
title: Collapsible bays
created: 2026-08-24
---

## Goal

Design B·1 from the volume round of the mockups
(https://claude.ai/code/artifact/1e702456-4239-4fb4-bdfd-8e91a6beb26e): a bay
header is a disclosure. Tapping folds the project down to its header row — name
and count still visible — and the fold state is remembered per device, so a
phone with many grown projects opens onto N short rows instead of a scroll
wall. Depends on task-4.

## Plan

1. `GuidesView.tsx`: the bay header becomes a `<button>` with `aria-expanded`
   and a caret that rotates like the old rail caret did. Collapsed bay renders
   the header only.
2. Fold state: `usePersistedState<string[]>('guide-manager.collapsedBays', [])`
   in GuidesView, storing project *paths* — the registry's own key; names
   collide across two checkouts of one repo. A stored path that is no longer
   registered simply never matches; no cleanup pass needed.
3. Collapsed styling per mockup: header keeps its rule, tick dims to
   `var(--ink3)`, caret points right (▸).
4. Leave a pointer for task-7: a non-empty search query must auto-expand bays
   containing matches (derived expansion — the stored fold state is not
   rewritten). Search does not exist yet, so only the comment lands here.

## Test cases

- jsdom: clicking a bay header hides its cards and flips `aria-expanded`;
  clicking again restores them.
- Fold state round-trips through localStorage (collapse, remount, still
  collapsed).
- A collapsed bay still shows its name and guide count.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

Fold state survives a reload; a board of N projects can be folded to N header
rows; tests and typecheck pass.

## Outcome

2026-08-24 — done, on branch `worktree-task-5-collapsible-bays`, **uncommitted**.

`.bay-h` is a `<button type="button">` carrying `aria-expanded`, with the caret
appended after `.bay-count` as an `aria-hidden` `<span class="bay-caret">▾</span>`.
The whole header row is the disclosure rather than a caret button beside the
name: on a phone the row is a comfortable tap target and an 8px glyph is not.
A folded bay unmounts its `.guides-grid` rather than hiding it with CSS — the
grid's DOM *is* the scroll wall being folded away, so keeping it would spend the
cost the fold exists to avoid.

Fold state is `usePersistedState<string[]>('guide-manager.collapsedBays', [])`
holding the folded project *paths*. Paths because the registry keys on them: two
checkouts of one repo register the same name twice and a name-keyed fold would
collapse both bays on one tap. It stores the folded set rather than the open one,
so a project registered after the state was written arrives open.

Three deviations from the plan as written:

- **The caret sits at the end of the row (`margin-left:auto`) at 10px, not
  trailing the count at the old `.rail-caret`'s 8px.** Rendered, 8px makes this
  glyph 4px wide — it read as a stray apostrophe the count had picked up
  ("2 guides ▸") rather than as a control, and left ~700px of a full-width button
  looking like dead header. Confirmed with the user against a rendered
  side-by-side before changing it. Direction is per plan: `rotate(-90deg)`, one
  glyph turned rather than two glyphs swapped, so the .15s transition still runs.
- **`.bay-h` needed a button reset** the plan did not call for — `font: inherit`
  and `color: inherit` above all, since the header's children now inherit from
  the button, and without them the UA's 13px system font beats `.bay-name`'s
  display face. Plus `width:100%` (the row *is* the tap target) and
  `text-align:left` (undoes the button default that would centre the row).
- **The collapsed rules are keyed off `[aria-expanded="false"]`**, not a class
  set alongside it — the attribute is already there and already correct, and a
  parallel class is one more thing that can end up disagreeing with what the
  assistive layer is told.

Step 4's task-7 pointer landed as a comment above `const open = ...` in the
`projects.map` body, where the derived-expansion change will have to go.

Verified in a browser at 375px against a static harness built from the real
compiled CSS (`client/dist/assets/index-*.css`), one open bay above three folded
ones. Folded rows collapse to a single header each, exactly the N-short-rows
outcome the goal asks for. The tick dims cyan → `--ink3` and the caret turns to
point right. Re-checked on `daylight`, since the collapsed styling leans entirely
on `--ink3`: the open tick is #136d78 teal and the folded one a warm grey, both
holding against the #e8e3d7 board. No console errors.

`pnpm test`:

```
Test Suites: 23 passed, 23 total
Tests:       183 passed, 183 total
Snapshots:   0 total
Time:        21.029 s
Ran all test suites.
```

178 tests at the branch point, 183 now. The five new jsdom cases cover the fold
round trip via `aria-expanded`, that folding one bay leaves its neighbours alone,
the localStorage round trip across a remount (asserting the stored value is
`['/p']` — the path, not the name), that a folded bay keeps its name, count and
tick, and that the caret is `aria-hidden`. `guides-view.test.tsx` gained a
`beforeEach` clearing localStorage; without it a bay folded by one test stays
folded for every test after it.

`pnpm run typecheck` — exit 0:

```
$ tsc --noEmit
```

`pnpm run build`:

```
dist/assets/GuidesView-Bv-KBO8a.js    2.70 kB │ gzip:  1.02 kB
dist/assets/SettingsView-aPuOIFe0.js  2.84 kB │ gzip:  1.12 kB
dist/assets/index-1goKyxNN.js       146.81 kB │ gzip: 47.62 kB
✓ built in 787ms
```

Not committed and not merged — three files are modified in the worktree
(`client/src/components/guides/GuidesView.tsx`, `client/src/styles.css`,
`test/guides-view.test.tsx`). Staging is the user's call.
