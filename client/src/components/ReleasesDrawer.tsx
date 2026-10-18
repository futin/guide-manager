import { ReleasesDrawer as KitReleasesDrawer, renderNotesHtml, useMediaQuery, type ReleasesResponse } from 'ui-kit';

import { sanitizeSnapshot } from '../lib/sanitize';

/**
 * The What's new drawer: ui-kit's `ReleasesDrawer` — its markup, scrim, ✕ and Escape — with the three things that stay guide-manager's (spec D14–D15 in
 * futin/release-kit docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md): the phone breakpoint, where focus lands on close, and a second wall
 * behind the notes renderer.
 *
 * Rendered by `AppShell`, never inside the rail: the phone menu is a `position: fixed` `.rail`, and nesting the drawer's own fixed scrim in it would tie
 * the drawer to the menu's box and its `display: none`.
 */

/** The phone breakpoint every `@media (max-width: 639px)` in styles.css writes out. ui-kit's CSS has no media queries, so the host says when it applies. */
const NARROW = '(max-width: 639px)';

/**
 * Where focus goes when the drawer closes: back where it was — normally the rail's version chip — if that element is still on screen. Under 640 px it is
 * not: tapping the chip closed the phone menu, and the menu `.rail` is `display: none` unless `.open`, so the chip is gone; the ☰ that reopens the menu
 * takes focus instead. ui-kit's default only checks `isConnected`, which a chip in a closed menu still is.
 */
function restoreTarget(prev: Element | null): HTMLElement | null {
  const narrow = typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches;
  const hidden = !prev || !prev.isConnected || (narrow && prev.closest('.rail:not(.open)') !== null);
  if (!hidden && prev instanceof HTMLElement) return prev;
  return document.querySelector<HTMLElement>('.mnav-burger');
}

/**
 * ui-kit's escape-first renderer, then `sanitizeSnapshot` — the same boundary a favorite's snapshot crosses — over its output anyway, so notes written by
 * whoever opened the PR meet this app's sanitiser too. That pass is also what rewrites every link to `target="_blank" rel="noopener"` (sanitize.ts
 * `handleAnchor`). A plain `<div>`: ui-kit already wraps whatever this returns in `.uk-releases-notes`.
 */
function renderNotes(notes: string) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeSnapshot(renderNotesHtml(notes)) }} />;
}

export function ReleasesDrawer({ data, onClose }: { data: ReleasesResponse; onClose: () => void }) {
  const narrow = useMediaQuery(NARROW);
  return <KitReleasesDrawer data={data} onClose={onClose} narrow={narrow} restoreFocus={restoreTarget} renderNotes={renderNotes} />;
}
