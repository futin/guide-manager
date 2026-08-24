import type { RefObject } from 'react';

export type Section = 'guides' | 'settings';

const TABS: { id: Section; label: string }[] = [
  { id: 'guides', label: 'Guides' },
  { id: 'settings', label: 'Settings' }
];

interface Props {
  section: Section;
  onChange: (s: Section) => void;
  /** Whether the Guides section's project drawer is open. */
  projectsOpen: boolean;
  onToggleProjects: () => void;
  /**
   * Handed the rail's own element. The project drawer needs it to exclude presses
   * landing in the rail from its outside-press close — see ProjectDrawer.
   */
  railRef: RefObject<HTMLElement>;
}

/**
 * Top-level section switch: the guide list · settings. A rail down the left edge
 * on desktop, a horizontal scroll strip below 700px.
 *
 * Ported from ../claude-agents-dashboard/client/src/components/SideRail.tsx with
 * its five tabs cut to two — the dashboard's Sessions, Management and Analytics
 * have no counterpart here. The class names are unchanged because the ported
 * stylesheet keys off them.
 *
 * The Guides tab does double duty, the way ixray's rail buttons do: it selects
 * the section, and once that section is showing it becomes the disclosure for the
 * project drawer. Deliberately NOT a third rail entry — the projects *are* the
 * guides, so a sibling "Projects" section would invent a second classification of
 * the same thing.
 */
export function SideRail({ section, onChange, projectsOpen, onToggleProjects, railRef }: Props) {
  return (
    <nav className="rail" ref={railRef} aria-label="Sections">
      {/* the app's only wordmark */}
      <h1 className="rail-brand">
        <span className="rail-kicker">Guide</span>
        <br />
        Manager
      </h1>
      {TABS.map(t => {
        // Only the showing Guides tab controls the drawer. Off-section it is a
        // plain section switch, so it must not claim a disclosure it does not
        // have — a screen reader announcing "collapsed" on a button that only
        // navigates is a lie about what pressing it does.
        const discloses = t.id === 'guides' && section === 'guides';
        return (
          <button
            key={t.id}
            className={section === t.id ? 'rail-link on' : 'rail-link'}
            aria-current={section === t.id ? 'page' : undefined}
            aria-expanded={discloses ? projectsOpen : undefined}
            onClick={() => (discloses ? onToggleProjects() : onChange(t.id))}
          >
            {t.label}
            {discloses ? <span className="rail-caret" aria-hidden="true">▾</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
