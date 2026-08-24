import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GuidesController } from '../server/src/guides/guides.controller';
import { RegistryService, REGISTRY_FILE } from '../server/src/registry/registry.service';
import type { GuidesIndex } from '../shared/types';

describe('GET /api/guides', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'gm-api-'));
    mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
    writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# Alpha');
    const file = join(root, 'registry.json');
    writeFileSync(file, JSON.stringify({
      projects: [{
        name: 'proj',
        path: join(root, 'proj'),
        guides: [
          { type: 'study', title: 'Alpha Guide', path: join(root, 'proj', 'guides', 'a.md'), updated: '2026-08-24T00:00:00Z' },
          { type: 'study', title: 'Ghost', path: join(root, 'proj', 'gone', 'x.md'), updated: '2026-08-24T00:00:00Z' }
        ]
      }]
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [GuidesController],
      providers: [{ provide: REGISTRY_FILE, useValue: file }, RegistryService]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes registered guides grouped by project, hiding stale ones', async () => {
    const res = await request(app.getHttpServer()).get('/api/guides').expect(200);
    const body = res.body as GuidesIndex;
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe('proj');
    expect(body.projects[0].guides).toHaveLength(1);
    expect(body.projects[0].guides[0]).toMatchObject({
      title: 'Alpha Guide',
      type: 'study',
      updated: '2026-08-24T00:00:00Z',
      progress: null
    });
  });

  it('gives each guide a ready-made viewer href', async () => {
    const res = await request(app.getHttpServer()).get('/api/guides').expect(200);
    const guide = (res.body as GuidesIndex).projects[0].guides[0];
    expect(guide.href).toBe(`/guide?p=${encodeURIComponent(join(root, 'proj', 'guides', 'a.md'))}`);
  });
});
