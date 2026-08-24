import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GuidesController } from '../server/src/guides/guides.controller';
import { ProgressService } from '../server/src/progress/progress.service';
import { ReadingProgress, ReadingProgressSchema } from '../server/src/progress/progress.schema';
import { RegistryService, REGISTRY_FILE } from '../server/src/registry/registry.service';
import type { GuidesIndex } from '../shared/types';

describe('GET /api/guides', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'gm-api-'));
    mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
    writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# Alpha');
    writeFileSync(join(root, 'proj', 'guides', 'b.md'), '# Beta');
    const file = join(root, 'registry.json');
    writeFileSync(file, JSON.stringify({
      projects: [{
        name: 'proj',
        path: join(root, 'proj'),
        guides: [
          { type: 'study', title: 'Alpha Guide', path: join(root, 'proj', 'guides', 'a.md'), updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' },
          { type: 'tutor', title: 'Beta Deck', path: join(root, 'proj', 'guides', 'b.md'), updated: '2026-08-20T00:00:00Z' },
          { type: 'study', title: 'Ghost', path: join(root, 'proj', 'gone', 'x.md'), updated: '2026-08-24T00:00:00Z' }
        ]
      }]
    }));

    mongo = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: ReadingProgress.name, schema: ReadingProgressSchema }])
      ],
      controllers: [GuidesController],
      providers: [{ provide: REGISTRY_FILE, useValue: file }, RegistryService, ProgressService]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  const index = async (): Promise<GuidesIndex> =>
    (await request(app.getHttpServer()).get('/api/guides').expect(200)).body as GuidesIndex;

  it('publishes registered guides grouped by project, hiding stale ones', async () => {
    const body = await index();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe('proj');
    expect(body.projects[0].guides.map((g) => g.title)).toEqual(['Alpha Guide', 'Beta Deck']);
    expect(body.projects[0].guides[0]).toMatchObject({
      title: 'Alpha Guide',
      type: 'study',
      updated: '2026-08-24T00:00:00Z',
      progress: null
    });
  });

  /**
   * Every guide the API publishes has a createdAt, including ones registered
   * before the field existed — those fall back to `updated` at read time. The
   * server must not repair them in the file: bin/register.js is the registry's
   * only writer, and it heals a legacy entry on its own next re-register.
   */
  it('publishes createdAt, falling back to updated for a legacy entry', async () => {
    const guides = (await index()).projects[0].guides;
    expect(guides[0].createdAt).toBe('2026-08-01T00:00:00Z');
    expect(guides[1].createdAt).toBe('2026-08-20T00:00:00Z');
    expect(guides[1].updated).toBe('2026-08-20T00:00:00Z');
  });

  it('gives each guide a ready-made viewer href', async () => {
    const guide = (await index()).projects[0].guides[0];
    expect(guide.href).toBe(`/guide?p=${encodeURIComponent(join(root, 'proj', 'guides', 'a.md'))}`);
  });

  it('reports progress for a guide that has been read, and null for one that has not', async () => {
    // Written through the service: this module mounts GuidesController only, and
    // the POST endpoint itself is covered by progress.test.ts.
    await app.get(ProgressService).record({
      guidePath: join(root, 'proj', 'guides', 'a.md'),
      project: 'proj',
      scrollPercent: 64
    });

    const guides = (await index()).projects[0].guides;
    expect(guides[0].progress).toMatchObject({ scrollPercent: 64, completed: false, openCount: 1 });
    expect(guides[1].progress).toBeNull();
  });
});
