import { useEffect, useRef, type ReactNode } from 'react';

import { IconClose } from '../icons';

/** The phone breakpoint every `@media (max-width: 639px)` in styles.css writes out. */
const NARROW = '(max-width: 639px)';

/**
 * Where focus goes when the drawer closes: back where it was — normally the rail's version chip — if that element is still on screen. Under 640 px it is
 * not: tapping the chip closed the phone menu, and the menu `.rail` is `display: none` unless `.open`, so the chip is gone; the ☰ that reopens the menu
 * takes focus instead. This is guide-manager's addition — backlog-manager's drawer moves no focus.
 */
function restoreTarget(prev: Element | null): HTMLElement | null {
  const narrow = typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches;
  const hidden = !prev || !prev.isConnected || (narrow && prev.closest('.rail:not(.open)') !== null);
  if (!hidden && prev instanceof HTMLElement) return prev;
  return document.querySelector<HTMLElement>('.mnav-burger');
}

/**
 * Drawer — the shell's one overlay: a scrim, and a 400 px panel against the window's right edge, full height; full screen under 640 px (CSS only). Ported
 * from backlog-manager's `components/ui/Drawer.tsx`, the one surface it serves here being the What's new drawer.
 *
 * It owns the scrim, the ✕ and the Escape key; the composer owns everything inside, its heading included, and `label` is the dialog's accessible name. The
 * panel stops a click's propagation instead of the scrim being a sibling underneath it: a scrim that wraps the panel is one element, so no layout can leave
 * a strip of page between the two where a click would land on neither. It is the only dialog in the app, so the Escape listener needs no stack.
 */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreTarget(prev)?.focus();
    };
  }, []);

  return (
    <div className="ui-drawer-scrim" onClick={onClose}>
      <aside
        ref={panel}
        className="ui-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ui-drawer-close" aria-label="Close" onClick={onClose}>
          <IconClose size={18} />
        </button>
        {children}
      </aside>
    </div>
  );
}
