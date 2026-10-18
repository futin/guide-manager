import { Injectable } from '@nestjs/common';
import { createReleasesReader, findRepoRoot } from 'release-kit';

import type { ReleasesResponse } from '../../../shared/types';

/**
 * releases.service.ts — `GET /api/releases`: this app's own release history, read from its own checkout's annotated `vX.Y.Z` tags, which
 * `.github/workflows/release.yml` cuts on every releasing merge into `main` (README §Releases; the design is
 * docs/superpowers/specs/2026-10-17-release-versioning-design.md).
 *
 * The whole read is release-kit's `createReleasesReader` — the git, the memo key and the bound used to live here and now live there, shared with every app
 * that shows its releases (release-kit spec 2026-10-18-shared-releases-ui-design, D4–D6). What this file still owns is only where the checkout is.
 *
 * - **No race against a timer.** The reader bounds every git read itself (10 s by default) and never rejects, so the 10 s race this service ran around an
 *   unbounded `readReleases` is gone: a hung git child is killed, not left to finish on its own.
 * - **A complete empty answer is memoised now** (D5). `readReleasesResult` says whether an answer is complete, so "no tags yet" no longer reads the same as a
 *   failed read — that ambiguity is why only an answer with releases in it used to be memoised. A failed read is still incomplete and still never kept.
 * - The memo key is still HEAD plus the tag refs under the COMMON git dir (a tag cut without moving HEAD, and a linked worktree whose own git dir holds no
 *   tags) — release-kit's now, keyed per root, so a different `GM_RELEASES_ROOT` never sees another root's answer.
 */

// Re-exported so `test/releases.e2e.test.ts` keeps importing it from here: the lookup is release-kit's, the seam around it is this file's.
export { findRepoRoot };

/**
 * The checkout whose tags are read: `GM_RELEASES_ROOT` when set (the test seam, read per request — the reader calls this on every `read()`), else this
 * server's own checkout, found from its own files — never `process.cwd()`, which is wherever the server happened to be started. In the compose stack that is
 * `/app`, the bind-mounted checkout with its `.git`; the image carries `git` and `safe.directory '*'` for exactly this read (Dockerfile).
 */
export function releasesRoot(): string | null {
  return process.env.GM_RELEASES_ROOT || findRepoRoot(__dirname);
}

@Injectable()
export class ReleasesService {
  private readonly reader = createReleasesReader({ root: releasesRoot });

  read(): Promise<ReleasesResponse> {
    return this.reader.read();
  }
}
