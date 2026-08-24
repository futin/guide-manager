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
    return css.match(new RegExp(`--${alias}:\\s*var\\(--([a-z-]+)\\)`))?.[1];
  }

  /** Every palette's own definition of one token, keyed by theme id. */
  function tokenByTheme(token: string): Record<string, string> {
    const out: Record<string, string> = {};
    const blocks = css.matchAll(/(?::root,)?\[data-theme="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g);
    for (const [, theme, body] of blocks) {
      const hex = body.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`))?.[1];
      if (hex) out[theme] = hex;
    }
    return out;
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
});
