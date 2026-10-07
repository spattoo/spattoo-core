#!/usr/bin/env node
// ── A decoration can be taken off the cake, and the ROW decides whether it can ───────────────────
//
// Every procedural decoration placed from the catalogue gets a card. That card is the only place a
// customer meets the thing they just placed, so it is where "take it off again" has to live — and
// whether it is offered at all is the admin's call, not this file's. `allowed_actions.delete` is
// ticked by default in Manage Elements; unticking it pins the decoration to the cake.
//
// ⚠️ BOTH HALVES HAVE ALREADY FAILED, in the same week.
//   • The balloon card shipped with NO remove button. A balloon could be placed, coloured and
//     sized, and then only got off the cake by hunting it down in the element stack. Sandeep:
//     *"this popup card does not have delete and duplicate buttons"*.
//   • The cloud's and the rainbow's remove buttons were hard-coded `true`, so admin's "deletable"
//     tick was dead config for both — the identical fault `useCakeDesign` records paying for once
//     on stickers: *"Was hardcoded `true`, which made admin's 'deletable' checkbox DEAD CONFIG —
//     the one capability that ignored the element."*
// Sandeep, on the second: *"add a gate on delete button also. we already made this default from
// admin."* Two faults of one rule in one file is the shape that earns a gate.
//
// ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
// It reads the card dispatch rather than a list it keeps itself, so a new procedural decoration is
// covered the day its card is wired up and nobody has to remember this file exists. For each card
// whose type is a key of PROCEDURAL_TOOLS and whose body takes a `card` (a card per PLACED
// instance, not one per look), the body must:
//   1. offer a remove — a `removeX(card.tierIndex, …)` call, and
//   2. gate it on the row — an `instanceActions(…).delete` guard.
//
// ⚠️ IT CANNOT PROVE THE GUARD WRAPS THE BUTTON, and does not pretend to. A body holding both, with
// the guard round something else, would pass. What it stops is the two shapes the fault has
// actually taken: no button at all, and a button with nothing asking the element.
//
// Looks rather than objects — grass, blocks, dust, the cream brush — take no `card` and are edited
// from the tier they treat, so they are not per-instance cards and are skipped by construction.
//
// Run via `npm run check:element-delete` (in `npm run verify`).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'src/designer/CakeDesigner.jsx';
const src = readFileSync(join(ROOT, REL), 'utf8');

// ── the procedural decorations, read off the tool map itself ────────────────────────────────────
const toolBlock = src.match(/const PROCEDURAL_TOOLS = \{([\s\S]*?)\n  \};/);
if (!toolBlock) {
  console.error('✗ check:element-delete — could not find PROCEDURAL_TOOLS in ' + REL + '.');
  console.error('   The gate reads it to know which cards it governs; a rename needs this updated.');
  process.exit(1);
}
const procedural = new Set(
  [...toolBlock[1].matchAll(/^\s*([a-z_]+):\s*add[A-Za-z]+,/gm)].map(m => m[1]));

// ── which of them have a card per placed instance ───────────────────────────────────────────────
const cards = [...src.matchAll(/card\.type === '([a-z_]+)' \? (render[A-Za-z]+Body)\(card\)/g)]
  .filter(m => procedural.has(m[1]))
  .map(m => ({ type: m[1], fn: m[2] }));

// The body of one render function, by brace matching from its opening `{`.
function bodyOf(name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  return null;
}

const problems = [];
for (const { type, fn } of cards) {
  const body = bodyOf(fn);
  if (body == null) { problems.push({ type, fn, why: 'missing', detail: 'its body could not be found' }); continue; }
  const hasRemove = /\bremove[A-Za-z]+\(card\.tierIndex\b/.test(body);
  // Either shape counts: the inline `instanceActions(x).delete &&` guard the cloud uses, or the
  // balloon's `const act = instanceActions(x)` followed by `act.delete`. Asking for one spelling
  // would only teach the next card to write the other.
  const hasGate = /\binstanceActions\(/.test(body) && /\.delete\b/.test(body);
  if (!hasRemove) problems.push({ type, fn, why: 'no-remove' });
  else if (!hasGate) problems.push({ type, fn, why: 'ungated' });
}

if (problems.length) {
  console.error('✗ check:element-delete — a decoration card gets delete wrong:\n');
  for (const p of problems) {
    console.error(`   • ${REL}  ${p.fn}  (card.type '${p.type}')`);
    if (p.why === 'no-remove') {
      console.error('     No remove button. The card is the only place a customer meets the thing');
      console.error('     they just placed, so this is the only way off the cake short of the');
      console.error('     element stack. Add a removeX(card.tierIndex, id) button to the footer.');
    } else if (p.why === 'ungated') {
      console.error("     Its remove button asks nothing. Guard it on instanceActions(el.elementId)");
      console.error('     .delete, or admin\'s "deletable" tick in Manage Elements is dead config —');
      console.error('     the admin unticks it, the button stays, and nothing disagrees out loud.');
    } else {
      console.error(`     ${p.detail}.`);
    }
    console.error('');
  }
  console.error('   See renderBalloonBody for the shape: instanceActions() resolves the row, both');
  console.error('   capabilities default true, and only an explicit false pins a decoration down.');
  process.exit(1);
}

console.log(`✓ check:element-delete — ${cards.length} procedural card(s) offer a remove and gate it `
          + `on the element row`);
