---
id: task-13
title: Favorites: keep a piece of a guide
created: 2026-09-08
tags: product, client, server, assets
updated: 2026-09-08T20:03:02Z
started: 2026-09-08T11:11:28Z
execute-elapsed: 31894
execute-tokens: 5471782
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

## Outcome

2026-09-08 — Built, on `backlog/task-13`, uncommitted (the orchestrator run owns
the commit). All nine plan tasks executed with
`superpowers:subagent-driven-development`: one fresh implementer per task, a
task-scoped review after each, six fix rounds across Tasks 5, 6, 7, 8 and 9, then
a whole-branch review on the most capable model and one fix wave. The feature is
what the goal asked for: `☆` in the framed guide's crumbs line, a block picker
with `wider`/`narrower`, a save panel with a note, a `favorites` collection
behind `GET`/`POST`/`PATCH`/`PUT order`/`DELETE /api/favorites`, a Favorites rail
section with project bays, search, inline edits, `↑ ↓ ⤒` and drag reorder,
two-tap delete, and `/guide?p=…&at=<anchor>` opening the deck on the exact card
with `opened at your favorite` in the header.

**Verification — `pnpm test`, `pnpm run typecheck`, `pnpm run build`:**

```
Test Suites: 41 passed, 41 total
Tests:       547 passed, 547 total
Snapshots:   0 total
Time:        40.014 s, estimated 48 s
Ran all test suites.
=== TYPECHECK ===
$ tsc --noEmit
=== BUILD ===
dist/assets/index-eqTpCzEG.css                       25.90 kB │ gzip:   5.19 kB
dist/assets/SettingsView-D09zIlpB.js                 10.59 kB │ gzip:   1.84 kB
dist/assets/FavoritesView-DBDqY7WQ.js                15.54 kB │ gzip:   3.83 kB
dist/assets/GuidesView-BzByoS8q.js                   18.03 kB │ gzip:   3.30 kB
dist/assets/index-6uRsrf0l.js                       336.15 kB │ gzip: 102.09 kB
✓ built in 1.17s
```

Contract sweep: 8 sites updated (CLAUDE.md Layout + five new Invariants,
README.md architecture diagram, its three architecture bullets and repo-layout
table, .github/pull_request_template.md's three example hints,
test/vite-proxy.test.ts's docblock route list, and GuidesView.tsx's no-sandbox
comment, which enumerated the two injected scripts and now names three). Left
standing on purpose: `backlog/*/done/` items and `docs/superpowers/plans|specs/`
entries for earlier features — historical records of what was true when written,
not live contracts; and `client/src/hooks/useGuides.ts`'s reference to
`assets/progress.js`, which is about the progress message and remains accurate.

Red proof: 7 tests went red with the change reverted — 5 in
`test/use-favorites.test.ts` with the hook's `res.ok` guards neutralised, and 2
in `test/render.e2e.test.ts` with the `injectFavoritesCapture` splice bypassed
(`test/favorites-inject.test.ts` correctly stayed green: it tests the splice
function directly, not the controller's call to it). Each of the nine tasks
additionally recorded its own RED-before-GREEN evidence, and every fix round
carried a revert-based red proof, including the `<noscript>` mutation-XSS
payload and the `Back`-inside-the-success-window stranding.

**The by-hand browser walk in *Done when* was not performed.** This ran
unattended with no operator and no browser, and starting the stack would have
proved little without one. `pnpm test`, `pnpm run typecheck` and `pnpm run build`
were substituted. What remains unproven is therefore visual and pointer-driven:
drag-and-drop reorder, the outline's geometry (jsdom reports every rect as zero),
`contain: paint` on `.fav-body`, the `margin-left:auto` negotiation between the
star and the resume notice on one crumbs line, and the `@media (pointer: fine)`
drag handle. Worth one pass by hand before this is trusted in daily use.

Notable during the work: the sanitiser needed four rules the design's own list
did not name — `<noscript>` re-parsing into live markup through the
parse-and-serialise round trip was a demonstrated mutation XSS at the app's only
`dangerouslySetInnerHTML`, and `<area href="javascript:…">` was a second. Both
are fixed and pinned. `.gitignore`'s `node_modules/` was directory-only while
this worktree's `node_modules` is a symlink, so `git add -A` would have committed
it; that entry is now slash-less.

### Amendment — 2026-09-08, post-review

The whole-branch review found one Important issue: `assets/favorites.js`'s
`snapshot()` docblock claimed "The server sanitises the stored html too; this is
the first of the two, not the only one". It does not —
`favorites.dto.ts:57-58` caps `html` at 512 KB and `favorites.service.ts` writes
it through verbatim — and the claim contradicted the invariant this same branch
records in `CLAUDE.md`, that `client/src/lib/sanitize.ts` at render is the
boundary guarding the app's only `dangerouslySetInnerHTML`.

Resolved by correcting the docblock, not by adding a server-side sanitise. The
design is deliberate on both counts the sentence got wrong: a favorite is a
snapshot of what the reader saw, so rewriting those bytes in transit would make
it something else, and the plan's Global Constraints forbid an HTML parser on
the server. The docblock now says the in-frame `<script>` strip is hygiene, that
the server stores capped-but-verbatim bytes on purpose, and that `sanitize.ts`
at render is the one boundary — ending with a line telling a later reader not to
lean on the strip as a guarantee. `CLAUDE.md` already stated this correctly and
is unchanged. A sweep for the same false claim elsewhere
(`server (also )?sanitis`, `sanitised (on|by) the server`, `first of the two`)
found no other site.

Comment-only change; no behaviour, no test touched. Re-verified:

```
Test Suites: 41 passed, 41 total
Tests:       547 passed, 547 total
Time:        45.121 s
$ tsc --noEmit          (clean)
✓ built in 1.14s
```

One caveat, recorded rather than hidden: of six full `pnpm test` runs made while
verifying this amendment, the first reported `1 failed, 546 passed` and the five
after it were clean at 547/547. The failing test's identity was lost — the
command's output was tailed past the failure detail — so it could not be
re-examined directly, and five consecutive clean runs could not reproduce it.
Nothing in this amendment touches test code or behaviour, so it is a flake in
the existing suite rather than a regression from it; the timing-sensitive
candidates are the `mongodb-memory-server` e2e suites and the `waitFor`-based
client suites. Worth a repeat-run if it shows up again in CI.
