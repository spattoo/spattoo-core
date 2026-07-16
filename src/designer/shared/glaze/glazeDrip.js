import * as THREE from 'three';
import { perimeter } from '../../geometry/surface.js';

// ── Chocolate-glaze drip tendrils — the pendant fringe hanging off the bottom edge ─────────────────
//
// Poured glaze runs down the wall and hangs off the bottom as irregular, rounded drips. This builds that
// fringe as a thin skirt that RIDES the shape's real bottom outline via the shared `perimeter(shape)` rail
// (geometry/surface.js) — so it follows a circle, a rounded rect, a heart or a number identically, with no
// per-shape code (INVARIANTS #1/#6, and #3: reuse the rail, don't re-derive polar math).
//
// The fringe is coloured by the SAME object-space glaze shader as the body (applyGlaze with the tier's
// bbox): its vertices sit just below the wall in the body's local frame, so the marble field simply
// CONTINUES off the edge and each tendril carries the streak directly above it — no separate colour path.
//
// Depth is a dimensionless FRACTION of the tier height (INVARIANTS #8 — never a hardcoded world length),
// multiplied by `height` here, so drips scale with any tier size. Profile = a gently wavy baseline (glaze
// sheets down all the way round) + a few Gaussian tendrils (where it ran heavier); the Gaussian falloff
// gives each tendril a naturally ROUNDED tip.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the drip skirt for a tier. `shape` = tierShape() (round/rect/outline); `dripFrac` = fraction of
// height the longest tendril hangs; `height` = tier height (world). Returns { geo, maxDepth } — geo in the
// tier's LOCAL frame (top edge at y=0 = the wall bottom, hanging to y = −depth), so a mesh placed at the
// tier's base wears it. maxDepth (world) lets the caller keep the drips bounded / seat what's below.
export function buildGlazeDrip(shape, dripFrac, height, seed = 1) {
  const rail = perimeter(shape);
  const L = rail.length;
  if (!(L > 0) || !(dripFrac > 0)) return null;
  const maxDrip = dripFrac * height;                 // world units — dimensionless frac × live height
  const SEG = Math.max(120, Math.min(600, Math.round(L / 0.03)));
  const rnd = mulberry32(((seed | 0) || 1) * 131 + 7);
  const phase = rnd() * Math.PI * 2, phase2 = rnd() * Math.PI * 2;
  const base = maxDrip * 0.6;                         // baseline sheet depth (never bare)
  const nT = 8 + Math.round(rnd() * 8);              // a handful of longer tendrils
  const peaks = [];
  for (let i = 0; i < nT; i++) peaks.push({ s: rnd(), w: 0.01 + rnd() * 0.02, h: maxDrip * (0.45 + rnd() * 0.55) });
  const depth = (u) => {
    let d = base * (0.8 + 0.2 * Math.sin(u * Math.PI * 2 * 9 + phase) + 0.1 * Math.sin(u * Math.PI * 2 * 21 + phase2));
    for (const p of peaks) { let du = (((u - p.s + 0.5) % 1) + 1) % 1 - 0.5; d += p.h * Math.exp(-(du * du) / (2 * p.w * p.w)); }
    return Math.min(d, maxDrip);
  };

  const pos = [], idx = []; let maxDepth = 0;
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG, p = rail.at(u * L), d = depth(u);
    if (d > maxDepth) maxDepth = d;
    pos.push(p.x, 0, p.z, p.x, -d, p.z);             // top vertex (wall bottom), bottom vertex (drip tip)
  }
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, maxDepth };
}
