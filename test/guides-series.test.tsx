/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import GuidesView from '../client/src/components/guides/GuidesView';
import type { GuideEntry, GuidesIndex } from '../shared/types';

/*
  A board with one series and two loose guides. The series' lessons are listed
  out of order and given createdAt values that the default sort ('created',
  newest first) would arrange as 2, 3, 1 — so a shelf that merely inherited the
  bay's sort would render a different order than a shelf honouring series order,
  and the ordering tests below cannot pass by accident.

  Lesson progress is deliberately one of each state: read, part-read, untouched.
  The header's segment strip has to tell those three apart.
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
  const result = render(<GuidesView />);
  await waitFor(() => expect(screen.queryByText('loading…')).toBeNull());
  return result;
}

const shelf = () => document.querySelector<HTMLElement>('.shelf');
const shelfHeader = () => document.querySelector<HTMLElement>('.shelf-h');
const shelfCardTitles = () =>
  [...document.querySelectorAll('.shelf .guides-card-title')].map((n) => n.textContent);
const stepBadges = () =>
  [...document.querySelectorAll('.guides-card-step')].map((n) => n.textContent);
/* Loose cards are the ones NOT inside a shelf. */
const looseCardTitles = () =>
  [...document.querySelectorAll('.guides-card-title')]
    .filter((n) => !n.closest('.shelf'))
    .map((n) => n.textContent);

const searchBox = () => screen.getByLabelText('Search guides') as HTMLInputElement;
const setControl = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name) as HTMLSelectElement, { target: { value } });

describe('GuidesView series shelves', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('groups series lessons into one shelf, in series order, above the loose grid', async () => {
    await renderGuides();
    expect(document.querySelectorAll('.shelf')).toHaveLength(1);
    expect(shelf()!.querySelector('.shelf-name')!.textContent).toBe('mongo-internals');
    // Series order 1..3, NOT the default created-desc order (2, 3, 1).
    expect(shelfCardTitles()).toEqual(['Storage engine', 'Indexes', 'Replication']);
    expect(looseCardTitles()).toEqual(['Vite proxy layer', 'Render pipeline']);
  });

  it('gives shelf cards a step badge and loose cards none', async () => {
    await renderGuides();
    expect(stepBadges()).toEqual(['1/3', '2/3', '3/3']);
    const loose = screen.getByText('Vite proxy layer').parentElement!;
    expect(loose.querySelector('.guides-card-step')).toBeNull();
  });

  it('keeps series order under every sort key while loose cards re-sort', async () => {
    await renderGuides();
    setControl('Sort', 'name');
    expect(shelfCardTitles()).toEqual(['Storage engine', 'Indexes', 'Replication']);
    expect(looseCardTitles()).toEqual(['Render pipeline', 'Vite proxy layer']);
  });

  it('renders one segment per lesson, filled to that lesson\'s furthest', async () => {
    await renderGuides();
    const fills = [...shelf()!.querySelectorAll<HTMLElement>('.shelf-seg-fill')].map(
      (n) => n.style.width
    );
    // read → 100%, part-read → its high-water mark, untouched → 0%.
    expect(fills).toEqual(['100%', '40%', '0%']);
  });

  it('counts the bay across shelves and loose cards together', async () => {
    await renderGuides();
    expect(document.querySelector('.bay-count')!.textContent).toBe('5 guides');
  });

  it('drops an emptied shelf whole, header included', async () => {
    await renderGuides();
    setControl('Type', 'study');
    // Every lesson is a tutor deck, so the study filter empties the shelf.
    expect(shelf()).toBeNull();
    expect(looseCardTitles()).toEqual(['Render pipeline']);
    expect(document.querySelector('.bay-count')!.textContent).toBe('1 guide');
  });

  it('filters inside the shelf but keeps badges stated against the full series', async () => {
    await renderGuides();
    fireEvent.change(searchBox(), { target: { value: 'indexes' } });
    expect(shelfCardTitles()).toEqual(['Indexes']);
    // Still lesson 2 of 3: the lesson's place in its series is not a filter result.
    expect(stepBadges()).toEqual(['2/3']);
    expect(shelf()!.querySelector('.shelf-count')!.textContent).toBe('1 lesson');
  });

  it('folds on the header, dims the spine, and persists across a remount', async () => {
    const first = await renderGuides();
    fireEvent.click(shelfHeader()!);
    expect(shelfHeader()!.getAttribute('aria-expanded')).toBe('false');
    expect(shelf()!.classList.contains('folded')).toBe(true);
    expect(shelfCardTitles()).toEqual([]);
    // Loose cards are untouched by a shelf fold.
    expect(looseCardTitles()).toEqual(['Vite proxy layer', 'Render pipeline']);

    first.unmount();
    await renderGuides();
    expect(shelfHeader()!.getAttribute('aria-expanded')).toBe('false');
    expect(shelfCardTitles()).toEqual([]);
  });

  it('forces a folded shelf open while a query is running, without rewriting the fold', async () => {
    await renderGuides();
    fireEvent.click(shelfHeader()!);
    expect(shelfCardTitles()).toEqual([]);

    fireEvent.change(searchBox(), { target: { value: 'storage' } });
    expect(shelfCardTitles()).toEqual(['Storage engine']);

    // Clearing the query drops the shelf back to its stored folded state.
    fireEvent.change(searchBox(), { target: { value: '' } });
    expect(shelfCardTitles()).toEqual([]);
  });

  it('opens a lesson in the viewer like any card', async () => {
    await renderGuides();
    fireEvent.click(screen.getByText('Storage engine'));
    expect(document.querySelector('.guide-viewer')).toBeTruthy();
    expect(document.querySelector('.guide-viewer-title')!.textContent).toBe('Storage engine');
  });
});
