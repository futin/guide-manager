import { Marked } from 'marked';
import { dirname, resolve } from 'node:path';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function rewriteUrl(url, baseDir) {
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

export function renderMarkdown(md, guidePath) {
  const baseDir = dirname(guidePath);
  const marked = new Marked({
    walkTokens(token) {
      if ((token.type === 'link' || token.type === 'image') && token.href) {
        token.href = rewriteUrl(token.href, baseDir);
      }
    },
  });
  try {
    return marked.parse(md);
  } catch {
    return `<pre>${escapeHtml(md)}</pre>`;
  }
}

// Sticky context bar for a guide page: where you are, and the way back.
export function breadcrumbBar({ project, title, type } = {}) {
  const projectCrumb = project
    ? `<span class="crumb-sep" aria-hidden="true">/</span>` +
      `<span class="crumb-project">${escapeHtml(project)}</span>`
    : '';
  const badge = type
    ? `<span class="badge ${escapeHtml(type)}">${escapeHtml(type)}</span>`
    : '';
  return `<header class="topbar">
<div class="topbar-inner">
<nav class="crumbs" aria-label="Breadcrumb"><a class="back" href="/"><span class="arrow" aria-hidden="true">\u2190</span> Guides</a>${projectCrumb}</nav>
<div class="topbar-title"><span class="crumb-title">${escapeHtml(title || '')}</span>${badge}</div>
</div>
</header>`;
}

// A tutor deck is one self-contained HTML file with its own inline CSS/JS and
// its own Next/Back controls, so it is framed rather than spliced into: the
// deck bytes stay untouched and reach the browser through /asset. The frame is
// same-origin, so focusing it lets the deck's own ArrowLeft/ArrowRight
// listeners fire without the reader having to click into it first.
export function deckFrame(src, title) {
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

export function wrapPage(title, bodyHtml, headerHtml = '', { bodyClass = '' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ''}>
${headerHtml}<main>${bodyHtml}</main>
</body>
</html>`;
}
