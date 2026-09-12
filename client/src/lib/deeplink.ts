import type { GuidePosition } from '../../../shared/types';

/**
 * The app's one deep link: "open this guide, at this position".
 *
 * It exists because a favorite's crumb used to link straight at `GET /guide`,
 * which navigates the browser away from the SPA and onto the server's own page
 * shell. That shell is built to be framed — `body.deck-host main` drops its
 * `max-width` entirely (server/public/style.css) because the thing constraining
 * it is meant to be the app's `.wrap.wide` around the iframe. Opened at the top
 * level there is nothing constraining it, so the guide came up full-bleed, with
 * no side rail, no `‹ Guides` back and no `↺ reset` — a different page from the
 * one the same guide gets when it is opened off the board.
 *
 * So the crumb now points at the app instead, and the app opens its ordinary
 * viewer. One guide, one viewer, one set of chrome.
 *
 * Writer (FavoriteCard) and readers (App, GuidesView) all go through this file
 * rather than each spelling the query out, because a deep link is only ever
 * correct if both ends agree on it — and the failure mode of disagreeing is
 * silent: an unrecognised param is simply a board that opens on the board.
 */

/** The guide's absolute path — the same key the registry, progress and
 *  `/guide?p=` all use. */
export const OPEN_PARAM = 'open';
/**
 * The anchor, as the JSON of a `GuidePosition`. Deliberately the same name the
 * render routes already use for the same payload: this value is forwarded to
 * `/guide` verbatim, and a second name for one thing is how the two ends drift.
 */
export const AT_PARAM = 'at';

export interface GuideDeeplink {
  path: string;
  /**
   * The raw, still-encoded-once anchor JSON, kept as a string rather than
   * parsed. Nothing on this side acts on the anchor — only `/asset`'s
   * `parseJump` does — so parsing here would buy a validation this layer has no
   * way to respond to, and would need re-serialising to be passed on anyway.
   * Null when the favorite had no addressable anchor at capture.
   */
  at: string | null;
}

/**
 * The href a favorite's crumb carries. Still a real `<a href>` rather than a
 * button so cmd/middle-click opens the guide in a new tab, which is the one
 * thing the old link-to-`/guide` version was genuinely good at.
 */
export function deeplinkHref(guidePath: string, anchor: GuidePosition | null): string {
  const base = `/?${OPEN_PARAM}=${encodeURIComponent(guidePath)}`;
  return anchor ? `${base}&${AT_PARAM}=${encodeURIComponent(JSON.stringify(anchor))}` : base;
}

/** Reads a deep link off a query string, or null if there is none. Takes the
 *  search string rather than reading `window.location` itself, so both callers
 *  and the suite can hand it one. */
export function readDeeplink(search: string): GuideDeeplink | null {
  const params = new URLSearchParams(search);
  const path = params.get(OPEN_PARAM);
  // An `open=` with no value is not a link to anything; treated as absent
  // rather than as a request to open a guide with an empty path, which would
  // only ever miss the index and fall back to the board one step later.
  if (!path) return null;
  return { path, at: params.get(AT_PARAM) };
}

/**
 * The viewer src for a deep-linked guide: the entry's *own* `href` with the
 * anchor appended, never a `/guide?p=` rebuilt here. The server already
 * resolved and encoded that path (guides.controller.ts) and re-deriving it on
 * this side is exactly how the two would drift — the same reason GuidesView
 * frames `g.href` rather than building one from `g.path`.
 *
 * `&` rather than `?` because that href always carries `p=` already.
 */
export function viewerHref(entryHref: string, at: string | null): string {
  return at ? `${entryHref}&${AT_PARAM}=${encodeURIComponent(at)}` : entryHref;
}

/**
 * Drops the deep link from the address bar once it has been acted on, without
 * adding a history entry.
 *
 * Consumed rather than kept, because the link describes an *arrival*, not the
 * page's current state: the viewer can be closed, another guide opened from the
 * board, the rail switched to Settings — and a URL still saying `?open=` through
 * all of that would re-open that first guide on the next reload, which reads as
 * the app refusing to let go. Only our own two params are removed, so anything
 * else on the query string survives.
 */
export function clearDeeplink(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(OPEN_PARAM);
  url.searchParams.delete(AT_PARAM);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
