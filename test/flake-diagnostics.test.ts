import { mkdtempSync, readdirSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFlakeDiagnostics } from './flake-diagnostics';

/**
 * The 401 flake (backlog #5) was sighted twice and captured zero times: the instrument wrote only to stderr, and a full jest run buries or truncates
 * it. This suite pins the part of the instrument that makes the next sighting survive the log — the file under the OS temp directory, the environment snapshot
 * that hypothesis 1 needs (a proxy or harness layer answering instead of the app), and above all the silence on a passing run, because an instrument that
 * writes on every green run is one somebody deletes.
 */
describe('flake diagnostics', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gm-flake-test-'));
  });

  const printed: string[] = [];
  const log = (line: string): void => {
    printed.push(line);
  };

  beforeEach(() => {
    printed.length = 0;
  });

  const lines = (): Record<string, unknown>[] => {
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    return readFileSync(join(dir, files[0]), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  };

  it('writes nothing and prints nothing until something is recorded', () => {
    const diagnostics = createFlakeDiagnostics({ dir, log });
    expect(readdirSync(dir)).toEqual([]);
    expect(printed).toEqual([]);
    expect(diagnostics.logPath()).toBeNull();
  });

  it('names the file on the first record and never again', () => {
    const diagnostics = createFlakeDiagnostics({ dir, log });
    diagnostics.record('first', {});
    const path = diagnostics.logPath();
    expect(path).not.toBeNull();
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain(path as string);
    diagnostics.record('second', {});
    expect(printed).toHaveLength(1);
  });

  it('opens the file with the environment the failing run actually had', () => {
    const diagnostics = createFlakeDiagnostics({
      dir,
      log,
      env: {
        HTTPS_PROXY: 'http://proxy.local:8080',
        NODE_OPTIONS: '--max-old-space-size=4096',
        CLAUDE_CODE_SESSION: 'secret-token',
        PATH: '/usr/bin'
      },
      listeners: () => 'LISTEN 127.0.0.1:4321'
    });
    diagnostics.record('first', {});
    const [header] = lines();
    expect(header.label).toBe('session');
    expect(header.node).toBe(process.version);
    // Values, not just names: "no proxy variables set" was read off a later interactive shell, which is exactly the claim this has to settle from inside the
    // failing process.
    expect(header.proxyEnv).toEqual({ HTTPS_PROXY: 'http://proxy.local:8080' });
    expect(header.nodeEnv).toEqual({ NODE_OPTIONS: '--max-old-space-size=4096' });
    // Harness variables are recorded by name only -- they routinely carry credentials, and which harness ran the suite is answered by the name alone.
    expect(header.harnessEnv).toEqual(['CLAUDE_CODE_SESSION']);
    expect(header.listeners).toBe('LISTEN 127.0.0.1:4321');
  });

  it('redacts credentials out of a proxy URL', () => {
    const diagnostics = createFlakeDiagnostics({
      dir,
      log,
      env: { HTTP_PROXY: 'http://alice:hunter2@proxy.local:8080' },
      listeners: () => ''
    });
    diagnostics.record('first', {});
    const [header] = lines();
    expect(header.proxyEnv).toEqual({ HTTP_PROXY: 'http://***:***@proxy.local:8080' });
  });

  it('appends one timestamped JSON line per record, carrying the payload', () => {
    const diagnostics = createFlakeDiagnostics({ dir, log, env: {}, listeners: () => '' });
    diagnostics.record('unexpected status', { status: 401 });
    diagnostics.record('exception reached the filter', { statusCode: 401 });
    const entries = lines();
    expect(entries).toHaveLength(3);
    expect(entries[1]).toMatchObject({ label: 'unexpected status', status: 401 });
    expect(entries[2]).toMatchObject({ label: 'exception reached the filter', statusCode: 401 });
    for (const entry of entries) expect(typeof entry.at).toBe('string');
  });

  it('still prints when the file cannot be written, rather than throwing out of a response handler', () => {
    // `record` runs inside supertest's response callback and inside the exception filter. A diagnostic that throws there would replace the flake being
    // investigated with a failure of its own, and the 401 sighting would be lost a third time.
    chmodSync(dir, 0o500);
    const diagnostics = createFlakeDiagnostics({ dir, log, env: {}, listeners: () => '' });
    expect(() => diagnostics.record('unexpected status', { status: 401 })).not.toThrow();
    chmodSync(dir, 0o700);
    expect(printed.join('\n')).toContain('unexpected status');
  });

  it('survives a listener probe that is not installed', () => {
    const diagnostics = createFlakeDiagnostics({
      dir,
      log,
      env: {},
      listeners: () => {
        throw new Error('spawn ss ENOENT');
      }
    });
    expect(() => diagnostics.record('first', {})).not.toThrow();
    const [header] = lines();
    expect(header.listeners).toContain('ENOENT');
  });
});
