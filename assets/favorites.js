/* favorites v1 — served by guide-manager; injected into framed guides by GET /asset */
(function () {
  'use strict';

  /*
    A second copy of this script in one document would mount a second star in
    the header and listen for taps a second time — every capture answered
    twice, and no way for either copy to know the other exists. injectFavoritesCapture's own header check keeps two *splices* from happening, but that
    guard runs once, at render time; it says nothing about a document that
    somehow ends up with this file evaluated more than once at runtime (a
    build that vendors a copy of its own on top of the served one, or — the
    case every suite in this file actually exercises — a test loading SRC
    twice into the same jsdom window without tearing the first instance down
    first). So the check here is a second, independent one: a document-level
    flag this script itself sets and checks, rather than a header stamped
    into the markup once. Finding the flag already set means some other
    instance is live, and the whole IIFE returns before defining a single
    function — including before clobbering globalThis.__gmFavorites, which is
    the one thing a second instance must never do to a first instance still
    running.
  */
  if (document.documentElement.hasAttribute('data-gm-favorites')) return;

  // ------------------------------------------------------------------ context

  /*
    Where this frame is, read off the blob /asset spliced in beside this
    script — see FavoritesContext in server/src/render/render.util.ts for the
    shape and injectFavoritesCapture for why it is inlined here rather than
    fetched: this request has already been resolved through the registry
    allowlist, so the path, the project, the title and the kind are all known
    without asking again.

    Same shape of function, and the same silence-on-malformed reasoning, as
    the progress reporter's readContext (assets/progress.js): a broken blob
    means this frame cannot know which guide it is in, and guessing would
    risk saving a favorite against the wrong row entirely.
  */
  function readContext() {
    if (typeof document === 'undefined') return null;
    var el = document.getElementById('gm-favorites');
    if (!el) return null;
    try {
      var parsed = JSON.parse(el.textContent || 'null');
      return parsed && typeof parsed.guidePath === 'string' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  /*
    The context this instance mounted against, kept for the capture flow —
    a draft has to name the guide it came from, and re-reading the blob per
    save would answer a different question (what the document says *now*)
    than the one that matters (what this instance mounted against).
  */
  var ctx = null;

  /*
    started() is a plain read of the same attribute the load guard above
    checks — one flag serves both jobs, since "another instance is mounted"
    and "this instance has mounted" are the same fact seen from either side
    of init().
  */
  function started() {
    return document.documentElement.hasAttribute('data-gm-favorites');
  }

  /*
    Verbatim glyphs, in one place. The star is the whole affordance — idle it
    is an outline, armed it is filled — and a mismatch between the two would
    read as two different controls rather than one control in two states.
  */
  var STAR_IDLE = '☆';
  var STAR_ON = '★';
  // The separator every label uses. A middle dot rather than a dash: the two
  // halves of a label are a kind and a name, not a range.
  var DOT = ' · ';

  // -------------------------------------------------------------------- mount

  /*
    Every listener this instance bound, split by lifetime.

    `bound` is the mount's own — the star's click and the pagehide teardown —
    and lives until stop(). `pickBound` is everything picking mode binds, and
    is undone by leave() alone: the picker takes over the guide's clicks while
    it is armed, so "armed" has to be exactly as long as those listeners are
    attached. Two lists rather than one flag, for the same reason the reporter
    keeps a list at all: the suites load this file repeatedly into one jsdom
    window, and an untracked listener from a previous load answers taps in a
    document it no longer describes.
  */
  var bound = [];
  var pickBound = [];

  function on(list, target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    list.push({ target: target, type: type, handler: handler, opts: opts });
  }

  function unbind(list) {
    for (var i = 0; i < list.length; i += 1) {
      // The capture flag has to match the one used to bind, or the listener
      // stays attached — removeEventListener treats capture as part of a
      // listener's identity.
      list[i].target.removeEventListener(list[i].type, list[i].handler, list[i].opts);
    }
    list.length = 0;
  }

  /** Inject a stylesheet into a document once, marked so repeats share it. */
  function ensureStyles(doc, marker, css) {
    if (!doc || doc.querySelector('style[' + marker + ']')) return;
    var style = doc.createElement('style');
    style.setAttribute(marker, '');
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }

  /* Where the answer is written, so both the sheet and the teardown name it
     once. On the root element rather than on the picker's own nodes: the
     outline, the toolbar and the floating star mount independently, and one
     stamp above all three cannot leave two of them disagreeing. */
  var SCHEME_ATTR = 'data-gm-fav-scheme';

  /*
    The luminance below which white text beats black text on a background.

    Not a taste threshold — it is where the two WCAG contrast ratios cross.
    White-on-L is 1.05/(L+0.05) and black-on-L is (L+0.05)/0.05, equal at
    L = sqrt(0.05 * 1.05) - 0.05. So a guide darker than this is one the dark
    palette is measurably more readable on, and the picker follows the
    measurement rather than a guess about which palette a generator meant.
  */
  var DARK_BELOW = Math.sqrt(0.05 * 1.05) - 0.05;

  /** sRGB relative luminance, WCAG 2.x's definition. */
  function luminance(r, g, b) {
    var c = [r / 255, g / 255, b / 255];
    for (var i = 0; i < 3; i += 1) {
      c[i] = c[i] <= 0.03928 ? c[i] / 12.92 : Math.pow((c[i] + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  /*
    A computed colour's luminance, or null for one that paints nothing.

    Null is the load-bearing answer: an element with no background of its own
    computes to `rgba(0,0,0,0)`, which is transparent black, and reading that
    as a luminance of 0 would call every unstyled guide dark — exactly the
    black slab this palette work exists to remove. Only a zero alpha counts as
    see-through; a colour laid on at 40% is still a colour the reader sees, and
    guessing at what is behind it would be a second, worse measurement.
  */
  function opaqueLuminance(value) {
    if (!value) return null;
    var m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+))?/.exec(value);
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return luminance(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  /*
    Which palette this guide wants, measured off what it actually paints.

    The body first, then the root element behind it, because a generated guide
    may set its page colour on either — and a body that paints nothing is not
    a dark page, it is a window onto whatever is behind it. When neither paints
    anything the answer is light: an unstyled page is white in every engine, so
    white is the only honest assumption, and assuming dark is what put a black
    toolbar on white paper in the first place.

    Measured rather than asked, which is the whole point. Asking means naming
    tokens — `--panel`, `--bg` — and a generated guide publishes whatever set
    its generator happened to write; the picker would be guessing at names
    again, one layer further down.
  */
  function schemeFor(doc) {
    var view = doc && doc.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') return 'light';
    var els = [doc.body, doc.documentElement];
    for (var i = 0; i < els.length; i += 1) {
      if (!els[i]) continue;
      var lum = opaqueLuminance(view.getComputedStyle(els[i]).backgroundColor);
      if (lum === null) continue;
      return lum < DARK_BELOW ? 'dark' : 'light';
    }
    return 'light';
  }

  /*
    Stamp the answer, and re-stamp it every time the picker mounts anything.

    Re-measuring per mount rather than once at init is what keeps the picker
    honest about a guide that changes under it: these decks answer
    `prefers-color-scheme`, and a reader who flips their system theme with the
    picker disarmed would otherwise re-arm it painted for the palette it first
    loaded against. The `change` listener in init() covers the flip that
    happens while it is armed; this covers every other order.
  */
  function applyScheme() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.setAttribute(SCHEME_ATTR, schemeFor(document));
  }

  /*
    The star's own look, needed in whichever document it ends up in — the
    shell's header when there is one, this guide's body when there is not — so
    it is a fragment both stylesheets carry rather than a third sheet.

    A bare glyph on a transparent button: the header it mounts into is the
    app's chrome, and a bordered control there would read as something the
    guide brought with it. Colour is the only state signal.

    Both colours are read through `--gm-*` rather than named directly, because
    the two documents answer them from different places: the shell's sheet maps
    them onto the app's own theme tokens, and the frame's sheet onto the
    picker's palette (see PALETTE_DARK). One fragment, two answers, and neither
    document is asked for a name it might not have.
  */
  var TOGGLE_CSS = [
    '.gm-fav-toggle{',
    '-webkit-appearance:none;appearance:none;background:none;border:0;',
    'margin:0;padding:0 2px;cursor:pointer;line-height:1;',
    'font-family:inherit;font-size:1rem;color:var(--gm-muted)}',
    '.gm-fav-toggle[aria-pressed="true"]{color:var(--gm-accent)}'
  ].join('');

  /*
    The picker's own palette, in full, twice — and the reason it is its own
    rather than the guide's.

    Everything this script draws inside a framed guide used to theme itself
    from the *guide's* token names with a dark literal behind each one:
    `var(--panel,#1b1b1b)` for the surface, `var(--fg,#e6e6e6)` for the text on
    it. That works at both ends — a guide that publishes all of those names
    gets its own look, a guide that publishes none of them gets the picker's —
    and fails in the middle, which is where the generated guides actually live.
    A tutor deck declaring `--bg`, `--fg`, `--muted` and `--line` but no
    `--panel` took the dark `#1b1b1b` fallback for the toolbar and its own
    near-black `#1a1c20` for the text on it: a pill whose buttons were legible
    only as borders, those coming from the deck's own light `--line`. Half of
    each palette, and no individual declaration wrong.

    So the frame sheet declares every name it reads. Nothing about a guide's
    stylesheet can reach inside the picker, whatever a future generator decides
    to publish — the failure above was silent, and this is the property that
    makes it impossible rather than merely unlikely. What the guide still
    decides is which of the two palettes applies, and it decides that by being
    measured (schemeFor) rather than by being asked for names.

    The light accent is the app's own daylight cyan rather than a lightened
    #55d0dd: the dark accent on white is about 1.7:1, which is not a colour so
    much as a rumour of one.
  */
  var PALETTE_DARK = [
    '--gm-fg:#e6e6e6;--gm-panel:#1b1b1b;--gm-field:#111;--gm-line:#333;',
    '--gm-muted:#8b8b8b;--gm-accent:#55d0dd;--gm-wash:rgba(85,208,221,.12);',
    '--gm-shadow:rgba(0,0,0,.4)'
  ].join('');
  var PALETTE_LIGHT = [
    '--gm-fg:#1a1c20;--gm-panel:#fbfbfc;--gm-field:#fff;--gm-line:#d0d4da;',
    '--gm-muted:#5b6270;--gm-accent:#136d78;--gm-wash:rgba(19,109,120,.12);',
    '--gm-shadow:rgba(30,35,45,.18)'
  ].join('');

  /* Every element the picker draws inside a guide. Listed rather than hung on
     one wrapper because the three mount in three different places: the toolbar
     and panel share `.gm-fav-ui`, the outline is a loose box over the block,
     and the floating star is the no-shell fallback in the opposite corner. */
  var PICKER_PARTS = ['.gm-fav-ui', '.gm-fav-outline', '.gm-fav-toggle'];

  /* One palette declaration across all three, optionally under a prefix. The
     prefix has to be pasted onto each part rather than onto the list: a
     descendant combinator binds to the first selector of a comma list only,
     so `[x] .a,.b` means `.b` unconditionally — which would have made the
     light palette win in every document that loaded this sheet. */
  function paletteRule(prefix, decls) {
    var parts = [];
    for (var i = 0; i < PICKER_PARTS.length; i += 1) parts.push(prefix + PICKER_PARTS[i]);
    return parts.join(',') + '{' + decls + '}';
  }

  /*
    The shell's sheet: the star's look plus where it sits on the breadcrumb
    line.

    The flex rule is the same one the resume notice ships (assets/progress.js,
    NOTICE_CSS) and for the same reason — a float does not contribute to its
    parent's height, so in a one-line bar it has nowhere to land. Both rules
    setting it is deliberate: either element may be mounted without the other,
    so neither can rely on the other's stylesheet being present.

    `margin-left:auto` is what pushes the star to the end of the line, and
    exactly one element on the line may claim it: two auto margins split the
    slack between them and both elements end up floating in the middle of the
    bar. The notice claims it too, so the two sibling rules below hand the auto
    margin to whichever comes first and give the second a plain gap. They are
    two rules rather than one because the notice mounts on a restore and the
    star mounts always — neither order is guaranteed.
  */
  var SHELL_CSS = [
    '.topbar .crumbs{display:flex;align-items:center;min-width:0}',
    // The shell is the app's own chrome and loads /theme.css, so here the two
    // names the star reads are answered from the app's palette — inheriting is
    // the point in this document, and the literals are for a guide opened
    // straight off disk over file://, where no stylesheet was ever linked.
    '.gm-fav-toggle{--gm-muted:var(--muted,#8b8b8b);--gm-accent:var(--cyan,#55d0dd)}',
    TOGGLE_CSS,
    '.gm-fav-toggle{margin-left:auto}',
    '.gm-progress-note + .gm-fav-toggle{margin-left:12px}',
    '.gm-fav-toggle + .gm-progress-note{margin-left:12px}'
  ].join('');

  /*
    Everything this script draws inside the guide itself.

    The outline is a fixed box over the block the reader is about to keep, and
    is `pointer-events:none` so it never becomes the thing under the next tap —
    an outline that swallowed clicks would make the block it is describing
    unpickable the moment it appeared.

    The toolbar is styled from the pill's own token-plus-fallback pairs so the
    two read as one system, and docked to the top for the pill's reason: the
    bottom edge of a deck is where the deck keeps its own Back/Next bar, and
    anything anchored there lands inside the deck's chrome. The z-index is near
    the top of the range because that sticky bar sits above the cards.

    The floating star is the no-shell fallback, and takes the opposite corner
    from the toolbar so the two never overlap.

    The save panel is styled as the same dock as the toolbar rather than as a
    second surface: it replaces the toolbar in place, and picking a block and
    naming it are two steps of one act. Two independently positioned elements
    would visibly jump apart at the step between them, which would read as the
    picker closing and something else opening.
  */
  var FRAME_CSS = [
    // Dark unprefixed, light under the stamp, so a document that somehow never
    // got measured still reads — the dark pair is the one the picker shipped
    // with, and it is self-consistent.
    paletteRule('', PALETTE_DARK),
    paletteRule('[data-gm-fav-scheme="light"] ', PALETTE_LIGHT),
    TOGGLE_CSS,
    '.gm-fav-toggle.gm-fav-floating{position:fixed;top:12px;right:12px;z-index:2147483000}',
    '.gm-fav-outline{',
    'position:fixed;pointer-events:none;',
    'border:2px solid var(--gm-accent);background:var(--gm-wash);',
    'z-index:2147483000;border-radius:3px}',
    '.gm-fav-outline[hidden]{display:none}',
    '.gm-fav-toolbar,.gm-fav-panel{',
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;',
    'display:flex;align-items:center;gap:8px;',
    'max-width:calc(100vw - 24px);box-sizing:border-box;',
    'padding:6px 10px;border-radius:999px;',
    'font-family:inherit;font-size:13px;line-height:1.3;',
    'color:var(--gm-fg);background:var(--gm-panel);',
    'border:1px solid var(--gm-line);box-shadow:0 4px 16px var(--gm-shadow)}',
    // The panel is given a width instead of shrink-wrapping its contents: an
    // input sized by its value starts one word wide over a block whose title
    // defaulted to nothing, and grows under the reader as they type. The pill
    // radius goes with it — a 999px corner around a text field crops the field.
    '.gm-fav-panel{width:520px;border-radius:14px}',
    // The label is the one part that can be arbitrarily long — a section named
    // after its heading — so it is the one part that gives way.
    '.gm-fav-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gm-fav-panel input,.gm-fav-panel textarea{',
    'min-width:0;flex:1 1 auto;',
    'font-family:inherit;font-size:13px;line-height:1.35;',
    'padding:4px 8px;border-radius:8px;resize:none;',
    'color:var(--gm-fg);background:var(--gm-field);',
    'border:1px solid var(--gm-line)}',
    // The status is empty until the write answers, and holds no space while it
    // is: a permanent gap beside the buttons would read as a missing control.
    '.gm-fav-status{white-space:nowrap;color:var(--gm-muted)}',
    // Keyed off gm-fav-ui, which both the toolbar and the panel carry, so the
    // two rows of buttons cannot drift apart as one of them gains a control.
    '.gm-fav-ui button{',
    '-webkit-appearance:none;appearance:none;cursor:pointer;',
    'font-family:inherit;font-size:12px;line-height:1;white-space:nowrap;',
    'padding:5px 9px;border-radius:999px;',
    'color:var(--gm-fg);background:none;border:1px solid var(--gm-line)}',
    '.gm-fav-ui button[disabled]{opacity:.4;cursor:default}',
    // The one accented control in each row is the one that commits.
    '.gm-fav-save,.gm-fav-confirm{border-color:var(--gm-accent);color:var(--gm-accent)}'
  ].join('');

  /**
   * The shell's breadcrumb line, if this guide is being framed by one.
   *
   * Found and guarded exactly like headerHost() in assets/progress.js, because
   * it is the same reach for the same reason: `GET /guide` wraps every guide in
   * a shell whose sticky topbar carries the breadcrumb, and frames the guide
   * itself — so from in here that header is one document up. It is same-origin
   * by design (the shell already reaches the other way, calling focus() on this
   * frame), so no message channel is needed; the star is appended to the
   * parent's breadcrumb nav directly.
   *
   * The star belongs there rather than over the guide because it is a control
   * *about* the guide, and the header is the one strip of screen that occludes
   * none of it. Null when there is no such header — a guide opened straight off
   * disk, or framed by something that is not our shell — and then the floating
   * fallback is used instead. Wrapped in try/catch because a cross-origin
   * parent throws on property access rather than returning null.
   */
  function host() {
    try {
      if (typeof window === 'undefined' || !window.parent || window.parent === window) return null;
      var doc = window.parent.document;
      if (!doc) return null;
      return doc.querySelector('.topbar .crumbs') || doc.querySelector('.topbar-title');
    } catch (e) {
      return null;
    }
  }

  var toggle = null;

  /**
   * Put the star where the reader can reach it: the shell's header when there
   * is one, a fixed corner of the guide otherwise.
   */
  function mountToggle() {
    var target = host();
    var doc = target ? target.ownerDocument : document;
    if (!target && !document.body) return null;

    // Never two: a second star would be a second picker's worth of state
    // sitting in a header that can only mean one thing at a time.
    unmountToggle();

    if (target) {
      ensureStyles(doc, 'data-gm-favorites-shell-style', SHELL_CSS);
    } else {
      ensureStyles(document, 'data-gm-favorites-style', FRAME_CSS);
      applyScheme();
    }

    var el = doc.createElement('button');
    // Explicitly not a submit button: a guide is generated markup and may well
    // wrap its content in a form.
    el.type = 'button';
    el.className = 'gm-fav-toggle' + (target ? '' : ' gm-fav-floating');
    // aria-pressed rather than a label that changes: this is one control that
    // is on or off, and a screen reader should hear it that way. The glyph
    // carries the same state visually.
    el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', 'Save a piece of this guide');
    el.textContent = STAR_IDLE;
    (target || document.body).appendChild(el);
    toggle = el;

    on(bound, el, 'click', onToggleClick);
    return el;
  }

  /*
    Removes every star in whichever document holds them, not just the one this
    instance created — same reasoning as the reporter's dismissNotice: the
    header outlives the frame, so a star orphaned there by a previous guide is
    exactly the thing that must not survive into this one.
  */
  function unmountToggle() {
    var target = host();
    var doc = target ? target.ownerDocument : document;
    if (!doc) return;
    var existing = doc.querySelectorAll('.gm-fav-toggle');
    for (var i = 0; i < existing.length; i += 1) {
      if (existing[i].parentNode) existing[i].parentNode.removeChild(existing[i]);
    }
    toggle = null;
  }

  function onToggleClick(event) {
    event.preventDefault();
    if (isPicking) leave();
    else enter();
  }

  /** Reflect picking state in the star, wherever it happens to be mounted. */
  function paintToggle() {
    if (!toggle) return;
    toggle.textContent = isPicking ? STAR_ON : STAR_IDLE;
    toggle.setAttribute('aria-pressed', isPicking ? 'true' : 'false');
  }

  // -------------------------------------------------------------- block rules

  /*
    What counts as a keepable piece of a guide.

    The list is deliberately of *things a reader would name* — a table, a
    diagram, a list, a card, a section — rather than every element that happens
    to be block-level. A `div` is not on it: guides wrap things in divs for
    layout, and a layout div is a box the reader never sees the edges of, so
    offering it as a selection would offer a selection nobody asked for. The
    two class entries are the exceptions where a div *is* a named thing: a
    tutor deck's `.card` is the unit the whole deck is built from, and
    `.quiz-options` is the block a question's answers live in.
  */
  var BLOCKS = 'p, h1, h2, h3, h4, h5, h6, ul, ol, dl, table, pre, blockquote, figure, details, svg, img, .quiz-options, .card, section, article';

  /*
    The roots widen() refuses to climb past. A card is the whole unit of a deck
    and a section is a whole chapter of a build; the step above either is "most
    of the guide", which is not a favorite, it is the guide.
  */
  var CONTAINERS = '.card, section, article';

  function isElement(node) {
    return !!node && node.nodeType === 1 && typeof node.matches === 'function';
  }

  /**
   * Is this element something the reader can keep?
   *
   * Two exclusions on top of the block list. A guide's `nav` — a deck's
   * Back/Next pager, a build's contents rail — is chrome: it is how the reader
   * moves, not something they read, and it means nothing at all once it is out
   * of the guide it navigates. And the picker's own toolbar is inside this
   * same document, so without the second exclusion its buttons would be
   * candidates for the picker they belong to.
   */
  function isBlock(el) {
    if (!isElement(el)) return false;
    if (!el.matches(BLOCKS)) return false;
    if (el.closest('nav')) return false;
    if (el.closest('.gm-fav-ui')) return false;
    return true;
  }

  /** 1–6 for a heading element, 0 for anything else. */
  function headingLevel(el) {
    if (!isElement(el)) return 0;
    var match = /^h([1-6])$/.exec(el.tagName.toLowerCase());
    return match ? Number(match[1]) : 0;
  }

  function tagOf(el) {
    return el && el.tagName ? el.tagName.toLowerCase() : '';
  }

  // ----------------------------------------- candidate, group, widen, narrow

  /*
    The nodes currently selected (always an array, because a heading selection
    is a run of siblings rather than one element), and the stack of selections
    widen() climbed out of.

    The stack is what makes narrowing the exact inverse of widening rather than
    a guess: coming back down from a card, the reader means "the table I was on
    before", not "the first block this card happens to contain".
  */
  var current = null;
  var climb = [];

  function candidate() {
    return current;
  }

  /**
   * The block a tap at `target` means.
   *
   * Walks up from whatever was actually hit — a `td`, a word in a paragraph, a
   * quiz option's button — to the first thing on the block list, because that
   * is the level at which a piece of a guide has a name. The walk stops at
   * `body`: past it there is only the document, and "keep the whole guide" is
   * what the guide list already does.
   *
   * Null is a real answer and the important one. A tap on the deck's pager, on
   * the contents rail, or on the picker's own toolbar resolves to nothing, and
   * the click handler passes those straight through to whoever else wanted
   * them — the picker being armed must not make a guide unnavigable.
   *
   * A heading resolves to the heading, not to the passage under it. It used to
   * resolve to the group, which made a tap anywhere near a heading swallow
   * most of a card — and, back when the pointer picked too, made simply moving
   * across a guide box one passage after another. A pick is now always the
   * smallest honest answer; the passage is one `wider` away, which is the
   * reader asking for it rather than the picker assuming it.
   */
  function candidateAt(target) {
    if (!isElement(target)) return null;
    // Checked once up front rather than per step: the toolbar's buttons are
    // not blocks themselves, so only their ancestor carries the marker.
    if (target.closest('.gm-fav-ui')) return null;

    var body = target.ownerDocument ? target.ownerDocument.body : document.body;
    var el = target;
    while (isElement(el) && el !== body) {
      // Reaching a nav before reaching a block means the tap started inside
      // the guide's chrome. isBlock() rejects blocks nested in a nav for the
      // same reason; this stops the walk from climbing out of one.
      if (tagOf(el) === 'nav') return null;
      if (isBlock(el)) return [el];
      el = el.parentElement;
    }
    return null;
  }

  /**
   * A heading, plus everything it introduces.
   *
   * Tapping a heading means the passage under it, not the line of text — so
   * the selection runs from the heading to just before the next heading of the
   * same level or shallower, or to the end of its parent. Deeper headings are
   * carried along, because they are part of what this one introduces.
   *
   * The run is siblings, not descendants: in both guide shapes a heading and
   * its prose are siblings under a card or a section, so there is no single
   * element to select instead.
   */
  function groupFor(heading) {
    var level = headingLevel(heading);
    var nodes = [heading];
    if (!level) return nodes;
    var el = heading.nextElementSibling;
    while (el) {
      var other = headingLevel(el);
      if (other && other <= level) break;
      nodes.push(el);
      el = el.nextElementSibling;
    }
    return nodes;
  }

  /** The first block strictly inside `el`, in document order, or null. */
  function firstBlockDescendant(el) {
    if (!el || typeof el.querySelectorAll !== 'function') return null;
    var all = el.querySelectorAll(BLOCKS);
    for (var i = 0; i < all.length; i += 1) {
      if (isBlock(all[i])) return all[i];
    }
    return null;
  }

  /*
    What widen() would select, or null when it would do nothing. Split out from
    widen() itself so the toolbar can disable the control rather than offering
    a button that silently does nothing when pressed.
  */
  function widenTarget() {
    if (!current || !current.length) return null;
    var first = current[0];

    /*
      From a heading alone, the first step out is the passage it introduces.
      The group is a run of siblings rather than a container, so the climb
      below cannot reach it — without this branch, `wider` on a heading would
      jump straight to the card or section holding it, which is the jump this
      ladder exists to break into steps.

      Guarded on a selection of one, because the group's own first node is
      that same heading: without the length check, `wider` on a group would
      re-derive the group and visibly do nothing. The length check also covers
      the heading that introduces nothing — a divider card's trailing `h2`,
      whose group is the heading itself — since a one-node group is that same
      non-step, and both fall through to the climb.
    */
    if (current.length === 1 && headingLevel(first)) {
      var group = groupFor(first);
      if (group.length > 1) return group;
    }

    if (first.matches(CONTAINERS)) return null;

    var body = first.ownerDocument ? first.ownerDocument.body : document.body;
    var el = first.parentElement;
    while (isElement(el) && el !== body) {
      if (tagOf(el) === 'nav') return null;
      if (isBlock(el)) return [el];
      el = el.parentElement;
    }
    return null;
  }

  /*
    What narrow() would select. The climb stack first — undoing a widen is the
    common case and has to be exact — and only then a step inward, which is
    what narrowing means when the reader never widened.

    A heading group is the case the generic step inward gets wrong. Its first
    node is the heading, which contains nothing, and the prose beside it is a
    sibling rather than a child — so firstBlockDescendant answers null for a
    selection that plainly has an inside. Its step inward is the heading that
    opens it, which is the exact inverse of widenTarget's group rung. Answered
    here rather than left to the climb stack, because the group is reachable
    without a climb: setCandidate takes it directly.
  */
  function narrowTarget() {
    if (climb.length) return climb[climb.length - 1];
    if (!current || !current.length) return null;
    if (current.length > 1 && headingLevel(current[0])) return [current[0]];
    var inner = firstBlockDescendant(current[0]);
    return inner ? [inner] : null;
  }

  function widen() {
    var target = widenTarget();
    if (!target) return false;
    climb.push(current);
    applyCandidate(target);
    return true;
  }

  function narrow() {
    if (climb.length) {
      applyCandidate(climb.pop());
      return true;
    }
    var target = narrowTarget();
    if (!target) return false;
    applyCandidate(target);
    return true;
  }

  /**
   * Select these nodes, as a new pick.
   *
   * Public because a pick is what a tap and a hover produce, and both are new
   * picks: the climb stack is dropped, since narrowing after pointing
   * somewhere else would take the reader back into a block they have already
   * left. widen() and narrow() go through applyCandidate() instead, which is
   * the same thing minus that reset.
   */
  function setCandidate(nodes) {
    climb = [];
    applyCandidate(nodes);
  }

  function applyCandidate(nodes) {
    current = nodes && nodes.length ? nodes : null;
    renderCandidate();
  }

  // -------------------------------------------------------------------- label

  /**
   * What the toolbar calls the current selection.
   *
   * The reader is being asked to keep this thing, so the label says what it is
   * in their words — "table · 3 rows", "card · Die Tabelle" — rather than
   * naming a tag. Where a count or a heading is available it is included,
   * because two tables on one card are otherwise indistinguishable in a
   * one-line toolbar.
   */
  function labelFor(nodes) {
    if (!nodes || !nodes.length) return '';
    var el = nodes[0];
    var tag = tagOf(el);

    // A heading first node means one of the two rungs a heading sits on, and
    // the count is what tells them apart: a run of siblings is the passage,
    // named after the heading that introduces it, while the heading alone is
    // the line itself. Naming that line a section would promise prose the
    // reader has not taken yet — and since the two are one `wider` apart, this
    // label is the only place on screen the difference shows. Checked before
    // anything else because the group is what the selection is, whatever its
    // first element's tag.
    if (headingLevel(el)) return (nodes.length > 1 ? 'section' : 'heading') + DOT + textOf(el);

    if (tag === 'table') return 'table' + DOT + (el.rows ? el.rows.length : 0) + ' rows';
    if (el.matches('.card')) {
      // A deck card's own title is its h2 (deck.md); the eyebrow above it
      // names the section, which the crumb already carries.
      var cardHeading = el.querySelector('h2');
      return cardHeading ? 'card' + DOT + textOf(cardHeading) : 'card';
    }
    if (tag === 'section' || tag === 'article') {
      var sectionHeading = el.querySelector('h1, h2, h3, h4, h5, h6');
      return sectionHeading ? 'section' + DOT + textOf(sectionHeading) : 'section';
    }
    if (tag === 'pre') return 'code';
    // One word for all three: what the reader kept is a picture, and whether
    // it arrived as an inline svg, an img or a captioned figure is the
    // guide's business rather than theirs.
    if (tag === 'svg' || tag === 'img' || tag === 'figure') return 'diagram';
    if (tag === 'ul' || tag === 'ol') return 'list' + DOT + countChildren(el, 'li') + ' items';
    if (tag === 'dl') return 'list' + DOT + countChildren(el, 'dt') + ' items';
    if (tag === 'blockquote') return 'quote';
    if (tag === 'details') return 'details';
    if (el.matches('.quiz-options')) return 'quiz options';
    if (tag === 'p') return 'paragraph';
    // Nothing on the block list reaches here today. A bare tag name is the
    // honest fallback if the list ever grows without this function growing
    // with it — better a thin label than a blank one.
    return tag;
  }

  /*
    Direct children only: a nested list would otherwise have its items counted
    into its parent's total, and "list · 9 items" over a list showing three is
    worse than no count at all.
  */
  function countChildren(el, tag) {
    var n = 0;
    for (var i = 0; i < el.children.length; i += 1) {
      if (tagOf(el.children[i]) === tag) n += 1;
    }
    return n;
  }

  /** Collapsed, trimmed text — generated markup indents heavily. */
  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // -------------------------------------------------------- derived at capture

  /*
    A deck's flat card list, in document order.

    Deliberately a second implementation of assets/progress.js's deckCards and
    deckPosition rather than a call into `__gmProgress`. The source of this
    derivation is the deck contract itself — skills/tutor/references/deck.md §1
    (cards are a flat list; section wrappers exist for the update flow and
    navigation crosses them transparently) and §6 (section ids are permanent,
    never reassigned and never reused) — not the reporter. Two readers of one
    written contract stay correct independently; a favorite reaching into the
    reporter's test-exposure surface would break the day that surface changed
    shape, and the reporter is not even guaranteed to be beside this script —
    a document can carry one splice and not the other.
  */
  function deckCards(root) {
    return Array.prototype.slice.call((root || document).querySelectorAll('.card'));
  }

  /*
    The heading set a study build is addressed by. The same one
    assets/progress.js's docAnchor scrolls against, and for the same reason: an
    id is what survives a reflow, and a heading without one is a heading
    nothing can be pointed at. The crumb below walks this same set rather than
    every h1–h6, so the trail printed on a favorite's card and the anchor it
    opens at can never disagree about which chapter the block sits in.
  */
  var DOC_HEADINGS = 'h1[id], h2[id], h3[id], h4[id]';

  /**
   * Where the selection sits, as the same `GuidePosition` the progress reporter
   * stores — so opening a favorite later is a restore with a different target
   * rather than a second navigation mechanism with its own bugs.
   */
  function anchorFor(nodes) {
    if (!nodes || !nodes.length || !isElement(nodes[0])) return null;
    return isDeck() ? deckAnchor(nodes[0]) : docAnchor(nodes);
  }

  /*
    Which derivation applies, from the blob the splice wrote — never sniffed
    off the DOM. A study build that happens to contain a `.card` is not a deck,
    and the registry already knows which is which.
  */
  function isDeck() {
    return !!ctx && ctx.kind === 'deck';
  }

  function deckAnchor(node) {
    var card = typeof node.closest === 'function' ? node.closest('.card') : null;
    // Null rather than a guess. A block outside every card — a stray heading
    // between two of them — has no card index, and inventing one would send a
    // later "open in guide" to somebody else's card. The favorite is still
    // saved; it just opens the guide at the top, which is honest.
    if (!card) return null;
    var index = deckCards(node.ownerDocument || document).indexOf(card);
    // Same reasoning for a card that is no longer in its document: -1 is not
    // an address, and 0 would be a wrong one.
    if (index < 0) return null;

    var pos = { kind: 'deck', cardIndex: index };
    var section = typeof card.closest === 'function' ? card.closest('section[id]') : null;
    if (section) {
      // The pair that outlives an incremental regeneration: a section rewritten
      // earlier in the deck shifts every absolute index after it, and this
      // survives that. `cardIndex` is the fallback. The opener and the recap
      // card sit outside every wrapper and get neither field — a sectionId of
      // '' would be an address that resolves, to the wrong card.
      pos.sectionId = section.id;
      pos.cardOffset = deckCards(section).indexOf(card);
    }
    return pos;
  }

  function docAnchor(nodes) {
    var first = nodes[0];
    // A heading group is *about* the heading it starts at, so it anchors to
    // itself. Anchoring it to whatever heading precedes it would open the
    // favorite one section too early, every time.
    if (typeof first.matches === 'function' && first.matches(DOC_HEADINGS)) {
      return { kind: 'doc', anchorId: first.id };
    }
    var above = headingsAbove(nodes);
    var nearest = above.length ? above[above.length - 1] : null;
    // A doc position with no anchor is still a position — the build may simply
    // have no id'd headings above this block — and the view treats it as
    // "open the guide", which is the best answer available.
    return nearest ? { kind: 'doc', anchorId: nearest.id } : { kind: 'doc' };
  }

  /**
   * The id'd headings that stand above this selection, in document order.
   *
   * "Above" is two conditions, and the second is the one that is easy to miss:
   * a heading the selection *contains* is part of what is being kept, not
   * context around it — the h3s inside a picked section are its content, and
   * printing one as a crumb entry would repeat the clip's own words back at
   * the reader.
   */
  function headingsAbove(nodes) {
    var doc = nodes[0].ownerDocument || document;
    var all = doc.querySelectorAll(DOC_HEADINGS);
    var out = [];
    for (var i = 0; i < all.length; i += 1) {
      if (holds(nodes, all[i])) continue;
      // Compared against the selection's first node: everything after it is
      // either inside the selection or below it, and neither is context.
      var where = nodes[0].compareDocumentPosition(all[i]);
      if (where & 2 /* DOCUMENT_POSITION_PRECEDING */) out.push(all[i]);
    }
    return out;
  }

  /** Is `el` the selection, or inside it? (`contains` answers both.) */
  function holds(nodes, el) {
    for (var i = 0; i < nodes.length; i += 1) {
      if (typeof nodes[i].contains === 'function' && nodes[i].contains(el)) return true;
    }
    return false;
  }

  /**
   * The context headings above the block, outermost first.
   *
   * A favorite is read months later, out of the guide it came from, so it has
   * to say what it sat under. Two shapes, because the two guide types keep
   * that context in different places.
   */
  function crumbFor(nodes) {
    if (!nodes || !nodes.length || !isElement(nodes[0])) return [];
    return isDeck() ? deckCrumb(nodes) : docCrumb(nodes);
  }

  /*
    A deck card carries its own context: the `.eyebrow` names the section and
    the `h2` names the card (deck.md §3), so the trail is those two and nothing
    above them — a deck has no deeper nesting to walk.
  */
  function deckCrumb(nodes) {
    var card = typeof nodes[0].closest === 'function' ? nodes[0].closest('.card') : null;
    if (!card) return [];

    var out = [];
    var eyebrow = card.querySelector('p.eyebrow');
    if (eyebrow && textOf(eyebrow)) out.push(textOf(eyebrow));

    var heading = card.querySelector('h2');
    // Dropped when the selection already carries it — the whole card, or a
    // heading group starting at that very h2. The crumb is what is *above* the
    // clip, and a card whose title is printed both in its crumb and in its
    // body says the same thing twice in a space that has room for neither.
    if (heading && !holds(nodes, heading) && textOf(heading)) out.push(textOf(heading));
    return out;
  }

  /*
    A study build nests, so its trail is the chain of headings the block sits
    under. Walked forwards, keeping a stack: a heading at the same level or
    shallower than the top of the stack ends everything deeper, because the
    reader has left those sections rather than being inside them. What is left
    at the end is exactly the chain, outermost first.

    An h1 is no different from any other level here — a build whose h1 carries
    an id is a build where "the whole guide" is a real chapter above the block.
  */
  function docCrumb(nodes) {
    var above = headingsAbove(nodes);
    var chain = [];
    for (var i = 0; i < above.length; i += 1) {
      var level = headingLevel(above[i]);
      while (chain.length && chain[chain.length - 1].level >= level) chain.pop();
      chain.push({ level: level, text: textOf(above[i]) });
    }
    var out = [];
    for (var j = 0; j < chain.length; j += 1) {
      if (chain[j].text) out.push(chain[j].text);
    }
    return out;
  }

  /**
   * What to call this clip, before the reader gets a say.
   *
   * Its own heading first — a card, a section or a heading group is named by
   * the line at the top of it. Then the innermost crumb, which is the closest
   * thing to a name a table or a paragraph has. Then nothing: the server
   * defaults an empty title from the crumb and the text, and inventing
   * something here would overwrite a better answer it already has.
   */
  function titleFor(nodes, crumb) {
    if (nodes && nodes.length && isElement(nodes[0])) {
      var first = nodes[0];
      var heading = headingLevel(first)
        ? first
        : first.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading && textOf(heading)) return textOf(heading);
    }
    if (crumb && crumb.length) return crumb[crumb.length - 1];
    return '';
  }

  /**
   * The clip itself: the markup the reader saw, and its text.
   *
   * Taken from clones, so nothing here can touch the live guide, and every
   * `script` is stripped out of them. The favorites view renders this html
   * back into the *app's* document — a generated guide's card can legitimately
   * carry a script, and a snapshot that carried it along would be running the
   * guide's code in a page that never framed it.
   *
   * This strip is hygiene, not the boundary. The server stores what it is
   * sent, capped at 512 KB and otherwise verbatim — a favorite is a snapshot
   * of what the reader saw, and rewriting those bytes in transit would make it
   * something else; there is no HTML parser on the server to rewrite them
   * with, by design. The one boundary is `client/src/lib/sanitize.ts`, at
   * render, where the html actually executes. Do not read the strip below as
   * a guarantee that anything downstream can lean on.
   *
   * The text comes off the same cleaned clones rather than off the originals,
   * so a stripped script's source cannot turn up in search results describing
   * a clip it is no longer part of.
   */
  function snapshot(nodes) {
    if (!nodes || !nodes.length) return { html: '', text: '' };
    var doc = nodes[0].ownerDocument || document;

    var clones = [];
    for (var i = 0; i < nodes.length; i += 1) {
      // A heading group is a run of siblings, and one of those siblings can be
      // a script element in its own right — dropped whole, since the loop
      // below only reaches a script that is nested inside a kept node.
      if (tagOf(nodes[i]) === 'script') continue;
      var clone = nodes[i].cloneNode(true);
      var scripts = clone.querySelectorAll ? clone.querySelectorAll('script') : [];
      for (var j = 0; j < scripts.length; j += 1) {
        if (scripts[j].parentNode) scripts[j].parentNode.removeChild(scripts[j]);
      }
      clones.push(clone);
    }
    if (!clones.length) return { html: '', text: '' };

    var html;
    if (clones.length === 1) {
      html = clones[0].outerHTML;
    } else {
      // Several siblings are one favorite, so they need one root: a list of
      // top-level fragments would render as several clips on the card.
      var wrap = doc.createElement('div');
      for (var w = 0; w < clones.length; w += 1) wrap.appendChild(clones[w]);
      html = wrap.outerHTML;
    }

    // Text second, and out of the same clones: `html` is already a string by
    // now, so the separators spaceOut() inserts cannot reach it.
    var text = '';
    for (var t = 0; t < clones.length; t += 1) text += spaceOut(clones[t]) + ' ';

    return { html: html, text: text.replace(/\s+/g, ' ').trim() };
  }

  /*
    Where a block ends, a space begins.

    `textContent` alone is not the answer here, and a declension table is the
    proof: `<th>Nominativ</th><th>Akkusativ</th>` with no whitespace between
    the tags reads back as `NominativAkkusativ`, one word that matches neither
    of the two the reader would search for — and `text` exists to be searched
    (and to be the title of last resort). Browsers solve this with innerText,
    which is layout-derived and therefore both unavailable here (the clone is
    detached, and the block may itself be inside a card the deck has hidden)
    and absent from jsdom entirely.

    So the boundaries are inserted by hand, and only at *block* ones. Inline
    elements are deliberately not on the list: the reading aid bolds the first
    half of every word inside a framed guide (`<b>Nom</b>inativ`), so a
    separator at every element boundary would cut the guide's own prose into
    half-words — worse than the fusing this fixes.
  */
  var TEXT_BREAKS =
    'p, div, li, dt, dd, tr, td, th, caption, h1, h2, h3, h4, h5, h6, pre, blockquote,' +
    ' section, article, figure, figcaption, details, summary, ul, ol, dl, table, br, hr';

  function spaceOut(clone) {
    if (typeof clone.querySelectorAll === 'function') {
      var breaks = clone.querySelectorAll(TEXT_BREAKS);
      for (var i = 0; i < breaks.length; i += 1) {
        var parent = breaks[i].parentNode;
        if (parent) parent.insertBefore(clone.ownerDocument.createTextNode(' '), breaks[i]);
      }
    }
    return clone.textContent || '';
  }

  /**
   * Everything `POST /api/favorites` needs, derived from the selection.
   *
   * `guidePath`, `project` and `guideTitle` come off the blob rather than off
   * the DOM: this frame's request was already resolved through the registry
   * allowlist, so those three are known exactly, and reading them back out of
   * the page would be guessing at what the registry already said.
   */
  function draftFor(nodes) {
    var crumb = crumbFor(nodes);
    var shot = snapshot(nodes);
    return {
      guidePath: (ctx && ctx.guidePath) || '',
      project: (ctx && ctx.project) || '',
      guideTitle: (ctx && ctx.guideTitle) || '',
      anchor: anchorFor(nodes),
      crumb: crumb,
      html: shot.html,
      text: shot.text,
      title: titleFor(nodes, crumb),
      // Empty here by definition — the panel is where a note gets written, and
      // save() overwrites this with whatever the reader typed.
      note: ''
    };
  }

  // ------------------------------------------------------- outline and toolbar

  var outline = null;
  var toolbar = null;
  var labelEl = null;
  var widerBtn = null;
  var narrowerBtn = null;
  /*
    The panel is built with the toolbar and kept out of the document until
    Save, rather than created on demand. Both rows bind their listeners once,
    at enter(), so a reader who goes Save → Back → Save half a dozen times ends
    the session with exactly the listeners they started it with — and the panel
    element itself is the same one throughout, which is what makes "the failure
    branch keeps your text" a property of the DOM rather than of a save path.
  */
  var panel = null;
  var titleInput = null;
  var noteInput = null;
  var statusEl = null;

  // The outline is drawn a couple of pixels outside the block's own box, so a
  // 2px border sits beside the content rather than on top of its first line.
  var OUTLINE_PAD = 2;

  function mountUi() {
    ensureStyles(document, 'data-gm-favorites-style', FRAME_CSS);
    applyScheme();

    outline = document.createElement('div');
    outline.className = 'gm-fav-outline';
    // Hidden until something is picked: an empty box in the corner of the
    // guide would be a selection the reader did not make.
    outline.setAttribute('hidden', '');
    document.body.appendChild(outline);

    toolbar = document.createElement('div');
    // gm-fav-ui is what keeps the picker from treating its own controls as
    // pieces of the guide — see isBlock() and candidateAt().
    toolbar.className = 'gm-fav-toolbar gm-fav-ui';

    labelEl = document.createElement('span');
    labelEl.className = 'gm-fav-label';
    toolbar.appendChild(labelEl);

    widerBtn = addButton(toolbar, 'gm-fav-wider', 'wider', function () { widen(); });
    narrowerBtn = addButton(toolbar, 'gm-fav-narrower', 'narrower', function () { narrow(); });
    addButton(toolbar, 'gm-fav-save', 'Save', requestSave);
    // A glyph rather than the word "cancel": the toolbar sits over the guide
    // and every character of it costs the reader a line of prose.
    addButton(toolbar, 'gm-fav-cancel', '✕', leave);

    document.body.appendChild(toolbar);
    mountPanel();
  }

  /*
    The naming step, built and left detached — openPanel() docks it where the
    toolbar was.
  */
  function mountPanel() {
    panel = document.createElement('div');
    // gm-fav-ui for the same reason the toolbar carries it: without the marker
    // a tap in the title field would resolve to the field as a block of the
    // guide, and the picker would try to save its own panel.
    panel.className = 'gm-fav-panel gm-fav-ui';

    titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'gm-fav-title';
    // No visible label: the field arrives prefilled with the title and there is
    // one line of chrome to spend. A screen reader still needs to be told.
    titleInput.setAttribute('aria-label', 'Title for this favorite');
    on(pickBound, titleInput, 'keydown', onTitleKey);
    panel.appendChild(titleInput);

    noteInput = document.createElement('textarea');
    noteInput.className = 'gm-fav-note';
    noteInput.rows = 1;
    // The placeholder is the question, so the field needs no label either: it
    // asks the only thing a note is for.
    noteInput.setAttribute('placeholder', 'why keep this?');
    noteInput.setAttribute('aria-label', 'why keep this?');
    panel.appendChild(noteInput);

    addButton(panel, 'gm-fav-confirm', 'Save', function () { save(); });
    // "Back", not "cancel": it returns to the toolbar with the selection
    // untouched, and the picker is still armed afterwards. Cancelling is what
    // the toolbar's ✕ and Escape do.
    addButton(panel, 'gm-fav-back', 'Back', closePanel);

    statusEl = document.createElement('span');
    statusEl.className = 'gm-fav-status';
    // Announced rather than merely drawn: on success this line is the entire
    // confirmation, and it is on screen for a second and a half.
    statusEl.setAttribute('aria-live', 'polite');
    panel.appendChild(statusEl);
  }

  function addButton(parent, className, text, handler) {
    var el = parent.ownerDocument.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = text;
    // On pickBound, not bound: these controls exist only while picking, and a
    // listener on a removed element is a leak the next enter() would double.
    on(pickBound, el, 'click', handler);
    parent.appendChild(el);
    return el;
  }

  function unmountUi() {
    if (outline && outline.parentNode) outline.parentNode.removeChild(outline);
    if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    outline = null;
    toolbar = null;
    labelEl = null;
    widerBtn = null;
    narrowerBtn = null;
    panel = null;
    titleInput = null;
    noteInput = null;
    statusEl = null;
  }

  /** Name the selection, box it, and say which way it can still be pushed. */
  function renderCandidate() {
    if (labelEl) labelEl.textContent = current ? labelFor(current) : '';
    // Disabled rather than absent: the pair is how the reader learns the
    // selection can be pushed at all, so it stays visible at the ends of the
    // range and only stops responding.
    if (widerBtn) widerBtn.disabled = !widenTarget();
    if (narrowerBtn) narrowerBtn.disabled = !narrowTarget();
    reposition();
  }

  /**
   * Put the outline over the selection.
   *
   * The union of the nodes' boxes, because a heading group is several elements
   * and one box per node would read as several selections. Viewport
   * coordinates, matching the outline's `position:fixed` — which is what makes
   * repositioning on scroll a matter of re-reading the rects rather than
   * tracking an offset.
   */
  function reposition() {
    if (!outline) return;
    if (!current) {
      outline.setAttribute('hidden', '');
      return;
    }
    var top = Infinity;
    var left = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;
    for (var i = 0; i < current.length; i += 1) {
      var rect = current[i].getBoundingClientRect();
      if (rect.top < top) top = rect.top;
      if (rect.left < left) left = rect.left;
      if (rect.right > right) right = rect.right;
      if (rect.bottom > bottom) bottom = rect.bottom;
    }

    /*
      A zero-area union means two different things, and only one of them is
      "draw nothing".

      In a browser it is what a block inside a `display:none` card reports, and
      that is reachable while armed: a tap on the deck's `Next` resolves to no
      block, passes straight through, the deck swaps `.active`, and the
      selection is suddenly inside a card that renders nothing. Drawing the
      union anyway puts a 4×4 box at the top-left corner of the guide — an
      outline around a selection that is not on screen, which is worse than no
      outline at all.

      But an engine that does no layout reports exactly the same zeros for a
      perfectly visible block, so the measurement alone cannot decide. rendered()
      is the tie-break, and it is asked *only* here: it walks ancestors and
      computed styles, and this function runs on every scroll event.
    */
    if (right - left <= 0 && bottom - top <= 0 && !rendered(current)) {
      outline.setAttribute('hidden', '');
      return;
    }

    outline.removeAttribute('hidden');
    outline.style.top = (top - OUTLINE_PAD) + 'px';
    outline.style.left = (left - OUTLINE_PAD) + 'px';
    outline.style.width = Math.max(0, right - left + OUTLINE_PAD * 2) + 'px';
    outline.style.height = Math.max(0, bottom - top + OUTLINE_PAD * 2) + 'px';
  }

  /**
   * Does any of this selection put ink on the screen?
   *
   * Structural rather than geometric, because the geometry is what called this
   * in the first place. Two ways to render nothing: the node has left the
   * document, or it sits under something the cascade has switched off.
   * `display:none` does not inherit — a table inside a hidden card computes its
   * own `display:table` — so the ancestors have to be walked rather than the
   * node asked about itself. The `hidden` attribute needs no separate check:
   * every engine's own stylesheet turns it into `display:none`, which is what
   * this reads.
   *
   * "Any", not "all": half a heading group scrolled behind a collapsed
   * `<details>` is still a selection worth boxing.
   */
  function rendered(nodes) {
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].isConnected === false) continue;
      var doc = nodes[i].ownerDocument;
      var view = doc ? doc.defaultView : null;
      // No way to ask: assume it renders. An outline that is wrong is a smaller
      // failure than an outline that never appears.
      if (!view || typeof view.getComputedStyle !== 'function') return true;

      var el = nodes[i];
      var off = false;
      while (isElement(el)) {
        if (view.getComputedStyle(el).display === 'none') { off = true; break; }
        el = el.parentElement;
      }
      if (!off) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- picking mode

  var isPicking = false;

  function picking() {
    return isPicking;
  }

  /**
   * Arm the picker.
   *
   * From here until leave(), a tap on the guide means "keep this" rather than
   * whatever the guide would have done with it — which is why the click
   * listener is on the document in the capture phase, the one place it can see
   * a tap before the element under it does.
   */
  function enter() {
    if (isPicking) return;
    isPicking = true;
    mountUi();
    paintToggle();

    /*
      No pointer listener, deliberately. Hover used to preview the selection,
      and the cost was that the selection chased the pointer: crossing a guide
      to reach the toolbar re-picked every block on the way, each heading among
      them taking a whole passage, so landing on anything meant out-running a
      target that moved. Selection is a tap now, and a tap is a decision. The
      modifier-held variant — preview only while a key is down — is the obvious
      next thing to try, and is deliberately not this change.
    */
    on(pickBound, document, 'click', onClick, true);
    on(pickBound, window, 'keydown', onKey);
    // Passive: these only re-read boxes the browser already has, and a
    // non-passive scroll listener would cost the guide its scrolling
    // smoothness for nothing.
    on(pickBound, window, 'scroll', reposition, { passive: true });
    on(pickBound, window, 'resize', reposition, { passive: true });

    renderCandidate();
  }

  /**
   * Disarm, and give the guide back every tap.
   *
   * Deliberately not guarded on isPicking: stop() and pagehide both call it to
   * be sure, and every step is idempotent.
   */
  function leave() {
    isPicking = false;
    // Whatever the save flow was in the middle of, it is over: see endFlow().
    // A picker that is gone must not be left with a scheduled exit or an
    // in-flight request that still believes it owns the screen — either would
    // fire into whatever the reader is doing a second and a half from now,
    // including a picker they have since re-armed.
    endFlow();
    unbind(pickBound);
    unmountUi();
    current = null;
    climb = [];
    paintToggle();
  }

  /**
   * A tap while armed.
   *
   * Two branches, and the second is as load-bearing as the first. When the tap
   * resolves to a block, the guide's own handler for it must not also run: the
   * clearest case is a quiz option, where the reader tapping the answers to
   * *keep* them would otherwise have the question answered on their behalf and
   * the deck's gate opened. stopPropagation() in the capture phase is what
   * prevents that — the event never reaches the option at all.
   *
   * When it resolves to nothing the event is left completely alone, so the
   * deck's pager and a build's contents rail keep working while the picker is
   * armed. Without that, arming the picker would freeze the reader on whatever
   * card they happened to be on.
   */
  function onClick(event) {
    // Once the panel is up the guide is no longer being picked from: the title
    // in that field was derived from this block and the note was written about
    // it, so a tap on the page must not swap the thing being saved out from
    // under both. The event is left entirely alone rather than swallowed —
    // the reader can still page the deck to look something up mid-note.
    if (panelOpen()) return;
    var found = candidateAt(event.target);
    if (!found) return;
    event.preventDefault();
    event.stopPropagation();
    setCandidate(found);
  }

  /*
    The keyboard drives the same four things the toolbar does, so preventDefault
    is right for exactly those keys: while the picker is armed the arrows are
    resizing a selection rather than scrolling, and Escape is dismissing the
    picker rather than whatever the guide does with it. Every other key is left
    untouched — the guide is still a document.
  */
  function onKey(event) {
    /*
      While the panel is up the keyboard belongs to its two fields, and this
      listener is on the window — every keystroke typed into the title bubbles
      here. Without this branch, Enter in the title would save from the field's
      own listener and then arrive here as a second save, and the arrows would
      resize the selection instead of moving the caret. Escape is the one key
      that still means the same thing in both places, so it is the one key
      handled: it leaves, panel and all, and the reader's text goes with it —
      which is what dismissing means.
    */
    if (panelOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        leave();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      leave();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      widen();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      narrow();
      return;
    }
    if (event.key === 'Enter') {
      // Only with something selected: an Enter with nothing picked is not a
      // save, and swallowing it would take the key away from a guide that has
      // its own use for it.
      if (!current) return;
      event.preventDefault();
      requestSave();
    }
  }

  // ---------------------------------------------------------- the save flow

  /* How long the confirmation stays up before the picker gets out of the way.
     Long enough to read three words, short enough that nobody waits on it. */
  var SAVED_MS = 1500;

  /*
    Three pieces of state, and they mean three different things — which is the
    whole point of their being three.

    `saving` is "a request is in the air right now", and it exists to stop one
    open panel's Save from being pressed twice. `leaveTimer` is "the write
    landed and the picker is on its way out", which is a different reason to
    refuse a second press: the favorite already exists, so a second one would
    be its twin. And `flow` counts the runs of the flow, so a request can tell
    whether the panel it was posted from is still the one on screen — a reply
    that arrives after the reader has moved on must not write into a panel that
    is no longer up, must not schedule an exit, and must not clear a lock it no
    longer holds. That last one is the subtle one: `saving` is shared, so a slow
    reply from an abandoned run releasing it would unlock a *newer* request that
    is still in the air, and the panel would happily fire a second, concurrent
    write for the same block with nothing on screen to say so.

    Collapsing the first two into one flag is what the review caught: `Back`
    inside the success window then left a picker that refused every subsequent
    Save without saying a word, and then unmounted itself mid-note.
  */
  var saving = false;
  var leaveTimer = null;
  var flow = 0;

  /**
   * End this run of the save flow, whatever state it was in.
   *
   * Called by the two ways a panel stops being the panel a request belongs to:
   * `Back`, which returns to the toolbar, and leave(), which dismisses the
   * picker outright. Three things go, and each has a failure behind it:
   *
   * - the scheduled exit, because a reader who pressed `Back` said what they
   *   wanted, and the automatic exit was for the reader who said nothing;
   * - the in-flight lock, because Save must never silently do nothing — with
   *   the lock stuck on, the next confirm returns without a fetch, without a
   *   status line and without any sign it was pressed;
   * - ownership, so a reply still on its way back cannot arm an exit timer or
   *   report a failure against a panel the reader has already left.
   *
   * A request disowned this way is *not* cancelled: it may well create the
   * favorite, which is the right outcome — the reader asked for it. It simply
   * stops having a say in what is on screen.
   */
  function endFlow() {
    flow += 1;
    if (leaveTimer !== null) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    saving = false;
  }

  /*
    The picker's one exit that is not a dismissal, and the single entry point
    both `Save` and `Enter` arrive at.
  */
  function requestSave() {
    if (!current) return;
    if (panelOpen()) return;
    if (!live(current)) {
      // The guide moved on and took the block with it — a deck rebuilt
      // mid-session, a build that re-rendered. Dropping the selection says so
      // in the toolbar (no label, both controls disabled, no outline) rather
      // than opening a naming panel over something that is not there. There is
      // nothing to retry here, so the failure copy would be a lie: the reader
      // has to pick again.
      applyCandidate(null);
      return;
    }
    openPanel();
  }

  /**
   * Is this selection still part of the document it was picked from?
   *
   * `isConnected`, deliberately not a rect. A card the deck has merely hidden
   * is perfectly savable: the snapshot is its markup and the anchor is its
   * index among the cards, and neither has anything to do with the card being
   * on screen — a reader who picks a table, pages on to check the next card
   * and then hits Save means the table. A node the guide has *removed*, though,
   * has no index and no place in document order, so `anchorFor` and `crumbFor`
   * would both be answering about a document the node has left.
   */
  function live(nodes) {
    if (!nodes || !nodes.length) return false;
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].isConnected === false) return false;
    }
    return true;
  }

  function panelOpen() {
    return !!(panel && panel.parentNode);
  }

  /**
   * Swap the toolbar for the naming panel.
   *
   * Replaced rather than added to: picking a block and naming it are two steps
   * of one act, and leaving `wider` on screen beside a title field would offer
   * to change the selection the panel has already described.
   */
  function openPanel() {
    if (!current || !panel || !toolbar || !document.body) return;
    // Never onto an open panel: the prefill below would overwrite a title the
    // reader has already rewritten and a note they have already typed.
    if (panelOpen()) return;
    if (toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);

    titleInput.value = titleFor(current, crumbFor(current));
    noteInput.value = '';
    setStatus('');
    document.body.appendChild(panel);
    // Focused, and focused on the title: a reader with nothing to add saves
    // with one keystroke, and one who wants to rename starts by typing.
    if (typeof titleInput.focus === 'function') titleInput.focus();
  }

  /** Back to the toolbar, selection and climb untouched — but the save flow
   *  this panel was in the middle of is over (endFlow). */
  function closePanel() {
    endFlow();
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (toolbar && !toolbar.parentNode && document.body) document.body.appendChild(toolbar);
  }

  function onTitleKey(event) {
    // Enter in the title is the save — the panel's whole point is that a clip
    // with nothing to add costs one keystroke. stopPropagation keeps it from
    // reaching the window listener as well; onKey's panel branch would ignore
    // it anyway, and both guards are cheap.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    save();
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  /**
   * Post the draft.
   *
   * Resolves true when the favorite was written and false every other way,
   * which is what makes this testable and what lets the panel decide what to
   * say without the caller knowing anything about fetch.
   */
  function save() {
    if (!current) return Promise.resolve(false);
    // Two refusals, both about the same danger from opposite ends: the API
    // deliberately does not dedupe (two clips of one block with two different
    // notes is a thing a reader may well want), so a doubled press writes a
    // permanent twin nobody asked for. One press while the request is in the
    // air; one press while the confirmation is still up and the picker is on
    // its way out. Neither outlives this panel — endFlow() clears both.
    if (saving || leaveTimer !== null) return Promise.resolve(false);
    if (!live(current)) return Promise.resolve(reportFailure());

    var draft = draftFor(current);
    // The reader's own words win over the derived ones. Trimmed, because a
    // title is a line of chrome on a card and leading spaces there read as a
    // rendering bug; an empty one is left empty on purpose — the server
    // defaults it from the crumb and the text, and it has both.
    if (titleInput) draft.title = (titleInput.value || '').trim();
    if (noteInput) draft.note = noteInput.value || '';

    saving = true;
    // Which run of the flow this request belongs to, read back when it answers.
    var mine = flow;
    // Cleared before the attempt: a stale "couldn't save" sitting beside a
    // request that is still in flight describes the wrong one.
    setStatus('');

    // Wrapped rather than called outright so that a missing fetch — a guide
    // opened off disk in something ancient — arrives in the same catch as a
    // dead network, instead of throwing out of a click handler.
    return Promise.resolve()
      .then(function () {
        return fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft)
        });
      })
      .then(function (response) {
        var ok = !!(response && response.ok);
        // The panel this was posted from is gone — `Back`, or the picker
        // dismissed. The write itself stands (the reader asked for it), but it
        // gets no say in *anything* this instance still owns: no status into a
        // panel that is not up, no exit timer that would unmount whatever the
        // picker is doing a second and a half from now — and no touching the
        // lock either. endFlow() already released the lock this request was
        // holding, at the moment it was disowned; the one set now belongs to a
        // newer request that is still in the air, and clearing that would let
        // its own panel fire a second, concurrent write for the same block.
        if (mine !== flow) return ok;
        saving = false;
        if (!ok) return reportFailure();
        setStatus('saved ' + STAR_ON);
        // The picker gets out of the way on its own, but not instantly: the
        // status line is the entire confirmation, and a panel that vanished on
        // the same tick would leave the reader unsure anything was written.
        leaveTimer = setTimeout(function () {
          leaveTimer = null;
          leave();
        }, SAVED_MS);
        return true;
      })
      .catch(function () {
        // Same disowning rule, and in the same order: a failure the reader
        // walked away from is neither theirs to be told about nor the owner of
        // whatever lock is set by the time it lands.
        if (mine !== flow) return false;
        saving = false;
        return reportFailure();
      });
  }

  /*
    The failure branch, and the reason it is a branch at all.

    A progress write is fire-and-forget: the reader never asked for it, and a
    dropped one costs them a few cards of scroll position. This is the
    opposite. They armed the picker, hunted down a block, pushed the selection
    to the right width, named it and wrote a note about why it matters — work
    that exists nowhere but in these two fields. So nothing is cleared: the
    panel stays exactly as they left it, the request is one click away from
    being retried, and the line says which of the two things happened.
  */
  function reportFailure() {
    setStatus("couldn't save — try again");
    return false;
  }

  // ---------------------------------------------------------------- bootstrap

  /**
   * Mount this instance, or decline to.
   *
   * Only ever does something when there is a context to act against — a guide
   * framed with no `gm-favorites` blob (never the case through /asset, since
   * the splice always writes one alongside this script, but worth guarding the
   * same way readContext already does) has nothing this script could save a
   * favorite about, so there is nothing to mark as started either.
   */
  function init() {
    if (started()) return;
    ctx = readContext();
    if (!ctx) return;
    document.documentElement.setAttribute('data-gm-favorites', '');
    applyScheme();
    mountToggle();

    /*
      A guide that answers `prefers-color-scheme` repaints itself when the
      reader flips their system theme, and the picker has to go with it — a
      toolbar left on the old palette is the same dark-on-dark pill, arrived at
      from the other direction. Bound to `bound` rather than `pickBound`
      because the floating star is painted from this palette too and is up
      whether or not the picker is armed.

      Guarded twice: jsdom has no matchMedia at all, and Safari below 14 has
      the list without addEventListener. Neither is a reason to fail to mount —
      a picker that does not follow a theme flip is a much smaller failure than
      no picker.
    */
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      if (mql && typeof mql.addEventListener === 'function') {
        on(bound, mql, 'change', applyScheme);
      }
    }
    // The star lives in the *parent's* header, which outlives this frame. A
    // frame that navigates away would otherwise leave a control sitting in a
    // header that now belongs to a different guide — the same reasoning as the
    // reporter's dismissNotice, and the reason that teardown is bound here
    // rather than left to stop(), which in production is never called.
    on(bound, window, 'pagehide', teardownUi);
  }

  /** Everything this instance drew, in either document. */
  function teardownUi() {
    leave();
    unmountToggle();
  }

  /** Releases the claim above, so a suite (or, in principle, a future re-init
   *  after a frame navigation) can mount a fresh instance cleanly. */
  function stop() {
    teardownUi();
    unbind(bound);
    ctx = null;
    document.documentElement.removeAttribute('data-gm-favorites');
    document.documentElement.removeAttribute(SCHEME_ATTR);
  }

  if (typeof document !== 'undefined') {
    // Spliced at the end of <body>, so the document is normally parsed
    // already — but a build that pulls the script in earlier must still work.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__gmFavorites = {
      readContext: readContext,
      host: host,
      candidateAt: candidateAt,
      candidate: candidate,
      setCandidate: setCandidate,
      groupFor: groupFor,
      labelFor: labelFor,
      widen: widen,
      narrow: narrow,
      anchorFor: anchorFor,
      crumbFor: crumbFor,
      titleFor: titleFor,
      snapshot: snapshot,
      draftFor: draftFor,
      openPanel: openPanel,
      save: save,
      enter: enter,
      leave: leave,
      picking: picking,
      init: init,
      stop: stop,
      started: started
    };
  }
})();
