import { useCallback, useEffect, useState } from 'react';

import type { GuidesIndex } from '../../../shared/types';

/**
 * Guides data hook. No polling and no refresh key: a guide appears when a skill
 * publishes one — on the order of days, not seconds — so one fetch per mount is
 * enough, and reopening the tab (a fresh mount) is how you pick up a new one.
 *
 * `refetch` is the one exception, and it is not polling: it exists because this
 * app now *writes* to the data it renders. Resetting a guide's progress makes
 * the card's meta line a claim about state the server has just discarded, so the
 * caller that issued the reset asks for the board again. One code path serves
 * both — the mount effect calls the same function — so the two cannot drift.
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

  return { ...state, refetch };
}
