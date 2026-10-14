/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';

import { SideRail, type Section } from '../client/src/components/SideRail';
import type { RailRow } from '../client/src/lib/rail';

const GUIDE_ROWS: RailRow[] = [
  { label: 'All projects', scope: 'all', count: 3 },
  { label: 'alpha', scope: '/a', count: 2 },
  { label: 'beta', scope: '/b', count: 1 }
];

const FAV_ROWS: RailRow[] = [
  { label: 'All projects', scope: 'all', count: 4 },
  { label: 'alpha', scope: 'alpha', count: 4 }
];

/** The rail with everything but the bit under test defaulted away. Every call is recorded, in order, in one log — so a test can assert sequence. */
function renderRail(overrides: Partial<Parameters<typeof SideRail>[0]> = {}) {
  const calls: string[] = [];
  const sections: Section[] = [];
  const result = render(
    <SideRail
      section="guides"
      onChange={(s) => {
        sections.push(s);
        calls.push(`change:${s}`);
      }}
      guideRows={null}
      favRows={null}
      guideScope="all"
      favScope="all"
      onScope={(s, scope) => calls.push(`scope:${s}:${scope}`)}
      {...overrides}
    />
  );
  return { sections, calls, ...result };
}

/** The three section rows, told apart from tree rows (which are buttons too) by class. */
const sectionRows = () => [...document.querySelectorAll<HTMLElement>('.rail .rail-link')];
const sectionRow = (label: string) => {
  const row = sectionRows().find((r) => r.querySelector('.rail-label')?.textContent === label);
  if (!row) throw new Error(`no section row ${label}`);
  return row;
};
/** Tree rows under one section row — the group the row sits in, never the whole rail, so the two trees are not mixed up. */
const treeRows = (label: string) => [...(sectionRow(label).parentElement?.querySelectorAll<HTMLElement>('.rail-sublink') ?? [])];
const treeRow = (section: string, label: string) => {
  const row = treeRows(section).find((r) => r.textContent?.startsWith(label));
  if (!row) throw new Error(`no tree row ${label} under ${section}`);
  return row;
};
const burger = () => document.querySelector<HTMLElement>('header.mnav button') as HTMLElement;

describe('SideRail', () => {
  it('offers exactly the three sections this app has', () => {
    renderRail({ guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(sectionRows().map((r) => r.querySelector('.rail-label')?.textContent)).toEqual(['Guides', 'Favorites', 'Settings']);
  });

  it('is labelled as the sections nav', () => {
    renderRail();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
  });

  it('marks the active section for assistive tech, not just visually', () => {
    renderRail({ section: 'settings' });
    expect(sectionRow('Settings').getAttribute('aria-current')).toBe('page');
    expect(sectionRow('Guides').getAttribute('aria-current')).toBeNull();
  });

  it('reports the section that was clicked, and nothing else', () => {
    const { sections, calls } = renderRail();
    act(() => { sectionRow('Settings').click(); });
    expect(sections).toEqual(['settings']);
    expect(calls).toEqual(['change:settings']);
  });

  /* The kicker reads `GUIDE MANAGER` on screen, but by `text-transform`, which jsdom does not apply — the DOM keeps sentence case. */
  it('carries the wordmark', () => {
    renderRail();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Manager');
    expect(h1.textContent).toContain('› guides');
  });

  it('switches section on the row that is already showing, rather than disclosing anything', () => {
    const { sections } = renderRail({ section: 'guides', guideRows: GUIDE_ROWS });
    act(() => { sectionRow('Guides').click(); });
    expect(sections).toEqual(['guides']);
  });

  /* ------------------------------------------------------------------ counts and trees */

  it('shows no count and no tree while the rows are not there', () => {
    renderRail({ section: 'guides' });
    expect(document.querySelectorAll('.rail-link .rail-count')).toHaveLength(0);
    expect(document.querySelectorAll('.rail-sublink')).toHaveLength(0);
  });

  it("counts a section by its tree's first row, and lists the tree under it", () => {
    renderRail({ section: 'guides', guideRows: GUIDE_ROWS });
    expect(sectionRow('Guides').querySelector('.rail-count')?.textContent).toBe('3');
    expect(treeRows('Guides').map((r) => r.textContent)).toEqual(['All projects3', 'alpha2', 'beta1']);
    expect(treeRows('Guides').map((r) => r.querySelector('.rail-count')?.textContent)).toEqual(['3', '2', '1']);
  });

  it('gives Settings no count, whatever the other rows hold', () => {
    renderRail({ section: 'settings', guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(sectionRow('Settings').querySelector('.rail-count')).toBeNull();
    expect(sectionRow('Favorites').querySelector('.rail-count')?.textContent).toBe('4');
  });

  it("draws only the showing section's tree on the rail", () => {
    renderRail({ section: 'guides', guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(treeRows('Guides')).toHaveLength(3);
    expect(treeRows('Favorites')).toHaveLength(0);
  });

  it('draws no tree at all on Settings', () => {
    renderRail({ section: 'settings', guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(document.querySelectorAll('.rail-sub')).toHaveLength(0);
  });

  it('marks the picked project row, and only that one', () => {
    renderRail({ section: 'guides', guideRows: GUIDE_ROWS, guideScope: '/a' });
    expect(treeRow('Guides', 'alpha').getAttribute('aria-current')).toBe('true');
    expect(treeRow('Guides', 'All projects').getAttribute('aria-current')).toBeNull();
  });

  /* Scope first, so the section paints already narrowed. */
  it('sets the scope and then switches section when a project row is picked', () => {
    const { calls } = renderRail({ section: 'guides', guideRows: GUIDE_ROWS });
    act(() => { treeRow('Guides', 'beta').click(); });
    expect(calls).toEqual(['scope:guides:/b', 'change:guides']);
  });

  /* ------------------------------------------------------------------ phone bar */

  it('puts the menu button in the phone bar, outside the rail, pointing at it', () => {
    renderRail();
    const button = burger();
    expect(button).toBeTruthy();
    expect(button.closest('.rail')).toBeNull();
    expect(button.getAttribute('aria-controls')).toBe('rail-nav');
    expect(document.querySelector('nav.rail')?.id).toBe('rail-nav');
    expect(button.getAttribute('aria-label')).toBe('Open menu');
  });

  it('opens with every tree drawn, and closes behind a pick', () => {
    renderRail({ section: 'guides', guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(burger().getAttribute('aria-expanded')).toBe('false');

    act(() => { burger().click(); });
    expect(burger().getAttribute('aria-expanded')).toBe('true');
    expect(burger().getAttribute('aria-label')).toBe('Close menu');
    expect(document.querySelector('nav.rail')?.classList.contains('open')).toBe(true);
    expect(treeRows('Guides')).toHaveLength(3);
    expect(treeRows('Favorites')).toHaveLength(2);

    act(() => { treeRow('Favorites', 'alpha').click(); });
    expect(burger().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('nav.rail')?.classList.contains('open')).toBe(false);
  });

  /*
    The Guides tab briefly doubled as a disclosure for a project drawer, and carried aria-expanded to say so. A row that only navigates must not announce
    a panel it does not hold — asserted across the whole rail rather than on one row, in both sections and with the phone menu down, because the point is
    that nothing in the rail discloses anything. The ☰ does, and is outside it.
  */
  it('claims no disclosure anywhere inside the rail, in either section or with the menu open', () => {
    const first = renderRail({ section: 'guides', guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(document.querySelectorAll('.rail [aria-expanded]')).toHaveLength(0);
    first.unmount();
    renderRail({ section: 'settings', guideRows: GUIDE_ROWS, favRows: FAV_ROWS });
    expect(document.querySelectorAll('.rail [aria-expanded]')).toHaveLength(0);
    act(() => { burger().click(); });
    expect(document.querySelectorAll('.rail [aria-expanded]')).toHaveLength(0);
  });
});
