---
id: task-1
title: NestJS backend split with Mongo reading progress
created: 2026-08-24
from: idea-1
---

## Goal

Replace the SSR-only `server/server.js` with a NestJS + TypeScript backend that
exposes a JSON API (`GET /api/guides`, `GET`/`POST /api/progress`), keeps the
existing `/guide` and `/asset` render routes byte-for-byte compatible, persists
per-guide reading progress in MongoDB, and serves a built client bundle from
`client/dist` when one exists.

This is the backend half of the split idea-1 deferred on 2026-08-24. That
deferral is reversed by explicit decision the same day. The React/Vite client
port (guides + settings views lifted from `../claude-agents-dashboard`) is a
separate item and is **not** in scope here.

Settled with the user, not open for re-litigation during execution:

- Progress granularity: **per-guide only**. No per-heading, no per-deck-card,
  no learning goals (goals get their own idea).
- Concurrent writes: **last-write-wins** upsert on `guidePath`.
- Registry file stays the single source of truth for *where guides are*; Mongo
  holds progress only.
- Mongo is **required at boot** — no database, no server.
- launchd support is **deleted outright**: the `launchd/` directory,
  `exitOnSourceChange`, `GM_RESTART_ON_CHANGE`, and `test/reload.test.js`.
- All tests move to **Jest + ts-jest**, one config.
- `bin/register.js` keeps its path and its bytes — the study and tutor skills
  invoke it directly.

## Plan

# NestJS Backend Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-file Node SSR server with a NestJS backend that adds a JSON API and Mongo-backed reading progress, without changing the security model or the URLs guides already link to.

**Architecture:** One Nest application. `RegistryService` reads `~/.guide-manager/registry.json` (unchanged file format, still authoritative for guide locations). `GuidesController` publishes that registry as JSON, joined with progress. `RenderController` keeps `/guide` and `/asset` behaving exactly as the old server did, reusing the ported `render` and `paths` pure functions and their existing test expectations. `ProgressController` upserts one Mongo document per guide path. `ServeStaticModule` serves `client/dist` only when that directory exists, so this task is shippable before the client port lands.

**Tech Stack:** NestJS 11 (`@nestjs/common`, `core`, `platform-express`, `config`, `mongoose`, `serve-static`), Mongoose 8, MongoDB 7 via docker-compose, TypeScript 5.5+, Jest 29 + ts-jest, supertest, mongodb-memory-server, `marked` 12 (kept).

**Spec:** this file's `## Goal` section, plus `backlog/ideas/done/idea-1-split-client-server-for-progress-tracking-and-goals.md` for the problem statement and `docs/superpowers/specs/2026-08-24-guide-manager-design.md` for the v1 constraints being deliberately superseded.

## Global Constraints

- Node `>=20` (existing `engines` floor — keep it).
- HTTP port stays **4321** by default, overridable with `PORT`.
- Registry file path resolution stays `GM_REGISTRY_FILE || ~/.guide-manager/registry.json`.
- The realpath allowlist in `paths.ts` is a security boundary: ported logic must stay behaviourally identical, and every existing rejection test must still pass.
- `bin/register.js` is not edited, renamed, or moved.
- `assets/bionic.js`, `assets/bionic.css`, `assets/bionic.html` are vendored — read them, serve them, do not edit them in this task.
- Mongo connection string comes from `MONGO_URL`, default `mongodb://localhost:27017/guide-manager`.
- One Jest config at the repo root; `npm test` runs exactly one command.

---

### Task 1: Toolchain — TypeScript, Nest skeleton, Jest, launchd removal

Converts the repo to a compiled TS project and proves the test runner works by
porting the two suites that touch neither Nest nor Mongo.

**Files:**
- Modify: `package.json` (whole file — deps, scripts, drop `"type": "module"`)
- Create: `bin/package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `jest.config.ts`
- Create: `server/src/main.ts`
- Create: `server/src/app.module.ts`
- Create: `server/src/health/health.controller.ts`
- Create: `test/bionic.test.ts`
- Create: `test/register.test.ts`
- Delete: `launchd/install.sh`, `launchd/com.guide-manager.plist.template`, `test/reload.test.js`, `test/bionic.test.js`, `test/register.test.js`
- Modify: `server/server.js` (delete file at the end of Task 4; untouched here)
- Test: `test/health.e2e.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AppModule` (Nest root module, imports appended by later tasks); `bootstrap(): Promise<void>` in `main.ts`; a working `npx jest` at the repo root.

**Why `bin/package.json`:** the root drops `"type": "module"` because Nest's
decorator emit and ts-jest are CommonJS-native. `bin/register.js` is ESM and
must keep its exact bytes, so `bin/` declares its own module type. This is the
one place the "don't touch register.js" constraint forces a workaround, and it
costs three lines.

- [ ] **Step 1: Install dependencies**

```bash
npm install @nestjs/common@^11 @nestjs/core@^11 @nestjs/platform-express@^11 \
  @nestjs/config@^4 @nestjs/mongoose@^11 @nestjs/serve-static@^5 \
  mongoose@^8 reflect-metadata@^0.2 rxjs@^7
npm install -D @nestjs/cli@^11 @nestjs/schematics@^11 @nestjs/testing@^11 \
  typescript@^5.5 ts-jest@^29 jest@^29 @types/jest@^29 @types/node@^20 \
  @types/express@^5 supertest@^7 @types/supertest@^6 \
  mongodb-memory-server@^10 ts-node@^10
```

- [ ] **Step 2: Rewrite `package.json`**

Keep `name`, `private`, `version`, `engines`. Remove `"type": "module"`. Scripts:

```json
{
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "dev": "nest start --watch",
    "test": "jest --runInBand",
    "typecheck": "tsc --noEmit"
  }
}
```

`--runInBand` because the Mongo-backed suites in Task 6 share one in-memory
server; parallel workers would race on it.

- [ ] **Step 3: Add `bin/package.json`**

```json
{
  "type": "module"
}
```

- [ ] **Step 4: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true
  },
  "include": ["server/**/*", "shared/**/*", "test/**/*"]
}
```

`strictPropertyInitialization: false` is the standard Nest setting — injected
constructor properties and Mongoose `@Prop()` fields are assigned by the
framework, not by the constructor body.

- [ ] **Step 5: Add `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "client"]
}
```

- [ ] **Step 6: Add `jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Nest's DI reads decorator metadata at class-definition time.
  setupFiles: ['reflect-metadata'],
  testTimeout: 30_000
};

export default config;
```

- [ ] **Step 7: Write the failing health e2e test**

`test/health.e2e.test.ts`:

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { HealthController } from '../server/src/health/health.controller';

describe('health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx jest test/health.e2e.test.ts`
Expected: FAIL — cannot find module `../server/src/health/health.controller`.

- [ ] **Step 9: Write the health controller, app module and bootstrap**

`server/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
```

`server/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController]
})
export class AppModule {}
```

`server/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const PORT = Number(process.env.PORT) || 4321;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
  console.log(`guide-manager listening on http://localhost:${PORT}`);
}

// A failed boot must exit non-zero rather than leave a half-started process:
// the Mongo connection in Task 6 is a hard requirement, and an unhandled
// rejection here would otherwise print a stack trace and keep the process alive
// with nothing listening.
bootstrap().catch((err: unknown) => {
  console.error('guide-manager failed to start:', err);
  process.exit(1);
});
```

- [ ] **Step 10: Run the health test to verify it passes**

Run: `npx jest test/health.e2e.test.ts`
Expected: PASS.

- [ ] **Step 11: Convert `test/bionic.test.js` to `test/bionic.test.ts`**

Mechanical: the suite loads `assets/bionic.js` as a source string into a bare
`vm` context, so it needs no ESM and no DOM. Change only the harness lines,
never the assertions.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'bionic.js'), 'utf8');

interface BionicApi {
  bionicWord(word: string, strength: number): number;
  shouldBold(wordIndex: number, freq: number): boolean;
  decorate(text: string, strength: number, freq: number, start: number): { html: string; next: number };
  readState(): { on: boolean; strength: number; freq: number };
  apply(root: unknown, strength: number, freq: number): void;
  restore(root: unknown): void;
  init(): void;
}

// Whatever the caller does not supply stays undefined, which is exactly the
// hostile environment the guards have to survive.
function load(sandbox: Record<string, unknown> = {}): BionicApi {
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.__bionic as BionicApi;
}

const strip = (html: string): string => html.replace(/<[^>]+>/g, '');
```

Then convert each `test('...', () => {})` to `it('...', () => {})` inside a
single `describe('bionic', ...)`, and each `assert.equal(a, b)` to
`expect(a).toBe(b)`, `assert.ok(x)` to `expect(x).toBeTruthy()`,
`assert.match(s, re)` to `expect(s).toMatch(re)`, `assert.deepEqual` to
`expect(a).toEqual(b)`. All 241 lines of assertions carry over unchanged in
meaning — this is a runner swap, not a rewrite. Keep `strip` even if only some
cases use it.

- [ ] **Step 12: Convert `test/register.test.js` to `test/register.test.ts` as CLI-level tests**

**This one changes shape, deliberately.** The old suite imported
`loadRegistry`/`upsertGuide`/`saveRegistry` from the ESM `bin/register.js`. A
CommonJS Jest cannot `require` an ESM module, and `register.js` is staying ESM
by constraint. So the CLI is tested as a CLI — through `spawnSync`, which the
old suite already used for part of its coverage. The server's own read path is
`RegistryService` (Task 3), unit-tested directly there, so nothing is left
uncovered.

```ts
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(__dirname, '..', 'bin', 'register.js');
const tmpFile = (): string => join(mkdtempSync(join(tmpdir(), 'gm-')), 'registry.json');

function run(file: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GM_REGISTRY_FILE: file }
  });
}

interface Registry {
  projects: { name: string; path: string; guides: { path: string; type: string; title: string; updated: string }[] }[];
}

const read = (file: string): Registry => JSON.parse(readFileSync(file, 'utf8')) as Registry;

describe('register CLI', () => {
  it('creates the registry file and the project entry', () => {
    const file = tmpFile();
    const res = run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(res.status).toBe(0);
    const reg = read(file);
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].name).toBe('proj');
    expect(reg.projects[0].path).toBe('/tmp/proj');
    expect(reg.projects[0].guides[0]).toMatchObject({
      path: '/tmp/proj/guides/a.md',
      type: 'study',
      title: 'A'
    });
    expect(typeof reg.projects[0].guides[0].updated).toBe('string');
  });

  it('updates an existing guide in place rather than duplicating it', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'tutor', '--title', 'A2']);
    const reg = read(file);
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].guides).toHaveLength(1);
    expect(reg.projects[0].guides[0].type).toBe('tutor');
    expect(reg.projects[0].guides[0].title).toBe('A2');
  });

  it('recovers from a corrupt registry instead of throwing', () => {
    const file = tmpFile();
    writeFileSync(file, '{not json');
    const res = run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(res.status).toBe(0);
    expect(read(file).projects).toHaveLength(1);
  });

  it('recovers from a registry of the wrong shape', () => {
    const file = tmpFile();
    writeFileSync(file, '{"projects": "nope"}');
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(read(file).projects).toHaveLength(1);
  });

  it('leaves no temp file behind after an atomic save', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('exits 0 with a warning on a bad type, so a skill wrap-up never breaks', () => {
    const file = tmpFile();
    const res = run(file, ['--project', '/tmp/proj', '--guide', '/tmp/g.md', '--type', 'nonsense', '--title', 'A']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('unknown type');
    expect(existsSync(file)).toBe(false);
  });

  it('exits 0 with a warning when required args are missing', () => {
    const file = tmpFile();
    const res = run(file, ['--project', '/tmp/proj']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('usage');
  });
});
```

- [ ] **Step 13: Delete launchd and the reload test**

```bash
git rm -r launchd
git rm test/reload.test.js test/bionic.test.js test/register.test.js
```

`exitOnSourceChange` and `GM_RESTART_ON_CHANGE` live inside `server/server.js`,
which Task 4 deletes wholesale — nothing to edit here.

- [ ] **Step 14: Run the whole suite**

Run: `npx jest`
Expected: `health.e2e`, `bionic`, `register` pass. `render.test.js`,
`paths.test.js`, `server.test.js` are `.js` and no longer match `testMatch`, so
they are silently skipped — Tasks 2 and 4 port them. Note the count so the drop
is intentional and visible, not discovered later.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "build: convert to TypeScript, add Nest skeleton and Jest, drop launchd"
```

---

### Task 2: Port `render` and `paths` as pure TypeScript

No Nest yet — these are the two pure modules the whole render route rests on,
and their existing tests are the regression net for the rewrite.

**Files:**
- Create: `shared/types.ts`
- Create: `server/src/render/render.util.ts`
- Create: `server/src/render/paths.util.ts`
- Create: `test/render.test.ts`
- Create: `test/paths.test.ts`
- Delete: `test/render.test.js`, `test/paths.test.js`
- Modify: nothing else (`server/lib/*.js` stay until Task 4 deletes them)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `shared/types.ts`: `GuideType = 'study' | 'tutor'`; `RegistryGuide { path: string; type: GuideType; title: string; updated: string }`; `RegistryProject { name: string; path: string; guides: RegistryGuide[] }`; `Registry { projects: RegistryProject[] }`; `GuideMeta { title: string; type?: GuideType; project?: string }`.
  - `render.util.ts`: `escapeHtml(s: unknown): string`; `renderMarkdown(md: string, guidePath: string): string`; `breadcrumbBar(meta?: GuideMeta): string`; `deckFrame(src: string, title?: string): string`; `wrapPage(title: string, bodyHtml: string, headerHtml?: string, opts?: { bodyClass?: string }): string`.
  - `paths.util.ts`: `buildAllowlist(registry: Registry): Set<string>`; `resolveAllowed(requestPath: string, allowedDirs: Set<string>): string | null`.

- [ ] **Step 1: Write `shared/types.ts`**

```ts
/** The registry file's shape — written by bin/register.js, read by the server. */
export type GuideType = 'study' | 'tutor';

export interface RegistryGuide {
  path: string;
  type: GuideType;
  title: string;
  updated: string;
}

export interface RegistryProject {
  name: string;
  path: string;
  guides: RegistryGuide[];
}

export interface Registry {
  projects: RegistryProject[];
}

/**
 * Breadcrumb context for one guide page. A file served merely because it sits
 * next to a registered guide has no registry entry, so `type` and `project`
 * are absent and the crumbs are left off rather than guessed.
 */
export interface GuideMeta {
  title: string;
  type?: GuideType;
  project?: string;
}
```

- [ ] **Step 2: Port `test/render.test.js` to `test/render.test.ts` verbatim in meaning**

Same conversion rules as Task 1 Step 11 (`test`→`it` in one `describe`,
`assert.*`→`expect`). Import from `../server/src/render/render.util`. Every one
of the 15 existing cases carries over, including the XSS-escaping and
fragment/query-rewriting cases — they encode decisions, not incidental
behaviour. Add one new case for the constraint this task must not break:

```ts
it('wrapPage still links the stylesheet at /style.css', () => {
  expect(wrapPage('T', '<p>hi</p>')).toContain('href="/style.css"');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest test/render.test.ts`
Expected: FAIL — cannot find module `../server/src/render/render.util`.

- [ ] **Step 4: Port the implementation**

`server/src/render/render.util.ts` is `server/lib/render.js` with types added.
Copy the file, then apply exactly these changes and nothing else:

```ts
import { dirname, resolve } from 'node:path';
import { Marked } from 'marked';
import type { GuideMeta } from '../../../shared/types';

export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function rewriteUrl(url: string, baseDir: string): string {
  if (/^(https?:|mailto:|data:|#|\/)/i.test(url)) return url;
  const [cleanUrl, fragment] = url.split('#');
  const [pathOnly] = cleanUrl.split('?');
  const abs = resolve(baseDir, pathOnly);
  const route = /\.md$/i.test(abs) ? '/guide' : '/asset';
  const rewritten = `${route}?p=${encodeURIComponent(abs)}`;
  return route === '/guide' && fragment ? `${rewritten}#${fragment}` : rewritten;
}
```

`renderMarkdown`, `breadcrumbBar`, `deckFrame` and `wrapPage` are copied with
their comments intact — those comments explain *why* a deck is framed rather
than spliced, and why the topbar is sticky, and that reasoning survives the
port. `walkTokens(token)` takes a `Token` from `marked`; type the callback
parameter as `Token` and narrow with `token.type === 'link' || token.type === 'image'`
before touching `token.href`.

- [ ] **Step 5: Run the render tests to verify they pass**

Run: `npx jest test/render.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Port `test/paths.test.js` to `test/paths.test.ts`**

Same mechanical conversion. The `fixture()` helper builds a real temp tree with
a symlink escaping the guide directory — keep it exactly as written; it is the
only test that proves the symlink rejection. Type its return as
`{ root: string; registry: Registry; allowed: Set<string> }`.

- [ ] **Step 7: Run it to verify it fails**

Run: `npx jest test/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Port `paths.util.ts`**

Straight copy of `server/lib/paths.js` with `Registry` typed and the return type
`Set<string>` / `string | null`. The `real.startsWith(dir + sep)` comparison
must not be "simplified" to `startsWith(dir)` — the prefix-sibling test
(`guides` vs `guides-evil`) exists precisely to catch that.

- [ ] **Step 9: Run the path tests to verify they pass**

Run: `npx jest test/paths.test.ts`
Expected: PASS, all 8 cases including both traversal rejections.

- [ ] **Step 10: Delete the old JS tests and commit**

```bash
git rm test/render.test.js test/paths.test.js
git add -A
git commit -m "refactor: port render and paths to TypeScript with their tests"
```

---

### Task 3: RegistryService and `GET /api/guides`

**Files:**
- Create: `server/src/registry/registry.service.ts`
- Create: `server/src/registry/registry.module.ts`
- Create: `server/src/guides/guides.controller.ts`
- Create: `server/src/guides/guides.module.ts`
- Modify: `shared/types.ts` (append the API response types)
- Modify: `server/src/app.module.ts` (import `GuidesModule`)
- Test: `test/registry.test.ts`, `test/guides.e2e.test.ts`

**Interfaces:**
- Consumes: `Registry`, `RegistryGuide`, `GuideMeta` from `shared/types` (Task 2); `buildAllowlist`/`resolveAllowed` from `paths.util` (Task 2).
- Produces:
  - `RegistryService.load(): Registry` — never throws; a missing, corrupt or wrong-shaped file yields `{ projects: [] }`.
  - `RegistryService.listProjects(): RegistryProject[]` — `load()` with guides whose file no longer exists filtered out, and projects left empty by that filter dropped.
  - `RegistryService.allowlist(): Set<string>`
  - `RegistryService.guideMeta(realPath: string): GuideMeta`
  - `GuidesIndex` in `shared/types.ts`.

- [ ] **Step 1: Append the API types to `shared/types.ts`**

```ts
/** Per-guide reading progress as the API publishes it. Null when never opened. */
export interface GuideProgress {
  scrollPercent: number;
  completed: boolean;
  lastOpenedAt: string;
  openCount: number;
}

export interface GuideEntry {
  path: string;
  title: string;
  type: GuideType;
  updated: string;
  /** Ready-made viewer URL, so the client never has to build the encoding itself. */
  href: string;
  progress: GuideProgress | null;
}

export interface ProjectEntry {
  name: string;
  path: string;
  guides: GuideEntry[];
}

export interface GuidesIndex {
  projects: ProjectEntry[];
}
```

- [ ] **Step 2: Write the failing registry unit test**

`test/registry.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RegistryService } from '../server/src/registry/registry.service';

function fixture(): { root: string; service: RegistryService } {
  const root = mkdtempSync(join(tmpdir(), 'gm-reg-'));
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
  return { root, service: new RegistryService(file) };
}

describe('RegistryService', () => {
  it('hides guides whose file is gone', () => {
    const { service } = fixture();
    const titles = service.listProjects().flatMap(p => p.guides.map(g => g.title));
    expect(titles).toEqual(['Alpha Guide']);
  });

  it('returns an empty registry for a missing file', () => {
    const service = new RegistryService(join(mkdtempSync(join(tmpdir(), 'gm-none-')), 'nope.json'));
    expect(service.load()).toEqual({ projects: [] });
  });

  it('returns an empty registry for corrupt JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-bad-'));
    const file = join(root, 'registry.json');
    writeFileSync(file, '{broken');
    expect(new RegistryService(file).load()).toEqual({ projects: [] });
  });

  it('returns an empty registry when projects is not an array', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-shape-'));
    const file = join(root, 'registry.json');
    writeFileSync(file, '{"projects":"nope"}');
    expect(new RegistryService(file).load()).toEqual({ projects: [] });
  });

  it('names a guide by its registry title', () => {
    const { root, service } = fixture();
    expect(service.guideMeta(join(root, 'proj', 'guides', 'a.md'))).toEqual({
      title: 'Alpha Guide', type: 'study', project: 'proj'
    });
  });

  it('falls back to the basename for an unregistered sibling', () => {
    const { root, service } = fixture();
    writeFileSync(join(root, 'proj', 'guides', 'sibling.md'), '# S');
    expect(service.guideMeta(join(root, 'proj', 'guides', 'sibling.md'))).toEqual({ title: 'sibling.md' });
  });

  it('resolves a guide registered through a symlinked directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-link-'));
    mkdirSync(join(root, 'real', 'guides'), { recursive: true });
    writeFileSync(join(root, 'real', 'guides', 'a.md'), '# Alpha');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const file = join(root, 'registry.json');
    writeFileSync(file, JSON.stringify({
      projects: [{
        name: 'linked-proj',
        path: join(root, 'link'),
        guides: [{ type: 'study', title: 'Alpha Guide', path: join(root, 'link', 'guides', 'a.md'), updated: 'T0' }]
      }]
    }));
    // The request carries the resolved realpath; the registry stores the symlinked one.
    const meta = new RegistryService(file).guideMeta(join(root, 'real', 'guides', 'a.md'));
    expect(meta).toEqual({ title: 'Alpha Guide', type: 'study', project: 'linked-proj' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest test/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `RegistryService`**

```ts
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { buildAllowlist } from '../render/paths.util';
import type { GuideMeta, Registry, RegistryProject } from '../../../shared/types';

export const REGISTRY_FILE = 'REGISTRY_FILE';

export function defaultRegistryFile(): string {
  return process.env.GM_REGISTRY_FILE || join(homedir(), '.guide-manager', 'registry.json');
}

/**
 * Read-only view of ~/.guide-manager/registry.json — the single source of truth
 * for where guides live. Written only by bin/register.js, which the study and
 * tutor skills invoke; this service never writes it.
 *
 * Read per call rather than cached: a skill can register a guide at any moment,
 * and the file is a few KB. A cache here would show a stale board until restart.
 *
 * The constructor takes the file path so tests can point at a fixture. Nest
 * supplies it through the REGISTRY_FILE token.
 */
@Injectable()
export class RegistryService {
  private readonly file: string;

  constructor(@Optional() @Inject(REGISTRY_FILE) file?: string) {
    this.file = file ?? defaultRegistryFile();
  }

  load(): Registry {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Registry;
      if (!Array.isArray(data.projects)) throw new Error('bad shape');
      return data;
    } catch {
      return { projects: [] };
    }
  }

  listProjects(): RegistryProject[] {
    return this.load().projects
      .map((project) => ({
        ...project,
        guides: project.guides.filter((g) => {
          if (existsSync(g.path)) return true;
          console.error(`stale guide hidden: ${g.path}`);
          return false;
        })
      }))
      .filter((project) => project.guides.length > 0);
  }

  allowlist(): Set<string> {
    return buildAllowlist(this.load());
  }

  /**
   * Requests carry the resolved realpath (see resolveAllowed) while the registry
   * stores whatever path the skill handed in, so an exact hit is tried first and
   * symlinked entries are resolved only on miss.
   */
  guideMeta(realPath: string): GuideMeta {
    const entries = this.load().projects.flatMap((p) => p.guides.map((g) => [p, g] as const));
    const hit =
      entries.find(([, g]) => g.path === realPath) ||
      entries.find(([, g]) => this.realOrNull(g.path) === realPath);
    if (!hit) return { title: basename(realPath) };
    const [project, guide] = hit;
    return { title: guide.title, type: guide.type, project: project.name };
  }

  private realOrNull(p: string): string | null {
    try {
      return realpathSync(p);
    } catch {
      return null;
    }
  }
}
```

`server/src/registry/registry.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { RegistryService, REGISTRY_FILE, defaultRegistryFile } from './registry.service';

@Module({
  providers: [
    { provide: REGISTRY_FILE, useFactory: defaultRegistryFile },
    RegistryService
  ],
  exports: [RegistryService]
})
export class RegistryModule {}
```

- [ ] **Step 5: Run the registry tests to verify they pass**

Run: `npx jest test/registry.test.ts`
Expected: PASS, all 7 cases.

- [ ] **Step 6: Write the failing guides e2e test**

`test/guides.e2e.test.ts` — builds the same fixture, overrides the
`REGISTRY_FILE` token, and asserts the JSON shape:

```ts
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

  afterAll(async () => { await app.close(); });

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
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx jest test/guides.e2e.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement the controller and module**

```ts
import { Controller, Get } from '@nestjs/common';

import { RegistryService } from '../registry/registry.service';
import type { GuidesIndex } from '../../../shared/types';

/**
 * The guides index the client renders its card list from. Progress is attached
 * here (as null until ProgressModule lands) so the client makes one request,
 * not one per card.
 */
@Controller('api/guides')
export class GuidesController {
  constructor(private readonly registry: RegistryService) {}

  @Get()
  index(): GuidesIndex {
    return {
      projects: this.registry.listProjects().map((project) => ({
        name: project.name,
        path: project.path,
        guides: project.guides.map((g) => ({
          path: g.path,
          title: g.title,
          type: g.type,
          updated: g.updated,
          href: `/guide?p=${encodeURIComponent(g.path)}`,
          progress: null
        }))
      }))
    };
  }
}
```

`guides.module.ts` imports `RegistryModule`, declares `GuidesController`.
Then add `GuidesModule` to `AppModule.imports`.

- [ ] **Step 9: Run the guides tests to verify they pass**

Run: `npx jest test/guides.e2e.test.ts`
Expected: PASS, both cases.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: registry service and GET /api/guides"
```

---

### Task 4: `/guide` and `/asset` on Nest, and the old server deleted

The compatibility task. Everything `test/server.test.js` asserted has to hold
on the new stack, because those assertions are the contract the already-written
guides link against.

**Files:**
- Create: `server/src/render/render.controller.ts`
- Create: `server/src/render/render.module.ts`
- Create: `server/src/render/mime.ts`
- Create: `test/render.e2e.test.ts`
- Delete: `server/server.js`, `server/lib/render.js`, `server/lib/paths.js`, `test/server.test.js`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `RegistryService` (Task 3); `renderMarkdown`, `wrapPage`, `breadcrumbBar`, `deckFrame` (Task 2); `resolveAllowed` (Task 2).
- Produces: `GET /guide?p=<abs>` → themed HTML page (markdown rendered inline, `.html`/`.htm` framed); `GET /asset?p=<abs>` → verbatim bytes with a content type from `MIME`; `MIME: Record<string, string>` in `mime.ts`.

- [ ] **Step 1: Port `test/server.test.js` to `test/render.e2e.test.ts`**

Convert all 13 cases, replacing the `withServer` helper (which called
`createServer` and `listen(0)`) with a Nest testing module plus supertest. The
fixture builder stays as-is. Keep every case, in particular:

- index/stale-guide behaviour now belongs to `guides.e2e` (Task 3) — drop the
  two index cases here rather than duplicating them, and drop
  `'serves style.css'` (Task 5 owns it) and `'unknown route is 404'` (Task 7
  owns it, since the SPA fallback changes that answer).
- Keep: renders a registered markdown guide; serves a tutor deck verbatim from
  `/asset`; wraps a tutor deck in a shell with breadcrumb and framed deck
  (including following the iframe's own `src` rather than reconstructing it);
  serves sibling asset and rejects unregistered file; rejects traversal; guide
  page carries a breadcrumb back to the index; unregistered sibling titled by
  filename; titles a guide registered through a symlinked directory.

```ts
const moduleRef = await Test.createTestingModule({
  controllers: [RenderController],
  providers: [{ provide: REGISTRY_FILE, useValue: registryFile }, RegistryService]
}).compile();
app = moduleRef.createNestApplication();
await app.init();

// then, per case:
const p = encodeURIComponent(join(root, 'proj', 'guides', 'a.md'));
const res = await request(app.getHttpServer()).get(`/guide?p=${p}`).expect(200);
expect(res.headers['content-type']).toMatch(/text\/html/);
expect(res.text).toMatch(/<h1[^>]*>Alpha Guide<\/h1>/);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest test/render.e2e.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `mime.ts`**

Copy the `MIME` map from `server/server.js` unchanged (`.html`, `.css`, `.js`,
`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.pdf`, `.txt`, `.json`) and
export it as `Record<string, string>`.

- [ ] **Step 4: Implement `RenderController`**

```ts
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MIME } from './mime';
import { deckFrame, breadcrumbBar, renderMarkdown, wrapPage } from './render.util';
import { resolveAllowed } from './paths.util';
import { RegistryService } from '../registry/registry.service';

@Controller()
export class RenderController {
  constructor(private readonly registry: RegistryService) {}

  /**
   * The read-it-here route: always carries the breadcrumb. A markdown guide is
   * rendered inline; a generated deck is framed so its own inline CSS/JS and
   * its Next/Back controls reach the browser untouched.
   */
  @Get('guide')
  guide(@Query('p') requested: string, @Res() res: Response): void {
    const real = this.resolve(requested);
    const meta = this.registry.guideMeta(real);
    const ext = extname(real).toLowerCase();

    if (ext === '.md') {
      const md = readFileSync(real, 'utf8');
      res.type(MIME['.html']).send(wrapPage(meta.title, renderMarkdown(md, real), breadcrumbBar(meta)));
      return;
    }
    if (ext === '.html' || ext === '.htm') {
      const src = `/asset?p=${encodeURIComponent(real)}`;
      res.type(MIME['.html']).send(
        wrapPage(meta.title, deckFrame(src, meta.title), breadcrumbBar(meta), { bodyClass: 'deck-host' })
      );
      return;
    }
    // Anything else is not a guide — hand it to the verbatim route's rules.
    res.type(MIME[ext] || 'application/octet-stream').send(readFileSync(real));
  }

  /** The verbatim route the deck frame and inline images pull from. */
  @Get('asset')
  asset(@Query('p') requested: string, @Res() res: Response): void {
    const real = this.resolve(requested);
    const ext = extname(real).toLowerCase();
    // A raw .md request is text, not a download: the old server served it as
    // text/plain and rewritten links rely on that.
    const type = ext === '.md' ? MIME['.txt'] : MIME[ext] || 'application/octet-stream';
    res.type(type).send(readFileSync(real));
  }

  /**
   * The security boundary. `resolveAllowed` realpaths the request and refuses
   * anything outside a registered guide's own directory — traversal, symlink
   * escape and prefix-sibling attacks all die here. A 404 rather than a 403:
   * the existence of a path outside the allowlist is not ours to confirm.
   */
  private resolve(requested: string): string {
    const real = resolveAllowed(requested || '', this.registry.allowlist());
    if (!real || !statSync(real).isFile()) throw new NotFoundException('not found');
    return real;
  }
}
```

- [ ] **Step 5: Run the render e2e tests to verify they pass**

Run: `npx jest test/render.e2e.test.ts`
Expected: PASS, all kept cases.

- [ ] **Step 6: Delete the old server**

```bash
git rm server/server.js server/lib/render.js server/lib/paths.js test/server.test.js
```

`exitOnSourceChange` and `GM_RESTART_ON_CHANGE` leave with it — that is the
whole of the launchd removal on the server side.

- [ ] **Step 7: Run the whole suite and commit**

Run: `npx jest`
Expected: PASS. Confirm `server/` no longer contains any `.js` source.

```bash
git add -A
git commit -m "feat: serve /guide and /asset from Nest, delete the old server"
```

---

### Task 5: Themed, bionic-capable SSR pages

Makes the pages you actually read honour the theme picked in the client's
Settings, and carry the vendored reading aid.

**Files:**
- Create: `shared/theme.css`
- Create: `server/src/render/assets.controller.ts`
- Modify: `server/src/render/render.util.ts` (`wrapPage` head injection)
- Modify: `server/public/style.css` (consume the theme tokens)
- Modify: `test/render.test.ts` (new `wrapPage` cases)
- Test: `test/assets.e2e.test.ts`

**Interfaces:**
- Consumes: `wrapPage` (Task 2).
- Produces: `GET /style.css`, `GET /theme.css`, `GET /bionic.css`, `GET /bionic.js` — all served with correct content types; `wrapPage` output additionally containing the theme-stamp script and links to those three stylesheets plus the bionic script.

- [ ] **Step 1: Create `shared/theme.css`**

Port the five `[data-theme]` blocks from
`../claude-agents-dashboard/client/src/styles.css` lines 9–95 — `midnight`,
`graphite`, `amber`, `nightshift`, `daylight` — plus the `:root` fallback. Copy
the custom property names verbatim (`--board`, `--strip`, `--strip-hi`,
`--steel`, `--ink`, `--ink2`, `--hairline`, `--hairline2`, `--edge`, `--cyan`,
`--amber`, `--shadow2`, and the `--bg`/`--surface`/`--accent` aliases). One file
shared by two consumers: this server links it, and the client task imports the
same file, so a palette can never drift between the shell and the guide body.

- [ ] **Step 2: Write the failing `wrapPage` cases in `test/render.test.ts`**

```ts
it('wrapPage stamps the saved theme before first paint', () => {
  const page = wrapPage('T', '<p>hi</p>');
  expect(page).toContain("localStorage.getItem('guide-manager.settings')");
  expect(page).toContain('dataset.theme');
  // The stamp must precede the stylesheets, or the first paint is unthemed.
  expect(page.indexOf('dataset.theme')).toBeLessThan(page.indexOf('href="/theme.css"'));
});

it('wrapPage links the theme tokens, the page styles and the reading aid', () => {
  const page = wrapPage('T', '<p>hi</p>');
  expect(page).toContain('href="/theme.css"');
  expect(page).toContain('href="/style.css"');
  expect(page).toContain('href="/bionic.css"');
  expect(page).toContain('src="/bionic.js"');
});

it('wrapPage loads the reading aid after the body it decorates', () => {
  const page = wrapPage('T', '<p>hi</p>');
  expect(page.indexOf('<main>')).toBeLessThan(page.indexOf('src="/bionic.js"'));
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx jest test/render.test.ts`
Expected: FAIL on the three new cases, PASS on the existing ones.

- [ ] **Step 4: Extend `wrapPage`**

```ts
/**
 * Stamped before the stylesheets so a load never flashes the default palette —
 * worst on the light theme. Inline and tiny on purpose: it has to run before
 * paint, so it cannot be a module. Mirrors the client's own pre-paint script in
 * client/index.html; fails silently (private mode, no storage) to the default.
 */
const THEME_STAMP = `<script>
try {
  var s = JSON.parse(localStorage.getItem('guide-manager.settings') || '{}');
  if (s.theme) document.documentElement.dataset.theme = s.theme;
} catch (e) {}
</script>`;

export function wrapPage(
  title: string,
  bodyHtml: string,
  headerHtml = '',
  { bodyClass = '' }: { bodyClass?: string } = {}
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${THEME_STAMP}
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/bionic.css">
</head>
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ''}>
${headerHtml}<main class="wrap">${bodyHtml}</main>
<script src="/bionic.js"></script>
</body>
</html>`;
}
```

`main` gains `class="wrap"` because `bionic.js` looks for `.wrap`, then
`.shell`, then `body` as its decoration root — matching `.wrap` keeps the aid
off the breadcrumb bar. `bionic.js` is loaded at the end of `<body>`, so its
`DOMContentLoaded`/ready branch finds the content already parsed. The aid's own
`SKIP` list already excludes `pre`, `code` and every heading level, so no extra
configuration is needed here.

- [ ] **Step 5: Run the render tests to verify they pass**

Run: `npx jest test/render.test.ts`
Expected: PASS, including the `href="/style.css"` case from Task 2.

- [ ] **Step 6: Write the failing assets e2e test**

`test/assets.e2e.test.ts` asserts each of the four static routes returns 200
with the right content type, and that `/bionic.js` really is the vendored file:

```ts
it('serves the vendored reading aid, not a copy', async () => {
  const res = await request(app.getHttpServer()).get('/bionic.js').expect(200);
  expect(res.headers['content-type']).toMatch(/javascript/);
  expect(res.text).toContain('bionic v1 — vendored from guide-manager assets/');
  expect(res.text).toBe(readFileSync(join(__dirname, '..', 'assets', 'bionic.js'), 'utf8'));
});
```

- [ ] **Step 7: Run it to verify it fails, then implement `AssetsController`**

Four `@Get()` handlers reading from `server/public/style.css`,
`shared/theme.css`, `assets/bionic.css`, `assets/bionic.js`, each setting its
type from `MIME`. Read per request (the old server re-read `style.css` every
time, which is why a CSS edit needed no restart) and resolve paths from
`__dirname` so a built `dist/` layout still finds them — compute the repo root
once as a module constant and assert in the test that all four exist.

- [ ] **Step 8: Repoint `server/public/style.css` at the theme tokens**

Replace its `:root` / `prefers-color-scheme` block with references to the
shared tokens: `--bg` → `var(--board)`, `--fg` → `var(--ink)`, `--muted` →
`var(--ink2)`, `--line` → `var(--hairline)`, `--card` → `var(--strip)`,
`--accent` → `var(--cyan)`. Everything below that block — the topbar, deck-host,
badge and table rules — is unchanged. `assets/bionic.css` already styles itself
from `--line`, `--panel`, `--accent`, `--muted`, `--fg`; add a `--panel:
var(--strip-hi)` alias so the in-guide panel keeps a surface.

- [ ] **Step 9: Run the whole suite and commit**

Run: `npx jest`

```bash
git add -A
git commit -m "feat: theme tokens and the reading aid on server-rendered guide pages"
```

---

### Task 6: Mongo and reading progress

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `server/src/progress/progress.schema.ts`
- Create: `server/src/progress/progress.service.ts`
- Create: `server/src/progress/progress.controller.ts`
- Create: `server/src/progress/progress.module.ts`
- Create: `server/src/progress/progress.dto.ts`
- Create: `test/progress.test.ts`
- Modify: `server/src/app.module.ts` (Mongoose root + `ProgressModule`)
- Modify: `server/src/guides/guides.controller.ts` (join progress into the index)
- Modify: `server/src/guides/guides.module.ts` (import `ProgressModule`)
- Modify: `server/src/render/render.util.ts` (scroll reporter in `wrapPage`)
- Modify: `test/guides.e2e.test.ts` (progress now non-null when a doc exists)
- Modify: `.gitignore` (add `.env`)

**Interfaces:**
- Consumes: `RegistryService` (Task 3), `GuideProgress` (Task 3).
- Produces:
  - `ReadingProgress` schema: `guidePath: string` (unique index), `project: string`, `lastOpenedAt: Date`, `openCount: number`, `scrollPercent: number`, `completed: boolean`, plus Mongoose `timestamps` for `updatedAt`.
  - `ProgressService.find(guidePaths: string[]): Promise<Map<string, GuideProgress>>`
  - `ProgressService.record(dto: RecordProgressDto): Promise<GuideProgress>`
  - `GET /api/progress` → `GuideProgress[]`; `POST /api/progress` → `GuideProgress`.

- [ ] **Step 1: Add `docker-compose.yml`**

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - '27017:27017'
    volumes:
      - guide-manager-mongo:/data/db

volumes:
  guide-manager-mongo:
```

- [ ] **Step 2: Add `.env.example` and gitignore `.env`**

```
# Mongo is required at boot: no database, no server.
MONGO_URL=mongodb://localhost:27017/guide-manager
PORT=4321
# Absolute path to the registry written by bin/register.js.
# GM_REGISTRY_FILE=/Users/you/.guide-manager/registry.json
```

- [ ] **Step 3: Write the failing progress test**

`test/progress.test.ts`, using `mongodb-memory-server` so the suite needs no
running daemon:

```ts
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

  const post = (body: unknown) => request(app.getHttpServer()).post('/api/progress').send(body);

  it('creates a document on first open with openCount 1', async () => {
    const res = await post({ guidePath: '/p/a.md', project: 'p', scrollPercent: 12 }).expect(201);
    const body = res.body as GuideProgress;
    expect(body.openCount).toBe(1);
    expect(body.scrollPercent).toBe(12);
    expect(body.completed).toBe(false);
  });

  it('upserts the same guidePath rather than inserting a second row', async () => {
    await post({ guidePath: '/p/b.md', project: 'p', scrollPercent: 10 }).expect(201);
    await post({ guidePath: '/p/b.md', project: 'p', scrollPercent: 40 }).expect(201);
    const all = (await request(app.getHttpServer()).get('/api/progress').expect(200)).body as GuideProgress[];
    expect(all.filter(p => p.scrollPercent === 40)).toHaveLength(1);
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
  });
});
```

`completed` staying true across a write that omits it is the one place
last-write-wins is deliberately not literal: finishing a guide is a fact, and a
later glance at page one is not evidence you unread it. Everything else — the
scroll position included — takes the newest value.

- [ ] **Step 4: Run it to verify it fails**

Run: `npx jest test/progress.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement the schema**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One document per guide file. Keyed by absolute path because that is what the
 * registry stores and what /guide requests carry — there is no other stable id
 * for a guide, and a title can change without the guide becoming a new thing.
 *
 * Per-guide granularity only: no per-heading and no per-deck-card state. A
 * finer model would need stable heading ids or a POST from generated decks,
 * both of which are their own piece of work.
 */
@Schema({ timestamps: true, collection: 'reading_progress' })
export class ReadingProgress {
  @Prop({ required: true, unique: true, index: true })
  guidePath: string;

  @Prop({ required: true })
  project: string;

  @Prop({ required: true })
  lastOpenedAt: Date;

  @Prop({ required: true, default: 0 })
  openCount: number;

  @Prop({ required: true, default: 0, min: 0, max: 100 })
  scrollPercent: number;

  @Prop({ required: true, default: false })
  completed: boolean;
}

export type ReadingProgressDocument = HydratedDocument<ReadingProgress>;
export const ReadingProgressSchema = SchemaFactory.createForClass(ReadingProgress);
```

- [ ] **Step 6: Implement the DTO with validation**

`progress.dto.ts` — a plain class plus a hand-written guard rather than
`class-validator`, keeping the dependency list short:

```ts
export interface RecordProgressDto {
  guidePath: string;
  project: string;
  scrollPercent: number;
  completed?: boolean;
}

const clamp = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number.parseFloat(String(n));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
};

/** Returns null when the body is unusable, so the controller can 400 it. */
export function parseRecordProgress(body: unknown): RecordProgressDto | null {
  const b = (body && typeof body === 'object' ? body : {}) as Partial<RecordProgressDto>;
  if (typeof b.guidePath !== 'string' || b.guidePath.length === 0) return null;
  return {
    guidePath: b.guidePath,
    project: typeof b.project === 'string' ? b.project : '',
    scrollPercent: clamp(b.scrollPercent),
    completed: b.completed === true ? true : undefined
  };
}
```

- [ ] **Step 7: Implement the service**

`record()` is one `findOneAndUpdate` with `upsert: true`, `new: true`:
`$set` the scroll position, project and `lastOpenedAt: new Date()`; `$inc`
`openCount` by 1; `$set` `completed: true` only when the DTO asked for it (so
the omitted case leaves the stored value alone). `find(paths)` does one
`find({ guidePath: { $in: paths } })` and returns a `Map` — one query per index
render, not one per card. Both map documents to the wire type with
`lastOpenedAt.toISOString()`.

- [ ] **Step 8: Implement the controller**

`GET /api/progress` returns everything; `POST /api/progress` runs
`parseRecordProgress` and throws `new BadRequestException('guidePath is required')`
on null, otherwise returns `record()`.

- [ ] **Step 9: Run the progress tests to verify they pass**

Run: `npx jest test/progress.test.ts`
Expected: PASS, all 6 cases.

- [ ] **Step 10: Wire Mongo into `AppModule`, required at boot**

```ts
MongooseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    uri: config.get<string>('MONGO_URL') ?? 'mongodb://localhost:27017/guide-manager',
    // Nest's default is to retry forever, which would leave the process up with
    // a dead database. Mongo is a hard requirement here: fail the boot instead,
    // and let main.ts's catch exit non-zero with a readable message.
    retryAttempts: 2,
    retryDelay: 1000
  })
})
```

- [ ] **Step 11: Join progress into `GET /api/guides`**

`GuidesController` gains `ProgressService`, collects every guide path from
`listProjects()`, makes one `find()` call, and fills each entry's `progress`
from the map (`null` when absent). Update `test/guides.e2e.test.ts`: its module
now needs the Mongo test imports, and add a case asserting a guide with a
recorded document reports it.

- [ ] **Step 12: Add the scroll reporter to `wrapPage`**

A small inline script at the end of `<body>`, after `/bionic.js`:

```ts
/**
 * Reports reading position for the guide this page renders. Throttled with
 * requestAnimationFrame-free arithmetic — a timer, not a scroll-per-frame POST —
 * and sent with `keepalive` so the last position survives the tab closing.
 * `completed` fires once, at the bottom, rather than being computed server-side:
 * only the browser knows the viewport.
 */
function progressReporter(guidePath: string, project: string): string { /* ... */ }
```

It must POST `{ guidePath, project, scrollPercent, completed }` to
`/api/progress` on load and then at most once every 5 seconds while scrolling.
`wrapPage` takes two new optional arguments (`guidePath`, `project`) and omits
the script entirely when they are absent — so the existing `wrapPage` unit tests
keep passing unchanged, and a deck page (which scrolls inside its iframe, where
this script cannot see it) reports only the open, not a position. Add a
`render.test.ts` case for both branches.

- [ ] **Step 13: Run the whole suite and commit**

Run: `npx jest`

```bash
git add -A
git commit -m "feat: Mongo-backed per-guide reading progress"
```

---

### Task 7: Serve the client bundle when one exists

Last, because it changes what an unknown route answers — and it has to be
harmless while `client/dist` does not yet exist.

**Files:**
- Modify: `server/src/app.module.ts`
- Create: `server/src/static.ts`
- Test: `test/static.e2e.test.ts`

**Interfaces:**
- Consumes: `AppModule`.
- Produces: `clientDistModules(): DynamicModule[]` — `[ServeStaticModule.forRoot(...)]` when `client/dist/index.html` exists, `[]` otherwise.

- [ ] **Step 1: Write the failing static test**

Two cases, and the second is the one that matters for shipping this task alone:

```ts
it('404s an unknown route when no client bundle is built', async () => {
  // clientDistModules() returns [] — nothing to fall back to, so Nest answers 404
  // rather than the app booting into a broken static handler.
  await request(app.getHttpServer()).get('/no-such-page').expect(404);
});

it('never lets the SPA fallback swallow an API or render route', async () => {
  await request(app.getHttpServer()).get('/api/guides').expect(200);
  await request(app.getHttpServer()).get('/asset?p=/nope').expect(404);
});
```

- [ ] **Step 2: Run it to verify it fails, then implement `static.ts`**

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ServeStaticModule } from '@nestjs/serve-static';
import type { DynamicModule } from '@nestjs/common';

const CLIENT_DIST = join(__dirname, '..', '..', 'client', 'dist');

/**
 * The client bundle is built by a separate task and a separate toolchain. Until
 * it exists, registering ServeStaticModule would install a catch-all handler
 * with nothing behind it — so the module is registered conditionally and the
 * server stays useful (API + /guide + /asset) on its own.
 */
export function clientDistModules(): DynamicModule[] {
  if (!existsSync(join(CLIENT_DIST, 'index.html'))) {
    console.warn(`no client bundle at ${CLIENT_DIST} — serving the API and guide routes only`);
    return [];
  }
  return [
    ServeStaticModule.forRoot({
      rootPath: CLIENT_DIST,
      // Express 5 path syntax (Nest 11). On Nest 10 these are '/api/(.*)' etc —
      // verify against the installed version before trusting either form.
      exclude: ['/api/{*path}', '/guide', '/asset']
    })
  ];
}
```

Spread it into `AppModule.imports` with `...clientDistModules()`.

- [ ] **Step 3: Run the whole suite**

Run: `npx jest`
Expected: PASS.

- [ ] **Step 4: Verify the real thing end to end**

```bash
docker compose up -d mongo
npm run build && npm start
```

Then check, with a guide registered:
- `curl -s localhost:4321/api/health` → `{"ok":true}`
- `curl -s localhost:4321/api/guides | head -c 400` → the registry as JSON
- `curl -s "localhost:4321/guide?p=<abs path to a registered .md>" | head -40` → themed HTML with the theme-stamp script and `/bionic.js`
- `curl -s -o /dev/null -w '%{http_code}' "localhost:4321/asset?p=/etc/passwd"` → `404`
- Stop Mongo, restart the server → the process exits non-zero with a readable message rather than listening.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: serve the client bundle when one is built"
```

---

## Self-review notes

- **Spec coverage.** Registry → Task 3. Guides API → Task 3 (+ progress join in 6). Render/paths port → Task 2. `/guide` + `/asset` → Task 4. Progress schema and endpoints → Task 6. docker-compose + `.env.example` → Task 6. Mongo-required-at-boot → Task 6 Step 10 + Task 7 Step 4. Port 4321 → Task 1. launchd removal → Task 1 Step 13 (directory, test) and Task 4 Step 6 (`exitOnSourceChange`, `GM_RESTART_ON_CHANGE`, with `server/server.js`). Jest conversion → Tasks 1, 2, 4. `bin/register.js` untouched → Task 1 Step 3 (`bin/package.json`). `wrapPage` theme + bionic injection → Task 5. Static client → Task 7.
- **Two deviations worth a reviewer's attention.** `register.test.ts` moves from importing functions to spawning the CLI (Task 1 Step 12) because CJS Jest cannot require an ESM module that must keep its bytes. And `test/server.test.js`'s index, `style.css` and unknown-route cases move to the tasks that own those routes instead of being duplicated (Task 4 Step 1).
- **Not verified against the installed version.** `ServeStaticModule`'s `exclude` pattern syntax differs between Nest 10 (Express 4) and Nest 11 (Express 5); Task 7 says to check rather than assume.

## Test cases

- `bionic.test.ts` — all existing pure-function cases pass under Jest with the vendored `assets/bionic.js` unedited.
- `register.test.ts` — CLI creates, upserts, survives corrupt/wrong-shape registries, leaves no `.tmp`, and exits 0 on bad input.
- `render.test.ts` — all 15 ported cases, plus theme-stamp ordering, the four asset links, and the reporter's present/absent branches.
- `paths.test.ts` — all 8 cases: allowlist contents, sibling asset, outside-dir, dot-dot, escaping symlink, nonexistent, prefix-sibling.
- `registry.test.ts` — stale-guide hiding, missing/corrupt/wrong-shape recovery, title from registry, basename fallback, symlinked-directory resolution.
- `guides.e2e.test.ts` — grouped-by-project index, stale guides hidden, ready-made `href`, `progress: null` before any read and populated after.
- `render.e2e.test.ts` — markdown rendered, deck framed not inlined, deck served verbatim through the followed iframe `src`, sibling asset served, unregistered file 404, traversal 404, breadcrumb present, unregistered sibling titled by filename, symlinked-directory guide titled from the registry.
- `assets.e2e.test.ts` — `/style.css`, `/theme.css`, `/bionic.css`, `/bionic.js` each 200 with the right type; `/bionic.js` byte-identical to the vendored file.
- `progress.test.ts` — first-open creation, upsert not duplicate, last-write-wins on scroll, `completed` sticky, clamping, 400 on missing `guidePath`.
- `static.e2e.test.ts` — unknown route 404s with no bundle built; `/api/guides` and `/asset` never swallowed by the fallback.
- `health.e2e.test.ts` — `GET /api/health` → `{ ok: true }`.

## Done when

- `npx jest` passes with every suite above, and no `.test.js` files remain in `test/`.
- `npm run typecheck` passes.
- `server/` contains no `.js` source; `server/server.js`, `server/lib/render.js`, `server/lib/paths.js` are deleted.
- `launchd/` and `test/reload.test.js` are gone, and no reference to `GM_RESTART_ON_CHANGE` or `exitOnSourceChange` remains (`git grep` clean).
- `bin/register.js` is byte-identical to its pre-task state (`git diff` shows only the added `bin/package.json`), and running it still registers a guide.
- With `docker compose up -d mongo` and `npm start`: `/api/health`, `/api/guides`, `/guide?p=…` and `/asset?p=…` all behave as in Task 7 Step 4, and `/asset?p=/etc/passwd` is a 404.
- With Mongo stopped, `npm start` exits non-zero with a readable message instead of listening.
- The client-port task can start against a running server: `GET /api/guides` returns real data and `client/dist` is served the moment it exists.
