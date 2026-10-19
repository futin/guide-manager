import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkHostCss } from 'ui-kit/guard';

/**
 * ui-kit owns every shape of the version chip and the What's new drawer — type, radius, spacing, the drawer's width and height, the phone shape — and an
 * app maps colours, fonts and the zoom factor onto its `--uk-*` tokens, nothing else. `checkHostCss` is ui-kit's own check of that contract: it fails on
 * any rule that restyles a `.uk-*` class or reads or sets a `--uk-*` name outside the public set. This suite runs it over every stylesheet the app ships,
 * listed here by hand so a new sheet is a deliberate addition rather than one nobody checked.
 *
 * What the guard cannot see is a token the app never mapped: an unset `--uk-chip-bg` falls back to a light well that shows on a dark rail, and an unset
 * `--uk-zoom` lets the drawer overhang the screen at any text scale but 1. Those two are asserted below.
 */
const ROOT = join(__dirname, '..');
const SHEETS = ['client/src/styles.css', 'shared/theme.css'];

describe('ui-kit host CSS contract', () => {
  it.each(SHEETS)('%s restyles no ui-kit class and reads no private --uk-* name', (sheet) => {
    const problems = checkHostCss(readFileSync(join(ROOT, sheet), 'utf8'));
    expect({ sheet, problems }).toEqual({ sheet, problems: [] });
  });

  it('the --uk-* mapping sets --uk-chip-bg and --uk-zoom', () => {
    const theme = readFileSync(join(ROOT, 'shared/theme.css'), 'utf8');
    expect(theme).toMatch(/--uk-chip-bg\s*:\s*var\(--steel\)/);
    expect(theme).toMatch(/--uk-zoom\s*:\s*var\(--font-scale,\s*1\)/);
  });
});
