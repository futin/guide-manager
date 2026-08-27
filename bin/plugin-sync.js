#!/usr/bin/env node
// Reinstalls this repo's own plugin into ~/.claude/plugins so the installed
// copy of the skills matches what this repo has published.
//
// It exists because a plugin install is a *copy*, not a link: editing
// skills/ changes nothing for the running Claude Code until the plugin is
// reinstalled, and the drift is silent — the study skill can gain a step
// while the installed copy keeps teaching the old one, with nothing
// anywhere saying so.
//
// The marketplace source is the GitHub repo, sparse-checked out to the
// paths below, so what lands is a few hundred KB of tracked files rather
// than the 689MB a `directory` source copied — node_modules (473M) and the
// deliberately-vendored .pnpm-store (201M) included, because the plugin CLI
// honours no ignore file at all (checked against 2.1.246: no .claudeignore,
// no .pluginignore, and no allowlist field in plugin.json or
// marketplace.json). It also rejects a file:// source, so a local-only git
// source is not on the table.
//
// The price of a git source is git's own rule: the installer sees committed,
// pushed work and nothing else. So this script refuses to run on anything
// less rather than installing stale code and reporting success. It never
// commits and never pushes on its own — when to publish is the user's call.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'guide-manager@guide-manager-marketplace';
export const MARKETPLACE = 'guide-manager-marketplace';

// The paths the marketplace sparse-checkout carries, and therefore the only
// paths a skill may reach at runtime. Anything a skill names through
// ${CLAUDE_PLUGIN_ROOT} has to live under one of these — a reference outside
// them is broken the moment the plugin is installed, and broken only on
// someone else's machine, which is the worst place to find out.
//
// `bin` is here for register.js, which both skills invoke; it drags along
// tailnet.js (repo tooling, ~4KB, not worth a split) and, load-bearingly,
// bin/package.json — the `{"type":"module"}` that makes register.js ESM
// while the rest of the repo is CommonJS. `assets` is here because
// study/references/visuals.md copies bionic.js/css/html out of it.
export const PUBLISHED_PATHS = ['.claude-plugin', 'skills', 'bin', 'assets'];

// Both overridable so the suite can drive a throwaway repo and a fixture
// install record instead of this machine's real ones — the same reason
// tailnet.js takes GM_ENV_FILE.
const REPO_ROOT = process.env.GM_PLUGIN_REPO || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLED =
  process.env.GM_INSTALLED_PLUGINS || join(homedir(), '.claude', 'plugins', 'installed_plugins.json');

const git = (args, cwd = REPO_ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// Hashes path + bytes, not just bytes, so a rename or a deletion changes the
// digest too. Sorted, because readdir order is not a promise.
export function hashTree(root) {
  if (!existsSync(root)) return '';
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(root);
  const digest = createHash('sha256');
  for (const file of files.sort()) {
    digest.update(relative(root, file).split('\\').join('/'));
    digest.update('\0');
    digest.update(readFileSync(file));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/**
 * One digest over everything the plugin ships. Hashing only skills/ would
 * miss a register.js or bionic.js edit, and those are exactly the files a
 * skill reaches for at runtime — a stale one fails inside somebody's study
 * session rather than here.
 */
export function hashPublished(root) {
  const digest = createHash('sha256');
  for (const path of PUBLISHED_PATHS) {
    digest.update(path);
    digest.update('\0');
    digest.update(hashTree(join(root, path)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

// The installed record is the only thing that knows where the copy landed
// and which commit it came from; neither is reconstructable from the repo
// once the two have drifted.
export function readInstall(installedPath = INSTALLED) {
  if (!existsSync(installedPath)) return undefined;
  const entries = JSON.parse(readFileSync(installedPath, 'utf8'))?.plugins?.[PLUGIN_ID];
  if (!Array.isArray(entries)) return undefined;
  return entries.find((entry) => entry.scope === 'user') ?? entries[0];
}

// Returns the reason this tree cannot be published, or undefined when it
// can. Split out from main so the suite can drive it through a repo it built
// itself rather than by breaking this one.
export function publishBlocker({ dirty, ahead, behind }) {
  if (dirty.length > 0) {
    return (
      `uncommitted changes under ${PUBLISHED_PATHS.join('/, ')}/:\n${dirty.map((f) => `  ${f}`).join('\n')}\n` +
      'The installer reads git, not the working tree — commit these first.'
    );
  }
  if (ahead > 0) {
    return `HEAD is ${ahead} commit(s) ahead of origin/main. The marketplace clones from GitHub, so push first:\n  git push`;
  }
  if (behind > 0) {
    return `HEAD is ${behind} commit(s) behind origin/main — pull before syncing, or the install will move backwards:\n  git pull --ff-only`;
  }
  return undefined;
}

function du(dir) {
  try {
    return execFileSync('du', ['-sh', dir], { encoding: 'utf8' }).split('\t')[0].trim();
  } catch {
    return '?';
  }
}

// Every `directory` install left a full 689MB copy of the repo behind and
// nothing else reaps them; .orphaned_at markers expire on their own schedule
// and `claude plugin prune` prunes auto-installed dependencies, not cache
// versions. The sparse source makes new copies small, but the fat ones from
// before are still on disk, so the prune stays.
function pruneOldVersions(installPath, keptVersion) {
  const versionsDir = dirname(installPath);
  if (!existsSync(versionsDir)) return [];
  const removed = [];
  for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === keptVersion) continue;
    const stale = join(versionsDir, entry.name);
    // .in_use marks a copy some running session still has open. Leaving it
    // is the conservative call: a stale directory costs disk, a yanked one
    // costs somebody's session mid-command.
    if (existsSync(join(stale, '.in_use'))) {
      console.log(`  kept ${entry.name} (${du(stale)}, .in_use — a session still has it open)`);
      continue;
    }
    const size = du(stale);
    rmSync(stale, { recursive: true, force: true });
    removed.push(`${entry.name} (${size})`);
  }
  return removed;
}

function main(argv) {
  // Printed rather than hard-coded anywhere else: test/plugin-sync.test.ts
  // asks the script itself for this list and then checks every
  // ${CLAUDE_PLUGIN_ROOT}/… reference in skills/ against it, so the sparse
  // paths and the skills cannot drift apart.
  if (argv.includes('--published-paths')) {
    console.log(PUBLISHED_PATHS.join('\n'));
    return;
  }
  const dryRun = argv.includes('--dry-run');

  const install = readInstall();
  if (!install) {
    console.error(`${PLUGIN_ID} is not installed. Install it once, then this script keeps it current:`);
    console.error(`  claude plugin install ${PLUGIN_ID}`);
    process.exit(1);
  }

  const head = git(['rev-parse', 'HEAD']);
  const repoHash = hashPublished(REPO_ROOT);

  if (hashPublished(install.installPath) === repoHash && install.gitCommitSha === head) {
    console.log(`in sync — installed v${install.version} is ${head.slice(0, 7)}, same payload as the working tree`);
    return;
  }

  // origin is the marketplace's actual source, so its idea of main is what
  // gets installed. Fetch before comparing, or a stale ref makes a pushed
  // tree look unpushed.
  git(['fetch', '--quiet', 'origin', 'main']);
  const blocker = publishBlocker({
    dirty: git(['status', '--porcelain', '--', ...PUBLISHED_PATHS]).split('\n').filter(Boolean),
    ahead: Number(git(['rev-list', '--count', 'origin/main..HEAD'])),
    behind: Number(git(['rev-list', '--count', 'HEAD..origin/main']))
  });
  if (blocker) {
    console.error(blocker);
    process.exit(1);
  }

  const commands = [
    ['plugin', 'marketplace', 'update', MARKETPLACE],
    // Not `plugin update`: that command compares the version in plugin.json
    // and stops at "already at the latest version (0.1.3)" however far
    // origin/main has moved past the commit that version was cut from. The
    // cache directory is keyed by version, so the only alternative is a
    // patch bump on every skills edit — another commit and another push
    // before anything installs. Uninstall + install re-clones and lands
    // whatever HEAD says, and it is cheap precisely because the source is
    // sparse.
    ['plugin', 'uninstall', PLUGIN_ID],
    ['plugin', 'install', PLUGIN_ID, '-y']
  ];
  if (dryRun) {
    for (const args of commands) console.log(`claude ${args.join(' ')}`);
    return;
  }

  const run = (args) => execFileSync('claude', args, { stdio: 'inherit' });
  run(commands[0]);
  run(commands[1]);
  try {
    run(commands[2]);
  } catch (error) {
    // The uninstall already happened, so a failure here leaves the machine
    // with no plugin at all. Say so plainly and hand over the one command
    // that fixes it, rather than letting a stack trace imply a smaller mess.
    console.error(`install failed after the uninstall — ${PLUGIN_ID} is NOT installed right now.`);
    console.error(`  claude plugin install ${PLUGIN_ID}`);
    throw error;
  }

  const after = readInstall();
  if (!after) {
    console.error('the plugin is no longer installed after the reinstall');
    process.exit(1);
  }
  if (hashPublished(after.installPath) !== repoHash) {
    console.error(`the installed payload still differs from the repo at ${after.installPath}`);
    console.error(`installed commit ${after.gitCommitSha?.slice(0, 7) ?? 'unknown'}, repo HEAD ${head.slice(0, 7)}`);
    process.exit(1);
  }

  console.log(
    `installed v${after.version} @ ${after.gitCommitSha?.slice(0, 7) ?? '?'} → ${after.installPath} (${du(after.installPath)})`
  );
  const removed = pruneOldVersions(after.installPath, after.version);
  if (removed.length > 0) console.log(`pruned ${removed.length} stale copy/copies: ${removed.join(', ')}`);
  console.log('restart Claude Code for the new skills to load');
}

// Guarded so the suite can import the helpers without reinstalling anything
// as a side effect.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
