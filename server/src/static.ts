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
 */
export function clientDistModules(): DynamicModule[] {
  if (!existsSync(join(CLIENT_DIST, 'index.html'))) {
    console.warn(`no client bundle at ${CLIENT_DIST} — serving the API and guide routes only`);
    return [];
  }
  return [
    ServeStaticModule.forRoot({
      rootPath: CLIENT_DIST,
      // Express 5 path syntax, which is what Nest 11 ships. Without these the
      // SPA fallback would answer /api/* and the render routes with index.html.
      exclude: ['/api/{*path}', '/guide', '/asset', '/style.css', '/theme.css', '/bionic.css', '/bionic.js']
    })
  ];
}
