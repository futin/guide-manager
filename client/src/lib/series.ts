/**
 * Series membership, derived from the guide's path and never stored.
 *
 * The tutor skill's convention (skills/tutor/SKILL.md, "Lesson series") puts a
 * series' decks in one directory named after the series, each file named
 * `<series>-N-<desc>.html`. That makes the path itself the whole record: the
 * registry, register.js and the API stay untouched, a series assembled by hand
 * (or by an older skill run, moved into shape) groups exactly like a generated
 * one, and there is no second copy of the membership to drift out of step with
 * where the files actually sit.
 *
 * The rule is deliberately two-sided: the filename must start with the parent
 * directory's own name, then `-N-`. Either half alone misfires — every deck has
 * *some* parent directory, and plenty of ordinary filenames contain `-2-`
 * (`docs/foo-2-bar.html` is not lesson 2 of anything). Requiring the dir name
 * as the filename's prefix is what keeps a lone hyphenated file from being
 * dressed up as a one-lesson series of a directory it merely lives in.
 *
 * `N` is the suggested reading order only. Nothing here gates on it, and a gap
 * in the numbering (1, 3, 4 — lesson 2 unregistered or filtered away) is not an
 * error: the shelf simply renders what the registry knows, in ascending order.
 *
 * A future "track" layer (series of series, one more directory level —
 * `docs/guides/tutor/<track>/1-<series>/…`) would extend the depth rule here
 * and nowhere else; keep any such change inside this file.
 */

/** One lesson as a shelf holds it: the guide plus the N its filename claims. */
export interface SeriesLesson<T> {
  guide: T;
  order: number;
}

/**
 * One series as the board groups it. `key` is the series directory's absolute
 * path — unique even when two projects (or two subtrees of one project) both
 * hold a series named `basics` — and `name` is that directory's basename, which
 * is what the shelf header prints.
 */
export interface SeriesGroup<T> {
  key: string;
  name: string;
  lessons: SeriesLesson<T>[];
}

/** Regex-escape a directory name before it is spliced into a pattern — series
 *  slugs are kebab-case by convention, but the rule must not break (or, worse,
 *  widen) on a directory that happens to contain a metacharacter. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The derivation itself: `<dir>/<dir>-N-<desc>.html` → `{ dir, name, order }`,
 * anything else → null. Registry paths are absolute POSIX paths (the host is
 * this Mac; bin/register.js stores them verbatim), so '/' is the only separator
 * to care about.
 */
export function seriesOf(
  path: string
): { dir: string; name: string; order: number } | null {
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return null;
  const file = path.slice(slash + 1);
  const dir = path.slice(0, slash);
  const name = dir.slice(dir.lastIndexOf('/') + 1);
  if (!name) return null;
  // `.+` before the extension: a bare `<series>-N-.html` has no description and
  // does not count. Extension matches the same `.html?` register.js accepts.
  const m = new RegExp(`^${escapeRegExp(name)}-(\\d+)-.+\\.html?$`, 'i').exec(file);
  if (!m) return null;
  return { dir, name, order: parseInt(m[1], 10) };
}

/**
 * Partition one bay's guides into series shelves and loose cards.
 *
 * Shelves keep every lesson sorted by N ascending (path as the tiebreak, so two
 * lessons that claim the same N still render in a stable order instead of
 * flickering with fetch order). A directory that yields only one matching
 * lesson still becomes a shelf of 1: the file has announced itself as part of a
 * series, and hiding that until a sibling shows up would make the board's shape
 * depend on registration order. Revisit only if real boards make it noisy.
 */
export function partitionSeries<T extends { path: string }>(
  guides: T[]
): { shelves: SeriesGroup<T>[]; loose: T[] } {
  const byDir = new Map<string, SeriesGroup<T>>();
  const loose: T[] = [];
  for (const g of guides) {
    const s = seriesOf(g.path);
    if (!s) {
      loose.push(g);
      continue;
    }
    let group = byDir.get(s.dir);
    if (!group) {
      group = { key: s.dir, name: s.name, lessons: [] };
      byDir.set(s.dir, group);
    }
    group.lessons.push({ guide: g, order: s.order });
  }
  const shelves = [...byDir.values()];
  for (const shelf of shelves) {
    shelf.lessons.sort(
      (a, b) => a.order - b.order || a.guide.path.localeCompare(b.guide.path)
    );
  }
  return { shelves, loose };
}
