/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';

import { App } from '../client/src/App';
import { SETTINGS_STORAGE_KEY } from '../client/src/lib/settings';
import type { GuidesIndex } from '../shared/types';

/**
 * `landing` and `guide-manager.section` are two different questions, and the
 * whole point of the pair is that answering one must not overwrite the other:
 *
 *   - `guide-manager.section` is the memory of where you actually were. It keeps
 *     recording whatever you navigate to, always.
 *   - `landing` is an override on the *opening* section only. Setting it to
 *     'guides' must not erase the memory, or switching back to 'where I left
 *     off' would restore a section you never chose.
 *
 * These tests pin exactly that split, because it is invisible from the UI: both
 * settings look identical on the load right after you change one.
 */

const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        {
          path: '/p/a.md', title: 'Alpha Guide', type: 'study',
          updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-01T00:00:00Z',
          href: '/guide?p=a', progress: null
        }
      ]
    }
  ]
};

function renderApp() {
  (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(INDEX)
  });
  return render(<App />);
}

/** The section showing, read off the rail's active tab rather than the body. */
function activeTab(): string {
  const on = document.querySelector('.rail .rail-link.on');
  return on?.textContent?.replace(/[^A-Za-z]/g, '') ?? '';
}

const setSection = (s: string): void =>
  localStorage.setItem('guide-manager.section', JSON.stringify(s));
const setLanding = (l: string): void =>
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ landing: l }));

describe('App — which section the page opens on', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores the remembered section by default, because 'last' is the default", async () => {
    setSection('settings');
    renderApp();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    expect(activeTab()).toBe('Settings');
  });

  it('opens on Guides when the landing override says so, whatever was remembered', async () => {
    setSection('settings');
    setLanding('guides');
    renderApp();
    await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeTruthy());
    expect(activeTab()).toBe('Guides');
  });

  it('opens on Settings when the landing override says so', async () => {
    setSection('guides');
    setLanding('settings');
    renderApp();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    expect(activeTab()).toBe('Settings');
  });

  it('keeps recording the section under an override, so switching back is honest', async () => {
    // Landing is pinned to Guides, but the reader navigates to Settings. The
    // memory has to follow them — otherwise flipping the setting back to 'where
    // I left off' would return them to Guides, a section they left on purpose.
    setSection('settings');
    setLanding('guides');
    renderApp();
    await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeTruthy());

    act(() => { screen.getByRole('button', { name: 'Settings' }).click(); });
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    expect(localStorage.getItem('guide-manager.section')).toBe(JSON.stringify('settings'));
  });

  it('falls back to Guides when the remembered section is a hand-edited unknown', async () => {
    setSection('analytics');
    renderApp();
    await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeTruthy());
    expect(activeTab()).toBe('Guides');
  });

  it('ignores a landing naming a section this app does not have', async () => {
    // clampSettings drops it, so the value never reaches App — 'last' applies and
    // the remembered section wins.
    setSection('settings');
    setLanding('analytics');
    renderApp();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    expect(activeTab()).toBe('Settings');
  });
});
