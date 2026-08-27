---
id: task-12
title: Stop the plugin install copying the whole working tree
created: 2026-08-26
tags: plugin, packaging
started: 2026-08-27
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

The original plan was to `git mv` the payload under `plugin/` and point the
directory source at it. That is **not** what was done — `backlog-manager` hit
the identical problem the same week and found a better lever, and this task
followed it (the filename slug still carries the old approach; the title above
does not).

A `--sparse` **git** marketplace source solves the same problem without moving
a single file: `claude plugin marketplace add` takes `--sparse <paths...>`
(present in 2.1.246, undocumented in the task's original investigation), so the
checkout can be narrowed to the payload while every path in the repo stays
exactly where it is. `assets.controller.ts`'s `findRepoRoot()`, the ten test
suites that read `assets/` and `bin/` off disk, and the README's paths are all
untouched — the whole of step 3–5 below evaporates, and with it the risk of a
silent mis-repointing.

The trade the git source makes is that the installer reads **pushed commits**,
not the working tree, so publishing needs a gate and a sync script.

1. Re-register the marketplace against GitHub, sparse:
   `claude plugin marketplace add futin/guide-manager --sparse .claude-plugin skills bin assets`.
   `bin` for `register.js` (and `bin/package.json`, the `{"type":"module"}` the
   `bin/` scripts need); `assets` for the bionic files `study` copies out.
2. `bin/plugin-sync.js` — no-ops when the installed copy already carries HEAD;
   otherwise refuses a dirty payload, an unpushed HEAD, or a HEAD behind
   `origin/main`, then `marketplace update` + `uninstall` + `install`, verifies
   the landed payload by hash, and prunes older version copies (skipping
   `.in_use`). It never commits or pushes.
3. Uninstall + install rather than `claude plugin update`: that command compares
   the version in `plugin.json` and stops at "already at the latest version"
   however far the commit behind it has moved. The cache directory is keyed by
   version, so the alternative is a patch bump on every skills edit. A sparse
   reinstall is cheap enough that the bump buys nothing — so `plugin.json`'s
   version stops being touched per change.
4. `test/plugin-sync.test.ts` asserts the gate and, importantly, checks every
   `${CLAUDE_PLUGIN_ROOT}/…` reference in `skills/` against the script's own
   `PUBLISHED_PATHS` — the one way the sparse list and the skills can drift
   apart, and a drift that only breaks on a machine that installed rather than
   cloned.
5. Docs: `CLAUDE.md` commands table, layout, and two new invariants; `README.md`
   install section.

Do **not** try to shrink the repo itself: `.pnpm-store` is vendored on purpose
(see `83843fd7`), and this task removes the reason to care about its size.

## Test cases

- `pnpm test` and `pnpm run typecheck` green.
- `test/plugin-sync.test.ts` covers the gate (dirty / ahead / behind), the
  no-op, the reinstall command list, and the published-paths ↔ skills check.
- Post-install: `du -sh` on the cache directory is single-digit MB.
- `${CLAUDE_PLUGIN_ROOT}/bin/register.js` runs from the installed copy, and
  `skills/study/SKILL.md` + `skills/tutor/SKILL.md` are present in it.

## Done when

The plugin cache holds a plugin-sized copy instead of the working tree, the
suite is green, the skills load from the installed root, and
CLAUDE.md/README describe how publishing now works.

## Outcome

2026-08-27 — done, via the sparse git source rather than the `plugin/` move.
The install went from **689M to 584K**; no file moved, so no server, test or
doc path had to be repointed.

Added `bin/plugin-sync.js` (+ `pnpm run plugin:sync`) and
`test/plugin-sync.test.ts`; reworded the plugin invariants in `CLAUDE.md` and
the install section of `README.md`. The old fat `0.1.2` copy (689M) is still on
disk — it carries no `.in_use`, so the first `pnpm run plugin:sync` after this
work is committed and pushed will prune it.

```
$ du -sh ~/.claude/plugins/cache/guide-manager-marketplace/guide-manager/*
1.3M    .../0.1.0
1.7M    .../0.1.1
689M    .../0.1.2
584K    .../0.1.3        <- reinstalled from the sparse git source

$ pnpm test
Test Suites: 34 passed, 34 total
Tests:       363 passed, 363 total
Time:        74.731 s

$ pnpm run typecheck
$ tsc --noEmit          (no output, exit 0)

$ npx jest test/plugin-sync.test.ts
  bin/plugin-sync.js — published paths
    ✓ carries the plugin manifest, the skills, and everything the skills reach for
    ✓ covers every ${CLAUDE_PLUGIN_ROOT} reference the skills make
  bin/plugin-sync.js — the publish gate
    ✓ refuses an uncommitted payload, and names the files rather than just saying no
    ✓ refuses an unpushed HEAD — the marketplace clones from GitHub, not from here
    ✓ refuses a HEAD behind origin/main, so a sync never installs backwards
  bin/plugin-sync.js — what it runs
    ✓ says so and stops when the installed copy already carries this commit
    ✓ notices a payload change outside skills/ — register.js and the assets ship too
    ✓ refreshes the marketplace, then reinstalls rather than updating
    ✓ hands back the install command when nothing is installed at all
  Tests: 9 passed, 9 total

$ GM_REGISTRY_FILE=$TMP node "$INSTALLED_ROOT/bin/register.js" --project /tmp/demo-project \
    --guide "$INSTALLED_ROOT/assets/bionic.html" --type study --title "Installed-copy smoke test"
registered: Installed-copy smoke test (study) -> .../0.1.3/assets/bionic.html

$ ls "$INSTALLED_ROOT"/skills/*/SKILL.md
.../0.1.3/skills/study/SKILL.md
.../0.1.3/skills/tutor/SKILL.md
```

The `/study` and `/tutor` skills load on the next Claude Code restart, not in
the session that ran the reinstall — this session was still holding the old
copy open (`.in_use` on `0.1.3`).
