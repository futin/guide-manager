/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';

import { App } from '../client/src/App';
import type { GuidesIndex } from '../shared/types';

const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        { path: '/p/a.md', title: 'Alpha Guide', type: 'study', updated: '2026-08-24T00:00:00Z', href: '/guide?p=a', progress: null }
      ]
    },
    {
      name: 'german-study-partner',
      path: '/q',
      guides: [
        { path: '/q/c.md', title: 'Gamma', type: 'tutor', updated: '2026-08-22T00:00:00Z', href: '/guide?p=c', progress: null }
      ]
    }
  ]
};

/** The whole shell, with /api/guides and /api/settings answered from memory. */
async function renderApp() {
  (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(INDEX)
  });
  render(<App />);
  // The Guides chunk is lazy, so the list is not there on the first paint.
  await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeTruthy());
}

/** The Guides tab in the rail, told apart from anything else by its class. */
function railGuides(): HTMLElement {
  const el = document.querySelector('.rail .rail-link');
  if (!el) throw new Error('no rail');
  return el as HTMLElement;
}

describe('App — the board lists every project', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists every registered project at once', async () => {
    await renderApp();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  /*
    The rail's Guides tab used to double as the disclosure for a project drawer.
    Pressing it while Guides is already showing must now do nothing visible —
    no drawer, no dialog of any kind — rather than the tab silently keeping a
    second job it no longer has.
  */
  it('opens nothing when the showing Guides tab is pressed again', async () => {
    await renderApp();
    act(() => { railGuides().click(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('still switches sections, and comes back to a board with no drawer on it', async () => {
    await renderApp();
    act(() => { screen.getByRole('button', { name: 'Settings' }).click(); });
    await waitFor(() => expect(screen.queryByText('Alpha Guide')).toBeNull());
    act(() => { railGuides().click(); });
    await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /*
    A scope remembered from the drawer is deliberately left where it is rather
    than cleared: task-7's toolbar filter re-reads the same key with compatible
    values, and wiping it here would throw away a choice that is about to mean
    something again. Until then it is simply not read, so the board stays whole.
  */
  it('ignores a remembered project scope without clearing it', async () => {
    localStorage.setItem('guide-manager.project', JSON.stringify('/q'));
    await renderApp();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('guide-manager.project') as string)).toBe('/q');
  });
});
