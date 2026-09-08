# Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Plan style — this overrides the writing-plans template's "code blocks
> required" rule.** This plan specifies *behaviour*: signatures, exact
> expected values, edge cases, the exact test cases to write, and the exact
> commands to run. It never hands over literal implementation or test code.
> Handed code gets transcribed verbatim, so a bug in the plan becomes a bug in
> the branch with nobody positioned to catch it — test scaffolding worst of
> all, because it reads as boilerplate. The implementer writes the code, and
> is expected to disagree with this plan wherever the code on disk says
> otherwise. Every size figure below is a soft target, never a rule that
> compresses a load-bearing comment away.

> **Review dispatches:** a reviewer writes its full report to a file under
> the session scratchpad and returns only the verdict plus Critical/Important
> findings, one line each. Paste that contract into every review prompt.

**Goal:** Let the reader cut a block out of any framed guide — table, diagram,
code, paragraph, whole card — into a Favorites tab of their own, with a note,
project bays, manual order, and a link back to the exact card or heading.

**Architecture:** A third served asset, `assets/favorites.js`, is spliced into
every registered guide by `GET /asset` exactly as the progress reporter is;
it mounts a `☆` in the shell's crumbs line, runs a block picker inside the
frame, and POSTs a snapshot plus a `GuidePosition` anchor to a new
`server/src/favorites/` Nest module (sibling of `progress/`, Mongo collection
`favorites`). The React client gains a `Favorites` rail section rendering the
snapshots in project bays, sanitised at render. "Open in guide" is
`/guide?p=…&at=<anchor>`: the anchor rides into the progress context as
`jumpTo` and `progress.js`'s existing restore walks there.

**Tech Stack:** NestJS 11 + mongoose 8 (server), React 18 + Vite 5 (client),
plain ES5-style IIFE for the served asset (it runs inside arbitrary generated
guides, no bundler), jest 29 with ts-jest, jsdom for DOM suites,
mongodb-memory-server + supertest for API suites. pnpm only.

**Spec:** `docs/superpowers/specs/2026-09-08-favorites-design.md` — the plan
argues from it; read both.

**Branch:** `feat/favorites` (already created; the spec is its first commit).

## Global Constraints

- **pnpm only** (`packageManager` pinned). Run tests with `pnpm test`
  (`jest --runInBand`), types with `pnpm run typecheck`, a single suite with
  `pnpm exec jest test/<file> --runInBand`.
- **No new runtime dependency.** No HTML parser on the server, no drag
  library, no sanitiser package. `DOMParser` in the client, string splicing on
  the server, exactly as today.
- **Comments explain *why*, at length.** Match the density of the files you
  touch (`server/src/progress/*`, `assets/progress.js`,
  `client/src/components/guides/GuidesView.tsx`). A block with no comment
  explaining its reason is incomplete.
- **Tests are flat in `test/`**, `*.test.ts` / `*.test.tsx`; DOM suites carry
  the `/** @jest-environment jsdom */` docblock as the first thing in the
  file. Served-asset suites load the asset with `window.eval(SRC)` after
  writing fixture markup and a context blob into `document.body`, and call the
  asset's `stop()` in `afterEach` — the pattern in
  `test/progress-reporter-deck.test.ts`.
- **Served, not vendored.** `assets/favorites.js` starts with the exact header
  line `/* favorites v1 — served by guide-manager; injected into framed guides by GET /asset */`.
  Nothing under `skills/` copies it into a guide.
- **Every path `AssetsController` answers appears in `vite.config.ts`'s proxy
  list and `server/src/static.ts`'s exclusion list** — `test/vite-proxy.test.ts`
  guards the first and its hard-coded expected list is edited on purpose.
- **The registry has one writer** (`bin/register.js`); nothing here reads or
  writes it beyond `RegistryService.guideMeta`.
- **The API is unauthenticated; the tailnet is the wall.** Validate shape and
  size, never identity.
- **Copy, verbatim:** star `☆` (idle) / `★` (picking); toolbar words `wider`,
  `narrower`, `Save`, `✕`; panel placeholder `why keep this?`; statuses
  `saved ★` and `couldn't save — try again`; notice `opened at your favorite`
  / `opening your favorite — answer this`; empty state `Nothing saved yet —
  open a guide and tap ☆ in its header to keep a table, a diagram or a
  paragraph here.`; error `couldn't load favorites`; note placeholder `add a
  note`; delete confirm `sure?`; rail label `Favorites`.
- **Limits, verbatim:** `html` 512 KB (`413` beyond), `text` 64 KB, `title`
  200, `note` 4000, `crumb` 6 × 200 (all truncated), JSON body parser 1 MB.
- **Commits:** Conventional Commits, scope `favorites` unless the change is
  elsewhere (`feat(favorites): …`, `feat(render): …`, `test(…): …`,
  `docs: …`); body says *why* when the subject cannot. End every message
  with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  Never commit on `main`.

---

## File structure

| File | Responsibility |
|---|---|
| `shared/types.ts` | `Favorite`, `FavoriteDraft` wire types (append; nothing existing changes) |
| `server/src/app.setup.ts` | **new** — `APP_OPTIONS` (`bodyParser: false`) and `configureApp(app)` installing the 1 MB JSON parser; used by `main.ts` and by every API suite that posts a favorite |
| `server/src/main.ts` | create the app with `APP_OPTIONS`, call `configureApp` |
| `server/src/favorites/favorites.schema.ts` | **new** — mongoose class `StoredFavorite`, `StoredFavoriteDocument`, `StoredFavoriteSchema`, collection `favorites` |
| `server/src/favorites/favorites.dto.ts` | **new** — limits, `parseFavoriteDraft`, `parseFavoritePatch`, `parseOrder` |
| `server/src/favorites/favorites.service.ts` | **new** — `all`, `create`, `patch`, `reorder`, `remove`, `toWire` |
| `server/src/favorites/favorites.controller.ts` | **new** — the five routes under `api/favorites` |
| `server/src/favorites/favorites.module.ts` | **new** |
| `server/src/app.module.ts` | import `FavoritesModule` |
| `server/src/progress/progress.dto.ts` | `export` the existing `parsePosition` (no behaviour change) |
| `server/src/render/render.util.ts` | `ProgressContext.jumpTo?`, `parseJump`, `FavoritesContext`, `injectFavoritesCapture` |
| `server/src/render/render.controller.ts` | `guide()` forwards `at`; `asset()` parses `at` → `jumpTo`, splices the capture script |
| `server/src/render/assets.controller.ts` | `GET /favorites.js` |
| `server/src/static.ts`, `vite.config.ts` | `/favorites.js` |
| `assets/progress.js` | honour `ctx.jumpTo`; notice wording |
| `assets/favorites.js` | **new** — the capture script |
| `client/src/lib/settings.ts` | runtime `LANDINGS` gains `'favorites'` (the spec's file table missed this one; it is the guard that makes a landing pickable) |
| `client/src/components/SideRail.tsx`, `client/src/App.tsx`, `client/src/components/settings/SettingsView.tsx` | third section |
| `client/src/hooks/useFavorites.ts` | **new** — fetch, refetch, optimistic mutations |
| `client/src/lib/sanitize.ts` | **new** — `sanitizeSnapshot` |
| `client/src/components/favorites/FavoritesView.tsx` | **new** — bar, bays, list, drag-drop wiring |
| `client/src/components/favorites/FavoriteCard.tsx` | **new** — one card: body, inline edits, controls |
| `client/src/styles.css` | `.fav-*` rules and the snapshot stylesheet |
| `CLAUDE.md`, `README.md` | layout, invariants, architecture |

Tests: `test/favorites.test.ts`, `test/favorites-inject.test.ts`,
`test/favorites-capture.test.ts`, `test/progress-reporter-jump.test.ts`,
`test/sanitize.test.ts`, `test/favorites-view.test.tsx`, plus edits to
`test/render.e2e.test.ts`, `test/vite-proxy.test.ts`,
`test/side-rail.test.tsx`, `test/app-landing.test.tsx`,
`test/settings-view.test.tsx`, `test/settings.test.ts`.

## Test fixtures (referenced by name below)

**DECK-CAPTURE** — the deck the capture suite writes into `document.body`.
Wire its navigation exactly as `wireDeck()` in
`test/progress-reporter-deck.test.ts` does (one `.active` card, `Next`
disabled while an unanswered `[data-quiz]` card shows, a quiz option's click
answers it). Flat card indexes in brackets:

- `[0]` `div.card.card-model.active` › `p` "Opener text" — outside any section
- `section#s1`
  - `[1]` `div.card.card-concept` › `p.eyebrow` "§1 · Die Tabelle und der Artikel-Trick", `h2` "Vorher", `p` "intro"
  - `[2]` `div.card.card-concept` › `p.eyebrow` "§1 · Die Tabelle und der Artikel-Trick", `h2` "Die Tabelle", `p` "lead", `table` with three `tr`: `th` Nominativ · Akkusativ · Dativ, `td` ich · mich · mir, `td` du · dich · dir, then `blockquote` "Beispiel"
  - `[3]` `div.card.card-quiz#q1[data-quiz]` › `p.quiz-prompt` "Frage?", `div.quiz-options` › two `div.quiz-option` (`data-correct` false/true), each `button.quiz-option-btn` ("A" / "B") + `p.quiz-feedback` ("nein" / "ja")
- `section#s2`
  - `[4]` `div.card.card-divider` › `p.eyebrow` "Weiter geht's", `h2` "Jetzt: §2"
  - `[5]` `div.card.card-concept` › `p.eyebrow` "§2 · Dativ", `h2` "mir dir ihm", `pre` "// x"
- `[6]` `div.card.card-recap` › `h2` "Recap", `script` with text `window.__evil = 1`
- `nav` › `button#back[disabled]` "Back", `button#next` "Next"

Context blob `#gm-favorites`: `{ guidePath: '/g/deck.html', project: 'german-study-partner', guideTitle: 'Personalpronomen', kind: 'deck' }`.

**DOC-CAPTURE** — the study build the capture suite uses:

- `nav.toc` › `ul` › `li` › `a[href="#lifecycle"]` "The lifecycle"
- `main#top`
  - `h1` "Hooks guide" (no id)
  - `section` › `h2#lifecycle` "The lifecycle", `p` "lifecycle intro", `h3#lifecycle--2-turn` "2. One turn", `p` "turn prose", `table` (two `tr`, one `td` each: "a", "b"), `h3#lifecycle--3-events` "3. Events", `pre` "code"
  - `section` › `h2#answer-channel` "The answer channel", `p` "answer intro"

Context blob: `{ guidePath: '/g/hooks/index.html', project: 'claude-agents-dashboard', guideTitle: 'Hooks', kind: 'doc' }`.

**SHELL** — the parent document for the mount tests, copied from
`test/progress-reporter-header.test.ts`: `header.topbar` › `.topbar-inner` ›
`nav.crumbs` (with `a.back`) + `.topbar-title`; `main.wrap` holding the
`iframe`. Build the framed arrangement the way that suite's `frameGuide()`
does (write the guide into `frame.contentDocument`, eval the asset in the
frame's window).

**DECK-JUMP / DOC-JUMP** — the fixtures already in
`test/progress-reporter-deck.test.ts` (eight cards, quiz at `[2]` in `s1`,
`s2` holding `[4] [5] [6]`, recap `[7]`) and `test/progress-reporter-doc.test.ts`
(`h2#intro`, `h2#pipeline`, `h3#pipeline--why`), reused as they are.

**FAVORITES-API** — four favorites the view suite's `GET /api/favorites`
mock returns, already in server sort order (project asc, order asc):

| id | project | guideTitle | guidePath | order | title | crumb | html | text | note | anchor |
|---|---|---|---|---|---|---|---|---|---|---|
| `f4` | `claude-agents-dashboard` | `Hooks` | `/g/hooks/index.html` | 0 | `Held socket` | `['The held socket']` | `<p onclick="x()">hi<script>evil()</script></p><a href="javascript:x()">j</a><a href="https://e.com">e</a>` | `hi j e` | `` | `{kind:'doc', anchorId:'held-socket--3'}` |
| `f1` | `german-study-partner` | `Personalpronomen` | `/g/pp.html` | -1 | `Die Tabelle` | `['§1 · Die Tabelle','Die Tabelle']` | `<table><tr><th>Nom</th></tr><tr><td>ich</td></tr></table>` | `Nom ich` | `nine persons two cases` | `{kind:'deck', cardIndex:2, sectionId:'s1', cardOffset:1}` |
| `f2` | `german-study-partner` | `Personalpronomen` | `/g/pp.html` | 0 | `Quiz` | `['§1 · Die Tabelle']` | `<div class="card card-quiz"><p class="quiz-prompt">Q?</p><div class="quiz-options"><div class="quiz-option"><button class="quiz-option-btn">A</button><p class="quiz-feedback">nein</p></div></div></div>` | `Q? A nein` | `` | `{kind:'deck', cardIndex:3, sectionId:'s1', cardOffset:2}` |
| `f3` | `german-study-partner` | `Konnektoren` | `/g/k.html` | 1 | `Konnektoren` | `[]` | `<p>weil</p>` | `weil` | `` | `null` |

All with `createdAt`/`updatedAt` `2026-09-08T10:00:00.000Z`.

---

### Task 1: The favorites API

**Files:**
- Modify: `shared/types.ts` (append after `GuidesIndex`)
- Modify: `server/src/progress/progress.dto.ts` (`parsePosition` gains `export`; nothing else)
- Create: `server/src/app.setup.ts`
- Modify: `server/src/main.ts`
- Create: `server/src/favorites/favorites.schema.ts`, `favorites.dto.ts`, `favorites.service.ts`, `favorites.controller.ts`, `favorites.module.ts`
- Modify: `server/src/app.module.ts`
- Test: `test/favorites.test.ts`

**Interfaces:**
- Consumes: `GuidePosition` and `parsePosition(v: unknown): GuidePosition | null` from `progress.dto.ts`; the mongo-memory + supertest module pattern of `test/progress.test.ts`.
- Produces:
  - `shared/types.ts`: `interface Favorite { id: string; guidePath: string; project: string; guideTitle: string; anchor: GuidePosition | null; crumb: string[]; html: string; text: string; title: string; note: string; order: number; createdAt: string; updatedAt: string }` and `type FavoriteDraft = Pick<Favorite, 'guidePath' | 'project' | 'guideTitle' | 'anchor' | 'crumb' | 'html' | 'text' | 'title' | 'note'>`. Doc-comment each field with the *why* from the spec's "The type" section (project is the name, denormalised like progress; title never empty on the wire; order ascending = top).
  - `app.setup.ts`: `export const APP_OPTIONS: NestApplicationOptions` equal to `{ bodyParser: false }`; `export function configureApp(app: NestExpressApplication): void` calling `app.useBodyParser('json', { limit: '1mb' })`. Comment: express's default 100 KB refuses a whole study section; the DTO's 512 KB cap is the deliberate limit and must be the one that fires.
  - `favorites.dto.ts`: `export const HTML_LIMIT = 512 * 1024`, `TEXT_LIMIT = 64 * 1024`, `TITLE_LIMIT = 200`, `NOTE_LIMIT = 4000`, `CRUMB_MAX = 6`, `CRUMB_ENTRY_LIMIT = 200`; `export type DraftParse = { draft: FavoriteDraft } | { error: 'missing' } | { error: 'too-large' }`; `export function parseFavoriteDraft(body: unknown): DraftParse`; `export interface FavoritePatch { title?: string; note?: string }`; `export function parseFavoritePatch(body: unknown): FavoritePatch | null`; `export function parseOrder(body: unknown): string[] | null`.
  - `favorites.service.ts`: `class FavoritesService` with `all(): Promise<Favorite[]>`, `create(draft: FavoriteDraft): Promise<Favorite>`, `patch(id: string, patch: FavoritePatch): Promise<Favorite | null>`, `reorder(ids: string[]): Promise<boolean>`, `remove(id: string): Promise<void>`.
  - Routes: `GET /api/favorites`, `POST /api/favorites` (201), `PATCH /api/favorites/:id`, `PUT /api/favorites/order` (204), `DELETE /api/favorites/:id` (204).

**Behaviour to implement:**

- `parseFavoriteDraft`: not an object → `{error:'missing'}`. `guidePath` or `html` missing / not a non-empty string → `{error:'missing'}`. `html.length > HTML_LIMIT` → `{error:'too-large'}`. Otherwise a draft with: `project`, `guideTitle` as strings (`''` when absent or not strings); `anchor` via `parsePosition`; `crumb` = the first `CRUMB_MAX` string entries, each cut to `CRUMB_ENTRY_LIMIT`, non-strings dropped, non-array → `[]`; `text`/`title`/`note` as strings cut to their limits (`''` when absent); `title` trimmed *after* cutting. No defaulting of the title here — that is the service's job, because it needs `crumb` and `text` together.
- `parseFavoritePatch`: not an object → `null`. Reads `title` (string, cut to 200, trimmed) and `note` (string, cut to 4000). Neither present as a string → `null`. A `title` that trims to `''` → `null` (the controller turns `null` into `400`; an empty title would break the never-empty wire rule).
- `parseOrder`: `body.ids` must be an array of 1–1000 non-empty strings with no duplicates → the array; anything else → `null`.
- Schema: fields `guidePath` (required, indexed), `project` (required, default `''`), `guideTitle` (default `''`), `anchor` (`SchemaTypes.Mixed`, default `null` — same reasoning as `ReadingProgress.position`), `crumb` (`[String]`, default `[]`), `html` (required), `text` (default `''`), `title` (required), `note` (default `''`), `order` (required, indexed with project: `{ project: 1, order: 1 }`); `timestamps: true`; `collection: 'favorites'`. No unique index anywhere — comment why (two saves of one table are two favorites with two notes).
- `create`: title = `draft.title` if non-empty, else the last `crumb` entry, else the first 60 characters of `text` trimmed, else `Untitled`. Order = (lowest `order` among rows with the same `project`) − 1, or `0` when the project has none. Comment: a freshly saved thing is the one being worked on, so it takes the top.
- `patch`: returns `null` for an id that is not a valid `ObjectId` or matches nothing; otherwise `$set`s only the fields present and returns the wire row.
- `reorder`: `false` when `countDocuments({ _id: { $in: ids } })` is not `ids.length` (write nothing); otherwise one `bulkWrite` of `updateOne` per id setting `order` to its index, return `true`.
- `remove`: `deleteOne`; an invalid `ObjectId` is a no-op. Idempotent.
- `toWire`: `id` = `_id.toString()`, dates as ISO strings, `anchor ?? null`.
- Controller: `POST` → `parseFavoriteDraft`; `missing` → `BadRequestException('guidePath and html are required')`; `too-large` → `PayloadTooLargeException('html exceeds 512 KB')`. `PATCH` → `null` parse → `400 'title or note is required'`; `null` from the service → `NotFoundException('no such favorite')`. `PUT order` → `null` parse → `400 'ids must be a non-empty list of distinct ids'`; service `false` → `400 'unknown favorite id'`. `DELETE` → `204` always.
- `main.ts`: `NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS)` then `configureApp(app)`.

- [ ] **Step 1: Write the failing API suite** — `test/favorites.test.ts`, node environment, mongo-memory + supertest as in `test/progress.test.ts` (without its diagnostic filter). Testing module: `MongooseModule.forRoot(uri)`, `forFeature` for `StoredFavorite`, controller `FavoritesController`, provider `FavoritesService`; create the app with `createNestApplication<NestExpressApplication>(APP_OPTIONS)` and apply `configureApp` before `init()`. A `beforeEach` that empties the collection. Cases, each its own `it`:
  1. `POST {guidePath:'/g/a.html', html:'<p>x</p>'}` → `201`; body `id` matches `/^[0-9a-f]{24}$/`; `project:''`, `guideTitle:''`, `anchor:null`, `crumb:[]`, `text:''`, `title:'Untitled'`, `note:''`, `order:0`; `createdAt` and `updatedAt` parse as dates.
  2. Title defaults: `title:'  '` with `crumb:['A','B']` → `'B'`; `crumb:[]` with `text` of 100 `a`s → exactly 60 `a`s; `title:' Mine '` → `'Mine'`.
  3. Order: three `POST`s with `project:'p1'` → orders `0`, `-1`, `-2` in creation order; then one with `project:'p2'` → `0`; `GET` lists the `p1` rows in order `-2, -1, 0`.
  4. `400` when `guidePath` is absent; `400` when `html` is `''`; `413` when `html` is `'x'.repeat(512 * 1024 + 1)` and the response message contains `512`. (This request is over the express default, so it also proves `configureApp` is in effect.)
  5. Truncation: `note` of 5000 chars → stored length `4000`; `title` of 300 → `200`; `text` of 70000 → `65536`; `crumb` of 8 entries → `6`; a crumb entry of 300 chars → `200`.
  6. Anchor: `{kind:'deck', cardIndex:2, sectionId:'s1', cardOffset:1}` round-trips exactly; `{kind:'nope'}` → `null` with `201`; `{kind:'deck'}` (no `cardIndex`) → `null`.
  7. `PATCH /:id {title:'New'}` → `200`, `title:'New'`, note untouched; `{note:'why'}` → `note:'why'`; `{title:'   '}` → `400`; `{order:5}` → `400`; a well-formed unknown id (`'0'.repeat(24)`) → `404`; `'nope'` → `404`.
  8. `PUT /order`: with rows `a, b, c` in one project, `{ids:[c,a,b]}` → `204` and `GET` shows `c:0, a:1, b:2`; `{ids:[a, '0'.repeat(24)]}` → `400` and orders unchanged; `{ids:[]}` → `400`; `{ids:[a,a]}` → `400`.
  9. `DELETE /:id` → `204`; again → `204`; `GET` no longer lists it; `DELETE /nope` → `204`.
  10. `GET` sort: two `POST`s into project `b` (orders `0`, `-1`) and then one into project `a` (order `0`) come back `a:0, b:-1, b:0` — project ascending, then order ascending.
- [ ] **Step 2: Run it, confirm it fails** — `pnpm exec jest test/favorites.test.ts --runInBand`. Expected: compile failure on the missing modules (`Cannot find module '../server/src/favorites/...'`).
- [ ] **Step 3: Add the wire types** in `shared/types.ts` and the `export` on `parsePosition`. Run `pnpm run typecheck` — expected clean (nothing consumes them yet).
- [ ] **Step 4: Write `app.setup.ts` and switch `main.ts` to it.** Run `pnpm run typecheck` — clean.
- [ ] **Step 5: Write the schema, dto, service, controller, module; register the module in `app.module.ts`.** Follow the comment density of `progress.service.ts` — every non-obvious rule above carries its reason.
- [ ] **Step 6: Run the suite until green** — `pnpm exec jest test/favorites.test.ts --runInBand`. Expected: 10 passing. If case 4's `413` arrives as a `500` or as express's own 413 body, `configureApp` is not applied to the test app — fix the test module, not the limit.
- [ ] **Step 7: Run everything** — `pnpm test` and `pnpm run typecheck`. Expected: all green; no other suite touches these files.
- [ ] **Step 8: Commit** — `git add shared/types.ts server/src/app.setup.ts server/src/main.ts server/src/favorites server/src/app.module.ts server/src/progress/progress.dto.ts test/favorites.test.ts`, message `feat(favorites): store, list, edit, reorder and delete favorites` with a body naming the top-of-project order rule and the 1 MB body parser, plus the trailer.

---

### Task 2: Open a guide at a position — `at` → `jumpTo`

**Files:**
- Modify: `server/src/render/render.util.ts` (`ProgressContext`, new `parseJump`)
- Modify: `server/src/render/render.controller.ts` (`guide()` lines 38–48, `asset()` lines 61–94)
- Modify: `assets/progress.js` (`restoreDeck` ~line 457, `restoreDoc` ~line 207, `pillText` ~line 714, `init` ~line 274)
- Test: `test/progress-reporter-jump.test.ts` (new), `test/progress-inject.test.ts` (extend), `test/render.e2e.test.ts` (extend)

**Interfaces:**
- Consumes: `parsePosition` (exported in Task 1); `deckTarget`, `advance`, `restoreDoc` internals of `progress.js`.
- Produces: `ProgressContext.jumpTo?: GuidePosition | null` (optional, so existing fixtures stay valid; **omitted** from the blob when null); `export function parseJump(at: string | undefined): GuidePosition | null` in `render.util.ts` — `JSON.parse` the string, hand the result to `parsePosition`, any throw → `null`. `GET /guide?p=…&at=<x>` forwards `x` onto the frame src as `&at=<encodeURIComponent(x)>`. `GET /asset?p=…&at=<x>` puts `parseJump(x)` in the progress context as `jumpTo` when non-null.

**Behaviour to implement in `progress.js`:**

- A module-level flag `jumped` (in `state`), false until a jump target is actually used for a restore.
- `restoreDeck()`: the target comes from `ctx.jumpTo` when present and of `kind:'deck'`, else from the stored position as today. With neither → `false`. When the jump target is used, set `state.jumped = true` before `advance()`. The `target <= 0 || target <= activeIndex()` early-out stays — a jump to card one moves nothing and announces nothing.
- `restoreDoc()`: when `ctx.jumpTo` is `kind:'doc'` and its `anchorId` names an element in the document → `scrollIntoView` it, set `jumped`, return `true`. When the jump anchor is missing from the document (a renamed chapter) → fall through to the ordinary stored-position restore, `jumped` stays false.
- `pillText()`: `jumped && pending >= 0` → `opening your favorite — answer this`; `jumped` → `opened at your favorite`; otherwise unchanged (`resuming — answer this` / `resumed`).
- `stop()` resets `jumped`. Header line stays `progress v1` — comment why in the file's header block (the version exists to stop a served copy racing a vendored one, and the reporter is never vendored).

- [ ] **Step 1: Write the failing jump suite** — `test/progress-reporter-jump.test.ts`, jsdom, loading `progress.js` exactly as the deck suite does (copy its `load`, `wireDeck`, `stored`, `tick`, `fetchMock`/`bodyOf` helpers; the context builder gains a `jumpTo` argument). Stub `Element.prototype.scrollIntoView` with a jest mock the way `test/progress-reporter-doc.test.ts` does. Cases:
  1. DECK-JUMP, stored position `{kind:'deck', cardIndex:3}`, `jumpTo: {kind:'deck', cardIndex:1, sectionId:'s1', cardOffset:0}` → after `init()` the active card is `[1]` ("s1 first"), not `[3]`; the notice/pill text is `opened at your favorite`; the first `fetch` body (the open) has `position` equal to `{kind:'deck', cardIndex:1, sectionId:'s1', cardOffset:0}` and `opened: true`.
  2. DECK-JUMP, stored `{kind:'deck', cardIndex:3}`, `jumpTo: {kind:'deck', cardIndex:0}` → active stays `[0]`; no pill and no notice in the document (nothing moved, nothing announced).
  3. DECK-JUMP, no stored progress, `jumpTo: {kind:'deck', cardIndex:5, sectionId:'s2', cardOffset:1}` → replay parks at the quiz `[2]`; pill text `opening your favorite — answer this`; answering the quiz and awaiting `tick()` lands on `[5]` ("s2 middle").
  4. DECK-JUMP, stored `{kind:'deck', cardIndex:3}`, no `jumpTo` → active `[3]`, pill text `resumed` — the behaviour before this task, unchanged.
  5. DOC-JUMP, stored anchor `intro`, `jumpTo: {kind:'doc', anchorId:'pipeline--why'}` → `scrollIntoView` called on `#pipeline--why` and not on `#intro`; pill text `opened at your favorite`.
  6. DOC-JUMP, stored anchor `intro`, `jumpTo: {kind:'doc', anchorId:'gone'}` → `scrollIntoView` called on `#intro`; pill text `resumed`.
- [ ] **Step 2: Extend `test/progress-inject.test.ts`** with: `injectProgressReporter(page(), {...ctx, jumpTo: {kind:'doc', anchorId:'x'}})` round-trips `jumpTo` in the blob; `{...ctx, jumpTo: null}` produces a blob with **no** `jumpTo` key; and a `describe('parseJump')` with: `undefined` → `null`; `'not json'` → `null`; `JSON.stringify({kind:'deck', cardIndex:'x'})` → `null`; `JSON.stringify({kind:'deck', cardIndex:3, sectionId:'s2', cardOffset:1})` → that object; `JSON.stringify({kind:'doc', anchorId:'x'})` → that object.
- [ ] **Step 3: Extend `test/render.e2e.test.ts`** (its fixture registers `deck.html` as tutor and `index.html` as study): `GET /guide?p=<deck>&at=<enc>` where `enc = encodeURIComponent(JSON.stringify({kind:'deck', cardIndex:3}))` → response text contains the frame src with `&amp;at=` followed by `encodeURIComponent(enc)` (the src is HTML-escaped by `deckFrame`; assert the escaped form); `GET /asset?p=<deck>&at=<enc>` → the `gm-progress` blob's `jumpTo` equals `{kind:'deck', cardIndex:3}`; `GET /asset?p=<deck>&at=garbage` → the blob has no `jumpTo` key; `GET /guide?p=<deck>` (no `at`) → the src carries no `at`.
- [ ] **Step 4: Run the three suites, confirm they fail** — `pnpm exec jest test/progress-reporter-jump.test.ts test/progress-inject.test.ts test/render.e2e.test.ts --runInBand`. Expected: the jump cases fail on the active card / pill text; `parseJump` is not a function; the e2e `at` cases fail on the missing `jumpTo`.
- [ ] **Step 5: Implement the server side** — `ProgressContext.jumpTo?`, `parseJump`, the controller's `at` handling in both routes (spread `jumpTo` in only when non-null). Comment in `guide()` why `at` is forwarded rather than interpreted there: the shell has no reporter, the frame does.
- [ ] **Step 6: Implement the reporter side** per the behaviour list. Keep every existing comment; add the *why* for the fall-through on a missing jump anchor.
- [ ] **Step 7: Run the three suites until green**, then `pnpm test` — every reporter suite must stay green (the deck, doc, header and pill suites exercise the paths you touched).
- [ ] **Step 8: Commit** — `feat(render): open a guide at a given position via /guide?at=` — body: the anchor rides the progress context so the deck replay and the doc scroll are reused, not reimplemented. Files: `render.util.ts`, `render.controller.ts`, `assets/progress.js`, the three test files.

---

### Task 3: Serve and splice the capture script

**Files:**
- Modify: `server/src/render/render.util.ts` (`FavoritesContext`, `injectFavoritesCapture`)
- Modify: `server/src/render/render.controller.ts` (`asset()`)
- Modify: `server/src/render/assets.controller.ts`, `server/src/static.ts`, `vite.config.ts`
- Create: `assets/favorites.js` (first version: header, context reader, load guard, test surface)
- Test: `test/favorites-inject.test.ts` (new), `test/vite-proxy.test.ts` (edit the expected list), `test/render.e2e.test.ts` (extend), `test/favorites-capture.test.ts` (new — the context/guard cases only; later tasks add to it)

**Interfaces:**
- Consumes: `splice`, `jsonForScript`, `escapeHtml` in `render.util.ts`; `RegistryService.guideMeta`.
- Produces: `export interface FavoritesContext { guidePath: string; project: string; guideTitle: string; kind: 'deck' | 'doc' }`; `export function injectFavoritesCapture(html: string, ctx: FavoritesContext): string`. In the frame: `globalThis.__gmFavorites` with at least `readContext(): FavoritesContext | null`, `init(): void`, `stop(): void`, `started(): boolean`.

**Behaviour:**

- `injectFavoritesCapture`: `/favorites v\d+/i` present → return the input unchanged. Otherwise splice `<script type="application/json" id="gm-favorites">` + `jsonForScript(ctx)` + `</script><script src="/favorites.js"></script>` before `</body>` (append when there is no closing body tag — the same fallback the reporter uses).
- `asset()`: inside the existing `if (meta.type)` branch, after the reporter splice, call `injectFavoritesCapture(html, { guidePath: real, project: meta.project ?? '', guideTitle: meta.title, kind })` with the same `kind` the reporter got.
- `AssetsController`: `@Get('favorites.js')` sending `assets/favorites.js` as `MIME['.js']`, comment mirroring `progressJs`'s.
- `static.ts` exclusion list and `vite.config.ts` proxy gain `/favorites.js`.
- `assets/favorites.js` first version: the exact header line; an IIFE with `'use strict'`; `readContext()` parsing `#gm-favorites` (same shape and same silence-on-malformed reasoning as the reporter's `readContext`); a load guard — if `document.documentElement` carries the attribute `data-gm-favorites`, the whole IIFE returns before defining anything (comment: a second copy would mount a second star and swallow taps twice); `init()` sets that attribute, returns early without a context; `stop()` removes it; `started()` reports it; `globalThis.__gmFavorites = { readContext, init, stop, started }`; the same `DOMContentLoaded`-or-now bootstrap as the reporter.

- [ ] **Step 1: Write `test/favorites-inject.test.ts`** (node), modelled on `test/progress-inject.test.ts` with a `contextJson` helper reading `id="gm-favorites"`. Cases: the blob and `<script src="/favorites.js"></script>` are present, blob before script, `<p>hi</p>` before script, script before `</body>`; the context round-trips as exactly `{guidePath:'/g/deck.html', project:'demo', guideTitle:'Deck', kind:'deck'}`; a `guidePath` containing `</script><b>x</b>` never appears raw and parses back intact; a document containing `/* favorites v1 */` is returned byte-identical; composing `injectFavoritesCapture(injectProgressReporter(injectReadingAid(page()), pctx), fctx)` yields all of `/bionic.css`, `/bionic.js`, `/progress.js`, `/favorites.js`, `gm-progress`, `gm-favorites`, with `/progress.js` appearing before `gm-favorites`; `'<html><body><p>hi</p>'` still receives the splice.
- [ ] **Step 2: Edit `test/vite-proxy.test.ts`** — the expected sorted list becomes `['/bionic.css', '/bionic.js', '/favorites.js', '/progress.js', '/style.css', '/theme.css']`.
- [ ] **Step 3: Extend `test/render.e2e.test.ts` and `test/assets.e2e.test.ts`** — render: `GET /asset?p=<deck>` contains `<script src="/favorites.js"></script>` and a `gm-favorites` blob equal to `{guidePath: <deck realpath>, project:'proj', guideTitle:'Deck', kind:'deck'}`; `GET /asset?p=<index.html>` blob has `kind:'doc'` and `guideTitle:'Alpha Guide'`; `GET /asset?p=<sibling.html>` contains neither `/favorites.js` nor `gm-favorites`. Assets: one case in the style of *serves the vendored reading aid, not a copy* — `GET /favorites.js` → `200`, `content-type` matching `javascript`, body byte-equal to `assets/favorites.js` on disk.
- [ ] **Step 4: Start `test/favorites-capture.test.ts`** (jsdom; `SRC` read from `assets/favorites.js`; `load(context, html)` helper writing the fixture, the blob when a context is given, then `window.eval(SRC)`; `afterEach` calls `stop()`). Cases for this task: with the DECK-CAPTURE blob, `readContext()` returns exactly the blob object and `started()` is `true` after load; without a blob, `readContext()` is `null`, `started()` is `false` and `document.documentElement` has no `data-gm-favorites` attribute; a blob whose JSON is malformed reads as `null`; evaluating `SRC` twice without `stop()` between leaves `__gmFavorites` as the first instance (add a marker property in the test — e.g. assign `__gmFavorites.tag = 1` after the first load and assert it survives the second).
- [ ] **Step 5: Run the four suites, confirm they fail** — `pnpm exec jest test/favorites-inject.test.ts test/vite-proxy.test.ts test/render.e2e.test.ts test/favorites-capture.test.ts --runInBand`.
- [ ] **Step 6: Implement** — `render.util.ts`, `render.controller.ts`, `assets.controller.ts`, `static.ts`, `vite.config.ts`, and the first `assets/favorites.js`.
- [ ] **Step 7: Run the four suites until green, then `pnpm test`.** `test/vite-proxy.test.ts`'s "proxies every route" case is the one that catches a forgotten `vite.config.ts` entry.
- [ ] **Step 8: Commit** — `feat(favorites): serve and splice the capture script into framed guides`. Note in the body that `vite.config.ts` needs `docker compose restart client` on a running stack (CLAUDE.md invariant) — the commit does not do that.

---

### Task 4: The picker — control, candidates, outline, toolbar

**Files:**
- Modify: `assets/favorites.js`
- Test: `test/favorites-capture.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3's skeleton; SHELL / DECK-CAPTURE / DOC-CAPTURE fixtures.
- Produces on `__gmFavorites`: `candidateAt(target: Element): Element[] | null`, `widen(): boolean`, `narrow(): boolean`, `candidate(): Element[] | null`, `setCandidate(nodes: Element[] | null): void`, `labelFor(nodes: Element[]): string`, `groupFor(heading: Element): Element[]`, `enter(): void`, `leave(): void`, `picking(): boolean`, `host(): Element | null`. DOM produced: `button.gm-fav-toggle` (`aria-pressed`, `aria-label="Save a piece of this guide"`, text `☆`/`★`); while picking, `div.gm-fav-outline` and `div.gm-fav-toolbar.gm-fav-ui` holding `span.gm-fav-label`, `button.gm-fav-wider`, `button.gm-fav-narrower`, `button.gm-fav-save`, `button.gm-fav-cancel`. All picker CSS inlined through an `ensureStyles(doc, marker, css)` helper like the reporter's (`data-gm-favorites-style` in the frame, `data-gm-favorites-shell-style` in the parent).

**Behaviour:**

- **Mount** (`init`, after a context is read): `host()` = the parent document's `.topbar .crumbs`, found and guarded exactly like `headerHost()` in `progress.js` (same-origin parent, `try/catch`, `null` when `parent === window`). With a host: append the toggle there and inject the shell stylesheet, whose rules make `.topbar .crumbs` a flex row (`display:flex; align-items:center; min-width:0`, the same rule the notice ships), give `.gm-fav-toggle` `margin-left:auto`, and — so exactly one auto margin exists on the line — set `margin-left:12px` on a toggle that follows a `.gm-progress-note` and on a `.gm-progress-note` that follows the toggle (two sibling-combinator rules). Without a host: append the toggle to `document.body` with an extra class `gm-fav-floating` (`position:fixed; top:12px; right:12px; z-index:2147483000`). The toggle is removed by `stop()`, and by `pagehide` (the same reasoning as `dismissNotice`: it describes *this* document).
- **Block test**: `BLOCKS = 'p, h1, h2, h3, h4, h5, h6, ul, ol, dl, table, pre, blockquote, figure, details, svg, img, .quiz-options, .card, section, article'`. An element is a candidate root only if it matches `BLOCKS`, is not inside a `nav`, and is not inside `.gm-fav-ui`.
- **`candidateAt(target)`**: walk `target` and its ancestors to the first block; `null` when the walk hits `body` first, when any ancestor is a `nav`, or when the target is inside the picker's own UI. A heading (`h1`–`h6`) returns `groupFor(heading)`; anything else returns `[element]`.
- **`groupFor(heading)`**: the heading plus its following element siblings until (not including) the next sibling heading whose level is ≤ the heading's level, or the end of the parent.
- **`widen()`**: from the current candidate's first node, walk up to the next ancestor matching `BLOCKS` (not `nav`, not `body`); `false` (no change) when the current first node itself matches `.card, section, article`, or when there is no such ancestor. Pushes the previous candidate on a climb stack. `narrow()`: pops the stack when it has entries; otherwise descends to the candidate's first `BLOCKS` descendant if any (a heading group has none) — `false` when nothing to do. Buttons reflect the two `false`s as `disabled`.
- **Label** (`labelFor`): `table` → `table · N rows` (N = `rows.length`); `.card` → `card · <h2 text>` or `card` without an `h2`; heading group → `section · <heading text>`; `section`/`article` → `section · <first heading text>` or `section`; `pre` → `code`; `svg`, `img`, `figure` → `diagram`; `ul`/`ol`/`dl` → `list · N items`; `blockquote` → `quote`; `details` → `details`; `.quiz-options` → `quiz options`; `p` → `paragraph`.
- **Picking**: `enter()` sets `aria-pressed="true"` and text `★`, mounts the outline and toolbar, binds: capture-phase `click` on the frame's `document` — when `candidateAt(target)` is non-null, `preventDefault`, `stopPropagation`, `setCandidate`; when `null`, do nothing (the tap passes through to the deck's pager or the build's contents rail); `mousemove` on `document` → `setCandidate(candidateAt(target))` only when non-null; `keydown` on `window`: `Escape` → `leave()`, `ArrowUp` → `widen()`, `ArrowDown` → `narrow()`, `Enter` → same as the `Save` button (Task 5); other keys untouched; `scroll` and `resize` (passive) → reposition the outline. `leave()` unbinds all of these (track them in a `bound` list like the reporter), removes outline and toolbar, clears the candidate and the climb stack, resets the toggle to `☆`/`false`. Clicking the toggle toggles between the two. `setCandidate` positions `.gm-fav-outline` over the union of the nodes' `getBoundingClientRect()`s and writes `labelFor` into `.gm-fav-label`.
- **Outline and toolbar styles**: outline `position:fixed; pointer-events:none; border:2px solid var(--cyan,#55d0dd); background:rgba(85,208,221,.12); z-index:2147483000; border-radius:3px`. Toolbar `position:fixed; top:12px; left:50%; transform:translateX(-50%)`, `max-width:calc(100vw - 24px)`, themed with the same token-plus-fallback pairs the pill uses (`--fg`, `--panel`, `--line`), `font-family:inherit`.

- [ ] **Step 1: Write the failing cases** in `test/favorites-capture.test.ts`. Mount (framed, via the SHELL arrangement): after load the parent's `.topbar .crumbs` contains one `button.gm-fav-toggle` with text `☆`, `aria-pressed="false"`, and the shell document has a `style[data-gm-favorites-shell-style]`; unframed (top-level jsdom) → the toggle is in `document.body` with class `gm-fav-floating`; `stop()` removes it. Candidates (DECK-CAPTURE, top-level): `candidateAt(<td "mich">)` → `[table]`; `candidateAt(<p "lead">)` → `[p]`; `candidateAt(<button.quiz-option-btn "A">)` → `[div.quiz-options]`; `candidateAt(<button#next>)` → `null`; `candidateAt(<h2 "Die Tabelle">)` → `[h2, p "lead", table, blockquote]`; `labelFor([table])` → `table · 3 rows`; `labelFor([card 2])` → `card · Die Tabelle`; `labelFor(group of h2 "Die Tabelle")` → `section · Die Tabelle`; `labelFor([pre])` → `code`; `labelFor([p])` → `paragraph`. Widen/narrow: set `[table]`, `widen()` → `true`, candidate `[card 2]`; `widen()` again → `false`; `narrow()` → `true`, candidate `[table]`; `narrow()` again → `false` (a table has no `BLOCKS` descendant); on the h2 group, `narrow()` → `false`. DOC-CAPTURE: `candidateAt(<td "a">)` → `[table]`; `widen()` → `[section]` (the first one); `widen()` → `false`; `candidateAt(<a in nav.toc>)` → `null`; `candidateAt(<h3 "2. One turn">)` → `[h3, p "turn prose", table]` (stops before `h3#lifecycle--3-events`); `candidateAt(<h2 "The lifecycle">)` → `[h2, p, h3, p, table, h3, pre]`; `candidateAt(<h1 "Hooks guide">)` → `[h1, section, section]`. Picking (DECK-CAPTURE with the wired nav): `enter()` → toggle `★`/`aria-pressed="true"`, `.gm-fav-outline` and `.gm-fav-toolbar` present; dispatching a bubbling `click` on `<td "mich">` → candidate `[table]`, label `table · 3 rows`, outline present; clicking `button.quiz-option-btn "A"` while picking → candidate `[div.quiz-options]` **and** `#next` is still `disabled` on the quiz card (the answer handler did not run — navigate to `[3]` first by clicking `#next` three times *before* `enter()`); clicking `#next` while picking on a non-quiz card → the active card index advances (pass-through); `keydown Escape` → `picking()` false, no outline, toggle back to `☆`; `keydown ArrowUp` from `[table]` → `[card 2]`; `keydown ArrowDown` → `[table]`; after `leave()`, a `click` on `<td>` no longer changes anything and the deck's own handlers fire (no capture listener left — assert via `picking()` false and a spy on `stopPropagation` never called, or via `event.defaultPrevented === false`).
- [ ] **Step 2: Run the suite, confirm the new cases fail** — `pnpm exec jest test/favorites-capture.test.ts --runInBand`.
- [ ] **Step 3: Implement** in `assets/favorites.js`. Soft target: the whole file under ~700 lines including comments. Sections in this order — context, mount, block rules, candidate/group/widen/narrow, label, outline/toolbar, picking mode, bootstrap — each with a section comment like the reporter's `// ---- deck mode`.
- [ ] **Step 4: Run until green; then `pnpm test`.**
- [ ] **Step 5: Commit** — `feat(favorites): block picker inside the framed guide` — body: why the picker runs in the frame (the only document that sees the DOM), why taps that resolve to no block pass through.

---

### Task 5: Capture — derive, save, report

**Files:**
- Modify: `assets/favorites.js`
- Test: `test/favorites-capture.test.ts` (extend)

**Interfaces:**
- Consumes: Task 4's picker; `POST /api/favorites` (Task 1) with a `FavoriteDraft` body.
- Produces on `__gmFavorites`: `anchorFor(nodes: Element[]): GuidePosition | null`, `crumbFor(nodes: Element[]): string[]`, `titleFor(nodes: Element[], crumb: string[]): string`, `snapshot(nodes: Element[]): { html: string; text: string }`, `draftFor(nodes: Element[]): FavoriteDraft`, `openPanel(): void`, `save(): Promise<boolean>`. DOM: `div.gm-fav-panel.gm-fav-ui` with `input.gm-fav-title`, `textarea.gm-fav-note` (placeholder `why keep this?`), `button.gm-fav-confirm` ("Save"), `button.gm-fav-back` ("Back"), `span.gm-fav-status`.

**Behaviour:**

- **Deck** (`ctx.kind === 'deck'`): the containing card is `nodes[0].closest('.card')`. `anchorFor` = `{kind:'deck', cardIndex}` over the flat `.card` list in document order, plus `sectionId` and `cardOffset` when the card sits in a `section[id]` — the same derivation as `deckPosition` in `progress.js`, reimplemented here with a comment saying so and why (the deck.md contract is the source, not the reporter). No card → `null`. `crumbFor` = `[eyebrow text, h2 text]` where eyebrow is the card's `p.eyebrow` and h2 the card's first `h2`; the h2 entry is dropped when the block *is* the card or *contains* that h2 (a heading group starting at it); missing entries are dropped.
- **Doc** (`kind === 'doc'`): the anchor heading is the block's own first node when that node is an id'd `h1`–`h4`, else the nearest `h1, h2, h3, h4` with an `id` that precedes the block in document order; `anchorFor` = `{kind:'doc', anchorId}` or `{kind:'doc'}` when none. `crumbFor` = the chain above the block: walking the document's headings that precede the block, keep for each level the latest heading seen and drop deeper levels when a shallower one appears; emit outermost first; exclude any heading inside the block; an `h1` counts like any other level.
- **`titleFor(nodes, crumb)`**: the text of the first `h1`–`h6` inside the block (the block's own heading — for a group, its first node), else the last crumb entry, else `''`.
- **`snapshot(nodes)`**: clone each node, remove every `script` descendant, `html` = the clones' `outerHTML` joined — wrapped in one `<div>` when there is more than one node; `text` = the nodes' `textContent` joined with spaces, `\s+` collapsed to one space, trimmed.
- **`draftFor(nodes)`**: `{ guidePath, project, guideTitle }` from the context, `anchor`, `crumb`, `html`, `text`, `title: titleFor(...)`, `note: ''`.
- **Save flow**: `Save` (button or `Enter` while picking with a candidate) → `openPanel()`: the toolbar's controls are replaced by the panel, title input prefilled with `titleFor`, focus in the title. `Enter` in the title, or `gm-fav-confirm` → `save()`: build `draftFor(candidate)`, overwrite `title`/`note` from the inputs (title trimmed), `fetch('/api/favorites', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(draft) })`. Response `ok` → status text `saved ★`, then after 1500 ms `leave()`. Response not `ok`, or the fetch rejects → status text `couldn't save — try again`, panel and its values stay. `Back` → back to the toolbar with the candidate intact. `Escape` in the panel → `leave()`. Comment the failure branch: unlike a progress write, this is deliberate work.

- [ ] **Step 1: Write the failing cases.** Derivation (DECK-CAPTURE): `anchorFor([table])` → `{kind:'deck', cardIndex:2, sectionId:'s1', cardOffset:1}`; `anchorFor([card 0])` → `{kind:'deck', cardIndex:0}` exactly (no section keys); `anchorFor([pre])` → `{kind:'deck', cardIndex:5, sectionId:'s2', cardOffset:1}`; `crumbFor([table])` → `['§1 · Die Tabelle und der Artikel-Trick', 'Die Tabelle']`; `crumbFor([card 2])` → `['§1 · Die Tabelle und der Artikel-Trick']`; `crumbFor(groupFor(h2 "Die Tabelle"))` → `['§1 · Die Tabelle und der Artikel-Trick']`; `crumbFor([card 0])` → `[]`; `titleFor([card 2], crumb)` → `Die Tabelle`; `titleFor([table], ['…','Die Tabelle'])` → `Die Tabelle`; `titleFor([card 0], [])` → `''`; `snapshot([table]).text` → `Nominativ Akkusativ Dativ ich mich mir du dich dir`; `snapshot([card 6]).html` contains `Recap` and does not contain `<script`; `snapshot([table]).html` starts with `<table`. (DOC-CAPTURE): `anchorFor([table])` → `{kind:'doc', anchorId:'lifecycle--2-turn'}`; `anchorFor(groupFor(h3))` → `{kind:'doc', anchorId:'lifecycle--2-turn'}`; `anchorFor([p "answer intro"])` → `{kind:'doc', anchorId:'answer-channel'}`; `anchorFor(groupFor(h1))` → `{kind:'doc'}`; `crumbFor([table])` → `['The lifecycle', '2. One turn']`; `crumbFor(groupFor(h3))` → `['The lifecycle']`; `crumbFor(groupFor(h2 "The lifecycle"))` → `[]`; `crumbFor([p "answer intro"])` → `['The answer channel']`; `titleFor(groupFor(h3), ['The lifecycle'])` → `2. One turn`; `snapshot(groupFor(h3)).html` starts with `<div>` and contains `<h3`, `<table`, and not `3. Events`. Save flow (DECK-CAPTURE, `window.fetch` mocked, fake timers): `enter()`, click `<td "mich">`, click `.gm-fav-save` → `.gm-fav-panel` present, `.gm-fav-title` value `Die Tabelle`, `.gm-fav-note` placeholder `why keep this?`; type `Pronomen` into the note, click `.gm-fav-confirm` → exactly one fetch to `/api/favorites`, method `POST`, `Content-Type: application/json`, parsed body equals `{guidePath:'/g/deck.html', project:'german-study-partner', guideTitle:'Personalpronomen', anchor:{kind:'deck', cardIndex:2, sectionId:'s1', cardOffset:1}, crumb:['§1 · Die Tabelle und der Artikel-Trick','Die Tabelle'], html:<starts with '<table'>, text:'Nominativ Akkusativ Dativ ich mich mir du dich dir', title:'Die Tabelle', note:'Pronomen'}`; after the mock resolves `{ok:true}` the status reads `saved ★`; advancing 1500 ms → `picking()` false, no panel, toggle `☆`. Failure: mock resolves `{ok:false}` → status `couldn't save — try again`, panel still present, title input still `Die Tabelle`, `picking()` true; mock rejects → same. `Back` → toolbar present, candidate still `[table]`. `Enter` keydown in the title input → one fetch (the same as confirm). Editing the title to `  Tabelle  ` before confirm → body `title` is `Tabelle`.
- [ ] **Step 2: Run, confirm the new cases fail.**
- [ ] **Step 3: Implement** the derivation, panel and save flow in `assets/favorites.js`.
- [ ] **Step 4: Run until green; then `pnpm test`.**
- [ ] **Step 5: Commit** — `feat(favorites): derive anchor, crumb and snapshot; save from the frame` — body: why the failure branch keeps the panel open.

---

### Task 6: Favorites section — rail, landing, hook, view skeleton

**Files:**
- Modify: `client/src/components/SideRail.tsx` (`Section`, `TABS`), `client/src/App.tsx` (lazy view, guard, wrap class), `client/src/lib/settings.ts` (`LANDINGS` runtime list, line ~118), `client/src/components/settings/SettingsView.tsx` (`LANDINGS` rows, line ~29)
- Create: `client/src/hooks/useFavorites.ts`, `client/src/components/favorites/FavoritesView.tsx`, `client/src/components/favorites/FavoriteCard.tsx` (title, crumb link and foot only in this task — body and controls come in Tasks 7 and 8)
- Modify: `client/src/styles.css`
- Test: `test/side-rail.test.tsx`, `test/app-landing.test.tsx`, `test/settings-view.test.tsx`, `test/settings.test.ts` (edit); `test/favorites-view.test.tsx` (new)

**Interfaces:**
- Consumes: `Favorite` from `shared/types.ts`; `usePersistedState`; the `.guides-bar`, `.guides-tools`, `.guides-search`, `.guides-select`, `.guides-empty`, `.bay`, `.bay-h`, `.bay-name`, `.bay-count` classes.
- Produces: `Section = 'guides' | 'favorites' | 'settings'`; `useFavorites(): { favorites: Favorite[] | null; loading: boolean; error: boolean; refetch(): void; updateFavorite(id: string, patch: { title?: string; note?: string }): void; reorderBay(ids: string[]): void; removeFavorite(id: string): void }` — the three mutations apply locally first, send, and call `refetch()` when the response is not `ok` or the fetch rejects; `FavoritesView` default export; `FavoriteCard` props `{ favorite: Favorite; index: number; count: number; reorderable: boolean; onPatch(patch: { title?: string; note?: string }): void; onMove(to: 'up' | 'down' | 'top'): void; onRemove(): void; onDropOn(sourceId: string): void }`; `export function openHref(f: Favorite): string` in `FavoriteCard.tsx` — `/guide?p=` + `encodeURIComponent(guidePath)` + (`anchor` ? `&at=` + `encodeURIComponent(JSON.stringify(anchor))` : ``).

**Behaviour:**

- `SideRail`: `TABS` = Guides, Favorites, Settings, in that order.
- `App`: lazy `FavoritesView`; `current` maps `'settings'` and `'favorites'` to themselves and everything else to `'guides'`; the wrap gets `wide` only for guides.
- `settings.ts`: `LANDINGS = ['last', 'guides', 'favorites', 'settings']`. `SettingsView`'s `LANDINGS` gains `{ value: 'favorites', label: 'Favorites' }` between Guides and Settings.
- `useFavorites`: one `GET /api/favorites` on mount (with the alive guard the guides hook uses), `refetch` without it, same reasoning comments as `useGuides` (no polling; the tab remounts on every switch, which is when a new favorite could have appeared). No `message` listener — comment why (the spec's "No message is posted" paragraph).
- `FavoritesView`: `.guides-bar` with `.guides-title` `Favorites`, `.guides-tools` holding `input[type=search][aria-label="Search favorites"]` (placeholder `search favorites`) and `select[aria-label="Project"]` (`All projects` + one option per distinct `project` in the data, valued and labelled by the name — favorites carry names, not paths; comment the difference from the board). The select persists under `guide-manager.favProject`; the query is plain state. Loading → `.guides-empty` `loading…`; error → `.guides-empty` `couldn't load favorites`; no favorites at all → `.guides-empty` with the empty-state copy. Bays: group by `project` in the order the server returned; a bay header (`.bay-h` styled but a plain `div`, not a button — nothing folds here) shows `.bay-name` and `.bay-count` (the count of *shown* cards); inside, `div.fav-list` of `FavoriteCard`s in `order` ascending. The search matches case-insensitively against `title`, `note`, `text` and `crumb.join(' ')`; a bay with no match drops whole; the project select narrows to one bay, with the board's fail-open (an unmatched stored name reads as All). `reorderable` is `false` whenever the trimmed query is non-empty.
- `FavoriteCard` (this task): `article.fav-card` › `div.fav-head` › `span.fav-title` (text) + `span.pill.pill-<type>` where the type is `tutor` when `anchor.kind === 'deck'`, `study` when `'doc'`, and no pill when `anchor` is `null`; `a.fav-crumb[href=openHref][target=_top]` whose text is `guideTitle › crumb…` joined with ` › ` followed by ` ↗`; `div.fav-foot` with `createdAt.slice(0, 10)`.
- CSS: `.fav-list { display:flex; flex-direction:column; gap: var(--card-gap); max-width: 760px }`; `.fav-card` shares `.guides-card`'s surface (strip background, hairline border, inset edge) without the pointer cursor; `.fav-head` flex row; `.fav-crumb` mono 10.5px `--ink3`, underline on hover; `.fav-foot` like `.guides-card-meta`.

- [ ] **Step 1: Edit the rail/landing suites** — `test/side-rail.test.tsx`: three buttons, `Favorites` present; `test/app-landing.test.tsx`: a case *opens on Favorites when the landing override says so* (assert the active tab is `Favorites` and the bar title `Favorites` renders; mock `fetch` for `/api/favorites` with `[]`); `test/settings-view.test.tsx`: option values `['last', 'guides', 'favorites', 'settings']`, labels `['Last used', 'Guides', 'Favorites', 'Settings']`; `test/settings.test.ts`: the landing loop includes `'favorites'`.
- [ ] **Step 2: Write `test/favorites-view.test.tsx`** (jsdom; `fetch` mocked per URL — `GET /api/favorites` resolves FAVORITES-API). Cases for this task: two bay headers, `claude-agents-dashboard` (count `1`) then `german-study-partner` (count `3`), cards in the german bay in order `Die Tabelle`, `Quiz`, `Konnektoren`; empty response → the exact empty-state copy; rejecting fetch → `couldn't load favorites`; `f1`'s crumb link href is exactly `/guide?p=%2Fg%2Fpp.html&at=%7B%22kind%22%3A%22deck%22%2C%22cardIndex%22%3A2%2C%22sectionId%22%3A%22s1%22%2C%22cardOffset%22%3A1%7D` and its text `Personalpronomen › §1 · Die Tabelle › Die Tabelle ↗`; `f3`'s href is `/guide?p=%2Fg%2Fk.html` with no `at`; `f1` shows `pill-tutor`, `f4` `pill-study`, `f3` no pill; typing `weil` → only `Konnektoren` remains, german count `1`, no dashboard bay; `persons` → only `Die Tabelle` (note); `Nom` → `Die Tabelle` (text); `held` → only the dashboard bay; selecting `german-study-partner` hides the dashboard bay and `localStorage['guide-manager.favProject']` is `"german-study-partner"`; a stored `favProject` of `nope` renders both bays and the select shows `All projects`.
- [ ] **Step 3: Run the five suites, confirm failure** — `pnpm exec jest test/side-rail.test.tsx test/app-landing.test.tsx test/settings-view.test.tsx test/settings.test.ts test/favorites-view.test.tsx --runInBand`.
- [ ] **Step 4: Implement** the plumbing, hook, view, card skeleton and CSS.
- [ ] **Step 5: Run until green; `pnpm test`; `pnpm run typecheck`.** `test/app-projects.test.tsx` renders the whole app but finds the Guides tab by class and counts nothing, so it needs no change — a failure there means the rail's class names moved.
- [ ] **Step 6: Commit** — `feat(favorites): Favorites section with project bays, search and open-in-guide links`.

---

### Task 7: The snapshot body — sanitiser, snapshot stylesheet, quiz reveal

**Files:**
- Create: `client/src/lib/sanitize.ts`
- Modify: `client/src/components/favorites/FavoriteCard.tsx`, `client/src/styles.css`
- Test: `test/sanitize.test.ts` (new), `test/favorites-view.test.tsx` (extend)

**Interfaces:**
- Produces: `export function sanitizeSnapshot(html: string): string` — parses with `DOMParser` (`text/html`), operates on the body, returns `body.innerHTML`. `FavoriteCard` renders `div.fav-body` with `dangerouslySetInnerHTML` of the sanitised html, and a delegated `onClick` that toggles class `revealed` on the closest `.quiz-option` of the click target.

**Behaviour of `sanitizeSnapshot`:**

- Remove `script, iframe, object, embed, link, meta, form, base` elements.
- Remove `style` elements that are not inside an `svg`.
- On every element: remove attributes whose name starts with `on`, and `srcdoc`; remove `src` unless its trimmed value starts with `http://` or `https://`.
- Inside `svg`: keep `href` / `xlink:href` when `http(s)` or starting with `#`, else remove.
- `a` outside `svg`: `http(s)` href → set `target="_blank"` and `rel="noopener"`; any other href (or none) → replace the anchor with its own child nodes (unwrap).
- Comment the file with the boundary argument from the spec (render time is where it executes; server stores capped bytes; the frame's strip is hygiene).

**Snapshot stylesheet** (scoped under `.fav-body`): `contain:paint; overflow:auto; font-size:13px; line-height:1.5; color:var(--ink)`; `table {border-collapse:collapse; width:100%}`, `th, td {border:1px solid var(--hairline); padding:4px 8px; text-align:left}`, `th {color:var(--ink2)}`; `pre {overflow:auto; font-family:var(--mono); font-size:11.5px; background:var(--steel); padding:8px; border-radius:2px}`; `blockquote {border-left:2px solid var(--hairline2); margin:0; padding-left:10px; color:var(--ink2)}`; `svg, img {max-width:100%; height:auto}`; `details summary {cursor:pointer}`; `.eyebrow {font-family:var(--mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.09em; color:var(--ink3)}`; `.quiz-feedback {display:none}`; `.quiz-option.revealed .quiz-feedback {display:block}`; `.quiz-option-btn {font:inherit; cursor:pointer}`. Comment why `contain:paint` is there and why the quiz rules exist.

- [ ] **Step 1: Write `test/sanitize.test.ts`** (jsdom): `<p onclick="x()">hi<script>evil()</script></p>` → `<p>hi</p>`; `<a href="javascript:x()">j</a>` → `j` with no `a`; `<a href="#s1">s</a>` → `s`; `<a href="https://e.com">e</a>` → an `a` with `href="https://e.com"`, `target="_blank"`, `rel="noopener"`; `<style>p{}</style><p>x</p>` → `<p>x</p>`; `<svg><style>.n{fill:red}</style><use href="#m"></use><a href="javascript:x()"></a></svg>` → keeps the `style` and `use href="#m"`, drops the inner `a`'s href; `<img src="x.png">` → `img` without `src`; `<img src="https://e.com/x.png">` unchanged; `<iframe src="https://e.com"></iframe><p>k</p>` → `<p>k</p>`; `<div srcdoc="x" data-ok="1">d</div>` → keeps `data-ok`, drops `srcdoc`; `<details><summary>s</summary><p>b</p></details>` unchanged.
- [ ] **Step 2: Extend `test/favorites-view.test.tsx`**: `f4`'s `.fav-body` contains no `script`, its `p` has no `onclick`, the text `j` is present with no anchor around it, and the `e` anchor has `target="_blank"`; `f1`'s body contains a `table` with a cell `ich`; clicking `f2`'s `.quiz-option-btn` adds class `revealed` to its `.quiz-option` and a second click removes it.
- [ ] **Step 3: Run both, confirm failure.**
- [ ] **Step 4: Implement** `sanitize.ts`, the body in `FavoriteCard`, the stylesheet.
- [ ] **Step 5: Run until green; `pnpm test`.**
- [ ] **Step 6: Commit** — `feat(favorites): render sanitised snapshots; clipped quizzes stay answerable`.

---

### Task 8: Card controls — edit, reorder, delete

**Files:**
- Modify: `client/src/components/favorites/FavoriteCard.tsx`, `client/src/components/favorites/FavoritesView.tsx`, `client/src/hooks/useFavorites.ts` (the three mutations, if Task 6 stubbed them), `client/src/styles.css`
- Test: `test/favorites-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `PATCH /api/favorites/:id`, `PUT /api/favorites/order`, `DELETE /api/favorites/:id` (Task 1); the card props from Task 6.
- Produces: DOM — `span.fav-title[role=button]` → `input.fav-title-input` while editing; `div.fav-note[role=button]` (text or `add a note` when empty) → `textarea.fav-note-input` while editing; `span.fav-handle[draggable=true]` (`aria-hidden`); `button.fav-up` (`aria-label="Move up"`), `button.fav-down` (`Move down`), `button.fav-top` (`Move to top`), `button.fav-remove` (`aria-label="Remove"`, text `✕`, armed text `sure?`, class `armed`).

**Behaviour:**

- **Title edit**: click → input prefilled; `Enter` or blur with a non-empty trimmed value different from the current → `onPatch({ title })` and the card shows the new title at once; blur with an empty value, or `Escape` → revert, no request. **Note edit**: click the note (or `add a note`) → textarea; blur → `onPatch({ note })` when changed (an empty note is allowed and stored as `''`); `Escape` → revert.
- **Reorder**: `fav-up` disabled at `index === 0`, `fav-down` disabled at `index === count − 1`, `fav-top` disabled at `index === 0`. `onMove` → the view computes the bay's new id order (swap with neighbour / move to front), calls `reorderBay(ids)`. Drag: the handle is the drag source (`dataTransfer` `text/plain` = id); a card is a drop target (`onDragOver` preventDefault, `onDrop` → `onDropOn(sourceId)`), and the view moves the source to the target's index within the same bay — a drop from another bay is ignored. The handle exists only under `@media (pointer: fine)` (`display:none` by default). All controls are hidden when `reorderable` is `false`.
- **`reorderBay(ids)`** in the hook: assign `order = index` locally to those ids, re-sort, then `PUT /api/favorites/order` `{ids}`; on failure `refetch()`.
- **Delete**: first click arms (`sure?`, class `armed`, `aria-label="Confirm remove"`); second click → `onRemove()` → `removeFavorite(id)`: drop locally, `DELETE`, refetch on failure. The button disarms on `blur`. Comment: two-tap for the same reason the viewer's reset is.
- **`updateFavorite`** applies the patch locally, sends `PATCH`, refetches on failure.
- CSS: `.fav-ctl` shared quiet button style (like `.guide-viewer-reset` idle), `.fav-remove.armed` in `var(--bad, #c0392b)`, `.fav-note` italic `--ink2`, `.fav-note.empty` `--ink3`, inputs matching `.set-control input`.

- [ ] **Step 1: Extend `test/favorites-view.test.tsx`** (fetch mock records every call; `PATCH`/`PUT`/`DELETE` resolve `{ok:true}` unless a case says otherwise): clicking `Die Tabelle` shows an input valued `Die Tabelle`; changing it to `Pronomen` and pressing `Enter` → one `PATCH /api/favorites/f1` with body `{title:'Pronomen'}` and the card reads `Pronomen`; `Escape` mid-edit → title unchanged, no request; blur with `''` → unchanged, no request; clicking `f2`'s `add a note` → textarea; typing `x` and blurring → `PATCH /api/favorites/f2` `{note:'x'}` and the note reads `x`; `f1`'s `Move up` and `Move to top` are disabled, `f3`'s `Move down` is disabled; clicking `f1`'s `Move down` → `PUT /api/favorites/order` `{ids:['f2','f1','f3']}` and the german bay's cards read `Quiz`, `Die Tabelle`, `Konnektoren` before any response resolves; clicking `f3`'s `Move to top` → `{ids:['f3','f1','f2']}`; a `PUT` resolving `{ok:false}` → a second `GET /api/favorites` is issued and the order returns to the server's; with the query `Tabelle` typed, no `Move up`/`Move down`/`Move to top`/handle buttons exist; `f3`'s `✕` → reads `sure?`, no request; second click → `DELETE /api/favorites/f3`, `Konnektoren` gone, german count `2`; arming then blurring → `✕` again; dropping `f3` onto `f1` (dispatch `dragstart` on `f3`'s handle with a `dataTransfer` stub, `drop` on `f1`'s card) → `PUT` `{ids:['f3','f1','f2']}`.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement.** Soft target: `FavoriteCard.tsx` under ~300 lines, `FavoritesView.tsx` under ~350, comments included.
- [ ] **Step 4: Run until green; `pnpm test`; `pnpm run typecheck`.**
- [ ] **Step 5: Commit** — `feat(favorites): edit, reorder and remove favorites` — body: why reorder controls hide under a search, why delete is two-tap.

---

### Task 9: Docs, invariants, whole-stack verification

**Files:**
- Modify: `CLAUDE.md` (Layout and Invariants), `README.md` (Architecture, Repo layout)
- Modify: `docs/superpowers/specs/2026-09-08-favorites-design.md` only if an implementation decision above diverged from it — record the divergence in the spec, never silently

**Behaviour:**

- `CLAUDE.md` Layout: `server/src/` gains `favorites/` (`GET`/`POST`/`PATCH`/`PUT order`/`DELETE /api/favorites`); `client/src/` gains the Favorites view; `assets/` names the capture script beside the reading aid and the reporter.
- `CLAUDE.md` Invariants — add the five bullets from the spec's *Invariants to record* section, in this file's register (bold lead, reason, guard).
- `README.md` Architecture: the diagram's Mongo line reads `Mongo (reading progress, favorites)`; a bullet for `server/src/favorites/`; the `assets/` bullet names all three served scripts; the `client/src/` bullet names the Favorites tab; Repo layout table updated.

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Full verification** — `pnpm test`, `pnpm run typecheck`, `pnpm run build`. Expected: all green, a `dist/` build. Then start the stack (`pnpm run dev` and `pnpm run dev:web` on the host, or `pnpm run docker:up` — remember `docker compose restart client` for the new proxy entry) and walk the feature once by hand in a browser against a real registered deck: `☆` appears in the crumbs line; picking the pronoun table shows `table · 9 rows`; save with a note; the Favorites tab shows it under its project; `↓` moves it; the crumb link opens the deck on that card with `opened at your favorite` in the header; `✕` twice removes it. Record what you saw in the commit body. If you started a server to verify, stop it by the pid you recorded — never by pattern.
- [ ] **Step 3: Commit** — `docs: record the favorites layout, invariants and architecture`.
- [ ] **Step 4: Hand off** — the branch `feat/favorites` is ready for `superpowers:finishing-a-development-branch`. Do not merge, push, or open a PR from inside this plan.
