import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReleasesResponse } from '../../../shared/types';

/**
 * useReleases — `GET /api/releases`, the shell's one read of this checkout's release tags, for the rail's version chip and the What's new drawer
 * (docs/superpowers/specs/2026-10-17-release-versioning-design.md).
 *
 * Read on mount and on `refresh()` — which the shell calls as the drawer opens — and never on a timer. A version changes only when the server's checkout
 * moves, which means a merge, a pull and (for a new tag) nothing else, so a poll would be requests spent asking a question whose answer cannot change
 * under an open tab often enough to matter.
 *
 * A failed read, or one whose body is not the releases shape (a stale server without the route answers the SPA's `index.html`), keeps whatever the last
 * good read gave — `null` before one — so a blip never takes the chip away. The route itself never answers an error status.
 */
export function useReleases(): { data: ReleasesResponse | null; refresh: () => void } {
  const [data, setData] = useState<ReleasesResponse | null>(null);
  // This client has no shared mounted-ref hook; a late answer after unmount is simply dropped.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    fetch('/api/releases')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (mounted.current && isReleasesResponse(body)) setData(body);
      })
      .catch(() => {
        /* keep the previous answer */
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, refresh };
}

export function isReleasesResponse(v: unknown): v is ReleasesResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as { current?: unknown; releases?: unknown };
  if (!Array.isArray(r.releases)) return false;
  if (r.current === null) return true;
  const c = r.current as { version?: unknown; ahead?: unknown } | undefined;
  return typeof c === 'object' && c !== null && typeof c.version === 'string' && typeof c.ahead === 'number';
}
