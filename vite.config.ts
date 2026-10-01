import { defineConfig } from 'vite';

// base: './' — сборка открывается из любой папки и из бакета Object Storage
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
