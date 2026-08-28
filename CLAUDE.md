# guide-manager

Claude Code plugin repo: the `study` and `tutor` skills, plus a local
NestJS + React app that serves every registered guide over Tailscale.
Human-facing docs (setup, install, tailnet walkthrough, architecture diagram)
live in `README.md` — this file holds only what a working session needs.

## Commands

| Task | Command |
|---|---|
| Whole stack (mongo + api + vite) | `pnpm run docker:up` |
| Rebuild the stack from scratch | `pnpm run docker:sync` |
| API only, on the host | `pnpm run dev` |
| Client only, on the host | `pnpm run dev:web` |
| Tests | `pnpm test` (jest, `--runInBand`) |
| Types | `pnpm run typecheck` |
| Production build | `pnpm run build` |
| Publish the web port to the tailnet | `pnpm run tailnet` (`up` \| `status` \| `down`) |
| Reinstall the plugin from the pushed HEAD | `pnpm run plugin:sync` |

Mongo is a hard boot requirement — no database, no server. Ports: API `4321`,
Vite `5175`, Mongo `27017`; only the host side moves, via `GM_API_PORT` /
`GM_WEB_PORT` / `GM_MONGO_PORT` in `.env`. Every published port binds
`127.0.0.1` — nothing here has auth, the tailnet is the access control. This
machine maps the client to `5176`.

## Layout

- `server/src/` — Nest: `guides/` (`GET /api/guides`), `progress/`
  (`GET`/`POST`/`DELETE /api/progress`), `render/` (`GET /guide`, `GET /asset`,
  served styles/scripts), `registry/` (read-only), `static.ts`.
- `client/src/` — React SPA: side rail, Guides view (iframe per guide),
  Settings. The Guides toolbar filters client-side over the fetched index — no
  route, no proxy entry. Its selects persist to `guide-manager.*` keys; the
  search query deliberately does not.
- `shared/` — registry/API types + theme tokens. `assets/` — reading aid +
  progress reporter, spliced into every framed guide.
- `skills/study/`, `skills/tutor/` — the published skills.
- `bin/register.js` — the registry's only writer. `bin/tailnet.js`,
  `bin/plugin-sync.js`.
- `backlog/` — one Markdown file per item (`backlog/README.md`).
  `docs/superpowers/` — design specs and implementation plans.

## Invariants

- **`skills/` is the plugin skill root** (`.claude-plugin/plugin.json`). Never
  copy skills under `.claude/skills` — they load twice and drift.
- **Edits under `skills/`, `bin/` or `assets/` are inert until committed,
  pushed, and `pnpm run plugin:sync` runs.** An install is a sparse copy of the
  pushed git HEAD (`.claude-plugin skills bin assets`), never the working
  tree. `plugin:sync` refuses a dirty payload, an unpushed HEAD, or a HEAD
  behind `origin/main`; it never commits or pushes. It uninstalls/reinstalls
  rather than `claude plugin update` (which stops at a matching `plugin.json`
  version), so no version bump per change; it no-ops when the install already
  matches HEAD, verifies by hash, and prunes older copies except `.in_use`.
  New skills load on the next Claude Code restart.
- **Every `${CLAUDE_PLUGIN_ROOT}/…` path a skill names must sit under
  `bin/plugin-sync.js`'s `PUBLISHED_PATHS`** — anything outside resolves in
  this repo but is missing on an installed copy. `bin/package.json` carries
  the `{"type":"module"}` that makes `bin/` ESM while the rest of the repo is
  CommonJS. Guarded by `test/plugin-sync.test.ts`.
- **`~/.guide-manager/registry.json` has exactly one writer:
  `bin/register.js`.** `RegistryService` re-reads it per request, never writes
  or caches — a guide registered mid-session shows up without a restart.
- **Every path `AssetsController` answers must appear in `vite.config.ts`'s
  proxy list.** A missing one does not 404 — the SPA fallback returns
  `index.html` as the stylesheet. Guarded by `test/vite-proxy.test.ts`.
- **Guide files serve through a registry-built allowlist**
  (`render/paths.util.ts`, `resolveAllowed`). A moved file is hidden, not an
  error. Container mounts are read-only host paths; a guide outside
  `GM_GUIDE_ROOT` silently drops off the board.
- **Editing `vite.config.ts` needs `docker compose restart client`** — Vite's
  in-place restart rebinds to localhost inside the container and the published
  port resets connections. Tailnet hosts are allowlisted there
  (`allowedHosts: ['.ts.net']`); Vite 5.4.12+ 403s an unknown Host.
- **A guide is a generated HTML page, never markdown.** `GET /guide` 404s
  anything else; `bin/register.js` refuses a `.md` guide at registration time.
- **The reading aid is spliced in by `GET /asset`, not the page shell** — the
  prose lives inside the iframe where the shell's scripts cannot reach.
  `injectReadingAid` skips any document already carrying a `bionic vN` header:
  two copies do not cooperate. Assets carry `bionic v3` — copy them into a
  guide, never retype. v3 runs with or without a vendored control panel and
  listens for `storage`, so framed guides repaint when Settings changes a value.
- **The progress reporter is served, not vendored**: `assets/progress.js`
  carries a `progress v1` header, `injectProgressReporter` refuses a document
  already holding a `progress vN`, and it is injected only for files the
  registry knows as guides (`guideMeta` without `type` marks a sibling HTML
  file, skipped).
- **The resume notice appends to the parent shell's `.crumbs`** — same-origin
  by design, no message channel. Breadcrumb line, never the title line (the
  title ellipsizes). The floating pill is only the fallback for a guide opened
  off disk with no shell, and is the one that fades.
- **A framed guide posts `{source:'guide-manager',kind:'progress'}` to
  `window.top` at send time** (not on response — the session's last write
  flushes during teardown); `useGuides` refetches coalesced at 300ms, and
  `GuidesView` refetches once more on the way back from the viewer. The
  message carries no numbers: any frame can post to top, so a stated percent
  could lie.
- **Starting a guide over has exactly one control**: the viewer header's
  `↺ reset` in `GuidesView`. It DELETEs the row, refetches, then bumps the
  iframe key — the reload strictly after the `DELETE` resolves, or the frame
  reports its old position and re-creates the row. The in-guide notice carries
  no second button on purpose.
- **A deck resumes by clicking its own `Next`, never by setting `.active`** —
  the deck owns the card index, tally, progress bar and button state. An
  unanswered quiz card legitimately gates the walk; the target stays pending
  until it clears.
- **`openCount` increments only on a write carrying `opened: true`;
  `furthestPercent` only climbs (`$max`)** — the board renders furthest, not
  current, so a card never walks backwards.
- **Port numbers live in `.env` and nowhere else, and no published port is
  wildcard-bound.** `bin/tailnet.js` reads `GM_WEB_PORT`, the same variable
  compose reads, so the two sides cannot drift. The API port is as sensitive
  as the web port — it answers the render routes and the built bundle.
  `test/tailnet-script.test.ts` asserts the general form, not three named
  ports, so a later service cannot quietly reopen the hole.
- **pnpm only**, pinned by `packageManager` and enforced via corepack in the
  image. `pnpm-workspace.yaml`'s `allowBuilds` gates install scripts —
  `esbuild` and `mongodb-memory-server` need theirs, and a skipped one
  surfaces far from the install (Vite refusing to start, e2e mongod failing).
  The file ships into the image beside the lockfile for the same reason.

## Conventions

- Comments explain *why*, at length — the existing density is deliberate;
  match it rather than stripping it.
- Tests are flat in `test/`, `*.test.ts` / `*.test.tsx`; component suites opt
  into jsdom with a `@jest-environment jsdom` docblock.
- Backlog items move `open/` → `done/`; `out-of-scope/` is flat.
