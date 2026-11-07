import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

if (existsSync('.env')) process.loadEnvFile('.env');

const apiPort = Number(process.env.PORT || 0);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/admin',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.ADMIN_DEV_PORT || 0) || undefined,
    proxy: apiPort
      ? {
          '/api': `http://127.0.0.1:${apiPort}`,
          '/uploads': `http://127.0.0.1:${apiPort}`,
          '/w.js': `http://127.0.0.1:${apiPort}`,
        }
      : undefined,
  },
});
