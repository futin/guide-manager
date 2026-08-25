import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MIME } from './mime';
import {
  breadcrumbBar,
  deckFrame,
  injectProgressReporter,
  injectReadingAid,
  wrapPage
} from './render.util';
import { resolveAllowed } from './paths.util';
import { RegistryService } from '../registry/registry.service';
import { ProgressService } from '../progress/progress.service';

@Controller()
export class RenderController {
  constructor(
    private readonly registry: RegistryService,
    private readonly progress: ProgressService
  ) {}

  /**
   * The read-it-here route: a breadcrumb bar, and the guide itself framed so its
   * own inline CSS/JS reach the browser untouched.
   *
   * A guide is a generated HTML page — a tutor deck, or a study guide's
   * `index.html` build — and nothing else. The markdown branch that used to
   * render a README hub inline is gone: it was `marked` plus a stylesheet, with
   * no mermaid renderer and no notion of sibling files, so a directory guide
   * came out as its hub alone — fences as raw text, no contents rail, no
   * chapters. The build already holds every chapter, the rail, and the fences as
   * drawn SVG, so framing it is the only rendering worth having. Anything else
   * registered as a guide is a mistake upstream, and 404 says so.
   */
  @Get('guide')
  guide(@Query('p') requested: string, @Res() res: Response): void {
    const real = this.resolve(requested);
    const ext = extname(real).toLowerCase();
    if (ext !== '.html' && ext !== '.htm') throw new NotFoundException('not a guide');
    const meta = this.registry.guideMeta(real);
    const src = `/asset?p=${encodeURIComponent(real)}`;
    res.type(MIME['.html']).send(
      wrapPage(meta.title, deckFrame(src, meta.title), breadcrumbBar(meta), { bodyClass: 'deck-host' })
    );
  }

  /**
   * The route the guide frame and inline images pull from.
   *
   * Verbatim for everything except a guide document, which gets the reading aid
   * spliced in. That splice has to happen here rather than in the shell above:
   * the guide's prose lives inside the iframe, and a script on the host document
   * cannot cross into it. Serving the aid from this repo is also the whole point
   * — a build generated before the aid existed picks it up without being
   * regenerated, and the settings it reads are the ones the app's own Settings
   * page writes, since the frame is same-origin and localStorage is shared.
   */
  @Get('asset')
  async asset(@Query('p') requested: string, @Res() res: Response): Promise<void> {
    const real = this.resolve(requested);
    const ext = extname(real).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
      const meta = this.registry.guideMeta(real);
      let html = injectReadingAid(readFileSync(real, 'utf8'));
      /*
        Only a *registered* guide gets the progress reporter, and `meta.type`'s
        absence is exactly that test: a sibling HTML file served because it sits
        beside a guide has no registry entry, so there is no type to pick a
        restore strategy from and no card on the board for a position to ever be
        shown on.

        The stored progress is read here rather than fetched by the frame. This
        request has already been resolved through the allowlist, so the path is
        known and one query answers it — whereas a fetch from inside the frame
        would put a round trip in front of the restore, which the reader sees as
        the guide jumping after it has already painted.
      */
      if (meta.type) {
        const stored = await this.progress.find([real]);
        html = injectProgressReporter(html, {
          guidePath: real,
          project: meta.project ?? '',
          kind: meta.type === 'tutor' ? 'deck' : 'doc',
          progress: stored.get(real) ?? null
        });
      }
      res.type(MIME['.html']).send(html);
      return;
    }
    res.type(MIME[ext] || 'application/octet-stream').send(readFileSync(real));
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
