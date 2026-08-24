---
id: task-7
title: Guides toolbar: search, filter, sort
created: 2026-08-24
---

## Goal

One toolbar row above the bays — search input plus three selects (project,
type, sort) — per the approved mockups
(https://claude.ai/code/artifact/1e702456-4239-4fb4-bdfd-8e91a6beb26e). Search
matches titles only (never content). Depends on task-4 (bays), task-5 (fold
state to auto-expand), task-6 (createdAt to sort by).

## Plan

1. `GuidesView.tsx` bar gains, in order: search input, project select, type
   select, sort select. All filtering/sorting is client-side over the fetched
   index — no server or vite.config.ts proxy change (the invariant list is
   untouched because no new asset path appears).
2. Search: case-insensitive substring over `guide.title`. Plain `useState` —
   deliberately not persisted; a remembered query would look like a broken
   board next visit.
3. Project select: "All projects" + one option per registered project (label
   name, value path). Persisted as `usePersistedState('guide-manager.project',
   'all')` — the same key the drawer used, values compatible. Port the old
   fail-open: a stored path no longer in the index reads as "all", so a stale
   scope can never blank the board silently.
4. Type select: All / study / tutor, persisted `'guide-manager.filterType'`.
5. Sort select, persisted `'guide-manager.sort'`, applied WITHIN each bay
   (bays themselves stay in index order):
   - `created` (default): createdAt desc — newest first;
   - `name`: title asc via localeCompare;
   - `type`: study before tutor, title asc inside each.
6. Composition: project narrows to one bay (its header stays — it is the name
   on screen); search/type hide non-matching cards and any bay left empty. Two
   distinct empty states: "nothing registered yet" (empty index) vs "no
   matches" (filters ate everything, offer nothing else).
7. Auto-expand: while the query is non-empty, a collapsed bay containing a
   match renders expanded — derived at render time, the stored
   `collapsedBays` value untouched (see the pointer left by task-5).
8. Styling per mockup: steel wells, hairline borders, mono 10px; native
   `<select>` elements styled like the removed `.guides-scope`. The row wraps
   on phone widths.

## Test cases

- jsdom: search narrows cards, hides emptied bays, auto-expands a collapsed
  bay with a match, and leaves stored fold state unchanged.
- Type filter and project select narrow correctly; stale stored project path
  falls open to All.
- Sort orders within a bay for all three keys (createdAt desc, name asc, type
  study-first).
- Search + filter + sort composed together produce the intersection, sorted.
- Persistence round-trips for project, type, sort; search resets on remount.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

All three controls compose correctly, the empty states are distinguishable,
phone layout wraps, and tests and typecheck pass.
