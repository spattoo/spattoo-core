#!/usr/bin/env node
// ── A LIST of previews is a scrolling ROW, never a stack ────────────────────────────────────────
//
// Sandeep, on the composed-element card at phone width: *"see the mobile view, preview taking lot
// of space. for most of the elements preview is a horizontal scrollable row. pls make the same here
// also. its difficult to validate each control like this. can we have a gate for this? like
// previews should be on horizontal scrollable row for atleast in mobile view?"*
//
// ⚠️ THE COST IS NOT THE TILE, IT IS THE COLUMN. A cake preview uses the middle ~40% of its tile,
// so a full-width one is mostly grey — and three of them stacked cost ~390px of a phone, which puts
// every control BELOW them off the bottom of the sheet. That is the reported harm: not that it
// looks wasteful, but that you cannot reach the thing you came to adjust. `s.previewRow` +
// `s.previewTile` inside a `ScrollFadeRow` costs ~120px for the same three cakes, and the row says
// it scrolls (a fade and an arrow, which ScrollFadeRow derives rather than being told).
//
// This exact fix had already been made once — `PlacementChooser`, in the same file, carries the
// reasoning in full ("the tile was full-width while the cake inside it used the middle ~40%") — and
// the pattern card next door still stacked. One surface learning a lesson the one beside it does not
// is what a gate is for.
//
// ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
// A `.map(` that renders a preview component must sit in a container that does not stack: either a
// `ScrollFadeRow` (the card pattern) or a responsive grid (`auto-fill`/`auto-fit` minmax). Previews
// are the components that draw a cake into a tile: TopperPreview, PreviewTile, PipingPreview,
// CakePreview.
//
// ⚠️ A GRID PASSES, AND WORKING THAT OUT IS WHAT MADE THE RULE TRUE. The first draft demanded a
// ScrollFadeRow and immediately flagged `MyDecorationStudio`'s "Where can it go?" tiles — which are
// a `repeat(auto-fill, minmax(120px, 1fr))` grid on a FULL SCREEN, two or three to a row, with
// checkboxes. That is not the harm: the harm is a single full-width COLUMN, where each tile is
// mostly grey and the controls end up below the fold. Baselining it would have carried an exception
// for correct code, which is how a gate starts being argued with. The rule is "do not stack", not
// "use this component".
//
// ⚠️ A `.map`, NOT A SINGLE PREVIEW. One preview is a picture of the thing being edited — the Save
// as Template panel's thumbnail, a studio's stage — and putting it in a scroller would be absurd.
// The rule is about a LIST: several tiles the customer compares, which is the only shape that
// stacks into a wall.
//
// ⚠️ AND IT IS A SMELL DETECTOR, like check:movable's grep half and check:placement-slots. It reads
// text, not a render tree: a map assigned to a variable first, or a row opened in another function,
// is invisible to it. It says so rather than claiming proof.
//
// ── THE BASELINE ────────────────────────────────────────────────────────────────────────────────
// Entries are `file:nearest-identifier`, never a line number, which rots on the next edit above it.
// A baselined entry is debt that only shrinks: this prints any entry that has since been fixed so
// the line can be deleted.
//
// Run via `npm run check:preview-rows` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/* ⚠️ CHOOSER TILES, NOT "anything that draws a cake". `PipingPreview` and `CakePreview` were in
   this list and the gate immediately blamed the piping ACCORDION — a map over collapsible cards,
   each of which happens to contain a preview. Stacking those vertically is what an accordion is;
   there is nothing to lay side by side. The shape this rule is about is a row of TILES a customer
   compares, and those are `PreviewTile` (the shared chooser tile) and the `TopperPreview` the
   placement choosers draw into one. */
const PREVIEWS = /<(TopperPreview|PreviewTile)\b/;
const ROW = /<ScrollFadeRow\b/;
// A container that cannot become a wall: it scrolls sideways, or it is a grid that fits tiles to
// the width. Either way the tiles stay tile-sized.
const SPREADS = /overflowX\s*:\s*['"]auto['"]|gridTemplateColumns[^\n]*(auto-fill|auto-fit)/;
// How far above the map to look for the container that wraps it. A JSX block between the two is
// normally a line or two; 12 allows a comment and a conditional without reaching the control above.
const LOOKBACK = 12;

const BASELINE = new Set([]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx$/.test(name) && !/\.test\.jsx$/.test(name)) out.push(full);
  }
  return out;
}

/* The text of the `.map( … )` that starts on line `i`, by counting parentheses from its opening
   one. Quotes and comments are not parsed — a stray bracket inside a string would end it early,
   which costs a missed finding rather than a false one, and no line in this codebase does it. */
function mapBody(lines, i) {
  const from = lines[i].indexOf('.map(');
  if (from < 0) return lines[i];
  let depth = 0, out = [];
  for (let n = i; n < Math.min(lines.length, i + 400); n++) {
    const line = lines[n];
    const start = n === i ? from + 4 : 0;       // the '(' of .map(
    out.push(line);
    for (let c = start; c < line.length; c++) {
      if (line[c] === '(') depth++;
      else if (line[c] === ')') { depth--; if (depth === 0) return out.join('\n'); }
    }
  }
  return out.join('\n');
}

function fnAt(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(/function\s+([A-Za-z0-9_]+)\s*\(/);
    if (m) return m[1];
  }
  return '(top level)';
}

const problems = [];
const seen = new Set();
let scanned = 0, rows = 0;

for (const full of walk(SRC)) {
  const rel = relative(SRC, full);
  const lines = readFileSync(full, 'utf8').split('\n');
  scanned++;
  lines.forEach((line, i) => {
    if (!/\.map\(/.test(line)) return;
    /* Does this map render a preview? Read the map's OWN body, bounded by its parentheses.
       ⚠️ A FIXED WINDOW IS WRONG IN BOTH DIRECTIONS, and both were tried. At 8 lines the gate did
       not catch the card it was written for — a map body opens with a comment and two `const`s
       before any JSX, so the `<TopperPreview` sat twelve lines down and the window stopped short.
       It PASSED on the broken file, which is the one failure a gate must not have: not merely
       useless, but evidence that the thing is fine. Widened to 30 it then spilled past the end of
       short maps and blamed `kinds.map(k => <button>)` for the preview block underneath it — a
       gate crying wolf on correct code, which is how exemptions start. Matching the parenthesis is
       neither: it reads exactly the map and nothing else. */
    const body = mapBody(lines, i);
    if (!PREVIEWS.test(body)) return;
    /* ⚠️ THE PREVIEW MAY BELONG TO AN INNER MAP. The piping accordion is a map over collapsible
       CARDS, and deep inside one of them is a properly-wrapped row of ring tiles — so the outer map
       "contains a preview" and was blamed for a row that already exists two levels down. A body
       that opens its own ScrollFadeRow has already answered this rule; the map that matters is the
       innermost one, and this is the cheap way to say so. */
    if (ROW.test(body)) return;
    rows++;
    const above = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n');
    if (ROW.test(above) || SPREADS.test(above)) return;
    /* The container may name a style instead of writing one: `<div style={S.zones}>`. Resolve the
       key against this file's own style object — they are one-line entries — rather than giving up,
       because "the style is in a variable" is the normal way this file is written, not an edge. */
    const named = [...above.matchAll(/style=\{\s*[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*\}/g)]
      .map(m => m[1]);
    if (named.some(k => {
      const decl = lines.find(l => new RegExp(`^\\s*${k}\\s*:\\s*\\{`).test(l));
      return decl && SPREADS.test(decl);
    })) return;
    const key = `${rel}:${fnAt(lines, i)}`;
    seen.add(key);
    if (BASELINE.has(key)) return;
    problems.push({ rel, line: i + 1, key });
  });
}

const fixed = [...BASELINE].filter(k => !seen.has(k));

if (problems.length) {
  console.error('✗ check:preview-rows — a list of previews is stacked, not scrolling:\n');
  for (const p of problems) {
    console.error(`   • src/${p.rel}:${p.line}  in ${p.key.split(':')[1]}`);
    console.error('     Several preview tiles in a column. A cake uses the middle ~40% of its tile,');
    console.error('     so stacked full-width they are mostly grey — and on a phone they push the');
    console.error('     controls below them off the bottom of the sheet, which is the actual harm.');
    console.error('     Wrap the map in <ScrollFadeRow style={s.previewRow} fade="255,255,255">');
    console.error('     and give each tile s.previewTile (+ s.previewTileOn when selected).');
    console.error('     PlacementChooser in CakeDesigner.jsx is the worked example.\n');
  }
  console.error('   One preview is fine — this only fires on a .map, which is a list to compare.');
  process.exit(1);
}

if (fixed.length) {
  console.log('✓ check:preview-rows — and these baselined entries are fixed, delete them:');
  for (const k of fixed) console.log(`   · ${k}`);
}
console.log(`✓ check:preview-rows — every list of previews scrolls sideways `
          + `(${rows} found, ${scanned} files, ${BASELINE.size} baselined)`);
