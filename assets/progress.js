/* progress v1 — served by guide-manager; injected into framed guides by GET /asset */
(function () {
  'use strict';

  // Everything runs from init(), never at top level: the file is spliced into
  // arbitrary generated documents and has to survive a context that supplies
  // nothing — which is also what makes its pure halves loadable in a bare
  // sandbox for the tests.
  function init() {}

  // Spliced at the end of <body>, so the document is normally already parsed by
  // the time this runs — but a build that pulls the script in earlier must still
  // work, so both paths are covered.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (typeof globalThis !== 'undefined') globalThis.__gmProgress = { init: init };
})();
