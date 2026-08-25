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
        { path: '/p/a.md', title: 'Alpha Guide', type: 'study', updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', href: '/guide?p=a', progress: null }
      ]
    },
    {
      name: 'german-study-partner',
      path: '/q',
      guides: [
        { path: '/q/c.md', title: 'Gamma', type: 'tutor', updated: '2026-08-22T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', href: '/guide?p=c', progress: null }
      ]
    }
  ]
};

/**
 * The whole shell, with /api/guides and /api/settings answered from memory.
 *
 * `settled` is the card title to wait for. It is a parameter rather than a fixed
 * 'Alpha Guide' because the toolbar can start out narrowed — a project scope
 * remembered from a previous session is read on the first render — so the card
 * that proves the lazy Guides chunk has arrived is not always the same one.
 */
async function renderApp(settled = 'Alpha Guide') {
  (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(INDEX)
  });
  render(<App />);
  // The Guides chunk is lazy, so the list is not there on the first paint.
  await waitFor(() => expect(screen.getByText(settled)).toBeTruthy());
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
    The scope the removed drawer used to write was deliberately left in
    localStorage rather than cleared, because the toolbar's project select re-reads
    that same key with the same values — a registry project path, or the "all"
    sentinel. This is the test that the promise was kept: a phone that has not been
    opened since the drawer existed comes back scoped to the project it was left
    on, rather than quietly resetting to the whole board.
  */
  it('honours a project scope remembered from the removed drawer', async () => {
    localStorage.setItem('guide-manager.project', JSON.stringify('/q'));
    await renderApp('Gamma');
    expect(screen.queryByText('Alpha Guide')).toBeNull();
    expect(JSON.parse(localStorage.getItem('guide-manager.project') as string)).toBe('/q');
  });
});
