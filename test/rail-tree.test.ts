import { ALL, favoriteTree, guideTree, resolveScope } from '../client/src/lib/rail';
import type { Favorite, GuideEntry, GuidesIndex, ProjectEntry } from '../shared/types';

/** A guide with only `path` meaningful — the tree helpers count guides and read nothing inside them. */
function guide(path: string): GuideEntry {
  return {
    path,
    title: path,
    type: 'study',
    updated: '2026-09-01T12:00:00Z',
    createdAt: '2026-09-01T12:00:00Z',
    href: `/guide?path=${encodeURIComponent(path)}`,
    progress: null,
  };
}

function project(name: string, path: string, guideCount: number): ProjectEntry {
  return {
    name,
    path,
    guides: Array.from({ length: guideCount }, (_, i) => guide(`${path}/g${i}.html`)),
  };
}

/** A favorite with only `project` meaningful — the tree groups by project name and nothing else. */
let nextId = 0;
function fav(projectName: string): Favorite {
  const id = String(nextId++);
  return {
    id,
    guidePath: `/somewhere/${id}.html`,
    project: projectName,
    guideTitle: 't',
    anchor: null,
    crumb: [],
    html: '<p>x</p>',
    text: 'x',
    title: 'x',
    note: '',
    order: 0,
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z',
  };
}

const index: GuidesIndex = { projects: [project('alpha', '/a', 2), project('beta', '/b', 1)] };

describe('ALL', () => {
  it("is the 'all' sentinel both storage keys already hold", () => {
    expect(ALL).toBe('all');
  });
});

describe('guideTree', () => {
  it('leads with All projects and the total, then one row per project keyed by path, in index order', () => {
    expect(guideTree(index)).toEqual([
      { label: 'All projects', scope: 'all', count: 3 },
      { label: 'alpha', scope: '/a', count: 2 },
      { label: 'beta', scope: '/b', count: 1 },
    ]);
  });

  it('keeps a project with no guides, at count 0', () => {
    const rows = guideTree({ projects: [project('alpha', '/a', 2), project('empty', '/e', 0)] });
    expect(rows).toContainEqual({ label: 'empty', scope: '/e', count: 0 });
    expect(rows[0]).toEqual({ label: 'All projects', scope: 'all', count: 2 });
  });

  it('gives only the All projects row, at 0, for an empty index', () => {
    expect(guideTree({ projects: [] })).toEqual([{ label: 'All projects', scope: 'all', count: 0 }]);
  });
});

describe('favoriteTree', () => {
  it('orders known names by the index, not by the favorites, and keys by name', () => {
    const favs = [fav('beta'), fav('beta'), fav('alpha'), fav('beta')];
    expect(favoriteTree(favs, index)).toEqual([
      { label: 'All projects', scope: 'all', count: 4 },
      { label: 'alpha', scope: 'alpha', count: 1 },
      { label: 'beta', scope: 'beta', count: 3 },
    ]);
  });

  it('gives no row to an indexed project with no favorites', () => {
    const withGamma: GuidesIndex = { projects: [...index.projects, project('gamma', '/g', 4)] };
    const rows = favoriteTree([fav('alpha')], withGamma);
    expect(rows.map((r) => r.label)).toEqual(['All projects', 'alpha']);
  });

  it('appends a name the index does not know after the known names', () => {
    const favs = [fav('orphan'), fav('beta'), fav('orphan')];
    expect(favoriteTree(favs, index)).toEqual([
      { label: 'All projects', scope: 'all', count: 3 },
      { label: 'beta', scope: 'beta', count: 1 },
      { label: 'orphan', scope: 'orphan', count: 2 },
    ]);
  });

  it('falls back to first-seen order with no index at all', () => {
    const favs = [fav('orphan'), fav('beta'), fav('alpha'), fav('orphan')];
    expect(favoriteTree(favs, null)).toEqual([
      { label: 'All projects', scope: 'all', count: 4 },
      { label: 'orphan', scope: 'orphan', count: 2 },
      { label: 'beta', scope: 'beta', count: 1 },
      { label: 'alpha', scope: 'alpha', count: 1 },
    ]);
  });

  it('gives only the All projects row, at 0, with nothing saved', () => {
    expect(favoriteTree([], null)).toEqual([{ label: 'All projects', scope: 'all', count: 0 }]);
  });
});

describe('a project name shared by two paths', () => {
  const dupIndex: GuidesIndex = { projects: [project('dup', '/x', 1), project('dup', '/y', 2)] };

  it('is two Guides rows, one per path', () => {
    expect(guideTree(dupIndex)).toEqual([
      { label: 'All projects', scope: 'all', count: 3 },
      { label: 'dup', scope: '/x', count: 1 },
      { label: 'dup', scope: '/y', count: 2 },
    ]);
  });

  it('is one Favorites row, since a favorite carries only the name', () => {
    expect(favoriteTree([fav('dup')], dupIndex)).toEqual([
      { label: 'All projects', scope: 'all', count: 1 },
      { label: 'dup', scope: 'dup', count: 1 },
    ]);
  });
});

describe('resolveScope', () => {
  const rows = guideTree(index);

  it('keeps a stored scope some row names', () => {
    expect(resolveScope(rows, '/a')).toBe('/a');
  });

  it('fails open to all for a scope no row names', () => {
    expect(resolveScope(rows, '/gone')).toBe('all');
  });

  it('fails open to all before the rows have loaded', () => {
    expect(resolveScope(null, '/a')).toBe('all');
  });

  it('passes all through', () => {
    expect(resolveScope(rows, 'all')).toBe('all');
  });
});
