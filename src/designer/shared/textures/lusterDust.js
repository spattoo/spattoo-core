import { finishCanvasSize, mkCtx, ctxTexture } from './finishCanvas.js';

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

// Stamp every splash of `splashes` (each {u, v, dir, spread}) onto the supplied canvas 2D contexts
// (albedo / metalness / roughness / emissive / normal). Each splash throws `density·240` flecks into a
// forward cone from its point: distance with a long tail (dense head → thinning), angle within ±cone of
// `dir` (clamped — never sprays backward), `scatter` flinging a fraction farther as bigger stray
// droplets. Canvas Y is inverted (texture upload flips Y; cake UV v=0 is the bottom) so a 90° flick
// sprays UP and lands exactly under the tap.
//
// `metalFill`/`roughFill` are the colours written on a fleck in the metalness/roughness maps. They
// default to the studio scheme (white metalness, sparkle-grey roughness — the material then supplies
// the metalness/roughness SCALAR). The unified compositor overrides them with ABSOLUTE greys so dust
// can share one material with gold-leaf at a different metalness/roughness.
export function stampDustFlecks({
  alb, met, rou, emi, nrm, Wc, Hc, WU, radius = 1, height = 2.2,
  dustColor, density, fleckSize, sizeVar, sparkle, glitter, falloff, scatter, directionality,
  splashes = [], seed = 1337, metalFill, roughFill,
}) {
  WU = WU ?? 2 * Math.PI * radius;
  const fr = Math.round(sparkle * 255);
  const mFill = metalFill ?? '#ffffff';
  const rFill = roughFill ?? `rgb(${fr},${fr},${fr})`;
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
      met.globalAlpha = bright;       draw(met, X, py, rad, mFill);
      rou.globalAlpha = bright;       draw(rou, X, py, rad, rFill);
      emi.globalAlpha = bright * 0.8; draw(emi, X, py, rad, '#ffffff');   // MASK — material.emissive tints it gold
      if (nrm) { nrm.globalAlpha = 0.95; draw(nrm, X, py, rad, facet, 0.55); }   // nrm optional (core doesn't bind it)
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
  alb.globalAlpha = met.globalAlpha = rou.globalAlpha = emi.globalAlpha = 1;
  if (nrm) nrm.globalAlpha = 1;
}

// Standalone dust map set (used by the admin Luster Dust Studio). Output is unchanged from before the
// stamp helper was extracted — the studio binds these with the metalness SCALAR.
export function makeLusterDustMaps({
  radius = 1, height = 2.2, baseColor = '#1c2336', dustColor, density, fleckSize, sizeVar, sparkle,
  glitter, falloff, scatter, directionality, splashes = [], seed = 1337,
}) {
  const { WU, Wc, Hc } = finishCanvasSize(radius, height);
  const alb = mkCtx(baseColor, Wc, Hc), met = mkCtx('#000000', Wc, Hc), rou = mkCtx('#ffffff', Wc, Hc),
        emi = mkCtx('#000000', Wc, Hc), nrm = mkCtx('#8080ff', Wc, Hc);
  stampDustFlecks({
    alb, met, rou, emi, nrm, Wc, Hc, WU, radius, height,
    dustColor, density, fleckSize, sizeVar, sparkle, glitter, falloff, scatter, directionality, splashes, seed,
  });
  return {
    map: ctxTexture(alb, true), metalnessMap: ctxTexture(met), roughnessMap: ctxTexture(rou),
    emissiveMap: ctxTexture(emi, true), normalMap: ctxTexture(nrm),
  };
}
