import type { Favorite, GuidesIndex } from '../../../shared/types';

/**
 * The rail's sub-nav trees: one row per scope the rail can narrow a section to, derived from the two indexes the app already fetches — no route and no
 * API of their own (spec §2, "Data for the rail").
 *
 * The two sections key their scope differently on purpose, because each keeps the storage key it already had and nothing is migrated:
 * `guide-manager.project` holds a project *path*, `guide-manager.favProject` a project *name*. A path is what tells two registered projects apart, so
 * Guides gets one row per path even when two projects share a name; a favorite carries only the denormalised name, so Favorites cannot do better than
 * one row per name.
 */

/** The "every project" scope. Both storage keys already hold this exact string, so it is a value on disk, not just a sentinel in code. */
export const ALL = 'all';

export interface RailRow {
  label: string;
  /** What the rail writes to the section's storage key when the row is picked: a project path for Guides, a name for Favorites, or `ALL`. */
  scope: string;
  count: number;
}

const ALL_LABEL = 'All projects';

/**
 * `All projects` with every guide counted, then each project in the index's own order. A project with no guides keeps its row at 0: it is registered,
 * and a row that vanished would read as the project having been dropped.
 */
export function guideTree(index: GuidesIndex): RailRow[] {
  const rows = index.projects.map((p) => ({ label: p.name, scope: p.path, count: p.guides.length }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return [{ label: ALL_LABEL, scope: ALL, count: total }, ...rows];
}

/**
 * `All projects` with every favorite counted, then one row per project name that has something saved. Unlike `guideTree`, an empty project gets no
 * row — there is nothing to narrow to.
 *
 * Order follows the Guides index wherever it can, so the two trees list shared projects in the same sequence. A name the index does not know (a
 * project since unregistered, or the index still loading or failed) still has favorites that must stay reachable, so it follows, in the order the
 * favorites first mention it.
 */
export function favoriteTree(favorites: Favorite[], index: GuidesIndex | null): RailRow[] {
  const counts = new Map<string, number>();
  for (const f of favorites) counts.set(f.project, (counts.get(f.project) ?? 0) + 1);

  // A Set dedupes the index's names, so two projects sharing a name make one row — the first occurrence fixes its place.
  const known = new Set((index?.projects ?? []).map((p) => p.name).filter((name) => counts.has(name)));
  // Map iteration is insertion order, which is first-seen order in `favorites`.
  const unknown = [...counts.keys()].filter((name) => !known.has(name));

  const rows = [...known, ...unknown].map((name) => ({ label: name, scope: name, count: counts.get(name)! }));
  return [{ label: ALL_LABEL, scope: ALL, count: favorites.length }, ...rows];
}

/**
 * The scope to render for a stored value: itself when a row names it, otherwise `ALL`. Fail-open, and read-only by design — a stored scope the data
 * does not name (a project moved, or the data not loaded yet) shows every project but stays in storage, so it comes back if the project does. Only
 * the rail writes the scope keys, and only when a row is picked.
 */
export function resolveScope(rows: RailRow[] | null, stored: string): string {
  return rows?.some((r) => r.scope === stored) ? stored : ALL;
}
