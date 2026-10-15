import { useEffect, useRef, useState } from 'react';

import type { GuidesState } from '../../hooks/useGuides';
import { usePersistedState } from '../../hooks/usePersistedState';
import { clearDeeplink, readDeeplink, viewerHref } from '../../lib/deeplink';
import { boardCounts, continueReading } from '../../lib/continue';
import { ALL } from '../../lib/rail';
import { lessonPosition, partitionSeries } from '../../lib/series';
import type { GuideEntry, GuideType, ProjectEntry } from '../../../../shared/types';
import { ContinueReading } from './ContinueReading';
import { furthestOf, GuideTile } from './GuideTile';
import { SeriesCard } from './SeriesCard';
import type { SeriesGroupView } from './SeriesCard';
import { ViewerHeader } from './ViewerHeader';

/**
 * Folded series sheets, stored as the set of keys currently folded shut. Keyed by
 * the series *directory's* absolute path (a SeriesGroup's `key`), which is unique
 * even when two projects both hold a series named `basics`, and self-cleaning —
 * a stored key whose series no longer renders simply never matches a sheet, so
 * there is no pruning pass. Stored as the folded set rather than the open one so a
 * series registered after this was written arrives open, which is the useful
 * default: a series you have not seen yet should not appear pre-folded.
 *
 * The per-project fold (`guide-manager.collapsedBays`) that used to sit beside
 * this is gone, not migrated: narrowing to one project is the rail's job now. The
 * key is left in storage, unread.
 */
const FOLDED_SERIES_KEY = 'guide-manager.foldedSeries';

/**
 * The type switch and the sort select, remembered per device. The project scope is not
 * here: it is a rail destination now (SideRail), stored by AppShell and handed
 * in as the `scope` prop. The search box is not here either, on purpose — see
 * the plain useState below.
 *
 * The type switch's "not narrowed" value is the rail's ALL sentinel: a sentinel
 * rather than an empty string, so a stored value always reads as itself and
 * never as "the field was cleared".
 */
const TYPE_KEY = 'guide-manager.filterType';
const SORT_KEY = 'guide-manager.sort';

/** Sort keys, in the order the select offers them. `created` leads because it is
 *  the default: the board's job is to put the guide you generated ten minutes ago
 *  at the top of the project you generated it in. */
type SortKey = 'created' | 'name' | 'type';

/** study before tutor. A written-down order rather than a localeCompare over the
 *  type string, which happens to give the same answer today and would quietly
 *  reorder the board the day a third type is registered. */
const TYPE_ORDER: Record<GuideType, number> = { study: 0, tutor: 1 };

/** What the viewer pane shows; null means the list is shown instead.
 *
 *  `path` rides along beside the href for the reset button and the header: the API keys
 *  progress on the guide's absolute path, and the header finds the guide's crumb and
 *  pill in the current index by it. Pulling it back out of the href's encoded query
 *  would be re-deriving what the entry already states. `title` is kept as the header's
 *  fallback for an index that no longer names the path. */
interface ViewerState {
  href: string;
  title: string;
  path: string;
}

/** The index comes from AppShell, which fetches it once for the rail's counts as well as for this board; `scope` is the rail's resolved pick — ALL or
 *  a registry project path. */
interface Props {
  guides: GuidesState;
  scope: string;
}

/** One project as the board draws it: the project, its series sheets and its loose guides that survived the toolbar, already sorted. */
interface ProjectBoard {
  project: ProjectEntry;
  shelves: SeriesGroupView[];
  loose: GuideEntry[];
}

/** `N guides · M in progress · K read` — the band's line over the scope, and each project's under its name on an unscoped board. */
function countLine(guides: GuideEntry[]): string {
  const c = boardCounts(guides);
  return `${c.total} ${c.total === 1 ? 'guide' : 'guides'} · ${c.inProgress} in progress · ${c.read} read`;
}

/** The type switch's options, in the order it draws them. Sentence case here; the pills on the tiles stay lowercase — they are tags, not labels. */
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'All' },
  { value: 'study', label: 'Study' },
  { value: 'tutor', label: 'Tutor' },
];

/**
 * Sorts one project's loose guides. Onto a copy, never in place: `project.guides` belongs
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
 * Sorts one project's series sheets. Inside a sheet the lessons are always in series
 * order — that ordering is the sheet's whole reason to exist, so the sort
 * select never reaches in — but the sheets themselves still have to line up
 * against each other under whichever key the select holds. `name` compares the
 * series name; `created` (and `type`, where every sheet is uniformly tutor and
 * the key has nothing to say) puts the sheet with the newest lesson first,
 * which is the same "what you just generated floats up" promise the default
 * sort makes for loose tiles.
 */
function sortShelves(shelves: SeriesGroupView[], sort: SortKey): SeriesGroupView[] {
  const out = [...shelves];
  if (sort === 'name') {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const newest = (s: SeriesGroupView) =>
      s.lessons.reduce((m, l) => (l.guide.createdAt > m ? l.guide.createdAt : m), '');
    out.sort((a, b) => newest(b).localeCompare(newest(a)) || a.name.localeCompare(b.name));
  }
  return out;
}

/**
 * Guides section — every guide registered in ~/.guide-manager/registry.json,
 * read via GET /api/guides. Read-only and unpolled. Top to bottom (spec §3): the
 * band, the toolbar, Continue reading, then each project's series sheets and loose
 * tiles. The state lives here; ContinueReading, SeriesCard and GuideTile only draw.
 *
 * Ported from ../claude-agents-dashboard/client/src/components/guides/GuidesView.tsx.
 * Two changes: the fixed Decks / Study-guides pair becomes per-project sections,
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
 * `.guide-viewer-head` (drawn by ViewerHeader) is kept as its own element
 * deliberately: it is the exact class name a later companion panel would mount
 * into, so its shape must stay stable.
 */
export default function GuidesView({ guides, scope }: Props) {
  const { index, loading, error, refetch } = guides;
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewing = viewer !== null;
  /*
    A deep link waiting to be turned into a viewer — see lib/deeplink.ts for what
    it is and why a favorite's crumb produces one.

    It cannot open the viewer directly, because a ViewerState needs the guide's
    *title* and the link only carries its path; the title lives in the index,
    which is still in flight on the render this state is initialised on. So the
    link is parked here and the effect below opens it the moment the index lands.
    Read in the initializer rather than in that effect so it is captured exactly
    once, before anything can clear the query string underneath it.
  */
  const [pendingOpen, setPendingOpen] = useState(() => readDeeplink(window.location.search));
  /*
    Whether the viewer's reset button is armed. Two taps, because it is a
    destructive control sitting beside the back link on a phone: the first tap
    turns it into "Start over?", the second fires. Held here rather than inside a
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
    Per device, not per account: which series you keep folded on the phone has
    nothing to do with what you want folded on the desktop board. Must sit above
    the early return with the other hooks.
  */
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
  const [type, setType] = usePersistedState<string>(TYPE_KEY, ALL);
  const [sort, setSort] = usePersistedState<SortKey>(SORT_KEY, 'created');

  /* usePersistedState hands back a plain setter, not a dispatch, so the next
     value is computed from the current one here. Safe without an updater form:
     one tap is one toggle, and there is no path that queues two of them. */
  const toggleShelf = (key: string) =>
    setFoldedSeries(
      foldedSeries.includes(key)
        ? foldedSeries.filter((k) => k !== key)
        : [...foldedSeries, key]
    );

  /*
    Phone only in effect (the CSS rule lives inside the max-width:639px
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
    Turn a parked deep link into an open viewer, once the index is here to say
    what the guide is called.

    The lookup is over the *whole* index, never the toolbar's filtered board: a
    remembered project scope or a leftover type filter has nothing to do with
    which guide a favorite points at, and a link that silently did nothing
    because the board happened to be narrowed would be unexplainable from the
    screen. For the same reason nothing here touches the toolbar — the reader is
    going straight into a guide, and the board they eventually come back to
    should be the one they left — scope included, which is why the stored scope
    is never touched on the way in.

    A path the index does not know is dropped to the board rather than surfaced
    as an error, matching how a moved guide behaves everywhere else in this app:
    the registry's allowlist hides it, and the favorite that outlived it is a
    snapshot, which still reads fine on its card.

    The link is consumed either way — cleared from state *and* from the address
    bar — so this runs exactly once per arrival and a later reload lands on the
    board.
  */
  useEffect(() => {
    if (!pendingOpen || !index) return;
    const entry = index.projects.flatMap((p) => p.guides).find((g) => g.path === pendingOpen.path);
    setPendingOpen(null);
    clearDeeplink();
    if (entry) {
      setViewer({
        href: viewerHref(entry.href, pendingOpen.at),
        title: entry.title,
        path: entry.path
      });
    }
  }, [pendingOpen, index]);

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
    Hover fills are muted while the board moves under a still pointer.

    Scrolling does not move the pointer, but the browser re-hit-tests after every
    scroll step, so whichever row slides under a resting cursor takes the
    `--strip-hi` fill for a frame or two and drops it again — the highlight walks
    down the list and reads as rows changing colour at random. `scrolling` on the
    board switches the fill off until scrolling has been quiet for 150 ms; the CSS
    gates every board hover on `:not(.scrolling)`.

    One capturing listener on `document` rather than one per scroller: `scroll`
    does not bubble, but it does pass through the capture phase, so this hears the
    page (below 1280 px the window scrolls) and `.board` (above it the board is
    its own scroller) alike. The class is toggled on the element directly, not
    through state — a re-render of the whole board on every scroll event would
    cost far more than the flicker it removes. The ref is read at event time, so
    the board unmounting under the viewer and coming back needs no re-subscribe.
  */
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      boardRef.current?.classList.add('scrolling');
      clearTimeout(settle);
      settle = setTimeout(() => boardRef.current?.classList.remove('scrolling'), 150);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(settle);
    };
  }, []);

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
    /*
      The crumb and the pill are read out of the *current* index by the open path, not frozen into ViewerState at open time: a framed guide's own
      progress announcement refetches the index while it is open, and the header should say what the board would. When a refetch no longer names the
      path (the guide was moved or unregistered mid-read) the viewer stays open on what it was already showing — the frame is still the frame — and the
      crumb falls back to the title alone, the one thing ViewerState still knows.
    */
    const owner = index?.projects.find((p) => p.guides.some((g) => g.path === viewer.path));
    const current = owner?.guides.find((g) => g.path === viewer.path);
    const lesson = owner ? lessonPosition(owner.guides, viewer.path) : null;
    const crumb = !owner
      ? viewer.title
      : lesson
        ? `${owner.name} · ${lesson.label} · ${lesson.n} of ${lesson.m}`
        : owner.name;
    return (
      <div className="guide-viewer">
        <ViewerHeader
          crumb={crumb}
          title={current?.title ?? viewer.title}
          furthest={current ? furthestOf(current) : 0}
          completed={current?.progress?.completed ?? false}
          onBack={() => setViewer(null)}
          onReset={() => (resetArmed ? resetGuide(viewer.path) : setResetArmed(true))}
          armed={resetArmed}
        />
        <div className="guide-viewer-body">
          {/*
            No `sandbox` attribute: this iframe is same-origin — our own server,
            serving our own guides, on purpose. Scripts are what make the framed
            page work at all. A generated tutor deck starts every `.card` at
            `display:none` and only `.card.active` shows one, so Back/Next, the
            arrow-key shortcuts and the quiz's click-to-reveal are entirely
            script-driven; block scripts and the deck freezes on its first card
            forever. The same is true of the three scripts the server injects
            into a registered guide — the reading aid, the progress reporter and
            the favorites capture script, whose star mounts into this shell's
            own crumbs line. There is no untrusted content here to isolate, so
            do not add a `sandbox` back without re-testing the pager, the quiz,
            bionic reading and the favorites star against it.
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
    `scope` arrives already resolved (AppShell, lib/rail.ts resolveScope): a path
    the index no longer names has been turned into ALL upstream, where the rail
    can mark the same fallback the board shows. The `find` here is the same
    fail-open once more, so a board rendered with an unresolved path still shows
    every project — and names itself `All projects` — rather than nothing.
  */
  const scoped = scope === ALL ? undefined : all.find((p) => p.path === scope);
  const inScope = scoped ? [scoped] : all;
  const scopeGuides = inScope.flatMap((p) => p.guides);

  /* Titles only, never content: the index the board holds *has* no content in it,
     and fetching every guide's body to grep it is not what a phone on a tailnet
     should be doing to answer a keystroke. */
  const needle = query.trim().toLowerCase();
  const matchesQuery = (g: GuideEntry) => needle === '' || g.title.toLowerCase().includes(needle);
  const matches = (g: GuideEntry) => (type === ALL || g.type === type) && matchesQuery(g);

  /*
    The switch's counts are over the scope and ignore the query: they say what each
    option would show, not what the query left — a `Study 0` that only meant "no
    study guide has 'deck' in its title" would read as a project with no study
    guides at all.
  */
  const typeCount = (value: string) => scopeGuides.filter((g) => value === ALL || g.type === value).length;

  /*
    Continue reading answers "where was I", not the query: while the search box or
    the switch is narrowing the board it is hidden rather than filtered, because a
    row of the in-progress guides that happen to match "deck" answers neither
    question. Across the whole scope — on an unscoped board, once, above every
    project.
  */
  const filtering = needle !== '' || type !== ALL;
  const continuing = filtering ? [] : continueReading(scopeGuides, 4);
  /* A lesson's place is counted within its own project's shelf — the shelf the
     board draws it on. */
  const lessonOf = (path: string) => {
    const owner = inScope.find((p) => p.guides.some((g) => g.path === path));
    return owner ? lessonPosition(owner.guides, path) : null;
  };
  const open = (g: GuideEntry) => setViewer({ href: g.href, title: g.title, path: g.path });

  /*
    A project the filters emptied is dropped whole, heading and all. The
    alternative — an empty section with its heading still standing — puts a row on
    the board for every project that has nothing to show, so on a board of a dozen
    projects a two-hit search returns a screenful of headings with the hits buried
    in it.

    Series are split out *before* the filters run, because a sheet needs to know
    its full membership even when the toolbar hides part of it — the numbered dots,
    the subtitle and the segmented bar describe the series, not the filter result.
    The filter then works per lesson: a sheet whose every lesson it hid drops
    whole, title included, exactly like an emptied project and for the same reason.
  */
  const boards: ProjectBoard[] = inScope
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
    .filter((b) => b.shelves.length > 0 || b.loose.length > 0);

  /* One project's series and loose tiles, under a heading each with its count. A
     heading over nothing is not drawn — a project with no series has no Series. */
  const sections = ({ shelves, loose }: ProjectBoard) => (
    <>
      {shelves.length > 0 ? (
        <section className="board-sec">
          <h2 className="sec-h board-sec-h">
            Series <span className="meta">{shelves.length}</span>
          </h2>
          <div className="series-grid">
            {shelves.map((s) => (
              <SeriesCard
                key={s.key}
                group={s}
                /* Forced open while a query runs: a sheet still on the board
                   holds at least one match, and a fold that hid it would make
                   the search read as empty. Derived at render with the stored
                   fold left alone — a search that rewrote it would leave every
                   series it ever matched hanging open once the query cleared. */
                folded={foldedSeries.includes(s.key) && needle === ''}
                onFold={() => toggleShelf(s.key)}
                onOpen={open}
              />
            ))}
          </div>
        </section>
      ) : null}
      {loose.length > 0 ? (
        <section className="board-sec">
          <h2 className="sec-h board-sec-h">
            Guides <span className="meta">{loose.length}</span>
          </h2>
          <div className="tile-grid">
            {loose.map((g) => (
              <GuideTile key={g.path} guide={g} onOpen={() => open(g)} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <div className="board" ref={boardRef}>
      {/* A band on the ground, not a card: it names the page and says what the
          scope holds, over the scope before any filter — the counts below the
          toolbar's switch are the ones that answer to the filters. */}
      <header className="band board-band">
        <h1>
          Guides <span className="band-sep">·</span> {scoped ? scoped.name : 'All projects'}
        </h1>
        {index ? <p>{countLine(scopeGuides)}</p> : null}
      </header>

      {/*
        Each control is named by an aria-label rather than a visible <label>: a
        caption over each would double the bar's height to say what the control's
        own current value ("All", "Newest first") says anyway. There is no project
        select: the project scope is a rail destination.
      */}
      <div className="toolbar board-toolbar">
        <input
          type="search"
          className="input board-search"
          aria-label="Search guides"
          placeholder="Search titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="seg board-type" role="group" aria-label="Type">
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={type === o.value ? 'on' : undefined}
              aria-pressed={type === o.value}
              onClick={() => setType(o.value)}
            >
              {o.label} <span className="seg-count">{typeCount(o.value)}</span>
            </button>
          ))}
        </div>
        <select
          className="select board-sort"
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="created">Newest first</option>
          <option value="name">By name</option>
          <option value="type">By type</option>
        </select>
      </div>

      {loading ? (
        <div className="empty-line">Loading…</div>
      ) : error ? (
        <div className="empty-line">Guides unavailable</div>
      ) : all.length === 0 ? (
        /*
          Two distinct empty states, because they ask the reader for two different
          things. An empty registry is fixed by registering a guide from a skill,
          somewhere else entirely; an empty *result* is fixed by clearing the
          controls two inches above the message. One shared "no guides" line would
          send the reader to the wrong place half the time — and the no-matches
          line deliberately offers nothing further, because the fix is already on
          screen and a "clear filters" button would be a second way to do what the
          toolbar does.
        */
        <div className="empty-line">Nothing registered yet</div>
      ) : boards.length === 0 ? (
        <div className="empty-line">No matches</div>
      ) : (
        <>
          <ContinueReading guides={continuing} lessonOf={lessonOf} onOpen={open} />
          {scoped
            ? sections(boards[0])
            : boards.map((b) => (
                /* Unscoped, each project is drawn under its own name with its own
                   counts — over the whole project, like the band's, not over what
                   the filters left. The heading renders whatever the filters
                   leave of the section: it is the one place the board says which
                   project a tile belongs to. */
                <section className="board-project" key={b.project.path}>
                  <div className="board-project-h">
                    <h2 className="board-project-name">{b.project.name}</h2>
                    <p className="meta board-project-meta">{countLine(b.project.guides)}</p>
                  </div>
                  {sections(b)}
                </section>
              ))}
        </>
      )}
    </div>
  );
}
