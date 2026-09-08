/**
 * Sanitises a favorite's stored HTML snapshot before it is spliced into the
 * SPA with `dangerouslySetInnerHTML` (FavoriteCard's `.fav-body`).
 *
 * Where the boundary actually is — docs/superpowers/specs/2026-09-08-favorites-
 * design.md, "Sanitisation": the favorite's `html` comes from a same-origin
 * frame showing our own generated guide and is stored verbatim by the server
 * (a byte-size cap, not a parse — no HTML parser dependency on the server side,
 * per the repo's no-new-runtime-dependency rule). The API itself has no auth,
 * the tailnet is the wall, so a device on the tailnet could in principle POST
 * anything through it. Render time — here, in the SPA — is the one place that
 * actually executes the markup, and the one place with a DOM to parse it
 * with, so it is the only boundary that matters; everything upstream of it is
 * defence in depth at best.
 *
 * `assets/favorites.js`'s own capture-time `<script>` strip is a separate,
 * earlier pass over the *source* DOM (hygiene: no point saving dead code in
 * the snapshot) and must not be read as *the* sanitisation step — it runs in
 * a page we do not control the future contents of, and nothing stops a
 * differently-shaped POST arriving without ever going through it.
 *
 * DOMParser only, per the run's global constraints: no sanitiser package, no
 * new runtime dependency. A hand-rolled allowlist necessarily buys narrower
 * coverage than a library would — see the self-review gaps called out in the
 * task-7 report — but the brief is explicit about the rule set this covers
 * and no more.
 *
 * Review round 1 added three mitigations this docblock exists to explain,
 * because they are the kind of thing that reads as accidental complexity
 * unless the reason is stated up front:
 *
 * 1. **`noscript`/`noembed`/`noframes` are removed outright, not merely
 *    attribute-scrubbed.** `DOMParser`'s document has no browsing context, so
 *    its scripting flag is permanently off, and per the HTML parsing spec
 *    that makes these three elements' content model different depending on
 *    that flag: with scripting off, `<noscript>` parses its content as
 *    ordinary child *elements*; with scripting on — true of the live SPA
 *    document this sanitised string is destined for — it is RAWTEXT, parsed
 *    by scanning for the literal text `</noscript>` with no awareness of
 *    quotes, attributes or nesting. A payload placed inside — a
 *    `<p title="…">` whose title happens to contain the literal string
 *    `</noscript>` followed by markup — passes straight through every rule
 *    below (title isn't one of them) and round-trips byte-for-byte through
 *    `body.innerHTML`, because the HTML serializer never escapes `<`/`>`
 *    inside an attribute value. It only becomes live, executing markup once
 *    the *live* document re-parses this file's own output under the RAWTEXT
 *    rule: the scan for `</noscript>` ends the element early inside what this
 *    file's tree thought was an attribute value, and everything after it —
 *    a smuggled `<img onerror=…>` — is parsed as ordinary, executing content.
 *    This is a *scripting-flag mismatch* class, not a one-off missing tag:
 *    removing all three closes it, because nothing a captured guide
 *    legitimately needs depends on any of them.
 * 2. **`sanitizeSnapshot` re-parses and re-strips its own output until two
 *    consecutive passes agree, and returns `''` if they never do within
 *    `MAX_PASSES`.** Once the tree holds only tags/attributes this file
 *    allows, re-parsing its own serialized form must reproduce the same
 *    markup; a second pass that disagrees means the first pass's output
 *    secretly still held dangerous structure that only resolves into
 *    elements on a *second* parse — the general shape of finding 1 above,
 *    generalised as a safety net for any member of that class this file does
 *    not yet know to name. Failing closed on non-convergence, rather than
 *    returning whatever the loop last computed, matters in principle even
 *    though — final whole-branch review — this file has no known input left
 *    that actually reaches it: `<plaintext>` used to be the concrete
 *    non-convergent example demonstrating why, back when it wasn't in
 *    `REMOVE_TAGS`. The HTML spec gives it no real end tag, so the
 *    serializer re-closed it once per pass, and each re-parse appended one
 *    more literal `</plaintext>` — and its child text serialized unescaped
 *    (the same "raw" list as script/style/xmp), so an unstable pass could
 *    carry a raw, live-looking `<script>…</script>` substring through this
 *    file untouched. `plaintext` (with `xmp`, the same "raw" family) is now
 *    special-cased directly in `REMOVE_TAGS` below, so that specific input
 *    converges on the very first pass instead of ever reaching this path —
 *    see `REMOVE_TAGS`'s own comment. The fail-closed branch itself is
 *    unchanged, still live, and still the right call *if* some future rule
 *    this file doesn't yet have produces a genuinely non-convergent case:
 *    returning the last unstable value would hand that straight to
 *    `dangerouslySetInnerHTML`'s caller; returning `''` instead removes it
 *    along with everything else non-convergence casts doubt on. It is
 *    presently untested for exactly that reason — no known input reaches
 *    it — a gap recorded beside `MAX_PASSES`'s own definition below and in
 *    `test/sanitize.test.ts`.
 * 3. **A `<template>`'s content is sanitised too**, not just its (always
 *    empty-looking) visible tree — its actual children live in a detached
 *    `DocumentFragment` that ordinary traversal never reaches. Inert in
 *    today's render path, but still markup crossing this boundary
 *    unexamined, which is the standard this file holds everything else to.
 */

/** Elements that carry no safe use in a stored snapshot — active content,
 *  another document, an out-of-tree navigation target, or (the SMIL family)
 *  a way to rewrite another element's attributes after this file's own
 *  attribute pass already ran. Removed outright, wherever in the tree they
 *  sit (svg included: none of these belong there either, and mermaid never
 *  emits any of them). Compared by lower-cased `tagName` rather than run as
 *  N separate CSS tag selectors (see the removal loop below) because a
 *  browser's SVG tag-name-adjustment table gives elements like
 *  `animateTransform` a mixed-case `tagName`, and a CSS type selector
 *  matches a non-HTML-namespace element's name case-*sensitively* — a plain
 *  `querySelectorAll('animatetransform')` would silently miss it. */
const REMOVE_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'base',
  // RAWTEXT-only-when-scripting-is-on family — see the module docblock's
  // point 1 for the mutation-XSS shape this closes.
  'noscript', 'noembed', 'noframes',
  // SMIL animation elements — see the module docblock and handleAnchor: any
  // of these can retarget an attribute (including href) live in the
  // reader's browser, after every rule in this file has already run over
  // the markup as originally written.
  'animate', 'animatemotion', 'animatetransform', 'set',
  // Final whole-branch review, Important (bundled with I2): both are
  // obsolete elements with no legitimate use in a captured guide, and both
  // serialize their child text unescaped — the same "raw" list as
  // script/style. Left in, a stored snapshot could carry a live-looking,
  // unescaped `<script>…</script>` (or worse) substring straight through
  // this file's output, safe only because nothing downstream happens to
  // re-parse it today — "safe at any insertion point" is the rule this file
  // otherwise holds itself to. `plaintext` has the sharper failure mode:
  // the HTML spec gives it no real end tag, so it swallows every sibling
  // after it in the source as its own raw text, and — before this line
  // existed — that made `sanitizeSnapshot`'s pass loop non-convergent (see
  // MAX_PASSES's fail-closed path), wiping the *entire* output, including
  // unrelated content that appeared before the `<plaintext>`, back to ''.
  // Removing it outright here means a document holding one converges on
  // the very first pass instead, so legitimate sibling content survives.
  'xmp', 'plaintext'
]);

/** The SVG namespace, spelled out once: `<style>` survives sanitisation only
 *  when the element itself is truly SVG-namespaced (mermaid's own diagrams
 *  emit their scoped rules this way). Checking the element's own
 *  `namespaceURI` rather than `el.closest('svg')` matters because
 *  `<foreignObject>` re-enters the HTML namespace — a `<style>` nested
 *  inside `<svg><foreignObject>` is an ordinary HTML style element (a
 *  document-wide stylesheet) that merely happens to have an `<svg>`
 *  ancestor, and `closest('svg')` cannot tell the two cases apart. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** How many times `sanitizeSnapshot` re-parses and re-strips its own output
 *  looking for two consecutive passes to agree — see the module docblock's
 *  point 2. Capped rather than looped to convergence unconditionally: a
 *  pathological input that never stabilises must not hang the render path
 *  (it fails closed instead, see `sanitizeSnapshot`), and no legitimate
 *  captured guide snapshot should ever need more than one extra confirming
 *  pass, let alone this many.
 *
 *  Coverage note (final whole-branch review): `<plaintext>` was the one
 *  known input that exhausted this cap and exercised the `sanitizeSnapshot`
 *  fail-closed `return ''`, and it stopped being one once `plaintext` was
 *  added to `REMOVE_TAGS` (module docblock point 2) — it now converges on
 *  pass 1. `test/sanitize.test.ts` currently has no case that reaches this
 *  branch; it is live, untested code, left that way rather than covered by
 *  a contrived input invented just to hit it. */
const MAX_PASSES = 5;

/**
 * Rewrites one element's attributes in place, applying the rules that are the
 * same everywhere in the tree (on* handlers, srcdoc, a non-http(s) src, and —
 * since the final whole-branch review's I2 fix — href/xlink:href on *any*
 * element, not only <a>) plus the one thing that still differs by context:
 * a bare `#fragment` href is only a valid target inside svg.
 */
function sanitizeAttributes(el: Element, inSvg: boolean): void {
  // Snapshot first: mutating attributes while iterating el.attributes (a live
  // NamedNodeMap) skips entries, since removing one shifts the rest down.
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();

    if (name.startsWith('on') || name === 'srcdoc') {
      el.removeAttribute(attr.name);
      continue;
    }

    if (name === 'src') {
      // Anything other than an absolute http(s) URL is dropped rather than
      // rewritten — a relative src on a stored snapshot has no page left to
      // resolve it against, and `javascript:`/`data:` are exactly the schemes
      // this rule exists to keep out.
      if (!/^https?:\/\//i.test(attr.value)) el.removeAttribute(attr.name);
      continue;
    }

    if (name === 'href' || name === 'xlink:href') {
      // Final whole-branch review, Important (I2): this used to be gated on
      // `inSvg`, so href on any *non-svg* element passed through untouched
      // except for <a> — which handleAnchor separately re-derives this same
      // isHttp test for, below. <area> is neither svg nor <a>, so a
      // javascript: href on an image-map region (a real markup shape — an
      // <img usemap> pointing at a <map><area>) survived sanitisation
      // whole, and its mapped region ran script in the SPA's own origin on
      // click. The rule is now unconditional: it runs for every element,
      // in or out of svg, closing the class (any href-bearing element) —
      // not just <area> patched in beside <a>. Only the fragment allowance
      // stays svg-scoped: inside svg, a fragment href is how
      // <use href="#marker"> reaches a definition earlier in the same
      // document (mermaid's own diagrams depend on this); outside svg the
      // snapshot has no page left for a fragment to resolve against, so it
      // is dropped there exactly as it always was via handleAnchor's unwrap.
      const isHttp = /^https?:\/\//i.test(attr.value);
      const isFragment = inSvg && attr.value.startsWith('#');
      if (!isHttp && !isFragment) el.removeAttribute(attr.name);
      continue;
    }
  }
}

/**
 * Handles one <a> outside svg: an http(s) href is kept and forced to open in
 * a new tab (this snapshot is not the real page — a same-tab navigation would
 * strand the reader with no way back into the SPA); anything else (a deck's
 * `#s1`, a relative build path, no href at all) has no valid target once the
 * snapshot is lifted out of the guide it came from, so the anchor is
 * unwrapped to its own children rather than left as a dead or dangerous link.
 *
 * By the time this runs, `sanitizeAttributes` has already scrubbed a
 * non-http(s) href off the element (see that function's href branch), so the
 * `getAttribute('href')` below reads null for exactly the cases this
 * function needs to unwrap — the isHttp check here is a read of that
 * already-applied rule's outcome, not a second, independent judgment call.
 */
function handleAnchor(a: Element): void {
  const href = a.getAttribute('href');
  const isHttp = href !== null && /^https?:\/\//i.test(href);

  if (isHttp) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    return;
  }

  const parent = a.parentNode;
  if (!parent) return;
  while (a.firstChild) parent.insertBefore(a.firstChild, a);
  parent.removeChild(a);
}

/**
 * Walks the body depth-first, tracking whether the current node is inside an
 * <svg> subtree — <style> and href survival both depend on it — and applies
 * every element-level rule. Runs before the outright-removal pass below so an
 * anchor being unwrapped still has its (already-cleaned) children in place.
 */
function walk(node: Element, inSvg: boolean): void {
  const tag = node.tagName.toLowerCase();
  const hereInSvg = inSvg || tag === 'svg';

  // Recurse first: children of an anchor we are about to unwrap still need
  // their own attributes cleaned, and unwrapping splices them into node's
  // parent rather than removing them.
  for (const child of [...node.children]) walk(child, hereInSvg);

  sanitizeAttributes(node, hereInSvg);

  if (tag === 'a' && !hereInSvg) handleAnchor(node);
}

/**
 * Strips one already-parsed tree down to what is safe to render inline —
 * outright removals, then the surviving `<style>`s, then the attribute/anchor
 * walk, then descent into any `<template>` content this root holds. Shared
 * between the top-level `<body>` and every `<template>` found anywhere in the
 * tree (recursively: a template nested inside another template's content
 * gets the same treatment), because a template's content is otherwise
 * invisible to ordinary traversal — see the module docblock's point 3.
 */
function sanitizeRoot(root: ParentNode): void {
  // Outright removals first, before the attribute/anchor walk: no point
  // cleaning attributes on a node that is about to be deleted, and it keeps
  // the walk below from ever having to special-case "am I inside a doomed
  // subtree". A single pass over every element via the universal selector,
  // filtered by lower-cased tagName, rather than one `querySelectorAll(tag)`
  // per entry in REMOVE_TAGS — see REMOVE_TAGS's own comment for why a
  // per-tag CSS selector cannot be trusted across namespaces.
  for (const el of [...root.querySelectorAll('*')]) {
    if (REMOVE_TAGS.has(el.tagName.toLowerCase())) el.remove();
  }
  // <style> survives only when it is truly SVG-namespaced (see SVG_NS's own
  // comment for why that is `namespaceURI`, not `closest('svg')`); a
  // top-level or foreignObject-nested HTML <style> has no such job and would
  // otherwise leak page-wide rules into the SPA's own stylesheet cascade.
  for (const el of [...root.querySelectorAll('style')]) {
    if (el.namespaceURI !== SVG_NS) el.remove();
  }

  for (const el of [...root.children]) walk(el, false);

  // Recurse into every <template>'s content this root holds — see the
  // module docblock's point 3. Read after the walk above so a template
  // whose own attributes the walk just cleaned still gets its hidden
  // content inspected in the same call.
  //
  // Review round 2, Important: `template` is not in the HTML-parsing spec's
  // foreign-content breakout list, so a <template> tag written inside <svg>
  // or <math> is parsed as an SVGElement/MathMLElement — not an
  // HTMLTemplateElement — and has no `.content` property at all. A prior
  // version of this loop cast the querySelectorAll result straight to
  // `HTMLTemplateElement[]`, which told tsc to stop checking rather than
  // making the value true; at runtime `tmpl.content` read `undefined`, and
  // `sanitizeRoot(undefined)` crashed one call deeper reading
  // `.querySelectorAll` off it. FavoriteCard calls sanitizeSnapshot inside
  // useMemo during render with no error boundary anywhere in client/src, so
  // one favorite with this shape — POSTed through the unauthenticated
  // favorites API — took the whole SPA down on every load, board and delete
  // control included. `instanceof` is a real runtime check, not a cast: only
  // an actual HTMLTemplateElement has `.content`, and any other element that
  // merely happens to be named "template" (SVG/MathML) is skipped rather
  // than trusted.
  for (const tmpl of [...root.querySelectorAll('template')]) {
    if (!(tmpl instanceof HTMLTemplateElement)) continue;
    sanitizeRoot(tmpl.content);
  }
}

/**
 * Parses `html` as a standalone document and returns the sanitised result of
 * one `sanitizeRoot` pass over its body.
 *
 * DOMParser rather than a detached <div> + innerHTML: a <script> assigned via
 * innerHTML never executes (the HTML spec marks it "already started"), but
 * DOMParser's document is inert for a stronger reason — it has no browsing
 * context to run anything in — and is also where <style>, <link> and friends
 * land in the elements a spec-compliant parser actually expects them in
 * (<style> inside <svg> keeps its place, for instance), which a </div> soup
 * does not guarantee. That same "no browsing context" property is also
 * exactly what the module docblock's point 1 warns about: it is *why*
 * `<noscript>` behaves differently here than in the document this output is
 * ultimately rendered into, and why this file cannot merely trust that one
 * parse of the input is the whole story (see `sanitizeSnapshot` below).
 */
function sanitizeOnce(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeRoot(doc.body);
  return doc.body.innerHTML;
}

/**
 * Sanitises `html`, then keeps re-parsing and re-stripping its own output
 * until two consecutive passes agree byte-for-byte — see the module
 * docblock's point 2 for why a single pass is not assumed to be enough on
 * its own, and for why hitting `MAX_PASSES` without agreement returns `''`
 * rather than the last (still unstable) value.
 */
export function sanitizeSnapshot(html: string): string {
  let out = sanitizeOnce(html);
  for (let i = 1; i < MAX_PASSES; i++) {
    const next = sanitizeOnce(out);
    if (next === out) return out;
    out = next;
  }
  return '';
}
