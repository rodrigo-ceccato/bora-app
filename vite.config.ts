import { defineConfig } from 'vitest/config';
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
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.mjs',
      'scripts/**/*.test.mjs',
      'tests/component/**/*.test.tsx'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'src/lib/calendar.ts',
        'src/lib/datetime.ts',
        'src/lib/invite.ts',
        'src/lib/options.ts',
        'src/lib/results.ts',
        'src/lib/schedule.ts'
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 95,
        lines: 95,
        'src/lib/calendar.ts': {
          statements: 90,
          branches: 85,
          functions: 100,
          lines: 95
        },
        'src/lib/{datetime,invite,options,results,schedule}.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        }
      }
    },
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  }
});
