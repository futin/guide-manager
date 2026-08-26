---
id: task-12
title: Move plugin payload into its own subdirectory
created: 2026-08-26
tags: plugin, packaging
---

## Goal

`claude plugin update guide-manager@guide-manager-marketplace` copies **689M**
into `~/.claude/plugins/cache/guide-manager-marketplace/guide-manager/<version>/`
on every version bump, because a directory-sourced marketplace copies the whole
source tree and the plugin's `source` is `"./"` — the repo root. Move the plugin
payload under `plugin/` and point `source` at it, so a bump copies ~1M.

Findings from the 2026-08-26 investigation (CLI 2.1.246):

- **The copy is the entire working tree minus `.git`.** Verified by file count:
  repo 48,530 files, cache 48,530 files; only `.orphaned_at` differs. `node_modules`
  (473M) and the deliberately-vendored `.pnpm-store` (201M, committed in
  `83843fd7` so a container restart survives pnpm's dependency check) both ride along.
- **`.gitignore` is not consulted.** `node_modules/` and `dist/` are both ignored
  and both present in the cache.
- **`.claudeignore` does not exist in this build** — 0 occurrences of the string
  in the 2.1.246 binary. There is no allowlist/exclude field in `plugin.json` or
  `marketplace.json` either. So option (1), "filter the copy", is not available.
- **A subdirectory `source` does work, and does shrink the copy.** Verified
  empirically with a throwaway marketplace: root held a 60M blob, `source` pointed
  at `./plugin` (12K), and the resulting cache was **12K** — the blob was not
  copied. Teardown left no residue.
- **Stale versions expire on their own.** `.orphaned_at` markers are written on
  superseded versions (0.1.0 at 2026-08-24, 0.1.1 at 2026-08-26) and removed
  after a grace period; the active version's marker is cleared. `claude plugin
  prune` exists but prunes auto-installed *dependencies*, not cache versions. So
  no manual cache cleanup is needed — the cost is 689M resident per bump until
  the grace period elapses.

The elegant part: **every `${CLAUDE_PLUGIN_ROOT}/…` reference in the skills stays
textually unchanged**, because the plugin root moves with the payload.
`${CLAUDE_PLUGIN_ROOT}/bin/register.js` and `${CLAUDE_PLUGIN_ROOT}/assets/bionic.js`
keep resolving. Only repo-side paths move.

## Plan

Target layout — `plugin/` holds exactly what the plugin ships, and holds the only
copy of each of those files:

    plugin/.claude-plugin/plugin.json   (moved from .claude-plugin/)
    plugin/skills/                      (moved from skills/)
    plugin/bin/register.js              (moved from bin/)
    plugin/assets/                      (moved from assets/)
    .claude-plugin/marketplace.json     (stays: it describes the marketplace, not the plugin)
    bin/tailnet.js                      (stays: repo tooling, not plugin payload)

1. `git mv` the four payload paths into `plugin/`. One copy of each, never two —
   the existing "skills/ is the plugin skill root" invariant is about duplication,
   and this move preserves it with `plugin/` as the new root.
2. `.claude-plugin/marketplace.json`: `"source": "./"` → `"source": "./plugin"`.
3. `server/src/render/assets.controller.ts` `findRepoRoot()`: the marker pair is
   `assets/bionic.js` + `server/public/style.css`. The first half moves, so the
   marker becomes `plugin/assets/bionic.js` (keep the pair — a single marker is
   what the comment there warns against), and every `join('assets', …)` in
   `sendFile` calls becomes `join('plugin', 'assets', …)`. Verify the function
   still resolves from both layouts it documents (`server/src/render/` and `dist/`).
4. Tests that reach for the moved files by relative path:
   - `test/register.test.ts:12` — `join(__dirname,'..','bin','register.js')`
   - `test/bionic.test.ts:5` — `join(__dirname,'..','assets')`
   - `test/progress-reporter-doc.test.ts:7` and the other three
     `progress-reporter-*` suites, `test/bionic-storage.test.ts`,
     `test/bionic-panelless.test.ts`, `test/settings-bionic.test.ts`,
     `test/assets.e2e.test.ts` — grep for `'assets'` and `'bin'` and repoint.
5. Docs: `CLAUDE.md` Layout section and the `skills/`-is-the-plugin-root invariant
   (reword to name `plugin/` as the root, keeping the no-second-copy rule);
   `README.md` lines 53/70/76/155 (`bin/register.js` → `plugin/bin/register.js`).
6. Bump `plugin/.claude-plugin/plugin.json` to 0.2.0 — the install path changes,
   so this is not a patch — then `claude plugin update guide-manager@guide-manager-marketplace`
   and confirm the new cache directory is ~1M rather than 689M.
7. Confirm the skills still load from the relocated root before closing: the
   `/study` and `/tutor` skills must appear in a fresh session, and
   `${CLAUDE_PLUGIN_ROOT}/bin/register.js` must run from the installed copy.

Do **not** try to shrink the repo itself: `.pnpm-store` is vendored on purpose
(see `83843fd7`), and this task removes the reason to care about its size.

## Test cases

- `pnpm test` and `pnpm run typecheck` green after the move — in particular the
  asset suites, which read the moved files off disk.
- `test/vite-proxy.test.ts` still passes: the proxy list is asserted against
  `AssetsController`'s routes, and the *routes* do not change, only the on-disk
  paths behind them. A failure here means step 3 changed a URL by mistake.
- A rendered guide still gets its reading aid and progress reporter spliced in
  (`assets.e2e.test.ts`, `render.e2e.test.ts`) — i.e. `findRepoRoot()` resolves.
- Post-update: `du -sh ~/.claude/plugins/cache/guide-manager-marketplace/guide-manager/0.2.0`
  is single-digit MB.
- A fresh session lists the `study` and `tutor` skills, and registering a guide
  through the installed plugin's `register.js` writes `~/.guide-manager/registry.json`.

## Done when

The plugin cache holds a plugin-sized copy instead of the working tree, the suite
is green, the skills load from the new root, and CLAUDE.md/README describe the
new layout.
