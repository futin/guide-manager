---
id: task-13
title: Favorites: keep a piece of a guide
created: 2026-09-08
tags: product, client, server, assets
---

## Goal

Let the reader cut a block out of any framed guide — a table, a diagram, a
code excerpt, a paragraph, a whole card — into a Favorites tab of their own,
with a note saying why, project bays, manual order, and a link back to the
exact card or heading it came from.

The motivating case: the pronoun table in *Personalpronomen: Akkusativ und
Dativ* is the whole memorisation burden of that topic, and today reaching it
means remembering which project, which deck, which card, then paging there.
The reader's own study material is scattered through the guides that happened
to introduce it.

## Plan

Design: [`docs/superpowers/specs/2026-09-08-favorites-design.md`](../../../docs/superpowers/specs/2026-09-08-favorites-design.md)
Plan: [`docs/superpowers/plans/2026-09-08-favorites.md`](../../../docs/superpowers/plans/2026-09-08-favorites.md)

Both are committed on `main`. Nine tasks, in dependency order: the favorites
API (Nest module, Mongo collection `favorites`, 1 MB JSON body parser); the
`/guide?at=` jump target riding the progress context so `progress.js`'s own
restore walks to it; the served `assets/favorites.js` spliced by `GET /asset`
like the reporter; the block picker inside the frame; capture — anchor, crumb,
snapshot, save panel; the Favorites rail section with project bays, search and
open-in-guide links; the render-time sanitiser and snapshot stylesheet; card
controls — inline title/note edit, ↑ ↓ ⤒ and drag reorder, two-tap delete;
docs and the whole-stack walk-through.

**Execute with `superpowers:subagent-driven-development`**, not inline:

- Work on a branch off `main` (`feat/favorites` already exists holding only the
  two docs commits, now merged — reuse it or branch fresh).
- One fresh subagent per plan task, in order; each implementer reads the spec
  and the plan and gets only its own task's text plus the plan's *Global
  Constraints* and *Test fixtures* sections.
- Two-stage review between tasks: spec compliance first, then code quality.
  **Every review dispatch says: write the full report to a file under the
  session scratchpad and return only the verdict plus Critical/Important
  findings, one line each** — paste that contract into the prompt, or the
  reviewer template's "your final message is the report" wins and the
  orchestrating context fills with reviewer prose.
- The plan deliberately hands over behaviour, signatures and exact expected
  values, never literal code; implementers write the code and are expected to
  push back where the code on disk disagrees with the plan.
- Never commit on `main`; `superpowers:finishing-a-development-branch` decides
  the integration at the end. Do not push or open a PR from inside the run.

## Test cases

The plan lists the exact cases per task. The ones that gate the feature:

- `test/favorites.test.ts` — POST lands on top of its project; title defaults
  crumb → text → `Untitled`; `400` without `guidePath`/`html`; `413` over
  512 KB (proves the 1 MB parser is applied); truncations; malformed anchor →
  `null` and the write succeeds; PATCH title/note only; PUT order rewrites
  `order = index`, unknown id → `400` with nothing written; DELETE idempotent.
- `test/progress-reporter-jump.test.ts` — `jumpTo` beats the stored position
  for deck and doc; a jump to card one moves and announces nothing; a parked
  jump reads `opening your favorite — answer this`; a missing doc anchor falls
  back to the ordinary resume.
- `test/favorites-inject.test.ts`, `test/vite-proxy.test.ts` (expected list
  gains `/favorites.js`), `test/render.e2e.test.ts`, `test/assets.e2e.test.ts`.
- `test/favorites-capture.test.ts` — innermost-block candidate; `wider` stops
  at the card / section; heading group range; `<nav>` never a candidate; a tap
  on a quiz option picks and does not answer; a tap on Next passes through;
  deck anchor `{kind:'deck', cardIndex, sectionId, cardOffset}` and crumb
  `[eyebrow, h2]`; doc anchor from the nearest id'd heading; the exact POST
  body; failure keeps the panel and its text; mount in the parent `.crumbs`,
  floating fallback, no-op without the blob, second load returns early.
- `test/sanitize.test.ts`, `test/favorites-view.test.tsx` — bays in order,
  search over title/note/text/crumb, reorder sends the bay's full id list and
  applies optimistically, controls hidden under a search, two-tap delete,
  inline edits → PATCH bodies, quiz reveal, link href carries `p` and `at`.
- `test/side-rail.test.tsx`, `test/app-landing.test.tsx`,
  `test/settings-view.test.tsx`, `test/settings.test.ts` — the third section.

## Done when

- `pnpm test`, `pnpm run typecheck` and `pnpm run build` are green.
- Walked once by hand against a real registered deck on the running stack
  (`docker compose restart client` after the `vite.config.ts` proxy entry):
  `☆` in the crumbs line; picking the pronoun table labels `table · 9 rows`;
  saved with a note; it appears in the Favorites tab under its project; `↓`
  moves it; the crumb link opens the deck on that card with `opened at your
  favorite` in the header; `✕` twice removes it. Recorded in the commit body.
- `CLAUDE.md` carries the five invariants from the spec's *Invariants to
  record* section; `README.md`'s architecture names the favorites module, the
  third served script and the Favorites tab.
- The branch is integrated via `superpowers:finishing-a-development-branch`,
  and this file moves to `tasks/done/`.
