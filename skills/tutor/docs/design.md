# /tutor — interactive codebase lessons (design spec)

- **Date:** 2026-08-21
- **Status:** approved design, pre-implementation
- **Companion skill:** `/study` (passive written guide). `/tutor` is the live, interactive sibling.

## Problem

`/study` produces excellent *reference* material, but learning from it is passive: the
reader gets a wall of (well-structured) prose and has no signal about whether they
actually understood anything. The Imprint app model fixes this: teach one small concept
at a time, then immediately ask a comprehension question before moving on, and respond
to a wrong answer by re-explaining rather than just marking it wrong.

`/tutor` brings that loop to codebase learning.

## Goals

1. Teach a directory/topic/question about the **current project** bit by bit, with a
   comprehension check every few chunks.
2. Adapt live: a wrong answer triggers a re-explanation from a different angle and a
   variant question — not a shrug.
3. Optionally emit a **self-contained interactive HTML deck** (Imprint-style cards +
   quizzes) for self-paced review, on a phone, offline, zero tokens while learning.
4. When source code changes, an existing deck **updates incrementally** — only the
   sections whose source files changed are rebuilt.
5. Be **shareable**: no machine-specific paths, no dependency on the author's other
   plugins or skills.

## Non-goals (explicitly cut)

- **No courses, no progress tracking, no spaced repetition.** Lessons are one-shot.
  (Decided during brainstorm; the provenance stamp is the only cross-session state,
  and it lives inside the deck file itself.)
- **No general-knowledge tutoring.** Content source is the current repo, like `/study`.
- **No app/server/plugin infrastructure.** Single skill. Plugin packaging is a later,
  purely mechanical wrapping step if sharing demands it.
- **No refactoring advice.** Observe-and-learn, same as `/study`.
- **No full reference output.** `/tutor` never emits a complete "raw" guide/HTML of a
  topic — that artifact is `/study`'s, and duplicating it means two house styles and two
  provenance mechanics drifting apart. `/tutor` composes with `/study` instead: decks
  cross-link an existing guide, and overflow detail lives in collapsible blocks
  (see *Deck spec*).

## Decisions log (from the brainstorm)

| Question | Decision |
|---|---|
| Content source | Codebases (current project), not general topics |
| Surface | Asked per session: in-chat loop / deck / both |
| Progression | One-shot lessons; no progress state |
| Staleness | Provenance stamp (commit SHA) in deck → incremental update via `git diff` |
| Skill vs plugin vs project | Single skill; plugin/project rejected as YAGNI for this scope |
| Name | `tutor` — noun *and* verb, distinct from `/study`, short to type |
| Full raw/reference HTML in decks | Rejected — duplicates `/study`; compose via cross-links + collapsible detail blocks instead |
| Oversized topics | Split into a **series of lessons**, each within the 5-section cap, each its own deck + stamp |

## Identity

- **Name / trigger:** `tutor` / `/tutor <topic, directory, or question>`
  - `/tutor server/lib/scan.ts`
  - `/tutor how does the remote-answer flow work`
- **Location:** `~/.claude/skills/tutor/`
- **Layout:**
  ```
  tutor/
    SKILL.md              orchestrator: guardrails, flow, pedagogy, mode dispatch
    references/
      in-chat.md          in-chat loop mechanics (loaded only when that mode is chosen)
      deck.md             deck HTML spec + provenance format (loaded only for deck/both)
    docs/
      design.md           this document
  ```
  Mode-specific instructions live in `references/` and are read only when that mode is
  actually chosen — keeps the base prompt small (pattern proven by `/study`'s
  `references/visuals.md`).

## Session flow

1. **Prose on.** If a terse/compressed output mode is active (any such mode), disable
   it for the session; teaching requires full prose. Phrased generically — the skill
   must not name or depend on any specific plugin.
2. **Scope.** Parse the `/tutor` arguments. If missing, ask what to learn and where.
   Derive a kebab-case `<topic>` slug. The current working directory is the project root.
3. **Mode ask.** One `AskUserQuestion` call, three questions:
   - **Mode:** *in-chat* (default) / *deck* / *both*.
   - **Size:** *quick* (~3 sections) / *standard* (~5 sections). Five sections is a hard
     cap — a scope that wants more gets a refusal plus a proposed **series of lessons**
     (see *Lesson series* below).
   - **Deck location:** default `learning-docs/<topic>-deck.html`; honored only if a
     deck mode was chosen; user may name any path.
4. **Explore (read-only).**
   - **First:** if a deck already exists at the target path, this session is an
     **incremental update**, not a new lesson — jump to the update flow below.
   - Otherwise map only the files in scope (subagent for broad scopes, direct reads for
     narrow ones), reusing existing context first: project `CLAUDE.md`/`AGENTS.md`,
     README, and any `/study` guides already written (cross-link instead of restating).
5. **Syllabus check.** Show a one-line-per-section outline; confirm before teaching.
6. **Teach** per mode (see *Pedagogy* and the mode sections).
7. **Wrap.** Score + weak-spot recap in chat. The deck (if chosen) is written **only
   here, on confirmation** — never mid-session.

## Pedagogy — the lesson anatomy

- **Chunk** = one mechanism, 150–250 words, in the `/study` teaching shape:
  1. *what it does*, 2. *why it exists*, 3. *the bad alternative* a beginner would
  reach for, with concrete pros/cons of the chosen approach.
- Every code excerpt is short and labeled with its exact source range as the first
  line of the fence (`// scan.ts:44-52`), with `(compacted here)` appended when
  abridged — the label is what makes a lesson mechanically checkable later.
- **Section** = 2–4 chunks followed by 1–2 quiz questions. Never more than 3 chunks
  without a question (the Imprint cadence).
- **Lesson** = 3–5 sections. Opens with a **mental-model card** (the one-paragraph
  intuition), closes with a **recap**.
- Framework jargon is defined on first use. Everything is grounded in real
  `file:line` references from *this* repo only.

### Lesson series — how oversized topics split

A topic that wants more than 5 sections is not one lesson; it is a **series**. The
skill proposes the split at the syllabus step: an ordered list of lessons, each with
its own slug (`<topic>-1-<sub>`, `<topic>-2-<sub>`, …), each independently sized
within the cap, with a recommended order. The user picks which lesson to run *now* —
one-shot discipline holds; the series is a naming-and-ordering convention, not
progress state. Each lesson gets its own deck and its own provenance stamp. Example:
a 6-chapter hooks guide splits into *hooks fundamentals* (lifecycle, config,
fail-open) and *the answer channel* (answer-channel, stop-loop, held-socket).

## Quiz mechanics — in-chat mode (`references/in-chat.md`)

- **Tool:** `AskUserQuestion`, 2–4 options per question, exactly one best answer.
- **Question types**, mixed across a lesson:
  1. **Concept/why** — "why does the transcript reader tail only 256KB?"
  2. **Predict behavior** — real code shown, "what does this return for input X?"
  3. **Rejected alternative** — "why is this not a daemon/websocket/etc.?"
- **Answer-leak ban (hard rule):** the correct option is never first and never marked
  "(Recommended)". Correct-option position varies question to question, no pattern.
  This inverts the tool's usual recommended-first convention on purpose.
- **Wrong answer:** name why that option is tempting, re-explain the mechanism from a
  different angle (different example, different failure mode), then ask a **variant**
  question — never the same question verbatim.
- **Right answer:** one-line reinforcement, advance.
- **Scorekeeping:** track right/wrong per section in-session; the wrap-up names the
  weak sections. No persistence.
- **Fallback:** if `AskUserQuestion` is unavailable in the host harness, degrade to
  numbered options in plain chat and read the reply — the loop survives portability.

## Deck spec — deck and both modes (`references/deck.md`)

- **One self-contained HTML file.** Inline CSS and JS, system font stack, no CDN, no
  external requests, no build step. Opens from `file://`, works offline, committable.
- **UI:** one card at a time; progress bar; Next/Back buttons; arrow-key navigation;
  mobile-first layout; light/dark via `prefers-color-scheme`.
- **Card types:**
  - *mental-model card* — the opener/hook;
  - *concept cards* — the chunks, code excerpts in plain `<pre>` with their
    `file:line` label (no syntax-highlighting library); a card may carry an optional
    collapsible **"More detail"** block (native `<details>`) for overflow material
    that matters but doesn't fit the chunk — depth stays available without breaking
    pacing, and it never grows into a full reference (that's `/study`'s artifact);
  - *quiz cards* — block Next until answered; **every option carries pre-written
    feedback text** (wrong options teach too — the core Imprint trick); selection
    reveals feedback, then unlocks Next;
  - *section dividers*;
  - *recap card* — score (tracked in page JS), section list, provenance one-liner.
- **Diagrams:** small hand-authored inline SVG only where structure genuinely needs
  drawing. No mermaid — it needs a vendored library, which breaks self-contained.
- **Cross-links (composition with `/study` and within a series):**
  - a `/study` guide covering the topic exists → each deck section links its matching
    guide chapter (relative path), and the recap card links the full guide;
  - no guide exists → the recap card suggests `/study` as the reference layer;
  - the lesson is part of a series → the recap card links the next lesson's deck if
    it has been generated, else names it as not-yet-built.
- **Correct-option position** varies across quiz cards (order is baked at generation;
  the generator rule mirrors the in-chat answer-leak ban).
- **"Both" mode ordering:** the chat session runs first; the deck is generated after
  and folds the user's *actual wrong answers* into extra feedback text on the relevant
  quiz cards — the deck remembers where they stumbled (analog of `/study`'s
  FAQ-from-real-questions rule).
- **Optional final step:** offer to publish the deck as a Claude Artifact for a
  private phone-readable link. The file on disk stays canonical; the artifact is a
  rendering of it. Never publish without an explicit yes.

## Provenance + incremental update

- **Stamp,** embedded in the deck as
  `<script type="application/json" id="provenance">`:
  ```json
  {
    "commit": "<sha>",
    "generated": "<ISO date>",
    "sources": ["server/lib/scan.ts", "..."],
    "sections": [
      { "id": "s1", "title": "...", "sources": ["server/lib/scan.ts"] }
    ]
  }
  ```
  Plus a human-visible one-liner on the recap card ("built at `<short-sha>`").
- **Update flow** (when a deck already exists at the target):
  1. Parse the stamp.
  2. `git diff --name-only <sha>..HEAD -- <sources>` → touched files.
  3. Map touched files → affected sections via the `sections` array.
  4. Re-explore, re-teach (if in-chat/both) and regenerate **only** those sections'
     cards and quiz questions. Untouched sections are preserved byte-identical.
  5. Restamp with the new SHA.
- In-chat-only sessions write nothing to disk → nothing to stamp; the update flow
  applies to decks only.

## Error handling

- **Scope too big** (> 5 sections): refuse; propose a concrete series split (see
  *Lesson series*) and let the user pick the lesson to run now.
- **Not a git repo / no commits:** stamp `"commit": null`; the update flow degrades to
  a confirmed full rebuild.
- **Stamped SHA no longer exists** (rebase, squash, shallow clone): warn, offer full
  rebuild; never guess at a diff base.
- **Deck exists but stamp missing or unparsable:** treat as unstamped legacy output —
  say so, confirm before overwriting.
- **Existing file at the deck path that is not a tutor deck:** never overwrite; ask
  for a different path.

## Guardrails (same discipline as /study)

1. **Read-only.** The only writable file is the deck, and only at wrap-up on
   confirmation. Never edit, create, or delete source code.
2. **No refactoring suggestions.** A real flaw is framed as "the trade-off they
   accepted", never as advice to change it.
3. **Grounded.** Every claim ties to a real `file:line` in the current project. No
   examples imported from other projects.
4. **Answer-leak ban** (stated above; repeated in SKILL.md as a hard guardrail).
5. **Teach, don't dump.** A wall of code with no *why* is a failure of the skill.

## Portability (sharing requirements)

- No absolute paths anywhere in the skill.
- No references to the author's other skills, plugins, or hooks. The
  compression-off instruction is generic ("if a terse/compressed output mode is
  active…"), naming no plugin.
- The `tutor/` directory is the entire shareable unit — `npx skills`-compatible
  layout, wrappable in a plugin later without edits.
- Harness fallback for `AskUserQuestion` (above) keeps the skill usable outside
  Claude Code.

## Verification

Skill behavior is checked by scripted dry-runs rather than unit tests:

1. **New-lesson run** on a known small scope (e.g. one server lib file of any repo):
   mode ask fires exactly once; syllabus shown before teaching; quiz cadence holds
   (no 4-chunk unquizzed stretch); correct options not first across the session.
2. **Deck audit** on a generated deck: no external references —
   `grep -E 'https?://' deck.html` matches nothing except SVG `xmlns` namespace
   attributes (which are identifiers, not requests); opens from `file://` with JS
   enabled; quiz cards block Next until
   answered; every option shows feedback; stamp parses as JSON.
3. **Incremental-update run:** touch one source file, commit, re-run `/tutor` at the
   same deck path → only the mapped section's cards differ (diff the deck before/after);
   stamp SHA updated.
4. **Error paths:** run in a non-git directory (null stamp), and against a deck with a
   hand-corrupted stamp (legacy path taken, overwrite confirmed).

A `skill-creator` eval suite can formalize (1) later; not required for v1.

## Future (out of scope, recorded so they stay out)

- Plugin packaging for distribution (mechanical wrap of this directory).
- Courses / progress / spaced repetition — would reopen the plugin question.
- General-topic tutoring (non-codebase sources).
