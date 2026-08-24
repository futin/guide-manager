# guide-manager

A Claude Code plugin that homes two teaching skills — `study` and `tutor` — and
a small local web app that collects every guide they generate, across every
project, into one board you can read from your phone.

The skills write guides into whatever project they were run in. Each one
registers itself in `~/.guide-manager/registry.json`. This app reads that
registry, renders any registered Markdown guide as a styled page, and tracks how
far through each one you are.

- **No auth.** The Tailscale network boundary is the access control — nothing is
  exposed publicly.
- **No search, no editing, no git integration.** It is a reader.

## Requirements

- Node 22.13+ (pnpm 11 requires it)
- pnpm 11+ (`corepack enable`, then `corepack prepare --activate` in this repo)
- Docker (or a local MongoDB if you prefer running the Node processes bare)

## Quick start

```bash
cp .env.example .env
pnpm run docker:up
```

That brings up three containers — Mongo, the Nest API on `:4321`, and the Vite
dev server on `:5175`. Open whichever suits you:

| URL | What it is |
|---|---|
| `http://localhost:5175` | Vite dev server: hot reload, proxies `/api`, `/guide`, `/asset` to the API |
| `http://localhost:4321` | The API, the guide render routes, and the built client bundle |

`pnpm run docker:down` stops it; `pnpm run docker:sync` tears down and rebuilds.

To run the Node processes on the host instead, start only the database
(`docker compose up -d mongo`) and then `pnpm run dev` (API) and `pnpm run dev:web`
(client) in separate shells.

### Configuration

Everything lives in `.env`; `.env.example` documents each key.

| Key | Default | Purpose |
|---|---|---|
| `MONGO_URL` | `mongodb://localhost:27017/guide-manager` | Required at boot — no database, no server |
| `PORT` | `4321` | API, render routes, and client bundle |
| `GM_REGISTRY_FILE` | `~/.guide-manager/registry.json` | Where `bin/register.js` writes |
| `GM_WEB_PORT` / `GM_API_PORT` / `GM_MONGO_PORT` | `5175` / `4321` / `27017` | Host-side ports, for when something else already holds one |
| `GM_GUIDE_ROOT` | `~/Documents/custom-projects` | The tree mounted read-only into the server container |

A guide outside `GM_GUIDE_ROOT` is invisible to the container and drops off the
board silently — widen the mount if you write guides elsewhere.

## Install the skills

The repo is its own plugin marketplace:

```bash
claude plugin marketplace add /path/to/guide-manager
claude plugin install guide-manager@guide-manager-marketplace
```

That gives every project `/study` and `/tutor`. Both skills call
`bin/register.js` at the end of a run, so a new guide appears on the board
without a restart.

Registering by hand:

```bash
node bin/register.js --project /abs/path/to/project --guide /abs/path/to/guide.md --type study --title "Some guide"
```

`--type` is `study` or `tutor`. A failed registration is a warning, never an
error — it must not break the calling skill's wrap-up.

## Read it from your phone

The app binds `0.0.0.0`, so any device on your tailnet can reach it. With
Tailscale installed on both the Mac and the phone, and MagicDNS on:

```bash
tailscale status
```

Then open `http://<mac-tailscale-name>:4321` on the phone — for example
`http://my-mbp.tailXXXX.ts.net:4321`. Port `4321` is the one to reach for: it
serves the built client bundle plus the guide routes, and needs no dev server
running.

The Vite port works from the tailnet too (`vite.config.ts` allowlists `.ts.net`
hosts — without that Vite 5.4.12+ answers a tailnet name with a 403), so you can
read on the phone with hot reload while editing. One catch: Vite's in-place
restart after a config edit comes back bound to localhost only, and the published
port then refuses connections. `docker compose restart client` after touching
`vite.config.ts`.

### HTTPS

Plain `http://` over the tailnet is already encrypted — WireGuard does that —
but the browser still marks it Not secure, and secure-context APIs (service
workers, clipboard, `getUserMedia`) stay unavailable. To get a real cert,
`tailscale serve` fronts the app with TLS on the node's own MagicDNS name:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:4321
```

That yields `https://<mac-tailscale-name>:8443` with a Let's Encrypt cert, and
persists across reboots (`tailscale serve --https=8443 off` to undo).

Check `tailscale serve status` before choosing a port: a node has one root per
port, and another project may already own `443`. Avoid mounting this app under a
path (`--set-path`) — the SPA references `/assets`, `/api` and `/guide`
absolutely, so it breaks anywhere but a root.

The Mac has to be awake. `caffeinate -s` for a session, or a launchd agent if you
want it always on.

## Architecture

```
skills (study, tutor)  ->  bin/register.js  ->  ~/.guide-manager/registry.json
                                                        |
                                                   read-only
                                                        v
  React SPA (client/)  <->  Nest API (server/)  ->  guide .md on disk
                                    |
                                  Mongo (reading progress)
```

- `server/src/registry/` — read-only view of the registry, re-read per request so
  a just-registered guide shows up immediately.
- `server/src/render/` — `GET /guide?p=<abs path>` renders Markdown to a styled
  page; `GET /asset` serves files sitting next to a guide (images, plus raw `.md`
  as text for deck frames). Both resolve through an allowlist built from the
  registry, so only registered trees are reachable.
- `server/src/guides/` — `GET /api/guides`: the board, with progress joined in.
- `server/src/progress/` — `GET`/`POST /api/progress`, stored in Mongo.
- `assets/` — the bionic reading aid (bold word-openings) injected into rendered
  guides; the Settings page and the in-guide panel write the same key, and the
  guide repaints live.
- `client/src/` — side rail, Guides board with the guide framed in an iframe, and
  Settings.

## Development

```bash
pnpm test         # jest, --runInBand (mongodb-memory-server for the e2e suites)
pnpm run typecheck # tsc --noEmit
pnpm run build    # nest build + vite build
```

Tests are flat in `test/`. Component suites opt into jsdom with a
`@jest-environment jsdom` docblock; everything else runs in node.

## Repo layout

| Path | Contents |
|---|---|
| `skills/` | The published skills — this is the plugin's skill root |
| `server/` | Nest API, render routes, registry reader |
| `client/` | React SPA |
| `shared/` | Types and theme tokens shared by both |
| `assets/` | Reading-aid CSS/JS vendored into guides |
| `bin/` | `register.js`, the registry's only writer |
| `backlog/` | File-based backlog, one Markdown file per item |
| `docs/superpowers/` | Design specs and implementation plans |
