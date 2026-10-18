import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { readReleases } from 'release-kit';

import type { ReleasesResponse } from '../../../shared/types';

/**
 * releases.service.ts — `GET /api/releases`: this app's own release history, read from its own checkout's annotated `vX.Y.Z` tags, which
 * `.github/workflows/release.yml` cuts on every releasing merge into `main` (README §Releases; the design is
 * docs/superpowers/specs/2026-10-17-release-versioning-design.md).
 *
 * release-kit's `readReleases` does the reading (D2) — the dashboard's shape, not backlog-manager's re-implementation. backlog-manager re-ran the git reads
 * itself only because its server has a rule that every git read is bounded; this server ran no git at all before this module, so taking the reader whole
 * keeps parity by construction. What that costs, and what this file does about it (D3):
 *
 * - `readReleases` has no timeout. A read is raced against `READ_TIMEOUT_MS`; on expiry the request answers the empty shape and the git child is left to
 *   finish on its own — nothing waits on it, and the in-flight slot is cleared, so the next request starts a fresh read rather than joining a hung one.
 * - `readReleases` never rejects: no git, no checkout, a `safe.directory` refusal and "no tags yet" all come back as the same empty shape. An empty answer
 *   therefore cannot be told apart from a failure, so **only an answer with releases in it is memoised** — the dashboard memoises whatever returns, which
 *   would pin one transient failure until HEAD or a tag next moved. The price is a re-read per request on a checkout with no tags, which is cheap.
 *
 * The memo key is HEAD plus the mtimes of `packed-refs` and `refs/tags` under the COMMON git dir, as both parents key it: HEAD alone misses a tag fetched
 * or cut by hand while HEAD stays put (and the release workflow tags `main` after the merge you already pulled), and in a linked worktree the worktree's
 * own git dir holds no tags at all. `refs/tags` moves when a loose tag is added or removed, `packed-refs` when `git pack-refs`/`gc` moves tags into it. A
 * key git cannot produce is never memoised.
 */

const READ_TIMEOUT_MS = 10_000;

const EMPTY: ReleasesResponse = { current: null, releases: [] };

/** The first directory at or above `from` that holds a `.git` entry — a directory in a main checkout, a FILE in a linked worktree. */
export function findRepoRoot(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The checkout whose tags are read: `GM_RELEASES_ROOT` when set (the test seam, read per request), else this server's own checkout, found from its own
 * files — never `process.cwd()`, which is wherever the server happened to be started. In the compose stack that is `/app`, the bind-mounted checkout with
 * its `.git`; the image carries `git` and `safe.directory '*'` for exactly this read (Dockerfile).
 */
export function releasesRoot(): string | null {
  return process.env.GM_RELEASES_ROOT || findRepoRoot(__dirname);
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((done) => {
    execFile('git', args, { cwd, encoding: 'utf8', timeout: READ_TIMEOUT_MS }, (err, stdout) => done(err ? null : stdout));
  });
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

async function memoKey(root: string): Promise<string | null> {
  const out = await git(root, ['rev-parse', 'HEAD', '--git-common-dir']);
  if (out === null) return null;
  const [head, common] = out.trim().split('\n');
  if (!head || !common) return null;
  const dir = resolve(root, common);
  return [root, head, mtime(join(dir, 'packed-refs')), mtime(join(dir, 'refs', 'tags'))].join('\0');
}

/** `readReleases`, or the empty shape once `READ_TIMEOUT_MS` passes. The timer is cleared on a timely answer and never holds the process open. */
function boundedRead(root: string): Promise<ReleasesResponse> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(EMPTY), READ_TIMEOUT_MS);
    timer.unref();
    readReleases(root).then(
      (value) => {
        clearTimeout(timer);
        done(value as ReleasesResponse);
      },
      () => {
        clearTimeout(timer);
        done(EMPTY);
      }
    );
  });
}

@Injectable()
export class ReleasesService {
  private memo: { key: string; value: ReleasesResponse } | null = null;
  private inflight: { key: string; promise: Promise<ReleasesResponse> } | null = null;

  async read(): Promise<ReleasesResponse> {
    const root = releasesRoot();
    if (root === null) return EMPTY;
    const key = await memoKey(root);
    if (key === null) return boundedRead(root);
    if (this.memo?.key === key) return this.memo.value;
    // Concurrent requests under one key share one read.
    if (this.inflight?.key === key) return this.inflight.promise;

    const entry = { key, promise: boundedRead(root) };
    this.inflight = entry;
    try {
      const value = await entry.promise;
      if (value.releases.length > 0) this.memo = { key, value };
      return value;
    } finally {
      // Dropped only if still ours: a request under a newer key may already have replaced it.
      if (this.inflight === entry) this.inflight = null;
    }
  }
}
