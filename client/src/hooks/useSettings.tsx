import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { usePersistedState } from './usePersistedState';
import {
  BIONIC_STORAGE_KEY, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY,
  bionicKeyValue, clampSettings, type Settings
} from '../lib/settings';

interface SettingsControl {
  settings: Settings;
  /** Merge a partial change. Always re-clamped, so no caller can store a bad value. */
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsControl | null>(null);

/**
 * Per-device settings for the whole app.
 *
 * Storage is `usePersistedState`, which shallow-merges the stored blob over the
 * defaults — so a value written before a field existed still picks that field's
 * default up. `clampSettings` runs on top of the merge to bound anything
 * hand-edited, left over from an older release, or written by the in-guide
 * panel's sliders.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistedState<Settings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
  const settings = useMemo(() => clampSettings(stored), [stored]);

  const update = useCallback(
    (patch: Partial<Settings>) => setStored(clampSettings({ ...settings, ...patch })),
    [settings, setStored]
  );

  // The theme is pure CSS: everything downstream keys off this attribute, so no
  // component re-renders when it changes. The same attribute is stamped
  // pre-paint by the inline script in index.html — and by the identical script
  // the server injects into every rendered guide page — so this effect only
  // keeps it in step afterwards.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Two keys, one truth. `guide-manager.settings` is this app's state;
  // `guide-manager:bionic` is the contract assets/bionic.js already reads — in
  // this document, in the server-rendered guide pages, and inside every
  // already-generated study build the viewer frames. Writing it here is what
  // makes this page the central control without the vendored aid needing to know
  // this app exists. Same-origin documents also get a `storage` event from this
  // write, which is how an already-open framed guide repaints live.
  useEffect(() => {
    try {
      localStorage.setItem(BIONIC_STORAGE_KEY, JSON.stringify(bionicKeyValue(settings)));
    } catch {
      /* private mode — the aid falls back to its own defaults */
    }
  }, [settings.bionicOn, settings.bionicStrength, settings.bionicFreq, settings]);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * The current settings. Falls back to the defaults outside a provider so a
 * component rendered in isolation (or a test) still works — the settings are a
 * preference layer, never a precondition.
 */
export function useSettings(): SettingsControl {
  const ctx = useContext(SettingsContext);
  return ctx ?? { settings: DEFAULT_SETTINGS, update: () => {} };
}
