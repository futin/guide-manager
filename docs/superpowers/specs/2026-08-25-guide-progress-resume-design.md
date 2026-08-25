# Resume where you left off — design

- **Date:** 2026-08-25
- **Status:** approved shape, ready for an implementation plan
- **Supersedes:** nothing. Completes the half of task-1 that was plumbed and
  never wired.

## Problem

The board already claims to know how far you got: a card renders `· 40%` or
`· read` from `GuideEntry.progress`, `GET /api/guides` joins `reading_progress`
in one query, and the collection, the service and `POST /api/progress` all
exist.

Nothing writes it. The scroll reporter that used to POST lived on the old
markdown render path, and that path is gone — every guide is now a generated
HTML document read inside an iframe, where a script on the host page cannot see
the prose, let alone the scroll position. So `progress` is `null` for every
guide, forever, and the card's progress branch is dead code.

Two things are wanted on top of fixing that:

1. **Resume.** Reopening a guide starts at the top, or at card one. On a
   30-card deck or a twelve-chapter study build read from a phone, finding your
   place again costs more than the reading session did.
2. **A per-guide reset**, so a guide can be deliberately started over rather
   than only ever accumulating position.

## What "where we left off" means

Both guide types are self-contained HTML in a same-origin iframe, but they
measure position differently, and a single percent is the wrong model for
either:

- A **tutor deck** is a flat list of cards, exactly one visible at a time
  (`.card.active`); everything else is `display:none`. Its position is
  discrete — card 12 of 30 — and a percent round-trips to the wrong card.
- A **study build** is one long scrolling page holding every chapter, with
  `<h2 id="<doc-slug>">` per document and `#<doc-slug>--<heading-slug>`
  anchors throughout (`skills/study/references/visuals.md`). A stored *pixel*
  offset or percent lands somewhere else entirely when the reader changes the
  text-size setting, because the page reflows — but an anchor id does not move.

So position is **type-aware**, and stored alongside a percent that exists only
for display:

```ts
type GuidePosition =
  | { kind: 'deck'; cardIndex: number; sectionId?: string; cardOffset?: number }
  | { kind: 'doc'; anchorId?: string };
```

`kind: 'deck'` carries both an absolute `cardIndex` and, when the card sits
inside a section wrapper, that section's id plus the card's offset within it.
Section ids (`s1`, `s2`, …) are permanent by contract — `deck.md` §6 forbids
reassigning or reusing them, and the incremental update flow replaces one
section's cards without touching another's. So the section-relative pair
survives a partial regeneration that shifts every absolute index after it,
and the absolute index is the fallback for a card outside any section (the
mental-model opener and the recap card).

`kind: 'doc'` carries the id of the last heading scrolled past. A build with no
id'd headings degrades to the percent, which is the same behaviour as today
plus a rough restore.

### Two numbers, not one

`percent` is where you *are*. `furthestPercent` is the high-water mark, never
lowered. The card shows the second.

This is the small honest slice of "how much did we progress": a glance back at
chapter one must not erase the fact that you had reached chapter nine. One
number cannot express both, and `percent` alone would make the board's reading
of your own history depend on where you happened to close the tab.

`completed` keeps the rule the DTO already documents — only ever set, never
cleared. A deck completes on reaching its last card; a doc at `percent >= 98`,
which allows for a footer the reader never scrolls into view.

## Architecture

```
GET /asset?p=<guide>          ← the iframe's src, already the reading-aid splice point
  │
  ├─ injectReadingAid(html)          unchanged
  └─ injectProgressReporter(html, ctx)
       ├─ <script type="application/json" id="gm-progress">  ctx: path, project, kind, stored progress
       └─ <script src="/progress.js"></script>               assets/progress.js, "progress v1"
                    │
                    ├─ restore: deck → replay Next; doc → scrollIntoView(anchor)
                    └─ report:  POST /api/progress  { percent, position, opened?, completed? }

POST   /api/progress            record position          (openCount only when opened:true)
DELETE /api/progress?guidePath= reset one guide          (deletes the document)
GET    /api/guides              joins progress, as today
```

The reporter is **served from this repo and spliced in per request**, never
vendored into a guide — the same decision, for the same reason, as the reading
aid: a study build generated last week picks the reporter up without being
regenerated, and a fix to the reporter reaches every guide at once. It carries
a `progress v1` header and the splice is skipped for any document that already
holds a `progress vN`, so a future vendored copy cannot end up racing a served
one the way two copies of `bionic.js` would.

The context blob is inlined by the server rather than fetched by the reporter.
The server is answering a request it already resolved through the registry
allowlist, so it knows the absolute path, the project and the guide's type
without asking; a fetch from inside the frame would be a second round trip
before the restore could start, i.e. a visible jump after first paint.

**The reporter is injected only for a file that is itself a registered guide.**
A sibling image or stylesheet pulled through `/asset` gets nothing. `kind`
comes from the registry entry's `type` (`tutor` → `deck`, `study` → `doc`)
rather than from sniffing the markup: the registry is the authority on what a
file is, and `bin/register.js` is what enforces it.

## Restoring a deck

A deck's own JS owns `currentCardIndex`, the score tally, the progress bar and
the disabled state of `Next`. The reporter must not reimplement any of that,
and must not force the visible card by hand: setting `.active` directly leaves
the deck's internal index at 0, so the reader's next `Back` tap jumps to card
one and the progress bar contradicts the screen.

The only navigation control every generated deck is guaranteed to carry is the
persistent `Next`/`Back` pair (`deck.md` §2). Section-jump controls exist, but
only on divider and recap cards, and their markup is given as an example
(`<button data-target="s1">`), not a contract — a reporter keyed to it would
break on a deck that spelled it differently.

So: **restore replays the deck's own `Next` control.** Click it until the
target card is showing. The deck stays internally consistent because every
move went through its own code path.

`Next` is disabled while an unanswered quiz card is showing, so a replay can
stall short of the target. That stall is correct — the quiz is the gate the
deck exists to impose, and quiz answers are deliberately not stored (see
*Out of scope*). Rather than give up there, the reporter keeps the target
**pending**: it watches for `Next` to become enabled again and resumes the
replay, so answering the question carries the reader the rest of the way
automatically. A pending target is cancelled the moment the reader navigates
backwards or the card index moves without the reporter asking — that is a
reader taking control, and a resume that fought them would be worse than no
resume at all.

Which card is showing is read by observing `class` mutations on the card
container, not by wrapping the deck's functions: an observer works on any deck
however its handlers are named, and there is nothing to keep in sync.

## Restoring a study build

`document.getElementById(anchorId)?.scrollIntoView()`, falling back to
`percent` of the scroll height when the id is absent or no longer in the
document. The scroller is the document itself.

## Reporting

- **On load:** one POST with `opened: true` — the only write that increments
  `openCount`. Everything after it omits the flag, so the count stays a count
  of *sessions*, not of keystrokes. Today's service `$inc`s on every POST,
  which was harmless only because nothing ever posted twice; the reporter would
  turn `openCount` into a write counter, so the increment becomes conditional.
- **Deck:** one POST per card change, debounced ~500ms. Card changes are
  discrete and rare; there is no scroll storm to smooth.
- **Doc:** on scroll, debounced ~1s, plus one final write on `pagehide` and on
  `visibilitychange` to hidden — the phone case, where the tab is backgrounded
  rather than closed and a purely debounced write would be lost.
- Writes use `fetch(..., { keepalive: true })` so the last one survives the
  page going away.
- Every write is fire-and-forget. A failed POST is swallowed: the reading
  session is the point, and an alert about a lost byte of bookkeeping is worse
  than the lost byte.
- Restore-driven navigation must not report position as if the reader had
  walked there. The reporter suppresses writes while a replay is in flight,
  and reports once it settles.

## The pill

A small fixed-position pill inside the framed document, bottom-left, shown only
when a restore actually happened: `resumed · start over`. It fades after ~6s;
`start over` returns to card one / the top and clears the stored position via
the reset endpoint.

It exists because a silent restore is indistinguishable from a bug — opening a
guide and landing in the middle of chapter nine reads as the app having lost
your place, not found it. When a deck replay is parked at a gate, the pill says
so instead (`resuming at card 22 — answer this question to continue`), which
turns a stall into an instruction.

Its styles are inlined by `progress.js` rather than shipped as a second
stylesheet route. One route is one entry in the Vite proxy list, one line in
the static-fallback exclusion, and one more path that fails invisibly when
either is forgotten; the pill is a dozen rules and does not earn that.

## Reset

`DELETE /api/progress?guidePath=<abs>` deletes the document outright and
answers `204`. Not a field-clearing update: "start over" means the guide is
one you have not read, and a surviving `openCount: 7` with a zeroed position is
a state the board would have to explain. Deleting also puts the card back into
its never-opened branch, which already renders correctly — a guide that says
nothing rather than `0%`.

Two entry points, both per guide:

1. **The viewer head.** A `↺ reset` button beside the back link and title,
   two-tap confirm (the label becomes `sure?`). This is where "start over"
   is a thing you want: you are looking at the guide.
2. **The pill's `start over`**, while it is showing.

Deliberately *not* on the board's cards. `.guides-card` is a whole-card
`role="button"`; a nested destructive control in a dense grid of them is a
mis-tap on a phone, which is the device this whole app exists for.

## Wire changes

`shared/types.ts`:

```ts
export interface GuideProgress {
  guidePath: string;        // new — GET /api/progress returned rows with no way to tell them apart
  percent: number;          // renamed from scrollPercent: a deck's position is not a scroll
  furthestPercent: number;  // new — high-water mark, never lowered
  position: GuidePosition | null;  // new
  completed: boolean;
  lastOpenedAt: string;
  openCount: number;
}
```

`scrollPercent` is renamed rather than kept as an alias. Nothing in the world
writes it — that is the bug this design fixes — so there is no compatibility to
preserve, and a field named for scrolling that holds a card index would be a
lie in the schema. Existing stored documents have no `furthestPercent`; the
schema defaults it to 0 and the first write raises it, so a legacy row reads as
"opened, no position", which is true.

## Files touched

| File | Change |
|---|---|
| `shared/types.ts` | `GuidePosition`, the `GuideProgress` fields above |
| `server/src/progress/progress.schema.ts` | `percent`, `furthestPercent`, `position` (mixed sub-doc), unchanged key |
| `server/src/progress/progress.dto.ts` | parse `percent`, `position`, `opened`; validate position by `kind` |
| `server/src/progress/progress.service.ts` | conditional `$inc`, `$max` on `furthestPercent`, `reset(guidePath)` |
| `server/src/progress/progress.controller.ts` | `DELETE /api/progress` |
| `server/src/render/render.util.ts` | `injectProgressReporter(html, ctx)` |
| `server/src/render/render.controller.ts` | call it from `GET /asset`; inject `ProgressService` + registry type |
| `server/src/render/render.module.ts` | import `ProgressModule` |
| `server/src/render/assets.controller.ts` | `GET /progress.js` |
| `assets/progress.js` | new — the reporter, `progress v1` |
| `vite.config.ts` | `/progress.js` proxy entry |
| `server/src/static.ts` | `/progress.js` in the fallback exclusion |
| `client/src/hooks/useGuides.ts` | expose a refetch so a reset repaints the board |
| `client/src/components/guides/GuidesView.tsx` | card reads `furthestPercent`; viewer-head reset |

## Testing

- `test/progress.test.ts` — extend: `percent` replaces `scrollPercent`;
  `furthestPercent` never lowers; `openCount` increments only with
  `opened: true`; a position round-trips per `kind`; a malformed position is
  rejected without rejecting the write; `DELETE` removes the row and a
  subsequent `GET /api/guides` reports `progress: null`.
- `test/progress-reporter.test.ts` — new, jsdom, in the style of
  `test/bionic.test.ts`: against a fixture deck (cards, a gating quiz, a
  `Next` button) and a fixture doc (id'd headings). Covers replay to the
  target, a stall at a gate followed by auto-continue when `Next` re-enables,
  cancellation on a backwards move, the anchor restore, the debounce, the
  `pagehide` write, and a no-op when the context blob is absent.
- `test/reading-aid.test.ts` sibling for `injectProgressReporter`: placement,
  the `progress vN` skip, and that both injections compose without either
  clobbering the other's tag.
- `test/vite-proxy.test.ts` — its hard-coded expected route list gains
  `/progress.js`. The list is the guard's guard, so it is meant to be edited
  deliberately here.
- `test/guides-view.test.tsx` — card renders `furthestPercent`; the viewer-head
  reset needs two taps, issues the `DELETE`, and refetches.

## Out of scope

- **Per-quiz-answer state.** Storing which quiz cards were answered (and their
  score) would let a deck resume jump straight past a gate. It needs a stable
  per-card id, which decks do not carry — only sections do — and it changes
  what a score *means* across sessions. The gate-then-auto-continue behaviour
  above is the honest version of this without the new state.
- **Goals and streaks.** `backlog/ideas/open/idea-2-learning-goals.md`. This
  design gives that idea the honest completion signal it says it needs, and
  nothing more.
- **Per-chapter progress for multi-file markdown guides.** A guide is a
  generated HTML page; the markdown chapters are the source, not the artifact.
- **Cross-device conflict resolution.** Last write wins, as the service
  already documents. `furthestPercent` is the one field where that is not
  destructive, which is part of why it exists.
