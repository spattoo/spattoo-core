#!/usr/bin/env node
// Quality gate: every cross-origin image loader must qualify its URL with corsUrl().
//
// R2 answers a request that carries no `Origin` header — a plain <img>, a CSS background:url(), a
// <link rel=preload>, a browser extension — with NO `Access-Control-Allow-Origin` and, critically, NO
// `Vary`. Chrome then treats that response as valid for ANY later request to the same URL, including a
// `crossOrigin='anonymous'` one. The CORS load reads the poisoned entry and is BLOCKED; an ETag
// revalidation returns 304 and keeps the entry alive across refreshes. corsUrl() appends `?cors=1` as a
// CACHE KEY SEPARATOR so the two fetches can never share an entry. See src/designer/utils/assetUrl.js.
//
// This is worth a GATE rather than a comment for two reasons:
//
//  1. The failure is REMOTE and INTERMITTENT. Nothing is wrong with the code, the bucket, or the CDN —
//     the load fails only when some *other* screen fetched the same asset first, so it reproduces on a
//     colleague's machine and not yours, survives a reload, and clears itself if you empty the cache.
//     Its console signature ("No 'Access-Control-Allow-Origin' header is present") points at server
//     config, which sends you to Cloudflare for a bug that lives in the browser.
//
//  2. Review cannot catch it. A missing corsUrl() looks like ordinary correct code — `loadImage(url)`
//     reads fine. There is no wrong-looking line for a reviewer to stop on.
//
// The rule is deliberately placed at the LOADER, not the call site. Requiring every caller to remember
// a wrapper is a rule with N chances to be forgotten, and it WAS forgotten — the A4 print sheet
// (src/orders/PhotoSheet.jsx) called framePhoto's loadImage with raw R2 urls and its photos stopped
// loading. corsUrl is idempotent, so a loader may safely qualify a url a caller already qualified.
// That makes "the loader guarantees it" a rule with a handful of enforcement points, all checked here.
//
// GLB/model loads (useGLTF) are deliberately OUT of scope: a .glb is never fetched by a plain <img> or
// a CSS url(), so there is nothing to poison its cache entry, and useGLTF.preload(url) keys off the
// exact string — silently qualifying one side would break preloading. Textures loaded through
// useTexture ARE in scope; those assets double as element-picker thumbnails.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const SELF = 'src/designer/utils/assetUrl.js';   // corsUrl's own definition + its doc comment

const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const walk = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.(jsx?|tsx?)$/.test(f) ? [p] : []);
});

const lineOf = (src, i) => src.slice(0, i).split('\n').length;

// The argument text of a call, from the open paren to its match — quote- and nesting-aware, so
// `useTexture(corsUrl(a ? b : c))` yields the whole inner expression rather than stopping at the
// first `)`. Returns null if the parens never balance (truncated file).
function callArg(src, openIdx) {
  let depth = 0, quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { if (--depth === 0) return src.slice(openIdx + 1, i); }
  }
  return null;
}

// A url expression is safe if it is qualified, or if it can't be remote in the first place.
const SAFE = /\bcorsUrl\s*\(|['"`](data:|blob:)|createObjectURL|dataUrl|dataUri|DataURL/i;

// Loaders routinely qualify once into a local and assign that (`const url = corsUrl(imageUrl); …
// img.src = url`), so a bare identifier is safe if it was bound from corsUrl in the same scope-ish
// window. Anything more indirect than one hop is meant to trip the gate — go qualify at the loader.
const safeExpr = (expr, window) => {
  if (SAFE.test(expr)) return true;
  const ident = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(expr);
  return !!ident && new RegExp(`\\b${ident[1]}\\s*=\\s*corsUrl\\s*\\(`).test(window);
};

const violations = [];

for (const file of walk(SRC)) {
  if (file === SELF || /\.test\.[jt]sx?$/.test(file)) continue;
  const src = stripComments(readFileSync(file, 'utf8'));

  // 1. Any <img> element given crossOrigin must take its src from corsUrl(...). This is the loader
  //    rule for the DOM half — a CORS-mode <img> shares the cache entry with the non-CORS one.
  //    (The JSX tiles in CakeDesigner exist precisely to WARM a CORS-clean entry, so they must match
  //    the qualified url the texture path later asks for, or they warm the wrong entry.)
  for (const m of src.matchAll(/\bcrossOrigin\s*[=:]\s*['"]anonymous['"]/g)) {
    // Two shapes to cover. Imperative (`new Image()`): the `.src =` comes AFTER the crossOrigin line,
    // so scan forward only — scanning back would latch onto an unrelated earlier assignment. JSX: the
    // `src={…}` prop sits in the same tag, either side of crossOrigin. `back` is the qualify-once
    // window a bare identifier may have been bound in.
    const back = src.slice(Math.max(0, m.index - 600), m.index);
    const fwd = src.slice(m.index, m.index + 800);
    const expr = /\.src\s*=\s*([^;\n]+)/.exec(fwd)?.[1]
      ?? /\bsrc\s*=\s*\{([^}]*)\}/.exec(fwd)?.[1]
      ?? /\bsrc\s*=\s*\{([^}]*)\}[^>]*$/.exec(back)?.[1];
    if (expr === undefined) {
      violations.push(`  ${file}:${lineOf(src, m.index)}  crossOrigin='anonymous' with no src assignment found nearby — check it manually`);
    } else if (!safeExpr(expr, back + fwd)) {
      violations.push(`  ${file}:${lineOf(src, m.index)}  crossOrigin='anonymous' loads an unqualified url: ${expr.trim().slice(0, 70)}`);
    }
  }

  // 2. useTexture(...) always loads CORS-clean (three's TextureLoader sets crossOrigin), so the same
  //    poisoning applies — and these assets ARE rendered as plain <img> thumbnails elsewhere.
  for (const m of src.matchAll(/\buseTexture\s*\(/g)) {
    const arg = callArg(src, m.index + m[0].length - 1);
    if (arg !== null && !safeExpr(arg, src.slice(Math.max(0, m.index - 600), m.index))) {
      violations.push(`  ${file}:${lineOf(src, m.index)}  useTexture(${arg.trim().slice(0, 60)}) — url not passed through corsUrl()`);
    }
  }
}

if (violations.length) {
  console.error('\n✗ check:cors — a cross-origin image load can be blocked by a cache entry a plain <img> poisoned.');
  console.error("  Qualify the url INSIDE the loader: import { corsUrl } from '<…>/designer/utils/assetUrl.js'");
  console.error('  and assign img.src = corsUrl(url). It is idempotent — double-qualifying is safe.');
  console.error('  See src/designer/utils/assetUrl.js for why this bug is invisible without the qualifier.\n');
  console.error(violations.join('\n') + '\n');
  process.exit(1);
}
console.log('✓ check:cors — every crossOrigin image load is qualified with corsUrl()');
