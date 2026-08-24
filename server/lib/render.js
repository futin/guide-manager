import { Marked } from 'marked';
import { dirname, resolve } from 'node:path';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function rewriteUrl(url, baseDir) {
  if (/^(https?:|mailto:|#|\/)/i.test(url)) return url;
  const abs = resolve(baseDir, url);
  const route = /\.md$/i.test(abs) ? '/guide' : '/asset';
  return `${route}?p=${encodeURIComponent(abs)}`;
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
