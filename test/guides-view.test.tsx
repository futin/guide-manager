/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

import GuidesView from '../client/src/components/guides/GuidesView';
import type { GuidesIndex } from '../shared/types';

const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        {
          path: '/p/g/a.md', title: 'Alpha Guide', type: 'study', updated: '2026-08-24T10:19:08.417Z', createdAt: '2026-08-01T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fa.md', progress: null
        },
        {
          path: '/p/g/deck.html', title: 'Beta Deck', type: 'tutor', updated: '2026-08-20T00:00:00Z', createdAt: '2026-08-01T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fdeck.html',
          progress: { scrollPercent: 100, completed: true, lastOpenedAt: '2026-08-23T00:00:00Z', openCount: 4 }
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
          progress: { scrollPercent: 37, completed: false, lastOpenedAt: '2026-08-23T00:00:00Z', openCount: 2 }
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

describe('GuidesView', () => {
  /* The fold state is persisted, so without this a bay folded by one test stays
     folded for every test after it. */
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
  });

  it('renders one bay per project, titled by project name', async () => {
    await renderGuides();
    expect(screen.getByText('guide-manager')).toBeTruthy();
    expect(screen.getByText('german-study-partner')).toBeTruthy();
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
    expect(gamma?.textContent).toContain('37%');
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
    The board is unscoped: every registered project is listed, each in its own bay
    under its own header. The list was briefly narrowed to one project by a
    drawer, which also dropped the heading once a single group was showing — both
    are gone, so a header per bay is unconditional again. It stays unconditional
    even after task-7's filter lands: the header is now where the project's name
    appears on screen at all, so a one-bay board without it is a board that does
    not say what you are looking at.
  */
  it('lists every registered project, one bay per project', async () => {
    await renderGuides();
    expect(document.querySelectorAll('.bay')).toHaveLength(2);
    expect([...document.querySelectorAll('.bay-name')].map((h) => h.textContent))
      .toEqual(['guide-manager', 'german-study-partner']);
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
      .toEqual(['2 guides', '1 guide']);
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
    expect(grids[0].querySelectorAll('.guides-card')).toHaveLength(2);
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
    expect(bay.querySelector('.bay-count')?.textContent).toBe('2 guides');
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

  it('leaves nothing in the bar but the section title', async () => {
    await renderGuides();
    const bar = document.querySelector('.guides-bar');
    expect(bar?.querySelectorAll('button')).toHaveLength(0);
    expect(bar?.textContent).toBe('Guides');
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
});
