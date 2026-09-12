---
id: idea-4
title: Preview a favorite's selection while a modifier key is held
created: 2026-09-11
tags: favorites, picker
---

## Problem

The favorites picker used to preview the selection on `mousemove`, and the
selection chased the pointer: crossing a guide to reach the toolbar re-picked
every block on the way, and every heading it crossed took a whole passage with
it. Landing on anything meant out-running a target that moved. That listener is
gone — selection is a tap now (`assets/favorites.js`, `enter()`).

What went with it was the one thing hover was good at: scanning a guide and
seeing what each block would resolve to without committing to any of them. A
reader who does not know whether a table or the card around it is the unit they
want now has to tap, look at the toolbar label, and tap somewhere else.

## Rough shape

Re-bind `mousemove` in `enter()`, but no-op unless a modifier is held —
`event.ctrlKey` (or `metaKey` on a Mac, which is the same finger). Preview is
then something the reader asks for, and the default pointer behaviour stays
inert.

The old guards come back with it: no pick when `candidateAt` returns null (a
pointer crossing the pager or the toolbar must not clear the selection), and
no pick onto something the current selection already contains (a reader who
pressed `wider` from a table to its card and then moved toward the toolbar
crosses that table on the way). Those were `same()` and `within()`, deleted in
the same change — git history has them.

## Open questions

- Releasing the key while the pointer is stationary fires no `mousemove`, so
  the preview box lingers until the next move. Does that need a `keyup`
  listener that restores the last *tapped* selection — which means keeping
  "what was tapped" separately from "what is shown" — or is a stale box until
  the next twitch acceptable?
- Does a modifier-held preview become the selection when the key is released,
  or is a tap still required to commit? The first is fewer actions; the second
  keeps "a pick is a decision", which is the rule this change established.
- `ctrl` on a Mac opens the context menu on mousedown. Only `mousemove` is
  listened to, so this may not collide in practice — worth checking on a real
  trackpad before picking the key.
