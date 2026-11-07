import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/widget/index.ts',
      name: 'MiniFeedbackWidget',
      formats: ['iife'],
      fileName: () => 'w.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: 'esbuild',
    target: 'es2020',
    sourcemap: false,
  },
});
