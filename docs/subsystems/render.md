# Render pipeline

The render subsystem is everything between a registered guide on disk and the bytes a browser frames: `GET /guide` (a page shell with a breadcrumb bar and
an iframe), `GET /asset` (the guide document itself, plus any file that sits beside it), the fixed stylesheets and scripts that `AssetsController` serves,
the registry-built allowlist that decides which paths may be served at all, and the splicing that puts the reading aid, the progress reporter and the
favorites capture script into a framed guide on its way out. It also owns the read-only view of the registry those routes consult on every request, and the
reading aid itself (`assets/bionic.*`). The normative rules live in [CLAUDE.md §Invariants](../../CLAUDE.md); this page explains how the code meets them.

Code: [`server/src/render/`](../../server/src/render/), [`server/src/registry/`](../../server/src/registry/),
[`server/src/static.ts`](../../server/src/static.ts), [`vite.config.ts`](../../vite.config.ts), [`assets/`](../../assets/).

## Mechanism

### Two documents per guide

A guide is read through two nested frames. The client's viewer iframe loads the entry's `href`, `/guide?p=<path>`, which
[`guides.controller.ts`](../../server/src/guides/guides.controller.ts) builds. `GET /guide`
([`render.controller.ts`](../../server/src/render/render.controller.ts)) resolves the path, refuses anything that is not `.html`/`.htm` with a 404, looks up
the guide's metadata, and returns `wrapPage(...)` from [`render.util.ts`](../../server/src/render/render.util.ts): a small inline script that stamps the
saved theme from `localStorage['guide-manager.settings']` before the stylesheets load (so the first paint is themed), links to `/theme.css` and `/style.css`,
the `breadcrumbBar`, and a `deckFrame` iframe pointed at `/asset?p=<resolved path>`. The back link carries `target="_top"` so it leaves the viewer instead of
loading the app inside its own frame. `deckFrame` focuses the frame's window on load, so a deck's arrow-key listeners fire without a click first.

The shell deliberately carries no reading aid and no progress reporter. Every guide's prose and scroll position live inside the inner frame, where a script
on the shell cannot reach; a reading aid loaded on the shell would decorate only the breadcrumb title. `GET /asset` is what the inner frame loads, so that is
where all decoration happens.

### Resolving a path: the allowlist

Both routes go through one private `resolve()`. `RegistryService.allowlist()` calls `buildAllowlist` in
[`paths.util.ts`](../../server/src/render/paths.util.ts), which collects the realpath of each registered guide's *parent directory* — a guide and the files
beside it are servable, and a directory that no longer exists is skipped. `resolveAllowed` realpaths the requested path and accepts it only if it starts with
one of those directories plus a path separator. Realpathing first is what kills `..` traversal and symlinks that point outside; the trailing separator is what
stops `/x/guides-evil` matching an allowlist entry of `/x/guides`. A path that fails, does not exist, or is not a regular file is a 404 — not a 403, because
whether a path outside the allowlist exists is not the server's to confirm. A request with no `p` at all is a 404 too.

Requests therefore carry the *resolved* path, while the registry stores whatever path `bin/register.js` was handed. `RegistryService.guideMeta` tries an
exact match first and realpaths the registry's entries only on a miss, so a guide registered through a symlinked directory still gets its title. A file with
no registry entry — one served only because it sits beside a guide — gets its basename as title and no `type` or `project`. That missing `type` is the
"not a registered guide" signal `/asset` uses below.

### What `/asset` sends

Anything that is not HTML goes out verbatim, typed from [`mime.ts`](../../server/src/render/mime.ts) with `application/octet-stream` as the fallback. An HTML
document is read as text and passed through up to three splices:

1. `injectReadingAid` — always, registered guide or not.
2. `injectProgressReporter` — only when `guideMeta` returned a `type`. The context carries the guide path, project, a `kind` (`tutor` maps to `deck`,
   anything else to `doc`), the stored progress row read through `ProgressService.find`, and an optional `jumpTo`. Reading the stored row here rather than
   letting the frame fetch it means the reporter can restore on its first frame instead of after a round trip.
3. `injectFavoritesCapture` — under the same `type` gate, with guide path, project, `kind` and the registry title.

The splices are string edits, not a DOM parse: the guide's own inline CSS/JS, SVG and whitespace reach the browser exactly as generated. `splice()` inserts
before the first `</head>` or `</body>`, and when that tag is missing falls back to the very start or end of the document rather than dropping the script.
The aid adds `/bionic.css` before `</head>` and `/bionic.js` before `</body>`. The reporter and the capture script each add a
`<script type="application/json" id="gm-progress">` / `id="gm-favorites"` context block followed by their `<script src>`, both before `</body>`, in that
order. The JSON is serialised with every `<` written as `\u003c`, because a guide path is a filesystem path and may contain `</script>` or `<!--`.

Each injector first checks the document for its own version header (`bionic vN`, `progress vN`, `favorites vN`, matched anywhere, case-insensitively) and
returns the document unchanged if it finds one. A guide build may vendor its own copy, and two copies do not cooperate: two reading aids each decorate the
other's spans, two reporters fight over a deck's replay state, two capture scripts mount two stars. The served files carry those headers on their first line
([`progress.js`](../../assets/progress.js), [`favorites.js`](../../assets/favorites.js), and all three `bionic.*` files at `v3`).

### The `at` parameter

A favorite opens its guide with an anchor, `?at=<GuidePosition JSON>`. `GET /guide` does not interpret it: the shell has nothing to act on it with, so it
re-encodes `at` onto the inner frame's `src` next to `p`. `GET /asset` turns it into `jumpTo` with `parseJump`, which is `parsePosition` (from
[`progress.dto.ts`](../../server/src/progress/progress.dto.ts)) over `JSON.parse`, so a position means the same thing here as in a progress `POST` body. Absent,
non-JSON or invalid input becomes `null`, and a `null` `jumpTo` is left out of the context block entirely — the guide opens at the reader's ordinary stored
position instead of the request failing.

### Fixed assets

[`assets.controller.ts`](../../server/src/render/assets.controller.ts) answers the shell's two stylesheets and the files the splices link to: `/style.css`
(`server/public/`), `/theme.css` (`shared/`), and `/bionic.css`, `/bionic.js`, `/progress.js`, `/favorites.js` (`assets/`). Each is read from disk on every
request, so an edit shows up without a restart. These routes take no path parameter, so the allowlist does not apply. `REPO_ROOT` is found by walking up
from the controller's own directory until one holds both `assets/bionic.js` and `server/public/style.css`, which works from both the `ts-jest`/`nest start`
layout and the compiled `dist/` layout, and throws at import time if neither is found.

### The reading aid

[`bionic.js`](../../assets/bionic.js) bolds a fixation prefix of each word inside `.wrap`, `.shell` or `body`, skipping headings, code, SVG, form fields and
the panel itself, and keeps each decorated run's source text on `data-bx-src` so it can be stripped losslessly. Its state lives in
`localStorage['guide-manager:bionic']`, validated by `readState`, which falls back to defaults on anything malformed. [`bionic.html`](../../assets/bionic.html)
and [`bionic.css`](../../assets/bionic.css) are the optional control panel a guide's own build can vendor. v3's difference from v2 is that the panel is
optional: a spliced-in copy in a guide with no panel (an old build, or a tutor deck) still runs, driven by the app's Settings page. Because the framed guide
is same-origin with the app, a Settings write raises a `storage` event inside the frame and the aid repaints without a reload.

### Same paths in three places

In production Nest serves everything. [`static.ts`](../../server/src/static.ts) registers `ServeStaticModule` for `client/dist` only when
`client/dist/index.html` exists — otherwise the server comes up with the API and the render routes alone — and excludes `/api/{*path}`, `/guide`,
`/asset` and every `AssetsController` path from its SPA fallback. In development the client is served by Vite on another port, and
[`vite.config.ts`](../../vite.config.ts) proxies the same set of paths to the API. A path missing from the proxy does not 404: Vite's own SPA fallback answers
it with `index.html` as `text/html`, and the framed guide renders unstyled. That failure is invisible to the server-side suites, which is why the proxy list
is checked against the controller's route metadata rather than a hand-kept list.

### The registry, read per request

[`registry.service.ts`](../../server/src/registry/registry.service.ts) reads `GM_REGISTRY_FILE`, or `~/.guide-manager/registry.json`, on every `load()` —
which `allowlist()`, `guideMeta()` and `listProjects()` each call. There is no cache, so a guide registered mid-session is servable on the next request.
A missing file, unparseable JSON, or a `projects` that is not an array all read as an empty registry rather than an error. The service never writes the file.
In the compose stack the registry directory and `GM_GUIDE_ROOT` are mounted read-only at their host paths ([`docker-compose.yml`](../../docker-compose.yml));
a guide outside those mounts fails `realpath`/`existsSync` in the container and is dropped from the allowlist and the board without an error.

## Interfaces

- **`bin/register.js` (writer of the registry).** [`register.js`](../../bin/register.js) is the only writer; render only reads. It refuses a non-`.html`
  guide at registration, which is the upstream half of `/guide`'s 404 for anything else. The `type` it records (`study` | `tutor`) is what picks `doc` or
  `deck` for the injected scripts, and its absence is what keeps them off unregistered sibling files.
- **The client shell.** The board's entries carry `href: /guide?p=…` from the guides controller; `GuidesView` frames that `href` without a `sandbox`
  attribute, since the guide and all three injected scripts need to run. A favorite's deep link reaches the viewer through
  [`deeplink.ts`](../../client/src/lib/deeplink.ts), whose `viewerHref` appends `&at=` to the entry's own `href` rather than rebuilding a `/guide` URL. The
  theme stamp and the reading aid read the `localStorage` keys the client's Settings writes (`guide-manager.settings`, `guide-manager:bionic`).
- **Favorites and progress.** [favorites-progress.md](favorites-progress.md) covers what `progress.js` and `favorites.js` do once loaded. The seam with
  this subsystem is the two inline context blocks `/asset` writes (`gm-progress`, `gm-favorites`), the stored row `/asset` reads through `ProgressService`
  (which is why `RenderModule` imports `ProgressModule`), the `jumpTo` it derives from `at`, and the shell's breadcrumb markup, which `progress.js` reaches
  from inside the frame by its `.topbar .crumbs` class names.

## Invariants

- Only files inside a registered guide's realpathed directory are served; everything else is a 404 — `resolveAllowed`; guarded by
  [`paths.test.ts`](../../test/paths.test.ts) and [`render.e2e.test.ts`](../../test/render.e2e.test.ts).
- `GET /guide` frames `.html`/`.htm` only — `render.controller.ts`; guarded by `render.e2e.test.ts` and, at registration, by `bin/register.js`.
- The `/guide` shell links neither the reading aid nor a progress reporter — guarded by [`render.test.ts`](../../test/render.test.ts) and
  `render.e2e.test.ts`.
- Each injector leaves a document already carrying its own version header untouched — guarded by [`reading-aid.test.ts`](../../test/reading-aid.test.ts),
  [`progress-inject.test.ts`](../../test/progress-inject.test.ts), [`favorites-inject.test.ts`](../../test/favorites-inject.test.ts).
- The progress reporter and the capture script are injected only for registered guides (`meta.type` present) — guarded by the sibling-file cases in
  `render.e2e.test.ts`.
- A splice survives a missing `</head>`/`</body>`, and the three splices compose without displacing each other — guarded by the three inject suites.
- Inline context JSON cannot close its own `<script>` block — guarded by the `</script>` cases in `progress-inject.test.ts` and `favorites-inject.test.ts`.
- A malformed `at` degrades to no `jumpTo`, never an error — guarded by `parseJump`'s cases in `progress-inject.test.ts` and `render.e2e.test.ts`.
- Every `AssetsController` path is proxied by Vite — guarded by [`vite-proxy.test.ts`](../../test/vite-proxy.test.ts). `static.ts`'s exclude list is kept
  by hand; [`static.e2e.test.ts`](../../test/static.e2e.test.ts) checks only that `/api/guides`, `/guide` and `/asset` reach their controllers in an app
  built without a bundle — the fallback's own behaviour with a bundle is not tested.
- Served assets are the files on disk, read per request — guarded by [`assets.e2e.test.ts`](../../test/assets.e2e.test.ts).
- The registry is read per call and never written by the server — `RegistryService` holds no cache and no write path; its fallbacks are guarded by
  [`registry.test.ts`](../../test/registry.test.ts). The no-cache property itself has no test.
- The three `bionic.*` files carry one `bionic v3` header, and v3 runs without a panel and repaints on `storage` — guarded by
  [`bionic.test.ts`](../../test/bionic.test.ts), [`bionic-panelless.test.ts`](../../test/bionic-panelless.test.ts),
  [`bionic-storage.test.ts`](../../test/bionic-storage.test.ts).

<!-- docs-sync:
  sources:
    - server/src/render/
    - server/src/registry/
    - server/src/static.ts
    - vite.config.ts
    - assets/bionic.js
    - assets/bionic.css
    - assets/bionic.html
  kind: subsystem
  verified: 373d528f117e55b2d8264b50fe3f4d8f61a8c498
-->
