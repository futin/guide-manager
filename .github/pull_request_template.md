<!--
Title: Conventional Commits — feat(scope): / fix(scope): / docs: / chore:
Lowercase, imperative, no trailing period. Scope is the subsystem
(progress, render, guides, registry, client, docker, backlog, skills…).

House rules for the body:
  • Lead in reader terms first — what someone reading a guide on their phone can now do.
  • State what you did NOT verify. Every section below assumes an honest gap list.
  • If the change settles a design question, add or amend the invariant in `CLAUDE.md`.
    That file is the house's memory; a PR that teaches it nothing is a PR that will be
    re-litigated.
  • Delete every optional section that does not apply. A docs-only PR is three lines.
-->

<!-- LEAD (required, unlabelled): 1–3 sentences. What this does, in reader terms.
     Then one line on where it sits — shell, framed guide, board, registry, skill. -->

<!-- Optional, when the work has committed design artefacts or a backlog item: -->
Spec: `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` · Plan: `docs/superpowers/plans/YYYY-MM-DD-<name>.md` · Backlog: `backlog/tasks/<n>-<slug>.md` → `done/`

## Why this shape

<!-- The constraint that forced this design, and the alternative you rejected.
     For a fix, retitle this "## The bug" and give the symptom, the mechanism,
     and how it was found. -->

## What changed

<!-- Group by boundary — the reader navigates by domain, not by diff order.
     Drop the groups you didn't touch. Or use a `| Piece | Role |` table for a
     new subsystem. -->

**Server** <!-- server/src: guides, progress, registry, render, static -->
-

**Client** <!-- client/src: rail, Guides view, Settings view, hooks -->
-

**Served assets** <!-- assets/: bionic.*, progress.js — spliced by GET /asset, never vendored -->
-

**Skills / registry** <!-- skills/study, skills/tutor, bin/register.js -->
-

**Docs / backlog**
-

## Verification

<!-- Required. Commands with their actual result, then what a human did by hand,
     then the honest gap. Never claim green without the output. -->

`pnpm test` → `ALL PASS` (N suites, M new) · `pnpm run typecheck` clean · `pnpm run build` clean

New coverage:
-

<!-- This repo does have an HTTP harness (supertest `*.e2e.test.ts`) and a component
     renderer (@testing-library/react, jsdom docblock). If an endpoint or a view is
     untested here, say why — don't imply the harness is missing. -->

Verified by hand (the parts no suite reaches — a real iframe, a real browser's
`storage` event, the compose stack, a phone over the tailnet):
-

**Not verified, and it needs a human:**
-

<!-- Invariant checks, where the change touches one. Delete the lines that don't apply.
  - [ ] New path on `AssetsController` also added to `vite.config.ts`'s proxy list
        (a missing one serves `index.html` as the stylesheet — no 404, just unstyled).
  - [ ] Injected asset's version header bumped (`bionic vN` / `progress vN`) and the
        matching refuse-if-already-present guard still holds.
  - [ ] `bin/register.js` is still the only writer of `~/.guide-manager/registry.json`.
  - [ ] Guide files still resolve through `resolveAllowed`; a moved guide is hidden,
        not an error.
  - [ ] `furthestPercent` still only climbs; `openCount` still only counts `opened: true`.
-->

<!-- ─── OPTIONAL BELOW — delete what doesn't apply ─────────────────────── -->

<!--
## Verified against the running stack, not assumed

For work that depends on external behaviour — Vite's dev server (`allowedHosts`,
its in-place restart), the compose stack, Mongo's boot-time retry bound, pnpm's
`allowBuilds` gate, a browser's iframe/`storage` semantics. One row per fact, with
how you proved it. Mark unproven ones **Unproven:** and say how the system degrades
if the assumption is wrong.

| Fact | How |
|---|---|
|  |  |
-->

<!--
## Exposure

Required whenever the change widens what a tailnet peer can reach, adds a write
path, or lets a new file leave the host. This app has no authentication — anything
it serves is served to every peer on the tailnet. State: what bounds the new
surface, and what a peer can cause.

- Bounded by the registry allowlist (`render/paths.util.ts`), so only registered
  guide files and their siblings resolve.
- Bounded by `GM_GUIDE_ROOT` — a guide outside it is dropped from the list and
  never mounted.
- Container mounts stay read-only.
- Write paths reachable: <POST /api/progress, DELETE /api/progress, …>
-->

<!--
## ⚠️ Reaches beyond the feature, deliberately

For scope you knowingly took on outside the stated task — a pre-existing bug in
the same class, a helper applied at sites the feature never touches. Say why
leaving the rest was not a defensible boundary, and confirm valid-input behaviour
is unchanged.
-->

<!--
## Known limits

What this does not do, and how it degrades rather than wedges. Include the
deferred-by-design list.

-
-->

<!--
## After merge

Prerequisites the reader must action themselves:

- `pnpm run docker:sync` if a dependency or the image changed.
- `docker compose restart client` if `vite.config.ts` changed — Vite's own in-place
  restart comes back bound to localhost inside the container.
- Re-run `bin/register.js` / regenerate a guide, if the change alters what a build
  must contain. (Assets spliced by `GET /asset` need no regeneration — that is the
  point of serving them.)
-->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
