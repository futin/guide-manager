import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * bin/register.js is the CLI the study and tutor skills invoke, and it stays
 * ESM (see bin/package.json) while the rest of the repo is CommonJS — so it is
 * tested as a CLI rather than by importing its functions. The server's own read
 * path is RegistryService, unit-tested directly in registry.test.ts.
 */
const CLI = join(__dirname, '..', 'bin', 'register.js');
const tmpFile = (): string => join(mkdtempSync(join(tmpdir(), 'gm-')), 'registry.json');

function run(file: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GM_REGISTRY_FILE: file }
  });
}

interface Registry {
  projects: {
    name: string;
    path: string;
    guides: { path: string; type: string; title: string; updated: string }[];
  }[];
}

const read = (file: string): Registry => JSON.parse(readFileSync(file, 'utf8')) as Registry;

describe('register CLI', () => {
  it('creates the registry file and the project entry', () => {
    const file = tmpFile();
    const res = run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(res.status).toBe(0);
    const reg = read(file);
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].name).toBe('proj');
    expect(reg.projects[0].path).toBe('/tmp/proj');
    expect(reg.projects[0].guides[0]).toMatchObject({
      path: '/tmp/proj/guides/a.md',
      type: 'study',
      title: 'A'
    });
    expect(typeof reg.projects[0].guides[0].updated).toBe('string');
  });

  it('updates an existing guide in place rather than duplicating it', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'tutor', '--title', 'A2']);
    const reg = read(file);
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].guides).toHaveLength(1);
    expect(reg.projects[0].guides[0].type).toBe('tutor');
    expect(reg.projects[0].guides[0].title).toBe('A2');
  });

  it('adds a second guide to the same project', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/b.md', '--type', 'study', '--title', 'B']);
    const reg = read(file);
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].guides.map((g) => g.title)).toEqual(['A', 'B']);
  });

  it('recovers from a corrupt registry instead of throwing', () => {
    const file = tmpFile();
    writeFileSync(file, '{not json');
    const res = run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(res.status).toBe(0);
    expect(read(file).projects).toHaveLength(1);
  });

  it('recovers from a registry of the wrong shape', () => {
    const file = tmpFile();
    writeFileSync(file, '{"projects": "nope"}');
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(read(file).projects).toHaveLength(1);
  });

  it('leaves no temp file behind after an atomic save', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('exits 0 with a warning on a bad type, so a skill wrap-up never breaks', () => {
    const file = tmpFile();
    const res = run(file, ['--project', '/tmp/proj', '--guide', '/tmp/g.md', '--type', 'nonsense', '--title', 'A']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('unknown type');
    expect(existsSync(file)).toBe(false);
  });

  it('exits 0 with a warning when required args are missing', () => {
    const file = tmpFile();
    const res = run(file, ['--project', '/tmp/proj']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('usage');
    expect(existsSync(file)).toBe(false);
  });
});

/**
 * Removal exists because the registry has exactly one writer. Re-pointing a
 * guide at a different file — a directory guide's generated `index.html`
 * instead of its `README.md` hub — is an add plus a drop, and `upsertGuide`
 * keys on the path, so without this the old entry lingers as a second, worse
 * card for the same guide. Hand-editing registry.json to fix that would break
 * the single-writer invariant.
 */
describe('register CLI --remove', () => {
  it('drops the named guide and leaves its siblings alone', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/b.md', '--type', 'study', '--title', 'B']);
    const res = run(file, ['--remove', '--guide', '/tmp/proj/guides/a.md']);
    expect(res.status).toBe(0);
    const reg = read(file);
    expect(reg.projects).toHaveLength(1);
    expect(reg.projects[0].guides.map((g) => g.title)).toEqual(['B']);
  });

  // A project is only ever a container for guides, so an empty one is noise on
  // the board rather than a state worth keeping.
  it('drops the project once its last guide is removed', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    run(file, ['--remove', '--guide', '/tmp/proj/guides/a.md']);
    expect(read(file).projects).toEqual([]);
  });

  it('exits 0 with a warning on an unknown guide, and writes nothing', () => {
    const file = tmpFile();
    run(file, ['--project', '/tmp/proj', '--guide', '/tmp/proj/guides/a.md', '--type', 'study', '--title', 'A']);
    const before = readFileSync(file, 'utf8');
    const res = run(file, ['--remove', '--guide', '/tmp/proj/guides/nope.md']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('not registered');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('exits 0 with a usage warning when --remove has no --guide', () => {
    const file = tmpFile();
    const res = run(file, ['--remove']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('usage');
    expect(existsSync(file)).toBe(false);
  });
});
