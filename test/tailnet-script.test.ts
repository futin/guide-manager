import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * bin/tailnet.js publishes the Vite dev server onto the tailnet, and the whole
 * reason it exists rather than a hand-typed `tailscale serve` is that the port
 * number must live in exactly one place. compose reads GM_WEB_PORT from .env;
 * so does this script; nothing else knows the number. A literal typed into
 * either side is the drift this suite exists to prevent — and the failure it
 * produces is a 502 from Tailscale on the phone, which reads as a Tailscale
 * problem rather than a config one, so it is worth catching here.
 *
 * Tested as a CLI, like register.test.ts and for the same reason: bin/ is ESM
 * (bin/package.json) while the rest of the repo is CommonJS. `--dry-run` prints
 * the command instead of running it, so the suite never touches the real
 * tailscaled — a test that reconfigured the machine's network to prove a string
 * would be a worse test than no test.
 */
const CLI = join(__dirname, '..', 'bin', 'tailnet.js');
const COMPOSE = join(__dirname, '..', 'docker-compose.yml');

/**
 * The script's own environment, minus anything the ambient shell may have set.
 * GM_WEB_PORT leaking in from the developer's own env would make the fallback
 * cases pass or fail depending on whose machine ran them.
 */
function run(args: string[], env: Record<string, string> = {}): SpawnSyncReturns<string> {
  const clean = { ...process.env };
  delete clean.GM_WEB_PORT;
  delete clean.GM_ENV_FILE;
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...clean, ...env } });
}

/** An .env holding just the one line the script cares about. */
function envFile(body: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'gm-tailnet-')), '.env');
  writeFileSync(file, body);
  return file;
}

describe('bin/tailnet.js', () => {
  it('serves the port GM_WEB_PORT names, from the tailnet to loopback', () => {
    const { status, stdout } = run(['up', '--dry-run'], { GM_WEB_PORT: '5176' });

    expect(status).toBe(0);
    // The listen port and the target port are deliberately the same number on
    // two different addresses: tailscaled answers the tailnet address, and
    // forwards to the loopback socket compose publishes. That symmetry is the
    // feature — one number per project, the same on both sides.
    expect(stdout).toContain('serve --bg --http=5176 http://127.0.0.1:5176');
  });

  it('reads the port out of .env when the variable is not exported', () => {
    // How this actually runs: compose resolves ${GM_WEB_PORT} from .env, and
    // nobody exports it into their shell first. A script that only read the
    // environment would silently serve the default while the stack listened
    // somewhere else.
    const file = envFile('# comment\nGM_WEB_PORT=5199\nPORT=4321\n');
    const { status, stdout } = run(['up', '--dry-run'], { GM_ENV_FILE: file });

    expect(status).toBe(0);
    expect(stdout).toContain('--http=5199 http://127.0.0.1:5199');
  });

  it('prefers an exported variable over the file, as compose does', () => {
    const file = envFile('GM_WEB_PORT=5199\n');
    const { stdout } = run(['up', '--dry-run'], { GM_ENV_FILE: file, GM_WEB_PORT: '5176' });

    expect(stdout).toContain('--http=5176 http://127.0.0.1:5176');
  });

  it('falls back to the same default compose does', () => {
    const { status, stdout } = run(['up', '--dry-run'], { GM_ENV_FILE: envFile('') });

    expect(status).toBe(0);
    expect(stdout).toContain('--http=5175 http://127.0.0.1:5175');
  });

  it('tears down the same port it brought up', () => {
    const { status, stdout } = run(['down', '--dry-run'], { GM_WEB_PORT: '5176' });

    expect(status).toBe(0);
    expect(stdout).toContain('serve --http=5176 off');
  });

  it('refuses a port that is not a port', () => {
    // A typo'd .env would otherwise reach the tailscale CLI as an argument and
    // fail there, with an error about flags rather than about the port.
    for (const bad of ['not-a-number', '0', '70000', '-1']) {
      const { status, stderr } = run(['up', '--dry-run'], { GM_WEB_PORT: bad });
      expect(status).not.toBe(0);
      expect(stderr).toMatch(/port/i);
    }
  });

  it('rejects an unknown subcommand instead of guessing', () => {
    const { status, stderr } = run(['sideways'], { GM_WEB_PORT: '5176' });

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/sideways/);
  });

  it('hardcodes no port of its own', () => {
    // The one invariant worth asserting against the source text: any literal
    // port in here is a second place the number lives.
    const source = readFileSync(CLI, 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');

    // 5175 appears exactly once, as the documented compose default.
    expect(code.match(/\b5175\b/g)).toHaveLength(1);
    expect(code).not.toMatch(/\b5176\b/);
  });
});

describe('docker-compose.yml', () => {
  const compose = readFileSync(COMPOSE, 'utf8');

  it('publishes the web port on loopback only', () => {
    // The wildcard bind this replaced put the guide board — and through it a
    // read-only window onto this machine's filesystem — on every network the
    // laptop joins. The tailnet reaches it through bin/tailnet.js instead,
    // which is a deliberate registration rather than a side effect of the
    // stack being up.
    expect(compose).toContain("'127.0.0.1:${GM_WEB_PORT:-5175}:5175'");
  });

  it('leaves the client container listening on all of its own interfaces', () => {
    // The loopback scope belongs to the host side of the mapping. Vite inside
    // the container still needs host:true — bound to container-localhost it
    // would refuse the forwarded connection, which is the same symptom as the
    // in-place-restart trap CLAUDE.md documents.
    expect(compose).toContain("WEB_PORT: '5175'");
  });

  it('publishes nothing on a wildcard address', () => {
    // The strong form of the invariant, and the one that survives a service
    // being added later: not "these three are loopback" but "no published port
    // is reachable from off this machine". A `- '${GM_FOO_PORT:-1234}:1234'`
    // added without the prefix is the whole of the mistake — Docker's default
    // is every interface, and on a laptop that means every network it joins.
    //
    // The API is the one worth spelling out: it serves the built client bundle
    // and the guide render routes, so a wildcard bind there re-exposes the
    // entire board even with the Vite port shut, and undoes what tailnet.js is
    // for. Mongo's is worse in kind — an unauthenticated database — and better
    // in luck, since nothing but this stack ever wanted it.
    const published = compose
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^- '.*:\d+'$/.test(line));

    // Guard the guard: a compose restructure that stopped matching this shape
    // would otherwise leave an assertion that passes over an empty list.
    expect(published).toHaveLength(3);
    for (const entry of published) {
      expect(entry).toMatch(/^- '127\.0\.0\.1:/);
    }
  });
});
