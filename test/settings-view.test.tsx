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
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.removeProperty('--font-scale');
  });

  it('offers all five themes, three display rows and three reading rows', () => {
    renderSettings();
    for (const label of ['Midnight Radar', 'Graphite', 'Amber CRT', 'Nightshift', 'Daylight Strip']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
    for (const row of ['Density', 'Text size', 'Opens on', 'Bionic reading', 'Fixation', 'Every']) {
      expect(screen.getByText(row)).toBeTruthy();
    }
  });

  it('carries no rows the dashboard had but this app has no use for', () => {
    // Density, text size and the landing picker came over in task-8. What is
    // still absent is everything backed by a server this app does not have.
    renderSettings();
    for (const gone of ['Refresh', 'Sessions shown', 'Chat messages', 'Remote', 'Push']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('stamps density on <html> and persists the pick', () => {
    renderSettings();
    expect(document.documentElement.dataset.density).toBe('comfortable');

    act(() => { screen.getByRole('button', { name: 'Compact' }).click(); });
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(stored(SETTINGS_STORAGE_KEY).density).toBe('compact');
  });

  it('sets --font-scale as a fraction, not a percentage', () => {
    // The stored value is percent because that is what the row prints; the CSS
    // custom property has to be the `zoom` factor itself, or .shell scales 120x.
    renderSettings();
    const scale = () => document.documentElement.style.getPropertyValue('--font-scale');
    expect(scale()).toBe('1');

    act(() => { screen.getByRole('button', { name: '120%' }).click(); });
    expect(scale()).toBe('1.2');
    expect(stored(SETTINGS_STORAGE_KEY).fontScale).toBe(120);
  });

  it('persists the landing pick without touching the remembered section', () => {
    localStorage.setItem('guide-manager.section', JSON.stringify('settings'));
    renderSettings();
    const select = screen.getByLabelText('Opens on') as HTMLSelectElement;
    expect(select.value).toBe('last');

    act(() => {
      select.value = 'guides';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(stored(SETTINGS_STORAGE_KEY).landing).toBe('guides');
    // The override pins the opening section; it must not rewrite the memory of
    // where you actually were, or switching back to 'last' would lie.
    expect(localStorage.getItem('guide-manager.section')).toBe(JSON.stringify('settings'));
  });

  it('offers a landing option per rail section, plus the default', () => {
    renderSettings();
    const select = screen.getByLabelText('Opens on') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['last', 'guides', 'settings']);
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Where I left off', 'Guides', 'Settings'
    ]);
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
