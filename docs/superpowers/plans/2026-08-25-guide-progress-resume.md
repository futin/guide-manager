# Resume Where You Left Off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a guide's real reading position, restore it on reopen, and give every guide a manual reset — so the board's long-dead `· 40%` / `· read` branch tells the truth and a phone session can be picked up where it stopped.

**Architecture:** A reporter script (`assets/progress.js`) is spliced into every framed guide document by `GET /asset`, exactly where the reading aid already is, so guides generated before this feature pick it up unchanged. It reports a type-aware position — card index for a tutor deck, heading anchor for a study build — to the existing `POST /api/progress`, and restores it by driving the guide's own controls rather than reimplementing them. A new `DELETE /api/progress` resets one guide.

**Tech Stack:** NestJS 11 + Mongoose (server), React 18 + Vite (client), plain classic-script JS for the injected asset, Jest + ts-jest + `mongodb-memory-server` + jsdom (tests). No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-25-guide-progress-resume-design.md`](../specs/2026-08-25-guide-progress-resume-design.md)

## Global Constraints

- **`assets/progress.js` is a classic script, not an ES module.** No `import`, no `export`, no top-level `await` — same rule as `assets/bionic.js`, and for the same reason: it is injected into arbitrary generated documents, some of which are opened over `file://`.
- **No DOM work at top level.** Everything runs from `init()`, bound to `DOMContentLoaded` (or called immediately if the document is already parsed, since the script is spliced at the end of `<body>`).
- **The file opens with the version header, verbatim:**
  `/* progress v1 — served by guide-manager; injected into framed guides by GET /asset */`
- **`injectProgressReporter` skips any document already carrying `progress vN`** — the same rule `injectReadingAid` applies to `bionic vN`, for the same reason: two copies would both report and both restore.
- **No new dependencies, no new CSS routes.** The pill's styles are inlined by `progress.js`.
- **Storage is the server, not `localStorage`.** Position must cross from the phone to the laptop; the reading aid's settings must not.
- **Wire field names, exact:** `percent`, `furthestPercent`, `position`, `opened`, `completed`, `guidePath`. `scrollPercent` is **removed**, not aliased.
- **Debounce values, exact:** deck 500ms, doc 1000ms. **Doc completion threshold: `percent >= 98`.**
- **`~/.guide-manager/registry.json` still has exactly one writer** (`bin/register.js`). Nothing in this plan writes it.
- **Every path `AssetsController` answers must appear in `vite.config.ts`'s proxy list and in `static.ts`'s exclusion list.** This plan adds one: `/progress.js`.
- Comments explain *why*, at length. Match the density of the file being edited (see `CLAUDE.md` → Conventions).
- Run `pnpm test` (jest, `--runInBand`) and `pnpm run typecheck` before each commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/types.ts` | `GuidePosition`; the reshaped `GuideProgress` |
| `server/src/progress/progress.schema.ts` | stored shape: `percent`, `furthestPercent`, `position` |
| `server/src/progress/progress.dto.ts` | parse/validate a write, including a position by `kind` |
| `server/src/progress/progress.service.ts` | conditional `openCount` increment, `$max` high-water mark, `reset` |
| `server/src/progress/progress.controller.ts` | `DELETE /api/progress` |
| `server/src/render/render.util.ts` | `injectProgressReporter(html, ctx)` — splice only |
| `server/src/render/render.controller.ts` | build the context, call the splice from `GET /asset` |
| `server/src/render/render.module.ts` | import `ProgressModule` |
| `server/src/render/assets.controller.ts` | serve `/progress.js` |
| `assets/progress.js` | the reporter: read context, restore, report, pill |
| `vite.config.ts`, `server/src/static.ts` | the two lists that must know every asset route |
| `client/src/hooks/useGuides.ts` | `refetch`, so a reset repaints the board |
| `client/src/components/guides/GuidesView.tsx` | card reads `furthestPercent`; viewer-head reset |
| `backlog/tasks/open/task-9-resume-where-you-left-off.md` | the repo's own item for this work |

Task order is dependency order: the wire shape, then the server, then the injection, then the reporter (doc mode, then deck mode, then the pill), then the client.

---

### Task 1: The wire shape and the stored shape

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/src/progress/progress.schema.ts`
- Modify: `server/src/progress/progress.dto.ts`
- Modify: `server/src/progress/progress.service.ts`
- Test: `test/progress.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `GuidePosition`, `GuideProgress` (with `guidePath`, `percent`, `furthestPercent`, `position`), `RecordProgressDto` (with `percent`, `position`, `opened`), `ProgressService.record`.

- [ ] **Step 1: Write the failing tests**

In `test/progress.test.ts`, replace every `scrollPercent:` in a POST body with `percent:` and every `body.scrollPercent` with `body.percent`, then add:

```ts
  it('increments openCount only for a write that says it is an open', async () => {
    await post({ guidePath: '/p/open.html', project: 'p', percent: 5, opened: true }).expect(201);
    const moved = await post({ guidePath: '/p/open.html', project: 'p', percent: 40 }).expect(201);
    // A position report is not a visit. Without this the reporter's own
    // debounced writes would make openCount a count of scroll events.
    expect((moved.body as GuideProgress).openCount).toBe(1);
    const reopened = await post({ guidePath: '/p/open.html', project: 'p', percent: 41, opened: true }).expect(201);
    expect((reopened.body as GuideProgress).openCount).toBe(2);
  });

  it('never lowers furthestPercent, and reports both numbers', async () => {
    await post({ guidePath: '/p/far.html', project: 'p', percent: 80, opened: true }).expect(201);
    const back = await post({ guidePath: '/p/far.html', project: 'p', percent: 10 }).expect(201);
    const body = back.body as GuideProgress;
    expect(body.percent).toBe(10);
    expect(body.furthestPercent).toBe(80);
  });

  it('round-trips a deck position', async () => {
    const res = await post({
      guidePath: '/p/deck.html',
      project: 'p',
      percent: 50,
      opened: true,
      position: { kind: 'deck', cardIndex: 12, sectionId: 's3', cardOffset: 2 }
    }).expect(201);
    expect((res.body as GuideProgress).position).toEqual({
      kind: 'deck',
      cardIndex: 12,
      sectionId: 's3',
      cardOffset: 2
    });
  });

  it('round-trips a doc position', async () => {
    const res = await post({
      guidePath: '/p/doc.html',
      project: 'p',
      percent: 33,
      opened: true,
      position: { kind: 'doc', anchorId: 'pipeline--why-a-queue' }
    }).expect(201);
    expect((res.body as GuideProgress).position).toEqual({ kind: 'doc', anchorId: 'pipeline--why-a-queue' });
  });

  it('drops a malformed position without dropping the write', async () => {
    // The percent is the useful half and arrives from the same event. Refusing
    // the whole write over an unusable position would lose the reader's place
    // to protect a field nothing reads yet.
    const res = await post({
      guidePath: '/p/bad.html',
      project: 'p',
      percent: 20,
      opened: true,
      position: { kind: 'wat', cardIndex: 'three' }
    }).expect(201);
    const body = res.body as GuideProgress;
    expect(body.position).toBeNull();
    expect(body.percent).toBe(20);
  });

  it('names the guide in every row it returns', async () => {
    await post({ guidePath: '/p/named.html', project: 'p', percent: 1, opened: true }).expect(201);
    const all = (await request(app.getHttpServer()).get('/api/progress').expect(200)).body as GuideProgress[];
    // Without guidePath the list route hands back rows with no way to tell
    // which guide each one belongs to.
    expect(all.some((p) => p.guidePath === '/p/named.html')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- progress.test.ts`
Expected: FAIL — `percent` undefined on the response body, `openCount` 2 where 1 is expected, `position`/`furthestPercent`/`guidePath` missing.

- [ ] **Step 3: Reshape the wire types**

In `shared/types.ts`, replace the `GuideProgress` interface with:

```ts
/**
 * Where the reader is inside one guide, in the terms that guide actually uses.
 *
 * A single percent cannot express either type honestly. A tutor deck's position
 * is discrete — card 12 of 30, one `.card.active` at a time — and a percent
 * round-trips to the wrong card. A study build is one long page, so a percent
 * *is* its position, but a stored one lands somewhere else the moment the reader
 * changes the text-size setting and the page reflows; a heading id does not move.
 */
export type GuidePosition =
  | {
      kind: 'deck';
      /** Index into the deck's flat, in-document-order card list. */
      cardIndex: number;
      /**
       * The `<section id>` the card sits in, when it sits in one — the deck's
       * opener and its recap card do not. Section ids are permanent by contract
       * (skills/tutor/references/deck.md §6: never reassigned, never reused), so
       * this pair survives an incremental regeneration that shifts every
       * absolute index after the section it rewrote. `cardIndex` is the fallback.
       */
      sectionId?: string;
      /** The card's offset among that section's own cards. */
      cardOffset?: number;
    }
  | {
      kind: 'doc';
      /** Id of the last heading scrolled past. Absent on a build with no id'd
       *  headings, where the percent is all there is. */
      anchorId?: string;
    };

/** Per-guide reading progress as the API publishes it. Null when never opened. */
export interface GuideProgress {
  /**
   * The guide this row belongs to. Required because `GET /api/progress` returns
   * a flat list, and a list of positions with no paths in it cannot be read.
   */
  guidePath: string;
  /**
   * Where the reader is, 0-100. Named for neither scrolling nor cards, because
   * it is derived from whichever one the guide has: a deck reports
   * `cardIndex / (total - 1)`, a doc its scroll offset.
   */
  percent: number;
  /**
   * The high-water mark, never lowered — see ProgressService.record's $max.
   * The board shows this one: glancing back at chapter one must not erase the
   * fact that you had reached chapter nine, and one number cannot say both.
   */
  furthestPercent: number;
  position: GuidePosition | null;
  completed: boolean;
  lastOpenedAt: string;
  openCount: number;
}
```

- [ ] **Step 4: Reshape the stored document**

In `server/src/progress/progress.schema.ts`, add the `SchemaTypes` import (`import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';` stays; add `import { SchemaTypes } from 'mongoose';`), rename the percent prop and add the two new ones:

```ts
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  percent: number;

  /**
   * Highest `percent` ever written for this guide. Maintained with $max rather
   * than by reading-then-writing, so two devices reporting out of order cannot
   * lower it — the whole point of the field is that it only ever climbs.
   *
   * Defaults to 0, which is what a row written before this field existed reads
   * as: "opened, position unknown". True, and not worth a migration.
   */
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  furthestPercent: number;

  /**
   * Mixed, not a nested schema: the shape is a discriminated union whose two
   * arms share no fields, and mongoose would have to be told about both arms
   * plus a discriminator to say something the DTO already validates on the way
   * in. Nothing queries inside this field — it is read whole and handed to the
   * reporter whole.
   */
  @Prop({ type: SchemaTypes.Mixed, default: null })
  position: GuidePosition | null;
```

Import the type: `import type { GuidePosition } from '../../../shared/types';`.

- [ ] **Step 5: Parse the new body**

Rewrite `server/src/progress/progress.dto.ts`'s interface and parser:

```ts
export interface RecordProgressDto {
  guidePath: string;
  project: string;
  percent: number;
  position: GuidePosition | null;
  /**
   * Set by the reporter's first write per page load and by nothing else.
   * `openCount` increments on this flag alone — every later write in the same
   * session reports a position, not a visit, and a count that included them
   * would be a count of scroll events.
   */
  opened?: true;
  /**
   * Undefined means "no opinion", not false. A write that omits it must leave a
   * stored `true` alone — finishing a guide is a fact, and a later glance at
   * page one is not evidence you unread it.
   */
  completed?: true;
}

const clamp = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number.parseFloat(String(n));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
};

const index = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Validate a position by its own `kind`, returning null for anything that does
 * not describe a place a guide has.
 *
 * A null here does not fail the write — see parseRecordProgress. The percent
 * arrives from the same event and is the half the board renders, so throwing
 * the reader's place away to reject a field nothing reads yet would be the
 * worse trade.
 */
function parsePosition(v: unknown): GuidePosition | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;

  if (p.kind === 'deck') {
    const cardIndex = index(p.cardIndex);
    if (cardIndex === null) return null;
    const out: GuidePosition = { kind: 'deck', cardIndex };
    if (typeof p.sectionId === 'string' && p.sectionId.length > 0) out.sectionId = p.sectionId;
    const offset = index(p.cardOffset);
    if (offset !== null) out.cardOffset = offset;
    return out;
  }

  if (p.kind === 'doc') {
    return typeof p.anchorId === 'string' && p.anchorId.length > 0
      ? { kind: 'doc', anchorId: p.anchorId }
      : { kind: 'doc' };
  }

  return null;
}

export function parseRecordProgress(body: unknown): RecordProgressDto | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.guidePath !== 'string' || b.guidePath.length === 0) return null;
  return {
    guidePath: b.guidePath,
    project: typeof b.project === 'string' ? b.project : '',
    percent: clamp(b.percent),
    position: parsePosition(b.position),
    opened: b.opened === true ? true : undefined,
    completed: b.completed === true ? true : undefined
  };
}
```

Add `import type { GuidePosition } from '../../../shared/types';` at the top.

- [ ] **Step 6: Teach the service the three new rules**

In `server/src/progress/progress.service.ts`, replace `record` and `toWire`:

```ts
  /**
   * Last-write-wins upsert on `guidePath`, with three deliberate exceptions.
   *
   * This is a single-user tool reached from a phone and a laptop, so the only
   * realistic conflict is the same guide open in two places — and there the
   * newer position is the one you want. But three fields must not follow that
   * rule:
   *
   * - `furthestPercent` climbs via $max, so an out-of-order write from a device
   *   sitting on page one cannot erase how far the other device got.
   * - `completed` is only ever set, never cleared, because the DTO models an
   *   omitted flag as "no opinion".
   * - `openCount` increments only for a write that declares itself an open.
   *   Every other write in a session is a position report, and counting those
   *   would turn a session counter into a scroll-event counter.
   */
  async record(dto: RecordProgressDto): Promise<GuideProgress> {
    const set: Record<string, unknown> = {
      project: dto.project,
      percent: dto.percent,
      lastOpenedAt: new Date()
    };
    if (dto.position) set.position = dto.position;
    if (dto.completed === true) set.completed = true;

    const update: UpdateQuery<ReadingProgressDocument> = {
      $set: set,
      $max: { furthestPercent: dto.percent }
    };
    if (dto.opened === true) update.$inc = { openCount: 1 };

    const doc = await this.model
      .findOneAndUpdate({ guidePath: dto.guidePath }, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      })
      .exec();
    return toWire(doc as ReadingProgressDocument);
  }
```

```ts
function toWire(doc: ReadingProgressDocument): GuideProgress {
  return {
    guidePath: doc.guidePath,
    percent: doc.percent,
    furthestPercent: doc.furthestPercent,
    position: doc.position ?? null,
    completed: doc.completed,
    lastOpenedAt: doc.lastOpenedAt.toISOString(),
    openCount: doc.openCount
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test -- progress.test.ts && pnpm run typecheck`
Expected: progress suite PASS. `typecheck` will still fail in `client/src/components/guides/GuidesView.tsx` (it reads `progress.scrollPercent`) — that is Task 8's job. Note the failure and move on; do not patch the client here.

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts server/src/progress test/progress.test.ts
git commit -m "feat(progress): type-aware position, high-water percent, honest open count"
```

---

### Task 2: Reset one guide

**Files:**
- Modify: `server/src/progress/progress.service.ts`
- Modify: `server/src/progress/progress.controller.ts`
- Test: `test/progress.test.ts`

**Interfaces:**
- Consumes: Task 1's `ProgressService`, `GuideProgress`.
- Produces: `ProgressService.reset(guidePath: string): Promise<void>`; `DELETE /api/progress?guidePath=<abs>` → `204`.

- [ ] **Step 1: Write the failing test**

```ts
  it('resets one guide by deleting its row', async () => {
    await post({ guidePath: '/p/reset.html', project: 'p', percent: 90, opened: true }).expect(201);
    await request(app.getHttpServer()).delete('/api/progress?guidePath=%2Fp%2Freset.html').expect(204);
    const all = (await request(app.getHttpServer()).get('/api/progress').expect(200)).body as GuideProgress[];
    // Deleted, not zeroed: "start over" means a guide you have not read, and a
    // surviving openCount: 7 beside a zeroed position is a state the board
    // would have to explain. Absence already renders correctly.
    expect(all.some((p) => p.guidePath === '/p/reset.html')).toBe(false);
  });

  it('refuses a reset with no guide named', async () => {
    await request(app.getHttpServer()).delete('/api/progress').expect(400);
  });

  it('answers a reset for a guide with no row', async () => {
    // Idempotent on purpose: the pill's "start over" fires without knowing
    // whether anything was ever stored, and a 404 there would be noise.
    await request(app.getHttpServer()).delete('/api/progress?guidePath=%2Fp%2Fnever.html').expect(204);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- progress.test.ts`
Expected: FAIL — 404 on `DELETE /api/progress` (no such route).

- [ ] **Step 3: Add the service method**

In `server/src/progress/progress.service.ts`:

```ts
  /**
   * Forget a guide entirely.
   *
   * A delete rather than a field-clearing update, and idempotent: the caller —
   * the viewer's reset button, or the pill's "start over" — does not know
   * whether a row exists, and does not need to.
   */
  async reset(guidePath: string): Promise<void> {
    await this.model.deleteOne({ guidePath }).exec();
  }
```

- [ ] **Step 4: Add the route**

In `server/src/progress/progress.controller.ts`, extend the imports to
`import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';` and add:

```ts
  /**
   * Reset one guide. The path travels as a query parameter rather than a body
   * because a DELETE with a body is awkward for every client that has to send
   * it — `fetch` in the injected reporter included — and the path is not a
   * secret: it is already the `p` of the /guide URL the reader is looking at.
   */
  @Delete()
  @HttpCode(204)
  async reset(@Query('guidePath') guidePath?: string): Promise<void> {
    if (!guidePath) throw new BadRequestException('guidePath is required');
    await this.progress.reset(guidePath);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- progress.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/progress test/progress.test.ts
git commit -m "feat(progress): DELETE /api/progress resets one guide"
```

---

### Task 3: Splice the reporter into a framed guide

**Files:**
- Modify: `server/src/render/render.util.ts`
- Modify: `server/src/render/assets.controller.ts`
- Modify: `vite.config.ts`
- Modify: `server/src/static.ts`
- Modify: `test/vite-proxy.test.ts`
- Create: `assets/progress.js` (header + no-op `init` only; Tasks 4-6 fill it in)
- Test: `test/progress-inject.test.ts`

**Interfaces:**
- Consumes: Task 1's `GuideProgress`.
- Produces: `ProgressContext { guidePath: string; project: string; kind: 'deck' | 'doc'; progress: GuideProgress | null }`; `injectProgressReporter(html: string, ctx: ProgressContext): string`; `GET /progress.js`.

- [ ] **Step 1: Write the failing test**

Create `test/progress-inject.test.ts`:

```ts
import { injectProgressReporter, injectReadingAid } from '../server/src/render/render.util';
import type { ProgressContext } from '../server/src/render/render.util';

const ctx: ProgressContext = {
  guidePath: '/g/deck.html',
  project: 'demo',
  kind: 'deck',
  progress: null
};

const page = (body = '<p>hi</p>') =>
  `<!doctype html><html><head><title>G</title></head><body>${body}</body></html>`;

/**
 * The framed-guide half of progress tracking.
 *
 * A guide is served verbatim into an iframe, so nothing on the page shell can
 * see its cards or its scroll position. The reporter has to be spliced into the
 * framed document itself — and it is served from this repo rather than vendored
 * per guide, so a build generated before this feature existed reports and
 * restores without being regenerated.
 */
describe('injectProgressReporter', () => {
  it('inlines the context and loads the reporter at the end of the body', () => {
    const out = injectProgressReporter(page(), ctx);

    expect(out).toContain('<script type="application/json" id="gm-progress">');
    expect(out).toContain('<script src="/progress.js"></script>');
    // The context must be parsed before the script that reads it runs, and the
    // script must find the document's own cards already in the DOM.
    expect(out.indexOf('gm-progress')).toBeLessThan(out.indexOf('/progress.js'));
    expect(out.indexOf('<p>hi</p>')).toBeLessThan(out.indexOf('/progress.js'));
    expect(out.indexOf('/progress.js')).toBeLessThan(out.indexOf('</body>'));
  });

  it('round-trips the context as JSON', () => {
    const out = injectProgressReporter(page(), { ...ctx, kind: 'doc' });
    const json = /id="gm-progress">([\s\S]*?)<\/script>/.exec(out)?.[1] ?? '';
    expect(JSON.parse(json)).toEqual({
      guidePath: '/g/deck.html',
      project: 'demo',
      kind: 'doc',
      progress: null
    });
  });

  it('escapes a closing script tag inside the context', () => {
    // A guide path can hold anything a filesystem allows. Left raw, a path
    // containing </script> would end the JSON block early and drop the rest of
    // the context into the document as markup.
    const out = injectProgressReporter(page(), { ...ctx, guidePath: '/g/</script><b>x</b>.html' });
    expect(out).not.toContain('</script><b>x</b>');
    const json = /id="gm-progress">([\s\S]*?)<\/script>/.exec(out)?.[1] ?? '';
    expect((JSON.parse(json) as { guidePath: string }).guidePath).toBe('/g/</script><b>x</b>.html');
  });

  it('skips a document that already carries a reporter', () => {
    // Two copies would both restore and both report: each closes over its own
    // pending-target state, so one would fight the other's replay.
    const vendored = page('<p>hi</p><script>/* progress v1 */</script>');
    expect(injectProgressReporter(vendored, ctx)).toBe(vendored);
  });

  it('composes with the reading aid without either clobbering the other', () => {
    const out = injectProgressReporter(injectReadingAid(page()), ctx);
    expect(out).toContain('/bionic.js');
    expect(out).toContain('/progress.js');
    expect(out).toContain('/bionic.css');
  });

  it('still injects into a document with no closing body tag', () => {
    // Hand-written and older generated builds are not reliably well-formed, and
    // dropping the reporter over a missing tag would put back the silence this
    // exists to fix.
    const out = injectProgressReporter('<html><body><p>hi</p>', ctx);
    expect(out).toContain('/progress.js');
  });
});
```

Add to `test/vite-proxy.test.ts`'s first assertion:

```ts
    expect(assetRoutes().sort()).toEqual(['/bionic.css', '/bionic.js', '/progress.js', '/style.css', '/theme.css']);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- progress-inject.test.ts vite-proxy.test.ts`
Expected: FAIL — `injectProgressReporter` is not exported; the proxy suite reports `/progress.js` missing from the controller's routes.

- [ ] **Step 3: Write the splice**

In `server/src/render/render.util.ts`, add below `injectReadingAid`:

```ts
/**
 * What the injected reporter needs to know about the guide it is running in.
 *
 * Inlined by the server rather than fetched by the reporter: /asset has already
 * resolved this request through the registry allowlist, so it knows the absolute
 * path, the project and the type without being asked. A fetch from inside the
 * frame would put a round trip in front of the restore, which the reader would
 * see as the guide jumping after it had already painted.
 */
export interface ProgressContext {
  guidePath: string;
  project: string;
  /** Which restore strategy applies — taken from the registry entry's type, not
   *  sniffed from the markup, because the registry is the authority on what a
   *  file is and bin/register.js is what enforces it. */
  kind: 'deck' | 'doc';
  /** What is already stored, so the reporter can restore on its first frame. */
  progress: GuideProgress | null;
}

const REPORTER_JS = '<script src="/progress.js"></script>';

/**
 * Encode a context for an inline `application/json` block.
 *
 * `<` is escaped to its JSON unicode form, which parses back identically and
 * cannot end the block early. A guide path is a filesystem path — it can hold
 * `</script>`, and left raw that would close the block and spill the rest of the
 * context into the document as markup.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Splice the progress reporter into a generated guide document.
 *
 * Same splice point, and the same reasoning, as injectReadingAid: the guide's
 * cards and scroll position live inside the iframe, where a script on the host
 * document cannot reach them. Serving the reporter from here rather than
 * vendoring it means one implementation governs every guide the app frames — a
 * build from before this feature picks it up, and a fix reaches all of them
 * without regenerating anything.
 *
 * Skipped outright for a document that already carries a `progress vN` header.
 * Two reporters would each restore and each report, and each closes over its own
 * pending-replay state — so one would drive the deck forward while the other
 * read the result as the reader navigating and cancelled itself.
 */
export function injectProgressReporter(html: string, ctx: ProgressContext): string {
  if (/progress v\d+/i.test(html)) return html;
  const blob = `<script type="application/json" id="gm-progress">${jsonForScript(ctx)}</script>`;
  return splice(html, /<\/body\s*>/i, blob + REPORTER_JS, false);
}
```

Extend the type import at the top of the file to
`import type { GuideMeta, GuideProgress } from '../../../shared/types';`.

- [ ] **Step 4: Serve the file, and tell both lists about it**

In `server/src/render/assets.controller.ts`, update the header comment ("The four files…" → "The five files…") and add:

```ts
  @Get('progress.js')
  progressJs(@Res() res: Response): void {
    this.sendFile(res, join('assets', 'progress.js'), MIME['.js']);
  }
```

In `vite.config.ts`, add to `proxy`: `'/progress.js': { target: API_TARGET },`

In `server/src/static.ts`, add `'/progress.js'` to the `exclude` array.

- [ ] **Step 5: Create the asset stub**

Create `assets/progress.js`:

```js
/* progress v1 — served by guide-manager; injected into framed guides by GET /asset */
(function () {
  'use strict';

  // Everything runs from init(), never at top level: the file is spliced into
  // arbitrary generated documents and has to survive a context that supplies
  // nothing — which is also what makes it loadable in a bare node:vm sandbox
  // for the pure-logic tests.
  function init() {}

  // The script is spliced at the end of <body>, so the document is usually
  // already parsed by the time it runs — but a build that loads it earlier must
  // still work, so both paths are covered.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (typeof globalThis !== 'undefined') globalThis.__gmProgress = { init: init };
})();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- progress-inject.test.ts vite-proxy.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/render/render.util.ts server/src/render/assets.controller.ts server/src/static.ts vite.config.ts assets/progress.js test/progress-inject.test.ts test/vite-proxy.test.ts
git commit -m "feat(render): serve and splice the progress reporter"
```

---

### Task 4: Call the splice from GET /asset

**Files:**
- Modify: `server/src/render/render.controller.ts`
- Modify: `server/src/render/render.module.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `injectProgressReporter`, `ProgressContext`, `ProgressService.find`, `RegistryService.guideMeta`.
- Produces: `GET /asset` returns a registered guide with the reporter and its context inlined; anything else verbatim.

- [ ] **Step 1: Write the failing test**

Read `test/render.test.ts` first and follow its existing harness for building the controller with a stub registry. Add a describe block:

```ts
describe('GET /asset progress reporter', () => {
  it('injects the reporter and the context for a registered guide', async () => {
    // …build the app with a registry stub whose guideMeta returns
    // { title: 'Deck', type: 'tutor', project: 'demo' } and a ProgressService
    // stub whose find() resolves an empty Map…
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${encodeURIComponent(deckPath)}`)
      .expect(200);
    expect(res.text).toContain('<script src="/progress.js"></script>');
    const json = /id="gm-progress">([\s\S]*?)<\/script>/.exec(res.text)?.[1] ?? '';
    expect(JSON.parse(json)).toMatchObject({ kind: 'deck', project: 'demo', guidePath: deckPath });
  });

  it('maps a study guide to doc mode', async () => {
    // registry stub returns type: 'study'
    const res = await request(app.getHttpServer()).get(`/asset?p=${encodeURIComponent(studyPath)}`).expect(200);
    const json = /id="gm-progress">([\s\S]*?)<\/script>/.exec(res.text)?.[1] ?? '';
    expect((JSON.parse(json) as { kind: string }).kind).toBe('doc');
  });

  it('hands the stored progress to the frame', async () => {
    // ProgressService stub find() resolves new Map([[deckPath, stored]]) where
    // stored is a full GuideProgress with position { kind: 'deck', cardIndex: 7 }
    const res = await request(app.getHttpServer()).get(`/asset?p=${encodeURIComponent(deckPath)}`).expect(200);
    const json = /id="gm-progress">([\s\S]*?)<\/script>/.exec(res.text)?.[1] ?? '';
    expect((JSON.parse(json) as { progress: { position: { cardIndex: number } } }).progress.position.cardIndex).toBe(7);
  });

  it('leaves a sibling HTML file that is not a registered guide alone', async () => {
    // A file served merely because it sits next to a guide has no registry
    // entry, so guideMeta returns no type. It is not a guide, there is nothing
    // to report about it, and its path is not one the board would ever show.
    const res = await request(app.getHttpServer()).get(`/asset?p=${encodeURIComponent(siblingPath)}`).expect(200);
    expect(res.text).not.toContain('/progress.js');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- render.test.ts`
Expected: FAIL — the response holds no `/progress.js`.

- [ ] **Step 3: Wire the controller**

In `server/src/render/render.controller.ts`: import `injectProgressReporter` alongside the other render utils, import `ProgressService`, take it in the constructor, and make `asset` async:

```ts
  constructor(
    private readonly registry: RegistryService,
    private readonly progress: ProgressService
  ) {}
```

```ts
  @Get('asset')
  async asset(@Query('p') requested: string, @Res() res: Response): Promise<void> {
    const real = this.resolve(requested);
    const ext = extname(real).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
      const meta = this.registry.guideMeta(real);
      let html = injectReadingAid(readFileSync(real, 'utf8'));
      /*
        Only a *registered* guide gets the reporter. A sibling HTML file served
        because it sits beside one has no registry entry — so no type to pick a
        restore strategy from, and no card on the board for a position to ever
        be shown on. `meta.type`'s absence is exactly that condition.

        The stored progress is read here rather than fetched by the frame: this
        request has already been resolved through the allowlist, so the path is
        known, and a fetch from inside the frame would put a round trip in front
        of the restore — visible as the guide jumping after first paint.
      */
      if (meta.type) {
        const stored = await this.progress.find([real]);
        html = injectProgressReporter(html, {
          guidePath: real,
          project: meta.project ?? '',
          kind: meta.type === 'tutor' ? 'deck' : 'doc',
          progress: stored.get(real) ?? null
        });
      }
      res.type(MIME['.html']).send(html);
      return;
    }
    res.type(MIME[ext] || 'application/octet-stream').send(readFileSync(real));
  }
```

In `server/src/render/render.module.ts`, add `ProgressModule` to `imports`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- render.test.ts render.e2e.test.ts assets.e2e.test.ts`
Expected: PASS. If an e2e suite builds `RenderController` directly, give it the same `ProgressService` it now requires.

- [ ] **Step 5: Commit**

```bash
git add server/src/render test/render.test.ts
git commit -m "feat(render): hand every framed guide its own progress context"
```

---

### Task 5: The reporter — doc mode

**Files:**
- Modify: `assets/progress.js`
- Test: `test/progress-reporter-doc.test.ts`

**Interfaces:**
- Consumes: the `#gm-progress` context blob; `POST /api/progress`; `DELETE /api/progress`.
- Produces on `globalThis.__gmProgress`: `readContext(): ProgressContext | null`, `docAnchor(root, scrollY): string | null`, `docPercent(scrollY, viewport, height): number`, `restoreDoc(ctx): boolean`, `report(patch)`, `reset()`, `init()`.

- [ ] **Step 1: Write the failing test**

Create `test/progress-reporter-doc.test.ts` with a `@jest-environment jsdom` docblock (the convention in `test/guides-view.test.tsx`), loading the asset the way `test/bionic.test.ts` does — read the file and run it in the jsdom window via `eval` so it sees a real DOM:

```ts
/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'progress.js'), 'utf8');

function load(html: string, ctx: unknown) {
  document.body.innerHTML = html;
  if (ctx) {
    const blob = document.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-progress';
    blob.textContent = JSON.stringify(ctx);
    document.body.appendChild(blob);
  }
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  return (window as unknown as { __gmProgress: Record<string, Function> }).__gmProgress;
}

const DOC = `
  <h2 id="intro">Intro</h2><p>one</p>
  <h2 id="pipeline">Pipeline</h2><p>two</p>
  <h3 id="pipeline--why">Why</h3><p>three</p>
`;

describe('progress reporter — doc mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  it('does nothing at all without a context blob', () => {
    const api = load(DOC, null);
    expect(api.readContext()).toBeNull();
    // The reporter is injected into whatever the server hands the frame. A
    // document with no context is one nobody asked it to track, and it must not
    // post, decorate, or throw.
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('reports the last heading scrolled past, not the next one', () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    // Stub each heading's offsetTop — jsdom lays nothing out, so the geometry
    // has to be supplied rather than measured.
    stubTops({ intro: 0, pipeline: 900, 'pipeline--why': 1400 });
    expect(api.docAnchor(document, 1000)).toBe('pipeline');
    expect(api.docAnchor(document, 100)).toBe('intro');
  });

  it('computes a percent from the scrolled distance, not the raw offset', () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    expect(api.docPercent(0, 800, 2400)).toBe(0);
    expect(api.docPercent(800, 800, 2400)).toBe(50);
    // The last screenful is the end of the document, not 67% of it: the
    // scrollable distance is height - viewport, and a reader who cannot scroll
    // further has finished.
    expect(api.docPercent(1600, 800, 2400)).toBe(100);
  });

  it('treats a document shorter than the viewport as finished', () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    // Zero scrollable distance must not divide by zero — and a page that fits
    // on screen has been read as far as it can be.
    expect(api.docPercent(0, 800, 600)).toBe(100);
  });

  it('restores to a stored anchor', () => {
    const api = load(DOC, {
      guidePath: '/g/s.html',
      project: 'p',
      kind: 'doc',
      progress: { percent: 40, furthestPercent: 40, position: { kind: 'doc', anchorId: 'pipeline' } }
    });
    const target = document.getElementById('pipeline') as HTMLElement;
    const spy = jest.fn();
    target.scrollIntoView = spy;
    expect(api.restoreDoc()).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to the percent when the stored anchor is gone', () => {
    const api = load(DOC, {
      guidePath: '/g/s.html',
      project: 'p',
      kind: 'doc',
      progress: { percent: 50, furthestPercent: 50, position: { kind: 'doc', anchorId: 'renamed-chapter' } }
    });
    const spy = jest.fn();
    window.scrollTo = spy;
    // A heading id is derived from a slug, so renaming a chapter retires its
    // anchor. The percent is coarse but it is never stale in that way.
    expect(api.restoreDoc()).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('does not restore, or claim to, when nothing is stored', () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    expect(api.restoreDoc()).toBe(false);
  });

  it('posts the open exactly once on init, with opened: true', () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    api.init();
    const calls = (window.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/api/progress');
    const body = JSON.parse(calls[0][1].body as string);
    expect(body).toMatchObject({ guidePath: '/g/s.html', project: 'p', opened: true });
    expect(body.position.kind).toBe('doc');
  });

  it('debounces scroll reports and omits opened on them', () => {
    jest.useFakeTimers();
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    api.init();
    (window.fetch as jest.Mock).mockClear();
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(window.fetch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse((window.fetch as jest.Mock).mock.calls[0][1].body as string).opened).toBeUndefined();
    jest.useRealTimers();
  });

  it('flushes a pending report when the tab is hidden', () => {
    jest.useFakeTimers();
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    api.init();
    (window.fetch as jest.Mock).mockClear();
    window.dispatchEvent(new Event('scroll'));
    // The phone case: the tab is backgrounded rather than closed, so a purely
    // debounced write is simply lost.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect((window.fetch as jest.Mock).mock.calls[0][1].keepalive).toBe(true);
    jest.useRealTimers();
  });

  it('marks a doc read at the bottom and never unmarks it', () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    api.init();
    (window.fetch as jest.Mock).mockClear();
    api.report({ percent: 99 });
    expect(JSON.parse((window.fetch as jest.Mock).mock.calls[0][1].body as string).completed).toBe(true);
    api.report({ percent: 12 });
    // completed is only ever set: the server treats an omitted flag as "no
    // opinion", so a glance back at page one must send nothing rather than false.
    expect(JSON.parse((window.fetch as jest.Mock).mock.calls[1][1].body as string).completed).toBeUndefined();
  });

  it('swallows a failed write', async () => {
    const api = load(DOC, { guidePath: '/g/s.html', project: 'p', kind: 'doc', progress: null });
    (window.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('offline')));
    // The reading session is the point. An unhandled rejection in a guide's own
    // document is a console full of noise over a lost byte of bookkeeping.
    expect(() => api.init()).not.toThrow();
    await Promise.resolve();
  });
});

/** jsdom lays nothing out, so offsetTop has to be supplied per element. */
function stubTops(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    Object.defineProperty(document.getElementById(id) as HTMLElement, 'offsetTop', {
      value: top,
      configurable: true
    });
  }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- progress-reporter-doc.test.ts`
Expected: FAIL — `api.readContext is not a function`.

- [ ] **Step 3: Implement doc mode**

Fill in `assets/progress.js`. Keep every function pure where it can be — the geometry helpers take their inputs rather than reading globals, which is what makes them testable without a layout engine.

```js
  var DEBOUNCE = { deck: 500, doc: 1000 };
  var DONE_AT = 98; // A footer the reader never scrolls into view must not
                    // cost them the completion.

  var ctx = null;
  var state = { percent: 0, position: null, completed: false, timer: null, dirty: false };

  function readContext() {
    var el = typeof document !== 'undefined' && document.getElementById('gm-progress');
    if (!el) return null;
    try {
      var parsed = JSON.parse(el.textContent || 'null');
      return parsed && typeof parsed.guidePath === 'string' ? parsed : null;
    } catch (e) {
      // A malformed blob means the frame cannot know which guide it is. Silence
      // is the only correct behaviour: reporting against a guessed path would
      // write one guide's position onto another.
      return null;
    }
  }

  function docPercent(scrollY, viewport, height) {
    var scrollable = height - viewport;
    if (scrollable <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((scrollY / scrollable) * 100)));
  }

  function docAnchor(root, scrollY) {
    var headings = root.querySelectorAll('h1[id], h2[id], h3[id], h4[id]');
    var found = null;
    for (var i = 0; i < headings.length; i += 1) {
      // The heading whose top is at or above the fold, taking the last such —
      // the one the reader has already passed, not the one they are about to
      // reach. A tolerance of one line keeps a heading pinned exactly at the
      // fold from flipping between the two.
      if (headings[i].offsetTop <= scrollY + 24) found = headings[i].id;
      else break;
    }
    return found;
  }

  function report(patch) {
    if (!ctx) return;
    var body = {
      guidePath: ctx.guidePath,
      project: ctx.project,
      percent: typeof patch.percent === 'number' ? patch.percent : state.percent,
      position: patch.position || state.position
    };
    if (patch.opened) body.opened = true;
    // Only ever set, never cleared — the server reads an omitted flag as "no
    // opinion" and leaves a stored true alone.
    if (!state.completed && body.percent >= DONE_AT) {
      state.completed = true;
      body.completed = true;
    }
    state.percent = body.percent;
    state.position = body.position;
    send('POST', '/api/progress', body);
  }

  function send(method, url, body) {
    try {
      var init = { method: method, keepalive: true };
      if (body) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
      }
      var p = fetch(url, init);
      // Fire and forget, but never unhandled: a rejected promise from a guide's
      // own document would fill the console over a lost byte of bookkeeping.
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function reset() {
    if (!ctx) return;
    send('DELETE', '/api/progress?guidePath=' + encodeURIComponent(ctx.guidePath));
  }
```

`restoreDoc`, the scroll listener, the debounce (`schedule(kind)`), and the `visibilitychange` / `pagehide` flush follow the same shape — see the test for each one's exact contract. `restoreDoc` returns `true` only when it actually moved the page, because Task 6's pill is shown on exactly that signal.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- progress-reporter-doc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/progress.js test/progress-reporter-doc.test.ts
git commit -m "feat(progress): report and restore a study build's position"
```

---

### Task 6: The reporter — deck mode

**Files:**
- Modify: `assets/progress.js`
- Test: `test/progress-reporter-deck.test.ts`

**Interfaces:**
- Consumes: Task 5's `report`, `state`, `readContext`.
- Produces on `globalThis.__gmProgress`: `deckCards(root)`, `deckPosition(cards, index)`, `deckTarget(cards, position)`, `restoreDeck()`, plus the pending-target machinery.

- [ ] **Step 1: Write the failing test**

Create `test/progress-reporter-deck.test.ts`, jsdom, with a fixture deck that mirrors `skills/tutor/references/deck.md`: a flat card list where exactly one card carries `.active`, section wrappers with permanent ids, one gating quiz card, and a persistent `Next`/`Back` pair whose handlers are wired in the fixture the way a generated deck wires its own.

```ts
/**
 * @jest-environment jsdom
 */
```

Cases, each asserting the reason it exists:

1. `deckCards` collects every `.card` in document order, across section wrappers — a deck's navigation ignores its wrappers (`deck.md` §1), so the reporter's index must be the flat one.
2. `deckPosition(cards, 5)` returns `{ kind: 'deck', cardIndex: 5, sectionId: 's2', cardOffset: 1 }` for a card inside `<section id="s2">`.
3. `deckPosition` omits `sectionId`/`cardOffset` for the opener and the recap card, which sit outside every wrapper.
4. `deckTarget` prefers the section-relative pair: given `{ cardIndex: 99, sectionId: 's2', cardOffset: 1 }` against a deck whose absolute indexes have all shifted, it returns the index of `s2`'s second card — the pair is what survives an incremental regeneration.
5. `deckTarget` falls back to `cardIndex`, clamped to the last card, when the stored `sectionId` is not in the document.
6. `restoreDeck` reaches the target by clicking the deck's own `Next`, and the deck's own state follows: after restoring to card 4, one click of `Back` shows card 3 — not card 1, which is what direct `.active` manipulation would have produced.
7. A `Next` that is `disabled` stops the replay where it is, and the pending target survives: answering the quiz (which the fixture's own handler un-disables) drives the replay onward to the target with no further input.
8. A `Back` click during a pending replay cancels it — a reader taking control must not be fought.
9. No write is posted for a card the replay walked through; one write is posted once it settles, and its `percent` is `cardIndex / (cards.length - 1) * 100`.
10. Reaching the last card posts `completed: true`.
11. A deck with one card reports `percent: 100` without dividing by zero.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- progress-reporter-deck.test.ts`
Expected: FAIL — `api.deckCards is not a function`.

- [ ] **Step 3: Implement deck mode**

```js
  function deckCards(root) {
    // Flat and in document order, exactly as the deck's own JS collects them:
    // section wrappers exist for the update flow's benefit and navigation
    // crosses them transparently (deck.md §1).
    return Array.prototype.slice.call(root.querySelectorAll('.card'));
  }

  function deckPosition(cards, i) {
    var card = cards[i];
    var pos = { kind: 'deck', cardIndex: i };
    var section = card && card.closest ? card.closest('section[id]') : null;
    if (section) {
      // Section ids are permanent by contract, so this pair outlives an
      // incremental regeneration that shifts every absolute index after it.
      // The opener and the recap card sit outside every wrapper and get neither.
      pos.sectionId = section.id;
      pos.cardOffset = deckCards(section).indexOf(card);
    }
    return pos;
  }

  function deckTarget(cards, position) {
    if (!position || position.kind !== 'deck') return -1;
    if (position.sectionId) {
      var section = document.getElementById(position.sectionId);
      if (section) {
        var own = deckCards(section);
        var card = own[Math.min(position.cardOffset || 0, own.length - 1)];
        var found = cards.indexOf(card);
        if (found >= 0) return found;
      }
    }
    // Clamped rather than refused: a deck that lost cards should resume near
    // where you were, not at card one.
    return Math.min(Math.max(position.cardIndex || 0, 0), cards.length - 1);
  }
```

The replay: find the visible card via `.card.active`, find the `Next` control (`deck.md` §2 guarantees a persistent pair; match a button whose text is `Next` or which carries a `data-next`/`[rel=next]` hook, and give up quietly if none is found), then click it until the visible index reaches the target or `Next` is disabled. Watch for the resume to become possible again with a `MutationObserver` on the card container filtered to `class`, plus one on the `Next` button filtered to `disabled` — an observer works whatever the deck named its handlers, and there is nothing to keep in sync. Suppress reporting while `pending !== null`, and cancel `pending` when the visible index moves backwards or moves without the replay having asked.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- progress-reporter-deck.test.ts progress-reporter-doc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/progress.js test/progress-reporter-deck.test.ts
git commit -m "feat(progress): resume a deck through its own Next control"
```

---

### Task 7: The pill

**Files:**
- Modify: `assets/progress.js`
- Test: `test/progress-reporter-pill.test.ts`

**Interfaces:**
- Consumes: `restoreDoc`/`restoreDeck`'s return, `reset`.
- Produces: `showPill(text)`, and the `start over` control.

- [ ] **Step 1: Write the failing test**

jsdom. Cases:

1. No restore, no pill — a guide opened at the top must not be told it was resumed.
2. A restore mounts a pill reading `resumed` with a `start over` control.
3. `start over` issues the `DELETE`, returns the guide to card one / the top, and removes the pill.
4. The pill removes itself after 6s (fake timers).
5. A deck replay parked at a gate says so instead: the text names the wait rather than claiming the resume finished.
6. The pill's styles are inlined by the script — it adds exactly one `<style>` element, and adding it twice does not produce two.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- progress-reporter-pill.test.ts`
Expected: FAIL — `api.showPill is not a function`.

- [ ] **Step 3: Implement the pill**

One `<style>` element injected once, styled only with the tokens `theme.css` already publishes (`--panel`, `--fg`, `--line`, `--accent`) with literal fallbacks for a guide opened over `file://` where the app's stylesheets are absent. `position: fixed; inset: auto auto 12px 12px; z-index: 2147483000` so a deck's own sticky nav cannot bury it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- progress-reporter-pill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/progress.js test/progress-reporter-pill.test.ts
git commit -m "feat(progress): say so when a guide was resumed"
```

---

### Task 8: The board and the viewer

**Files:**
- Modify: `client/src/hooks/useGuides.ts`
- Modify: `client/src/components/guides/GuidesView.tsx`
- Test: `test/guides-view.test.tsx`

**Interfaces:**
- Consumes: Task 1's `GuideProgress`; Task 2's `DELETE /api/progress`.
- Produces: `useGuides(): { index, loading, error, refetch }`.

- [ ] **Step 1: Write the failing test**

Read `test/guides-view.test.tsx` first and follow its fetch-mocking harness. Add:

```tsx
  it('shows the high-water mark, not the last position', async () => {
    // A glance back at chapter one must not report the board backwards.
    renderBoard(guide({ percent: 10, furthestPercent: 70, completed: false }));
    expect(await screen.findByText(/70%/)).toBeInTheDocument();
  });

  it('says read for a completed guide rather than a number', async () => {
    renderBoard(guide({ percent: 100, furthestPercent: 100, completed: true }));
    expect(await screen.findByText(/read/)).toBeInTheDocument();
  });

  it('says nothing at all for a guide never opened', async () => {
    // 0% would read as a failure to start.
    renderBoard(guide(null));
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('resets a guide from the viewer, on the second tap', async () => {
    renderBoard(guide({ percent: 40, furthestPercent: 40, completed: false }));
    await userEvent.click(await screen.findByText('A guide'));
    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    // One tap arms, the second fires. The viewer is reached from a phone, and a
    // single-tap destructive control beside the back link is a mis-tap away
    // from discarding a session.
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/progress'), expect.anything());
    await userEvent.click(screen.getByRole('button', { name: /sure/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/progress?guidePath=' + encodeURIComponent('/g/a.html'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('repaints the board after a reset', async () => {
    // The card's meta line is a claim about stored state. Left unrefetched it
    // would keep claiming 40% for a guide the server has just forgotten.
    // …assert the index is fetched again after the DELETE resolves…
  });

  it('disarms the reset when the viewer is left', async () => {
    // An armed control must not still be armed when a different guide is opened.
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- guides-view.test.tsx`
Expected: FAIL — the card renders `percent`/`scrollPercent`, and there is no reset control.

- [ ] **Step 3: Add refetch to the hook**

Extract the fetch into a `useCallback`, return it as `refetch`, and keep the existing effect calling it — so there is one code path, not a duplicate.

- [ ] **Step 4: Update the card and the viewer head**

`GuideCard`'s meta line reads `guide.progress.furthestPercent`. Rewrite its docblock to say why: the card reports the high-water mark, so a glance back at chapter one does not report the board backwards.

The viewer head gains the reset control between the back link and the title, as a two-state button (`↺ reset` → `sure?`), armed state held in `useState` and cleared whenever `viewer` changes. On fire: `DELETE`, then `refetch`, then disarm. Keep `.guide-viewer-head`'s existing shape — `GuidesView.tsx`'s own docblock says that class name has to stay stable for a later companion panel.

Add the button's styles to `client/src/styles.css` beside the existing `.guide-viewer-back` rules.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm run typecheck`
Expected: PASS, including the `scrollPercent` typecheck failure noted in Task 1 Step 7, which this task clears.

- [ ] **Step 6: Commit**

```bash
git add client/src test/guides-view.test.tsx
git commit -m "feat(client): show the high-water mark, reset a guide from its viewer"
```

---

### Task 9: The record

**Files:**
- Create: `backlog/tasks/open/task-9-resume-where-you-left-off.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: File the backlog task**

Follow `backlog/README.md` and the shape of `backlog/tasks/done/task-8-settings-density-text-size-opens-on.md`: frontmatter (`id: task-9`, `title`, `created: 2026-08-25`), a Goal, and a Plan that points at this document rather than restating it. Move it to `backlog/tasks/done/` when Task 8 lands.

- [ ] **Step 2: Record the invariants this work adds**

In `CLAUDE.md`, under Invariants:

- The reporter is served, not vendored — same rule and same reason as the reading aid, and it carries a `progress v1` header that `injectProgressReporter` refuses to double.
- A deck is resumed by driving its own `Next`, never by setting `.active`: the deck owns `currentCardIndex`, the score and the progress bar, and a hand-set card leaves all three lying about the screen.
- `openCount` increments only on a write carrying `opened: true`.
- `furthestPercent` only ever climbs (`$max`), and is what the board renders.

Also update the Layout section's `progress/` line to mention `DELETE`, and the `assets/` line to name the reporter beside the reading aid.

- [ ] **Step 3: Verify the docs match the code**

Run: `pnpm test && pnpm run typecheck && pnpm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backlog/tasks/open/task-9-resume-where-you-left-off.md CLAUDE.md
git commit -m "docs: record the resume design's invariants"
```

---

## Manual verification (after Task 9)

The suites cannot see the one failure mode this feature is most exposed to — a
real deck, in a real iframe, with a real Mongo behind it.

- [ ] `pnpm run docker:up`, then `docker compose restart client` (editing
  `vite.config.ts` requires it — Vite's in-place restart comes back bound to
  localhost inside the container and the published port then refuses
  connections).
- [ ] Open a registered tutor deck, walk to card ~8 answering the quizzes,
  close the tab. Reopen: the pill appears and the deck lands on card 8. Tap
  `Back`: card 7, not card 1.
- [ ] Reopen a deck whose first quiz is unanswered and whose stored position is
  past it: the replay parks on that quiz, the pill says so, and answering it
  carries the deck to the stored card unaided.
- [ ] Open a study build, scroll to a late chapter, close, reopen: it lands on
  that chapter's heading. Change Settings → Text size and reopen: still that
  heading, which is the whole reason the anchor is stored.
- [ ] The board's card shows the high-water percent; scroll back to chapter one,
  reopen the board, and confirm it has not gone down.
- [ ] Reset from the viewer head: two taps, the card's meta line drops back to
  the date alone, and reopening the guide starts at the top with no pill.
- [ ] Repeat the deck check on the phone over the tailnet — the
  `visibilitychange` flush is the write that only that device exercises.

## Self-review

Checked against the spec:

- Every spec section maps to a task: position model → 1, reset → 2 + 8,
  injection → 3 + 4, doc restore/report → 5, deck restore → 6, pill → 7, wire
  changes → 1, client → 8, testing → each task's own steps, invariants → 9.
- The one thing the spec left implicit and this plan makes explicit: `GET
  /asset` becomes `async` because it now reads stored progress, which means the
  e2e suites that construct `RenderController` directly must supply
  `ProgressService` (Task 4, Step 4).
- Names are consistent across tasks: `percent`, `furthestPercent`, `position`,
  `opened`, `guidePath`, `injectProgressReporter`, `ProgressContext`,
  `deckCards`, `deckPosition`, `deckTarget`, `restoreDeck`, `restoreDoc`,
  `report`, `reset`, `showPill`.
- Tasks 6 and 7 describe their implementations in prose against fully-specified
  tests rather than in full code, because the exact DOM plumbing depends on the
  fixture deck built in Task 6 Step 1. Every behaviour is pinned by a named
  test case; nothing is left to taste.
