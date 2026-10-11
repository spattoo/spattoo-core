#!/usr/bin/env node
/* ── A sheen with no colour is a lobe that contributes nothing ───────────────────────────────────
 *
 * three.js defaults `sheenColor` to BLACK. So a material that sets `sheen` and omits the colour
 * has asked for a cloth lobe and been given one that adds no light — it costs the shader branch
 * and changes nothing on screen. There is no warning; it simply looks duller than whoever wrote it
 * expected.
 *
 * ⚠️ AND IT HIDES BEHIND A TUNER. `CakeWafer` set `sheen: 0.9` with no colour while the admin
 * studio and the dev harness each typed `sheenColor="#ffffff"` into their own JSX. Both tuners
 * therefore showed a broad white highlight the cake could not produce — and the cake's paper
 * measured [181,160,157], chroma 23, against the harness's [211,203,199], chroma 12, on identical
 * parameters. Sandeep, on a render whose shape he had just accepted: *"it does not look like
 * white."* Fixing it moved the lit faces to [232,229,230], chroma 3.7.
 *
 * So: every material that asks for a sheen must say what colour it is. Reading it from a shared
 * constant is the point — three copies of `"#ffffff"` is how the cake and the tuner drift apart in
 * the first place (INVARIANTS #15).
 *
 *   node scripts/check-sheen-colour.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'dev'];
const EXT = /\.(jsx?|mjs)$/;
/* Files that describe a sheen rather than set one: docs, tests asserting the number, and the
   material tables where `sheenColor` is a sibling KEY rather than a prop on the same element. */
const SKIP = /\.(test|spec)\.|\.md$/;

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (e === 'node_modules' || e.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(e) && !SKIP.test(e)) files.push(p);
  }
};
for (const r of ROOTS) { try { walk(r); } catch { /* a repo without one of them */ } }

/* ⚠️ THE WINDOW IS THE WHOLE DECLARATION, found by matching delimiters rather than by counting
   characters. The first version took the nearest `}` after the sheen as the end — which in JSX is
   the close of `sheen={p.sheen ?? DEFAULT}`, two lines BEFORE the sheenColor that was sitting right
   there. It reported a file it had just been fixed in. A fixed character window fails the other
   way, reaching into the next element. So: walk back to the unmatched opener, then forward to its
   partner, counting both kinds of bracket. */
const enclosing = (src, i) => {
  // Back to the nearest opener that is not already closed between it and `i`.
  let curly = 0, angle = 0, open = -1, kind = '';
  for (let k = i - 1; k >= 0; k--) {
    const c = src[k];
    if (c === '}') curly++;
    else if (c === '{') { if (curly === 0) { open = k; kind = '{'; break; } curly--; }
    else if (c === '>') angle++;
    else if (c === '<') { if (angle === 0) { open = k; kind = '<'; break; } angle--; }
  }
  if (open < 0) return src;
  // Forward to its partner, ignoring the other kind of bracket nested inside.
  let depth = 0;
  for (let k = open + 1; k < src.length; k++) {
    const c = src[k];
    if (kind === '{') {
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0) return src.slice(open, k + 1); depth--; }
    } else {
      if (c === '{') depth++;                       // a JSX expression, not the end of the element
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) return src.slice(open, k + 1);
    }
  }
  return src.slice(open);
};

const bad = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /\bsheen\s*[:=]/g;
  let m;
  while ((m = re.exec(src))) {
    // `sheenRoughness` and `sheenColor` both start with the same five letters.
    if (/^sheen(Roughness|Color|Map)/.test(src.slice(m.index))) continue;
    const value = src.slice(m.index).replace(/^sheen\s*[:=]\s*/, '');
    /* A sheen of 0 is the lobe turned OFF, and asking it to name a colour would be noise. The
       harnesses use exactly this to show what the sheen was contributing. */
    if (/^\{?\s*0\s*[,}\s)]/.test(value)) continue;
    /* ⚠️ NOT EVERY `sheen` IS A MATERIAL'S. `topperMatcap`'s LOOKS table has `sheen: [255,180,55]`
       — an RGB triple baked into a matcap, which is a colour already and never reaches a
       meshPhysicalMaterial. An array value is that, not a three.js prop. */
    if (/^\[/.test(value)) continue;
    if (/\bsheenColor\s*[:=]/.test(enclosing(src, m.index))) continue;
    bad.push(`${relative(process.cwd(), f)}:${src.slice(0, m.index).split('\n').length}`);
  }
}

if (bad.length) {
  console.error(`\n✗ check:sheen-colour — ${bad.length} material(s) ask for a sheen and never say what colour it is.`);
  console.error('  three.js defaults sheenColor to BLACK, so each of these is a lobe that adds no light:\n');
  for (const b of bad) console.error(`   • ${b}`);
  console.error(`\n  Fix: set sheenColor from the material's own constant, not a literal in the JSX.\n`);
  process.exit(1);
}
console.log(`✓ check:sheen-colour — every sheen says what colour it is (${files.length} files)`);
