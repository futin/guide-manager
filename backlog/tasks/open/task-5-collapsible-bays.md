---
id: task-5
title: Collapsible bays
created: 2026-08-24
---

## Goal

Design B·1 from the volume round of the mockups
(https://claude.ai/code/artifact/1e702456-4239-4fb4-bdfd-8e91a6beb26e): a bay
header is a disclosure. Tapping folds the project down to its header row — name
and count still visible — and the fold state is remembered per device, so a
phone with many grown projects opens onto N short rows instead of a scroll
wall. Depends on task-4.

## Plan

1. `GuidesView.tsx`: the bay header becomes a `<button>` with `aria-expanded`
   and a caret that rotates like the old rail caret did. Collapsed bay renders
   the header only.
2. Fold state: `usePersistedState<string[]>('guide-manager.collapsedBays', [])`
   in GuidesView, storing project *paths* — the registry's own key; names
   collide across two checkouts of one repo. A stored path that is no longer
   registered simply never matches; no cleanup pass needed.
3. Collapsed styling per mockup: header keeps its rule, tick dims to
   `var(--ink3)`, caret points right (▸).
4. Leave a pointer for task-7: a non-empty search query must auto-expand bays
   containing matches (derived expansion — the stored fold state is not
   rewritten). Search does not exist yet, so only the comment lands here.

## Test cases

- jsdom: clicking a bay header hides its cards and flips `aria-expanded`;
  clicking again restores them.
- Fold state round-trips through localStorage (collapse, remount, still
  collapsed).
- A collapsed bay still shows its name and guide count.
- `pnpm test`, `pnpm run typecheck` green.

## Done when

Fold state survives a reload; a board of N projects can be folded to N header
rows; tests and typecheck pass.
