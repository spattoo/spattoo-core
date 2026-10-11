#!/usr/bin/env node
/* ── Is a click handler actually JOINED UP? ──────────────────────────────────────────────────────
 *
 * Sandeep, twice on the same feature: *"cover entire cake is not working. when i click on that on
 * the element card — nothing happens"*, and then, after a fix that looked complete, *"pointer still
 * not working."*
 *
 * Both times the handler existed. A coat had an `onClick` on every instanced surface, CakeTier took
 * an `onCoatClick`, CakeContent took an `onCoatSelect`, and CakeDesigner had a `handleCoatSelect`
 * that opened the card. Four correct pieces, and CakeCanvas destructured `onCoatSelect` from its own
 * props and then never put it on `<CakeScene>`. The chain is CakeDesigner → CakeCanvas → CakeScene
 * → CakeContent → CakeTier, and one missing line anywhere in it is silent.
 *
 * ⚠️ AND IT IS SILENT *BECAUSE* OF THE DEFAULT. `onCoatSelect = NOOP` in CakeContent is there so a
 * thumbnail render does not need editing callbacks — so a prop that never arrives is indistinguish-
 * able from a prop deliberately left out. Nothing throws, nothing warns, every gate passes, and the
 * only symptom is a tap that does nothing. `check:bindings` cannot see it either: the name IS
 * declared, in a scope that simply never hands it on.
 *
 * So: every editing callback CakeContent defaults must be present by name at BOTH hand-offs. */

import { readFileSync } from 'node:fs';

const FILE = 'src/designer/canvas/CakeCanvas.jsx';
const src = readFileSync(FILE, 'utf8');

/** The body of a top-level `function Name(` … up to the next top-level function. */
function bodyOf(name) {
  const re = new RegExp(`^(?:export (?:default )?)?function ${name}\\s*\\(`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error(`${FILE}: no top-level function ${name}`);
  const rest = src.slice(m.index + m[0].length);
  const next = /\n(?:export )?(?:default )?function [A-Za-z]/.exec(rest);
  return rest.slice(0, next ? next.index : rest.length);
}

/* What CakeContent expects. Only the ones it DEFAULTS, because those are the ones whose absence
 * cannot be noticed at runtime — a required prop that never arrives throws on first call. */
const content = bodyOf('CakeContent');
const required = [...content.matchAll(/\b(on[A-Z]\w*)\s*=\s*NOOP\b/g)].map(m => m[1]);
if (!required.length) {
  console.error('✗ check:forwarded-props — found no `onX = NOOP` defaults in CakeContent.');
  console.error('  The gate has lost its anchor; fix the pattern rather than deleting the check.');
  process.exit(1);
}

/* Hand-off 1: CakeScene's `edit={{ … }}` object, which may name a prop in shorthand. */
const scene = bodyOf('CakeScene');
const editObj = /edit=\{\{([\s\S]*?)\n\s*\}\}/.exec(scene)?.[1] ?? '';

/* Hand-off 2: the `<CakeScene …>` element inside CakeCanvas. Identified by `onTierClick`, so a
 * second, non-editing CakeScene (a preview, a thumbnail) is not held to the editing contract. */
const canvas = bodyOf('CakeCanvas');
/* ⚠️ SCANNED, NOT MATCHED WITH A REGEX. Every other handler on that element is an arrow function,
 * so `[\s\S]*?>` ends at the `>` of the first `=>` and reports a dozen props missing that are
 * sitting right there. Brace depth, and the first `>` outside a prop value closes the tag. */
function openTagAfter(hay, from) {
  let depth = 0;
  for (let i = from; i < hay.length; i++) {
    const ch = hay[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return hay.slice(from, i);
  }
  return null;
}
const element = (() => {
  for (const m of canvas.matchAll(/<CakeScene\b/g)) {
    const attrs = openTagAfter(canvas, m.index + m[0].length);
    if (attrs && /\bonTierClick\s*=/.test(attrs)) return attrs;
  }
  return null;
})();
if (!element) {
  console.error('✗ check:forwarded-props — no <CakeScene> with onTierClick inside CakeCanvas.');
  process.exit(1);
}

const named = (hay, prop) =>
  new RegExp(`\\b${prop}\\b\\s*(?:[=:]|,|$)`, 'm').test(hay);

const bad = [];
for (const prop of required) {
  if (!named(element, prop)) bad.push([prop, 'CakeCanvas never puts it on <CakeScene>']);
  else if (!named(editObj, prop)) bad.push([prop, 'CakeScene never puts it in edit={{ … }}']);
}

if (bad.length) {
  console.error('✗ check:forwarded-props — an editing callback stops partway down the chain.\n');
  console.error('  CakeDesigner → CakeCanvas → CakeScene → CakeContent → CakeTier. A prop that');
  console.error('  stops anywhere in it falls back to NOOP, so the click lands and nothing happens.\n');
  for (const [prop, why] of bad) console.error(`  ${prop.padEnd(22)} ${why}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ check:forwarded-props — ${required.length} editing callbacks reach CakeContent`);
