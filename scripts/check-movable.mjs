#!/usr/bin/env node
//
// ── A dragged decoration signs the movable contract ─────────────────────────────────────────────
//
// Four decorations are dragged on the cake, and in one week two of them broke six different ways:
// a cloud that moved on one axis, a cloud that shrank as it was dragged, a rainbow whose selection
// border stood where the rainbow was not, a rainbow whose drag was dead over 71% of the cake top, a
// cloud nothing would grab, and three grab planes that could not be hit from behind.
//
// Every one was found by the person using it. None was exotic — they are four mistakes, repeated.
// `movableContract` asks about them mechanically; this makes answering non-optional.
//
// ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
//   1. Every MOVABLE procedural tool has a movableContract() registration.
//      Read from PROCEDURAL_TOOLS in CakeDesigner, so adding a tool and forgetting the contract
//      fails here rather than in front of a customer six weeks later.
//   2. No grab plane is single-sided. A plane's default is FrontSide, so the decoration silently
//      stops being a drag target once the cake is turned past it — which is what "the number topper
//      does not move" was.
//   3. No SelectionBox group carries its own rotation=. That is law 1's smell: a second copy of the
//      renderer's transform, and the copy drifts. It is what detached the rainbow's border.
//
// ── WHAT IT CANNOT CHECK ────────────────────────────────────────────────────────────────────────
// Law 1 properly — that geometry returns world-space points and nothing downstream adds to them.
// That is structural, not textual, and the rainbow does not satisfy it yet: `rainbowBands` returns
// the arch in its own frame and RainbowArch spins it. `rainbowPlacedPoints` is the one shared
// answer for everything BUT the renderer, which leaves exactly one copy left to remove.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');

const problems = [];

// ── 1. Every movable tool is registered ─────────────────────────────────────────────────────────
// Tools that are NOT dragged. A surface treatment covers a thing rather than sitting on it, so
// there is no position to move and nothing for the contract to ask about. Kept as an explicit list
// with a reason each, because "it does not apply" is a claim somebody should have to write down.
const NOT_DRAGGED = {
  grass: 'a treatment that covers the top — it has no position of its own',
  letter_blocks: 'placed as a row along the cake, positioned by the row and not by a drag',
};

const designer = read('src/designer/CakeDesigner.jsx');
const block = designer.match(/const PROCEDURAL_TOOLS = \{([\s\S]*?)\n {2}\};/);
if (!block) {
  console.error('✗ check:movable — could not find PROCEDURAL_TOOLS in CakeDesigner.jsx.');
  console.error('  If it moved or was renamed, update this guard rather than deleting it.');
  process.exit(1);
}
// Keys only: strip comments first, or a tool named in prose reads as a registration.
const tools = [...block[1].replace(/\/\/[^\n]*/g, '').matchAll(/^\s*([a-z_][\w]*)\s*:/gm)]
  .map(m => m[1]);

const testSrc = readdirSync(join(ROOT, 'src/designer/geometry'))
  .filter(f => f.endsWith('.test.js'))
  .map(f => read(join('src/designer/geometry', f)))
  .join('\n');
const registered = new Set(
  [...testSrc.matchAll(/movableContract\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));

for (const t of tools) {
  if (NOT_DRAGGED[t] || registered.has(t)) continue;
  problems.push({
    what: `\`${t}\` is a procedural tool with no movableContract() registration`,
    fix: 'Register it in a *.test.js under src/designer/geometry — or, if it genuinely is not\n'
       + '     dragged, add it to NOT_DRAGGED in this script WITH the reason.',
  });
}

// ── 2. No single-sided grab plane ───────────────────────────────────────────────────────────────
// A grab plane is an invisible mesh: transparent, opacity 0, no depth write. Its material must say
// DoubleSide or half the camera angles cannot hit it.
const canvasDir = 'src/designer/canvas';
for (const f of readdirSync(join(ROOT, canvasDir)).filter(x => x.endsWith('.jsx'))) {
  const src = read(join(canvasDir, f));
  // Only OPEN surfaces. A sphere or a cylinder is closed, so it is hit from wherever you look at
  // it and its side makes no difference; a plane and a circle have a back that is not there.
  for (const m of src.matchAll(
      /<(?:plane|circle)Geometry[\s\S]{0,300}?<meshBasicMaterial\b[^>]*opacity=\{0\}[^>]*\/>/g)) {
    if (!/DoubleSide/.test(m[0])) {
      problems.push({
        what: `${canvasDir}/${f} has an invisible grab material that is not DoubleSide`,
        fix: 'Add side={THREE.DoubleSide}. Without it the decoration stops being a drag target\n'
           + '     the moment the cake is turned past it, with nothing on screen to explain why.',
      });
    }
  }
  // ── 3. No SelectionBox group carrying its own rotation ────────────────────────────────────────
  for (const m of src.matchAll(/<group[^>]*\brotation=[^>]*>\s*(?:\{[^}]*\}\s*)?<SelectionBox/g)) {
    problems.push({
      what: `${canvasDir}/${f} rotates a SelectionBox group directly`,
      fix: 'Take the box from the decoration\'s own placed points instead. A rotation here is a\n'
         + '     second copy of the renderer\'s transform, and the copy drifts — it is what put the\n'
         + '     rainbow\'s border somewhere the rainbow was not.',
    });
  }
}

if (!problems.length) {
  console.log(`✓ check:movable — ${tools.length - Object.keys(NOT_DRAGGED).length} dragged `
    + `decoration(s) under contract; no single-sided grab planes; no hand-rolled box transforms`);
  process.exit(0);
}

console.error('✗ check:movable — a dragged decoration is not under contract.\n');
console.error('  These are the mistakes that shipped six times in one week. See');
console.error('  src/designer/geometry/movableContract.js for what a registration looks like.\n');
for (const p of problems) console.error(`   • ${p.what}\n     → ${p.fix}\n`);
process.exit(1);
