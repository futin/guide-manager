import type { GuideMeta, GuideProgress } from '../../../shared/types';

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
 * What the injected reporter needs to know about the guide it is running in.
 *
 * Inlined by the server rather than fetched by the reporter: /asset has already
 * resolved this request through the registry allowlist, so it knows the absolute
 * path, the project, the type and the stored position without being asked
 * again. A fetch from inside the frame would put a round trip in front of the
 * restore, which the reader would see as the guide jumping after it had already
 * painted.
 */
export interface ProgressContext {
  guidePath: string;
  project: string;
  /**
   * Which restore strategy applies. Taken from the registry entry's type rather
   * than sniffed from the markup: the registry is the authority on what a file
   * is, and bin/register.js is what enforces it.
   */
  kind: 'deck' | 'doc';
  /** What is already stored, so the reporter can restore on its first frame. */
  progress: GuideProgress | null;
}

const REPORTER_JS = '<script src="/progress.js"></script>';

/**
 * Encode a context for an inline `application/json` block.
 *
 * `<` becomes its JSON unicode escape, which parses back to the same string and
 * cannot end the block early. A guide path is a filesystem path — it can contain
 * `</script>`, and left raw that would close the block and spill the rest of the
 * context into the document as markup. Escaping the character rather than the
 * one sequence also covers `<!--`, which an HTML parser treats as the start of a
 * comment inside a script element.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Splice the progress reporter into a generated guide document.
 *
 * Same splice point, and the same reasoning, as injectReadingAid: the guide's
 * cards and its scroll position live inside the iframe, where a script on the
 * host document cannot reach them. Serving the reporter from here rather than
 * vendoring it into each guide means one implementation governs every guide the
 * app frames — a build from before this feature picks it up, and a fix reaches
 * all of them without regenerating anything.
 *
 * Skipped outright for a document that already carries a `progress vN` header.
 * Two reporters would each restore and each report, and each closes over its own
 * pending-replay state — so one would drive a deck forward while the other read
 * that as the reader navigating and cancelled itself.
 */
export function injectProgressReporter(html: string, ctx: ProgressContext): string {
  if (/progress v\d+/i.test(html)) return html;
  const blob = `<script type="application/json" id="gm-progress">${jsonForScript(ctx)}</script>`;
  return splice(html, /<\/body\s*>/i, blob + REPORTER_JS, false);
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
