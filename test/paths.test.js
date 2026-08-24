import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAllowlist, resolveAllowed } from '../server/lib/paths.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gm-paths-'));
  mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
  writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# A');
  writeFileSync(join(root, 'proj', 'guides', 'img.png'), 'png');
  writeFileSync(join(root, 'proj', 'secret.md'), 'secret');
  writeFileSync(join(root, 'outside.md'), 'outside');
  symlinkSync(join(root, 'outside.md'), join(root, 'proj', 'guides', 'link.md'));
  const registry = {
    projects: [{
      name: 'proj',
      path: join(root, 'proj'),
      guides: [
        { type: 'study', title: 'A', path: join(root, 'proj', 'guides', 'a.md'), updated: 'T0' },
        { type: 'study', title: 'Gone', path: join(root, 'proj', 'deleted-dir', 'x.md'), updated: 'T0' },
      ],
    }],
  };
  return { root, registry, allowed: buildAllowlist(registry) };
}

test('buildAllowlist contains the guide parent dir, skips missing dirs', () => {
  const { root, allowed } = fixture();
  assert.equal(allowed.size, 1);
  assert.ok(allowed.has(realpathSync(join(root, 'proj', 'guides'))));
});

test('registered guide file resolves', () => {
  const { root, allowed } = fixture();
  assert.ok(resolveAllowed(join(root, 'proj', 'guides', 'a.md'), allowed));
});

test('sibling asset in same dir resolves', () => {
  const { root, allowed } = fixture();
  assert.ok(resolveAllowed(join(root, 'proj', 'guides', 'img.png'), allowed));
});

test('file outside the guide dir is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'secret.md'), allowed), null);
});

test('dot-dot traversal is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'guides', '..', 'secret.md'), allowed), null);
});

test('symlink escaping the dir is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'guides', 'link.md'), allowed), null);
});

test('nonexistent path is rejected', () => {
  const { root, allowed } = fixture();
  assert.equal(resolveAllowed(join(root, 'proj', 'guides', 'nope.md'), allowed), null);
});

test('prefix-sibling dir is rejected (no startsWith false positive)', () => {
  const root = mkdtempSync(join(tmpdir(), 'gm-prefix-'));
  mkdirSync(join(root, 'guides'));
  mkdirSync(join(root, 'guides-evil'));
  writeFileSync(join(root, 'guides', 'a.md'), '# A');
  writeFileSync(join(root, 'guides-evil', 'b.md'), 'evil');
  const registry = {
    projects: [{ name: 'p', path: root, guides: [{ type: 'study', title: 'A', path: join(root, 'guides', 'a.md'), updated: 'T0' }] }],
  };
  const allowed = buildAllowlist(registry);
  assert.equal(resolveAllowed(join(root, 'guides-evil', 'b.md'), allowed), null);
});
