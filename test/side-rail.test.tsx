/**
 * @jest-environment jsdom
 */
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';

import { SideRail, type Section } from '../client/src/components/SideRail';

/** The rail with everything but the bit under test defaulted away. */
function renderRail(overrides: Partial<Parameters<typeof SideRail>[0]> = {}) {
  const sections: Section[] = [];
  const toggles: number[] = [];
  const railRef = createRef<HTMLElement>();
  render(
    <SideRail
      section="guides"
      onChange={(s) => sections.push(s)}
      projectsOpen={false}
      onToggleProjects={() => toggles.push(1)}
      railRef={railRef}
      {...overrides}
    />
  );
  return { sections, toggles, railRef };
}

describe('SideRail', () => {
  it('offers exactly the two sections this app has', () => {
    renderRail();
    expect(screen.getByRole('button', { name: /Guides/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('marks the active section for assistive tech, not just visually', () => {
    renderRail({ section: 'settings' });
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: /Guides/ }).getAttribute('aria-current')).toBeNull();
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

  it('hands out its own element, so the drawer can exclude presses landing in the rail', () => {
    const { railRef } = renderRail();
    expect(railRef.current?.tagName).toBe('NAV');
    expect(railRef.current?.className).toBe('rail');
  });

  it('opens the project drawer when Guides is pressed and Guides is already showing', () => {
    const { sections, toggles } = renderRail({ section: 'guides' });
    screen.getByRole('button', { name: /Guides/ }).click();
    expect(toggles).toHaveLength(1);
    expect(sections).toEqual([]);
  });

  it('switches to Guides without opening the drawer when another section is showing', () => {
    const { sections, toggles } = renderRail({ section: 'settings' });
    screen.getByRole('button', { name: /Guides/ }).click();
    expect(sections).toEqual(['guides']);
    expect(toggles).toEqual([]);
  });

  it('reports the drawer state on the button that controls it', () => {
    renderRail({ section: 'guides', projectsOpen: true });
    expect(screen.getByRole('button', { name: /Guides/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('reports a shut drawer as shut rather than saying nothing', () => {
    renderRail({ section: 'guides', projectsOpen: false });
    expect(screen.getByRole('button', { name: /Guides/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('claims no disclosure while its section is not the one showing', () => {
    renderRail({ section: 'settings' });
    expect(screen.getByRole('button', { name: /Guides/ }).getAttribute('aria-expanded')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-expanded')).toBeNull();
  });
});
