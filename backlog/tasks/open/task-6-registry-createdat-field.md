---
id: task-6
title: Registry createdAt field
created: 2026-08-24
---

## Goal

Give every guide a first-registration timestamp the toolbar (task-7) can sort
by. `updated` is rewritten on every re-register, so it cannot serve as
"created". Backend only — no client change.

## Plan

1. `bin/register.js` `upsertGuide`: a freshly inserted guide gets
   `guide.createdAt = now`; an existing guide keeps its value, and a legacy
   entry without one is healed with `if (!guide.createdAt) guide.createdAt =
   now` on its next re-register. `updated` behavior unchanged. register.js
   stays the registry's only writer.
2. `shared/types.ts`: `RegistryGuide.createdAt?: string` (optional — registry
   files written before this exist), `GuideEntry.createdAt: string` (required —
   the API guarantees it).
3. `server/src/guides/guides.controller.ts`: map
   `createdAt: g.createdAt ?? g.updated` — a read-time fallback for old
   entries. The server must NOT write the registry to backfill; that would
   break the single-writer invariant.
4. Tests: register unit test (insert stamps createdAt; re-register preserves
   createdAt while bumping updated; legacy entry gains one), and a guides
   endpoint test asserting the fallback for an entry with no createdAt.

## Test cases

As listed in the plan — three register behaviors plus the API fallback.
`pnpm test`, `pnpm run typecheck` green.

## Done when

`GET /api/guides` returns a `createdAt` for every guide, including ones already
in the registry file from before this change; tests and typecheck pass.
