/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { act } from 'react';

import SettingsView from '../client/src/components/settings/SettingsView';
import { SettingsProvider } from '../client/src/hooks/useSettings';
import { BIONIC_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../client/src/lib/settings';

function renderSettings() {
  return render(
    <SettingsProvider>
      <SettingsView />
    </SettingsProvider>
  );
}

const stored = (key: string): Record<string, unknown> =>
  JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;

describe('SettingsView', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('offers all five themes and exactly three reading rows', () => {
    renderSettings();
    for (const label of ['Midnight Radar', 'Graphite', 'Amber CRT', 'Nightshift', 'Daylight Strip']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.getByText('Bionic reading')).toBeTruthy();
    expect(screen.getByText('Fixation')).toBeTruthy();
    expect(screen.getByText('Every')).toBeTruthy();
  });

  it('carries no rows the dashboard had but this app has no use for', () => {
    renderSettings();
    for (const gone of ['Density', 'Text scale', 'Refresh', 'Landing', 'Remote', 'Push']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('stamps the picked theme on <html> and persists it', () => {
    renderSettings();
    act(() => { screen.getByRole('button', { name: /Daylight Strip/ }).click(); });
    expect(document.documentElement.dataset.theme).toBe('daylight');
    expect(stored(SETTINGS_STORAGE_KEY).theme).toBe('daylight');
  });

  it("mirrors bionic changes into the vendored aid's own key", () => {
    renderSettings();
    act(() => { screen.getByRole('button', { name: 'On' }).click(); });
    expect(stored(BIONIC_STORAGE_KEY)).toEqual({ on: true, strength: 0.5, freq: 1 });

    act(() => { screen.getByRole('button', { name: '70%' }).click(); });
    expect(stored(BIONIC_STORAGE_KEY)).toEqual({ on: true, strength: 0.7, freq: 1 });

    act(() => { screen.getByRole('button', { name: '3rd' }).click(); });
    expect(stored(BIONIC_STORAGE_KEY)).toEqual({ on: true, strength: 0.7, freq: 3 });
  });

  it('disables the fixation and frequency pickers while bionic is off', () => {
    renderSettings();
    const disabled = screen.getAllByRole('button').filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.map((b) => b.textContent)).toEqual(['30%', '50%', '70%', '1st', '2nd', '3rd']);
  });

  it('shows a stored out-of-stop strength without snapping it', () => {
    // The in-guide panel writes 5% steps; 45% is not one of this page's three
    // stops, and must survive a render rather than being rounded to one.
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ bionicOn: true, bionicStrength: 0.45 }));
    renderSettings();
    expect(stored(SETTINGS_STORAGE_KEY).bionicStrength).toBe(0.45);
    const pressed = screen.getAllByRole('button').filter((b) => b.className.includes('on'));
    expect(pressed.map((b) => b.textContent)).not.toContain('50%');
  });
});
