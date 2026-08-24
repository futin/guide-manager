---
id: task-3
title: Revert the project drawer to a plain rail
created: 2026-08-24
---

## Goal

Undo the drawer half of 7f04c08 while keeping its pills. The rail goes back to a
plain section switch (Guides · Settings, no disclosure, no caret), the project
drawer and the bar's scope button disappear, and the board lists every project
grouped — the pre-drawer behavior. Project scoping returns later as a toolbar
filter (task-7), so this task deliberately leaves the board unscoped in the
interim. NOT `git revert 7f04c08`: that commit also introduced the type pills,
which stay.

## Plan

1. Verify with grep, then delete `client/src/components/guides/ProjectDrawer.tsx`
   and `client/src/hooks/useCloseOnEscape.ts` (the drawer is its only consumer).
2. `client/src/components/SideRail.tsx`: drop the `projectsOpen` /
   `onToggleProjects` / `railRef` props, the `discloses` branch, and the caret
   span — every tab is a plain `onChange(t.id)` again, `aria-expanded` gone.
3. `client/src/App.tsx`: drop `projectsOpen`, `railRef`, the
   `guide-manager.project` persisted state, and every drawer prop handed to
   GuidesView. Do NOT clear the stored `guide-manager.project` localStorage key —
   task-7's project filter re-reads the same key with compatible values.
4. `client/src/components/guides/GuidesView.tsx`: component takes no props;
   remove the `scoped` / `single` fail-open logic and the scope button; always
   render every project as a group with its `guides-group-h` heading.
5. `client/src/styles.css`: remove `.guides-scope*`, `.rail-caret` (and its
   `aria-expanded` rotate rule), and every drawer / bottom-sheet rule added by
   7f04c08.
6. Delete `test/project-drawer.test.tsx`; grep remaining tests for
   `ProjectDrawer` / `ALL_PROJECTS` / `guides-scope` and update.
7. CLAUDE.md Layout bullet: the client is no longer "scoped to one project by
   `guides/ProjectDrawer.tsx`" — say the list is grouped by project, scoping
   moves to the toolbar in task-7.

## Test cases

- `pnpm test` and `pnpm run typecheck` green with the two files deleted.
- jsdom: rail renders two tabs; pressing the active Guides tab does not open
  anything (no dialog, no aria-expanded attribute anywhere in the rail).
- jsdom: GuidesView renders one group heading per project in the index.

## Done when

No reference to ProjectDrawer / useCloseOnEscape / ALL_PROJECTS remains; the
rail only switches sections; the board lists all projects grouped; tests and
typecheck pass.
