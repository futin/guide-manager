import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RegistryService } from '../server/src/registry/registry.service';

function fixture(): { root: string; service: RegistryService } {
  const root = mkdtempSync(join(tmpdir(), 'gm-reg-'));
  mkdirSync(join(root, 'proj', 'guides'), { recursive: true });
  writeFileSync(join(root, 'proj', 'guides', 'a.md'), '# Alpha');
  const file = join(root, 'registry.json');
  writeFileSync(file, JSON.stringify({
    projects: [{
      name: 'proj',
      path: join(root, 'proj'),
      guides: [
        { type: 'study', title: 'Alpha Guide', path: join(root, 'proj', 'guides', 'a.md'), updated: '2026-08-24T00:00:00Z' },
        { type: 'study', title: 'Ghost', path: join(root, 'proj', 'gone', 'x.md'), updated: '2026-08-24T00:00:00Z' }
      ]
    }]
  }));
  return { root, service: new RegistryService(file) };
}

describe('RegistryService', () => {
  it('hides guides whose file is gone', () => {
    const { service } = fixture();
    const titles = service.listProjects().flatMap((p) => p.guides.map((g) => g.title));
    expect(titles).toEqual(['Alpha Guide']);
  });

  it('drops a project left empty by that filter', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-empty-'));
    const file = join(root, 'registry.json');
    writeFileSync(file, JSON.stringify({
      projects: [{
        name: 'ghost-proj',
        path: join(root, 'proj'),
        guides: [{ type: 'study', title: 'Ghost', path: join(root, 'proj', 'gone.md'), updated: 'T0' }]
      }]
    }));
    expect(new RegistryService(file).listProjects()).toEqual([]);
  });

  it('returns an empty registry for a missing file', () => {
    const service = new RegistryService(join(mkdtempSync(join(tmpdir(), 'gm-none-')), 'nope.json'));
    expect(service.load()).toEqual({ projects: [] });
  });

  it('returns an empty registry for corrupt JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-bad-'));
    const file = join(root, 'registry.json');
    writeFileSync(file, '{broken');
    expect(new RegistryService(file).load()).toEqual({ projects: [] });
  });

  it('returns an empty registry when projects is not an array', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-shape-'));
    const file = join(root, 'registry.json');
    writeFileSync(file, '{"projects":"nope"}');
    expect(new RegistryService(file).load()).toEqual({ projects: [] });
  });

  it('names a guide by its registry title', () => {
    const { root, service } = fixture();
    expect(service.guideMeta(join(root, 'proj', 'guides', 'a.md'))).toEqual({
      title: 'Alpha Guide', type: 'study', project: 'proj'
    });
  });

  it('falls back to the basename for an unregistered sibling', () => {
    const { root, service } = fixture();
    writeFileSync(join(root, 'proj', 'guides', 'sibling.md'), '# S');
    expect(service.guideMeta(join(root, 'proj', 'guides', 'sibling.md'))).toEqual({ title: 'sibling.md' });
  });

  it('resolves a guide registered through a symlinked directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-link-'));
    mkdirSync(join(root, 'real', 'guides'), { recursive: true });
    writeFileSync(join(root, 'real', 'guides', 'a.md'), '# Alpha');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const file = join(root, 'registry.json');
    writeFileSync(file, JSON.stringify({
      projects: [{
        name: 'linked-proj',
        path: join(root, 'link'),
        guides: [{ type: 'study', title: 'Alpha Guide', path: join(root, 'link', 'guides', 'a.md'), updated: 'T0' }]
      }]
    }));
    // The request carries the resolved realpath (resolveAllowed realpaths it
    // before the controller ever sees it) while the registry stores the
    // symlinked one — realpathSync here is what the server does, not a
    // convenience. On macOS it also resolves tmpdir's own /var -> /private/var
    // symlink, which is why the raw join() would not match either path.
    const meta = new RegistryService(file).guideMeta(realpathSync(join(root, 'real', 'guides', 'a.md')));
    expect(meta).toEqual({ title: 'Alpha Guide', type: 'study', project: 'linked-proj' });
  });

  it('builds an allowlist of the registered guides own directories', () => {
    const { root, service } = fixture();
    const allowed = service.allowlist();
    expect(allowed.size).toBe(1);
    expect([...allowed][0]).toContain(join('proj', 'guides'));
    expect(root).toBeTruthy();
  });
});
