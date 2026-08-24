import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.PORT) || 4321;
// localhost on the host, but the service name when this runs in the compose
// stack — there localhost is the Vite container, not the API's.
const API_TARGET = `http://${process.env.API_HOST || 'localhost'}:${API_PORT}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT) || 5175,
    host: true,
    // The guide viewer is a same-origin iframe pointed at the Nest render route,
    // so /guide and /asset have to be proxied too — not just /api, or the Guides
    // tab shows an empty frame in dev. The stylesheet and reading-aid routes come
    // from the server as well, so a framed guide is themed in dev exactly as it
    // is in production.
    //
    // Every path AssetsController answers must appear here, and a missing one
    // fails silently rather than 404ing: Vite's SPA fallback hands back
    // index.html as text/html, the browser parses no rules out of it, and the
    // guide page renders unstyled — see test/vite-proxy.test.ts, which asserts
    // this list against the controller's own routes.
    proxy: {
      '/api': { target: API_TARGET },
      '/guide': { target: API_TARGET },
      '/asset': { target: API_TARGET },
      '/style.css': { target: API_TARGET },
      '/theme.css': { target: API_TARGET },
      '/bionic.css': { target: API_TARGET },
      '/bionic.js': { target: API_TARGET }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
