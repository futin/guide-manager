import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLIENT_DIST, clientDistModules } from '../server/src/static';
import { GuidesController } from '../server/src/guides/guides.controller';
import { ProgressService } from '../server/src/progress/progress.service';
import { ReadingProgress, ReadingProgressSchema } from '../server/src/progress/progress.schema';
import { RegistryService, REGISTRY_FILE } from '../server/src/registry/registry.service';
import { RenderController } from '../server/src/render/render.controller';

describe('static client bundle', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'gm-static-'));
    mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
    writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# Alpha');
    const file = join(root, 'registry.json');
    writeFileSync(file, JSON.stringify({
      projects: [{
        name: 'proj',
        path: join(root, 'proj'),
        guides: [{ type: 'study', title: 'Alpha Guide', path: join(root, 'proj', 'guides', 'a.md'), updated: 'T0' }]
      }]
    }));

    mongo = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: ReadingProgress.name, schema: ReadingProgressSchema }]),
        ...clientDistModules()
      ],
      controllers: [GuidesController, RenderController],
      providers: [{ provide: REGISTRY_FILE, useValue: file }, RegistryService, ProgressService]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('registers the static module only when a bundle has actually been built', () => {
    // The client is a separate task and a separate toolchain, so this must be
    // true either way: bundle present -> one module, absent -> none.
    expect(clientDistModules()).toHaveLength(existsSync(join(CLIENT_DIST, 'index.html')) ? 1 : 0);
  });

  it('404s an unknown route when no client bundle is built', async () => {
    if (existsSync(join(CLIENT_DIST, 'index.html'))) {
      // A built bundle legitimately answers unknown routes with the SPA shell.
      await request(app.getHttpServer()).get('/no-such-page').expect(200);
      return;
    }
    await request(app.getHttpServer()).get('/no-such-page').expect(404);
  });

  it('never lets the SPA fallback swallow an API or render route', async () => {
    await request(app.getHttpServer()).get('/api/guides').expect(200);
    await request(app.getHttpServer()).get('/asset?p=/nope').expect(404);
    await request(app.getHttpServer()).get('/guide?p=/nope').expect(404);
  });
});
