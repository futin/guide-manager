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

async function renderGuides(body: unknown = INDEX) {
  mockFetch(body);
  render(<GuidesView />);
  await waitFor(() => expect(screen.queryByText('loading…')).toBeNull());
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

  it('shows each guide with its title, type and update date', async () => {
    await renderGuides();
    expect(screen.getByText('Alpha Guide')).toBeTruthy();
    const meta = screen.getByText('Alpha Guide').parentElement?.querySelector('.guides-card-meta');
    expect(meta?.textContent).toContain('study');
    expect(meta?.textContent).toContain('2026-08-24');
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
