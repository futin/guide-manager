import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The phone layout (spec §7) lives entirely in `@media (max-width: 639px)` blocks, and jsdom neither lays out nor evaluates media queries — so, like
 * font-scale-css, this suite reads the stylesheet as text. It pins the three figures §7 names: a 16 px gutter, Continue reading as one sideways row of
 * 240 px tiles that scrolls inside itself, and 44 px rows in the menu. The browser check is what proves no page-level horizontal scroll at 375 px; this
 * is what stops a later restyle from quietly dropping the rules that make that true.
 */
describe('phone layout (< 640 px)', () => {
  const css = readFileSync(join(__dirname, '..', 'client', 'src', 'styles.css'), 'utf8');

  /** Every `@media (max-width: 639px) { … }` body, joined. Brace-matched rather than regexed, because the blocks nest rules. */
  const phone = (() => {
    const bodies: string[] = [];
    const head = '@media (max-width: 639px)';
    let at = css.indexOf(head);
    while (at !== -1) {
      const open = css.indexOf('{', at);
      let depth = 1;
      let i = open + 1;
      for (; depth > 0 && i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
      }
      bodies.push(css.slice(open + 1, i - 1));
      at = css.indexOf(head, i);
    }
    return bodies.join('\n');
  })();

  /** The declarations of the first rule in the phone blocks whose selector list is exactly `selector`. */
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(phone);
    return m ? m[1] : '';
  };

  it('finds the phone blocks at all, so a reworded query cannot make this vacuous', () => {
    expect(phone.length).toBeGreaterThan(0);
  });

  it('sets a 16 px side gutter on the main column', () => {
    expect(rule('.main')).toMatch(/padding:\s*\S+\s+16px\s*(;|$)/);
  });

  it('lays Continue reading out as one row of 240 px tiles that scrolls sideways inside itself', () => {
    const decls = rule('.continue-grid');
    expect(decls).toMatch(/grid-auto-flow:\s*column/);
    expect(decls).toMatch(/grid-auto-columns:\s*240px/);
    expect(decls).toMatch(/overflow-x:\s*auto/);
  });

  it('gives every row in the menu a 44 px touch target, tree rows included', () => {
    expect(rule('.rail-link, .rail-sublink')).toMatch(/min-height:\s*44px/);
    // The chip's 44 px is ui-kit's (`narrow`); the menu only owes it margins that keep the 8 px overhang off the scroller's clip edge.
    expect(rule('.rail-release')).toMatch(/margin:\s*(?:[89]|\d{2,})px\s+0\s+(?:[89]|\d{2,})px/);
  });
});
