/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

import GuidesView from '../client/src/components/guides/GuidesView';
import type { GuidesIndex } from '../shared/types';

/*
  Three guides in the first bay, deliberately arranged so the three sort keys give
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
             back near the top, having once reached 62%. The card must show the
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

function mockFetch(body: unknown, ok = true): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body)
  });
  (globalThis as { fetch?: unknown }).fetch = fn;
  return fn;
}

/** Returns the render result so a test can unmount and mount again — which is
 *  how the persisted fold state is checked without reloading a page jsdom does
 *  not have. */
async function renderGuides(body: unknown = INDEX) {
  mockFetch(body);
  const result = render(<GuidesView />);
  await waitFor(() => expect(screen.queryByText('loading…')).toBeNull());
  return result;
}

/** The bay headers, in board order. They are buttons now — the disclosure is the
 *  whole header row, not a caret beside it. */
const headers = () => [...document.querySelectorAll<HTMLElement>('.bay-h')];
/** Every card on the board, in render order — which is what the sort tests read. */
const cardTitles = () => [...document.querySelectorAll('.guides-card-title')].map((n) => n.textContent);
const bayNames = () => [...document.querySelectorAll('.bay-name')].map((n) => n.textContent);

/* The toolbar controls are found by their aria-labels, which is also the only
   name they have: the row carries no visible <label>s (see GuidesView). Looking
   them up this way means these tests fail if the accessible name is ever dropped,
   which is the point. */
const searchBox = () => screen.getByLabelText('Search guides') as HTMLInputElement;
const control = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;
const setControl = (name: string, value: string) =>
  fireEvent.change(control(name), { target: { value } });

describe('GuidesView', () => {
  /* The fold state and all three selects are persisted, so without this a value
     set by one test leaks into every test after it. */
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
  });

  /* Read off .bay-name rather than by text: every project name now appears twice
     on the page, once as its bay's header and once as an option in the project
     select, and a bare getByText would find both. */
  it('renders one bay per project, titled by project name', async () => {
    await renderGuides();
    expect(bayNames()).toEqual(['guide-manager', 'german-study-partner']);
  });

  it('shows each guide with its title, type pill and update date', async () => {
    await renderGuides();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    const card = screen.getByText('Alpha Guide').parentElement;
    expect(card?.querySelector('.pill')?.textContent).toBe('study');
    expect(card?.querySelector('.guides-card-meta')?.textContent).toContain('2026-08-24');
  });

  it('gives study and tutor their own pill class, so the two read apart at a glance', async () => {
    await renderGuides();
    const alpha = screen.getByText('Alpha Guide').parentElement?.querySelector('.pill');
    const beta = screen.getByText('Beta Deck').parentElement?.querySelector('.pill');
    expect(alpha?.className).toBe('pill pill-study');
    expect(beta?.className).toBe('pill pill-tutor');
  });

  it('marks a finished guide as read and a part-read one by percentage', async () => {
    await renderGuides();
    const beta = screen.getByText('Beta Deck').parentElement?.querySelector('.guides-card-meta');
    expect(beta?.textContent).toContain('read');
    const gamma = screen.getByText('Gamma').parentElement?.querySelector('.guides-card-meta');
    // 62 is the high-water mark; 8 is where the reader currently is. The card
    // reports how far this guide has been read, not which end of it was looked
    // at last — otherwise glancing back at chapter one walks the board
    // backwards.
    expect(gamma?.textContent).toContain('62%');
    expect(gamma?.textContent).not.toContain('8%');
  });

  it('shows no progress marker for a guide never opened', async () => {
    await renderGuides();
    const alpha = screen.getByText('Alpha Guide').parentElement?.querySelector('.guides-card-meta');
    expect(alpha?.textContent).not.toContain('read');
    expect(alpha?.textContent).not.toContain('%');
  });

  it("frames the entry's own href rather than rebuilding it", async () => {
    await renderGuides();
    act(() => { screen.getByText('Beta Deck').closest('.guides-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const frame = document.querySelector('iframe.guide-viewer-frame');
    expect(frame?.getAttribute('src')).toBe('/guide?p=%2Fp%2Fg%2Fdeck.html');
    expect(screen.getByText('Beta Deck')).toBeTruthy();
  });

  it('locks the scroll chain while a guide is open and releases it on the way out', async () => {
    await renderGuides();
    act(() => { screen.getByText('Alpha Guide').closest('.guides-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.documentElement.classList.contains('guide-locked')).toBe(true);

    act(() => { screen.getByRole('button', { name: /Guides/ }).click(); });
    expect(document.documentElement.classList.contains('guide-locked')).toBe(false);
    expect(document.querySelector('iframe.guide-viewer-frame')).toBeNull();
  });

  /*
    The board is unscoped by default: every registered project is listed, each in
    its own bay under its own header. The list was briefly narrowed to one project
    by a drawer, which also dropped the heading once a single group was showing —
    both are gone. The toolbar's project select can narrow the board again, but the
    header stays unconditional even then: it is now where the project's name
    appears on screen at all, so a one-bay board without it is a board that does
    not say what you are looking at.
  */
  it('lists every registered project, one bay per project', async () => {
    await renderGuides();
    expect(document.querySelectorAll('.bay')).toHaveLength(2);
    expect(bayNames()).toEqual(['guide-manager', 'german-study-partner']);
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  /*
    The count is the header's only piece of live data, so it has to agree with the
    grid under it — and read as English while doing so. "1 guides" is the kind of
    wrong that makes the whole header look generated rather than written.
  */
  it('counts the guides in each bay header, singular for a bay of one', async () => {
    await renderGuides();
    expect([...document.querySelectorAll('.bay-count')].map((c) => c.textContent))
      .toEqual(['3 guides', '1 guide']);
  });

  /*
    The tick is what promotes the project name from a faint caption into a header:
    without it the name is just bolder text. Asserted per bay because a single
    shared marker at the top of the board would not mark anything.
  */
  it('gives every bay header its own cyan tick', async () => {
    await renderGuides();
    expect(document.querySelectorAll('.bay-h .bay-tick')).toHaveLength(2);
  });

  /*
    A grid rather than a stack — one wrapper per bay, holding that bay's cards and
    no others. The column count is CSS's business (auto-fill), but the nesting is
    the markup's, and a card in the wrong bay is a card filed under the wrong
    project name.
  */
  it('lays each bay out as its own card grid', async () => {
    await renderGuides();
    const grids = document.querySelectorAll('.guides-grid');
    expect(grids).toHaveLength(2);
    expect(grids[0].querySelectorAll('.guides-card')).toHaveLength(3);
    expect(grids[1].querySelectorAll('.guides-card')).toHaveLength(1);
  });

  /*
    The header is the disclosure itself, rather than a caret button sitting beside
    the name: on a phone the whole header row is the tap target, and a caret alone
    is a target the size of a full stop. The grid is removed rather than hidden
    with CSS, so a folded bay costs nothing to keep on the board — which is the
    point of folding at all when a project has grown to thirty guides.
  */
  it('folds a bay down to its header when the header is tapped, and unfolds it again', async () => {
    await renderGuides();
    expect(headers()[0].getAttribute('aria-expanded')).toBe('true');

    act(() => { headers()[0].click(); });
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.bay')[0].querySelector('.guides-grid')).toBeNull();
    expect(screen.queryByText('Alpha Guide')).toBeNull();

    act(() => { headers()[0].click(); });
    expect(headers()[0].getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
  });

  /*
    One fold, one bay. The board's whole reason for folding is to get from a
    scroll wall down to the few projects you are actually working in, which does
    not happen if the fold is all-or-nothing.
  */
  it('folds one bay without touching its neighbours', async () => {
    await renderGuides();
    act(() => { headers()[0].click(); });
    expect(screen.queryByText('Alpha Guide')).toBeNull();
    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(headers()[1].getAttribute('aria-expanded')).toBe('true');
  });

  /*
    Keyed by path, not by name: two checkouts of one repo register the same
    project name at two different paths, and a name-keyed fold would collapse both
    at once. The path is the registry's own key, so a stored path whose project is
    no longer registered simply never matches and no cleanup pass is needed.
  */
  it('remembers a folded bay across a remount, keyed by project path', async () => {
    const first = await renderGuides();
    act(() => { headers()[0].click(); });
    expect(JSON.parse(localStorage.getItem('guide-manager.collapsedBays') ?? '[]')).toEqual(['/p']);

    first.unmount();
    await renderGuides();
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Alpha Guide')).toBeNull();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  /*
    A folded bay that hid its own name would be a row you cannot identify well
    enough to decide whether to unfold it. Name, count and tick are exactly what
    survives the fold — the header is unchanged, only its grid is gone.
  */
  it('keeps the project name and guide count readable while folded', async () => {
    await renderGuides();
    act(() => { headers()[0].click(); });
    const bay = document.querySelectorAll('.bay')[0];
    /* Assert the fold actually happened first: without this the rest of the test
       passes on an un-foldable board, where the header is trivially still there. */
    expect(bay.querySelector('.guides-grid')).toBeNull();
    expect(bay.querySelector('.bay-name')?.textContent).toBe('guide-manager');
    expect(bay.querySelector('.bay-count')?.textContent).toBe('3 guides');
    expect(bay.querySelector('.bay-tick')).toBeTruthy();
  });

  /*
    The caret carries aria-hidden because the state it depicts is already on the
    button's own aria-expanded, and a screen reader reading out the glyph's
    Unicode name after "collapsed" is noise. Its direction is CSS's business,
    keyed off aria-expanded exactly as the old rail caret was — asserted here only
    as far as jsdom can see it, which is that the hook and the element both exist.
  */
  it('marks the fold direction with a caret the assistive layer ignores', async () => {
    await renderGuides();
    const caret = headers()[0].querySelector('.bay-caret');
    expect(caret).toBeTruthy();
    expect(caret?.getAttribute('aria-hidden')).toBe('true');
  });

  /*
    Card layout is a column with the pill and meta in one footer element, which is
    what `margin-top:auto` can then pin to the bottom of a stretched grid cell.
    The old named-areas grid put both directly on the card, so the two would drift
    apart vertically once cards of unequal title length shared a row.
  */
  it('holds the pill and the meta line together in the card footer', async () => {
    await renderGuides();
    const foot = screen.getByText('Alpha Guide').closest('.guides-card')?.querySelector('.guides-card-foot');
    expect(foot?.querySelector('.pill')?.textContent).toBe('study');
    expect(foot?.querySelector('.guides-card-meta')?.textContent).toContain('2026-08-24');
  });

  it('says so when nothing is registered', async () => {
    await renderGuides({ projects: [] });
    expect(screen.getByText('nothing registered yet')).toBeTruthy();
  });

  it('says so when the server cannot be reached', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'));
    render(<GuidesView />);
    await waitFor(() => expect(screen.getByText('guides unavailable')).toBeTruthy());
  });

  /* ------------------------------------------------------------------ toolbar */

  /*
    Order is part of the design, not an accident of JSX: search reads first because
    it is the control you reach for, and the three selects narrow-then-order from
    the broadest scope (project) to the finest (sort). Asserted as a sequence
    rather than four separate existence checks, which would pass on a bar that had
    silently shuffled itself.
  */
  it('puts search, project, type and sort in the bar, in that order', async () => {
    await renderGuides();
    const bar = document.querySelector('.guides-bar');
    expect(bar?.querySelector('.guides-title')?.textContent).toBe('Guides');
    expect([...(bar?.querySelectorAll('.guides-search, .guides-select') ?? [])]
      .map((el) => el.getAttribute('aria-label')))
      .toEqual(['Search guides', 'Project', 'Type', 'Sort']);
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
    A bay the query emptied goes entirely, header and all — otherwise a two-hit
    search on a board of a dozen projects returns a screenful of empty headers with
    the hits buried among them.
  */
  it('drops a bay the query emptied, header and all', async () => {
    await renderGuides();
    setControl('Search guides', 'deck');
    expect(bayNames()).toEqual(['guide-manager']);
    expect(document.querySelectorAll('.bay')).toHaveLength(1);
  });

  /*
    The load-bearing interaction between the toolbar and the fold: without this,
    typing a query on a board with folded bays looks like a search that found
    nothing, because the bay it matched in is still shut.
  */
  it('opens a folded bay that holds a match, without rewriting the stored fold', async () => {
    await renderGuides();
    act(() => { headers()[0].click(); });
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');

    setControl('Search guides', 'deck');
    expect(headers()[0].getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Beta Deck')).toBeTruthy();
    /* The standing preference is untouched — which is what lets the bay drop back
       to folded the moment the query is cleared, rather than staying open forever
       because a search once passed through it. */
    expect(JSON.parse(localStorage.getItem('guide-manager.collapsedBays') ?? '[]')).toEqual(['/p']);

    setControl('Search guides', '');
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('narrows to one type when the type select is set', async () => {
    await renderGuides();
    setControl('Type', 'tutor');
    expect(cardTitles()).toEqual(['Beta Deck']);
    expect(bayNames()).toEqual(['guide-manager']);
  });

  /*
    The project select narrows the board *to* a bay rather than filtering inside
    one, and its header survives being the only thing on screen: the header is the
    one place the project's name is written, so a headerless single bay is a board
    that does not say what you are looking at. That was the drawer's bug.
  */
  it('narrows the board to one project, keeping that bay’s header', async () => {
    await renderGuides();
    setControl('Project', '/q');
    expect(bayNames()).toEqual(['german-study-partner']);
    expect(cardTitles()).toEqual(['Gamma']);
  });

  /*
    Fail-open. A path remembered from a previous session may no longer be
    registered — the guide moved, the project was dropped — and a filter matching
    nothing would empty the board in a way that looks like the server broke. It
    reads as All, and the select says so, so the fallback is visible rather than
    silent.
  */
  it('falls a stale stored project path open to All rather than blanking the board', async () => {
    localStorage.setItem('guide-manager.project', JSON.stringify('/gone'));
    await renderGuides();
    expect(bayNames()).toEqual(['guide-manager', 'german-study-partner']);
    expect(control('Project').value).toBe('all');
  });

  /* Newest first is the default: the point of the board is that the guide you
     generated ten minutes ago is at the top of the bay you generated it in. */
  it('sorts a bay by creation date, newest first, by default', async () => {
    await renderGuides();
    expect(cardTitles()).toEqual(['Beta Deck', 'Omega Notes', 'Alpha Guide', 'Gamma']);
  });

  it('sorts a bay by title when asked', async () => {
    await renderGuides();
    setControl('Sort', 'name');
    expect(cardTitles()).toEqual(['Alpha Guide', 'Beta Deck', 'Omega Notes', 'Gamma']);
  });

  it('sorts a bay by type, study before tutor, alphabetically inside each', async () => {
    await renderGuides();
    setControl('Sort', 'type');
    expect(cardTitles()).toEqual(['Alpha Guide', 'Omega Notes', 'Beta Deck', 'Gamma']);
  });

  /*
    Sorting is applied inside each bay, never across the board: the bays are the
    registry's own order, and re-ordering them by their newest guide would make the
    board's layout jump every time a guide was registered.
  */
  it('leaves the bays themselves in index order whatever the sort', async () => {
    await renderGuides();
    setControl('Sort', 'name');
    expect(bayNames()).toEqual(['guide-manager', 'german-study-partner']);
  });

  /* The three controls are an intersection, not a sequence of separate views —
     and the survivors are still sorted by whatever the sort select says. */
  it('composes search, type and sort into one sorted intersection', async () => {
    await renderGuides();
    setControl('Type', 'study');
    setControl('Search guides', 'e');
    setControl('Sort', 'name');
    /* 'e' is in every title here; the type filter is what removes the deck, and
       Gamma has no 'e' at all — so the intersection is the two study guides of the
       first bay, in title order. */
    expect(cardTitles()).toEqual(['Alpha Guide', 'Omega Notes']);
  });

  /*
    Two empty states, because they ask for two different things: an empty registry
    is fixed somewhere else entirely (register a guide from a skill), an empty
    result by clearing the controls two inches above the message.
  */
  it('distinguishes an empty registry from filters that matched nothing', async () => {
    await renderGuides();
    setControl('Search guides', 'zzz');
    expect(screen.getByText('no matches')).toBeTruthy();
    expect(screen.queryByText('nothing registered yet')).toBeNull();
    expect(document.querySelectorAll('.bay')).toHaveLength(0);
  });

  /*
    The selects are remembered per device for the same reason the fold is: a phone
    picked up mid-session should still be looking at the board it was left looking
    at. The project key is the one the removed drawer wrote, with the same values,
    so a phone still carrying the drawer's scope keeps it.
  */
  it('remembers the project, type and sort selects across a remount', async () => {
    const first = await renderGuides();
    setControl('Project', '/p');
    setControl('Type', 'study');
    setControl('Sort', 'name');
    expect(localStorage.getItem('guide-manager.project')).toBe('"/p"');
    expect(localStorage.getItem('guide-manager.filterType')).toBe('"study"');
    expect(localStorage.getItem('guide-manager.sort')).toBe('"name"');

    first.unmount();
    await renderGuides();
    expect(control('Project').value).toBe('/p');
    expect(control('Type').value).toBe('study');
    expect(control('Sort').value).toBe('name');
    expect(cardTitles()).toEqual(['Alpha Guide', 'Omega Notes']);
  });

  /*
    The search box is the one control deliberately *not* remembered. A board that
    opens showing three cards out of forty for no visible reason reads as broken
    rather than as filtered — and nobody reads a text field before deciding their
    guides are gone.
  */
  it('forgets the query on a remount, unlike the selects', async () => {
    const first = await renderGuides();
    setControl('Search guides', 'deck');
    expect(cardTitles()).toEqual(['Beta Deck']);

    first.unmount();
    await renderGuides();
    expect(searchBox().value).toBe('');
    expect(cardTitles()).toHaveLength(4);
  });
  /*
    Reset lives in the viewer head, not on the board's cards. `.guides-card` is a
    whole-card role="button" in a dense grid, and a nested destructive control
    there is one mis-tap from discarding a session on the device this app exists
    for. In the viewer you are looking at the guide you mean to restart.
  */
  describe('resetting one guide', () => {
    const openViewer = (title: string) => {
      act(() => {
        screen.getByText(title).closest('.guides-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    const resetButton = () => screen.getByRole('button', { name: /reset|sure/i });

    it('needs two taps, and sends nothing on the first', async () => {
      const fetchMock = (await renderGuides(), globalThis.fetch as jest.Mock);
      openViewer('Beta Deck');
      fetchMock.mockClear();

      act(() => { resetButton().click(); });
      // The first tap only arms the control. A single-tap DELETE beside the back
      // link is a mis-tap away from throwing a reading session away.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(resetButton().textContent).toMatch(/sure/i);

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
      expect(resetButton().textContent).toMatch(/sure/i);

      act(() => { screen.getByRole('button', { name: /Guides/ }).click(); });
      openViewer('Gamma');
      // An armed control must not still be armed over a different guide: the
      // next tap would then reset something the reader never aimed at.
      expect(resetButton().textContent).toMatch(/reset/i);
    });
  });
});
