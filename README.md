# guide-manager

A Claude Code plugin that homes two teaching skills — `study` and `tutor` — and
a small local web app that collects every guide they generate, across every
project, into one board you can read from your phone.

The skills write guides into whatever project they were run in. Each one
registers itself in `~/.guide-manager/registry.json`. This app reads that
registry, serves each registered guide with a breadcrumb bar and the reading aid
around it, and tracks which ones you have opened.

- **No auth.** The Tailscale network boundary is the access control, and it is
  load-bearing: every published port binds `127.0.0.1`, and `pnpm run tailnet`
  is the one thing that puts the web port on the tailnet. Nothing is exposed
  publicly, and nothing is exposed to whatever wifi this laptop is on.
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
| `http://localhost:5175` | Vite dev server: hot reload, proxies `/api`, `/guide`, `/asset` to the API. Published on loopback only — see [Read it from your phone](#read-it-from-your-phone) for the tailnet route in |
| `http://localhost:4321` | The API, the guide render routes, and the built client bundle. Loopback only, like every published port here — reachable from this machine, not from the network |

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
| `GM_WEB_PORT` / `GM_API_PORT` / `GM_MONGO_PORT` | `5175` / `4321` / `27017` | Host-side ports, for when something else already holds one. `GM_WEB_PORT` is read by `pnpm run tailnet` too, and is the tailnet port as well as the local one |
| `GM_GUIDE_ROOT` | `~/Documents/custom-projects` | The tree mounted read-only into the server container |

A guide outside `GM_GUIDE_ROOT` is invisible to the container and drops off the
board silently — widen the mount if you write guides elsewhere.

## Install the skills

The repo is its own plugin marketplace, published from GitHub with a sparse
checkout so an install carries the skills and the two directories they reach
for — not the whole working tree:

```bash
claude plugin marketplace add futin/guide-manager --sparse .claude-plugin skills bin assets
claude plugin install guide-manager@guide-manager-marketplace
```

That gives every project `/study` and `/tutor`. Both skills call
`bin/register.js` at the end of a run, so a new guide appears on the board
without a restart.

An install is a copy, not a link, and the installer reads git rather than the
working tree — so edits under `skills/`, `bin/` or `assets/` reach a running
Claude Code only once they are committed, pushed, and:

```bash
pnpm run plugin:sync
```

That refuses a dirty or unpushed tree instead of installing stale code,
reinstalls from the pushed HEAD, prunes older cached copies, and tells you to
restart Claude Code. It never commits or pushes for you.

Registering by hand:

```bash
node bin/register.js --project /abs/path/to/project --guide /abs/path/to/guide/index.html --type study --title "Some guide"
```

`--type` is `study` or `tutor`, and `--guide` must name a generated HTML page —
a study guide's `index.html` build or a tutor deck, never the markdown it was
built from. `--remove --guide <abs>` drops one again, and drops its project with
it once that was the last guide. A failed registration is a warning, never an
error — it must not break the calling skill's wrap-up.

## Read it from your phone

The web port is published on `127.0.0.1` only, and Tailscale is what puts it on
the network: `pnpm run tailnet` registers a `tailscale serve` proxy from the
node's own tailnet address to that loopback port, on the same port number.

```bash
pnpm run docker:up
pnpm run tailnet
```

The second command prints the URL to open on the phone — for example
`http://my-mbp.tailXXXX.ts.net:5176`. Subcommands:

| Command | What it does |
|---|---|
| `pnpm run tailnet` | Register the serve, print the tailnet URL |
| `pnpm run tailnet status` | What tailscaled is serving, plus whether the local port answers |
| `pnpm run tailnet down` | Unregister |

The registration persists across reboots, so this is a once-per-machine step
rather than part of the daily loop. It reads `GM_WEB_PORT` from `.env` — the same
value compose reads — so the tailnet port and the local port are always the same
number, and changing one changes both. That matters with several projects on one
machine: each one's port is its own name, and there is no second copy of it
inside tailscaled to drift out of date.

The web port is the only one on the tailnet. The API port answers the same board
once `pnpm run build` has run, but it is loopback-bound like everything else and
gets no serve of its own — put one in front of `GM_API_PORT` yourself if you want
to read the production bundle from the phone instead of the dev server.

Requirements: Tailscale on both the Mac and the phone, both logged into the same
tailnet, and MagicDNS on for the name to resolve (the `100.x` address works
either way). It is reachable from anywhere — cellular, another country — not just
your local network; if the two devices cannot open a direct path, Tailscale
relays. Nothing outside your tailnet can reach it, which is the whole access
control here.

The Mac has to be awake. `caffeinate -s` for a session, or a launchd agent if you
want it always on.

`vite.config.ts` allowlists `.ts.net` hosts — without that, Vite 5.4.12+ answers
a tailnet name with a 403 rather than the app. One catch when editing that file:
Vite's in-place restart comes back bound to localhost inside the container and
the published port then refuses connections, so run
`docker compose restart client` after touching it.

### Why plain HTTP

The URL says `http://`, but nothing crosses the internet in the clear: the hop
between phone and Mac is WireGuard-encrypted end to end, and the HTTP exists only
inside that tunnel, between tailscaled and a loopback socket.

The browser will still mark it Not secure, and secure-context APIs (service
workers, clipboard, `getUserMedia`) stay unavailable. Nothing here needs one. If
that ever changes, `tailscale serve --bg --https=443 http://127.0.0.1:$GM_WEB_PORT`
gets a real Let's Encrypt cert on the node's MagicDNS name — at the cost of the
matching-port property, since `--https` accepts only 443, 8443 and 10000.

Do not use `tailscale funnel` for this. Funnel publishes to the public internet,
and the board serves guides read off this filesystem with no authentication in
front of them.

Avoid mounting the app under a path (`--set-path`) either — the SPA references
`/assets`, `/api` and `/guide` absolutely, so it breaks anywhere but a root.

## Architecture

```
skills (study, tutor)  ->  bin/register.js  ->  ~/.guide-manager/registry.json
                                                        |
                                                   read-only
                                                        v
  React SPA (client/)  <->  Nest API (server/)  ->  guide .html on disk
                                    |
                                  Mongo (reading progress)
```

- `server/src/registry/` — read-only view of the registry, re-read per request so
  a just-registered guide shows up immediately.
- `server/src/render/` — `GET /guide?p=<abs path>` puts a breadcrumb bar around
  the guide and frames it, so the build's own inline CSS/JS reach the browser
  untouched; `GET /asset` serves the framed document — with the reading aid
  spliced in — and everything sitting next to it verbatim. Both resolve through
  an allowlist built from the registry, so only registered trees are reachable.
- `server/src/guides/` — `GET /api/guides`: the board, with progress joined in.
- `server/src/progress/` — `GET`/`POST /api/progress`, stored in Mongo.
- `assets/` — the bionic reading aid (bold word-openings), spliced into every
  guide the app frames; the Settings page and a guide's own panel, where it has
  one, write the same key, and the guide repaints live.
- `client/src/` — side rail, Guides board with the guide framed in an iframe, and
  Settings.

## Development

```bash
pnpm test         # jest, --runInBand (mongodb-memory-server for the e2e suites)
pnpm run typecheck # tsc --noEmit
pnpm run build    # nest build + vite build
pnpm run tailnet  # publish the web port to the tailnet (up | status | down)
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
| `bin/` | `register.js`, the registry's only writer; `tailnet.js`, the tailscale serve wrapper |
| `backlog/` | File-based backlog, one Markdown file per item |
| `docs/superpowers/` | Design specs and implementation plans |
