import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/component/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Pure / client-testable code. Server actions, queries and pages are covered by
      // integration + e2e suites, which need a running Supabase.
      // SPEC-NOTE: thresholds apply to unit+component-testable code; I/O modules are measured by integration runs.
      include: ['src/lib/**/*.{ts,tsx}', 'src/features/**/schemas.ts', 'src/features/**/components/**/*.tsx', 'src/components/data-table/**/*.tsx'],
      exclude: ['src/lib/supabase/**', 'src/lib/auth/**', 'src/lib/pdf/render.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        'src/lib/billing/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
});
