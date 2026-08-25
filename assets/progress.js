/* progress v1 — served by guide-manager; injected into framed guides by GET /asset */
(function () {
  'use strict';

  /*
    Where the reader is, reported to the app that framed this guide.

    This file runs *inside* the guide — a tutor deck or a study build, in a
    same-origin iframe — because that is the only place its cards and its scroll
    position exist. The shell around the frame holds a breadcrumb and nothing
    else, and a script there cannot cross into the frame at all.

    It is served by guide-manager and spliced in per request rather than vendored
    into each guide, exactly like the reading aid: a build generated before this
    file existed reports and resumes without being regenerated, and a fix here
    reaches every guide at once.

    Two guides, two position models. A deck's position is a card index; a study
    build's is the last heading scrolled past, because a stored scroll offset
    lands somewhere else the moment the reader changes the text-size setting and
    the page reflows. The percent stored beside either one is for the board, and
    is the fallback when a build carries no id'd headings.
  */

  // Deck card changes are discrete and rare — a tap, not a storm. Doc scrolling
  // is a storm, and 1s of stillness is a reader who has stopped to read.
  var DEBOUNCE = { deck: 500, doc: 1000 };

  // A footer, a licence block or a trailing nav the reader never scrolls into
  // view must not cost them the completion.
  var DONE_AT = 98;

  var ctx = null;
  var state = {
    percent: 0,
    position: null,
    completed: false,
    timer: null,
    // Something happened that has not been written yet. Only this makes the
    // visibility/pagehide flush fire, so backgrounding an untouched guide is
    // silent.
    dirty: false,
    // While a deck replay is in flight, the cards it walks through are not
    // places the reader went, so nothing is reported until it settles.
    replaying: false,
    // init() runs at most once per document. It is reached two ways — the
    // DOMContentLoaded branch below and a direct call — and the open it posts is
    // the one write that increments openCount, so a second run would count a
    // visit that never happened and bind a second set of listeners to report it.
    started: false
  };

  function readContext() {
    if (typeof document === 'undefined') return null;
    var el = document.getElementById('gm-progress');
    if (!el) return null;
    try {
      var parsed = JSON.parse(el.textContent || 'null');
      return parsed && typeof parsed.guidePath === 'string' ? parsed : null;
    } catch (e) {
      // A malformed blob means the frame cannot know which guide it is in.
      // Silence is the only correct answer: reporting against a guessed path
      // would write one guide's position onto another's row.
      return null;
    }
  }

  // ---------------------------------------------------------------- reporting

  function send(method, url, body) {
    try {
      var opts = { method: method, keepalive: true };
      if (body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      var p = fetch(url, opts);
      // Fire and forget, but never unhandled: a rejected promise inside a
      // guide's own document is a console full of noise over a lost byte of
      // bookkeeping, and the reading session is the point.
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function report(patch) {
    if (!ctx) return;
    patch = patch || {};
    var body = {
      guidePath: ctx.guidePath,
      project: ctx.project,
      percent: typeof patch.percent === 'number' ? patch.percent : state.percent,
      position: patch.position || state.position
    };
    if (patch.opened) body.opened = true;
    // Only ever set, never cleared — the server reads an omitted flag as "no
    // opinion" and leaves a stored true alone. Tracked locally too, so a
    // finished guide does not re-send the flag on every later write.
    if (!state.completed && body.percent >= DONE_AT) {
      state.completed = true;
      body.completed = true;
    }
    state.percent = body.percent;
    state.position = body.position;
    state.dirty = false;
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    send('POST', '/api/progress', body);
  }

  /** Debounce one report. `measure` is called at fire time, not now, so the
   *  position written is the one the reader ended on rather than the one that
   *  happened to start the timer. */
  function schedule(kind, measure) {
    if (!ctx || state.replaying) return;
    state.dirty = true;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.timer = null;
      report(measure());
    }, DEBOUNCE[kind] || DEBOUNCE.doc);
  }

  function reset() {
    if (!ctx) return;
    send('DELETE', '/api/progress?guidePath=' + encodeURIComponent(ctx.guidePath));
  }

  // ----------------------------------------------------------------- doc mode

  function docPercent(scrollY, viewport, height) {
    /*
      A page with no measured height has not been laid out yet — a framed guide
      whose script runs before layout settles reads 0 here, not "shorter than the
      viewport". The distinction matters because the branch below returns 100,
      and 100 crosses DONE_AT: an unmeasured page would mark itself read on open,
      and `completed` is only ever set. So an unknown height reports 0 and waits
      for a scroll event to measure it properly.
    */
    if (!height || height <= 0) return 0;
    var scrollable = height - viewport;
    // A page that genuinely fits on screen has been read as far as it can be —
    // and the division would be by zero or negative otherwise.
    if (scrollable <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((scrollY / scrollable) * 100)));
  }

  function docAnchor(root, scrollY) {
    var headings = root.querySelectorAll('h1[id], h2[id], h3[id], h4[id]');
    var found = null;
    for (var i = 0; i < headings.length; i += 1) {
      // The last heading whose top is at or above the fold: the one the reader
      // has already passed, not the one they are about to reach. The 24px
      // tolerance keeps a heading pinned exactly at the fold from flipping
      // between the two on every scroll event.
      if (headings[i].offsetTop <= scrollY + 24) found = headings[i].id;
      else break;
    }
    return found;
  }

  function docMeasure() {
    var doc = document.documentElement;
    var y = window.pageYOffset || doc.scrollTop || 0;
    return {
      percent: docPercent(y, window.innerHeight || doc.clientHeight || 0, doc.scrollHeight || 0),
      position: anchorPosition(docAnchor(document, y))
    };
  }

  function anchorPosition(id) {
    // A doc position with no anchor is still a position: the percent stored
    // beside it is what a build with no id'd headings resumes from.
    return id ? { kind: 'doc', anchorId: id } : { kind: 'doc' };
  }

  /** Returns true only when the page was actually moved — the pill is shown on
   *  exactly that signal, and a "resumed" pill over a guide sitting at its first
   *  line is a claim the reader can see is false. */
  function restoreDoc() {
    var stored = ctx && ctx.progress;
    if (!stored) return false;
    var anchorId = stored.position && stored.position.kind === 'doc' ? stored.position.anchorId : null;
    var target = anchorId ? document.getElementById(anchorId) : null;
    // The method is guarded rather than assumed: this script is spliced into
    // documents opened in whatever the reader has, including contexts that
    // implement only part of the DOM, and an exception here would take the
    // reporter down before it had bound a single listener. The percent branch
    // below is a working fallback, so there is no reason to die.
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView();
      return true;
    }
    // A heading id is derived from a slug, so renaming a chapter retires its
    // anchor. The percent is coarser, but it is never stale in that way.
    if (typeof stored.percent === 'number' && stored.percent > 0) {
      var doc = document.documentElement;
      var scrollable = (doc.scrollHeight || 0) - (window.innerHeight || doc.clientHeight || 0);
      window.scrollTo(0, Math.max(0, Math.round((stored.percent / 100) * scrollable)));
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------- init

  function flush(measure) {
    // Only when something is pending: backgrounding a guide nobody touched is
    // not news, and an unconditional flush would make openCount's siblings
    // noisier for nothing.
    if (state.dirty) report(measure());
  }

  /*
    Every listener this instance bound, so it can be undone.

    A framed guide is one document with one reporter, so in production stop() is
    never called — but "never called" is not the same as "not worth having". The
    suites load this file repeatedly into one jsdom window, and without a
    teardown each load would leave its predecessor's listeners bound to that
    window, reporting against a stale context: ten writes where the contract says
    one. A tracked listener list makes the reporter's own lifecycle explicit
    rather than leaving it to whoever cleans up around it.
  */
  var bound = [];

  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    bound.push({ target: target, type: type, handler: handler });
  }

  function stop() {
    for (var i = 0; i < bound.length; i += 1) {
      bound[i].target.removeEventListener(bound[i].type, bound[i].handler);
    }
    bound = [];
    if (state.timer !== null) clearTimeout(state.timer);
    unwatchDeck();
    state.timer = null;
    state.dirty = false;
    state.started = false;
  }

  function init() {
    if (state.started) return;
    ctx = readContext();
    if (!ctx) return;
    state.started = true;

    var isDeck = ctx.kind === 'deck';
    var measure = isDeck ? deckMeasure : docMeasure;

    // Seed the local mirror from what is stored, so `completed` is not re-sent
    // on every write of an already-finished guide and a lower percent later in
    // the session is still reported as the current position.
    if (ctx.progress) {
      state.completed = ctx.progress.completed === true;
      state.percent = typeof ctx.progress.percent === 'number' ? ctx.progress.percent : 0;
      state.position = ctx.progress.position || null;
    }

    var restored = isDeck ? restoreDeck() : restoreDoc();

    // The open, and the only write that increments openCount. Measured after the
    // restore so the position it carries is where the reader actually resumed.
    report({ opened: true, percent: measure().percent, position: measure().position });

    if (isDeck) watchDeck();
    else on(window, 'scroll', function () { schedule('doc', measure); }, { passive: true });

    on(document, 'visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush(measure);
    });
    // pagehide as well as visibilitychange: the desktop close and the phone
    // background are different events, and neither implies the other.
    on(window, 'pagehide', function () { flush(measure); });

    if (restored) showPill(pillText());
  }

  // Deck mode and the pill are defined in later revisions of this file; the
  // stubs keep doc mode loadable on its own.
  function deckMeasure() { return { percent: state.percent, position: state.position }; }
  function restoreDeck() { return false; }
  function watchDeck() {}
  function unwatchDeck() {}
  function pillText() { return 'resumed'; }
  function showPill() {}

  if (typeof document !== 'undefined') {
    // Spliced at the end of <body>, so the document is normally parsed already —
    // but a build that pulls the script in earlier must still work.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__gmProgress = {
      readContext: readContext,
      docAnchor: docAnchor,
      docPercent: docPercent,
      restoreDoc: restoreDoc,
      report: report,
      reset: reset,
      init: init,
      stop: stop
    };
  }
})();
