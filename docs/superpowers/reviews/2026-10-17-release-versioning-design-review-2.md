# Review 2 — `docs/superpowers/specs/2026-10-17-release-versioning-design.md`

Reviewer: Fable 5.1 subagent, 2026-10-18. Read-only; the document is untouched. Reviewed the file as it is on disk (it carries an uncommitted edit over
`92acc7eb` — the `perf` badge moved from cyan to magenta, doc:83-85 — which this review covers; autopilot decision 7). Checked against this repo on
`feat/releases-ui` (which now holds PR A, `4b0b7428`, and PR B's server half, `39ff870d`), `backlog-manager`, `claude-agents-dashboard`, and the installed
`backlog-manager/node_modules/release-kit` (`dist/esm`, `dist/cjs`, README). Round 1's findings are not repeated unless the text still gets them wrong.

## Verdict

**APPROVE WITH FIXES** — no Critical finding. Two Important findings, both in Part 2's client half: one test case cannot pass against the unit it names
in the environment the suite runs in, and the focus-return rule is written in a word ("rendered") that is false for the exact case it was added to
cover. Round 1's four Important findings (I1 `rel`, I2 badge tokens, I3 phone focus, I4 memo-on-failure) are all resolved in this revision — D3's
"only a non-empty `releases` is memoised" and the 10 s race are what `server/src/releases/releases.service.ts:84-118` now implements.

## Important

### I1 — the renderer test's `target`/`rel` assertion can only be observed after `sanitizeSnapshot`, which needs a DOM the lib suite does not have (doc:105-108; doc:35)

D5 (doc:35) has the renderer emit **only `href`** and relies on `sanitizeSnapshot`'s `handleAnchor` for `target="_blank" rel="noopener"`
(`client/src/lib/sanitize.ts:225-228` — verified). The test list at doc:105-108 is headed **"lib (jest)"** and says "Notes renderer: … an `https://`
link comes out with `target="_blank"` and `rel="noopener"`". Two problems with that as written:

- Tested against the renderer alone — the unit the sentence names — the assertion fails, because the renderer emits no `target` and no `rel` by D5's own
  rule. A builder who takes the sentence literally either writes a failing test or puts the attributes back into the renderer, undoing I1's fix.
- Tested against the composed pipeline, it needs a DOM: `sanitizeSnapshot` is `new DOMParser().parseFromString(...)` (`client/src/lib/sanitize.ts:331`),
  and the suite's default environment is node (`jest.config.ts:9`, `testEnvironment: 'node'`; `test/sanitize.test.ts` opts into jsdom with the
  `@jest-environment jsdom` docblock for exactly this reason). The spec files this case under "lib (jest)" and keeps a separate "jsdom" bullet at doc:109,
  so the environment is wrong for the one case in the lib list that is not pure string work.

Fix: split the sentence. The renderer cases that are pure string work stay in the lib list (`<script>`/`<img onerror>` arrive as text; a
`javascript:` link is not a link; bullets become `<li>`; code; bold; paragraph), and state the link assertion as a test of **renderer → `sanitizeSnapshot`**
under jsdom (move it to the doc:109 bullet, or mark that one case `@jest-environment jsdom`).

### I2 — "if that is still rendered" is true of the chip on a phone, so the burger fallback never fires (doc:77-78, with doc:74)

Doc:77-78: on close, focus returns "to the element focused before it **if that is still rendered** — else, under 640 px where tapping the chip closed the
menu and hid it, the ☰ `.mnav-burger`." The chip *is* still rendered on a phone: `SideRail` keeps the `<nav>` mounted and only toggles a class
(`client/src/components/SideRail.tsx:83`, `className={open ? 'rail open' : 'rail'}`), and the phone stylesheet hides it with `display:none` until `.open`
(`client/src/styles.css`, the `max-width: 639px` block, `.rail.open { display: flex }` — round 1's I3 cites it at `:282`). So an implementation that reads
"rendered" as "still in the document" (`el.isConnected`, `document.contains(el)` — the obvious checks) finds the chip, calls `.focus()` on a
`display:none` element, which silently does nothing, and focus drops to `<body>` — the exact outcome the sentence was added to prevent. The burger branch
is reachable only if "rendered" means "visible/focusable".

Fix: say what the test is — e.g. "if it is still in the document **and focusable** (not `display:none`: `getClientRects().length > 0` or
`offsetParent !== null`)" — or make the rule mechanical: "under 640 px always the burger, otherwise the opener". The jsdom case at doc:109-110 should then
name it ("on a phone, closing the drawer focuses `.mnav-burger`"), since jsdom computes no layout and the builder has to know which check the test drives.

## Minor

- doc:45 "directly under the lead" — still the wording round 1 flagged. The template PR A actually shipped puts `## What's new` after the optional
  `Spec: … · Plan: … · Backlog: …` line (`.github/pull_request_template.md:18-21`), and README §Releases copied the spec's words ("right under the lead",
  `README.md:262`). Say "after the Spec line, above `## Why this shape`" so the three agree.
- doc:60 "the same shapes backlog-manager's `shared/types.ts` has (and release-kit returns)" — still the nominal ambiguity round 1 noted; the builder
  resolved it backlog-manager's way (`shared/types.ts:172` folds `'baseline'` into `ReleaseType`), which means `TYPE_LABEL` at doc:68 needs
  `Exclude<ReleaseType, 'baseline'>` as `backlog-manager/client/src/lib/releases.ts:39` has. Say which.
- doc:86 "the hue itself where it clears 4.5:1" — for green, name the hue: `--green` clears on every palette (5.72 / 5.45 / 7.37 / 6.23 / 5.38 over an
  18 % self-tint), but Daylight's `--green-solid` (`#7dc242`) on its `--green-tint` reads **1.62:1**; a builder who takes "the solid" as the hue, because
  that is what the dark blocks' `--green-ink` would equal, ships an unreadable Feature badge in Daylight. (Computed from `shared/theme.css` at HEAD with
  the test's composite-over-`--strip` rule.) Amber already clears on all five (7.01 / 6.14 / 8.08 / 7.69 / 5.04) and magenta is the tested pair, so the
  new row needs no retune of either; red needs the mix on all four dark palettes (3.60–4.35 at 14 %), which the rule covers.
- doc:85 — the tint strength for `--red-tint` is not stated; the file's header pins each hue's strength (green 18 %, amber 11 %, mustard 13 %, magenta
  14 % — `shared/theme.css:5-6`). One number.
- doc:24 "per-status `*-tint`/`*-ink` tokens in every theme" still overstates (amber, mustard, magenta only — round 1 I2) and now reads against doc:84's
  precise "Amber and magenta have both tokens today". Make doc:24 say the same three.
- doc:33 — after the 10 s timer wins, the spec does not say whether the next request joins the still-running read or starts a fresh one. The code starts
  fresh (`releases.service.ts:18-19,116-117`, "the in-flight slot is cleared"); either is defensible, but "concurrent requests under one key share one
  in-flight read" reads as the other. One clause.
- doc:94 — the `useReleases` unmounted-flag bullet sits under "### Docs"; it belongs with doc:70.
- doc:112 `curl 127.0.0.1:$GM_API_PORT/api/releases` — `.env` sets only `GM_WEB_PORT` (`.env:16`); `GM_API_PORT` is unset and compose defaults it
  (`docker-compose.yml:78`, `${GM_API_PORT:-4321}`). Write `${GM_API_PORT:-4321}`, or the proof command expands to `127.0.0.1:/api/releases`.
- doc:83 — `perf` now shares magenta with the tutor pill (`--magenta-tint`/`--magenta-ink` are "the tutor pill: --magenta at 14 %", `shared/theme.css:58`).
  Not wrong, and the cyan reasoning is right (Daylight `--cyan:#306c0f` is a green, Amber `--cyan:#ffc76b` an amber — `theme.css:121,85`); just note that
  the two meanings now share a colour so nobody later reads it as drift.
- doc:16-25 "Starting state (measured 2026-10-17)" is now historical on this branch (`release.yml`, the template section, `git` in the image and the whole
  server module exist at `39ff870d`). Dated, so not a false statement; a one-line "superseded by PR A / PR B" note when PR B lands would stop a later
  reader re-measuring.

## Verified true (no finding)

- doc:32 backlog-manager's rule is real and is why it re-implemented the reads: `backlog-manager/CLAUDE.md:147` ("every git read is `runGit`, async,
  bounded at 10 s") and its spec's R4 (`2026-10-16-release-versioning-design.md:36`). The dashboard imports `readReleases` directly and memoises the
  promise whatever it resolves to (`claude-agents-dashboard/server/lib/releases.ts:68-70`) — doc:33's "pins one transient failure until HEAD or a tag
  moved" is exactly that code.
- doc:33 the built service matches every clause: key = root + HEAD + `packed-refs`/`refs/tags` mtimes under `--git-common-dir`, `rev-parse` with a 10 s
  `execFile` timeout, null key never memoised, shared in-flight promise, `boundedRead` racing a 10 s unref'd timer to the empty shape, memo only when
  `value.releases.length > 0` (`server/src/releases/releases.service.ts:54-118`).
- doc:35 `sanitizeSnapshot` keeps `<p>`, `<ul>`/`<li>`, `<code>`, `<strong>` and `<a href="https://…">` — `REMOVE_TAGS` is a denylist
  (`client/src/lib/sanitize.ts:101-125`) and the href rule keeps absolute http(s) (`:199-200`), so the D5 output survives the second wall.
- doc:36 both PR titles pass release-kit's title rule (`conventional.js:3-4`: lowercase scope, any description), and `feat` from `v0.1.0` bumps to
  `0.2.0` (`conventional.js:38-46`).
- doc:41-44 `.github/workflows/release.yml` on the branch differs from backlog-manager's only in the header comment (diff run); the ruleset contexts are
  untouched (`ci.yml` job id `ci`, no `name:`).
- doc:49-51 the baseline command is release-kit README §Adopting releases step 3 verbatim (`--cleanup=verbatim` included, README:111); the workflow's
  warning is `no baseline tag — see Baseline` (`dist/esm/release.js:125`); a message with no `Release-Type` trailer parses as `baseline`
  (`conventional.js:73-74`).
- doc:57-59 controller is `@Controller('api/releases')` returning the service's promise, never an error status; `releasesRoot()` is `GM_RELEASES_ROOT`
  else `findRepoRoot(__dirname)` (`releases.service.ts:35-52`); `ReleasesModule` is in `AppModule` (`server/src/app.module.ts:39`).
- doc:61-62 release-kit's `package.json` has no `main`/`types`, only `exports` with `types`/`import`/`require` (the `require` target `dist/cjs/index.js`
  exists), so under `moduleResolution: "node"` (`tsconfig.json:6`) the shim is required and the CommonJS build loads it; `server/src/releases/release-kit.d.ts`
  is that shim. Pinned `github:futin/release-kit#v1.1.0` resolves to `18af40f` in `pnpm-lock.yaml:147`.
- doc:67-73 every lib rule matches `backlog-manager/client/src/lib/releases.ts:16-78` (`dotState`'s four branches incl. "open with older newest → no
  seed", `chipLabel`, `CC_PREFIX`, `en-GB` short date, try/catch storage); the in-memory `seen` mirror is `backlog-manager/client/src/App.tsx:173-182`;
  `useReleases` keeps the last answer on a failed fetch or a non-shape body (`hooks/useReleases.ts`), and this client has no `useMountedRef`
  (`client/src/hooks/`: four hooks, none of them).
- doc:74-82 `AppShell` exists (`client/src/App.tsx:28`) and renders `SideRail`; `.mnav-burger` exists (`SideRail.tsx:74`); `go()` closes the menu on any
  pick (`:56-59`); copy matches backlog-manager's `ReleasesDrawer.tsx:21,41,50-53` (`Versioning starts here · v…`, `PR #N`, `What's new`,
  `running …`) and its `Drawer` is a 400 px panel, full-width when narrow (`styles.css:3212-3224`), scrim click + ✕ + Escape, panel stops propagation.
- doc:83-87 `shared/theme.css:55-60` is the amber/mustard/magenta pair region; the magenta rule and its test row are `theme.css:58-60` and
  `test/theme-tokens.test.ts:84-98` (composite over `--strip`, ≥ 4.5, `THEME_IDS` of five); `:123` forbids `color-mix()`.
- doc:100-104 every e2e case is already on disk in `test/releases.e2e.test.ts` (`ReleasesModule` only, `GM_RELEASES_ROOT` per case, `-c user.name`/
  `user.email` on every git call, the lightweight `v9.9.9` + annotated `v1` case, GitHub/non-GitHub origins), and release-kit builds `url` from the
  `origin` remote exactly as doc:104 says (`read-releases.js:6-11,38`); `current` is `null` whenever `describe` finds no reachable annotated version tag
  (`:17-25,42`), which is doc:75's "no baseline reachable".
- doc:118-121 out-of-scope items are not depended on by anything in scope; CLAUDE.md hard rules (plugin skill root, `bin/`/`assets/` untouched,
  `/api` already proxied so no `AssetsController`/`vite.config.ts`/`static.ts` triplet change, ports untouched, `ci.yml` job id and the three contexts
  intact) all hold.
