# The companion HTML page

Read this only when the user chose **Mermaid + companion HTML page** at step 3 of
`/study`. It is irrelevant to the markdown-only path.

## The two governing rules

**1. Never emit a link a browser can't render.**

This is the rule earned the hard way. The obvious design — "the HTML is a thin visual
layer, and each section links back to the markdown for the reasoning" — produces a page
on which *every single link is a dead end*: clicking `./pipeline.md` in a browser shows
raw markdown or triggers a download. A page whose whole job is handing off to the prose,
that cannot hand off, is worse than no page.

So: the HTML contains the **whole guide**, and every cross-reference between guide
documents becomes an **in-page anchor**. The only links that may leave the page are to
source files (`../../../packages/…/foo.ts`) and genuinely external URLs — mark those with
a visible `↗` so a reader knows the link exits.

**2. Generate the page; never hand-author it.**

Markdown stays canonical, and the page is *derived* from it by a small committed script.
This is what makes rule 1 affordable: a whole-guide page necessarily contains all the
prose, and hand-copying 15k words creates exactly the drift the old rule was trying to
prevent — two hand-maintained copies that diverge on the first edit. A generated page
can't drift, because regenerating it is the only way it changes.

Cost check, so you don't over-think this: a generator is ~250 lines and a few thousand
tokens. Hand-authoring the same page is tens of thousands of tokens **and** a permanent
maintenance tax. Generate.

## Layout

Files are grouped by type — see *File layout* in `SKILL.md` step 6. For the HTML path that
means the scripts move into `tools/` and no longer sit beside the markdown they read, while
the page itself stays at the guide root beside `README.md`:

| | |
|---|---|
| Canonical | `<dir>/README.md` + `<dir>/guide/*.md` — unchanged, still the thing you edit |
| Generated page | `<dir>/index.html` |
| Generator | `<dir>/tools/build.mjs` + `<dir>/tools/figures.mjs` |
| Checkers | `<dir>/tools/check.mjs` + `<dir>/tools/citations.mjs` — see *Before you hand it over* |

Resolve paths inside the generator against `import.meta.url`, not the cwd, so it runs from
any directory — and remember it now resolves **upward**: the markdown is
`../README.md` + `../guide/*.md` and the output is `../index.html`, relative to `tools/`.
A generator that reads `` still finds nothing but its own siblings.

**The depth asymmetry the generator must correct.** The page sits at the guide root, the
same level as `README.md`, so a relative source link harvested from the hub resolves from
the page unchanged. Chapters are one level deeper, so **every relative link taken from a
`guide/*.md` file needs one `..` stripped** on its way into the page — a chapter's
correct `../../../../packages/core/src/parse.ts` becomes `../../../packages/…`. Get it
wrong and every chapter's file links 404 while the hub's all work, which reads as a random
failure rather than an off-by-one. Strip exactly one segment; never rewrite the markdown to
match the page, because the link has to stay correct where it is written too.

## Navigation: a sticky side menu

A single page holding a whole guide is unreadable without persistent navigation. Give it
a sidebar, not a table of contents that scrolls away:

- **Layout — this is the base, not a media query.** `.shell` is a
  `17rem minmax(0,1fr)` grid with the nav in column 1,
  `position: sticky; top: 0; max-height: 100vh; overflow-y: auto`. The `minmax(0,1fr)`
  matters — without the `0` floor, a wide code block blows the grid out.
- **Widths: cap the measure, then derive the shell.** Pick the prose measure first
  (`60rem` — about 90 characters), then set `.shell` to `sidebar + gap + measure`
  (`17 + 1 + 60 = 78rem`) and centre it with `margin: 0 auto`. Do not cap the shell at
  some rounder, larger number: column 2 then grows past the measure and the prose sits
  pinned to its left edge inside a frame that is no longer optically centred.
- **Narrow screens are the fallback**, layered on with `@media (max-width: 63.99rem)`.
  The grid collapses to one column and the sidebar becomes a sticky bar with a CSS-only
  disclosure: a hidden checkbox plus a `<label>`, and
  `#navtoggle:checked ~ .shell nav.toc{display:block}` (the ID outranks the sibling
  `nav.toc{display:none}` regardless of source order, so the toggle still works).
  Use a checkbox rather than `<details>` — the UA's closed-state styling of `<details>`
  cannot be reliably forced open again at desktop widths.
- **Scroll-spy, as progressive enhancement.** ~35 lines of inline vanilla JS marking the
  deepest heading above the reading line as `.active`, and scrolling the sidebar to keep
  it visible. Inline only — an external script would break the offline guarantee. Without
  JS the nav is still a working list of links, so nothing is lost.
- Three traps worth knowing. The first two silently produce a nav that looks fine and
  tracks nothing; the third produces a layout that is broken at exactly one width:
  - `offsetTop` is relative to the **offsetParent**, not the scroll container. To keep
    the active entry in view, compare `getBoundingClientRect()` of the link and the box.
  - The scroller is the `.side` wrapper on desktop but `nav.toc` in the narrow fallback.
    Pick whichever actually scrolls (`scrollHeight > clientHeight`) rather than assuming.
  - **Write the fallback query as `max-width: 63.99rem`, never `64rem`.** `min-width` and
    `max-width` queries *both* match at exactly the boundary value, so a `64rem` fallback
    applies on top of the desktop base at precisely 1024px — one viewport width where the
    sidebar collapses for no reason. Every browser at that width, and nothing either side
    of it, which is why it survives a resize sweep.
- **Drop the page's self-reference.** The markdown's "read it in a browser" pointer must
  be skipped by the generator — on the page it tells the reader to open the page they are
  already reading. Detect it by its link to `./index.html`.
- With a sidebar present, hide the per-document "back to contents" links in the **base**
  — they are noise when the nav is permanently on screen — and restore them in the narrow
  fallback, where the nav is collapsed behind the disclosure.

Add this near the top of the markdown (the hub `README.md` for the multi-file layout),
right under the mental-model blockquote — note that it points at the generator, because
the next person to edit the guide needs to know the page is derived:

```markdown
> **Read it in a browser:** [`index.html`](./index.html) — this whole guide as one
> page, with the diagrams drawn and every cross-reference as an in-page jump. It is
> **generated** from these markdown files by [`tools/build.mjs`](./tools/build.mjs), so edit
> the markdown and re-run `node <dir>/tools/build.mjs`; never edit `index.html` by hand.
```

## Reading controls: the bionic aid

A whole-guide page is a lot of prose, so it ships an optional bionic-reading
aid — bolded leading characters that give the eye an artificial fixation point,
with the reader in charge of how strong it is. Three files carry it, vendored
from this plugin rather than written fresh per guide:

```
cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.js"   <dir>/tools/
cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.css"  <dir>/tools/
cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.html" <dir>/tools/
```

Copy them; never retype them. They carry a `bionic v1` header — that is how a
later session tells a stale vendored copy from a current one, so re-copy on
every regeneration.

`tools/build.mjs` then inlines all three, resolving them against
`import.meta.url` like everything else it reads:

- `bionic.css` appended to the page's single `<style>` block.
- `bionic.html` injected as the **first child of `.side`**, above `nav.toc`, so
  the control is reachable without scrolling a long table of contents. It does
  **not** fold into the narrow-width disclosure for free: the fallback in
  *Navigation: a sticky side menu* above hides `nav.toc`, not `.side`, and
  `.bx-panel` is `nav.toc`'s sibling, so nothing collapses it on its own.
  `bionic.css` therefore carries its own `@media (max-width: 63.99rem)` rule,
  keyed off the same `#navtoggle` checkbox, so the panel folds with the nav
  instead of sitting exposed above it.
- `bionic.js` emitted as an inline `<script>` beside the scroll-spy script.
- On a no-sidebar page (the single-file skeleton has no `.side` — see *Page
  skeleton* below), skip the panel injection entirely: there is nowhere to put
  it, and `init()` already no-ops when `.bx-panel` is absent from the page.

**It must stay a runtime pass — never bake the bolding into the markup.** The
fidelity check in `tools/check.mjs` compares word sequences after stripping
tags, and a baked `<b>` inside a word strips to `Bio nic` — two words — failing
on essentially every prose line in the guide. `check.mjs` needs no new
exclusions precisely because the decoration does not exist until the page is
open in a browser.

Two behaviors worth knowing before you debug them:

- **Default off, persisted per-origin** under `guide-manager:bionic`. Bionic
  reading's speed claims are not backed by peer-reviewed evidence, and heavy
  mid-word bolding helps some dyslexic readers and hinders others. It is
  offered, not imposed.
- **Bold only, never dimmed.** Most bionic renders dim the rest of the word for
  extra contrast; on this page's dark theme that drops body prose below AA.

## What the generator has to get right

A minimal markdown renderer is easy to get 90% right and the last 10% is where it
silently corrupts the guide. These are the cases that actually bit:

- **Code spans: match the longest backtick run first.** Guide prose uses `` `` `x` ``  ``
  (double backticks) to display a literal backtick. A `` /`([^`]+)`/ `` regex mispairs
  straight through it and scrambles the rest of the line.
- **Bold may contain italics.** `**"… *not* …"**` is common in FAQ questions. A
  `\*\*([^*]+)\*\*` pattern can't cross the inner asterisks and leaks raw `**`. Match
  lazily across them, and apply bold before italic.
- **Protect code spans with a placeholder that cannot occur in prose.** A ` N `
  (space-digit-space) placeholder also matches ordinary numbers in body text, and the
  restore pass then replaces them with code spans. Use `NUL`-delimited placeholders.
- **Wrapped list items.** A continuation line indented under a bullet belongs to that
  bullet. Get it wrong and one claim renders as three separate bullets.
- **Links wrapped across a line break.** `[label\ntext](href)` is valid markdown. Join
  paragraph lines *before* parsing inline syntax, or the link never matches.
- **Rewrite in-guide `.md` links to anchors, and prefix anchor ids per document** —
  two documents can have identically-named headings. `#<doc-slug>--<heading-slug>`.
  Use GitHub's slug rules (lowercase, drop punctuation, **each space becomes its own
  hyphen** — runs are not collapsed, which is why em dashes yield `--`).
  With the split layout the same target arrives in three spellings — `./guide/pipeline.md`
  from the hub, `./pipeline.md` between chapters, `../README.md` back to the hub — so
  **derive the doc slug from the link's basename**, not from the path as written. Matching
  on the literal string silently leaves the other two spellings as dead `.md` links.
- **Mermaid fences must be replaced, not rendered.** A self-contained page can't load
  mermaid.js. Keep a `fence → hand-authored SVG` map keyed by document and ordinal.

Verify the result with a **fidelity check**: assert every non-trivial markdown line
survives into the page's visible text, comparing word sequences (stripping tags inserts
spaces, so punctuation adjacency differs even when the words match). Account for the
three things a generator legitimately does not reproduce: each file's `H1`, mermaid fence
bodies, and link URLs.

## Hard constraints

- **Self-contained.** Inline `<style>`. Hand-authored inline `<svg>`. **No** external
  scripts, stylesheets, fonts, or image files — not from a CDN, not from disk. The page
  must render correctly opened straight from `file://` with the network off. This rules
  out loading `mermaid.js` to render the markdown's fences; you author the SVG by hand
  instead. That is the cost of the guarantee, and it is worth it: a doc that needs a
  working network to show its diagrams is a doc that fails exactly when someone is
  reading it on a plane.
- **Theme-aware.** Light as the base, `@media (prefers-color-scheme: dark)` overriding.
- **Desktop-first.** A study guide is read at a desk, on a monitor, usually beside the
  code it describes — so the wide two-column layout is the *base* stylesheet and narrow
  screens are a `@media (max-width: …)` fallback layered on top. Authoring it the other
  way round is the CSS default, and it quietly makes the phone layout the one the design
  is reasoned about. Note that the cascade direction is invisible in the rendered output:
  both orders produce identical pixels at both ends. It is a statement about which layout
  is the design and which is the concession.
- **Responsive within that.** The fallback must genuinely work, and at every width wide
  diagrams, code blocks and tables live inside their own `overflow-x: auto` wrapper. The
  page body itself must never scroll sideways. The wrappers are not sufficient on their
  own: a guide's prose is full of **inline** `<code>` holding long unbreakable paths
  (`packages/core/src/indexComparison.test.ts`), which sits in no wrapper and is wider
  than a phone's text column. Give `code` `overflow-wrap: anywhere` — and put it back to
  `normal` for `pre code`, so block code still scrolls rather than reflowing.
- **No frontmatter, no framework, no runtime dependency.** The *output* is one plain
  `.html` file that needs nothing to display it. The generator is a build step, but it
  runs by hand on demand (`node <dir>/tools/build.mjs`) — do not wire it into
  `../../../../package.json` scripts or CI unless the user asks.

## Colors: define once, use everywhere

Declare every color as a CSS custom property on `:root` and override the whole set in the
dark-mode block. Inline SVG inherits custom properties from its ancestors, so the same
variables that style the page also style the diagrams — one theme switch recolors both.

**Never hard-code a hex value inside the SVG.** A diagram with `stroke="#333"` is invisible
on a dark background, and you will not notice because you authored it in light mode.

```html
<style>
  :root {
    --bg: #ffffff;
    --fg: #1a1a1a;
    --muted: #5c6370;
    --line: #b8bec9;
    --panel: #f5f6f8;
    --accent: #2563eb;
    --good: #15803d;
    --bad: #b91c1c;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a;
      --fg: #e6e8ea;
      --muted: #9aa2ad;
      --line: #4a515c;
      --panel: #1d2027;
      --accent: #7aa2f7;
      --good: #6ccf8e;
      --bad: #f2777a;
    }
  }
  body {
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 60rem;
    margin: 0 auto;
    padding: 2rem 1.25rem;
  }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  code { overflow-wrap: anywhere; }        /* long paths must not widen the body */
  pre code { overflow-wrap: normal; }      /* but blocks scroll, they don't reflow */
  a { color: var(--accent); }
  .diagram { overflow-x: auto; margin: 1.5rem 0; }
  .diagram svg { display: block; min-width: 34rem; }
</style>
```

This is the skeleton for a page with **no** sidebar, so `.shell`/`.wrap` collapse into
`body` and the one width that matters is the prose measure. `60rem` is that measure — a
line-length cap, not a page frame; it is the same number the sidebar layout derives its
`78rem` shell from. It needs no media query at all: below `60rem` the viewport is already
the narrower constraint.

`system-ui` keeps typography decent with zero font downloads. The `min-width` on the SVG
is what makes the wrapper actually scroll on a narrow viewport instead of squashing the
diagram into unreadability.

Do not omit `a { color: var(--accent) }`. Without it links fall back to the browser's
default `#0000EE`, which is close to invisible on a dark background — and since the whole
page is a set of hand-offs to the markdown, unreadable links break its one job.

## Inline SVG conventions

- **`viewBox`, never fixed `width`/`height`.** With a `viewBox` and no dimensions the SVG
  scales to its container. Fixed pixel dimensions give you a diagram that is too small on
  a monitor and overflowing on a phone.
- **Text is `<text>`.** Never convert labels to paths. Real text stays selectable,
  searchable, screen-reader-legible, and recolors with the theme.
- **One arrowhead `<marker>` in `<defs>`, reused.** Give its `<path>` `fill="var(--line)"`
  so it themes along with the strokes.
- **Style with the variables:** `fill="var(--panel)"` for box interiors,
  `stroke="var(--line)"` for borders and edges, `fill="var(--fg)"` for labels,
  `fill="var(--muted)"` for edge annotations, `stroke="var(--accent)"` to pick out the
  one path that matters.
- **Add `role="img"` and a `<title>`** as the first child. That title is the diagram's
  accessible name, and it is also what a reader gets on hover.
- **Keep it to the same ~12 nodes the mermaid house style caps at.** Hand-authoring is
  what makes you feel that limit; respect it rather than fighting the layout.

## Worked example

A three-stage pipeline, applying every convention above:

```html
<h2>The ingest pipeline</h2>
<div class="diagram">
  <svg viewBox="0 0 640 130" role="img" xmlns="http://www.w3.org/2000/svg">
    <title>parse reads the log, extract builds a SlowOp, normalize canonicalizes it</title>
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line)"/>
      </marker>
    </defs>

    <g stroke="var(--line)" stroke-width="1.5" fill="var(--panel)">
      <rect x="8"   y="40" width="150" height="50" rx="6"/>
      <rect x="245" y="40" width="150" height="50" rx="6"/>
      <rect x="482" y="40" width="150" height="50" rx="6"/>
    </g>

    <g fill="var(--fg)" font-size="14" font-family="ui-monospace, monospace"
       text-anchor="middle">
      <text x="83"  y="70">parse.ts</text>
      <text x="320" y="70">extract.ts</text>
      <text x="557" y="70">normalize.ts</text>
    </g>

    <g stroke="var(--line)" stroke-width="1.5" marker-end="url(#arrow)">
      <line x1="158" y1="65" x2="243" y2="65"/>
      <line x1="395" y1="65" x2="480" y2="65"/>
    </g>

    <g fill="var(--muted)" font-size="12" text-anchor="middle">
      <text x="200" y="34">line: string</text>
      <text x="437" y="34">SlowOp</text>
    </g>
  </svg>
</div>
<p class="caption">The round-trip edges are the point: parse drives the loop.</p>
```

Give each figure a one-line `caption` naming what the picture is *for*. The reasoning
itself is already on the page (the generator brought the prose along), so a figure needs
a pointer, not a hand-off — and never a `.md` link.

## Comparison panels

The chosen-vs-naive contrast is the heart of a study guide and the one thing that really
does read better as two side-by-side cards than as a markdown table. Give it a grid that
collapses to one column on narrow screens.

```html
<style>
  .compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
             gap: 1rem; margin: 1.5rem 0; }
  .compare > div { border: 1px solid var(--line); border-radius: 8px;
                   padding: 1rem; background: var(--panel); }
  .compare h3 { margin: 0 0 .5rem; font-size: 1rem; }
  .chosen h3 { color: var(--good); }
  .naive  h3 { color: var(--bad); }
  .compare ul { margin: 0; padding-left: 1.1rem; color: var(--muted); }
</style>

<div class="compare">
  <div class="chosen">
    <h3>✓ Pure <code>core</code> package</h3>
    <ul>
      <li>Tests are plain function calls — no server, no DB</li>
      <li>A CLI or worker can import the same analysis</li>
    </ul>
  </div>
  <div class="naive">
    <h3>✗ Parse inline in the API handler</h3>
    <ul>
      <li>Needs a running server and HTTP fixtures to test</li>
      <li>A parsing bug takes down a request</li>
    </ul>
  </div>
</div>
```

Keep each bullet to one line — the panels summarize a trade-off whose full argument is
already in the prose a few paragraphs up. Note that the markdown's own chosen-vs-naive
tables render fine as tables; add a panel only where the side-by-side genuinely reads
better, not for every trade-off in the guide.

## Page skeleton

```
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><Topic> — the learning guide</title>
  <style> … variables, body, .diagram, .compare, .tablewrap, nav.toc … </style>
</head>
<body>
<div class="wrap">
  <h1><Topic> — the learning guide</h1>
  <p class="lede">… one line on what the guide teaches, plus: generated from the
     markdown in <code><dir>/README.md</code> + <code><dir>/guide/</code> by
     <code><dir>/tools/build.mjs</code> — edit the markdown, not this file.</p>

  <!-- Contents: one entry per document, its ## headings nested beneath -->
  <!-- Then each document in reading order:
         <h2 id="<doc-slug>">  followed by that document's rendered blocks,
         with figures substituted for its mermaid fences -->
  <!-- Each document ends with a "↑ back to contents" link -->
</div>
</body>
</html>
```

Demote heading levels by one when rendering (a document's `##` becomes `<h3>`), because
the page's own `<h2>` is now the per-document title.

## Provenance: making the guide re-runnable

A guide with no record of what it was written against can only be rebuilt from scratch.
Stamp it, in the hub `README.md`, as an HTML comment (invisible when rendered, trivially
parseable) plus a human-readable line beside it:

```markdown
<!-- study-provenance: sources=packages/core/src commit=6065d41 date=2026-07-26 -->

> Baseline: written against `packages/core` at commit `6065d41` (2026-07-26).
```

The generator must **skip HTML-comment lines** — they are metadata, not content — and the
fidelity check must skip them too, or it will report the stamp as missing from the page.

One stamp per guide is enough; the citation checker localises staleness per file.

## The citation checker

Every excerpt labelled `// file.ts:N-M` is machine-checkable, and line numbers rot fast —
a source file gaining 40 lines silently repoints half a guide at unrelated code. Commit a
`tools/citations.mjs` that classifies each excerpt:

| | meaning | action |
|---|---|---|
| **fresh** | anchor found at/near the cited line | none |
| **stale** | code still present but moved | `--fix` rewrites the label mechanically |
| **gone** | most of the excerpt is no longer in the file | a person must look — the prose may be wrong too |
| **abridged** | the label declares it unverifiable | reported, never a failure |

Four things this got wrong before it got right, all worth copying:

- **Do not anchor on the excerpt's first line.** Lines recur — `for (const f of
  shape.filterFields) {` appears in two different functions — and a first-match anchor
  confidently proposed a *backwards* line-number "fix" into the wrong function.
- **Do not anchor on the longest line either**, and do not use sliding-window density:
  the former misfires whenever the longest line is the abridged signature, the latter
  conflates neighbouring code and re-flags correct citations.
- **What works:** two independent signals. *Coverage* (how many of the excerpt's
  distinctive lines still exist) decides `gone`; the **most unique line that is present**
  — fewest occurrences, ties broken by length — decides *where*, offset by its index
  within the excerpt.
- **`--fix` must never touch a `gone` excerpt.** Bumping the line number of an excerpt
  whose code actually changed makes stale content look freshly verified. That is worse
  than leaving it visibly broken.

## Before you hand it over

Write these as a committed `tools/check.mjs` beside the generator, not as one-off commands
— whoever regenerates the page next needs to be able to re-verify it. It should exit
non-zero on failure. The four automated checks:

- **Zero `.md` links**, and every in-page anchor resolves to an `id` that exists.
- **Fidelity** — the word-sequence check described above; nothing from the markdown may
  go missing. Account for the deliberate exclusions (per-file `H1`, mermaid fence bodies,
  the `index.html` self-reference) explicitly, so the expected result is a clean zero
  rather than a number someone has to interpret.
- **No leaked markdown** — `**`, stray backticks, `](`, raw table pipes. Strip `<pre>`,
  `<code>` **and `<svg>`** before looking: code and hand-authored figure labels
  legitimately contain those characters (an edge label reading `SlowOp | null`).
- **No external assets or scripts** — the offline guarantee.

Then by hand:

- Open it from `file://` with the network disabled — every diagram still draws.
- **At a desktop width (1280px), the primary target.** Sidebar in column 1, the prose
  measure filling its column with no dead slack beside it, the whole block centred.
- Click through the side menu; scroll the page and confirm the active entry tracks.
- Check both color schemes. Nothing disappears; no hard-coded hex slipped into an SVG.
- Toggle the reading aid on in **both** color schemes: the fixation prefix is
  visible, code blocks and headings are untouched, find-in-page still locates a
  decorated word, and toggling back off leaves the prose byte-identical. Also
  confirm the Options block is **closed by default**, and that at phone width
  the panel **folds with the nav** rather than sitting exposed above it.
- **Geometry, not eyeballing:** for every figure, compare each child's `getBBox()`
  against the `viewBox` — clipped labels are invisible in a screenshot but obvious to a
  bounding-box check.
- Smoke-check the fallback. At 1024px exactly it must still be the **desktop** layout —
  that is the `63.99rem` boundary. Then at phone width: one column, the disclosure
  toggles, the "back to contents" links reappear, the body does not scroll sideways,
  diagrams/code blocks/tables each scroll inside their own wrapper, and comparison grids
  collapse to one column.
