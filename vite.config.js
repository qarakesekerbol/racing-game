import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',

  // Relative asset URLs ('./assets/...' rather than '/assets/...') so the build
  // works when served from a subpath — a GitHub Pages project site, a preview
  // URL with a prefix, or opened straight off the filesystem — as well as from
  // a domain root like Vercel.
  base: './',

  server: {
    open: true,
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // The only chunk over the default 500kB warning is three.js itself, which
    // is already split out below and can't be shrunk further from here.
    chunkSizeWarningLimit: 600,
    // Three.js is ~480kB and never changes between deploys; splitting it out
    // means a game-code change doesn't invalidate it in visitors' caches.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
