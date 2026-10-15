/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import GuidesView from '../client/src/components/guides/GuidesView';
import { useGuides } from '../client/src/hooks/useGuides';
import type { GuideEntry, GuidesIndex } from '../shared/types';

/** GuidesView as AppShell mounts it: the data hook one level up, handing the board its state, and the scope the rail resolved — every project here,
 *  because narrowing is the rail's and is driven through App in app-projects.test.tsx. */
function Board() {
  return <GuidesView guides={useGuides()} scope="all" />;
}

/*
  A board with one series and two loose guides. The series' lessons are listed
  out of order and given createdAt values that the default sort ('created',
  newest first) would arrange as 2, 3, 1 — so a sheet that merely inherited the
  board's sort would render a different order than a sheet honouring series order,
  and the ordering tests below cannot pass by accident.

  Lesson progress is deliberately one of each state: read, part-read, untouched.
  The sheet's segmented bar and its started count have to tell those three apart.
*/
const SERIES_DIR = '/p/docs/guides/tutor/mongo-internals';

function lesson(
  n: number,
  desc: string,
  title: string,
  createdAt: string,
  progress: GuideEntry['progress']
): GuideEntry {
  const path = `${SERIES_DIR}/mongo-internals-${n}-${desc}.html`;
  return {
    path,
    title,
    type: 'tutor',
    updated: '2026-08-25T00:00:00Z',
    createdAt,
    href: `/guide?p=${encodeURIComponent(path)}`,
    progress,
  };
}

const INDEX: GuidesIndex = {
  projects: [
    {
      name: 'guide-manager',
      path: '/p',
      guides: [
        lesson(2, 'indexes', 'Indexes', '2026-08-24T00:00:00Z', {
          guidePath: `${SERIES_DIR}/mongo-internals-2-indexes.html`,
          percent: 10,
          furthestPercent: 40,
          position: { kind: 'deck', cardIndex: 4 },
          completed: false,
          lastOpenedAt: '2026-08-25T00:00:00Z',
          openCount: 2,
        }),
        lesson(3, 'replication', 'Replication', '2026-08-23T00:00:00Z', null),
        lesson(1, 'storage-engine', 'Storage engine', '2026-08-20T00:00:00Z', {
          guidePath: `${SERIES_DIR}/mongo-internals-1-storage-engine.html`,
          percent: 100,
          furthestPercent: 100,
          position: { kind: 'deck', cardIndex: 29 },
          completed: true,
          lastOpenedAt: '2026-08-22T00:00:00Z',
          openCount: 3,
        }),
        {
          path: '/p/docs/guides/tutor/vite-proxy-deck.html',
          title: 'Vite proxy layer',
          type: 'tutor',
          updated: '2026-08-14T00:00:00Z',
          createdAt: '2026-08-14T00:00:00Z',
          href: '/guide?p=%2Fp%2Fdocs%2Fguides%2Ftutor%2Fvite-proxy-deck.html',
          progress: null,
        },
        {
          path: '/p/docs/guides/study/render-pipeline/index.html',
          title: 'Render pipeline',
          type: 'study',
          updated: '2026-08-10T00:00:00Z',
          createdAt: '2026-08-10T00:00:00Z',
          href: '/guide?p=%2Fp%2Fdocs%2Fguides%2Fstudy%2Frender-pipeline%2Findex.html',
          progress: null,
        },
      ],
    },
  ],
};

function mockFetch(body: unknown, ok = true): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
  (globalThis as { fetch?: unknown }).fetch = fn;
  return fn;
}

async function renderGuides(body: unknown = INDEX) {
  mockFetch(body);
  const result = render(<Board />);
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  return result;
}

const sheet = () => document.querySelector<HTMLElement>('.series-sheet');
const foldButton = () => document.querySelector<HTMLElement>('.series-fold');
const rowTitles = () => [...document.querySelectorAll('.series-row-title')].map((n) => n.textContent);
const rowDots = () => [...document.querySelectorAll('.series-dot')].map((n) => n.textContent);
/* Loose tiles are the ones NOT inside a sheet. */
const looseTitles = () => [...document.querySelectorAll('.guide-tile-title')].map((n) => n.textContent);

const searchBox = () => screen.getByLabelText('Search guides') as HTMLInputElement;
const setControl = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name) as HTMLSelectElement, { target: { value } });

/** The suite's index with lesson 3 opened and left at 0 % — a progress row, but nothing read. */
function withLesson3AtZero(): GuidesIndex {
  const guides = INDEX.projects[0].guides.map((g) =>
    g.path.endsWith('-3-replication.html')
      ? {
          ...g,
          progress: {
            guidePath: g.path, percent: 0, furthestPercent: 0, position: { kind: 'deck' as const, cardIndex: 0 },
            completed: false, lastOpenedAt: '2026-08-26T00:00:00Z', openCount: 1,
          },
        }
      : g
  );
  return { projects: [{ ...INDEX.projects[0], guides }] };
}

describe('GuidesView series sheets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('groups series lessons into one sheet, in series order, above the loose tiles', async () => {
    await renderGuides();
    expect(document.querySelectorAll('.series-sheet')).toHaveLength(1);
    // The sheet prints the label, not the directory slug the derivation keys
    // on — see seriesLabel in client/src/lib/series.ts.
    expect(sheet()!.querySelector('.series-title')!.textContent).toBe('Mongo internals');
    // Series order 1..3, NOT the default created-desc order (2, 3, 1).
    expect(rowTitles()).toEqual(['Storage engine', 'Indexes', 'Replication']);
    expect(looseTitles()).toEqual(['Vite proxy layer', 'Render pipeline']);
  });

  it('counts the lessons and the started ones in the subtitle', async () => {
    await renderGuides();
    // Lesson 1 completed, lesson 2 at 40, lesson 3 never opened.
    expect(sheet()!.querySelector('.series-sub')!.textContent).toBe('Series · 3 lessons · 2 started');
  });

  it('does not count a lesson opened and left at 0 % as started', async () => {
    await renderGuides(withLesson3AtZero());
    expect(sheet()!.querySelector('.series-sub')!.textContent).toBe('Series · 3 lessons · 2 started');
  });

  it('numbers the rows and turns a completed lesson\'s dot green', async () => {
    await renderGuides();
    expect(rowDots()).toEqual(['1', '2', '3']);
    expect([...document.querySelectorAll('.series-dot')].map((n) => n.classList.contains('done'))).toEqual([true, false, false]);
    expect([...document.querySelectorAll('.series-row-pct')].map((n) => n.textContent)).toEqual(['100%', '40%', '0%']);
  });

  it('keeps series order under every sort key while loose tiles re-sort', async () => {
    await renderGuides();
    setControl('Sort', 'name');
    expect(rowTitles()).toEqual(['Storage engine', 'Indexes', 'Replication']);
    expect(looseTitles()).toEqual(['Render pipeline', 'Vite proxy layer']);
  });

  it('renders one segment per lesson, filled to that lesson\'s furthest', async () => {
    await renderGuides();
    const segments = [...sheet()!.querySelectorAll<HTMLElement>('.segbar > .bar')];
    const fills = segments.map((n) => n.querySelector<HTMLElement>('.bar-fill')?.style.width ?? 'empty');
    // read → 100%, part-read → its high-water mark, untouched → a flat track with no fill.
    expect(fills).toEqual(['100%', '40%', 'empty']);
  });

  it('drops an emptied sheet whole, title included', async () => {
    await renderGuides();
    setControl('Sort', 'created');
    fireEvent.click(screen.getByRole('button', { name: /^Study \d+$/ }));
    // Every lesson is a tutor deck, so the study filter empties the sheet.
    expect(sheet()).toBeNull();
    expect(looseTitles()).toEqual(['Render pipeline']);
  });

  it('filters the rows but keeps the dots and subtitle stated against the full series', async () => {
    await renderGuides();
    fireEvent.change(searchBox(), { target: { value: 'indexes' } });
    expect(rowTitles()).toEqual(['Indexes']);
    // Still lesson 2 of 3: the lesson's place in its series is not a filter result.
    expect(rowDots()).toEqual(['2']);
    expect(sheet()!.querySelector('.series-sub')!.textContent).toBe('Series · 3 lessons · 2 started');
  });

  it('folds on the chevron, keeps the title and bar, and persists across a remount', async () => {
    const first = await renderGuides();
    expect(foldButton()!.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(foldButton()!);
    expect(foldButton()!.getAttribute('aria-expanded')).toBe('false');
    expect(JSON.parse(localStorage.getItem('guide-manager.foldedSeries') ?? '[]')).toEqual([SERIES_DIR]);
    expect(rowTitles()).toEqual([]);
    expect(sheet()!.querySelector('.series-title')!.textContent).toBe('Mongo internals');
    expect(sheet()!.querySelector('.segbar')).toBeTruthy();
    // Loose tiles are untouched by a sheet fold.
    expect(looseTitles()).toEqual(['Vite proxy layer', 'Render pipeline']);

    first.unmount();
    await renderGuides();
    expect(foldButton()!.getAttribute('aria-expanded')).toBe('false');
    expect(rowTitles()).toEqual([]);

    fireEvent.click(foldButton()!);
    expect(foldButton()!.getAttribute('aria-expanded')).toBe('true');
    expect(rowTitles()).toEqual(['Storage engine', 'Indexes', 'Replication']);
  });

  it('forces a folded sheet open while a query is running, without rewriting the fold', async () => {
    await renderGuides();
    fireEvent.click(foldButton()!);
    expect(rowTitles()).toEqual([]);

    fireEvent.change(searchBox(), { target: { value: 'storage' } });
    expect(rowTitles()).toEqual(['Storage engine']);
    expect(JSON.parse(localStorage.getItem('guide-manager.foldedSeries') ?? '[]')).toEqual([SERIES_DIR]);

    // Clearing the query drops the sheet back to its stored folded state.
    fireEvent.change(searchBox(), { target: { value: '' } });
    expect(rowTitles()).toEqual([]);
  });

  it('opens a lesson in the viewer from its row', async () => {
    await renderGuides();
    fireEvent.click(screen.getByText('Storage engine'));
    expect(document.querySelector('.guide-viewer')).toBeTruthy();
    expect(document.querySelector('.guide-viewer-title')!.textContent).toBe('Storage engine');
  });
});
