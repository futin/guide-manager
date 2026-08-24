import type { GuideMeta } from '../../../shared/types';

export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
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
 * The page shell every guide gets: a breadcrumb bar, and the guide itself in an
 * iframe.
 *
 * It deliberately carries no reading aid of its own. Every guide is a generated
 * HTML document now, framed rather than spliced into, so the only prose on this
 * page is the breadcrumb title — and since bionic v3 runs without a panel,
 * linking the aid here would decorate exactly that and nothing else. The guide's
 * own document picks the aid up from /asset instead, inside the frame where the
 * prose actually is.
 */
export interface WrapPageOptions {
  bodyClass?: string;
}

export function wrapPage(
  title: string,
  bodyHtml: string,
  headerHtml = '',
  { bodyClass = '' }: WrapPageOptions = {}
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${THEME_STAMP}
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/style.css">
</head>
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ''}>
${headerHtml}<main class="wrap">${bodyHtml}</main>
</body>
</html>`;
}

/**
 * Splice the reading aid into a generated guide document.
 *
 * A study guide's `index.html` build and a tutor deck are both framed rather
 * than rendered, so the page shell around the iframe cannot reach their prose —
 * decoration has to happen inside the framed document or not at all. Serving
 * the aid from here rather than relying on the copy `tools/build.mjs` vendors
 * means one implementation governs every guide the app frames: a build from
 * before the aid existed picks it up, and a fix to bionic.js reaches all of
 * them without regenerating anything.
 *
 * Skipped outright when the document already carries a `bionic vN` header. A
 * current build inlines its own copy, and two copies do not cooperate: each
 * script closes over its own `bound` flag, so both would run apply() over the
 * same tree and the second would decorate the first's spans.
 *
 * String splicing rather than a DOM parse because the bytes are otherwise none
 * of our business — a build's own inline CSS/JS, its hand-authored SVG and its
 * whitespace all reach the browser exactly as generated.
 */
const AID_CSS = '<link rel="stylesheet" href="/bionic.css">';
const AID_JS = '<script src="/bionic.js"></script>';

export function injectReadingAid(html: string): string {
  if (/bionic v\d+/i.test(html)) return html;
  return splice(splice(html, /<\/head\s*>/i, AID_CSS, true), /<\/body\s*>/i, AID_JS, false);
}

/**
 * Insert `what` at the first match of `at`, falling back to the head or the
 * foot of the document when the tag is absent — hand-written and older
 * generated builds are not reliably well-formed, and dropping the aid because a
 * closing tag is missing would put back the silence this exists to fix.
 */
function splice(html: string, at: RegExp, what: string, atStartIfMissing: boolean): string {
  const m = at.exec(html);
  if (!m) return atStartIfMissing ? what + html : html + what;
  return html.slice(0, m.index) + what + html.slice(m.index);
}
