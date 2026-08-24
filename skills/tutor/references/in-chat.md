# In-chat quiz loop

This file is read only when the session's mode is in-chat or both (SKILL.md's Mode
dispatch). It assumes SKILL.md's guardrails and Pedagogy are already active for the
session — the chunk, section, lesson, and opener sizes, and the question cadence, are
all defined there and are not restated here; wherever this file needs one of those
figures, it cites SKILL.md rather than asserting its own copy. What follows is what
happens at each question this loop asks, and what to do with detail that doesn't fit
inside a chunk.

## The loop

Teach one chunk. Per SKILL.md's Pedagogy — the lesson's *first* question "comes after
the first chunk, never later", and past that opening "never more than 3 chunks without
a question" — ask one when that cadence calls for it, or sooner if the chunk finishes a
self-contained idea: an `AskUserQuestion` call with 3–4 options and exactly one
objectively correct answer — not merely the option you'd personally favor (see
*Question types* below for what makes an answer objectively singular). Three is the
floor, not two: with the correct option barred from first place (*Answer-leak ban*
below), a two-option question lands it second every single time — the exact fixed
pattern that ban exists to prevent. Branch on the reply:

- Correct → *Right answer*, below.
- Incorrect → *Wrong answer*, below.

Then continue: next chunk if the section has more to teach, next section if this one's
question quota is met, or wrap-up if the lesson's sections are exhausted. If
`AskUserQuestion` isn't available in the current harness, every question in this loop
degrades per SKILL.md's Fallback section — numbered options in plain chat, same
discipline underneath.

## Overflow outlet: the detail aside

"Teach, don't dump" says what a chunk must not become. It doesn't say where the detail
that doesn't fit goes — that gap is what lets the rule get negotiated away under
pressure ("just this once, it's important"). This section gives the detail a place, so
the rule never has to bend: a small mechanism called **the detail aside**.

**When it applies.** The chunk is already complete and sufficient on its own — the
learner has everything the upcoming question needs — but there's real extra material (an
edge case, a historical reason, a neighboring mechanism) that would either push the
chunk past its bound or blur its one-mechanism focus if it were stuffed in.

**Never a substitute for the chunk.** If the upcoming question depends on the material,
it isn't overflow — it belongs in the chunk, inside SKILL.md's chunk bound, full stop.
The aside exists only for material a learner could skip and still answer correctly.

**The move:**

1. Finish the chunk normally.
2. Add one line offering the aside by name — e.g. "There's a wrinkle about `<topic>`
   I'm leaving out for now. Want it before we continue, or should I hold it for the
   wrap-up?" This is a plain yes/no in chat, not an `AskUserQuestion` call — it isn't a
   comprehension check and is never tallied as one.
3. **Accepted:** deliver it immediately, bounded the same way as a chunk, then resume
   the loop exactly where it left off. The aside doesn't count against the cadence cap
   and needs no question of its own.
4. **Declined, or the moment isn't right for an offer:** hold the topic in one line and
   move on without raising it again mid-section. Surface every held topic once, at
   wrap-up, after the score and weak-section recap, as optional material the learner can
   ask for now or take away. Nothing offered this way is ever silently dropped.

This is an occasional release valve, not a second content channel — most chunks won't
need one. Reaching for it on every chunk is the dump this rule exists to prevent, just
wearing a question mark first.

## Question types

Mix these three across a lesson. A well-formed question has exactly one option that is
strictly correct given what the chunk (or the excerpt shown) already established — never
a matter of taste, and never dependent on something not covered yet.

The worked examples below are invented, generic scaffolding — no file from any real
project — chosen only to show the shape. A live lesson's own questions ground in real
`file:line` references from the project actually being taught, per SKILL.md's
guardrails; these are format demonstrations only. Any parenthetical marking an option
"correct" is for this document's reader — it is never part of what actually gets sent to
the learner.

### 1. Concept / why

Checks whether the learner absorbed the *reason* behind a decision the chunk just
taught, not just its mechanics.

**Example.** Say the chunk just explained that a request-deduplication cache in this
codebase keeps its entries in memory only, with nothing written to disk — and
established two things about how it earns that: an entry is recorded *after* the
response it belongs to has already gone out, so the bookkeeping never sits in the
latency path the cache exists to shorten, and a cold cache refills itself from ordinary
traffic within seconds of a restart, at no measurable cost.

Question: "Why does the cache keep everything in memory instead of persisting it to
disk?"

- "Because writing each entry would add a filesystem round-trip to the hot path it
  speeds up." — distractor
- "Because the entries hold live objects that can't be serialized to a file and read
  back intact." — distractor
- "Because the cache only needs to survive one process; losing it on restart is
  accepted." — **correct, placed third of four**
- "Because the data this cache stores is considered too sensitive to ever write to
  disk." — distractor

### 2. Predict behavior (on shown code)

Shows a short excerpt, labeled like any lesson excerpt, and asks what it does for a
specific input — checks whether the learner can trace the mechanism, not just recite an
explanation of it.

**Example.**

```
// lib/util/clamp.ts:4-9 (invented, for format demonstration only)
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
```

Question: "What does `clamp(15, 0, 10)` return?"

- "15, because the value passes through unchanged when no bound is actually
  violated." — distractor
- "10, because 15 is above the max bound, so the function returns max." — **correct,
  placed second of three**
- "0, because any value outside the given range defaults to the minimum instead." —
  distractor

### 3. Rejected alternative

Checks whether the learner understood the trade-off, by asking why the code does *not*
take some other, tempting approach — the direct test of the chunk's "bad alternative"
half.

**Example.** Say the chunk just taught that a background worker's job queue is capped
at a fixed maximum size, and a producer that tries to add past the cap gets a hard error
instead of the item being queued.

Question: "Why is the queue bounded instead of growing to hold whatever gets enqueued?"

- "The cap lets the queue sit in one pre-allocated buffer instead of a growing
  structure." — distractor
- "A full queue is the signal the pool reads to decide to start another
  consumer." — distractor
- "The cap stops any single producer from taking more than its share of the
  slots." — distractor
- "It trades unbounded memory growth from a slow consumer for a loud, immediate
  error." — **correct, placed fourth of four**

## Answer-leak ban

> "The correct option is NEVER first and NEVER marked '(Recommended)'. Vary the correct
> option's position question to question, with no pattern. This deliberately inverts the
> AskUserQuestion convention of putting a recommended option first."

That is SKILL.md's Hard guardrail 5, the Answer-leak ban, restated here verbatim at the
point of use because this is the rule most likely to be violated without anyone
deciding to violate it — it isn't the shape a careless question obviously has, it's the
shape a *convention-following* question obviously has. Measured directly, with no
counter-pressure in place: **3 of 3 clean baseline reps placed the correct option
first**, and one of those three also made it the longest, most detailed option of four.
Two distinct pulls produced that result, and both need a named counter, not a generic
reminder.

| Rationalization | Reality |
|---|---|
| "`AskUserQuestion`'s own tool guidance leads with the recommended option, so putting the best answer first is just following the tool's convention correctly." | That convention is the exact adversary this rule exists to overcome, not a guide to follow here. All three clean baseline reps (A1, A3, A2b) placed the correct option first with no counter-pressure in place — the tool's convention, left unopposed, leaks the answer every time. For a comprehension check, the convention is inverted on purpose. |
| "The correct option is what actually matters, so it earns a fuller, more carefully written description than the throwaway distractors." | In rep A2b this alone made the answer guessable by length, independent of position — the correct option was also the longest and most detailed of four. Write every option, including distractors, to comparable length and specificity; a distractor that reads like an afterthought leaks the answer as surely as first position does. |

One more loophole is worth closing, even though the baseline never ran long enough to
expose it (it measured single questions, not a sequence): "no pattern" also rules out a
*fixed* rotation. Cycling position 1-2-3-4-1-2-3-4 across a lesson is still a pattern a
learner can pick up on after the first couple of questions. There's no formula to apply
here — before finalizing a question, check where the correct option landed on the last
one or two questions and put it somewhere else, rather than following any repeating
scheme.

**Two pre-send checks, once the options are written.** Count the words in each option's
label and, separately, in each option's description: on either measurement, if the
correct one is the sole longest, lengthen a distractor or trim it — tied for longest is
fine, uniquely longest is the leak. Labels are short, so most of the exposure lives in
the descriptions, but both get counted — a check that silently covers half of what it
claims to measure is worse than one that says what it covers. Then read each distractor
as the learner will: it has to be something someone who only half-understood the chunk would
genuinely pick. One that can be eliminated without knowing the material — it overclaims,
or waves the reason away — hands over the answer as surely as length or position does.

## Wrong answer

1. **Name the pull.** Say, briefly, why the option the learner picked was tempting — the
   real reasoning that distractor was built to invite, not a generic "not quite."
2. **Re-explain from a different angle.** A different example or a different failure
   mode than the original chunk used — not the same words again. If the first
   explanation didn't land, repeating it verbatim won't either.
3. **Ask a variant question.** Never the same question again verbatim: change the
   input, the phrasing, or the angle, while still testing the same underlying
   mechanism — and still obeying the answer-leak ban above (a fresh position, not
   wherever the correct option happened to land last time).

This protocol repeats on every subsequent wrong answer. Nothing in the spec caps how
many times it may repeat — don't invent a retry limit; keep re-explaining and varying
until the learner answers correctly.

## Right answer

One line of reinforcement — restate the mechanism's key point in a clause, not a
paragraph — then advance per *The loop* above. A correct answer is a cue to move on, not
a cue to add more material.

## Scorekeeping

Tally right/wrong per question, grouped by section, for the length of the session
only — SKILL.md's read-only guardrail covers these tallies too, so nothing here is ever
written to disk. A wrong answer followed by a correct answer on its variant is two
tallies, not one: the original question was still answered wrong.

At wrap-up, name the weak sections from those tallies. "Weak" is a judgment call, not a
formula — a section with any wrong answers, or a visibly lower right-ratio than the rest
of the lesson, is fair to name. The spec fixes no numeric cutoff for this, so don't
invent one.

## "Both" mode hand-off

When the session's mode is "both," the in-chat loop runs first, exactly as described
above — same cadence, same answer-leak ban, same protocols, same scorekeeping. The only
difference lands later: at deck-generation time, the learner's actual wrong answers from
this session are folded into the relevant quiz cards' feedback text. Where and how the
deck stores or renders that feedback is `references/deck.md`'s contract, not this
file's — this file's job ends when the chat loop ends.
