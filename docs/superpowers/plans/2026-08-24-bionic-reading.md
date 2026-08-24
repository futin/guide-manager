# Bionic Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an optional, reader-tunable bionic-reading aid inside the single-page HTML build that `/study` generates.

**Architecture:** Three vendored asset files in this repo (`assets/bionic.{js,css,html}`) are copied into a guide's `tools/` at write time and inlined into the page by its `tools/build.mjs`. The runtime is a classic inline script that rewrites text nodes after `DOMContentLoaded` — never at build time — so the guide's committed fidelity and leaked-markdown checkers are untouched. All algorithm logic is pure string-in/string-out and unit-tested in `node:vm` with no DOM library.

**Tech Stack:** Node 20+, ESM repo, `node --test`, `node:vm`. No dependencies added.

**Spec:** [`docs/superpowers/specs/2026-08-24-bionic-reading-design.md`](../specs/2026-08-24-bionic-reading-design.md)

## Global Constraints

- **`assets/bionic.js` is a classic script, not an ES module.** No `import`, no `export`, no top-level `await`. A `file://` page loads inline module scripts inconsistently.
- **No DOM work at top level.** Everything runs from `init()`, bound to `DOMContentLoaded`. This is what makes the file loadable in `node:vm` with no DOM.
- **No external assets.** No `fetch`, `XMLHttpRequest`, `WebSocket`, dynamic `import()`, no CDN, no font, no image file.
- **No new CSS custom properties.** Style only with the page's existing set: `--bg --fg --muted --line --panel --accent --good --bad`.
- **Every asset file opens with the version header**, verbatim, in that file's comment syntax:
  `bionic v1 — vendored from guide-manager assets/; do not edit here`
- **Storage key:** `guide-manager:bionic`. **Defaults:** `{"on":false,"strength":0.5,"freq":1}`.
- **Ranges:** strength `0.2`–`0.8` (UI 20–80, step 5); freq integer `1`–`5`.
- **Skip selector**, exactly: `pre, code, kbd, svg, h1, h2, h3, h4, nav.toc, .bx-panel`
  (the spec also lists `.compare h3`; it is subsumed by `h3` and is dropped as redundant).
- Tests run with `npm test` (`node --test`) from the repo root.

---

### Task 1: Pure decoration core

The whole algorithm, with no DOM: which characters of a word get bolded, which words get bolded at all, and the string rewrite that applies both. Everything here is testable in a `vm` sandbox.

**Files:**
- Create: `assets/bionic.js`
- Test: `test/bionic.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `globalThis.__bionic = { bionicWord, shouldBold, decorate }` where
  - `bionicWord(word: string, strength: number) -> number` — count of leading characters to bold.
  - `shouldBold(wordIndex: number, freq: number) -> boolean`
  - `decorate(text: string, strength: number, freq: number, start: number) -> { html: string, next: number }` — `next` is the running document-wide word index to hand to the following call.

- [ ] **Step 1: Write the failing test**

Create `test/bionic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/bionic.test.js
```

Expected: FAIL — `ENOENT: no such file or directory, open '.../assets/bionic.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `assets/bionic.js`:

```js
/* bionic v1 — vendored from guide-manager assets/; do not edit here */
(function () {
  'use strict';

  var WORD = /\p{L}[\p{L}\p{M}’']*/gu;

  // How many leading characters of a word to bold. Never the whole word: a
  // fully bold word carries no fixation point, which is the only thing the
  // bolding is for.
  function bionicWord(word, strength) {
    var len = word.length;
    if (len < 2) return 0;
    if (len <= 3) return 1;
    var n = Math.round(len * strength);
    return Math.min(Math.max(n, 1), len - 1);
  }

  function shouldBold(wordIndex, freq) {
    return wordIndex % freq === 0;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  // Decorate one run of plain text. Pure, string in and string out, so the whole
  // algorithm is testable with no DOM. `start` continues the document-wide word
  // count — that is what keeps the saccade rhythm regular across text nodes
  // instead of restarting at every paragraph.
  function decorate(text, strength, freq, start) {
    var out = '';
    var last = 0;
    var i = start || 0;
    var m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text)) !== null) {
      var word = m[0];
      out += escapeHtml(text.slice(last, m.index));
      var n = shouldBold(i, freq) ? bionicWord(word, strength) : 0;
      out += n > 0
        ? '<b class="bx-b">' + escapeHtml(word.slice(0, n)) + '</b>' + escapeHtml(word.slice(n))
        : escapeHtml(word);
      last = m.index + word.length;
      i += 1;
    }
    out += escapeHtml(text.slice(last));
    return { html: out, next: i };
  }

  globalThis.__bionic = {
    bionicWord: bionicWord,
    shouldBold: shouldBold,
    decorate: decorate,
  };
})();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- test/bionic.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add assets/bionic.js test/bionic.test.js
git commit -m "feat: pure bionic-reading decoration core"
```

---

### Task 2: Panel markup and styles

The control the reader actually touches, plus a test that pins the markup to the ids the runtime will look up in Task 3 — the two files drift apart silently otherwise.

**Files:**
- Create: `assets/bionic.html`
- Create: `assets/bionic.css`
- Modify: `test/bionic.test.js` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: element ids `bx-on`, `bx-strength`, `bx-freq`, `bx-opts`, `bx-strength-out`, `bx-freq-out`; classes `bx-panel`, `bx-more`, `bx-b`, `bx`. Task 3 looks up every one of these.

- [ ] **Step 1: Write the failing test**

Append to `test/bionic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/bionic.test.js
```

Expected: FAIL — `ENOENT ... assets/bionic.html`.

- [ ] **Step 3: Write minimal implementation**

Create `assets/bionic.html`:

```html
<!-- bionic v1 — vendored from guide-manager assets/; do not edit here -->
<div class="bx-panel">
  <label><input type="checkbox" id="bx-on"> Bionic reading</label>
  <button type="button" class="bx-more" aria-expanded="false" aria-controls="bx-opts">Options</button>
  <div id="bx-opts" hidden>
    <label>Fixation
      <input type="range" id="bx-strength" min="20" max="80" step="5" value="50" disabled>
      <output id="bx-strength-out" for="bx-strength">50%</output>
    </label>
    <label>Every
      <input type="range" id="bx-freq" min="1" max="5" step="1" value="1" disabled>
      <output id="bx-freq-out" for="bx-freq">1st</output> word
    </label>
  </div>
</div>
```

Create `assets/bionic.css`:

```css
/* bionic v1 — vendored from guide-manager assets/; do not edit here */
.bx-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 0.5rem 0.6rem;
  margin: 0 0 1rem;
  font-size: 0.85rem;
}
.bx-panel label { display: flex; align-items: center; gap: 0.4rem; }
.bx-panel .bx-more {
  margin-top: 0.35rem;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
}
.bx-panel .bx-more::before { content: '\25B8\00A0'; }
.bx-panel .bx-more[aria-expanded='true']::before { content: '\25BE\00A0'; }
#bx-opts { display: grid; gap: 0.35rem; margin-top: 0.4rem; }
#bx-opts label { flex-wrap: wrap; color: var(--muted); }
#bx-opts input[type='range'] { flex: 1 1 6rem; min-width: 5rem; }
#bx-opts output { color: var(--fg); font-variant-numeric: tabular-nums; }

/* The fixation prefix. Bold only — dimming the remainder to --muted, as most
   bionic renders do, drops body prose below AA contrast on the dark theme. */
b.bx-b { font-weight: 700; }

@media print {
  .bx-panel { display: none; }
  b.bx-b { font-weight: inherit; }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- test/bionic.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add assets/bionic.html assets/bionic.css test/bionic.test.js
git commit -m "feat: bionic reading control panel markup and styles"
```

---

### Task 3: DOM runtime, persistence, and wiring

Applies and removes the decoration over the live page, remembers the reader's setting, and wires the panel. The apply/restore pair is the part that must be lossless and idempotent.

**Files:**
- Modify: `assets/bionic.js` (add to the IIFE, before the `globalThis.__bionic` assignment)
- Modify: `test/bionic.test.js` (append)

**Interfaces:**
- Consumes: `decorate` from Task 1; the ids and classes from Task 2.
- Produces, added to `globalThis.__bionic`:
  - `readState() -> { on: boolean, strength: number, freq: number }`
  - `apply(root: Element, strength: number, freq: number) -> void`
  - `restore(root: Element) -> void`
  - `init() -> void`

- [ ] **Step 1: Write the failing test**

Append to `test/bionic.test.js`:

```js
test('readState falls back to defaults when storage is empty', () => {
  const { readState } = load({ localStorage: { getItem: () => null, setItem: () => {} } });
  assert.deepEqual(readState(), { on: false, strength: 0.5, freq: 1 });
});

test('readState round-trips a stored setting', () => {
  const stored = JSON.stringify({ on: true, strength: 0.7, freq: 3 });
  const { readState } = load({ localStorage: { getItem: () => stored, setItem: () => {} } });
  assert.deepEqual(readState(), { on: true, strength: 0.7, freq: 3 });
});

test('readState rejects out-of-range and malformed values', () => {
  const junk = JSON.stringify({ on: 'yes', strength: 9, freq: 0 });
  const { readState } = load({ localStorage: { getItem: () => junk, setItem: () => {} } });
  assert.deepEqual(readState(), { on: false, strength: 0.5, freq: 1 });
});

test('readState survives unparseable storage and a missing localStorage', () => {
  const broken = load({ localStorage: { getItem: () => '{{{', setItem: () => {} } });
  assert.deepEqual(broken.readState(), { on: false, strength: 0.5, freq: 1 });
  assert.deepEqual(load().readState(), { on: false, strength: 0.5, freq: 1 });
});

test('init is inert without a document', () => {
  assert.doesNotThrow(() => load().init());
});

test('init is inert when the panel is absent from the page', () => {
  const doc = { readyState: 'complete', querySelector: () => null, getElementById: () => null, addEventListener: () => {}, body: {} };
  assert.doesNotThrow(() => load({ document: doc }).init());
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/bionic.test.js
```

Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'readState')`, because `__bionic` does not export it yet.

- [ ] **Step 3: Write minimal implementation**

In `assets/bionic.js`, insert after `decorate` and before the `globalThis.__bionic` assignment:

```js
  var STORAGE_KEY = 'guide-manager:bionic';
  var DEFAULTS = { on: false, strength: 0.5, freq: 1 };
  // Headings are already bold, so there is no fixation contrast left to add;
  // code is where mid-word bolding actively hurts.
  var SKIP = 'pre, code, kbd, svg, h1, h2, h3, h4, nav.toc, .bx-panel';

  function readState() {
    try {
      var raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { on: DEFAULTS.on, strength: DEFAULTS.strength, freq: DEFAULTS.freq };
      var s = JSON.parse(raw);
      var strength = typeof s.strength === 'number' && s.strength >= 0.2 && s.strength <= 0.8
        ? s.strength : DEFAULTS.strength;
      var freq = Number.isInteger(s.freq) && s.freq >= 1 && s.freq <= 5 ? s.freq : DEFAULTS.freq;
      return { on: s.on === true, strength: strength, freq: freq };
    } catch (e) {
      // A corrupt key, or storage blocked entirely, must never take the page's
      // other inline scripts down with it.
      return { on: DEFAULTS.on, strength: DEFAULTS.strength, freq: DEFAULTS.freq };
    }
  }

  function writeState(state) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* private mode, quota, or no storage at all — not fatal */ }
  }

  function eligible(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    var el = node.parentElement;
    return !!el && !el.closest(SKIP);
  }

  // Put the page back to plain text nodes. Every decorated run kept its source
  // on data-bx-src, so this is lossless and re-running apply() after it starts
  // from clean text rather than from already-bolded markup.
  function restore(root) {
    var doc = root.ownerDocument;
    var spans = root.querySelectorAll('span.bx');
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var parent = span.parentNode;
      parent.replaceChild(doc.createTextNode(span.getAttribute('data-bx-src')), span);
      parent.normalize();
    }
  }

  function apply(root, strength, freq) {
    restore(root);
    var doc = root.ownerDocument;
    var walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    var nodes = [];
    var node;
    // Collect first: replacing nodes while walking invalidates the walker.
    while ((node = walker.nextNode()) !== null) {
      if (eligible(node)) nodes.push(node);
    }
    var index = 0;
    for (var i = 0; i < nodes.length; i++) {
      var text = nodes[i].nodeValue;
      var res = decorate(text, strength, freq, index);
      index = res.next;
      var span = doc.createElement('span');
      span.className = 'bx';
      span.setAttribute('data-bx-src', text);
      span.innerHTML = res.html;
      nodes[i].parentNode.replaceChild(span, nodes[i]);
    }
  }

  function ordinal(n) {
    return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
  }

  function init() {
    var doc = globalThis.document;
    if (!doc) return;
    var panel = doc.querySelector('.bx-panel');
    var root = doc.querySelector('.wrap') || doc.querySelector('.shell') || doc.body;
    var onBox = doc.getElementById('bx-on');
    var strengthEl = doc.getElementById('bx-strength');
    var freqEl = doc.getElementById('bx-freq');
    var opts = doc.getElementById('bx-opts');
    var strengthOut = doc.getElementById('bx-strength-out');
    var freqOut = doc.getElementById('bx-freq-out');
    var moreBtn = panel && panel.querySelector('.bx-more');
    if (!panel || !root || !onBox || !strengthEl || !freqEl || !opts || !strengthOut || !freqOut || !moreBtn) return;

    var state = readState();
    onBox.checked = state.on;
    strengthEl.value = String(Math.round(state.strength * 100));
    freqEl.value = String(state.freq);

    function render() {
      strengthOut.textContent = strengthEl.value + '%';
      freqOut.textContent = ordinal(Number(freqEl.value));
      strengthEl.disabled = !onBox.checked;
      freqEl.disabled = !onBox.checked;
    }

    // A full guide is ~15k spans, so a rebuild per drag frame stutters: the
    // readout follows `input`, the rewrite waits for `change`.
    function commit() {
      state = {
        on: onBox.checked,
        strength: Number(strengthEl.value) / 100,
        freq: Number(freqEl.value),
      };
      writeState(state);
      render();
      if (state.on) apply(root, state.strength, state.freq);
      else restore(root);
    }

    onBox.addEventListener('change', commit);
    strengthEl.addEventListener('change', commit);
    freqEl.addEventListener('change', commit);
    strengthEl.addEventListener('input', render);
    freqEl.addEventListener('input', render);
    moreBtn.addEventListener('click', function () {
      var open = moreBtn.getAttribute('aria-expanded') === 'true';
      moreBtn.setAttribute('aria-expanded', String(!open));
      opts.hidden = open;
    });

    render();
    if (state.on) apply(root, state.strength, state.freq);
  }

  if (globalThis.document) {
    if (globalThis.document.readyState === 'loading') {
      globalThis.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
```

Then extend the export at the bottom of the file to:

```js
  globalThis.__bionic = {
    bionicWord: bionicWord,
    shouldBold: shouldBold,
    decorate: decorate,
    readState: readState,
    apply: apply,
    restore: restore,
    init: init,
  };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS — the full suite, including the pre-existing server, render, paths, reload and register tests.

- [ ] **Step 5: Commit**

```bash
git add assets/bionic.js test/bionic.test.js
git commit -m "feat: bionic reading DOM runtime, persistence, and panel wiring"
```

---

### Task 4: Teach the study skill to ship it

The assets exist and are tested; nothing generates a page carrying them yet. This task is the instruction change that makes `/study` vendor and inline them.

**Files:**
- Modify: `skills/study/references/visuals.md` (new section inserted at line 113, after *Navigation: a sticky side menu* and before *What the generator has to get right*; one bullet in *Before you hand it over*, line 425+)
- Modify: `skills/study/SKILL.md:158-170` (the `tools/` block of the *File layout* tree in step 6)

**Interfaces:**
- Consumes: the three files from Tasks 1–3, at `${CLAUDE_PLUGIN_ROOT}/assets/`.
- Produces: no code. The generated guide gains `tools/bionic.js`, `tools/bionic.css`, `tools/bionic.html`, and `tools/build.mjs` gains three inline steps.

- [ ] **Step 1: Add the file-layout entries in `SKILL.md`**

In the `tools/` block of the *File layout* tree in step 6, after `citations.mjs`, add:

```
    bionic.js              vendored reading aid — do not edit, re-copy instead
    bionic.css
    bionic.html
```

- [ ] **Step 2: Add the *Reading controls* section to `visuals.md`**

Insert after the *Navigation: a sticky side menu* section:

````markdown
## Reading controls: the bionic aid

A whole-guide page is a lot of prose, so it ships an optional bionic-reading
aid — bolded leading characters that give the eye an artificial fixation point,
with the reader in charge of how strong it is. Three files carry it, vendored
from this plugin rather than written fresh per guide:

```
cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.js"   <dir>/tools/
cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.css"  <dir>/tools/
cp "${CLAUDE_PLUGIN_ROOT}/assets/bionic.html" <dir>/tools/
```

Copy them; never retype them. They carry a `bionic v1` header — that is how a
later session tells a stale vendored copy from a current one, so re-copy on
every regeneration.

`tools/build.mjs` then inlines all three, resolving them against
`import.meta.url` like everything else it reads:

- `bionic.css` appended to the page's single `<style>` block.
- `bionic.html` injected as the **first child of `.side`**, above `nav.toc`, so
  the control is reachable without scrolling a long table of contents. At narrow
  widths it folds into the existing `#navtoggle` disclosure for free — it is
  inside `.side`, so no second media query is needed.
- `bionic.js` emitted as an inline `<script>` beside the scroll-spy script.

**It must stay a runtime pass — never bake the bolding into the markup.** The
fidelity check in `tools/check.mjs` compares word sequences after stripping
tags, and a baked `<b>` inside a word strips to `Bio nic` — two words — failing
on essentially every prose line in the guide. `check.mjs` needs no new
exclusions precisely because the decoration does not exist until the page is
open in a browser.

Two behaviors worth knowing before you debug them:

- **Default off, persisted per-origin** under `guide-manager:bionic`. Bionic
  reading's speed claims are not backed by peer-reviewed evidence, and heavy
  mid-word bolding helps some dyslexic readers and hinders others. It is
  offered, not imposed.
- **Bold only, never dimmed.** Most bionic renders dim the rest of the word for
  extra contrast; on this page's dark theme that drops body prose below AA.
````

- [ ] **Step 3: Add the hand-check bullet in `visuals.md`**

In *Before you hand it over*, under the "Then by hand" list, after the color-scheme bullet:

```markdown
- Toggle the reading aid on in **both** color schemes: the fixation prefix is
  visible, code blocks and headings are untouched, find-in-page still locates a
  decorated word, and toggling back off leaves the prose byte-identical.
```

- [ ] **Step 4: Verify the docs are consistent with the assets**

```bash
grep -c 'bionic' skills/study/references/visuals.md skills/study/SKILL.md
```

Expected: a non-zero count for both files. Then re-read the new section against `assets/bionic.html` and confirm every id and class it names still exists there.

- [ ] **Step 5: Commit**

```bash
git add skills/study/SKILL.md skills/study/references/visuals.md
git commit -m "docs: vendor and inline the bionic reading aid in study HTML builds"
```

---

## Verification after Task 4

The unit suite covers the algorithm; the page-level behavior is verified once on a real generated guide. Run `/study` with the HTML build option on a small topic, then on the produced `index.html`:

- [ ] `node <dir>/tools/check.mjs` exits zero — the generated bytes are unchanged by this feature.
- [ ] Opened from `file://` with the network off, the panel renders and the switch works.
- [ ] Light and dark: the prefix is visible; nothing else changed color.
- [ ] Code blocks, inline code, headings and SVG labels stay plain with the aid on.
- [ ] Slider drag is smooth; the rewrite lands on release, not per frame.
- [ ] Reload preserves the setting; toggling off restores the original prose.
- [ ] 1024px still shows the desktop layout — the panel added no media query.
- [ ] Print preview: no panel, no bold.
