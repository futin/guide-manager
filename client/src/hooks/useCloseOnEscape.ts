import { useEffect } from 'react';

/**
 * Closes the caller on a real Escape keypress.
 *
 * Ported verbatim in behaviour from ../ixray/apps/web/src/useCloseOnEscape.ts.
 * Escape-only on purpose: no focus trap, no move-focus-in on open, no
 * return-focus-to-trigger on close. Those are separate concerns and this hook
 * should not grow into them — a drawer that stole focus would also have to give
 * it back correctly on every close path, and there are four of them here
 * (Escape, outside press, the X, and picking a row).
 */
export function useCloseOnEscape(onClose: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}
