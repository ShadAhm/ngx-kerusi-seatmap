import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root,
  base: process.env['DEMO_BASE_HREF'] ?? '/',
  plugins: [react()],
  resolve: {
    // Run against source so both packages hot-reload, the way the Angular demo
    // does through the root tsconfig's path aliases.
    alias: {
      '@kerusiweb/react/styles.css': `${repo}/projects/react/styles.css`,
      '@kerusiweb/react': `${repo}/projects/react/src/public-api.ts`,
      '@kerusiweb/core': `${repo}/projects/core/src/public-api.ts`,
      '@kerusi/demo-scenarios': `${repo}/projects/demo-scenarios/src/index.ts`,
    },
  },
  build: {
    outDir: `${repo}/dist/react-demo`,
    emptyOutDir: true,
  },
  server: { fs: { allow: [repo] } },
});
