/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'progress.js'), 'utf8');

/**
 * The tutor-deck half of the reporter.
 *
 * A deck is a flat list of cards with exactly one `.card.active` showing; its own
 * JS owns the current index, the score tally, the progress bar and whether `Next`
 * is disabled. The reporter must not reimplement any of that and must not set
 * `.active` by hand — a hand-set card leaves the deck's internal index at 0, so
 * the reader's next `Back` tap jumps to card one and the progress bar contradicts
 * the screen.
 *
 * So restoring means driving the deck's own `Next`, which is the only navigation
 * control every generated deck is guaranteed to carry (deck.md §2). Section-jump
 * controls exist but only on divider and recap cards, and their markup is given
 * as an example rather than a contract.
 *
 * The fixture below is a deck in the shape deck.md specifies, with its own
 * handlers wired the way a generated one wires them — including the quiz gate,
 * which is the behaviour the replay has to respect rather than route around.
 */
interface ReporterApi {
  deckCards(root: Document | HTMLElement): HTMLElement[];
  deckPosition(cards: HTMLElement[], index: number): Record<string, unknown>;
  deckTarget(cards: HTMLElement[], position: Record<string, unknown> | null): number;
  restoreDeck(): boolean;
  activeIndex(): number;
  report(patch: Record<string, unknown>): void;
  init(): void;
  stop(): void;
}

/**
 * Eight cards: an opener outside any section, three in s1 (one of them a gating
 * quiz), three in s2, and a recap outside again — the arrangement deck.md
 * describes, and the one that makes a section-relative position meaningfully
 * different from an absolute index.
 */
const DECK = `
  <div class="card card-model active">opener</div>
  <section id="s1">
    <div class="card card-concept">s1 first</div>
    <div class="card card-quiz" data-quiz>
      <div class="quiz-option" data-correct="true">right</div>
      <div class="quiz-option" data-correct="false">wrong</div>
    </div>
    <div class="card card-concept">s1 last</div>
  </section>
  <section id="s2">
    <div class="card card-divider">s2 divider</div>
    <div class="card card-concept">s2 middle</div>
    <div class="card card-concept">s2 last</div>
  </section>
  <div class="card card-recap">recap</div>
  <nav><button id="back" disabled>Back</button><button id="next">Next</button></nav>
`;

/**
 * The deck's own navigation, in miniature: a flat card list, one active card, and
 * a `Next` that is disabled exactly while an unanswered quiz card is showing.
 * Answering the quiz re-enables it. This is the contract the reporter drives, so
 * the fixture implements it rather than mocking it away.
 */
function wireDeck(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  const next = document.getElementById('next') as HTMLButtonElement | null;
  const back = document.getElementById('back') as HTMLButtonElement | null;
  // The not-a-deck fixture has neither, and that case is exactly what one of the
  // tests below is about.
  if (cards.length === 0 || !next || !back) return;
  const answered = new Set<HTMLElement>();
  let current = 0;

  const gated = (card: HTMLElement) => card.hasAttribute('data-quiz') && !answered.has(card);

  const show = (i: number) => {
    cards[current].classList.remove('active');
    current = Math.min(Math.max(i, 0), cards.length - 1);
    cards[current].classList.add('active');
    next.disabled = gated(cards[current]);
    back.disabled = current === 0;
  };

  next.addEventListener('click', () => {
    if (next.disabled) return;
    show(current + 1);
  });
  back.addEventListener('click', () => {
    if (back.disabled) return;
    show(current - 1);
  });
  document.querySelectorAll<HTMLElement>('.quiz-option').forEach((option) => {
    option.addEventListener('click', () => {
      const card = option.closest('.card') as HTMLElement;
      answered.add(card);
      if (cards[current] === card) next.disabled = false;
    });
  });
  show(0);
}

const ctx = (progress: unknown = null) => ({
  guidePath: '/g/deck.html',
  project: 'demo',
  kind: 'deck',
  progress
});

const stored = (position: unknown, percent = 50) => ({
  guidePath: '/g/deck.html',
  percent,
  furthestPercent: percent,
  position,
  completed: false,
  lastOpenedAt: '2026-08-25T00:00:00.000Z',
  openCount: 2
});

function load(context: unknown, html = DECK): ReporterApi {
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

const fetchMock = (): jest.Mock => window.fetch as unknown as jest.Mock;
const bodyOf = (call: unknown[]): Record<string, unknown> =>
  JSON.parse((call[1] as { body: string }).body);
const activeText = (): string =>
  (document.querySelector('.card.active') as HTMLElement | null)?.textContent?.trim() ?? '';
const click = (id: string): void => (document.getElementById(id) as HTMLElement).click();
const answerQuiz = (): void =>
  (document.querySelector('.quiz-option') as HTMLElement).click();

/*
  MutationObserver callbacks are delivered as microtasks, so the reporter reacts
  to a card change one tick after the click that caused it. Every test that
  asserts on that reaction has to yield first — in a browser the gap is invisible,
  but a synchronous assertion here would read the DOM before the observer ever
  ran and conclude the feature does not work.
*/
const tick = (): Promise<void> => Promise.resolve().then(() => undefined);

describe('progress reporter — deck mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    const api = (window as unknown as { __gmProgress?: ReporterApi }).__gmProgress;
    if (api) api.stop();
    jest.useRealTimers();
  });

  it('collects every card in document order, across section wrappers', () => {
    const api = load(ctx());
    // A deck's own navigation ignores its wrappers — they exist for the update
    // flow's benefit (deck.md §1) — so the reporter's index must be the flat one.
    expect(api.deckCards(document)).toHaveLength(8);
    expect(api.deckCards(document)[4].textContent?.trim()).toBe('s2 divider');
  });

  it('describes a card inside a section by that section and its offset', () => {
    const api = load(ctx());
    const cards = api.deckCards(document);
    expect(api.deckPosition(cards, 5)).toEqual({
      kind: 'deck',
      cardIndex: 5,
      sectionId: 's2',
      cardOffset: 1
    });
  });

  it('describes the opener and the recap by index alone', () => {
    const api = load(ctx());
    const cards = api.deckCards(document);
    // Both sit outside every wrapper: deck.md puts the opener before the first
    // section and the recap after the last, because neither belongs to one.
    expect(api.deckPosition(cards, 0)).toEqual({ kind: 'deck', cardIndex: 0 });
    expect(api.deckPosition(cards, 7)).toEqual({ kind: 'deck', cardIndex: 7 });
  });

  it('prefers the section-relative pair over a stale absolute index', () => {
    const api = load(ctx());
    const cards = api.deckCards(document);
    // Section ids are permanent by contract, so this pair is what survives an
    // incremental regeneration that rewrote s1 and shifted every index after it.
    // The absolute index here is deliberately wrong.
    expect(api.deckTarget(cards, { kind: 'deck', cardIndex: 99, sectionId: 's2', cardOffset: 1 })).toBe(5);
  });

  it('falls back to the absolute index when the stored section is gone', () => {
    const api = load(ctx());
    const cards = api.deckCards(document);
    expect(api.deckTarget(cards, { kind: 'deck', cardIndex: 3, sectionId: 's9', cardOffset: 0 })).toBe(3);
  });

  it('clamps a target past the end of a deck that lost cards', () => {
    const api = load(ctx());
    const cards = api.deckCards(document);
    // Resume near where you were rather than refusing: a shortened deck is a
    // regenerated deck, not a broken position.
    expect(api.deckTarget(cards, { kind: 'deck', cardIndex: 40 })).toBe(7);
  });

  it('ignores a doc position handed to a deck', () => {
    const api = load(ctx());
    const cards = api.deckCards(document);
    expect(api.deckTarget(cards, { kind: 'doc', anchorId: 'intro' })).toBe(-1);
    expect(api.deckTarget(cards, null)).toBe(-1);
  });

  it('reaches the stored card through the deck\'s own Next, leaving the deck consistent', () => {
    load(ctx(stored({ kind: 'deck', cardIndex: 2 })));
    // Card 2 is the quiz card, and the quiz gate is what stops the replay there —
    // so this asserts the ungated part of the walk, cards 0 -> 1 -> 2.
    expect(document.querySelector('.card.active')?.classList.contains('card-quiz')).toBe(true);

    // The deck's own index followed the replay: Back goes to the card before the
    // target, not to card one, which is what setting .active by hand would give.
    click('back');
    expect(activeText()).toBe('s1 first');
  });

  it('parks at an unanswered quiz rather than routing around the gate', () => {
    load(ctx(stored({ kind: 'deck', cardIndex: 6 })));
    // The gate is the whole point of a quiz card, and quiz answers are not
    // stored — so a resume past one would be a claim the reader never earned.
    expect(document.querySelector('.card.active')?.classList.contains('card-quiz')).toBe(true);
    expect((document.getElementById('next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('finishes the resume on its own once the gate is cleared', async () => {
    load(ctx(stored({ kind: 'deck', cardIndex: 6 })));
    expect(document.querySelector('.card.active')?.classList.contains('card-quiz')).toBe(true);

    answerQuiz();
    await tick();
    // Answering re-enables Next, and the pending target carries the reader the
    // rest of the way unaided. Without this, resuming a deck with an early quiz
    // would mean tapping Next eighteen times by hand.
    // Card index 6 is s2's last card — the stored target, reached without the
    // reader touching Next again.
    expect(activeText()).toBe('s2 last');
  });

  it('gives up the pending resume when the reader goes backwards', async () => {
    load(ctx(stored({ kind: 'deck', cardIndex: 6 })));
    click('back');
    await tick();
    // A reader taking control must not be fought. Answering the quiz afterwards
    // moves one card, as a tap should, rather than resuming a journey they
    // abandoned.
    const where = activeText();
    answerQuiz();
    await tick();
    expect(activeText()).toBe(where);
  });

  it('reports nothing for the cards a replay walked through', () => {
    load(ctx(stored({ kind: 'deck', cardIndex: 2 })));
    // Those cards are not places the reader went. One write per open, carrying
    // where the replay actually landed.
    const opens = fetchMock().mock.calls.filter((c) => bodyOf(c).opened === true);
    expect(opens).toHaveLength(1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('reports the card the reader moves to, as a percent of the deck', async () => {
    jest.useFakeTimers();
    load(ctx());
    fetchMock().mockClear();
    click('next');
    await tick();
    jest.advanceTimersByTime(500);

    const body = bodyOf(fetchMock().mock.calls[0]);
    // cardIndex / (total - 1): card 1 of 8 is 1/7.
    expect(body.percent).toBe(14);
    expect(body.position).toEqual({ kind: 'deck', cardIndex: 1, sectionId: 's1', cardOffset: 0 });
    expect(body.opened).toBeUndefined();
  });

  it('marks a deck read on its last card', async () => {
    jest.useFakeTimers();
    const api = load(ctx(stored({ kind: 'deck', cardIndex: 6 })));
    answerQuiz();
    await tick();
    fetchMock().mockClear();
    click('next');
    await tick();
    jest.advanceTimersByTime(500);
    expect(bodyOf(fetchMock().mock.calls[0])).toMatchObject({ percent: 100, completed: true });
    expect(api.activeIndex()).toBe(7);
  });

  it('reports a one-card deck as complete without dividing by zero', () => {
    jest.useFakeTimers();
    load(ctx(), '<div class="card active">only</div><nav><button id="next">Next</button><button id="back">Back</button></nav>');
    expect(bodyOf(fetchMock().mock.calls[0]).percent).toBe(100);
  });

  it('does nothing at all in a document with no cards', () => {
    // A deck-typed guide whose markup this reporter cannot recognise: report the
    // open and stay quiet, rather than throwing inside someone's guide.
    const api = load(ctx(stored({ kind: 'deck', cardIndex: 3 })), '<p>not a deck</p>');
    expect(api.restoreDeck()).toBe(false);
    expect(() => api.init()).not.toThrow();
  });

  it('does not claim a restore when the stored card is the first one', () => {
    const api = load(ctx(stored({ kind: 'deck', cardIndex: 0 }, 0)));
    // Card one is where a deck already opens. A "resumed" pill there is a claim
    // the reader can see is false.
    expect(api.activeIndex()).toBe(0);
    expect(api.restoreDeck()).toBe(false);
  });
});
