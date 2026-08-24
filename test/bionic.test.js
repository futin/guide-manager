import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = readFileSync(fileURLToPath(new URL('../assets/bionic.js', import.meta.url)), 'utf8');

// The runtime is a classic script that does no DOM work at top level, so it
// loads in a bare context. Whatever the caller does not supply stays undefined,
// which is exactly the hostile environment the guards have to survive.
function load(sandbox = {}) {
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.__bionic;
}

const strip = (html) => html.replace(/<[^>]+>/g, '');

test('bionicWord leaves one-character words plain', () => {
  const { bionicWord } = load();
  assert.equal(bionicWord('a', 0.5), 0);
});

test('bionicWord bolds exactly one character of short words', () => {
  const { bionicWord } = load();
  assert.equal(bionicWord('at', 0.5), 1);
  assert.equal(bionicWord('the', 0.8), 1);
});

test('bionicWord scales with strength', () => {
  const { bionicWord } = load();
  assert.equal(bionicWord('bionic', 0.2), 1);
  assert.equal(bionicWord('bionic', 0.5), 3);
});

test('bionicWord never bolds the whole word', () => {
  const { bionicWord } = load();
  for (const word of ['at', 'the', 'bionic', 'comprehension']) {
    for (const s of [0.5, 0.8, 1]) {
      assert.ok(bionicWord(word, s) < word.length, `${word} @ ${s}`);
    }
  }
});

test('shouldBold cycles on the saccade frequency', () => {
  const { shouldBold } = load();
  assert.deepEqual([0, 1, 2].map((i) => shouldBold(i, 1)), [true, true, true]);
  assert.deepEqual([0, 1, 2].map((i) => shouldBold(i, 2)), [true, false, true]);
  assert.deepEqual([0, 4, 5].map((i) => shouldBold(i, 5)), [true, false, true]);
});

test('decorate is lossless: stripping its tags returns the input', () => {
  const { decorate } = load();
  const text = '  Bionic reading is a visual technique, mostly.  ';
  assert.equal(strip(decorate(text, 0.5, 1, 0).html), text);
});

test('decorate carries the word index across calls', () => {
  const { decorate } = load();
  const first = decorate('one two', 0.5, 2, 0);
  assert.equal(first.next, 2);
  // freq 2 bolded word 0 and skipped word 1, so the next node must start bolded.
  const second = decorate('three', 0.5, 2, first.next);
  assert.match(second.html, /^<b class="bx-b">/);
});

test('decorate escapes markup characters in the source text', () => {
  const { decorate } = load();
  const html = decorate('a < b & c', 0.5, 1, 0).html;
  assert.ok(html.includes('&lt;'));
  assert.ok(html.includes('&amp;'));
});


test('decorate treats contractions with typographic apostrophe as single words', () => {
  const { decorate } = load();
  // "don’t" with U+2019 curly right quote should be treated as one word
  const result = decorate('don’t', 0.5, 1, 0);
  // Should have exactly one opening <b> tag (one word)
  assert.equal((result.html.match(/<b class="bx-b">/g) || []).length, 1, 'one word should have one <b> tag');
  // Should advance word index by 1
  assert.equal(result.next, 1, 'contraction should be counted as one word');
});

test('decorate keeps a non-BMP character intact when choosing the bold prefix', () => {
  const { decorate } = load();
  // MATHEMATICAL BOLD SCRIPT SMALL A, B, C — each one character but a
  // surrogate pair in UTF-16. Slicing by code unit instead of code point
  // cuts a pair in half and leaves a lone surrogate on each side of </b>.
  const word = '\u{1D4AA}\u{1D4AB}\u{1D4AC}';
  const result = decorate(word, 0.5, 1, 0);
  assert.equal(strip(result.html), word);
  const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
  assert.ok(match, 'expected exactly one <b> wrapping a prefix');
  const [, head, tail] = match;
  assert.equal(Array.from(head).length, 1, 'the bold prefix must be exactly one character, not one code unit');
  assert.equal(head, '\u{1D4AA}');
  assert.equal(tail, '\u{1D4AB}\u{1D4AC}');
});

test('decorate keeps a combining mark attached to its base character (NFD text)', () => {
  const { decorate } = load();
  // NFD text: the letter "i" followed by a standalone combining diaeresis
  // (U+0308) -- what a precomposed "i-with-diaeresis" decomposes into, not
  // that precomposed character. Built from \u escapes, not typed glyphs, so
  // the source file's own text encoding can't quietly recompose it.
  const word = 'na' + 'i' + '\u0308' + 've';
  const result = decorate(word, 0.5, 1, 0);
  assert.equal(strip(result.html), word);
  const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
  assert.ok(match, 'expected exactly one <b> wrapping a prefix');
  const [, head, tail] = match;
  assert.ok(!tail.startsWith('\u0308'), 'the combining mark must not be orphaned at the start of the plain remainder');
  assert.equal(head, 'na' + 'i' + '\u0308');
  assert.equal(tail, 've');
});

test('decorate never bolds the whole word when trailing marks would otherwise swallow it (NFD "cafe", strength 0.8)', () => {
  const { decorate } = load();
  // NFD "cafe" (accent on the e): the mark-nudge must not walk the boundary
  // all the way to the end of the word. bionicWord's len-1 clamp picks the
  // mark itself as the initial candidate split here; extending forward would
  // consume it and leave nothing plain, so the fix has to back the boundary
  // off before the base character ("e") instead.
  const word = 'c' + 'a' + 'f' + 'e' + '\u0301';
  const result = decorate(word, 0.8, 1, 0);
  assert.equal(strip(result.html), word);
  const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
  assert.ok(match, 'expected exactly one <b> wrapping a prefix, with a non-empty plain remainder');
  const [, head, tail] = match;
  assert.equal(head, 'caf');
  assert.equal(tail, 'e' + '\u0301');
});

test('decorate never bolds the whole word when trailing marks would otherwise swallow it (NFD "cafe", strength 0.7)', () => {
  const { decorate } = load();
  // Same word, a different strength that lands on the same mark-adjacent
  // split point — regressed at both 0.7 and 0.8 in the pre-fix code, and
  // both are inside the 0.2-0.8 range readState() clamps UI input to.
  const word = 'c' + 'a' + 'f' + 'e' + '\u0301';
  const result = decorate(word, 0.7, 1, 0);
  assert.equal(strip(result.html), word);
  const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
  assert.ok(match, 'expected exactly one <b> wrapping a prefix, with a non-empty plain remainder');
  const [, head, tail] = match;
  assert.equal(head, 'caf');
  assert.equal(tail, 'e' + '\u0301');
});

test('decorate leaves a single-grapheme NFD word entirely plain', () => {
  const { decorate } = load();
  // A base character plus its combining mark, and nothing else, has no legal
  // split at all: any boundary either falls inside the cluster or bolds the
  // whole word. 0 (no bold) is the only correct answer, same outcome a plain
  // one-character word already gets.
  const word = 'e' + '\u0301';
  const result = decorate(word, 0.5, 1, 0);
  assert.equal(strip(result.html), word);
  assert.ok(!result.html.includes('<b'), 'a single grapheme must never be split');
  assert.equal(result.html, word);
});

test('decorate keeps a run of two combining marks attached to its base character', () => {
  const { decorate } = load();
  // Two marks stacked on the same base, at the very end of the word. Exercises
  // the multi-iteration path of the mark-skipping loop, not just a single mark.
  const word = 'c' + 'a' + 't' + '\u0301' + '\u0323';
  const result = decorate(word, 0.6, 1, 0);
  assert.equal(strip(result.html), word);
  const match = result.html.match(/^<b class="bx-b">([^<]*)<\/b>([^<]*)$/);
  assert.ok(match, 'expected exactly one <b> wrapping a prefix, with a non-empty plain remainder');
  const [, head, tail] = match;
  assert.equal(head, 'ca');
  assert.equal(tail, 't' + '\u0301' + '\u0323');
});

const asset = (name) =>
  readFileSync(fileURLToPath(new URL(`../assets/${name}`, import.meta.url)), 'utf8');

test('panel markup carries every id the runtime looks up', () => {
  const html = asset('bionic.html');
  for (const id of ['bx-on', 'bx-strength', 'bx-freq', 'bx-opts', 'bx-strength-out', 'bx-freq-out']) {
    assert.ok(html.includes(`id="${id}"`), `missing id ${id}`);
  }
  assert.ok(html.includes('class="bx-panel"'));
  assert.ok(html.includes('class="bx-more"'));
});

test('panel styles use only the page\'s existing custom properties', () => {
  const css = asset('bionic.css');
  const used = [...css.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]);
  const allowed = ['--bg', '--fg', '--muted', '--line', '--panel', '--accent', '--good', '--bad'];
  for (const name of used) assert.ok(allowed.includes(name), `unexpected variable ${name}`);
  assert.ok(used.length > 0, 'styles should theme with the page variables');
});

test('assets carry the vendored version header', () => {
  for (const name of ['bionic.js', 'bionic.css', 'bionic.html']) {
    assert.match(asset(name), /bionic v1 — vendored from guide-manager assets\/; do not edit here/);
  }
});

test('readState falls back to defaults when storage is empty', () => {
  const { readState } = load({ localStorage: { getItem: () => null, setItem: () => {} } });
  // Spread the vm-realm return value into a host-realm plain object first:
  // readState() executes inside the sandboxed vm context, so its object
  // literal carries that context's own Object.prototype. assert.deepEqual is
  // strict here (imported from 'node:assert/strict') and strict deep-equal
  // treats cross-realm plain objects as unequal even with identical own
  // properties, so comparing it directly would fail regardless of whether
  // readState() is implemented correctly.
  assert.deepEqual({ ...readState() }, { on: false, strength: 0.5, freq: 1 });
});

test('readState round-trips a stored setting', () => {
  const stored = JSON.stringify({ on: true, strength: 0.7, freq: 3 });
  const { readState } = load({ localStorage: { getItem: () => stored, setItem: () => {} } });
  assert.deepEqual({ ...readState() }, { on: true, strength: 0.7, freq: 3 });
});

test('readState rejects out-of-range and malformed values', () => {
  const junk = JSON.stringify({ on: 'yes', strength: 9, freq: 0 });
  const { readState } = load({ localStorage: { getItem: () => junk, setItem: () => {} } });
  assert.deepEqual({ ...readState() }, { on: false, strength: 0.5, freq: 1 });
});

test('readState survives unparseable storage and a missing localStorage', () => {
  const broken = load({ localStorage: { getItem: () => '{{{', setItem: () => {} } });
  assert.deepEqual({ ...broken.readState() }, { on: false, strength: 0.5, freq: 1 });
  assert.deepEqual({ ...load().readState() }, { on: false, strength: 0.5, freq: 1 });
});

test('init is inert without a document', () => {
  assert.doesNotThrow(() => load().init());
});

test('init is inert when the panel is absent from the page', () => {
  const doc = { readyState: 'complete', querySelector: () => null, getElementById: () => null, addEventListener: () => {}, body: {} };
  assert.doesNotThrow(() => load({ document: doc }).init());
});
