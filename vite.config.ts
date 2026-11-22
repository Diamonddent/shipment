/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the app from https://diamonddent.github.io/shipment/
// Override with VITE_BASE_PATH (e.g. "/" for a custom domain).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/shipment/';
  return {
    base,
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            data: ['@supabase/supabase-js', '@tanstack/react-query'],
            // recharts, xlsx, jspdf and jszip are loaded on demand by the pages that use them
          },
        },
      },
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
