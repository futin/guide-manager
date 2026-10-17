/**
 * @jest-environment jsdom
 */
import {
  LAST_SEEN_KEY,
  chipLabel,
  compareVersions,
  displayTitle,
  dotState,
  formatReleaseDate,
  readLastSeen,
  renderNotes,
  writeLastSeen
} from '../client/src/lib/releases';

describe('dotState', () => {
  it('no newest release: no dot, nothing stored', () => {
    expect(dotState(null, '0.1.0', false)).toEqual({ dot: false, seed: null });
  });

  it('a first visit seeds the newest without a dot', () => {
    expect(dotState('0.3.0', null, false)).toEqual({ dot: false, seed: '0.3.0' });
  });

  it('a stored value that is not a version is a first visit, not "everything is new"', () => {
    expect(dotState('0.3.0', 'v0.2.0', false)).toEqual({ dot: false, seed: '0.3.0' });
    expect(dotState('0.3.0', '{"x":1}', false)).toEqual({ dot: false, seed: '0.3.0' });
  });

  it('a release newer than the stored one carries the dot', () => {
    expect(dotState('0.3.0', '0.2.0', false)).toEqual({ dot: true, seed: null });
  });

  it('equal to the stored one: no dot', () => {
    expect(dotState('0.3.0', '0.3.0', false)).toEqual({ dot: false, seed: null });
  });

  it('with the drawer open a newer release is marked seen', () => {
    expect(dotState('0.3.0', '0.2.0', true)).toEqual({ dot: false, seed: '0.3.0' });
  });

  it('with the drawer open on an older checkout nothing lower is written back', () => {
    expect(dotState('0.2.0', '0.3.0', true)).toEqual({ dot: false, seed: null });
  });
});

describe('versions and labels', () => {
  it('compares numerically per part', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2.1', '0.3.0')).toBeLessThan(0);
  });

  it('labels the chip with and without commits past the tag', () => {
    expect(chipLabel({ version: '0.2.0', ahead: 0 })).toBe('v0.2.0');
    expect(chipLabel({ version: '0.2.0', ahead: 3 })).toBe('v0.2.0+3');
  });

  it('strips the Conventional Commits prefix the badge already says', () => {
    expect(displayTitle('feat(rail)!: version chip')).toBe('version chip');
    expect(displayTitle('fix: a typo')).toBe('a typo');
    expect(displayTitle('Baseline — versioning starts here')).toBe('Baseline — versioning starts here');
  });

  it('formats a date, and shows an unparsable one as it came', () => {
    expect(formatReleaseDate('2026-10-16T12:00:00+00:00')).toBe('16 Oct 2026');
    expect(formatReleaseDate('soon')).toBe('soon');
  });
});

describe('last seen storage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips a raw version string under its key', () => {
    writeLastSeen('0.2.0');
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('0.2.0');
    expect(readLastSeen()).toBe('0.2.0');
  });

  it('a storage that throws reads as null and swallows the write', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLastSeen()).toBeNull();
    expect(() => writeLastSeen('0.2.0')).not.toThrow();
  });
});

describe('renderNotes', () => {
  it('a bare line is one paragraph', () => {
    expect(renderNotes('Shows the running version.')).toBe('<p>Shows the running version.</p>');
  });

  it('bullets become a list, a blank line separates blocks', () => {
    expect(renderNotes('Two things:\n\n- one\n* two')).toBe('<p>Two things:</p><ul><li>one</li><li>two</li></ul>');
  });

  it('inline code and bold', () => {
    expect(renderNotes('Run `pnpm test` **first**')).toBe('<p>Run <code>pnpm test</code> <strong>first</strong></p>');
  });

  it('markup inside a code span stays literal', () => {
    expect(renderNotes('`**not bold**`')).toBe('<p><code>**not bold**</code></p>');
  });

  it('an https link opens in a new tab with noopener', () => {
    const html = renderNotes('See [the PR](https://github.com/futin/guide-manager/pull/1)');
    const a = new DOMParser().parseFromString(html, 'text/html').querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://github.com/futin/guide-manager/pull/1');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener');
    expect(a?.textContent).toBe('the PR');
  });

  it('a javascript: link is not a link', () => {
    const html = renderNotes('[x](javascript:alert(1))');
    expect(html).not.toContain('<a');
    expect(html).toBe('<p>[x](javascript:alert(1))</p>');
  });

  it('script and an img onerror arrive as text', () => {
    const doc = new DOMParser().parseFromString(renderNotes('<script>evil()</script> <img src=x onerror=evil()>'), 'text/html');
    expect(doc.querySelector('script, img')).toBeNull();
    expect(doc.body.textContent).toBe('<script>evil()</script> <img src=x onerror=evil()>');
  });

  it('empty notes render nothing', () => {
    expect(renderNotes('')).toBe('');
  });
});
