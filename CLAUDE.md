# guide-manager

Claude Code plugin repo that homes the `study` and `tutor` skills, plus a local
NestJS + React app that serves every registered guide — readable from a phone
over Tailscale while this Mac is awake.

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

Mongo is a hard boot requirement: no database, no server. `app.module.ts` bounds
the connection retries and lets the process exit non-zero rather than idle with a
dead database.

Ports: API `4321`, Vite `5175`, Mongo `27017`. Only the host side moves, via
`GM_API_PORT` / `GM_WEB_PORT` / `GM_MONGO_PORT` in `.env` — inside the compose
stack they are fixed. All three publish on `127.0.0.1` alone — nothing here has
auth in front of it, and a laptop joins untrusted networks. This machine maps
the client to `5176`, and `pnpm run tailnet` is what puts that one port on the
tailnet, at that same number.

## Layout

- `server/src/` — Nest. `guides/` (`GET /api/guides`), `progress/`
  (`GET`/`POST`/`DELETE /api/progress`), `render/` (`GET /guide`, `GET /asset`,
  plus `style.css`, `theme.css`, `bionic.css`, `bionic.js`, `progress.js`),
  `registry/` (read-only view of the registry file), `static.ts` (serves
  `client/dist` when built).
- `client/src/` — React SPA: side rail (a plain section switch), Guides view
  (every registered project listed as a foldable bay, each guide framed in an
  iframe), Settings view. The Guides toolbar — search, project, type, sort — is
  entirely client-side over the fetched index: no route answers it, so nothing in
  `vite.config.ts`'s proxy list is involved. Its three selects persist to
  `guide-manager.project` / `.filterType` / `.sort`; the query deliberately does
  not persist.
- `shared/` — `types.ts` (registry + API shapes), `theme.css` (tokens).
- `assets/` — the bionic reading aid and the progress reporter, both spliced into
  every guide the app frames.
- `skills/study/`, `skills/tutor/` — the skills this repo publishes.
- `bin/register.js` — the only writer of the registry; the skills call it.
- `bin/tailnet.js` — registers a `tailscale serve` from the tailnet to the
  loopback web port, reading `GM_WEB_PORT` so the two sides cannot disagree.
- `bin/plugin-sync.js` — reinstalls the plugin from the pushed HEAD; the one
  way edits under `skills/`, `bin/` or `assets/` reach the running Claude Code.
- `backlog/` — file-based backlog, one Markdown file per item (`backlog/README.md`).
- `docs/superpowers/` — design specs and implementation plans.

## Invariants

- **`skills/` is the plugin skill root.** `.claude-plugin/plugin.json` publishes
  this repo as `guide-manager@guide-manager-marketplace`, and a plugin's skills
  load from `<root>/skills`. Do not move them under `.claude/skills` — a copy
  there loads the same skills twice and drifts.
- **Editing `skills/`, `bin/` or `assets/` changes nothing until it is
  committed, pushed, and `pnpm run plugin:sync` runs.** A plugin install is a
  copy, not a link: Claude Code loads
  `~/.claude/plugins/cache/guide-manager-marketplace/guide-manager/<version>/`,
  never the working tree, so an edited skill keeps teaching the old steps with
  nothing anywhere saying so. The marketplace source is the GitHub repo
  `futin/guide-manager`, sparse-checked-out to `.claude-plugin skills bin
  assets`, which is why an install is a few hundred KB instead of the 689MB a
  `directory` source copied — `node_modules` (473M) and the deliberately
  vendored `.pnpm-store` (201M) rode along, because the CLI honours no ignore
  file at all (checked against 2.1.246: no `.claudeignore`, no `.pluginignore`,
  no allowlist field in either manifest; and it rejects a `file://` source, so
  a local-only git source is not on the table). Git is therefore the publishing
  boundary: the installer sees pushed commits and nothing else, so
  `plugin:sync` refuses a dirty payload, an unpushed HEAD, or a HEAD behind
  `origin/main` rather than installing stale code and reporting success. It
  never commits or pushes for you. It also uninstalls and reinstalls rather
  than calling `claude plugin update`: that command compares the version in
  `plugin.json` and stops at "already at the latest version" however far the
  commit behind it has moved, and the cache directory is keyed by version, so
  the alternative would be a patch bump — another commit, another push — on
  every skills edit. A reinstall from a sparse source is cheap enough that the
  bump buys nothing, which is why `plugin.json`'s version is no longer touched
  per change. It no-ops when the installed copy already matches HEAD, verifies
  the landed payload by hash, and prunes older version copies — skipping any
  marked `.in_use`, which a running session still has open. New skills load on
  the next Claude Code restart, not in the session that ran the sync.
- **The sparse-checkout list and the skills are checked against each other.**
  Every `${CLAUDE_PLUGIN_ROOT}/…` path a skill names must sit under one of
  `bin/plugin-sync.js`'s `PUBLISHED_PATHS`; a reference outside them resolves
  in this repo and is missing on an installed copy — a failure that only ever
  shows up on a machine that installed rather than cloned. `bin/` is published
  for `register.js` and carries `bin/package.json` with it, the
  `{"type":"module"}` that makes the `bin/` scripts ESM while the rest of the
  repo is CommonJS; `assets/` is published because `study`'s visuals reference
  copies `bionic.js`/`.css`/`.html` out of it.
  `test/plugin-sync.test.ts` asserts the list against `skills/`.
- **`~/.guide-manager/registry.json` has exactly one writer**: `bin/register.js`,
  on the host. `RegistryService` re-reads it per request and never writes or
  caches it, so a guide registered mid-session shows up without a restart.
- **Every path `AssetsController` answers must appear in `vite.config.ts`'s proxy
  list.** A missing one does not 404 — Vite's SPA fallback returns `index.html`
  as the stylesheet and the guide renders unstyled. `test/vite-proxy.test.ts`
  asserts the list against the controller.
- **Guide files are served through an allowlist** built from the registry
  (`render/paths.util.ts`, `resolveAllowed`). A guide whose file moved is hidden
  from the board, not reported as an error.
- **Container mounts land on host paths**, read-only, because the registry stores
  absolute host paths. A guide outside `GM_GUIDE_ROOT` is silently dropped from
  the list.
- **Editing `vite.config.ts` needs `docker compose restart client`.** Vite's own
  in-place restart comes back bound to localhost inside the container, so the
  published port resets connections until the container is restarted. Tailnet
  hostnames are allowlisted there (`allowedHosts: ['.ts.net']`); Vite 5.4.12+
  403s an unknown Host.
- **A guide is a generated HTML page, never markdown.** `GET /guide` frames a
  tutor deck or a study guide's `index.html` build and 404s anything else;
  `bin/register.js` refuses a `.md` guide at the point the mistake is made. The
  old `marked` path rendered a directory guide's README hub alone — no chapters,
  no contents rail, mermaid fences as raw text — so it is gone, and with it the
  scroll-progress reporter, which could never see inside an iframe anyway.
- **The reading aid is spliced into the framed guide by `GET /asset`, not by the
  page shell.** The guide's prose lives inside the iframe, where a script on the
  host document cannot reach it — and the shell's only text is the breadcrumb,
  which the aid would then be decorating instead. `injectReadingAid` skips any
  document that already carries a `bionic vN` header, because two copies do not
  cooperate: each closes over its own `bound` flag and the second decorates the
  first's spans.
- **Reading-aid assets carry a `bionic v3` header.** Copy them into a guide;
  never retype. v3 runs with or without the control panel — a guide with no
  vendored panel is driven by the Settings page alone — and listens for
  `storage`, so a framed guide repaints when that page changes a value.
- **The progress reporter is served, not vendored**, and follows the reading
  aid's rules exactly: `assets/progress.js` carries a `progress v1` header,
  `injectProgressReporter` refuses any document that already holds a
  `progress vN`, and `GET /asset` splices it in — so a build generated before
  the reporter existed reports and resumes without being regenerated. It is
  injected only for a file the registry knows as a guide; `guideMeta`'s missing
  `type` is what tells a sibling HTML file apart from a guide.
- **The resume notice lives in the shell's header, reached across the frame
  boundary, and says only what happened.** `GET /guide`'s topbar is one document
  up from the reporter, and the two are same-origin on purpose — the shell
  already reaches the other way to `focus()` the frame — so `progress.js`
  appends the notice to the parent's `.crumbs` directly, no message channel. It
  goes on the breadcrumb line, not the title line: `.topbar-inner` is capped at
  44rem and `.crumb-title` ellipsizes, so a notice on the title row truncates
  the guide's own name. The floating pill is only the fallback for a guide with
  no shell around it (opened straight off disk), which is why it is the one that
  fades: it occludes the guide, and the header does not.
- **A framed guide announces every write, and the board refetches on it.**
  `GET /api/guides` is fetched when the Guides view mounts, so nothing a guide
  writes while it is being read reaches the board on its own — the card kept
  claiming the percent it held when the tab loaded, correct only after a page
  refresh. `assets/progress.js` posts `{source:'guide-manager',kind:'progress'}`
  to `window.top` at *send* time (not on the response: the last write of a
  session is flushed as the frame is torn down), `useGuides` listens and
  refetches coalesced at 300ms, and `GuidesView` refetches once more on the way
  back from the viewer — that last one covers the write that lands after the
  message has already been handled. The message carries no numbers on purpose:
  any script in any frame can post to the top window, so a message that named a
  percent would be one that could lie about it.
- **Starting a guide over has exactly one control**, the viewer header's `↺
  reset` in `GuidesView`. It deletes the row, refetches the board, *and* bumps
  the key on `.guide-viewer-frame` so the guide reloads — a guide with no stored
  position opens at its own beginning, so a reload is the whole of starting
  over and the reporter needs no instruction. The reload happens after the
  `DELETE` resolves, never beside it: a frame that came back first would report
  the position it still had and re-create the row. The notice inside the guide
  deliberately carries no second button — two controls for one job are two
  implementations that have to agree forever, and in the pill's one exclusive
  case (a guide opened off disk) there is no server to answer a `DELETE`
  anyway.
- **A deck is resumed by clicking its own `Next`, never by setting `.active`.**
  The deck owns `currentCardIndex`, the score tally, the progress bar and the
  disabled state of `Next`; a hand-set card leaves all four describing a screen
  that is not there, and the reader's next `Back` tap jumps to card one. An
  unanswered quiz card legitimately stops the walk — quiz answers are not
  stored, so resuming past a gate would be a claim the reader never earned. The
  target stays pending and the walk resumes when the gate clears.
- **`openCount` increments only on a write carrying `opened: true`**, and
  `furthestPercent` only ever climbs (`$max`). The first keeps a session counter
  from becoming a scroll-event counter now that the reporter writes on every
  move; the second is what the board renders, because a card showing the current
  position would walk backwards whenever the reader glanced at chapter one.
- **The web port's number lives in `.env` and nowhere else, and the host side of
  it is loopback.** `docker-compose.yml` publishes
  `127.0.0.1:${GM_WEB_PORT:-5175}:5175`, and `bin/tailnet.js` reads the same
  variable to register `tailscale serve --http=$PORT http://127.0.0.1:$PORT` —
  identical numbers on two different addresses, so they never contend for one
  socket. The wildcard bind this replaced put the board, and through it a
  read-only window onto this filesystem, on every network the laptop joins;
  there is no auth in front of it, so the tailnet *is* the access control. A
  serve command typed by hand instead would store a second copy of the port
  inside tailscaled, outside git and untested, and the drift surfaces as a 502
  on the phone that reads like a Tailscale fault.

  The same loopback rule covers the other two publishes, and the suite asserts
  the general form — *no* published port is wildcard-bound — rather than three
  named ones, so a service added later cannot quietly reopen the hole. The API
  port matters as much as the web port: it answers the render routes and the
  built bundle, so exposing it re-exposes the whole board with the Vite port
  shut. Mongo runs unauthenticated and is only ever reached by service name over
  the compose network; its publish is a convenience for host-side `pnpm run dev`
  and mongosh. `test/tailnet-script.test.ts` asserts all of it.
- **pnpm is the only package manager here**, pinned by `packageManager` in
  `package.json` and enforced in the image through corepack. `npm install` would
  write a `package-lock.json` nobody reads and a flat `node_modules` that
  disagrees with the lockfile.
- **A dependency's install script does not run unless `pnpm-workspace.yaml`
  says so.** `allowBuilds` lists `esbuild` and `mongodb-memory-server`; both
  fetch a binary in `postinstall`, and a skipped one surfaces far from the
  install — Vite refusing to start, or the e2e suites failing to boot mongod.
  The file has to be copied into the image alongside the lockfile for the same
  reason.

## Conventions

- Comments explain *why*, at length, and the existing density is deliberate —
  match it rather than stripping it.
- Tests are flat in `test/`, `*.test.ts` / `*.test.tsx`; component suites opt
  into jsdom with a `@jest-environment jsdom` docblock.
- Backlog items move `open/` → `done/`; `out-of-scope/` is flat.
