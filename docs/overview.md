# guide-manager — overview

guide-manager is two things in one repo: a Claude Code plugin that ships the `study` and `tutor` skills, and a local NestJS + React app that collects every
HTML guide those skills generate, across every project on the machine, into one board readable from a phone over Tailscale. The skills write guides into
the project they ran in and register each one; the app only reads — it frames registered guides, remembers how far you got, and keeps the blocks you saved.

## Map

| Doc | What it covers |
|---|---|
| [README.md](../README.md) | Setup, configuration, installing the plugin, the tailnet route to a phone, CI and releases |
| [CLAUDE.md](../CLAUDE.md) | Commands and the normative rules a working session must keep — one line each, explained elsewhere |
| [subsystems/render.md](subsystems/render.md) | `GET /guide` and `GET /asset`: the registry allowlist, the page shell, and the scripts spliced into every framed guide |
| [subsystems/favorites-progress.md](subsystems/favorites-progress.md) | Reading progress and saved favorites, from the framed guide to Mongo and back to the board |

Design specs and implementation plans under `docs/superpowers/` are records of the moment they were written, not maintained reference.

## Architecture

```
skills (study, tutor)  ->  bin/register.js  ->  ~/.guide-manager/registry.json
                                                        |
                                                   read-only
                                                        v
  React SPA (client/)  <->  Nest API (server/)  ->  guide .html on disk
                                    |
                            Mongo (reading progress, favorites)
```

The seams, and what owns each side:

- **Registry.** [`bin/register.js`](../bin/register.js) is the only writer of `~/.guide-manager/registry.json`; the skills call it at the end of a run.
  [`server/src/registry/`](../server/src/registry/) re-reads the file on every request and never writes it, so a guide registered mid-session appears
  without a restart. Everything the server will serve is derived from it.
- **Render.** [`server/src/render/`](../server/src/render/) turns a registered path into a framed page: a shell with the breadcrumb bar around an iframe,
  and the guide document itself with the reading aid, progress reporter and favorites capture script spliced in. Only files reachable through the
  registry-built allowlist are served. See [subsystems/render.md](subsystems/render.md).
- **Board API.** [`server/src/guides/`](../server/src/guides/) answers `GET /api/guides`: the registry joined with stored progress.
  [`server/src/progress/`](../server/src/progress/) and [`server/src/favorites/`](../server/src/favorites/) are the two Mongo-backed collections the
  framed guide writes to. See [subsystems/favorites-progress.md](subsystems/favorites-progress.md).
- **Releases.** [`server/src/releases/`](../server/src/releases/) answers `GET /api/releases` from this checkout's own `vX.Y.Z` tags through release-kit's
  reader; the version chip and What's new drawer in the rail are ui-kit's. The release process itself is in README §Releases.
- **Client.** [`client/src/`](../client/src/) is the SPA: a side rail that owns the project scope, the Guides board with the viewer iframe, the Favorites
  view, and Settings. In development Vite serves it and proxies the API and render routes; once `pnpm run build` has produced `client/dist`, the Nest server serves the
  bundle too ([`server/src/static.ts`](../server/src/static.ts)), and stays useful without it.
- **Shared.** [`shared/`](../shared/) holds the registry and API types both sides compile against, and the theme tokens. [`assets/`](../assets/) holds
  the scripts served into framed guides.
- **Plugin payload.** [`skills/`](../skills/) is the plugin's skill root. An installed copy is a sparse checkout of the pushed HEAD
  (`.claude-plugin skills bin assets`), refreshed by [`bin/plugin-sync.js`](../bin/plugin-sync.js) — never the working tree.

<!-- docs-sync:
  sources:
    - bin/
    - server/src/
    - client/src/
    - shared/
    - assets/
    - .claude-plugin/
  kind: overview
  verified: 639b11139b1999cd6d7f473580d6370099a8f7db
-->
