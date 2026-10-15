import { lazy, Suspense, useState } from 'react';

import { SideRail, type Section } from './components/SideRail';
import { useFavorites } from './hooks/useFavorites';
import { useGuides } from './hooks/useGuides';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import { usePersistedState } from './hooks/usePersistedState';
import { readDeeplink } from './lib/deeplink';
import { ALL, favoriteTree, guideTree, resolveScope } from './lib/rail';

// Lazy: each section's chunk loads only when it is opened. Only the data hooks moved up here (below); the views' code still waits for their section.
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

  /*
    Both indexes are fetched here, once, rather than by the section that shows them: the rail counts guides and favorites on every section, Settings
    included, so the data cannot wait for its view to mount. The hooks themselves are unchanged — useGuides' coalesced refetch on a framed guide's
    progress message is installed exactly once, here, for the life of the app rather than once per visit to Guides.
  */
  const guides = useGuides();
  const favorites = useFavorites();

  /*
    The scope keys, owned here because the rail writes them and the views read them, and this is the nearest common parent. Same keys and same values
    as the toolbar selects they replace, unmigrated: a device's stored pick becomes its rail selection.
  */
  const [guideStored, setGuideStored] = usePersistedState<string>('guide-manager.project', ALL);
  const [favStored, setFavStored] = usePersistedState<string>('guide-manager.favProject', ALL);

  /*
    `null` while loading or after a failure — the rail then shows that section's row with no count and no tree, and the section shows its own error
    copy; the other section is unaffected. The shape checks are not paranoia: useGuides has no `res.ok` check, so a server error lands a JSON error
    object in `index`, and GuidesView survives that only by reading `index?.projects ?? []`. The rail has no such fallback, and a throw here would take
    the whole shell down rather than one section.
  */
  const guideRows =
    !guides.loading && !guides.error && Array.isArray(guides.index?.projects) ? guideTree(guides.index!) : null;
  const favRows =
    !favorites.loading && !favorites.error && Array.isArray(favorites.favorites)
      ? favoriteTree(favorites.favorites, guides.index && Array.isArray(guides.index.projects) ? guides.index : null)
      : null;

  /* Resolved for display only. A stored scope the data does not name renders as All projects and is never written back, so it comes back if the
     project does — see resolveScope. */
  const guideScope = resolveScope(guideRows, guideStored);
  const favScope = resolveScope(favRows, favStored);

  const pickScope = (s: 'guides' | 'favorites', scope: string): void =>
    s === 'guides' ? setGuideStored(scope) : setFavStored(scope);

  // Guard a hand-edited or stale stored value — an unknown section would render
  // nothing at all. 'settings' and 'favorites' map to themselves; anything else
  // (including a value from a rail this app no longer has) falls back to 'guides'.
  const current: Section =
    section === 'settings' || section === 'favorites' ? section : 'guides';

  return (
    <div className="shell">
      <SideRail
        section={current}
        onChange={change}
        guideRows={guideRows}
        favRows={favRows}
        guideScope={guideScope}
        favScope={favScope}
        onScope={pickScope}
      />
      <main className="main">
        {/* Only the guide list and its viewer need the extra room — Favorites and
            Settings both read better narrow, like a column of cards or of rows. */}
        <div className={current === 'guides' ? 'wrap wide' : 'wrap'}>
          <Suspense fallback={<div className="empty-line">Loading…</div>}>
            {current === 'guides' ? (
              <GuidesView guides={guides} scope={guideScope} />
            ) : current === 'favorites' ? (
              <FavoritesView favorites={favorites} scope={favScope} />
            ) : (
              <SettingsView />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
