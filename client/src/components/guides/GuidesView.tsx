import { useEffect, useRef, useState } from 'react';

import { useGuides } from '../../hooks/useGuides';
import { usePersistedState } from '../../hooks/usePersistedState';
import { partitionSeries, seriesLabel } from '../../lib/series';
import type { SeriesLesson } from '../../lib/series';
import type { GuideEntry, GuideType, ProjectEntry } from '../../../../shared/types';

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

/**
 * Folded series shelves, stored the same way for the same reasons: keyed by the
 * series *directory's* absolute path (a SeriesGroup's `key`), which is unique
 * even when two projects both hold a series named `basics`, and self-cleaning —
 * a stored key whose series no longer renders simply never matches a shelf.
 * Stored as the folded set so a series registered after this was written
 * arrives open, like a new bay does.
 */
const FOLDED_SERIES_KEY = 'guide-manager.foldedSeries';

/**
 * The three toolbar selects, remembered per device.
 *
 * `guide-manager.project` is deliberately the same key the removed project
 * drawer wrote, holding the same values (a registry project path, or the ALL
 * sentinel): the drawer and this select answer the identical question, so a
 * phone that still carries the drawer's value should open on the project it was
 * left scoped to rather than silently resetting to All.
 *
 * The search box is *not* here on purpose — see the plain useState below.
 */
const PROJECT_KEY = 'guide-manager.project';
const TYPE_KEY = 'guide-manager.filterType';
const SORT_KEY = 'guide-manager.sort';

/** The "not narrowed" sentinel for the project and type selects. A sentinel
 *  rather than an empty string, so a stored value always reads as itself and
 *  never as "the field was cleared". */
const ALL = 'all';

/** Sort keys, in the order the select offers them. `created` leads because it is
 *  the default: the board's job is to put the guide you generated ten minutes ago
 *  at the top of the bay you generated it in. */
type SortKey = 'created' | 'name' | 'type';

/** study before tutor. A written-down order rather than a localeCompare over the
 *  type string, which happens to give the same answer today and would quietly
 *  reorder the board the day a third type is registered. */
const TYPE_ORDER: Record<GuideType, number> = { study: 0, tutor: 1 };

/** What the viewer pane shows; null means the list is shown instead.
 *
 *  `path` rides along beside the href purely for the reset button: the API keys
 *  progress on the guide's absolute path, and pulling it back out of the href's
 *  encoded query would be re-deriving what the entry already states. */
interface ViewerState {
  href: string;
  title: string;
  path: string;
}

/**
 * One series shelf as the board renders it. `lessons` is the series' full
 * membership and `shown` what survived the toolbar — both are kept because they
 * answer different questions: the step badge says "2/7" from the full series
 * even when a search left one card standing (the lesson's position in its
 * series does not change because the board is filtered), and the header's
 * segmented progress strip likewise describes the whole series. Only the cards
 * and the header's count follow the filter, matching the bay-count rule below:
 * a count contradicts the screen unless it counts what is actually rendered.
 */
interface Shelf {
  key: string;
  name: string;
  lessons: SeriesLesson<GuideEntry>[];
  shown: SeriesLesson<GuideEntry>[];
}

/** One bay as the board renders it: the project it names, that project's series
 *  shelves, and its loose guides that survived the toolbar, already sorted. */
interface Bay {
  project: ProjectEntry;
  shelves: Shelf[];
  loose: GuideEntry[];
}

/**
 * Sorts one bay's guides. Onto a copy, never in place: `project.guides` belongs
 * to the fetched index, and sorting it where it lies would make the board's order
 * depend on how many times it had been re-rendered.
 *
 * `createdAt` is compared as a string rather than through Date.parse because
 * bin/register.js writes it with `toISOString()`, and the API fills a legacy
 * entry's gap from `updated`, written the same way — fixed-width UTC, where
 * lexicographic order is chronological order. That also makes an unparseable
 * value sort predictably instead of turning into NaN and leaving the comparator
 * inconsistent, which is the failure that reorders a list at random.
 */
function sortGuides(guides: GuideEntry[], sort: SortKey): GuideEntry[] {
  const out = [...guides];
  if (sort === 'name') {
    out.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'type') {
    out.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.title.localeCompare(b.title));
  } else {
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return out;
}

/**
 * Sorts one bay's shelves. Inside a shelf the lessons are always in series
 * order — that ordering is the shelf's whole reason to exist, so the sort
 * select never reaches in — but the shelves themselves still have to line up
 * against each other under whichever key the select holds. `name` compares the
 * series name; `created` (and `type`, where every shelf is uniformly tutor and
 * the key has nothing to say) puts the shelf with the newest lesson first,
 * which is the same "what you just generated floats up" promise the default
 * sort makes for loose cards.
 */
function sortShelves(shelves: Shelf[], sort: SortKey): Shelf[] {
  const out = [...shelves];
  if (sort === 'name') {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const newest = (s: Shelf) =>
      s.lessons.reduce((m, l) => (l.guide.createdAt > m ? l.guide.createdAt : m), '');
    out.sort((a, b) => newest(b).localeCompare(newest(a)) || a.name.localeCompare(b.name));
  }
  return out;
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
 * Everything the toolbar does is done here, over the fetched index: the whole
 * registry is a few dozen entries of title-and-date, so narrowing it costs a pass
 * over an array that is already in memory. A server-side filter would buy nothing
 * and would cost a round trip per keystroke — and, because it would need a new
 * route, an entry in vite.config.ts's proxy list as well.
 *
 * `.guide-viewer-head` is kept as its own element deliberately: it is the exact
 * class name a later companion panel would mount into, so its shape must stay
 * stable.
 */
export default function GuidesView() {
  const { index, loading, error, refetch } = useGuides();
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewing = viewer !== null;
  /*
    Whether the viewer's reset button is armed. Two taps, because it is a
    destructive control sitting beside the back link on a phone: the first tap
    turns it into "sure?", the second fires. Held here rather than inside a
    child so that closing the viewer disarms it — see the effect below.
  */
  const [resetArmed, setResetArmed] = useState(false);
  /*
    Bumped by a reset, and part of the frame's key, so the guide is remounted and
    reloads.

    Without it a reset is only half done: the row is gone and the board is
    repainted, but the frame on screen is still showing card twelve — the position
    the server has just forgotten. Reloading is also all that is needed to
    restart the guide, since a guide with no stored position opens at its own
    beginning; the reporter needs no instruction and there is nothing to keep in
    step.
  */
  const [resetNonce, setResetNonce] = useState(0);
  /*
    Per device, not per account: which projects you keep folded on the phone has
    nothing to do with what you want folded on the desktop board, and the phone is
    the whole reason this exists. Must sit above the early return with the other
    hooks.
  */
  const [collapsedBays, setCollapsedBays] = usePersistedState<string[]>(COLLAPSED_BAYS_KEY, []);
  /* Same persistence, one level down: which series shelves are folded shut. */
  const [foldedSeries, setFoldedSeries] = usePersistedState<string[]>(FOLDED_SERIES_KEY, []);

  /*
    The query is plain useState — the one toolbar control deliberately not
    remembered. A remembered query is a board that opens showing three cards out
    of forty for no visible reason, which reads as a broken board rather than as a
    filter still switched on. The selects survive that objection because each one
    permanently states its own value in the bar; a search box states its value too,
    but nobody reads a text field before concluding the app has lost their guides.
  */
  const [query, setQuery] = useState('');
  const [project, setProject] = usePersistedState<string>(PROJECT_KEY, ALL);
  const [type, setType] = usePersistedState<string>(TYPE_KEY, ALL);
  const [sort, setSort] = usePersistedState<SortKey>(SORT_KEY, 'created');

  /* usePersistedState hands back a plain setter, not a dispatch, so the next
     value is computed from the current one here. Safe without an updater form:
     one tap is one toggle, and there is no path that queues two of them. */
  const toggleBay = (path: string) =>
    setCollapsedBays(
      collapsedBays.includes(path)
        ? collapsedBays.filter((p) => p !== path)
        : [...collapsedBays, path]
    );

  const toggleShelf = (key: string) =>
    setFoldedSeries(
      foldedSeries.includes(key)
        ? foldedSeries.filter((k) => k !== key)
        : [...foldedSeries, key]
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

  /*
    Disarm on every change of guide, including on leaving the viewer entirely. An
    armed control that survived into the next guide would make the reader's first
    tap there reset something they never aimed at — and "armed" is a state with no
    visible cause once the guide under it has changed.
  */
  useEffect(() => {
    setResetArmed(false);
  }, [viewer?.path]);

  /*
    Coming back to the board refetches it.

    A guide reports its position as it is read, so by the time the reader taps
    back the index this view is holding is out of date — and the card they land
    on is the one that says so. The reporter's own announcement covers this too,
    but not the write it makes *as* the frame is torn down, which can land after
    that message has been handled; asking once more on the way out costs one
    request per guide read and closes the gap.

    Keyed on leaving rather than on `viewer` changing, so opening a guide does not
    fetch an index that was just fetched.
  */
  const hadViewer = useRef(false);
  useEffect(() => {
    if (viewing) {
      hadViewer.current = true;
      return;
    }
    // Only on the way *back*. Without the ref this also fires on mount, where
    // `viewing` is already false and the hook has just fetched the index — two
    // requests for the same board every time the tab is opened.
    if (!hadViewer.current) return;
    hadViewer.current = false;
    refetch();
  }, [viewing, refetch]);

  /*
    Reset one guide, then ask for the board again.

    The refetch is not optional: the card's meta line is a claim about stored
    state, so without it the board goes on reporting 62% for a guide the server
    has just forgotten. The DELETE is answered 204 with no body, so there is
    nothing to read — only a reason to re-read the index.
  */
  const resetGuide = (path: string) => {
    fetch(`/api/progress?guidePath=${encodeURIComponent(path)}`, { method: 'DELETE' })
      .then(() => {
        refetch();
        // Only after the DELETE lands. Reloading first would race it: the frame
        // would come back, report the position it still had, and re-create the
        // row the reset was meant to remove.
        setResetNonce((n) => n + 1);
      })
      // Swallowed on purpose: the reader is looking at the guide, not at a
      // bookkeeping call, and the board they return to will simply still show
      // the old number.
      .catch(() => {});
    setResetArmed(false);
  };

  if (viewer !== null) {
    return (
      <div className="guide-viewer">
        <div className="guide-viewer-head">
          <button className="guide-viewer-back" onClick={() => setViewer(null)}>‹ Guides</button>
          <span className="guide-viewer-title">{viewer.title}</span>
          {/*
            Reset belongs here rather than on the board's cards. `.guides-card` is
            a whole-card role="button" in a dense grid, so a nested destructive
            control there is one mis-tap from discarding a session on the device
            this app exists for. In the viewer there is exactly one guide it could
            mean — the one on screen.

            The label carries the confirmation rather than a dialog: a window.confirm
            inside an overlay on a phone is a second modal over a modal, and the
            two-state button says the same thing in the space it already occupies.
          */}
          <button
            type="button"
            className={`guide-viewer-reset${resetArmed ? ' armed' : ''}`}
            onClick={() => (resetArmed ? resetGuide(viewer.path) : setResetArmed(true))}
          >
            {resetArmed ? 'sure?' : '↺ reset'}
          </button>
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
          {/*
            Keyed by the guide *and* the reset counter. React would otherwise
            reuse this element across a reset — same type, same props — and the
            frame would keep showing the position the server has just forgotten.
            Changing the key remounts it, which reloads the guide, which is the
            whole of "start over": a guide with no stored position opens at its
            own beginning.
          */}
          <iframe
            key={`${viewer.href}#${resetNonce}`}
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
    The project scope is applied here rather than anywhere upstream because this
    is where the index lives and the fail-open needs it: a path remembered from a
    previous session may no longer be registered (the guide moved, the project was
    dropped), and an unmatched filter that emptied the board would look like the
    server broke. An unmatched path reads as All — and `projectValue` feeds that
    same fallback back into the select, so the control and the board agree and the
    fallback is visible rather than silent. Feeding `project` straight to the
    select would instead leave it showing a blank option, which is the one state
    that cannot be explained to the person looking at it.
  */
  const scoped = all.filter((p) => p.path === project);
  const inScope = scoped.length > 0 ? scoped : all;
  const projectValue = scoped.length > 0 ? project : ALL;

  /* Titles only, never content: the index the board holds *has* no content in it,
     and fetching every guide's body to grep it is not what a phone on a tailnet
     should be doing to answer a keystroke. */
  const needle = query.trim().toLowerCase();
  const matches = (g: GuideEntry) =>
    (type === ALL || g.type === type) &&
    (needle === '' || g.title.toLowerCase().includes(needle));

  /*
    A bay the filters emptied is dropped whole, header and all. The alternative —
    an empty bay with its header still standing — puts a row on the board for
    every project that has nothing to show, so on a board of a dozen projects a
    two-hit search returns a screenful of headers with the hits buried in it. The
    project select is the exception, and narrows the board *to* a bay rather than
    filtering inside one, so its header survives being the only match: that header
    is the one place the project's name is written on screen.
  */
  /*
    Series are split out *before* the filters run, because a shelf needs to know
    its full membership even when the toolbar hides part of it — the step badges
    and the header's progress strip describe the series, not the filter result.
    The filter then works per lesson: a shelf whose every lesson it hid drops
    whole, header included, exactly like an emptied bay and for the same reason.
  */
  const bays: Bay[] = inScope
    .map((p) => {
      const { shelves, loose } = partitionSeries(p.guides);
      const shown = shelves
        .map((s) => ({ ...s, shown: s.lessons.filter((l) => matches(l.guide)) }))
        .filter((s) => s.shown.length > 0);
      return {
        project: p,
        shelves: sortShelves(shown, sort),
        loose: sortGuides(loose.filter(matches), sort),
      };
    })
    .filter((bay) => bay.shelves.length > 0 || bay.loose.length > 0);

  return (
    <div className="guides">
      <div className="guides-bar">
        <div className="guides-title">Guides</div>
        {/*
          The controls are grouped in their own element rather than dropped into
          the bar directly, for two reasons: the bar is `align-items:baseline` for
          the sake of the title, and the four controls have to align to each other
          rather than to it — and the group is the thing that wraps to a line of
          its own on a phone, which four loose children could not do together.

          Each control is named by an aria-label rather than a visible <label>: the
          row is already four controls wide at 10px mono, and a caption over each
          would double the bar's height to say what the control's own current value
          ("All projects", "Newest first") says anyway.
        */}
        <div className="guides-tools">
          <input
            type="search"
            className="guides-search"
            aria-label="Search guides"
            placeholder="search titles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="guides-select"
            aria-label="Project"
            value={projectValue}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value={ALL}>All projects</option>
            {/* Valued by path, labelled by name — the registry's own key, so two
                checkouts of one repo stay two selectable options rather than one
                ambiguous name that would scope to whichever came first. Listed
                from `all` rather than from the bays, so narrowing to one project
                does not leave the select holding one option and no way back. */}
            {all.map((p) => (
              <option key={p.path} value={p.path}>{p.name}</option>
            ))}
          </select>
          <select
            className="guides-select"
            aria-label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value={ALL}>All types</option>
            <option value="study">study</option>
            <option value="tutor">tutor</option>
          </select>
          <select
            className="guides-select"
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="created">Newest first</option>
            <option value="name">By name</option>
            <option value="type">By type</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="guides-empty">loading…</div>
      ) : error ? (
        <div className="guides-empty">guides unavailable</div>
      ) : all.length === 0 ? (
        /*
          Two distinct empty states, because they ask the reader for two different
          things. An empty registry is fixed by registering a guide from a skill,
          somewhere else entirely; an empty *result* is fixed by clearing the
          controls two inches above the message. One shared "no guides" line would
          send the reader to the wrong place half the time — and the no-matches
          line deliberately offers nothing further, because the fix is already on
          screen and a "clear filters" button would be a second way to do what the
          selects do.
        */
        <div className="guides-empty">nothing registered yet</div>
      ) : bays.length === 0 ? (
        <div className="guides-empty">no matches</div>
      ) : (
        bays.map(({ project: p, shelves, loose }) => {
          /*
            A folded bay is forced open while a query is running. Every bay still
            on the board holds at least one match by this point — the empty ones
            were dropped above — so a non-empty query is on its own enough to open
            this one. Without it, typing a query into a board with folded bays
            looks like a search that found nothing.

            Derived at render, with `collapsedBays` left alone: the fold state is
            the user's standing preference, and a search that rewrote it would
            leave every bay it ever matched in hanging open once the query was
            cleared. Clearing the query drops each bay straight back to whatever it
            was folded to before.
          */
          const open = !collapsedBays.includes(p.path) || needle !== '';
          const shownCount = shelves.reduce((n, s) => n + s.shown.length, 0) + loose.length;

          return (
            <div className="bay" key={p.path}>
              {/*
                The header renders unconditionally: the board carries the project's
                name nowhere else, so a single-bay board without its header is a
                board that never says which project you are looking at. The previous
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
                onClick={() => toggleBay(p.path)}
              >
                <span className="bay-tick" />
                <span className="bay-name">{p.name}</span>
                {/* The count is of what the grid below actually holds, not of what
                    the project has registered: a header reading "12 guides" over a
                    filtered grid of two is a header contradicting the screen under
                    it, and the grid is the one telling the truth. */}
                <span className="bay-count">
                  {shownCount} {shownCount === 1 ? 'guide' : 'guides'}
                </span>
                <span className="bay-caret" aria-hidden="true">▾</span>
              </button>
              {/*
                Unmounted rather than hidden with CSS. A folded bay is one a phone
                should not be paying for at all — hiding the grid would keep every
                card's DOM, and a board of grown projects folds precisely because
                that DOM is the scroll wall being folded away.

                Shelves render above the loose grid: a series is the bay's most
                structured content, and interleaving its cards into the plain
                grid is exactly the unreadability the shelf exists to fix.
              */}
              {open ? (
                <>
                  {shelves.map((s) => {
                    /* Forced open by a query for the same reason a bay is: a
                       shelf still on the board holds at least one match, and a
                       fold that hid it would make the search read as empty. */
                    const shelfOpen = !foldedSeries.includes(s.key) || needle !== '';
                    return (
                      <div className={`shelf${shelfOpen ? '' : ' folded'}`} key={s.key}>
                        {/*
                          The whole header is the disclosure, like .bay-h and for
                          the same phone-sized reasons. The progress strip is
                          aria-hidden: one green cell per lesson is a glance
                          affordance, and a screen reader walking seven empty
                          spans would hear nothing the per-card meta lines don't
                          already say.
                        */}
                        <button
                          type="button"
                          className="shelf-h"
                          aria-expanded={shelfOpen}
                          onClick={() => toggleShelf(s.key)}
                        >
                          <span className="shelf-tag">series</span>
                          <span className="shelf-name">{seriesLabel(s.name)}</span>
                          {/* Counts what the grid below holds, like .bay-count. */}
                          <span className="shelf-count">
                            {s.shown.length} {s.shown.length === 1 ? 'lesson' : 'lessons'}
                          </span>
                          <span className="shelf-segs" aria-hidden="true">
                            {s.lessons.map((l) => (
                              <span className="shelf-seg" key={l.guide.path}>
                                <span
                                  className="shelf-seg-fill"
                                  style={{
                                    width: `${
                                      l.guide.progress?.completed
                                        ? 100
                                        : l.guide.progress?.furthestPercent ?? 0
                                    }%`,
                                  }}
                                />
                              </span>
                            ))}
                          </span>
                          <span className="shelf-caret" aria-hidden="true">▾</span>
                        </button>
                        {shelfOpen ? (
                          <div className="guides-grid">
                            {s.shown.map((l) => (
                              <GuideCard
                                key={l.guide.path}
                                guide={l.guide}
                                step={`${l.order}/${s.lessons.length}`}
                                onOpen={() =>
                                  setViewer({
                                    href: l.guide.href,
                                    title: l.guide.title,
                                    path: l.guide.path,
                                  })
                                }
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {loose.length > 0 ? (
                    <div className="guides-grid">
                      {loose.map((g) => (
                        <GuideCard
                          key={g.path}
                          guide={g}
                          onOpen={() => setViewer({ href: g.href, title: g.title, path: g.path })}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
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
 * The number is `furthestPercent`, never `percent`. The two disagree whenever the
 * reader has scrolled back — and a card that reported the *current* position
 * would walk the board backwards for glancing at chapter one, which is the one
 * thing a progress display must never do. Where you are is the frame's business,
 * and the frame restores it; how far you got is the board's.
 *
 * The pill and the meta line are wrapped in .guides-card-foot rather than sitting
 * on the card directly. The old layout was a two-row named-areas grid, which was
 * the right shape while cards were a single column of full-width rows — but in a
 * grid of side-by-side cards the cells stretch to the tallest card in the row, and
 * a grid row cannot be pushed to the bottom of a taller cell. One footer element
 * can: .guides-card is a flex column and the footer takes `margin-top:auto`, so
 * the meta lines of neighbouring cards align however long their titles run.
 */
function GuideCard({
  guide,
  step,
  onOpen,
}: {
  guide: GuideEntry;
  /** `N/total` for a card on a series shelf — the lesson's own filename number
   *  over the series' full size, untouched by the toolbar (see Shelf). Absent on
   *  a loose card, which renders exactly as before shelves existed. */
  step?: string;
  onOpen: () => void;
}) {
  return (
    <div className="guides-card" role="button" onClick={onOpen}>
      <div className="guides-card-title">{guide.title}</div>
      <div className="guides-card-foot">
        {/*
          The type leads the footer as a coloured pill rather than a word in the
          run of monospace text. Both types get one: a card with no pill would read
          as missing data rather than as "the plain kind". The step badge leads
          even the pill: on a shelf the first question is "which lesson is this",
          and the answer belongs where the eye lands first.
        */}
        {step ? <span className="guides-card-step">{step}</span> : null}
        <span className={`pill pill-${guide.type}`}>{guide.type}</span>
        <div className="guides-card-meta">
          {guide.updated.slice(0, 10)}
          {guide.progress?.completed ? (
            <span className="guides-card-read"> · read</span>
          ) : guide.progress ? (
            <span className="guides-card-part"> · {guide.progress.furthestPercent}%</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
