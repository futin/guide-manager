/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useFavorites } from '../client/src/hooks/useFavorites';
import type { Favorite } from '../shared/types';

/**
 * Two rows, same project — grouping and search are FavoritesView's job
 * (covered in test/favorites-view.test.tsx); this file only exercises the
 * hook's own contract: the three mutations' request shape, their optimistic
 * local update, and the refetch-on-failure fallback FavoritesView.test.tsx
 * has no way to reach (FavoriteCard renders no controls until Task 8, so
 * nothing in that suite ever calls updateFavorite/reorderBay/removeFavorite).
 */
const FAV_A: Favorite = {
  id: 'a1',
  project: 'p',
  guideTitle: 'G',
  guidePath: '/g/a.html',
  order: 0,
  title: 'Old A',
  crumb: [],
  html: '<p>a</p>',
  text: 'a',
  note: 'note A',
  anchor: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z'
};
const FAV_B: Favorite = {
  id: 'a2',
  project: 'p',
  guideTitle: 'G',
  guidePath: '/g/b.html',
  order: 1,
  title: 'Old B',
  crumb: [],
  html: '<p>b</p>',
  text: 'b',
  note: '',
  anchor: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z'
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/**
 * `getResponses` is consumed one array per GET call, in order (the last
 * entry repeats once exhausted) — so a test can hand the mount fetch one
 * payload and a refetch triggered by a mutation's failure a *different* one,
 * which is what proves the hook actually re-asked the server rather than
 * quietly keeping its own optimistic guess. Every non-GET call's outcome is
 * controlled by `setMutation`, defaulting to a success response — most tests
 * only care about the request shape and the local update, not the fallback.
 */
function setupFetch(getResponses: Favorite[][]) {
  const calls: Call[] = [];
  let getIndex = 0;
  let mutation: 'ok' | 'fail' | 'reject' = 'ok';

  (globalThis as { fetch?: unknown }).fetch = jest.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET') as string;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (method === 'GET') {
      const payload = getResponses[Math.min(getIndex, getResponses.length - 1)];
      getIndex += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }
    if (mutation === 'reject') return Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: mutation === 'ok', json: () => Promise.resolve({}) });
  });

  return {
    calls,
    setMutation: (m: 'ok' | 'fail' | 'reject') => {
      mutation = m;
    }
  };
}

const getCalls = (calls: Call[]) => calls.filter((c) => c.method === 'GET');

/*
  Final whole-branch review, Important (I3): neither the mount fetch nor
  refetch checked `res.ok` before treating the response body as the
  Favorite[] array. Nest answers a server error with a *valid* JSON body
  (e.g. `{"statusCode":500,"message":"..."}`), so that promise resolves and
  the error object itself got stored as `favorites` — no exception here, in
  the hook, but FavoritesView's `all.map(...)` then throws during render
  reading `.map` off a plain object, and with no error boundary anywhere in
  client/src that blanks the *whole* SPA, not just the Favorites tab. The
  neighbouring useGuides/GuidesView path degrades instead (an empty board),
  which is the behaviour these two tests hold useFavorites to as well: a
  not-ok GET must produce `error: true` and must never let the response body
  overwrite `favorites` with something that isn't the array it claims to be.
*/
describe('useFavorites — GET failure handling', () => {
  it('does not store the raw error body as favorites when the mount GET answers not-ok', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ statusCode: 500, message: 'boom' })
      })
    );
    const { result } = renderHook(() => useFavorites());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    // Not the error object — the hook's contract is Favorite[] | null.
    expect(result.current.favorites).toBeNull();
  });

  it('discards the previous good list only in appearance, never in fact: a not-ok refetch flags error and leaves favorites alone rather than overwriting it with the error body', async () => {
    let ok = true;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(() =>
      Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? [FAV_A] : { statusCode: 500, message: 'boom' })
      })
    );
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.favorites).toEqual([FAV_A]));

    ok = false;
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.error).toBe(true));
    // The last known-good array survives — it must never be replaced by
    // the {statusCode, message} body a failed refetch resolved with.
    expect(result.current.favorites).toEqual([FAV_A]);
  });
});

describe('useFavorites — mutations', () => {
  describe('updateFavorite', () => {
    it('applies the patch locally at once and sends the exact PATCH the server expects', async () => {
      const { calls } = setupFetch([[FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());

      act(() => {
        result.current.updateFavorite('a1', { title: 'New title', note: 'new note' });
      });

      // Applied before the request has had any chance to resolve — the whole
      // point of the optimistic update.
      expect(result.current.favorites?.find((f) => f.id === 'a1')).toMatchObject({
        title: 'New title',
        note: 'new note'
      });
      // The sibling row is untouched by a patch aimed at a1.
      expect(result.current.favorites?.find((f) => f.id === 'a2')?.title).toBe('Old B');

      await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch?.url).toBe('/api/favorites/a1');
      expect(patch?.body).toEqual({ title: 'New title', note: 'new note' });

      // ok:true needs no follow-up: only the one mount GET, ever.
      expect(getCalls(calls)).toHaveLength(1);
    });

    it('discards the optimistic guess and re-fetches when the server answers not-ok', async () => {
      const { calls, setMutation } = setupFetch([[FAV_A, FAV_B], [FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());
      setMutation('fail');

      act(() => {
        result.current.updateFavorite('a1', { title: 'Rejected title' });
      });
      expect(result.current.favorites?.find((f) => f.id === 'a1')?.title).toBe('Rejected title');

      await waitFor(() => expect(getCalls(calls)).toHaveLength(2));
      await waitFor(() =>
        expect(result.current.favorites?.find((f) => f.id === 'a1')?.title).toBe('Old A')
      );
    });

    it('discards the optimistic guess and re-fetches when the request itself rejects', async () => {
      const { calls, setMutation } = setupFetch([[FAV_A, FAV_B], [FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());
      setMutation('reject');

      act(() => {
        result.current.updateFavorite('a1', { title: 'Offline title' });
      });
      expect(result.current.favorites?.find((f) => f.id === 'a1')?.title).toBe('Offline title');

      await waitFor(() => expect(getCalls(calls)).toHaveLength(2));
      await waitFor(() =>
        expect(result.current.favorites?.find((f) => f.id === 'a1')?.title).toBe('Old A')
      );
    });
  });

  describe('reorderBay', () => {
    it('applies the new order locally at once and sends the exact PUT the server expects', async () => {
      const { calls } = setupFetch([[FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());

      act(() => {
        result.current.reorderBay(['a2', 'a1']);
      });

      expect(result.current.favorites?.find((f) => f.id === 'a2')?.order).toBe(0);
      expect(result.current.favorites?.find((f) => f.id === 'a1')?.order).toBe(1);

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      const put = calls.find((c) => c.method === 'PUT');
      expect(put?.url).toBe('/api/favorites/order');
      expect(put?.body).toEqual({ ids: ['a2', 'a1'] });

      expect(getCalls(calls)).toHaveLength(1);
    });

    it('re-fetches (and the order reverts) when the server answers not-ok', async () => {
      const { calls, setMutation } = setupFetch([[FAV_A, FAV_B], [FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());
      setMutation('fail');

      act(() => {
        result.current.reorderBay(['a2', 'a1']);
      });
      expect(result.current.favorites?.find((f) => f.id === 'a2')?.order).toBe(0);

      await waitFor(() => expect(getCalls(calls)).toHaveLength(2));
      await waitFor(() =>
        expect(result.current.favorites?.find((f) => f.id === 'a1')?.order).toBe(0)
      );
    });

    it('re-fetches (and the order reverts) when the request itself rejects', async () => {
      const { calls, setMutation } = setupFetch([[FAV_A, FAV_B], [FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());
      setMutation('reject');

      act(() => {
        result.current.reorderBay(['a2', 'a1']);
      });
      expect(result.current.favorites?.find((f) => f.id === 'a2')?.order).toBe(0);

      await waitFor(() => expect(getCalls(calls)).toHaveLength(2));
      await waitFor(() =>
        expect(result.current.favorites?.find((f) => f.id === 'a1')?.order).toBe(0)
      );
    });
  });

  describe('removeFavorite', () => {
    it('removes the row locally at once and sends the exact DELETE the server expects', async () => {
      const { calls } = setupFetch([[FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());

      act(() => {
        result.current.removeFavorite('a1');
      });

      expect(result.current.favorites?.map((f) => f.id)).toEqual(['a2']);

      await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
      const del = calls.find((c) => c.method === 'DELETE');
      expect(del?.url).toBe('/api/favorites/a1');

      expect(getCalls(calls)).toHaveLength(1);
    });

    it('re-fetches (and the row reappears) when the server answers not-ok', async () => {
      const { calls, setMutation } = setupFetch([[FAV_A, FAV_B], [FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());
      setMutation('fail');

      act(() => {
        result.current.removeFavorite('a1');
      });
      expect(result.current.favorites?.map((f) => f.id)).toEqual(['a2']);

      await waitFor(() => expect(getCalls(calls)).toHaveLength(2));
      await waitFor(() =>
        expect(result.current.favorites?.map((f) => f.id)).toEqual(['a1', 'a2'])
      );
    });

    it('re-fetches (and the row reappears) when the request itself rejects', async () => {
      const { calls, setMutation } = setupFetch([[FAV_A, FAV_B], [FAV_A, FAV_B]]);
      const { result } = renderHook(() => useFavorites());
      await waitFor(() => expect(result.current.favorites).not.toBeNull());
      setMutation('reject');

      act(() => {
        result.current.removeFavorite('a1');
      });
      expect(result.current.favorites?.map((f) => f.id)).toEqual(['a2']);

      await waitFor(() => expect(getCalls(calls)).toHaveLength(2));
      await waitFor(() =>
        expect(result.current.favorites?.map((f) => f.id)).toEqual(['a1', 'a2'])
      );
    });
  });
});
