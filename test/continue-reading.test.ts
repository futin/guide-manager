import {
  boardCounts,
  continueReading,
  isInProgress,
  isStarted,
} from '../client/src/lib/continue';
import type { GuideEntry, GuideProgress } from '../shared/types';

/** A guide with only the fields these helpers read set meaningfully. `null`
 *  progress is a guide never opened. */
function guide(
  title: string,
  progress: Partial<GuideProgress> | null
): GuideEntry {
  const path = `/p/${title.toLowerCase()}.html`;
  return {
    path,
    title,
    type: 'study',
    updated: '2026-09-01T12:00:00Z',
    createdAt: '2026-09-01T12:00:00Z',
    href: `/guide?path=${encodeURIComponent(path)}`,
    progress:
      progress === null
        ? null
        : {
            guidePath: path,
            percent: 0,
            furthestPercent: 0,
            position: null,
            completed: false,
            lastOpenedAt: '2026-09-01T12:00:00Z',
            openCount: 1,
            ...progress,
          },
  };
}

const A = guide('A', { furthestPercent: 40, lastOpenedAt: '2026-10-12T12:00:00Z' });
const B = guide('B', { furthestPercent: 0, openCount: 3 });
const C = guide('C', { furthestPercent: 100, completed: true });
const D = guide('D', null);
const E = guide('E', { furthestPercent: 10, lastOpenedAt: '2026-10-13T12:00:00Z' });
// Review Focus 5: reached the end but never marked completed — still in progress.
const F = guide('F', { furthestPercent: 100, lastOpenedAt: '2026-10-01T12:00:00Z' });

describe('continueReading', () => {
  it('keeps started, unfinished guides, newest first', () => {
    expect(continueReading([A, B, C, D, E, F], 4)).toEqual([E, A, F]);
  });

  it('breaks a lastOpenedAt tie by title', () => {
    const at = '2026-10-10T12:00:00Z';
    const beta = guide('Beta', { furthestPercent: 20, lastOpenedAt: at });
    const alpha = guide('Alpha', { furthestPercent: 20, lastOpenedAt: at });
    expect(continueReading([beta, alpha], 4)).toEqual([alpha, beta]);
  });

  it('caps at the limit, keeping the newest', () => {
    const six = [1, 2, 3, 4, 5, 6].map((d) =>
      guide(`G${d}`, { furthestPercent: 50, lastOpenedAt: `2026-10-0${d}T12:00:00Z` })
    );
    expect(continueReading(six, 4)).toEqual([six[5], six[4], six[3], six[2]]);
  });

  it('returns [] for an empty index', () => {
    expect(continueReading([], 4)).toEqual([]);
  });

  /* Review Focus 1: a bad date must neither throw nor jump the queue. */
  it('sorts an unparsable lastOpenedAt after every valid date', () => {
    const garbage = guide('Garbage', { furthestPercent: 30, lastOpenedAt: 'garbage' });
    expect(continueReading([garbage, A], 4)).toEqual([A, garbage]);
  });
});

describe('boardCounts', () => {
  it('counts in-progress (100 % uncompleted included) and read guides', () => {
    expect(boardCounts([A, B, C, D, E, F])).toEqual({ total: 6, inProgress: 3, read: 1 });
  });
});

describe('isInProgress', () => {
  it('is true only for started, uncompleted guides', () => {
    expect([A, B, C, D, E, F].map(isInProgress)).toEqual([true, false, false, false, true, true]);
  });
});

describe('isStarted', () => {
  it('ignores a guide opened and left at 0 %', () => {
    expect(isStarted(B)).toBe(false);
  });

  it('counts a completed guide even at 0 %', () => {
    expect(isStarted(guide('Z', { furthestPercent: 0, completed: true }))).toBe(true);
  });

  it('counts a guide with furthest progress', () => {
    expect(isStarted(A)).toBe(true);
  });
});
