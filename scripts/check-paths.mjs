#!/usr/bin/env node
// Quality gate: the element RENDERER (src/designer/canvas/**) must stay config-driven — it
// dispatches on zone + placementMode, never on an element's DB type/slug. A type/slug literal
// here means a parallel, per-type render path is creeping back (see src/designer/INVARIANTS.md).
// Zone/mode strings ('side', 'top_surface', 'stand', 'hug', …) are the config-driven dispatch
// and are intentionally allowed; only element-TYPE slugs are banned.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/designer/canvas';
const SLUGS = [
  'topper', 'top_side_decors', 'scattered_decor', 'picks', 'image_topper',
  'cream_piping', 'piping_pattern', 'piping_stamp', 'faux_ball', 'grouped_elements',
];
const slugRe = new RegExp(`['"\`](${SLUGS.join('|')})['"\`]`);
const identRe = /\bCakeTopper\b/;   // the deleted per-type renderer must not return

const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))  // block comments (keep line count)
  .replace(/(^|[^:])\/\/.*$/gm, '$1');                          // line comments (not URLs `://`)

const walk = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.(jsx?|tsx?)$/.test(f) ? [p] : []);
});

const violations = [];
for (const file of walk(ROOT)) {
  stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
    if (slugRe.test(line) || identRe.test(line)) violations.push(`  ${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
}

if (violations.length) {
  console.error('\n✗ check:paths — element-type/slug branching found in the renderer (canvas/).');
  console.error('  Placement must be config-driven (allowed_zones + placement_config), not per-type.');
  console.error('  See src/designer/INVARIANTS.md.\n');
  console.error(violations.join('\n') + '\n');
  process.exit(1);
}
console.log('✓ check:paths — renderer is free of element-type branching');
