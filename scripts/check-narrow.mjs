// ── One answer to "is this a phone" ─────────────────────────────────────────────────────────────
// There were NINE hand-rolled copies of the same hook, plus a bare non-reactive read. They had
// drifted on both axes that matter:
//
//   BREAKPOINT — OrderModal said 600, the other eight said 768. Nobody decided that; it is what
//                happens when the next person copies whichever file they had open.
//   SSR SAFETY — only OrderModal guarded `typeof window`. The rest read window.innerWidth in a
//                useState initialiser, so importing any of those panels into anything
//                server-rendered — or into renderToStaticMarkup, which is how every component here
//                is tested — throws. INVARIANTS #9 names this exact function as the trap.
//
// `check:dup` caught none of them, and could not: each is ~9 lines with the identifiers renamed
// (m/setM, mobile/setMobile, w/setW), which puts them under jscpd's token floor and past its
// tolerance for renaming. A duplicate small enough to slip the dup gate is exactly the kind that
// multiplies, because nothing objects until there are nine.
//
// So this gate is narrower and blunter than jscpd: nobody reads window.innerWidth to answer a
// yes/no question except the one shared hook.
//
// Run via `npm run check:narrow` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'src');

// The one place allowed to ask the window how wide it is for a boolean.
const HOME = join(SRC, 'shared', 'useNarrow.js');

// A COMPARISON against innerWidth — `window.innerWidth < 768`, `>= bp`. Reading the raw number for
// arithmetic is a different thing and stays legal: CakeDesigner positions popups against the
// viewport, and the storefront measures its own CONTAINER via ResizeObserver, which is better than
// either. Only the yes/no question is centralised.
const COMPARISON = /window\.innerWidth\s*(<|>|<=|>=)/;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (/\.(jsx?|mjs)$/.test(name) && !name.endsWith('.test.jsx')) files.push(full);
  }
})(SRC);

const offenders = [];
for (const file of files) {
  if (file === HOME) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (line.trim().startsWith('//')) return;              // a comment ABOUT the rule is not a breach
    if (COMPARISON.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
  });
}

if (offenders.length) {
  console.error('✗ check:narrow — window.innerWidth compared outside shared/useNarrow.js:\n');
  for (const o of offenders) console.error(`   ${o}`);
  console.error('\n   Use `useNarrow(breakpoint)` from src/shared/useNarrow.js. It is SSR-safe and');
  console.error('   reads the width in the state initialiser, so the narrow branch renders on the');
  console.error('   first paint — which is also the only way renderToStaticMarkup can test it.');
  console.error('   Reading innerWidth as a NUMBER for layout maths is fine; comparing it is not.');
  process.exit(1);
}

console.log(`✓ check:narrow — one definition of "is this a phone" (${files.length} files)`);
