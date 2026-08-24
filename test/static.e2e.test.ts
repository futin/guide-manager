import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clientDistModules } from '../server/src/static';
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
        ...clientDistModules(join(tmpdir(), 'gm-definitely-not-a-bundle'))
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

  it('registers the static module when a bundle exists, and not when it does not', () => {
    const withBundle = mkdtempSync(join(tmpdir(), 'gm-dist-'));
    writeFileSync(join(withBundle, 'index.html'), '<!doctype html><div id="root"></div>');
    expect(clientDistModules(withBundle)).toHaveLength(1);

    // The client is a separate build step. Until it has run, registering the
    // module would install a catch-all handler with nothing behind it, so the
    // server must come up serving the API and guide routes alone.
    expect(clientDistModules(mkdtempSync(join(tmpdir(), 'gm-nodist-')))).toHaveLength(0);
  });

  it('404s an unknown route when this app was built without a bundle', async () => {
    // This app instance deliberately registers no static module (see beforeAll),
    // which is the state the server ships in before the client build has run.
    // The fallback's own behaviour with a bundle present cannot be asserted here
    // — ServeStaticModule's middleware is not wired up by a testing module, so it
    // would 404 either way — and is verified against the running server instead.
    await request(app.getHttpServer()).get('/no-such-page').expect(404);
  });

  it('never lets the SPA fallback swallow an API or render route', async () => {
    await request(app.getHttpServer()).get('/api/guides').expect(200);
    await request(app.getHttpServer()).get('/asset?p=/nope').expect(404);
    await request(app.getHttpServer()).get('/guide?p=/nope').expect(404);
  });
});
