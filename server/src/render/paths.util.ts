import { realpathSync } from 'node:fs';
import { dirname, sep } from 'node:path';

import type { Registry } from '../../../shared/types';

// A registered guide's parent directory is servable (guide + its assets).
export function buildAllowlist(registry: Registry): Set<string> {
  const dirs = new Set<string>();
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

export function resolveAllowed(requestPath: string, allowedDirs: Set<string>): string | null {
  let real: string;
  try {
    real = realpathSync(requestPath);
  } catch {
    return null;
  }
  for (const dir of allowedDirs) {
    // `dir + sep`, not `dir`: a bare prefix check would let /x/guides-evil
    // through on an allowlist entry of /x/guides.
    if (real.startsWith(dir + sep)) return real;
  }
  return null;
}
