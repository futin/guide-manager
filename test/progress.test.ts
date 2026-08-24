import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { ProgressController } from '../server/src/progress/progress.controller';
import { ProgressService } from '../server/src/progress/progress.service';
import { ReadingProgress, ReadingProgressSchema } from '../server/src/progress/progress.schema';
import type { GuideProgress } from '../shared/types';

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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  // `string | object` is what supertest's send() accepts; the 'nonsense' case
  // below is a deliberate non-object body the endpoint has to reject.
  const post = (body: string | object) => request(app.getHttpServer()).post('/api/progress').send(body);

  it('creates a document on first open with openCount 1', async () => {
    const res = await post({ guidePath: '/p/a.md', project: 'p', scrollPercent: 12 }).expect(201);
    const body = res.body as GuideProgress;
    expect(body.openCount).toBe(1);
    expect(body.scrollPercent).toBe(12);
    expect(body.completed).toBe(false);
    expect(typeof body.lastOpenedAt).toBe('string');
  });

  it('upserts the same guidePath rather than inserting a second row', async () => {
    await post({ guidePath: '/p/b.md', project: 'p', scrollPercent: 10 }).expect(201);
    await post({ guidePath: '/p/b.md', project: 'p', scrollPercent: 40 }).expect(201);
    const all = (await request(app.getHttpServer()).get('/api/progress').expect(200)).body as GuideProgress[];
    expect(all.filter((p) => p.scrollPercent === 40)).toHaveLength(1);
  });

  it('counts each open', async () => {
    await post({ guidePath: '/p/g.md', project: 'p', scrollPercent: 1 }).expect(201);
    const second = await post({ guidePath: '/p/g.md', project: 'p', scrollPercent: 2 }).expect(201);
    expect((second.body as GuideProgress).openCount).toBe(2);
  });

  it('is last-write-wins: a lower scrollPercent overwrites a higher one', async () => {
    await post({ guidePath: '/p/c.md', project: 'p', scrollPercent: 90 }).expect(201);
    const res = await post({ guidePath: '/p/c.md', project: 'p', scrollPercent: 5 }).expect(201);
    expect((res.body as GuideProgress).scrollPercent).toBe(5);
  });

  it('marks completed when asked and keeps it on a later write that omits it', async () => {
    await post({ guidePath: '/p/d.md', project: 'p', scrollPercent: 99, completed: true }).expect(201);
    const res = await post({ guidePath: '/p/d.md', project: 'p', scrollPercent: 20 }).expect(201);
    expect((res.body as GuideProgress).completed).toBe(true);
  });

  it('clamps scrollPercent into 0..100', async () => {
    const high = await post({ guidePath: '/p/e.md', project: 'p', scrollPercent: 420 }).expect(201);
    expect((high.body as GuideProgress).scrollPercent).toBe(100);
    const low = await post({ guidePath: '/p/f.md', project: 'p', scrollPercent: -7 }).expect(201);
    expect((low.body as GuideProgress).scrollPercent).toBe(0);
  });

  it('rejects a write with no guidePath', async () => {
    await post({ project: 'p', scrollPercent: 10 }).expect(400);
    await post({ guidePath: '', project: 'p', scrollPercent: 10 }).expect(400);
    await post('nonsense').expect(400);
  });

  it('finds many guides in one query, and omits the ones never opened', async () => {
    const service = app.get(ProgressService);
    await post({ guidePath: '/p/h.md', project: 'p', scrollPercent: 30 }).expect(201);
    const found = await service.find(['/p/h.md', '/p/never-opened.md']);
    expect(found.get('/p/h.md')?.scrollPercent).toBe(30);
    expect(found.has('/p/never-opened.md')).toBe(false);
  });
});
