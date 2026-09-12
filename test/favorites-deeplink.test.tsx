/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';

import { App } from '../client/src/App';
import GuidesView from '../client/src/components/guides/GuidesView';
import { openHref } from '../client/src/components/favorites/FavoriteCard';
import { deeplinkHref, readDeeplink, viewerHref } from '../client/src/lib/deeplink';
import { SETTINGS_STORAGE_KEY } from '../client/src/lib/settings';
import type { Favorite, GuidesIndex } from '../shared/types';

/**
 * Opening a favorite must land on the *same page* as opening the guide off the
 * board.
 *
 * The crumb used to link straight at `GET /guide`, which is the inner page: its
 * shell exists to be framed by the app's viewer, and `body.deck-host main` drops
 * its max-width on that assumption. At the top level nothing constrains it, so a
 * favorite opened full-bleed with no rail, no `‹ Guides` and no `↺ reset` —
 * visibly a different app from the one the board opens. The link now names the
 * app, and the app opens its ordinary viewer.
 *
 * These tests pin both ends of that link, because the two live in different
 * files and nothing at build time makes them agree.
 */

const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        {
          path: '/p/g/a.md', title: 'Alpha Guide', type: 'study',
          updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-02T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fa.md', progress: null
        },
        {
          path: '/p/g/deck.html', title: 'Beta Deck', type: 'tutor',
          updated: '2026-08-20T00:00:00Z', createdAt: '2026-08-10T00:00:00Z',
          href: '/guide?p=%2Fp%2Fg%2Fdeck.html', progress: null
        }
      ]
    }
  ]
};

const ANCHOR = { kind: 'deck', cardIndex: 12, sectionId: 's3', cardOffset: 1 } as const;

/** A favorite is only ever used here for the href its card produces, so
 *  everything the card does not read is filled in flatly. */
const FAVORITE: Favorite = {
  id: 'f1',
  guidePath: '/p/g/deck.html',
  project: 'guide-manager',
  guideTitle: 'Beta Deck',
  anchor: ANCHOR,
  crumb: ['§3'],
  html: '<p>x</p>',
  text: 'x',
  title: 'A block',
  note: '',
  order: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

/* jsdom has no navigation, so the address bar is set the same way the app's own
   clearDeeplink writes it — which also means these tests exercise the real
   readDeeplink against a real `window.location.search`, not a hand-passed
   string. */
const setUrl = (url: string): void => window.history.replaceState(null, '', url);

function mockFetch(body: unknown): void {
  (globalThis as { fetch?: unknown }).fetch = jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.startsWith('/api/favorites') ? [] : body)
    })
  );
}

describe('favorite deep link — the URL both ends agree on', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('/');
  });

  it('points a favorite card at the app, carrying its anchor', () => {
    expect(openHref(FAVORITE)).toBe(
      '/?open=%2Fp%2Fg%2Fdeck.html&at=%7B%22kind%22%3A%22deck%22%2C%22cardIndex%22%3A12%2C%22sectionId%22%3A%22s3%22%2C%22cardOffset%22%3A1%7D'
    );
  });

  it('omits at= entirely for a favorite with no anchor', () => {
    expect(deeplinkHref('/p/g/a.md', null)).toBe('/?open=%2Fp%2Fg%2Fa.md');
    expect(readDeeplink('?open=%2Fp%2Fg%2Fa.md')).toEqual({ path: '/p/g/a.md', at: null });
  });

  it('round-trips the anchor through the query string unchanged', () => {
    const link = readDeeplink(new URL(deeplinkHref('/p/g/deck.html', ANCHOR), 'http://x').search);
    expect(link).toEqual({ path: '/p/g/deck.html', at: JSON.stringify(ANCHOR) });
  });

  it('reads no link from a bare url, or from an open= with no value', () => {
    expect(readDeeplink('')).toBeNull();
    expect(readDeeplink('?at=%7B%7D')).toBeNull();
    expect(readDeeplink('?open=')).toBeNull();
  });

  /* The viewer src is the entry's own href with the anchor appended — never a
     /guide?p= rebuilt on the client, which is how the two encodings would
     drift. */
  it('appends the anchor to the entry href rather than rebuilding one', () => {
    expect(viewerHref('/guide?p=%2Fp%2Fg%2Fdeck.html', JSON.stringify(ANCHOR))).toBe(
      '/guide?p=%2Fp%2Fg%2Fdeck.html&at=%7B%22kind%22%3A%22deck%22%2C%22cardIndex%22%3A12%2C%22sectionId%22%3A%22s3%22%2C%22cardOffset%22%3A1%7D'
    );
    expect(viewerHref('/guide?p=%2Fp%2Fg%2Fa.md', null)).toBe('/guide?p=%2Fp%2Fg%2Fa.md');
  });
});

describe('GuidesView — arriving on a deep link', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('/');
    mockFetch(INDEX);
  });

  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
  });

  it('opens the viewer on the linked guide, framing its href plus the anchor', async () => {
    setUrl(openHref(FAVORITE));
    render(<GuidesView />);

    const frame = await waitFor(() => {
      const f = document.querySelector('iframe.guide-viewer-frame');
      expect(f).toBeTruthy();
      return f as HTMLIFrameElement;
    });
    expect(frame.getAttribute('src')).toBe(
      '/guide?p=%2Fp%2Fg%2Fdeck.html&at=%7B%22kind%22%3A%22deck%22%2C%22cardIndex%22%3A12%2C%22sectionId%22%3A%22s3%22%2C%22cardOffset%22%3A1%7D'
    );
  });

  /* The whole point of the change: the guide arrives inside the app's viewer,
     with the chrome a guide opened off the board gets. */
  it('gives it the same viewer chrome a guide opened off the board gets', async () => {
    setUrl(openHref(FAVORITE));
    render(<GuidesView />);

    await waitFor(() => expect(document.querySelector('.guide-viewer')).toBeTruthy());
    expect(document.querySelector('.guide-viewer-back')?.textContent).toBe('‹ Guides');
    expect(document.querySelector('.guide-viewer-reset')?.textContent).toBe('↺ reset');
    expect(document.querySelector('.guide-viewer-title')?.textContent).toBe('Beta Deck');
    // The board's own scroll-chain lock, exactly as an ordinary open sets it.
    expect(document.documentElement.classList.contains('guide-locked')).toBe(true);
  });

  /* Consumed, not kept: the link describes an arrival. Left in place it would
     re-open that guide on every reload, whatever the reader had moved on to. */
  it('drops the link from the address bar once it has opened', async () => {
    setUrl(`${openHref(FAVORITE)}&keep=1`);
    render(<GuidesView />);

    await waitFor(() => expect(document.querySelector('.guide-viewer')).toBeTruthy());
    expect(window.location.search).toBe('?keep=1');
  });

  /* A guide that moved out of the registry is hidden everywhere else in this
     app rather than raised as an error; a favorite outliving its guide is the
     same situation seen from the other side. */
  it('falls back to the board for a path the index does not know', async () => {
    setUrl(deeplinkHref('/p/g/gone.html', null));
    render(<GuidesView />);

    await waitFor(() => expect(screen.queryByText('loading…')).toBeNull());
    expect(document.querySelector('.guide-viewer')).toBeNull();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('opens the board as usual when there is no link', async () => {
    render(<GuidesView />);
    await waitFor(() => expect(screen.queryByText('loading…')).toBeNull());
    expect(document.querySelector('.guide-viewer')).toBeNull();
  });
});

describe('App — a deep link outranks the remembered section', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('/');
    mockFetch(INDEX);
  });

  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
  });

  /* Both of the two things that normally decide the opening section are pointed
     somewhere else, so this can only pass by the link winning. */
  it('lands on Guides even when both the memory and the landing setting say otherwise', async () => {
    localStorage.setItem('guide-manager.section', JSON.stringify('settings'));
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ landing: 'favorites' }));
    setUrl(openHref(FAVORITE));

    render(<App />);
    await waitFor(() => expect(document.querySelector('.guide-viewer')).toBeTruthy());
    expect(document.querySelector('.guide-viewer-title')?.textContent).toBe('Beta Deck');
  });

  /* The link is one arrival, not a change of where you were working — the
     remembered section has to survive it. */
  it('leaves the remembered section alone', async () => {
    localStorage.setItem('guide-manager.section', JSON.stringify('settings'));
    setUrl(openHref(FAVORITE));

    render(<App />);
    await waitFor(() => expect(document.querySelector('.guide-viewer')).toBeTruthy());
    expect(localStorage.getItem('guide-manager.section')).toBe(JSON.stringify('settings'));
  });
});
