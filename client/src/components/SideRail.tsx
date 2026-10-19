import { useState, type ReactNode } from 'react';
import { VersionChip, useMediaQuery } from 'ui-kit';

import { NARROW } from './ReleasesDrawer';
import { IconClose, IconFavorites, IconGuides, IconMenu, IconSettings } from './icons';
import type { RailRow } from '../lib/rail';

export type Section = 'guides' | 'favorites' | 'settings';

/** The two sections that carry a project tree. Settings has nothing to narrow. */
type Scoped = 'guides' | 'favorites';

const TABS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'guides', label: 'Guides', icon: <IconGuides size={16} /> },
  { id: 'favorites', label: 'Favorites', icon: <IconFavorites size={16} /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings size={16} /> }
];

interface Props {
  section: Section;
  onChange: (s: Section) => void;
  /** Each section's tree rows, or `null` while its fetch is in flight or after it failed — the row then shows no count and no tree. */
  guideRows: RailRow[] | null;
  favRows: RailRow[] | null;
  /** The *resolved* scopes (lib/rail.ts `resolveScope`), never the raw stored values: the rail marks what the board is actually showing. */
  guideScope: string;
  favScope: string;
  onScope: (section: Scoped, scope: string) => void;
  /**
   * The version chip: the running version's label, whether a release has landed since this browser last opened What's new, and the open. Absent, no
   * chip — the checkout has no version yet, or the read has not answered. The drawer itself is AppShell's, rendered outside this nav.
   */
  releases?: { label: string; dot: boolean; onOpen: () => void };
}

/**
 * The shell's navigation: the three sections, and under Guides and Favorites a tree of the projects each can be narrowed to. A rail down the left edge
 * from 640 px; below that a `.mnav` top bar whose ☰ drops this same `.rail` down as a full-width menu.
 *
 * Ported from ../claude-agents-dashboard/client/src/components/SideRail.tsx — its shipped rail rather than DESIGN.md §8's mock, so the two apps' rails
 * match row for row. The dashboard's trees switch a sub-view; these narrow a section to one project.
 *
 * The project scope belongs here, not in the Guides or Favorites toolbar. It used to be a `<select>` beside each board, which made "which project" a
 * filter you re-read every time instead of a place you are. As a tree under the section row it is a destination: picking a project switches to that
 * section *and* narrows it, in one step, and the picked row stays marked for as long as the scope holds. This component is the only writer of the two
 * scope keys (`guide-manager.project`, `guide-manager.favProject`), through `onScope` — AppShell owns the storage, the rail only reports the pick.
 *
 * Every row is a plain navigation button, and so no row carries `aria-expanded`: a button that only navigates must not announce a panel it does not
 * hold. The one disclosure in the whole nav is the phone bar's ☰, which does hold one (the menu), and it lives in `.mnav`, outside `.rail`, so the
 * rule stays checkable as "nothing inside `.rail`".
 */
export function SideRail({ section, onChange, guideRows, favRows, guideScope, favScope, onScope, releases }: Props) {
  /* Phone only — `.mnav` is `display:none` from 640 px up, so on a desktop this stays false and the rail never sees the open modifier. */
  const [open, setOpen] = useState(false);

  const trees: Record<Scoped, { rows: RailRow[] | null; scope: string }> = {
    guides: { rows: guideRows, scope: guideScope },
    favorites: { rows: favRows, scope: favScope }
  };

  /* The chip's phone shape (a 44 px hit area round the same pill) follows the breakpoint every other phone rule in styles.css writes out. */
  const narrow = useMediaQuery(NARROW);

  /* Picking anything is a destination, so the menu closes behind it. A no-op on the desktop rail, which is never open. */
  const go = (s: Section): void => {
    onChange(s);
    setOpen(false);
  };

  /* Scope first, then section: by the time the section paints, the scope it renders with is already the one just picked. */
  const pickScope = (s: Scoped, scope: string): void => {
    onScope(s, scope);
    go(s);
  };

  return (
    <>
      <header className="mnav">
        {/* Not a heading: the rail's wordmark is the page's one <h1>, and in a bar this is a label. */}
        <div className="mnav-brand" aria-hidden="true">
          <Wordmark />
        </div>
        <button
          className="mnav-burger"
          aria-expanded={open}
          aria-controls="rail-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconClose /> : <IconMenu />}
        </button>
      </header>
      <nav id="rail-nav" className={open ? 'rail open' : 'rail'} aria-label="Sections">
        {/* the app's only wordmark. Read verbatim its drawn parts would be "GUIDE › manager" and an empty box, so it carries the app's name as its
            `aria-label` and the parts are hidden (Wordmark). */}
        <h1 className="rail-brand" aria-label="Guide Manager">
          <Wordmark />
        </h1>
        {TABS.map((t) => {
          const tree = t.id === 'settings' ? null : trees[t.id];
          /* Desktop draws only the showing section's tree; the phone menu draws every tree, so any project is one tap away (DESIGN.md §8). */
          const showTree = tree?.rows && (section === t.id || open);
          return (
            <div key={t.id} className="rail-group">
              <button
                className={section === t.id ? 'rail-link on' : 'rail-link'}
                aria-current={section === t.id ? 'page' : undefined}
                onClick={() => go(t.id)}
              >
                <span className="rail-ic">{t.icon}</span>
                <span className="rail-label">{t.label}</span>
                {/* rows[0] is always `All projects`, so its count is the section's total. */}
                {tree?.rows && <span className="rail-count">{tree.rows[0].count}</span>}
              </button>
              {showTree && (
                <div className="rail-sub">
                  {tree.rows!.map((r) => {
                    const on = r.scope === tree.scope;
                    return (
                      <button
                        key={r.scope}
                        className={on ? 'rail-sublink on' : 'rail-sublink'}
                        aria-current={on ? 'true' : undefined}
                        onClick={() => pickScope(t.id as Scoped, r.scope)}
                      >
                        <span className="rail-sublabel">{r.label}</span>
                        <span className="rail-count">{r.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {/* The rail's last element, sunk to its foot on the desktop; in the phone menu its last row, and like every row there a tap closes the menu. The
            chip is ui-kit's `VersionChip` and draws its own pill — it takes no `className` — so `.rail-release` is a wrapper that owns the placement and
            nothing else. `narrow` gives it a 44 px hit area that overhangs the pill by 8 px above and below; the wrapper's margins keep that overhang inside
            the rail's padding box, which scrolls and would otherwise clip it. */}
        {releases && (
          <div className="rail-release">
            <VersionChip
              label={releases.label}
              dot={releases.dot}
              narrow={narrow}
              onClick={() => {
                releases.onOpen();
                setOpen(false);
              }}
            />
          </div>
        )}
      </nav>
    </>
  );
}

/**
 * A `GUIDE` kicker over a `› manager` prompt with a block cursor — the app's name split the way backlog-manager splits its own (`BACKLOG` over
 * `› manager`), so the neighbouring apps read as one family. Static: nothing in this app is "working", so unlike the dashboard's cursor it never blinks.
 * Its parts are hidden from assistive tech; the `<h1>` around it carries the name.
 */
function Wordmark() {
  return (
    <>
      <span className="rail-kicker" aria-hidden="true">
        Guide
      </span>
      <span className="rail-prompt" aria-hidden="true">
        <span className="rail-caret">›</span> manager
        <span className="rail-cursor" />
      </span>
    </>
  );
}
