---
id: task-11
title: Guides board: series shelf grouping
created: 2026-08-26
---

## Goal

Connected tutor lessons read as one set on the Guides board. Design A ("Series
shelf") from the design artifact "Series on the Board", picked 2026-08-26: a
series gets its own foldable sub-group inside the project bay — magenta left
spine, sub-header with series name / lesson count / segmented progress strip,
lessons ordered by N with a step badge. Standalone guides stay loose in the bay.

## Plan

Series is derived from the path, never stored — companion of task-10's
convention `docs/guides/tutor/<series>/<series>-N-<desc>.html`.

1. `client/src/lib/series.ts` (new): pure derivation. A guide belongs to a
   series iff its filename matches `^(.+)-(\d+)-.+\.html?$` AND its parent
   directory name equals capture 1 — the dir-name match is what keeps an
   ordinary `foo-2-bar.html` sitting anywhere else out. Returns
   `{ series, order }` or null. Grouping helper: partition one bay's guides
   into `{ shelves: Map<series, GuideEntry[]>, loose: GuideEntry[] }`, shelf
   lessons always sorted by `order` (series order beats the sort select inside
   a shelf; the select keeps ordering loose cards and shelf-vs-card placement).
2. `GuidesView.tsx`: render shelves above loose cards inside each open bay.
   Shelf header: `series` tag, name, `N lessons` count, segmented progress
   strip (one cell per lesson, cell filled to that lesson's
   `furthestPercent`), caret. Card footer gains `N/total` step badge for
   shelf cards only.
3. Fold state: shelves fold like bays. Persist as `guide-manager.foldedSeries`
   (same shape as folded bays: array of keys, key = `<projectPath>::<series>`),
   self-cleaning the same way. A running query forces shelves open exactly as
   it forces bays open.
4. Filters/search apply per lesson; a shelf emptied by filters drops whole,
   header included (same rule as emptied bays). A shelf never renders for a
   single orphan lesson — one lesson matching the pattern with no siblings on
   the board still shows as a shelf of 1 (simplest honest rendering; revisit
   only if it looks noisy).
5. `styles.css`: `.shelf` block per mockup — 2px magenta left border, dashed
   sub-rule under the header, seg strip; density variables reused so
   `[data-density="compact"]` keeps working.
6. Tests (jsdom, flat in `test/`): series derivation table test (matches,
   near-misses: dir-name mismatch, no number, non-html); grouping test;
   GuidesView render test — shelf order by N regardless of sort select,
   emptied-shelf drop, fold persistence key shape.

Future-proofing only, not built: track layer (`<track>/1-<series>/…`) would
nest one more fold; derivation stays in `series.ts` so the depth rule lands in
one file.

## Test cases

- `mongo-internals/mongo-internals-2-indexes.html` → `{series:'mongo-internals', order:2}`.
- `other-dir/mongo-internals-2-indexes.html` → null (parent-dir mismatch).
- `docs/guides/tutor/foo-deck.html` → null.
- Bay with 3-lesson series + 2 loose guides renders one shelf (3 ordered cards,
  step badges 1/3..3/3, 3-cell seg strip) + 2 loose cards.
- Sort select "name" reorders loose cards, shelf stays 1..N.
- Type filter "study" drops the all-tutor shelf whole.
- Folding a shelf persists across remount; stale keys ignored.

## Done when

`pnpm test` and `pnpm run typecheck` pass; a registered series renders as a
foldable shelf with ordered, step-badged cards and segmented progress; loose
guides and single-file decks render exactly as today.

## Outcome

2026-08-26 — Done, on branch tutor-lesson-series. `client/src/lib/series.ts`
(new) derives series membership: filename must start with the parent
directory's own name then `-N-`, extension `.html?` case-insensitive; shelves
key on the directory path, lessons sort by N with path tiebreak; shelf-of-1
kept. GuidesView partitions each bay pre-filter (badges + seg strip describe
the full series), filters per lesson, drops emptied shelves whole, renders
shelves above the loose grid with a foldable header (persisted as
`guide-manager.foldedSeries`, forced open by a query, spine dimmed when
folded); cards on a shelf get an `N/total` step badge; bay count sums shelf
`shown` + loose. styles.css gained the `.shelf*` block (magenta spine, dashed
sub-rule, per-lesson segment strip) and `.guides-card-step`. Tests:
`test/series.test.ts` (derivation table + partition), `test/guides-series.test.tsx`
(order under every sort, badges vs filter, emptied-shelf drop, fold persistence,
query force-open, seg fills, viewer open). Existing guides-view.test.tsx
untouched and passing — loose rendering unchanged.

Verification:

    $ pnpm run typecheck
    $ tsc --noEmit            (no errors)

    $ pnpm test
    Test Suites: 33 passed, 33 total
    Tests:       348 passed, 348 total
    Snapshots:   0 total
    Time:        65.99 s
    Ran all test suites.
