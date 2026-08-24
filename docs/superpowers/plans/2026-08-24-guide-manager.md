# guide-manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code plugin repo that homes the `study`/`tutor` skills and serves a phone-readable (Tailscale) index of every project's guides via a local Node server over a skill-maintained registry.

**Architecture:** Skills auto-register written guides into a gitignored `registry.json` via `bin/register.js`. A zero-framework Node HTTP server renders the registry as a mobile index, renders study-guide markdown, and serves tutor decks verbatim — restricted to registered guides' parent directories. launchd keeps the server alive.

**Tech Stack:** Node ≥ 20 (ESM, `node:test`, built-in `fetch`), single runtime dependency `marked`, macOS launchd, Claude Code plugin system.

**Spec:** `docs/superpowers/specs/2026-08-24-guide-manager-design.md`

## Global Constraints

- Node ≥ 20; `package.json` has `"type": "module"`; all code is ESM.
- Exactly one runtime dependency: `marked`. Tests use `node:test` + `node:assert/strict` only.
- Server port: `4321`, bound to `0.0.0.0`. No auth (Tailscale is the boundary).
- `registry.json` lives at the repo root and is **gitignored**.
- `bin/register.js` invoked as a CLI must **always exit 0**, even on error (prints a warning) — it must never break a skill's wrap-up.
- Path safety rule (verbatim from spec): serve only files inside a registered guide's parent directory, after `realpath` resolution; symlink escapes and `../` traversal rejected; everything else 404.
- Registry shape: `{ "projects": [{ "name", "path", "guides": [{ "type": "study"|"tutor", "title", "path", "updated" }] }] }`.
- Working directory for all tasks: `/Users/andrejajevtic/Documents/custom-projects/guide-manager`.

---

### Task 1: Scaffold + registry library and register CLI

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `bin/register.js`
- Test: `test/register.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `loadRegistry(file) -> {projects: []}` (never throws; returns empty registry on missing/corrupt file), `upsertGuide(registry, {projectPath, guidePath, type, title, now}) -> registry` (mutates + returns), `saveRegistry(file, registry) -> void`, `REGISTRY_FILE` (string; `GM_REGISTRY_FILE` env overrides for tests). CLI: `node bin/register.js --project <abs> --guide <abs> --type study|tutor --title <text>`.

- [ ] **Step 1: Write scaffold files**

`package.json`:

```json
{
  "name": "guide-manager",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/",
    "start": "node server/server.js"
  },
  "dependencies": {
    "marked": "^12.0.0"
  }
}
```

`.gitignore`:

```
registry.json
node_modules/
*.log
```

- [ ] **Step 2: Write the failing tests**

`test/register.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry, upsertGuide, saveRegistry } from '../bin/register.js';

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'gm-')), 'registry.json');

test('loadRegistry returns empty registry when file missing', () => {
  assert.deepEqual(loadRegistry(tmpFile()), { projects: [] });
});

test('loadRegistry recovers from corrupt JSON', () => {
  const file = tmpFile();
  writeFileSync(file, '{not json');
  assert.deepEqual(loadRegistry(file), { projects: [] });
});

test('loadRegistry recovers from wrong shape', () => {
  const file = tmpFile();
  writeFileSync(file, '{"projects": "nope"}');
  assert.deepEqual(loadRegistry(file), { projects: [] });
});

test('upsertGuide creates project and guide', () => {
  const reg = upsertGuide({ projects: [] }, {
    projectPath: '/tmp/proj',
    guidePath: '/tmp/proj/guides/a.md',
    type: 'study',
    title: 'A',
    now: 'T0',
  });
  assert.equal(reg.projects.length, 1);
  assert.equal(reg.projects[0].name, 'proj');
  assert.equal(reg.projects[0].path, '/tmp/proj');
  assert.deepEqual(reg.projects[0].guides[0], {
    path: '/tmp/proj/guides/a.md',
    type: 'study',
    title: 'A',
    updated: 'T0',
  });
});

test('upsertGuide dedupes by guide path and updates title/updated', () => {
  let reg = { projects: [] };
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/g.md', type: 'study', title: 'Old', now: 'T0' });
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/g.md', type: 'study', title: 'New', now: 'T1' });
  assert.equal(reg.projects.length, 1);
  assert.equal(reg.projects[0].guides.length, 1);
  assert.equal(reg.projects[0].guides[0].title, 'New');
  assert.equal(reg.projects[0].guides[0].updated, 'T1');
});

test('upsertGuide keeps distinct guides in one project', () => {
  let reg = { projects: [] };
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/a.md', type: 'study', title: 'A', now: 'T0' });
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/b.html', type: 'tutor', title: 'B', now: 'T1' });
  assert.equal(reg.projects[0].guides.length, 2);
});

test('saveRegistry + loadRegistry round-trip', () => {
  const file = tmpFile();
  const reg = upsertGuide({ projects: [] }, { projectPath: '/tmp/p', guidePath: '/tmp/p/g.md', type: 'tutor', title: 'G', now: 'T0' });
  saveRegistry(file, reg);
  assert.deepEqual(loadRegistry(file), reg);
});

test('CLI exits 0 and warns on missing args', () => {
  const out = spawnSync(process.execPath, ['bin/register.js', '--type', 'study'], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stderr, /warning/i);
});

test('CLI writes registry at GM_REGISTRY_FILE', () => {
  const file = tmpFile();
  const out = spawnSync(process.execPath, [
    'bin/register.js',
    '--project', '/tmp/proj',
    '--guide', '/tmp/proj/g.md',
    '--type', 'study',
    '--title', 'From CLI',
  ], { encoding: 'utf8', env: { ...process.env, GM_REGISTRY_FILE: file } });
  assert.equal(out.status, 0);
  const reg = loadRegistry(file);
  assert.equal(reg.projects[0].guides[0].title, 'From CLI');
  assert.match(reg.projects[0].guides[0].updated, /^\d{4}-\d{2}-\d{2}T/);
});

test('CLI rejects unknown type but still exits 0', () => {
  const file = tmpFile();
  const out = spawnSync(process.execPath, [
    'bin/register.js', '--project', '/p', '--guide', '/p/g.md', '--type', 'video', '--title', 'X',
  ], { encoding: 'utf8', env: { ...process.env, GM_REGISTRY_FILE: file } });
  assert.equal(out.status, 0);
  assert.match(out.stderr, /unknown type/i);
  assert.deepEqual(loadRegistry(file), { projects: [] });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../bin/register.js'`

- [ ] **Step 4: Write the implementation**

`bin/register.js`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const REGISTRY_FILE =
  process.env.GM_REGISTRY_FILE ||
  fileURLToPath(new URL('../registry.json', import.meta.url));

export function loadRegistry(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(data.projects)) throw new Error('bad shape');
    return data;
  } catch {
    return { projects: [] };
  }
}

export function upsertGuide(registry, { projectPath, guidePath, type, title, now }) {
  let project = registry.projects.find((p) => p.path === projectPath);
  if (!project) {
    project = { name: basename(projectPath), path: projectPath, guides: [] };
    registry.projects.push(project);
  }
  let guide = project.guides.find((g) => g.path === guidePath);
  if (!guide) {
    guide = { path: guidePath };
    project.guides.push(guide);
  }
  guide.type = type;
  guide.title = title;
  guide.updated = now;
  return registry;
}

export function saveRegistry(file, registry) {
  writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');
}

function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      guide: { type: 'string' },
      type: { type: 'string' },
      title: { type: 'string' },
    },
  });
  const { project, guide, type, title } = values;
  if (!project || !guide || !type || !title) {
    throw new Error('usage: register.js --project <abs> --guide <abs> --type study|tutor --title <text>');
  }
  if (type !== 'study' && type !== 'tutor') throw new Error(`unknown type: ${type}`);
  const registry = loadRegistry(REGISTRY_FILE);
  upsertGuide(registry, {
    projectPath: project,
    guidePath: guide,
    type,
    title,
    now: new Date().toISOString(),
  });
  saveRegistry(REGISTRY_FILE, registry);
  console.log(`registered: ${title} (${type}) -> ${guide}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    // A failed registration must never break the calling skill's wrap-up.
    console.error(`guide-manager registration warning: ${err.message}`);
    process.exitCode = 0;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all `register.test.js` tests)

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore bin/register.js test/register.test.js
git commit -m "feat: registry library and register CLI"
```

---

### Task 2: Path allowlist (`server/lib/paths.js`)

**Files:**
- Create: `server/lib/paths.js`
- Test: `test/paths.test.js`

**Interfaces:**
- Consumes: registry objects shaped as in Global Constraints (plain data — no import from Task 1 needed).
- Produces: `buildAllowlist(registry) -> Set<string>` (realpaths of each registered guide's parent dir; silently skips guides whose dir no longer exists), `resolveAllowed(requestPath, allowedDirs) -> string|null` (realpath of the request if inside an allowed dir, else `null`).

- [ ] **Step 1: Write the failing tests**

`test/paths.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAllowlist, resolveAllowed } from '../server/lib/paths.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gm-paths-'));
  mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
  writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# A');
  writeFileSync(join(root, 'proj', 'guides', 'img.png'), 'png');
  writeFileSync(join(root, 'proj', 'secret.md'), 'secret');
  writeFileSync(join(root, 'outside.md'), 'outside');
  symlinkSync(join(root, 'outside.md'), join(root, 'proj', 'guides', 'link.md'));
  const registry = {
    projects: [{
      name: 'proj',
      path: join(root, 'proj'),
      guides: [
        { type: 'study', title: 'A', path: join(root, 'proj', 'guides', 'a.md'), updated: 'T0' },
        { type: 'study', title: 'Gone', path: join(root, 'proj', 'deleted-dir', 'x.md'), updated: 'T0' },
      ],
    }],
  };
  return { root, registry, allowed: buildAllowlist(registry) };
}

test('buildAllowlist contains the guide parent dir, skips missing dirs', () => {
  const { root, allowed } = fixture();
  assert.equal(allowed.size, 1);
  assert.ok(allowed.has(realpathSync(join(root, 'proj', 'guides'))));
});

test('registered guide file resolves', () => {
  const { root, allowed } = fixture();
  assert.ok(resolveAllowed(join(root, 'proj', 'guides', 'a.md'), allowed));
});

test('sibling asset in same dir resolves', () => {
  const { root, allowed } = fixture();
  assert.ok(resolveAllowed(join(root, 'proj', 'guides', 'img.png'), allowed));
});

test('file outside the guide dir is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'secret.md'), allowed), null);
});

test('dot-dot traversal is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'guides', '..', 'secret.md'), allowed), null);
});

test('symlink escaping the dir is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'guides', 'link.md'), allowed), null);
});

test('nonexistent path is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'guides', 'nope.md'), allowed), null);
});

test('prefix-sibling dir is rejected (no startsWith false positive)', () => {
  const root = mkdtempSync(join(tmpdir(), 'gm-prefix-'));
  mkdirSync(join(root, 'guides'));
  mkdirSync(join(root, 'guides-evil'));
  writeFileSync(join(root, 'guides', 'a.md'), '# A');
  writeFileSync(join(root, 'guides-evil', 'b.md'), 'evil');
  const registry = {
    projects: [{ name: 'p', path: root, guides: [{ type: 'study', title: 'A', path: join(root, 'guides', 'a.md'), updated: 'T0' }] }],
  };
  const allowed = buildAllowlist(registry);
  assert.equal(resolveAllowed(join(root, 'guides-evil', 'b.md'), allowed), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/paths.test.js`
Expected: FAIL — `Cannot find module '../server/lib/paths.js'`

- [ ] **Step 3: Write the implementation**

`server/lib/paths.js`:

```js
import { realpathSync } from 'node:fs';
import { dirname, sep } from 'node:path';

// A registered guide's parent directory is servable (guide + its assets).
export function buildAllowlist(registry) {
  const dirs = new Set();
  for (const project of registry.projects) {
    for (const guide of project.guides) {
      try {
        dirs.add(realpathSync(dirname(guide.path)));
      } catch {
        // guide directory gone — project moved or deleted; skip
      }
    }
  }
  return dirs;
}

export function resolveAllowed(requestPath, allowedDirs) {
  let real;
  try {
    real = realpathSync(requestPath);
  } catch {
    return null;
  }
  for (const dir of allowedDirs) {
    if (real.startsWith(dir + sep)) return real;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/paths.test.js`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/paths.js test/paths.test.js
git commit -m "feat: realpath-based path allowlist for the server"
```

---

### Task 3: Markdown rendering with link rewriting (`server/lib/render.js`)

**Files:**
- Create: `server/lib/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `marked` (npm dependency declared in Task 1).
- Produces: `renderMarkdown(md, guidePath) -> string` (HTML body; relative links/images rewritten to `/guide?p=` for `.md` targets and `/asset?p=` otherwise, resolved against `dirname(guidePath)`; falls back to `<pre>`-escaped raw text if parsing throws), `wrapPage(title, bodyHtml) -> string` (full HTML document, escaped `<title>`, links `/style.css`, mobile viewport meta), `escapeHtml(s) -> string`.

- [ ] **Step 1: Install the dependency**

Run: `npm install`
Expected: `marked` appears in `node_modules/`, lockfile created.

- [ ] **Step 2: Write the failing tests**

`test/render.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, wrapPage, escapeHtml } from '../server/lib/render.js';

test('renders basic markdown', () => {
  const html = renderMarkdown('# Hello', '/proj/guides/a.md');
  assert.match(html, /<h1[^>]*>Hello<\/h1>/);
});

test('rewrites relative image to /asset with absolute path', () => {
  const html = renderMarkdown('![pic](img.png)', '/proj/guides/a.md');
  assert.ok(html.includes(`/asset?p=${encodeURIComponent('/proj/guides/img.png')}`));
});

test('rewrites relative md link to /guide with absolute path', () => {
  const html = renderMarkdown('[next](sub/next.md)', '/proj/guides/a.md');
  assert.ok(html.includes(`/guide?p=${encodeURIComponent('/proj/guides/sub/next.md')}`));
});

test('leaves absolute http links and anchors untouched', () => {
  const html = renderMarkdown('[x](https://example.com) [y](#section)', '/proj/guides/a.md');
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes('href="#section"'));
});

test('escapeHtml escapes the five specials', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('wrapPage escapes title and links stylesheet', () => {
  const page = wrapPage('<Guides>', '<p>hi</p>');
  assert.ok(page.includes('<title>&lt;Guides&gt;</title>'));
  assert.ok(page.includes('href="/style.css"'));
  assert.ok(page.includes('<p>hi</p>'));
  assert.ok(page.includes('name="viewport"'));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/render.test.js`
Expected: FAIL — `Cannot find module '../server/lib/render.js'`

- [ ] **Step 4: Write the implementation**

`server/lib/render.js`:

```js
import { Marked } from 'marked';
import { dirname, resolve } from 'node:path';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function rewriteUrl(url, baseDir) {
  if (/^(https?:|mailto:|#|\/)/i.test(url)) return url;
  const abs = resolve(baseDir, url);
  const route = /\.md$/i.test(abs) ? '/guide' : '/asset';
  return `${route}?p=${encodeURIComponent(abs)}`;
}

export function renderMarkdown(md, guidePath) {
  const baseDir = dirname(guidePath);
  const marked = new Marked({
    walkTokens(token) {
      if ((token.type === 'link' || token.type === 'image') && token.href) {
        token.href = rewriteUrl(token.href, baseDir);
      }
    },
  });
  try {
    return marked.parse(md);
  } catch {
    return `<pre>${escapeHtml(md)}</pre>`;
  }
}

export function wrapPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>${bodyHtml}</main>
</body>
</html>`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/render.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Commit**

```bash
git add server/lib/render.js test/render.test.js package-lock.json
git commit -m "feat: markdown rendering with relative-link rewriting"
```

---

### Task 4: HTTP server + index UI (`server/server.js`, `server/public/style.css`)

**Files:**
- Create: `server/server.js`
- Create: `server/public/style.css`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `loadRegistry`, `REGISTRY_FILE` from `bin/register.js` (Task 1); `buildAllowlist`, `resolveAllowed` from `server/lib/paths.js` (Task 2); `renderMarkdown`, `wrapPage`, `escapeHtml` from `server/lib/render.js` (Task 3).
- Produces: `createServer({registryFile}) -> http.Server` (exported for tests); run directly, listens on `0.0.0.0:${PORT||4321}` reading the real `REGISTRY_FILE`. Routes: `GET /`, `GET /style.css`, `GET /guide?p=`, `GET /asset?p=`.

- [ ] **Step 1: Write the failing tests**

`test/server.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server/server.js'`

- [ ] **Step 3: Write the implementation**

`server/server.js`:

```js
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, REGISTRY_FILE } from '../bin/register.js';
import { buildAllowlist, resolveAllowed } from './lib/paths.js';
import { renderMarkdown, wrapPage, escapeHtml } from './lib/render.js';

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

function titleFor(registry, path) {
  for (const project of registry.projects) {
    const guide = project.guides.find((g) => g.path === path);
    if (guide) return guide.title;
  }
  return basename(path);
}

function indexPage(registry) {
  const sections = registry.projects
    .map((project) => {
      const items = project.guides
        .filter((g) => existsSync(g.path))
        .map((g) =>
          `<li><a href="/guide?p=${encodeURIComponent(g.path)}">${escapeHtml(g.title)}</a>` +
          ` <span class="badge ${g.type}">${g.type}</span>` +
          ` <time>${escapeHtml(String(g.updated).slice(0, 10))}</time></li>`)
        .join('\n');
      if (!items) return '';
      return `<section><h2>${escapeHtml(project.name)}</h2><ul>${items}</ul></section>`;
    })
    .filter(Boolean)
    .join('\n');
  return wrapPage('Guides', `<h1>Guides</h1>\n${sections || '<p>No guides registered yet.</p>'}`);
}

export function createServer({ registryFile = REGISTRY_FILE } = {}) {
  return createHttpServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const registry = loadRegistry(registryFile);

      if (url.pathname === '/') {
        return send(res, 200, MIME['.html'], indexPage(registry));
      }
      if (url.pathname === '/style.css') {
        return send(res, 200, MIME['.css'], readFileSync(join(PUBLIC_DIR, 'style.css')));
      }
      if (url.pathname === '/guide' || url.pathname === '/asset') {
        const requested = url.searchParams.get('p') || '';
        const real = resolveAllowed(requested, buildAllowlist(registry));
        if (!real || !statSync(real).isFile()) return send(res, 404, MIME['.txt'], 'not found');
        const ext = extname(real).toLowerCase();
        if (url.pathname === '/guide' && ext === '.md') {
          const md = readFileSync(real, 'utf8');
          return send(res, 200, MIME['.html'], wrapPage(titleFor(registry, real), renderMarkdown(md, real)));
        }
        if (ext === '.md') {
          return send(res, 200, MIME['.txt'], readFileSync(real));
        }
        return send(res, 200, MIME[ext] || 'application/octet-stream', readFileSync(real));
      }
      send(res, 404, MIME['.txt'], 'not found');
    } catch (err) {
      console.error(err);
      send(res, 500, MIME['.txt'], 'server error');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4321;
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`guide-manager listening on http://0.0.0.0:${port}`);
  });
}
```

`server/public/style.css`:

```css
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #6b7280;
  --accent: #2563eb;
  --card: #f3f4f6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111418;
    --fg: #e5e7eb;
    --muted: #9ca3af;
    --accent: #60a5fa;
    --card: #1c2128;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
main { max-width: 44rem; margin: 0 auto; padding: 1rem 1.25rem 4rem; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3 { line-height: 1.25; }
section { background: var(--card); border-radius: 12px; padding: 0.25rem 1rem; margin: 1rem 0; }
ul { list-style: none; padding: 0; }
li { padding: 0.5rem 0; border-bottom: 1px solid var(--bg); }
li:last-child { border-bottom: none; }
.badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  background: var(--accent);
  color: var(--bg);
}
.badge.tutor { filter: hue-rotate(120deg); }
time { color: var(--muted); font-size: 0.8rem; float: right; }
img { max-width: 100%; height: auto; }
pre { overflow-x: auto; background: var(--card); padding: 0.75rem; border-radius: 8px; }
code { font-size: 0.9em; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
td, th { border: 1px solid var(--muted); padding: 0.35rem 0.6rem; }
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (register + paths + render + server, all tests)

- [ ] **Step 5: Manual smoke test**

```bash
npm start &
sleep 1
curl -s http://127.0.0.1:4321/ | head -5
kill %1
```

Expected: HTML with `<title>Guides</title>` (empty index is fine — real registry likely has no entries yet).

- [ ] **Step 6: Commit**

```bash
git add server/server.js server/public/style.css test/server.test.js
git commit -m "feat: HTTP server with index, guide rendering, and asset serving"
```

---

### Task 5: launchd lifecycle

**Files:**
- Create: `launchd/com.guide-manager.plist.template`
- Create: `launchd/install.sh`

**Interfaces:**
- Consumes: `server/server.js` run via `node` (Task 4).
- Produces: an installed LaunchAgent `com.guide-manager` keeping the server alive on port 4321; `launchd/install.sh` is idempotent (safe to re-run).

- [ ] **Step 1: Write the plist template**

`launchd/com.guide-manager.plist.template`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.guide-manager</string>
  <key>ProgramArguments</key>
  <array>
    <string>__NODE__</string>
    <string>__ROOT__/server/server.js</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>__HOME__/Library/Logs/guide-manager.log</string>
  <key>StandardErrorPath</key><string>__HOME__/Library/Logs/guide-manager.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Write the install script**

`launchd/install.sh`:

```bash
#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.guide-manager.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

sed -e "s|__NODE__|$NODE|g" \
    -e "s|__ROOT__|$ROOT|g" \
    -e "s|__HOME__|$HOME|g" \
    "$ROOT/launchd/com.guide-manager.plist.template" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "guide-manager LaunchAgent loaded."
echo "logs: $HOME/Library/Logs/guide-manager.log"
if command -v tailscale >/dev/null 2>&1; then
  echo "phone URL: http://$(tailscale ip -4 2>/dev/null | head -1):4321"
else
  echo "phone URL: http://<this-mac's-tailscale-name>:4321"
fi
```

Then: `chmod +x launchd/install.sh`

- [ ] **Step 3: Install and verify**

```bash
./launchd/install.sh
sleep 1
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/
```

Expected: install output, then `200`.

- [ ] **Step 4: Verify KeepAlive restarts the server**

```bash
pkill -f 'server/server.js'
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/
```

Expected: `200` — launchd restarted it.

- [ ] **Step 5: Commit**

```bash
git add launchd/com.guide-manager.plist.template launchd/install.sh
git commit -m "feat: launchd LaunchAgent with install script"
```

---

### Task 6: Plugin manifest + skill migration

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `../../../.claude/skills/study/` (copied from `~/.claude/skills/study/`)
- Create: `../../../.claude/skills/tutor/` (copied from `~/.claude/skills/tutor/`)
- Modify: `../../../.claude/skills/study/SKILL.md` (append registration section)
- Modify: `../../../.claude/skills/tutor/SKILL.md` (append registration section)

**Interfaces:**
- Consumes: `bin/register.js` CLI (Task 1), reachable from skills as `${CLAUDE_PLUGIN_ROOT}/bin/register.js`.
- Produces: installable plugin `guide-manager` exposing `guide-manager:study` and `guide-manager:tutor` globally.

- [ ] **Step 1: Write the plugin manifests**

`.claude-plugin/plugin.json`:

```json
{
  "name": "guide-manager",
  "description": "Home of the study and tutor skills, plus a local Tailscale-reachable viewer for every project's guides",
  "version": "0.1.0"
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "guide-manager-marketplace",
  "owner": { "name": "andrejajevtic" },
  "plugins": [
    {
      "name": "guide-manager",
      "source": "./",
      "description": "study + tutor skills and local guide viewer"
    }
  ]
}
```

- [ ] **Step 2: Copy the skills in, verbatim**

```bash
cp -R ~/.claude/skills/study skills/study
cp -R ~/.claude/skills/tutor skills/tutor
git add skills
git commit -m "feat: import study and tutor skills verbatim from ~/.claude/skills"
```

Commit BEFORE modifying — the diff of the next step then shows exactly what the migration changed.

- [ ] **Step 3: Append the registration step to `../../../.claude/skills/study/SKILL.md`**

Append at the end of the file (adjusting the heading level to match the file's existing structure — it uses `###` for flow steps):

```markdown
### Register with guide-manager

After the guide is written or updated (and only then), register it so the
guide-manager viewer lists it:

    node "${CLAUDE_PLUGIN_ROOT}/bin/register.js" \
      --project "<absolute path to the project root>" \
      --guide "<absolute path to the guide file; for a directory guide, its README.md>" \
      --type study \
      --title "<the guide's human-readable title>"

If the command prints a warning, mention it to the user and move on —
registration must never block or fail the wrap-up.
```

- [ ] **Step 4: Append the registration step to `../../../.claude/skills/tutor/SKILL.md`**

Append at the end of the file, same shape:

```markdown
### Register with guide-manager

After a deck is written or refreshed (deck or both mode only — an in-chat
session writes nothing and registers nothing), register it so the
guide-manager viewer lists it:

    node "${CLAUDE_PLUGIN_ROOT}/bin/register.js" \
      --project "<absolute path to the project root>" \
      --guide "<absolute path to the deck html>" \
      --type tutor \
      --title "<the deck's topic title>"

If the command prints a warning, mention it to the user and move on —
registration must never block or fail the wrap-up. This registration is the
single exception to guardrail 1's "the only file a session may ever write is
the deck": it appends to guide-manager's own registry, never to the project.
```

- [ ] **Step 5: Install the plugin and verify skills resolve**

```bash
claude plugin marketplace add /Users/andrejajevtic/Documents/custom-projects/guide-manager
claude plugin install guide-manager@guide-manager-marketplace
```

(If subcommand names differ in the installed CLI version, check `claude plugin --help` and use the equivalent add-local-marketplace + install commands.)

Then from a DIFFERENT project directory, run `claude` and confirm `guide-manager:study` and `guide-manager:tutor` appear in the skills list (e.g. via ListSkills or `/study` autocomplete).

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin skills
git commit -m "feat: plugin manifests and guide registration steps in both skills"
```

---

### Task 7: Cutover — retire old skill copies, back-register existing guides

This task is manual verification + cleanup on the user's machine. Nothing here is automated on purpose: it deletes things.

- [ ] **Step 1: End-to-end check via plugin**

In any real project, run a quick `/tutor` deck-mode session (or `/study`) to completion. Verify: (a) the plugin version of the skill triggered, (b) the guide/deck was written into the project, (c) `registry.json` in guide-manager gained the entry, (d) the guide opens at `http://127.0.0.1:4321/`.

- [ ] **Step 2: Retire the old copies (backup, don't delete)**

```bash
mkdir -p ~/.claude/skills-retired
mv ~/.claude/skills/study ~/.claude/skills-retired/study
mv ~/.claude/skills/tutor ~/.claude/skills-retired/tutor
```

Confirm the skills still resolve (from the plugin) in a fresh `claude` session. Delete `~/.claude/skills-retired` only after a few days of normal use.

- [ ] **Step 3: Back-register existing guides**

Find candidates:

```bash
find ~/Documents/custom-projects -maxdepth 3 -type d -name 'learning-docs' 2>/dev/null
```

For each existing guide/deck worth listing, run `bin/register.js` by hand with the right `--project/--guide/--type/--title`.

- [ ] **Step 4: Phone check**

From the phone on Tailscale: open `http://<mac-tailscale-name>:4321`, open one study guide and one tutor deck. Both readable → done.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: cutover complete"
```
