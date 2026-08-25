import viteConfig from '../vite.config';

import { AssetsController } from '../server/src/render/assets.controller';

/**
 * The dev server and the production server must serve the same set of paths.
 *
 * In production Nest owns everything: AssetsController answers /style.css,
 * /theme.css, /bionic.css and /bionic.js, and static.ts explicitly excludes
 * those from the SPA fallback. In dev the client is served by Vite on another
 * port, so every one of those paths needs a proxy entry — and a missing one does
 * not 404. Vite's own SPA fallback answers it with index.html as text/html, the
 * browser parses zero CSS rules out of it, and the guide page silently renders
 * unstyled: a framed tutor deck collapses to an iframe's intrinsic 300x150, and
 * the guide body loses its background so the shell shows through it.
 *
 * That failure is invisible to every server-side suite, which is why it is
 * asserted here against the controller's own route metadata rather than a
 * hand-kept list.
 */
describe('vite dev proxy', () => {
  /** The paths AssetsController declares, read from Nest's route metadata. */
  function assetRoutes(): string[] {
    const proto = AssetsController.prototype as unknown as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
      .map((name) => Reflect.getMetadata('path', proto[name] as object) as string | undefined)
      .filter((path): path is string => typeof path === 'string')
      .map((path) => (path.startsWith('/') ? path : `/${path}`));
  }

  const proxy = (viteConfig as { server?: { proxy?: Record<string, unknown> } }).server?.proxy ?? {};

  it('reads the asset routes off the controller', () => {
    // Guard the guard: a metadata shape change must not turn this suite into a
    // no-op that passes because it found nothing to check.
    expect(assetRoutes().sort()).toEqual([
      '/bionic.css',
      '/bionic.js',
      '/progress.js',
      '/style.css',
      '/theme.css'
    ]);
  });

  it('proxies every route the server owns', () => {
    for (const route of assetRoutes()) {
      expect(Object.keys(proxy)).toContain(route);
    }
  });

  it('proxies the API and the render routes', () => {
    for (const route of ['/api', '/guide', '/asset']) {
      expect(Object.keys(proxy)).toContain(route);
    }
  });
});
