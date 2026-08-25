/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'progress.js'), 'utf8');

/**
 * The pill: the one piece of UI the reporter adds to a guide.
 *
 * It exists because a silent restore is indistinguishable from a bug. Opening a
 * guide and landing in the middle of chapter nine reads as the app having lost
 * your place rather than found it — so the restore says so, and offers the way
 * back to the top in the same breath.
 *
 * It is shown on exactly one signal: a restore that actually moved the guide.
 * A guide opened at its first line must not claim to have resumed anything.
 */
interface ReporterApi {
  showPill(text: string): HTMLElement | null;
  restoreDeck(): boolean;
  restoreDoc(): boolean;
  activeIndex(): number;
  init(): void;
  stop(): void;
}

const DECK = `
  <div class="card active">one</div>
  <div class="card">two</div>
  <div class="card">three</div>
  <div class="card">four</div>
  <nav><button id="back" disabled>Back</button><button id="next">Next</button></nav>
`;

const DOC = '<h2 id="intro">Intro</h2><p>a</p><h2 id="later">Later</h2><p>b</p>';

function wireDeck(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  const next = document.getElementById('next') as HTMLButtonElement | null;
  const back = document.getElementById('back') as HTMLButtonElement | null;
  if (cards.length === 0 || !next || !back) return;
  let current = 0;
  const show = (i: number) => {
    cards[current].classList.remove('active');
    current = Math.min(Math.max(i, 0), cards.length - 1);
    cards[current].classList.add('active');
    back.disabled = current === 0;
  };
  next.addEventListener('click', () => show(current + 1));
  back.addEventListener('click', () => { if (!back.disabled) show(current - 1); });
}

function load(html: string, context: unknown): ReporterApi {
  const previous = (window as unknown as { __gmProgress?: ReporterApi }).__gmProgress;
  if (previous) previous.stop();
  document.body.innerHTML = html;
  if (context) {
    const blob = document.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-progress';
    blob.textContent = JSON.stringify(context);
    document.body.appendChild(blob);
  }
  wireDeck();
  window.eval(SRC);
  return (window as unknown as { __gmProgress: ReporterApi }).__gmProgress;
}

const deckCtx = (cardIndex: number | null) => ({
  guidePath: '/g/deck.html',
  project: 'demo',
  kind: 'deck',
  progress:
    cardIndex === null
      ? null
      : {
          guidePath: '/g/deck.html',
          percent: 66,
          furthestPercent: 66,
          position: { kind: 'deck', cardIndex },
          completed: false,
          lastOpenedAt: '2026-08-25T00:00:00.000Z',
          openCount: 2
        }
});

const pill = (): HTMLElement | null => document.querySelector('.gm-progress-pill');
const startOver = (): HTMLElement | null =>
  document.querySelector('.gm-progress-pill [data-gm-restart]');
const fetchMock = (): jest.Mock => window.fetch as unknown as jest.Mock;

describe('progress reporter — the pill', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    const api = (window as unknown as { __gmProgress?: ReporterApi }).__gmProgress;
    if (api) api.stop();
    jest.useRealTimers();
  });

  it('shows nothing when a guide opens where it always opens', () => {
    load(DECK, deckCtx(null));
    // Card one is where a deck opens anyway. "Resumed" over it is a claim the
    // reader can see is false, and one false claim costs the pill its credibility
    // for the times it is telling the truth.
    expect(pill()).toBeNull();
  });

  it('appears when a restore actually moved the guide', () => {
    load(DECK, deckCtx(2));
    expect(pill()).not.toBeNull();
    expect(pill()?.textContent).toMatch(/resumed/i);
  });

  it('offers a way back to the start', () => {
    load(DECK, deckCtx(2));
    expect(startOver()?.textContent).toMatch(/start over/i);
  });

  it('start over returns the guide to card one, forgets the position and dismisses itself', () => {
    const api = load(DECK, deckCtx(2));
    fetchMock().mockClear();
    (startOver() as HTMLElement).click();

    expect(api.activeIndex()).toBe(0);
    // The DELETE is the same endpoint the viewer's reset button uses: one way to
    // forget a guide, not two that could disagree.
    const deletes = fetchMock().mock.calls.filter(
      (c) => (c[1] as { method: string }).method === 'DELETE'
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toBe('/api/progress?guidePath=' + encodeURIComponent('/g/deck.html'));
    expect(pill()).toBeNull();
  });

  it('fades itself out rather than sitting on the guide', () => {
    jest.useFakeTimers();
    load(DECK, deckCtx(2));
    expect(pill()).not.toBeNull();
    jest.advanceTimersByTime(6000);
    // Two stages: the opacity transition starts, then the element goes. Asserting
    // only the first would let a pill that never actually leaves pass.
    expect(pill()?.hasAttribute('data-leaving')).toBe(true);
    jest.advanceTimersByTime(250);
    // It is an explanation, not a control panel. Once read, it is in the way of
    // the guide it is explaining.
    expect(pill()).toBeNull();
  });

  it('names the gate when a deck replay is parked at one', () => {
    document.body.innerHTML = `
      <div class="card active">one</div>
      <div class="card card-quiz">quiz</div>
      <div class="card">three</div>
      <nav><button id="back" disabled>Back</button><button id="next" disabled>Next</button></nav>
    `;
    const blob = document.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-progress';
    blob.textContent = JSON.stringify(deckCtx(2));
    document.body.appendChild(blob);
    // A Next that starts disabled: the deck is showing a card the reader must
    // answer, so the replay cannot leave card one.
    window.eval(SRC);
    // Nothing moved, so nothing claims to have resumed — the reader is looking at
    // card one, which is where the deck opens.
    expect(pill()).toBeNull();
  });

  it('restores a doc and says so', () => {
    load(DOC, {
      guidePath: '/g/study/index.html',
      project: 'demo',
      kind: 'doc',
      progress: {
        guidePath: '/g/study/index.html',
        percent: 50,
        furthestPercent: 50,
        position: { kind: 'doc', anchorId: 'later' },
        completed: false,
        lastOpenedAt: '2026-08-25T00:00:00.000Z',
        openCount: 2
      }
    });
    expect(pill()?.textContent).toMatch(/resumed/i);
  });

  it('injects its styles once, however many times it is shown', () => {
    const api = load(DECK, deckCtx(2));
    api.showPill('again');
    api.showPill('and again');
    // Styles are inlined rather than served as a second stylesheet route: one
    // more route is one more Vite proxy entry and one more line in the static
    // exclusion, each of which fails invisibly when forgotten. A dozen rules do
    // not earn that.
    expect(document.querySelectorAll('style[data-gm-progress-style]')).toHaveLength(1);
  });

  it('keeps only one pill on screen', () => {
    const api = load(DECK, deckCtx(2));
    api.showPill('second');
    expect(document.querySelectorAll('.gm-progress-pill')).toHaveLength(1);
    expect(pill()?.textContent).toMatch(/second/);
  });
  /*
    Where the pill sits is a correctness question, not a taste one.

    A tutor deck's own Back/Next pair is a sticky bar across the bottom of the
    frame, and a study build's contents rail runs down the left — so the pill's
    first home, bottom-left, put it inside the deck's own nav: level with the
    buttons, reading as a stray link wedged into the deck's chrome, and
    overlapping the Back button outright once the frame got narrower. The top
    edge is the one band both guide types leave clear.
  */
  describe('where it sits', () => {
    const styleText = (): string => {
      load(DECK, deckCtx(2));
      return document.querySelector('style[data-gm-progress-style]')?.textContent ?? '';
    };

    it('anchors to the top of the frame, never the bottom', () => {
      const css = styleText();
      expect(css).toMatch(/\.gm-progress-pill\{[^}]*\btop:/);
      // The deck's own pager lives at the bottom of the frame. Anything docked
      // there is competing with the control the reader needs most.
      expect(css).not.toMatch(/\.gm-progress-pill\{[^}]*\bbottom:/);
    });

    it('stays inside the frame on a narrow screen', () => {
      // The phone is the device this whole app exists for, and a fixed element
      // wider than the viewport is one that cannot be dismissed.
      expect(styleText()).toMatch(/max-width:\s*calc\(100vw/);
    });

    it('borrows the guide\'s own typeface rather than imposing one', () => {
      // A monospace box on a deck set in system-ui reads as something broken
      // that leaked in, which is the opposite of what an explanation should do.
      expect(styleText()).toMatch(/font-family:\s*inherit/);
    });
  });
});
