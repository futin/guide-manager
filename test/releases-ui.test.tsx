/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { App } from '../client/src/App';
import { ReleasesDrawer } from '../client/src/components/ReleasesDrawer';
import { SideRail } from '../client/src/components/SideRail';
import { LAST_SEEN_KEY } from '../client/src/lib/releases';
import type { ReleasesResponse } from '../shared/types';

/*
 * The version chip and the What's new drawer, end to end through AppShell with a URL-routed fetch (the App suites' shape): the dot decision against
 * `localStorage`, the drawer's three ways out, and the phone menu closing behind the chip. The pure decisions are pinned in releases-lib.test.ts.
 */

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
const dot = () => document.querySelector('.rail .rail-version-dot');
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
  function renderDrawer() {
    const onClose = jest.fn();
    render(<ReleasesDrawer data={DATA} onClose={onClose} />);
    return onClose;
  }

  it('renders each release and the baseline as a divider', () => {
    renderDrawer();
    expect(screen.getByText('running v0.2.0+1')).toBeTruthy();
    const feat = screen.getByTestId('release-0.2.0');
    expect(feat.querySelector('.releases-badge-feat')?.textContent).toBe('Feature');
    expect(feat.querySelector('.releases-badge-breaking')?.textContent).toBe('Breaking');
    expect(feat.querySelector('.releases-title')?.textContent).toBe('version chip');
    expect(feat.querySelector('.releases-notes li strong')?.textContent).toBe('the running version');
    expect(feat.querySelector('.releases-pr')?.getAttribute('href')).toBe('https://github.com/futin/guide-manager/pull/36');
    const base = screen.getByTestId('release-0.1.0');
    expect(base.textContent).toContain('Versioning starts here · v0.1.0');
    expect(base.querySelector('.releases-badge')).toBeNull();
  });

  it('Escape, the ✕ and the scrim close it; a click inside the panel does not', () => {
    const onClose = renderDrawer();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(document.querySelector('.ui-drawer-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('takes focus on open and hands it back to the chip on close', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '0.2.0');
    renderApp();
    await waitFor(() => expect(chip()).not.toBeNull());
    (chip() as HTMLElement).focus();
    fireEvent.click(chip() as HTMLElement);
    expect(document.activeElement).toBe(drawer());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(chip());
  });
});
