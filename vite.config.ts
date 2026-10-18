import { defineConfig } from 'vite';

// GitHub Pages serves the site from /mutation-garden/.
export default defineConfig({
  base: '/mutation-garden/',
  // three is about 600 kB minified; M1 sets a real bundle budget (docs/architecture.md, Performance).
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
  server: { host: true },
});
