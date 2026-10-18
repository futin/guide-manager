# Review 1 — `docs/superpowers/specs/2026-10-17-release-versioning-design.md`

Reviewer: Fable 5.1 subagent, 2026-10-17. Read-only; the document is untouched. Checked against this repo, `backlog-manager`, `claude-agents-dashboard`,
the `release-kit` clone (`v1` and `v1.1.0` both resolve to commit `18af40f`) and the installed `backlog-manager/node_modules/release-kit` (`dist/esm/*`).

## Verdict

**APPROVE WITH FIXES** — no Critical finding. Four Important findings, each a place where the document states something the code will not do, or leaves
the builder to invent a value the spec should settle. The pipeline half (Part 1) is accurate end to end.

## Important

### I1 — D5's `rel="noopener noreferrer"` cannot survive `sanitizeSnapshot` (doc:35; also the test at doc:100)

D5 has the renderer emit links with `target=_blank rel=noopener noreferrer` and then run `sanitizeSnapshot` as "the second wall". The sanitiser rewrites
both attributes on every http(s) anchor it keeps — `client/src/lib/sanitize.ts:225-228`:

```ts
if (isHttp) {
  a.setAttribute('target', '_blank');
  a.setAttribute('rel', 'noopener');
  return;
}
```

So the rendered notes carry `rel="noopener"`, never `noopener noreferrer`, and a lib test written from the spec's words fails. Not Critical — `noopener`
is the protection that matters and the sanitiser applies it to every link — but the stated output is wrong.

Fix: state the output as the sanitiser's (`target="_blank" rel="noopener"`), and let the renderer emit only `href` since the sanitiser sets the rest
(`handleAnchor` also unwraps anything non-http(s), so the `javascript:` case at doc:100 is covered twice). Adjust the test value.

### I2 — three of the four badge palettes name tokens no theme defines (doc:81; starting-state claim at doc:24-25)

Doc:81: "`feat` → green, `fix` → amber, `perf` → cyan, Breaking → red, each its `*-ink` text on its `*-tint` background where the theme defines one;
must read in all five themes." What `shared/theme.css` defines, per block (midnight shown; the other four match in shape):

- amber: `--amber-tint` + `--amber-ink` (`shared/theme.css:56`) — complete.
- green: `--green-tint` only (`:55`); there is no `--green-ink` in any block.
- cyan: `--cyan` only (`:34`); no `--cyan-tint`, no `--cyan-ink`.
- red: `--red` only (`:35`); no `--red-tint`, no `--red-ink`.

Only amber, mustard and magenta have tint+ink pairs. "Where the theme defines one" therefore answers one badge of four and leaves the builder to invent
up to fifteen colour literals (3 tokens-ish × 5 themes) under two constraints the spec does not mention: `test/theme-tokens.test.ts` requires every
palette value to be a literal (`it('writes no color-mix(): every value is a literal the token regex can read')`, ~line 124) and the magenta precedent
in the same suite pins a 4.5:1 ink-on-tint-over-strip ratio per theme (lines ~84-98). Doc:24's "per-status `*-tint`/`*-ink` tokens in every theme" overstates
what exists.

Fix: decide it. Either (a) add `--green-ink`, `--cyan-tint`/`--cyan-ink`, `--red-tint`/`--red-ink` as literals to all five blocks, with the magenta
rule (≥ 4.5:1 on the tint over `--strip`) and a row in `theme-tokens.test.ts`, or (b) map the badges onto the pairs that exist (e.g. perf → mustard)
and drop red for Breaking in favour of an existing pair. Either way name the tokens in the spec; this is the one place a builder has to guess colours.

### I3 — "focus back to the chip on close" has no chip to land on at phone width (doc:77, with doc:74)

Doc:74: in the phone menu the chip is the last row and "tapping it closes the menu like every rail entry". Doc:77: on close "focus moves … back to the
chip". Below 640 px the rail is hidden unless open — `client/src/styles.css:282` `.rail.open { display: flex }` inside the `max-width: 639px` block — and
`SideRail.go()` closes the menu on any pick (`client/src/components/SideRail.tsx:56-59`). So when the drawer closes on a phone, the chip is
`display:none`: it cannot take focus, and the builder has to pick something (the ☰ `.mnav-burger`, `SideRail.tsx:70-78`? `document.body`?) with no
guidance. Note also that this rule is an addition, not a copy: backlog-manager's `ui/Drawer.tsx` moves no focus and its `useDialogEscape.ts` docblock says
"none of these overlays traps focus" — fine to add, but D7's "copy backlog-manager's chip and drawer behaviour" reads as if it were inherited.

Fix: say where focus returns on narrow (the burger is the natural owner: it is the control that reopens the menu the chip lives in), or scope the
return-focus rule to the desktop rail and let narrow fall back to the burger. Mark the focus behaviour as this spec's addition.

### I4 — "exactly as both parents" hides that the parents differ on a failed read, and D2 inherits the worse one (doc:33; doc:32)

Backlog-manager memoises a read only when it was complete — `backlog-manager/server/src/releases/releases.service.ts:140-147` (`if (done.complete)
this.memo = …`) — because its own git reads can tell a timeout from an empty repo. The dashboard, whose shape D2 adopts, memoises whatever `readReleases`
returns, promise included, the moment the key is produced (`claude-agents-dashboard/server/lib/releases.ts:68-74`). `readReleases` folds every git
failure into the empty shape (`release-kit/dist/esm/read-releases.js:42-45`: `catch { return { current: null, releases: [] } }`), so the two cannot be
reconciled by "parity by construction": under D2 a `for-each-ref` that fails once while `rev-parse` succeeded is answered empty *and pinned* until
HEAD or a tag mtime moves — a chip that disappears after a transient fault and stays gone across every page load until the next commit. Likewise
D2's "one hung `GET`": the pending promise is what the memo holds, so every request under that key joins the hang, not one.

Fix: say so, as an accepted cost (the key moves on the next commit or tag, and the chip is a convenience), and reword D2 to "every `GET /api/releases`
under that key hangs, until HEAD or a tag moves". Or adopt backlog-manager's rule by proxy: never memoise an answer whose `releases` is empty (an empty
repo re-reads once per request, which is a cheap `for-each-ref` on a repo with no tags).

## Minor

- doc:24 "no Escape handling" — `client/src/components/favorites/FavoriteCard.tsx:209,256` handle Escape to cancel an inline edit. Say "no overlay
  Escape handling" (true: nothing listens on `window`).
- doc:45 "directly under the lead" — this repo's template puts the optional `Spec: … · Plan: … · Backlog: …` line between the lead and `## Why this
  shape` (`.github/pull_request_template.md:18-19`). backlog-manager's template places `## What's new` after that same line (its `:16-18`). Say "after the
  Spec line, above `## Why this shape`".
- doc:60 — release-kit's `ReleaseType` is `'feat' | 'fix' | 'perf'` and `Release.type` is `ReleaseType | 'baseline'` (`dist/esm/read-releases.d.ts:5`,
  `conventional.d.ts:12`); backlog-manager folds `'baseline'` into `ReleaseType` (`shared/types.ts:2499`). "The same shapes backlog-manager's has (and
  release-kit returns)" is true structurally and false nominally. Pick one — it decides whether `TYPE_LABEL` needs the `Exclude<…, 'baseline'>`.
- doc:62 "If `moduleResolution: "node"` cannot see its types" — it cannot, for certain: the package has no `main`/`types` field, only `exports`
  (`node_modules/release-kit/package.json`), and `tsconfig.json:6` is `"moduleResolution": "node"`. Drop the "if"; the shim is required, as in
  backlog-manager (`server/src/releases/release-kit.d.ts`).
- doc:36, doc:80, doc:95 — `v0.2.0` presumes no other `feat|fix|perf` PR lands between PR A's baseline and PR B. The parent spec names no fixed version
  past the baseline on purpose (backlog-manager spec line 149). Say "the next minor" and keep `v0.2.0` as the example value.
- doc:88 — README has no "After merge" section (grep is empty); that is the PR template's `## After merge` (`.github/pull_request_template.md:131`), i.e.
  PR B's body. Say "PR B's After merge section".
- doc:94 "real Nest app" — `AppModule` drags `MongooseModule` in (`server/src/app.module.ts:17`), so the existing e2e suites boot `MongoMemoryServer`
  (`test/guides.e2e.test.ts:39`). A testing module importing only `ReleasesModule` is enough for a git-only route; say which, since the Mongo boot is the
  slow part of every e2e run.
- doc:94 — the tmpdir fixtures need a git identity on CI; backlog-manager passes `-c user.name=… -c user.email=…` on every call
  (`test/api-releases.test.ts:28`). Builder detail, worth one clause.
- doc:51 — the warning is `no baseline tag — see Baseline` (`dist/esm/release.js:125`); the quoted prefix is fine, just noting the full text.
- doc:70 — backlog-manager's `useReleases` relies on `useMountedRef` (`client/src/hooks/useReleases.ts:4`), which this client does not have
  (`client/src/hooks/`); covered by "the hook's exact shape" at doc:109, but the builder should know it is not a straight copy.
- doc:71 — two tabs: neither parent listens for `storage`, so a drawer opened in one tab leaves the other's dot lit until reload. Not required; just
  unstated. (The reading aid in this repo does listen for `storage` — CLAUDE.md invariant — so a reader of this spec may expect it.)

## Verified true (no finding)

- doc:18-23 starting state: `ci.yml` calls `futin/release-kit/.github/workflows/ci-node.yml@v1`; README §CI documents the applied ruleset (id 25169300,
  squash-only); no `release.yml`, no tags locally or on `origin`; `package.json` `version` `0.1.0` and nothing under `server/`, `client/`, `shared/`,
  `bin/` reads it; PR template has no `## What's new`; `Dockerfile` is `FROM node:24-slim`, installs only `procps`, sets no `USER` (root); compose
  bind-mounts `.:/app` (a bind mount ignores `.dockerignore`'s `.git/`); no `child_process` use anywhere in `server/src`.
- doc:24 `--scrim` ("drawer backdrop", `shared/theme.css:38`) in all five blocks; five themes exactly (`theme-tokens.test.ts` `THEME_IDS`); `--accent` exists
  (`:50`) for the dot.
- doc:31 `plugin.json` `version` `0.1.3`, hand-bumped; `plugin-sync` compares by hash not version.
- doc:32 `readReleases` has no timeout (`dist/esm/git.js` `execFile` with `maxBuffer` only) and never rejects; backlog-manager's service is 168 lines,
  routes every read through `runGit` (10 s) and pins parity in `test/api-releases.test.ts`.
- doc:33 memo key = HEAD + `packed-refs`/`refs/tags` mtimes under `--git-common-dir`, null key never memoised, concurrent requests share one read — both
  parents (`releases.service.ts:97-105,150-166`; dashboard `releases.ts:49-74`).
- doc:34 backlog-manager's `Dockerfile:35-44` installs `git` and `git config --system --add safe.directory '*'` with the same ownership reasoning,
  measured there.
- doc:41-44 backlog-manager's `release.yml` is exactly the enumerated caller (`sha: ${{ inputs.sha }}`, `kit-ref: v1`, `concurrency: release`,
  `cancel-in-progress: false`, both permissions); `rulesets/main.json` at `v1` requires exactly `ci / checks`, `ci / pr-title`, `ci / skills`.
- doc:46 `extractWhatsNew` strips `<!-- -->` before finding `## What's new` and stops at the next `## ` or the `🤖 Generated with` line
  (`conventional.js:51-61`).
- doc:47 backlog-manager `docs/workflows/ci.md` has §Releases (line 64).
- doc:49-51 baseline commands match release-kit's README §Adopting releases step 3 and §Re-running (`workflow_dispatch` with `sha`, idempotent, creates a
  missing Release for an existing tag).
- doc:59 "first ancestor holding a `.git` entry (a directory, or a file in a linked worktree)" matches backlog-manager's `findRepoRoot`
  (`releases.service.ts:60-68`); this repo already has a different marker-based `findRepoRoot` in `server/src/render/assets.controller.ts:18-31` — the new
  one must be its own, since that one keys on `assets/bionic.js`, not `.git`.
- doc:61 `github:futin/release-kit#v1.1.0` is what both parents pin; `v1` and `v1.1.0` are the same commit, so `kit-ref: v1` and the package agree.
- doc:63 `/api` is the first proxy entry (`vite.config.ts:34`).
- doc:67-72 every lib function and the dot rule match `backlog-manager/client/src/lib/releases.ts` one for one (`dotState`'s four branches, `chipLabel`,
  `CC_PREFIX`, `en-GB` date, try/catch storage); doc:73 in-memory mirror matches its `App.tsx:174-182`.
- doc:76-80 copy and structure match `ReleasesDrawer.tsx` (`What's new`, `running v…`, `Versioning starts here · v{version}`, `PR #N`, `role="dialog"`,
  `aria-modal`, `aria-label`, scrim click + ✕ + Escape, panel stops propagation); 400 px panel; 640 px is this shell's own breakpoint (CLAUDE.md,
  `styles.css` `max-width: 639px`).
- doc:94-97 every e2e case is one backlog-manager already runs against tmpdir repos through `BM_RELEASES_ROOT` (`test/api-releases.test.ts`), including
  lightweight `v9.9.9` + annotated `v1` → empty.
- doc:111-114 out-of-scope items are not depended on by anything in scope.
- CLAUDE.md hard rules: both PR titles pass the `ci / pr-title` regex; `release.yml` is a separate workflow so `ci.yml`'s job id and the three required
  contexts are untouched; the new route lives under `/api`, so `AssetsController`/`vite.config.ts`/`static.ts` parity is unaffected; no `skills/`,
  `bin/` or `assets/` edit; ports untouched; release-kit ships `dist` only with no install script, so `allowBuilds` needs no entry.
