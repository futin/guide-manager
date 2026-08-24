import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER = join(ROOT, 'server', 'server.js');

// The reload path only exists in the CLI entry block, so it can only be
// exercised by actually running the server as a process.
function startServer(env) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const listening = new Promise((resolve) => {
    const check = () => { if (output.includes('listening on')) resolve(); };
    child.stdout.on('data', check);
  });
  const exited = new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });
  return { child, exited, listening, out: () => output };
}

test('exits cleanly when a source file changes, so the supervisor can restart it', async () => {
  const probe = join(ROOT, 'server', 'lib', '.reload-probe.js');
  const server = startServer({ PORT: '4391', GM_RESTART_ON_CHANGE: '1' });
  try {
    await server.listening;
    writeFileSync(probe, '// touched by the reload test\n');
    const code = await Promise.race([
      server.exited,
      new Promise((r) => setTimeout(() => r('timeout'), 5000)),
    ]);
    assert.equal(code, 0, `expected a clean exit, got ${code}. output:\n${server.out()}`);
    assert.match(server.out(), /source changed/);
  } finally {
    rmSync(probe, { force: true });
    server.child.kill();
  }
});

test('keeps running on a source change when reload is not enabled', async () => {
  const probe = join(ROOT, 'server', 'lib', '.reload-probe-off.js');
  const server = startServer({ PORT: '4392' });
  try {
    await server.listening;
    writeFileSync(probe, '// touched by the reload test\n');
    const code = await Promise.race([
      server.exited,
      new Promise((r) => setTimeout(() => r('still running'), 1500)),
    ]);
    assert.equal(code, 'still running', `server should not have exited. output:\n${server.out()}`);
  } finally {
    rmSync(probe, { force: true });
    server.child.kill();
  }
});

test('reports a port conflict instead of dying on an unhandled error event', async () => {
  const first = startServer({ PORT: '4393' });
  await first.listening;
  const second = startServer({ PORT: '4393' });
  try {
    const code = await Promise.race([
      second.exited,
      new Promise((r) => setTimeout(() => r('timeout'), 5000)),
    ]);
    assert.equal(code, 1, `expected exit 1, got ${code}. output:\n${second.out()}`);
    assert.match(second.out(), /already in use/);
    assert.doesNotMatch(second.out(), /EADDRINUSE\s+at /, 'should not dump a raw stack trace');
  } finally {
    first.child.kill();
    second.child.kill();
  }
});
