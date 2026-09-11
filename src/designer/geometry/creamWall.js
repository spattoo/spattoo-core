import * as THREE from 'three';
import { displaceCreamWaveCylinder, creamWaveFieldFor } from '../shared/textures/creamWaveTexture.js';
import { makeWeaveField, weaveTiles } from '../shared/textures/weaveStencilTexture.js';

// ── Styled cream walls — geometry strategies for the frosting STYLE axis ───────
//
// `buildStyledWall(wall, radius, height)` returns a tier-body BufferGeometry for a textured cream
// finish, or `null` for 'smooth' (the caller then uses the plain cylinder + lid path, unchanged).
// Each non-smooth style is a radial DISPLACEMENT of a dense cylinder's SIDE wall (caps stay flat),
// so the texture genuinely projects and breaks the silhouette — a normal map can't. Amplitudes scale
// with `radius` so the relief stays a constant fraction of the cake across tier sizes.

const TAU = Math.PI * 2;

// Side tessellation dense enough to resolve the displacement without faceting. `heightSeg` matters
// most for WAVE's thin proud lines — too coarse and the lines break up; the wave case asks for more.
function denseCylinder(radius, height, radial = 220, heightSeg = 140) {
  return new THREE.CylinderGeometry(radius, radius, height, radial, heightSeg);
}

// Displace only side vertices (|normal.y| small) radially by fn(u,v); recompute normals so the
// shading is real. u = angle (−π..π, seamless), v = 0..1 up the wall.
function displaceSide(geo, fn) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, yMin = bb.min.y, yH = (bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (Math.abs(n.y) > 0.5) continue;          // cap vertex — leave flat
    p.fromBufferAttribute(pos, i);
    const r = Math.hypot(p.x, p.z) || 1e-6;
    const u = Math.atan2(p.z, p.x);
    const v = (p.y - yMin) / yH;
    const sc = (r + fn(u, v)) / r;
    pos.setXYZ(i, p.x * sc, p.y, p.z * sc);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// SWIRL — helical corrugation: ridges that wrap diagonally up the cake (a piped-rope swirl). `lobes`
// ridges around, `twist` turns up the height. Integer lobes keep the seam at ±π continuous. `amp` is
// a coefficient of radius (so the relief stays proportional across tiers).
function displaceSwirl(geo, radius, { amp, lobes, twist }) {
  const a = amp * radius;
  return displaceSide(geo, (u, v) => a * Math.sin(lobes * u + twist * v * TAU));
}

// RIBBED — fat rounded HORIZONTAL ribs stacked up the wall (the "rib-comb" buttercream finish):
// `bands` semicircular tubes, each sitting proud with a thin shadow groove between, constant all the
// way around (no undulation). One shared 0..1 profile so the geometry AND the relief sampler read the
// SAME shape. sin²(π·frac) is a rounded tube — 0 at the groove, 1 at the crest; `round` is an exponent
// that fattens (>1) / flattens (<1) the tube. POSITIVE-only (ribs project outward, unlike wave's
// zero-net lines) → the wall radius grows ~amp/2, like real piled-on ribs.
export function ribbedProfile(v, bands, round = 1) {
  const frac = v * bands - Math.floor(v * bands);
  const s = Math.sin(Math.PI * frac);
  return Math.pow(s * s, round);
}

// `amp` is a coefficient of radius (relief stays proportional across tiers).
function displaceRibbed(geo, radius, { amp, bands, round }) {
  const a = amp * radius;
  return displaceSide(geo, (_u, v) => a * ribbedProfile(v, bands, round));
}

/* PIPED — the SAME rounded tube, stood on end: vertical ropes run bottom to top, the way a star tip
 * is dragged straight up a chilled cake. `ribbedProfile` on the ANGLE axis instead of the height one,
 * and that is the whole difference between the two finishes.
 *
 * ⚠️ WHY NOT `swirl` WITH twist 0, which also gives vertical ridges. Two reasons, both visible:
 *   • swirl is a plain `sin`, so the crest is as sharp as the groove and the wall reads as a PLEATED
 *     lampshade. `ribbedProfile` is sin²(π·frac) — a rounded tube with a thin shadow groove between,
 *     which is what a piped rope actually looks like.
 *   • swirl is ZERO-NET: half the wave cuts INSIDE the original radius. The flat cap stays at full
 *     radius, so it overhangs the grooves and you see daylight under the rim — visible on the real
 *     scene at amp 0.09. This profile is POSITIVE-ONLY, like `ribbed`: the wall only ever grows
 *     outward, so the cap sits flush on the groove line and there is nothing to see under.
 *
 * Integer `ropes` keeps the ±π seam continuous, the same rule swirl's integer lobes follow: u/τ+0.5
 * runs 0..1 across the seam and sin(0) = sin(π) = 0, so the groove lands exactly on the join. */
/* ⚠️ AND IT HAS TO BE IRREGULAR, or it reads as a FLUTED VASE rather than as cream.
 *
 * A perfectly periodic profile is the signature of a manufactured object — turned, moulded or
 * extruded. Nothing about the lighting or the material rescues it; it was called "paper" on sight.
 * A baker holds a bag and drags it up a chilled cake by hand, so real ropes differ in thickness and
 * wander a little on the way up. Two cheap deviations buy all of that:
 *
 *   vary   per-rope DEPTH. Each rope keeps its own multiplier the whole way up, so one is fatter
 *          than its neighbour exactly as a hand-squeezed one is.
 *   wobble a slow ANGULAR drift with height, so a rope leans instead of running dead plumb.
 *
 * ⚠️ BOTH MUST SURVIVE THE ±π SEAM. `wobble` depends only on v, so it shifts every rope together and
 * cannot open a gap. `vary` is indexed by rope MODULO the count, so the rope at u = −π and the rope
 * at u = +π are the same rope and get the same multiplier. Index by raw floor() instead and the
 * cake has one visible vertical scar down the back.
 */
const ropeHash = (i) => {
  // Deterministic per-rope value in 0..1. A cake must look the same on every reload and on every
  // device — Math.random() here would make the same design render differently twice.
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function displacePiped(geo, radius, { amp, ropes, round, vary, wobble }) {
  const a = amp * radius;
  return displaceSide(geo, (u, v) => {
    const drift = wobble * Math.sin(TAU * v * 1.5 + 0.7) / ropes;   // scaled by rope width
    const f = u / TAU + 0.5 + drift;
    const idx = ((Math.floor(f * ropes) % ropes) + ropes) % ropes;  // modulo → seam-safe
    const depth = 1 + vary * (ropeHash(idx) - 0.5) * 2;
    return a * depth * ribbedProfile(f, ropes, round);
  });
}

// Bilinear sample of a height field at (fu, fv) given in TILE units, wrapping to [0,1) on both axes.
// Shared by the image-relief displacement and the weave relief sampler so both read the field the same.
export function sampleFieldWrap(field, fu, fv) {
  const { height, w, h } = field;
  const fx = (((fu % 1) + 1) % 1) * w;
  const fy = (((fv % 1) + 1) % 1) * h;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
  const tx = fx - x0, ty = fy - y0;
  const a = height[y0 * w + x0], b = height[y0 * w + x1], c = height[y1 * w + x0], d = height[y1 * w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// Displace a dense cylinder's SIDE by sampling an image height FIELD (bilinear, wrapping both axes),
// with a rim fade so the top/bottom edges relax to the wall (no spikes) and caps stay flat. For
// photo/stamp-derived rustic finishes. `relief` is in world units; `repeatX/Y` tile the field.
export function displaceByHeightField(geo, field, { repeatX = 1, repeatY = 1, relief = 0.08, rimFade = 0.1 } = {}) {
  const sample = (u, v) => sampleFieldWrap(field, u * repeatX, v * repeatY);
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  geo.computeBoundingBox();
  const bb = geo.boundingBox, yMin = bb.min.y, yH = (bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (Math.abs(n.y) > 0.5) continue;                 // cap vertex — leave flat
    p.fromBufferAttribute(pos, i);
    const r = Math.hypot(p.x, p.z) || 1e-6;
    const u = Math.atan2(p.z, p.x) / TAU + 0.5;
    const v = (p.y - yMin) / yH;
    const mask = ss(0, rimFade, v) * ss(0, rimFade, 1 - v);   // relax displacement at the rims
    const sc = (r + relief * sample(u, v) * mask) / r;
    pos.setXYZ(i, p.x * sc, p.y, p.z * sc);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// `params` is the resolved style param set (defaults ← authored overrides) from creamStyles.js.
// `relief`/`amp` are coefficients of radius; the rest map straight onto the field/strategy.
export function buildStyledWall(wall, radius, height, params = {}) {
  if (!wall || wall === 'smooth') return null;          // smooth → caller uses the plain cylinder
  switch (wall) {
    case 'wave': {
      // The admin-approved cream-wave field; schema defaults match its approved params. `relief` is a
      // coefficient of radius (admin tuned on a radius-1 cylinder); mesh height-segs scale with bands.
      const ridges = params.ridges ?? 6;
      const heightSeg = Math.min(440, Math.max(200, ridges * 50));
      const geo = denseCylinder(radius, height, 256, heightSeg);
      return displaceCreamWaveCylinder(geo, {
        relief: (params.relief ?? 0.06) * radius,
        ridges, lobes: params.lobes ?? 2, waveAmp: params.waveAmp ?? 0.35,
        ribbonW: params.ribbonW ?? 0.05, falloff: params.falloff ?? 0.4,
      });
    }
    case 'swirl':  return displaceSwirl(denseCylinder(radius, height, 220, 160), radius,
      { amp: params.amp ?? 0.045, lobes: params.lobes ?? 9, twist: params.twist ?? 3.0 });
    case 'ribbed': {
      // Horizontal ribs need height tessellation that scales with band count (else the tubes facet);
      // around the cake they're constant, so the radial count can stay modest.
      const bands = params.bands ?? 12;
      const heightSeg = Math.min(440, Math.max(200, bands * 24));
      return displaceRibbed(denseCylinder(radius, height, 160, heightSeg), radius,
        { amp: params.relief ?? 0.04, bands, round: params.round ?? 1.0 });
    }
    case 'piped': {
      // Vertical ropes need RADIAL tessellation that scales with the rope count (else the tubes
      // facet) — the mirror of ribbed, which scales height segments instead. Up the wall they are
      // constant, so the height count can stay modest.
      const ropes = params.ropes ?? 30;
      const radial = Math.min(512, Math.max(220, ropes * 12));
      // Height segments carry the WOBBLE now, so they can no longer be a token 64.
      return displacePiped(denseCylinder(radius, height, radial, 96), radius,
        { amp: params.relief ?? 0.06, ropes, round: params.round ?? 0.45,
          vary: params.vary ?? 0.28, wobble: params.wobble ?? 0.10 });
    }
    case 'weave': {
      // Woven stencil — a shallow REAL displacement of the pinwheel field (the crisp lines ride on top
      // as a normal map, baked from the same field in CakeTier). Tessellation scales with the line
      // count so the grooves don't facet; the normal map carries any detail finer than the mesh.
      const { around, up } = weaveTiles(radius, height, params.tile ?? 0.8);
      const grooves = params.grooves ?? 5;
      // Diagonal grooves alias into "beads" on a coarse quad grid — need dense tessellation on BOTH
      // axes; the normal map carries anything finer than the mesh, so displacement stays shallow.
      const radial    = Math.min(512, Math.max(320, around * grooves * 6));
      const heightSeg = Math.min(512, Math.max(280, up * grooves * 8));
      const field = makeWeaveField(512, { grooves, width: params.width ?? 0.5, border: params.border ?? 0 });
      return displaceByHeightField(denseCylinder(radius, height, radial, heightSeg), field,
        { repeatX: around, repeatY: up, relief: (params.relief ?? 0.015) * radius, rimFade: 0.08 });
    }
    default:       return denseCylinder(radius, height);
  }
}

// Sampler for the SAME wall surface buildStyledWall builds: given a point's geometry angle `theta`
// (= atan2(z, x), radians) and height fraction `v` ∈ [0,1], returns the wall's RADIAL displacement
// (world units) there — i.e. the live surface height, so decor can seat on the wavy wall instead of a
// fixed offset. Mirrors each displacement strategy exactly (reuses the wave field; same swirl formula).
// Returns null for non-displacing walls (smooth / normal-map finishes) → caller treats as flat.
export function makeWallReliefSampler(wall, radius, params = {}, wallHeight = radius) {
  switch (wall) {
    case 'wave': {
      const field  = creamWaveFieldFor({
        ridges: params.ridges, lobes: params.lobes, waveAmp: params.waveAmp,
        ribbonW: params.ribbonW, falloff: params.falloff,
      });
      const relief = (params.relief ?? 0.06) * radius;
      return (theta, v) => relief * field.height(theta / TAU + 0.5, v) * field.reliefMask(v);
    }
    case 'swirl': {
      const a = (params.amp ?? 0.045) * radius;
      const lobes = params.lobes ?? 9, twist = params.twist ?? 3.0;
      return (theta, v) => a * Math.sin(lobes * theta + twist * v * TAU);
    }
    case 'ribbed': {
      const a = (params.relief ?? 0.04) * radius;
      const bands = params.bands ?? 12, round = params.round ?? 1.0;
      return (_theta, v) => a * ribbedProfile(v, bands, round);   // constant around → depends only on v
    }
    case 'piped': {
      const a = (params.relief ?? 0.06) * radius;
      const ropes = params.ropes ?? 30, round = params.round ?? 0.45;
      const vary = params.vary ?? 0.28, wobble = params.wobble ?? 0.10;
      // ⚠️ Mirrors displacePiped EXACTLY, drift and per-rope depth included. A sampler that kept the
      // tidy periodic version would seat decorations on a wall that is no longer there.
      return (theta, v) => {
        const f = theta / TAU + 0.5 + wobble * Math.sin(TAU * v * 1.5 + 0.7) / ropes;
        const idx = ((Math.floor(f * ropes) % ropes) + ropes) % ropes;
        return a * (1 + vary * (ropeHash(idx) - 0.5) * 2) * ribbedProfile(f, ropes, round);
      };
    }
    case 'weave': {
      // Same field & tiling as buildStyledWall's weave case, so decor seats on the real groove relief.
      const { around, up } = weaveTiles(radius, wallHeight, params.tile ?? 0.8);
      const field  = makeWeaveField(256, { grooves: params.grooves ?? 5, width: params.width ?? 0.5, border: params.border ?? 0 });
      const relief = (params.relief ?? 0.015) * radius;
      return (theta, v) => relief * sampleFieldWrap(field, (theta / TAU + 0.5) * around, v * up);
    }
    default: return null;
  }
}
