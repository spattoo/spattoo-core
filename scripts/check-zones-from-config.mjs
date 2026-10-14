#!/usr/bin/env node
/* ── A card may not decide WHERE an element goes ─────────────────────────────────────────────────
 *
 * INVARIANTS #1 says behaviour flows from data and keys, never from a branch on a name, and every
 * row carries `allowed_zones` for exactly this. Sandeep, after finding a fourth card ignoring it:
 * *"we already have invariant to honor the config but surprisingly many times its missing."*
 *
 * That is the shape of a rule that needs a GATE rather than another paragraph — the root CLAUDE.md
 * says so itself: "If a rule cannot be written as a trigger, it belongs in a gate, not here." The
 * failures are never deliberate. Somebody writes four placement buttons because four placements are
 * what the thing does, and the row that already says which four is three files away.
 *
 * THE RULE: a surface that offers a baker a CHOICE OF ZONE must consult `allowed_zones`. The zone
 * vocabulary is shared and small, so "a choice of zone" is findable: a file that mentions two or
 * more zone names in its UI and never reads `allowed_zones` is deciding placement by itself.
 *
 * ⚠️ IT CANNOT SEE EVERYTHING, and says so rather than implying otherwise. A card that hardcodes
 * ONE zone looks identical to a card whose element only has one. What it catches is the case that
 * has actually happened four times: a menu of placements written out by hand.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/* The zone names as they appear in UI code — ZONES.X or the string itself. */
const ZONE_TOKENS = [
  /ZONES\.TOP_SURFACE|'top_surface'|"top_surface"/,
  /ZONES\.SIDE\b|'side'|"side"/,
  /ZONES\.BOARD\b|'board'|"board"/,
  /ZONES\.RIM\b|'rim'|"rim"/,
];

/* ⚠️ NAMED FILES, NOT A PATTERN. Only a few surfaces offer a baker a choice of zone, and listing
 * them is honest about what this gate covers — a pattern over `src/` would sweep in the renderer,
 * the seat system and the placement maths, which all speak zones for other reasons. A new card that
 * offers placements adds its name here; that line IS the rule being applied. */
const PLACEMENT_SURFACES = [
  'src/designer/CakeDesigner.jsx',
];

const bad = [];
for (const rel of PLACEMENT_SURFACES) {
  let text;
  try { text = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  const zones = ZONE_TOKENS.filter(re => re.test(text)).length;
  if (zones < 2) continue;
  if (!/allowed_zones/.test(text)) {
    bad.push({ rel, zones });
  }
}

if (bad.length) {
  console.error('\n✗ check:zones-from-config — a surface offers a choice of zone and never asks the row:\n');
  for (const b of bad) console.error(`  ${b.rel}  (mentions ${b.zones} zones, reads allowed_zones: no)\n`);
  console.error('  Every element row carries `allowed_zones`. A card that writes its own list of');
  console.error('  placements shows a baker somewhere the catalogue never allowed — and an admin who');
  console.error('  restricts an element finds the restriction had no effect (INVARIANTS #1).\n');
  process.exit(1);
}
console.log(`✓ check:zones-from-config — ${PLACEMENT_SURFACES.length} placement surface(s) read allowed_zones`);
