import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.PORT) || 4321;

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
    proxy: {
      '/api': { target: `http://localhost:${API_PORT}` },
      '/guide': { target: `http://localhost:${API_PORT}` },
      '/asset': { target: `http://localhost:${API_PORT}` },
      '/theme.css': { target: `http://localhost:${API_PORT}` },
      '/bionic.css': { target: `http://localhost:${API_PORT}` },
      '/bionic.js': { target: `http://localhost:${API_PORT}` }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
