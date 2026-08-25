import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MIME } from './mime';

/**
 * Walk up from this file until a directory holds both the page stylesheet and
 * the vendored reading aid.
 *
 * A fixed `../../..` would be wrong in one of the two layouts this file runs
 * in: `server/src/render/` under ts-jest and `nest start`, and a different
 * depth under `dist/` once compiled. Searching for the marker files is
 * layout-independent, and it fails loudly at import time rather than serving
 * 404s for the stylesheets at runtime.
 */
function findRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'assets', 'bionic.js')) && existsSync(join(dir, 'server', 'public', 'style.css'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`cannot locate the guide-manager repo root from ${__dirname}`);
}

export const REPO_ROOT = findRepoRoot();

/**
 * The five files every server-rendered guide page links. Read per request, not
 * cached: the old server re-read style.css on each request, which is why a CSS
 * edit needed no restart, and that property is worth keeping.
 *
 * These are ours and fixed — there is no path parameter here, so none of the
 * allowlist machinery in paths.util applies or is needed.
 */
@Controller()
export class AssetsController {
  @Get('style.css')
  style(@Res() res: Response): void {
    this.sendFile(res, join('server', 'public', 'style.css'), MIME['.css']);
  }

  @Get('theme.css')
  theme(@Res() res: Response): void {
    this.sendFile(res, join('shared', 'theme.css'), MIME['.css']);
  }

  @Get('bionic.css')
  bionicCss(@Res() res: Response): void {
    this.sendFile(res, join('assets', 'bionic.css'), MIME['.css']);
  }

  @Get('bionic.js')
  bionicJs(@Res() res: Response): void {
    this.sendFile(res, join('assets', 'bionic.js'), MIME['.js']);
  }

  /**
   * The progress reporter, spliced into every framed guide by GET /asset.
   *
   * Served rather than vendored for the same reason as the reading aid: one
   * implementation governs every guide the app frames, however old the build is,
   * and a fix reaches all of them without regenerating anything.
   */
  @Get('progress.js')
  progressJs(@Res() res: Response): void {
    this.sendFile(res, join('assets', 'progress.js'), MIME['.js']);
  }

  private sendFile(res: Response, relPath: string, type: string): void {
    res.type(type).send(readFileSync(join(REPO_ROOT, relPath), 'utf8'));
  }
}
