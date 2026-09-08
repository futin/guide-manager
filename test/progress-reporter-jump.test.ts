/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'progress.js'), 'utf8');

/**
 * "Open in guide" for a favorite: a saved anchor rides into the progress
 * context as `jumpTo`, and this is the half of the reporter that acts on it.
 *
 * There is deliberately no second navigation mechanism here. A deck's jump
 * target goes through the same `deckTarget` / `advance()` replay a session
 * resume already uses — including the quiz gate, which a favorite's anchor
 * has no more right to route around than an ordinary resume does. A doc's
 * jump target is a plain `scrollIntoView`, same as the stored-anchor restore.
 * What changes is only which position wins, and the wording once it lands.
 *
 * Fixtures are copied verbatim from test/progress-reporter-deck.test.ts (the
 * eight-card DECK, its wireDeck()) and test/progress-reporter-doc.test.ts (the
 * three-heading DOC) — this suite reuses them rather than inventing its own,
 * since the plan calls them out by name (DECK-JUMP / DOC-JUMP).
 */
interface ReporterApi {
  activeIndex(): number;
  restoreDeck(): boolean;
  restoreDoc(): boolean;
  init(): void;
  stop(): void;
}

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

const DOC = `
  <h2 id="intro">Intro</h2><p>one</p>
  <h2 id="pipeline">Pipeline</h2><p>two</p>
  <h3 id="pipeline--why">Why</h3><p>three</p>
`;

/** Copied from test/progress-reporter-deck.test.ts: the deck's own navigation,
 *  in miniature — a flat card list, one active card, and a `Next` that is
 *  disabled exactly while an unanswered quiz card shows. */
function wireDeck(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  const next = document.getElementById('next') as HTMLButtonElement | null;
  const back = document.getElementById('back') as HTMLButtonElement | null;
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

/** The deck context, extended with an optional `jumpTo`. Omitted from the
 *  object entirely (rather than sent as `null`) when the test does not care —
 *  the server's own omit-when-null contract is exercised in
 *  test/progress-inject.test.ts, not here; this suite only needs the reporter
 *  to see the key or not see it. */
const deckCtx = (progress: unknown = null, jumpTo: unknown = null) => {
  const out: Record<string, unknown> = {
    guidePath: '/g/deck.html',
    project: 'demo',
    kind: 'deck',
    progress
  };
  if (jumpTo !== null) out.jumpTo = jumpTo;
  return out;
};

const docCtx = (progress: unknown = null, jumpTo: unknown = null) => {
  const out: Record<string, unknown> = {
    guidePath: '/g/study/index.html',
    project: 'demo',
    kind: 'doc',
    progress
  };
  if (jumpTo !== null) out.jumpTo = jumpTo;
  return out;
};

const stored = (position: unknown, percent = 50) => ({
  guidePath: '/g/deck.html',
  percent,
  furthestPercent: percent,
  position,
  completed: false,
  lastOpenedAt: '2026-08-25T00:00:00.000Z',
  openCount: 2
});

function load(context: unknown, html: string): ReporterApi {
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
  /*
    The file runs init() itself at parse time whenever readyState is not
    'loading' — jsdom's default here — which would restore before a doc-mode
    test gets a chance to stub scrollIntoView on the anchor it cares about.
    Reporting 'loading' during the eval defers that to nothing but a bound
    listener the tests never fire, so each test's own explicit api.init() call
    below is the one and only restore, run after any stubbing it needs.
  */
  Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
  window.eval(SRC);
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  return (window as unknown as { __gmProgress: ReporterApi }).__gmProgress;
}

const fetchMock = (): jest.Mock => window.fetch as unknown as jest.Mock;
const bodyOf = (call: unknown[]): Record<string, unknown> =>
  JSON.parse((call[1] as { body: string }).body);
const activeText = (): string =>
  (document.querySelector('.card.active') as HTMLElement | null)?.textContent?.trim() ?? '';
const answerQuiz = (): void =>
  (document.querySelector('.quiz-option') as HTMLElement).click();

/** Mirrors deck.test.ts: MutationObserver callbacks land a tick after the
 *  click/DOM change that caused them. */
const tick = (): Promise<void> => Promise.resolve().then(() => undefined);

const pillLabel = (): string | null =>
  (document.querySelector('.gm-progress-pill span') as HTMLElement | null)?.textContent ?? null;

describe('progress reporter — jumping to a favorite', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    const api = (window as unknown as { __gmProgress?: ReporterApi }).__gmProgress;
    if (api) api.stop();
    jest.useRealTimers();
  });

  describe('deck mode', () => {
    it('opens at the favorite\'s card rather than the session\'s stored one', () => {
      const api = load(
        deckCtx(stored({ kind: 'deck', cardIndex: 3 }), {
          kind: 'deck',
          cardIndex: 1,
          sectionId: 's1',
          cardOffset: 0
        }),
        DECK
      );
      api.init();

      expect(activeText()).toBe('s1 first');
      expect(pillLabel()).toBe('opened at your favorite');

      const opens = fetchMock().mock.calls.filter((c) => bodyOf(c).opened === true);
      expect(opens).toHaveLength(1);
      expect(bodyOf(opens[0])).toMatchObject({
        opened: true,
        position: { kind: 'deck', cardIndex: 1, sectionId: 's1', cardOffset: 0 }
      });
    });

    it('announces nothing when the favorite is the card the deck already opens on', () => {
      const api = load(
        deckCtx(stored({ kind: 'deck', cardIndex: 3 }), { kind: 'deck', cardIndex: 0 }),
        DECK
      );
      api.init();

      // Card one is where a deck already opens: nothing moved, so nothing is
      // announced — the same rule an ordinary resume follows at
      // restoreDeck's `target <= 0` early-out.
      expect(activeText()).toBe('opener');
      expect(document.querySelector('.gm-progress-pill')).toBeNull();
      expect(document.querySelector('.gm-progress-note')).toBeNull();
    });

    it('parks at the quiz gate on the way to a favorite past it, same as an ordinary resume', async () => {
      const api = load(
        deckCtx(null, { kind: 'deck', cardIndex: 5, sectionId: 's2', cardOffset: 1 }),
        DECK
      );
      api.init();

      // The gate is what a quiz card is for, and a favorite's anchor has no
      // more right to route around it than a session resume does.
      expect(document.querySelector('.card.active')?.classList.contains('card-quiz')).toBe(true);
      expect(pillLabel()).toBe('opening your favorite — answer this');

      answerQuiz();
      await tick();
      // Answering carries the reader the rest of the way to the favorite's
      // card, exactly as it would for an ordinary stalled resume.
      expect(activeText()).toBe('s2 middle');
    });

    it('leaves the ordinary resume wording alone when there is no jumpTo', () => {
      const api = load(deckCtx(stored({ kind: 'deck', cardIndex: 3 })), DECK);
      api.init();

      // Unchanged from before this task: the replay stalls at the quiz gate
      // on the way to card 3, same as test/progress-reporter-deck.test.ts's
      // "parks at an unanswered quiz" case for a later target.
      expect(document.querySelector('.card.active')?.classList.contains('card-quiz')).toBe(true);
      expect(pillLabel()).toBe('resuming — answer this');
    });
  });

  describe('doc mode', () => {
    it('scrolls to the favorite\'s anchor instead of the stored one', () => {
      const api = load(
        docCtx({ percent: 20, furthestPercent: 20, position: { kind: 'doc', anchorId: 'intro' } }, {
          kind: 'doc',
          anchorId: 'pipeline--why'
        }),
        DOC
      );
      const introSpy = jest.fn();
      const targetSpy = jest.fn();
      (document.getElementById('intro') as HTMLElement).scrollIntoView = introSpy;
      (document.getElementById('pipeline--why') as HTMLElement).scrollIntoView = targetSpy;

      api.init();

      expect(targetSpy).toHaveBeenCalled();
      expect(introSpy).not.toHaveBeenCalled();
      expect(pillLabel()).toBe('opened at your favorite');
    });

    it('falls through to the stored anchor when the favorite\'s one no longer exists', () => {
      const api = load(
        docCtx({ percent: 20, furthestPercent: 20, position: { kind: 'doc', anchorId: 'intro' } }, {
          kind: 'doc',
          anchorId: 'gone'
        }),
        DOC
      );
      const introSpy = jest.fn();
      (document.getElementById('intro') as HTMLElement).scrollIntoView = introSpy;

      api.init();

      // A heading id is derived from a slug — a chapter renamed since the
      // favorite was captured retires it — so this is a resume, not a jump,
      // and gets the ordinary wording.
      expect(introSpy).toHaveBeenCalled();
      expect(pillLabel()).toBe('resumed');
    });
  });
});
