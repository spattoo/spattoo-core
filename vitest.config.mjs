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
    /* ⚠️ 20s, NOT vitest's 5s. A handful of the geometry tests do real work — rasterising a
       fourteen-glyph script word three times over, or checking a few hundred coat seats pairwise
       across four footprints. They take a couple of seconds on an idle laptop and blew the 5s
       default on a loaded one, failing three releases in a row on a DIFFERENT test each time while
       nothing in either import graph had changed.

       A gate whose verdict depends on what else the machine is doing is not a gate — it teaches
       everyone to re-run until it passes, which is how a real failure gets re-run away too. 20s is
       still far short of a hang, so a test that genuinely stops still fails. */
    testTimeout: 20_000,
  },
});
