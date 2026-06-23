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
