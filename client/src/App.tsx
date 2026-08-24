import { lazy, Suspense } from 'react';

import { SideRail, type Section } from './components/SideRail';
import { SettingsProvider } from './hooks/useSettings';
import { usePersistedState } from './hooks/usePersistedState';

// Lazy: each section's chunk loads only when it is opened.
const GuidesView = lazy(() => import('./components/guides/GuidesView'));
const SettingsView = lazy(() => import('./components/settings/SettingsView'));

export function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

function AppShell() {
  // Remembered across loads: reopening on the section you left is what you want
  // from a reading tool you come back to.
  const [section, setSection] = usePersistedState<Section>('guide-manager.section', 'guides');
  // Guard a hand-edited or stale stored value — an unknown section would render
  // nothing at all.
  const current: Section = section === 'settings' ? 'settings' : 'guides';

  return (
    <div className="shell">
      <SideRail section={current} onChange={setSection} />
      <main className="main">
        {/* The guides list and its viewer need the room; settings reads better narrow. */}
        <div className={current === 'guides' ? 'wrap wide' : 'wrap'}>
          <Suspense fallback={<div className="guides-empty">loading…</div>}>
            {current === 'guides' ? <GuidesView /> : <SettingsView />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
