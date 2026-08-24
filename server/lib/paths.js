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
