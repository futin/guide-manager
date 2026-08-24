import { useEffect, useState, type RefObject } from 'react';

import { useGuides } from '../../hooks/useGuides';
import { ProjectDrawer } from './ProjectDrawer';
import type { GuideEntry } from '../../../../shared/types';

/** What the viewer pane shows; null means the list is shown instead. */
interface ViewerState {
  href: string;
  title: string;
}

interface Props {
  /**
   * Which project's guides to list: a project path, or `'all'`. A path is the key
   * rather than the name because the registry's own identity for a project is its
   * path — two checkouts of the same repo would collide on name.
   */
  project: string;
  /** Open the project drawer — the scope button in the bar is a second way in. */
  onOpenProjects: () => void;
  projectsOpen: boolean;
  onSelectProject: (scope: string) => void;
  onCloseProjects: () => void;
  /** Forwarded to the drawer, which excludes rail presses from its outside-press close. */
  railRef: RefObject<HTMLElement>;
}

/**
 * Guides section — every guide registered in ~/.guide-manager/registry.json,
 * read via GET /api/guides, grouped by the project it belongs to, or narrowed to
 * one project by the drawer. Read-only and unpolled.
 *
 * Ported from ../claude-agents-dashboard/client/src/components/guides/GuidesView.tsx.
 * Two changes: the fixed Decks / Study-guides pair becomes one group per project,
 * and the viewer carries the entry's own `href` instead of a relative path it
 * would otherwise have to rebuild — the server already resolved and encoded it,
 * and re-deriving it here is how the two would drift.
 *
 * `.guide-viewer-head` is kept as its own element deliberately: it is the exact
 * class name a later companion panel would mount into, so its shape must stay
 * stable.
 */
export default function GuidesView({
  project,
  onOpenProjects,
  projectsOpen,
  onSelectProject,
  onCloseProjects,
  railRef
}: Props) {
  const { index, loading, error } = useGuides();
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewing = viewer !== null;

  /*
    Phone only in effect (the CSS rule lives inside the max-width:700px
    breakpoint), but the class goes on unconditionally: the viewer is an overlay
    at that width, and the guide it frames scrolls inside an iframe. A scroller in
    another document cannot be given `overscroll-behavior` from here, so the chain
    is refused at the root instead — see the .guide-locked rule in styles.css.
    Must sit above the early return below: hooks do not get to be conditional.
  */
  useEffect(() => {
    if (!viewing) return;
    const root = document.documentElement;
    root.classList.add('guide-locked');
    return () => root.classList.remove('guide-locked');
  }, [viewing]);

  if (viewer !== null) {
    return (
      <div className="guide-viewer">
        <div className="guide-viewer-head">
          <button className="guide-viewer-back" onClick={() => setViewer(null)}>‹ Guides</button>
          <span className="guide-viewer-title">{viewer.title}</span>
        </div>
        <div className="guide-viewer-body">
          {/*
            No `sandbox` attribute: this iframe is same-origin — our own server,
            serving our own guides, on purpose. Scripts are what make the framed
            page work at all. A generated tutor deck starts every `.card` at
            `display:none` and only `.card.active` shows one, so Back/Next, the
            arrow-key shortcuts and the quiz's click-to-reveal are entirely
            script-driven; block scripts and the deck freezes on its first card
            forever. The same is true of the reading aid and the progress reporter
            the server injects into a rendered markdown guide. There is no
            untrusted content here to isolate, so do not add a `sandbox` back
            without re-testing the pager, the quiz, and bionic reading against it.
          */}
          <iframe
            className="guide-viewer-frame"
            src={viewer.href}
            title={viewer.title}
          />
        </div>
      </div>
    );
  }

  const all = index?.projects ?? [];
  /*
    The scope is applied here rather than in App because this is where the index
    lives, and the fail-open needs it: a project path remembered from a previous
    session may no longer be registered (the guide moved, the project was
    dropped), and an unmatched filter that emptied the board would look like the
    server broke. An unmatched path reads as "all" — the same fail-open the stored
    section value gets in App — and the bar then says "All projects", so the
    fallback is visible rather than silent.
  */
  const scoped = all.filter((p) => p.path === project);
  const projects = scoped.length > 0 ? scoped : all;
  const single = scoped.length > 0;

  return (
    <div className="guides">
      <div className="guides-bar">
        <div className="guides-title">Guides</div>
        {/* Names the scope and opens the drawer. The rail's Guides button opens the
            same drawer; this one exists so the gesture is discoverable at all. */}
        <button className="guides-scope" onClick={onOpenProjects} aria-haspopup="dialog">
          {single ? scoped[0].name : 'All projects'}
          <span className="guides-scope-caret" aria-hidden="true">▾</span>
        </button>
      </div>

      {/*
        Rendered here rather than in App because this is where the index already
        is — see the note on ProjectDrawer. Below the viewer's early return on
        purpose: inside the viewer there is no list to scope, and a drawer
        floating over a framed guide would only be a way to lose your place.
      */}
      {projectsOpen ? (
        <ProjectDrawer
          projects={all}
          selected={project}
          onSelect={onSelectProject}
          onClose={onCloseProjects}
          railRef={railRef}
        />
      ) : null}

      {loading ? (
        <div className="guides-empty">loading…</div>
      ) : error ? (
        <div className="guides-empty">guides unavailable</div>
      ) : projects.length === 0 ? (
        <div className="guides-empty">nothing registered yet</div>
      ) : (
        projects.map((p) => (
          <div className="guides-group" key={p.path}>
            {/* Only worth a heading while there is more than one group to tell
                apart — filtered to one project, the bar already says which. */}
            {single ? null : <div className="guides-group-h">{p.name}</div>}
            <div className="guides-list">
              {p.guides.map((g) => (
                <GuideCard
                  key={g.path}
                  guide={g}
                  onOpen={() => setViewer({ href: g.href, title: g.title })}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * One tappable guide card: title, the type as a pill, then a meta line of date ·
 * how far you got. A finished guide reads as a state ("read"); a part-read one as
 * a number, because there the number is the information. A guide never opened
 * says nothing at all rather than "0%", which would look like a failure to start.
 */
function GuideCard({ guide, onOpen }: { guide: GuideEntry; onOpen: () => void }) {
  return (
    <div className="guides-card" role="button" onClick={onOpen}>
      <div className="guides-card-title">{guide.title}</div>
      {/*
        The type leads the meta line as a coloured pill rather than a word in the
        run of monospace text. Both types get one: a card with no pill would read
        as missing data rather than as "the plain kind".
      */}
      <span className={`pill pill-${guide.type}`}>{guide.type}</span>
      <div className="guides-card-meta">
        {guide.updated.slice(0, 10)}
        {guide.progress?.completed ? (
          <span className="guides-card-read"> · read</span>
        ) : guide.progress ? (
          <span className="guides-card-part"> · {guide.progress.scrollPercent}%</span>
        ) : null}
      </div>
    </div>
  );
}
