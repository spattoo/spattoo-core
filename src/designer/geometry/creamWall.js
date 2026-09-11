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
/* ⚠️ A STAR NOZZLE DRAGGED UP THE WALL, which is a different object from a corrugation.
 *
 * The first version modelled the wall as one continuous periodic ripple. That is not the technique.
 * The baker holds a STAR tip against a chilled cake and pulls it from the bottom to the top, then
 * moves along and does it again. What that leaves is a row of SEPARATE STROKES, and three things
 * follow from it that a ripple cannot express — all three were called out on sight, twice:
 *
 *   1. Each stroke has its OWN WIDTH. A hand does not space them evenly, and identical widths are
 *      the single loudest tell that a shape was generated. `vary` now moves the width as well as the
 *      depth, so no two neighbours match.
 *   2. Each stroke carries FINE RIDGES ALONG ITS LENGTH — the star's teeth, several per stroke.
 *      This is the detail that actually says "piped" rather than "moulded", and no amount of
 *      roundness or lean substitutes for it.
 *   3. A stroke is a RIBBON pressed on, not a half-round tube: it rises quickly off the groove and
 *      sits fairly flat across its face.
 *
 * ⚠️ THE WIDTHS MUST SUM TO EXACTLY ONE or the ±π seam splits. They are normalised here for that
 * reason, and the lookup wraps, so the last stroke meets the first exactly.
 */
const ropeHash = (i) => {
  // Deterministic per-stroke value in 0..1. A cake must look the same on every reload and on every
  // device — Math.random() here would render the same design differently twice.
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/* The wall's height field for ONE point around the cake, shared by the geometry and the relief
 * sampler so a decoration cannot seat on a wall that is no longer there.
 *
 * Returns f(frac) → 0..~1, where `frac` is the position around the cake in 0..1.
 */
/* ONE definition of what a star tip's section looks like, shared by the wall's vertical strokes and
 * the top's coil — they are the same nozzle, and a second copy of this curve is a second place for
 * the two to drift apart. `t` runs 0..1 across the stroke; returns ~0 at the grooves, ~1 at the face.
 *   body  — quick rise off the groove, flattish face (`round` < 1 flattens; see creamStyles).
 *   ridge — the tip's teeth running ALONG the stroke, fading at its edges so the groove between
 *           strokes stays the deepest line. This is the part that reads as piped.
 */
export function strokeSection(t, round, teeth, teethDepth) {
  const body  = Math.pow(Math.sin(Math.PI * t) ** 2, round);
  const ridge = teethDepth * Math.sin(Math.PI * t) * (0.5 - 0.5 * Math.cos(TAU * teeth * t));
  return body + ridge;
}

export function makeRopeField({ ropes, round, vary, teeth, teethDepth }) {
  // Per-stroke widths, normalised to sum to 1 — see the seam note above.
  const w = [], depth = [];
  let total = 0;
  for (let i = 0; i < ropes; i++) {
    const wi = 1 + vary * (ropeHash(i) - 0.5) * 2;
    w.push(wi); total += wi;
    depth.push(1 + vary * (ropeHash(i + 1000) - 0.5) * 2);
  }
  const edge = [0];
  for (let i = 0; i < ropes; i++) edge.push(edge[i] + w[i] / total);

  return (frac) => {
    const f = frac - Math.floor(frac);                  // wrap into 0..1
    // Which stroke, and where inside it. Linear scan: `ropes` is tens, and this runs per vertex on a
    // build, not per frame.
    let i = ropes - 1;
    for (let k = 1; k <= ropes; k++) if (f < edge[k]) { i = k - 1; break; }
    const t = (f - edge[i]) / (edge[i + 1] - edge[i]);  // 0..1 across THIS stroke
    return depth[i] * strokeSection(t, round, teeth, teethDepth);
  };
}

function displacePiped(geo, radius, { amp, ropes, round, vary, wobble, teeth, teethDepth }) {
  const a = amp * radius;
  const field = makeRopeField({ ropes, round, vary, teeth, teethDepth });
  return displaceSide(geo, (u, v) => {
    // A slow lean with height: depends only on v, so every stroke shifts together and the seam holds.
    const drift = wobble * Math.sin(TAU * v * 1.5 + 0.7) / ropes;
    return a * field(u / TAU + 0.5 + drift);
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
          vary: params.vary ?? 0.28, wobble: params.wobble ?? 0.10,
          teeth: params.teeth ?? 4, teethDepth: params.teethDepth ?? 0.18 });
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
      const ropes = params.ropes ?? 30, wobble = params.wobble ?? 0.10;
      // ⚠️ THE SAME FIELD THE GEOMETRY USES, imported rather than re-derived. A sampler that kept its
      // own copy of the profile is a second place for the two to disagree, and the symptom is a
      // decoration hovering off a wall that moved underneath it.
      const field = makeRopeField({
        ropes, round: params.round ?? 0.45, vary: params.vary ?? 0.28,
        teeth: params.teeth ?? 4, teethDepth: params.teethDepth ?? 0.18,
      });
      return (theta, v) => a * field(theta / TAU + 0.5 + wobble * Math.sin(TAU * v * 1.5 + 0.7) / ropes);
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

/* ── The cream SPIRAL on the tier top ──────────────────────────────────────────
 *
 * The other half of the piped reference cake: the same star tip, but laid in a COIL from the rim in
 * to the centre instead of dragged up the wall. It is the same nozzle, so it is `strokeSection` —
 * the wall's own profile — read across the coil instead of across a stroke.
 *
 * The spiral coordinate is `coils·(1 − r/R) + θ/τ`: one full turn per revolution, `coils` turns from
 * the rim to the middle, constant radial pitch (an Archimedean spiral, which is what a hand piping a
 * flat top actually makes). Its FRACTIONAL part is the position across the rope, and a fractional
 * part is blind to the ±1 jump at the θ = ±π seam, so the coil joins itself exactly.
 *
 * The centre gets a small MOUND — where the piping bag lifts off, a real spiral finishes in a peak,
 * and without it the coils crowd into a flat knot.
 */
export function makeSpiralField({ coils, round, teeth, teethDepth, centre }) {
  return (rFrac, theta) => {
    const s = coils * (1 - rFrac) + theta / TAU;
    const coil = strokeSection(s - Math.floor(s), round, teeth, teethDepth);
    const x = rFrac * coils;                       // distance from the middle, in coil widths
    return coil + centre * Math.exp(-x * x * 0.7);
  };
}

/* A disc built as a dense polar GRID, with a skirt at the rim that drops to y = 0.
 *
 * ⚠️ NOT `CircleGeometry`, and not a cylinder cap either: both are triangle FANS — every vertex sits
 * on the rim and there is nothing in between to displace, so a height field applied to one produces a
 * flat disc with a wavy edge. This carries interior vertices.
 *
 * `rim(θ)` is the outer radius, which VARIES: it traces the displaced wall's own crest line, so the
 * lid ends exactly where the wall surface is. The skirt then closes the remaining gap by dropping
 * each rim vertex to y = 0 — the wall's top edge — so the two weld shut at every angle instead of
 * leaving the undercut a constant-radius disc leaves.
 */
function polarDisc(rim, rNominal, rings, segs, h) {
  const pos = [], idx = [], uv = [];
  const push = (x, y, z) => { pos.push(x, y, z); uv.push(x / (2 * rNominal) + 0.5, z / (2 * rNominal) + 0.5); };
  const at = (frac, i) => {
    const theta = -Math.PI + TAU * i / segs;
    const r = rim(theta) * frac;
    push(r * Math.cos(theta), h(r / rNominal, theta), r * Math.sin(theta));
  };
  push(0, h(0, 0), 0);                                        // the centre is ONE vertex — a ring of
  for (let j = 1; j <= rings; j++)                            // coincident ones makes degenerate
    for (let i = 0; i < segs; i++) at(j / rings, i);          // triangles and NaN normals.
  const ring = (j) => 1 + (j - 1) * segs;                     // first vertex index of ring j
  for (let i = 0; i < segs; i++) idx.push(0, ring(1) + (i + 1) % segs, ring(1) + i);
  for (let j = 1; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const a = ring(j) + i, b = ring(j) + (i + 1) % segs;
      const c = ring(j + 1) + i, d = ring(j + 1) + (i + 1) % segs;
      idx.push(a, b, c, b, d, c);
    }
  const base = pos.length / 3;                                // skirt: the rim dropped to the wall top
  for (let i = 0; i < segs; i++) {
    const o = (ring(rings) + i) * 3;
    push(pos[o], 0, pos[o + 2]);
  }
  for (let i = 0; i < segs; i++) {
    const a = ring(rings) + i, b = ring(rings) + (i + 1) % segs;
    const c = base + i, d = base + (i + 1) % segs;
    idx.push(a, b, c, b, d, c);           // outward-facing: t̂ × (−ŷ) is the radial normal
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* The tier TOP for a styled cream finish, or `null` when the style leaves the top flat (every style
 * but `piped` today — the caller then renders the wall's own flat cap, exactly as before).
 *
 * ⚠️ ITS RIM IS NOT A CIRCLE. A displaced wall grows OUTWARD while the cylinder's flat cap stays at
 * the original radius, so the cap no longer reaches the wall: you look straight down the gap between
 * them at the board, and the crests standing above it read as a crown of spikes. Both were plainly
 * visible on the piped render. The rim therefore asks `makeWallReliefSampler` where the wall's crest
 * line actually is at v = 1 — the SAME function the geometry was built from, never a second guess at
 * it — and the skirt drops to meet it.
 */
export function buildStyledTop(wall, top, radius, height, params = {}) {
  if (top !== 'spiral') return null;
  const coils  = params.coils ?? 5;          // ≈ ropes/τ — the coil is as wide as a stroke (creamStyles)
  const relief = (params.relief ?? 0.06) * radius;
  const wallAt = makeWallReliefSampler(wall, radius, params, height);
  /* ⚠️ A HAIR WIDER than the crest it traces. The lid and the wall sample the circle at different
   * angles (different segment counts, and three's cylinder starts its θ elsewhere), so a rim sitting
   * exactly ON the crest line dips INSIDE the wall between samples and opens a pinhole there. The
   * margin is smaller than a chord, so it costs nothing visible and closes all of them. */
  const margin = 0.006 * radius;
  const rim = wallAt ? (theta) => radius + margin + Math.max(0, wallAt(theta, 1)) : () => radius + margin;
  // Across a coil the teeth have to resolve, so rings scale with the coil count; around, the teeth
  // run ALONG the coil and the rim is the longest arc, so the segment count stays high and fixed.
  const rings = Math.min(320, Math.max(120, coils * 22));
  const field = makeSpiralField({
    coils, round: params.round ?? 0.45,
    teeth: params.teeth ?? 4, teethDepth: params.teethDepth ?? 0.18,
    centre: params.centre ?? 0.9,
  });
  return polarDisc(rim, radius, rings, 360, (rFrac, theta) => relief * field(rFrac, theta));
}
