/* Does our skirt have the SHAPE of a real one? Geometry against geometry.
 *
 * Sandeep converted the reference cake to 3D (`Strawberry_wafer_paper_cake.glb`), which turns a
 * judgement into a measurement. Slicing that model horizontally and taking the outer radius as a
 * function of angle, the strips show as a periodic ripple:
 *
 *     slice      median R   ripple (p90-p10)   peaks
 *     25% height    0.700              0.127     109
 *     40%           0.701              0.132     117
 *     55%           0.689              0.152     104
 *
 * So: about 110 strips, standing off roughly 0.13 against a wall at 0.59 — each one reaching out
 * about four times its own spacing. That is the target, and none of it needed an opinion.
 *
 * ⚠️ THIS COMPARES GEOMETRY, NOT PIXELS, which is the whole point. A rendered comparison carries
 * the scene's exposure, the camera's framing and the material's response, and today every one of
 * those produced a confident wrong answer at least once — a contrast metric that scored a flat wall
 * above standing strips, a mean matched to an unrelated photograph's exposure, a mask that measured
 * the backdrop. Vertices have none of those.
 *
 *   node scripts/measure-wafer-shape.mjs
 *   COUNT=110 WIDTH=3.9 ANGLE=90 node scripts/measure-wafer-shape.mjs
 */
import * as THREE from 'three';
import { buildWaferSkirt } from '../src/designer/geometry/waferPaper.js';

const RADIUS = Number(process.env.RADIUS ?? 0.59);     // the WALL, not the strip tips
const HEIGHT = Number(process.env.HEIGHT ?? 1.0);
const TARGET = { medR: 0.70, ripple: 0.13, peaks: 110 };

const sets = process.env.COUNT
  ? [{ count: +process.env.COUNT, width: +(process.env.WIDTH ?? 3.9), finAngle: +(process.env.ANGLE ?? 90) }]
  : [
      { count: 85,  width: 2.4, finAngle: 62 },   // where tuning by eye had got to
      { count: 110, width: 2.4, finAngle: 62 },
      { count: 110, width: 3.9, finAngle: 90 },   // what the reference measures as
      { count: 110, width: 3.9, finAngle: 74 },
      { count: 130, width: 4.6, finAngle: 90 },
    ];

/* The same slice analysis run on the reference model, so the two numbers mean the same thing. */
function profile(geo, yFrac) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, s = b.getSize(new THREE.Vector3());
  const pos = geo.attributes.position;
  const BINS = 720;
  const y0 = b.min.y + s.y * (yFrac - 0.02), y1 = b.min.y + s.y * (yFrac + 0.02);
  const maxR = new Float64Array(BINS);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); if (y < y0 || y > y1) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    let k = Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * BINS);
    if (k < 0) k = 0; if (k >= BINS) k = BINS - 1;
    if (r > maxR[k]) maxR[k] = r;
  }
  const vals = [...maxR].filter(v => v > 0).sort((p, q) => p - q);
  if (vals.length < 10) return null;
  const med = vals[vals.length >> 1];
  let peaks = 0;
  for (let k = 0; k < BINS; k++) {
    const a = maxR[(k - 1 + BINS) % BINS], m = maxR[k], z2 = maxR[(k + 1) % BINS];
    if (m > a && m >= z2 && m > med) peaks++;
  }
  return { med, ripple: vals[(0.90 * vals.length) | 0] - vals[(0.10 * vals.length) | 0], peaks };
}

console.log(`\nreference:  median R ${TARGET.medR}   ripple ${TARGET.ripple}   peaks ~${TARGET.peaks}`);
console.log(`(wall radius ${RADIUS}, tier height ${HEIGHT})\n`);
console.log('count  width  angle |  median R   ripple   peaks | verdict');
console.log('-'.repeat(72));
for (const p of sets) {
  const geo = buildWaferSkirt({
    shape: { kind: 'round', radius: RADIUS }, tierHeight: HEIGHT, radius: RADIUS,
    fin: true, height: 1.0, rise: 0.05, taper: 0, ripple: 0.12, ripples: 1.3,
    sway: 0.02, curl: 0.06, splay: 0.03, lean: 0, jitter: 0.4, hem: 'straight', notch: 0.1,
    ...p,
  });
  const r = geo && profile(geo, 0.40);
  if (!r) { console.log(`${String(p.count).padStart(5)}  ${String(p.width).padStart(5)}  ${String(p.finAngle).padStart(5)} |  (no geometry)`); continue; }
  const dR = Math.abs(r.med - TARGET.medR), dRip = Math.abs(r.ripple - TARGET.ripple);
  const verdict = dR < 0.03 && dRip < 0.04 && Math.abs(r.peaks - TARGET.peaks) < 30 ? 'close' : '';
  console.log(`${String(p.count).padStart(5)}  ${String(p.width).padStart(5)}  ${String(p.finAngle).padStart(5)} |  ${r.med.toFixed(3).padStart(7)}  ${r.ripple.toFixed(3).padStart(7)}  ${String(r.peaks).padStart(5)} | ${verdict}`);
}
console.log(`
⚠️ PEAKS IS THE WEAK COLUMN, and it is the metric rather than the geometry. At 90° a fin has no
   tangential width at all, so most of the 720 angular bins miss every strip and the outer profile
   goes noisy — the counter under-reports. The reference is a smooth photogrammetric surface where
   every strip is solid, so its peaks are honest. Trust median R and ripple; treat peaks as a floor.
`);
