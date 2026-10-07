#!/usr/bin/env node
// ── Where an element may go is answered ONCE, by placementSlots ─────────────────────────────────
//
// `allowed_zones` is authored in admin's Manage Elements. `placementSlots(element, tierCount)` is
// the one function that turns it into the places an element may actually occupy: a side slot PER
// TIER, the board as a single cake-wide slot, the rim per tier, the top on the top tier. Every
// surface that offers the customer a choice of placement is supposed to ask it.
//
// ⚠️ TWO SURFACES DID NOT, AND BOTH LOST A TIER. The composed-element (pattern) card read
// `allowed_zones` itself and pushed exactly two tiles — Top, and one Side hard-coded to tier 0. An
// element ticked for top, side AND middle tier therefore offered no middle tier on the cake, and
// `rim` and `board` were dropped silently because the hand-written list had no branch for them.
// Sandeep, on a two-tier cake: *"in admin i configured it for top, side and middle tier. however it
// does not show on the middle tier."* And: *"i am seeing multiple gaps like this recently —
// placement config is not honored in rendering logic. add a gate here as well."*
//
// ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
// No WALL slot is built by hand: no `push({ … zone: ZONES.SIDE | ZONES.MIDDLE_TIER … tierIndex … })`
// outside `placement.js`, which owns the derivation.
//
// ⚠️ THE WALL SPECIFICALLY, and the narrowing is deliberate rather than lazy. A cake has ONE board
// and ONE top surface, so a single slot for either is correct and a gate that failed them would be
// noise. A WALL is per tier — that is the whole shape of the bug — so a wall slot written out by
// hand is the thing that cannot be right. The first draft of this gate flagged any
// `push({ zone, tierIndex })` and immediately caught the piping card, which is a FALSE POSITIVE:
// piping has its own vocabulary (rim and board, with room checks and a board-zone trick for upper
// tiers that placementSlots does not model) and it already loops every tier. A gate that cries
// wolf on correct code teaches people to add exemptions, which is how a gate dies.
//
// What it cannot see: a push split across several lines, or a slot assembled into a variable first.
// It is a smell detector, like check:movable's grep half, and says so rather than claiming proof.
//
// ── THE BASELINE ────────────────────────────────────────────────────────────────────────────────
// The scatter card has the same shape and the same missing tier, but fixing it is not a rename: a
// scatter set is grouped by SURFACE ('top' / 'side'), so per-tier slots change what a group means
// and how a set is re-seated. Listed with the date — visible debt that only shrinks, never a silent
// waiver — the way check:element-size lists its two.
//
// Run via `npm run check:placement-slots` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

// placement.js IS the definition; it is the only file allowed to build a slot.
const OWNER = 'designer/placement.js';

/* Baselined 2026-10-07 — the scatter card's two surfaces. Each entry is `file:nearest-identifier`,
   not a line number, which would rot on the next edit above it. */
const BASELINE = new Set([
  'designer/CakeDesigner.jsx:renderScatterBody',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) out.push(full);
  }
  return out;
}

// The function a line sits in, so a finding names something a human can open.
function fnAt(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(/function\s+([A-Za-z0-9_]+)\s*\(/);
    if (m) return m[1];
  }
  return '(top level)';
}

const problems = [];
let scanned = 0, slots = 0;

for (const full of walk(SRC)) {
  const rel = relative(SRC, full);
  if (rel === OWNER) continue;
  const lines = readFileSync(full, 'utf8').split('\n');
  scanned++;
  lines.forEach((line, i) => {
    // A push of an object literal placing something on a WALL, with a tier written beside it.
    if (!/\bpush\(\s*\{/.test(line)) return;
    if (!/\btierIndex\s*:/.test(line)) return;
    if (!/\bzone\s*:\s*(ZONES\.(SIDE|MIDDLE_TIER)|['"](side|middle_tier)['"])/.test(line)) return;
    slots++;
    const key = `${rel}:${fnAt(lines, i)}`;
    if (BASELINE.has(key)) return;
    problems.push({ rel, line: i + 1, key });
  });
}

if (problems.length) {
  console.error('✗ check:placement-slots — a placement slot is built outside placementSlots:\n');
  for (const p of problems) {
    console.error(`   • src/${p.rel}:${p.line}  in ${p.key.split(':')[1]}`);
    console.error('     This builds a WALL slot by hand. A wall belongs to a TIER, so one written');
    console.error('     out here offers one tier and silently hides the rest — which is how the');
    console.error('     pattern card lost the middle tier, and the rim and board with it.');
    console.error('     placementSlots(element, tierCount) already answers this from allowed_zones,');
    console.error('     one slot per tier. Call it, and label the result with slotLabel().\n');
  }
  console.error('   Why this is a gate: an admin ticks a zone in Manage Elements and the cake does');
  console.error('   not offer it. Nothing errors, nothing logs — the tile is simply not there.');
  process.exit(1);
}

console.log(`✓ check:placement-slots — no hand-built wall slots `
          + `(${scanned} files scanned, ${BASELINE.size} baselined)`);
