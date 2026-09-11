/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FavoriteDraft, GuidePosition } from '../shared/types';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'favorites.js'), 'utf8');

/**
 * The capture script that runs *inside* a framed guide.
 *
 * It runs there because that is the only document that sees the guide's own
 * DOM — the shell around the frame holds a breadcrumb and a title and nothing
 * else. So everything below is the picker seen from inside the frame: which
 * element a tap resolves to, how wide the selection can be pushed, what the
 * selection is called, and what the picker does and deliberately does not do
 * to the guide's own handlers while it is armed.
 *
 * The star itself is the one part that lives in the *parent* document — the
 * shell's breadcrumb line, reached same-origin exactly the way the progress
 * reporter's resume notice reaches it — so the mount suite builds the real
 * two-document arrangement rather than asserting against a top-level stub.
 */
interface CaptureApi {
  readContext(): Record<string, unknown> | null;
  init(): void;
  stop(): void;
  started(): boolean;
  host(): Element | null;
  candidateAt(target: Element): Element[] | null;
  candidate(): Element[] | null;
  setCandidate(nodes: Element[] | null): void;
  groupFor(heading: Element): Element[];
  labelFor(nodes: Element[]): string;
  widen(): boolean;
  narrow(): boolean;
  enter(): void;
  leave(): void;
  picking(): boolean;
  anchorFor(nodes: Element[]): GuidePosition | null;
  crumbFor(nodes: Element[]): string[];
  titleFor(nodes: Element[], crumb: string[]): string;
  snapshot(nodes: Element[]): { html: string; text: string };
  draftFor(nodes: Element[]): FavoriteDraft;
  openPanel(): void;
  save(): Promise<boolean>;
  tag?: number;
}

/** The context blob DECK-CAPTURE specifies, from global-constraints.md. */
const CTX = {
  guidePath: '/g/deck.html',
  project: 'german-study-partner',
  guideTitle: 'Personalpronomen',
  kind: 'deck'
};

/** The context blob DOC-CAPTURE specifies. */
const DOC_CTX = {
  guidePath: '/g/hooks/index.html',
  project: 'claude-agents-dashboard',
  guideTitle: 'Hooks',
  kind: 'doc'
};

/**
 * DECK-CAPTURE: a tutor deck in the shape deck.md describes — an opener
 * outside any section, two concept cards and a gating quiz in `s1`, a divider
 * and a code card in `s2`, and a recap outside again. The quiz card is the one
 * that makes "select without answering" a real question rather than a
 * hypothetical: its options are buttons with handlers of their own.
 */
const DECK = `
  <div class="card card-model active"><p>Opener text</p></div>
  <section id="s1">
    <div class="card card-concept">
      <p class="eyebrow">§1 · Die Tabelle und der Artikel-Trick</p>
      <h2>Vorher</h2>
      <p>intro</p>
    </div>
    <div class="card card-concept">
      <p class="eyebrow">§1 · Die Tabelle und der Artikel-Trick</p>
      <h2>Die Tabelle</h2>
      <p>lead</p>
      <table>
        <tr><th>Nominativ</th><th>Akkusativ</th><th>Dativ</th></tr>
        <tr><td>ich</td><td>mich</td><td>mir</td></tr>
        <tr><td>du</td><td>dich</td><td>dir</td></tr>
      </table>
      <blockquote>Beispiel</blockquote>
    </div>
    <div class="card card-quiz" id="q1" data-quiz>
      <p class="quiz-prompt">Frage?</p>
      <div class="quiz-options">
        <div class="quiz-option" data-correct="false"><button class="quiz-option-btn">A</button><p class="quiz-feedback">nein</p></div>
        <div class="quiz-option" data-correct="true"><button class="quiz-option-btn">B</button><p class="quiz-feedback">ja</p></div>
      </div>
    </div>
  </section>
  <section id="s2">
    <div class="card card-divider"><p class="eyebrow">Weiter geht's</p><h2>Jetzt: §2</h2></div>
    <div class="card card-concept"><p class="eyebrow">§2 · Dativ</p><h2>mir dir ihm</h2><pre>// x</pre></div>
  </section>
  <div class="card card-recap"><h2>Recap</h2><script>window.__evil = 1</script></div>
  <nav><button id="back" disabled>Back</button><button id="next">Next</button></nav>
`;

/**
 * DOC-CAPTURE: a study build — a contents rail, one `h1`, and two sections of
 * id'd headings. The rail is what makes the "inside a nav" rule visible: its
 * `ul` matches the block list and must still resolve to nothing, because the
 * rail is chrome, not content.
 */
const DOC = `
  <nav class="toc"><ul><li><a href="#lifecycle">The lifecycle</a></li></ul></nav>
  <main id="top">
    <h1>Hooks guide</h1>
    <section>
      <h2 id="lifecycle">The lifecycle</h2>
      <p>lifecycle intro</p>
      <h3 id="lifecycle--2-turn">2. One turn</h3>
      <p>turn prose</p>
      <table><tr><td>a</td></tr><tr><td>b</td></tr></table>
      <h3 id="lifecycle--3-events">3. Events</h3>
      <pre>code</pre>
    </section>
    <section>
      <h2 id="answer-channel">The answer channel</h2>
      <p>answer intro</p>
    </section>
  </main>
`;

/** SHELL, as server/src/render/render.util.ts writes it. */
const SHELL = `
  <header class="topbar">
    <div class="topbar-inner">
      <nav class="crumbs"><a class="back" href="/" target="_top">Guides</a></nav>
      <div class="topbar-title"><span class="crumb-title">Personalpronomen</span><span class="badge tutor">tutor</span></div>
    </div>
  </header>
  <main class="wrap"></main>
`;

function getApi(): CaptureApi {
  return (window as unknown as { __gmFavorites: CaptureApi }).__gmFavorites;
}

/**
 * Writes the context blob (when given) into a fresh document body, then
 * evaluates the capture script. Mirrors the load() helper progress-reporter's
 * suites already use (test/progress-reporter-deck.test.ts): stopping whatever
 * instance is running first, so each test starts from a clean document rather
 * than accumulating listeners and attributes across a jsdom window that
 * outlives any one test.
 */
function load(context: unknown, html = '<p>hi</p>'): CaptureApi {
  const previous = (window as unknown as { __gmFavorites?: CaptureApi }).__gmFavorites;
  if (previous) previous.stop();
  document.body.innerHTML = html;
  if (context) {
    const blob = document.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-favorites';
    blob.textContent = JSON.stringify(context);
    document.body.appendChild(blob);
  }
  window.eval(SRC);
  return getApi();
}

/**
 * The deck's own navigation, in miniature — copied from wireDeck() in
 * test/progress-reporter-deck.test.ts and pointed at DECK-CAPTURE's ids: a
 * flat card list, one active card, and a `Next` disabled exactly while an
 * unanswered `[data-quiz]` card is showing. The answer handler is bound to
 * `.quiz-option`, which is where a real deck binds it — the option's own
 * button click reaches it by bubbling, so a picker that stops the event before
 * it lands is visibly a picker that did not answer the question.
 */
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

/** DECK-CAPTURE with its pager wired, at the jsdom top level. */
function loadDeck(): CaptureApi {
  const previous = (window as unknown as { __gmFavorites?: CaptureApi }).__gmFavorites;
  if (previous) previous.stop();
  document.body.innerHTML = DECK;
  const blob = document.createElement('script');
  blob.type = 'application/json';
  blob.id = 'gm-favorites';
  blob.textContent = JSON.stringify(CTX);
  document.body.appendChild(blob);
  wireDeck();
  window.eval(SRC);
  return getApi();
}

/** The instance living inside the frame, so afterEach can shut it down. */
let framed: CaptureApi | null = null;

/**
 * The real arrangement: a shell document with a topbar, framing a guide
 * document that loads the capture script. The guide's markup is written into
 * the frame rather than served — what is under test is the star reaching *out*
 * of the frame, not how the frame got its bytes. Built the way frameGuide()
 * in test/progress-reporter-header.test.ts builds it.
 */
function frameGuide(
  guideHtml = '<p>hi</p>',
  context: unknown = CTX
): { api: CaptureApi; frameDoc: Document; frameWindow: Window } {
  const previous = (window as unknown as { __gmFavorites?: CaptureApi }).__gmFavorites;
  if (previous) previous.stop();
  document.body.innerHTML = SHELL;
  const frame = document.createElement('iframe');
  document.querySelector('main')?.appendChild(frame);

  const frameDoc = frame.contentDocument as Document;
  frameDoc.open();
  frameDoc.write(`<!doctype html><html><head></head><body>${guideHtml}</body></html>`);
  frameDoc.close();

  if (context) {
    const blob = frameDoc.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-favorites';
    blob.textContent = JSON.stringify(context);
    frameDoc.body.appendChild(blob);
  }

  const frameWindow = frame.contentWindow as Window & { eval: (s: string) => void };
  frameWindow.eval(SRC);
  framed = (frameWindow as unknown as { __gmFavorites: CaptureApi }).__gmFavorites;
  return { api: framed, frameDoc, frameWindow };
}

/** Identity, element by element — `toEqual` on DOM nodes walks the whole tree. */
function sameNodes(got: Element[] | null, want: Element[]): void {
  expect(got).not.toBeNull();
  const nodes = got as Element[];
  expect(nodes).toHaveLength(want.length);
  want.forEach((el, i) => expect(nodes[i]).toBe(el));
}

const cards = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.card'));
const activeIndex = (): number => cards().findIndex((c) => c.classList.contains('active'));
const byText = (selector: string, text: string): HTMLElement => {
  const found = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (el) => (el.textContent || '').trim() === text
  );
  if (!found) throw new Error(`no ${selector} with text ${text}`);
  return found;
};
const toggle = (): HTMLElement | null => document.querySelector('.gm-fav-toggle');
const outline = (): HTMLElement | null => document.querySelector('.gm-fav-outline');
const toolbar = (): HTMLElement | null => document.querySelector('.gm-fav-toolbar');
const labelText = (): string => document.querySelector('.gm-fav-label')?.textContent || '';
const click = (el: Element): MouseEvent => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
};
const hover = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
};
const press = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};
/** A key pressed *in* a field, which is a different question from one pressed
 *  at the window: it reaches the field's own listener first and the picker's
 *  window listener second, and both have to agree about what it meant. */
const pressIn = (el: Element, key: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

const panel = (): HTMLElement | null => document.querySelector('.gm-fav-panel');
const titleField = (): HTMLInputElement => document.querySelector('.gm-fav-title') as HTMLInputElement;
const noteField = (): HTMLTextAreaElement =>
  document.querySelector('.gm-fav-note') as HTMLTextAreaElement;
const statusText = (): string => document.querySelector('.gm-fav-status')?.textContent || '';
/** Any of the picker's own buttons, wherever it currently lives — the toolbar
 *  is detached while the panel is up, so `toolbar()?.querySelector` would stop
 *  finding the ones that moved. */
const control = (name: string): HTMLButtonElement =>
  document.querySelector(`.gm-fav-${name}`) as HTMLButtonElement;

/**
 * Let the save chain settle.
 *
 * `save()` is a promise chain the click handler does not hand back, so the only
 * way to observe its result is to let the microtask queue drain — which fake
 * timers deliberately do not touch, so this stays a real await even under them.
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

afterEach(() => {
  if (framed) framed.stop();
  framed = null;
  const api = (window as unknown as { __gmFavorites?: CaptureApi }).__gmFavorites;
  if (api) api.stop();
  document.body.innerHTML = '';
});

describe('favorites capture — context and lifecycle', () => {
  it('reads the context blob exactly as spliced in, and starts', () => {
    const api = load(CTX);
    expect(api.readContext()).toEqual(CTX);
    expect(api.started()).toBe(true);
  });

  it('has no context, has not started, and marks nothing on the document without one', () => {
    const api = load(null);
    expect(api.readContext()).toBeNull();
    expect(api.started()).toBe(false);
    // init() only marks the document once there is something to capture
    // against — a guide framed without a context (never the case through
    // /asset, but the same defensive shape readContext already has) must not
    // claim a star is live when nothing backs it.
    expect(document.documentElement.hasAttribute('data-gm-favorites')).toBe(false);
    expect(toggle()).toBeNull();
  });

  it('reads a malformed blob as no context at all, rather than throwing', () => {
    // Same silence-on-malformed reasoning as the progress reporter's own
    // readContext: a broken blob means this frame cannot know which guide it
    // is in, and guessing would risk capturing a favorite against the wrong
    // one.
    const previous = (window as unknown as { __gmFavorites?: CaptureApi }).__gmFavorites;
    if (previous) previous.stop();
    document.body.innerHTML = '<p>hi</p>';
    const blob = document.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-favorites';
    blob.textContent = '{not json';
    document.body.appendChild(blob);
    window.eval(SRC);

    expect(getApi().readContext()).toBeNull();
  });

  it('stop() removes the load-guard attribute, so a fresh init() can run again', () => {
    const api = load(CTX);
    expect(document.documentElement.hasAttribute('data-gm-favorites')).toBe(true);
    api.stop();
    expect(document.documentElement.hasAttribute('data-gm-favorites')).toBe(false);
    expect(api.started()).toBe(false);
  });

  it('leaves the first instance in place when the script is evaluated twice without stop()', () => {
    // A second copy in one document would mount a second star and answer every
    // tap twice — the load guard exists so a document that somehow gets this
    // script spliced in more than once (or, here, evaluated twice into the
    // same jsdom window) keeps exactly one.
    const api = load(CTX);
    api.tag = 1;

    window.eval(SRC);

    const after = getApi();
    expect(after).toBe(api);
    expect(after.tag).toBe(1);
  });
});

describe('favorites capture — the star in the shell header', () => {
  it('mounts one star in the parent shell\'s breadcrumb line', () => {
    const { api } = frameGuide();
    expect(api.host()).toBe(document.querySelector('.topbar .crumbs'));

    const stars = document.querySelectorAll('.topbar .crumbs .gm-fav-toggle');
    expect(stars).toHaveLength(1);
    expect(stars[0].textContent).toBe('☆');
    expect(stars[0].getAttribute('aria-pressed')).toBe('false');
    expect(stars[0].getAttribute('aria-label')).toBe('Save a piece of this guide');
  });

  it('styles the star in the shell\'s document, since that is where it lives', () => {
    frameGuide();
    // A stylesheet injected into the frame could not reach an element parented
    // in the shell — the same split the resume notice already has.
    expect(document.querySelector('style[data-gm-favorites-shell-style]')).not.toBeNull();
  });

  it('floats the star in the guide itself when there is no shell around it', () => {
    // A guide opened straight off disk has no header to mount into. The star
    // still has to be reachable, so it falls back to a fixed corner of the
    // guide's own document.
    load(CTX);
    const star = toggle();
    expect(star).not.toBeNull();
    expect(star?.parentElement).toBe(document.body);
    expect(star?.classList.contains('gm-fav-floating')).toBe(true);
  });

  it('takes the star out of the header again on stop()', () => {
    const { api } = frameGuide();
    expect(document.querySelector('.topbar .crumbs .gm-fav-toggle')).not.toBeNull();
    api.stop();
    // The star describes *this* framed guide. Left behind, it would sit in a
    // header that has moved on to another one.
    expect(document.querySelector('.gm-fav-toggle')).toBeNull();
  });

  it('takes the star out of the header when the frame goes away', () => {
    const { frameWindow } = frameGuide();
    const FrameEvent = (frameWindow as unknown as { Event: typeof Event }).Event;
    frameWindow.dispatchEvent(new FrameEvent('pagehide'));
    expect(document.querySelector('.gm-fav-toggle')).toBeNull();
  });
});

describe('favorites capture — what a tap resolves to', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = load(CTX, DECK);
  });

  it('resolves a table cell to the whole table', () => {
    // Nobody wants to keep one cell of a declension table; the table is the
    // unit that means something.
    sameNodes(api.candidateAt(byText('td', 'mich')), [document.querySelector('table') as Element]);
  });

  it('resolves a paragraph to itself', () => {
    const lead = byText('p', 'lead');
    sameNodes(api.candidateAt(lead), [lead]);
  });

  it('resolves a quiz option button to the options block', () => {
    sameNodes(api.candidateAt(byText('button.quiz-option-btn', 'A')), [
      document.querySelector('.quiz-options') as Element
    ]);
  });

  it('resolves the deck\'s own pager to nothing at all', () => {
    // The nav is the deck's chrome, not its content — and a tap that resolves
    // to nothing is the tap that gets to reach the deck's own handler.
    expect(api.candidateAt(document.getElementById('next') as Element)).toBeNull();
  });

  it('resolves a heading to the heading alone', () => {
    // The smallest thing a tap can honestly mean. Taking the passage too would
    // hand the reader most of a card for touching one line of it — and with
    // the pointer no longer previewing, a tap is the only way to point at
    // anything, so it has to be the cheap move. The passage is one `wider`
    // away; see the widening suite.
    const heading = byText('h2', 'Die Tabelle');
    sameNodes(api.candidateAt(heading), [heading]);
  });

  it('still knows the passage a heading introduces', () => {
    // No longer what a tap produces, but still what the first `wider` from a
    // heading takes, so the derivation stays and stays tested.
    const heading = byText('h2', 'Die Tabelle');
    const card = heading.closest('.card') as Element;
    sameNodes(api.groupFor(heading), [
      heading,
      byText('p', 'lead'),
      card.querySelector('table') as Element,
      card.querySelector('blockquote') as Element
    ]);
  });
});

describe('favorites capture — what a tap resolves to, in a study build', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = load(DOC_CTX, DOC);
  });

  it('resolves a cell to the table, then widens to the section around it', () => {
    const table = document.querySelector('table') as Element;
    api.setCandidate(api.candidateAt(byText('td', 'a')));
    sameNodes(api.candidate(), [table]);

    expect(api.widen()).toBe(true);
    sameNodes(api.candidate(), [document.querySelectorAll('section')[0]]);

    // A section is as wide as a favorite goes: past it is the whole build.
    expect(api.widen()).toBe(false);
  });

  it('resolves a contents-rail link to nothing, list and all', () => {
    // The rail's `ul` matches the block list, so the nav rule is the only
    // thing keeping the contents from being a savable block.
    expect(api.candidateAt(document.querySelector('nav.toc a') as Element)).toBeNull();
    expect(api.candidateAt(document.querySelector('nav.toc ul') as Element)).toBeNull();
  });

  it('stops a heading group at the next heading of the same level', () => {
    sameNodes(api.groupFor(document.getElementById('lifecycle--2-turn') as Element), [
      document.getElementById('lifecycle--2-turn') as Element,
      byText('p', 'turn prose'),
      document.querySelector('table') as Element
    ]);
  });

  it('carries deeper headings along inside a shallower one\'s group', () => {
    const section = document.querySelectorAll('section')[0];
    sameNodes(api.groupFor(document.getElementById('lifecycle') as Element), [
      document.getElementById('lifecycle') as Element,
      byText('p', 'lifecycle intro'),
      document.getElementById('lifecycle--2-turn') as Element,
      byText('p', 'turn prose'),
      section.querySelector('table') as Element,
      document.getElementById('lifecycle--3-events') as Element,
      section.querySelector('pre') as Element
    ]);
  });

  it('widens a heading into its passage, and only then into its section', () => {
    // Two rungs where there used to be one. The reader who tapped a heading
    // asked for a line; `wider` offers them the passage it introduces before
    // it offers them the section, because skipping straight to the section is
    // the jump this whole change exists to remove.
    const heading = document.getElementById('lifecycle--2-turn') as Element;
    api.setCandidate(api.candidateAt(heading));
    sameNodes(api.candidate(), [heading]);

    expect(api.widen()).toBe(true);
    sameNodes(api.candidate(), api.groupFor(heading));

    expect(api.widen()).toBe(true);
    sameNodes(api.candidate(), [document.querySelectorAll('section')[0]]);
  });

  it('takes the whole build when the group starts at the h1', () => {
    const sections = document.querySelectorAll('section');
    sameNodes(api.groupFor(byText('h1', 'Hooks guide')), [
      byText('h1', 'Hooks guide'),
      sections[0],
      sections[1]
    ]);
  });
});

describe('favorites capture — what the selection is called', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = load(CTX, DECK);
  });

  it('names a table by its row count', () => {
    expect(api.labelFor([document.querySelector('table') as Element])).toBe('table · 3 rows');
  });

  it('names a card by its heading', () => {
    expect(api.labelFor([cards()[2]])).toBe('card · Die Tabelle');
  });

  it('names a bare heading a heading', () => {
    // One line is not a section. Calling it one would promise the passage the
    // reader has not taken yet — and the two selections are one `wider` apart,
    // so the toolbar is the only place that difference is visible.
    expect(api.labelFor([byText('h2', 'Die Tabelle')])).toBe('heading · Die Tabelle');
  });

  it('names a heading group a section', () => {
    expect(api.labelFor(api.groupFor(byText('h2', 'Die Tabelle')))).toBe('section · Die Tabelle');
  });

  it('names a pre block code, and a paragraph a paragraph', () => {
    // The label is what the reader is told they are about to keep, so it says
    // what the thing is rather than what tag it happens to be.
    expect(api.labelFor([document.querySelector('pre') as Element])).toBe('code');
    expect(api.labelFor([byText('p', 'lead')])).toBe('paragraph');
  });
});

describe('favorites capture — widening and narrowing', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = load(CTX, DECK);
  });

  it('climbs from the table to its card and stops there', () => {
    const table = document.querySelector('table') as Element;
    api.setCandidate([table]);

    expect(api.widen()).toBe(true);
    sameNodes(api.candidate(), [cards()[2]]);

    // A card is the widest a deck favorite goes — the next step up is the
    // section, which is most of the guide.
    expect(api.widen()).toBe(false);
    sameNodes(api.candidate(), [cards()[2]]);
  });

  it('comes back down the same way it went up', () => {
    const table = document.querySelector('table') as Element;
    api.setCandidate([table]);
    api.widen();

    expect(api.narrow()).toBe(true);
    sameNodes(api.candidate(), [table]);

    // Nothing inside a table is a block of its own, so there is nowhere left
    // to go.
    expect(api.narrow()).toBe(false);
    sameNodes(api.candidate(), [table]);
  });

  it('widens straight out of a heading that introduces nothing', () => {
    // The divider card's h2 is its last child, so the group is the heading
    // itself and the extra rung would be a `wider` that visibly did nothing.
    const heading = byText('h2', 'Jetzt: §2');
    api.setCandidate(api.candidateAt(heading));

    expect(api.widen()).toBe(true);
    sameNodes(api.candidate(), [heading.closest('.card') as Element]);
  });

  it('narrows a heading group back to its heading', () => {
    // A group is a run of siblings, not a container, so its step inward is the
    // heading that opens it rather than anything inside its first node. Asked
    // through setCandidate, so it holds without a climb stack to undo.
    const heading = byText('h2', 'Die Tabelle');
    api.setCandidate(api.groupFor(heading));

    expect(api.narrow()).toBe(true);
    sameNodes(api.candidate(), [heading]);

    // And the heading holds nothing: there is nowhere further down.
    expect(api.narrow()).toBe(false);
  });

  it('starts a fresh climb when a new block is picked', () => {
    const table = document.querySelector('table') as Element;
    api.setCandidate([table]);
    api.widen();

    // Pointing somewhere else abandons the climb: narrowing back into a card
    // the reader is no longer looking at would be a jump, not a step.
    api.setCandidate([byText('p', 'lead')]);
    expect(api.narrow()).toBe(false);
  });
});

describe('favorites capture — picking mode', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = loadDeck();
  });

  it('arms the picker, and says so in the star', () => {
    api.enter();
    expect(api.picking()).toBe(true);
    expect(toggle()?.textContent).toBe('★');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(outline()).not.toBeNull();
    expect(toolbar()).not.toBeNull();
    // Nothing picked yet, so there is nothing to draw a box around.
    expect(outline()?.hasAttribute('hidden')).toBe(true);
  });

  it('offers exactly the four controls, by name', () => {
    api.enter();
    expect(toolbar()?.querySelector('.gm-fav-wider')?.textContent).toBe('wider');
    expect(toolbar()?.querySelector('.gm-fav-narrower')?.textContent).toBe('narrower');
    expect(toolbar()?.querySelector('.gm-fav-save')?.textContent).toBe('Save');
    expect(toolbar()?.querySelector('.gm-fav-cancel')?.textContent).toBe('✕');
  });

  it('arms and disarms from the star itself', () => {
    click(toggle() as Element);
    expect(api.picking()).toBe(true);
    click(toggle() as Element);
    expect(api.picking()).toBe(false);
  });

  it('picks the block under a tap, names it, and boxes it', () => {
    api.enter();
    const event = click(byText('td', 'mich'));

    sameNodes(api.candidate(), [document.querySelector('table') as Element]);
    expect(labelText()).toBe('table · 3 rows');
    expect(outline()).not.toBeNull();
    expect(outline()?.hasAttribute('hidden')).toBe(false);
    // The guide's own handler for that tap must not also run — the tap meant
    // "keep this", not "do whatever this element does".
    expect(event.defaultPrevented).toBe(true);
  });

  it('picks a quiz\'s options without answering the quiz', () => {
    // The whole point of the capture-phase listener. Walk to the quiz card
    // first, where `Next` is gated on an answer: if the option's own handler
    // ran, the gate would open and the reader would have had the question
    // answered for them by a tap that meant "keep this".
    const next = document.getElementById('next') as HTMLButtonElement;
    click(next);
    click(next);
    click(next);
    expect(activeIndex()).toBe(3);
    expect(next.disabled).toBe(true);

    api.enter();
    click(byText('button.quiz-option-btn', 'A'));

    sameNodes(api.candidate(), [document.querySelector('.quiz-options') as Element]);
    expect(next.disabled).toBe(true);
  });

  it('lets a tap that resolves to nothing through to the deck', () => {
    api.enter();
    const next = document.getElementById('next') as HTMLButtonElement;
    const event = click(next);

    // The pager is the reader's way to get to the card they actually want to
    // keep something from, so arming the picker must not freeze the deck.
    expect(activeIndex()).toBe(1);
    expect(event.defaultPrevented).toBe(false);
    expect(api.candidate()).toBeNull();
  });

  it('ignores the pointer entirely', () => {
    // Hover used to pick, and the selection chased the pointer across the
    // guide — every heading it crossed boxing a whole passage, so landing on
    // anything meant out-running a target that moved. A tap is now the only
    // thing that selects.
    api.enter();
    hover(document.querySelector('pre') as Element);
    expect(api.candidate()).toBeNull();

    click(document.querySelector('pre') as Element);
    sameNodes(api.candidate(), [document.querySelector('pre') as Element]);

    hover(byText('p', 'lead'));
    sameNodes(api.candidate(), [document.querySelector('pre') as Element]);
  });

  it('widens and narrows from the arrow keys', () => {
    api.enter();
    click(byText('td', 'mich'));

    press('ArrowUp');
    sameNodes(api.candidate(), [cards()[2]]);
    press('ArrowDown');
    sameNodes(api.candidate(), [document.querySelector('table') as Element]);
  });

  it('disables the two controls exactly when they would do nothing', () => {
    api.enter();
    click(byText('td', 'mich'));
    const wider = () => toolbar()?.querySelector('.gm-fav-wider') as HTMLButtonElement;
    const narrower = () => toolbar()?.querySelector('.gm-fav-narrower') as HTMLButtonElement;
    expect(wider().disabled).toBe(false);
    // A table holds no block of its own, and nothing has been climbed yet.
    expect(narrower().disabled).toBe(true);

    click(wider());
    // At the card, which is as wide as it goes.
    expect(wider().disabled).toBe(true);
    expect(narrower().disabled).toBe(false);
  });

  it('disarms on Escape', () => {
    api.enter();
    click(byText('td', 'mich'));
    press('Escape');

    expect(api.picking()).toBe(false);
    expect(outline()).toBeNull();
    expect(toolbar()).toBeNull();
    expect(api.candidate()).toBeNull();
    expect(toggle()?.textContent).toBe('☆');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('disarms from the toolbar\'s own dismiss control', () => {
    api.enter();
    click(toolbar()?.querySelector('.gm-fav-cancel') as Element);
    expect(api.picking()).toBe(false);
  });

  it('gives the guide back every tap once it has been disarmed', () => {
    api.enter();
    api.leave();

    const event = click(byText('td', 'mich'));
    expect(event.defaultPrevented).toBe(false);
    expect(api.candidate()).toBeNull();
    expect(api.picking()).toBe(false);

    // And the deck's own handlers are reachable again.
    click(document.getElementById('next') as Element);
    expect(activeIndex()).toBe(1);
  });
});

/** DECK-CAPTURE's section eyebrow, in one place — every deck crumb starts with it. */
const SECTION_1 = '§1 · Die Tabelle und der Artikel-Trick';

describe('favorites capture — where a deck block sits', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = load(CTX, DECK);
  });

  it('addresses the block by the card that holds it, and by its section', () => {
    // The same pair progress.js stores: the flat index is the fallback, and
    // the section id plus offset is what survives a regeneration that rewrote
    // an earlier section and shifted every absolute index after it.
    expect(api.anchorFor([document.querySelector('table') as Element])).toEqual({
      kind: 'deck',
      cardIndex: 2,
      sectionId: 's1',
      cardOffset: 1
    });
    expect(api.anchorFor([document.querySelector('pre') as Element])).toEqual({
      kind: 'deck',
      cardIndex: 5,
      sectionId: 's2',
      cardOffset: 1
    });
  });

  it('gives a card outside every section an index and nothing else', () => {
    // A deck's opener and its recap sit outside every wrapper. Writing a
    // sectionId of '' or an offset of -1 there would be an address that
    // resolves — to the wrong card.
    const anchor = api.anchorFor([cards()[0]]);
    expect(anchor).toEqual({ kind: 'deck', cardIndex: 0 });
    expect(Object.keys(anchor as object).sort()).toEqual(['cardIndex', 'kind']);
  });

  it('has no address for something outside every card', () => {
    expect(api.anchorFor([document.querySelector('nav') as Element])).toBeNull();
    expect(api.anchorFor([])).toBeNull();
  });

  it('names the section and the card above the block', () => {
    expect(api.crumbFor([document.querySelector('table') as Element])).toEqual([
      SECTION_1,
      'Die Tabelle'
    ]);
  });

  it('drops the card title when the selection already carries it', () => {
    // The crumb is context *above* the block. Repeating the card's own h2 over
    // a selection that is the card — or a heading group starting at that very
    // h2 — would print the same words twice on the favorite's card.
    expect(api.crumbFor([cards()[2]])).toEqual([SECTION_1]);
    expect(api.crumbFor(api.groupFor(byText('h2', 'Die Tabelle')))).toEqual([SECTION_1]);
  });

  it('has no crumb at all for a card with neither eyebrow nor heading', () => {
    expect(api.crumbFor([cards()[0]])).toEqual([]);
  });

  it('titles a block by its own heading, then by the innermost crumb, then not at all', () => {
    expect(api.titleFor([cards()[2]], api.crumbFor([cards()[2]]))).toBe('Die Tabelle');
    // A table has no heading of its own, so the card it sits on names it.
    expect(api.titleFor([document.querySelector('table') as Element], [SECTION_1, 'Die Tabelle'])).toBe(
      'Die Tabelle'
    );
    // Nothing to go on: the server fills the gap, and inventing one here would
    // overwrite a better answer it already has.
    expect(api.titleFor([cards()[0]], [])).toBe('');
  });
});

describe('favorites capture — where a study build block sits', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = load(DOC_CTX, DOC);
  });

  it('addresses the block by the nearest id\'d heading above it', () => {
    expect(api.anchorFor([document.querySelector('table') as Element])).toEqual({
      kind: 'doc',
      anchorId: 'lifecycle--2-turn'
    });
    expect(api.anchorFor([byText('p', 'answer intro')])).toEqual({
      kind: 'doc',
      anchorId: 'answer-channel'
    });
  });

  it('addresses a heading group by its own heading', () => {
    // Not by the heading above it: a group *is* that section, so anchoring it
    // one level up would open the favorite a screen too early.
    expect(api.anchorFor(api.groupFor(document.getElementById('lifecycle--2-turn') as Element))).toEqual(
      { kind: 'doc', anchorId: 'lifecycle--2-turn' }
    );
  });

  it('is a doc position with no anchor when nothing above it carries an id', () => {
    const anchor = api.anchorFor(api.groupFor(byText('h1', 'Hooks guide')));
    expect(anchor).toEqual({ kind: 'doc' });
    expect(Object.keys(anchor as object)).toEqual(['kind']);
  });

  it('walks the heading chain above the block, outermost first', () => {
    expect(api.crumbFor([document.querySelector('table') as Element])).toEqual([
      'The lifecycle',
      '2. One turn'
    ]);
  });

  it('drops deeper levels once a shallower heading appears', () => {
    // `answer intro` sits under an h2 that came *after* two h3s. Those h3s are
    // sections the reader has left, not context they are inside.
    expect(api.crumbFor([byText('p', 'answer intro')])).toEqual(['The answer channel']);
  });

  it('never counts a heading the selection itself carries', () => {
    expect(api.crumbFor(api.groupFor(document.getElementById('lifecycle--2-turn') as Element))).toEqual([
      'The lifecycle'
    ]);
    // The outermost group there is: its own h2 is the block, and the only
    // heading above it carries no id.
    expect(api.crumbFor(api.groupFor(document.getElementById('lifecycle') as Element))).toEqual([]);
  });

  it('titles a heading group by the heading it starts at', () => {
    expect(api.titleFor(api.groupFor(document.getElementById('lifecycle--2-turn') as Element), ['The lifecycle'])).toBe(
      '2. One turn'
    );
  });
});

describe('favorites capture — the snapshot', () => {
  it('keeps the block\'s own markup, and its text with the whitespace collapsed', () => {
    const api = load(CTX, DECK);
    const shot = api.snapshot([document.querySelector('table') as Element]);
    // The snapshot is what the reader saw — the element itself, not a wrapper
    // around it.
    expect(shot.html.startsWith('<table')).toBe(true);
    expect(shot.text).toBe('Nominativ Akkusativ Dativ ich mich mir du dich dir');
  });

  it('strips scripts out of the snapshot', () => {
    const api = load(CTX, DECK);
    const shot = api.snapshot([cards()[6]]);
    expect(shot.html).toContain('Recap');
    // The favorites view renders this html back into the app's own document.
    // A generated guide's card can carry a script; the snapshot must not.
    expect(shot.html).not.toContain('<script');
    // And the text is the text of what is left, so it cannot smuggle the
    // script's source into search results either.
    expect(shot.text).toBe('Recap');
  });

  it('wraps a heading group in one div, and stops where the group stops', () => {
    const api = load(DOC_CTX, DOC);
    const shot = api.snapshot(api.groupFor(document.getElementById('lifecycle--2-turn') as Element));
    // Several sibling nodes are one favorite, so they need one root — a list
    // of top-level fragments would render as several clips.
    expect(shot.html.startsWith('<div>')).toBe(true);
    expect(shot.html).toContain('<h3');
    expect(shot.html).toContain('<table');
    expect(shot.html).not.toContain('3. Events');
  });
});

describe('favorites capture — the save panel', () => {
  let api: CaptureApi;
  let fetchMock: jest.Mock;

  /** Arm, pick the declension table, and open the panel over it. */
  const openOverTable = (): void => {
    api.enter();
    click(byText('td', 'mich'));
    click(control('save'));
  };

  beforeEach(() => {
    // Fake timers for the 1.5 s the success message stays up; the fetch itself
    // is a promise and settles on the microtask queue, which they leave alone.
    jest.useFakeTimers();
    api = loadDeck();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    (window as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as unknown as { fetch?: unknown }).fetch;
  });

  it('replaces the toolbar with a panel, prefilled and focused', () => {
    openOverTable();

    expect(panel()).not.toBeNull();
    // One control at a time: the toolbar's job is done, and leaving it up
    // would offer `wider` over a selection the panel is already naming.
    expect(toolbar()).toBeNull();
    expect(titleField().value).toBe('Die Tabelle');
    expect(noteField().value).toBe('');
    expect(noteField().getAttribute('placeholder')).toBe('why keep this?');
    expect(control('confirm').textContent).toBe('Save');
    expect(control('back').textContent).toBe('Back');
    // Focus in the title, so a reader with nothing to add saves with Enter.
    expect(document.activeElement).toBe(titleField());
  });

  it('posts exactly one draft, with everything derived from the block', async () => {
    openOverTable();
    noteField().value = 'Pronomen';
    click(control('confirm'));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/favorites');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      guidePath: '/g/deck.html',
      project: 'german-study-partner',
      guideTitle: 'Personalpronomen',
      anchor: { kind: 'deck', cardIndex: 2, sectionId: 's1', cardOffset: 1 },
      crumb: [SECTION_1, 'Die Tabelle'],
      html: expect.stringMatching(/^<table/) as unknown as string,
      text: 'Nominativ Akkusativ Dativ ich mich mir du dich dir',
      title: 'Die Tabelle',
      note: 'Pronomen'
    });
  });

  it('says so, then leaves, when the write lands', async () => {
    openOverTable();
    click(control('confirm'));
    await settle();

    expect(statusText()).toBe('saved ★');
    // The message is the whole confirmation, so it has to be readable before
    // the picker disappears out from under it.
    expect(api.picking()).toBe(true);

    // And Save is spent for that second and a half: the favorite exists, so a
    // second press could only make a twin of it.
    click(control('confirm'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1500);
    expect(api.picking()).toBe(false);
    expect(panel()).toBeNull();
    expect(toolbar()).toBeNull();
    expect(toggle()?.textContent).toBe('☆');
  });

  it('keeps the panel and everything typed into it when the write is refused', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 413 });
    openOverTable();
    titleField().value = 'Die Tabelle';
    noteField().value = 'Pronomen';
    click(control('confirm'));
    await settle();

    // Unlike a progress write, this is work the reader deliberately did —
    // losing their title and their note to a failed POST is the one outcome
    // this flow must not have.
    expect(statusText()).toBe("couldn't save — try again");
    expect(panel()).not.toBeNull();
    expect(titleField().value).toBe('Die Tabelle');
    expect(noteField().value).toBe('Pronomen');
    expect(api.picking()).toBe(true);
  });

  it('keeps the panel when the request never lands at all', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    openOverTable();
    click(control('confirm'));
    await settle();

    expect(statusText()).toBe("couldn't save — try again");
    expect(panel()).not.toBeNull();
    expect(api.picking()).toBe(true);
  });

  it('retries onto the same block after a failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    openOverTable();
    click(control('confirm'));
    await settle();
    expect(statusText()).toBe("couldn't save — try again");

    click(control('confirm'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusText()).toBe('saved ★');
  });

  it('posts once for a double-tapped Save', async () => {
    // The API deliberately does not dedupe — two clips of one block with two
    // notes is a thing a reader may want — so a doubled request would be two
    // favorites, and the second is nobody's intention.
    openOverTable();
    click(control('confirm'));
    click(control('confirm'));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('saves from Enter in the title, exactly as from the button', async () => {
    openOverTable();
    pressIn(titleField(), 'Enter');
    await settle();

    // Once, not twice: the picker's own window-level Enter is what opened this
    // panel, and it must not fire again while the panel has the keyboard.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe('saved ★');
  });

  it('sends the title the reader left in the field, trimmed', async () => {
    openOverTable();
    titleField().value = '  Tabelle  ';
    click(control('confirm'));
    await settle();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).title).toBe('Tabelle');
  });

  it('goes Back to the toolbar with the selection intact', () => {
    openOverTable();
    click(control('back'));

    expect(panel()).toBeNull();
    expect(toolbar()).not.toBeNull();
    sameNodes(api.candidate(), [document.querySelector('table') as Element]);
    expect(labelText()).toBe('table · 3 rows');
    expect(api.picking()).toBe(true);
  });

  it('cancels the scheduled exit when the reader goes Back inside it', async () => {
    openOverTable();
    click(control('confirm'));
    await settle();
    expect(statusText()).toBe('saved ★');

    // Nothing disables Back while the confirmation is up, and pressing it is a
    // reader saying "I have another one". The automatic exit was for the
    // reader who said nothing, so it is off.
    click(control('back'));
    jest.advanceTimersByTime(1500);
    expect(api.picking()).toBe(true);
    expect(toolbar()).not.toBeNull();

    // And the picker is not stuck: Save must never be a control that silently
    // does nothing, which is what a save-lock left on from the first write
    // would have made it.
    click(byText('p', 'lead'));
    click(control('save'));
    click(control('confirm'));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusText()).toBe('saved ★');
  });

  it('gives a reply the reader walked away from no say in the screen', async () => {
    let land: (value: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      })
    );
    openOverTable();
    click(control('confirm'));
    click(control('back'));
    land({ ok: true, status: 201 });
    await settle();

    // The favorite was written — the reader asked for it — but the panel it
    // was posted from is gone, so it may not schedule the picker's exit behind
    // their back.
    jest.advanceTimersByTime(1500);
    expect(api.picking()).toBe(true);
    expect(toolbar()).not.toBeNull();

    fetchMock.mockResolvedValue({ ok: true, status: 201 });
    click(control('save'));
    click(control('confirm'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusText()).toBe('saved ★');
  });

  it('lets no abandoned reply unlock a request that is still in the air', async () => {
    // Both requests are held open at once, so the two flows genuinely overlap
    // rather than taking turns.
    const pending: Array<(value: unknown) => void> = [];
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        })
    );

    // Flow A: confirm over the table, then Back before it answers. The settle
    // only drains microtasks — the request itself is still held open.
    openOverTable();
    click(control('confirm'));
    await settle();
    click(control('back'));

    // Flow B: another block, confirmed while A is still out there.
    click(byText('p', 'lead'));
    click(control('save'));
    click(control('confirm'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A lands last. It is disowned, so it says nothing and schedules nothing —
    // and it must not hand back the lock either: the lock it took was released
    // the moment the reader pressed Back, and the one set now belongs to B.
    pending[0]({ ok: true, status: 201 });
    await settle();

    // Nothing on screen changed, so the reader has every reason to press Save
    // again. That must not start a second write for the panel B is already
    // saving from — one panel, one favorite.
    click(control('confirm'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // And B still owns the panel when its own reply arrives.
    pending[1]({ ok: true, status: 201 });
    await settle();
    expect(statusText()).toBe('saved ★');
  });

  it('leaves the picker on Escape in the panel', () => {
    openOverTable();
    pressIn(titleField(), 'Escape');

    expect(api.picking()).toBe(false);
    expect(panel()).toBeNull();
    expect(toolbar()).toBeNull();
  });

  it('does not re-pick from the guide while the panel is up', () => {
    openOverTable();
    click(byText('p', 'Opener text'));

    // The panel is about *this* block: it was prefilled from it and the note
    // was written about it. A pointer crossing the guide on its way to the
    // note field must not swap the thing being saved.
    sameNodes(api.candidate(), [document.querySelector('table') as Element]);
    expect(titleField().value).toBe('Die Tabelle');
  });

  it('refuses to open over a block the guide has taken away', async () => {
    api.enter();
    click(byText('td', 'mich'));
    // A guide that re-renders — a deck rebuilt mid-session — can remove the
    // block out from under a picked selection. Its card index and its place in
    // document order are gone with it, so a draft built from it would address
    // some other card entirely.
    cards()[2].remove();
    click(control('save'));

    expect(panel()).toBeNull();
    expect(api.candidate()).toBeNull();
    expect(await api.save()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still saves a block the deck has merely hidden', async () => {
    // Hidden is not gone: the card's markup and its index are both intact, and
    // the snapshot is markup rather than a picture of the screen.
    const style = document.createElement('style');
    style.textContent = '.card{display:none}.card.active{display:block}';
    document.body.appendChild(style);
    const next = document.getElementById('next') as HTMLButtonElement;
    click(next);
    click(next);

    api.enter();
    click(byText('td', 'mich'));
    click(next);
    expect(activeIndex()).toBe(3);

    click(control('save'));
    click(control('confirm'));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).anchor).toEqual({
      kind: 'deck',
      cardIndex: 2,
      sectionId: 's1',
      cardOffset: 1
    });
  });
});

describe('favorites capture — the outline and the pointer', () => {
  let api: CaptureApi;
  beforeEach(() => {
    api = loadDeck();
  });

  it('leaves a widened selection and its climb alone while the pointer moves', () => {
    api.enter();
    click(byText('td', 'mich'));
    click(control('wider'));
    sameNodes(api.candidate(), [cards()[2]]);

    // The reader said "the whole card", and then moved the pointer — back
    // across the table they widened away from, and on to a block they never
    // asked for. Neither is a pick, and neither disturbs the climb.
    hover(byText('td', 'mich'));
    hover(document.querySelector('pre') as Element);
    sameNodes(api.candidate(), [cards()[2]]);

    expect(api.narrow()).toBe(true);
    sameNodes(api.candidate(), [document.querySelector('table') as Element]);
  });

  it('hides the outline when the deck hides the card the selection is on', () => {
    // Reachable while armed: a tap on `Next` resolves to nothing and passes
    // through, the deck swaps `.active`, and the selection is left inside a
    // card that renders nothing at all. Drawing its (empty) box would put a
    // 4×4 outline in the guide's top-left corner, describing a selection that
    // is not on screen.
    const style = document.createElement('style');
    style.textContent = '.card{display:none}.card.active{display:block}';
    document.body.appendChild(style);
    const next = document.getElementById('next') as HTMLButtonElement;
    click(next);
    click(next);

    api.enter();
    click(byText('td', 'mich'));
    expect(outline()?.hasAttribute('hidden')).toBe(false);

    click(next);
    // The picker is not told the deck moved; the outline is re-measured on the
    // reader's next scroll or resize, which is where this decision is made.
    window.dispatchEvent(new Event('scroll'));
    expect(outline()?.hasAttribute('hidden')).toBe(true);
  });

  it('hides the outline when the selection leaves the document', () => {
    api.enter();
    click(byText('td', 'mich'));
    cards()[2].remove();
    window.dispatchEvent(new Event('scroll'));

    expect(outline()?.hasAttribute('hidden')).toBe(true);
  });
});

/*
  The picker draws its chrome inside the guide's own document, and a generated
  guide brings whatever palette its generator wrote. The bug these cover: the
  in-frame stylesheet used to theme itself from the *guide's* token names with
  its own dark literals as fallbacks, so a guide publishing some of those names
  and not others got half of each palette. A tutor deck declaring `--fg:#1a1c20`
  and no `--panel` drew near-black text on the `#1b1b1b` fallback — a toolbar
  whose buttons were visible only by their borders, which came from the deck's
  own light `--line`.
*/
describe('favorites capture — the picker\'s own palette', () => {
  const scheme = (): string | null => document.documentElement.getAttribute('data-gm-fav-scheme');

  it('takes the light palette over a light guide', () => {
    const api = load(CTX, DECK);
    document.body.style.backgroundColor = '#ffffff';
    api.enter();

    expect(scheme()).toBe('light');
  });

  it('takes the dark palette over a dark guide', () => {
    const api = load(CTX, DECK);
    document.body.style.backgroundColor = '#14161a';
    api.enter();

    expect(scheme()).toBe('dark');
  });

  it('reads through a body that paints nothing to the page behind it', () => {
    const api = load(CTX, DECK);
    document.body.style.backgroundColor = '';
    document.documentElement.style.backgroundColor = '#14161a';
    api.enter();

    expect(scheme()).toBe('dark');
    document.documentElement.style.backgroundColor = '';
  });

  it('calls a guide that paints nothing at all a light one', () => {
    // An unstyled page is white in every engine, so white is what the picker
    // has to assume — guessing dark would put the old black slab back on the
    // one case that cannot be measured.
    const api = load(CTX, DECK);
    document.body.style.backgroundColor = '';
    api.enter();

    expect(scheme()).toBe('light');
  });

  it('re-reads the guide each time the picker mounts something', () => {
    const api = load(CTX, DECK);
    document.body.style.backgroundColor = '#ffffff';
    api.enter();
    expect(scheme()).toBe('light');

    // A deck that flips theme under the reader — these decks answer
    // prefers-color-scheme — must not leave the picker painted for the palette
    // it mounted against.
    api.leave();
    document.body.style.backgroundColor = '#14161a';
    api.enter();
    expect(scheme()).toBe('dark');
  });

  it('takes the stamp off the guide when the instance stops', () => {
    const api = load(CTX, DECK);
    api.enter();
    expect(scheme()).not.toBeNull();

    api.stop();
    expect(scheme()).toBeNull();
  });

  it('reads no custom property the in-frame sheet does not itself define', () => {
    // The invariant the bug broke, and the one worth keeping: inside the frame
    // the picker owns its whole palette. Every `var(--x)` it reads must be an
    // `--x:` it wrote, or the guide gets a say in half a colour pair and the
    // two halves disagree. The shell's sheet is deliberately not covered — it
    // mounts into the app's own header, where /theme.css is loaded and
    // inheriting the app's tokens is the point.
    const api = load(CTX, DECK);
    api.enter();
    const css = document.querySelector('style[data-gm-favorites-style]')?.textContent || '';
    expect(css).not.toBe('');

    const names = (re: RegExp): string[] => (css.match(re) || []).map((m) => /--[\w-]+/.exec(m)![0]);
    const declared = new Set(names(/--[\w-]+\s*:/g));
    const undeclared = names(/var\(\s*--[\w-]+/g).filter((n) => !declared.has(n));

    expect(Array.from(new Set(undeclared))).toEqual([]);
  });
});
