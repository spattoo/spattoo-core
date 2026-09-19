#!/usr/bin/env node
// ── Every entry point that lights a cake must say where the HDRI lives ───────────────────────────
//
// `canvas/envMap.js` is the ONE place that decides which environment map a scene uses. It is already
// a shared module with a shared function — so this is not a missing-helper problem, and adding
// another helper would not have prevented any of the five times it went wrong.
//
// The failure is always the same: a host mounts one of our components, nobody calls
// `configureEnvMap(assetsBase)`, and `envProps` falls back to a drei PRESET. That preset resolves to
// a 1.4 MB HDR on raw.githubusercontent.com — fifteen times the 96 KB file we self-host, fetched
// before the first cake appears, from a CDN SafeEnvironment's own comment calls "flaky /
// rate-limited".
//
// ⚠️ AND IT NEVER BREAKS LOUDLY, which is the whole reason this script exists:
//
//   1. It WORKS. The cake renders — just heavier, and lit by a room nobody tuned. Every measurement
//      taken against it describes a scene no customer has seen (three parameter sweeps and a shipped
//      scene-wide change already did exactly that; envMap.js records it).
//   2. `SafeEnvironment` catches a load failure and renders flat lighting, so a 503 from that CDN
//      looks like a design decision.
//   3. The storefront CSP is report-only. The day it is enforced the fetch dies, silently, per 2.
//
// Found in four preview canvases on 2026-08-17. Found again in the STOREFRONT on 2026-09-19 — the
// fifth, and the only one customers see. `envProps` had been printing a warning in the live console
// the entire time, and nobody was reading the console.
//
// Run via `npm run check:env-map` (in `npm run verify`).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (f) => relative(ROOT, f);

/* ── Components a host mounts that do NOT configure, and why ─────────────────────────────────────
 *
 * Every entry is a decision someone made once. Adding a line here is deliberate; forgetting to add
 * one fails the build. That is the entire mechanism — the list is not an exemption, it is the place
 * the reason has to be written down.
 *
 * ⚠️ Two of these are a REAL GAP, not an inner component, and they are marked as such. Admin has no
 * assets base to pass — no env var exists for it — so its studios author colour under drei's INDOOR
 * `apartment` preset while every deployed cake ships under the self-hosted OUTDOOR map. That
 * contradicts INVARIANTS #17, "a studio is lit like the cake it authors for". CardCutoutStudio says
 * so in its own comment and calls it "a separate, wider fix". It still is: it needs a new env var in
 * two admin deployments, which is a deploy decision rather than a code one.
 */
const ACCEPTED = {
  'src/designer/canvas/CakeCanvas.jsx':
    'inner — mounted by CakeDesigner, which configures before children render',
  'src/designer/canvas/PatternBuilderCanvas.jsx':
    'inner — mounted inside PatternBuilder / the designer',
  'src/designer/PatternBuilder.jsx':
    'inner — opened from the designer, which has already configured',
  'src/designer/preview/ElementPreview.jsx':
    'inner — a tile inside a panel the designer or admin has already mounted',
  'src/designer/controls/ShapePicker.jsx':
    'inner — a control inside the designer',
  'src/designer/topper/TopperComposer.jsx':
    'inner — a studio opened from the designer',
  'src/admin/CreateTemplate.jsx':
    '⚠️ KNOWN GAP — admin mounts this directly and has no assets base to pass. Colour authored here '
    + 'is judged under drei apartment, not the shipped lebombo. See CardCutoutStudio.jsx and '
    + 'INVARIANTS #17. Fixing it needs a VITE_ASSETS_BASE in both admin deployments.',
};

// ── Which exported modules can reach the env map ────────────────────────────────────────────────
const entryModules = [...readFileSync(resolve(ROOT, 'src/index.js'), 'utf8')
  .matchAll(/^export \{[^}]*\} from '(\.[^']+)'/gm)]
  .map(m => resolve(ROOT, 'src', m[1]));

/* ⚠️ COMMENTS DO NOT COUNT AS A CALL. The first cut of this script matched `configureEnvMap(`
   anywhere in the file, so commenting the real call out left the gate green — and every file here
   MENTIONS the function in prose, because that is how this codebase documents itself. Proven by
   commenting out the storefront's call and watching the check pass. */
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');   // line comments

const resolveImport = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const ext of ['', '.js', '.jsx', '/index.js', '/index.jsx']) {
    if (existsSync(base + ext) && !(base + ext).endsWith('/')) return base + ext;
  }
  return null;
};

// Reaches the env map if it imports envMap.js or SafeEnvironment, directly or through anything in src/.
const lightsAScene = (file, seen = new Set()) => {
  if (!file || seen.has(file) || !existsSync(file)) return false;
  seen.add(file);
  const s = readFileSync(file, 'utf8');
  if (/canvas\/envMap\.js/.test(s) || /\bSafeEnvironment\b/.test(s)) return true;
  for (const m of s.matchAll(/from '(\.[^']+)'/g)) {
    if (lightsAScene(resolveImport(file, m[1]), seen)) return true;
  }
  return false;
};

const problems = [];
let checked = 0, configured = 0;

for (const file of [...new Set(entryModules)]) {
  if (!existsSync(file) || !lightsAScene(file)) continue;
  checked++;
  if (/configureEnvMap\(/.test(codeOnly(readFileSync(file, 'utf8')))) { configured++; continue; }
  if (ACCEPTED[rel(file)]) continue;
  problems.push(rel(file));
}

// A stale allowlist is its own bug: an entry that no longer lights a scene, or that now configures,
// is a reason nobody has to honour any more and should not be left implying otherwise.
const stale = Object.keys(ACCEPTED).filter((f) => {
  const abs = resolve(ROOT, f);
  return !existsSync(abs) || !lightsAScene(abs) || /configureEnvMap\(/.test(codeOnly(readFileSync(abs, 'utf8')));
});

if (problems.length || stale.length) {
  for (const f of problems) {
    console.error(`✗ ${f} is exported from src/index.js, can light a scene, and never calls configureEnvMap().`);
  }
  for (const f of stale) {
    console.error(`✗ ${f} is in the accepted list but no longer needs to be — remove the entry.`);
  }
  if (problems.length) {
    console.error('\n   A host mounting it gets drei\'s preset: a 1.4MB HDR from GitHub raw, a different');
    console.error('   environment from the one cakes ship under, and silence when it fails.');
    console.error('   Either call configureEnvMap(cfAssetsBase) in the component body — before children');
    console.error('   render — or add it to ACCEPTED in this script WITH the reason it does not need to.');
  }
  process.exit(1);
}

console.log(`✓ check:env-map — ${configured} of ${checked} scene-lighting entry points configure the HDRI; `
  + `${Object.keys(ACCEPTED).length} accounted for by name`);
