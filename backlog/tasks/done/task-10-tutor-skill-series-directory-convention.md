---
id: task-10
title: Tutor skill: series directory convention
created: 2026-08-26
---

## Goal

A lesson series gets its own directory instead of loose files: decks live at
`docs/guides/tutor/<series>/<series>-N-<desc>.html`, where N is the suggested
reading order (not mandatory — no gating, no progress coupling). Standalone
decks keep the current `docs/guides/tutor/<topic>-deck.html` default. Decided
2026-08-26 (design artifact "Series on the Board"): series/order stay derivable
from the path alone, so the registry, register.js, and the API never change.

## Plan

1. `skills/tutor/SKILL.md` — "Lesson series" section: replace the flat slug
   convention (`<topic>-1-<sub>`, files beside each other) with the directory
   convention: series dir `docs/guides/tutor/<series>/`, each lesson
   `<series>-N-<desc>.html`. State explicitly that N is suggested order only.
2. `skills/tutor/SKILL.md` — Session flow step 3 (deck location default): when
   the lesson being run is part of a proposed series, the default path is
   `docs/guides/tutor/<series>/<series>-N-<desc>.html`; standalone default
   unchanged. The existing mkdir-parent-chain carve-out already covers creating
   the series directory — verify wording still reads correctly, adjust if it
   names `docs/guides/tutor/` as the deepest level.
3. `skills/tutor/references/deck.md` — §5 cross-links, series question: update
   the next-lesson naming pattern (`<topic>-2-<sub>` follows `<topic>-1-<sub>`)
   to the new `<series>-(N+1)-<desc>` form; "same directory as the current
   deck" already holds, keep it.
4. Sweep both files for any other literal of the old series slug pattern.
5. Registration section: no change needed (register.js accepts any .html path);
   confirm, don't edit.
6. Check `skills/tutor/tests/scenarios.md` for a series scenario that pins the
   old naming; update if present.

Future-proofing (documented in the design artifact, NOT built now): a track
layer nests one more directory — `docs/guides/tutor/<track>/1-<series>/…`.
Nothing in this task may contradict that shape.

## Test cases

- Read SKILL.md as a fresh session would: series proposal step yields per-lesson
  paths under one `docs/guides/tutor/<series>/` dir with N-numbered filenames.
- deck.md §5: next-lesson link resolution against the new pattern — lesson 2's
  recap links `<series>-3-<desc>.html` in the same dir when it exists, names it
  unlinked when it doesn't.
- No remaining `<topic>-1-<sub>`-style literals: grep the skill tree.

## Done when

Both skill files describe only the directory convention, the standalone default
is untouched, and a dry-run reading of the series flow produces paths matching
`docs/guides/tutor/<series>/<series>-N-<desc>.html`.

## Outcome

2026-08-26 — Done. SKILL.md "Lesson series" now defines the directory convention
(`docs/guides/tutor/<series>/<series>-N-<desc>.html`, N = suggested order only),
Session flow step 3's deck-location default gained the series case and the mkdir
carve-out now names the series directory in the parent chain, and deck.md §5's
next-lesson link pattern reads `<series>-2-<desc>.html` follows
`<series>-1-<desc>.html`. Registration section untouched (register.js accepts any
.html path — confirmed, no edit). tests/scenarios.md, baseline-notes.md, README.md
carry no series literals (grep clean). Old-slug sweep:

    $ grep -rn "topic>-1\|topic>-2\|<sub>" skills/tutor/
    skills/tutor/docs/plan.md:115:5. **Lesson series** — ... (`<topic>-1-<sub>`…) ...
    skills/tutor/docs/design.md:122:its own slug (`<topic>-1-<sub>`, `<topic>-2-<sub>`, …) ...

Only hits are docs/plan.md and docs/design.md — the skill's historical design
records, deliberately left as written; the live instruction files (SKILL.md,
references/deck.md) are clean.
