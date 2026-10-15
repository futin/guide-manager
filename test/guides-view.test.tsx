/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

import GuidesView from '../client/src/components/guides/GuidesView';
import { useGuides } from '../client/src/hooks/useGuides';
import type { GuideEntry, GuideProgress, GuidesIndex } from '../shared/types';

/** GuidesView as AppShell mounts it: the data hook one level up, handing the board its state, and the scope the rail resolved. Picking a scope is the
 *  rail's and is driven through App in app-projects.test.tsx; here it is only ever handed in. */
function Board({ scope = 'all' }: { scope?: string }) {
  return <GuidesView guides={useGuides()} scope={scope} />;
}

/*
  Three guides in the first project, deliberately arranged so the three sort keys give
  three *different* orders — otherwise a sort test passes on a board that is not
  sorting at all. By createdAt: Beta, Omega, Alpha. By name: Alpha, Beta, Omega.
  By type: the two study guides (Alpha, Omega) and then the deck.
*/
const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        {
          path: '/p/g/a.md', title: 'Alpha Guide', type: 'study', updated: '2026-08-24T10:19:08.417Z', createdAt: '2026-08-02T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fa.md', progress: null
        },
        {
          path: '/p/g/deck.html', title: 'Beta Deck', type: 'tutor', updated: '2026-08-20T00:00:00Z', createdAt: '2026-08-10T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fdeck.html',
          progress: {
            guidePath: '/p/g/deck.html', percent: 100, furthestPercent: 100,
            position: { kind: 'deck', cardIndex: 29 },
            completed: true, lastOpenedAt: '2026-08-23T00:00:00Z', openCount: 4
          }
        },
        {
          path: '/p/g/omega.md', title: 'Omega Notes', type: 'study', updated: '2026-08-18T00:00:00Z', createdAt: '2026-08-05T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fomega.md', progress: null
        }
      ]
    },
    {
      name: 'german-study-partner',
      path: '/q',
      guides: [
        {
          path: '/q/g/c.md', title: 'Gamma', type: 'study', updated: '2026-08-22T00:00:00Z', createdAt: '2026-08-01T00:00:00Z',
          href: '/guide?p=%2Fq%2Fg%2Fc.md',
          /* percent and furthestPercent deliberately disagree: the reader is
             back near the top, having once reached 62%. The tile must show the
             high-water mark, so a test that could pass on either number would
             not be testing anything. */
          progress: {
            guidePath: '/q/g/c.md', percent: 8, furthestPercent: 62,
            position: { kind: 'doc', anchorId: 'intro' },
            completed: false, lastOpenedAt: '2026-08-23T00:00:00Z', openCount: 2
          }
        }
      ]
    }
  ]
};

/*
  The board fixture: one project, eight guides — a three-lesson series and five loose — with reading state chosen so every count the band and the
  switch print is non-trivial and none of them coincide.

  By the rules in lib/continue.ts: in progress = furthest > 0 and not completed → Indexes, Alpha, Gamma, Delta, Epsilon (5); read = completed → Storage
  engine, Beta (2). Types: Alpha and Gamma are study, the other six tutor. Last opened, newest first: Epsilon (14th), Alpha (13th), Indexes (12th), Gamma
  (11th), Delta (9th) — five candidates, so the cap of four is exercised.

  The stamps carry the current year and a noon UTC time, so `shortDate` prints `Oct 12` (no year suffix) in any time zone within eleven hours of UTC.
*/
const YEAR = new Date().getFullYear();
const SERIES_DIR = '/b/docs/guides/tutor/mongo-internals';

function progressAt(path: string, furthest: number, day: number | null, completed = false): GuideProgress {
  return {
    guidePath: path, percent: furthest, furthestPercent: furthest, position: { kind: 'doc' },
    completed, lastOpenedAt: day === null ? '' : `${YEAR}-10-${String(day).padStart(2, '0')}T12:00:00Z`, openCount: 1
  };
}

function entry(path: string, title: string, type: 'study' | 'tutor', progress: (path: string) => GuideProgress | null): GuideEntry {
  return {
    path, title, type, updated: `${YEAR}-09-17T12:00:00Z`, createdAt: '2026-08-01T00:00:00Z',
    href: `/guide?p=${encodeURIComponent(path)}`, progress: progress(path)
  };
}

const BOARD: GuidesIndex = {
  projects: [
    {
      name: 'board-project',
      path: '/b',
      guides: [
        entry(`${SERIES_DIR}/mongo-internals-1-storage.html`, 'Storage engine', 'tutor', (p) => progressAt(p, 100, 10, true)),
        entry(`${SERIES_DIR}/mongo-internals-2-indexes.html`, 'Indexes', 'tutor', (p) => progressAt(p, 40, 12)),
        entry(`${SERIES_DIR}/mongo-internals-3-replication.html`, 'Replication', 'tutor', () => null),
        /* Review Focus 5: furthest 100 without completion is in progress, not read. */
        entry('/b/docs/alpha.html', 'Alpha guide', 'study', (p) => progressAt(p, 100, 13)),
        entry('/b/docs/beta.html', 'Beta deck', 'tutor', (p) => progressAt(p, 100, 8, true)),
        entry('/b/docs/gamma.html', 'Gamma notes', 'study', (p) => progressAt(p, 62, 11)),
        entry('/b/docs/delta.html', 'Delta deck', 'tutor', (p) => progressAt(p, 10, 9)),
        entry('/b/docs/epsilon.html', 'Epsilon deck', 'tutor', (p) => progressAt(p, 30, 14))
      ]
    }
  ]
};

/** Nothing opened anywhere: the Continue row has nothing to say and must not draw its heading. */
const UNREAD: GuidesIndex = {
  projects: [{ name: 'fresh', path: '/f', guides: [entry('/f/one.html', 'One', 'study', () => null)] }]
};

function mockFetch(body: unknown, ok = true): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body)
  });
  (globalThis as { fetch?: unknown }).fetch = fn;
  return fn;
}

/** Returns the render result so a test can unmount and mount again — which is
 *  how persisted state is checked without reloading a page jsdom does not have. */
async function renderGuides(body: unknown = INDEX, scope = 'all') {
  mockFetch(body);
  const result = render(<Board scope={scope} />);
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  return result;
}

const texts = (selector: string, root: ParentNode = document) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
/** Every loose tile on the board, in render order — which is what the sort tests read. */
const cardTitles = () => texts('.guide-tile-title');
const projectNames = () => texts('.board-project-name');
const continueTitles = () => texts('.continue-title');
const bandTitle = () => document.querySelector('.board-band h1')?.textContent;
const bandMeta = () => document.querySelector('.board-band p')?.textContent;
/** A loose tile, found by its title — a title can show twice (its tile and its Continue tile), so lookups go through the tile's own class. */
const tile = (title: string) => {
  const t = [...document.querySelectorAll<HTMLElement>('.guide-tile')].find((n) => n.querySelector('.guide-tile-title')?.textContent === title);
  if (!t) throw new Error(`no tile ${title}`);
  return t;
};
const continueTile = (title: string) => {
  const t = [...document.querySelectorAll<HTMLElement>('.continue-tile')].find((n) => n.querySelector('.continue-title')?.textContent === title);
  if (!t) throw new Error(`no continue tile ${title}`);
  return t;
};
/** Opens a guide from wherever the board draws it as a tile or a series row. */
const openTile = (title: string) => {
  const target = [...document.querySelectorAll<HTMLElement>('.guide-tile, .series-row')]
    .find((n) => n.querySelector('.guide-tile-title, .series-row-title')?.textContent === title);
  if (!target) throw new Error(`no tile ${title}`);
  act(() => { target.click(); });
};
/** The type switch's options, as their accessible names read: label, space, count. */
const switchOption = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label} \\d+$`) });
const switchTexts = () => texts('.board-type > button');

/* The toolbar controls are found by their aria-labels, which is also the only
   name they have: the row carries no visible <label>s (see GuidesView). Looking
   them up this way means these tests fail if the accessible name is ever dropped,
   which is the point. */
const searchBox = () => screen.getByLabelText('Search guides') as HTMLInputElement;
const control = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;
const setControl = (name: string, value: string) =>
  fireEvent.change(control(name), { target: { value } });

describe('GuidesView', () => {
  /* The fold state and the toolbar are persisted, so without this a value
     set by one test leaks into every test after it. */
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
    jest.restoreAllMocks();
  });

  /* ------------------------------------------------------------------ band */

  it('names the scoped project in the band and counts it before any filter', async () => {
    await renderGuides(BOARD, '/b');
    expect(bandTitle()).toBe('Guides · board-project');
    expect(bandMeta()).toBe('8 guides · 5 in progress · 2 read');
    /* The band counts the scope, not the query: it says what the project holds, and the switch below it says what the filters leave. */
    fireEvent.change(searchBox(), { target: { value: 'deck' } });
    act(() => { switchOption('Study').click(); });
    expect(bandMeta()).toBe('8 guides · 5 in progress · 2 read');
  });

  it('says All projects when unscoped, and reads singular for a scope of one guide', async () => {
    const first = await renderGuides();
    expect(bandTitle()).toBe('Guides · All projects');
    expect(bandMeta()).toBe('4 guides · 1 in progress · 1 read');
    first.unmount();
    await renderGuides(INDEX, '/q');
    expect(bandMeta()).toBe('1 guide · 1 in progress · 0 read');
  });

  /* ------------------------------------------------------------------ type switch */

  it('counts each type option over the scope, and a query leaves the counts alone', async () => {
    await renderGuides(BOARD, '/b');
    expect(switchTexts()).toEqual(['All 8', 'Study 2', 'Tutor 6']);
    fireEvent.change(searchBox(), { target: { value: 'deck' } });
    /* The counts say what the switch would show, not what the query left. */
    expect(switchTexts()).toEqual(['All 8', 'Study 2', 'Tutor 6']);
  });

  it('narrows to one type when an option is picked, and remembers it', async () => {
    await renderGuides(BOARD, '/b');
    act(() => { switchOption('Tutor').click(); });
    expect(localStorage.getItem('guide-manager.filterType')).toBe('"tutor"');
    expect(switchOption('Tutor').getAttribute('aria-pressed')).toBe('true');
    expect(cardTitles().sort()).toEqual(['Beta deck', 'Delta deck', 'Epsilon deck']);
    expect(texts('.series-row-title')).toEqual(['Storage engine', 'Indexes', 'Replication']);
  });

  /* ------------------------------------------------------------------ continue reading */

  it('lists the in-progress guides last opened first, four at most', async () => {
    await renderGuides(BOARD, '/b');
    expect(document.querySelector('.continue .sec-h')?.textContent).toBe('Continue reading last opened first');
    expect(continueTitles()).toEqual(['Epsilon deck', 'Alpha guide', 'Indexes', 'Gamma notes']);
  });

  it('marks a lesson with its series and place, and opens the viewer on a click', async () => {
    await renderGuides(BOARD, '/b');
    expect(continueTile('Indexes').querySelector('.continue-meta')?.textContent).toBe('Mongo internals · 2 of 3 · Oct 12');
    /* A loose guide carries the date alone. */
    expect(continueTile('Gamma notes').querySelector('.continue-meta')?.textContent).toBe('Oct 11');
    act(() => { continueTile('Indexes').click(); });
    expect(document.querySelector('.guide-viewer-title')?.textContent).toBe('Indexes');
  });

  it('hides Continue reading while a query runs, and again while a type is picked', async () => {
    await renderGuides(BOARD, '/b');
    fireEvent.change(searchBox(), { target: { value: 'e' } });
    expect(document.querySelector('.continue')).toBeNull();
    fireEvent.change(searchBox(), { target: { value: '' } });
    expect(document.querySelector('.continue')).toBeTruthy();
    act(() => { switchOption('Study').click(); });
    expect(document.querySelector('.continue')).toBeNull();
  });

  it('draws no Continue reading at all when nothing is in progress', async () => {
    await renderGuides(UNREAD);
    expect(cardTitles()).toEqual(['One']);
    expect(document.querySelector('.continue')).toBeNull();
    expect(screen.queryByText('Continue reading')).toBeNull();
  });

  /* ------------------------------------------------------------------ tiles */

  it('shows each loose guide with its type pill and short update date', async () => {
    await renderGuides(BOARD, '/b');
    expect(tile('Alpha guide').querySelector('.pill')?.className).toBe('pill study');
    expect(tile('Beta deck').querySelector('.pill')?.className).toBe('pill tutor');
    expect(tile('Alpha guide').querySelector('.guide-tile-head .meta')?.textContent).toBe('Sep 17');
  });

  /* Review Focus 5: the percent is a position, completion is the guide's own claim — only the second earns Read. */
  it('draws a bar and 100% for a guide at 100 that never completed, and Read only for a completed one', async () => {
    await renderGuides(BOARD, '/b');
    const alpha = tile('Alpha guide');
    expect(alpha.querySelector('.guide-tile-pct')?.textContent).toBe('100%');
    expect(alpha.querySelector('.bar')).toBeTruthy();
    expect(alpha.querySelector('.pill.read')).toBeNull();

    const beta = tile('Beta deck');
    expect(beta.querySelector('.pill.read')?.textContent).toBe('Read');
    expect(beta.querySelector('.bar')).toBeNull();
  });

  it('prints the high-water mark, not the current position', async () => {
    await renderGuides();
    // 62 is the high-water mark; 8 is where the reader currently is. Glancing back at chapter one must not walk the board backwards.
    expect(tile('Gamma').querySelector('.guide-tile-pct')?.textContent).toBe('62%');
  });

  it('heads the series and the loose tiles with their counts', async () => {
    await renderGuides(BOARD, '/b');
    expect(texts('.board-sec-h')).toEqual(['Series 1', 'Guides 5']);
  });

  it("frames the entry's own href rather than rebuilding it", async () => {
    await renderGuides();
    openTile('Beta Deck');
    const frame = document.querySelector('iframe.guide-viewer-frame');
    expect(frame?.getAttribute('src')).toBe('/guide?p=%2Fp%2Fg%2Fdeck.html');
    expect(screen.getByText('Beta Deck')).toBeTruthy();
  });

  it('locks the scroll chain while a guide is open and releases it on the way out', async () => {
    await renderGuides();
    openTile('Alpha Guide');
    expect(document.documentElement.classList.contains('guide-locked')).toBe(true);

    act(() => { screen.getByRole('button', { name: /Guides/ }).click(); });
    expect(document.documentElement.classList.contains('guide-locked')).toBe(false);
    expect(document.querySelector('iframe.guide-viewer-frame')).toBeNull();
  });

  /* ------------------------------------------------------------------ all projects */

  /*
    Unscoped, the board draws each project's series and guides under the project's name, and the Continue row once, across all of them, above. The
    per-project fold is gone — narrowing to one project is the rail's job — so nothing on a board without series carries aria-expanded.
  */
  it('draws every project under its own heading, with one Continue row above', async () => {
    await renderGuides();
    expect(projectNames()).toEqual(['guide-manager', 'german-study-partner']);
    expect(texts('.board-project-meta')).toEqual(['3 guides · 0 in progress · 1 read', '1 guide · 1 in progress · 0 read']);
    expect(document.querySelectorAll('.continue')).toHaveLength(1);
    expect(continueTitles()).toEqual(['Gamma']);
    expect(document.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });

  it('neither reads nor writes the retired collapsedBays key', async () => {
    const get = jest.spyOn(Storage.prototype, 'getItem');
    const set = jest.spyOn(Storage.prototype, 'setItem');
    await renderGuides();
    act(() => { switchOption('Study').click(); });
    const touched = [...get.mock.calls, ...set.mock.calls].map((c) => c[0]);
    expect(touched).not.toContain('guide-manager.collapsedBays');
    /* The spies are live: the board does read its own keys through them. */
    expect(touched).toContain('guide-manager.filterType');
  });

  it('narrows the board to the scoped project, dropping the per-project heading for the band', async () => {
    await renderGuides(INDEX, '/q');
    expect(projectNames()).toEqual([]);
    expect(bandTitle()).toBe('Guides · german-study-partner');
    expect(cardTitles()).toEqual(['Gamma']);
  });

  /*
    Fail-open. AppShell resolves a stale path to ALL before it gets here, but the
    board does not lean on that: a scope naming no registered project shows every
    project rather than an empty board that looks like the server broke.
  */
  it('shows every project for a scope the index does not name, rather than blanking the board', async () => {
    await renderGuides(INDEX, '/gone');
    expect(bandTitle()).toBe('Guides · All projects');
    expect(projectNames()).toEqual(['guide-manager', 'german-study-partner']);
  });

  /* ------------------------------------------------------------------ empty states */

  it('says Loading… while the index is in flight', () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(() => new Promise(() => {}));
    render(<Board />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('says so when nothing is registered', async () => {
    await renderGuides({ projects: [] });
    expect(screen.getByText('Nothing registered yet')).toBeTruthy();
  });

  it('says so when the server cannot be reached', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'));
    render(<Board />);
    await waitFor(() => expect(screen.getByText('Guides unavailable')).toBeTruthy());
  });

  /*
    Two empty states, because they ask for two different things: an empty registry
    is fixed somewhere else entirely (register a guide from a skill), an empty
    result by clearing the controls two inches above the message.
  */
  it('distinguishes an empty registry from filters that matched nothing', async () => {
    await renderGuides();
    setControl('Search guides', 'zzz');
    expect(screen.getByText('No matches')).toBeTruthy();
    expect(screen.queryByText('Nothing registered yet')).toBeNull();
    expect(projectNames()).toEqual([]);
  });

  /* ------------------------------------------------------------------ toolbar */

  /*
    Order is part of the design, not an accident of JSX: search reads first because
    it is the control you reach for, then narrow before order — type, then sort.
    There is no project select: the scope is a rail destination.
  */
  it('puts search, the type switch and sort in the toolbar, in that order, and no project select', async () => {
    await renderGuides();
    const bar = document.querySelector('.board-toolbar');
    expect([...(bar?.children ?? [])].map((el) => el.getAttribute('aria-label'))).toEqual(['Search guides', 'Type', 'Sort']);
    expect(searchBox().getAttribute('placeholder')).toBe('Search titles');
    expect(bar?.querySelectorAll('select')).toHaveLength(1);
  });

  it('narrows to the guides whose titles match the query', async () => {
    await renderGuides();
    setControl('Search guides', 'deck');
    expect(cardTitles()).toEqual(['Beta Deck']);
  });

  /* Case-insensitive and a substring, not a prefix: a title is a sentence, and the
     word you remember of it is rarely its first. */
  it('matches case-insensitively, anywhere in the title', async () => {
    await renderGuides();
    setControl('Search guides', 'OTE');
    expect(cardTitles()).toEqual(['Omega Notes']);
  });

  /*
    A project the query emptied goes entirely, heading and all — otherwise a two-hit
    search on a board of a dozen projects returns a screenful of empty headings with
    the hits buried among them.
  */
  it('drops a project the query emptied, heading and all', async () => {
    await renderGuides();
    setControl('Search guides', 'deck');
    expect(projectNames()).toEqual(['guide-manager']);
  });

  /* Newest first is the default: the point of the board is that the guide you
     generated ten minutes ago is at the top of the project you generated it in. */
  it('sorts a project by creation date, newest first, by default', async () => {
    await renderGuides();
    expect(cardTitles()).toEqual(['Beta Deck', 'Omega Notes', 'Alpha Guide', 'Gamma']);
  });

  it('sorts a project by title when asked', async () => {
    await renderGuides();
    setControl('Sort', 'name');
    expect(cardTitles()).toEqual(['Alpha Guide', 'Beta Deck', 'Omega Notes', 'Gamma']);
  });

  it('sorts a project by type, study before tutor, alphabetically inside each', async () => {
    await renderGuides();
    setControl('Sort', 'type');
    expect(cardTitles()).toEqual(['Alpha Guide', 'Omega Notes', 'Beta Deck', 'Gamma']);
  });

  /*
    Sorting is applied inside each project, never across the board: the projects are
    the registry's own order, and re-ordering them by their newest guide would make
    the board's layout jump every time a guide was registered.
  */
  it('leaves the projects themselves in index order whatever the sort', async () => {
    await renderGuides();
    setControl('Sort', 'name');
    expect(projectNames()).toEqual(['guide-manager', 'german-study-partner']);
  });

  /* The three controls are an intersection, not a sequence of separate views —
     and the survivors are still sorted by whatever the sort select says. */
  it('composes search, type and sort into one sorted intersection', async () => {
    await renderGuides();
    act(() => { switchOption('Study').click(); });
    setControl('Search guides', 'e');
    setControl('Sort', 'name');
    /* 'e' is in every title here; the type filter is what removes the deck, and
       Gamma has no 'e' at all — so the intersection is the two study guides of the
       first project, in title order. */
    expect(cardTitles()).toEqual(['Alpha Guide', 'Omega Notes']);
  });

  /*
    The type and sort are remembered per device: a phone picked up mid-session
    should still be looking at the board it was left looking at. (The project scope
    is remembered too, but by AppShell for the rail — see app-projects.test.tsx.)
  */
  it('remembers the type and sort across a remount', async () => {
    const first = await renderGuides();
    act(() => { switchOption('Study').click(); });
    setControl('Sort', 'name');
    expect(localStorage.getItem('guide-manager.filterType')).toBe('"study"');
    expect(localStorage.getItem('guide-manager.sort')).toBe('"name"');

    first.unmount();
    await renderGuides();
    expect(switchOption('Study').getAttribute('aria-pressed')).toBe('true');
    expect(control('Sort').value).toBe('name');
    expect(cardTitles()).toEqual(['Alpha Guide', 'Omega Notes', 'Gamma']);
  });

  /*
    The search box is the one control deliberately *not* remembered. A board that
    opens showing three tiles out of forty for no visible reason reads as broken
    rather than as filtered — and nobody reads a text field before deciding their
    guides are gone.
  */
  it('forgets the query on a remount, unlike the type and sort', async () => {
    const first = await renderGuides();
    setControl('Search guides', 'deck');
    expect(cardTitles()).toEqual(['Beta Deck']);

    first.unmount();
    await renderGuides();
    expect(searchBox().value).toBe('');
    expect(cardTitles()).toHaveLength(4);
  });
  /*
    The viewer header (spec §4): `‹ Guides`, a crumb over the title, the furthest pill and `Start over`. The crumb and the pill are read out of the
    *current* index by the open path rather than frozen at open time, so a refetch while the guide is open repaints them — and a refetch that no longer
    names the guide leaves the viewer standing with the title alone over it.
  */
  describe('viewer header', () => {
    const crumb = () => document.querySelector('.guide-viewer-crumb')?.textContent;
    const title = () => document.querySelector('.guide-viewer-title')?.textContent;
    const pill = () => document.querySelector('.guide-viewer-head .pill');

    it('names a lesson by project, series and place, with its furthest mark', async () => {
      await renderGuides(BOARD, '/b');
      openTile('Indexes');
      expect(crumb()).toBe('board-project · Mongo internals · 2 of 3');
      expect(title()).toBe('Indexes');
      expect(pill()?.textContent).toBe('40% furthest');
    });

    it('names a loose guide by its project alone', async () => {
      await renderGuides(BOARD, '/b');
      openTile('Gamma notes');
      expect(crumb()).toBe('board-project');
      expect(pill()?.textContent).toBe('62% furthest');
    });

    it('draws no pill for a guide never read past the top', async () => {
      await renderGuides();
      openTile('Alpha Guide');
      expect(title()).toBe('Alpha Guide');
      expect(pill()).toBeNull();
    });

    it('reads Read once the guide reports completion, not a percent', async () => {
      await renderGuides();
      openTile('Beta Deck');
      expect(pill()?.textContent).toBe('Read');
      expect(pill()?.className).toBe('pill read');
    });

    it('keeps the viewer open with the title alone when a refetch drops the guide', async () => {
      const fetchMock = (await renderGuides(BOARD, '/b'), globalThis.fetch as jest.Mock);
      openTile('Indexes');
      expect(crumb()).toBe('board-project · Mongo internals · 2 of 3');

      fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(UNREAD) });
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { source: 'guide-manager', kind: 'progress' } }));
      });
      await waitFor(() => expect(crumb()).toBe('Indexes'));
      expect(title()).toBe('Indexes');
      expect(document.querySelector('iframe.guide-viewer-frame')).toBeTruthy();
      expect(pill()).toBeNull();
    });

    it('goes back to the board on ‹ Guides, fetching the index exactly once more', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      openTile('Beta Deck');
      fetchMock.mockClear();

      act(() => { screen.getByRole('button', { name: 'Guides' }).click(); });
      await waitFor(() => expect(document.querySelector('.board-band')).toBeTruthy());
      await waitFor(() => expect(cardTitles().length).toBeGreaterThan(0));
      expect(document.querySelector('.guide-viewer')).toBeNull();
      expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/guides')).toHaveLength(1);
    });
  });

  /*
    Reset lives in the viewer head, not on the board's tiles. A tile is a
    whole-tile role="button" in a dense grid, and a nested destructive control
    there is one mis-tap from discarding a session on the device this app exists
    for. In the viewer you are looking at the guide you mean to restart.
  */
  describe('resetting one guide', () => {
    const openViewer = openTile;

    const resetButton = () => screen.getByRole('button', { name: /start over/i });

    it('needs two taps, and sends nothing on the first', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      openViewer('Beta Deck');
      fetchMock.mockClear();

      act(() => { resetButton().click(); });
      // The first tap only arms the control. A single-tap DELETE beside the back
      // link is a mis-tap away from throwing a reading session away.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(resetButton().textContent).toBe('Start over?');
      expect(resetButton().className).toMatch(/\barmed\b/);

      act(() => { resetButton().click(); });
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/progress?guidePath=${encodeURIComponent('/p/g/deck.html')}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('reloads the open guide, so the frame stops showing the position too', async () => {
      await renderGuides();
      openViewer('Beta Deck');
      const before = document.querySelector('iframe.guide-viewer-frame');
      act(() => { resetButton().click(); });
      act(() => { resetButton().click(); });
      await waitFor(() => {
        // A different element, not the same one re-rendered: remounting is what
        // reloads the guide, and a guide with no stored position opens at its own
        // beginning. Without it the reset leaves card twelve on screen — the very
        // position the server has just forgotten.
        expect(document.querySelector('iframe.guide-viewer-frame')).not.toBe(before);
      });
    });

    it('reloads the frame only once the DELETE has resolved, never before', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      openViewer('Beta Deck');
      /* The DELETE is held open by hand, so the window between "sent" and "answered" is one the test can stand in. A frame remounted inside it would
         report its old position and re-create the row the reset was removing. */
      let answer!: () => void;
      const deleting = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
        answer = () => resolve({ ok: true, json: () => Promise.resolve(null) });
      });
      const fallback = fetchMock.getMockImplementation();
      fetchMock.mockImplementation((url: string, init?: { method?: string }) =>
        init?.method === 'DELETE' ? deleting : fallback!(url, init));

      const before = document.querySelector('iframe.guide-viewer-frame');
      act(() => { resetButton().click(); });
      act(() => { resetButton().click(); });
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/progress?guidePath=${encodeURIComponent('/p/g/deck.html')}`,
        expect.objectContaining({ method: 'DELETE' })
      );
      await act(async () => { await Promise.resolve(); });
      expect(document.querySelector('iframe.guide-viewer-frame')).toBe(before);

      await act(async () => { answer(); await deleting; });
      await waitFor(() => expect(document.querySelector('iframe.guide-viewer-frame')).not.toBe(before));
    });

    it('refetches the board, so the card stops claiming a position the server forgot', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      openViewer('Beta Deck');
      fetchMock.mockClear();
      act(() => { resetButton().click(); });
      act(() => { resetButton().click(); });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/guides'));
    });

    it('disarms itself when the viewer is left', async () => {
      await renderGuides();
      openViewer('Beta Deck');
      act(() => { resetButton().click(); });
      expect(resetButton().textContent).toBe('Start over?');

      act(() => { screen.getByRole('button', { name: /Guides/ }).click(); });
      openViewer('Gamma');
      // An armed control must not still be armed over a different guide: the
      // next tap would then reset something the reader never aimed at.
      expect(resetButton().textContent).toBe('Start over');
    });
  });
  /*
    The board is fetched once when this view mounts, so anything a guide writes
    while it is being read is invisible here until the page is reloaded — the
    reader came back from a guide to a card still claiming the percent it had when
    the tab first loaded.

    Two refetch triggers, because they cover different gaps: leaving the viewer
    covers the whole session at once, and the reporter's own announcement covers
    the write that lands after the reader has already tapped back.
  */
  describe('keeping the board current', () => {
    const openViewer = openTile;

    it('refetches when the reader comes back from a guide', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      openViewer('Beta Deck');
      fetchMock.mockClear();

      act(() => { screen.getByRole('button', { name: /Guides/ }).click(); });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/guides'));
    });

    it('fetches the board once on mount, not twice', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      // The refetch belongs to *coming back* from a guide. Firing it on mount as
      // well would ask for the same board the hook has just fetched.
      expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/guides')).toHaveLength(1);
    });

    it('refetches when a framed guide announces a write', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      fetchMock.mockClear();

      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { source: 'guide-manager', kind: 'progress' }
        }));
      });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/guides'));
    });

    it('ignores messages from anything else on the page', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      fetchMock.mockClear();

      act(() => {
        // Any script in any frame can post to the top window. A refetch per
        // stray message would make the board a polling loop driven by strangers.
        window.dispatchEvent(new MessageEvent('message', { data: 'hello' }));
        window.dispatchEvent(new MessageEvent('message', { data: { source: 'something-else' } }));
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('coalesces a burst of announcements into one refetch', async () => {
      jest.useFakeTimers();
      try {
        const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
        fetchMock.mockClear();
        const message = () => new MessageEvent('message', {
          data: { source: 'guide-manager', kind: 'progress' }
        });

        act(() => {
          window.dispatchEvent(message());
          window.dispatchEvent(message());
          window.dispatchEvent(message());
          jest.advanceTimersByTime(400);
        });

        // Walking a deck writes on every card. One fetch of the whole index per
        // card is a board nobody is looking at costing a round trip per tap.
        expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/guides')).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
