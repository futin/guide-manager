# guide-manager

Claude Code plugin repo that homes the `study` and `tutor` skills, plus a local
NestJS + React app that serves every registered guide — readable from a phone
over Tailscale while this Mac is awake.

## Commands

| Task | Command |
|---|---|
| Whole stack (mongo + api + vite) | `npm run docker:up` |
| Rebuild the stack from scratch | `npm run docker:sync` |
| API only, on the host | `npm run dev` |
| Client only, on the host | `npm run dev:web` |
| Tests | `npm test` (jest, `--runInBand`) |
| Types | `npm run typecheck` |
| Production build | `npm run build` |

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
- `client/src/` — React SPA: side rail, Guides view (guide framed in an iframe),
  Settings view.
- `shared/` — `types.ts` (registry + API shapes), `theme.css` (tokens).
- `assets/` — the bionic reading aid injected into rendered guide pages.
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
- **Reading-aid assets carry a `bionic v2` header.** Copy them into a guide;
  never retype. v2 listens for `storage` so a framed guide repaints when the
  Settings page changes a value.

## Conventions

- Comments explain *why*, at length, and the existing density is deliberate —
  match it rather than stripping it.
- Tests are flat in `test/`, `*.test.ts` / `*.test.tsx`; component suites opt
  into jsdom with a `@jest-environment jsdom` docblock.
- Backlog items move `open/` → `done/`; `out-of-scope/` is flat.
