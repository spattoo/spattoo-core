#!/usr/bin/env node
// ── A size control obeys the row, never a number in this file ───────────────────────────────────
//
// `placement_config.scale { min, max, step }` is authored in admin's Manage Elements and is the
// only statement of how big an element may be. A card that writes its own bounds silently ignores
// it: the admin sets a range, the customer gets a different one, and nothing anywhere disagrees out
// loud.
//
// ⚠️ THIS IS THE THIRD TIME. INVARIANTS #5b already records two: "a hand-rolled slider once
// hard-coded 0.25–3.0 and silently ignored config; the old canvas handle did the same." Sandeep,
// finding it again on the balloon: *"size control of the balloon, should be driven by the size
// settings from admin (manage elements). add a gate to this."* A rule written down three times and
// broken three times is a rule that needs a gate rather than another paragraph.
//
// ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
// A dial row entry whose key is `scale` or `hugMul` — the two fields that carry size, per #5b —
// must take its min and max from an EXPRESSION, not from numeric literals. `scaleRangeOf` resolves
// the row against a default; `stickerSizeControl` wraps that for stickers. Either is fine. What is
// not fine is `['Size', 'scale', 0.4, 2.0, …]`, because those two numbers are the whole bug.
//
// ⚠️ IT CANNOT CHECK THAT THE EXPRESSION IS THE RIGHT ONE, and does not pretend to. A caller could
// pass a variable holding 0.4 and pass. What it stops is the specific shape the fault has taken
// every time: two literals written at the call site.
//
// ── THE BASELINE ────────────────────────────────────────────────────────────────────────────────
// Two controls predate this and are listed below with the date, the way check:studio-scene lists
// its 22. Visible debt that only shrinks — never a silent waiver. Fixing one means deciding what a
// cloud's and a rainbow's authored range should be, which is a product decision rather than a
// rename, so they are left until somebody makes it.
//
// Run via `npm run check:element-size` (in `npm run verify`).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['src/designer/CakeDesigner.jsx'];

/* Baselined 2026-10-07. Each entry is the control's label and the card it sits in — not a line
   number, which would rot on the next edit above it. */
const BASELINE = new Set([
  'cloud:Size',     // renderCloudBody — 0.4–2.0
  'rainbow:Size',   // renderRainbowBody — 0.4–1.8
]);

// Which card body a line sits in, so a finding names something a human can open.
function cardAt(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(/function render([A-Za-z]+)Body\s*\(/);
    if (m) return m[1].replace(/^[A-Z]/, c => c.toLowerCase());
  }
  return '(unknown card)';
}

const problems = [];
let checked = 0;

for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // A dial row entry: [ 'Label', 'scale'|'hugMul', min, max, … ]
    const m = line.match(/\[\s*'([^']+)'\s*,\s*'(scale|hugMul)'\s*,\s*([^,]+),\s*([^,]+),/);
    if (!m) return;
    checked++;
    const [, label, field, min, max] = m;
    const literal = (v) => /^-?\d+(\.\d+)?$/.test(v.trim());
    if (!literal(min) || !literal(max)) return;        // comes from an expression — fine
    const key = `${cardAt(lines, i)}:${label}`;
    if (BASELINE.has(key)) return;
    problems.push({ rel, line: i + 1, key, field, min: min.trim(), max: max.trim() });
  });
}

if (problems.length) {
  console.error('✗ check:element-size — a size control carries its own bounds:\n');
  for (const p of problems) {
    console.error(`   • ${relative(ROOT, join(ROOT, p.rel))}:${p.line}  ${p.key}`);
    console.error(`     '${p.field}' is bounded ${p.min}–${p.max}, written here.`);
    console.error("     placement_config.scale {min,max,step} in Manage Elements is the only");
    console.error('     statement of how big this element may be, and these two numbers ignore it.');
    console.error('     Resolve it with scaleRangeOf(element, …) — or stickerSizeControl for a');
    console.error('     sticker — and bake the result onto the instance when it is placed.\n');
  }
  console.error('   Why this is a gate: the admin sets a range, the customer gets a different one,');
  console.error('   and nothing disagrees out loud. INVARIANTS #5b has recorded it twice already.');
  process.exit(1);
}

console.log(`✓ check:element-size — ${checked} size control(s) read their bounds from the element row `
          + `(${BASELINE.size} baselined)`);
