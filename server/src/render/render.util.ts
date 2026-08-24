import { dirname, resolve } from 'node:path';
import { Marked, type Token } from 'marked';

import type { GuideMeta } from '../../../shared/types';

export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function rewriteUrl(url: string, baseDir: string): string {
  if (/^(https?:|mailto:|data:|#|\/)/i.test(url)) return url;
  // Strip query string and fragment before resolving
  const [cleanUrl, fragment] = url.split('#');
  const [pathOnly] = cleanUrl.split('?');
  const abs = resolve(baseDir, pathOnly);
  const route = /\.md$/i.test(abs) ? '/guide' : '/asset';
  const rewritten = `${route}?p=${encodeURIComponent(abs)}`;
  // Re-append fragment for /guide targets (in-page anchors)
  return route === '/guide' && fragment ? `${rewritten}#${fragment}` : rewritten;
}

export function renderMarkdown(md: string, guidePath: string): string {
  const baseDir = dirname(guidePath);
  const marked = new Marked({
    walkTokens(token: Token) {
      if ((token.type === 'link' || token.type === 'image') && token.href) {
        token.href = rewriteUrl(token.href, baseDir);
      }
    }
  });
  try {
    return marked.parse(md) as string;
  } catch {
    return `<pre>${escapeHtml(md)}</pre>`;
  }
}

/**
 * Sticky context bar for a guide page: where you are, and the way back.
 *
 * `target="_top"` on the back link is load-bearing. A guide is normally read
 * inside a same-origin iframe in the client's Guides tab, and an untargeted
 * `href="/"` navigates *the frame* — which loads the whole app inside its own
 * viewer, and every click from there nests one level deeper. Targeting the top
 * window takes the tab itself back to the guides list, and reads the same when
 * the guide is opened standalone, where top is the page.
 */
export function breadcrumbBar({ project, title, type }: Partial<GuideMeta> = {}): string {
  const projectCrumb = project
    ? `<span class="crumb-sep" aria-hidden="true">/</span>` +
      `<span class="crumb-project">${escapeHtml(project)}</span>`
    : '';
  const badge = type
    ? `<span class="badge ${escapeHtml(type)}">${escapeHtml(type)}</span>`
    : '';
  return `<header class="topbar">
<div class="topbar-inner">
<nav class="crumbs" aria-label="Breadcrumb"><a class="back" href="/" target="_top"><span class="arrow" aria-hidden="true">←</span> Guides</a>${projectCrumb}</nav>
<div class="topbar-title"><span class="crumb-title">${escapeHtml(title || '')}</span>${badge}</div>
</div>
</header>`;
}

// A generated HTML guide — a tutor deck, or a study guide's single-page build —
// is one self-contained file with its own inline CSS/JS, so it is framed rather
// than spliced into: the bytes stay untouched and reach the browser through
// /asset. The frame is same-origin, so focusing it lets a deck's own
// ArrowLeft/ArrowRight listeners fire without the reader having to click into
// it first.
export function deckFrame(src: string, title?: string): string {
  return `<iframe class="deck-frame" src="${escapeHtml(src)}" title="${escapeHtml(title || 'Deck')}"></iframe>
<script>
(function () {
  var frame = document.querySelector('.deck-frame');
  function focusDeck() { try { frame.contentWindow.focus(); } catch (e) {} }
  frame.addEventListener('load', focusDeck);
  focusDeck();
})();
</script>`;
}

/**
 * Stamped before the stylesheets so a load never flashes the default palette —
 * worst on the light theme. Inline and tiny on purpose: it has to run before
 * paint, so it cannot be a module. Mirrors the client's own pre-paint script in
 * client/index.html and reads the same key; fails silently (private mode, no
 * storage) straight back to the default theme.
 */
const THEME_STAMP = `<script>
try {
  var s = JSON.parse(localStorage.getItem('guide-manager.settings') || '{}');
  if (s.theme) document.documentElement.dataset.theme = s.theme;
} catch (e) {}
</script>`;

/**
 * Embed a value in an inline <script> safely. JSON.stringify alone is not
 * enough: a guide path containing `</script>` would end the element early and
 * everything after it would be parsed as markup.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Reports reading position for the guide this page renders.
 *
 * Throttled on a timer rather than firing per scroll event: a POST per frame
 * would be hundreds of writes for one page. The unload write uses `keepalive`
 * so the last position survives the tab closing, which a normal fetch would not.
 *
 * `completed` is decided here, in the browser, because only the browser knows
 * the viewport — the server cannot tell how much of a page fits on screen.
 */
function progressReporter(guidePath: string, project: string): string {
  return `<script>
(function () {
  var GUIDE = ${jsonForScript(guidePath)};
  var PROJECT = ${jsonForScript(project)};
  var MIN_MS = 5000;
  var last = 0;
  var timer = null;

  function percent() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    if (max <= 0) return 100; // a page that fits on screen is fully seen
    return Math.round((doc.scrollTop / max) * 100);
  }

  function send(keepalive) {
    var pct = percent();
    last = Date.now();
    try {
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          guidePath: GUIDE,
          project: PROJECT,
          scrollPercent: pct,
          completed: pct >= 98 ? true : undefined
        }),
        keepalive: !!keepalive
      });
    } catch (e) { /* offline, or the server went away — never break the read */ }
  }

  send(false);

  addEventListener('scroll', function () {
    if (timer) return;
    var wait = Math.max(0, MIN_MS - (Date.now() - last));
    timer = setTimeout(function () { timer = null; send(false); }, wait);
  }, { passive: true });

  addEventListener('pagehide', function () { send(true); });
})();
</script>`;
}

/**
 * The page shell every server-rendered guide gets.
 *
 * `main` carries `class="wrap"` because assets/bionic.js decorates the first of
 * `.wrap`, `.shell`, `body` that it finds — matching `.wrap` keeps the reading
 * aid off the breadcrumb bar. The aid's script is loaded at the end of `<body>`
 * so its ready branch finds the content already parsed, and its own SKIP list
 * already excludes pre, code and every heading level.
 */
export interface WrapPageOptions {
  bodyClass?: string;
  /**
   * The reading aid's panel markup. Required for bionic reading to work at all:
   * assets/bionic.js resolves the panel's controls in init() and bails if they
   * are absent. Omit it for a page with no prose of its own — a framed deck,
   * whose own build embeds a panel inside the frame.
   */
  panelHtml?: string;
  /**
   * The guide this page renders. Given both, the page reports reading progress;
   * omit them and no reporter is emitted at all — which is what a framed deck
   * wants, since it scrolls inside an iframe this script cannot observe.
   */
  guidePath?: string;
  project?: string;
}

export function wrapPage(
  title: string,
  bodyHtml: string,
  headerHtml = '',
  { bodyClass = '', guidePath, project, panelHtml = '' }: WrapPageOptions = {}
): string {
  const reporter = guidePath ? progressReporter(guidePath, project ?? '') : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${THEME_STAMP}
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/bionic.css">
</head>
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ''}>
${headerHtml}<main class="wrap">${panelHtml}${bodyHtml}</main>
<script src="/bionic.js"></script>
${reporter}
</body>
</html>`;
}
