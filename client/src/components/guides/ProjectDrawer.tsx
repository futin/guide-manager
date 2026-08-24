import { useEffect, useRef, type RefObject } from 'react';

import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import type { ProjectEntry } from '../../../../shared/types';

/** The scope value that means "do not narrow the list at all". */
export const ALL_PROJECTS = 'all';

interface Props {
  projects: ProjectEntry[];
  /** The scope in force: a project path, or ALL_PROJECTS. */
  selected: string;
  onSelect: (scope: string) => void;
  onClose: () => void;
  /**
   * The rail element. Presses inside it are excluded from the outside-press close
   * so the rail button that opened the drawer can also close it — without the
   * exclusion the press would close the drawer and the click would immediately
   * reopen it, and the drawer would look stuck open.
   */
  railRef: RefObject<HTMLElement>;
}

/**
 * The Guides section's project picker: an overlay drawer anchored beside the rail,
 * listing every project the registry knows plus an all-projects row.
 *
 * Ported from ../ixray/apps/web/src/components/NavDrawer.tsx — same close paths
 * (Escape, outside press with the rail excluded, the X), same fixed overlay that
 * floats above the board and never reflows it. Unlike ixray's, this drawer is
 * single-purpose rather than a shell for arbitrary content: there is one drawer
 * here and giving it a `children` slot would only invite a second unrelated
 * panel into the same component.
 *
 * It renders from inside GuidesView rather than from App because GuidesView is
 * where the guides index already lives. Hoisting it to App would mean either a
 * second GET /api/guides for the same data or restructuring who owns the fetch;
 * `position: fixed` makes the DOM position irrelevant to where it paints.
 */
export function ProjectDrawer({ projects, selected, onSelect, onClose, railRef }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useCloseOnEscape(onClose);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (drawerRef.current?.contains(t)) return;
      if (railRef.current?.contains(t)) return;
      onClose();
    }
    // mousedown, not click: closing on press is what makes the drawer feel like an
    // overlay rather than a panel, and a click listener would also fire for a
    // press that began inside the drawer and ended outside it.
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose, railRef]);

  const total = projects.reduce((n, p) => n + p.guides.length, 0);

  return (
    <div className="nav-drawer" role="dialog" aria-label="Projects" ref={drawerRef}>
      <div className="nav-drawer-head">
        <h2>Projects</h2>
        <button className="nav-drawer-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="nav-drawer-list">
        <ProjectRow
          label="All projects"
          count={total}
          on={selected === ALL_PROJECTS}
          onPick={() => onSelect(ALL_PROJECTS)}
        />
        {projects.map((p) => (
          <ProjectRow
            key={p.path}
            label={p.name}
            count={p.guides.length}
            on={selected === p.path}
            onPick={() => onSelect(p.path)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One row. The count is the row's whole justification for existing over a plain
 * name: it is what tells you whether a project is worth switching to before you
 * switch to it.
 */
function ProjectRow({ label, count, on, onPick }: { label: string; count: number; on: boolean; onPick: () => void }) {
  return (
    <button
      className={on ? 'nav-drawer-row on' : 'nav-drawer-row'}
      aria-current={on ? 'true' : undefined}
      onClick={onPick}
    >
      <span className="nav-drawer-row-name">{label}</span>
      <span className="nav-drawer-row-count">{count}</span>
    </button>
  );
}
