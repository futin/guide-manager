import { lazy, Suspense, useRef, useState } from 'react';

import { SideRail, type Section } from './components/SideRail';
import { ALL_PROJECTS } from './components/guides/ProjectDrawer';
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

  /*
    Which project the list is scoped to, by path, or ALL_PROJECTS. Remembered for
    the same reason the section is: a phone picked up mid-guide should still be
    looking at the project you were reading. Not validated here — App has no
    registry to validate against — so GuidesView fails a stale path open to "all"
    once the index arrives.

    Owned here rather than in GuidesView because the rail is here: the tab that
    opens the drawer and the value the drawer sets belong to the same owner, and
    the section value next to it is remembered the same way.
  */
  const [project, setProject] = usePersistedState<string>('guide-manager.project', ALL_PROJECTS);
  const [projectsOpen, setProjectsOpen] = useState(false);
  // Handed to the drawer so a press on the rail is not treated as a press
  // outside it — see ProjectDrawer.
  const railRef = useRef<HTMLElement>(null);

  return (
    <div className="shell">
      <SideRail
        section={current}
        onChange={setSection}
        projectsOpen={projectsOpen}
        onToggleProjects={() => setProjectsOpen((open) => !open)}
        railRef={railRef}
      />
      <main className="main">
        {/* The guides list and its viewer need the room; settings reads better narrow. */}
        <div className={current === 'guides' ? 'wrap wide' : 'wrap'}>
          <Suspense fallback={<div className="guides-empty">loading…</div>}>
            {current === 'guides' ? (
              <GuidesView
                project={project}
                onOpenProjects={() => setProjectsOpen(true)}
                projectsOpen={projectsOpen}
                onSelectProject={(scope) => {
                  setProject(scope);
                  // Picking is the whole point of the drawer, so it closes behind
                  // the pick rather than sitting over the list you just scoped.
                  setProjectsOpen(false);
                }}
                onCloseProjects={() => setProjectsOpen(false)}
                railRef={railRef}
              />
            ) : (
              <SettingsView />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
