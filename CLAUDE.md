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
  (`GET`/`POST /api/progress`), `render/` (`GET /guide`, `GET /asset`, plus
  `style.css`, `theme.css`, `bionic.css`, `bionic.js`), `registry/` (read-only
  view of the registry file), `static.ts` (serves `client/dist` when built).
- `client/src/` — React SPA: side rail (a plain section switch), Guides view
  (every registered project listed as a foldable bay, each guide framed in an
  iframe), Settings view. The Guides toolbar — search, project, type, sort — is
  entirely client-side over the fetched index: no route answers it, so nothing in
  `vite.config.ts`'s proxy list is involved. Its three selects persist to
  `guide-manager.project` / `.filterType` / `.sort`; the query deliberately does
  not persist.
- `shared/` — `types.ts` (registry + API shapes), `theme.css` (tokens).
- `assets/` — the bionic reading aid, spliced into every guide the app frames.
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
