import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `.shell{zoom:var(--font-scale)}` scales the element's own box but NOT what
 * `vh`/`vw`/`dvh` resolve against — those keep measuring the unzoomed viewport.
 * So every viewport-unit length inside the zoomed subtree has to be divided by
 * `--font-scale`, or it overshoots the screen by exactly the scale factor: at
 * 120% a plain `100vh` rail is drawn a fifth taller than the window.
 *
 * That is an invariant no type checker can hold and no jsdom test can see —
 * jsdom does not lay out, let alone apply `zoom`. This suite is the guard
 * instead: it reads the stylesheet as text and refuses any viewport unit that
 * is not either divided or named in EXEMPT below with a reason.
 *
 * Adding a rule that measures in `vh` and forgetting the division is the exact
 * mistake the styles.css header warns about, and it only shows up on a device
 * that is actually scaled — which is to say, not on the machine that wrote it.
 */
describe('viewport units under .shell{zoom}', () => {
  const css = readFileSync(join(__dirname, '..', 'client', 'src', 'styles.css'), 'utf8');

  /**
   * Lengths that are deliberately NOT divided, and why. Keyed by the exact
   * declaration so a rule cannot quietly change underneath its exemption.
   */
  const EXEMPT: { decl: string; why: string }[] = [
    {
      decl: 'min-height: 100vh',
      why: 'on <body>, which is the zoomed element’s PARENT — zoom never scales it'
    }
  ];

  /**
   * The stylesheet with every block comment blanked out. Whole-text rather than
   * per-line, because the comments here run to several lines and the
   * continuations carry no `*` prefix to recognise them by — and they discuss
   * `100vh` at length, so a line filter would flag the explanation of the rule
   * as a violation of it. Newlines are preserved so line numbers still line up.
   */
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

  /** Every line carrying a viewport unit, comments and the exemptions removed. */
  function viewportLines(): string[] {
    return code
      .split('\n')
      .filter((line) => /\d+(?:\.\d+)?(?:vh|vw|dvh|dvw|svh|lvh)\b/.test(line))
      .filter((line) => !EXEMPT.some((e) => line.includes(e.decl)));
  }

  it('finds viewport units to check at all, so a rename cannot make this vacuous', () => {
    expect(viewportLines().length).toBeGreaterThan(3);
  });

  it('divides every viewport length in the zoomed subtree by --font-scale', () => {
    const undivided = viewportLines().filter((line) => !line.includes('var(--font-scale'));
    expect(undivided).toEqual([]);
  });

  it('keeps the zoom on .shell rather than body, so the sticky rail is a direct child', () => {
    // `zoom` is legacy, and its interaction with `position: sticky` descendants
    // is engine-dependent. The rail is sticky and is .shell's direct child.
    expect(css).toMatch(/\.shell\s*\{\s*zoom:\s*var\(--font-scale, 1\)\s*\}/);
    expect(css).not.toMatch(/\bbody\s*\{[^}]*\bzoom:/);
  });

  it('declares the compact overrides after the :root defaults they replace', () => {
    // Both selectors match <html> at the same specificity, so source order is
    // the only thing deciding the winner — a compact block above :root is dead.
    const root = css.indexOf(':root {\n  --body-pad');
    const compact = css.indexOf('[data-density="compact"] {');
    expect(root).toBeGreaterThan(-1);
    expect(compact).toBeGreaterThan(root);
  });

  it('moves only spacing under compact — never a colour or a font size', () => {
    // Density has to compose with all five palettes rather than multiplying into
    // five more, and a smaller font is what the text-scale row is for.
    const block = css.slice(
      css.indexOf('[data-density="compact"] {'),
      css.indexOf('}', css.indexOf('[data-density="compact"] {'))
    );
    expect(block).not.toMatch(/color|background|font-size/);
    expect(block).toMatch(/--body-pad:/);
  });
});
