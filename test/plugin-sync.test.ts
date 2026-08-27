import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * bin/plugin-sync.js reinstalls this repo's plugin from the pushed HEAD, and
 * it is the only thing standing between an edited skills/ and a running
 * Claude Code still loading the copy it was installed with. Two things can go
 * wrong quietly enough to be worth a suite:
 *
 *   1. The sparse-checkout list and the skills drift apart. A skill that says
 *      ${CLAUDE_PLUGIN_ROOT}/bin/register.js is fine here and broken once
 *      installed if `bin` is not one of the published paths — and broken only
 *      on a machine that installed rather than cloned, which is the worst
 *      place to discover it. The first test asks the script itself for the
 *      list and checks every reference in skills/ against it.
 *   2. The publish gate stops refusing. The installer clones from GitHub, so
 *      an uncommitted or unpushed tree installs *stale code and reports
 *      success* — the one failure mode that looks exactly like a success.
 *
 * Tested as a CLI, like register.test.ts and tailnet-script.test.ts and for
 * the same reason: bin/ is ESM (bin/package.json) while the rest of the repo
 * is CommonJS. GM_PLUGIN_REPO and GM_INSTALLED_PLUGINS point the script at a
 * throwaway repo and a fixture install record, so nothing here touches the
 * real ~/.claude or this working tree; --dry-run prints the `claude` commands
 * instead of running them, so the suite never reinstalls anything.
 */
const CLI = join(__dirname, '..', 'bin', 'plugin-sync.js');
const REPO = join(__dirname, '..');
const PLUGIN_ID = 'guide-manager@guide-manager-marketplace';

function run(args: string[], env: Record<string, string> = {}): SpawnSyncReturns<string> {
  const clean = { ...process.env };
  delete clean.GM_PLUGIN_REPO;
  delete clean.GM_INSTALLED_PLUGINS;
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...clean, ...env } });
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** An installed_plugins.json naming one user-scoped copy. */
function installRecord(installPath: string, gitCommitSha: string, version = '0.1.3'): string {
  const file = join(mkdtempSync(join(tmpdir(), 'gm-installed-')), 'installed_plugins.json');
  writeFileSync(
    file,
    JSON.stringify({ version: 2, plugins: { [PLUGIN_ID]: [{ scope: 'user', installPath, version, gitCommitSha }] } })
  );
  return file;
}

interface Fixture {
  repo: string;
  head: string;
}

/**
 * A throwaway repo carrying one file under each published path, pushed to a
 * local bare remote so `origin/main` is real. Two commits, because the
 * "behind" case needs somewhere to reset back to.
 */
function makeRepo(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'gm-plugin-sync-'));
  const repo = join(root, 'repo');
  const origin = join(root, 'origin.git');
  mkdirSync(repo);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', origin]);
  git(repo, 'init', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'suite@example.com');
  git(repo, 'config', 'user.name', 'suite');
  for (const path of ['.claude-plugin', 'skills', 'bin', 'assets']) {
    mkdirSync(join(repo, path), { recursive: true });
    writeFileSync(join(repo, path, 'file.txt'), `${path} v1\n`);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'one');
  writeFileSync(join(repo, 'skills', 'file.txt'), 'skills v2\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'two');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '--quiet', '-u', 'origin', 'main');
  return { repo, head: git(repo, 'rev-parse', 'HEAD') };
}

/** A copy of the repo's published paths, standing in for the installed one. */
function installedCopy(repo: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'gm-cache-')), '0.1.3');
  mkdirSync(dir);
  for (const path of ['.claude-plugin', 'skills', 'bin', 'assets']) {
    cpSync(join(repo, path), join(dir, path), { recursive: true });
  }
  return dir;
}

/** Every Markdown file under a directory — the skills' prose is where the references live. */
function markdownUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownUnder(full);
    return entry.isFile() && full.endsWith('.md') ? [full] : [];
  });
}

describe('bin/plugin-sync.js — published paths', () => {
  const published = run(['--published-paths']).stdout.trim().split('\n');

  it('carries the plugin manifest, the skills, and everything the skills reach for', () => {
    expect(published).toEqual(['.claude-plugin', 'skills', 'bin', 'assets']);
  });

  /**
   * The invariant this file exists for. A ${CLAUDE_PLUGIN_ROOT}/… path outside
   * the sparse checkout resolves here and 404s on an installed copy, so the
   * list and the skills are checked against each other rather than both being
   * maintained by hand.
   */
  it('covers every ${CLAUDE_PLUGIN_ROOT} reference the skills make', () => {
    const files = markdownUnder(join(REPO, 'skills'));
    expect(files.length).toBeGreaterThan(0);
    const referenced = new Set<string>();
    for (const file of files) {
      for (const [, path] of readFileSync(file, 'utf8').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w.-]+)/g)) {
        referenced.add(path);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const path of referenced) expect(published).toContain(path);
  });
});

describe('bin/plugin-sync.js — the publish gate', () => {
  it('refuses an uncommitted payload, and names the files rather than just saying no', () => {
    const { repo, head } = makeRepo();
    writeFileSync(join(repo, 'skills', 'unstaged.md'), 'new\n');
    const { status, stderr } = run(['--dry-run'], {
      GM_PLUGIN_REPO: repo,
      GM_INSTALLED_PLUGINS: installRecord(join(repo, 'nothing-installed'), head)
    });
    expect(status).toBe(1);
    expect(stderr).toContain('skills/unstaged.md');
    expect(stderr).toContain('commit these first');
  });

  it('refuses an unpushed HEAD — the marketplace clones from GitHub, not from here', () => {
    const { repo } = makeRepo();
    writeFileSync(join(repo, 'skills', 'file.txt'), 'skills v3\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', 'three');
    const { status, stderr } = run(['--dry-run'], {
      GM_PLUGIN_REPO: repo,
      GM_INSTALLED_PLUGINS: installRecord(join(repo, 'nothing-installed'), git(repo, 'rev-parse', 'HEAD'))
    });
    expect(status).toBe(1);
    expect(stderr).toContain('git push');
  });

  it('refuses a HEAD behind origin/main, so a sync never installs backwards', () => {
    const { repo } = makeRepo();
    git(repo, 'reset', '--hard', 'HEAD~1');
    const { status, stderr } = run(['--dry-run'], {
      GM_PLUGIN_REPO: repo,
      GM_INSTALLED_PLUGINS: installRecord(join(repo, 'nothing-installed'), git(repo, 'rev-parse', 'HEAD'))
    });
    expect(status).toBe(1);
    expect(stderr).toContain('git pull --ff-only');
  });
});

describe('bin/plugin-sync.js — what it runs', () => {
  it('says so and stops when the installed copy already carries this commit', () => {
    const { repo, head } = makeRepo();
    const { status, stdout } = run(['--dry-run'], {
      GM_PLUGIN_REPO: repo,
      GM_INSTALLED_PLUGINS: installRecord(installedCopy(repo), head)
    });
    expect(status).toBe(0);
    expect(stdout).toContain('in sync');
    expect(stdout).not.toContain('claude plugin');
  });

  it('notices a payload change outside skills/ — register.js and the assets ship too', () => {
    const { repo, head } = makeRepo();
    const installed = installedCopy(repo);
    writeFileSync(join(installed, 'assets', 'file.txt'), 'assets stale\n');
    const { status, stdout } = run(['--dry-run'], {
      GM_PLUGIN_REPO: repo,
      GM_INSTALLED_PLUGINS: installRecord(installed, head)
    });
    expect(status).toBe(0);
    expect(stdout).not.toContain('in sync');
    expect(stdout).toContain(`claude plugin install ${PLUGIN_ID} -y`);
  });

  /**
   * Uninstall + install, never `plugin update`: that command compares the
   * version in plugin.json and stops at "already at the latest version"
   * however far the commit behind it has moved, which would force a patch
   * bump — and another commit, and another push — on every skills edit.
   */
  it('refreshes the marketplace, then reinstalls rather than updating', () => {
    const { repo, head } = makeRepo();
    const installed = installedCopy(repo);
    writeFileSync(join(installed, 'skills', 'file.txt'), 'skills stale\n');
    const { status, stdout } = run(['--dry-run'], {
      GM_PLUGIN_REPO: repo,
      GM_INSTALLED_PLUGINS: installRecord(installed, head)
    });
    expect(status).toBe(0);
    expect(stdout.trim().split('\n')).toEqual([
      'claude plugin marketplace update guide-manager-marketplace',
      `claude plugin uninstall ${PLUGIN_ID}`,
      `claude plugin install ${PLUGIN_ID} -y`
    ]);
  });

  it('hands back the install command when nothing is installed at all', () => {
    const { repo } = makeRepo();
    const empty = join(mkdtempSync(join(tmpdir(), 'gm-installed-')), 'installed_plugins.json');
    writeFileSync(empty, JSON.stringify({ version: 2, plugins: {} }));
    const { status, stderr } = run(['--dry-run'], { GM_PLUGIN_REPO: repo, GM_INSTALLED_PLUGINS: empty });
    expect(status).toBe(1);
    expect(stderr).toContain(`claude plugin install ${PLUGIN_ID}`);
  });
});
