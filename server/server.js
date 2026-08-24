import { createServer as createHttpServer } from 'node:http';
import { readFileSync, existsSync, statSync, realpathSync, watch } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, REGISTRY_FILE } from '../bin/register.js';
import { buildAllowlist, resolveAllowed } from './lib/paths.js';
import { renderMarkdown, wrapPage, escapeHtml, breadcrumbBar, deckFrame } from './lib/render.js';

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

function realOrNull(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

// Breadcrumb context for a guide. Requests carry the resolved realpath (see
// resolveAllowed) while the registry stores whatever path the skill handed in,
// so an exact hit is tried first and symlinked entries are resolved only on
// miss. A file served merely because it sits next to a registered guide has no
// entry at all — name it by filename and leave the crumbs off rather than guess.
function guideMeta(registry, path) {
  const entries = registry.projects.flatMap((p) => p.guides.map((g) => [p, g]));
  const hit =
    entries.find(([, g]) => g.path === path) ||
    entries.find(([, g]) => realOrNull(g.path) === path);
  if (!hit) return { title: basename(path) };
  const [project, guide] = hit;
  return { title: guide.title, type: guide.type, project: project.name };
}

function indexPage(registry) {
  const sections = registry.projects
    .map((project) => {
      const items = project.guides
        .filter((g) => {
          if (existsSync(g.path)) return true;
          console.error(`stale guide hidden: ${g.path}`);
          return false;
        })
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
        // /guide is the read-it-here route and always carries the breadcrumb;
        // /asset is the verbatim route the deck frame and images pull from.
        if (url.pathname === '/guide' && ext === '.md') {
          const md = readFileSync(real, 'utf8');
          const meta = guideMeta(registry, real);
          return send(res, 200, MIME['.html'],
            wrapPage(meta.title, renderMarkdown(md, real), breadcrumbBar(meta)));
        }
        if (url.pathname === '/guide' && (ext === '.html' || ext === '.htm')) {
          const meta = guideMeta(registry, real);
          const src = `/asset?p=${encodeURIComponent(real)}`;
          return send(res, 200, MIME['.html'],
            wrapPage(meta.title, deckFrame(src, meta.title), breadcrumbBar(meta), { bodyClass: 'deck-host' }));
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

// Reload by exiting and letting the supervisor start us again, rather than
// restarting in-process. That leaves one recovery path for both cases: launchd's
// KeepAlive brings the server back whether it exited for a code change or died.
// `node --watch` cannot do this — its parent survives the child's crash, so
// launchd would see a healthy process with nothing listening.
function exitOnSourceChange(server) {
  const dirs = [
    fileURLToPath(new URL('.', import.meta.url)),
    fileURLToPath(new URL('../bin', import.meta.url)),
  ];
  let exiting = false;
  const reload = (file) => {
    // style.css is re-read on every request, so only code needs a restart.
    if (exiting || !file || !file.endsWith('.js')) return;
    exiting = true;
    console.log(`source changed (${file}) — exiting so the supervisor restarts on fresh code`);
    server.close(() => process.exit(0));
    // Idle keep-alive sockets can hold close() open; do not wait on them.
    setTimeout(() => process.exit(0), 1000).unref();
  };
  for (const dir of dirs) {
    try {
      watch(dir, { recursive: true }, (_event, file) => reload(file));
    } catch (err) {
      console.error(`reload watch unavailable for ${dir}: ${err.message}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4321;
  const server = createServer();

  // Without this, EADDRINUSE arrives as an unhandled 'error' event: the process
  // dies on a stack trace and the supervisor respawns it into the same conflict.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`port ${port} is already in use — another guide-manager is probably running`);
    } else {
      console.error(`server error: ${err.message}`);
    }
    process.exit(1);
  });

  // Exit rather than serve on from indeterminate state; the supervisor restarts us.
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    process.on(event, (err) => {
      console.error(`${event} — exiting for the supervisor to restart:`, err);
      process.exit(1);
    });
  }

  server.listen(port, () => {
    console.log(`guide-manager listening on http://localhost:${port}`);
    if (process.env.GM_RESTART_ON_CHANGE) exitOnSourceChange(server);
  });
}
