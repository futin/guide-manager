import { partitionSeries, seriesOf } from '../client/src/lib/series';

/*
  The derivation is the whole contract between the tutor skill's naming
  convention and the board's shelves, so it gets a table of near-misses: every
  case here is a real way a file could *almost* look like a series lesson, and
  each must stay loose rather than being dressed up as a shelf.
*/
describe('seriesOf', () => {
  it('derives series and order from <dir>/<dir>-N-<desc>.html', () => {
    expect(
      seriesOf('/p/docs/guides/tutor/mongo-internals/mongo-internals-2-indexes.html')
    ).toEqual({
      dir: '/p/docs/guides/tutor/mongo-internals',
      name: 'mongo-internals',
      order: 2,
    });
  });

  it('accepts .htm and mixed-case extensions, like register.js does', () => {
    expect(seriesOf('/p/s/s-1-intro.HTML')?.order).toBe(1);
    expect(seriesOf('/p/s/s-1-intro.htm')?.order).toBe(1);
  });

  it('reads multi-digit orders', () => {
    expect(seriesOf('/p/s/s-12-late-lesson.html')?.order).toBe(12);
  });

  /* A series slug that itself contains `-N-` must not confuse the parse: the
     directory name is matched as a literal prefix, so the *last* number after
     it is never mistaken for the order. */
  it('handles a series name containing digits and hyphens', () => {
    expect(seriesOf('/a/a-1-b/a-1-b-2-c.html')).toEqual({
      dir: '/a/a-1-b',
      name: 'a-1-b',
      order: 2,
    });
  });

  it('rejects a filename whose prefix is not the parent directory name', () => {
    // Looks exactly like a lesson, but it lives in the wrong directory — an
    // ordinary hyphenated filename, not series membership.
    expect(seriesOf('/p/other-dir/mongo-internals-2-indexes.html')).toBeNull();
  });

  it('rejects a standalone deck', () => {
    expect(seriesOf('/p/docs/guides/tutor/foo-deck.html')).toBeNull();
  });

  it('rejects a lesson with no description slug', () => {
    expect(seriesOf('/p/s/s-1-.html')).toBeNull();
  });

  it('rejects non-HTML files', () => {
    expect(seriesOf('/p/s/s-1-notes.md')).toBeNull();
  });
});

describe('partitionSeries', () => {
  const g = (path: string) => ({ path });

  it('splits shelves from loose and sorts lessons by order, not input order', () => {
    const { shelves, loose } = partitionSeries([
      g('/p/s/s-3-third.html'),
      g('/p/plain.html'),
      g('/p/s/s-1-first.html'),
      g('/p/s/s-2-second.html'),
    ]);
    expect(loose.map((x) => x.path)).toEqual(['/p/plain.html']);
    expect(shelves).toHaveLength(1);
    expect(shelves[0].key).toBe('/p/s');
    expect(shelves[0].name).toBe('s');
    expect(shelves[0].lessons.map((l) => l.order)).toEqual([1, 2, 3]);
  });

  /* Two projects can both hold a series named `basics`; the directory *path*
     is the identity, so they must come back as two shelves, never merged. */
  it('keys shelves by directory path, not by series name', () => {
    const { shelves } = partitionSeries([
      g('/p/basics/basics-1-a.html'),
      g('/q/basics/basics-1-b.html'),
    ]);
    expect(shelves.map((s) => s.key).sort()).toEqual(['/p/basics', '/q/basics']);
  });

  it('keeps a single matching lesson as a shelf of 1', () => {
    const { shelves, loose } = partitionSeries([g('/p/s/s-1-only.html')]);
    expect(loose).toEqual([]);
    expect(shelves).toHaveLength(1);
    expect(shelves[0].lessons).toHaveLength(1);
  });

  /* A numbering gap is not an error — N is a suggestion, and lesson 2 may be
     unregistered. Ascending order is all the shelf promises. */
  it('tolerates gaps in the numbering', () => {
    const { shelves } = partitionSeries([
      g('/p/s/s-4-d.html'),
      g('/p/s/s-1-a.html'),
      g('/p/s/s-3-c.html'),
    ]);
    expect(shelves[0].lessons.map((l) => l.order)).toEqual([1, 3, 4]);
  });
});
