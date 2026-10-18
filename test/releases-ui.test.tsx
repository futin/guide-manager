/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { App } from '../client/src/App';
import { ReleasesDrawer } from '../client/src/components/ReleasesDrawer';
import { SideRail } from '../client/src/components/SideRail';
import type { ReleasesResponse } from '../shared/types';

/*
 * The version chip and the What's new drawer, end to end through AppShell with a URL-routed fetch (the App suites' shape) — only this app's wiring of
 * ui-kit: the chip's place in the rail, the dot under this app's own storage key, the phone menu closing behind the chip, focus falling back to the ☰,
 * the phone breakpoint, and the second sanitiser behind the notes. The pure decisions, the markup and the drawer's ways out are ui-kit's own suites.
 */

const LAST_SEEN_KEY = 'guide-manager.releases-last-seen';

const DATA: ReleasesResponse = {
  current: { version: '0.2.0', ahead: 1 },
  releases: [
    {
      version: '0.2.0', date: '2026-10-17T10:00:00+00:00', title: 'feat(releases)!: version chip', type: 'feat', scope: 'releases', pr: 36,
      breaking: true, notes: '- Shows **the running version**', url: 'https://github.com/futin/guide-manager/pull/36'
    },
    { version: '0.1.0', date: '2026-10-16T10:00:00+00:00', title: 'Baseline — versioning starts here', type: 'baseline', breaking: false, notes: '' }
  ]
};

function renderApp(releases: unknown = DATA) {
  const fetch = jest.fn((url: string) => {
    const body = url.startsWith('/api/releases') ? releases : url.startsWith('/api/favorites') ? [] : { projects: [] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
  (globalThis as { fetch?: unknown }).fetch = fetch;
  return { fetch, ...render(<App />) };
}

const chip = () => document.querySelector<HTMLElement>('.rail .rail-version');
const dot = () => document.querySelector('.rail .rail-version .uk-chip-dot');
const drawer = () => screen.queryByRole('dialog', { name: "What's new" });

beforeEach(() => localStorage.clear());

describe('version chip', () => {
  it('labels the running version, and seeds a first visit without a dot', async () => {
    renderApp();
    await waitFor(() => expect(chip()).not.toBeNull());
    expect(chip()?.textContent).toBe('v0.2.0+1');
    expect(dot()).toBeNull();
    await waitFor(() => expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('0.2.0'));
  });

  it('shows the dot for a release newer than the stored one, and clears it on opening', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '0.1.0');
    renderApp();
    await waitFor(() => expect(dot()).not.toBeNull());
    fireEvent.click(chip() as HTMLElement);
    expect(drawer()).not.toBeNull();
    await waitFor(() => expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('0.2.0'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer()).toBeNull();
    expect(dot()).toBeNull();
  });

  it('opening refetches the releases', async () => {
    const { fetch } = renderApp();
    await waitFor(() => expect(chip()).not.toBeNull());
    const before = fetch.mock.calls.filter(([u]) => u.startsWith('/api/releases')).length;
    fireEvent.click(chip() as HTMLElement);
    expect(fetch.mock.calls.filter(([u]) => u.startsWith('/api/releases')).length).toBe(before + 1);
  });

  it('no chip while current is null', async () => {
    const { fetch } = renderApp({ current: null, releases: [] });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/releases'));
    await act(async () => {});
    expect(chip()).toBeNull();
  });

  it('no chip when the answer is not the releases shape', async () => {
    const { fetch } = renderApp('<!doctype html>');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/releases'));
    await act(async () => {});
    expect(chip()).toBeNull();
  });

  it('a tap in the phone menu closes the menu behind it', () => {
    let opened = 0;
    render(
      <SideRail
        section="guides"
        onChange={() => {}}
        guideRows={null}
        favRows={null}
        guideScope="all"
        favScope="all"
        onScope={() => {}}
        releases={{ label: 'v0.2.0', dot: false, onOpen: () => opened++ }}
      />
    );
    fireEvent.click(document.querySelector('header.mnav button') as HTMLElement);
    expect(document.querySelector('.rail.open')).not.toBeNull();
    fireEvent.click(chip() as HTMLElement);
    expect(opened).toBe(1);
    expect(document.querySelector('.rail.open')).toBeNull();
  });
});

describe('What\'s new drawer', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('takes focus on open and hands it back to the chip on close', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '0.2.0');
    renderApp();
    await waitFor(() => expect(chip()).not.toBeNull());
    (chip() as HTMLElement).focus();
    fireEvent.click(chip() as HTMLElement);
    expect(document.activeElement).toBe(drawer());
    expect(drawer()?.classList.contains('uk-drawer--narrow')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(chip());
  });

  it('under 640 px it fills the screen, and focus falls back to the ☰ because the chip left with the menu', async () => {
    (window as { matchMedia?: unknown }).matchMedia = (q: string) => ({
      matches: q === '(max-width: 639px)',
      addEventListener: () => {},
      removeEventListener: () => {}
    });
    localStorage.setItem(LAST_SEEN_KEY, '0.2.0');
    renderApp();
    await waitFor(() => expect(chip()).not.toBeNull());
    fireEvent.click(document.querySelector('header.mnav button') as HTMLElement);
    (chip() as HTMLElement).focus();
    fireEvent.click(chip() as HTMLElement);
    expect(document.querySelector('.rail.open')).toBeNull();
    expect(drawer()?.classList.contains('uk-drawer--narrow')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(document.querySelector('.mnav-burger'));
  });

  it('a notes link keeps rel="noopener" from sanitizeSnapshot', () => {
    const data: ReleasesResponse = {
      current: { version: '0.2.0', ahead: 0 },
      releases: [{ ...DATA.releases[0], notes: 'See [the spec](https://example.com/spec)' }]
    };
    render(<ReleasesDrawer data={data} onClose={() => {}} />);
    const a = document.querySelector('.uk-releases-notes a');
    expect(a?.getAttribute('href')).toBe('https://example.com/spec');
    expect(a?.getAttribute('rel')).toBe('noopener');
    expect(a?.getAttribute('target')).toBe('_blank');
  });
});
