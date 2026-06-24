import * as THREE from 'three';

// ── Luster dust — flicked edible metallic powder (the "gold dust" finish) ──────
//
// A NEW element kind (its own taxonomy type, NOT piping/texture): fine metallic specks flicked onto a
// cake wall in localized SPLASHES. A real flick has a dense impact point and sprays OUTWARD along the
// flick direction (a one-sided cone, dense head → thinning tail), and a cake usually carries SEVERAL.
// So a dusting = a LIST of splash points `{u, v, dir, spread}`, composited into one fleck texture set.
//
// The flecks are a different hue (gold) than the base (navy) — a normal map can't do that and a
// metallic frosting would gild the whole cake — so ONE fleck mask drives the wall material's albedo +
// metalness + roughness + emissive (+ optional glitter facet normal): satin-gold specks on a matte
// base. Developed in the admin Luster Dust Studio; this is the shared generator both it and the
// designer render from (no duplicated maths). `radius`/`height` come from the tier so flecks stay round
// and the splash lands where it was placed regardless of tier size.

// The look approved in the studio. `density` is flecks-per-splash; the material scalars (metalness,
// glow→emissiveIntensity, env→envMapIntensity, clearcoat) ride alongside the texture params so one
// object fully describes a dusting. A new splash point defaults to a straight-up flick.
export const LUSTER_DUST_DEFAULTS = {
  dustColor: '#f0cf63',
  directionality: 0.75, falloff: 1.6, scatter: 0.18,
  density: 2, fleckSize: 4, sizeVar: 0.5,
  sparkle: 0.36, glitter: 0.0, metalness: 0.2, glow: 0.0, env: 0.0, clearcoat: 0.15,
};
export const LUSTER_DUST_NEW_SPLASH = { dir: 90, spread: 0.8 };   // dir 90° = straight-up flick

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gaussOf(rnd) { return () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }

// Composite every splash of `splashes` (each {u, v, dir, spread}) into four/​five canvases (albedo /
// metalness / roughness / emissive / normal). Canvas aspect = circumference:height so flecks draw
// round; the textures map once (repeat 1) so splashes sit where they were placed. Each splash throws
// `density·240` flecks into a forward cone from its point: distance with a long tail (dense head →
// thinning), angle within ±cone of `dir` (clamped — never sprays backward), `scatter` flinging a
// fraction farther as bigger stray droplets. Canvas Y is inverted (texture upload flips Y; cake UV v=0
// is the bottom) so a 90° flick sprays UP and the splash lands exactly under the tap.
export function makeLusterDustMaps({
  radius = 1, height = 2.2, baseColor = '#1c2336', dustColor, density, fleckSize, sizeVar, sparkle,
  glitter, falloff, scatter, directionality, splashes = [], seed = 1337,
}) {
  const WU = 2 * Math.PI * radius;
  // Canvas aspect = wall circumference:height so flecks draw round. Cap the width (keeping aspect) so a
  // short/wide tier can't make a giant texture that fails to upload (→ a blank/white wall).
  const aspect = WU / Math.max(0.01, height);
  // Moderate resolution + NO mipmaps (below): on a big minified texture, mipmapping averages fine
  // flecks away to nothing, so the dust would be generated but invisible on screen.
  let Hc = 512, Wc = Math.round(Hc * aspect);
  if (Wc > 2048) { Wc = 2048; Hc = Math.round(2048 / aspect); }
  Hc = Math.max(8, Hc); Wc = Math.max(8, Wc);
  const mk = (bg) => { const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, Wc, Hc); return x; };
  const alb = mk(baseColor), met = mk('#000000'), rou = mk('#ffffff'), emi = mk('#000000'), nrm = mk('#8080ff');
  const fr = Math.round(sparkle * 255);
  const fanStd = (1 - directionality) * 0.95 + 0.08;
  const maxDev = Math.min(Math.PI, fanStd * 2.5);
  const maxTilt = glitter * 1.0;
  const draw = (ctx, px, py, rad, fill, core = 0.22) => {
    const g = ctx.createRadialGradient(px, py, rad * core, px, py, rad);
    g.addColorStop(0, fill); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
  };
  const fleck = (px, py, rad, bright, facet) => {
    const xs = px < rad ? [px, px + Wc] : px > Wc - rad ? [px, px - Wc] : [px];   // wrap the back seam
    for (const X of xs) {
      alb.globalAlpha = bright;       draw(alb, X, py, rad, dustColor);
      met.globalAlpha = bright;       draw(met, X, py, rad, '#ffffff');
      rou.globalAlpha = bright;       draw(rou, X, py, rad, `rgb(${fr},${fr},${fr})`);
      emi.globalAlpha = bright * 0.8; draw(emi, X, py, rad, '#ffffff');   // MASK — material.emissive tints it gold
      nrm.globalAlpha = 0.95;         draw(nrm, X, py, rad, facet, 0.55);
    }
  };
  splashes.forEach((sp, si) => {
    const rnd = mulberry(seed + si * 9173), gauss = gaussOf(rnd);
    const dir = sp.dir * Math.PI / 180;
    const N = Math.round(density * 240);
    for (let i = 0; i < N; i++) {
      const far = rnd() < scatter;
      const t = Math.pow(rnd(), falloff);
      // Reach scales with the tier HEIGHT (normalised to the studio's 2.2 reference) so the splash stays
      // proportional on any tier — otherwise on a short wall every fleck oversprays past v=1 and vanishes.
      const reach = sp.spread * (far ? 2.6 : 1) * (0.05 + t * 2.8) * (height / 2.2);
      let dev = gauss() * fanStd * (far ? 1.2 : 1);
      dev = Math.max(-maxDev, Math.min(maxDev, dev));
      const ang = dir + dev;
      let u = sp.u + Math.cos(ang) * reach / WU; u = ((u % 1) + 1) % 1;
      const v = sp.v + Math.sin(ang) * reach / height;
      if (v < 0 || v > 1) continue;
      const rad = fleckSize * (far ? 1.5 : 1) * (1 + (rnd() * 2 - 1) * sizeVar);
      const az = rnd() * Math.PI * 2, tilt = maxTilt * Math.sqrt(rnd());
      const nx = Math.sin(tilt) * Math.cos(az), ny = Math.sin(tilt) * Math.sin(az), nz = Math.cos(tilt);
      const facet = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},${Math.round((ny * 0.5 + 0.5) * 255)},${Math.round((nz * 0.5 + 0.5) * 255)})`;
      fleck(u * Wc, (1 - v) * Hc, Math.max(0.6, rad), 0.5 + rnd() * 0.5, facet);   // invert Y → lands at the tap
    }
  });
  const tex = (ctx, srgb) => { const t = new THREE.CanvasTexture(ctx.canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  return { map: tex(alb, true), metalnessMap: tex(met, false), roughnessMap: tex(rou, false), emissiveMap: tex(emi, true), normalMap: tex(nrm, false) };
}
