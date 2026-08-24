import { lazy, Suspense, useState } from 'react';

import { SideRail, type Section } from './components/SideRail';

// Lazy: each section's chunk loads only when it is opened.
const GuidesView = lazy(() => import('./components/guides/GuidesView'));

export function App() {
  const [section, setSection] = useState<Section>('guides');

  return (
    <div className="shell">
      <SideRail section={section} onChange={setSection} />
      <main className="main">
        <div className="wrap wide">
          {section === 'guides' ? (
            <Suspense fallback={<div className="guides-empty">loading…</div>}>
              <GuidesView />
            </Suspense>
          ) : (
            <div className="guides-empty">settings arrive in the next step</div>
          )}
        </div>
      </main>
    </div>
  );
}
