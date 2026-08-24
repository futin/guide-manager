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

export function wrapPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>${bodyHtml}</main>
</body>
</html>`;
}
