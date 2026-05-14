import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'src/api/handler': 'src/api/handler.ts',
    'src/worker':      'src/worker/handler.ts',
  },
  format: ['cjs'],
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // Bundle everything — no node_modules on Lambda, and none of our deps use native .node addons
  noExternal: [/.*/],
});
