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
 *
 * Every tab is a plain section switch and nothing more. A tab briefly doubled as
 * the disclosure for a project drawer; it does not any more, so no tab carries
 * `aria-expanded` — a button that only navigates must not announce a panel it
 * does not hold. Narrowing the board to one project belongs beside the board, in
 * the Guides toolbar, not in the switch that decides which section is showing.
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
