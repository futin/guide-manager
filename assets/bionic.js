/* bionic v1 — vendored from guide-manager assets/; do not edit here */
(function () {
  'use strict';

  var WORD = /\p{L}[\p{L}\p{M}'']*/gu;

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
