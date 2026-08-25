---
id: task-9
title: Resume where you left off, and a per-guide reset
created: 2026-08-25
---

## Goal

Make the board's progress display true, resume a guide where the last session
stopped, and give every guide a manual reset.

task-1 built the storage and the endpoints; the reporter that was supposed to
write them lived on the markdown render path, which is gone. So every guide's
`progress` has been `null` since, and the card's `· 40%` / `· read` branch has
been dead code. This closes that, and adds the two things it was missing to be
worth having: an exact resume, and a way to start over.

## Plan

Design: [`docs/superpowers/specs/2026-08-25-guide-progress-resume-design.md`](../../../docs/superpowers/specs/2026-08-25-guide-progress-resume-design.md)
Plan: [`docs/superpowers/plans/2026-08-25-guide-progress-resume.md`](../../../docs/superpowers/plans/2026-08-25-guide-progress-resume.md)

Nine tasks, in dependency order: the wire and stored shapes, the reset endpoint,
the splice and its asset route, the `GET /asset` wiring, the reporter's doc mode,
its deck mode, the pill, the board and viewer, and this record. Executed out of
order in one place only — the client task came before the reporter, because the
renamed `percent` field left the tree failing to typecheck until it did.

## Notes

Three things the design settled that are easy to get wrong later:

- **A deck is resumed by clicking its own `Next`**, never by setting `.active`.
  The deck owns its index, its score and its progress bar; a hand-set card
  leaves all three describing a screen that is not there.
- **A quiz gate stops the replay, and that is correct.** Quiz answers are not
  stored, so resuming past one would be a claim the reader never earned. The
  target stays pending and the walk continues when the gate clears.
- **`furthestPercent` is what the board shows.** `percent` is where the reader
  is; the two disagree the moment they scroll back, and the board must not walk
  backwards for a glance at chapter one.

Left for later, deliberately: per-quiz-answer state (needs a stable per-card id,
which decks do not have), and goals — see
[`backlog/ideas/open/idea-2-learning-goals.md`](../../ideas/open/idea-2-learning-goals.md),
whose "does completion need to be honest first" question this task answers.

## Verification status

Green at every layer that can be checked without a browser: 294 jest tests,
`typecheck`, `build`, and a run against the live compose stack with the real
registry — `/asset` injecting the reporter and its context into an actual
registered deck, a position written and read back through the Vite proxy (the
path the phone uses), `furthestPercent` holding at 48 while the current position
went back to 8, `openCount` staying at 1 across a position write, and the reset
answering 204 and emptying the row. The test row was deleted afterwards, so no
guide carries invented progress.

Not yet checked, because it needs a real browser and a phone — the list in the
plan's *Manual verification* section: the pill as it actually renders, a deck
replay running inside the live iframe, and the `visibilitychange` flush on the
phone. Everything those exercise is covered by the jsdom suites against fixtures
built from the real decks' markup, but that is not the same as having seen it.

Move this to `done/` once that pass is made.
