---
name: study
description: >
  Learning walkthrough of any directory/topic — explains WHY code was built a
  certain way by contrasting each mechanism with a worse alternative (pros/cons),
  in a teaching register, with no refactoring suggestions. On confirmation, records
  the session as a study guide (a single file or a directory of files) in a fixed
  house style, with mermaid diagrams and an optional generated single-page HTML build
  of the whole guide. Trigger: /study
trigger: /study
---

# /study — learn a codebase by understanding *why*

This skill turns a directory or topic in the **current project** into a teaching
session. The goal is **learning and observation**, not changing anything. You are a
patient tutor explaining a codebase to a curious student: answer their questions, and
for every mechanism explain *why it was built this way* by contrasting it with a
naive/bad alternative and laying out the concrete trade-offs.

When the student is satisfied, you record the session as a study guide in the location
and structure they chose in step 3.

## Hard guardrails (do not violate)

- **Read-only.** Never edit, create, or delete source code. The *only* files you may
  write are the study-guide file(s) chosen in step 3, and only at step 6 (on
  confirmation). That set includes the companion `.html` page — but **only** if the
  user explicitly opted into it at step 3. Never write an HTML page by default, and
  never infer that one is wanted.
- **No refactoring suggestions.** Do not propose improvements, fixes, or "you should
  change X". This is observe-and-learn. If a genuine flaw matters for understanding,
  frame it as *"this is the trade-off they accepted"*, never as advice to change it.
- **Full prose, caveman off** (see step 1).
- **Teach, don't dump.** Explain the reasoning. A wall of code with no "why" is a
  failure of this skill.
- **Stay inside the current project.** Ground every explanation in files that exist in
  *this* repo. Never reference files, examples, or conventions from other projects.

## Procedure

### 1. Turn off caveman (first action)

Learning docs must be readable full prose, so deactivate caveman compression for this
session. Begin your first response with the phrase **`normal mode`** (the caveman
plugin honors `normal mode` / `stop caveman`). Caveman returns only if the user later
explicitly asks for it (`/caveman lite|full|ultra`). Do not re-enable it yourself.

### 2. Establish scope

- Read the `/study` arguments. If a topic, question, or sub-directory was given, use it.
- If nothing was given, ask the user: **what topic or question do you want to study, and
  which part of the project?**
- The current working directory is the target project root.
- Derive a short **kebab-case `<topic>` slug** for the eventual filename(s)
  (e.g. `auth`, `database`, `module-structure`). Confirm it with the user if ambiguous.

### 3. Choose the output structure (ask the user)

Before writing anything, use **AskUserQuestion** to decide how the guide is laid out.
Ask all three axes below in **one** `AskUserQuestion` call — one prompt, three questions.
Pick sensible defaults based on scope, but let the user override:

- **Structure** — one of:
  - *Single file* — one self-contained walkthrough. Best for a focused topic or a small
    surface. Default for narrow scopes.
  - *Multiple files in a directory* — a `<dir>/` containing a `README.md` hub plus a
    `guide/` directory holding one file per sub-concept, cross-linked. Best for a broad
    topic or a whole package/module with several distinct concerns. Default for wide
    scopes. See *File layout* in step 6 — a guide's files are always grouped by type,
    never flat.
- **Location** — where the file or directory lives. The default is always under
  `docs/guides/study/`: `docs/guides/study/<topic>.md` for a single file,
  `docs/guides/study/<topic>/` for the multi-file option. Pre-select that; honor whatever
  path the user names if they override it.

  **Why one fixed home:** guides used to land wherever the session felt like putting them
  — `learning-docs/`, `docs/learning-notes/`, `docs/published-guides/` — so a project
  accumulated several half-populated guide directories and had nothing you could point at
  as *the* guides. `docs/guides/<skill>/` gives every project one predictable tree:
  `study/` for what this skill writes, `tutor/` for the decks `/tutor` writes. That makes
  a project's guides legible as a set — and cheap to collect by walking one directory —
  instead of only discoverable through whatever ad-hoc paths past sessions happened to
  register.
- **Visuals** — one of:
  - *Mermaid diagrams* — diagrams live in ` ```mermaid ` fences inside the markdown.
    **This is the default**; pre-select it.
  - *Mermaid + a browsable HTML build* — additionally emit a self-contained HTML page
    carrying the **whole** guide, generated from the markdown by a small committed
    script, with hand-authored SVG in place of the mermaid fences. Worth offering when
    the guide is big enough to want a table of contents, or the topic has structure that
    mermaid alone can't draw (nesting, overlap, before/after).
  - *None* — prose and code excerpts only. For narrow topics with nothing structural to
    draw.

Record the chosen path(s), structure, and visuals option; they govern step 6. Create the
directories on write if absent — on a project that has never held a guide the default
path needs the whole `docs/guides/study/` chain, so this is `mkdir -p`, not one level.

### 4. Explore the relevant code (read-only)

**First: is there already a guide here?** If the location chosen in step 3 already holds
one, this is an **update, not a rewrite**. Re-deriving a guide that already exists wastes
the session and throws away accumulated FAQ material. Scope the work instead:

1. Read its **provenance stamp** — the guide records the commit it was written against
   (see the *Provenance* section of [`references/visuals.md`](./references/visuals.md)).
2. Diff the sources since then: `git diff --name-only <stamped-commit>..HEAD -- <sources>`.
   That file list is the work-list.
3. Run its **citation checker** if it has one, to find excerpts whose cited code moved or
   changed underneath them.
4. Teach and rewrite **only** the sections those two lists touch, then refresh the stamp.
   Leave every other section — and the whole FAQ — alone.

If there is no stamp (an older guide), say so, treat the whole guide as suspect, and add a
stamp when you write.

Then, for the parts actually in scope:

- Map *only* the files in scope. Use the `Explore` subagent for broad scopes; read
  files directly for small ones.
- Reuse existing context first: check the project's `CLAUDE.md`/`AGENTS.md`, any rules
  files, README, and any study guides already written in this project so explanations
  build on what's already documented.
- Collect the real code, exact `file_path:line` references, and the surrounding
  patterns/idioms you'll need to explain the *why*.

### 5. Teach, interactively

Answer as if explaining to a student who knows the language but not this codebase or
framework:

- **Mental model first.** Open with the one-paragraph intuition before any detail.
- **For each mechanism, follow this shape:**
  1. *What it does* — plainly.
  2. *Why it exists* — the problem it solves.
  3. **The bad alternative** — the naive thing a beginner would reach for, and the
     concrete pros/cons of the chosen approach vs. that alternative.
- Ground everything in real `file_path:line` references and short code excerpts from
  *this* project. Label every excerpt with its exact source range as the first line of
  the fence (`// parse.ts:44-52`) — that label is what makes the guide mechanically
  checkable later. If you abridge the excerpt (compact a multi-line block, elide type
  annotations, replace casts with `...`), **say so in the label**:
  `// extract.ts:76-86  (compacted here)`. Otherwise a future checker cannot tell your
  deliberate shortening from code that has since disappeared.
- Define framework jargon the first time it appears.
- Keep answering follow-up questions. Do **not** write the doc yet. Stay in the session
  until the user signals they are done ("write it up", "done", "save it").

### 6. Record the session — on confirmation only

When the user confirms they're done, write the study guide at the path(s) chosen in
step 3, in the **house style** below (no frontmatter).

**Single file** — one document following the template.

**Multiple files** — a `README.md` hub plus one file per sub-concept under `guide/`:
- `README.md` carries the top-level mental model, a mermaid map of the pieces (see
  *Diagrams* below), and links to each sub-concept file (`./guide/<slug>.md`). Each linked
  slug that isn't written yet is fine to mark as pending.
- Each sub-concept file follows the same template as a single file, scoped to its topic.
- Cross-link files with relative links so the set reads as one guide.

#### File layout — one directory per file type

A guide that is more than one markdown file groups its files **by type**. Never dump the
chapters and the generator scripts flat into one directory:

```
<dir>/
  README.md              the hub — the entry point
  index.html             the generated page — only if the HTML build was chosen
  guide/                 one .md per sub-concept
    pipeline.md
    index-analysis.md
  tools/                 the generator + checkers — HTML build only
    build.mjs
    figures.mjs
    check.mjs
    citations.mjs
    bionic.js            vendored reading aid — do not edit, re-copy instead
    bionic.css
    bionic.html
```

- **The two entry points stay at the root**, and only those two. `README.md` is what
  GitHub renders when someone opens the directory, and it carries the provenance stamp.
  `index.html` is the *one* file a reader opens in a browser — there will only ever be one
  of it, and a directory wrapping a single file is noise, not organization. Type
  directories are for the **sets**: the chapters, and the tooling.
- A *single-file* guide with **no** HTML build stays a single file — one file needs no
  directories: it is just `docs/guides/study/<topic>.md`. A single-file guide **with** the
  HTML build gets `<topic>.md` + `<topic>.html` at the root plus `tools/` (no `guide/`,
  since there are no other chapters) — so opting into the build promotes even a
  single-file guide from `docs/guides/study/<topic>.md` to a `docs/guides/study/<topic>/`
  directory. Say so when the user picks the build, because otherwise the path they
  approved at step 3 changes shape under them.
- **Why:** flat, the four generator scripts interleave with the chapters, so a reader
  scanning for the next thing to read has to already know which files are prose and which
  are build machinery — nothing in the listing tells them. Pulling the tooling into
  `tools/` and the chapters into `guide/` leaves a root that is exactly the two things
  you open, and makes "never hand-edit the generated page" visible in the tree rather
  than only stated in prose. The cost is one extra path segment on the chapters, paid in
  the three places below.
- **Three path consequences, all easy to get wrong:**
  - **Cross-links.** Hub → chapter is `./guide/<slug>.md`; chapter → chapter is
    `./<slug>.md`; chapter → hub is `../README.md`.
  - **Source references.** A `file_path:line` link from inside `guide/` is one segment
    deeper than the same link from `README.md` (`../../../packages/…` becomes
    `../../../../packages/…`). Check the depth per file; a wrong `../` count is a dead
    link that renders fine in the editor.
  - **The generator.** It lives in `tools/`, so every path it resolves against
    `import.meta.url` goes **up** one level to reach the markdown and the page.

#### Diagrams — the mermaid house style

Unless the user chose *None* at step 3, diagrams go in ` ```mermaid ` fences inside the
markdown.

- **Never hand-draw ASCII box art.** No `┌─┐`, no `──▶`, no manually aligned columns.
  Hand-aligned art cannot reflow, breaks on any narrow screen, and every edit turns into
  a realignment chore. This is the exact failure mode mermaid exists to remove here.
- **Pick the type from the situation:**
  - `flowchart LR` — pipelines and data flow (`parse → extract → normalize`), module maps.
  - `sequenceDiagram` — call ordering across layers (a request through route → query → DB).
  - `erDiagram` — table/schema relations and their cardinality.
  - `stateDiagram-v2` — lifecycles, and verdict/confidence ladders.
- **Cap it at roughly 12 nodes.** A diagram that wants more is two diagrams. Split by
  concern rather than letting one sprawl into unreadability.
- **Every diagram earns its place.** It illustrates a mechanism the surrounding prose is
  explaining. It is not decoration, and it never substitutes for the *why* — a diagram
  with no accompanying reasoning is the same failure as a wall of code with no "why".
- **Label the edges**, not just the boxes (`A -- "SlowOp" --> B`). The edge labels carry
  the data-shape story that makes the picture teach something.
- **Where it renders:** natively in GitHub's markdown view and in Claude Artifacts.
  VS Code's built-in preview needs a mermaid extension. Anywhere unrendered, the reader
  sees the fence source — still legible, unlike misaligned ASCII art.

#### The browsable HTML build — only if opted in

If (and only if) the user chose *Mermaid + a browsable HTML build* at step 3, **read
[`references/visuals.md`](./references/visuals.md)** before writing and follow it. It
carries the page spec, the generator's must-get-right list, the inline-SVG conventions,
and the pre-handover checks. Do not read it otherwise — it is irrelevant to the
markdown-only path.

The page is written to `<dir>/index.html` and the generator plus checkers to
`<dir>/tools/` — see *File layout* above, including the path consequences that follow from
the generator no longer sitting beside the markdown it reads.

Two rules worth stating here, because they govern everything else:

1. **Never emit a link a browser can't render.** The page holds the *whole* guide, and
   every cross-reference between documents becomes an in-page anchor. A page built out of
   `./pipeline.md` links is a page of dead ends — clicking one shows raw markdown.
2. **Generate the page from the markdown; never hand-author it.** Markdown stays
   canonical. A hand-copied page is a second source of truth that diverges on the first
   edit; a generated one cannot.

House-style template (per file):

```
# <Topic> — a <stack> learning walkthrough

<1–2 sentence statement of what this guide teaches and that it explains the *why*.>

> Mental model up front: <the core intuition in one blockquote.>

<A mermaid diagram of the whole shape, if the topic has one. Omit the fence entirely if
the user chose *None*, or if the topic is too narrow to have a structure worth drawing —
an empty diagram is worse than no diagram.>

---

## 1. <first sub-concept>
<what → why → contrast with the bad alternative + pros/cons. Code blocks tagged with
language and annotated with the source file path.>

## 2. <next sub-concept>
...

## N. FAQ: "<an actual question the user asked this session>"
<Answer it the way you did live. Build this section from the real questions raised —
this is the highest-signal part of the doc.>

---

**Relevant files**
- `path/to/file.ext` — one-line note on what it contributes
```

Rules for the write:
- Follow the house style exactly: mental-model blockquote → numbered concept sections
  (what → why → bad-alternative + pros/cons) → FAQ built from the questions actually
  raised this session → a "Relevant files" list.
- The FAQ must come from **real** questions the user asked — it is the highest-signal
  part of the doc.
- Diagrams follow the mermaid house style above — no ASCII box art, whatever the layout.
- If a target file **already exists**, extend/update it rather than clobbering, and
  confirm before overwriting substantial existing content.
- After writing, give the user a one-line pointer to the file (or the hub `README.md`
  for the multi-file layout), plus the HTML page if one was written.

## Style notes

- The output is a *why* layer, not an API reference. If the project already has
  reference docs, cross-link to them instead of restating signatures.
- Keep code excerpts short and always annotated with their source `file_path:line`.
- Keep the teaching register throughout: intuition first, then mechanism, then the
  contrast that makes the design choice legible.

### Register with guide-manager

After the guide is written or updated (and only then), register it so the
guide-manager viewer lists it:

    node "${CLAUDE_PLUGIN_ROOT}/bin/register.js" \
      --project "<absolute path to the project root>" \
      --guide "<absolute path to the guide entry point; see below>" \
      --type study \
      --title "<the guide's human-readable title>"

**Which file to register** — whichever one is the *whole* guide:

- **HTML build present** (the *Mermaid + a browsable HTML build* option at step 3):
  register the generated `index.html`, not `README.md`. The viewer renders a `.md`
  guide by running that one file through `marked` and its own stylesheet: no mermaid
  renderer, no generated table of contents, and no sibling chapters. A directory
  guide registered at its hub therefore shows up as the hub alone — fences as raw
  text, chapters missing — while the build already carries every chapter, the
  contents rail, and the fences as drawn SVG. A registered `.html` guide is framed
  verbatim, so all of that survives.
- **No HTML build** — register the single markdown file, or a directory guide's
  `README.md`.

Re-pointing an already-registered guide at a different file is two calls, because
the registry keys on the path and would otherwise keep both:

    node "${CLAUDE_PLUGIN_ROOT}/bin/register.js" --remove --guide "<the old path>"

If the command prints a warning, mention it to the user and move on —
registration must never block or fail the wrap-up.
