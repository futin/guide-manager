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
 * hold a series named `basics` — and `name` is that directory's basename, the
 * same string the derivation matches filenames against. The header prints
 * `seriesLabel(name)`, not `name` itself (see below).
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

/**
 * The shelf header's display form of a series name: `write-paths` → `Write
 * paths`.
 *
 * Kept separate from `SeriesGroup.name` rather than replacing it, because the
 * two are not the same value wearing different clothes. `name` is derived from
 * the directory and is what the derivation matches the filename prefix
 * against — prettifying it in place would mean the rule that decides
 * membership and the string a reader sees could drift apart, and the first
 * symptom would be a series that silently stops grouping. So the raw basename
 * stays the identity and this is a pure render-time transform, called at the
 * one place the name is printed.
 *
 * Sentence case, not Title Case: a series slug is a phrase, not a heading, and
 * `Write Paths` reads like a product name while `Write paths` reads like the
 * subject it is. Only the first character is touched for the same reason —
 * upper-casing every word would turn `pending-vs-plans` into `Pending Vs
 * Plans`, capitalising a word no English sentence capitalises. Interior
 * capitals a slug already carries are left exactly as they are: a directory
 * named `spawn-ts` is the author's spelling of it, and this function is not the
 * place to have opinions about the rest.
 */
export function seriesLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}
