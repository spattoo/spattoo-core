#!/usr/bin/env node
// ── No screen states a price it does not own ─────────────────────────────────────────────────────
//
// What a smart tool costs lives in `credit_costs`, and what a pack costs lives in `credit_packs` —
// both admin-editable tables, both created so the numbers can be retuned WITHOUT A DEPLOY. A string
// in a component that spells one out is a second copy of a value whose whole purpose is to move.
//
// ⚠️ IT DOES NOT BREAK LOUDLY. It breaks on the day an admin edits a price, in a file nobody is
// looking at, and what a baker reads is simply wrong — about money, on the screen where they decide
// whether to spend it. Nothing errors and no test fails.
//
// `BillingPanel.jsx` already wrote the rule down, in its own comment:
//
//     "The COUNTS COME FROM THE SERVER (`actions[].remaining`), never from dividing a balance by a
//      price held here. Prices live in `credit_costs` precisely so they can be retuned without a
//      deploy; a client carrying its own copy starts lying the moment they move."
//
// And `XrayDecorationSteps.jsx` states "20 credits" four times anyway. That is the whole argument
// for this file: a rule written in ONE file's comments does not reach the file that breaks it. Root
// CLAUDE.md rule 3 says the same thing project-wide and did not reach it either.
//
// ── SCOPE: NARROW ON PURPOSE ────────────────────────────────────────────────────────────────────
// A digit next to `credit`, `message`, `₹` or `Rs.` inside a STRING LITERAL. Not every number, not
// every mention of credits — a gate that fires on legitimate cases gets switched off, and then it
// protects nothing (the note at the top of check-one-chevron.mjs, learned the same way).
// Measured when written: 4 hits, all in one file, no false positives.
//
// Run via `npm run check:priced-copy` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/* ── Priced copy that is allowed to exist, and why ───────────────────────────────────────────────
 *
 * Keyed by `file:line-ish` is too brittle — a line moves and the entry goes stale silently. Keyed by
 * FILE, with the reason, so adding one is a decision somebody wrote down and forgetting fails the
 * build. Same mechanism as check-env-map.mjs.
 */
const ACCEPTED = {
  'src/orders/xray/XrayDecorationSteps.jsx':
    '⚠️ KNOWN GAP, not an exemption. Four strings say "20 credits" for the decoration guide. They are '
    + 'CORRECT today — both branches charge AI_ACTION.ELEMENT_BUILD_GUIDE (xraySpec.js:333), which is '
    + '20 in credit_costs — and they are correct only by coincidence: the table exists so an admin can '
    + 'retune it with no deploy, and the day they do, these lie. The fix is to read the cost the way '
    + 'BillingPanel does, from fetchAiCredits().actions[], which means this component needs the call '
    + 'or the number passed in. That is a real change with its own risk, so it is named here rather '
    + 'than done badly in a gate commit.',
};

/* ⚠️ BLOCK COMMENTS FIRST, THEN LINE COMMENTS — and never a combined `{/* … *​/}` pattern before the
   plain one. The lazy match runs from the first `{/*` to the first later `*​/}` and swallows every
   plain comment in between; it deleted half of VerifyStep.jsx on 2026-09-19 and an assertion about
   real code passed as "not present". Comments in this codebase QUOTE the strings they explain, so
   getting this wrong is not academic — this very file quotes "20 credits" twice. */
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

// A number sitting next to money, inside a quoted string.
const PRICED = [
  /'[^']*\b\d[\d,.]*\s*(credits?|messages?|rupees?)\b[^']*'/i,
  /"[^"]*\b\d[\d,.]*\s*(credits?|messages?|rupees?)\b[^"]*"/i,
  /'[^']*(₹|\bRs\.?\s*)\d[^']*'/i,
  /"[^"]*(₹|\bRs\.?\s*)\d[^"]*"/i,
];

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const problems = [];
const seen = new Set();
let scanned = 0;

for (const file of walk(SRC)) {
  if (!/\.jsx?$/.test(file) || /\.test\./.test(file)) continue;
  const rel = relative(ROOT, file);
  scanned++;
  const code = codeOnly(readFileSync(file, 'utf8'));
  for (const [i, line] of code.split('\n').entries()) {
    if (!PRICED.some(re => re.test(line))) continue;
    seen.add(rel);
    if (ACCEPTED[rel]) continue;
    problems.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`);
  }
}

// An accepted file that no longer prices anything is a reason nobody has to honour any more.
const stale = Object.keys(ACCEPTED).filter(f => !seen.has(f));

if (problems.length || stale.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  for (const f of stale) console.error(`✗ ${f} is in the accepted list but states no price — remove the entry.`);
  if (problems.length) {
    console.error('\n   A price in a component is a second copy of a value that exists to be changed');
    console.error('   without a deploy (credit_costs, credit_packs). It does not break loudly — it');
    console.error('   breaks the day an admin retunes it, on the screen where a baker decides to spend.');
    console.error('   Read it from the server: fetchAiCredits() returns actions[] with the live cost,');
    console.error('   the way BillingPanel.jsx does. If a number genuinely cannot move, add the file to');
    console.error('   ACCEPTED in this script WITH the reason.');
  }
  process.exit(1);
}

console.log(`✓ check:priced-copy — no screen states a price it does not own (${scanned} files; `
  + `${Object.keys(ACCEPTED).length} named)`);
