#!/usr/bin/env node
/**
 * Loops the progress suite, then the full suite, until something fails — backlog #5 (github futin/guide-manager#5), the 401 a route with no guard returned
 * once in a full `pnpm test` and never again on a rerun.
 *
 * A sighting has been rarer than one in thirty runs, so waiting for one to turn up in ordinary use leaves the item parked on luck. This spends a fixed budget
 * instead — 300 single-suite runs and 100 full runs by default, the numbers the groomed item set — and stops at the first failing run with everything that run
 * left behind still in place: its whole jest output, and the JSON-lines file `test/flake-diagnostics.ts` writes when the progress suite sees a status it did not
 * mean to produce. The output is kept because the failure that stops the loop may not be the 401 at all; any red run stops it, and the log says which.
 *
 * Deliberately not part of `pnpm test`: a full budget is about two hours. Run it from the launcher the original failure came from — the item's leading
 * hypothesis is a proxy or harness layer answering in place of the app, which only that environment can reproduce.
 *
 *   pnpm run test:provoke                       # the full budget
 *   pnpm run test:provoke -- --suite 20 --full 2
 *
 * Exits 0 when the whole budget ran green, 1 on the first failing run.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mirrors FLAKE_DIAGNOSTICS_DIR in test/flake-diagnostics.ts. This script is plain ESM and cannot import the TypeScript module the suite uses, so the one
// string is spelled twice; the suite prints the path it actually wrote on its first diagnostic in any case.
const DIAGNOSTICS_DIR = join(tmpdir(), 'guide-manager-flake');

const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = Number(process.argv[at + 1]);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`--${name} takes a non-negative whole number`);
    process.exit(2);
  }
  return value;
};

const budget = [
  { name: 'progress suite', runs: flag('suite', 300), args: ['test/progress.test.ts'] },
  { name: 'full suite', runs: flag('full', 100), args: [] }
];

mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
const before = new Set(readdirSync(DIAGNOSTICS_DIR));
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;

for (const phase of budget) {
  for (let run = 1; run <= phase.runs; run++) {
    // The same command `pnpm test` runs — jest's worker pool, no longer `--runInBand` — so the suites share the machine the way a real run does.
    const result = spawnSync('pnpm', ['exec', 'jest', ...phase.args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.status === 0) {
      if (run % 10 === 0 || run === phase.runs) console.log(`${phase.name}: ${run}/${phase.runs} green (${elapsed()})`);
      continue;
    }
    const output = join(DIAGNOSTICS_DIR, `provoke-${new Date().toISOString().replace(/[:.]/g, '-')}-output.log`);
    writeFileSync(output, `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error ? String(result.error) : ''}`);
    const fresh = readdirSync(DIAGNOSTICS_DIR).filter((file) => file.endsWith('.jsonl') && !before.has(file));
    console.log(`${phase.name}: run ${run}/${phase.runs} FAILED (exit ${result.status ?? result.signal}) after ${elapsed()}`);
    console.log(`jest output: ${output}`);
    console.log(
      fresh.length > 0
        ? `diagnostics: ${fresh.map((file) => join(DIAGNOSTICS_DIR, file)).join(', ')}`
        : 'diagnostics: none written — the failure was not an unexpected status in the progress suite; read the jest output'
    );
    process.exit(1);
  }
}

console.log(`budget spent with no failure: ${budget.map((phase) => `${phase.runs} ${phase.name} runs`).join(', ')} (${elapsed()})`);
