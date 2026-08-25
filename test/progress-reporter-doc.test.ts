/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'assets', 'progress.js'), 'utf8');

/**
 * The study-build half of the reporter.
 *
 * A study guide's `index.html` is one long scrolling page holding every chapter.
 * Its position is a scroll offset — but a stored offset lands somewhere else the
 * moment the reader changes the text-size setting and the page reflows, so what
 * is stored is the last heading scrolled past, with the percent kept beside it
 * for the board and as the fallback for a build with no id'd headings.
 *
 * Loaded into a real jsdom window rather than a bare node:vm sandbox the way
 * test/bionic.test.ts loads the reading aid: unlike the aid's word-splitting,
 * almost everything here *is* DOM and event plumbing, and a sandbox would only
 * let us test the two arithmetic helpers.
 */
interface ReporterApi {
  readContext(): { guidePath: string; kind: string } | null;
  docAnchor(root: Document | HTMLElement, scrollY: number): string | null;
  docPercent(scrollY: number, viewport: number, height: number): number;
  restoreDoc(): boolean;
  report(patch: Record<string, unknown>): void;
  reset(): void;
  init(): void;
  stop(): void;
}

const DOC = `
  <h2 id="intro">Intro</h2><p>one</p>
  <h2 id="pipeline">Pipeline</h2><p>two</p>
  <h3 id="pipeline--why">Why</h3><p>three</p>
`;

const ctx = (progress: unknown = null) => ({
  guidePath: '/g/study/index.html',
  project: 'demo',
  kind: 'doc',
  progress
});

/*
  One jsdom window serves the whole file, so a previous test's reporter is still
  bound to it. Stopping it first is what keeps each test's assertion about "one
  write" a statement about one reporter rather than about however many earlier
  tests happened to run — a live predecessor answers the same scroll event
  against its own stale context.
*/
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
  window.eval(SRC);
  return (window as unknown as { __gmProgress: ReporterApi }).__gmProgress;
}

/** jsdom lays nothing out, so every offsetTop the reporter reads has to be
 *  supplied. Same reason `document.documentElement.scrollHeight` is stubbed
 *  where a test needs a page taller than the viewport. */
function stubTops(tops: Record<string, number>): void {
  for (const id of Object.keys(tops)) {
    Object.defineProperty(document.getElementById(id) as HTMLElement, 'offsetTop', {
      value: tops[id],
      configurable: true
    });
  }
}

const fetchMock = (): jest.Mock => window.fetch as unknown as jest.Mock;
const bodyOf = (call: unknown[]): Record<string, unknown> =>
  JSON.parse((call[1] as { body: string }).body);

describe('progress reporter — doc mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing at all without a context blob', () => {
    const api = load(DOC, null);
    expect(api.readContext()).toBeNull();
    api.init();
    // The reporter is injected into whatever the server hands the frame. A
    // document with no context is one nobody asked it to track: it must not
    // post, must not decorate, and must not throw.
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('ignores a malformed context rather than guessing a guide', () => {
    document.body.innerHTML = DOC;
    const blob = document.createElement('script');
    blob.type = 'application/json';
    blob.id = 'gm-progress';
    blob.textContent = '{ not json';
    document.body.appendChild(blob);
    window.eval(SRC);
    const api = (window as unknown as { __gmProgress: ReporterApi }).__gmProgress;
    // Reporting against a guessed path would write one guide's position onto
    // another's row.
    expect(api.readContext()).toBeNull();
  });

  it('reports the last heading scrolled past, not the next one', () => {
    const api = load(DOC, ctx());
    stubTops({ intro: 0, pipeline: 900, 'pipeline--why': 1400 });
    expect(api.docAnchor(document, 1000)).toBe('pipeline');
    expect(api.docAnchor(document, 100)).toBe('intro');
    expect(api.docAnchor(document, 1500)).toBe('pipeline--why');
  });

  it('reports no anchor above the first heading', () => {
    const api = load('<p>preamble</p>' + DOC, ctx());
    stubTops({ intro: 400, pipeline: 900, 'pipeline--why': 1400 });
    // A reader still in the preamble has passed nothing. Naming the first
    // heading anyway would resume them below where they actually stopped.
    expect(api.docAnchor(document, 10)).toBeNull();
  });

  it('computes a percent from the scrollable distance, not the raw offset', () => {
    const api = load(DOC, ctx());
    expect(api.docPercent(0, 800, 2400)).toBe(0);
    expect(api.docPercent(800, 800, 2400)).toBe(50);
    // The last screenful is the end of the document, not 67% of it: a reader who
    // cannot scroll any further has reached the bottom.
    expect(api.docPercent(1600, 800, 2400)).toBe(100);
  });

  it('treats a document shorter than the viewport as finished', () => {
    const api = load(DOC, ctx());
    // Zero scrollable distance must not divide by zero — and a page that fits on
    // screen has been read as far as it can be.
    expect(api.docPercent(0, 800, 600)).toBe(100);
  });

  it('reports an unmeasured page as 0, not as finished', () => {
    const api = load(DOC, ctx());
    // A framed guide can run this script before layout settles, and 100 would
    // cross the completion threshold — which is only ever set, never cleared. A
    // guide that marked itself read on open could not be un-read.
    expect(api.docPercent(0, 800, 0)).toBe(0);
  });

  it('restores to a stored anchor', () => {
    const api = load(DOC, ctx({ percent: 40, furthestPercent: 40, position: { kind: 'doc', anchorId: 'pipeline' } }));
    const spy = jest.fn();
    (document.getElementById('pipeline') as HTMLElement).scrollIntoView = spy;
    expect(api.restoreDoc()).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to the percent when the stored anchor is gone', () => {
    const api = load(DOC, ctx({ percent: 50, furthestPercent: 50, position: { kind: 'doc', anchorId: 'renamed' } }));
    const spy = jest.fn();
    window.scrollTo = spy;
    // A heading id is derived from a slug, so renaming a chapter retires its
    // anchor. The percent is coarser but it is never stale in that way.
    expect(api.restoreDoc()).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('does not restore, or claim to, when nothing is stored', () => {
    const api = load(DOC, ctx(null));
    expect(api.restoreDoc()).toBe(false);
  });

  it('does not restore a percent of zero', () => {
    const api = load(DOC, ctx({ percent: 0, furthestPercent: 0, position: null }));
    const spy = jest.fn();
    window.scrollTo = spy;
    // The top is where the page already is. "Resumed" over a guide sitting at
    // its first line is a claim the reader can see is false.
    expect(api.restoreDoc()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('posts the open exactly once on init, and says it is one', () => {
    const api = load(DOC, ctx());
    api.init();
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/progress');
    expect((init as { method: string }).method).toBe('POST');
    const body = bodyOf(fetchMock().mock.calls[0]);
    expect(body).toMatchObject({ guidePath: '/g/study/index.html', project: 'demo', opened: true });
    expect((body.position as { kind: string }).kind).toBe('doc');
  });

  it('debounces scroll reports, and does not call them opens', () => {
    jest.useFakeTimers();
    const api = load(DOC, ctx());
    api.init();
    fetchMock().mockClear();

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(fetchMock()).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    // openCount counts sessions. A debounced position write that claimed to be
    // an open would turn it into a scroll-event counter.
    expect(bodyOf(fetchMock().mock.calls[0]).opened).toBeUndefined();
  });

  it('flushes a pending report when the tab is hidden', () => {
    jest.useFakeTimers();
    const api = load(DOC, ctx());
    api.init();
    fetchMock().mockClear();

    window.dispatchEvent(new Event('scroll'));
    // The phone case: the tab is backgrounded rather than closed, so a purely
    // debounced write is simply lost — and the phone is the whole reason this
    // feature exists.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect((fetchMock().mock.calls[0][1] as { keepalive: boolean }).keepalive).toBe(true);
  });

  it('flushes on pagehide too', () => {
    jest.useFakeTimers();
    const api = load(DOC, ctx());
    api.init();
    fetchMock().mockClear();
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does not post on being hidden with nothing pending', () => {
    jest.useFakeTimers();
    const api = load(DOC, ctx());
    api.init();
    fetchMock().mockClear();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // Backgrounding a guide nobody scrolled is not news.
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('marks a doc read at the bottom and never unmarks it', () => {
    const api = load(DOC, ctx());
    api.init();
    fetchMock().mockClear();

    api.report({ percent: 99 });
    expect(bodyOf(fetchMock().mock.calls[0]).completed).toBe(true);

    api.report({ percent: 12 });
    // completed is only ever set: the server reads an omitted flag as "no
    // opinion", so a glance back at page one must send nothing rather than false.
    expect(bodyOf(fetchMock().mock.calls[1]).completed).toBeUndefined();
  });

  it('resets through the endpoint the viewer uses', () => {
    const api = load(DOC, ctx({ percent: 40, furthestPercent: 40, position: null }));
    fetchMock().mockClear();
    api.reset();
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/progress?guidePath=' + encodeURIComponent('/g/study/index.html'));
    expect((init as { method: string }).method).toBe('DELETE');
  });

  it('swallows a failed write', async () => {
    const api = load(DOC, ctx());
    fetchMock().mockImplementation(() => Promise.reject(new Error('offline')));
    // The reading session is the point. An unhandled rejection inside a guide's
    // own document is a console full of noise over a lost byte of bookkeeping.
    expect(() => api.init()).not.toThrow();
    await Promise.resolve();
  });

  it('survives a document with no headings at all', () => {
    const api = load('<p>just prose</p>', ctx());
    expect(api.docAnchor(document, 500)).toBeNull();
    expect(() => api.init()).not.toThrow();
    expect(bodyOf(fetchMock().mock.calls[0]).position).toEqual({ kind: 'doc' });
  });
});
