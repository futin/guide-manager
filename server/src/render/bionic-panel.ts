import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './assets.controller';

/**
 * The vendored reading-aid panel markup, injected into every rendered markdown
 * guide.
 *
 * Not optional decoration: `init()` in assets/bionic.js looks up the panel's
 * controls before it does anything and returns early if any are missing, so a
 * page that links bionic.js without this markup gets no bionic reading at all —
 * and no `storage` listener either, which is what lets a settings change reach an
 * open guide.
 *
 * Read once at module load rather than per request: unlike style.css, this is
 * vendored markup that changes only when the aid is re-copied, and it is spliced
 * into every guide page.
 */
export const BIONIC_PANEL_HTML: string = readFileSync(
  join(REPO_ROOT, 'assets', 'bionic.html'),
  'utf8'
);
