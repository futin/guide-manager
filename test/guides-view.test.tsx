/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { act, createRef } from 'react';

import GuidesView from '../client/src/components/guides/GuidesView';
import type { GuidesIndex } from '../shared/types';

const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        {
          path: '/p/g/a.md', title: 'Alpha Guide', type: 'study', updated: '2026-08-24T10:19:08.417Z',
          href: '/guide?p=%2Fp%2Fg%2Fa.md', progress: null
        },
        {
          path: '/p/g/deck.html', title: 'Beta Deck', type: 'tutor', updated: '2026-08-20T00:00:00Z',
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
          path: '/q/g/c.md', title: 'Gamma', type: 'study', updated: '2026-08-22T00:00:00Z',
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

type Overrides = Partial<Parameters<typeof GuidesView>[0]>;

async function renderGuides(body: unknown = INDEX, overrides: Overrides = {}) {
  mockFetch(body);
  const picked: string[] = [];
  const closes: number[] = [];
  render(
    <GuidesView
      project="all"
      onOpenProjects={() => {}}
      projectsOpen={false}
      onSelectProject={(p) => picked.push(p)}
      onCloseProjects={() => closes.push(1)}
      railRef={createRef<HTMLElement>()}
      {...overrides}
    />
  );
  await waitFor(() => expect(screen.queryByText('loading…')).toBeNull());
  return { picked, closes };
}

describe('GuidesView', () => {
  afterEach(() => {
    document.documentElement.classList.remove('guide-locked');
  });

  it('renders one group per project, titled by project name', async () => {
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

  it('shows every project when the scope is all', async () => {
    await renderGuides();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('shows only the selected project when one is picked', async () => {
    await renderGuides(INDEX, { project: '/q' });
    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(screen.queryByText('Alpha Guide')).toBeNull();
    expect(screen.queryByText('Beta Deck')).toBeNull();
  });

  it('drops the project heading once the list is one project deep', async () => {
    await renderGuides(INDEX, { project: '/q' });
    expect(document.querySelector('.guides-group-h')).toBeNull();
  });

  it('keeps the headings while every project is listed, since they separate the groups', async () => {
    await renderGuides();
    expect(document.querySelectorAll('.guides-group-h')).toHaveLength(2);
  });

  it('names the current scope in the bar', async () => {
    await renderGuides();
    expect(screen.getByRole('button', { name: /All projects/ })).toBeTruthy();
  });

  it('names the picked project in the bar rather than its path', async () => {
    await renderGuides(INDEX, { project: '/q' });
    expect(screen.getByRole('button', { name: /german-study-partner/ })).toBeTruthy();
  });

  it('opens the project drawer from the scope button in the bar', async () => {
    const opens: number[] = [];
    await renderGuides(INDEX, { onOpenProjects: () => opens.push(1) });
    act(() => { screen.getByRole('button', { name: /All projects/ }).click(); });
    expect(opens).toHaveLength(1);
  });

  it('falls back to every project when the remembered one is no longer registered', async () => {
    await renderGuides(INDEX, { project: '/gone' });
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(screen.getByRole('button', { name: /All projects/ })).toBeTruthy();
  });

  it('keeps the project drawer shut until it is asked for', async () => {
    await renderGuides();
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
  });

  it('shows the drawer over the list when it is open, listing the projects it fetched', async () => {
    await renderGuides(INDEX, { projectsOpen: true });
    const drawer = screen.getByRole('dialog', { name: 'Projects' });
    expect(drawer.textContent).toContain('guide-manager');
    expect(drawer.textContent).toContain('german-study-partner');
  });

  it('reports the project picked in the drawer', async () => {
    const { picked } = await renderGuides(INDEX, { projectsOpen: true });
    const drawer = screen.getByRole('dialog', { name: 'Projects' });
    const row = [...drawer.querySelectorAll('button')].find((b) => b.textContent?.includes('german-study-partner'));
    act(() => { row?.click(); });
    expect(picked).toEqual(['/q']);
  });

  it('marks the scope in force inside the drawer', async () => {
    await renderGuides(INDEX, { project: '/q', projectsOpen: true });
    const drawer = screen.getByRole('dialog', { name: 'Projects' });
    const on = drawer.querySelector('[aria-current="true"]');
    expect(on?.textContent).toContain('german-study-partner');
  });

  it('leaves the drawer out of the viewer, where there is no list to scope', async () => {
    await renderGuides(INDEX, { projectsOpen: true });
    act(() => { screen.getByText('Alpha Guide').closest('.guides-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
  });

  it('says so when nothing is registered', async () => {
    await renderGuides({ projects: [] });
    expect(screen.getByText('nothing registered yet')).toBeTruthy();
  });

  it('says so when the server cannot be reached', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'));
    render(
      <GuidesView
        project="all"
        onOpenProjects={() => {}}
        projectsOpen={false}
        onSelectProject={() => {}}
        onCloseProjects={() => {}}
        railRef={createRef<HTMLElement>()}
      />
    );
    await waitFor(() => expect(screen.getByText('guides unavailable')).toBeTruthy());
  });
});
