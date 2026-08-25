---
id: task-8
title: Settings: density, text size, opens on
created: 2026-08-24
---

## Goal

Port the dashboard's three settings rows into this app: Density
(comfortable/compact), Text size (font scale), Opens on (landing section).
Source of shape: ../claude-agents-dashboard `client/src/lib/settings.ts`,
`useSettings.tsx`, `SettingsView.tsx`. Shell-only — rendered guide pages and
the bionic contract are untouched. Independent of the board tasks.

## Plan

1. `client/src/lib/settings.ts`: add flat fields (the file's own FLAT warning
   applies) — `density: 'comfortable' | 'compact'` default comfortable;
   `fontScale: number` default 100, LIMITS 80–130, stops `FONT_SCALES = [90,
   100, 110, 120]`; `landing: 'last' | 'guides' | 'settings'` default 'last'.
   Extend `clampSettings` with pickOne/clampInt so each falls back
   independently.
2. `client/src/hooks/useSettings.tsx`: the theme effect also stamps
   `root.dataset.density` and sets `--font-scale` to `fontScale / 100`.
3. `client/index.html` pre-paint script: stamp density and `--font-scale`
   alongside theme — a scaled device flashing 100% is the same flash the theme
   stamp exists to prevent.
4. `client/src/styles.css`:
   - `.shell { zoom: var(--font-scale, 1) }` ported from the dashboard.
   - Restore the viewport divisions the header comment (styles.css:9-14) says
     were deliberately dropped: with `zoom`, `100vh` resolves against the
     unzoomed viewport, so `.rail`'s `height: 100vh` becomes
     `calc(100vh / var(--font-scale, 1))` and the `.wrap.wide` height calc
     likewise. Audit every vh use in the file.
   - One `[data-density="compact"]` block: tighten `--body-pad`, `.guides-card`
     padding, grid gap, bay gaps.
5. `client/src/components/settings/SettingsView.tsx`, Display group: Density
   segmented (Comfortable / Compact), Text size segmented (90/100/110/120%),
   Opens on native select — "Last used" / "Guides" / "Settings" — with
   hints adapted from the dashboard's wording.
6. `client/src/App.tsx`: when `settings.landing !== 'last'`, the landing value
   overrides the *initial* section only; the persisted
   `guide-manager.section` keeps recording changes so 'last' keeps working
   when switched back. SettingsProvider already wraps AppShell, so settings
   are readable at first render.

## Test cases

- Unit: `clampSettings` — bad density / fontScale / landing each fall back
  alone without discarding the rest.
- jsdom: density attribute and `--font-scale` land on the root; changing rows
  in SettingsView updates storage.
- jsdom: landing 'guides' overrides a stored section of 'settings' at mount;
  landing 'last' respects the stored section.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

Compact visibly tightens the board; 120% scales without the rail or viewer
overflowing (vh divisions verified at 1280px and phone widths); the landing
choice is honored on reload; tests and typecheck pass.

## Outcome

2026-08-24 — Done, in worktree `.claude/worktrees/task-8-settings-display`
(branch `worktree-task-8-settings-display`). All six plan steps landed as
written, and the compact block ended up covering everything the plan named,
including the "bay gaps" that had no code when this was groomed. Tasks 4, 5 and
7 landed on main while this was in flight, so the branch was rebased onto them
twice; the second rebase is what gave `.bay` and `.guides-grid` real rules to
tighten. Seven spacing tokens now carry it — `--body-pad`, `--card-pad`,
`--card-gap`, `--card-inner-gap`, `--bay-gap`, `--group-gap`, `--set-pad` — and
nothing else moves under compact. task-4 anticipated this: its `.guides-card`
comment says every padding and gap the card has lives in that one rule so
task-8's override could be a single block, and it is.

Two things the plan did not call out but the work forced:

- `test/settings-view.test.tsx` asserted Density and Landing were *absent* — the
  deliberate opposite decision, recorded when the dashboard's rows were cut. That
  assertion now lists only the rows still absent (the ones backed by a server
  this app does not have), with a comment saying task-8 reversed the rest.
- The viewport-division rule the plan's step 4 restores is invisible to jsdom,
  which does not lay out and never applies `zoom`. `test/font-scale-css.test.ts`
  reads the stylesheet as text and rejects any viewport unit that is neither
  divided by `--font-scale` nor named in its EXEMPT list with a reason — `body`
  is the one exemption, since it is the zoomed element's parent. The guard was
  mutation-checked: appending `.bogus-probe { height: 50vh }` fails it, and the
  failure names the offending line.

Verification, on the rebased commit that actually merged — `pnpm run typecheck`
(exit 0), `pnpm test`, `pnpm run build` (exit 0):

```
Test Suites: 25 passed, 25 total
Tests:       218 passed, 218 total
Snapshots:   0 total
Time:        50.049 s
Ran all test suites.
```

Against main this adds two suites (`test/app-landing.test.tsx`,
`test/font-scale-css.test.ts`) and deletes none.

The rebases caught one thing no amount of local green would have: task-6 made
`createdAt` required on `GuideEntry`, and this branch's new test fixture
predated it — `TS2741: Property 'createdAt' is missing`. Typecheck found it the
moment the branch sat on current main, which is the argument for rebasing before
merging rather than after.

The "Done when" clauses that no test can prove were checked in a browser against
the live API, with a second Vite on port 5188 serving this worktree:

- **Compact visibly tightens the board.** Six cards in two bays at 1280px: card
  height 85.9px → 75.9px, grid gap 10px → 6px, bay gap 8px → 5px, and the board's
  content span 253px → 204px — 19% tighter. Measured on the bay board's content,
  NOT on `.guides`: at ≥1201px that element is `flex: 1` inside `.wrap.wide`, so
  its height tracks the container and *grows* by 20px under compact as
  `--body-pad` shrinks. A first measurement read that as compact making the board
  taller.
- **120% scales without the rail or viewer overflowing.** At 1280×800 the rail
  measures exactly 800px with zero vertical or horizontal overflow; forcing the
  undivided `height: 100vh` in the same page makes it 960px, a 160px overhang —
  which is the bug the division exists to prevent, reproduced and then fixed.
  At 375×812 the phone guide-viewer overlay measures exactly 375×812; undivided
  it is 450×974, hanging 75px past the right edge and 162px past the bottom.
- **The landing choice is honored on reload.** With `landing: 'settings'` and a
  remembered section of `"guides"`, a hard reload opened on Settings and left
  `guide-manager.section` still `"guides"` — the override pins the opening
  section without rewriting the memory of where the reader actually was.

Merged to main as a fast-forward after the second rebase; the worktree was
removed and the branch deleted.
