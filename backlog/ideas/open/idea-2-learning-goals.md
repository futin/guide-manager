---
id: idea-2
title: Learning goals
created: 2026-08-24
tags: product, progress
---

## Problem

idea-1 covered two features together: per-guide progress tracking and learning
goals. Only the first was planned — task-1 delivers reading progress
(per-guide scroll position, completion, open count) and nothing else.

Goals are the part that answers "am I on track", not "where was I". Without
them the progress data is a record with no target to measure against: the
Guides list can say a guide is 40% read, but nothing says whether that is
ahead or behind where you meant to be.

Filed so it is not lost when idea-1 closed. Explicitly not planned.

## Rough shape

Unclear, and that is the point — "goal" could reasonably mean any of:

1. **A set goal.** Finish these specific guides. Measured by their `completed`
   flags; needs a way to pick a set and a place to store it.
2. **A rate goal.** Finish N guides per week. Measured by counting completions
   inside a window; needs no new per-guide state, only a query over
   `reading_progress.updatedAt`.
3. **A streak.** Read something on N consecutive days. Cheapest to compute from
   `lastOpenedAt` alone, and the one that needs no new user input at all.

Option 3 is the one that could ship without any goal-authoring UI, which makes
it the natural probe if goals turn out to matter less than they sound.

## Open questions

- Which of the three shapes above is actually wanted — or is it several, with a
  goal *type* field?
- Where does a goal live? A second Mongo collection alongside
  `reading_progress`, or a single-document settings blob given that this is a
  single-user tool?
- Is a goal per-project or global? Guides are grouped by project, and "finish
  the guide-manager guides" is a more natural goal than "finish 3 guides".
- What does the UI look like — a third rail section, a strip above the Guides
  list, or a row in Settings?
- Does a goal need history (met / missed per period), or only a current state?
  History is a much larger surface and can't be reconstructed later if it isn't
  recorded from the start.
- Does completion need to be honest before goals mean anything? Reading progress
  infers `completed` from scrolling to the bottom, which a fast scroll also
  satisfies — a goal built on that measures scrolling, not reading.
