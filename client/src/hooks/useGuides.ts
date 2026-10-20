import { useCallback, useEffect, useState } from 'react';

import type { GuidesIndex } from '../../../shared/types';

/**
 * Guides data hook. No polling and no refresh key: a guide appears when a skill
 * publishes one — on the order of days, not seconds — so one fetch per mount is
 * enough, and reloading the page (a fresh mount — the hook lives in AppShell, so switching section is not one) or bringing the tab back into view is
 * how you pick up a new one.
 *
 * `refetch` is the one exception, and it is not polling: it exists because this
 * app now *writes* to the data it renders. Resetting a guide's progress makes
 * the card's meta line a claim about state the server has just discarded, so the
 * caller that issued the reset asks for the board again. One code path serves
 * both — the mount effect calls the same function — so the two cannot drift.
 *
 * Two events call it on their own, and neither is polling: a framed guide's
 * progress announcement, which reaches only the tab doing the reading, and the
 * tab coming back into view, which covers every other tab and device — a board
 * left open elsewhere, or a phone restoring the app after the guide was read on
 * the desktop. Both are in the effect at the bottom of this hook.
 */
export interface GuidesState {
  index: GuidesIndex | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

export function useGuides(): GuidesState {
  const [state, setState] = useState<Omit<GuidesState, 'refetch'>>({
    index: null,
    loading: true,
    error: false
  });

  /*
    Not guarded by an alive flag the way the mount effect's fetch is: a refetch is
    caused by the user, and its result is the state they are waiting to see. The
    mount effect below keeps its own guard, because there a component unmounted
    mid-flight would otherwise set state on nothing.
  */
  const refetch = useCallback(() => {
    fetch('/api/guides')
      .then((res) => res.json() as Promise<GuidesIndex>)
      .then((index) => setState({ index, loading: false, error: false }))
      .catch(() => setState((prev) => ({ index: prev.index, loading: false, error: true })));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/guides')
      .then((res) => res.json() as Promise<GuidesIndex>)
      .then((index) => {
        if (alive) setState({ index, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState((prev) => ({ index: prev.index, loading: false, error: true }));
      });
    return () => {
      alive = false;
    };
  }, []);

  /*
    A framed guide announces every write it makes (assets/progress.js), and this
    is what listens. Without it the board is a snapshot of the moment the tab
    loaded: read a guide, come back, and the card still claims the percent it had
    then — correct only after a page refresh, which is exactly the bug this fixes.

    Coalesced, because walking a deck writes on every card and each write would
    otherwise cost a fetch of the whole index for a board nobody is looking at.
    The delay is longer than the reporter's own deck debounce, so a run of taps
    settles into one refetch.

    The message is only trusted for its shape, and it carries no data — it is a
    "something changed" tap on the shoulder, and the answer comes from the API.
    Any script in any frame can post to the top window, so a message that named a
    percent would be a message that could lie about one.

    The message only ever reaches the reading tab's own top window. A board open
    in another tab, or on another device over the tailnet, never hears it and
    kept its mount-time percent until a reload (backlog #35) — so the tab coming
    back into view refetches too, through the same timer, so a return that lands
    beside a reporter message still costs one fetch. `visibilitychange`, not
    window `focus`: it fires when a phone restores the tab or a desktop tab is
    switched to, and not each time focus moves between the app and its own
    iframe, which focus/blur would do on every tap into the guide.
  */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(refetch, 300);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; kind?: string } | null;
      if (!data || data.source !== 'guide-manager' || data.kind !== 'progress') return;
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== null) clearTimeout(timer);
    };
  }, [refetch]);

  return { ...state, refetch };
}
