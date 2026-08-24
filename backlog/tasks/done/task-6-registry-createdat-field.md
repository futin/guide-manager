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

## Outcome

Done 2026-08-24. All four plan steps landed as written: `upsertGuide` stamps
`createdAt` behind an `if (!guide.createdAt)` guard — one line that covers both
a freshly inserted guide and a legacy entry healed on its next re-register —
`shared/types.ts` gained `RegistryGuide.createdAt?` and `GuideEntry.createdAt`,
and `guides.controller.ts` maps `g.createdAt ?? g.updated` without writing the
registry, so `bin/register.js` stays its only writer.

One thing the plan did not anticipate: making `GuideEntry.createdAt` required
broke eight `GuideEntry` literals in the client test fixtures
(`app-projects`, `guides-view`, `project-drawer`), which `tsc` caught. Each was
given a `createdAt` earlier than its `updated` so the fixtures show the two
fields as distinct. No client source changed — the task stayed backend-only.

Tests were written first and failed for the right reasons before the change:
the two register assertions returned `undefined`, and the guides suite would
not compile (`TS2339: Property 'createdAt' does not exist on type
'GuideEntry'`).

`pnpm run typecheck` — clean, no diagnostics:

```
$ tsc --noEmit
```

`pnpm test`:

```
Test Suites: 24 passed, 24 total
Tests:       204 passed, 204 total
Snapshots:   0 total
Time:        23.601 s, estimated 43 s
Ran all test suites.
```

Baseline before the change was 200 tests; the four added are the three register
behaviors and the API fallback.

Worked on branch `worktree-task-6-registry-createdat` in an isolated worktree.
Uncommitted — staging is the user's call.
