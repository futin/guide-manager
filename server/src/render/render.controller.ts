import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MIME } from './mime';
import { breadcrumbBar, deckFrame, renderMarkdown, wrapPage } from './render.util';
import { resolveAllowed } from './paths.util';
import { RegistryService } from '../registry/registry.service';

@Controller()
export class RenderController {
  constructor(private readonly registry: RegistryService) {}

  /**
   * The read-it-here route: always carries the breadcrumb. A markdown guide is
   * rendered inline; a generated deck is framed so its own inline CSS/JS and
   * its Next/Back controls reach the browser untouched.
   */
  @Get('guide')
  guide(@Query('p') requested: string, @Res() res: Response): void {
    const real = this.resolve(requested);
    const meta = this.registry.guideMeta(real);
    const ext = extname(real).toLowerCase();

    if (ext === '.md') {
      const md = readFileSync(real, 'utf8');
      res.type(MIME['.html']).send(
        wrapPage(meta.title, renderMarkdown(md, real), breadcrumbBar(meta), {
          guidePath: real,
          project: meta.project ?? ''
        })
      );
      return;
    }
    if (ext === '.html' || ext === '.htm') {
      const src = `/asset?p=${encodeURIComponent(real)}`;
      // No guidePath here on purpose: a deck scrolls inside its own iframe, so a
      // reporter on this document would only ever measure a page that does not
      // move. The deck still gets counted as opened by the client when the card
      // is tapped.
      res.type(MIME['.html']).send(
        wrapPage(meta.title, deckFrame(src, meta.title), breadcrumbBar(meta), { bodyClass: 'deck-host' })
      );
      return;
    }
    // Anything else is not a guide — fall back to the verbatim route's rules.
    res.type(MIME[ext] || 'application/octet-stream').send(readFileSync(real));
  }

  /** The verbatim route the deck frame and inline images pull from. */
  @Get('asset')
  asset(@Query('p') requested: string, @Res() res: Response): void {
    const real = this.resolve(requested);
    const ext = extname(real).toLowerCase();
    // A raw .md request is text, not a download: the old server served it as
    // text/plain and rewritten links rely on that.
    const type = ext === '.md' ? MIME['.txt'] : MIME[ext] || 'application/octet-stream';
    res.type(type).send(readFileSync(real));
  }

  /**
   * The security boundary. `resolveAllowed` realpaths the request and refuses
   * anything outside a registered guide's own directory — traversal, symlink
   * escape and prefix-sibling attacks all die here. A 404 rather than a 403:
   * whether a path outside the allowlist exists is not ours to confirm.
   */
  private resolve(requested: string): string {
    const real = resolveAllowed(requested || '', this.registry.allowlist());
    if (!real || !statSync(real).isFile()) throw new NotFoundException('not found');
    return real;
  }
}
