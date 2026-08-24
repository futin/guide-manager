# Bionic reading in the study HTML page — Design

**Date:** 2026-08-24
**Status:** Approved (brainstorm session, remote dashboard)

## Overview

The `/study` skill can emit a single generated `index.html` carrying a whole
guide — often 10–15k words of prose. This design adds an optional **bionic
reading** aid to that page: a reader-facing panel that bolds the leading
characters of words to create artificial fixation points, with two knobs
(fixation strength, saccade frequency) and a persisted on/off state.

The implementation is a **runtime DOM pass** shipped inline in the page, built
from a **vendored snippet** owned by this repo, so there is one place to fix
bugs and the generated guide stays self-contained and offline-capable.

## Goals

- Long study pages are readable with a fixation aid, tunable by the reader.
- Zero change to the bytes the generator writes for the guide's own prose —
  the existing fidelity and leaked-markdown checkers stay green untouched.
- The page keeps its hard constraints: self-contained, no external assets,
  renders from `file://` with the network off, both color schemes.
- One canonical implementation in this repo, vendored into each guide so a
  guide rebuilds with the plugin uninstalled.

## Non-goals

- **Tutor decks** — cards are short and mobile-first; a two-slider panel
  fights the tap targets for little text. Out of scope.
- **Server-rendered markdown guides** (`/guide` `.md` pages) — out of scope.
  Section *Later* notes what changes if this is revisited.
- No dimming of the non-bolded remainder (see Decisions).
- No new question in `/study` step 3 — the panel always ships, default off.

## Decisions made

| Decision | Choice |
|---|---|
| Surface | Study `index.html` only |
| Mechanism | Runtime DOM pass, not baked markup |
| Controls | On/off + fixation strength + saccade frequency |
| Skill config | Always included, default off; no step-3 question |
| Source of truth | Vendored `assets/` snippet in guide-manager |
| Remainder styling | Untouched — prefix bolds, rest keeps body color |

**Why runtime, not baked.** The guide's committed `tools/check.mjs` runs a
fidelity check comparing word sequences between the markdown and the page's
visible text after stripping tags. Baked `<b>` inside a word makes `Bionic`
strip to `Bio nic` — two words — and fails on essentially every prose line.
The leaked-markdown check has the same exposure. A runtime pass never touches
the file on disk, so both checks are unaffected and need no exclusions.

**Why no dimming.** Bionic renders commonly dim the non-bolded remainder for
extra contrast. The page ships a dark theme whose body text is already at the
low end of comfortable; dropping the remainder to `--muted` puts body prose
below WCAG AA on that theme. Bold-only keeps the fixation signal and costs
nothing in contrast.

**Why default off.** Bionic reading's reading-speed claims are not supported
by peer-reviewed evidence, and heavy mid-word bolding helps some dyslexic
readers and hinders others. It is offered, not imposed.

## Behavior

### Algorithm

Two pure functions carry all the logic:

- `bionicWord(word, strength) -> n`, the count of leading characters to bold.
  - `word.length < 2` → `0`. A single bold character on a one-character word
    is noise, not a fixation point.
  - `word.length` 2 or 3 → `1`.
  - otherwise `n = clamp(round(word.length * strength), 1, word.length - 1)`.
  - **`n` is never `word.length`.** A fully bold word carries no fixation
    point — it is the one output that defeats the whole mechanism.
- `shouldBold(wordIndex, freq) -> boolean`, returning `wordIndex % freq === 0`.
  `wordIndex` counts words across the **whole document**, not per text node,
  so the saccade rhythm stays regular across paragraph boundaries.

Tokenization splits a text node into alternating word and non-word runs with
`/\p{L}[\p{L}\p{M}’']*/gu`. A token stops at a digit or hyphen, so `v1`
bolds only `v` — acceptable, since identifiers live in code, which is skipped.

**Invariant:** the concatenation of a decorated node's text content equals the
original text exactly. This is what makes off/restore lossless and is asserted
as a unit test.

### Ranges and defaults

| Knob | Range | Step | Default |
|---|---|---|---|
| Fixation strength | 20%–80% | 5% | 50% |
| Saccade frequency | every 1st–5th word | 1 | every 1st |
| On | — | — | off |

### Skip set

Text is skipped when its nearest element ancestor matches:

    pre, code, kbd, svg, h1, h2, h3, h4, .compare h3, nav.toc, .bx-panel

Headings are already bold — there is no contrast left to add. Code is where
mid-word bolding actively harms comprehension. Whitespace-only text nodes are
skipped too.

**Superseded by the final review (2026-08-24):** this set let `apply()` rewrite the
text of `<script>`/`<style>`/`<noscript>` elements and destroy a `<textarea>`'s value,
and omitted `h5`/`h6` even though the generator demotes every heading level by one.
The shipped set adds `script, style, noscript, textarea, h5, h6` — see `assets/bionic.js`.

### DOM handling

On enable, a `TreeWalker` over text nodes replaces each eligible node with:

```html
<span class="bx" data-bx-src="…the original text…">Bio<b>nic</b> …</span>
```

- The original text lives on `data-bx-src`, so a knob change **rebuilds from
  source**, never from already-decorated DOM.
- Disable replaces each `span.bx` with a fresh text node from `data-bx-src`,
  then calls `normalize()` on the touched parents to re-merge split text.
- Re-enabling walks from the restored DOM. The pass is idempotent: running it
  twice on the same subtree produces the same markup.

### Panel

Placed at the top of `.side`, above `nav.toc`, so it is reachable without
scrolling a long table of contents:

```html
<div class="bx-panel">
  <label><input type="checkbox" id="bx-on"> Bionic reading</label>
  <button class="bx-more" aria-expanded="false" aria-controls="bx-opts">Options</button>
  <div id="bx-opts" hidden>
    <label>Fixation <input type="range" id="bx-strength" min="20" max="80" step="5">
      <output for="bx-strength">50%</output></label>
    <label>Every <input type="range" id="bx-freq" min="1" max="5" step="1">
      <output for="bx-freq">1st</output> word</label>
  </div>
</div>
```

- Options collapsed by default; the closed panel costs one row above the TOC.
- Sliders are `disabled` while the switch is off.
- At narrow widths the panel sits inside `.side` and therefore folds into the
  existing `#navtoggle` disclosure with the nav — no new mobile chrome, no
  second media query.

  **Superseded by the final review (2026-08-24):** false. The narrow-width fallback
  hides `nav.toc`, not `.side` (`nav.toc{display:none}` plus
  `#navtoggle:checked ~ .shell nav.toc{display:block}`), and `.bx-panel` is
  `nav.toc`'s sibling inside `.side`, so nothing hides it for free. `bionic.css`
  ships its own `@media (max-width: 63.99rem)` rule, keyed off the same
  `#navtoggle` checkbox, so the panel folds with the nav instead of sitting
  exposed above it.
- The panel is **not** an `<a>` in `nav.toc`, so scroll-spy ignores it.

### Performance

A 15k-word guide produces roughly 15k `<b>` elements. One full pass is a
single synchronous walk (~30ms on a laptop), which is acceptable on toggle but
not per drag frame.

- `input` on a slider updates only its `<output>` readout.
- `change` (pointer release / arrow-key commit) triggers the rebuild.

### Persistence

`localStorage` key `guide-manager:bionic`, value
`{"on":false,"strength":0.5,"freq":1}`. Read on `DOMContentLoaded`, written on
every control change. A corrupt or unparseable value falls back to defaults
rather than throwing — a bad key must never break the page's other inline JS.

### Print

`@media print` hides `.bx-panel` and resets `b.bx-b` to `font-weight: inherit`,
so a printed guide is plain prose regardless of screen state.

## Files

New, in this repo:

```
assets/
  bionic.js      pure functions + DOM runtime; classic script, not ESM
  bionic.css     .bx-panel and .bx-b styles, both themes
  bionic.html    the panel markup
```

`bionic.js` is a **classic script**, not an ES module: a `file://` page loads
inline module scripts inconsistently across engines, and the page's existing
scroll-spy is already a classic inline script. It performs **no DOM work at
top level** — everything runs from an `init()` bound to `DOMContentLoaded` —
and ends with:

```js
globalThis.__bionic = { bionicWord, shouldBold, decorate };
```

which is what makes it unit-testable in `node:vm` without a DOM library.

Each file carries a version header:

    /* bionic v1 — vendored from guide-manager assets/; do not edit here */

## Generator integration

At guide-write time the `/study` skill copies the three files into the guide's
`tools/` directory:

    cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.js"   <dir>/tools/
    cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.css"  <dir>/tools/
    cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.html" <dir>/tools/

`tools/build.mjs` then reads its own siblings (resolved against
`import.meta.url`, per the existing rule) and inlines them:

- `bionic.css` appended into the page's single `<style>` block.
- `bionic.html` injected as the first child of `.side`.
- `bionic.js` emitted as an inline `<script>` beside the scroll-spy script.

The guide is self-sufficient afterwards: rebuilding needs only `node
tools/build.mjs`, with no plugin installed. The version header is how a later
session tells a stale vendored copy from a current one — re-copy on
regeneration.

## Skill documentation changes

- **`../../../.claude/skills/study/references/visuals.md`** — a new *Reading controls* section
  covering the algorithm, the skip set, the panel's place in the sidebar, and
  the runtime-not-baked rule with its checker rationale. One added bullet in
  *Before you hand it over*: toggle it on in both themes, confirm code blocks
  are untouched and find-in-page still locates a decorated word.
- **`../../../.claude/skills/study/SKILL.md`** — the *File layout* tree in step 6 gains
  `tools/bionic.js`, `tools/bionic.css`, `tools/bionic.html`.

## Edge cases and failure modes

| Case | Behavior |
|---|---|
| `localStorage` unavailable or corrupt | Defaults, no throw; state is per-session only |
| JS disabled | Panel is inert markup; prose unaffected. Nothing else on the page depends on it |
| Word shorter than 2 characters | `bionicWord` returns 0; the word is left plain |
| Nested skip elements (`code` inside `pre`) | `closest()` matches the outer one; single skip either way |
| Toggling mid-scroll | Scroll position is preserved: spans replace text in place, block heights do not change |
| Find-in-page | Split words degrade matching in some engines. Mitigated by instant off and by default-off |

## Testing

**Unit** (`test/bionic.test.js`, `node --test`, script evaluated in `node:vm`
against a stub `document`/`window`):

- `bionicWord`: length 1 returns 0; lengths 2 and 3 return 1; the result is
  never equal to the word length at any strength including 0.8 and 1.0, and
  never below 1 for words of length ≥ 2 at strength 0.2.
- `shouldBold`: cycles correctly at `freq` 1, 2, 5; index 0 always bolds.
- **Round-trip invariant**: for a sampled set of strings, the text content of
  `decorate(text, s, f)` with tags stripped equals the input exactly.
- Corrupt `localStorage` value does not throw during `init()`.

**Manual**, on a real generated guide:

- Both color schemes: the bold prefix is visible and the remainder keeps body
  contrast; no hard-coded color slipped in.
- Code blocks, inline code, headings and SVG labels are untouched with the
  aid on.
- Slider drag stays smooth; the rebuild lands on release.
- Reload preserves the setting; toggling off restores byte-identical prose.
- The existing `tools/check.mjs` still exits zero on the page as generated.
- 1024px boundary still shows the desktop layout — the panel adds no query.
- Print preview: no panel, no bold.

## Later (out of scope for v1)

Extending to server-rendered `/guide` markdown pages means serving
`assets/bionic.*` from `server/public/` and adding the panel to
`breadcrumbBar()` in `server/lib/render.js`, sharing the same vendored source.
The skip set would need one addition for the server page's own chrome. Decks
would remain untouched.
