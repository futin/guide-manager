/**
 * @jest-environment jsdom
 */
import { sanitizeSnapshot } from '../client/src/lib/sanitize';

/**
 * Cases straight out of task-7-brief.md's Step 1 — one assertion per rule the
 * brief lists, so a future rule change has an obvious single test to update
 * rather than a mystery failure in a combined case. jsdom's DOMParser is the
 * same constructor the browser gives the SPA, so this exercises the real
 * parsing path rather than a stand-in.
 */
describe('sanitizeSnapshot', () => {
  it('drops a script element and any on* attribute alongside it', () => {
    expect(sanitizeSnapshot('<p onclick="x()">hi<script>evil()</script></p>')).toBe('<p>hi</p>');
  });

  it('unwraps an anchor whose href is not http(s) or a fragment, keeping its text', () => {
    expect(sanitizeSnapshot('<a href="javascript:x()">j</a>')).toBe('j');
  });

  it('unwraps a same-document fragment anchor outside svg (no in-SPA target for it)', () => {
    expect(sanitizeSnapshot('<a href="#s1">s</a>')).toBe('s');
  });

  it('keeps an http(s) anchor and adds target=_blank rel=noopener', () => {
    const out = sanitizeSnapshot('<a href="https://e.com">e</a>');
    expect(out).toBe('<a href="https://e.com" target="_blank" rel="noopener">e</a>');
  });

  it('drops a top-level style element but keeps ordinary content beside it', () => {
    expect(sanitizeSnapshot('<style>p{}</style><p>x</p>')).toBe('<p>x</p>');
  });

  /*
    Review round 1, test-honesty finding: the case above leads with the
    <style>, and the HTML parser's own "in head" insertion rules can hoist a
    leading <style> into <head> before <body> even starts — meaning that case
    could pass even with the removal rule deleted, since body.innerHTML never
    contained the style element in the first place. The trailing form forces
    <style> to parse as ordinary body content, so this one only passes because
    the removal rule actually ran.
  */
  it('drops a trailing style element too, not just a leading one the parser might hoist to <head>', () => {
    expect(sanitizeSnapshot('<p>x</p><style>p{}</style>')).toBe('<p>x</p>');
  });

  it('keeps a style inside svg, keeps a fragment use href, drops a javascript: anchor href inside svg', () => {
    const out = sanitizeSnapshot(
      '<svg><style>.n{fill:red}</style><use href="#m"></use><a href="javascript:x()"></a></svg>'
    );
    expect(out).toContain('<style>.n{fill:red}</style>');
    expect(out).toContain('<use href="#m">');
    // Review round 1, test-honesty finding: not.toContain('javascript:')
    // alone would also pass if the svg anchor were unwrapped entirely rather
    // than kept with its href stripped — assert the <a> itself survives (svg
    // anchors are not unwrapped, only <a> outside svg is) with no href left.
    expect(out).toContain('<a></a>');
    expect(out).not.toContain('href="javascript:x()"');
  });

  /* svg>foreignObject re-enters the HTML namespace — see the "namespace
     confusion" test below for the <style> case this enables. */
  it('drops an HTML style smuggled inside svg>foreignObject, not just a bare top-level one', () => {
    const out = sanitizeSnapshot(
      '<svg><foreignObject><style>body{display:none}</style></foreignObject></svg>'
    );
    expect(out).not.toContain('style');
  });

  /*
    SMIL's <animate>/<set> can retarget any attribute — including href —
    after this file's own href rules already ran, since the rewrite happens
    live in the reader's browser rather than in the markup this file ever
    sees. Removed outright: nothing a captured guide snapshot legitimately
    needs depends on SVG animation.
  */
  it('drops SMIL animate elements, which could otherwise retarget an already-sanitised href', () => {
    const out = sanitizeSnapshot(
      '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>go</text></a></svg>'
    );
    expect(out).not.toContain('animate');
    expect(out).toContain('<text>go</text>');
  });

  it('drops src unless it is an absolute http(s) url', () => {
    expect(sanitizeSnapshot('<img src="x.png">')).toBe('<img>');
  });

  it('keeps an absolute http(s) src unchanged', () => {
    expect(sanitizeSnapshot('<img src="https://e.com/x.png">')).toBe(
      '<img src="https://e.com/x.png">'
    );
  });

  it('removes an iframe outright, leaving sibling content untouched', () => {
    expect(sanitizeSnapshot('<iframe src="https://e.com"></iframe><p>k</p>')).toBe('<p>k</p>');
  });

  /* Review round 1, test-honesty finding, same shape as the style case above:
     assert the trailing position too, so this rule cannot quietly start
     passing only because of where the tag happens to sit in the source. */
  it('removes a trailing iframe too', () => {
    expect(sanitizeSnapshot('<p>k</p><iframe src="https://e.com"></iframe>')).toBe('<p>k</p>');
  });

  it('drops srcdoc but keeps an unrelated data attribute', () => {
    expect(sanitizeSnapshot('<div srcdoc="x" data-ok="1">d</div>')).toBe(
      '<div data-ok="1">d</div>'
    );
  });

  it('leaves a details/summary pair untouched (no rule targets it)', () => {
    expect(sanitizeSnapshot('<details><summary>s</summary><p>b</p></details>')).toBe(
      '<details><summary>s</summary><p>b</p></details>'
    );
  });

  /*
    Review round 1, Critical: DOMParser's document has no browsing context,
    so its scripting flag is always off, and per the HTML parsing algorithm
    that puts <noscript> (and its RAWTEXT-only-when-scripting-is-on siblings
    <noembed>/<noframes>) in a different content model depending on that
    flag, its content here parses as ordinary child ELEMENTS rather than as
    literal raw text. A payload placed inside — a <p title="…"> whose title
    happens to contain the literal string "</noscript>" followed by markup —
    passes straight through this file's own attribute rules (title isn't one
    of them) and round-trips byte-for-byte through body.innerHTML, because
    the HTML serializer never escapes '<'/'>' inside an attribute value. It
    only becomes live, executing markup once the *live* SPA document — where
    scripting is on, so <noscript> really is RAWTEXT there — re-parses this
    file's own sanitised output: the RAWTEXT tokenizer scans for the literal
    text "</noscript>" with no idea it was sitting inside what this file's
    tree thought was an attribute value, ends the element early, and
    everything after it (a smuggled <img onerror=…>) is parsed as ordinary,
    executing content. This is the exact mutation-XSS shape the fix removes:
    dropping <noscript>/<noembed>/<noframes> outright, rather than merely
    scrubbing their visible attributes, means the whole smuggled subtree
    never reaches serialization in the first place.

    The second half proves the round-trip class is actually closed, not
    merely that this one string happens to look inert: reassigning the
    sanitizer's own output into a live (scripting-on) element must not
    manufacture a real <img onerror>.
  */
  it('removes noscript entirely, closing the scripting-flag mutation-XSS class rather than just this payload', () => {
    const input = '<p>lead</p><noscript><p title="</noscript><img src=x onerror=alert(1)>">hi</p></noscript>';
    const out = sanitizeSnapshot(input);
    expect(out).toBe('<p>lead</p>');

    const div = document.createElement('div');
    div.innerHTML = out;
    expect(div.querySelector('img')).toBeNull();
  });

  it('drops noembed and noframes outright — the same scripting-flag content-model split as noscript', () => {
    expect(sanitizeSnapshot('<noembed>x</noembed><p>k</p>')).toBe('<p>k</p>');
    expect(sanitizeSnapshot('<noframes>x</noframes><p>k</p>')).toBe('<p>k</p>');
  });

  /*
    Review round 1, Minor (folded into the noscript family): ordinary
    traversal — children, querySelectorAll — never reaches a <template>'s
    content, which lives in its own detached DocumentFragment. Inert in
    today's render path (a template never renders), but it is still
    uninspected markup crossing the sanitisation boundary, so it must come
    out clean too rather than being carried through verbatim.
  */
  it("inspects a template's content, not just its (empty) visible tree", () => {
    const out = sanitizeSnapshot('<p>lead</p><template><script>evil()</script><img src=x onerror=alert(1)></template>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onerror');
  });

  /*
    Review round 2, Important: a <template> parsed inside <svg> (or <math>)
    is an SVGElement/MathMLElement, not an HTMLTemplateElement — it has no
    `.content` at all. The round-1 fix's `as HTMLTemplateElement[]` cast
    asserted the type without checking it, so `tmpl.content` read `undefined`
    and `sanitizeRoot(undefined)` threw reading `.querySelectorAll` off it.
    FavoriteCard calls sanitizeSnapshot inside useMemo during render with no
    error boundary anywhere in client/src, so this took down the whole SPA —
    one POST to the unauthenticated favorites API bricked the board on every
    load, including the delete control that would remove the offending row.
    The fix must not merely avoid throwing; it must still sanitise a real
    (HTML) template found alongside a foreign-content one, so this asserts
    both in one input.
  */
  it('does not throw on a <template> inside <svg>, and still sanitises a real one beside it', () => {
    expect(() => sanitizeSnapshot('<p>hi</p><svg><template>x</template></svg>')).not.toThrow();
    const out = sanitizeSnapshot(
      '<p>hi</p><svg><template>x</template></svg><template><script>evil()</script></template>'
    );
    expect(out).toContain('<p>hi</p>');
    expect(out).not.toContain('script');
  });

  /*
    Review round 2, Low (bundled): sanitizeSnapshot used to return whatever
    the pass loop held at MAX_PASSES even when the last two passes still
    disagreed — handing back a string the loop itself had just failed to
    validate. <plaintext> used to be the concrete non-convergent input: the
    HTML spec gives it no real end tag, so the serializer re-closed it once
    per pass, and each re-parse added one more literal `</plaintext>`,
    forever. Failing closed (returning '') on non-convergence, rather than
    the last unstable value, was the round-2 fix; this pinned that choice.

    Final whole-branch review, I2 (bundled): `plaintext` is now in
    REMOVE_TAGS (see the xmp/plaintext tests below), so this exact input no
    longer exercises non-convergence at all — the single <plaintext>
    element (whose raw text swallowed the rest of this string, `<svg>` and
    all, at *parse* time, before sanitisation ever runs) is matched and
    removed on pass 1, and pass 2 trivially agrees with pass 1. The
    assertions below are unchanged and still both pass — the *docstring*
    reason for their result differs, not the result. This is deliberately
    left in rather than deleted: it still pins the same two outcomes
    (empty output, no live 'script' substring), just by the more direct
    path now, and MAX_PASSES' fail-closed loop itself is still live code
    with no other known input in this file that reaches it.
  */
  it("plaintext no longer needs the fail-closed path — REMOVE_TAGS converges it on pass 1, same result", () => {
    const out = sanitizeSnapshot('<plaintext></plaintext><svg><script>alert(1)</script></svg>');
    expect(out).toBe('');
    expect(out).not.toContain('script');
  });

  /*
    Final whole-branch review, Important (I2): href was only ever scrubbed
    for <a> outside svg (via handleAnchor) or for any element while inSvg
    (via sanitizeAttributes' href branch) — <area>, which carries its own
    href and sits outside svg, fell through both and kept a javascript:
    value verbatim. An <area> only does anything paired with an <img
    usemap>, which is exactly the shape a captured guide (or a hand-rolled
    POST — the favorites API has no auth) could carry: clicking the mapped
    region would then run script in the SPA's own origin, the one thing
    this file states it holds the line on. The fix makes the href rule
    unconditional — any element's href/xlink:href is scrubbed to
    http(s)-or-(svg-only)-fragment regardless of tag or svg-ness — so this
    covers the whole class (any href-bearing element), not just <area>
    bolted on beside <a>.
  */
  it('strips a non-http(s) href from <area>, not just <a> (image-map click-through)', () => {
    const out = sanitizeSnapshot(
      '<map name="m"><area shape="rect" coords="0,0,99,99" href="javascript:alert(1)"></map>' +
        '<img src="https://e.com/a.png" usemap="#m">'
    );
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<area shape="rect" coords="0,0,99,99">');
    expect(out).toContain('<img src="https://e.com/a.png" usemap="#m">');
  });

  it('still keeps an absolute http(s) href on <area> (same rule <a> gets)', () => {
    const out = sanitizeSnapshot('<area href="https://e.com" shape="rect" coords="0,0,1,1">');
    expect(out).toContain('href="https://e.com"');
  });

  /*
    Final whole-branch review, Important (I2, bundled): neither <xmp> nor
    <plaintext> has a legitimate use in a captured guide, and both serialize
    their child text unescaped (the same "raw" list as script/style) — so
    before this fix, a snapshot holding one could carry a live-looking,
    unescaped `<script>…</script>` substring straight through
    sanitizeSnapshot's output (inert at today's only consumer, but it makes
    "safe at any insertion point" false). Removing both outright via
    REMOVE_TAGS closes it structurally rather than relying on the
    fail-closed convergence loop to catch it after the fact.
  */
  it('drops xmp outright, leaving sibling content untouched', () => {
    expect(sanitizeSnapshot('<p>k</p><xmp>&lt;script&gt;evil()&lt;/script&gt;</xmp>')).toBe('<p>k</p>');
  });

  /*
    The renamed test above and this one both now take the same direct-
    removal path — <plaintext> is in REMOVE_TAGS, so a document holding one
    is stripped to '' (or, here, back to its ordinary siblings) on the very
    first pass, never by exhausting MAX_PASSES. This case is the plainer,
    single-purpose one: no unrelated <svg><script> smuggled in beside it,
    just the removal pinned in isolation, with a normal sibling (<p>k</p>)
    proving the rest of the document survives untouched.
  */
  it('drops plaintext outright, converging on the first pass rather than via non-convergence', () => {
    expect(sanitizeSnapshot('<p>k</p><plaintext>tail</plaintext>')).toBe('<p>k</p>');
  });

  /*
    Coverage note (final whole-branch review): with `plaintext` now in
    REMOVE_TAGS, nothing in this file any longer drives sanitizeSnapshot's
    pass loop to disagreement — a grep for `converg`/`MAX_PASSES` across
    this suite turns up only comments, this one included. The fail-closed
    `return ''` at the bottom of `sanitizeSnapshot` (sanitize.ts, see
    MAX_PASSES's own comment) is therefore live, reachable code with no test
    exercising it. Left uncovered deliberately rather than papered over with
    a contrived input invented only to hit it — a genuine one would mean
    some other rule in this file has the same latent problem noscript/
    plaintext did, which is a real finding worth its own test, not a gap to
    fill with a fake one.
  */
});
