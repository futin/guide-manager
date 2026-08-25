/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'progress.js'), 'utf8');

/**
 * The resume notice, mounted in the guide's own header.
 *
 * `GET /guide` wraps every guide in a shell — a sticky topbar carrying the
 * breadcrumb and the title — and frames the guide itself. The reporter runs
 * inside that frame, which is where the cards and the scroll position are, but
 * the header is one document up.
 *
 * A floating pill was the first answer and the wrong one: it had to occlude
 * something, and on a deck it landed squarely in the deck's own sticky Back/Next
 * bar. The header occludes nothing and is where a statement about the guide
 * belongs — so the notice crosses the frame boundary to get there. It can,
 * because the two documents are same-origin by design; the shell already reaches
 * the other way to focus this frame.
 *
 * This suite is the only place that boundary is exercised. Every other reporter
 * suite runs at the jsdom top level, where `window.parent === window` and the
 * fallback is all that can happen.
 */
interface ReporterApi {
  showNotice(text: string): Element | null;
  headerHost(): Element | null;
  activeIndex(): number;
  stop(): void;
}

/** The shell, as server/src/render/render.util.ts writes it. */
const SHELL = `
  <header class="topbar">
    <div class="topbar-inner">
      <nav class="crumbs"><a class="back" href="/" target="_top">Guides</a></nav>
      <div class="topbar-title"><span class="crumb-title">Konnektoren</span><span class="badge tutor">tutor</span></div>
    </div>
  </header>
  <main class="wrap"></main>
`;

const DECK = `
  <div class="card active">one</div>
  <div class="card">two</div>
  <div class="card">three</div>
  <div class="card">four</div>
  <nav><button id="nav-back" disabled>Back</button><button id="nav-next">Next</button></nav>
`;

const CTX = {
  guidePath: '/g/deck.html',
  project: 'demo',
  kind: 'deck',
  progress: {
    guidePath: '/g/deck.html',
    percent: 66,
    furthestPercent: 66,
    position: { kind: 'deck', cardIndex: 2 },
    completed: false,
    lastOpenedAt: '2026-08-25T00:00:00.000Z',
    openCount: 2
  }
};

interface Framed {
  api: ReporterApi;
  frameDoc: Document;
  frameWindow: Window & { fetch: jest.Mock };
}

/**
 * Build the real arrangement: a shell document with a topbar, framing a guide
 * document that loads the reporter.
 *
 * The guide's markup is written into the frame rather than served, because what
 * is under test is the reporter reaching *out* of a frame — not how the frame
 * got its bytes.
 */
function frameGuide(guideHtml = DECK, context: unknown = CTX): Framed {
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
    blob.id = 'gm-progress';
    blob.textContent = JSON.stringify(context);
    frameDoc.body.appendChild(blob);
  }

  wireDeck(frameDoc);

  const frameWindow = frame.contentWindow as Window & { fetch: jest.Mock; eval: (s: string) => void };
  frameWindow.fetch = jest.fn(() => Promise.resolve({ ok: true })) as unknown as jest.Mock;
  frameWindow.eval(SRC);

  return {
    api: (frameWindow as unknown as { __gmProgress: ReporterApi }).__gmProgress,
    frameDoc,
    frameWindow
  };
}

/** The deck's own pager, inside the frame. */
function wireDeck(doc: Document): void {
  const cards = Array.from(doc.querySelectorAll<HTMLElement>('.card'));
  const next = doc.getElementById('nav-next') as HTMLButtonElement | null;
  const back = doc.getElementById('nav-back') as HTMLButtonElement | null;
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

const note = (): HTMLElement | null => document.querySelector('.gm-progress-note');
const noteButton = (): HTMLElement | null =>
  document.querySelector('.gm-progress-note [data-gm-restart]');

describe('progress reporter — the resume notice in the header', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the shell\'s breadcrumb line from inside the frame', () => {
    const { api } = frameGuide();
    expect(api.headerHost()).toBe(document.querySelector('.topbar .crumbs'));
  });

  it('falls back to the title row when a shell has no crumbs', () => {
    document.body.innerHTML = SHELL.replace(/<nav class="crumbs">[\s\S]*?<\/nav>/, '');
    const frame = document.createElement('iframe');
    document.querySelector('main')?.appendChild(frame);
    const doc = frame.contentDocument as Document;
    doc.open();
    doc.write(`<!doctype html><html><head></head><body>${DECK}</body></html>`);
    doc.close();
    const blob = doc.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-progress';
    blob.textContent = JSON.stringify(CTX);
    doc.body.appendChild(blob);
    wireDeck(doc);
    const win = frame.contentWindow as Window & { fetch: jest.Mock; eval: (s: string) => void };
    win.fetch = jest.fn(() => Promise.resolve({ ok: true })) as unknown as jest.Mock;
    win.eval(SRC);
    expect(note()?.parentElement?.className).toBe('topbar-title');
  });

  it('mounts the notice in the header, not over the guide', () => {
    const { frameDoc } = frameGuide();
    expect(note()).not.toBeNull();
    expect(note()?.textContent).toMatch(/resumed/i);
    // The floating pill was the thing that landed in a deck's own Back/Next bar.
    // With a header to use, it must not appear at all.
    expect(frameDoc.querySelector('.gm-progress-pill')).toBeNull();
  });

  it('leaves the title row alone, so the guide\'s name keeps its space', () => {
    frameGuide();
    const title = document.querySelector('.topbar-title') as HTMLElement;
    // Parked on the title row, the notice took ~200px of a 44rem column and the
    // guide's own name ellipsized to make room. The breadcrumb line has the slack
    // instead.
    expect(title.querySelector('.gm-progress-note')).toBeNull();
    expect(title.children).toHaveLength(2);
    expect(note()?.parentElement?.className).toBe('crumbs');
  });

  it('styles it in the header\'s document, since that is where the element lives', () => {
    frameGuide();
    // A stylesheet injected into the frame could not reach an element parented
    // in the shell.
    expect(document.querySelector('style[data-gm-progress-note-style]')).not.toBeNull();
  });

  it('start over still works from the header, with no message channel', () => {
    const { api, frameWindow } = frameGuide();
    frameWindow.fetch.mockClear();

    (noteButton() as HTMLElement).click();

    // The button is parented in the shell but its handler is a closure from the
    // frame, so it drives the frame's own deck and posts from the frame.
    expect(api.activeIndex()).toBe(0);
    const deletes = frameWindow.fetch.mock.calls.filter(
      (c) => (c[1] as { method: string }).method === 'DELETE'
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toBe('/api/progress?guidePath=' + encodeURIComponent('/g/deck.html'));
    expect(note()).toBeNull();
  });

  it('stays in the header rather than fading', () => {
    jest.useFakeTimers();
    frameGuide();
    jest.advanceTimersByTime(30000);
    // The pill faded because it sat on top of the guide. This does not, so the
    // reason to remove it is gone — and "start over" stays reachable later
    // instead of only in the seconds after the guide opened.
    expect(note()).not.toBeNull();
    jest.useRealTimers();
  });

  it('leaves the header alone when nothing was restored', () => {
    frameGuide(DECK, { guidePath: '/g/deck.html', project: 'demo', kind: 'deck', progress: null });
    expect(note()).toBeNull();
  });

  it('removes itself when the frame goes away', () => {
    const { frameWindow } = frameGuide();
    expect(note()).not.toBeNull();
    // The frame's own Event constructor, reached through its window: an event
    // built from the outer realm is a different class and its listeners here
    // would not fire.
    const FrameEvent = (frameWindow as unknown as { Event: typeof Event }).Event;
    frameWindow.dispatchEvent(new FrameEvent('pagehide'));
    // A notice describing a guide that is no longer framed is a stale claim
    // sitting in a header that now belongs to something else.
    expect(note()).toBeNull();
  });

  it('does not stack two notices in one header', () => {
    const { api } = frameGuide();
    api.showNotice('again');
    expect(document.querySelectorAll('.gm-progress-note')).toHaveLength(1);
  });
});
