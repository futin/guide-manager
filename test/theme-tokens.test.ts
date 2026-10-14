import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The palette's alias block feeds the vendored reading aid, which cannot be
 * edited to work around a bad mapping: assets/bionic.css paints `.bx-panel`
 * with `var(--panel)` and that is that.
 *
 * The aid's panel sits directly on a rendered guide page, whose background is
 * `--bg` → `--board`. So `--panel` has to be the surface tone that reads as a
 * card ON the board — the same one the shell's own cards use — not the
 * raised-on-a-card tone. `--strip-hi` is the latter: on the four dark palettes it
 * happens to be even lighter than `--strip` and looked fine, but on daylight it
 * is a tint *between* board and strip, so the panel came out ~1.09:1 against the
 * page and read as no panel at all.
 */
describe('palette aliases', () => {
  const css = readFileSync(join(__dirname, '..', 'shared', 'theme.css'), 'utf8');

  /** The token an alias forwards to, e.g. aliasTarget('panel') → 'strip'. */
  function aliasTarget(alias: string): string | undefined {
    return css.match(new RegExp(`--${alias}:\\s*var\\(--([a-z0-9-]+)\\)`))?.[1];
  }

  /**
   * Every palette's own definition of one token, keyed by theme id. Reads a 6-digit hex or an `rgba(r,g,b,a)` tint — the role tokens the redesign added
   * are written as literals in every block (no `color-mix()`, no `var()`), which is the only reason a regex over each block can check them at all.
   */
  function tokenByTheme(token: string): Record<string, string> {
    const out: Record<string, string> = {};
    const blocks = css.matchAll(/(?::root,)?\[data-theme="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g);
    for (const [, theme, body] of blocks) {
      const value = body.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6}|rgba\\([^)]*\\))`))?.[1];
      if (value) out[theme] = value;
    }
    return out;
  }

  /** An `rgba()` tint painted over an opaque hex surface, as the hex the eye actually sees. A plain hex passes through. */
  function composite(color: string, under: string): string {
    const m = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
    if (!m) return color;
    const alpha = Number(m[4]);
    const base = [1, 3, 5].map((i) => parseInt(under.slice(i, i + 2), 16));
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((c, i) => Math.round(Number(c) * alpha + base[i] * (1 - alpha)).toString(16).padStart(2, '0'))
        .join('')
    );
  }

  function luminance(hex: string): number {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it('paints the reading aid panel on the same surface a card uses', () => {
    expect(aliasTarget('panel')).toBe(aliasTarget('card'));
  });

  it('separates the panel from the page at least as strongly as a card does, on every palette', () => {
    const boards = tokenByTheme('board');
    const panels = tokenByTheme(aliasTarget('panel') as string);
    const cards = tokenByTheme(aliasTarget('card') as string);
    // Guard the guard: five palettes, all parsed.
    expect(Object.keys(boards)).toEqual(['midnight', 'graphite', 'amber', 'nightshift', 'daylight']);

    for (const [theme, board] of Object.entries(boards)) {
      // Relative, not a fitted floor: whatever separation this palette gives a
      // card on the board is the least the panel may have.
      expect(contrast(board, panels[theme])).toBeGreaterThanOrEqual(contrast(board, cards[theme]));
    }
  });

  const THEME_IDS = ['midnight', 'graphite', 'amber', 'nightshift', 'daylight'];

  it('clears 4.5:1 for the tutor pill text on its own tint, over the card surface, on every palette', () => {
    // --magenta alone fails on its tint in Midnight (4.01) and Graphite (4.32); --magenta-ink is the fix. Expected magnitudes are the spec's, so a
    // retuned palette that still squeaks past 4.5 but moves a long way is noticed rather than silently accepted.
    const expected: Record<string, number> = { midnight: 4.65, graphite: 4.74, amber: 5.99, nightshift: 4.54, daylight: 5.46 };
    const strips = tokenByTheme('strip');
    const tints = tokenByTheme('magenta-tint');
    const inks = tokenByTheme('magenta-ink');
    expect(Object.keys(tints)).toEqual(THEME_IDS);
    expect(Object.keys(inks)).toEqual(THEME_IDS);
    for (const theme of THEME_IDS) {
      const ratio = contrast(inks[theme], composite(tints[theme], strips[theme]));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(ratio - expected[theme])).toBeLessThanOrEqual(0.05);
    }
  });

  it.each([
    'green-fill', 'green-fill2', 'green-solid', 'green-tint', 'amber-solid', 'amber-text', 'amber-tint', 'amber-ink', 'mustard-tint', 'mustard-ink'
  ])('defines the role token --%s as a literal in all five theme blocks', (token) => {
    expect(Object.keys(tokenByTheme(token))).toEqual(THEME_IDS);
  });

  it.each(['accent', 'bg', 'fg', 'muted', 'line', 'card', 'panel', 'good', 'bad'])(
    'resolves --%s for every palette: the alias names a token each theme block defines',
    (alias) => {
      // The reading aid (assets/bionic.css) and a guide's own CSS read these names; the redesign changes values, never names.
      const target = aliasTarget(alias);
      expect(target).toBeDefined();
      expect(Object.keys(tokenByTheme(target as string))).toEqual(THEME_IDS);
    }
  );

  it('keeps --mono for the favorite snapshot and drops --display from both stylesheets', () => {
    const shell = readFileSync(join(__dirname, '..', 'client', 'src', 'styles.css'), 'utf8');
    expect(css).toMatch(/--mono:/);
    expect(css).not.toContain('--display');
    expect(shell).not.toContain('--display');
  });

  it('writes no color-mix(): every value is a literal the token regex can read', () => {
    expect(css).not.toContain('color-mix(');
  });
});
