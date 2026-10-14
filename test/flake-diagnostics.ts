import { appendFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The file half of the progress suite's 401 instrument (backlog #5, github futin/guide-manager#5).
 *
 * The flake has been sighted twice and captured zero times. Its instrument printed to stderr only, and a full `jest --runInBand` run buries or truncates
 * stderr, so the second sighting's evidence was lost to the log. Everything recorded here is also appended to a JSON-lines file under the OS temp directory,
 * which outlives the run, and the file's path is printed once, on the first record, so the failing run itself says where to look.
 *
 * Nothing is created and nothing is printed until something is recorded. The callers record only on a status the suite did not mean to produce, so a passing
 * run leaves no file behind — an instrument that writes on every green run is one somebody deletes.
 *
 * Not a test file (no `.test.ts`), so jest's testMatch never runs it as a suite; it sits flat in `test/` beside the one suite that uses it.
 */

/** Where the files land when the caller does not say. `scripts/provoke-progress-401.mjs` reads the same directory. */
export const FLAKE_DIAGNOSTICS_DIR = join(tmpdir(), 'guide-manager-flake');

export interface FlakeDiagnosticsOptions {
  /** Directory the file is created in. Created on first write if missing. */
  dir?: string;
  /** Where the one-line "written to <path>" notice goes, and where a record goes when the file cannot be written. */
  log?: (line: string) => void;
  /** The environment to snapshot. Injected by the suite that pins this; the real caller takes `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Lists the local listening sockets. Injected for the same reason; the default shells out to `ss`. */
  listeners?: () => string;
}

export interface FlakeDiagnostics {
  record(label: string, payload: Record<string, unknown>): void;
  /** The file being written, or null until the first record has opened it. */
  logPath(): string | null;
}

// Hypothesis 1 in the item: a proxy or harness layer, not this app, answered the 401. "No proxy variables set" was read off a later interactive shell, so the
// failing process has to report its own — values included, because which proxy matters as much as whether there was one.
const PROXY_ENV = /proxy/i;
const NODE_ENV = /^NODE_/;
// Which launcher ran the suite. Recorded by name only: these routinely carry session tokens and credentials, and the name alone answers the question.
const HARNESS_ENV =
  /^(CLAUDE|ANTHROPIC|CODEX|CURSOR|VSCODE|TERM_PROGRAM|GITHUB_ACTIONS|CI$|CONTAINER|SANDBOX|DEVCONTAINER|WSL_|JEST_WORKER_ID$)|SANDBOX/i;

/** `http://user:pass@host` keeps its host — the useful half — and loses the credentials. */
const redact = (value: string): string => value.replace(/\/\/[^/@\s]+@/g, '//***:***@');

const pick = (env: NodeJS.ProcessEnv, pattern: RegExp, map: (value: string) => string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (pattern.test(name) && value !== undefined) out[name] = map(value);
  }
  return out;
};

// `ss` rather than `lsof`: present on every Linux this has run on, and quick. A timeout because this runs inside a response callback during a test.
const defaultListeners = (): string => execFileSync('ss', ['-ltnpH'], { encoding: 'utf8', timeout: 5_000 });

/**
 * A record payload is whatever the caller had in hand — response headers, an exception's fields — and some of it may not serialise (a cycle, a BigInt).
 * Falling back to `String` keeps the line rather than losing the record to the encoder.
 */
const encode = (entry: Record<string, unknown>): string => {
  try {
    return JSON.stringify(entry, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
  } catch (err) {
    return JSON.stringify({ label: entry.label, at: entry.at, unencodable: String(err), raw: String(entry) });
  }
};

export function createFlakeDiagnostics(options: FlakeDiagnosticsOptions = {}): FlakeDiagnostics {
  const dir = options.dir ?? FLAKE_DIAGNOSTICS_DIR;
  // eslint-disable-next-line no-console
  const log = options.log ?? ((line: string) => console.error(line));
  const env = options.env ?? process.env;
  const listeners = options.listeners ?? defaultListeners;

  let path: string | null = null;

  /**
   * Never throws. `record` runs inside supertest's response callback and inside the exception filter; a diagnostic that threw there would replace the flake
   * under investigation with a failure of its own, and the sighting would be lost a third time. A line the file refused goes to the log instead.
   */
  const write = (target: string, entry: Record<string, unknown>): boolean => {
    const line = encode(entry);
    try {
      mkdirSync(dir, { recursive: true });
      appendFileSync(target, `${line}\n`);
      return true;
    } catch (err) {
      log(`[flake-diagnostics] could not write ${target} (${(err as NodeJS.ErrnoException).code ?? String(err)}): ${line}`);
      return false;
    }
  };

  /** The first line of every file: what the failing process was, as opposed to what a later shell remembers it being. */
  const header = (): Record<string, unknown> => {
    let listening: string;
    try {
      listening = listeners();
    } catch (err) {
      listening = `listener probe failed: ${(err as Error).message ?? String(err)}`;
    }
    return {
      label: 'session',
      at: new Date().toISOString(),
      node: process.version,
      pid: process.pid,
      platform: `${process.platform} ${process.arch}`,
      cwd: process.cwd(),
      proxyEnv: pick(env, PROXY_ENV, redact),
      nodeEnv: pick(env, NODE_ENV, (value) => value),
      harnessEnv: Object.keys(env).filter((name) => HARNESS_ENV.test(name) && !PROXY_ENV.test(name) && !NODE_ENV.test(name)).sort(),
      listeners: listening
    };
  };

  return {
    record(label, payload) {
      try {
        if (path === null) {
          const target = join(dir, `progress-401-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.jsonl`);
          // The path is claimed even if the header write fails, so a broken directory costs one notice per record rather than a retried header each time.
          path = target;
          if (write(target, header())) log(`[flake-diagnostics] unexpected response recorded — full details in ${target}`);
        }
        write(path, { ...payload, label, at: new Date().toISOString() });
      } catch (err) {
        log(`[flake-diagnostics] record failed: ${String(err)}`);
      }
    },
    logPath: () => path
  };
}
