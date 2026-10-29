import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { formatTagMessage, readReleases } from 'release-kit';

import { ReleasesModule } from '../server/src/releases/releases.module';
import { findRepoRoot } from '../server/src/releases/releases.service';
import { listenLoopback } from './listen-loopback';

/*
 * GET /api/releases over real tmpdir repositories. Only `ReleasesModule` is mounted — `AppModule` would boot Mongo for a route that never touches it. Each
 * case points `GM_RELEASES_ROOT` at its own fixture (read per request), and the memo key includes the root, so cases never see each other's answer. Every
 * fixture git call passes its own identity, so CI needs none configured.
 */

jest.setTimeout(20_000);

const ID = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com'];
const scratch: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8' }).trim();
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'gm-releases-'));
  scratch.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  return root;
}

function commit(cwd: string, message: string): void {
  git(cwd, ['commit', '-q', '--allow-empty', '-m', message]);
}

function baseline(cwd: string): void {
  git(cwd, ['tag', '-a', 'v0.1.0', 'HEAD', '-m', 'Baseline — versioning starts here']);
}

type TagInput = Parameters<typeof formatTagMessage>[0];

const FEAT: TagInput = { title: 'feat(releases): version chip', type: 'feat', scope: 'releases', pr: 12, breaking: false, notes: '- Shows the running version' };
const FIX: TagInput = { title: 'fix(rail)!: tighten', type: 'fix', scope: 'rail', pr: 13, breaking: true, notes: '' };

function release(cwd: string, name: string, input: TagInput): void {
  const file = join(cwd, '.git', `msg-${name}`);
  writeFileSync(file, formatTagMessage(input));
  git(cwd, ['tag', '-a', name, 'HEAD', '-F', file, '--cleanup=verbatim']);
}

/** baseline v0.1.0, then v0.2.0 (FEAT), then v0.2.1 (FIX) on HEAD. */
function populated(origin?: string): string {
  const root = repo();
  commit(root, 'chore: start');
  baseline(root);
  commit(root, 'feat(releases): version chip (#12)');
  release(root, 'v0.2.0', FEAT);
  commit(root, 'fix(rail)!: tighten (#13)');
  release(root, 'v0.2.1', FIX);
  if (origin !== undefined) git(root, ['remote', 'add', 'origin', origin]);
  return root;
}

const EMPTY = { current: null, releases: [] };

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [ReleasesModule] }).compile();
  app = moduleRef.createNestApplication();
  await listenLoopback(app);
});

afterAll(async () => {
  await app.close();
  delete process.env.GM_RELEASES_ROOT;
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

async function releasesAt(root: string): Promise<request.Response> {
  process.env.GM_RELEASES_ROOT = root;
  const res = await request(app.getHttpServer()).get('/api/releases');
  expect(res.status).toBe(200);
  return res;
}

const versions = (res: request.Response): string[] => res.body.releases.map((r: { version: string }) => r.version);

describe('GET /api/releases — the empty shape', () => {
  it('a folder that is not a checkout answers the empty shape', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-releases-plain-'));
    scratch.push(dir);
    expect((await releasesAt(dir)).body).toEqual(EMPTY);
  });

  it('a checkout with commits and no tags answers the empty shape', async () => {
    const root = repo();
    commit(root, 'chore: start');
    expect((await releasesAt(root)).body).toEqual(EMPTY);
  });

  it('a lightweight v9.9.9 and an annotated floating v1 are not releases', async () => {
    const root = repo();
    commit(root, 'chore: start');
    git(root, ['tag', 'v9.9.9']);
    git(root, ['tag', '-a', 'v1', '-m', 'floating']);
    expect((await releasesAt(root)).body).toEqual(EMPTY);
  });
});

describe('GET /api/releases — a populated checkout', () => {
  it('lists newest first, the baseline typed baseline, HEAD on a tag at ahead 0', async () => {
    const res = await releasesAt(populated());
    expect(versions(res)).toEqual(['0.2.1', '0.2.0', '0.1.0']);
    expect(res.body.current).toEqual({ version: '0.2.1', ahead: 0 });
    const [fix, feat, base] = res.body.releases;
    expect(base.type).toBe('baseline');
    expect(feat).toMatchObject({ type: 'feat', scope: 'releases', pr: 12, breaking: false, notes: '- Shows the running version' });
    expect(fix).toMatchObject({ type: 'fix', breaking: true, notes: '' });
  });

  it('a commit after the first read moves the key: ahead becomes 1', async () => {
    const root = populated();
    expect((await releasesAt(root)).body.current).toEqual({ version: '0.2.1', ahead: 0 });
    commit(root, 'docs: later');
    expect((await releasesAt(root)).body.current).toEqual({ version: '0.2.1', ahead: 1 });
  });

  it('a tag cut without moving HEAD appears (the common-dir tag mtimes are in the key)', async () => {
    const root = repo();
    commit(root, 'chore: start');
    baseline(root);
    commit(root, 'feat(releases): version chip (#12)');
    expect(versions(await releasesAt(root))).toEqual(['0.1.0']);
    release(root, 'v0.2.0', FEAT);
    const res = await releasesAt(root);
    expect(versions(res)).toEqual(['0.2.0', '0.1.0']);
    expect(res.body.current).toEqual({ version: '0.2.0', ahead: 0 });
  });

  it('a non-GitHub origin gives no url', async () => {
    const res = await releasesAt(populated('https://gitlab.example.com/a/b.git'));
    for (const r of res.body.releases) expect(r.url).toBeUndefined();
  });

  it('a GitHub origin links each release to its PR', async () => {
    const res = await releasesAt(populated('git@github.com:futin/guide-manager.git'));
    expect(res.body.releases[0].url).toBe('https://github.com/futin/guide-manager/pull/13');
    expect(res.body.releases[1].url).toBe('https://github.com/futin/guide-manager/pull/12');
    expect(res.body.releases[2].url).toBeUndefined();
  });

  it('answers exactly what release-kit readReleases answers for the same repo', async () => {
    const root = populated('https://github.com/futin/guide-manager');
    expect((await releasesAt(root)).body).toEqual(await readReleases(root));
  });
});

describe('releases root', () => {
  it('finds the checkout above a nested directory, and null where there is none', () => {
    expect(findRepoRoot(join(__dirname, '..', 'server', 'src', 'releases'))).toBe(join(__dirname, '..'));
    const plain = mkdtempSync(join(tmpdir(), 'gm-releases-root-'));
    scratch.push(plain);
    expect(findRepoRoot(plain)).toBeNull();
  });
});
