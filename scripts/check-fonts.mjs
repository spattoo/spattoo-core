#!/usr/bin/env node
// Quality gate (SEC-WEB-7): the designer must not pull fonts from a third-party CDN.
//
// drei's <Text> is rendered by troika-three-text, which — when given no `font` prop —
// resolves one AT RUNTIME and fetches both its index data and the font file from
// cdn.jsdelivr.net (unicode-font-resolver). That is a third-party origin on the
// designer's critical path: an entry in the CSP's connect-src/font-src, a runtime
// dependency on someone else's uptime for 3D text, and a visitor-IP leak to a third
// party on every storefront visit.
//
// This is worth a GATE rather than a comment because the failure is INVISIBLE: troika
// fetches inside a Web Worker, and CSP violations raised in a worker never reach a
// document-level listener, so a page can look perfectly clean while its 3D text is
// broken. A reviewer cannot catch it by reading the console. See the CSP notes in
// spattoo-docs/deployment/production-rollout.md §5.
//
// The Google Fonts hosts are banned for the same reason, and for one more: this is a
// LIBRARY. It has no document head it owns, so "loading" a webfont meant injecting an
// @import from a component — which is how the same rule ended up pasted in 17 places
// across 13 files. The library now only NAMES its font (src/shared/fonts.js); host
// apps load it (next/font in spattoo-web, @fontsource in spattoo-admin).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANVAS = 'src/designer/canvas';
const SRC = 'src';
const BANNED_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const walk = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.(jsx?|tsx?)$/.test(f) ? [p] : []);
});

// Opening tag text for each <Text …> occurrence: from the tag to the `>` that closes
// it, ignoring `>` inside quotes or JSX expression braces (e.g. `a > b` in a prop).
function openingTags(src, tagName) {
  const out = [];
  const re = new RegExp(`<${tagName}\\b`, 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 0, quote = null;
    for (let i = m.index; i < src.length; i++) {
      const c = src[i];
      if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        out.push({ text: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
        break;
      }
    }
  }
  return out;
}

const violations = [];

// 1. Every drei <Text> must pass an explicit `font`. (<Text3D> takes a typeface JSON
//    and is unaffected — the \b in the tag regex already excludes it.)
for (const file of walk(CANVAS)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const tag of openingTags(src, 'Text')) {
    if (!/\bfont\s*=/.test(tag.text)) {
      violations.push(`  ${file}:${tag.line}  <Text> without an explicit font= → troika will fetch from a CDN`);
    }
  }
}

// 2. No banned CDN host anywhere in src/.
for (const file of walk(SRC)) {
  stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
    for (const host of BANNED_HOSTS) {
      if (line.includes(host)) violations.push(`  ${file}:${i + 1}  third-party font/asset CDN: ${host}`);
    }
  });
}

if (violations.length) {
  console.error('\n✗ check:fonts — the designer must not fetch fonts from a third-party CDN.');
  console.error('  Pass the bundled font: import textFont from \'./fonts/NotoSans-Regular.woff?inline\'');
  console.error('  and set font={textFont}. See src/designer/canvas/fonts/README.md.\n');
  console.error(violations.join('\n') + '\n');
  process.exit(1);
}
console.log('✓ check:fonts — no third-party font CDN; every <Text> has an explicit font');
