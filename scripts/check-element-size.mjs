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
// ── WHAT IT CHECKS (TWO SHAPES) ─────────────────────────────────────────────────────────────────
//
// ⚠️ A FOURTH TIME, IN A SHAPE THE FIRST RULE COULD NOT SEE. An admin set a rosette's Default scale
// to 0.3 with a Size range of 0.1–0.8, placed it, and got a ring at 1.0 on a dial running 0.5–2.
// Sandeep: *"i have created a new piping element. size i configured 0.3 as default. however it does
// not honor in core render."* The piping card wrote `<SizeDial size={size} onChange={…} />` with no
// bounds at all, so the component's own 0.5–2 applied and the row reached nothing — and an authored
// default BELOW 0.5 cannot even be shown on a dial that starts there. Rule 1 looks at dial ROWS and
// is blind to a bare component, so the gate grew a second rule rather than a third paragraph.
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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every source file under src/designer, tests excluded — the gate's own reach. */
function walkDesigner(dir = join(ROOT, 'src/designer'), out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkDesigner(full, out);
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}
/* ⚠️ THE WHOLE DESIGNER, because a named file list is how the fourth piping seed hid. Three of the
   four places that seeded a ring's size lived in CakeDesigner and were fixed together; the fourth
   was the shared factory in pipingLayer.js, which this gate was not even reading — it printed a
   confident tick while vouching for one file. Sandeep found it by ASKING whether any code drove
   piping size from config at all, which a gate should have been able to answer.
   Walking the tree means the next module cannot opt out by existing. Measured before widening:
   zero new findings, once rule 3 asks whether an element row is actually in scope. */
const FILES = walkDesigner();

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
let dials = 0;
let seeds = 0;

/* Rule 2: every <SizeDial> declares its own bounds.
   A dial with no `min` silently falls back to the component's defaults, which is the exact way a
   row's authored range stops mattering. Scanned per TAG rather than per line, so a dial whose
   bounds sit on its second line is not a false positive. */
/* ⚠️ COMMENTS ARE MASKED FIRST, and the gate caught itself without it: the note explaining this
   very rule contains the words "a bare <SizeDial>", which the scanner read as a bare SizeDial. Blank
   the comment BODIES rather than deleting them, so every byte offset — and therefore every reported
   line number — still points at the real file. */
function maskComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

function sizeDialTags(rawSrc) {
  const src = maskComments(rawSrc);
  const out = [];
  let at = 0;
  for (;;) {
    const i = src.indexOf('<SizeDial', at);
    if (i < 0) break;
    const end = src.indexOf('>', i);
    out.push({ at: i, tag: src.slice(i, end < 0 ? i + 400 : end + 1) });   // masked copy
    at = i + 9;
  }
  return out;
}

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

/* Baselined 2026-10-08. Three dials drive TIER GEOMETRY — a cavity's lip, a spiral's turns and its
   rise — not an element's size, so no row's range applies to them and `scaleRangeOf` is not the
   answer. They are listed rather than exempted because their silent 0.5–2 is still a question worth
   asking: "turns" bounded between half a turn and two is unlikely to be what anyone meant. */
const DIAL_BASELINE = new Set([
  'src/designer/CakeDesigner.jsx:topCavity.lip',
  'src/designer/CakeDesigner.jsx:topSpiral.turns',
  'src/designer/CakeDesigner.jsx:topSpiral.rise',
]);

for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  for (const { at, tag } of sizeDialTags(src)) {
    dials++;
    if (/\bmin=/.test(tag)) continue;
    const line = src.slice(0, at).split('\n').length;
    const what = (tag.match(/size=\{([^}]*)\}/) || [, '?'])[1].replace(/\s*\?\?.*$/, '').trim();
    const key = `${rel}:${what.replace(/^tier\./, '')}`;
    if (DIAL_BASELINE.has(key)) continue;
    problems.push({ rel, line, key, dial: true, what });
  }
}

/* Rule 4: the shell size cap is resolved through the row, never left to its default.
   ⚠️ THE RULE THE FIRST THREE COULD NOT STATE. `capShellScale` bounded every piping shell by a
   module-scope 0.16 that no row could reach, so an admin's `scale: { min: 1, max: 5 }` rendered as
   one size from 1.40 up — the dial moved, the cake did not, and all three rules above were green
   because none of them looks past the control. The ceiling is a row value now; a call that omits
   it silently takes the default rail back.
   ⚠️ AND IT IS STILL ONLY ONE FUNCTION WIDE. A gate that matches a name cannot state "an authored
   value reaches the pixels" — the fifth variant need only be spelled differently. The behavioural
   assertions in shellGeo.test.js are what actually hold that line; this catches the specific
   regression of dropping the argument again. */
const SIZED_BY_ROW = ['capShellScale', 'buildShellGeo'];
const ARITY = { capShellScale: 5, buildShellGeo: 6 };
for (const rel of FILES) {
  const src = maskComments(readFileSync(join(ROOT, rel), 'utf8'));
  for (const fn of SIZED_BY_ROW) {
    const re = new RegExp(`(?<![A-Za-z_.])${fn}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(src))) {
      if (/export function\s*$/.test(src.slice(Math.max(0, m.index - 24), m.index))) continue;
      // Walk to the matching ')' and count top-level commas — the call's real arity.
      let depth = 0, args = 1, i = m.index + m[0].length - 1;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) break; }
        else if (c === ',' && depth === 1) args++;
      }
      if (args >= ARITY[fn]) continue;
      problems.push({ rel, line: src.slice(0, m.index).split('\n').length,
                      key: `${rel}:${fn}`, row: true, fn, args });
    }
  }
}

/* Rule 3: a default SIZE is read off the row, never written out.
   INVARIANTS line 23 — "`placement_config.r` — default scale (never hard-coded; never force a
   value)". Rules 1 and 2 both look at the CONTROL; this one looks at the value the control starts
   on, which is the half that shipped wrong four times over. A literal is the whole fault: an
   element object is in scope at every one of these sites, so there is always something to ask. */
for (const rel of FILES) {
  const src = maskComments(readFileSync(join(ROOT, rel), 'utf8'));
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/(?<![A-Za-z])size:\s*(-?\d+(?:\.\d+)?)\s*[,}]/);
    if (!m) return;
    /* ⚠️ ONLY WHERE AN ELEMENT ROW IS IN SCOPE. Widened naively this rule found 21 "faults", and 15
       of them were topperPresets.js — a preset's own `size: 0.4` IS its value, not a default
       somebody authored in Manage Elements. The row is what makes a literal a fault; without one
       there is nothing being ignored. A gate that cries wolf on correct code teaches people to
       add exemptions, which is how a gate dies. */
    const near = lines.slice(Math.max(0, i - 6), i + 3).join(' ');
    if (!/placement_config|default_color|\bel\b|\belement\b/.test(near)) return;
    seeds++;
    problems.push({ rel, line: i + 1, key: `${rel}:size`, seed: true, value: m[1] });
  });
}

if (problems.length) {
  console.error('✗ check:element-size — a size control carries its own bounds:\n');
  for (const p of problems) {
    console.error(`   • ${relative(ROOT, join(ROOT, p.rel))}:${p.line}  ${p.key}`);
    if (p.seed) {
      console.error(`     a default size is written here as ${p.value}, not read from the element.`);
      console.error('     INVARIANTS line 23: placement_config.r is the default scale — never');
      console.error('     hard-coded, never forced. An admin types 0.3 and the cake renders 1.');
      console.error('     Use the element: pipingScaleFor(el) / scatterScaleFor(el) / el.placement_config.r.\n');
      continue;
    }
    if (p.row) {
      console.error(`     ${p.fn}() is called with ${p.args} argument(s) and takes the element's`);
      console.error('     placement_config last. Without it the shell falls back to the built-in');
      console.error('     0.16 radial rail, which silently overrides whatever scale.max the admin');
      console.error('     authored — the dial moves and the cake does not. Pass the row.\n');
      continue;
    }
    if (p.dial) {
      console.error(`     <SizeDial size={${p.what}}> declares no bounds, so the component's own`);
      console.error('     0.5-2 applies and placement_config.scale {min,max,step} reaches nothing.');
      console.error('     An authored default below 0.5 cannot even be SHOWN on such a dial.');
      console.error('     Resolve the row with scaleRangeOf(element, …) and pass min/max/step.\n');
      continue;
    }
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

/* ⚠️ THE MESSAGE SAYS ONLY WHAT WAS CHECKED. It used to end "and no default size is hard-coded" —
   a claim about the whole repo that three syntax rules cannot support. The fault was planted in the
   renderer twice and this line printed both times, which is worse than silence: it is why nobody
   looked further. Name the rules, name their reach, and point at the thing that does cover the
   rest. */
console.log(`✓ check:element-size — ${checked} dial row(s) and ${dials} SizeDial(s) take their `
          + `bounds from an expression; ${seeds} literal default size(s) beside an element row; `
          + `every size-capping call passes the row (${BASELINE.size + DIAL_BASELINE.size} baselined).`
          + `\n   Scope: four SYNTACTIC rules over src/designer. A ceiling applied downstream under `
          + `any other name is outside them — shellGeo.test.js asserts that behaviourally.`);
