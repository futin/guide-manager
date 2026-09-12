import { lazy, Suspense, useState } from 'react';

import { SideRail, type Section } from './components/SideRail';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import { usePersistedState } from './hooks/usePersistedState';
import { readDeeplink } from './lib/deeplink';

// Lazy: each section's chunk loads only when it is opened.
const GuidesView = lazy(() => import('./components/guides/GuidesView'));
const FavoritesView = lazy(() => import('./components/favorites/FavoritesView'));
const SettingsView = lazy(() => import('./components/settings/SettingsView'));

export function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

/**
 * Inside the provider — `useSettings` cannot be called in `App` itself, and the
 * landing preference has to be readable before the first section paints.
 */
function AppShell() {
  const { settings } = useSettings();
  // Remembered across loads: reopening on the section you left is what you want
  // from a reading tool you come back to.
  const [stored, setStored] = usePersistedState<Section>('guide-manager.section', 'guides');
  /*
    A `landing` other than 'last' pins the opening section. Resolved once, in the
    initializer, so there is no flash of the previously-open section — and only
    the *initial* value, never the stored one: `stored` keeps recording every
    change underneath, so switching the setting back to 'last' finds a real last
    section rather than whatever was current when the override was turned on.

    A deep link (?open=, from a favorite's crumb) outranks both, because it names
    a guide and only the Guides section has a viewer to open one in — arriving
    from a favorite onto Settings because that is where you were last would
    simply lose the click. It is read here *and* in GuidesView rather than
    threaded down as a prop: this level decides the section, that one decides
    which guide, and neither needs the other's answer. Only GuidesView clears the
    param, once it has actually opened the guide, so the two readings cannot race.

    `stored` is deliberately left alone: the link is one arrival, not a change of
    where you were working.
  */
  const [section, setSection] = useState<Section>(() =>
    readDeeplink(window.location.search)
      ? 'guides'
      : settings.landing === 'last'
        ? stored
        : settings.landing
  );

  const change = (s: Section): void => {
    setSection(s);
    setStored(s);
  };

  // Guard a hand-edited or stale stored value — an unknown section would render
  // nothing at all. 'settings' and 'favorites' map to themselves; anything else
  // (including a value from a rail this app no longer has) falls back to 'guides'.
  const current: Section =
    section === 'settings' || section === 'favorites' ? section : 'guides';

  return (
    <div className="shell">
      <SideRail section={current} onChange={change} />
      <main className="main">
        {/* Only the guide list and its viewer need the extra room — Favorites and
            Settings both read better narrow, like a column of cards or of rows. */}
        <div className={current === 'guides' ? 'wrap wide' : 'wrap'}>
          <Suspense fallback={<div className="guides-empty">loading…</div>}>
            {current === 'guides' ? (
              <GuidesView />
            ) : current === 'favorites' ? (
              <FavoritesView />
            ) : (
              <SettingsView />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
