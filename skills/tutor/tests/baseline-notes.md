# RED Baseline Observations: Tutor Skill Discipline Rules

**Timestamp:** August 21, 2026  
**Method:** Fresh single-shot agents (general-purpose, no tutor skill in prompt), cwd = real codebase  
**Purpose:** Measure baseline violations against two discipline rules before implementing tutor skill counters.

---

## Scenario A: Answer-Leak (AskUserQuestion JSON)

**Summary:** 3 reps dispatched, 3 FAIL. Every clean rep placed the correct option first. (Reps are labeled A1/A3/A2b; A2 was contaminated and is detailed in the methodology note below.)

### Rep A1 — FAIL

Violating fragment:
```
"label": "File mtime (filesystem)",
"description": "listTranscripts() reads each file's mtimeMs from the filesystem; scanSessions sorts candidates by mtimeMs descending and slices to maxSessions, all before any transcript is parsed."
```
The correct option was placed first of four.

### Rep A3 — FAIL

Violating fragment:
```
"label": "Raw file mtime",
"description": "listTranscripts()'s fs.statSync mtimeMs — candidates are filtered by lookbackHours and sorted descending by this mtime, then sliced to maxSessions, all before readTranscript() is ever called."
```
The correct option was placed first of four.

### Rep A2b — FAIL

Violating fragment:
```
"label": "File mtime",
"description": "listTranscripts() stats every .jsonl file; scanSessions() filters candidates by (now - mtimeMs) within the lookback window, sorts them descending by mtimeMs, then slices to maxSessions — all before readTranscript() ever looks at file content."
```
The correct option was placed first of four, and its description was the longest and most detailed of the four options, making it guessable by length alone.

### Observed Failure Mechanism

Every clean rep placed the correct answer first, mirroring the AskUserQuestion tool's documented convention of leading with a recommended option. The tool's own instruction — present the recommended option first — is the adversary this rule must overcome.

### What This Means for the Skill

Scenario A warrants a full rationalization table. The failure mechanism is uniform across all three clean reps: a single repeated violation (recommended-first placement) driven by the tool's own documented convention. The skill must provide explicit rationalizations for placing the correct option in a non-first position, making the adversary visible and surmountable.

---

## Scenario B: Wall-of-Text (Opening Teaching Messages)

**Summary:** 3 reps dispatched, 3 FAIL. All three reps exceeded the 300-word ceiling before posing an answerable question.

### Rep B1 — FAIL

Opening sentence: "`server/lib/config.ts` is a good one to slow down on, because it *looks* trivial — merge three sources of settings, done — but almost every line in it is quietly deliberate."

First question arrives at 301 words before the `?` character (measured as whitespace-separated words preceding the first question mark in the opening message).

### Rep B2 — FAIL

Opening sentence: "Let's work through `server/lib/config.ts` together. I'll go a piece at a time and check in with questions along the way rather than narrate the whole thing at you — and jump in with your own questions whenever something looks off, surprising, or just unclear."

361 words before the first `?` character. The opening includes a six-item numbered syllabus (stops 1–6) before any answerable question. An invitation to interrupt ("jump in with your own questions whenever") is not counted as an interaction point; only a tutor-posed question answered by the learner is.

### Rep B3 — FAIL

Opening sentence: "Let's dig into `server/lib/config.ts`. It's about 220 lines end to end, but a large share of that is comments explaining *why* — the executable logic is closer to 60 lines."

First question arrives at 306 words before the `?` character (measured as whitespace-separated words preceding the first question mark).

### Observed Failure Mechanism

Every rep front-loads extended orientation (300+ words) plus a numbered syllabus, and only poses an answerable question after the learner has read through all of that. The uniform mechanism across all three reps is the same: preamble + roadmap before comprehension check.

### What This Means for the Skill

Scenario B warrants a full rationalization-table treatment, same as Scenario A. The failure mechanism is uniform across all three reps: a single repeated violation (front-loaded orientation + syllabus before questions) driven by a rationalization the skill must refute. The rationalization agents naturally reach for — "I should orient the learner and lay out the roadmap before teaching" — keeps every rep from posing questions until after 300 words. The skill must make this adversary explicit and provide reasons to question it.

Note: An earlier reading counted B1 and B3 as marginal passes at 260–270 words; recounting the baseline files mechanically (words before first `?` character) reveals all three exceeded the 300-word ceiling, and the scoring error is corrected here.

---

## Methodology Note

Rep A2 (original run) was discarded and is not counted in the failure rate. That agent self-reported having read this workspace's scoring rubric before composing its answer, and it placed the correct option second — measuring rubric-compliance rather than baseline behavior. The test was re-run blind as A2b. This contamination is documented here so a future reader understands why reps are labeled A1/A3/A2b rather than A1/A2/A3.

---

# GREEN Verification Results: Tutor Skill Discipline Rules

**Timestamp:** August 21, 2026  
**Method:** Fresh agents with full tutor skill instructions (SKILL.md + references/in-chat.md), cwd = real codebase  
**Purpose:** Verify that skill counters eliminate baseline violations; compare against RED results.

---

## Scenario A: Answer-Leak (AskUserQuestion JSON)

**Summary:** 3 reps dispatched, 3 PASS. All correct options placed in non-first positions. (RED was 3 of 3 FAIL, every rep placing the correct answer first.)

### Rep A1 — PASS

Correct option: "Keeps stale rows out"  
Position: 3 of 4

### Rep A2 — PASS

Correct option: "Newest 5 by mtime"  
Position: 4 of 4

### Rep A3 — PASS

Correct option: "Cheap metadata first"  
Position: 3 of 4

### Result

All three reps produced answer positions of 3/4/3. None placed the correct option first. None included "(Recommended)" in any option label.

**Option description word counts** (measured per RED's approach):
- A1: 16 / 13 / **19 (correct)** / 17 → correct option is sole longest
- A2: 23 / 24 / 22 / **23 (correct)** → correct option tied at second longest
- A3: 23 / 24 / **27 (correct)** / 25 → correct option is sole longest

**Observed residual weakness:** Two of three reps (A1, A3) exhibit the correct option as the sole longest description (by 2–5 words). This mirrors the RED criterion "one detailed option among throwaways" but does not cleanly trigger it — a 2-word margin on ~20-word descriptions is a weaker signal than the RED baselines' dominant patterns. The 3/3 PASS verdicts stand. The controller ruled against tightening the skill's wording on a 3-rep, 2-word-margin signal and left this residual weakness for the final whole-branch review to triage.

---

## Scenario B: Wall-of-Text (Opening Teaching Messages)

**Summary:** 3 reps dispatched, 3 PASS on opening criterion (≤300 words before an interaction point) — **but read the criterion literally before comparing to RED: B1–B3's 44/75/54 words measure the setup Mode ask, not teaching.** The RED-comparable teaching figures come from the supplementary probes below: 428/447/469 words before a comprehension check. See "Caveat on Methodology" at the end of this scenario. (RED was 3 of 3 FAIL, all exceeding 300 words.)

### Initial Probes B1–B3 (Session Opening)

All three reps asked SKILL.md's Session flow step 3 (Mode ask) questions — mode selection / size selection / deck location — before teaching, which is correct skill behavior. Word counts before the first interaction point (the learner's reply to a setup question):

- Rep B1: 44 words
- Rep B2: 75 words
- Rep B3: 54 words

All three fall well within the 300-word ceiling. However, reaching an interaction point via setup questions means the opening never reached teaching itself. These figures prove the session flow interposes an interaction point early; they do **not** prove the teaching itself stays concise.

### Supplementary Probes B4–B6 (Post-Setup Teaching)

To address the caveat above, three additional reps were run starting after the learner selected a mode and syllabus size (simulating "in-chat, quick" or "in-chat, standard" responses). These reps measure teaching content directly, not setup flow.

**Opener length** (text up to the first section heading):
- Rep B4: 158 words
- Rep B5: 198 words
- Rep B6: ~230 words

All within SKILL.md's 150–250 bound for openers.

**Chunking discipline** (number of content chunks before comprehension check):
- Rep B4: 1 chunk
- Rep B5: 1 chunk
- Rep B6: 1 chunk

All comply with the bound of never more than 3 chunks before the first comprehension check.

**Words before comprehension check**:
- Rep B4: 428 words
- Rep B5: 447 words
- Rep B6: 469 words

All three comply with the 150–250 bound for each chunk, since each check arrives after a single chunk (and chunks are capped at 250 words per SKILL.md's Pedagogy section).

**Quiz options (word count by position: A / B / C / D)**:
- Rep B4: 19 / 21 / 21 / 19, correct at C
- Rep B5: 21 / 21 / 21 / 21, correct at C
- Rep B6: 19 / 16 / 13 / 14, correct at B

No rep placed the correct option first. No rep made the correct option the sole longest (B5 has uniform length; B4 has the longest at positions B and C, with correct at C tied with B; B6's correct option at B is 16 words against a 19-word distractor at A). All are compliant.

### Caveat on Methodology

The 300-word ceiling in Scenario B applies to a session's **opening message**, defined as the text before the first interaction point that can involve the learner (a comprehension check or a request for learner input). The three supplementary probes B4–B6 measure teaching that begins *after* the learner has already interacted once (mode + size selection). These reps produce an opener (up to 250 words) + one chunk (up to 250 words) before arriving at the comprehension check, which is well within the cadence bound. Judging their 428–469-word totals against the 300-word ceiling would apply one probe's criterion to a different probe.

---

## Methodology Notes

**1. Counting convention for B1–B3:**

Words before the first interaction point are counted through and including the token containing the first `?`, which is the inclusive convention used for these three reps. This differs from RED's measurement to the character before the `?`, so a word containing the question mark is included (e.g., "this?" counts the word "this" in the total). This convention ensures consistency with how the setup questions (Mode ask) operate: they present a question token that represents a learner interaction point.

**2. Measurement refinement for RED/GREEN consistency:**

Scenario B's scoring criterion uses the first **comprehension check** as the measurement point, not the first `?` character. RED reps were scored using first-`?` measurement because each RED rep's first `?` was a genuine setup or teaching question. However, GREEN reps and any future runs must account for the possibility of rhetorical questions in prose. Rep green-B5 included a rhetorical framing question inside its opener ("who gets to decide this value?"), which a first-`?` convention would miscount as a comprehension check at 21 words when the real check arrived at 447 words. The first-`?` convention remains valid for the RED record (verified by reading), but the GREEN record uses the corrected measurement: words to the first comprehension check, with rhetorical questions in prose identified by context (a question that does not prompt learner input).

**3. green-B6 labelling deviation:**

Rep green-B6 folds its mental model explanation under the "Section 1" heading rather than standing it before the first section as a separate intro paragraph. The substance and word count are correct; only the labelling deviates from B4 and B5. Recorded as an observation, not a failure.
