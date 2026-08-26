---
id: idea-3
title: register.js discover mode for hand-placed guides
created: 2026-08-26
---

## Problem

`bin/register.js` is the registry's only writer, and today it is only ever
invoked at the tail of a `/tutor` or `/study` session that just wrote a file —
one `--guide`, one `--title`, per run. Anything that arrives at its path by
another route is invisible on the board until someone types two absolute paths
by hand: a deck moved into a series directory after the fact, a build copied
from another checkout, a guide generated before the project was registered.

Hit for real on 2026-08-26: two decks hand-placed into
`claude-agents-dashboard/docs/guides/tutor/write-paths/` (`write-paths-1-deck.html`,
`write-paths-2-spawn-deck.html`) had the correct series shape on disk and still
did not appear, because nothing scans. Registering them meant two long
command lines. The skills cannot cover this case on their own — a session that
wrote nothing has nothing to register, and neither skill has a repair step.

## Rough shape

`node bin/register.js --discover <dir> --project <abs>`: walk the tree, find the
generated `.html` builds, and upsert each one through the existing
`upsertGuide` — never a second write path, so the single-writer invariant
survives intact. Title comes from each file's own `<title>`, which both
generators already write. Print one line per file: added, already registered,
or skipped and why.

Series membership needs nothing at all here: `client/src/lib/series.ts` derives
it from the path (`<dir>/<dir>-N-<desc>.html`), so a discovered deck shelves
exactly like a generated one.

A `--dry-run` that prints the plan without saving is worth having for the same
reason `--remove` throws on a miss: the registry is small, hand-auditable, and
mistakes in it are cheap to prevent and annoying to unpick.

## Open questions

- **Type inference.** `--type` is per-guide today, and `docs/guides/` holds both
  kinds. Infer from the path segment (`.../study/...` vs `.../tutor/...`)? From
  the deck's provenance `<script type="application/json">` stamp, which only
  tutor decks carry? Or require `--type` and make the caller sweep one subtree
  at a time?
- **Title fallback** when a build has no `<title>`, or has a generic one. Fall
  back to the filename slug, or skip the file and say so?
- **Which files count.** A study guide is a directory whose `index.html` is the
  build; a tutor deck is a lone file. A naive walk registers every `index.html`
  *and* every chapter page beside it. Probably: `index.html` for a directory
  guide, and for tutor, files matching the deck naming — needs pinning down.
- **Stale entries.** Should `--discover` also drop registry rows whose file no
  longer exists, or is that a separate `--prune`? Coupling them means a sweep of
  one subtree could delete rows for guides that live elsewhere.
- Recursion depth, and whether to refuse a `<dir>` outside `GM_GUIDE_ROOT` (the
  container mounts only that tree, so a guide outside it registers fine and then
  silently drops off the list).
