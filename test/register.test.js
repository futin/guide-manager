import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry, upsertGuide, saveRegistry } from '../bin/register.js';

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'gm-')), 'registry.json');

test('loadRegistry returns empty registry when file missing', () => {
  assert.deepEqual(loadRegistry(tmpFile()), { projects: [] });
});

test('loadRegistry recovers from corrupt JSON', () => {
  const file = tmpFile();
  writeFileSync(file, '{not json');
  assert.deepEqual(loadRegistry(file), { projects: [] });
});

test('loadRegistry recovers from wrong shape', () => {
  const file = tmpFile();
  writeFileSync(file, '{"projects": "nope"}');
  assert.deepEqual(loadRegistry(file), { projects: [] });
});

test('upsertGuide creates project and guide', () => {
  const reg = upsertGuide({ projects: [] }, {
    projectPath: '/tmp/proj',
    guidePath: '/tmp/proj/guides/a.md',
    type: 'study',
    title: 'A',
    now: 'T0',
  });
  assert.equal(reg.projects.length, 1);
  assert.equal(reg.projects[0].name, 'proj');
  assert.equal(reg.projects[0].path, '/tmp/proj');
  assert.deepEqual(reg.projects[0].guides[0], {
    path: '/tmp/proj/guides/a.md',
    type: 'study',
    title: 'A',
    updated: 'T0',
  });
});

test('upsertGuide dedupes by guide path and updates title/updated', () => {
  let reg = { projects: [] };
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/g.md', type: 'study', title: 'Old', now: 'T0' });
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/g.md', type: 'study', title: 'New', now: 'T1' });
  assert.equal(reg.projects.length, 1);
  assert.equal(reg.projects[0].guides.length, 1);
  assert.equal(reg.projects[0].guides[0].title, 'New');
  assert.equal(reg.projects[0].guides[0].updated, 'T1');
});

test('upsertGuide keeps distinct guides in one project', () => {
  let reg = { projects: [] };
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/a.md', type: 'study', title: 'A', now: 'T0' });
  reg = upsertGuide(reg, { projectPath: '/tmp/proj', guidePath: '/tmp/proj/b.html', type: 'tutor', title: 'B', now: 'T1' });
  assert.equal(reg.projects[0].guides.length, 2);
});

test('saveRegistry + loadRegistry round-trip', () => {
  const file = tmpFile();
  const reg = upsertGuide({ projects: [] }, { projectPath: '/tmp/p', guidePath: '/tmp/p/g.md', type: 'tutor', title: 'G', now: 'T0' });
  saveRegistry(file, reg);
  assert.deepEqual(loadRegistry(file), reg);
});

test('CLI exits 0 and warns on missing args', () => {
  const out = spawnSync(process.execPath, ['bin/register.js', '--type', 'study'], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stderr, /warning/i);
});

test('CLI writes registry at GM_REGISTRY_FILE', () => {
  const file = tmpFile();
  const out = spawnSync(process.execPath, [
    'bin/register.js',
    '--project', '/tmp/proj',
    '--guide', '/tmp/proj/g.md',
    '--type', 'study',
    '--title', 'From CLI',
  ], { encoding: 'utf8', env: { ...process.env, GM_REGISTRY_FILE: file } });
  assert.equal(out.status, 0);
  const reg = loadRegistry(file);
  assert.equal(reg.projects[0].guides[0].title, 'From CLI');
  assert.match(reg.projects[0].guides[0].updated, /^\d{4}-\d{2}-\d{2}T/);
});

test('saveRegistry creates missing parent directories', () => {
  const base = mkdtempSync(join(tmpdir(), 'gm-'));
  const file = join(base, 'nested', 'dir', 'registry.json');
  const reg = upsertGuide({ projects: [] }, { projectPath: '/tmp/p', guidePath: '/tmp/p/g.md', type: 'study', title: 'Nested', now: 'T0' });
  saveRegistry(file, reg);
  assert.deepEqual(loadRegistry(file), reg);
});

test('saveRegistry writes atomically, leaving no .tmp file behind', () => {
  const file = tmpFile();
  const reg = upsertGuide({ projects: [] }, { projectPath: '/tmp/p', guidePath: '/tmp/p/g.md', type: 'study', title: 'Atomic', now: 'T0' });
  saveRegistry(file, reg);
  assert.equal(existsSync(`${file}.tmp`), false);
  assert.deepEqual(loadRegistry(file), reg);
});

test('CLI rejects unknown type but still exits 0', () => {
  const file = tmpFile();
  const out = spawnSync(process.execPath, [
    'bin/register.js', '--project', '/p', '--guide', '/p/g.md', '--type', 'video', '--title', 'X',
  ], { encoding: 'utf8', env: { ...process.env, GM_REGISTRY_FILE: file } });
  assert.equal(out.status, 0);
  assert.match(out.stderr, /unknown type/i);
  assert.deepEqual(loadRegistry(file), { projects: [] });
});
