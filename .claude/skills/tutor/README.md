# tutor

A Claude Code skill that teaches a part of the project you are already in — a directory,
a file, or one mechanism — the way a live tutor does: explain a small piece, ask a
comprehension question, adapt when the answer is wrong, then move on. It can optionally
finish by writing a self-contained HTML deck of the same lesson for self-paced review.

It is a set of instruction documents. No code ships here, and nothing runs in the
background.

## What it does

- Teaches interactively, in chunks of 150–250 words, with a question after the first
  chunk and never more than three chunks between questions.
- Grounds every claim in a real `file:line` in the current project. It never edits,
  creates, or deletes source code.
- Optionally writes **one** file — an HTML deck — at wrap-up, only after you confirm.
  That deck is a single self-contained page: inline CSS and JS, system fonts, no
  network calls, no CDN. It opens from `file://` and works offline.
- Can refresh a deck it wrote earlier. The deck carries a provenance stamp (commit SHA
  plus the source files each section drew from), so a later run diffs the sources and
  regenerates only the sections whose files changed.

## What it does not do

- No refactoring advice — a flaw in the code is framed as the trade-off its authors
  accepted.
- No passive reference guide. If you want a document to read end to end, this is the
  wrong tool.
- No progress tracking, no spaced repetition, no state between sessions other than what
  is written inside a deck file.

## Invoking it

Type `/tutor`, optionally with what you want to learn:

```
/tutor
/tutor the config loader
/tutor server/lib/
```

It also triggers on plain requests to be taught or quizzed on how existing code works.
Anything you do not give it, it asks for. Early on it asks three things in one go: mode
(in-chat / deck / both), size (~3 or ~5 sections), and where a deck should go if you
want one.

## Installing

The skill directory is the shareable unit — copy it whole:

- for yourself, into `~/.claude/skills/tutor/`
- for one project, into that project's `.claude/skills/tutor/`

## Layout

Three files ship, and they are the whole skill:

| File | Loaded | What it holds |
|---|---|---|
| `SKILL.md` | always | Guardrails, session flow, pedagogy (chunk/section/lesson sizes), mode dispatch, the no-AskUserQuestion fallback. |
| `references/in-chat.md` | only when the mode is in-chat or both | The quiz loop: question types, the wrong/right-answer protocol, scorekeeping, the answer-leak checks. |
| `references/deck.md` | only when the mode is deck or both | The deck file contract, card types, the provenance stamp schema, the incremental update flow, and a pre-handover checklist. |

Two directories are development records and are **not** loaded at runtime — a session
never reads them, and you can delete them without changing behaviour:

- `../../../docs` — `design.md`, the approved design spec, and `plan.md`, the implementation
  plan that was executed. Both are dated records, not living documentation.
- `tests` — `scenarios.md`, the RED/GREEN scenarios used to measure two discipline
  rules (answer-leak and wall-of-text), and `baseline-notes.md`, the recorded
  before/after observations.

## What the harness needs

- **`AskUserQuestion`** — used for the mode ask, the syllabus confirmation, the
  deck-write confirmation, and every in-chat quiz question. If the tool is not
  available, SKILL.md's Fallback section degrades all of them to numbered options typed
  in plain chat, with the same rules underneath.
- **git — optional.** Without a repo, a deck still generates; its stamp records no
  commit and its recap line says so instead of showing a SHA. Incremental updates do
  need a resolvable commit: with no usable stamp, refreshing a deck escalates to a full
  rebuild, which it asks you to confirm first.
- **No network, at any point.** The skill reads files in the current project, and the
  deck it writes fetches nothing.
- **Artifact publishing — optional.** After a deck is written, the skill offers once to
  publish it as a private link for reading on a phone. Where no such tool exists, the
  offer is skipped.

## Status

Written and reviewed, lightly exercised. The two discipline rules above were measured
before and after with three repetitions each, using single-turn probes — see
`tests/baseline-notes.md` for the actual numbers and their caveats. The deck contract
and the update flow were checked against fixtures and by reading.

**A full live in-chat lesson has not yet been run with a human learner**, so the
end-to-end experience — pacing across a whole lesson, how the wrong-answer protocol
actually feels, deck quality on a real topic — is unproven. Expect to find rough edges
there first.
