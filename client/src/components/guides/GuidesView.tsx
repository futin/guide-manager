import { useEffect, useState } from 'react';

import { useGuides } from '../../hooks/useGuides';
import { usePersistedState } from '../../hooks/usePersistedState';
import type { GuideEntry } from '../../../../shared/types';

/**
 * Folded bays, stored as the project *paths* that are currently folded shut.
 *
 * Paths rather than names because the registry keys on the path: two checkouts of
 * one repo register the same project name twice, and a name-keyed fold would
 * collapse both bays on one tap. The list is also self-cleaning — a stored path
 * whose project is no longer registered simply never matches a bay, so there is
 * no pruning pass and no way for a stale entry to fold the wrong project.
 *
 * Stored as the folded set rather than the open one so that a project registered
 * after the fold state was written arrives open, which is the useful default: a
 * new project you have not seen yet should not appear pre-folded.
 */
const COLLAPSED_BAYS_KEY = 'guide-manager.collapsedBays';

/** What the viewer pane shows; null means the list is shown instead. */
interface ViewerState {
  href: string;
  title: string;
}

/**
 * Guides section — every guide registered in ~/.guide-manager/registry.json,
 * read via GET /api/guides, grouped by the project it belongs to. Read-only and
 * unpolled.
 *
 * Ported from ../claude-agents-dashboard/client/src/components/guides/GuidesView.tsx.
 * Two changes: the fixed Decks / Study-guides pair becomes one bay per project,
 * and the viewer carries the entry's own `href` instead of a relative path it
 * would otherwise have to rebuild — the server already resolved and encoded it,
 * and re-deriving it here is how the two would drift.
 *
 * `.guide-viewer-head` is kept as its own element deliberately: it is the exact
 * class name a later companion panel would mount into, so its shape must stay
 * stable.
 */
export default function GuidesView() {
  const { index, loading, error } = useGuides();
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewing = viewer !== null;
  /*
    Per device, not per account: which projects you keep folded on the phone has
    nothing to do with what you want folded on the desktop board, and the phone is
    the whole reason this exists. Must sit above the early return with the other
    hooks.
  */
  const [collapsedBays, setCollapsedBays] = usePersistedState<string[]>(COLLAPSED_BAYS_KEY, []);

  /* usePersistedState hands back a plain setter, not a dispatch, so the next
     value is computed from the current one here. Safe without an updater form:
     one tap is one toggle, and there is no path that queues two of them. */
  const toggleBay = (path: string) =>
    setCollapsedBays(
      collapsedBays.includes(path)
        ? collapsedBays.filter((p) => p !== path)
        : [...collapsedBays, path]
    );

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

  const projects = index?.projects ?? [];

  return (
    <div className="guides">
      <div className="guides-bar">
        <div className="guides-title">Guides</div>
      </div>

      {loading ? (
        <div className="guides-empty">loading…</div>
      ) : error ? (
        <div className="guides-empty">guides unavailable</div>
      ) : projects.length === 0 ? (
        <div className="guides-empty">nothing registered yet</div>
      ) : (
        projects.map((project) => {
          /*
            task-7 pointer: once the toolbar's search lands, a non-empty query has
            to force `open` true for any bay holding a match — otherwise typing a
            query appears to find nothing, because the bay it matched in is folded
            shut. Derive that here (`open = !folded || queryMatchesThisBay`) and
            leave `collapsedBays` alone: the fold state is the user's standing
            preference, and a search that silently rewrote it would leave every
            searched bay open once the query was cleared.
          */
          const open = !collapsedBays.includes(project.path);

          return (
            <div className="bay" key={project.path}>
              {/*
                The header renders unconditionally, and has to keep doing so once
                task-7's project filter lands: the board carries the project's name
                nowhere else, so a single-bay board without its header is a board
                that never says which project you are looking at. The previous
                drawer hid the heading whenever one group was showing, which is
                exactly the bug that produced it.

                The whole header is the disclosure, rather than a caret button
                beside the name: on a phone the header row is a comfortable tap
                target and an 8px caret is not. That makes it a real <button> — not
                a div with onClick — so it gets keyboard focus, Enter/Space, and an
                aria-expanded the assistive layer already knows how to announce.

                The tick stays an empty span, not a text glyph or a border on
                .bay-h: a border cannot be given its own 14x3 footprint beside the
                baseline-aligned name, and a glyph at the *start* of the header
                would be read as part of the project's name. The caret is a glyph
                and does land in the header's textContent, which is why it sits
                last and carries aria-hidden — anything reading the project name
                off the DOM reads .bay-name, never the header.
              */}
              <button
                type="button"
                className="bay-h"
                aria-expanded={open}
                onClick={() => toggleBay(project.path)}
              >
                <span className="bay-tick" />
                <span className="bay-name">{project.name}</span>
                <span className="bay-count">
                  {project.guides.length} {project.guides.length === 1 ? 'guide' : 'guides'}
                </span>
                <span className="bay-caret" aria-hidden="true">▾</span>
              </button>
              {/*
                Unmounted rather than hidden with CSS. A folded bay is one a phone
                should not be paying for at all — hiding the grid would keep every
                card's DOM, and a board of grown projects folds precisely because
                that DOM is the scroll wall being folded away.
              */}
              {open ? (
                <div className="guides-grid">
                  {project.guides.map((g) => (
                    <GuideCard
                      key={g.path}
                      guide={g}
                      onOpen={() => setViewer({ href: g.href, title: g.title })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * One tappable guide card: title on top, then a footer row of the type as a pill
 * and a meta line of date · how far you got. A finished guide reads as a state
 * ("read"); a part-read one as a number, because there the number is the
 * information. A guide never opened says nothing at all rather than "0%", which
 * would look like a failure to start.
 *
 * The pill and the meta line are wrapped in .guides-card-foot rather than sitting
 * on the card directly. The old layout was a two-row named-areas grid, which was
 * the right shape while cards were a single column of full-width rows — but in a
 * grid of side-by-side cards the cells stretch to the tallest card in the row, and
 * a grid row cannot be pushed to the bottom of a taller cell. One footer element
 * can: .guides-card is a flex column and the footer takes `margin-top:auto`, so
 * the meta lines of neighbouring cards align however long their titles run.
 */
function GuideCard({ guide, onOpen }: { guide: GuideEntry; onOpen: () => void }) {
  return (
    <div className="guides-card" role="button" onClick={onOpen}>
      <div className="guides-card-title">{guide.title}</div>
      <div className="guides-card-foot">
        {/*
          The type leads the footer as a coloured pill rather than a word in the
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
    </div>
  );
}
