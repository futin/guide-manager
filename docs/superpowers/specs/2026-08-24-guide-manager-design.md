# guide-manager — Design

**Date:** 2026-08-24
**Status:** Approved (brainstorm session, remote dashboard)

## Overview

`guide-manager` is a Claude Code **plugin repo** that serves two purposes:

1. **Home for the `study` and `tutor` skills** — currently unversioned in
   `~/.claude/skills/`. Moving them into a plugin gives git history,
   versioned updates, and a single place to evolve them.
2. **Central viewer for all guides** — every project keeps owning its own
   study guides and tutor decks on disk; guide-manager only knows *where*
   they are (a registry) and *displays* them (a local server), reachable
   from a phone via Tailscale.

## Goals

- One overview of all guides/decks across all local projects.
- Readable from a phone (via Tailscale) whenever the Mac is awake.
- Guides stay in and owned by their projects — guide-manager never copies
  or stores guide content.
- `study`/`tutor` skills live under git.

## Non-goals (v1)

- No public hosting, no GitHub Pages, no build-step aggregation.
- No search, no auth (Tailscale is the auth), no editing, no git
  integration in the viewer.
- No per-project workflows or UI pages.

## Decisions made

| Decision | Choice |
|---|---|
| Delivery to phone | Local Node server + Tailscale (no public exposure) |
| Project discovery | Skills auto-register on guide write |
| Skill home | Plugin repo (skills move in; `~/.claude/skills` copies retire) |
| Server runtime | Node, zero/minimal deps (one markdown-renderer dep) |
| Server lifecycle | macOS LaunchAgent (launchd), KeepAlive, autostart |

These choices eliminate the original concerns: nothing is ever published
(no private-data exposure, no Pages-exclusion problem), and the plugin's
purpose is homing the skills, so the repo is never purposeless.

## Repo layout

```
guide-manager/
  .claude-plugin/plugin.json     # plugin manifest
  skills/
    study/                       # moved verbatim from ~/.claude/skills/study
    tutor/                       # moved verbatim from ~/.claude/skills/tutor
  bin/
    register.js                  # skills call this after writing a guide
  server/
    server.js                    # node http server, port 4321
    public/                      # css + minimal js for the index UI
  launchd/
    com.guide-manager.plist
    install.sh                   # copies plist to ~/Library/LaunchAgents, loads it
  docs/superpowers/specs/        # this spec, future specs
  .gitignore                     # registry.json, node_modules, logs
```

Registry data itself lives outside the repo entirely, at
`~/.guide-manager/registry.json` (see below) — machine-local, and reachable
from both a normal checkout and any physical plugin-cache copy without a
split-brain.

Installed like the existing caveman/timify plugins so both skills remain
available globally in every project.

## Components

### 1. Registry (`~/.guide-manager/registry.json`)

```json
{
  "projects": [
    {
      "name": "claude-space",
      "path": "/Users/andrejajevtic/Documents/custom-projects/claude-space",
      "guides": [
        {
          "type": "study",
          "title": "How the journal rituals work",
          "path": "/Users/.../claude-space/guides/journal-rituals/README.md",
          "updated": "2026-08-24T10:00:00Z"
        }
      ]
    }
  ]
}
```

- Lives at `~/.guide-manager/registry.json` — machine-local, outside the
  repo and outside any plugin-cache copy of it, so the CLI (invoked from a
  plugin install via `${CLAUDE_PLUGIN_ROOT}`) and the server (run from this
  repo) always agree on one file. Override with `GM_REGISTRY_FILE`, which
  takes precedence over the default.
- Fresh clone ⇒ empty registry; entries repopulate as guides are written.
- `type` is `"study"` or `"tutor"`.

### 2. `bin/register.js`

CLI called by the skills at wrap-up:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/register.js \
  --project <abs path> --guide <abs path> --type study|tutor --title "..."
```

- Idempotent: dedupes by guide `path`; re-registering updates `title` and
  `updated`.
- Creates `registry.json` if missing; derives project `name` from the
  directory basename.
- Never fails the skill's wrap-up: registration errors print a warning and
  exit 0 (a guide written but unregistered is recoverable; a broken
  wrap-up is worse).

### 3. Skill modifications

One added wrap-up step in each SKILL.md:

- **study:** after writing the guide (single file or directory), run
  `register.js` with the guide's entry point (the file, or the
  directory's `README.md`).
- **tutor:** after writing the deck HTML, run `register.js` with the deck
  path.

No other behavioral changes to either skill.

### 4. Server (`server/server.js`)

Node built-in `http`, one dependency (`marked` or similar) for markdown.

Routes:

- `GET /` — index page: projects grouped, each guide listed with a type
  badge (study/tutor) and updated date. Mobile-first plain HTML/CSS.
  Entries whose `path` no longer exists on disk are hidden (marked stale
  in server log).
- `GET /guide?p=<encoded abs path>` —
  - `.md`: rendered to HTML server-side, wrapped in the same mobile CSS.
    Relative links/images resolve against the guide file's directory.
  - `.html` (tutor decks are self-contained): served verbatim.
- `GET /asset?p=<encoded abs path>` — images/files referenced by guides.

**Path safety (the one security rule):** the server serves only

1. paths that exactly match a registry entry, or
2. files inside a registered guide's parent directory (for multi-file
   study guides and their assets),

after `realpath` resolution — symlink escapes and `../` traversal are
rejected. Everything else is 404. No directory listing outside that. No
auth in v1; the Tailscale network boundary is the access control.

Binds `0.0.0.0:4321`; reachable as `http://<mac-tailscale-name>:4321`.

### 5. launchd lifecycle

- `com.guide-manager.plist`: LaunchAgent, `KeepAlive`, `RunAtLoad`,
  stdout/stderr to `~/Library/Logs/guide-manager.log`.
- `install.sh`: copies plist into `~/Library/LaunchAgents/`, `launchctl load`.
  Also prints the Tailscale URL as a sanity check.

## Data flow

1. In any project, `/study` or `/tutor` writes a guide/deck into that
   project (as today).
2. Skill wrap-up calls `register.js` → appends/updates `registry.json`
   in the guide-manager repo.
3. Phone opens `http://<mac>:4321` → server reads `registry.json` live →
   index → tap a guide → rendered markdown or verbatim deck, read straight
   from the owning project's disk.

## Error handling

- Registry missing/corrupt: server serves an empty index with a hint,
  never crashes; `register.js` recreates the file.
- Guide path gone (project moved/deleted): hidden from index, logged.
- Render failure on a markdown file: raw text fallback in a `<pre>`.

## Migration plan

1. Scaffold repo, server, registry, launchd. Verify from phone.
2. `git mv`-equivalent: copy `~/.claude/skills/study` and `tutor` into
   `skills/`, add the register wrap-up step, install as plugin.
3. Verify both skills trigger from another project via the plugin.
4. Delete `~/.claude/skills/study` and `~/.claude/skills/tutor`.
5. Optionally back-register existing guides by running `register.js` by
   hand per known guide.

## Testing

- Unit: `register.js` (create, dedupe, update, corrupt-registry recovery);
  server path-allowlist (registered path ok, sibling ok, traversal and
  symlink escape rejected, unregistered 404).
- Manual: index + one study guide + one tutor deck from the phone over
  Tailscale; launchd survives reboot.
