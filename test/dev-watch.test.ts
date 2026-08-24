import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

/**
 * Guards the two halves of a failure that was silent rather than loud.
 *
 * `nest start` spawns the app through a shell by default, so the server runs as
 * a *grandchild* of the CLI. The CLI's restart kills the process tree by walking
 * it with `ps -A -o pid,ppid` — and its helper swallows a missing `ps`, returning
 * an empty child list instead of failing. The dev image is node:20-slim, which
 * has no `ps`. So a rebuild killed only the `/bin/sh -c` wrapper: the real server
 * survived as an orphan still holding :4321, every rebuild after that died with
 * EADDRINUSE, and the container kept serving the pre-edit build until someone
 * restarted it by hand.
 *
 * `--no-shell` is the fix — it makes the server the CLI's direct child, so the
 * kill lands on it and needs no `ps` at all. `procps` is the second layer, for
 * the day the spawn grows a wrapper again. Dropping either one brings back a
 * failure whose symptom is "my edit did nothing", which is why they are asserted
 * here rather than left to a comment.
 */
describe('dev watch restart', () => {
  it('spawns the app without a shell wrapper', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toContain('--no-shell');
  });

  it('gives the dev image the ps the CLI reaches for', () => {
    expect(readFileSync(join(root, 'Dockerfile'), 'utf8')).toMatch(/apt-get install[^\n]*procps/);
  });
});
