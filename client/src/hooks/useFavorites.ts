import { useCallback, useEffect, useState } from 'react';

import type { Favorite } from '../../../shared/types';

/**
 * Favorites data hook. Mirrors useGuides.ts's shape and reasoning — one fetch
 * per mount, no polling, `refetch` as the one exception — but the reasoning
 * for *why no polling* is different here, and worth restating rather than
 * copying: a guide appears because a skill publishes one, somewhere the tab
 * cannot see happen; a favorite is created *inside the frame this tab itself
 * put on screen*, by an explicit tap on ☆ and Save. There is no window in
 * which a favorite could appear behind this tab's back the way a new guide
 * can — and the one path that would need a live update, coming back from the
 * viewer with a freshly-saved favorite, is a full tab switch away, which is
 * itself a remount. So a single fetch on mount is not a shortcut here; it is
 * already the complete answer.
 *
 * That is also why, unlike useGuides, there is NO `message` listener. The
 * guides board listens because a framed guide's progress write happens behind
 * the board's back and has to be announced. A favorite's save happens in the
 * same tab that is about to remount into this view — nothing needs to shout
 * across a frame boundary for a change that only takes effect once the reader
 * has already left and come back.
 */
export interface FavoritesState {
  favorites: Favorite[] | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
  /** Rename or re-annotate one favorite. Applies the patch to local state
   *  immediately — the reader is editing a field on screen and should see
   *  their own keystrokes land without waiting on a round trip — then sends
   *  it, and only falls back to `refetch()` (the source of truth) when the
   *  write did not actually happen. */
  updateFavorite: (id: string, patch: { title?: string; note?: string }) => void;
  /** Rewrite one project bay's whole order in one call — the same shape
   *  PUT /api/favorites/order takes, so ↑/↓/⤒/drag all funnel through here. */
  reorderBay: (ids: string[]) => void;
  /** Delete one favorite. */
  removeFavorite: (id: string) => void;
}

type FetchState = Omit<FavoritesState, 'refetch' | 'updateFavorite' | 'reorderBay' | 'removeFavorite'>;

export function useFavorites(): FavoritesState {
  const [state, setState] = useState<FetchState>({
    favorites: null,
    loading: true,
    error: false
  });

  /*
    Not guarded by an alive flag, exactly like useGuides.refetch: this is
    caused by the user (a mutation below, or a caller of the hook), and its
    result is the state they are waiting to see.
  */
  /*
    Final whole-branch review, Important (I3): a `res.ok` check, added here.
    Nest answers a server error with a *valid* JSON body (e.g.
    `{"statusCode":500,"message":"..."}`), so with no check the fetch's
    promise chain resolved normally and stored that error object as
    `favorites` — wrong-shaped data the type (`Favorite[] | null`) only
    promised, never enforced. FavoritesView's `all.map(...)` then threw
    reading `.map` off a plain object, and with no error boundary anywhere in
    client/src that took down the *whole* SPA on every render, not just this
    tab.

    This is NOT the same fix useGuides.ts relies on — useGuides has no
    `res.ok` check either (its fetch chains are otherwise identical to this
    hook's own, pre-fix shape) and would store the same kind of error object
    in `index` given the same 500. It survives only because GuidesView reads
    `index?.projects ?? []`: optional chaining on a field the error object
    genuinely lacks, so it quietly resolves to `undefined` and the `?? []`
    catches it. `favorites ?? []` in FavoritesView cannot lean on that same
    trick, because `??` only substitutes for `null`/`undefined` — a truthy-
    but-wrong-shaped error object sails straight through it and reaches
    `all.map` regardless. So this hook fails the fetch explicitly instead:
    throwing on a not-ok response routes it into the `.catch` below, which
    sets `error: true` and leaves `favorites` at whatever it already was,
    rather than depend on a downstream `?? []` that would not actually save
    this particular shape of view.
  */
  const refetch = useCallback(() => {
    fetch('/api/favorites')
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/favorites: ${res.status}`);
        return res.json() as Promise<Favorite[]>;
      })
      .then((favorites) => setState({ favorites, loading: false, error: false }))
      .catch(() => setState((prev) => ({ favorites: prev.favorites, loading: false, error: true })));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/favorites')
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/favorites: ${res.status}`);
        return res.json() as Promise<Favorite[]>;
      })
      .then((favorites) => {
        if (alive) setState({ favorites, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState((prev) => ({ favorites: prev.favorites, loading: false, error: true }));
      });
    return () => {
      alive = false;
    };
  }, []);

  /*
    All three mutations below share one shape: apply the change to local
    state first (so the card the reader is looking at updates immediately),
    fire the request, and — only if the server disagreed (a non-ok response)
    or the request never landed at all (a rejected fetch) — fall back to
    `refetch()`, which throws the optimistic guess away and re-asks the
    server for the truth. A response that resolves `ok` needs no follow-up:
    the local guess and the server's new state are the same edit, so refetching
    would just be a round trip to confirm what is already on screen.
  */
  const updateFavorite = useCallback(
    (id: string, patch: { title?: string; note?: string }) => {
      setState((prev) => ({
        ...prev,
        favorites: prev.favorites?.map((f) => (f.id === id ? { ...f, ...patch } : f)) ?? prev.favorites
      }));
      fetch(`/api/favorites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
        .then((res) => {
          if (!res.ok) refetch();
        })
        .catch(refetch);
    },
    [refetch]
  );

  /*
    `ids` is the bay's entire new order, front to back — PUT /api/favorites/order
    takes exactly this shape and assigns order = the id's index in the list, so
    the local guess mirrors that assignment rather than reinventing it.

    Assigning the new `order` number is not, on its own, enough to make the
    change visible: FavoritesView renders a bay in this hook's own array
    order (there is no client-side sort by `order` — the server is trusted
    to have sent the list sorted, project asc/order asc, and nothing since
    has had a reason to re-sort it), so a card's position on screen would
    stay put even after its `order` field changed underneath it. The local
    update below therefore also *moves* each reordered id to the slot its
    new position implies — collected from the array's own current layout
    (`slots`, in ascending order) rather than assumed, so a card belonging to
    some other project's bay is never touched even though `ids` only ever
    names one bay at a time.
  */
  const reorderBay = useCallback(
    (ids: string[]) => {
      setState((prev) => {
        if (!prev.favorites) return prev;
        const orderOf = new Map(ids.map((id, order) => [id, order]));
        const slots: number[] = [];
        prev.favorites.forEach((f, i) => {
          if (orderOf.has(f.id)) slots.push(i);
        });
        const reordered = ids
          .map((id) => prev.favorites?.find((f) => f.id === id))
          .filter((f): f is Favorite => f !== undefined)
          .map((f) => ({ ...f, order: orderOf.get(f.id) as number }));
        const favorites = [...prev.favorites];
        slots.forEach((slot, i) => {
          favorites[slot] = reordered[i];
        });
        return { ...prev, favorites };
      });
      fetch('/api/favorites/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
        .then((res) => {
          if (!res.ok) refetch();
        })
        .catch(refetch);
    },
    [refetch]
  );

  const removeFavorite = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        favorites: prev.favorites?.filter((f) => f.id !== id) ?? prev.favorites
      }));
      fetch(`/api/favorites/${id}`, { method: 'DELETE' })
        .then((res) => {
          if (!res.ok) refetch();
        })
        .catch(refetch);
    },
    [refetch]
  );

  return { ...state, refetch, updateFavorite, reorderBay, removeFavorite };
}
