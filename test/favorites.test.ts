import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { APP_OPTIONS, configureApp } from '../server/src/app.setup';
import { FavoritesController } from '../server/src/favorites/favorites.controller';
import { FavoritesService } from '../server/src/favorites/favorites.service';
import { StoredFavorite, StoredFavoriteSchema } from '../server/src/favorites/favorites.schema';
import type { Favorite } from '../shared/types';

describe('favorites', () => {
  let mongo: MongoMemoryServer;
  let app: NestExpressApplication;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: StoredFavorite.name, schema: StoredFavoriteSchema }])
      ],
      controllers: [FavoritesController],
      providers: [FavoritesService]
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  // Every test starts from an empty collection: order-of-creation and
  // per-project grouping are both the point of these cases, and a leftover
  // row from an earlier `it` would silently shift the orders under test.
  beforeEach(async () => {
    const model = app.get(getModelToken(StoredFavorite.name));
    await model.deleteMany({});
  });

  // `string | object` matches supertest's own send() signature — the empty
  // 'nonsense'-style non-object body has no case in this suite, but the type
  // stays honest about what send() actually accepts.
  const post = (body: string | object) => request(app.getHttpServer()).post('/api/favorites').send(body);
  const list = () => request(app.getHttpServer()).get('/api/favorites');
  const patch = (id: string, body: string | object) =>
    request(app.getHttpServer()).patch(`/api/favorites/${id}`).send(body);
  const put = (body: string | object) => request(app.getHttpServer()).put('/api/favorites/order').send(body);
  const del = (id: string) => request(app.getHttpServer()).delete(`/api/favorites/${id}`);

  const minimal = { guidePath: '/g/a.html', html: '<p>x</p>' };

  it('creates a favorite with the defaulted and derived fields', async () => {
    const res = await post(minimal).expect(201);
    const body = res.body as Favorite;
    expect(body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(body.project).toBe('');
    expect(body.guideTitle).toBe('');
    expect(body.anchor).toBeNull();
    expect(body.crumb).toEqual([]);
    expect(body.text).toBe('');
    expect(body.title).toBe('Untitled');
    expect(body.note).toBe('');
    expect(body.order).toBe(0);
    expect(new Date(body.createdAt).toString()).not.toBe('Invalid Date');
    expect(new Date(body.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('defaults title from the innermost crumb, then text, then Untitled', async () => {
    const fromCrumb = await post({ ...minimal, title: '  ', crumb: ['A', 'B'] }).expect(201);
    expect((fromCrumb.body as Favorite).title).toBe('B');

    const fromText = await post({ ...minimal, crumb: [], text: 'a'.repeat(100) }).expect(201);
    expect((fromText.body as Favorite).title).toBe('a'.repeat(60));

    const trimmed = await post({ ...minimal, title: ' Mine ' }).expect(201);
    expect((trimmed.body as Favorite).title).toBe('Mine');
  });

  /*
    Final whole-branch review, Minor (bundled): defaultTitle's crumb fallback
    used the innermost crumb entry verbatim, so a whitespace-only entry
    (unreachable from the real client — crumbFor filters on trimmed text —
    but reachable from a hand-rolled POST, and the API has no auth) produced
    a favorite whose title was visually blank while nominally satisfying the
    never-empty-title rule (draft.title.length check only looks at the
    *client-sent* title, not at what this fallback itself is about to
    return). Trimming the crumb before the truthiness check closes it: a
    whitespace-only entry now falls through to the next rung (text, then
    Untitled) exactly as an *absent* crumb entry already did.
  */
  it('falls through a whitespace-only crumb entry to the next fallback rung, rather than using it as a blank title', async () => {
    const res = await post({ ...minimal, crumb: ['A', '   '], text: 'fallback text' }).expect(201);
    expect((res.body as Favorite).title).toBe('fallback text');
  });

  it('orders new favorites to the top of their own project only', async () => {
    const first = await post({ ...minimal, project: 'p1' }).expect(201);
    const second = await post({ ...minimal, project: 'p1' }).expect(201);
    const third = await post({ ...minimal, project: 'p1' }).expect(201);
    expect((first.body as Favorite).order).toBe(0);
    expect((second.body as Favorite).order).toBe(-1);
    expect((third.body as Favorite).order).toBe(-2);

    const otherProject = await post({ ...minimal, project: 'p2' }).expect(201);
    expect((otherProject.body as Favorite).order).toBe(0);

    const all = (await list().expect(200)).body as Favorite[];
    const p1Orders = all.filter((f) => f.project === 'p1').map((f) => f.order);
    expect(p1Orders).toEqual([-2, -1, 0]);
  });

  it('rejects a missing guidePath, an empty html, and an oversized html', async () => {
    await post({ html: '<p>x</p>' }).expect(400);
    await post({ guidePath: '/g/a.html', html: '' }).expect(400);
    const big = await post({ guidePath: '/g/a.html', html: 'x'.repeat(512 * 1024 + 1) }).expect(413);
    // Proves configureApp's 1 MB parser is wired into this test app: express's
    // own default (100 KB) would reject this request before the DTO's 512 KB
    // cap ever ran, and with a different message.
    expect(big.text).toContain('512');
  });

  it('truncates oversized fields instead of rejecting the write', async () => {
    const res = await post({
      ...minimal,
      note: 'n'.repeat(5000),
      title: 't'.repeat(300),
      text: 'x'.repeat(70000),
      crumb: Array.from({ length: 8 }, (_, i) => `c${i}`.repeat(60))
    }).expect(201);
    const body = res.body as Favorite;
    expect(body.note.length).toBe(4000);
    expect(body.title.length).toBe(200);
    expect(body.text.length).toBe(65536);
    expect(body.crumb.length).toBe(6);
    expect(body.crumb.every((c: string) => c.length <= 200)).toBe(true);
  });

  it('round-trips a well-formed anchor and nulls a malformed one without failing the write', async () => {
    const good = await post({
      ...minimal,
      anchor: { kind: 'deck', cardIndex: 2, sectionId: 's1', cardOffset: 1 }
    }).expect(201);
    expect((good.body as Favorite).anchor).toEqual({
      kind: 'deck',
      cardIndex: 2,
      sectionId: 's1',
      cardOffset: 1
    });

    const unknownKind = await post({ ...minimal, anchor: { kind: 'nope' } }).expect(201);
    expect((unknownKind.body as Favorite).anchor).toBeNull();

    const noCardIndex = await post({ ...minimal, anchor: { kind: 'deck' } }).expect(201);
    expect((noCardIndex.body as Favorite).anchor).toBeNull();
  });

  it('patches title and note independently, leaving the other untouched', async () => {
    const created = await post({ ...minimal, note: 'original' }).expect(201);
    const id = (created.body as Favorite).id;

    const titled = await patch(id, { title: 'New' }).expect(200);
    expect((titled.body as Favorite).title).toBe('New');
    expect((titled.body as Favorite).note).toBe('original');

    const noted = await patch(id, { note: 'why' }).expect(200);
    expect((noted.body as Favorite).note).toBe('why');

    await patch(id, { title: '   ' }).expect(400);
    await patch(id, { order: 5 }).expect(400);
    await patch('0'.repeat(24), { title: 'x' }).expect(404);
    await patch('nope', { title: 'x' }).expect(404);
  });

  it('reorders a project bay through PUT /api/favorites/order', async () => {
    const project = 'reorder-p';
    const a = ((await post({ ...minimal, project }).expect(201)).body as Favorite).id;
    const b = ((await post({ ...minimal, project }).expect(201)).body as Favorite).id;
    const c = ((await post({ ...minimal, project }).expect(201)).body as Favorite).id;

    await put({ ids: [c, a, b] }).expect(204);
    const afterGood = (await list().expect(200)).body as Favorite[];
    const orderOf = (id: string) => afterGood.find((f) => f.id === id)?.order;
    expect(orderOf(c)).toBe(0);
    expect(orderOf(a)).toBe(1);
    expect(orderOf(b)).toBe(2);

    await put({ ids: [a, '0'.repeat(24)] }).expect(400);
    const afterUnknown = (await list().expect(200)).body as Favorite[];
    // Nothing written: the whole reorder is rejected together, so orders from
    // the prior successful write must still hold.
    expect(afterUnknown.find((f) => f.id === c)?.order).toBe(0);
    expect(afterUnknown.find((f) => f.id === a)?.order).toBe(1);
    expect(afterUnknown.find((f) => f.id === b)?.order).toBe(2);

    await put({ ids: [] }).expect(400);
    await put({ ids: [a, a] }).expect(400);

    // A garbled (not even ObjectId-shaped) id must answer 400 like any other
    // unknown id, not a 500 from an uncaught mongoose CastError: this route
    // has no auth, and a malformed request must not be able to crash it.
    await put({ ids: [a, 'not-an-object-id'] }).expect(400);
  });

  it('deletes idempotently and an unknown id is also a no-op success', async () => {
    const created = await post(minimal).expect(201);
    const id = (created.body as Favorite).id;

    await del(id).expect(204);
    await del(id).expect(204);
    const all = (await list().expect(200)).body as Favorite[];
    expect(all.some((f) => f.id === id)).toBe(false);

    await del('nope').expect(204);
  });

  it('sorts GET by project ascending then order ascending', async () => {
    await post({ ...minimal, project: 'b' }).expect(201); // b, order 0
    await post({ ...minimal, project: 'b' }).expect(201); // b, order -1
    await post({ ...minimal, project: 'a' }).expect(201); // a, order 0

    const all = (await list().expect(200)).body as Favorite[];
    const shape = all.map((f) => `${f.project}:${f.order}`);
    expect(shape).toEqual(['a:0', 'b:-1', 'b:0']);
  });
});
