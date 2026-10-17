# Release versioning — release tags, version chip and "What's new"

Status: drafted 2026-10-17 from the user's "replicate backlog-manager's What's new approach", questions skipped at their request. Every decision below is the
author's call unless marked otherwise; the user checks them while reading.

## Intent

Give guide-manager the same durable **release record** backlog-manager has: every `feat`/`fix`/`perf` PR merged into `main` becomes an annotated `vX.Y.Z`
tag with a GitHub Release, and the app shows it — a version chip at the foot of the side rail, a dot on it when a release landed since this browser last
looked, and behind it a **What's new** drawer listing every release, newest first.

The parent is backlog-manager's `docs/superpowers/specs/2026-10-16-release-versioning-design.md` (and through it the dashboard's
`2026-10-15-release-pipeline-design.md`). Their tag-message contract, version bump rules and release-workflow behaviour are adopted **unchanged** and not
restated; this document covers only what differs here.

## Starting state (measured 2026-10-17)

- `ci.yml` already calls release-kit's `ci-node.yml@v1`; `ci / pr-title` runs on every PR.
- The `main-pr-only` ruleset is applied; merges are squash-only with title = PR title and body = PR body. So backlog-manager's whole Part 1 (making `main`
  PR-only) is already true here — every change is a PR, every `feat|fix|perf` PR will be a release.
- No `release.yml`. No tags. `package.json` `version` is `0.1.0`, read by nothing.
- `.github/pull_request_template.md` exists but has no `## What's new` section — the section release-kit lifts verbatim into the tag message.
- The server runs no git at all today, and the image (`node:24-slim`) has no `git` binary. The repo is bind-mounted at `/app`, `.git` included.
- The client has no overlay of any kind: no modal, no drawer, no overlay Escape handling (only `FavoriteCard`'s inline-edit cancel), no Markdown renderer. `shared/theme.css` already names `--scrim` ("drawer
  backdrop") and per-status `*-tint`/`*-ink` tokens in every theme.

## Decisions

| #  | Decision | Rejected |
| -- | -------- | -------- |
| D1 | **The tag is the record.** Version lives only in annotated `vX.Y.Z` tags. `package.json` `version` stays unread and unbumped; `.claude-plugin/plugin.json` keeps its own hand-bumped version. | Stamping the tag into `plugin.json` on `plugin:sync` |
| D2 | **The server calls release-kit's `readReleases` directly** — the dashboard's shape, not backlog-manager's re-implementation. backlog-manager re-ran the reads only because its invariant is "every git read goes through `runGit`, bounded at 10 s"; guide-manager has no git reads and no such rule, so parity by construction beats parity by test. Two costs, both handled in D3: `readReleases` has no timeout, and it folds every git failure into the empty shape, so a failed read looks exactly like a repo with no tags. | Copying backlog-manager's 168-line service and its parity test |
| D3 | **Memo keyed on HEAD + `packed-refs`/`refs/tags` mtimes under the common git dir**, as both parents; a key git cannot produce is never memoised; concurrent requests under one key share one in-flight read. The memo-key `git rev-parse` gets a 10 s timeout, and `readReleases` is raced against a 10 s timer that answers the empty shape (the git child is left to finish on its own). **Only an answer with a non-empty `releases` is memoised** — backlog-manager's "never memoise an incomplete read", adapted, since an empty answer cannot be told apart from a failure (the dashboard memoises whatever comes back, which would pin one transient failure until HEAD or a tag moved). The price: a checkout with no tags re-reads per request. | No memo (a git spawn per page load); HEAD-only key (misses a fetched tag) |
| D4 | **Image gains `git`, and `safe.directory '*'` system-wide.** The bind mount is owned by the host uid, the container runs as root, and git refuses a "dubious ownership" repo — which `readReleases` would swallow into an empty answer, i.e. a chip that silently never appears. Needs `pnpm run docker:sync` after merge. | Reading tag files by hand without git (packed-refs, annotated tag objects are zlib — no) |
| D5 | **Notes render through a tiny escape-first renderer, then `sanitizeSnapshot`.** Supported: paragraphs, `- ` / `* ` bullet lists, `` `code` ``, `**bold**`, `[text](https://…)` (http/https only; the renderer emits only `href`, and `sanitizeSnapshot`'s `handleAnchor` sets `target="_blank" rel="noopener"` on every kept http(s) anchor, `client/src/lib/sanitize.ts:225`). Everything is HTML-escaped before any markup is added, so the sanitiser is the second wall, not the first. Anything else shows as literal text. | A Markdown dependency; plain text with `white-space: pre-wrap` (loses links and bullets) |
| D6 | **Two PRs.** PR A `ci(release): add release workflow` (workflow, PR template section, README §Releases, this spec). Then the user tags the baseline. PR B `feat(releases): version chip and What's new drawer` — its merge cuts the next minor (`v0.2.0` if nothing releasing lands first), the end-to-end proof. | One PR (its merge would predate the baseline and release nothing) |
| D7 | **Copy backlog-manager's chip and drawer behaviour**, drawn in this shell's tokens. No mockup round. | Mockups first |

## Part 1 — the pipeline (PR A)

- `.github/workflows/release.yml`: backlog-manager's caller byte for byte but for its header comment — `push` to `main` + `workflow_dispatch` with optional
  `sha`; `permissions: contents: write, pull-requests: read`; `concurrency: release`, `cancel-in-progress: false`; `uses:
  futin/release-kit/.github/workflows/release.yml@v1` with `kit-ref: v1`. It is **not** a required check: the ruleset's three contexts stay exactly
  `ci / checks`, `ci / pr-title`, `ci / skills`.
- PR template: a `## What's new` section **directly under the lead**, above `## Why this shape`, with a comment saying it is lifted verbatim into the release
  notes, written in reader terms, and to delete it (or leave it empty) when nothing is user-visible. HTML comments in it are stripped by release-kit.
- README gains §Releases beside §CI (adapting backlog-manager's `docs/workflows/ci.md` §Releases: what cuts one, where notes come from, baseline,
  re-running). CLAUDE.md's Commands table gains a `Release` row pointing there.
- **Baseline (user step, after PR A merges):** `git pull`, then on PR A's squash commit
  `git tag -a v0.1.0 <sha> -m "Baseline — versioning starts here" --cleanup=verbatim` and `git push origin v0.1.0`, then
  `gh workflow run release.yml -f sha=<sha>` so the baseline gets its GitHub Release. Until then the workflow ends green with `no baseline tag`.

## Part 2 — the app (PR B)

### Server

- `server/src/releases/`: module, controller (`GET /api/releases`, always 200), service (D2/D3). `ReleasesModule` registered in `AppModule`.
- Root: `GM_RELEASES_ROOT` when set (the test seam, read per request), else the first ancestor of the server's own files holding a `.git` entry (a
  directory, or a file in a linked worktree). Never `process.cwd()`. No root → `{ current: null, releases: [] }`.
- `shared/` gains `ReleaseType`, `Release`, `ReleasesResponse` — the same shapes backlog-manager's `shared/types.ts` has (and release-kit returns).
- `release-kit` added as `github:futin/release-kit#v1.1.0`. `moduleResolution: "node"` cannot see its types (it declares them only via `exports`), so an
  ambient `declare module 'release-kit'` shim, as backlog-manager has — not a `paths` entry, which `nest build` would rewrite into a `require` of a `.d.ts`.
- `/api` is already in `vite.config.ts`'s proxy list, so no proxy change and no `docker compose restart client`.

### Client

- `client/src/lib/releases.ts`, no React: `isVersion`, `compareVersions` (numeric per part, `0.10.0 > 0.9.0`), `chipLabel` (`v0.2.0`, `v0.2.0+3`),
  `displayTitle` (strips `type(scope)!: `), `TYPE_LABEL` (Feature / Fix / Performance), `dotState(newest, stored, open)`, `readLastSeen`/`writeLastSeen`
  (try/catch), `formatReleaseDate` (`16 Oct 2026`, an unparsable date shown as it came), and the D5 notes renderer.
- `useReleases`: fetch on mount and on `refresh()`; no poll; a failed fetch or a body that is not the releases shape keeps the last good answer.
- **Dot** — `localStorage` `guide-manager.releases-last-seen`, a raw version string. Dot while the newest release (baseline included) is above the stored
  one. First visit or a junk stored value: store the newest, no dot. Drawer open: no dot, store the newest — but never write a version below the stored one.
  Storage that throws: no dot, no crash; `AppShell` mirrors the value in memory so a seed it could not write still settles the dot.
- **Chip** — the rail's last element, sunk to its foot; in the phone menu the last row, and tapping it closes the menu like every rail entry. No chip while
  `current` is null (no baseline reachable, or the read has not answered). The dot is the shell's `--accent`.
- **Drawer** — `components/ui/Drawer.tsx` (scrim + right-hand 400 px panel, full screen under 640 px; Escape, ✕ and a scrim click close it; `role="dialog"`,
  `aria-modal`, `aria-label`; focus moves to the panel on open and, on close, back to the element focused before it if that is still rendered — else, under
  640 px where tapping the chip closed the menu and hid it, the ☰ `.mnav-burger`. The focus handling is this spec's addition; backlog-manager's `Drawer`
  moves none) and `components/ReleasesDrawer.tsx` (the content). Rendered by
  `AppShell`, outside the rail, so no ancestor of the rail can become the fixed panel's containing block. Opening it refreshes first.
- **Entry**: version, type badge, separate Breaking badge, date, `displayTitle`, notes (D5) when non-empty, `PR #N` link when the origin is on GitHub. The
  baseline is a divider: `Versioning starts here · v0.1.0` and its date. Head: `What's new` and `running v0.2.0+1`.
- **Badges**: `feat` → green, `fix` → amber, `perf` → magenta, Breaking → red, each its `*-ink` text on its `*-tint` background. Not cyan for `perf`, as
  backlog-manager has it: Daylight's `--cyan` is a green and Amber's an amber, so it would collide with Feature or Fix. Amber and magenta have both tokens
  today (`shared/theme.css:55-60`), so every theme block gains literal `--green-ink`, `--red-tint`, `--red-ink` — no `color-mix()`,
  no `var()`, the `--magenta-ink` rule: the hue itself where it clears 4.5:1 on its tint over `--strip`, else mixed toward `--ink` just far enough.
  `test/theme-tokens.test.ts` gains a row asserting ≥ 4.5:1 for each of the four badge pairs on every palette.

### Docs

- CLAUDE.md: `server/src/` line gains `releases/` (`GET /api/releases`); a new invariant — the tag is the record, the chip is a convenience, the image needs
  git + `safe.directory`, and the route never answers an error status.
- README: the app section mentions the chip and drawer. PR B's body, `## After merge`: `pnpm run docker:sync` (the image changed).
- `useReleases` guards its late `setState` with a local unmounted flag — this client has no `useMountedRef`.

## Testing

Behaviour and cases, not code:

- **`GET /api/releases` e2e** (supertest over a Nest testing module holding only `ReleasesModule` — `AppModule` would boot Mongo for nothing — and a tmpdir
  git repo via `GM_RELEASES_ROOT`; fixture commits pass `-c user.name=… -c user.email=…` so CI needs no git identity): not a checkout → empty shape, 200; no tags → empty
  shape; only a lightweight `v9.9.9` and an annotated `v1` → empty shape; baseline + two releases → newest first, baseline `type: 'baseline'`; HEAD on a tag →
  `ahead: 0`; a commit after the first read → `ahead: 1` (the key moved); a tag cut without moving HEAD → appears (common-dir mtimes); a non-GitHub origin →
  no `url`; a GitHub origin → `url` `https://github.com/<o>/<r>/pull/<n>`.
- **lib (jest)**: `dotState` — no newest; first visit seeds; junk stored seeds; newer → dot; equal → none; open with newer → seed newest; open with older
  newest → no seed. `compareVersions('0.10.0','0.9.0') > 0`. `chipLabel` with and without `ahead`. `displayTitle` on `feat(rail)!: x`, `fix: y`, and a
  baseline title with no prefix. Notes renderer: `<script>` and `<img onerror>` arrive as text; `javascript:` link is not a link; an `https://` link comes out with `target="_blank"` and `rel="noopener"`; bullets become `<li>`;
  inline code and bold; a bare paragraph.
- **jsdom**: drawer renders entries and the baseline divider, Escape / ✕ / scrim close it, a click inside the panel does not; rail shows the chip with the
  dot for a newer release and without it after opening; no chip when `current` is null; phone menu closes on chip tap.
- **Not by a suite**: the workflow (proved by PR B's merge cutting `v0.2.0` with its notes), and git inside the container reading the host checkout (proved
  by `curl 127.0.0.1:$GM_API_PORT/api/releases` after `docker:sync`).

## Left to the builder

File names inside the new module, the hook's exact shape, the drawer's CSS, and whether the notes renderer lives in `lib/releases.ts` or its own file.

## Out of scope

`CHANGELOG.md`; versioning `plugin.json`; per-project releases for registered guides' repos (this chip is the app's own version); editing notes after a
tag (fix forward); any `git fetch` or GitHub API call from the server.
