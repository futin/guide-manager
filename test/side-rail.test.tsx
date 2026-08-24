/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { SideRail, type Section } from '../client/src/components/SideRail';

/** The rail with everything but the bit under test defaulted away. */
function renderRail(overrides: Partial<Parameters<typeof SideRail>[0]> = {}) {
  const sections: Section[] = [];
  render(
    <SideRail
      section="guides"
      onChange={(s) => sections.push(s)}
      {...overrides}
    />
  );
  return { sections };
}

describe('SideRail', () => {
  it('offers exactly the two sections this app has', () => {
    renderRail();
    expect(screen.getByRole('button', { name: 'Guides' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('marks the active section for assistive tech, not just visually', () => {
    renderRail({ section: 'settings' });
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Guides' }).getAttribute('aria-current')).toBeNull();
  });

  it('reports the section that was clicked', () => {
    const { sections } = renderRail();
    screen.getByRole('button', { name: 'Settings' }).click();
    expect(sections).toEqual(['settings']);
  });

  it('carries the wordmark', () => {
    renderRail();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Manager');
  });

  it('switches section on the tab that is already showing, rather than disclosing anything', () => {
    const { sections } = renderRail({ section: 'guides' });
    screen.getByRole('button', { name: 'Guides' }).click();
    expect(sections).toEqual(['guides']);
  });

  /*
    The Guides tab briefly doubled as a disclosure for the project drawer, and
    carried aria-expanded to say so. The drawer is gone, so the attribute has to
    go with it: a button that only navigates must not announce a panel it does
    not hold. Asserted across the whole rail rather than on one tab — the point
    is that no tab discloses anything, not that this one stopped.
  */
  it('claims no disclosure on any tab, in either section', () => {
    const { unmount } = render(<SideRail section="guides" onChange={() => {}} />);
    expect(document.querySelectorAll('.rail [aria-expanded]')).toHaveLength(0);
    unmount();
    render(<SideRail section="settings" onChange={() => {}} />);
    expect(document.querySelectorAll('.rail [aria-expanded]')).toHaveLength(0);
  });

  it('leaves no caret behind on the tabs', () => {
    renderRail({ section: 'guides' });
    expect(document.querySelector('.rail-caret')).toBeNull();
  });
});
