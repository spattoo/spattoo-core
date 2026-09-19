#!/usr/bin/env node
// ── One chevron, drawn once ──────────────────────────────────────────────────────────────────────
//
// INVARIANTS #14: an icon means the same thing everywhere. The chevron that means "this opens
// something" is `ChevronRightIcon` in `shared/icons.jsx`. It was a literal `›` in four places —
// TopUpsSection, CustomersPanel, BuyCreditsPanel's pack rows and the storefront gallery — each with
// its own size, weight and colour, which is how one promise ends up looking like four.
//
// ⚠️ A TEXT GLYPH IS WORSE THAN A DUPLICATED SVG. `›` inherits whatever font is loaded, so the same
// mark literally changed SHAPE between screens, and no amount of matching the font-size fixes it.
//
// ── WHY THIS GATE AND NOT A BROADER ONE ─────────────────────────────────────────────────────────
// The first proposal was to fail on interaction states (`:hover` / `:active` / `:focus-visible`)
// defined outside `src/shared/`, on the theory that it would have caught `NavRow` being written while
// `.spattoo-pack` already existed. Looking at the four real cases refuted it: the storefront CTA is
// themed from the BAKER's palette, the rail menu needs `!important` to beat inline styles, and the
// pack tile is a billing surface. None is a duplicate of a shared component; all four are per-surface
// CSS that cannot live in `shared/`. A gate that fires on four legitimate cases gets switched off,
// and then it protects nothing. Narrow and true beats broad and ignored.
//
// Run via `npm run check:one-chevron` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const HOME = 'src/shared/icons.jsx';          // where the one chevron lives

/* ── Chevrons that are NOT "this opens something", and why ───────────────────────────────────────
 *
 * A carousel arrow is a different job: it moves along a list in place, it comes in a left/right
 * PAIR, and it sits on the thing it scrolls rather than at the end of a row. Same glyph, different
 * meaning — which is its own mild breach of #14 and worth fixing the day either grows a second
 * copy, but converting them is a carousel change, not an icon one.
 */
const ACCEPTED = {
  'src/storefront/CustomerStorefront.jsx': 'gallery carousel arrow — scrolls a strip, not a disclosure',
  'src/chefsdesk/a4/A4Sheet.jsx':          'sheet carousel arrow — scrolls a strip, not a disclosure',
};

/* ⚠️ COMMENTS DO NOT COUNT. Every file that stopped using `›` EXPLAINS that it stopped, quoting the
   glyph — which is how this codebase documents itself. An earlier gate written this morning matched
   text anywhere in the file and passed happily while the real call was commented out. */
const codeOnly = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')     // JSX comment blocks
  .replace(/\/\*[\s\S]*?\*\//g, '')               // block comments
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

// A raw chevron: the text glyph, its entity, or a hand-drawn path of the same mark.
const RAW = /›|&rsaquo;|&#8250;|[mM]\s?9[ ,]1[68][ ,]?l?\s?6[ ,-]-?6/;

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const problems = [];
let scanned = 0;

for (const file of walk(SRC)) {
  if (!/\.jsx?$/.test(file) || /\.test\./.test(file)) continue;
  const rel = relative(ROOT, file);
  if (rel === HOME || ACCEPTED[rel]) continue;
  scanned++;
  const code = codeOnly(readFileSync(file, 'utf8'));
  for (const [i, line] of code.split('\n').entries()) {
    if (RAW.test(line)) problems.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
  }
}

// An accepted file that no longer draws one is a reason nobody has to honour any more.
const stale = Object.keys(ACCEPTED).filter((f) => {
  try { return !RAW.test(codeOnly(readFileSync(join(ROOT, f), 'utf8'))); } catch { return true; }
});

if (problems.length || stale.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  for (const f of stale) console.error(`✗ ${f} is in the accepted list but draws no chevron — remove the entry.`);
  if (problems.length) {
    console.error('\n   Use ChevronRightIcon from shared/icons.jsx. A "›" takes whatever font is loaded,');
    console.error('   so the same mark changes shape between screens — and a row that opens something');
    console.error('   probably wants shared/NavRow.jsx rather than a hand-built row (rule 7).');
    console.error('   If it genuinely means something else, add it to ACCEPTED here WITH the reason.');
  }
  process.exit(1);
}

console.log(`✓ check:one-chevron — one chevron, drawn once (${scanned} files; `
  + `${Object.keys(ACCEPTED).length} carousel arrows named)`);
