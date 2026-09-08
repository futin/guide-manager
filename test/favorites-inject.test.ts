import {
  injectFavoritesCapture,
  injectProgressReporter,
  injectReadingAid
} from '../server/src/render/render.util';
import type { FavoritesContext, ProgressContext } from '../server/src/render/render.util';

const fctx: FavoritesContext = {
  guidePath: '/g/deck.html',
  project: 'demo',
  guideTitle: 'Deck',
  kind: 'deck'
};

const pctx: ProgressContext = {
  guidePath: '/g/deck.html',
  project: 'demo',
  kind: 'deck',
  progress: null
};

const page = (body = '<p>hi</p>') =>
  `<!doctype html><html><head><title>G</title></head><body>${body}</body></html>`;

const contextJson = (html: string): string =>
  /id="gm-favorites">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

/**
 * The framed-guide half of favorites capture.
 *
 * A tap-to-keep gesture only makes sense from inside the framed document: the
 * table, the diagram or the paragraph the reader wants to keep lives inside the
 * iframe, same as the progress reporter's cards and headings. So this splice
 * follows the exact pattern injectProgressReporter already established —
 * same context-blob shape, same escaping, same skip-if-already-present guard —
 * rather than inventing a second way to get a script into a framed guide.
 */
describe('injectFavoritesCapture', () => {
  it('inlines the context and loads the capture script at the end of the body', () => {
    const out = injectFavoritesCapture(page(), fctx);

    expect(out).toContain('<script type="application/json" id="gm-favorites">');
    expect(out).toContain('<script src="/favorites.js"></script>');
    // Placement is the contract: the context has to be parsed before the script
    // that reads it runs, and the script has to find the guide's own markup
    // already in the DOM.
    expect(out.indexOf('gm-favorites')).toBeLessThan(out.indexOf('/favorites.js'));
    expect(out.indexOf('<p>hi</p>')).toBeLessThan(out.indexOf('/favorites.js'));
    expect(out.indexOf('/favorites.js')).toBeLessThan(out.indexOf('</body>'));
  });

  it('round-trips the context as JSON', () => {
    const out = injectFavoritesCapture(page(), fctx);
    expect(JSON.parse(contextJson(out))).toEqual({
      guidePath: '/g/deck.html',
      project: 'demo',
      guideTitle: 'Deck',
      kind: 'deck'
    });
  });

  it('escapes a closing script tag inside the context', () => {
    // A guide path is a filesystem path and can hold anything a filesystem
    // allows. Left raw, a path containing </script> would end the JSON block
    // early and spill the rest of the context into the document as markup.
    const out = injectFavoritesCapture(page(), { ...fctx, guidePath: '/g/</script><b>x</b>.html' });
    expect(out).not.toContain('</script><b>x</b>');
    expect((JSON.parse(contextJson(out)) as { guidePath: string }).guidePath).toBe(
      '/g/</script><b>x</b>.html'
    );
  });

  it('skips a document that already carries a capture script', () => {
    // Two copies would each mount a star in the header and each listen for taps —
    // one star toggling behind the other's back, and every tap answered twice.
    const vendored = page('<p>hi</p><script>/* favorites v1 */</script>');
    expect(injectFavoritesCapture(vendored, fctx)).toBe(vendored);
  });

  it('composes with the reading aid and the progress reporter without clobbering either', () => {
    const out = injectFavoritesCapture(injectProgressReporter(injectReadingAid(page()), pctx), fctx);
    expect(out).toContain('/bionic.css');
    expect(out).toContain('/bionic.js');
    expect(out).toContain('/progress.js');
    expect(out).toContain('/favorites.js');
    expect(out).toContain('gm-progress');
    expect(out).toContain('gm-favorites');
    // The reporter's script has to run — and so parse its own context — before
    // the capture script's blob appears, the same ordering injectProgressReporter
    // itself guards between the reading aid and its own splice point.
    expect(out.indexOf('/progress.js')).toBeLessThan(out.indexOf('gm-favorites'));
  });

  it('still injects into a document with no closing body tag', () => {
    // Hand-written and older generated builds are not reliably well-formed, and
    // dropping the capture script over a missing tag would put back the silence
    // this exists to fix.
    const out = injectFavoritesCapture('<html><body><p>hi</p>', fctx);
    expect(out).toContain('/favorites.js');
    expect(out).toContain('gm-favorites');
  });
});
