import { shortDate } from '../../lib/dates';
import type { GuideEntry } from '../../../../shared/types';
import { ProgressBar } from '../ProgressBar';
import { activates, furthestOf } from './GuideTile';

interface Props {
  /** Already chosen and ordered — `continueReading` in lib/continue.ts. This component draws what it is handed and decides nothing about which. */
  guides: GuideEntry[];
  /** Where a guide sits in its series (`lessonPosition`), or null for a loose one. A callback rather than a precomputed map, because the caller holds
   *  the projects and knows which one's guides make up the shelf. */
  lessonOf: (path: string) => { label: string; n: number; m: number } | null;
  onOpen: (guide: GuideEntry) => void;
}

/**
 * The Continue reading row: the guides you were in the middle of, last opened first, at most four (spec §3.3). It answers "where was I", so a lesson
 * shown here carries its place in the series — `Mongo internals · 2 of 3` — which its shelf would have said by position and a lone tile cannot.
 *
 * The date is `progress.lastOpenedAt`, not the guide's `updated` that every other tile shows: this row is ordered by when you last read, so that is the
 * date that explains the order.
 *
 * Draws nothing at all when there is nothing to continue, heading included — an empty row under a heading reads as a load that failed.
 */
export function ContinueReading({ guides, lessonOf, onOpen }: Props) {
  if (guides.length === 0) return null;
  return (
    <section className="continue">
      <h2 className="sec-h">
        Continue reading <span className="meta">last opened first</span>
      </h2>
      <div className="continue-grid">
        {guides.map((g) => {
          const lesson = lessonOf(g.path);
          const date = shortDate(g.progress?.lastOpenedAt ?? '');
          const pct = furthestOf(g);
          return (
            <div key={g.path} className="card continue-tile" {...activates(() => onOpen(g))}>
              <div className="continue-head">
                <span className={`pill ${g.type}`}>{g.type}</span>
                <span className="meta continue-meta">
                  {lesson ? `${lesson.label} · ${lesson.n} of ${lesson.m} · ${date}` : date}
                </span>
              </div>
              <div className="continue-title">{g.title}</div>
              <div className="continue-pct">{pct}%</div>
              <ProgressBar percent={pct} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
