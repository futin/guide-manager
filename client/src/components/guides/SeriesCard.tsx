import { isStarted } from '../../lib/continue';
import { shortDate } from '../../lib/dates';
import { seriesLabel } from '../../lib/series';
import type { SeriesLesson } from '../../lib/series';
import type { GuideEntry } from '../../../../shared/types';
import { IconChevronDown } from '../icons';
import { ProgressBar, SegmentedBar } from '../ProgressBar';
import { activates, furthestOf } from './GuideTile';

/**
 * One series as the board draws it. `lessons` is the series' full membership and `shown` what survived the toolbar — both are kept because they answer
 * different questions: the numbered dot says lesson 2 even when a search left one row standing (a lesson's place in its series does not change because
 * the board is filtered), and the subtitle and the segmented bar likewise describe the whole series. Only the rows follow the filter.
 */
export interface SeriesGroupView {
  key: string;
  name: string;
  lessons: SeriesLesson<GuideEntry>[];
  shown: SeriesLesson<GuideEntry>[];
}

interface Props {
  group: SeriesGroupView;
  /** Whether the rows are hidden *right now* — the caller has already forced it open while a query runs, so this is not the stored fold. */
  folded: boolean;
  onFold: () => void;
  onOpen: (guide: GuideEntry) => void;
}

/** A completed lesson counts as a full segment and a full row even if its furthest mark stopped short: the guide said it was finished, and a sheet
 *  showing 80 % beside a green dot would be two claims about one lesson. */
function lessonPercent(g: GuideEntry): number {
  return g.progress?.completed ? 100 : furthestOf(g);
}

/**
 * A series sheet: the label and a `Series · N lessons · M started` subtitle, a fold chevron, one bar segment per lesson, then the lessons as numbered rows.
 *
 * *Started* is `isStarted` — moved past the start, or finished. A lesson opened and left at 0 % is not started: `openCount` says the page loaded, not that
 * anything was read.
 *
 * Folding hides the rows and keeps the title and the segmented bar — the bar is the sheet's whole summary, so a folded series still says how far along it
 * is. The rows are unmounted rather than hidden, so a long folded series costs nothing to keep on the board. The chevron, not the whole header, is the
 * disclosure: the header holds the title a reader may want to select, and a real `<button>` carries `aria-expanded` to assistive tech.
 */
export function SeriesCard({ group, folded, onFold, onOpen }: Props) {
  const label = seriesLabel(group.name);
  const total = group.lessons.length;
  const started = group.lessons.filter((l) => isStarted(l.guide)).length;
  return (
    <section className={`card series-sheet${folded ? ' folded' : ''}`}>
      <div className="series-head">
        <div className="series-heading">
          <h3 className="series-title">{label}</h3>
          <p className="meta series-sub">
            Series · {total} {total === 1 ? 'lesson' : 'lessons'} · {started} started
          </p>
        </div>
        <button
          type="button"
          className="key series-fold"
          aria-expanded={!folded}
          aria-label={`Fold ${label}`}
          onClick={onFold}
        >
          <IconChevronDown size={16} />
        </button>
      </div>
      <SegmentedBar percents={group.lessons.map((l) => lessonPercent(l.guide))} />
      {folded ? null : (
        <ol className="series-rows">
          {group.shown.map((l) => {
            const g = l.guide;
            const pct = lessonPercent(g);
            /* Position in the series as the board holds it, not the N in the filename: a gap in the numbering (1, 3, 4) must still number the second
               row 2, or the dot and Continue reading's `2 of 3` (lessonPosition) would disagree about the same lesson. */
            const n = group.lessons.indexOf(l) + 1;
            return (
              <li key={g.path}>
                <div className="series-row" {...activates(() => onOpen(g))}>
                  <span className={`series-dot${g.progress?.completed ? ' done' : ''}`}>{n}</span>
                  <span className="series-row-text">
                    <span className="series-row-title">{g.title}</span>
                    <span className="meta">
                      {g.type} · {shortDate(g.updated)}
                    </span>
                  </span>
                  <span className="series-row-bar">
                    <ProgressBar percent={pct} />
                  </span>
                  <span className="series-row-pct">{pct}%</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
