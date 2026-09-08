# Favorites — keep a piece of a guide — design

- **Date:** 2026-09-08
- **Status:** approved shape, ready for an implementation plan
- **Supersedes:** nothing. Builds on the resume design
  (`2026-08-25-guide-progress-resume-design.md`): the injected-asset splice,
  `GuidePosition`, and the deck replay are all reused as they stand.

## Problem

A guide is where a thing was *taught*. It is not where you go to *remember*
it. The pronoun table in the deck *Personalpronomen: Akkusativ und Dativ* is
nine rows and two columns — the entire memorisation burden of that topic — and
today reaching it means remembering which project, which deck, which card, and
then paging there. Multiply by every table, diagram and rule-of-thumb across
every guide, and the reader's own study material is scattered through the
guides that happened to introduce it.

What is wanted:

1. **Cut a piece out of a guide** — a table, a diagram, a code block, a
   paragraph, a whole card — and keep it somewhere of your own.
2. **Say why you kept it**, in your own words, because a bare table three
   weeks later is a table with no question attached.
3. **Find your way back** to the exact card or heading it came from.
4. **Manage the pile**: newest or most urgent at the top, remove what you have
   learned.

Three shapes were considered for the cut itself and rejected:

- **A star on every card or section.** Coarse — a card is often the table plus
  three paragraphs of framing — and a star on every unit of every guide is the
  visual noise the feature is supposed to remove from your study routine.
- **A screenshot cut-out.** Needs an html2canvas-style library (~45 KB,
  imperfect with fonts and `<details>`), stores image blobs, does not reflow on
  a phone, does not re-theme, cannot be searched, and the reading aid cannot
  touch it.
- **Text selection, Kindle-style.** Right for a sentence; loses the structure
  of a table and cannot select an SVG at all.

The premise behind the screenshot idea — that "selection" cannot capture a
table or a diagram — is true of *text* selection and false of *element*
selection. Every guide is generated HTML: a table is a `<table>`, a mermaid
diagram is an inline `<svg>`, a code excerpt is a `<pre>`. Picking the element
captures the thing itself, and the thing then re-themes, reflows, searches and
links back.

## What a favorite is

**A favorite is a block picked from a guide, snapshotted as HTML, with an
address, a context trail, a title and a note.**

- **A block**, not a range and not a pixel rectangle: the innermost element
  around the tap that is a block-level unit — `p, h1–h6, ul, ol, dl, table,
  pre, blockquote, figure, details, svg, img, .quiz-options, .card, section,
  article` — widened or narrowed along its ancestor chain. Tables and inline
  SVG are blocks, which is what makes the diagram case work. Elements inside a
  `<nav>` are never candidates: a study build's contents rail and a deck's
  Back/Next live there, and a tap on them while picking should navigate, not
  pick.
- **A heading picks its group.** Picking any `h1`–`h6` selects the heading
  plus its following siblings up to the next heading of the same or higher
  level, bounded by the heading's parent. In a study build, whose headings
  are flat siblings inside one `<section>`, that is "the table *with* its
  title"; in a deck the `h2` group is the card minus its eyebrow, and `wider`
  from there is the card.
- **A snapshot**, not a live re-extraction. The favorite is *what you saw*.
  A regenerated deck may reword the card; a moved guide may vanish; the
  favorite stays put. Storing the HTML rather than the address alone is also
  what keeps the server free of an HTML parser.
- **An address**, reusing `GuidePosition` unchanged: for a deck the containing
  card's `{sectionId, cardOffset, cardIndex}`; for a study build the nearest
  preceding id'd heading. A favorite's address *is* a place in a guide, and
  "open in guide" is therefore progress restore with a different target.
- **A context trail** (`crumb`): the headings *above* the block at capture,
  outermost first, never one inside it. Picking the pronoun table gives
  `["Die Tabelle und der Artikel-Trick", "Die Tabelle"]` — the card's
  `.eyebrow` and its `h2`; picking the whole card gives just the eyebrow,
  because the `h2` is then part of the block and becomes the title. This is
  what answers "a star on the table alone misses the title": the title comes
  along as metadata whatever you picked.
- **Grouped by project**, automatically. The registry already knows each
  guide's project, and the wanted groups — German, the dashboard, another
  repo — *are* the projects. No collection to create, nothing to file
  wrongly. Tags or cross-project collections can be added later without a
  migration; they were not wanted enough to build first.

## Architecture

```
GET /guide?p=<guide>[&at=<anchor>]     the shell; forwards `at` onto the frame's src
  └─ <iframe src="/asset?p=<guide>[&at=<anchor>]">
        │
GET /asset?p=<guide>[&at=<anchor>]     the splice point, as for the reading aid and progress
  ├─ injectReadingAid(html)                          unchanged
  ├─ injectProgressReporter(html, ctx + jumpTo)      ctx gains an optional jump target
  └─ injectFavoritesCapture(html, ctx)               NEW — registered guides only, like progress
       ├─ <script type="application/json" id="gm-favorites">  { guidePath, project, guideTitle, kind }
       └─ <script src="/favorites.js"></script>               assets/favorites.js, "favorites v1"
                    │
                    ├─ mounts ☆ in the shell's .crumbs (same-origin parent), floating fallback
                    ├─ picker: outline + toolbar inside the frame, the only document that sees the DOM
                    └─ POST /api/favorites  { guidePath, project, guideTitle, anchor, crumb, html, text, title, note }

server/src/favorites/            NEW Nest module, sibling of progress/
  GET    /api/favorites          all, sorted project asc, order asc
  POST   /api/favorites          201; new row lands on top of its project
  PATCH  /api/favorites/:id      { title?, note? }
  PUT    /api/favorites/order    { ids } → order = index
  DELETE /api/favorites/:id      204, idempotent

client/                          third rail tab: Favorites — bays per project, one column of cards
```

The capture script is **served and spliced, never vendored**, for the reason
the reading aid and the reporter are: one implementation governs every guide
the app frames, however old the build, and a fix reaches all of them at once.
It carries a `favorites v1` header and the splice is skipped for any document
already holding `favorites vN`.

It is injected **only for a registered guide** — the `meta.type` gate progress
uses — and reads its own context blob rather than progress's. Three fields are
duplicated in the page for that; the alternative couples one asset's lifetime
to another's blob name.

The **picker runs inside the frame** because the frame is the only document
that can see the guide's DOM. The alternative — the SPA's viewer head owning
the ☆ and reaching two same-origin documents down — was rejected: it races
the frame's load and remount, it still has to inject its outline styles into
the guide document, and a guide opened through the shell URL directly (which
is exactly how "open in guide" lands, and how a phone bookmark opens) would
have no star at all.

`GuidesView` and `GET /api/guides` are untouched. The render controller needs
no `FavoritesService`: the frame talks to the API itself.

## Capture (`assets/favorites.js`)

**The control.** A `☆` button appended to the shell's `.crumbs` line — the
same host, found the same way, as the resume notice (`headerHost` in
`progress.js`: same-origin parent, no message channel, try/catch for a
cross-origin parent). It shares the line with the notice: exactly one
`margin-left:auto` sits between the crumbs and the notice+star pair, whichever
of the two mounted first, so the notice never floats mid-line. Framed by
something that is not our shell → a floating `☆` top-right, the pill's
fallback role. No `#gm-favorites` blob → the script does nothing, like the
reporter. A second load of the script into the same document returns early.

**Picker mode.** Tapping `☆` (which turns to `★`, pressed) enters it; tapping
again, or `Esc`, or `✕`, leaves it.

- One outline box, `position:fixed`, `pointer-events:none`, drawn over the
  *candidate*'s `getBoundingClientRect()` (the union rect for a heading group),
  `2px solid var(--cyan, #55d0dd)` over a translucent fill. Repositioned on
  scroll and resize.
- A toolbar **top-centre** — the band both guide types leave clear (a deck's
  Back/Next is a sticky bar across the bottom; its top carries only a hairline
  progress bar) — showing a label for the candidate (`table · 9 rows`,
  `card · Die Tabelle`, `section · Wie man eine Lücke liest`, `paragraph`) and
  `wider` · `narrower` · `Save` · `✕`.
- **Candidate** = the innermost block containing the pointer. With a mouse it
  follows pointer movement; on touch, a tap sets it, a second tap on the same
  candidate changes nothing — saving is the toolbar's `Save` or `Enter`, never
  a tap on the content. `wider` walks up the block
  ancestors and stops at the `.card` (deck) or the enclosing `<section>`
  (study build) — never `body`. `narrower` retraces the path just climbed, or
  descends to the first block child when nothing was climbed.
- While picking, a tap whose target resolves to a candidate is **swallowed**
  (capture-phase listener, `preventDefault` + `stopPropagation`): a tap on a
  quiz option must pick the options block, not answer the quiz; a tap on a
  `<summary>` must not toggle it. A tap that resolves to no candidate — a deck's
  Back/Next, a build's contents rail — **passes through**, so you can page to
  the card you want mid-pick.
- Keys: `Esc` cancel, `↑`/`↓` wider/narrower, `Enter` save. `←`/`→` are *not*
  intercepted; they page the deck as ever.

**Save panel.** `Save` morphs the toolbar into: a `title` input prefilled from
the innermost crumb, an empty `note` field with the placeholder *why keep
this?*, `Save`, `Back`. `Enter` in the title saves. Both fields stay editable
later on the Favorites card, so this step costs one tap when you have nothing
to add and is the right moment when you do.

- Success (`201`): the toolbar reads `saved ★` for 1.5 s, the picker exits.
- Failure: the panel stays open with your text and says `couldn't save — try
  again`. Not fire-and-forget like a progress write: a favorite is deliberate
  work, and losing it silently is the one thing this must not do.

**Derived at capture.**

| | Deck | Study build |
|---|---|---|
| `anchor` | containing card → `{kind:'deck', cardIndex, sectionId, cardOffset}` — the same derivation as `progress.js`'s `deckPosition`, ten lines duplicated rather than reaching into `__gmProgress`'s test-exposure surface | nearest preceding `h1–h4[id]` → `{kind:'doc', anchorId}`; none → `{kind:'doc'}` |
| `crumb` | `[section name, card title]` — the card's `.eyebrow` text and its `h2` text; the `h2` is dropped when the block is the card itself or contains that `h2`; absent entries dropped | the heading chain above the block: nearest preceding `h2`, then the nearest `h3` after it, and so on — excluding any heading inside the block |
| `title` default | the block's own first heading (`h1`–`h6`) if it has one, else the innermost crumb | same |
| `html` | `outerHTML` of the block (a heading group is wrapped in one `<div>`), `<script>` elements removed | same |
| `text` | `textContent`, whitespace collapsed | same |

`guidePath`, `project` and `guideTitle` come from the blob. Quiz cards are
pickable like any other; how they render is the view's concern (below).

No message is posted to `window.top` on save. The Favorites view is never
mounted while a guide is open — the viewer replaces the board, and the tabs
are different sections — and switching to the tab remounts the lazy view,
which fetches. An announcement would have nobody to hear it.

## Storage and API

### The type (`shared/types.ts`)

```ts
export interface Favorite {
  id: string;                    // Mongo _id, stringified
  guidePath: string;             // the key the registry, progress and /guide all use
  project: string;               // project *name*, denormalised like reading_progress.project — the bay
  guideTitle: string;            // registry title at capture; kept if the guide is later re-titled
  anchor: GuidePosition | null;  // where the block sits; null when nothing addressable was found
  crumb: string[];               // context headings, outermost first
  html: string;                  // the snapshot
  text: string;                  // textContent — search, and the fallback when html is empty
  title: string;                 // yours, never empty on the wire (server defaults it)
  note: string;                  // yours, '' allowed
  order: number;                 // manual order within the project bay; ascending = top
  createdAt: string;
  updatedAt: string;
}

/** POST body. Everything the server fills in — id, order, timestamps — is absent. */
export type FavoriteDraft = Pick<Favorite,
  'guidePath' | 'project' | 'guideTitle' | 'anchor' | 'crumb' | 'html' | 'text' | 'title' | 'note'>;
```

`project` is the name, not the path, for the same reason progress stores the
name: it is what the blob carries and what the bay header prints. Two
checkouts of one repo would share a bay. Accepted, as progress accepted it.

### The collection

`favorites`, mongoose, `timestamps: true`, index `{ project: 1, order: 1 }`.
No uniqueness constraint anywhere: saving the same table twice is two
favorites with two notes, on purpose.

### Routes

| Route | Behaviour |
|---|---|
| `GET /api/favorites` | every row, sorted `project` asc then `order` asc. One request paints the whole tab. |
| `POST /api/favorites` | `201` with the row. `order = min(order in this project) − 1`, or `0` for the project's first — a freshly saved thing is the one you are working on, so it lands on top. |
| `PATCH /api/favorites/:id` | `{ title?, note? }`, nothing else — `order` has its own route, the rest is immutable capture data. `404` for an unknown id. |
| `PUT /api/favorites/order` | `{ ids: string[] }` → each id's `order = its index`. One route serves ↑, ↓, ⤒ and drag. Any unknown id → `400`, nothing written. `204`. |
| `DELETE /api/favorites/:id` | `204`, idempotent — deleting what is already gone is a success. |

### Validation (`favorites.dto.ts`)

Hand-written guards, like `progress.dto.ts`; one module with a handful of
fields does not justify class-validator.

- `guidePath` and `html`: required non-empty strings; missing → `400`.
- `html` over 512 KB → `413`. Everything else is **truncated, never
  rejected**: `text` 64 KB, `title` 200 chars, `note` 4000, `crumb` at most 6
  entries of 200. A clip is the reader's work, and a too-long note must not
  cost them the clip.
- `title`: trimmed; empty → innermost `crumb` → first 60 characters of `text`
  → `Untitled`. The client has already defaulted it (Capture, above); this is
  the backstop, so the wire type's `title` is never empty.
- `anchor`: through `parsePosition`, exported from `progress.dto.ts`. Malformed
  → `null`, the write succeeds. Same rule as progress, same reason: the
  snapshot is the half that matters, and an unaddressable favorite is still a
  favorite.
- `project`, `guideTitle`: strings, `''` when absent.

**Body limit.** Express's JSON parser stops at 100 KB, and a whole study
section can exceed that. `server/src/app.setup.ts` exports the creation
options (`{ bodyParser: false }`) and `configureApp(app)`, which installs
`useBodyParser('json', { limit: '1mb' })`; `main.ts` and every e2e suite that
posts a favorite use both, so the `413` a test sees is the DTO's deliberate
one, not the parser's.

## Sanitisation

The favorite's HTML comes from a same-origin frame showing our own generated
guide, is stored verbatim, and is rendered back into the SPA with
`dangerouslySetInnerHTML`. The API has no auth — the tailnet is the wall, as
for progress — so a device on the tailnet could POST anything.

**The boundary is render time, in the SPA**, because the SPA is what would
execute it and because the SPA has a DOM to parse with. `client/src/lib/
sanitize.ts`, `DOMParser`-based:

- drop `script, iframe, object, embed, link, meta, form, base` outright;
- drop every `on*` attribute and `srcdoc`; drop any `src` whose scheme is not
  `http` or `https`;
- inside `<svg>`, `href`/`xlink:href` may be `http(s)` or a fragment
  (`<use href="#marker">`) and is otherwise dropped;
- `<style>` survives **only inside `<svg>`** — mermaid emits its rules there,
  scoped to the diagram's own id, and a diagram without them is a grey box;
- `<a>` outside `<svg>`: an `http(s)` href stays and gains `target="_blank"
  rel="noopener"`; any other href — a deck's `#s1`, a build's
  `../../src/foo.ts` — is dropped and the anchor is unwrapped to its text.

Capture-time removal of `<script>` in `favorites.js` is hygiene — no point
storing dead code — not the boundary. `.fav-body` also gets `contain: paint`,
so a `position:fixed` inside a snapshot is boxed to its card rather than
policed attribute by attribute.

## Open in guide

Each card's crumb line is a link to
`/guide?p=<guidePath>&at=<encodeURIComponent(JSON.stringify(anchor))>`. A
**top-level navigation** into the render shell — the standalone reading
surface the shell already is, with `← Guides` bringing you back to `/`, which
lands on your last section (Favorites). No in-SPA viewer for this in v1:
lifting the viewer out of `GuidesView` into `App` is the later upgrade, and
nothing here forecloses it.

- `GET /guide` forwards `at` onto the frame's `/asset` src, untouched.
- `GET /asset` validates `at` with `parsePosition` and sets
  `ProgressContext.jumpTo: GuidePosition | null`. Malformed or absent → `null`
  → the normal resume.
- `progress.js` prefers `ctx.jumpTo` over the stored position for that open:
  deck → the existing `Next` replay, quiz gates still gate and still
  auto-continue; doc → `scrollIntoView` on the anchor. The notice reads
  `opened at your favorite`, or `opening your favorite — answer this` while a
  replay is parked at a gate.
- The first report then records where the reader actually is. Honest:
  they *are* on that card now. `furthestPercent` is protected by `$max` as
  ever, so a jump back to card three erases nothing.

The `progress v1` header does not change. The header exists to stop a served
copy racing a vendored one, and the reporter is never vendored.

## The Favorites view

**Rail.** `Section = 'guides' | 'favorites' | 'settings'`; the tab sits
between Guides and Settings. `Landing` is built on `Section`, so Settings'
landing select gains the option by adding one row to `LANDINGS`. `AppShell`'s
guard against a stale stored section maps all three.

**Data.** `useFavorites()`: fetch on mount, `refetch`, and local optimistic
updates for edit, reorder and delete — apply, send, and on a failed response
refetch so the screen returns to the server's truth. No polling, no
`message` listener (see Capture).

**Bar**, in the board's own style: the title `Favorites`, a `search` box over
title, note, text and crumb, and a project select. The select persists per
device (`guide-manager.favProject`); the query does not — the board's
reasoning applies unchanged.

**Bays per project**, reusing `.bay` / `.bay-h` (name, count). A bay the
search empties drops whole, header and all, like the board. Inside a bay,
**one column**, `max-width: 760px`: a favorite's body is content that needs
reading width, and manual order means *top = learn first* — a row-wrapping
grid reads in an order nobody chose.

**The card** (`.fav-card`):

- *Head row:* a drag handle (shown only under `pointer: fine`) · the **title**
  — click to edit inline, `Enter`/blur → `PATCH` — · the type pill (`tutor`
  for a `deck` anchor, `study` for a `doc` one, none when the anchor is
  `null` — the row carries no guide type of its own, and the anchor's kind
  is that fact already) · pinned right: `↑` `↓` `⤒` `✕`. `✕` is two-tap, the label becoming
  `sure?`, exactly as the viewer's reset: one destructive control per card in
  a dense list must not fire on a mis-tap.
- *Crumb line*, monospace, muted: `guideTitle › crumb[0] › crumb[1]`, the
  whole line being the open-in-guide link, with a trailing `↗` to say it
  leaves the page.
- *Body* (`.fav-body`): the sanitised snapshot, under a scoped stylesheet
  for `table, pre, blockquote, details, svg, img` — `max-width: 100%`, a wide
  table scrolls inside its card rather than the page, `contain: paint`.
- *Note* below the body: click to edit (textarea → `PATCH`); when empty, a
  muted clickable `add a note`.
- *Foot:* saved date.

**Quiz cards stay answerable.** Deck CSS hides `.quiz-feedback` until its
option carries `.revealed`; without that CSS a clipped quiz shows every
answer at once and looks broken. The view's stylesheet restores the rule and
one delegated click handler on `.fav-body` toggles `.revealed` on the tapped
`.quiz-option`. Ten lines, and a clipped quiz becomes a flashcard.

**Reorder.** `↑`/`↓` swap with the neighbour, `⤒` moves to the top, and on
desktop the handle drags (native HTML5 drag-and-drop) within the bay's list.
All four send the bay's full id list to `PUT /api/favorites/order`; the
client applies the new order first and refetches on failure. Reordering
never crosses bays — a favorite's project is capture data, not a filing
decision. While a search is active the reorder controls are hidden: a move
relative to a *filtered* neighbour would produce an order the reader cannot
see, and the project select alone never hides a card's neighbours.

**Empty state:** `Nothing saved yet — open a guide and tap ☆ in its header to
keep a table, a diagram or a paragraph here.` **Error state:** `couldn't load
favorites`, in `.guides-empty`, mirroring the board.

## Error handling, collected

| Where | On failure |
|---|---|
| frame `POST` | panel stays open with the typed text, `couldn't save — try again` |
| view `GET` | `.guides-empty` error line |
| `PATCH` / `PUT` / `DELETE` | optimistic change rolled back by a refetch |
| guide moved or deleted | favorite still renders (snapshot); open-in-guide 404s from the shell — accepted |
| malformed `at` | ignored; ordinary resume |
| `html` over 512 KB | `413`, the panel's failure branch |

## Wire changes

`shared/types.ts` gains `Favorite` and `FavoriteDraft` (above). `GuidePosition`
and `GuideProgress` are unchanged. `ProgressContext` (server-side only) gains
`jumpTo: GuidePosition | null`.

## Files touched

| File | Change |
|---|---|
| `shared/types.ts` | `Favorite`, `FavoriteDraft` |
| `server/src/favorites/favorites.module.ts` | new — mongoose feature + controller + service |
| `server/src/favorites/favorites.schema.ts` | new — the collection above |
| `server/src/favorites/favorites.dto.ts` | new — `parseFavoriteDraft`, `parseFavoritePatch`, `parseOrder` |
| `server/src/favorites/favorites.service.ts` | new — `all`, `create` (top-of-project order), `patch`, `reorder`, `remove` |
| `server/src/favorites/favorites.controller.ts` | new — the five routes |
| `server/src/progress/progress.dto.ts` | export `parsePosition` |
| `server/src/app.module.ts` | import `FavoritesModule` |
| `server/src/app.setup.ts` | new — `configureApp`: `bodyParser: false` + 1 MB JSON parser |
| `server/src/main.ts` | use `configureApp` |
| `server/src/render/render.util.ts` | `FavoritesContext`, `injectFavoritesCapture`; `ProgressContext.jumpTo`; `parseJump(at)` — `JSON.parse` then `parsePosition`, `null` on any failure |
| `server/src/render/render.controller.ts` | `guide()` forwards `at`; `asset()` parses `at` → `jumpTo`, calls `injectFavoritesCapture` |
| `server/src/render/assets.controller.ts` | `GET /favorites.js` |
| `server/src/static.ts` | `/favorites.js` in the fallback exclusion |
| `vite.config.ts` | `/favorites.js` proxy entry |
| `assets/favorites.js` | new — the capture script, `favorites v1` |
| `assets/progress.js` | honour `ctx.jumpTo`; notice wording |
| `client/src/components/SideRail.tsx` | third section |
| `client/src/App.tsx` | lazy `FavoritesView`; the section guard |
| `client/src/components/settings/SettingsView.tsx` | `LANDINGS` row |
| `client/src/lib/settings.ts` | the runtime `LANDINGS` list gains `'favorites'` — `Section` is a type with no members to iterate, so `clampSettings` would otherwise drop the new landing as unknown |
| `client/src/hooks/useFavorites.ts` | new |
| `client/src/lib/sanitize.ts` | new |
| `client/src/components/favorites/FavoritesView.tsx` | new — bar, bays, list |
| `client/src/components/favorites/FavoriteCard.tsx` | new — the card, inline edits, controls |
| `client/src/styles.css` | `.fav-*` rules and the snapshot stylesheet. The shell's star and crumbs-line rules are *not* here — they ship inline in `favorites.js`, like the notice's |
| `CLAUDE.md` | invariants below |
| `README.md` | architecture diagram and layout gain favorites |

## Testing

Flat in `test/`, in the existing styles — mongo-memory e2e for the API, jsdom
docblock for anything with a DOM.

- **`favorites.test.ts`** — e2e: `POST` lands on top of its project and not
  another's; title defaults from innermost crumb, then text, then `Untitled`;
  `400` without `guidePath` or `html`; `413` over 512 KB; the truncations;
  malformed anchor → `null` and the write succeeds; `PATCH` changes title and
  note and nothing else, `404` unknown id; `PUT order` rewrites `order =
  index`, unknown id → `400` and no partial write; `DELETE` twice → `204`
  twice; `GET` sort order.
- **`favorites-inject.test.ts`** — splice lands before `</body>`; skipped on
  `favorites vN`; composes with the reading-aid and reporter splices without
  clobbering either; not injected for an unregistered sibling; `/guide?at=`
  reaches the frame src verbatim; `/asset?at=` valid → `jumpTo` in the
  progress blob, malformed → absent. `assets.e2e.test.ts` gains the
  `GET /favorites.js` byte-equality case its siblings have.
- **`favorites-capture.test.ts`** — jsdom, against a fixture deck (sections,
  cards with eyebrow/h2/table/quiz, Back/Next in a `<nav>`) and a fixture
  build (id'd h2/h3, `nav.toc`): innermost-block candidate; `wider` stops at
  the card / the section; `narrower` retraces; heading group range; `<nav>`
  never a candidate; deck anchor and crumb; doc anchor and crumb; default
  title; the exact `POST` body; `Esc` cancels; a tap on a quiz option picks
  and does not answer; a tap on Next passes through; control mounts in the
  parent's `.crumbs`, floating fallback without one, no-op without the blob,
  second load returns early; failed `POST` keeps the panel and its text.
- **`progress-reporter-jump.test.ts`** — `jumpTo` beats the stored position,
  deck and doc; absent `jumpTo` → the resume as before; notice wording; the
  open report carries the jumped position.
- **`sanitize.test.ts`** — jsdom, the sanitiser alone: drops `script`,
  `on*`, `srcdoc`, `javascript:`; keeps `<style>` inside `<svg>`, drops it
  outside; `<a>` handling; non-`http(s)` `src` removed.
- **`favorites-view.test.tsx`** — bays in project order, cards in `order`;
  search over all four fields; `↑` `↓` `⤒` send the bay's full id list and
  reorder on screen before the response; two-tap delete; inline title and
  note edits → `PATCH` bodies; a sanitised body renders without its script
  and handlers; quiz option reveal; link href carries `p` and `at`; empty
  and error states; a failed `PUT` refetches.
- **`side-rail.test.tsx`**, **`app-landing.test.tsx`**,
  **`settings-view.test.tsx`** — three tabs; the guard maps `favorites`; the
  landing select offers it.
- **`vite-proxy.test.ts`** — the hard-coded expected list gains
  `/favorites.js`. It is the guard's guard and is meant to be edited here.

## Invariants to record in `CLAUDE.md`

- **The capture script is served, not vendored**: `assets/favorites.js`
  carries a `favorites v1` header, `injectFavoritesCapture` refuses a document
  already holding `favorites vN`, and it is injected only for registered
  guides — the same gate as the reporter.
- **A favorite is a snapshot with an address.** Its `html` is what the reader
  saw and is never re-derived from the guide; its `anchor` is a
  `GuidePosition`, so open-in-guide is progress restore with `jumpTo` and
  never a second navigation mechanism.
- **Sanitisation happens where the HTML executes**: `client/src/lib/
  sanitize.ts` at render. The server stores what it is sent, capped; the
  frame's `<script>` strip is hygiene.
- **Order is per project and rewritten whole** through `PUT
  /api/favorites/order`; a new favorite takes the top. Nothing else writes
  `order`, and a favorite never changes project.
- **`/favorites.js` is one more route in three places** — `AssetsController`,
  `vite.config.ts`, `static.ts` — guarded by `test/vite-proxy.test.ts`.

## Out of scope

- **Text-selection highlights.** Sub-paragraph clips. Can be layered on the
  same storage later as a block with `kind: 'text'`.
- **Tags and cross-project collections.** Project bays cover the wanted
  groups; tags would add UI on every card for a need not yet felt.
- **A review or flashcard mode** over favorites. The quiz-reveal rule is as
  far as this goes.
- **Opening a favorite inside the SPA viewer.** Needs the viewer lifted out
  of `GuidesView`; the shell URL is the honest v1.
- **The reading aid in the Favorites view.** `bionic.js` decorates a whole
  document; scoping it to `.fav-body` is its own change.
- **"Source changed" detection**, re-extraction, or repairing a favorite whose
  guide was regenerated.
- **Export** to Markdown or Anki.
- **A Default bay.** Every registered guide belongs to a project.
- **Cross-device conflicts.** Last write wins, as everywhere in this app.
