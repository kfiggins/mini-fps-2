import { defineConfig } from 'vite';

// base path matches the GitHub Pages project URL: kfiggins.github.io/mini-fps-2/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/mini-fps-2/' : '/',
  build: { sourcemap: false, minify: 'esbuild', chunkSizeWarningLimit: 2000 },
  server: { port: 5190 },
});
