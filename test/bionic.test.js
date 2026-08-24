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
