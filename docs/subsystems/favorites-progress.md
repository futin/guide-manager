# Reading progress and favorites

This subsystem owns everything the app remembers about a reader inside a guide: where they are (reading progress, one row per guide) and what they chose
to keep (favorites, one row per saved block). Both start as a script running inside the framed guide, cross to the API as plain `fetch` calls, live in
Mongo, and come back as the board's tiles, the viewer header's pill and the Favorites sheets. A favorite also links back into its guide, and that link
is a progress restore aimed at a different target. The normative rules are in [CLAUDE.md §Invariants](../../CLAUDE.md#invariants); this page explains
the mechanism behind them.

Three documents are involved, and most of the design follows from which one a piece of code runs in:

```
app (window.top)            client/src — the board, the viewer header, Favorites
 └─ iframe: GET /guide      the server's page shell — a topbar whose .crumbs line both scripts mount into
     └─ iframe: GET /asset  the guide itself — assets/progress.js and assets/favorites.js run here
```

All three are same-origin. Scripts in the guide reach up into the shell's DOM directly and post to the app with `postMessage`; the app never reaches
down.

## Mechanism

### Progress, inside the guide

[`assets/progress.js`](../../assets/progress.js) reads its context from a `#gm-progress` JSON block that `/asset` spliced in beside it: the guide's
path, its project, its `kind` (`deck` for a tutor deck, `doc` for a study build), the stored progress row and, when a favorite is being opened, a
`jumpTo` position. A missing or malformed block makes the reporter do nothing at all, since reporting against a guessed path would write one guide's
position onto another's row.

**Position.** A single percent cannot describe either guide type, so a position is a `GuidePosition` ([`shared/types.ts`](../../shared/types.ts)):

- *Deck* — the index of the `.active` card in the deck's flat card list, plus, when the card sits in a `section[id]`, that section's id and the card's
  offset inside it. Section ids are permanent by the tutor deck contract, so the pair survives a regeneration that shifts every absolute index after a
  rewritten section; `cardIndex` is the fallback.
- *Doc* — the id of the last `h1`–`h4[id]` scrolled past. A stored scroll offset lands elsewhere once the reader changes the text size and the page
  reflows; a heading id does not move.

The percent written beside either is what the board shows, and the fallback when a build has no id'd headings.

**Lifecycle.** `init()` seeds its local state from the stored row, restores (below), then sends the session's one write carrying `opened: true`,
measured after the restore so it records where the reader actually landed. After that a deck is watched with a `MutationObserver` on class and
disabled-state changes, and a doc with a passive scroll listener; both report through a debounce (`DEBOUNCE`) that measures at fire time. A pending
report is flushed on `visibilitychange` to hidden and on `pagehide` — both, because a desktop close and a phone backgrounding are different events —
and only when something is actually pending. The first write at or above `DONE_AT` (98 %) carries `completed: true`; the reporter never sends it again.

**Deck resume.** The reporter walks to the target card by clicking the deck's own `Next`, never by setting `.active`: the deck owns its index, score and
progress bar, and a hand-set card leaves them describing a different screen. `nextControl()` looks for `[data-next]`/`[rel="next"]`, then an id or class
with `next`/`fwd`/`forward` as its own segment, then a button labelled "Next" — id first, because generated decks keep English ids even when their labels
are not (`btn-next` labelled `Weiter`). The walk stops on arrival, on a disabled `Next` (an unanswered quiz card), or when a click does not change the
card. A stall at a quiz gate leaves the target pending, and the observer continues the walk once the gate clears; a backwards move by the reader drops
it. Cards passed during the replay are not reported.

**Doc restore.** Scroll the stored anchor into view; if the heading is gone (ids are slugs, and renaming a chapter retires one), fall back to the stored
percent.

**Jumping to a favorite.** When the context carries `jumpTo`, it wins over the stored position. A deck jump goes through the same `Next` walk, quiz gate
included; a doc jump whose anchor no longer exists falls through to the ordinary restore.

**The resume notice.** Shown only when a restore actually moved the reader. It is appended to the shell's `.topbar .crumbs` line (the title row is the
fallback, for a shell without crumbs) — the breadcrumb line because the title line already ellipsizes and a notice there truncates the guide's name. It
stays for the session, is removed on `pagehide`, and carries no button: starting over is the viewer header's job. A guide with no shell around it (opened
off disk) gets a floating pill instead, docked to the top because a deck keeps its own Back/Next bar at the bottom, and fading on its own. The wording
says what happened: `resumed`, `resuming — answer this` when parked at a quiz, and `opened at your favorite` (or `opening your favorite — answer this`)
only when the favorite's anchor was the thing that moved the reader.

**Announcing a write.** Every request the reporter sends — POST or DELETE — also posts `{ source: 'guide-manager', kind: 'progress' }` to `window.top`.
It goes at send time, not on the response, because a session's last write is the one flushed as the frame is torn down, when there is no document left to
wait for a response in. `window.top` rather than `parent`, because the shell sits between the guide and the app. The message carries no numbers: any
frame can post to the top window, so it is a "something changed" signal and the app asks the API for the facts.

The reporter also exposes a `reset()` that DELETEs through the same endpoint the viewer uses; nothing inside the guide calls it.

### Progress, on the server

[`server/src/progress/`](../../server/src/progress/) has one collection, `reading_progress`, one document per guide, keyed by absolute path — the only
stable id a guide has.

`POST /api/progress` validates with a hand-written guard ([`progress.dto.ts`](../../server/src/progress/progress.dto.ts)): only `guidePath` is required,
`percent` is clamped to 0–100, and a malformed position is downgraded to null rather than failing the write, so an unknown future `kind` degrades to a
percent. [`ProgressService.record`](../../server/src/progress/progress.service.ts) is a single upsert that is last-write-wins except where that would be
destructive:

- `furthestPercent` goes through `$max`, so a second device sitting on page one cannot lower how far the other got;
- `completed` is only ever set — an omitted flag means "no opinion";
- `openCount` is `$inc`'d only by a write carrying `opened: true`, so it counts sessions rather than scroll events;
- `position` is set only when the write carries one, so a write that lost its position does not blank the stored one.

`DELETE /api/progress?guidePath=` deletes the row and answers 204 whether or not one existed. A delete rather than a field reset, because absence is
already what a never-opened guide looks like. The path is a query parameter because a DELETE with a body is awkward for every client, the reporter's
`fetch` included.

Progress is read in two places: `GET /api/guides` attaches each guide's row via `ProgressService.find` (one query for the whole index), and `/asset`
reads the stored row server-side into the context block, so the restore does not wait on a round trip from inside the frame.

### Progress, on the board

[`useGuides`](../../client/src/hooks/useGuides.ts) fetches the index once on mount and has a `refetch`. It lives in `App`, so its listeners are installed
once for the life of the app. Two events schedule a refetch through one shared 300 ms timer, so a burst collapses into a single request:

- a `message` whose data has `source: 'guide-manager'` and `kind: 'progress'` — anything else posted to the window is ignored;
- `visibilitychange` to `visible`, because the message reaches only the tab doing the reading. This is what updates a board in another tab or on another
  device. Not window `focus`, which fires on every tap into the iframe.

[`GuidesView`](../../client/src/components/guides/GuidesView.tsx) also refetches once on the way back from the viewer, covering the teardown write that
can land after its message was handled. While a guide is open, [`ViewerHeader`](../../client/src/components/guides/ViewerHeader.tsx)'s crumb and pill are
read from the current index by path, so the header follows the same refetches as the board.

What the board prints is `furthestPercent`, never `percent`, and only `completed` makes a guide *read*: a guide at 100 % that never reported completion
is still in progress. Those predicates, and the Continue reading row (in-progress guides, last opened first), live in
[`client/src/lib/continue.ts`](../../client/src/lib/continue.ts) so every surface counts the same way.

**Start over.** The viewer header's `Start over` takes two taps; the armed state is held in `GuidesView` and cleared whenever the open guide changes, so
it cannot carry into the next guide. The second tap DELETEs the row, and only once that resolves refetches the index and bumps a nonce that is part of
the iframe's `key`. The remount reloads the guide, which opens at its beginning because nothing is stored. Reloading before the DELETE resolves would let
the old frame report its position and re-create the row. A failed DELETE is swallowed; the board simply keeps the old number.

### Favorites, inside the guide

[`assets/favorites.js`](../../assets/favorites.js) reads a `#gm-favorites` block (path, project, guide title, `kind`) the same way the reporter does. A
`data-gm-favorites` attribute on the root element stops a second evaluation of the script from mounting a second picker.

**The star.** A `☆` button mounts in the shell's `.topbar .crumbs` line — the same host as the resume notice — or floats in a corner of the guide when
there is no shell. It is removed from the shell on `pagehide`, since the shell's header outlives the frame. Tapping it arms the picker.

**Picking.** While armed, one `click` listener on the document in the capture phase resolves each tap by walking up from the target to the first element
on the block list (`BLOCKS`: paragraphs, headings, lists, tables, `pre`, figures, `svg`, a deck's `.card` and `.quiz-options`, sections — not layout
`div`s). A tap that resolves to a block is consumed with `stopPropagation`, so tapping a quiz option to keep it does not answer the quiz. A tap that
resolves to nothing — inside a `nav`, on the picker's own toolbar — is left alone, so the deck's pager and a build's contents rail keep working. There is
no pointer listener: hover used to preview, and the selection chased the pointer across the guide.

A heading resolves to the heading alone. `wider` (or ArrowUp) climbs one rung at a time: from a single heading the first rung is the passage it
introduces (its following siblings up to the next heading of the same or a shallower level), and after that the nearest enclosing block, stopping at a
`.card`, `section` or `article`. `narrower` (ArrowDown) pops the climb, or steps inward. Both controls are disabled when they would do nothing, and a new
tap starts a fresh climb.

**The draft.** From the selection the script derives:

- `anchor` — a `GuidePosition`, the same shape the reporter stores. In a deck it is the holding card's index and section pair, or null for a block
  outside every card. In a build it is the selection's own heading if it starts with one, else the nearest id'd heading above it. Which derivation
  applies comes from `kind` in the context block, never from sniffing the DOM.
- `crumb` — the context above the block, outermost first: a deck card's eyebrow and `h2`, or a build's chain of headings. A heading the selection itself
  contains is never a crumb.
- `html` and `text` — clones of the selected nodes with `<script>` stripped; several siblings are wrapped in one `div`. `text` inserts spaces at block
  boundaries before collapsing whitespace, because `textContent` fuses adjacent table cells into one unsearchable word.
- `title` — the selection's own heading, else the innermost crumb, else empty for the server to fill.

`Save` (or Enter) swaps the toolbar for a panel with the title prefilled and focused, plus a note field. The POST is guarded twice against a doubled
press — once while the request is in flight and once while the success message is up — because the API deliberately does not dedupe. A counter disowns
replies to a panel the reader has already left, so a late reply cannot change the screen or release a newer request's lock. A failure keeps the panel and
everything typed in it. A block the deck has merely hidden still saves; one the guide has removed from the document does not.

**Palette.** Inside the guide the picker declares every `--gm-*` custom property it reads, in two palettes: dark unprefixed, light under
`[data-gm-fav-scheme="light"]`. Which applies is measured by `schemeFor`, which reads the computed background of `body`, then `html`, skipping a fully
transparent one, and compares its luminance against the point where white and black text have equal WCAG contrast; a guide that paints nothing is light.
It is re-measured on every mount and on a `prefers-color-scheme` change. The star in the shell is styled by a separate sheet that maps the same names onto
the app's own tokens. Reading a guide's own tokens instead failed in between: a deck publishing `--fg` but no `--panel` drew its dark text on the
picker's dark fallback.

### Favorites, on the server

[`server/src/favorites/`](../../server/src/favorites/) stores one document per saved block in the `favorites` collection. There is no unique key: the
same block saved twice is two favorites, possibly with two notes.

`POST /api/favorites` ([`favorites.dto.ts`](../../server/src/favorites/favorites.dto.ts)) requires `guidePath` and a non-empty `html`, and answers 413
when `html` is longer than `HTML_LIMIT` (512 × 1024, measured as string length). Every other text field is truncated rather than refused, so a long note
never costs the reader the clip. The JSON body parser is raised to 1 MB in [`app.setup.ts`](../../server/src/app.setup.ts) so that the DTO's cap, not
Express's default, is what answers. `anchor` goes through the progress module's `parsePosition`, and a malformed one becomes null without failing the
write. The service stores `html` as sent — it is never parsed server-side — and fills an empty title from the innermost crumb, then the first 60
characters of `text`, then `Untitled`.

**Order** is per project, ascending from the top. A new favorite takes one less than the lowest order in its own project (0 for the first), so it lands
on top. `GET` returns everything sorted by project then order, served by a compound `{ project, order }` index. `PUT /api/favorites/order` takes one
bay's whole id list and sets each id's order to its index; it refuses the whole request, writing nothing, if any id is malformed or unknown — a partial
list most likely means the client's bay was out of date. `PATCH` edits only `title` and `note`; `DELETE` is idempotent like the progress reset.

### Favorites, in the app

[`useFavorites`](../../client/src/hooks/useFavorites.ts) also lives in `App`, for the rail's counts, and
[`FavoritesView`](../../client/src/components/favorites/FavoritesView.tsx) calls its `refetch` on every mount. It has no `message` listener: a favorite
is saved from a frame in the same tab, and only becomes visible once the reader opens Favorites, which refetches anyway. Its mutations are optimistic —
applied locally, then sent — and fall back to a refetch when the server answers non-ok or the request rejects. Fetches check `res.ok`, because Nest's
error answers are valid JSON that would otherwise be stored as the list. Reordering (↑/↓/⤒ and drag) always writes a bay's whole order, so the controls
are hidden while a search hides some of the bay.

**Sanitising at render.** [`FavoriteCard`](../../client/src/components/favorites/FavoriteCard.tsx) renders the snapshot with `dangerouslySetInnerHTML`,
through [`sanitizeSnapshot`](../../client/src/lib/sanitize.ts). The API has no auth and stores what it is sent, so render time — the one place the markup
executes, and the one place with a DOM to parse it — is the boundary; the capture script's `<script>` strip is hygiene. The sanitiser parses with
`DOMParser`, removes active and raw-text elements (including `noscript` and SMIL animation elements), keeps `<style>` only when it is SVG-namespaced,
drops `on*` and `srcdoc` and any `src`/`href` that is not absolute http(s) (an in-SVG `#fragment` href survives), unwraps a non-http link and opens an
http one in a new tab, sanitises `<template>` content, and re-runs on its own output until two passes agree, returning `''` if they never do.

**The deep link.** A card's crumb is an `<a target="_top">` to the *app*, built by
[`client/src/lib/deeplink.ts`](../../client/src/lib/deeplink.ts): `/?open=<guide path>&at=<anchor JSON>`, with `at` omitted for a null anchor. It used to
point at `/guide`, which opened the framed-by-design shell full-bleed, with no rail, no `‹ Guides` and no `Start over`. On arrival `App` picks the Guides
section; `GuidesView` parks the link until the index arrives, looks the path up across the whole index (ignoring the toolbar and scope), frames the
entry's own `href` with `&at=` appended, and clears both params with `history.replaceState` — the link is an arrival, not state. A path the index does not
know drops to the board. From there `at` travels to `/asset`, becomes `jumpTo`, and the reporter does the rest.

## Interfaces

- **Render pipeline** ([render.md](render.md)). `/asset` splices both scripts and their JSON context blocks into registered guides only, reads the stored
  progress row into the reporter's block, and turns `at` into `jumpTo`. This subsystem's side of that seam is the two block ids and their fields; both
  scripts go silent without a valid block.
- **The page shell** (`GET /guide`). Its `.topbar .crumbs` line is where the resume notice and the star mount, reached as `window.parent.document`. Each
  script ships its own copy of the rule that makes that line a flex row, because either may mount without the other.
- **The client shell and rail.** `App` owns `useGuides` and `useFavorites` so the rail can count both; the rail owns the scope keys the two views read.
  The only channel from a guide to the app is the `progress` message to `window.top`.
- **Mongo.** `reading_progress` (unique `guidePath`) and `favorites` (indexed `guidePath`, compound `{ project, order }`). A position and an anchor are
  stored as `Mixed`, validated once on the way in by `parsePosition`; nothing queries inside them.

## Invariants

| Rule | Where it is guarded |
|---|---|
| `openCount` increments only on a write carrying `opened: true`, which the reporter sends once per page load | [`test/progress.test.ts`](../../test/progress.test.ts), [`test/progress-reporter-doc.test.ts`](../../test/progress-reporter-doc.test.ts) |
| `furthestPercent` only climbs (`$max`); `completed` is never cleared; a write with no position keeps the stored one | [`test/progress.test.ts`](../../test/progress.test.ts) |
| A deck resumes by clicking its own `Next`, parks at an unanswered quiz, and gives up when the reader goes back | [`test/progress-reporter-deck.test.ts`](../../test/progress-reporter-deck.test.ts) |
| A favorite's `jumpTo` beats the stored position, and a missing doc anchor falls through to the ordinary restore | [`test/progress-reporter-jump.test.ts`](../../test/progress-reporter-jump.test.ts) |
| The resume notice mounts on the shell's crumbs line, carries no control, and leaves with the frame | [`test/progress-reporter-header.test.ts`](../../test/progress-reporter-header.test.ts) |
| Every write is announced to `window.top`, without numbers; the board coalesces announcements and tab returns into one refetch | [`test/progress-reporter-doc.test.ts`](../../test/progress-reporter-doc.test.ts), [`test/guides-view.test.tsx`](../../test/guides-view.test.tsx) |
| `Start over` takes two taps and reloads the frame only after the DELETE resolves | [`test/guides-view.test.tsx`](../../test/guides-view.test.tsx) |
| The picker selects on a tap only, consumes a tap only when it resolves to a block, and `wider` climbs one rung at a time | [`test/favorites-capture.test.ts`](../../test/favorites-capture.test.ts) |
| Inside the guide the picker reads no custom property it did not declare; the palette is measured, not asked for | [`test/favorites-capture.test.ts`](../../test/favorites-capture.test.ts) |
| A favorite's `html` over `HTML_LIMIT` is refused with 413; other fields are truncated | [`test/favorites.test.ts`](../../test/favorites.test.ts) |
| A new favorite takes the top of its own project; a reorder rewrites one bay whole or writes nothing | [`test/favorites.test.ts`](../../test/favorites.test.ts), [`test/favorites-view.test.tsx`](../../test/favorites-view.test.tsx) |
| A snapshot is sanitised where it is rendered, never trusted from storage | [`test/sanitize.test.ts`](../../test/sanitize.test.ts), [`test/favorites-view.test.tsx`](../../test/favorites-view.test.tsx) |
| A favorite's crumb links to the app, opens the ordinary viewer at the anchor, and is cleared from the address bar | [`test/favorites-deeplink.test.tsx`](../../test/favorites-deeplink.test.tsx) |

<!-- docs-sync:
  sources:
    - server/src/progress/
    - server/src/favorites/
    - server/src/app.setup.ts
    - assets/progress.js
    - assets/favorites.js
    - client/src/hooks/useGuides.ts
    - client/src/hooks/useFavorites.ts
    - client/src/components/favorites/
    - client/src/components/guides/GuidesView.tsx
    - client/src/components/guides/ViewerHeader.tsx
    - client/src/components/guides/ContinueReading.tsx
    - client/src/lib/deeplink.ts
    - client/src/lib/sanitize.ts
    - client/src/lib/continue.ts
    - shared/types.ts
  kind: subsystem
  verified: 373d528f117e55b2d8264b50fe3f4d8f61a8c498
-->
