#!/usr/bin/env node
// ── A harness must be lit like the product ───────────────────────────────────────────────────────
//
// Any harness mounting the real cake scene has to import `dev/scene.js`, which supplies the assets
// base the app supplies. Without it `envProps` falls back to drei's `apartment` preset and the
// harness renders a DIFFERENT ENVIRONMENT from every deployed cake.
//
// ⚠️ THIS IS A GATE AND NOT A CONVENTION BECAUSE THE FAILURE IS SILENT AND EXPENSIVE. Nothing throws,
// nothing logs (the warning added alongside this helps, but a console line in a harness nobody has
// open is not a control). The cake simply looks slightly different, which is invisible until someone
// measures it — and by then three parameter sweeps had been run, documented as settled findings, and
// a scene-wide change shipped and reverted on the strength of them. Of the harnesses mounting the
// real scene, exactly ONE configured this correctly before the gate existed.
//
//   node scripts/check-harness-scene.mjs
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DIR = 'dev';
// Mounting either of these means the real rig — SafeEnvironment, the lamps, the shared materials.
const REAL_SCENE = /<\s*(CakePreview|CakeCanvas)\b/;
const IMPORTS_SCENE = /from\s+['"]\.\/scene\.js['"]|import\s+['"]\.\/scene\.js['"]/;

// A harness that builds its OWN environment is a separate, louder problem — it is not lit like the
// product either, but the fix is to delete its rig rather than to add an import, so it is reported
// distinctly instead of being swept into the same message.
const OWN_ENV = /<\s*Environment\b|RoomEnvironment|preset\s*=\s*['"]/;

/* ⚠️ STRIP COMMENTS BEFORE MATCHING. The first version scanned raw source and flagged
   `garnish-on-cake.jsx` for the word "RoomEnvironment" appearing in a COMMENT explaining that other
   harnesses use one. A gate that reports a file for what its prose says is a gate people learn to
   ignore, and an ignored gate is worse than none — this codebase comments heavily, so a checker here
   must read code. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');       // the [^:] guard keeps `https://…` intact

const offenders = [];
const ownRig = [];

for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.jsx')) continue;
  const src = stripComments(readFileSync(join(DIR, f), 'utf8'));
  if (!REAL_SCENE.test(src)) continue;
  if (OWN_ENV.test(src)) ownRig.push(f);
  else if (!IMPORTS_SCENE.test(src)) offenders.push(f);
}

if (!offenders.length && !ownRig.length) {
  const n = readdirSync(DIR).filter(f => f.endsWith('.jsx')).length;
  console.log(`✓ check:harness-scene — every harness on the real scene is lit like production (${n} harnesses)`);
  process.exit(0);
}

console.error('✗ check:harness-scene — harnesses that do not light the cake the way production does:\n');
for (const f of offenders) {
  console.error(`   • dev/${f}`);
  console.error("     mounts the real scene but never sets the assets base, so it renders drei's");
  console.error('     `apartment` preset instead of the shipped HDRI.');
  console.error("     Fix: add  import './scene.js';  at the top.\n");
}
for (const f of ownRig) {
  console.error(`   • dev/${f}`);
  console.error('     builds its OWN environment beside the real scene, so it is lit twice and by');
  console.error('     the wrong thing. Fix: delete the local <Environment>/RoomEnvironment/preset=');
  console.error("     and add  import './scene.js';  — the scene already carries its own lighting.\n");
}
console.error('   Why this is a gate: the failure is silent. The cake just looks slightly different,');
console.error('   which stays invisible until someone measures it and reaches a wrong conclusion.');
process.exit(1);
