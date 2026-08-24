import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RenderController } from '../server/src/render/render.controller';
import { RegistryService, REGISTRY_FILE } from '../server/src/registry/registry.service';

/**
 * The compatibility suite, ported from the old test/server.test.js. These
 * assertions are the contract every already-published guide links against:
 * /guide renders or frames, /asset serves verbatim, and anything outside a
 * registered guide's own directory is a 404.
 *
 * The index, /style.css and unknown-route cases from the original live in
 * guides.e2e, assets.e2e and static.e2e respectively — the tasks that own
 * those routes — rather than being duplicated here.
 */
function fixture(): { root: string; registryFile: string } {
  const root = mkdtempSync(join(tmpdir(), 'gm-srv-'));
  mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
  writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# Alpha Guide\n\n![d](diagram.png)');
  writeFileSync(join(root, 'proj', 'guides', 'diagram.png'), 'fake-png');
  writeFileSync(join(root, 'proj', 'guides', 'deck.html'), '<!doctype html><h1>Deck</h1>');
  writeFileSync(join(root, 'proj', 'secret.txt'), 'secret');
  const registryFile = join(root, 'registry.json');
  writeFileSync(registryFile, JSON.stringify({
    projects: [{
      name: 'proj',
      path: join(root, 'proj'),
      guides: [
        { type: 'study', title: 'Alpha Guide', path: join(root, 'proj', 'guides', 'a.md'), updated: '2026-08-24T00:00:00Z' },
        { type: 'tutor', title: 'Deck', path: join(root, 'proj', 'guides', 'deck.html'), updated: '2026-08-24T00:00:00Z' },
        { type: 'study', title: 'Ghost', path: join(root, 'proj', 'gone', 'x.md'), updated: '2026-08-24T00:00:00Z' }
      ]
    }]
  }));
  return { root, registryFile };
}

async function makeApp(registryFile: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [RenderController],
    providers: [{ provide: REGISTRY_FILE, useValue: registryFile }, RegistryService]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('render routes', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    const f = fixture();
    root = f.root;
    app = await makeApp(f.registryFile);
  });

  afterAll(async () => {
    await app.close();
  });

  const guidePath = (...parts: string[]): string => encodeURIComponent(join(root, ...parts));

  it('renders a registered markdown guide', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'a.md')}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/<h1[^>]*>Alpha Guide<\/h1>/);
    expect(res.text).toContain('/asset?p=');
  });

  it('serves a tutor deck verbatim from /asset', async () => {
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', 'deck.html')}`)
      .expect(200);
    expect(res.text).toBe('<!doctype html><h1>Deck</h1>');
  });

  it('wraps a tutor deck in a shell with breadcrumb and framed deck', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'deck.html')}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('class="topbar"');
    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('badge tutor');
    expect(res.text).not.toContain('<h1>Deck</h1>');
    // Follow the frame's own src rather than reconstructing it: the server
    // resolves symlinks, so the framed path need not equal the requested one.
    const src = res.text.match(/<iframe[^>]*\ssrc="([^"]+)"/)?.[1];
    expect(src?.startsWith('/asset?p=')).toBe(true);
    const framed = await request(app.getHttpServer()).get(src as string).expect(200);
    expect(framed.text).toBe('<!doctype html><h1>Deck</h1>');
  });

  it('serves a sibling asset with its own content type', async () => {
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', 'diagram.png')}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  it('rejects a file that is not next to any registered guide', async () => {
    await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'secret.txt')}`)
      .expect(404);
  });

  it('rejects traversal', async () => {
    await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', '..', 'secret.txt')}`)
      .expect(404);
  });

  it('rejects a request with no path at all', async () => {
    await request(app.getHttpServer()).get('/asset').expect(404);
    await request(app.getHttpServer()).get('/guide').expect(404);
  });

  it('a markdown guide page carries the reading aid panel, or the aid stays inert', async () => {
    // init() in assets/bionic.js returns early when .bx-panel is absent — it
    // looks the panel's controls up before doing anything — so linking bionic.js
    // without the markup means bionic never applies to this page at all.
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'a.md')}`)
      .expect(200);
    expect(res.text).toContain('class="bx-panel"');
    for (const id of ['bx-on', 'bx-strength', 'bx-freq', 'bx-opts', 'bx-strength-out', 'bx-freq-out']) {
      expect(res.text).toContain(`id="${id}"`);
    }
  });

  it('a framed deck page gets no panel — the deck carries its own inside the frame', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'deck.html')}`)
      .expect(200);
    expect(res.text).not.toContain('class="bx-panel"');
  });

  it('a markdown guide page reports its own reading progress', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'a.md')}`)
      .expect(200);
    expect(res.text).toContain('/api/progress');
    expect(res.text).toContain('"proj"');
  });

  it('a framed deck page carries no reporter — it cannot see the iframe scroll', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'deck.html')}`)
      .expect(200);
    expect(res.text).not.toContain('/api/progress');
  });

  it('guide page carries a breadcrumb back to the index', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'a.md')}`)
      .expect(200);
    const html = res.text;
    const bar = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(bar).toContain('href="/"');
    expect(bar).toContain('proj');
    expect(bar).toContain('Alpha Guide');
    expect(bar).toContain('badge study');
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main'));
  });

  it('back link targets the top window, so the framed guide cannot nest the app', async () => {
    for (const file of ['a.md', 'deck.html']) {
      const res = await request(app.getHttpServer())
        .get(`/guide?p=${guidePath('proj', 'guides', file)}`)
        .expect(200);
      expect(res.text).toMatch(/<a class="back"[^>]*target="_top"/);
    }
  });

  it('unregistered sibling guide still gets a back link, titled by filename', async () => {
    writeFileSync(join(root, 'proj', 'guides', 'sibling.md'), '# Sibling');
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'sibling.md')}`)
      .expect(200);
    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('sibling.md');
  });
});

describe('render routes through a symlinked registry path', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'gm-link-'));
    mkdirSync(join(root, 'real', 'guides'), { recursive: true });
    writeFileSync(join(root, 'real', 'guides', 'a.md'), '# Alpha');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const registryFile = join(root, 'registry.json');
    writeFileSync(registryFile, JSON.stringify({
      projects: [{
        name: 'linked-proj',
        path: join(root, 'link'),
        guides: [
          { type: 'study', title: 'Alpha Guide', path: join(root, 'link', 'guides', 'a.md'), updated: '2026-08-24T00:00:00Z' }
        ]
      }]
    }));
    app = await makeApp(registryFile);
  });

  afterAll(async () => {
    await app.close();
  });

  it('titles a guide registered through a symlinked directory', async () => {
    const p = encodeURIComponent(join(root, 'link', 'guides', 'a.md'));
    const res = await request(app.getHttpServer()).get(`/guide?p=${p}`).expect(200);
    expect(res.text).toContain('<title>Alpha Guide</title>');
    expect(res.text).toContain('linked-proj');
  });
});
