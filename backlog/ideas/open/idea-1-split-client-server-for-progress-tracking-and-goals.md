---
id: idea-1
title: Split client/server for progress tracking and goals
created: 2026-08-24
tags: architecture, server, ui
---

## Problem

Planned features go beyond read-only viewing: per-guide progress tracking
(which sections/lessons are done) and learning goals. Those imply mutable
per-user state and interactive UI, which the current all-server-rendered
viewer has no place for.

Today the server is pure SSR: `server/server.js` builds HTML strings,
`server/lib/render.js` wraps them, and there is zero client JavaScript. The
design spec's non-goals for v1 are "no search, no auth, no editing" and the
server constraint is "Node, zero/minimal deps (one markdown-renderer dep)".

The open question is whether progress/goals warrant extracting a JSON API
plus a client app, or whether they fit inside the existing SSR shape.

## Rough shape

Two paths considered:

1. **Stay SSR (current lean).** Registry gains progress fields, one or two
   POST routes (`/progress`, `/goals`), and a small amount of inline
   progressive-enhancement JS for checkbox toggling. No build step, no
   bundler, still readable from a phone with JS off. `server/lib/render.js`
   already isolates the render layer, so a later swap stays cheap.

2. **Split now.** `server/` becomes JSON-only (`/api/guides`,
   `/api/progress`), a client app owns routing and state, launchd serves the
   built bundle. Costs a build step, a bundler dep, and a second deploy
   surface on what is currently a three-file server.

Decision on 2026-08-24: defer. Keep SSR, revisit only when a feature
genuinely needs client-held state that server round-trips make awkward.

## Open questions

- Where does progress state live — extend `~/.guide-manager/registry.json`,
  or a separate `progress.json` so the registry stays purely a location index?
- Is progress per-guide, per-heading, or per-tutor-lesson? Tutor decks
  already have a lesson structure that study guides do not.
- Multi-device: registry is machine-local. Does progress written from the
  phone (via Tailscale) need any conflict handling, or is last-write-wins
  fine for a single-user tool?
- What concretely triggers revisiting the split — first feature that needs
  optimistic UI? Or an offline/PWA requirement?
