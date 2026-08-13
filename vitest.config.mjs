import { defineConfig } from 'vitest/config';

// Separate from vite.config.js (which builds the lib) — just runs the unit/contract tests.
//
// esbuild.jsx: 'automatic' — WITHOUT it, .jsx is transformed with the CLASSIC runtime, which expects a
// global `React`. Our components use the automatic runtime (they never import React), so any test that
// rendered one died with "React is not defined". Which means NO component could be tested at all — and
// nobody noticed, because no test rendered one.
//
// That gap had a price: the Decorations panel shipped a `ReferenceError: filterEl is not defined` that
// ONE render would have caught, past a green build, 140 green tests and three green gates. Rendering a
// component is now possible, so it is now expected.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
