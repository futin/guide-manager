/* bionic v1 — vendored from guide-manager assets/; do not edit here */
(function () {
  'use strict';

  var WORD = /\p{L}[\p{L}\p{M}’']*/gu;
  // Matches a combining mark, so a bold/plain split never lands between a
  // base character and the mark stacked on it (NFD text, e.g. combining
  // diaeresis).
  var MARK = /\p{M}/u;

  // How many leading characters of a word to bold. Never the whole word: a
  // fully bold word carries no fixation point, which is the only thing the
  // bolding is for. `len` counts characters (code points), not UTF-16 code
  // units, so an astral character (surrogate pair) counts as one — decorate()
  // is what turns this count into the right string index.
  //
  // Single-letter words (the "e" in "e.g.") return 0 here and still consume a
  // word index in decorate(): an abbreviation-heavy sentence gets a visibly
  // irregular bold rhythm at freq >= 2. That is the spec as written, not a bug.
  function bionicWord(word, strength) {
    var len = Array.from(word).length;
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
      if (n > 0) {
        // Slice by code point, not UTF-16 code unit: word.slice(0, n) would
        // cut a surrogate pair in half for an astral character. Then nudge
        // the boundary past any combining mark sitting right at the cut, so
        // a base character never separates from the mark stacked on it.
        var chars = Array.from(word);
        while (n < chars.length && MARK.test(chars[n])) n += 1;
        var head = chars.slice(0, n).join('');
        var tail = chars.slice(n).join('');
        out += '<b class="bx-b">' + escapeHtml(head) + '</b>' + escapeHtml(tail);
      } else {
        out += escapeHtml(word);
      }
      last = m.index + word.length;
      i += 1;
    }
    out += escapeHtml(text.slice(last));
    return { html: out, next: i };
  }

  var STORAGE_KEY = 'guide-manager:bionic';
  var DEFAULTS = { on: false, strength: 0.5, freq: 1 };
  // Headings are already bold, so there is no fixation contrast left to add
  // (h5/h6 included: visuals.md has the generator demote every heading level
  // by one, so a chapter's #### lands as h5); code is where mid-word bolding
  // actively hurts. script/style/noscript never render as reader-facing
  // text, and rewriting a textarea's value would destroy it, not decorate it.
  var SKIP = 'pre, code, kbd, svg, script, style, noscript, textarea, h1, h2, h3, h4, h5, h6, nav.toc, .bx-panel';

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

  // init() is both auto-invoked below and exported on __bionic, so a caller
  // can trigger it a second time; this keeps that idempotent.
  var bound = false;

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
    if (bound) return; // already wired up; a second call must not double-bind every listener
    bound = true;

    var state = readState();
    onBox.checked = state.on;
    strengthEl.value = String(Math.round(state.strength * 100));
    freqEl.value = String(state.freq);

    function render() {
      strengthOut.textContent = strengthEl.value + '%';
      var freqWord = ordinal(Number(freqEl.value));
      freqOut.textContent = freqWord;
      freqEl.setAttribute('aria-valuetext', freqWord + ' word');
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

  globalThis.__bionic = {
    bionicWord: bionicWord,
    shouldBold: shouldBold,
    decorate: decorate,
    readState: readState,
    apply: apply,
    restore: restore,
    init: init,
  };
})();
