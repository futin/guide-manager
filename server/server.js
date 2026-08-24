import { createServer as createHttpServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, REGISTRY_FILE } from '../bin/register.js';
import { buildAllowlist, resolveAllowed } from './lib/paths.js';
import { renderMarkdown, wrapPage, escapeHtml } from './lib/render.js';

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

function titleFor(registry, path) {
  for (const project of registry.projects) {
    const guide = project.guides.find((g) => g.path === path);
    if (guide) return guide.title;
  }
  return basename(path);
}

function indexPage(registry) {
  const sections = registry.projects
    .map((project) => {
      const items = project.guides
        .filter((g) => existsSync(g.path))
        .map((g) =>
          `<li><a href="/guide?p=${encodeURIComponent(g.path)}">${escapeHtml(g.title)}</a>` +
          ` <span class="badge ${escapeHtml(g.type)}">${escapeHtml(g.type)}</span>` +
          ` <time>${escapeHtml(String(g.updated).slice(0, 10))}</time></li>`)
        .join('\n');
      if (!items) return '';
      return `<section><h2>${escapeHtml(project.name)}</h2><ul>${items}</ul></section>`;
    })
    .filter(Boolean)
    .join('\n');
  return wrapPage('Guides', `<h1>Guides</h1>\n${sections || '<p>No guides registered yet.</p>'}`);
}

export function createServer({ registryFile = REGISTRY_FILE } = {}) {
  return createHttpServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const registry = loadRegistry(registryFile);

      if (url.pathname === '/') {
        return send(res, 200, MIME['.html'], indexPage(registry));
      }
      if (url.pathname === '/style.css') {
        return send(res, 200, MIME['.css'], readFileSync(join(PUBLIC_DIR, 'style.css')));
      }
      if (url.pathname === '/guide' || url.pathname === '/asset') {
        const requested = url.searchParams.get('p') || '';
        const real = resolveAllowed(requested, buildAllowlist(registry));
        if (!real || !statSync(real).isFile()) return send(res, 404, MIME['.txt'], 'not found');
        const ext = extname(real).toLowerCase();
        if (url.pathname === '/guide' && ext === '.md') {
          const md = readFileSync(real, 'utf8');
          return send(res, 200, MIME['.html'], wrapPage(titleFor(registry, real), renderMarkdown(md, real)));
        }
        if (ext === '.md') {
          return send(res, 200, MIME['.txt'], readFileSync(real));
        }
        return send(res, 200, MIME[ext] || 'application/octet-stream', readFileSync(real));
      }
      send(res, 404, MIME['.txt'], 'not found');
    } catch (err) {
      console.error(err);
      send(res, 500, MIME['.txt'], 'server error');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4321;
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`guide-manager listening on http://0.0.0.0:${port}`);
  });
}
