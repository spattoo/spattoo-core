import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Second cream layer — a second buttercream "skin" applied over part of a cake
// tier with an irregular torn top edge, standing slightly proud of the base wall
// so it reads as an elevated colour band (see the pink/red two-tone references).
//
// The boundary on the cylindrical side wall is a 1-D function h(θ): for each angle
// around the cake the band fills from the bottom up to some height. We store that
// as a resolution-independent array of fractions (0..1 of the wall height); the
// customer authors it at runtime by "scraping" the edge while the cake spins.
//
// Geometry is REAL (an offset shell + a top ledge), not a normal map — the raised
// lip and its shadow are the whole point of the look, and a flat fake reads wrong
// (same call we made on the cream-wave finish).
//
// Pure geometry (THREE only) — shared by the designer render and the admin studio.
// ─────────────────────────────────────────────────────────────────────────────

export const SECOND_CREAM_DEFAULTS = {
  lift: 0.04,        // how far the band stands proud of the base wall (raised lip)
  noise: 0.05,       // coherent jitter added to the torn edge (0 = exactly as drawn)
  fillSide: 'below', // 'below' = colour fills from the bottom up to h(θ) (the refs);
                     // 'above' = colour fills from h(θ) up to the rim
  segments: 256,     // angular tessellation of the rendered band
  profileLen: 96,    // resolution of the authored edge array
};

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// Deterministic RNG so a given seed always yields the same torn jitter.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A flat starting edge — the customer (or a preset) overwrites it. Exported so the
// studio and core seed identical defaults.
export function flatProfile(len = SECOND_CREAM_DEFAULTS.profileLen, frac = 0.5) {
  return new Array(len).fill(frac);
}

// Resample an authored edge array to `n` angular samples (wrapping around the
// circle), then add coherent torn jitter. Returns fractions in 0..1.
export function sampleProfile(edge, n, noise = 0, seed = 1) {
  const out = new Array(n);
  const m = Array.isArray(edge) ? edge.length : 0;
  for (let i = 0; i < n; i++) {
    if (m >= 2) {
      const t = (i / n) * m;
      const i0 = Math.floor(t) % m;
      const i1 = (i0 + 1) % m;
      const f = t - Math.floor(t);
      out[i] = edge[i0] * (1 - f) + edge[i1] * f;
    } else {
      out[i] = 0.5;
    }
  }
  if (noise > 0) {
    // Coherent value-noise: a ring of K random control points, smoothstep-blended,
    // so the edge looks torn (continuous) rather than spiky (per-vertex random).
    const K = 48;
    const rnd = mulberry32(seed >>> 0);
    const ctrl = Array.from({ length: K }, () => rnd() * 2 - 1);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * K;
      const i0 = Math.floor(t) % K;
      const i1 = (i0 + 1) % K;
      const f = t - Math.floor(t);
      const s = f * f * (3 - 2 * f);
      out[i] = clamp01(out[i] + (ctrl[i0] * (1 - s) + ctrl[i1] * s) * noise);
    }
  }
  return out;
}

/**
 * Write the torn edge at one angle while "scraping": set the band height to `frac`
 * at `theta01` (0..1 around the cake) with a soft brush over neighbouring samples, so
 * dragging/spinning paints a smooth continuous edge. Pure — returns a NEW edge array.
 *
 * @param {number[]} edge      current profile (fractions 0..1), length = resolution
 * @param {number}   theta01   angle around the cake, 0..1
 * @param {number}   frac      target band height at that angle, 0..1
 * @param {object}   [opts]
 * @param {number}   [opts.brush=3]  ± samples feathered around the hit
 * @returns {number[]}
 */
export function paintProfile(edge, theta01, frac, { brush = 3 } = {}) {
  const n = edge.length;
  if (!n) return edge;
  const next = edge.slice();
  const idx = (((Math.round(theta01 * n) % n) + n) % n);
  const f = clamp01(frac);
  for (let d = -brush; d <= brush; d++) {
    const j = ((idx + d) % n + n) % n;
    const w = 1 - Math.abs(d) / (brush + 1);   // soft brush keeps the painted edge smooth
    next[j] = next[j] * (1 - w) + f * w;
  }
  return next;
}

/**
 * Build the raised second-cream band as a BufferGeometry.
 *
 * @param {object}   o
 * @param {number}   o.R         base tier radius (the white wall radius)
 * @param {number}   o.y0        y of the bottom of the wall (where the band starts)
 * @param {number}   o.wallH     wall height (band heights are fractions of this)
 * @param {number}   o.lift      radial offset of the band beyond R (the raised lip)
 * @param {number[]} o.edge      authored edge profile (fractions 0..1 of wallH)
 * @param {string}   o.fillSide  'below' | 'above'
 * @param {number}   o.noise     torn-edge jitter
 * @param {number}   o.seed      jitter seed
 * @param {number}   o.segments  angular tessellation
 * @returns {THREE.BufferGeometry}
 */
export function buildSecondCreamLayer({
  R = 1.2,
  y0 = 0.1,
  wallH = 1.45,
  lift = SECOND_CREAM_DEFAULTS.lift,
  edge,
  fillSide = SECOND_CREAM_DEFAULTS.fillSide,
  noise = SECOND_CREAM_DEFAULTS.noise,
  seed = 1,
  segments = SECOND_CREAM_DEFAULTS.segments,
} = {}) {
  const N = Math.max(8, segments | 0);
  const ro = R + lift;                       // outer (proud) radius of the band
  const yTop = y0 + wallH;                    // rim of the wall
  const prof = sampleProfile(edge, N, noise, seed);
  const tornHigh = fillSide !== 'above';      // 'below' → torn edge is the TOP edge

  const pos = [];
  const uv = [];
  const idx = [];

  // Per angular sample we emit 3 verts: outer-low, outer-high, inner-at-ledge.
  // The ledge sits at the torn boundary and bridges the proud outer radius back
  // to the base wall (R), giving the visible thickness/shadow of the second skin.
  for (let i = 0; i <= N; i++) {
    const a = ((i % N) / N) * Math.PI * 2;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    const e = y0 + clamp01(prof[i % N]) * wallH;   // the torn edge height here

    const low  = tornHigh ? y0 : e;                // band bottom
    const high = tornHigh ? e  : yTop;             // band top
    const ledgeY = e;                              // ledge rides the torn edge

    pos.push(cx * ro, low,  sz * ro);   // 3i + 0  outer low
    pos.push(cx * ro, high, sz * ro);   // 3i + 1  outer high
    pos.push(cx * R,  ledgeY, sz * R);  // 3i + 2  inner ledge (at base wall)

    // UVs: u around the circle (0..1), v up the wall (0..1) — matches the base
    // wall's cylinder UVs so the SAME tiling cream-grain normal map reads at the
    // same density on both, and the band stops looking like smooth plastic.
    const u = i / N;
    uv.push(u, (low - y0) / wallH);
    uv.push(u, (high - y0) / wallH);
    uv.push(u, (ledgeY - y0) / wallH);
  }

  for (let i = 0; i < N; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    // Outer (visible colour) wall: outer-low → outer-high quad.
    idx.push(a + 0, b + 0, b + 1, a + 0, b + 1, a + 1);
    // Top ledge: from the outer vertex on the torn edge inward to the base wall.
    const outerTornA = a + (tornHigh ? 1 : 0);
    const outerTornB = b + (tornHigh ? 1 : 0);
    idx.push(outerTornA, outerTornB, b + 2, outerTornA, b + 2, a + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build the gold-leaf ribbon: a clean, constant-width band straddling the torn edge,
 * riding a hair proud of the band face. It is deliberately SMOOTH geometry — the
 * torn-foil irregularity (ragged borders, pinholes, crinkle sparkle) all comes from
 * the gold-leaf texture's alpha + normal map (see goldLeafTexture.js), not from
 * jagged vertices. Carries UVs: u tiles `repeat` times around the edge, v 0..1 across
 * the band. Samples the SAME profile/noise/seed as the band so it sits on the tear.
 *
 * @returns {THREE.BufferGeometry}
 */
export function buildSecondCreamEdgeLine({
  R = 1.2,
  y0 = 0.1,
  wallH = 1.45,
  lift = SECOND_CREAM_DEFAULTS.lift,
  edge,
  noise = SECOND_CREAM_DEFAULTS.noise,
  seed = 1,
  segments = SECOND_CREAM_DEFAULTS.segments,
  width = 0.09,            // band height the foil texture feathers within
  repeat = 16,            // gold-leaf tile repeats around the circumference
} = {}) {
  const N = Math.max(8, segments | 0);
  const rr = R + lift + 0.005;   // just proud of the band so the leaf sits on top
  const prof = sampleProfile(edge, N, noise, seed);

  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const ii = i % N;
    const a = (ii / N) * Math.PI * 2;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    const e = y0 + clamp01(prof[ii]) * wallH;
    const u = (i / N) * repeat;
    pos.push(cx * rr, e + width * 0.5, sz * rr);   // 2i + 0  upper rim
    pos.push(cx * rr, e - width * 0.5, sz * rr);   // 2i + 1  lower rim
    uv.push(u, 1);
    uv.push(u, 0);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// A few starting edges so the studio (and later the customer) never faces a blank
// cake. Each returns a profile array of the given length (fractions of wall height).
export const SECOND_CREAM_PRESETS = {
  'Gentle wave': (len = SECOND_CREAM_DEFAULTS.profileLen) =>
    Array.from({ length: len }, (_, i) => 0.5 + 0.07 * Math.sin((i / len) * Math.PI * 2 * 2)),
  Torn: (len = SECOND_CREAM_DEFAULTS.profileLen) =>
    Array.from({ length: len }, () => 0.5),   // flat base; rely on `noise` for the tear
  'Steep diagonal': (len = SECOND_CREAM_DEFAULTS.profileLen) =>
    Array.from({ length: len }, (_, i) => {
      // One smooth sweep around the cake: low on one side, high on the other.
      const t = i / len;
      return 0.28 + 0.5 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    }),
};
