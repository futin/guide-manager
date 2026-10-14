import type { KeyboardEvent } from 'react';

import { shortDate } from '../../lib/dates';
import type { GuideEntry } from '../../../../shared/types';
import { ProgressBar } from '../ProgressBar';

/**
 * The props that make a board element open something: a whole tile, a Continue tile, a series row. A `role="button"` div rather than a `<button>`,
 * because each of them holds block content — a progress bar is a `<div>` — and a `<button>` may only hold phrasing content. The role alone is not a
 * button, though: it needs to be focusable and to answer Enter and Space, which is what a real one would have done for free.
 */
export function activates(onOpen: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/**
 * The number a tile prints beside its bar, rounded and held to 0–100 the way `ProgressBar` holds its fill — the two sit side by side, and a bar drawn
 * full beside a `140%` would be the board contradicting itself.
 *
 * It is `furthestPercent`, never `percent`. The two disagree whenever the reader has scrolled back, and a tile that reported the *current* position would
 * walk the board backwards for glancing at chapter one — the one thing a progress display must never do. Where you are is the frame's business, and the
 * frame restores it; how far you got is the board's.
 */
export function furthestOf(guide: GuideEntry): number {
  const p = guide.progress?.furthestPercent ?? 0;
  return Number.isFinite(p) ? Math.min(100, Math.max(0, Math.round(p))) : 0;
}

/**
 * One loose guide on the board: the type pill and the guide's `updated` date, the title, and a foot of a bar plus the percent — or the green `Read` pill
 * once the guide reports completion.
 *
 * `completed` is the only thing that earns `Read`. A guide whose furthest mark reached 100 % without the guide saying it was finished still draws its
 * bar and `100%`: the percent is a scroll or card position, and reaching the bottom of a page is not the same claim as finishing it (lib/continue.ts says
 * the same for the counts, so the tile and the band cannot disagree about which guides are read).
 *
 * The foot carries `margin-top: auto` in the stylesheet: tiles in one grid row stretch to the tallest title, and the bars line up across the row however
 * long each title runs.
 */
export function GuideTile({ guide, onOpen }: { guide: GuideEntry; onOpen: () => void }) {
  const pct = furthestOf(guide);
  return (
    <div className="card guide-tile" {...activates(onOpen)}>
      <div className="guide-tile-head">
        <span className={`pill ${guide.type}`}>{guide.type}</span>
        <span className="meta">{shortDate(guide.updated)}</span>
      </div>
      <div className="guide-tile-title">{guide.title}</div>
      <div className="guide-tile-foot">
        {guide.progress?.completed ? (
          <span className="pill read">Read</span>
        ) : (
          <>
            <ProgressBar percent={pct} />
            <span className="guide-tile-pct">{pct}%</span>
          </>
        )}
      </div>
    </div>
  );
}
