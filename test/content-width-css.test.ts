import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `contentWidth` (Settings › Display) has its whole effect outside anything a component suite can observe, so it gets a source guard in the idiom of
 * font-scale-css.test.ts: these cases read files, they render nothing.
 *
 * Two halves, each invisible for its own reason. The CSS half because jsdom applies no stylesheet — a rendered assertion on the released measure would
 * pass whether or not the rule existed, and the failure is a segmented control that toggles cleanly and changes nothing on screen. The pre-paint half
 * because `client/index.html` is never loaded by any suite: React's own stamp (pinned in settings-view.test.tsx) would keep every case green while a
 * `full` device visibly snapped out of the fixed measure on every load.
 */
const root = join(__dirname, '..');
const css = readFileSync(join(root, 'client', 'src', 'styles.css'), 'utf8');
/** Comments blanked, so a rule quoted in an explanation cannot satisfy a case on its own. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** The declaration block of every rule whose selector list names `selector` exactly. */
function blocksFor(selector: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) out.push(m[2]);
  }
  return out;
}

describe('content width', () => {
  /**
   * BOTH wraps are released: Guides renders in `.wrap.wide` (1280 px), Favorites and Settings in `.wrap` (820 px). Freeing one alone would leave
   * half the app capped in a mode whose only promise is that it is not.
   */
  it('releases both .wrap and .wrap.wide under the full stamp', () => {
    for (const sel of [':root[data-width="full"] .wrap', ':root[data-width="full"] .wrap.wide']) {
      const blocks = blocksFor(sel);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.some((b) => /max-width:\s*none/.test(b))).toBe(true);
    }
  });

  /**
   * Deliberately NOT released: a favorite is a snapshot of a passage, read like prose, and its list keeps the 820 px reading measure it was laid out
   * against. Full widens the Favorites section around it, not the sheets.
   */
  it('leaves the favorites list on its own reading measure', () => {
    expect(blocksFor('.fav-list').some((b) => /max-width:\s*820px/.test(b))).toBe(true);
    expect(code).not.toMatch(/data-width="full"\][^{]*\.fav-list/);
  });

  /**
   * The pre-paint stamp, read out of the one inline script in the page, from the same settings key React writes. Scoped to that script rather than the
   * file, so a mention of `contentWidth` in an HTML comment could not satisfy it.
   */
  it('stamps the width before first paint, from the same stored key', () => {
    const html = readFileSync(join(root, 'client', 'index.html'), 'utf8');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

    expect(script).toContain("'guide-manager.settings'");
    expect(script).toMatch(/dataset\.width\s*=\s*s\.contentWidth/);
  });
});
