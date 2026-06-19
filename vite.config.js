import { defineConfig } from 'vite';

// Relative base so the build also works when served from a sub-path
// (e.g. GitHub Pages project sites).
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0, // never inline the .glb; always emit as a file
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
