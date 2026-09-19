// ── A tool that opens a screen must say so on its own entry ─────────────────────────────────────
//
// `PROCEDURAL_TOOLS` in CakeDesigner maps the one field an admin authors on Add Element
// (`placement_config.procedural`) to what tapping that row does. Eleven keys, and they do two
// categorically different things:
//
//   eight PLACE something on the cake the instant they are tapped — grass, a rainbow, a cloud,
//         letter blocks, writing, a number topper, luster dust, the cream pen
//   three OPEN A SCREEN you work in first — the garnish studio (twice) and the topper studio
//
// The decorations picker shows the second group under its own heading, because a studio sitting
// among stickers looks identical and behaves nothing like one: a customer taps expecting a
// decoration to land on the cake and the screen is replaced instead. The split is read off the
// table — `opensStudio(fn)` marks the entry — so there is exactly one statement of which is which.
//
// ⚠️ WHY NOT A DB COLUMN. It is not a tunable. An admin's authored decision is "this row is a
// chocolate garnish"; whether that key opens a screen is a CONSEQUENCE of it, not a second opinion
// about it, and a column could disagree with the code — tick "studio" on the grass row and grass
// still places instantly, the heading lies, and nothing fails. Same shape as billing's
// `discount_pct` sitting beside the arithmetic it is supposed to describe.
//
// ⚠️ WHY NOT A HAND-KEPT LIST IN CODE EITHER. That is the same column in a different file. This is
// the check that makes the mark-on-the-entry version honest: add a twelfth tool that opens a studio
// and forget to wrap it, and the build stops with its name.
//
// Run via `npm run check:procedural-studios` (in `npm run verify`).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'src/designer/CakeDesigner.jsx');

const src = readFileSync(FILE, 'utf8');

const OPEN = 'const PROCEDURAL_TOOLS = {';
const start = src.indexOf(OPEN);
if (start < 0) {
  console.error('✗ check:procedural-studios — PROCEDURAL_TOOLS not found in CakeDesigner.jsx.');
  console.error('   It was renamed or moved; this check and check:movable both read it by name.');
  process.exit(1);
}

// Brace-match the object literal. A regex cannot: `card_topper` has a multi-line arrow body with
// braces of its own, and one of the entries contains a `{` inside a comment.
let i = src.indexOf('{', start), depth = 0, end = -1;
for (let k = i; k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
}
const block = src.slice(i + 1, end);

/* Entries at the table's own indentation. Nested braces belong to an entry body, so a line deeper
   than four spaces is never a new key — which is what keeps `setTopperStudio(true)` inside
   `card_topper` from being read as an entry of its own. */
const ENTRY = /^ {4}([a-z_][a-z0-9_]*)\s*:\s*(.*)$/;
const lines = block.split('\n');
const entries = [];
for (let k = 0; k < lines.length; k++) {
  const m = ENTRY.exec(lines[k]);
  if (!m) continue;
  // The body runs to the next entry at this depth, or to the end of the table.
  let j = k + 1;
  while (j < lines.length && !ENTRY.test(lines[j])) j++;
  entries.push({ key: m[1], head: m[2], body: [m[2], ...lines.slice(k + 1, j)].join('\n') });
}

if (!entries.length) {
  console.error('✗ check:procedural-studios — PROCEDURAL_TOOLS parsed as empty. The table\'s shape changed;');
  console.error('   fix this script rather than deleting it, or the picker silently stops grouping.');
  process.exit(1);
}

// Comments describe the rule as often as they describe the code — `chocolate_garnish`'s own note
// says "Opens the studio rather than placing something" — so they are stripped before asking.
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

// Opening a screen is a `set…Studio(true)` call. That is the app's one way of doing it (garnish,
// topper, print), and it is what the picker's heading is a claim about.
const OPENS  = /set[A-Za-z]*Studio\(\s*true\s*\)/;
const MARKED = /^opensStudio\(/;

const missing = [], spurious = [];
for (const e of entries) {
  const opens  = OPENS.test(code(e.body));
  const marked = MARKED.test(e.head.trim());
  if (opens && !marked)  missing.push(e.key);
  if (marked && !opens)  spurious.push(e.key);
}

if (missing.length || spurious.length) {
  console.error('✗ check:procedural-studios — the table and its marks disagree:\n');
  for (const k of missing) {
    console.error(`   ${k} opens a studio but is not wrapped in opensStudio(…)`);
    console.error('      → the decorations picker will file it among the stickers, under "Tap or drag');
    console.error('        onto the cake to place", which is the one thing it does not do.');
  }
  for (const k of spurious) {
    console.error(`   ${k} is wrapped in opensStudio(…) but places something instead`);
    console.error('      → it will appear under the "Studios" heading, promising a screen that never opens.');
  }
  console.error(`\n   ${relative(ROOT, FILE)} — see the opensStudio note above the table.`);
  process.exit(1);
}

const studios = entries.filter(e => MARKED.test(e.head.trim())).map(e => e.key);
console.log(`✓ check:procedural-studios — ${entries.length} tools, ${studios.length} open a screen `
  + `(${studios.join(', ')}); every one marked on its own entry`);
