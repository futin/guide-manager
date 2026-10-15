/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { App } from '../client/src/App';
import type { Favorite, GuidesIndex } from '../shared/types';

/**
 * The project scope is a rail destination: the rail's trees are the only writer of `guide-manager.project` (a path) and `guide-manager.favProject` (a
 * name), AppShell owns both keys, and the two boards narrow to whatever the rail resolved. Driven through the whole `App`, because the point is the
 * wiring between the three — each piece on its own is covered by side-rail, guides-view and favorites-view.
 */

const guide = (path: string, title: string) => ({
  path, title, type: 'study' as const, updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-01T00:00:00Z',
  href: `/guide?p=${encodeURIComponent(path)}`, progress: null
});

const INDEX: GuidesIndex = {
  projects: [
    { name: 'alpha', path: '/a', guides: [guide('/a/one.html', 'Alpha One'), guide('/a/two.html', 'Alpha Two')] },
    { name: 'beta', path: '/b', guides: [guide('/b/three.html', 'Beta Three')] }
  ]
};

const fav = (id: string, project: string, title: string): Favorite => ({
  id, project, title, guidePath: `/${project}/x.html`, guideTitle: 'X', crumb: ['X'], anchor: null,
  html: `<p>${title}</p>`, text: title, note: '', order: 0, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z'
});

const FAVORITES: Favorite[] = [fav('f1', 'alpha', 'Saved alpha'), fav('f2', 'beta', 'Saved beta')];

/** Fetch routed by URL, with every `GET /api/guides` counted. `guides: 'fail'` rejects that endpoint and leaves favorites answering. */
function mockFetch({ guides = 'ok' }: { guides?: 'ok' | 'fail' } = {}) {
  const counts = { guides: 0 };
  (globalThis as { fetch?: unknown }).fetch = jest.fn((url: string) => {
    if (url.startsWith('/api/favorites')) return Promise.resolve({ ok: true, json: () => Promise.resolve(FAVORITES) });
    if (url.startsWith('/api/guides')) {
      counts.guides += 1;
      if (guides === 'fail') return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  return counts;
}

const setUrl = (url: string) => window.history.replaceState(null, '', url);
const store = (key: string, value: string) => localStorage.setItem(key, JSON.stringify(value));
const stored = (key: string) => JSON.parse(localStorage.getItem(key) as string);

const sectionRow = (label: string) => {
  const row = [...document.querySelectorAll<HTMLElement>('.rail .rail-link')].find((r) => r.querySelector('.rail-label')?.textContent === label);
  if (!row) throw new Error(`no section row ${label}`);
  return row;
};
const treeRow = (label: string) => {
  const row = [...document.querySelectorAll<HTMLElement>('.rail .rail-sublink')].find((r) => r.querySelector('.rail-sublabel')?.textContent === label);
  if (!row) throw new Error(`no tree row ${label}`);
  return row;
};
const current = () => document.querySelector('.rail .rail-sublink[aria-current="true"] .rail-sublabel')?.textContent;
const cardTitles = () => [...document.querySelectorAll('.guide-tile-title')].map((n) => n.textContent);
/* Both boards head each project with its own name only when unscoped — scoped, the band names it instead. */
const favTitles = () => [...document.querySelectorAll('.fav-title')].map((n) => n.textContent);
const favProjectNames = () => [...document.querySelectorAll('.fav-project-name')].map((n) => n.textContent);
const favBandTitle = () => document.querySelector('.fav-band h1')?.textContent;
const projectNames = () => [...document.querySelectorAll('.board-project-name')].map((n) => n.textContent);
const bandTitle = () => document.querySelector('.board-band h1')?.textContent;

async function renderOn(section: 'guides' | 'favorites', settled: string) {
  store('guide-manager.section', section);
  render(<App />);
  /* getAll: a favorite's title shows twice, on its card and in its snapshot body */
  await waitFor(() => expect(screen.getAllByText(settled).length).toBeGreaterThan(0));
  /* the rail's tree arrives with the data, which may land a tick after the card that proved the chunk loaded */
  await waitFor(() => expect(current()).toBeTruthy());
}

describe('App — the rail owns the project scope', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('/');
  });

  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
  });

  /* ------------------------------------------------------------------ Guides */

  it('opens Guides narrowed to the stored project, with that row current', async () => {
    mockFetch();
    store('guide-manager.project', '/b');
    await renderOn('guides', 'Beta Three');
    expect(cardTitles()).toEqual(['Beta Three']);
    expect(current()).toBe('beta');
  });

  it('writes the pick and narrows the board when a project row is clicked', async () => {
    mockFetch();
    await renderOn('guides', 'Beta Three');
    act(() => { treeRow('alpha').click(); });
    expect(stored('guide-manager.project')).toBe('/a');
    expect(bandTitle()).toBe('Guides · alpha');
    expect(projectNames()).toEqual([]);
    expect(cardTitles()).not.toContain('Beta Three');
  });

  it('fails a stale stored path open to All projects, without rewriting it', async () => {
    mockFetch();
    store('guide-manager.project', '/gone');
    await renderOn('guides', 'Beta Three');
    expect(current()).toBe('All projects');
    expect(projectNames()).toEqual(['alpha', 'beta']);
    expect(stored('guide-manager.project')).toBe('/gone');
  });

  /* ------------------------------------------------------------------ Favorites */

  it('opens Favorites narrowed to the stored project name, with that row current', async () => {
    mockFetch();
    store('guide-manager.favProject', 'beta');
    await renderOn('favorites', 'Saved beta');
    expect(favTitles()).toEqual(['Saved beta']);
    expect(favBandTitle()).toBe('Favorites · beta');
    expect(current()).toBe('beta');
  });

  it('writes the favorites pick by name and narrows the board', async () => {
    mockFetch();
    await renderOn('favorites', 'Saved beta');
    act(() => { treeRow('alpha').click(); });
    expect(stored('guide-manager.favProject')).toBe('alpha');
    expect(favBandTitle()).toBe('Favorites · alpha');
    expect(favTitles()).toEqual(['Saved alpha']);
    expect(favProjectNames()).toEqual([]);
  });

  it('fails a stale stored favorites name open to All projects, without rewriting it', async () => {
    mockFetch();
    store('guide-manager.favProject', 'gone');
    await renderOn('favorites', 'Saved beta');
    expect(current()).toBe('All projects');
    expect(favBandTitle()).toBe('Favorites · All projects');
    expect(favProjectNames()).toEqual(['alpha', 'beta']);
    expect(stored('guide-manager.favProject')).toBe('gone');
  });

  /*
    Review Focus 4: removing the last favorite of the scoped project takes its rail row with it, so the scope fails open to All projects — and like any
    other stale scope it is not rewritten. Save into beta again and the rail comes back to beta on its own.
  */
  it('fails open to All projects when the scoped project loses its last favorite, keeping the stored name', async () => {
    mockFetch();
    store('guide-manager.favProject', 'beta');
    await renderOn('favorites', 'Saved beta');
    expect(treeRow('beta')).toBeTruthy();

    const card = [...document.querySelectorAll<HTMLElement>('.fav-card')].find((c) => c.querySelector('.fav-title')?.textContent === 'Saved beta')!;
    fireEvent.click(within(card).getByLabelText('Remove'));
    fireEvent.click(within(card).getByLabelText('Confirm remove'));

    await waitFor(() => expect(favBandTitle()).toBe('Favorites · All projects'));
    expect([...document.querySelectorAll('.rail .rail-sublabel')].map((n) => n.textContent)).not.toContain('beta');
    expect(current()).toBe('All projects');
    expect(stored('guide-manager.favProject')).toBe('beta');
  });

  /* ------------------------------------------------------------------ failure is per section */

  it('drops only the Guides count and tree when the guides fetch fails', async () => {
    mockFetch({ guides: 'fail' });
    store('guide-manager.section', 'guides');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Guides unavailable')).toBeTruthy());
    await waitFor(() => expect(sectionRow('Favorites').querySelector('.rail-count')?.textContent).toBe('2'));
    expect(sectionRow('Guides').querySelector('.rail-count')).toBeNull();
    expect(document.querySelectorAll('.rail .rail-sublink')).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ the deep link and the scope */

  /*
    A favorite's crumb can name a guide outside the stored scope. The link opens it regardless — it is an arrival, not a pick — and the board waiting
    behind the viewer is still the one the reader left: scoped to beta, with the key untouched.
  */
  it('opens a deep-linked guide outside the stored scope, and comes back to the scoped board', async () => {
    mockFetch();
    store('guide-manager.project', '/b');
    setUrl(`/?open=${encodeURIComponent('/a/one.html')}`);
    render(<App />);
    await waitFor(() => expect(document.querySelector('.guide-viewer-title')?.textContent).toBe('Alpha One'));

    act(() => { (document.querySelector('.guide-viewer-back') as HTMLElement).click(); });
    await waitFor(() => expect(cardTitles()).toEqual(['Beta Three']));
    expect(stored('guide-manager.project')).toBe('/b');
  });

  /* ------------------------------------------------------------------ progress refetch, lifted */

  /* The coalescing lives in useGuides; this proves it survived the move to AppShell — installed once, not once per mount of anything. */
  it('coalesces two progress messages inside 300 ms into one refetch', async () => {
    const counts = mockFetch();
    await renderOn('guides', 'Beta Three');
    const before = counts.guides;

    jest.useFakeTimers();
    try {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { source: 'guide-manager', kind: 'progress' } }));
        jest.advanceTimersByTime(100);
        window.dispatchEvent(new MessageEvent('message', { data: { source: 'guide-manager', kind: 'progress' } }));
        jest.advanceTimersByTime(400);
      });
    } finally {
      jest.useRealTimers();
    }
    expect(counts.guides).toBe(before + 1);
  });
});
