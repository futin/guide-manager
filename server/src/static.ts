import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ServeStaticModule } from '@nestjs/serve-static';
import type { DynamicModule } from '@nestjs/common';

import { REPO_ROOT } from './render/assets.controller';

export const CLIENT_DIST = join(REPO_ROOT, 'client', 'dist');

/**
 * The client bundle is built by a separate task and a separate toolchain. Until
 * it exists, registering ServeStaticModule would install a catch-all handler
 * with nothing behind it — every unknown route would answer with an error from
 * inside express.static instead of a plain 404. So the module is registered
 * conditionally, and the server stays useful (API + /guide + /asset) on its own.
 *
 * `distDir` is a parameter so the decision is testable without depending on
 * whether a bundle happens to be built in the working tree. Note that the
 * fallback's own HTTP behaviour cannot be asserted from a Nest testing module —
 * ServeStaticModule installs Express middleware that a bare
 * `Test.createTestingModule` does not wire up, so it 404s everything there. It is
 * verified against the running server instead.
 */
export function clientDistModules(distDir: string = CLIENT_DIST): DynamicModule[] {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.warn(`no client bundle at ${distDir} — serving the API and guide routes only`);
    return [];
  }
  return [
    ServeStaticModule.forRoot({
      rootPath: distDir,
      // Express 5 path syntax, which is what Nest 11 ships. Without these the
      // SPA fallback would answer /api/* and the render routes with index.html.
      exclude: [
        '/api/{*path}',
        '/guide',
        '/asset',
        '/style.css',
        '/theme.css',
        '/bionic.css',
        '/bionic.js',
        '/progress.js'
      ]
    })
  ];
}
