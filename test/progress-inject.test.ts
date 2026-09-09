import { injectProgressReporter, injectReadingAid, parseJump } from '../server/src/render/render.util';
import type { ProgressContext } from '../server/src/render/render.util';

const ctx: ProgressContext = {
  guidePath: '/g/deck.html',
  project: 'demo',
  kind: 'deck',
  progress: null
};

const page = (body = '<p>hi</p>') =>
  `<!doctype html><html><head><title>G</title></head><body>${body}</body></html>`;

const contextJson = (html: string): string =>
  /id="gm-progress">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

/**
 * The framed-guide half of progress tracking.
 *
 * A guide is served verbatim into an iframe, so nothing on the page shell can
 * see its cards or its scroll position — the shell's only text is the
 * breadcrumb. The reporter has to be spliced into the framed document itself,
 * and it is served from this repo rather than vendored per guide, so a build
 * generated before this feature existed reports and restores without being
 * regenerated.
 */
describe('injectProgressReporter', () => {
  it('inlines the context and loads the reporter at the end of the body', () => {
    const out = injectProgressReporter(page(), ctx);

    expect(out).toContain('<script type="application/json" id="gm-progress">');
    expect(out).toContain('<script src="/progress.js"></script>');
    // Placement is the contract, not an accident: the context has to be parsed
    // before the script that reads it runs, and the script has to find the
    // document's own cards and headings already in the DOM.
    expect(out.indexOf('gm-progress')).toBeLessThan(out.indexOf('/progress.js'));
    expect(out.indexOf('<p>hi</p>')).toBeLessThan(out.indexOf('/progress.js'));
    expect(out.indexOf('/progress.js')).toBeLessThan(out.indexOf('</body>'));
  });

  it('round-trips the context as JSON', () => {
    const out = injectProgressReporter(page(), { ...ctx, kind: 'doc' });
    expect(JSON.parse(contextJson(out))).toEqual({
      guidePath: '/g/deck.html',
      project: 'demo',
      kind: 'doc',
      progress: null
    });
  });

  it('carries the stored progress through to the frame', () => {
    const out = injectProgressReporter(page(), {
      ...ctx,
      progress: {
        guidePath: '/g/deck.html',
        percent: 40,
        furthestPercent: 70,
        position: { kind: 'deck', cardIndex: 7, sectionId: 's2', cardOffset: 1 },
        completed: false,
        lastOpenedAt: '2026-08-25T10:00:00.000Z',
        openCount: 3
      }
    });
    // The restore has to be able to run on the reporter's first frame. A fetch
    // from inside the iframe would put a round trip in front of it, which the
    // reader sees as the guide jumping after it had already painted.
    expect(JSON.parse(contextJson(out)).progress.position).toEqual({
      kind: 'deck',
      cardIndex: 7,
      sectionId: 's2',
      cardOffset: 1
    });
  });

  it('escapes a closing script tag inside the context', () => {
    // A guide path is a filesystem path and can hold anything a filesystem
    // allows. Left raw, a path containing </script> would end the JSON block
    // early and spill the rest of the context into the document as markup.
    const out = injectProgressReporter(page(), { ...ctx, guidePath: '/g/</script><b>x</b>.html' });
    expect(out).not.toContain('</script><b>x</b>');
    expect((JSON.parse(contextJson(out)) as { guidePath: string }).guidePath).toBe(
      '/g/</script><b>x</b>.html'
    );
  });

  it('skips a document that already carries a reporter', () => {
    // Two copies would both restore and both report, and each closes over its
    // own pending-replay state — so one would drive the deck forward while the
    // other read that as the reader navigating and cancelled itself.
    const vendored = page('<p>hi</p><script>/* progress v1 */</script>');
    expect(injectProgressReporter(vendored, ctx)).toBe(vendored);
  });

  it('composes with the reading aid without either clobbering the other', () => {
    const out = injectProgressReporter(injectReadingAid(page()), ctx);
    expect(out).toContain('/bionic.css');
    expect(out).toContain('/bionic.js');
    expect(out).toContain('/progress.js');
  });

  it('still injects into a document with no closing body tag', () => {
    // Hand-written and older generated builds are not reliably well-formed, and
    // dropping the reporter over a missing tag would put back the silence this
    // exists to fix.
    const out = injectProgressReporter('<html><body><p>hi</p>', ctx);
    expect(out).toContain('/progress.js');
    expect(out).toContain('gm-progress');
  });

  it('round-trips a favorite\'s anchor as jumpTo', () => {
    const out = injectProgressReporter(page(), { ...ctx, jumpTo: { kind: 'doc', anchorId: 'x' } });
    expect(JSON.parse(contextJson(out)).jumpTo).toEqual({ kind: 'doc', anchorId: 'x' });
  });

  it('omits jumpTo from the blob rather than writing a null', () => {
    // A context with no favorite anchor is the common case, and the reporter
    // already reads a missing key as "nothing to jump to" the same way it
    // reads a missing `kind` — writing `"jumpTo":null` into every context that
    // carries no anchor would be noise with no reader.
    const out = injectProgressReporter(page(), { ...ctx, jumpTo: null });
    expect(JSON.parse(contextJson(out))).not.toHaveProperty('jumpTo');
  });
});

/**
 * The server-side half of a favorite's "open in guide": turning the `at` query
 * string on `GET /guide` / `GET /asset` into a `GuidePosition`, or `null` for
 * anything that is not one.
 *
 * Built on `parsePosition` (exported from progress.dto for exactly this) rather
 * than duplicating its validation — a deck position or a doc position means the
 * same thing whether it arrived in a POST body or in this query string.
 */
describe('parseJump', () => {
  it('returns null when there is no at param at all', () => {
    expect(parseJump(undefined)).toBeNull();
  });

  it('returns null for a value that is not JSON', () => {
    expect(parseJump('not json')).toBeNull();
  });

  it('returns null for JSON that parsePosition rejects', () => {
    // cardIndex has to be a non-negative integer; a string fails the same way
    // it would coming from a POST body.
    expect(parseJump(JSON.stringify({ kind: 'deck', cardIndex: 'x' }))).toBeNull();
  });

  it('parses a valid deck position', () => {
    expect(
      parseJump(JSON.stringify({ kind: 'deck', cardIndex: 3, sectionId: 's2', cardOffset: 1 }))
    ).toEqual({ kind: 'deck', cardIndex: 3, sectionId: 's2', cardOffset: 1 });
  });

  it('parses a valid doc position', () => {
    expect(parseJump(JSON.stringify({ kind: 'doc', anchorId: 'x' }))).toEqual({
      kind: 'doc',
      anchorId: 'x'
    });
  });
});
