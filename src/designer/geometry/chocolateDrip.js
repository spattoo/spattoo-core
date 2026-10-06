import * as THREE from 'three';
import { TIER_RADII } from '../constants.js';

// Procedural CHOCOLATE-DRIP ring — the glossy ganache that floods the cake top, rolls over the rim
// and runs down the side in irregular tapered drips.
//
// WHY REAL GEOMETRY (not a decal / normal map): the look only reads as real when the drips BREAK THE
// SILHOUETTE — the tips genuinely stick out past the cake wall. A radial displacement can't make
// overhangs and a flat decal can't break the outline, so each drip is a real tapered tube built
// slightly proud of the wall (back buried in the cake, front bulging out).
//
// This module builds the drip TUBES (`buildDripGeometry`) and the connecting WEB (`buildDripWeb`).
// The rolled rim bead (and an optional top flood) are trivial THREE primitives the CONSUMER adds with
// the SAME chocolate material, so the pieces read as one connected pour. Material (colour / gloss)
// lives with the consumer so it can be tuned live without rebuilding geometry. This is the ONE source
// for the geometry — the designer (CakeTier) and the admin drip studio both import it (never a copy).
//
// Deterministic: a seeded LCG (no Math.random) so the drip pattern is reproducible and never shimmers
// between renders. Bump `seed` to roll a new pattern.

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function makeRng(seed) {
  let s = ((seed | 0) * 1103515245 + 12345) & 0x7fffffff;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Radius profile along one drip. t∈[0,1] runs from the rim (0) to the tip (1); W is this drip's
// half-width. Like the references: widest where it leaves the band, TAPERING THIN as it falls, then
// closing to a soft rounded point. `bead` (0 on most drips, a small value on a few) adds a subtle
// surface-tension droplet at the very tip — roughly drip-width, NOT a wide club foot.
function dripRadius(t, W, bead) {
  let r = W * Math.pow(1 - 0.5 * t, 0.6);                      // widest at top, MODERATE taper (stays full)
  r *= 1 + 0.04 * (1 - smoothstep(0, 0.3, t));                 // slight HEAD flare so the arches flow into it
  if (bead > 0) {
    const swell = smoothstep(0.66, 0.85, t) * (1 - smoothstep(0.85, 0.96, t));
    r += W * bead * swell;                                     // occasional small teardrop
  }
  // BLUNT, rounded (hemispherical) tip over the last 10% — never a sharp needle/icicle point.
  if (t > 0.9) { const x = (t - 0.9) / 0.1; r *= Math.sqrt(Math.max(0, 1 - x * x)); }
  return Math.max(r, 1e-4);
}

// Append one drip tube into shared pos/idx arrays. The tube is a generalised cylinder: vertical rings
// of `segs` verts, each ring centred on the wall at radius R+protrude (so the tube sits proud — outer
// face bulges out past R and breaks the silhouette, inner face is buried in the cake). The cross-
// section plane is spanned by e1 (outward radial) and e2 (tangential); its plane-normal is the
// downward tube axis, so winding below yields OUTWARD vertex normals after computeVertexNormals().
function appendDrip(pos, idx, { theta0, yTop, length, W, R, protrude, meander, bead, flat, samples, segs }) {
  const base = pos.length / 3;
  const cR = R + protrude;                                     // ring-centre radius (proud of wall)
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    // gentle lateral meander so the run isn't a ruler-straight line. Anchored at the TOP (t=0 → theta0)
    // so the drip head stays centred on its web shoulder; it only wanders as it falls.
    const theta = theta0 + meander * t;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const e1x = cosT, e1z = sinT;                              // outward radial
    const e2x = -sinT, e2z = cosT;                             // tangential (around the cake)
    const y = yTop - t * length;
    const rad = dripRadius(t, W, bead);
    for (let j = 0; j < segs; j++) {
      const a = j / segs * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rr = rad * flat;                                   // outward extent flattened (ribbon, not tube)
      const ox = ca * e1x * rr + sa * e2x * rad;               // e1 = radial (out), e2 = tangential (width)
      const oz = ca * e1z * rr + sa * e2z * rad;
      pos.push(cR * cosT + ox, y, cR * sinT + oz);
    }
  }
  const cos0 = Math.cos(theta0), sin0 = Math.sin(theta0);
  const cosE = Math.cos(theta0 + meander), sinE = Math.sin(theta0 + meander);
  const tipIndex = base + (samples + 1) * segs;
  pos.push(cR * cosE, yTop - length, cR * sinE);               // tip apex
  const topIndex = tipIndex + 1;
  pos.push(cR * cos0, yTop, cR * sin0);                        // top apex (tucks up into the web shoulder)

  // side quads — winding chosen so face normals point radially OUTWARD (verified by hand)
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < segs; j++) {
      const a = base + i * segs + j;
      const b = base + i * segs + (j + 1) % segs;
      const c = base + (i + 1) * segs + j;
      const d = base + (i + 1) * segs + (j + 1) % segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  // tip fan (last ring → tip apex), outward+down
  const lastRing = base + samples * segs;
  for (let j = 0; j < segs; j++) idx.push(lastRing + j, lastRing + (j + 1) % segs, tipIndex);
  // top fan (first ring → top apex), reversed so it faces up/out
  for (let j = 0; j < segs; j++) idx.push(base + (j + 1) % segs, base + j, topIndex);
}

export const DRIP_DEFAULTS = {
  count: 22,
  seed: 1,
  length: 0.55,        // world units: base run length (≈ fraction of the wall height)
  lengthVar: 0.6,      // 0..1: how much run length varies drip-to-drip
  width: 0.05,         // world units: drip half-width at the rim
  widthVar: 0.3,       // 0..1: width variation drip-to-drip
  protrude: 0.01,      // world units: how far the drip centre sits proud of the wall
  flat: 0.5,           // 0..1: outward squash of the cross-section — 1 = round tube, lower = flat ribbon
  meander: 0.12,       // radians: gentle lateral wander over a full run
  samples: 22,         // rings down each drip
  segs: 10,            // verts around each drip
  // connecting web (the scalloped band that joins the drips into one pour)
  webDepth: 0.16,      // world units: how far the band hangs at each drip (the scallop low points)
  archHeight: 0.11,    // world units: dome height of the arch between drips (≤ webDepth)
  webThick: 0.045,     // world units: how far the web sheet bulges proud of the wall (in the arches)
  shoulderBoost: 0.005, // world units: EXTRA bulge at each drip so the shoulder rounds out to meet the
};                      //              round drip pole (no flat-sheet step at the join)

// THE single source of drip placement, shared by the tubes AND the connecting web so their angles
// line up exactly. Deterministic from `seed`: angular jitter (uneven spacing), run length (with
// occasional long runners), width, and meander direction. The rng draw ORDER here is the contract —
// don't reorder it or the two meshes drift apart.
function computeDrips(p) {
  const rng = makeRng(p.seed);
  const step = (Math.PI * 2) / p.count;
  const drips = [];
  for (let i = 0; i < p.count; i++) {
    const jitter = (rng() - 0.5) * step * 0.7;
    const theta0 = i * step + jitter;
    let lenMul = 0.45 + rng() * 0.55;
    if (rng() < 0.15) lenMul = 1.0 + rng() * 0.4;
    const W = p.width * (1 - p.widthVar / 2 + rng() * p.widthVar);
    const meander = p.meander * (rng() * 2 - 1);
    // Small surface-tension teardrop on ~a third of drips. Derived from an INDEPENDENT hash of (seed,
    // i) so toggling beads never reshuffles the angles/lengths the user has been tuning.
    const h = ((p.seed * 374761393) + (i + 1) * 668265263) & 0x7fffffff;
    const bead = (h % 1000) / 1000 < 0.35 ? 0.18 + ((h >> 12) % 1000) / 1000 * 0.22 : 0;
    drips.push({ theta0, length: p.length * lenMul, W, meander, bead });
  }
  return drips;
}

// Build all drip tubes as ONE merged BufferGeometry sitting on a cake of radius R with its top at
// topY. `startDrop` lowers where each drip begins to fall — pass webDepth so the runs start from the
// bottom of the connecting web's scallop (the cusp between two arches), not from the bare rim.
export function buildDripGeometry({ R, topY, startDrop = 0, ...opts } = {}) {
  const p = { ...DRIP_DEFAULTS, ...opts };
  const pos = [], idx = [];
  for (const d of computeDrips(p)) {
    appendDrip(pos, idx, {
      theta0: d.theta0, yTop: topY - startDrop, length: d.length, W: d.W, R,
      protrude: p.protrude, meander: d.meander, bead: d.bead, flat: p.flat, samples: p.samples, segs: p.segs,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Thickness profile DOWN the web, f∈[0,1] from rim (0) to its lower edge (1): proud at the rim,
// rounding back toward the wall at the bottom so the band edge is a soft rounded lip, not a sharp cut.
function webThickProfile(f) {
  const up = 0.6 + 0.4 * smoothstep(0, 0.3, f);
  const down = 1 - smoothstep(0.55, 1.0, f);
  return 0.06 + 0.94 * (up * down);
}

const TAU = Math.PI * 2;

// Per-drip shoulders (centre angle + angular half-width), sorted — the ONE definition the web mesh AND
// the relief sampler share, so the arches and the "rest decor on top" surface never drift.
function dripShoulders(p, R) {
  return computeDrips(p)
    .map(d => ({ th: d.theta0, hw: d.W / R, length: d.length, W: d.W, bead: d.bead }))
    .sort((a, b) => a.th - b.th);
}

// Web lower-edge at angle th → { D, boost } (see buildDripWeb). Shared by the mesh + the sampler.
function webEdgeAt(ds, arch, webDepth, th) {
  const N = ds.length;
  let t = th;
  while (t < ds[0].th) t += TAU;
  while (t >= ds[0].th + TAU) t -= TAU;
  let a = ds[0], b = { th: ds[0].th + TAU, hw: ds[0].hw };
  for (let i = 0; i < N; i++) {
    const lo = ds[i].th, hi = (i + 1 < N) ? ds[i + 1].th : ds[0].th + TAU;
    if (t >= lo && t < hi) { a = ds[i]; b = (i + 1 < N) ? ds[i + 1] : { th: ds[0].th + TAU, hw: ds[0].hw }; break; }
  }
  const left = a.th + a.hw, right = b.th - b.hw;
  if (right <= left || t <= left || t >= right) return { D: webDepth, boost: 1 };
  const x = 2 * ((t - left) / (right - left)) - 1;
  const D = webDepth - arch * Math.sqrt(Math.max(0, 1 - x * x));
  const boost = 1 - smoothstep(0, 0.4, 1 - Math.abs(x));
  return { D, boost };
}

// Build the CONNECTING WEB — the continuous scalloped band that joins the drips into one pour. Its
// lower edge is FLAT at depth webDepth across each drip's own width (a "shoulder" the drip falls out
// of, so a wide drip never hangs off a thin point) and arcs up into a half-dome BETWEEN the drip
// edges, so the white cake shows through as rounded "semicircle" fingers. One continuous
// BufferGeometry; same angles + widths as the tubes (shared computeDrips), so the shoulders line up
// exactly under the drips.
export function buildDripWeb({ R, topY, ...opts } = {}) {
  const p = { ...DRIP_DEFAULTS, ...opts };
  const arch = Math.min(p.archHeight, p.webDepth);             // keep depth ≥ 0
  // each drip → its centre angle and angular HALF-WIDTH (the shoulder = drip radius, no ledge). The
  // lower edge is flat webDepth inside a shoulder, and arcs up to (webDepth-arch) at the midpoint
  // BETWEEN drip edges; `boost` rounds the sheet out at each drip to meet the round pole.
  const ds = dripShoulders(p, R);

  const Nth = Math.max(220, p.count * 14), Nj = 8;
  const pos = [], idx = [];
  for (let i = 0; i < Nth; i++) {
    const th = i / Nth * TAU;
    const cosT = Math.cos(th), sinT = Math.sin(th);
    const { D, boost } = webEdgeAt(ds, arch, p.webDepth, th);
    for (let j = 0; j <= Nj; j++) {
      const f = j / Nj;
      const rad = R + 0.004 + (p.webThick + boost * p.shoulderBoost) * webThickProfile(f);
      pos.push(rad * cosT, topY - D * f, rad * sinT);
    }
  }
  const at = (i, j) => (i % Nth) * (Nj + 1) + j;
  for (let i = 0; i < Nth; i++) {
    for (let j = 0; j < Nj; j++) {
      const v0 = at(i, j), v1 = at(i + 1, j), v2 = at(i, j + 1), v3 = at(i + 1, j + 1);
      idx.push(v0, v1, v2, v1, v3, v2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// World-units depth the drips should overlap UP into the web shoulder (so the run and the shoulder
// are one seamless piece — no gap, no thin neck). The render passes startDrop = webDepth − this.
export const DRIP_WEB_OVERLAP = 0.09;

// THE single derivation of the per-tier drip params, shared by the render (TopDripRing) and the relief
// sampler so they describe the exact same chocolate. Authored params are tuned at the standard bottom
// tier; all LINEAR dims scale with the tier radius (count / *Var / flat / meander are unitless). The
// customer Length dial multiplies the base run. Returns the scaled params + the derived startDrop/lip.
export function dripRenderParams(config, radius, lengthMul = 1) {
  const cfg = { ...DRIP_DEFAULTS, ...(config ?? {}) };
  const s = radius / TIER_RADII[0];
  const params = {
    ...cfg,
    length:        cfg.length * lengthMul * s,
    width:         cfg.width * s,
    protrude:      cfg.protrude * s,
    webDepth:      cfg.webDepth * s,
    archHeight:    cfg.archHeight * s,
    webThick:      cfg.webThick * s,
    shoulderBoost: cfg.shoulderBoost * s,
  };
  const startDrop = Math.max(0, params.webDepth - DRIP_WEB_OVERLAP * s);
  const lipR = (cfg.lipRadius ?? 0.05) * s;
  return { params, startDrop, lipR, s };
}

// Build a RELIEF sampler for the drip: (theta, v) → radial protrusion of the chocolate at that point
// (world units, 0 where there's bare wall). Same signature as makeWallReliefSampler, so the designer
// composes it into a tier's relief field and side decor (sprinkles) rests ON the chocolate where it
// exists and nestles on bare wall in the open arch pockets. `params`/`startDrop` come from
// dripRenderParams (so this matches the rendered mesh exactly). theta uses the geometry convention
// (x=cos θ, z=sin θ), which is what the side-decor seater already passes the sampler.
export function makeDripReliefSampler({ params, R, height, startDrop }) {
  const p = params;
  const arch = Math.min(p.archHeight, p.webDepth);
  const ds = dripShoulders(p, R);                              // precompute once (sampler is hot)
  return (theta, v) => {
    const depthFromTop = (1 - v) * height;                     // world units below the rim (topY)
    if (depthFromTop < 0) return 0;
    let relief = 0;
    // Web band: from the rim down to its lower edge D(theta).
    const { D, boost } = webEdgeAt(ds, arch, p.webDepth, theta);
    if (depthFromTop <= D && D > 1e-6) {
      relief = 0.004 + (p.webThick + boost * p.shoulderBoost) * webThickProfile(depthFromTop / D);
    }
    // Drip runs: the proud pole at each drip, over its own vertical span.
    for (const d of ds) {
      let dth = Math.abs(theta - d.th) % TAU; if (dth > Math.PI) dth = TAU - dth;
      if (dth > d.hw || depthFromTop < startDrop || depthFromTop > startDrop + d.length) continue;
      const t = (depthFromTop - startDrop) / d.length;
      const rr = p.protrude + dripRadius(t, d.W, d.bead) * p.flat;
      if (rr > relief) relief = rr;
    }
    return relief;
  };
}

/* ── Two chocolates in one pour ──────────────────────────────────────────────────────────────────
 *
 * Sandeep, at a gender-reveal cake poured pink one side and blue the other: *"we should allow multi
 * color drip. when the top is also flooded, then we should devide the top area between colors. and
 * the split should be natual, like a liquid, not geometry like of equal parts. should look like
 * natual."*
 *
 * ⚠️ THE BOUNDARY IS THE WHOLE FEATURE, AND AN ANGLE IS NOT ONE. Two colours split at exactly θ=0
 * and θ=π is a pie chart: a dead straight radius across the top and a ruler-straight line down the
 * wall, which reads as masking tape rather than as two sauces poured against each other. What makes
 * it liquid is that the line WANDERS — and wanders by more in the open middle of the top than at the
 * rim, because that is where a pour has room to spread before it meets the edge it is held by.
 *
 * ⚠️ SO THE WOBBLE IS DAMPED TOWARD THE RIM, AND THAT IS NOT A LOOK, IT IS WHAT MAKES THE TOP AND
 * THE SIDE AGREE. The drips hanging off the edge have to be the colour of the flood directly above
 * them, or the cake reads as two unrelated decorations. Both ask this one function, and at the rim
 * (r → R) the answer is nearly the same angle for both, so the split arrives at the edge and runs
 * straight down. The alternative — one rule for the top and another for the wall — is how they come
 * to disagree at exactly the place everybody looks.
 *
 * ⚠️ AND THE BLEED IS NARROW. A wide blend is an airbrushed gradient, which is a different product;
 * two ganaches meeting leave a short mixed seam and then stop. `bleed` is a fraction of a full turn.
 *
 * Deterministic from `seed`, like every other number in this file: a drip that reshuffles its split
 * between renders is a different cake each time it is looked at (see makeRng).
 */
export const DRIP_SPLIT_DEFAULTS = {
  axis:   0.35,    // turns: which way the pour runs. Not 0, so the seam is not square to the camera.
  wobble: 0.26,    // × the cake radius: how far the seam wanders either side of straight
  bleed:  0.05,    // × the cake radius: the width of the mixed seam where two ganaches meet
};

/* How far the seam wanders, at a point `t` ALONG its own length (in radii). Three incommensurate
   waves, so the line never repeats across the cake — the same reasoning the rope's swell uses. */
function seamWander(t, seed) {
  return Math.sin(t * 2.1 + seed * 1.7)
       + Math.sin(t * 3.9 + seed * 3.1) * 0.42
       + Math.sin(t * 6.7 + seed * 5.9) * 0.18;
}

/**
 * Which chocolate a point belongs to.
 *
 * @returns {{ i: number, j: number, t: number }} — blend `t` from colour `i` to colour `j`.
 *
 * ⚠️ THE SEAM RUNS ACROSS THE CAKE, IT DOES NOT RADIATE FROM THE MIDDLE. My first cut split by
 * ANGLE, which is the obvious reading of "divide the top between the colours" and is wrong in a way
 * that only a render shows: colouring by θ makes the boundary a RADIUS by construction, so two
 * chocolates meet at the centre as two wedges. That is a pie chart — precisely the *"geometry like
 * of equal parts"* Sandeep ruled out — and no amount of wobble on the angle fixes it, because every
 * wobbled radius is still a radius. The reference is one wandering line crossing the whole top, pink
 * one side and blue the other.
 *
 * So the field is a PROJECTION onto a direction, not a turn: `d` is how far along the pour a point
 * lies, and the bands are slices of that. The wander is a function of the distance ACROSS the pour,
 * which is what makes the line wavy ALONG its length rather than merely rotated.
 *
 * ⚠️ AND THE SAME FUNCTION ANSWERS FOR THE WALL, WHICH IS WHY A DRIP MATCHES THE FLOOD ABOVE IT.
 * A drip hangs just proud of the rim, so it projects onto the same axis and lands in the same band
 * as the chocolate directly above. The seam crosses the rim at two opposite points and the drips
 * change colour there — which is exactly what the reference cake does. One rule for the top and
 * another for the side is how they come to disagree at the place everybody looks.
 */
export function dripColorAt(x, z, { n = 2, seed = 1, R = 1, axis, wobble, bleed } = {}) {
  if (!(n > 1)) return { i: 0, j: 0, t: 0 };
  const ax = axis   ?? DRIP_SPLIT_DEFAULTS.axis;
  const w  = wobble ?? DRIP_SPLIT_DEFAULTS.wobble;
  const b  = bleed  ?? DRIP_SPLIT_DEFAULTS.bleed;
  const r  = R || 1;

  const a = ax * TAU;
  const dirX = Math.sin(a), dirZ = Math.cos(a);
  // Along the pour, and across it — both in radii, so a 6" and a 10" cake split the same way.
  const along  = (x * dirX + z * dirZ) / r;
  const across = (x * -dirZ + z * dirX) / r;

  // −1 … 1 across the cake, pushed about by the wander. Clamped, so a drip hanging past the rim
  // belongs to the band it fell from rather than to one beyond the edge.
  const d = Math.max(-1, Math.min(1, along + seamWander(across, seed) * (w / 1.6)));
  const u = (d + 1) / 2;                      // 0 … 1

  const span = 1 / n;                         // each chocolate owns this much of the way across
  const i    = Math.max(0, Math.min(n - 1, Math.floor(u / span)));
  // Distance to the seam ABOVE this band, in the same units as `bleed`.
  const seamAt = (i + 1) * span;
  const gap    = (seamAt - u) * 2;             // back into radii (u spans 2 radii)
  const half   = b / 2;
  if (i < n - 1 && gap < half) {
    return { i, j: i + 1, t: smoothstep(0, 1, (half - gap) / (2 * half)) };
  }
  const seamBelow = i * span;
  const gapBelow  = (u - seamBelow) * 2;
  if (i > 0 && gapBelow < half) {
    return { i: i - 1, j: i, t: smoothstep(0, 1, 0.5 + gapBelow / (2 * half)) };
  }
  return { i, j: i, t: 0 };
}

/**
 * Paint a drip mesh with its chocolates, as vertex colours.
 *
 * ⚠️ VERTEX COLOURS RATHER THAN SEPARATE MESHES PER COLOUR, because the boundary runs THROUGH the
 * geometry: splitting the web into two meshes would need the seam cut exactly, and a cut seam is a
 * visible edge — the one thing a liquid join must not have. One mesh, one material, the colour
 * carried on the verts and multiplied in. The material keeps `color: white` and `vertexColors: true`.
 */
export function paintDripColors(geo, colors, opts = {}) {
  if (!geo?.attributes?.position) return geo;
  /* ⚠️ AND IT TAKES THE PAINT OFF AGAIN. Geometry here is memoised on its SHAPE, so the same object
     survives a colour change — drop from two chocolates back to one and a stale `color` attribute
     would keep tinting a mesh whose material has gone back to a flat colour. */
  if (!Array.isArray(colors) || colors.length < 2) { geo.deleteAttribute('color'); return geo; }
  const pos = geo.attributes.position;
  const rgb = colors.map(c => new THREE.Color(c));
  const out = new Float32Array(pos.count * 3);
  const mix = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const { i, j, t } = dripColorAt(pos.getX(v), pos.getZ(v), { ...opts, n: colors.length });
    mix.copy(rgb[i]);
    if (t > 0) mix.lerp(rgb[j], t);
    out[v * 3] = mix.r; out[v * 3 + 1] = mix.g; out[v * 3 + 2] = mix.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

/**
 * The pool of chocolate flooding the tier top, as a mesh the split can actually be seen on.
 *
 * ⚠️ A `cylinderGeometry` CAP CANNOT CARRY THIS. Three's cylinder closes its ends with a fan — one
 * vertex at the centre and one ring at the edge — so a boundary painted across it can only ever be a
 * straight line from the middle to the rim, whatever the wander says. That is the pie chart the
 * split exists to avoid, and it would have looked correct in code and wrong on the cake. Concentric
 * rings give the line somewhere to bend.
 *
 * The underside is omitted: it sits on the cake top and is never seen, and the rings are the only
 * reason this exists.
 */
/* ⚠️ THE RESOLUTION IS SET BY THE SEAM, NOT BY THE DISC. A flat pool needs almost no geometry — two
   rings would draw it — but the chocolates' boundary is painted on these verts, so the mesh is as
   fine as the line has to be smooth. At 18 rings the seam came out as a visible sawtooth where it
   ran nearly along a ring: the colour was right and the EDGE was faceted, which reads as a cut-out
   rather than a pour. 44 x 192 is ~8.5k verts for one disc, which is nothing beside the drips
   themselves, and the step disappears. */
export function buildDripFlood({ R = 1, h = 0.03, rings = 44, segs = 192 } = {}) {
  const pos = [], idx = [];
  const yTop = h / 2, yBot = -h / 2;
  // ── Top face, ring by ring ──
  pos.push(0, yTop, 0);                                  // centre
  for (let ri = 1; ri <= rings; ri++) {
    const r = R * (ri / rings);
    for (let si = 0; si < segs; si++) {
      const a = (si / segs) * TAU;
      pos.push(Math.sin(a) * r, yTop, Math.cos(a) * r);
    }
  }
  const ringStart = ri => 1 + (ri - 1) * segs;           // vertex index of the first vert in ring ri
  /* ⚠️ THE CENTRE FAN WINDS THE SAME WAY AS THE RINGS. Reversed, it faces DOWNWARDS and back-face
     culling opens a small hole at the middle of the pool — the cake's own colour showing through a
     disc that is supposed to be chocolate. Visible as a dot, easy to read as a lighting artefact. */
  for (let si = 0; si < segs; si++) {
    idx.push(0, ringStart(1) + si, ringStart(1) + ((si + 1) % segs));
  }
  for (let ri = 1; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ringStart(ri) + si, b = ringStart(ri) + ((si + 1) % segs);
      const c = ringStart(ri + 1) + si, d = ringStart(ri + 1) + ((si + 1) % segs);
      idx.push(a, d, b, a, c, d);
    }
  }
  // ── The thin wall at the edge, so the pool has a visible depth where it meets the rim bead ──
  const wallTop = pos.length / 3;
  for (let si = 0; si < segs; si++) {
    const a = (si / segs) * TAU;
    pos.push(Math.sin(a) * R, yTop, Math.cos(a) * R);
  }
  const wallBot = pos.length / 3;
  for (let si = 0; si < segs; si++) {
    const a = (si / segs) * TAU;
    pos.push(Math.sin(a) * R, yBot, Math.cos(a) * R);
  }
  for (let si = 0; si < segs; si++) {
    const n = (si + 1) % segs;
    idx.push(wallTop + si, wallBot + si, wallTop + n, wallTop + n, wallBot + si, wallBot + n);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
