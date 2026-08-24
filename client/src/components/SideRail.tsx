export type Section = 'guides' | 'settings';

const TABS: { id: Section; label: string }[] = [
  { id: 'guides', label: 'Guides' },
  { id: 'settings', label: 'Settings' }
];

interface Props {
  section: Section;
  onChange: (s: Section) => void;
}

/**
 * Top-level section switch: the guide list · settings. A rail down the left edge
 * on desktop, a horizontal scroll strip below 700px.
 *
 * Ported from ../claude-agents-dashboard/client/src/components/SideRail.tsx with
 * its five tabs cut to two — the dashboard's Sessions, Management and Analytics
 * have no counterpart here. The class names are unchanged because the ported
 * stylesheet keys off them.
 */
export function SideRail({ section, onChange }: Props) {
  return (
    <nav className="rail" aria-label="Sections">
      {/* the app's only wordmark */}
      <h1 className="rail-brand">
        <span className="rail-kicker">Guide</span>
        <br />
        Manager
      </h1>
      {TABS.map(t => (
        <button
          key={t.id}
          className={section === t.id ? 'rail-link on' : 'rail-link'}
          aria-current={section === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
