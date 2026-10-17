# RED/GREEN Scenarios for Tutor Discipline Rules

These are RED/GREEN test scenarios for the tutor skill's discipline rules; GREEN reruns must use the identical prompt text.

## Scenario A — answer-leak (micro-test, non-interactive)

**Reps:** 3

**Subagent prompt:**

You are running an interactive teaching session about a codebase for a developer. You have just explained, in about 200 words, how `server/lib/scan.ts` in the current project ranks sessions (it reads transcript files, scores them by recency, and returns the top N). Now you must check the learner's comprehension with the AskUserQuestion tool before continuing.
Do NOT execute any tool. Instead, return ONLY the exact JSON you would pass as the AskUserQuestion tool input, and nothing else.

**Scoring criteria:**

Scored FAIL if, in the returned JSON: the correct option is listed first, OR any option label contains "(Recommended)", OR option order makes the answer guessable (e.g. one detailed option among throwaways).

## Scenario B — wall-of-text (micro-test)

**Reps:** 3

**Subagent prompt:**

A developer says: "teach me how the config loader in this project works" (`server/lib/config.ts`: loads `.env`, precedence process.env > .env file > defaults, ~60 lines). Produce the opening of your interactive teaching session, exactly as you would send it. Assume you may ask the learner questions at any point.

**Scoring criteria:**

Scored FAIL if the opening message exceeds 300 words before any question or interaction point, OR contains no comprehension check plan at all.

Measured as the number of whitespace-separated words preceding the first comprehension check in the opening message. An invitation to ask questions is not an interaction point. Note: rhetorical questions in prose (questions that do not prompt learner input) are not comprehension checks; measurement continues to the first check that does prompt learner input.

## Scenario C — quiz question placement (micro-test, non-interactive)

**Reps:** 3

**Why:** in the Claude Desktop Code tab, assistant text written earlier in a turn than a tool call is folded into the turn's collapsed work section, and an
`AskUserQuestion` card is shown on its own — so a chunk taught as prose and then quizzed through the card is never seen (backlog #33). Unlike A and B, this
scenario gives the agent the skill text, because what it measures is what that text tells the agent to do. Run it with `<skill dir>` pointing at the skill
version under test; the prompt is otherwise identical between RED and GREEN.

**Subagent prompt:**

You are running the `tutor` skill. Its instructions are in `<skill dir>/SKILL.md`; the session's mode is in-chat, so `<skill dir>/references/in-chat.md` is
loaded too. Read both files now and follow them. You run in the Claude Desktop app's Code tab, and `AskUserQuestion` is available. The learner asked "teach me
how the config loader in this project works" (`server/lib/config.ts`: loads `.env`, precedence process.env > .env file > defaults, ~60 lines). The mode ask
and the syllabus check are done: in-chat, quick, three sections, confirmed. Your next turn teaches the opener and the first chunk, and poses the lesson's first
comprehension question. Apart from reading those two files, do NOT execute any tool. Instead, return ONLY a JSON array describing that turn in order, one element per step: `{"type":"text",
"text":"..."}` for assistant text, `{"type":"tool","name":"...","input":{...}}` for a tool call. Nothing else.

**Scoring criteria:**

Scored FAIL if the turn contains an `AskUserQuestion` call for the comprehension question, OR the question and its options are not in the last element of the
array, OR the chunk is not in that same last element (a chunk in an earlier text element, before a tool call, is the hidden-lesson shape). PASS needs the
chunk, the question and its numbered options together as the final text element, with no tool call anywhere after the chunk. The answer-leak criteria of
Scenario A are scored on the options as a separate note, not as this scenario's result.
