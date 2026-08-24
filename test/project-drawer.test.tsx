/**
 * @jest-environment jsdom
 */
import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';

import { ProjectDrawer } from '../client/src/components/guides/ProjectDrawer';
import type { ProjectEntry } from '../shared/types';

const PROJECTS: ProjectEntry[] = [
  {
    name: 'guide-manager',
    path: '/p',
    guides: [
      { path: '/p/a.md', title: 'A', type: 'study', updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', href: '/guide?p=a', progress: null },
      { path: '/p/b.html', title: 'B', type: 'tutor', updated: '2026-08-24T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', href: '/guide?p=b', progress: null }
    ]
  },
  {
    name: 'german-study-partner',
    path: '/q',
    guides: [
      { path: '/q/c.md', title: 'C', type: 'study', updated: '2026-08-22T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', href: '/guide?p=c', progress: null }
    ]
  }
];

/** Renders the drawer with a real rail element for the outside-click exclusion. */
function renderDrawer(overrides: Partial<Parameters<typeof ProjectDrawer>[0]> = {}) {
  const rail = document.createElement('nav');
  document.body.appendChild(rail);
  const railRef = createRef<HTMLElement>();
  (railRef as { current: HTMLElement | null }).current = rail;

  const picked: string[] = [];
  const closes: number[] = [];
  render(
    <ProjectDrawer
      projects={PROJECTS}
      selected="all"
      onSelect={(p) => picked.push(p)}
      onClose={() => closes.push(1)}
      railRef={railRef}
      {...overrides}
    />
  );
  return { rail, picked, closes };
}

describe('ProjectDrawer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('offers every project plus an all-projects row', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: /All projects/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /guide-manager/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /german-study-partner/ })).toBeTruthy();
  });

  it('counts the guides in each row, and the whole set in the all row', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: /All projects/ }).textContent).toContain('3');
    expect(screen.getByRole('button', { name: /guide-manager/ }).textContent).toContain('2');
    expect(screen.getByRole('button', { name: /german-study-partner/ }).textContent).toContain('1');
  });

  it('marks the current scope for assistive tech, not just visually', () => {
    renderDrawer({ selected: '/q' });
    expect(screen.getByRole('button', { name: /german-study-partner/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /All projects/ }).getAttribute('aria-current')).toBeNull();
  });

  it("reports the picked project by path, since that is the registry's own key", () => {
    const { picked } = renderDrawer();
    act(() => { screen.getByRole('button', { name: /german-study-partner/ }).click(); });
    expect(picked).toEqual(['/q']);
  });

  it('reports the all row as all rather than an empty path', () => {
    const { picked } = renderDrawer({ selected: '/q' });
    act(() => { screen.getByRole('button', { name: /All projects/ }).click(); });
    expect(picked).toEqual(['all']);
  });

  it('closes on Escape', () => {
    const { closes } = renderDrawer();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(closes).toHaveLength(1);
  });

  it('leaves other keys alone', () => {
    const { closes } = renderDrawer();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); });
    expect(closes).toHaveLength(0);
  });

  it('closes on a press outside itself', () => {
    const { closes } = renderDrawer();
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(closes).toHaveLength(1);
  });

  it('stays open when the press lands inside it', () => {
    const { closes } = renderDrawer();
    act(() => {
      screen.getByRole('button', { name: /All projects/ }).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(closes).toHaveLength(0);
  });

  it("stays open when the press lands in the rail, so the rail button's own toggle closes it", () => {
    const { rail, closes } = renderDrawer();
    act(() => { rail.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(closes).toHaveLength(0);
  });

  it('names itself for assistive tech as the dialog it is', () => {
    renderDrawer();
    expect(screen.getByRole('dialog', { name: 'Projects' })).toBeTruthy();
  });

  it('closes from its own close button', () => {
    const { closes } = renderDrawer();
    act(() => { screen.getByTitle('Close').click(); });
    expect(closes).toHaveLength(1);
  });
});
