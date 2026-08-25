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

Mongo is a hard boot requirement: no database, no server. `app.module.ts` bounds
the connection retries and lets the process exit non-zero rather than idle with a
dead database.

Ports: API `4321`, Vite `5175`, Mongo `27017`. Only the host side moves, via
`GM_API_PORT` / `GM_WEB_PORT` / `GM_MONGO_PORT` in `.env` — inside the compose
stack they are fixed. This machine currently maps the client to `5176`.

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
- `backlog/` — file-based backlog, one Markdown file per item (`backlog/README.md`).
- `docs/superpowers/` — design specs and implementation plans.

## Invariants

- **`skills/` is the plugin skill root.** `.claude-plugin/plugin.json` publishes
  this repo as `guide-manager@guide-manager-marketplace`, and a plugin's skills
  load from `<root>/skills`. Do not move them under `.claude/skills` — a copy
  there loads the same skills twice and drifts.
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
