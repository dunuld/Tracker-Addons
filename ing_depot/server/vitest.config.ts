import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts läuft im Kindprozess (test/main.spec.ts) und wird von v8 nicht erfasst.
      exclude: ['src/main.ts'],
      reportsDirectory: '../coverage/server',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      // Knapp unter dem aktuellen Stand – Coverage darf nicht unbemerkt sinken.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
