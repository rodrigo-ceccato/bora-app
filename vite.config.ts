import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Ionic's shared runtime is intentionally loaded once for every route.
    // Route pages themselves are lazy-loaded from main.tsx.
    chunkSizeWarningLimit: 1300
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    }
  },
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  }
});
