import type { GuideEntry } from '../../../shared/types';

/**
 * Reading-state predicates the board, the Continue reading row and the series
 * sheets all share, so "in progress", "started" and "read" mean one thing on
 * every surface that counts them.
 *
 * `completed` is the only thing that makes a guide *read*. A guide whose
 * furthest mark reached 100 % without the guide reporting completion is still
 * in progress — the percent is a scroll or card position, and reaching the
 * bottom of a page is not the same claim as finishing it.
 */

/** Opened, moved past the start, not finished. */
export function isInProgress(g: GuideEntry): boolean {
  return g.progress !== null && g.progress.furthestPercent > 0 && !g.progress.completed;
}

/**
 * Moved past the start, or finished. Opening a guide and leaving it at 0 %
 * does not count — `openCount` says the page loaded, not that anything was
 * read. A completed guide counts even at 0 %, since completion is the stronger
 * statement.
 */
export function isStarted(g: GuideEntry): boolean {
  return !!g.progress && (g.progress.furthestPercent > 0 || g.progress.completed);
}

export function boardCounts(guides: GuideEntry[]): {
  total: number;
  inProgress: number;
  read: number;
} {
  return {
    total: guides.length,
    inProgress: guides.filter(isInProgress).length,
    read: guides.filter((g) => !!g.progress?.completed).length,
  };
}

/**
 * The Continue reading row: in-progress guides, last opened first, ties broken
 * by title so equal stamps do not reorder with fetch order, capped at `limit`.
 *
 * `lastOpenedAt` is parsed once per guide, not per comparison. One that does
 * not parse sorts as the oldest — a bad stamp must neither throw nor put its
 * guide at the front of a row that answers "where was I".
 */
export function continueReading(guides: GuideEntry[], limit: number): GuideEntry[] {
  return guides
    .filter(isInProgress)
    .map((g) => {
      const t = Date.parse(g.progress?.lastOpenedAt ?? '');
      return { g, t: Number.isNaN(t) ? -Infinity : t };
    })
    .sort((a, b) => {
      if (a.t !== b.t) return a.t < b.t ? 1 : -1;
      return a.g.title.localeCompare(b.g.title);
    })
    .slice(0, limit)
    .map(({ g }) => g);
}
