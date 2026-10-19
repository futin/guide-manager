import { ReleasesDrawer as KitReleasesDrawer, useMediaQuery, type ReleasesResponse } from 'ui-kit';

import { PHONE } from '../lib/breakpoints';
import { sanitizeSnapshot } from '../lib/sanitize';

/**
 * The What's new drawer: ui-kit's `ReleasesDrawer` — its markup, scrim, ✕ and Escape — with the things that stay guide-manager's (spec D14–D15 in
 * futin/release-kit docs/superpowers/specs/2026-10-18-shared-releases-ui-design.md): the phone breakpoint, where focus lands on close, and a second wall
 * behind the notes renderer (`sanitize`).
 *
 * Rendered by `AppShell`, never inside the rail: the phone menu is a `position: fixed` `.rail`, and nesting the drawer's own fixed scrim in it would tie
 * the drawer to the menu's box and its `display: none`.
 */

/**
 * Where focus goes when the drawer closes: back where it was — normally the rail's version chip — if that element is still on screen. Under 640 px it is
 * not: tapping the chip closed the phone menu, and the menu `.rail` is `display: none` unless `.open`, so the chip is gone; the ☰ that reopens the menu
 * takes focus instead. ui-kit's default only checks `isConnected`, which a chip in a closed menu still is.
 */
function restoreTarget(prev: Element | null): HTMLElement | null {
  const narrow = typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;
  const hidden = !prev || !prev.isConnected || (narrow && prev.closest('.rail:not(.open)') !== null);
  if (!hidden && prev instanceof HTMLElement) return prev;
  return document.querySelector<HTMLElement>('.mnav-burger');
}

export function ReleasesDrawer({ data, onClose }: { data: ReleasesResponse; onClose: () => void }) {
  const narrow = useMediaQuery(PHONE);
  // `sanitize` runs `sanitizeSnapshot` — the same boundary a favorite's snapshot crosses — over ui-kit's escape-first renderer's output, so notes written by
  // whoever opened the PR meet this app's sanitiser too. That pass is also what rewrites every link to `target="_blank" rel="noopener"` (sanitize.ts
  // `handleAnchor`), and it must leave the headings, lists, code, emphasis and links the notes renderer emits standing (test/releases-ui.test.tsx).
  return <KitReleasesDrawer data={data} onClose={onClose} narrow={narrow} restoreFocus={restoreTarget} sanitize={sanitizeSnapshot} />;
}
