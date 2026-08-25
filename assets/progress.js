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

  // ---------------------------------------------------------------- deck mode

  /*
    A pending resume: the card index the replay is walking towards, or -1.

    It outlives the initial walk on purpose. `Next` is disabled while an
    unanswered quiz card is showing, so a replay can stall short of its target —
    and that stall is correct, because the gate is what a quiz card is for and
    quiz answers are not stored. Keeping the target pending means answering the
    question carries the reader the rest of the way, instead of leaving them to
    tap Next eighteen times by hand.
  */
  var pending = -1;
  var observer = null;

  function deckCards(root) {
    // Flat and in document order, exactly as a deck's own JS collects them:
    // section wrappers exist for the update flow's benefit and navigation
    // crosses them transparently (deck.md §1).
    return Array.prototype.slice.call(root.querySelectorAll('.card'));
  }

  function activeIndex() {
    var cards = deckCards(document);
    for (var i = 0; i < cards.length; i += 1) {
      if (cards[i].classList.contains('active')) return i;
    }
    return -1;
  }

  function deckPosition(cards, i) {
    var card = cards[i];
    var pos = { kind: 'deck', cardIndex: i };
    if (!card) return pos;
    var section = typeof card.closest === 'function' ? card.closest('section[id]') : null;
    if (section) {
      // Section ids are permanent by contract (deck.md §6), so this pair outlives
      // an incremental regeneration that rewrote an earlier section and shifted
      // every absolute index after it. The opener and the recap card sit outside
      // every wrapper and get neither field.
      pos.sectionId = section.id;
      pos.cardOffset = deckCards(section).indexOf(card);
    }
    return pos;
  }

  function deckTarget(cards, position) {
    if (!position || position.kind !== 'deck' || cards.length === 0) return -1;
    if (position.sectionId) {
      var section = document.getElementById(position.sectionId);
      if (section) {
        var own = deckCards(section);
        if (own.length > 0) {
          var card = own[Math.min(position.cardOffset || 0, own.length - 1)];
          var found = cards.indexOf(card);
          if (found >= 0) return found;
        }
      }
    }
    // Clamped rather than refused: a deck that lost cards should resume near
    // where the reader was, not at card one.
    var raw = typeof position.cardIndex === 'number' ? position.cardIndex : 0;
    return Math.min(Math.max(raw, 0), cards.length - 1);
  }

  function deckPercent(index, total) {
    // The same fraction the deck's own progress bar uses. A one-card deck has no
    // distance to divide by, and its only card is also its last.
    if (total <= 1) return 100;
    return Math.min(100, Math.max(0, Math.round((index / (total - 1)) * 100)));
  }

  function deckMeasure() {
    var cards = deckCards(document);
    var i = activeIndex();
    if (i < 0) return { percent: state.percent, position: state.position };
    return { percent: deckPercent(i, cards.length), position: deckPosition(cards, i) };
  }

  /**
   * Find one of the deck's two navigation controls.
   *
   * deck.md §2 guarantees the pair exists — one persistent Next/Back, never
   * duplicated per card — but spells neither, and the decks in the wild prove how
   * far that goes: one carries `<button id="nav-next">Next</button>`, another
   * `<button id="btn-next">Weiter</button>`. So the *id or class* is tried first
   * and the visible label second. The id is the half that stays English in a
   * generated deck even when its content is not, which makes matching on the word
   * "Next" alone a resume that works in English and silently declines in German.
   *
   * Three passes, narrowest first, and a null when none of them hits: opening at
   * card one is a worse outcome than resuming, but clicking something that is not
   * the pager is worse than both.
   */
  function control(kind) {
    var hook = kind === 'next'
      ? '[data-next], [rel="next"]'
      : '[data-prev], [data-back], [rel="prev"]';
    var explicit = document.querySelector(hook);
    if (explicit) return explicit;

    // `nav-next`, `btn-next`, `next`, `pager-next` — the word as its own segment,
    // so `nextChapter` or a `.context` class cannot be mistaken for the pager.
    var ident = kind === 'next'
      ? /(?:^|[-_\s])(?:next|fwd|forward)(?:$|[-_\s])/i
      : /(?:^|[-_\s])(?:back|prev|previous)(?:$|[-_\s])/i;
    var label = kind === 'next'
      ? /^\s*[‹«]?\s*next\s*[›»→>]?\s*$/i
      : /^\s*[‹«←<]?\s*back\s*[›»]?\s*$/i;

    var candidates = document.querySelectorAll('button, a, [role="button"]');
    var byLabel = null;
    for (var i = 0; i < candidates.length; i += 1) {
      var el = candidates[i];
      if (ident.test(el.id || '') || ident.test(el.className || '')) return el;
      if (byLabel === null && label.test(el.textContent || '')) byLabel = el;
    }
    return byLabel;
  }

  function nextControl() {
    return control('next');
  }

  var gated = function (control) {
    return control.disabled === true || control.getAttribute('aria-disabled') === 'true';
  };

  /**
   * Walk forward towards `pending` by clicking the deck's own control.
   *
   * Never by setting `.active` directly: the deck owns its current index, its
   * score and its progress bar, and a hand-set card leaves all three describing a
   * screen that is not there — the reader's next Back tap would jump to card one.
   *
   * Stops on three conditions: arrival, a gate, and no movement. The last is the
   * guard that matters most — if a click does not change the visible card, the
   * control is not the one this deck navigates with, and looping on it would spin
   * forever inside someone's guide.
   */
  function advance() {
    var next = nextControl();
    if (!next || pending < 0) return;
    var guard = deckCards(document).length + 1;
    while (guard > 0) {
      var at = activeIndex();
      if (at < 0 || at >= pending) break;
      if (gated(next)) break;
      next.click();
      if (activeIndex() === at) break;
      guard -= 1;
    }
    if (activeIndex() >= pending) pending = -1;
  }

  function restoreDeck() {
    var cards = deckCards(document);
    var storedProgress = ctx && ctx.progress;
    if (cards.length === 0 || !storedProgress) return false;
    var target = deckTarget(cards, storedProgress.position);
    // Card one is where a deck already opens, so there is nothing to restore and
    // nothing to announce.
    if (target <= 0 || target <= activeIndex()) return false;
    pending = target;
    state.replaying = true;
    advance();
    state.replaying = false;
    return activeIndex() > 0;
  }

  /**
   * Watch the deck rather than wrap its functions.
   *
   * A MutationObserver works whatever the deck named its handlers and however it
   * wired them, and there is no second copy of the navigation logic to keep in
   * sync. Two things are watched together because they are the same event seen
   * from two sides: the active card changing (the reader moved, or the replay
   * did) and `Next` losing its disabled state (a gate cleared, so a stalled
   * replay can continue).
   */
  function watchDeck() {
    if (typeof MutationObserver === 'undefined') return;
    var last = activeIndex();
    observer = new MutationObserver(function () {
      var now = activeIndex();
      if (now === last) {
        // No card change: this is the gate clearing. Resume a stalled replay.
        if (pending >= 0 && now < pending) {
          state.replaying = true;
          advance();
          state.replaying = false;
          if (activeIndex() !== last) {
            last = activeIndex();
            schedule('deck', deckMeasure);
          }
        }
        return;
      }
      if (pending >= 0 && now < last) {
        // Backwards while a resume is pending: the reader has taken control, and
        // a resume that fought them would be worse than no resume at all.
        pending = -1;
      }
      last = now;
      if (pending < 0) schedule('deck', deckMeasure);
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-disabled']
    });
  }

  function unwatchDeck() {
    if (observer) observer.disconnect();
    observer = null;
    pending = -1;
  }

  // --------------------------------------------------------------------- pill

  var PILL_MS = 6000;
  var pillTimer = null;

  /*
    Docked to the top, centred, and never to the bottom.

    The bottom edge is where a tutor deck keeps its own Back/Next pair — a sticky
    bar across the full width of the frame — so a pill anchored there lands
    *inside* the deck's own nav: level with the buttons, reading as a stray link
    wedged into the deck's chrome rather than as a message about the guide, and
    overlapping the Back button outright once the frame narrows. A study build
    leaves the bottom clear but runs its contents rail down the left, so the
    bottom-left corner is the one place both types have something to say. The top
    band is clear in both: a deck carries only a hairline progress bar and a card
    counter there, and a build its own heading.

    Styled from the page's own theme tokens with literal fallbacks, because a
    guide is also a file someone can open straight off disk over file:// — where
    /theme.css was never linked and every var() would resolve to nothing. The
    typeface is inherited rather than declared: a monospace box on a deck set in
    system-ui reads as something broken that leaked in.

    The z-index is deliberately near the top of the range: a deck's own sticky
    nav sits above its cards, and a pill buried under it is a pill nobody reads.
  */
  var PILL_CSS = [
    '.gm-progress-pill{',
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;',
    'display:flex;align-items:center;gap:10px;',
    'max-width:calc(100vw - 24px);box-sizing:border-box;',
    'padding:8px 13px;border-radius:999px;',
    'font-family:inherit;font-size:13px;line-height:1.3;',
    'color:var(--fg,#e6e6e6);background:var(--panel,#1b1b1b);',
    'border:1px solid var(--line,#333);box-shadow:0 4px 16px rgba(0,0,0,.4);',
    'opacity:1;transition:opacity .25s}',
    '.gm-progress-pill[data-leaving]{opacity:0}',
    '.gm-progress-pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gm-progress-pill button{',
    'flex:none;font:inherit;color:var(--accent,#4db6c4);background:none;',
    // A real tap target rather than a bare text run: this is reached from a
    // phone, where an 11px line of text is a coin toss.
    'border:0;padding:2px 0;min-height:24px;cursor:pointer;text-decoration:underline}'
  ].join('');

  function ensurePillStyles() {
    // Inlined rather than served as a second stylesheet route: one more route is
    // one more Vite proxy entry and one more line in the static-fallback
    // exclusion, each of which fails invisibly when forgotten. A dozen rules do
    // not earn that. Marked with an attribute so repeated shows share one copy.
    if (document.querySelector('style[data-gm-progress-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-gm-progress-style', '');
    style.textContent = PILL_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function dismissPill() {
    if (pillTimer !== null) {
      clearTimeout(pillTimer);
      pillTimer = null;
    }
    var existing = document.querySelector('.gm-progress-pill');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  /** Send the guide back to its own beginning — card one, or the top — and
   *  forget the stored position through the same endpoint the viewer's reset
   *  button uses. One way to forget a guide, not two that could disagree. */
  function restart() {
    pending = -1;
    var cards = deckCards(document);
    if (cards.length > 0) {
      // Back, repeatedly, for the same reason the resume uses Next: the deck's
      // own control keeps the deck's own index honest. Bounded by the card count,
      // and stops early if a click does not move anything.
      var back = control('back');
      var guard = cards.length + 1;
      while (back && guard > 0 && activeIndex() > 0) {
        var at = activeIndex();
        if (gated(back)) break;
        back.click();
        if (activeIndex() === at) break;
        guard -= 1;
      }
    } else if (typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
    reset();
    dismissPill();
  }

  function showPill(text) {
    if (typeof document === 'undefined' || !document.body) return null;
    // One pill at a time: a second would cover the first, and both would be
    // describing the same restore.
    dismissPill();
    ensurePillStyles();

    var el = document.createElement('div');
    el.className = 'gm-progress-pill';
    var label = document.createElement('span');
    label.textContent = text;
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-gm-restart', '');
    button.textContent = 'start over';
    button.addEventListener('click', restart);
    el.appendChild(label);
    el.appendChild(button);
    document.body.appendChild(el);

    // Fades out on its own: it is an explanation, not a control panel, and once
    // read it is in the way of the guide it just explained. The reset it offers
    // also lives permanently in the viewer's head, so nothing is lost with it.
    pillTimer = setTimeout(function () {
      pillTimer = null;
      el.setAttribute('data-leaving', '');
      setTimeout(dismissPill, 250);
    }, PILL_MS);

    return el;
  }

  /**
   * What the pill says.
   *
   * A parked replay gets its own wording rather than a bare "resumed": the deck
   * is showing a question, not the card the reader left off on, and naming that
   * turns a stall into an instruction. Everything else is a plain statement of
   * what happened.
   */
  function pillText() {
    if (pending >= 0) return 'resuming — answer this to continue';
    return 'resumed where you left off';
  }

  if (typeof document !== 'undefined') {
    // Spliced at the end of <body>, so the document is normally parsed already —
    // but a build that pulls the script in earlier must still work.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__gmProgress = {
      readContext: readContext,
      deckCards: deckCards,
      deckPosition: deckPosition,
      deckTarget: deckTarget,
      deckPercent: deckPercent,
      restoreDeck: restoreDeck,
      activeIndex: activeIndex,
      docAnchor: docAnchor,
      docPercent: docPercent,
      restoreDoc: restoreDoc,
      report: report,
      reset: reset,
      showPill: showPill,
      init: init,
      stop: stop
    };
  }
})();
