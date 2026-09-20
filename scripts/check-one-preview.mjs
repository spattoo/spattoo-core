#!/usr/bin/env node
// ── One piping preview, derived once ─────────────────────────────────────────────────────────────
//
// The piping card shows a candidate ring TWICE: as a tile in the row at the top, and as the controls
// below for whichever ring is selected. For an afternoon those were two hand-copied copies of the
// same forty lines — `p`, colour, size, placement, glb — and the failure they invite is the worst
// kind: a preview that quietly disagrees with the controls beneath it. Nothing errors. Nothing is
// slow. A baker recolours what they think is the rim and the board changes.
//
// ⚠️ NO GATE CAN SEE THAT BY COMPARING TWO COPIES. The only reliable answer is to have one, so this
// gate does not check the derivations match — it checks there is only one place that can derive.
// `ringView()` in CakeDesigner.jsx is that place.
//
// ── WHY <PipingPreview> IS THE THING COUNTED ────────────────────────────────────────────────────
// It is the render, so it is downstream of every input that could drift: placement, colour, size,
// arrangement, instances. A second one cannot appear without a second derivation feeding it, and a
// second derivation is useless without a render. Counting the component is narrower and truer than
// counting `pipingPlacementFromConfig(` — that helper is legitimately called five times elsewhere
// (stamp rotation, applying a layer, the overlap solver), and a gate that fires on five legitimate
// cases gets switched off, which is the lesson check-one-chevron.mjs already records at length.
//
// ⚠️ COMMENTS DO NOT COUNT — the same trap check:one-chevron hit. This file, and the comments in
// CakeDesigner.jsx that explain the rule, both name the component while not rendering it.
//
// Run via `npm run check:one-preview` (in `npm run verify`).

import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/designer/CakeDesigner.jsx';
const HOME = 'ringView';

const lines = readFileSync(join(ROOT, FILE), 'utf8').split('\n');
const hits = [];
let inBlockComment = false;
lines.forEach((line, i) => {
  const t = line.trim();
  if (inBlockComment) { if (t.includes('*/')) inBlockComment = false; return; }
  if (t.startsWith('/*')) { if (!t.includes('*/')) inBlockComment = true; return; }
  if (t.startsWith('//') || t.startsWith('*')) return;
  if (line.includes('<PipingPreview')) hits.push(`${FILE}:${i + 1}  ${t.slice(0, 90)}`);
});

if (hits.length > 1) {
  console.error(`✗ check:one-preview — <PipingPreview> is rendered from ${hits.length} places:\n`);
  for (const h of hits) console.error(`   ${h}`);
  console.error(`\n   A piping ring must be derived in ONE place — ${HOME}() in ${FILE} — and rendered`);
  console.error('   from one. Two derivations is how a preview and the controls beneath it end up');
  console.error('   describing different rings, with nothing to report it: no test mounts this card,');
  console.error('   and no gate can compare a 3D render to the controls that claim to drive it.');
  console.error('\n   Render the tile from the value ringView() returns, or widen ringView() so both');
  console.error('   surfaces can share it. Do not copy the forty lines again.');
  process.exit(1);
}

if (hits.length === 0) {
  console.error(`✗ check:one-preview — no <PipingPreview> found in ${FILE}.`);
  console.error('   Either the card stopped rendering a preview, or it moved to another file and this');
  console.error('   gate now guards nothing. Point FILE at its new home rather than deleting this.');
  process.exit(1);
}

console.log(`✓ check:one-preview — one piping preview, derived once (${HOME})`);
