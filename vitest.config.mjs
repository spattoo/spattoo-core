import { defineConfig } from 'vitest/config';

// Separate from vite.config.js (which builds the lib) — just runs the unit/contract tests.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
