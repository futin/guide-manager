import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server/server.js';

function fixture() {
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
        { type: 'study', title: 'Ghost', path: join(root, 'proj', 'gone', 'x.md'), updated: '2026-08-24T00:00:00Z' },
      ],
    }],
  }));
  return { root, registryFile };
}

async function withServer(registryFile, fn) {
  const server = createServer({ registryFile });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('index lists existing guides, hides missing ones', async () => {
  const { registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Alpha Guide'));
    assert.ok(html.includes('Deck'));
    assert.ok(!html.includes('Ghost'));
    assert.ok(html.includes('badge study'));
  });
});

test('renders a registered markdown guide', async () => {
  const { root, registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const p = encodeURIComponent(join(root, 'proj', 'guides', 'a.md'));
    const res = await fetch(`${base}/guide?p=${p}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<h1[^>]*>Alpha Guide<\/h1>/);
    assert.ok(html.includes('/asset?p='));
  });
});

test('serves a tutor deck verbatim', async () => {
  const { root, registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const p = encodeURIComponent(join(root, 'proj', 'guides', 'deck.html'));
    const res = await fetch(`${base}/guide?p=${p}`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<!doctype html><h1>Deck</h1>');
  });
});

test('serves sibling asset, rejects unregistered file', async () => {
  const { root, registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const ok = await fetch(`${base}/asset?p=${encodeURIComponent(join(root, 'proj', 'guides', 'diagram.png'))}`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /image\/png/);
    const bad = await fetch(`${base}/asset?p=${encodeURIComponent(join(root, 'proj', 'secret.txt'))}`);
    assert.equal(bad.status, 404);
  });
});

test('rejects traversal', async () => {
  const { root, registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const p = encodeURIComponent(join(root, 'proj', 'guides', '..', 'secret.txt'));
    const res = await fetch(`${base}/asset?p=${p}`);
    assert.equal(res.status, 404);
  });
});

test('serves style.css', async () => {
  const { registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const res = await fetch(base + '/style.css');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/css/);
  });
});

test('corrupt registry yields empty index, not a crash', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gm-corrupt-'));
  const registryFile = join(root, 'registry.json');
  writeFileSync(registryFile, '{broken');
  await withServer(registryFile, async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /No guides registered yet/);
  });
});

test('unknown route is 404', async () => {
  const { registryFile } = fixture();
  await withServer(registryFile, async (base) => {
    const res = await fetch(base + '/whatever');
    assert.equal(res.status, 404);
  });
});
