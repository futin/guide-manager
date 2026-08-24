# /tutor Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/tutor` skill — interactive, Imprint-style codebase lessons (teach a chunk → quiz → adapt), with an optional self-contained HTML deck that updates incrementally via a git-SHA provenance stamp.

**Architecture:** One user-level skill at `~/.claude/skills/tutor/`: `SKILL.md` orchestrates (guardrails, session flow, pedagogy, mode dispatch); two mode references are loaded only when their mode is chosen (`references/in-chat.md`, `references/deck.md`). No code is shipped — the deliverables are instruction documents plus their verification. The skill directory is its own git repo (the shareable unit).

**Tech Stack:** Markdown skill files; AskUserQuestion tool (with documented fallback); self-contained HTML/CSS/JS decks (no libraries); git for provenance.

**Spec:** `~/.claude/skills/tutor/docs/design.md` — the plan argues from it; executors read both.

## Global Constraints

Copied from the spec; every task's requirements include these.

- **Read-only teaching:** the only file a tutor session may write is the deck, at wrap-up, on confirmation.
- **No refactoring advice** in lesson content; flaws are "the trade-off they accepted".
- **Grounded:** every lesson claim ties to a real `file:line` in the target project.
- **Answer-leak ban (exact rule, appears verbatim wherever quizzes are specified):** "The correct option is NEVER first and NEVER marked '(Recommended)'. Vary the correct option's position question to question, with no pattern. This deliberately inverts the AskUserQuestion convention of putting a recommended option first."
- **Chunk = 150–250 words**, teaching shape *what → why → bad alternative + trade-offs*.
- **Quiz cadence:** never more than 3 chunks without a question. **Section = 2–4 chunks + 1–2 questions. Lesson = 3–5 sections, 5 is a hard cap** → oversized scope becomes a proposed lesson series.
- **Deck: zero external references.** Inline CSS/JS, system fonts, no CDN; `grep -E 'https?://'` over a deck matches nothing except SVG `xmlns` attributes.
- **Portability:** no absolute paths; no references to the author's other skills/plugins/hooks by name; compression-off instruction phrased generically; AskUserQuestion fallback documented.
- **Frontmatter:** `name: tutor`; description in third person, starts "Use when", triggers only — no workflow summary; frontmatter total ≤ 1024 chars.
- **No full reference output:** `/tutor` never emits a complete raw guide of a topic; composition happens via conditional cross-links ("if a study guide exists at …") and `<details>` blocks.

**Working directory for all tasks:** `~/.claude/skills/tutor/` (expand `~` in your shell; never write the literal `~` into skill files).

---

### Task 1: Repo init + RED baselines (failing tests first)

The Iron Law of skill-writing: watch agents fail WITHOUT the skill before writing it. Two discipline rules carry real violation risk; capture the baseline behavior and rationalizations they'll need counters for.

**Files:**
- Create: `.git` (repo init), `.gitignore`
- Create: `tests/scenarios.md` (the exact prompts below, so GREEN reruns use identical inputs)
- Create: `tests/baseline-notes.md` (observed failures, verbatim rationalizations)

**Interfaces:**
- Produces: `tests/scenarios.md` — Tasks 5 uses these prompts verbatim for GREEN verification.

- [ ] **Step 1: Init the repo**

```bash
cd ~/.claude/skills/tutor && git init -b main && printf 'node_modules/\n.DS_Store\n' > .gitignore
```

- [ ] **Step 2: Commit the existing docs**

```bash
git add docs/design.md docs/plan.md .gitignore && git commit -m "docs: tutor skill design spec + implementation plan"
```

- [ ] **Step 3: Write `tests/scenarios.md` with these two scenarios, verbatim**

**Scenario A — answer-leak (micro-test, non-interactive).** Subagent prompt:

> You are running an interactive teaching session about a codebase for a developer. You have just explained, in about 200 words, how `server/lib/scan.ts` in the current project ranks sessions (it reads transcript files, scores them by recency, and returns the top N). Now you must check the learner's comprehension with the AskUserQuestion tool before continuing.
> Do NOT execute any tool. Instead, return ONLY the exact JSON you would pass as the AskUserQuestion tool input, and nothing else.

Scored FAIL if, in the returned JSON: the correct option is listed first, OR any option label contains "(Recommended)", OR option order makes the answer guessable (e.g. one detailed option among throwaways).

**Scenario B — wall-of-text (micro-test).** Subagent prompt:

> A developer says: "teach me how the config loader in this project works" (`server/lib/config.ts`: loads `.env`, precedence process.env > .env file > defaults, ~60 lines). Produce the opening of your interactive teaching session, exactly as you would send it. Assume you may ask the learner questions at any point.

Scored FAIL if the opening message exceeds 300 words before any question or interaction point, OR contains no comprehension check plan at all.

- [ ] **Step 4: Run baselines (RED)**

Dispatch each scenario 3 times as fresh single-shot subagents (general-purpose, no tutor skill content in the prompt). Record per rep in `tests/baseline-notes.md`: PASS/FAIL, the violating output fragment, and any stated reasoning, verbatim.

Expected: Scenario A fails most reps (the AskUserQuestion tool description itself instructs recommended-first — that convention is the adversary). Scenario B fails at least once with a >300-word dump. If ALL six reps pass, the baseline shows no failure — note that, and downgrade the corresponding counters in Tasks 2–3 from rationalization-table entries to plain rules.

- [ ] **Step 5: Commit**

```bash
git add tests/ && git commit -m "test: RED baselines for answer-leak and wall-of-text rules"
```

---

### Task 2: SKILL.md — the orchestrator

**Files:**
- Create: `SKILL.md`

**Interfaces:**
- Consumes: `tests/baseline-notes.md` (rationalizations → counters).
- Produces: dispatch contract used by Tasks 3–4 — SKILL.md must instruct, with these exact reference paths: *in-chat or both mode chosen → read `references/in-chat.md`; deck or both → read `references/deck.md`; never read a reference for an unchosen mode.*

- [ ] **Step 1: Write frontmatter, exactly this**

```yaml
---
name: tutor
description: >
  Use when the user wants to learn a codebase, directory, or mechanism of the
  current project interactively — taught in small chunks with comprehension
  questions — or asks to be quizzed on how existing code works, or invokes
  /tutor. Also use to refresh a previously generated lesson deck after the
  underlying code changed. Not for producing passive reference documentation.
trigger: /tutor
---
```

- [ ] **Step 2: Write the body — required sections, in order, each satisfying the spec section it implements**

1. **Title + one-paragraph identity** — interactive lessons; contrast with passive guides (generic wording, no skill named).
2. **Hard guardrails** — read-only; no refactoring advice; grounded `file:line`; teach-don't-dump; answer-leak ban (Global Constraints wording verbatim); never emit a full reference guide. Add a rationalization table ONLY for rules that failed in Task 1 baselines, with one row per distinct observed rationalization (Reality column refutes it in one sentence).
3. **Session flow** — the spec's 7 steps (prose-on, scope+slug, mode ask, explore/update-detect, syllabus check, teach, wrap). The mode ask is ONE AskUserQuestion call with three questions: mode (in-chat default / deck / both), size (quick ~3 / standard ~5 sections), deck location (default `learning-docs/<topic>-deck.html`). Update detection: deck exists at target → follow the update flow in `references/deck.md` instead of building new.
4. **Pedagogy** — chunk/section/lesson numbers from Global Constraints; mental-model opener; recap closer; excerpt labeling rule including `(compacted here)`.
5. **Lesson series** — >5 sections → refuse + propose ordered series with per-lesson slugs (`<topic>-1-<sub>`…); series = naming/ordering convention, not progress state; user picks one lesson to run now.
6. **Mode dispatch** — the Produces contract above, verbatim paths.
7. **Fallback** — AskUserQuestion unavailable → numbered options in chat, read the reply.

- [ ] **Step 3: Structural checks**

```bash
cd ~/.claude/skills/tutor && awk '/^---$/{n++} n==1' SKILL.md | wc -c   # frontmatter block < 1024
grep -c "references/in-chat.md" SKILL.md   # >= 1
grep -c "references/deck.md" SKILL.md      # >= 1
grep -in "recommended" SKILL.md            # only hits inside the answer-leak rule text
```

- [ ] **Step 4: Commit**

```bash
git add SKILL.md && git commit -m "feat: tutor SKILL.md orchestrator"
```

---

### Task 3: references/in-chat.md — the quiz loop

**Files:**
- Create: `references/in-chat.md`

**Interfaces:**
- Consumes: SKILL.md pedagogy numbers (do not restate differently — reference them).
- Produces: the in-chat loop contract; Task 5 verifies against it.

- [ ] **Step 1: Write the loop mechanics — required content**

1. **The loop:** teach one chunk → every ≤3 chunks ask 1 question (AskUserQuestion, 2–4 options, exactly one best answer) → branch.
2. **Question types with one concrete example each** (examples must be format demonstrations, generic enough to port): concept/why; predict-behavior on shown code; rejected-alternative.
3. **Answer-leak ban** — Global Constraints wording verbatim, plus counters for Task 1's observed rationalizations.
4. **Wrong answer protocol:** name why the chosen option is tempting → re-explain from a different angle (different example or failure mode) → ask a VARIANT question, never the same one verbatim.
5. **Right answer protocol:** one-line reinforcement, advance.
6. **Scorekeeping:** per-section right/wrong tallied in-session; wrap-up names weak sections; nothing persisted.
7. **"Both" mode note:** wrong answers this session are folded into the deck's quiz-card feedback at generation time.

- [ ] **Step 2: Structural check**

```bash
grep -c "NEVER first" references/in-chat.md   # >= 1 (exact rule present)
```

- [ ] **Step 3: Commit**

```bash
git add references/in-chat.md && git commit -m "feat: in-chat quiz loop reference"
```

---

### Task 4: references/deck.md — deck contract, provenance, update flow

**Files:**
- Create: `references/deck.md`

**Interfaces:**
- Consumes: SKILL.md dispatch contract.
- Produces: the deck contract Task 6 builds a sample from and audits against; the stamp schema Task 7 exercises.

- [ ] **Step 1: Write the deck contract — required content**

1. **File contract:** ONE self-contained HTML file; inline CSS + JS; system font stack; works from `file://`; light/dark via `prefers-color-scheme`; mobile-first.
2. **Card types and exact behaviors:**
   - mental-model (opener), concept (with `<pre>` code excerpts labeled `file:line`; optional `<details><summary>More detail</summary>…</details>` block), quiz, section divider, recap.
   - Quiz card: options as buttons; selecting reveals that option's pre-written feedback (every option HAS feedback — wrong options teach); Next stays disabled until an option is selected; correct/incorrect tallied into a JS score shown on the recap card.
   - Navigation: Next/Back buttons + ArrowRight/ArrowLeft keys; progress bar reflecting card index.
3. **Correct-option placement rule** — Global Constraints wording verbatim, applied at generation.
4. **Diagrams:** hand-authored inline SVG only, only where structure needs drawing; no mermaid, no libraries.
5. **Cross-links (conditional):** a written learning guide covering the topic exists in the project → each section links its matching chapter (relative path) and the recap links the guide's entry page; none exists → recap suggests generating a reference guide; lesson is part of a series → recap links the next lesson's deck if generated, else names it as not-yet-built. (Generic wording only — the skill must not name any specific guide-producing skill.)
5b. **Optional Artifact publish:** after writing the deck, offer once to publish it as a Claude Artifact for a phone-readable private link; the file on disk stays canonical; never publish without an explicit yes; skip the offer entirely when no Artifact tool exists in the harness.
6. **Provenance stamp — exact schema**, embedded as `<script type="application/json" id="provenance">`:

```json
{
  "commit": "<full sha, or null when not a git repo>",
  "generated": "<ISO-8601 date>",
  "sources": ["relative/path/one.ts"],
  "sections": [
    { "id": "s1", "title": "Section title", "sources": ["relative/path/one.ts"] }
  ]
}
```

   Plus a human-visible "built at `<short-sha>`" line on the recap card.
7. **Update flow** (deck already exists at target): parse stamp → `git diff --name-only <sha>..HEAD -- <sources>` → map touched files to sections via `sections[].sources` → regenerate ONLY those sections' cards and quizzes → untouched sections byte-identical → restamp. Error paths, each with its required behavior: null/absent commit → confirmed full rebuild; SHA unknown to git (`git cat-file -e <sha>^{commit}` fails) → warn, offer full rebuild, never guess a diff base; stamp missing/unparsable → legacy output, confirm before overwrite; existing file that is not a tutor deck (no `id="provenance"` and no tutor marker comment) → refuse, ask for another path.
8. **Pre-handover checklist** (the generating agent runs this before delivering a deck):
   - `grep -E 'https?://' <deck>` → only `xmlns` attribute hits;
   - stamp parses as JSON and every `sections[].sources` entry appears in `sources`;
   - every quiz option has non-empty feedback text;
   - correct options are not all in the same position;
   - file opens from `file://` (no fetch/XHR anywhere in the JS).

- [ ] **Step 2: Structural checks**

```bash
grep -c 'id="provenance"' references/deck.md   # >= 1
grep -c "name-only" references/deck.md          # >= 1 (update flow present)
```

- [ ] **Step 3: Commit**

```bash
git add references/deck.md && git commit -m "feat: deck contract, provenance stamp, update flow"
```

---

### Task 5: GREEN verification + REFACTOR (in-chat rules)

**Files:**
- Modify: `SKILL.md`, `references/in-chat.md` (only if loopholes found)
- Modify: `tests/baseline-notes.md` (append GREEN results)

**Interfaces:**
- Consumes: `tests/scenarios.md` prompts verbatim; SKILL.md + in-chat.md as written.

- [ ] **Step 1: Re-run Scenario A, 3 reps, WITH the skill**

Same prompts as Task 1, but prepend the full text of `SKILL.md` and `references/in-chat.md` framed as: "The following skill instructions are active for you:". Score with Task 1's criteria.

Expected: 3/3 PASS on the answer-leak criteria.

- [ ] **Step 2: Re-run Scenario B, 3 reps, WITH the skill**

Expected: 3/3 PASS (opening ≤300 words before an interaction point, comprehension check present).

- [ ] **Step 3: REFACTOR any failure**

A failing rep = a loophole. Quote its rationalization, add an explicit counter to the rationalization table (or tighten the rule wording), re-run that scenario's 3 reps. Repeat until 3/3. Record every iteration in `tests/baseline-notes.md`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: GREEN verification of quiz-loop discipline rules"
```

---

### Task 6: Deck contract validation — build and audit a sample deck

Validates that `references/deck.md` is complete enough to produce a correct deck, by following it exactly and auditing the result. The sample is throwaway; only fixes to `deck.md` are kept.

**Files:**
- Create: `<scratch>/sample-deck.html` (any temp dir; NOT committed)
- Modify: `references/deck.md` (only where the contract proved ambiguous/wrong)

**Interfaces:**
- Consumes: `references/deck.md` as the sole instruction source (if you need information it doesn't contain, that is a finding — fix the doc).

- [ ] **Step 1: Generate the sample deck**

Follow `references/deck.md` literally to produce a 2-section lesson deck on a fixed fictional topic (e.g. a made-up `parseConfig` module) with: 1 mental-model card, 4 concept cards (one carrying a `<details>` block, one carrying a small inline SVG), 2 quiz cards, 1 divider, 1 recap card; stamp filled with `"commit": null`.

- [ ] **Step 2: Static audit**

```bash
grep -E 'https?://' <scratch>/sample-deck.html          # only xmlns hits
node -e "const m=require('fs').readFileSync('<scratch>/sample-deck.html','utf8').match(/<script type=\"application\/json\" id=\"provenance\">([\s\S]*?)<\/script>/); const p=JSON.parse(m[1]); if(!('commit' in p&&'sections' in p)) throw 'bad stamp'; console.log('stamp OK')"
grep -c "<details>" <scratch>/sample-deck.html           # >= 1
```

Expected: no external URLs beyond xmlns; `stamp OK`; details present.

- [ ] **Step 3: Interactive audit (browser)**

Open `file://<scratch>/sample-deck.html` in the browser pane. Verify, by clicking: Next disabled on a quiz card until an option is chosen; choosing any option reveals that option's feedback; score on recap matches choices made; ArrowRight/ArrowLeft navigate; dark mode renders legibly (`resize_window` with `colorScheme: "dark"`).

Expected: all pass. Any failure → the contract in `deck.md` under-specified that behavior → fix `deck.md` (not just the sample), regenerate, re-audit.

- [ ] **Step 4: Commit (deck.md fixes only)**

```bash
git add references/deck.md && git commit -m "fix: tighten deck contract from sample-deck audit"
```

(Skip the commit if the audit passed with zero `deck.md` changes.)

---

### Task 7: Update-flow validation — incremental regeneration dry-run

**Files:**
- Create: `<scratch>/fixture-repo/` (throwaway git repo; NOT committed)
- Modify: `references/deck.md` (only where the update flow proved ambiguous)

**Interfaces:**
- Consumes: `references/deck.md` update flow; Task 6's sample-deck know-how.

- [ ] **Step 1: Build the fixture**

In `<scratch>/fixture-repo/`: `git init`, add two tiny source files `a.ts` and `b.ts` (a few lines each), commit. Generate a 2-section deck per `references/deck.md` where section s1 maps to `a.ts` and s2 to `b.ts`, stamp with the real HEAD SHA. Then modify ONLY `b.ts` and commit again.

- [ ] **Step 2: Execute the update flow, exactly as deck.md instructs**

Parse the stamp → run the documented `git diff --name-only <sha>..HEAD -- a.ts b.ts` → expect exactly `b.ts` → regenerate only s2's cards → restamp with new HEAD.

- [ ] **Step 3: Verify isolation**

Diff old vs new deck HTML: changes confined to s2's cards + the stamp + the recap's short-sha line; s1's card markup byte-identical.

- [ ] **Step 4: Verify one error path**

Rewrite the stamp's `commit` to `"0000000000000000000000000000000000000000"` and re-execute the flow's first steps: `git cat-file -e <sha>^{commit}` fails → the documented behavior (warn + offer full rebuild, never guess) must be what `deck.md` actually says to do. If the doc is ambiguous here, fix it.

- [ ] **Step 5: Commit (deck.md fixes only)**

```bash
git add references/deck.md && git commit -m "fix: tighten update flow from fixture dry-run"
```

(Skip if no changes.)

---

### Task 8: Final review + release hygiene

**Files:**
- Modify: any skill file (portability fixes only)

- [ ] **Step 1: Portability sweep**

```bash
cd ~/.claude/skills/tutor && grep -rn "/Users/" SKILL.md references/   # expect no hits
grep -rniE "study|caveman|kaizen|superpowers" SKILL.md references/     # expect no hits — other-skill names are forbidden by spec
```

Any hit → reword generically, re-run.

- [ ] **Step 2: SDO check on frontmatter**

Description starts "Use when", third person, no workflow summary (no "teaches then quizzes then…" phrasing), frontmatter ≤1024 chars (Task 2's awk check).

- [ ] **Step 3: Spec coverage skim**

Open `docs/design.md`; for each section confirm the implementing file/section exists. Gaps → fix now.

- [ ] **Step 4: Availability smoke**

Start a fresh Claude Code session (or ListSkills if available in-session) and confirm `tutor` appears with the intended description. Do NOT run a full lesson — that live end-to-end run is the one thing this plan leaves unverified; it needs a human learner.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: portability sweep + release hygiene"
```
