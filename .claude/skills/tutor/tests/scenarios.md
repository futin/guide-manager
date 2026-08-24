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
