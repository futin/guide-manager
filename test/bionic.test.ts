import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ASSETS = join(__dirname, '..', 'assets');
const SRC = readFileSync(join(ASSETS, 'bionic.js'), 'utf8');

interface BionicApi {
  bionicWord(word: string, strength: number): number;
  shouldBold(wordIndex: number, freq: number): boolean;
  decorate(text: string, strength: number, freq: number, start: number): { html: string; next: number };
  readState(): { on: boolean; strength: number; freq: number };
  apply(root: unknown, strength: number, freq: number): void;
  restore(root: unknown): void;
  init(): void;
}

// The runtime is a classic script that does no DOM work at top level, so it
// loads in a bare context. Whatever the caller does not supply stays undefined,
// which is exactly the hostile environment the guards have to survive.
function load(sandbox: Record<string, unknown> = {}): BionicApi {
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.__bionic as BionicApi;
}

const strip = (html: string): string => html.replace(/<[^>]+>/g, '');
const asset = (name: string): string => readFileSync(join(ASSETS, name), 'utf8');

describe('bionic', () => {
  it('bionicWord leaves one-character words plain', () => {
    const { bionicWord } = load();
    expect(bionicWord('a', 0.5)).toBe(0);
  });

  it('bionicWord bolds exactly one character of short words', () => {
    const { bionicWord } = load();
    expect(bionicWord('at', 0.5)).toBe(1);
    expect(bionicWord('the', 0.8)).toBe(1);
  });

  it('bionicWord scales with strength', () => {
    const { bionicWord } = load();
    expect(bionicWord('bionic', 0.2)).toBe(1);
    expect(bionicWord('bionic', 0.5)).toBe(3);
  });

  it('bionicWord never bolds the whole word', () => {
    const { bionicWord } = load();
    for (const word of ['at', 'the', 'bionic', 'comprehension']) {
      for (const s of [0.5, 0.8, 1]) {
        expect(bionicWord(word, s)).toBeLessThan(word.length);
      }
    }
  });

  it('shouldBold cycles on the saccade frequency', () => {
    const { shouldBold } = load();
    expect([0, 1, 2].map((i) => shouldBold(i, 1))).toEqual([true, true, true]);
    expect([0, 1, 2].map((i) => shouldBold(i, 2))).toEqual([true, false, true]);
    expect([0, 4, 5].map((i) => shouldBold(i, 5))).toEqual([true, false, true]);
  });

  it('decorate is lossless: stripping its tags returns the input', () => {
    const { decorate } = load();
    const text = '  Bionic reading is a visual technique, mostly.  ';
    expect(strip(decorate(text, 0.5, 1, 0).html)).toBe(text);
  });

  it('decorate carries the word index across calls', () => {
    const { decorate } = load();
    const first = decorate('one two', 0.5, 2, 0);
    expect(first.next).toBe(2);
    // freq 2 bolded word 0 and skipped word 1, so the next node must start bolded.
    const second = decorate('three', 0.5, 2, first.next);
    expect(second.html).toMatch(/^<b class="bx-b">/);
  });

  it('decorate escapes markup characters in the source text', () => {
    const { decorate } = load();
    const html = decorate('a < b & c', 0.5, 1, 0).html;
    expect(html).toContain('&lt;');
    expect(html).toContain('&amp;');
  });

  it('decorate treats contractions with typographic apostrophe as single words', () => {
    const { decorate } = load();
    // "don’t" with U+2019 curly right quote should be treated as one word
    const result = decorate('don’t', 0.5, 1, 0);
    expect(result.html.match(/<b class="bx-b">/g) || []).toHaveLength(1);
    expect(result.next).toBe(1);
  });

  it('decorate keeps a non-BMP character intact when choosing the bold prefix', () => {
    const { decorate } = load();
    // MATHEMATICAL BOLD SCRIPT SMALL A, B, C — each one character but a
    // surrogate pair in UTF-16. Slicing by code unit instead of code point
    // cuts a pair in half and leaves a lone surrogate on each side of </b>.
    const word = '\u{1D4AA}\u{1D4AB}\u{1D4AC}';
    const result = decorate(word, 0.5, 1, 0);
    expect(strip(result.html)).toBe(word);
    const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
    expect(match).toBeTruthy();
    const [, head, tail] = match as RegExpMatchArray;
    expect(Array.from(head)).toHaveLength(1);
    expect(head).toBe('\u{1D4AA}');
    expect(tail).toBe('\u{1D4AB}\u{1D4AC}');
  });

  it('decorate keeps a combining mark attached to its base character (NFD text)', () => {
    const { decorate } = load();
    // NFD text: the letter "i" followed by a standalone combining diaeresis
    // (U+0308) -- what a precomposed "i-with-diaeresis" decomposes into, not
    // that precomposed character. Built from \u escapes, not typed glyphs, so
    // the source file's own text encoding can't quietly recompose it.
    const word = 'na' + 'i' + '\u0308' + 've';
    const result = decorate(word, 0.5, 1, 0);
    expect(strip(result.html)).toBe(word);
    const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
    expect(match).toBeTruthy();
    const [, head, tail] = match as RegExpMatchArray;
    expect(tail.startsWith('\u0308')).toBe(false);
    expect(head).toBe('na' + 'i' + '\u0308');
    expect(tail).toBe('ve');
  });

  it('decorate never bolds the whole word when trailing marks would otherwise swallow it (NFD "cafe", strength 0.8)', () => {
    const { decorate } = load();
    // NFD "cafe" (accent on the e): the mark-nudge must not walk the boundary
    // all the way to the end of the word. bionicWord's len-1 clamp picks the
    // mark itself as the initial candidate split here; extending forward would
    // consume it and leave nothing plain, so the fix has to back the boundary
    // off before the base character ("e") instead.
    const word = 'c' + 'a' + 'f' + 'e' + '\u0301';
    const result = decorate(word, 0.8, 1, 0);
    expect(strip(result.html)).toBe(word);
    const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
    expect(match).toBeTruthy();
    const [, head, tail] = match as RegExpMatchArray;
    expect(head).toBe('caf');
    expect(tail).toBe('e' + '\u0301');
  });

  it('decorate never bolds the whole word when trailing marks would otherwise swallow it (NFD "cafe", strength 0.7)', () => {
    const { decorate } = load();
    // Same word, a different strength that lands on the same mark-adjacent
    // split point — regressed at both 0.7 and 0.8 in the pre-fix code, and
    // both are inside the 0.2-0.8 range readState() clamps UI input to.
    const word = 'c' + 'a' + 'f' + 'e' + '\u0301';
    const result = decorate(word, 0.7, 1, 0);
    expect(strip(result.html)).toBe(word);
    const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
    expect(match).toBeTruthy();
    const [, head, tail] = match as RegExpMatchArray;
    expect(head).toBe('caf');
    expect(tail).toBe('e' + '\u0301');
  });

  it('decorate leaves a single-grapheme NFD word entirely plain', () => {
    const { decorate } = load();
    // A base character plus its combining mark, and nothing else, has no legal
    // split at all: any boundary either falls inside the cluster or bolds the
    // whole word. 0 (no bold) is the only correct answer, same outcome a plain
    // one-character word already gets.
    const word = 'e' + '\u0301';
    const result = decorate(word, 0.5, 1, 0);
    expect(strip(result.html)).toBe(word);
    expect(result.html).not.toContain('<b');
    expect(result.html).toBe(word);
  });

  it('decorate keeps a run of two combining marks attached to its base character', () => {
    const { decorate } = load();
    // Two marks stacked on the same base, at the very end of the word. Exercises
    // the multi-iteration path of the mark-skipping loop, not just a single mark.
    const word = 'c' + 'a' + 't' + '\u0301' + '\u0323';
    const result = decorate(word, 0.6, 1, 0);
    expect(strip(result.html)).toBe(word);
    const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
    expect(match).toBeTruthy();
    const [, head, tail] = match as RegExpMatchArray;
    expect(head).toBe('ca');
    expect(tail).toBe('t' + '\u0301' + '\u0323');
  });

  it('panel markup carries every id the runtime looks up', () => {
    const html = asset('bionic.html');
    for (const id of ['bx-on', 'bx-strength', 'bx-freq', 'bx-opts', 'bx-strength-out', 'bx-freq-out']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('class="bx-panel"');
    expect(html).toContain('class="bx-more"');
  });

  it("panel styles use only the page's existing custom properties", () => {
    const css = asset('bionic.css');
    const used = [...css.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]);
    const allowed = ['--bg', '--fg', '--muted', '--line', '--panel', '--accent', '--good', '--bad'];
    for (const name of used) expect(allowed).toContain(name);
    expect(used.length).toBeGreaterThan(0);
  });

  it('assets carry the vendored version header', () => {
    for (const name of ['bionic.js', 'bionic.css', 'bionic.html']) {
      expect(asset(name)).toMatch(/bionic v2 — vendored from guide-manager assets\/; do not edit here/);
    }
  });

  it('readState falls back to defaults when storage is empty', () => {
    const { readState } = load({ localStorage: { getItem: () => null, setItem: () => {} } });
    // Spread the vm-realm return value into a host-realm plain object first:
    // readState() executes inside the sandboxed vm context, so its object
    // literal carries that context's own Object.prototype.
    expect({ ...readState() }).toEqual({ on: false, strength: 0.5, freq: 1 });
  });

  it('readState round-trips a stored setting', () => {
    const stored = JSON.stringify({ on: true, strength: 0.7, freq: 3 });
    const { readState } = load({ localStorage: { getItem: () => stored, setItem: () => {} } });
    expect({ ...readState() }).toEqual({ on: true, strength: 0.7, freq: 3 });
  });

  it('readState rejects out-of-range and malformed values', () => {
    const junk = JSON.stringify({ on: 'yes', strength: 9, freq: 0 });
    const { readState } = load({ localStorage: { getItem: () => junk, setItem: () => {} } });
    expect({ ...readState() }).toEqual({ on: false, strength: 0.5, freq: 1 });
  });

  it('readState survives unparseable storage and a missing localStorage', () => {
    const broken = load({ localStorage: { getItem: () => '{{{', setItem: () => {} } });
    expect({ ...broken.readState() }).toEqual({ on: false, strength: 0.5, freq: 1 });
    expect({ ...load().readState() }).toEqual({ on: false, strength: 0.5, freq: 1 });
  });

  it('init is inert without a document', () => {
    expect(() => load().init()).not.toThrow();
  });

  it('init is inert when the panel is absent from the page', () => {
    const doc = {
      readyState: 'complete',
      querySelector: () => null,
      getElementById: () => null,
      addEventListener: () => {},
      body: {}
    };
    expect(() => load({ document: doc }).init()).not.toThrow();
  });
});
