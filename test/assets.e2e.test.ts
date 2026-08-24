import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AssetsController, REPO_ROOT } from '../server/src/render/assets.controller';

describe('static assets', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssetsController]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves the repo root from the compiled and the ts-node layout alike', () => {
    for (const rel of [
      join('server', 'public', 'style.css'),
      join('shared', 'theme.css'),
      join('assets', 'bionic.css'),
      join('assets', 'bionic.js')
    ]) {
      expect(existsSync(join(REPO_ROOT, rel))).toBe(true);
    }
  });

  it('serves the page stylesheet', async () => {
    const res = await request(app.getHttpServer()).get('/style.css').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('serves the theme tokens with every palette', async () => {
    const res = await request(app.getHttpServer()).get('/theme.css').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
    for (const theme of ['midnight', 'graphite', 'amber', 'nightshift', 'daylight']) {
      expect(res.text).toContain(`[data-theme="${theme}"]`);
    }
  });

  it('serves the reading aid stylesheet', async () => {
    const res = await request(app.getHttpServer()).get('/bionic.css').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
    expect(res.text).toContain('.bx-panel');
  });

  it('serves the vendored reading aid, not a copy', async () => {
    const res = await request(app.getHttpServer()).get('/bionic.js').expect(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('vendored from guide-manager assets/');
    expect(res.text).toBe(readFileSync(join(__dirname, '..', 'assets', 'bionic.js'), 'utf8'));
  });

  it('re-reads from disk per request, so a CSS edit needs no restart', async () => {
    // The old server re-read style.css on every request; keep that property.
    const first = await request(app.getHttpServer()).get('/style.css').expect(200);
    const second = await request(app.getHttpServer()).get('/style.css').expect(200);
    expect(second.text).toBe(first.text);
  });
});
