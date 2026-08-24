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
