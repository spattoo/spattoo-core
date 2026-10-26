#!/usr/bin/env node
/* ── The build must be quiet, not merely successful ──────────────────────────────────────────────
 *
 * ⚠️ `vite build` EXITS 0 ON A WARNING, so `npm run build` passing says nothing about whether the
 * build said anything. That is how a duplicate JSX attribute got committed with twenty-six gates
 * green: esbuild printed
 *
 *     [plugin vite:esbuild] Duplicate "buildOffX" attribute in JSX element
 *
 * …and carried on, because the last attribute wins and the output is valid. It was not harmless —
 * the attribute had been inserted twice on one element and NOT AT ALL on the other, so half the
 * feature was silently missing. The warning was the only evidence, and nothing was reading it.
 *
 * Sandeep, after a black screen on app.spattoo.dev: *"pls ensure the builds are error free"*.
 *
 * ⚠️ KNOWN WARNINGS ARE LISTED BY NAME, NOT SILENCED BY PATTERN. Same bargain as check:env-map's
 * "7 accounted for by name": a blanket filter would swallow the next real one. Each entry below
 * says what it is and why it is tolerated, and the gate reports how many it matched — an entry that
 * stops matching is itself worth noticing.
 */

import { spawnSync } from 'node:child_process';

/* Warnings this build is known to emit, with the reason each is accepted. All three are the same
   shape: a module that is lazily imported in one place and eagerly in another, so Rollup cannot put
   it in its own chunk. That is a bundling-efficiency note about code that works, and resolving them
   means changing how those screens load — a separate piece of work, not a build defect. */
const ACCEPTED = [
  { name: 'helvetiker typeface — static + dynamic', test: (l) => l.includes('helvetiker_bold.typeface.json') },
  { name: 'cakeDraft.js — static + dynamic',        test: (l) => l.includes('facets/cakeDraft.js') },
  { name: 'photoStore.js — static + dynamic',       test: (l) => l.includes('facets/photoStore.js') },
];

const res = spawnSync('npx', ['vite', 'build'], {
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production' },
});

const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;

if (res.status !== 0) {
  console.error('✗ check:build-clean — the build itself failed.\n');
  console.error(output.trim());
  process.exit(1);
}

/* What counts as the build speaking up. `(!)` is Rollup's own marker and `[plugin …]` is how vite
   attributes a message to a plugin; "warning"/"Duplicate" catch esbuild's plainer lines. */
const SPEAKS_UP = /\(!\)|\[plugin [^\]]+\]|\bwarn(ing)?\b|\bDuplicate\b/i;

const lines = output.split('\n');
const matched = new Set();
const unexplained = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!SPEAKS_UP.test(line)) continue;
  /* A warning's detail is usually on the FOLLOWING lines, so a note is judged on its whole
     paragraph — the marker line alone rarely names the file. */
  const paragraph = lines.slice(i, i + 4).join('\n');
  const known = ACCEPTED.find(a => a.test(paragraph));
  if (known) { matched.add(known.name); continue; }
  unexplained.push(paragraph.split('\n').filter(Boolean).slice(0, 3).join('\n     '));
}

if (unexplained.length) {
  console.error('✗ check:build-clean — the build printed something nobody has accounted for.\n');
  console.error('  A warning is not a passing build. `vite build` exits 0 either way, which is how');
  console.error('  a duplicate JSX attribute reached a commit with every other gate green.\n');
  for (const u of unexplained) console.error(`   • ${u}\n`);
  console.error('  Fix it, or — if it is genuinely acceptable — add it to ACCEPTED in');
  console.error('  scripts/check-build-clean.mjs WITH THE REASON, so the next one still fails.\n');
  process.exit(1);
}

const missing = ACCEPTED.filter(a => !matched.has(a.name)).map(a => a.name);
console.log(`✓ check:build-clean — the build is quiet (${matched.size} known note(s) accounted for)`
  + (missing.length ? `\n  note — no longer emitted, consider removing: ${missing.join(', ')}` : ''));
