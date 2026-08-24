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

/** The Guides tab in the rail, told apart from the drawer's own rows by its class. */
function railGuides(): HTMLElement {
  const el = document.querySelector('.rail .rail-link');
  if (!el) throw new Error('no rail');
  return el as HTMLElement;
}

function drawerRow(name: string): HTMLElement {
  const drawer = screen.getByRole('dialog', { name: 'Projects' });
  const row = [...drawer.querySelectorAll('button')].find((b) => b.textContent?.includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe('App — scoping the guide list by project', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists every project until told otherwise', async () => {
    await renderApp();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it("opens the project drawer from the rail's own Guides tab", async () => {
    await renderApp();
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
    act(() => { railGuides().click(); });
    expect(screen.getByRole('dialog', { name: 'Projects' })).toBeTruthy();
  });

  it('shuts the drawer again from the same tab', async () => {
    await renderApp();
    act(() => { railGuides().click(); });
    act(() => { railGuides().click(); });
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
  });

  it('narrows the list to the project picked, and shuts the drawer behind it', async () => {
    await renderApp();
    act(() => { railGuides().click(); });
    act(() => { drawerRow('german-study-partner').click(); });

    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(screen.queryByText('Alpha Guide')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
  });

  it('widens back out from the all-projects row', async () => {
    await renderApp();
    act(() => { railGuides().click(); });
    act(() => { drawerRow('german-study-partner').click(); });
    act(() => { railGuides().click(); });
    act(() => { drawerRow('All projects').click(); });

    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('remembers the scope, so coming back lands on the project you were reading', async () => {
    await renderApp();
    act(() => { railGuides().click(); });
    act(() => { drawerRow('german-study-partner').click(); });
    expect(JSON.parse(localStorage.getItem('guide-manager.project') as string)).toBe('/q');
  });

  it('applies a remembered scope on load', async () => {
    localStorage.setItem('guide-manager.project', JSON.stringify('/q'));
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(INDEX)
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Gamma')).toBeTruthy());
    expect(screen.queryByText('Alpha Guide')).toBeNull();
  });

  it('comes back to Guides from Settings without springing the drawer open', async () => {
    await renderApp();
    act(() => { screen.getByRole('button', { name: 'Settings' }).click(); });
    act(() => { railGuides().click(); });
    await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeTruthy());
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
  });
});
