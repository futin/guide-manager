import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkHostCss } from 'ui-kit/guard';

/**
 * ui-kit owns every shape of the version chip and the What's new drawer (v0.3.0); this app owns only the `--uk-*` mapping in shared/theme.css and the
 * chip's placement (`.rail-release`). The guard reads each stylesheet the shell ships and fails on a rule that restyles a `.uk-*` class or sets a `--uk-*`
 * property that is not a public token — the shape the old `.rail-version` and `.uk-drawer` overrides had, which made this app's pill a plain text row while
 * backlog-manager's was a pill.
 *
 * The sheets are listed explicitly, so a new stylesheet is a deliberate add to this suite rather than an unread one.
 */
const ROOT = join(__dirname, '..');
const SHEETS = ['client/src/styles.css', 'shared/theme.css'];

describe('ui-kit guard', () => {
  it.each(SHEETS)('%s maps tokens and never restyles the kit', (file) => {
    const css = readFileSync(join(ROOT, file), 'utf8');
    // The file name rides along so a failure says which sheet the offences came from.
    expect({ file, offences: checkHostCss(css) }).toEqual({ file, offences: [] });
  });

  /**
   * The guard cannot see a token nobody mapped. `--uk-chip-bg` unmapped leaves the kit's light default well on a dark rail, and `--uk-zoom` unmapped lets
   * the drawer overhang the screen by the text scale (`.shell` zooms, and `100dvh` stays the unzoomed screen).
   */
  it('maps --uk-chip-bg and --uk-zoom', () => {
    const css = readFileSync(join(ROOT, 'shared/theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/--uk-chip-bg\s*:\s*var\(--steel\)/);
    expect(css).toMatch(/--uk-zoom\s*:\s*var\(--font-scale,\s*1\)/);
  });
});
