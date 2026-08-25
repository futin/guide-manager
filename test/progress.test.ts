import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { BaseExceptionFilter } from '@nestjs/core';
import { Catch, HttpException } from '@nestjs/common';
import request from 'supertest';
import type { ArgumentsHost, INestApplication } from '@nestjs/common';

import { ProgressController } from '../server/src/progress/progress.controller';
import { ProgressService } from '../server/src/progress/progress.service';
import { ReadingProgress, ReadingProgressSchema } from '../server/src/progress/progress.schema';
import type { GuideProgress } from '../shared/types';

/**
 * Diagnostics for a flake seen exactly once: this suite's first POST came back
 * 401 "Unauthorized" on a full run, and every rerun since has been green -- 26
 * consecutive full runs, plus 120 isolated first-request iterations.
 *
 * The status is the whole puzzle. No route here is guarded, and Nest gives a
 * response a status it was not handed by an HttpException only when the thrown
 * error carries a `statusCode` of its own (BaseExceptionFilter.isHttpError) --
 * and nothing in this repo or anywhere in its dependency tree mints a 401. So
 * either the response did not come from this app, or an error shape nobody has
 * accounted for reached the filter. The two hooks below answer exactly those
 * two questions, because the first sighting could answer neither.
 *
 * Both stay silent on the statuses this suite means to produce, so a passing
 * run prints nothing at all. Background:
 * backlog/bugs/open/bug-1-progress-suite-401-flake.md
 */
const EXPECTED_STATUSES = new Set([200, 201, 204, 400]);

/**
 * Which error. Logs the raw exception's own properties -- above all whether it
 * carries the `statusCode` that would explain a status like 401 -- and then
 * defers to the stock filter, so every response is byte-for-byte what it would
 * have been without this installed.
 */
@Catch()
class DiagnosticFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const deliberate =
      exception instanceof HttpException && EXPECTED_STATUSES.has(exception.getStatus());
    if (!deliberate) {
      const err = exception as Record<string, unknown> | null | undefined;
      // eslint-disable-next-line no-console
      console.error('[progress] exception reached the filter', {
        constructor: err?.constructor?.name,
        message: err?.message,
        statusCode: err?.statusCode,
        code: err?.code,
        codeName: err?.codeName,
        own: Object.getOwnPropertyNames(err ?? {})
      });
    }
    super.catch(exception, host);
  }
}

describe('progress', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: ReadingProgress.name, schema: ReadingProgressSchema }])
      ],
      controllers: [ProgressController],
      providers: [ProgressService]
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DiagnosticFilter(app.getHttpAdapter()));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  /**
   * Who answered. An Express response carries `x-powered-by`, and the socket
   * names the port that actually served it: if either disagrees with the server
   * under test, the response came from somewhere other than this app and no
   * amount of reading this app's code will ever explain it.
   */
  const diagnose = (res: request.Response): void => {
    if (EXPECTED_STATUSES.has(res.status)) return;
    // `res` (the underlying IncomingMessage) is real but undeclared on
    // superagent's Response type, and the socket is the only place the serving
    // port is recorded.
    const socket = (res as unknown as { res?: { socket?: { remoteAddress?: string; remotePort?: number; localPort?: number } } }).res?.socket;
    // eslint-disable-next-line no-console
    console.error('[progress] unexpected status', {
      status: res.status,
      headers: res.headers,
      body: res.text?.slice(0, 500),
      servedBy: socket && { remote: `${socket.remoteAddress}:${socket.remotePort}`, local: socket.localPort },
      serverUnderTest: app.getHttpServer().address()
    });
  };

  const watched = (test: request.Test): request.Test => test.on('response', diagnose);

  // `string | object` is what supertest's send() accepts; the 'nonsense' case
  // below is a deliberate non-object body the endpoint has to reject.
  const post = (body: string | object) =>
    watched(request(app.getHttpServer()).post('/api/progress').send(body));
  const list = () => watched(request(app.getHttpServer()).get('/api/progress'));
  const del = (query = '') => watched(request(app.getHttpServer()).delete(`/api/progress${query}`));

  it('creates a document on first open with openCount 1', async () => {
    const res = await post({ guidePath: '/p/a.md', project: 'p', percent: 12, opened: true }).expect(201);
    const body = res.body as GuideProgress;
    expect(body.openCount).toBe(1);
    expect(body.percent).toBe(12);
    expect(body.completed).toBe(false);
    expect(typeof body.lastOpenedAt).toBe('string');
  });

  it('upserts the same guidePath rather than inserting a second row', async () => {
    await post({ guidePath: '/p/b.md', project: 'p', percent: 10 }).expect(201);
    await post({ guidePath: '/p/b.md', project: 'p', percent: 40 }).expect(201);
    const all = (await list().expect(200)).body as GuideProgress[];
    expect(all.filter((p) => p.percent === 40)).toHaveLength(1);
  });

  it('counts each open', async () => {
    await post({ guidePath: '/p/g.md', project: 'p', percent: 1, opened: true }).expect(201);
    const second = await post({ guidePath: '/p/g.md', project: 'p', percent: 2, opened: true }).expect(201);
    expect((second.body as GuideProgress).openCount).toBe(2);
  });

  it('is last-write-wins: a lower percent overwrites a higher one', async () => {
    await post({ guidePath: '/p/c.md', project: 'p', percent: 90 }).expect(201);
    const res = await post({ guidePath: '/p/c.md', project: 'p', percent: 5 }).expect(201);
    expect((res.body as GuideProgress).percent).toBe(5);
  });

  it('marks completed when asked and keeps it on a later write that omits it', async () => {
    await post({ guidePath: '/p/d.md', project: 'p', percent: 99, completed: true }).expect(201);
    const res = await post({ guidePath: '/p/d.md', project: 'p', percent: 20 }).expect(201);
    expect((res.body as GuideProgress).completed).toBe(true);
  });

  it('clamps percent into 0..100', async () => {
    const high = await post({ guidePath: '/p/e.md', project: 'p', percent: 420 }).expect(201);
    expect((high.body as GuideProgress).percent).toBe(100);
    const low = await post({ guidePath: '/p/f.md', project: 'p', percent: -7 }).expect(201);
    expect((low.body as GuideProgress).percent).toBe(0);
  });

  it('rejects a write with no guidePath', async () => {
    await post({ project: 'p', percent: 10 }).expect(400);
    await post({ guidePath: '', project: 'p', percent: 10 }).expect(400);
    await post('nonsense').expect(400);
  });

  it('finds many guides in one query, and omits the ones never opened', async () => {
    const service = app.get(ProgressService);
    await post({ guidePath: '/p/h.md', project: 'p', percent: 30 }).expect(201);
    const found = await service.find(['/p/h.md', '/p/never-opened.md']);
    expect(found.get('/p/h.md')?.percent).toBe(30);
    expect(found.has('/p/never-opened.md')).toBe(false);
  });

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

  it('keeps a stored position when a later write carries none', async () => {
    // The two halves arrive together from the reporter, but a write that lost
    // its position must not blank the one already stored: the percent is coarse
    // and the position is what makes a resume exact.
    await post({
      guidePath: '/p/keep.html',
      project: 'p',
      percent: 60,
      opened: true,
      position: { kind: 'deck', cardIndex: 9 }
    }).expect(201);
    const later = await post({ guidePath: '/p/keep.html', project: 'p', percent: 61 }).expect(201);
    expect((later.body as GuideProgress).position).toEqual({ kind: 'deck', cardIndex: 9 });
  });

  it('names the guide in every row it returns', async () => {
    await post({ guidePath: '/p/named.html', project: 'p', percent: 1, opened: true }).expect(201);
    const all = (await list().expect(200)).body as GuideProgress[];
    // Without guidePath the list route hands back rows with no way to tell
    // which guide each one belongs to.
    expect(all.some((p) => p.guidePath === '/p/named.html')).toBe(true);
  });

  it('resets one guide by deleting its row', async () => {
    await post({ guidePath: '/p/reset.html', project: 'p', percent: 90, opened: true }).expect(201);
    await del('?guidePath=%2Fp%2Freset.html').expect(204);
    const all = (await list().expect(200)).body as GuideProgress[];
    // Deleted, not zeroed: "start over" means a guide you have not read, and a
    // surviving openCount: 7 beside a zeroed position is a state the board
    // would have to explain. Absence already renders correctly.
    expect(all.some((p) => p.guidePath === '/p/reset.html')).toBe(false);
  });

  it('refuses a reset with no guide named', async () => {
    await del().expect(400);
  });

  it('answers a reset for a guide with no row', async () => {
    // Idempotent on purpose: the pill's "start over" fires without knowing
    // whether anything was ever stored, and a 404 there would be noise.
    await del('?guidePath=%2Fp%2Fnever.html').expect(204);
  });
});
