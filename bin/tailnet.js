#!/usr/bin/env node
/**
 * Publish the Vite dev server onto the tailnet, at the same port number it
 * holds on this machine.
 *
 *   pnpm run tailnet          # register the serve, print the phone URL
 *   pnpm run tailnet status   # what tailscaled thinks it is serving
 *   pnpm run tailnet down     # unregister
 *
 * Why a script and not a documented one-liner: the port number has to agree
 * with compose forever. compose reads GM_WEB_PORT out of .env, and a serve
 * registration typed by hand stores a *copy* of that number inside tailscaled,
 * outside this repo and outside git. Change GM_WEB_PORT the next time 5175 or
 * 5176 collides with another project and the copy keeps pointing at the old
 * port; the phone gets a 502 from Tailscale, which reads as a Tailscale fault
 * rather than a stale mapping. Here the number is read from the same place
 * compose reads it, so there is nothing to keep in sync.
 *
 * Why serve at all, when a wildcard bind was already reachable over the
 * tailnet: so that compose can publish on loopback instead. The board renders
 * guides read out of this filesystem and has no authentication in front of it —
 * a 0.0.0.0 bind offered that to every network this laptop ever joins. With the
 * publish scoped to 127.0.0.1, tailscaled is the only route in, and the tailnet
 * is the boundary.
 *
 * Plain HTTP is deliberate. The listener is tailnet-only (never Funnel), and
 * the hop from the phone to this machine is WireGuard-encrypted end to end —
 * the HTTP is inside that tunnel, from tailscaled to a loopback socket. HTTPS
 * serve would buy a browser-trusted certificate at the cost of the one property
 * this script is for: --https accepts only 443, 8443 and 10000, so the tailnet
 * port could never match the local one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where the tailscale CLI lives on a Mac. The Homebrew paths are the obvious
 * ones; the third is the CLI embedded in the GUI app, which is what you have if
 * Tailscale came from the App Store — there the binary is never on PATH, and
 * `which tailscale` finding nothing is not the same as Tailscale being absent.
 */
const CLI_CANDIDATES = [
  '/opt/homebrew/bin/tailscale',
  '/usr/local/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
];

/**
 * Read one variable out of an .env file. Deliberately not a dotenv dependency:
 * this needs a single unquoted line, and the file is also parsed by compose,
 * whose own interpolation rules are the ones that matter. Anything fancier here
 * would be a second dialect of the same file.
 */
export function readEnvVar(file, name) {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== name) continue;
    return trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

/**
 * The port, resolved the way compose resolves it: an exported variable wins
 * over the file, and the fallback is the default written into the compose
 * mapping. GM_ENV_FILE exists so the suite can point this at a temp file —
 * same escape hatch bin/register.js gives with GM_REGISTRY_FILE.
 */
export function resolveWebPort(env = process.env) {
  const file = env.GM_ENV_FILE || join(REPO_ROOT, '.env');
  const raw = env.GM_WEB_PORT ?? readEnvVar(file, 'GM_WEB_PORT') ?? '5175';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`GM_WEB_PORT is not a usable port: ${JSON.stringify(raw)}`);
  }
  return port;
}

/**
 * The tailnet side and the loopback side carry the same number on purpose:
 * tailscaled answers this machine's tailnet address, compose publishes on
 * 127.0.0.1, and the two never contend for one socket. One number per project,
 * identical wherever you type it.
 */
export const serveArgs = (port) => ['serve', '--bg', `--http=${port}`, `http://127.0.0.1:${port}`];

/** Undo the above. `off` takes the listener's port, not the target's. */
export const offArgs = (port) => ['serve', `--http=${port}`, 'off'];

function findCli() {
  return CLI_CANDIDATES.find((path) => existsSync(path));
}

/**
 * Is anything actually behind the port? serve registers happily against a dead
 * target and the failure surfaces on the phone as a bare 502, so it is worth
 * one connect attempt and a warning here. A refused connection is the answer,
 * not an error — hence the promise resolving either way.
 */
function listening(port, timeout = 400) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * This machine's MagicDNS name, so the script can print the URL to type into
 * the phone rather than leaving you to reconstruct it. Best-effort: MagicDNS
 * can be off, in which case the tailnet IP is the honest answer, and if even
 * that is unavailable the caller falls back to a placeholder.
 */
function tailnetHost(cli) {
  const { status, stdout } = spawnSync(cli, ['status', '--json'], { encoding: 'utf8' });
  if (status !== 0) return undefined;
  try {
    const self = JSON.parse(stdout).Self ?? {};
    const dns = (self.DNSName || '').replace(/\.$/, '');
    return dns || (self.TailscaleIPs ?? [])[0];
  } catch {
    return undefined;
  }
}

/**
 * serve is an operator-only operation: it edits the node's configuration, so
 * tailscaled refuses it from a user who is neither root nor the declared
 * operator. The remedy is one command, but this script will not run it — a
 * helper that silently escalates to change your machine's network config is
 * worse than an error message. Print the fix, let the human decide.
 */
function reportServeFailure(port) {
  process.stderr.write(
    [
      '',
      `tailscale refused to serve port ${port}.`,
      '',
      'If it complained about access, this user is not the tailscaled operator:',
      '  sudo tailscale set --operator=$USER',
      '',
      'If it complained about the port, something else may already hold it on',
      'the tailnet side — `pnpm run tailnet status` lists what is registered.',
      ''
    ].join('\n')
  );
}

async function up(port, cli, dryRun) {
  if (dryRun) {
    process.stdout.write(`${cli ?? 'tailscale'} ${serveArgs(port).join(' ')}\n`);
    return 0;
  }

  if (!(await listening(port))) {
    // Not fatal: registering before the stack is up is a reasonable order to
    // work in, and the registration persists. Worth saying out loud, though,
    // because the symptom on the phone gives no hint of the cause.
    process.stdout.write(
      `warning: nothing is listening on 127.0.0.1:${port} — start the stack with \`pnpm run docker:up\`\n`
    );
  }

  const { status } = spawnSync(cli, serveArgs(port), { stdio: 'inherit' });
  if (status !== 0) {
    reportServeFailure(port);
    return status ?? 1;
  }

  const host = tailnetHost(cli) ?? '<this-machine>.<your-tailnet>.ts.net';
  process.stdout.write(`\nserving http://${host}:${port} to your tailnet\n`);
  // The Mac being awake is the actual day-to-day failure mode, and no amount of
  // correct configuration survives it.
  process.stdout.write('reachable from anywhere you are logged into the tailnet, while this Mac is awake\n');
  return 0;
}

function down(port, cli, dryRun) {
  if (dryRun) {
    process.stdout.write(`${cli ?? 'tailscale'} ${offArgs(port).join(' ')}\n`);
    return 0;
  }
  const { status } = spawnSync(cli, offArgs(port), { stdio: 'inherit' });
  if (status !== 0) reportServeFailure(port);
  return status ?? 1;
}

async function status(port, cli, dryRun) {
  if (dryRun) {
    process.stdout.write(`${cli ?? 'tailscale'} serve status\n`);
    return 0;
  }
  spawnSync(cli, ['serve', 'status'], { stdio: 'inherit' });
  const alive = await listening(port);
  process.stdout.write(`\n127.0.0.1:${port}: ${alive ? 'listening' : 'nothing there'}\n`);
  return 0;
}

const COMMANDS = { up, down, status };

async function main(argv) {
  const args = argv.filter((arg) => arg !== '--dry-run');
  const dryRun = argv.includes('--dry-run');
  const command = args[0] ?? 'up';

  if (!Object.hasOwn(COMMANDS, command)) {
    process.stderr.write(`unknown command: ${command}\nusage: tailnet [up|down|status] [--dry-run]\n`);
    return 2;
  }

  let port;
  try {
    port = resolveWebPort();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  // Resolved after the port so that --dry-run works on a machine without
  // Tailscale at all: the command it would run is a fact about this repo's
  // configuration, not about what happens to be installed.
  const cli = findCli();
  if (!cli && !dryRun) {
    process.stderr.write(
      `tailscale CLI not found. Looked in:\n${CLI_CANDIDATES.map((p) => `  ${p}`).join('\n')}\n`
    );
    return 2;
  }

  return COMMANDS[command](port, cli, dryRun);
}

process.exitCode = await main(process.argv.slice(2));
