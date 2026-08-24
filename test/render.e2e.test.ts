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
 * /guide frames, /asset serves a guide document with the reading aid spliced in
 * and everything else verbatim, and anything outside a registered guide's own
 * directory is a 404.
 *
 * The index, /style.css and unknown-route cases from the original live in
 * guides.e2e, assets.e2e and static.e2e respectively — the tasks that own
 * those routes — rather than being duplicated here.
 */
const BUILD = '<!doctype html><html><head><title>Alpha</title></head>'
  + '<body><div class="shell"><p>Alpha prose</p></div></body></html>';

function fixture(): { root: string; registryFile: string } {
  const root = mkdtempSync(join(tmpdir(), 'gm-srv-'));
  mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
  writeFileSync(join(root, 'proj', 'guides', 'index.html'), BUILD);
  writeFileSync(join(root, 'proj', 'guides', 'diagram.png'), 'fake-png');
  writeFileSync(join(root, 'proj', 'guides', 'deck.html'), '<!doctype html><h1>Deck</h1>');
  // Registered, but not a guide this server will render — the shape a registry
  // written before markdown support was dropped still has on disk.
  writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# Alpha Guide');
  writeFileSync(join(root, 'proj', 'secret.txt'), 'secret');
  const registryFile = join(root, 'registry.json');
  writeFileSync(registryFile, JSON.stringify({
    projects: [{
      name: 'proj',
      path: join(root, 'proj'),
      guides: [
        { type: 'study', title: 'Alpha Guide', path: join(root, 'proj', 'guides', 'index.html'), updated: '2026-08-24T00:00:00Z' },
        { type: 'tutor', title: 'Deck', path: join(root, 'proj', 'guides', 'deck.html'), updated: '2026-08-24T00:00:00Z' },
        { type: 'study', title: 'Legacy', path: join(root, 'proj', 'guides', 'a.md'), updated: '2026-08-24T00:00:00Z' },
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

  it('frames a registered study build, breadcrumb and all', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'index.html')}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('class="topbar"');
    expect(res.text).toContain('Alpha Guide');
    expect(res.text).toContain('badge study');
    // The build's own markup belongs inside the frame, not spliced into the shell.
    expect(res.text).not.toContain('Alpha prose');
    expect(res.text).toContain('/asset?p=');
  });

  it('404s a guide that is not an HTML build', async () => {
    // Guides are generated HTML now — a study guide's index.html build or a
    // tutor deck. The markdown path that used to render a README hub is gone: it
    // had no mermaid renderer and no notion of sibling chapters, so it showed a
    // fraction of a directory guide and called it the guide.
    await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'a.md')}`)
      .expect(404);
  });

  it('serves a tutor deck from /asset with its own bytes intact', async () => {
    // Not byte-for-byte any more: a guide document picks up the reading aid on
    // the way out (see the splice test below). Everything the build itself
    // wrote — its inline CSS/JS, its hand-authored SVG — still arrives untouched.
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', 'deck.html')}`)
      .expect(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h1>Deck</h1>');
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
    expect(framed.text).toContain('<h1>Deck</h1>');
  });

  it('serves a sibling asset with its own content type', async () => {
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', 'diagram.png')}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  it('splices the reading aid into a framed guide document', async () => {
    // The framed document is the only place the aid can reach a generated
    // guide's prose: the shell around the iframe holds no text of its own.
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', 'index.html')}`)
      .expect(200);
    expect(res.text).toContain('href="/bionic.css"');
    expect(res.text).toContain('src="/bionic.js"');
    // The build's own bytes still have to arrive intact around the splice.
    expect(res.text).toContain('<p>Alpha prose</p>');
  });

  it('leaves a non-HTML asset byte-identical', async () => {
    // Only a guide document is spliced. An image, stylesheet or script the
    // guide pulls in must arrive exactly as it sits on disk.
    const res = await request(app.getHttpServer())
      .get(`/asset?p=${guidePath('proj', 'guides', 'diagram.png')}`)
      .expect(200);
    // supertest buffers a binary content type into `body`, not `text`.
    expect(Buffer.from(res.body).toString()).toBe('fake-png');
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

  it('the framing shell carries no panel of its own', async () => {
    // The panel is the guide build's business now. One spliced into the shell
    // would sit outside the iframe and have no prose to decorate.
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'deck.html')}`)
      .expect(200);
    expect(res.text).not.toContain('class="bx-panel"');
  });

  it('no guide page reports scroll progress', async () => {
    // Every guide is framed, and an iframe's scroll is invisible to the host
    // document — a reporter here would only ever measure a page that does not
    // move. Guides count as opened, which the client records when the card is
    // tapped.
    for (const file of ['index.html', 'deck.html']) {
      const res = await request(app.getHttpServer())
        .get(`/guide?p=${guidePath('proj', 'guides', file)}`)
        .expect(200);
      expect(res.text).not.toContain('/api/progress');
    }
  });

  it('guide page carries a breadcrumb back to the index', async () => {
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'index.html')}`)
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
    for (const file of ['index.html', 'deck.html']) {
      const res = await request(app.getHttpServer())
        .get(`/guide?p=${guidePath('proj', 'guides', file)}`)
        .expect(200);
      expect(res.text).toMatch(/<a class="back"[^>]*target="_top"/);
    }
  });

  it('unregistered sibling guide still gets a back link, titled by filename', async () => {
    writeFileSync(join(root, 'proj', 'guides', 'sibling.html'), '<h1>Sibling</h1>');
    const res = await request(app.getHttpServer())
      .get(`/guide?p=${guidePath('proj', 'guides', 'sibling.html')}`)
      .expect(200);
    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('sibling.html');
  });
});

describe('render routes through a symlinked registry path', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'gm-link-'));
    mkdirSync(join(root, 'real', 'guides'), { recursive: true });
    writeFileSync(join(root, 'real', 'guides', 'a.html'), '<h1>Alpha</h1>');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const registryFile = join(root, 'registry.json');
    writeFileSync(registryFile, JSON.stringify({
      projects: [{
        name: 'linked-proj',
        path: join(root, 'link'),
        guides: [
          { type: 'study', title: 'Alpha Guide', path: join(root, 'link', 'guides', 'a.html'), updated: '2026-08-24T00:00:00Z' }
        ]
      }]
    }));
    app = await makeApp(registryFile);
  });

  afterAll(async () => {
    await app.close();
  });

  it('titles a guide registered through a symlinked directory', async () => {
    // The registry stores the symlinked spelling; the server realpaths it. The
    // title lookup has to follow, or a guide read through the link falls back to
    // its filename.
    const p = encodeURIComponent(join(root, 'link', 'guides', 'a.html'));
    const res = await request(app.getHttpServer()).get(`/guide?p=${p}`).expect(200);
    expect(res.text).toContain('Alpha Guide');
  });
});
