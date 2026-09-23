#!/usr/bin/env node
// ── One source for a control's colour, enforced ──────────────────────────────────────────────────
//
// Sandeep, 2026-09-20: "i am worried button color is not coming from one source. it should be."
// It was not. `#1a1a1a` appeared 108 times in CakeDesigner.jsx alone, and four separate "make it a
// standard" fixes that evening each added another literal rather than removing one.
//
// src/shared/tokens.js is now that source. This gate is what keeps the sentence TRUE: it fails when
// a raw hex duplicates a value the token module already defines.
//
// ⚠️ WHY A GATE AND NOT A CONVENTION. A half-converted token module is worse than none — it reads as
// one source while drifting silently, so editing the token appears to work and quietly misses every
// literal left behind. The convention was already written down three times today; it lost to typing
// the hex again each time. A gate is the only version of this rule that survives being tired.
//
// ⚠️ WHAT THIS DOES NOT DO: it is not "no hex codes in the codebase". A cake's gold, a buttercream's
// cream, an HDRI cast, a 3D handle's marker tint — those are colours with a meaning in the CAKE, and
// forcing them through a UI token would be wrong. Only the exact values tokens.js claims are policed.
//
// Run via `npm run check:tokens` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const TOKENS = 'src/shared/tokens.js';

/* Files that legitimately hold one of these values for a NON-UI reason. Each needs a stated reason;
   an entry without one is how an exemption list becomes a dumping ground. */
const ACCEPTED = {
  'src/shared/tokens.js': 'the source itself',
  'src/designer/canvas/FinishHandles.jsx': 'selColor is a 3D handle marker ON the cake, not chrome',
  'src/designer/canvas/CakeCanvas.jsx': 'marker tints passed to the scene, not UI',
  /* ⚠️ A REAL GEL COLOUR, not ink. gelLibrary is a catalogue of what a baker can BUY — Americolor
     "Super Black" happens to be #1A1A1A, and forcing it through INK would tie a product's measured
     colour to the app's text colour. Change the token and the gel would silently change too. This
     is the exact case the token module's header describes. */
  'src/orders/xray/gelLibrary.js': 'a purchasable gel colour, measured — not UI ink',
  /* ⚠️ THE SAME CASE AS gelLibrary ABOVE, and the gate's own message offers both paths — import the
     token, or state a reason. Here the reason decides it. `ink` is the colour of the NUMBERS ON A
     CAKE: piping gel through a writing tip, or printer ink on an edible sheet. It is not the app's
     text colour that happens to look similar. Importing INK would tie what a customer's calendar is
     piped in to a UI value tuned for contrast on a white panel — retune INK for a chrome reason and
     every calendar already on a cake silently changes pigment. `accent` and `paper` are artwork for
     the same reason and collide with no token at all. */
  'src/designer/shared/textures/calendarArt.js': 'piping gel / printer ink ON the cake, not UI ink',
};

// Values the module defines, read FROM the module so the gate can never disagree with it.
const tokenSrc = readFileSync(join(ROOT, TOKENS), 'utf8');
/* ⚠️ NOT EVERY TOKEN IS POLICED, and SURFACE is the reason the list exists. Enforcing '#ffffff'
   flagged TIER_COLORS — a CAKE colour, one of the four tiers a baker picks — which is exactly the
   case this file's own header says must never be forced through a UI token. White is too common a
   value to police: it means "the field under a control" here and "the icing" three lines away.
   INK and the DANGER family are unambiguous: nothing on a cake is #e53935 by coincidence. */
const NOT_POLICED = new Set(['SURFACE', 'INK_TINT', 'INK_MUTED', 'LINE']);

const VALUES = [...tokenSrc.matchAll(/export const (\w+)\s*=\s*'([^']+)'/g)]
  .map(([, name, value]) => ({ name, value }))
  .filter(t => /^#|^rgba?\(/.test(t.value))
  .filter(t => !NOT_POLICED.has(t.name));

/* ⚠️ COMMENTS DO NOT COUNT, and the order of the two strips matters — taking `{/* … *​/}` out first
   eats every plain block comment in between (proven in verifyStep.test.jsx, 2026-09-19). Plain
   block comments first covers JSX ones too. The token file documents the retired green BY NAME, and
   every converted call site explains itself; neither is a violation. */
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const problems = [];
let scanned = 0;

for (const file of walk(SRC)) {
  if (!/\.jsx?$/.test(file) || /\.test\./.test(file)) continue;
  const rel = relative(ROOT, file);
  if (ACCEPTED[rel]) continue;
  scanned++;
  const code = codeOnly(readFileSync(file, 'utf8'));
  for (const [i, line] of code.split('\n').entries()) {
    for (const { name, value } of VALUES) {
      // Case-insensitive: '#FFF0F0' is the same colour as '#fff0f0' and the same mistake.
      if (new RegExp(value.replace(/[()]/g, '\\$&'), 'i').test(line)) {
        problems.push(`${rel}:${i + 1}  ${value} → use ${name}\n      ${line.trim().slice(0, 96)}`);
      }
    }
  }
}

if (problems.length) {
  console.error(`✗ check:tokens — ${problems.length} raw value(s) that shared/tokens.js already defines:\n`);
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  if (problems.length > 40) console.error(`\n  …and ${problems.length - 40} more.`);
  console.error(`\n  Import the name from '../shared/tokens.js' instead of retyping the value.`);
  console.error(`  A colour that means something in the CAKE (a gold, a cream, a 3D marker) is not a`);
  console.error(`  token — if that is what this is, add the file to ACCEPTED in this script WITH the reason.`);
  process.exit(1);
}

console.log(`✓ check:tokens — every control colour comes from one source `
  + `(${VALUES.length} tokens, ${scanned} files, ${Object.keys(ACCEPTED).length} named exceptions)`);
