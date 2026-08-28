# Deck contract, provenance, and update flow

This file is read only when the session's mode is deck or both (SKILL.md's Mode
dispatch), and only once per session — but *when* inside the session depends on
whichever of SKILL.md's steps needs it first, not always "right before anything is
written to disk." For a brand-new deck, nothing here is actually needed until
SKILL.md's Wrap step, right before the file is written. For a target path where a deck
already exists, though, SKILL.md's Explore step (step 4) needs this file immediately:
that step's own instruction to follow the update flow in this file (§7) is what decides
whether the session is an incremental update at all, well before Syllabus check or
Teach ever run. It assumes SKILL.md's guardrails and Pedagogy (chunk/section/lesson sizing, the
excerpt-labeling rule, the answer-leak ban) are already active for the session; where
this file needs one of those figures it cites SKILL.md rather than restating its own
copy. Because this file is loaded only after a deck mode was chosen, the deck-location
question (SKILL.md's Mode ask, step 3) has already been asked and answered by the time
anything here applies — an in-chat-only session never reads this file and never reaches
any of the disk-writing behavior it describes. Nothing below assumes a deck path exists
unless a deck mode was actually chosen.

## 1. File contract

A deck is exactly one `.html` file — no companion `.css`, `.js`, image, or font file
ships alongside it. Everything the page needs is inside that one file:

- **Head** — `<meta charset="utf-8">` (a `file://` page gets no HTTP response header
  to declare an encoding, and this contract's own prose style leans on non-ASCII
  punctuation like em dashes) and `<meta name="viewport" content="width=device-width,
  initial-scale=1">` (without it a mobile browser assumes a desktop-width virtual
  viewport, and the mobile-first CSS the Layout bullet below describes never actually
  takes effect on a phone).
- **CSS** — a single inline `<style>` block in `<head>`. No `<link rel="stylesheet">`
  to anywhere, no `@import`.
- **JS** — inline `<script>` block(s) before `</body>`. No `<script src="...">` to
  anywhere, and nothing in that script ever calls `fetch`, `XMLHttpRequest`,
  `WebSocket`, or dynamic `import()` — the deck has no network layer at all, by
  construction, not just by convention.
- **Fonts** — the system font stack (e.g.
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`)
  so the page never waits on or reaches for a downloaded font.
- **Theme** — light/dark handled entirely in CSS via an
  `@media (prefers-color-scheme: dark)` block; the OS/browser setting drives it, no
  theme-toggle control is required.
- **Layout** — mobile-first: one card fills the viewport, tap targets sized for a
  thumb, no fixed width wider than a phone viewport at the base breakpoint; a wider
  layout, if any, comes from a `min-width` media query added on top, never the reverse.
- **Diagrams** — inline `<svg>` only (§4); no vendored diagram library.

**Structure of the file:**

- One **mental-model card** (the opener), before any section.
- One wrapper element per section — `<section id="s1">`, `<section id="s2">`, …,
  using the same ids the provenance stamp uses (§6) — each containing that section's
  own run of cards: 2–4 concept cards and 1–2 quiz cards per SKILL.md's Pedagogy,
  preceded by a section-divider card for every section **after the first**, and
  optionally closed by **one qa card** (§2) — at most one per section, and always the
  last card in the wrapper, since it answers questions that section has just raised;
  placed any earlier it would sit ahead of quiz cards it hands hints to. The
  first section opens directly with its own concept cards — it has nothing "just
  finished" to name yet, since the mental-model card before it is the deck's opener,
  not a section (§2 defines the divider as a beat *between* sections, which is what
  it is: a transition, not a per-section header). A deck with N sections therefore
  carries exactly N−1 divider cards in total, each one living inside the wrapper of
  the section it introduces. Keeping one id'd wrapper per section is what lets the
  update flow (§7) find and replace exactly one section's cards without touching any
  other section's markup.
- One **recap card** (§2, §5, §6), after the last section, outside any section wrapper
  since it belongs to the deck as a whole, not to one section.

Section wrappers exist for the update flow's benefit only. Navigation (§2) ignores
them: the page's JS collects every card — mental-model, concept, quiz, divider,
recap — into one flat, in-document-order list at load, and Next/Back/the progress bar
walk that flat list, crossing section boundaries transparently.

**Two markers identify a file as a tutor deck.** This skill always writes both into
every deck it generates; the update flow's refusal case in §7 demands only that at
least one still be present — the minimum needed to tell "damaged tutor output" apart
from "unrelated file":

1. The literal HTML comment `<!-- tutor-deck -->`, as the line right after
   `<!DOCTYPE html>`.
2. The provenance stamp itself, `<script type="application/json" id="provenance">`
   (§6).

The comment is the cheap, always-present fallback: a deck whose stamp is missing or
corrupted (§7's legacy case) still carries it, which is what tells the update flow
"this is tutor output with a damaged stamp" rather than "this is unrelated to tutor
entirely."

## 2. Card types and quiz behavior

Six card types. Five match SKILL.md's Pedagogy one-to-one; the sixth, the qa card, is
optional and exists only in deck mode:

- **mental-model card** — the deck's opener. One paragraph, the same mental model /
  intuition SKILL.md's Opener describes for the in-chat loop. No code, no quiz.
- **concept card** — one chunk: prose covering what it does, why it exists, the bad
  alternative, and the trade-off (SKILL.md's Chunk shape), plus, when the chunk showed
  code, a `<pre>` excerpt whose first line is the exact source range, e.g.
  `// scan.ts:44-52`, with `(compacted here)` appended when abridged — the identical
  labeling rule SKILL.md's Excerpts uses. A concept card may carry one optional
  `<details><summary>More detail</summary>…</details>` block — this is the collapsible
  block SKILL.md's guardrail 6 refers to: real, relevant material a learner can skip
  and still follow the lesson. It's native `<details>`, collapsed by default, no JS
  required to work. Overflow goes here so the chunk itself never grows past its
  bound — it is not a place to smuggle in a second, bigger lesson; if the collapsed
  content would itself need a quiz to check understanding, it isn't overflow, it's a
  chunk that belongs in the main card.
- **quiz card** — see below.
- **qa card** — optional, at most one per section, always the last card inside that
  section's wrapper (§1). It carries 2–4 questions the section itself is likely to have
  raised, each with its answer already written and collapsed behind native `<details>`:

  ```html
  <div class="card card-qa">
    <p class="eyebrow">Questions you might ask</p>
    <details class="qa-item">
      <summary>…one question…</summary>
      <p>…grounded answer, ≤120 words…</p>
    </details>
    <!-- 2–4 qa-item blocks total -->
  </div>
  ```

  Same mechanics as the concept card's "More detail" block above: collapsed by default,
  no JS, and the identical overflow test — if an answer would itself need a quiz to
  check understanding, it isn't a qa answer, it's a chunk that belongs in a concept
  card. The questions are *adjacent confusions* — "why not X instead?", "what happens
  when Y?" — never restatements of the section's own quiz prompts, which would hand the
  learner the answers it is the quiz's job to ask for. Each answer is ≤120 words and
  grounded the way every other claim in the deck is: a real `file:line` in current
  code, with a short `<pre>` excerpt allowed under the same source-range labeling rule
  the concept card uses when quoting helps. The card is navigation-inert — an ordinary
  card in the flat list §1 describes, so Next/Back walk it like any other and it never
  gates progress; only quiz cards do.
- **section-divider card** — a short, code-free, quiz-free beat between sections:
  names the section just finished, names the section about to start, and (§5) carries
  that next section's cross-link to a written guide chapter when one exists. Purely
  wayfinding — it teaches nothing new and asks nothing.
- **recap card** — the last card in the deck. Shows the final score (below), a list of
  the lesson's sections — each entry may link back to that section via its `id` (§1),
  letting a learner jump back to review it — the cross-links §5 defines, and the
  provenance one-liner §6 defines. **That link is same-page navigation, not a native
  `#hash` anchor:** §1 makes only one card visible at a time (every other card is
  hidden, e.g. via `display: none`), so a plain `<a href="#s1">` would scroll to a
  wrapper whose own contents are all hidden and leave the learner looking at a blank
  pane. Implement it as a control (e.g. a `<button data-target="s1">`) whose click
  handler finds that section's first card in the flat list (§1) and shows it exactly
  the way Next/Back do — same disabled-state recompute and progress-bar update, just
  moving more than one card at a time.

### The quiz card

A quiz card holds a prompt and its options — 3–4 of them. Three is the floor, not two:
§3 bars the correct option from first place, so a two-option card lands the answer
second every single time, the exact fixed pattern that ban exists to prevent, and a deck
built entirely of them could never satisfy §8's item 4 (positions must take more than
one distinct value). Every option is a small self-contained unit: a short,
always-visible label, plus its own feedback, hidden until that specific option is
picked. Worked example (invented, for format demonstration only — not a real
`file:line` claim):

```html
<div class="card card-quiz">
  <pre>// example.ts:1-5 (invented, for format demonstration only)
function firstPositive(nums) {
  for (const n of nums) {
    if (n &gt; 0) return n;
  }
  return null;
}</pre>
  <p class="quiz-prompt">What does <code>firstPositive([-4, -1, 0, 3, 7])</code> return?</p>
  <div class="quiz-options">
    <div class="quiz-option" data-correct="false">
      <button class="quiz-option-btn">-4</button>
      <p class="quiz-feedback">Tempting if the function just returned the first element
        regardless of sign — but the loop checks <code>n &gt; 0</code> before
        returning anything, so a negative first element is skipped, not returned.</p>
    </div>
    <div class="quiz-option" data-correct="false">
      <button class="quiz-option-btn">0</button>
      <p class="quiz-feedback">Zero isn't a fallback or boundary value anywhere in
        this function — it fails the same <code>n &gt; 0</code> check as the negative
        numbers before it, so the loop scans right past it too.</p>
    </div>
    <div class="quiz-option" data-correct="true">
      <button class="quiz-option-btn">3</button>
      <p class="quiz-feedback">Correct. The loop returns the first element that
        passes <code>n &gt; 0</code>; scanning the list in order, <code>3</code> is
        the first one that qualifies.</p>
    </div>
    <div class="quiz-option" data-correct="false">
      <button class="quiz-option-btn">null</button>
      <p class="quiz-feedback"><code>null</code> only happens when the loop finishes
        without finding anything — but <code>3</code> and <code>7</code> both satisfy
        <code>n &gt; 0</code>, so the loop returns well before reaching the end.</p>
    </div>
  </div>
</div>
```

(This single card places the correct option third of four. §3 covers how the position
must keep varying across a whole deck's worth of these — one card can't demonstrate
that on its own.)

What happens, in order:

1. **On load**, all options look identical — same style, same size, no matter which
   one carries `data-correct="true"`. Nothing about the markup or the CSS gives the
   answer away visually; the only thing that ever distinguishes them is which one the
   learner taps. Whenever a quiz card like this one is the card showing, the deck's
   shared `Next` control (below) starts disabled.
2. **The learner taps an option.** That tap locks the card's answer: every option's
   button, including the one just tapped, becomes inert afterward. All options stay
   visible so the learner can compare them, but no further tap on this card changes
   anything — the tally (below) fires exactly once per card, on the tap that locks it.
3. **That tap reveals exactly one thing:** the tapped option's own `.quiz-feedback`
   paragraph (hidden by default via CSS, e.g. `display: none` lifted on
   `.quiz-option.revealed .quiz-feedback`). Every option's feedback is written ahead
   of time, at generation — wrong options teach, so a wrong tap is never a dead end,
   it's the specific reason that option is wrong.
4. **The tap also does one piece of bookkeeping:** it adds the card to a running
   `score = { correct, total }`, correct or not per `data-correct`, shown on the recap
   card; and it clears the shared `Next` control's disabled state, which was the only
   thing blocking the learner from moving past this card. That disabled state is
   recomputed every time a card is shown, not set once — revisiting an
   already-answered quiz card via Back/Next leaves `Next` enabled, since the tally
   isn't re-counted on a revisit.

Navigation is the same on every card, quiz or not: one persistent `Next`/`Back`
button pair (not duplicated per card) plus `ArrowRight`/`ArrowLeft` keydown listeners
calling the same two functions the buttons call, plus a progress bar whose fill is
`currentCardIndex / (totalCards - 1)` across the whole flat card list from §1. `Back`
is disabled on the first card. `Next` is disabled only while the current card is an
unanswered quiz card (above); it is otherwise always enabled.

### Both-mode fold-in: real wrong answers become extra feedback

`references/in-chat.md`'s "Both mode hand-off" hands this off explicitly:

> at deck-generation time, the learner's actual wrong answers from this session are
> folded into the relevant quiz cards' feedback text. Where and how the deck stores or
> renders that feedback is `references/deck.md`'s contract, not this file's

Here is that contract:

- **Storage.** There is no separate field or runtime lookup for this. When mode is
  "both" and the in-chat loop's question for a given quiz card was answered wrong at
  least once during the session, the generating agent appends one more sentence to
  that specific wrong option's own `.quiz-feedback` text — e.g., "You picked this one
  in your session — …" — baked into the same static HTML as every other feedback
  string, at generation time, once. Options the learner never picked keep only their
  original pre-written feedback, unchanged.
- **Rendering.** Identical to any other option: the reveal-on-select mechanism above.
  No new markup, no new JS branch — a folded-in sentence is just more text inside a
  `.quiz-feedback` paragraph that already exists.
- **When it doesn't apply.** A deck-only session (no chat loop ran) has no real wrong
  answers to fold in, so this step is simply skipped — cards carry only their
  pre-written feedback. The same applies, section by section, during an incremental
  update (§7): a section that gets re-taught (mode both) folds in that update
  session's wrong answers; a section left untouched keeps whatever was (or wasn't)
  folded in the last time it was generated, unchanged, like the rest of its markup.

## 3. Correct-option placement (generation-time)

> The correct option is NEVER first and NEVER marked '(Recommended)'. Vary the correct
> option's position question to question, with no pattern. This deliberately inverts
> the AskUserQuestion convention of putting a recommended option first.

That's SKILL.md's Hard guardrail 5, the Answer-leak ban, restated here verbatim
because it governs a different moment for a deck than for the in-chat loop: there it's
a live `AskUserQuestion` call; here it's the generating agent's own authoring
decision — which option gets `data-correct="true"` in the markup above, chosen before
the file is ever opened by a learner. "No pattern" applies across a deck's own sequence
of quiz cards exactly as it does across a lesson's in-chat questions — a fixed rotation
across the deck's cards is still a pattern.

**The by-hand check this requires:** before setting `data-correct="true"` on a new
quiz card, look at where the correct option landed on the previous one or two quiz
cards already written for this deck, and place this one somewhere else. There's no
formula beyond that repeated look-back — checking the last couple of cards each time
is what catches a rotation (e.g. 1-2-3-1-2-3) that "never place it first" alone would
miss.

Nothing about the rendered page may leak this either. Every option in §2's markup gets
identical styling and identical event wiring regardless of position or of its
`data-correct` value — the CSS never highlights, reorders, or pre-selects any option,
and the JS treats every `.quiz-option-btn` click identically until after the tap.
Getting the position right in the markup and then styling the first option as a
visual default would leak the answer just as surely as always placing it there.

## 4. Diagrams

Hand-authored inline `<svg>`, only where a genuine structural relationship — a flow
between a handful of components, a shape a reader would otherwise have to reconstruct
from prose — actually needs drawing. Most concept cards need no diagram at all; reach
for one only when prose plus a code excerpt leaves a real gap.

No mermaid, and no vendored diagram library of any kind: mermaid needs a runtime
library loaded from somewhere, which breaks the self-contained, zero-external-reference
file contract in §1. An inline `<svg>` is markup, not a dependency — it ships inside
the same file, needs nothing fetched, and is what the self-containment audit in §8
expects to find when it matches an `xmlns` attribute.

Two things keep an inline SVG diagram consistent with the rest of the contract:

- Use `currentColor` (or a CSS custom property already defined in §1's `<style>`
  block) for strokes and fills instead of hard-coded hex colors, so the diagram adapts
  to light/dark mode the same way the rest of the page does.
- No `<image>` or `<use>` element may point at an external URL — everything the SVG
  draws is inline path/shape data.

## 5. Cross-links

Two independent questions decide what the recap card (and, for the guide case, each
section-divider card) link to. A lesson can land on either answer to each,
independently — it can be both part of a series and covered by an existing guide.

**Is there a written learning guide covering this topic already in the project?**

- **Yes** → each section-divider card (§2) links its section's matching chapter in
  that guide, as a relative path from the deck's own location on disk; the recap card
  links the guide's entry page the same way.
- **No** → the recap card's text suggests that a written reference guide for this
  topic could be generated as a follow-up, without naming any specific tool or
  skill — whether and how to produce one is a decision for whatever's available in the
  current project, not something this deck hard-codes.

**Is this lesson part of a series (SKILL.md's Lesson series)?**

- **Yes, and the next lesson's deck has already been generated** → the recap card
  links it: same series directory as the current deck, same naming pattern, next
  number in the series (`<series>-2-<desc>.html` follows `<series>-1-<desc>.html`,
  and so on) — check that the path exists before linking to it.
- **Yes, but the next lesson's deck doesn't exist yet** → the recap card names it (its
  slug or title) as not yet built, with no link. Nothing here writes that deck; only
  running that lesson's own session does.
- **No** → no series line on the recap card at all.

### 5b. Optional Artifact publish

After the deck file is written to disk, offer once — a plain yes/no in chat, not a
quiz question — to publish it as a Claude Artifact, for a private, phone-readable link
the learner can open without a laptop. The file on disk stays canonical; the Artifact,
if the learner accepts, is a rendering of it, not a replacement for it. Never publish
without an explicit yes to that specific offer — an earlier "yes" to something else
(confirming the deck itself, for instance) doesn't count. When no Artifact-publishing
tool exists in the current harness, skip the offer entirely rather than mentioning a
capability that isn't there.

## 6. Provenance stamp

Embedded verbatim as `<script type="application/json" id="provenance">`, exact schema:

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

Field by field:

- **`commit`** — the full SHA of `HEAD` at generation time, or JSON `null` when the
  project isn't a git repo. Never a short SHA here — the recap card's human-visible
  line is where the short form belongs (below).
- **`generated`** — an ISO-8601 date for when this stamp was written.
- **`sources`** — the deck-wide list of every source file any section drew from. This
  is the file list the update flow (§7) diffs against; keeping it deck-wide, rather
  than making the update flow union the per-section lists itself, lets the diff step
  and the section-mapping step run independently, in either order.
- **`sections`** — one entry per section, in lesson order: a stable `id` (matching the
  `id` on that section's wrapper element in the file, §1), the section's `title`, and
  the subset of `sources` that section's cards and quizzes actually draw from.

**A general-subject deck (SKILL.md's Subject kind) stamps `commit: null` and empty
`sources` lists — deliberately, not as a degenerate case.** Its claims ground in
domain knowledge rather than files, so there is nothing for §7's diff to walk;
recording the repo's `HEAD` anyway would tie the deck's freshness to commits that
never touched its material, and a first "update" would then diff against a base that
proves nothing. The `generated` date and the `sections` list still carry their full
weight — they are what the recap card and an update conversation anchor to.

**The relationship between the two `sources` lists is a subset relationship, and it's
load-bearing:** every path inside any `sections[].sources` array must also appear in
the top-level `sources` array — that's exactly what §8's second checklist item
verifies. The top-level list is the union of every section's list.

**Section `id`s are permanent once assigned.** They're allocated in lesson order at
first generation (`s1`, `s2`, `s3`, …) and never reassigned or reused by a later
incremental update, even if a section's content changes substantially — the happy path
(§7) only ever regenerates or leaves alone a section already in the stamp; it never
restructures the lesson into new sections on its own. A confirmed full rebuild (§7) is
the sole exception: it starts over per §1–§6 and discards these same ids along with
everything else, which is exactly why it always needs confirmation first, never
something the happy path reaches for on its own. Stable ids are what lets "untouched
sections byte-identical" (§7) mean something concrete: the wrapper element at a given `id`
either gets fully replaced or is left alone, never renumbered out from under a link or
a later re-run of this same diff.

**The human-visible half:** the recap card carries a one-line "built at
`<short-sha>`" using the same commit, shortened, for a learner who will never open dev
tools to read the JSON. When `commit` is `null` (no commit recorded), there is no SHA
to shorten — the line instead reads
"Generated `<generated-date>` (not tracked in git)", reusing the stamp's own
`generated` value. A general-subject deck drops the parenthetical and reads just
"Generated `<generated-date>`" — "(not tracked in git)" explains a SHA a code deck is
missing, and a general deck isn't missing anything. Never leave the line blank or
half-written (e.g. "built at ``") just because there's no commit to fill it with.

## 7. Update flow

This flow applies only when a file already exists at the target deck path — SKILL.md's
Explore step already checks for that and only enters here when something is there. A
brand-new target path just gets a fresh deck written per §1–§6 above; there's no stamp
yet to parse.

**Before the happy path, check in this order** — this is what turns the four
stamp-level error conditions below into an unambiguous procedure rather than a set of
cases an agent has to reconcile itself (the table's one remaining row is a source-level
condition instead, reached from inside the happy path, at step 3):

1. Does the file have `id="provenance"` **or** the `<!-- tutor-deck -->` comment
   (§1)? If **neither** is present → refuse (last row of the table below); stop.
2. Does the `id="provenance"` script tag exist **and** parse as JSON? If **no** →
   legacy path (third row); stop.
3. Is the parsed stamp's `commit` present and non-`null`? If **no** → confirmed full
   rebuild (first row); stop. For a general-subject deck this exit is the designed
   refresh path, not an error: its stamp says `commit: null` on purpose (§6), there is
   no source diff to make a section-level update safe, so no happy path exists for
   it — the user says what changed or what to extend, and the deck is rebuilt per
   §1–§6 with that in hand, behind the same confirmation as any full rebuild.
4. Does `git cat-file -e <sha>^{commit}` succeed for that commit? If **no** → warn,
   then confirmed full rebuild (second row); stop.
5. Otherwise → the happy path.

**The happy path**, once all four checks above pass:

1. Parse the existing file's `<script type="application/json" id="provenance">` block.
2. `git diff --name-only <sha>..HEAD -- <sources>` — using the stamp's own `commit` as
   `<sha>` and its own `sources` list as the pathspec — to get the set of files that
   actually changed since this deck was last generated.
3. Map that set of touched files onto sections: a section is "affected" if any entry
   in its own `sections[].sources` appears in the touched-file set from step 2;
   otherwise it's untouched.

   A touched file may no longer exist at `HEAD` — renamed away or deleted since the
   last generation still counts as a change, so it marks its section affected the same
   way an edit does. Before re-teaching an affected section, check each path in its own
   `sections[].sources` against `HEAD` (`git cat-file -e HEAD:<path>`) and branch: if
   some of that section's sources survive, regenerate it from those alone — step 5
   recomputes that section's `sources` entry from what its new cards actually draw
   from, so the vanished paths drop out there. If *every* source a section draws from
   is gone, the happy path stops: nothing is left to ground that section's claims in,
   and dropping or merging it instead would restructure the lesson, which the happy
   path never does on its own (§6). That case escalates to a confirmed full
   rebuild — fourth row of the table below — and is never rebuilt unasked.
4. Regenerate each affected section, in three sub-steps:

   a. **Regenerate the section.** Re-explore and (for in-chat/both) re-teach only the
      affected sections, then regenerate only those sections' cards and quiz
      questions — replacing the contents of that section's `id`'d wrapper element (§1)
      and nothing else. Untouched sections' wrapper elements are left byte-identical,
      including whatever §2's both-mode fold-in baked into them previously. A section's
      qa card (§2) lives inside that wrapper, so it is regenerated along with the rest
      of an affected section and left byte-identical in an untouched one — no special
      handling either way. A regenerated section's `title` may change if its new
      content warrants it — the `id` is what's permanent (§6), not the title.

   b. **Title change → recap entry.** The recap card's own list of section titles (§2)
      lives outside every section's wrapper, so "replace that section's wrapper and
      nothing else" never touches it on its own. When a regenerated section's title
      changes, also update that section's one entry in the recap card's list to match;
      otherwise skip it, the same as any other part of the recap outside the provenance
      line (step 5).

   c. **Title change → following divider.** The same reasoning extends one layer
      further, into a section's own neighbor: §1 says the divider that introduces a
      section lives inside that section's own wrapper, and §2 says that divider names
      the *previous* section by title. So when a regenerated section's title changes,
      the divider inside the *following* section's wrapper goes stale the same way the
      recap entry does — unless the regenerated section is the deck's last one, in
      which case no such divider exists to name it. This is the one sanctioned
      exception to "untouched sections' wrapper elements are left byte-identical" in
      (a): when it applies, touch only that one divider card inside the following
      section's otherwise-untouched wrapper to match the new title, and change nothing
      else there.
5. Restamp: write a new `commit` (new `HEAD`) and `generated` (now). For each
   regenerated section, recompute that section's own `sections[].sources` entry from
   what its new cards and quizzes actually draw from; every untouched section's
   `sections[].sources` entry is left exactly as it was, unchanged, like the rest of
   its wrapper. Then recompute the top-level `sources` array as the union of every
   section's `sources` entry, regenerated and untouched alike (§6). This step
   always runs, even when step 3 found zero affected sections — the deck is still
   being re-certified current as of the new `HEAD`, which is itself worth recording.
   Update the recap card's "built at `<short-sha>`" line to match. Then write the
   updated file the same way any deck is written: only after SKILL.md's wrap-time
   confirmation (Session flow, step 7). Overwriting in place is still a write, and this
   is exactly the case where that is easiest to forget — at zero affected sections the
   restamp is the only change, and it still goes through the gate.

**Error paths** — each one names what the agent does on its own versus what it must
ask the user before doing:

| Condition | Agent does on its own | Agent asks before |
|---|---|---|
| `commit` is `null` or absent from the stamp | Detects this and explains why a diff isn't possible (no commit recorded) | Confirming a full rebuild — never rebuilds without asking |
| `commit` is present but `git cat-file -e <sha>^{commit}` fails | Detects the SHA is unknown to this repo (rebase, squash, shallow clone) and warns why | Confirming a full rebuild — never guesses a different diff base, never falls back to some nearby commit on its own |
| The provenance script tag is missing, or its contents don't parse as JSON | Treats the file as unstamped legacy tutor output | Confirming before overwriting anything — a full rebuild, since there's no stamp to diff from |
| Every source a section drew from is gone from `HEAD` — renamed away or deleted (happy path, step 3) | Names which of that section's paths no longer exist and explains that nothing is left to ground a regeneration in | Confirming a full rebuild — dropping or merging the emptied section instead would restructure the lesson, which the happy path never does on its own (§6) |
| The file has neither `id="provenance"` nor the `<!-- tutor-deck -->` comment (§1) | Refuses outright — this isn't judged to be tutor output at all | Nothing to confirm; there's no path forward at this location. It asks the user for a different target path instead, and the whole check sequence above runs again against whatever path comes back |

**What "full rebuild" means, concretely, in every row above:** exactly the
brand-new-target-path procedure this section opens with — write a fresh deck at the
same path per §1–§6, in full, as if the target path were empty. It does not reuse the
old file's section `id`s, titles, `sources`, or wrapper markup, and it does not try to
salvage whatever structure the old stamp (or the old file's guessed shape, in the
legacy case) suggests: a commit this repo can't resolve, a stamp that won't parse, or a
section whose every source has vanished leaves the update flow nothing it can safely
carry forward, so it carries forward nothing.

The last row is the one genuinely irreversible mistake this flow could make: writing
over a file that was never a deck at all, and might be someone's unrelated work. Every
other row still ends in a rebuild, just a confirmed one; that row ends in a refusal,
full stop.

## 8. Pre-handover checklist

The generating agent runs all seven of these against its own output before calling a
deck done. Every item is a command or an observable condition, not an impression:

1. **No external references.**
   ```bash
   grep -nE 'https?://' <deck>
   ```
   Passes only if every match is inside an `xmlns="http://www.w3.org/2000/svg"` (or
   equivalent SVG namespace) attribute, or inside a `<pre>` excerpt. A URL in an
   excerpt is quoted source — text the page displays, not something it reaches for —
   and this item is about what the page loads; a deck teaching a module that contains
   a URL must never mangle the excerpt to quiet the grep. Any other match — a `src`,
   an `href`, a `fetch(` URL, a CDN link — is a failure. The exemption is settled by
   eye: for each match, look at the surrounding lines for the enclosing `<pre>`.

2. **Stamp integrity.** The `<script type="application/json" id="provenance">` block
   parses with no error under any standard JSON parser (a one-line `python3 -c` or
   `node -e` check is enough wherever either is available), and every string in every
   `sections[].sources` array is also present in the top-level `sources` array (§6).
   Any `sections[].sources` entry missing from `sources` is a failure.

3. **No empty feedback, no empty questions.** Every `<p class="quiz-feedback">` in the
   file has non-empty, non-whitespace text content — an option with nothing to say
   when picked fails the "wrong options teach too" requirement in §2. A quick grep for
   a literal-empty tag,
   ```bash
   grep -n '<p class="quiz-feedback"></p>' <deck>
   ```
   catches the obvious case; a paragraph containing only whitespace needs an actual
   read, since grep alone can't distinguish whitespace from content.

   Every qa `<details>` (§2) is held to the same bar: both its `<summary>` and its
   answer `<p>` must have non-empty, non-whitespace text content — a question with
   nothing behind it reads as a rendering bug and teaches less than no card at all.
   ```bash
   grep -nE '<summary>\s*</summary>|<details class="qa-item">\s*<summary>|<p></p>' <deck>
   ```
   must return nothing: the first alternative catches an empty question, the third an
   empty answer, and the second a qa item whose `<summary>` opens on the same line as
   its `<details>` — off-shape for §2's markup, so worth an eye even though it is not
   an emptiness failure on its own. Whitespace-only bodies, here as above, need an
   actual read.

4. **Correct-option position varies.** Collect the position of `data-correct="true"`
   within its `.quiz-options` list for every quiz card in the file. If the deck has
   two or more quiz cards, that list of positions must contain more than one distinct
   value. This is a floor, not the whole of §3's rule — it mechanically catches
   "always the same slot" (including "never first, but always second," which still
   fails); it can't mechanically catch a longer repeating rotation, which is why §3
   also asks the generating agent to check the last card or two by hand before
   finalizing a new one.

5. **Opens from `file://`.** Statically: none of `fetch(`, `XMLHttpRequest`,
   `WebSocket(`, or dynamic `import(` appears anywhere in the file's inline JS —
   ```bash
   grep -nE 'fetch\(|XMLHttpRequest|WebSocket\(|import\(' <deck>
   ```
   returns nothing — or, when it does return lines, every one of them sits inside a
   `<pre>` excerpt rather than inside a `<script>` block. Quoted source that happens to
   call `fetch(` is text the page displays, never code it runs, so it doesn't count
   against this item and is never edited to silence the grep; only a match in the
   inline JS is a failure. Where a browser is available to check by hand, the stronger
   version of this check is to open the file directly (a `file://` path, not
   `http://localhost`) and confirm it renders with no console errors — but the grep
   above is the one to run when no browser is available.

6. **Correct option isn't the length tell.** For every quiz card, measure the word
   count of each option's visible label (the `<button class="quiz-option-btn">`
   text) and, separately, of each option's `.quiz-feedback` text — both counted as
   text content the way item 3 means it (tags and entities resolved away first), then
   split on whitespace. On either measurement, the correct option must not be the
   *sole* longest among that card's options — tied for longest, or short, is fine;
   uniquely longest is the failure. This is the same length-based leak SKILL.md's
   answer-leak ban (guardrail 5) already warns about for `AskUserQuestion` options, it
   has shipped in this project before, and §3's placement rule does nothing to stop
   it — position and length are independent signals and both need their own check. A
   plain per-option word count, run per quiz card, is enough to catch it.

7. **Meta tags present.**
   ```bash
   grep -ciE 'charset=.?utf-8' <deck>; grep -c 'name="viewport"' <deck>
   ```
   The charset pattern is deliberately case-insensitive and tolerant of the quote
   character: `<meta charset="UTF-8">` is the common spelling and satisfies §1 just as
   `charset="utf-8"` does, so an exact-match grep would fail a passing deck.
   Both counts must be ≥ 1 — §1 requires both, and a missing viewport tag fails
   silently: the mobile-first CSS it describes never actually takes effect on a phone.

Every item here has a concrete yes/no outcome. A deck that fails any of them isn't
ready to hand over; fix the specific failure and re-run that one check, not a
re-review of the whole file.
