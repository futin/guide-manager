/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { SideRail, type Section } from '../client/src/components/SideRail';

describe('SideRail', () => {
  it('offers exactly the two sections this app has', () => {
    render(<SideRail section="guides" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Guides' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('marks the active section for assistive tech, not just visually', () => {
    render(<SideRail section="settings" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Guides' }).getAttribute('aria-current')).toBeNull();
  });

  it('reports the section that was clicked', () => {
    const seen: Section[] = [];
    render(<SideRail section="guides" onChange={(s) => seen.push(s)} />);
    screen.getByRole('button', { name: 'Settings' }).click();
    expect(seen).toEqual(['settings']);
  });

  it('carries the wordmark', () => {
    render(<SideRail section="guides" onChange={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Manager');
  });
});
