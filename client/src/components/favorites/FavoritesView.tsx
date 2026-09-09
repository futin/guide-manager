import { useState } from 'react';

import { useFavorites } from '../../hooks/useFavorites';
import { usePersistedState } from '../../hooks/usePersistedState';
import FavoriteCard from './FavoriteCard';
import type { Favorite } from '../../../../shared/types';

/**
 * The project select's persisted value. Named distinctly from GuidesView's
 * PROJECT_KEY (`guide-manager.project`) rather than sharing it: the two
 * selects answer *different* questions even though they look alike — the
 * Guides one holds a registry *path* (see GuidesView.tsx's own comment on
 * PROJECT_KEY), because two checkouts of one repo register the same project
 * name twice under two different paths. A favorite carries no path at all,
 * only the project *name* the capture blob denormalised (shared/types.ts,
 * Favorite.project) — so this select is valued and labelled by that name,
 * and sharing the guides key would mean a value written by one select (a
 * path) silently mis-scoping the other (which expects a name).
 */
const FAV_PROJECT_KEY = 'guide-manager.favProject';

/** Same "not narrowed" sentinel GuidesView uses, and the same reason: a
 *  value that always reads as itself, never as "the field was cleared". */
const ALL = 'all';

/**
 * Copy, verbatim — global-constraints.md's "Copy, verbatim" list. Held as a
 * constant rather than typed inline twice (once here, once wherever a test
 * asserts it) so the one place it could drift from the spec is a single
 * line, not a paragraph reproduced by hand in JSX.
 */
const EMPTY_COPY =
  'Nothing saved yet — open a guide and tap ☆ in its header to keep a table, a diagram or a paragraph here.';
const ERROR_COPY = "couldn't load favorites";

/** One project bay as this view renders it: the name, and the favorites that
 *  survived the toolbar, already in ascending `order`. */
interface Bay {
  project: string;
  items: Favorite[];
}

/**
 * The bay's whole id order after an ↑/↓/⤒ tap on the card at `index` — a
 * swap with the neighbour in that direction, or (for 'top') a front-insert
 * that leaves every other row's relative order alone. `items` has to be
 * this bay's own, *unfiltered* list for the same reason the reorder controls
 * only render while `reorderable` is true (see that comment below): a
 * search that narrowed the board must never let the rows still on screen be
 * written back as if the hidden ones did not exist.
 *
 * The `index === 0` / `index < ids.length - 1` guards mirror the disabled
 * state the buttons already carry (`fav-up`/`fav-top` at the front,
 * `fav-down` at the back) — defence against a direction no pointer device
 * can actually reach, not a path this function expects to take.
 */
function computeMoveIds(items: Favorite[], index: number, to: 'up' | 'down' | 'top'): string[] {
  const ids = items.map((f) => f.id);
  if (to === 'up' && index > 0) {
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
  } else if (to === 'down' && index < ids.length - 1) {
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
  } else if (to === 'top' && index > 0) {
    const [id] = ids.splice(index, 1);
    ids.unshift(id);
  }
  return ids;
}

/**
 * The bay's whole id order after dropping `sourceId` onto the card holding
 * `targetId`: the source is pulled out of its current slot and reinserted
 * at the target's own index. Returns null — never calling `reorderBay` at
 * all — when either id is not part of *this* bay's own list. `sourceId`
 * comes from `dataTransfer`, which carries no project of its own, so a drag
 * that began in a different project's bay (the only way an id foreign to
 * `items` could ever arrive here) is silently ignored rather than spliced
 * into a bay it was never part of.
 */
function computeDropIds(items: Favorite[], sourceId: string, targetId: string): string[] | null {
  const ids = items.map((f) => f.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null;
  ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, sourceId);
  return ids;
}

/**
 * Favorites section — every saved block, read via GET /api/favorites,
 * grouped by the project it was captured from. Ported in shape from
 * GuidesView (bar, toolbar, per-project bays) but simpler: there is no type
 * filter (a favorite has no `type`, only an `anchor.kind`, and the card
 * reads that directly), no sort control (order is a thing the reader sets by
 * hand — see reorderBay — not a column the toolbar recomputes), and no fold
 * state (a favorites board is at most a few dozen deliberately-kept blocks,
 * nowhere near the registry board's scale problem that folding exists to
 * solve). The bay header is therefore a plain, unfoldable `div`.
 */
export default function FavoritesView() {
  /*
    All three of this task's mutations, pulled out together: `updateFavorite`
    (the card's inline title/note edit), `reorderBay` (↑/↓/⤒ and drag-and-
    drop both funnel into it — see computeMoveIds/computeDropIds above, which
    turn a control's own gesture into the one shape the hook and the PUT
    route actually take), and `removeFavorite` (the two-tap ✕). Task 6 built
    all three against a Task 7 card that called none of them; this task is
    what wires the calls.
  */
  const { favorites, loading, error, updateFavorite, reorderBay, removeFavorite } = useFavorites();

  /* Plain state, like GuidesView's query: a remembered search that hides most
     of a short, hand-curated list on open would read as "my favorites are
     gone", which is a worse default than a board that opens showing all of
     them every time. */
  const [query, setQuery] = useState('');
  const [project, setProject] = usePersistedState<string>(FAV_PROJECT_KEY, ALL);

  const all = favorites ?? [];

  /*
    Distinct project *names*, in the order they first appear in the server's
    own response (project asc, order asc — favorites.service.ts's `all()`).
    Derived from the whole unfiltered list, exactly as GuidesView derives its
    project select from `all` rather than from the filtered bays: listing
    only the projects a search or the select itself left standing would strip
    the select down to one option with no way back to the others.
  */
  const projectNames = Array.from(new Set(all.map((f) => f.project)));

  /*
    Fail-open, mirroring GuidesView's `scoped`/`projectValue` pair: a name
    remembered from a previous session may no longer appear in the data (its
    one favorite was deleted, or this is a fresh device holding a stale key),
    and an unmatched filter that emptied the whole board would look like the
    server broke rather than like a leftover setting. An unmatched value reads
    as All, and the select is fed this same fallback so it never shows a blank
    or nonexistent option.
  */
  const projectValue = project === ALL || projectNames.includes(project) ? project : ALL;
  const inScope = projectValue === ALL ? all : all.filter((f) => f.project === projectValue);

  /*
    Search matches title, note, text (the block's own textContent) and the
    crumb trail joined back into one string — every field a reader might
    remember a saved block by, none of it the raw `html`: grepping markup
    would surface a match on stray tag names or attribute values that never
    appeared on screen.
  */
  const needle = query.trim().toLowerCase();
  const matches = (f: Favorite): boolean =>
    needle === '' ||
    f.title.toLowerCase().includes(needle) ||
    f.note.toLowerCase().includes(needle) ||
    f.text.toLowerCase().includes(needle) ||
    f.crumb.join(' ').toLowerCase().includes(needle);

  /*
    A bay the filters emptied is dropped whole, header and all — the same
    rule GuidesView applies to its own bays, and for the same reason: a board
    of headers with nothing under half of them buries the hits that did match
    rather than framing them.
  */
  const bays: Bay[] = projectNames
    .map((p) => ({ project: p, items: inScope.filter((f) => f.project === p && matches(f)) }))
    .filter((b) => b.items.length > 0);

  /*
    Drag-and-drop and the ↑/↓/⤒ buttons both reorder a bay by writing back its
    whole id list, which only makes sense over the bay's *unfiltered* order —
    a search that hid two of five cards must not let the three left on screen
    be dragged into an order that silently drops the hidden two. Simplest
    fix available at this layer: disable reordering outright while a query is
    narrowing the board. Computed here (rather than inside the card) because
    this view is what knows whether a query is active — the card only ever
    receives the resulting boolean and renders its move buttons and drag
    handle accordingly.
  */
  const reorderable = needle === '';

  return (
    <div className="guides">
      <div className="guides-bar">
        <div className="guides-title">Favorites</div>
        <div className="guides-tools">
          <input
            type="search"
            className="guides-search"
            aria-label="Search favorites"
            placeholder="search favorites"
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
            {projectNames.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="guides-empty">loading…</div>
      ) : error ? (
        <div className="guides-empty">{ERROR_COPY}</div>
      ) : all.length === 0 ? (
        <div className="guides-empty">{EMPTY_COPY}</div>
      ) : bays.length === 0 ? (
        <div className="guides-empty">no matches</div>
      ) : (
        bays.map(({ project: p, items }) => (
          <div className="bay" key={p}>
            {/* A plain div, not GuidesView's button: nothing folds here, so
                there is no disclosure for it to be. */}
            <div className="bay-h">
              <span className="bay-name">{p}</span>
              <span className="bay-count">
                {items.length} {items.length === 1 ? 'favorite' : 'favorites'}
              </span>
            </div>
            <div className="fav-list">
              {items.map((f, i) => (
                <FavoriteCard
                  key={f.id}
                  favorite={f}
                  index={i}
                  count={items.length}
                  reorderable={reorderable}
                  onPatch={(patch) => updateFavorite(f.id, patch)}
                  onMove={(to) => reorderBay(computeMoveIds(items, i, to))}
                  onRemove={() => removeFavorite(f.id)}
                  onDropOn={(sourceId) => {
                    const ids = computeDropIds(items, sourceId, f.id);
                    // null means the drag started in a different bay —
                    // see computeDropIds's own docblock. Nothing to write
                    // back in that case, so reorderBay is never called.
                    if (ids) reorderBay(ids);
                  }}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
