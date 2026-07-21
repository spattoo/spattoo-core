// ── Ring position distribution ────────────────────────────────────────────────
// Pure geometry (no THREE, no React → unit-testable): given a measured instance
// (`A`: bbWidth / bbDepth / shellScale), the ring's radial offset `off` and vertical
// anchor `baseY`, distribute instances evenly around the tier's perimeter. This is the
// SINGLE distribution used by BOTH the cream-piping rings (TopPipingRing / BottomPipingRing)
// AND the decoration ring, so rim/board, round/rect/outline, single-vs-ring and swag all
// behave identically regardless of what is being placed (INVARIANTS #3). The three helpers
// below were previously local to CakeTier.jsx; they moved here so the whole distribution is
// one shared, tested unit. `ringPositions.test.js` pins the output.

import { pipingPerimeter, pipingPerimeters, pipingHolePerimeters, rectEdgeRing } from '../geometry/surface.js';
import { pointInPolygon } from '../geometry/shapes.js';
import { PIPING_FRONT_ANGLE } from '../constants.js';

// Bend a flat piping ring into `swagCount` scalloped drapes (garland/swag look).
// Returns one entry per shell { pos, rotY, tq }:
//   pos  — world position, with the scallop drop baked into y
//   rotY — yaw so the shell faces outward (same as the flat ring)
//   tq   — a quaternion [x,y,z,w] that pitches the shell about the WORLD radial
//          axis to follow the drape's slope. Pitching about the radial axis (not a
//          shell-local axis) is independent of the GLB's internal orientation, so it
//          leans the upright shell along the drape instead of rolling it.
// Shells are spaced by equal arc-length ALONG the draped curve (not the flat circle)
// so they stay touching through the dips. swagDepth/swagTilt are in cake units / 0–1.
// The calibrator (PipingCalibrator.jsx) keeps an identical copy for an exact preview.
export function buildSwagRing({ r, baseY, step, swagCount, swagDepth, swagTilt = 0.5 }) {
  const dipAt = a => -swagDepth * (1 - Math.cos(a * swagCount)) / 2;
  // Sample the wavy circle and accumulate arc length.
  const N = 1440;
  const cum = [0];
  let px = r, py = baseY + dipAt(0), pz = 0;
  for (let s = 1; s <= N; s++) {
    const a = (s / N) * Math.PI * 2;
    const cx = Math.cos(a) * r, cy = baseY + dipAt(a), cz = Math.sin(a) * r;
    cum.push(cum[s - 1] + Math.hypot(cx - px, cy - py, cz - pz));
    px = cx; py = cy; pz = cz;
  }
  const total = cum[N];
  const count = Math.max(6, Math.round(total / step));
  const out = [];
  let seg = 0;
  for (let j = 0; j < count; j++) {
    const target = (j / count) * total;            // monotonically increasing
    while (seg < N && cum[seg + 1] < target) seg++;
    const a0 = (seg / N) * Math.PI * 2, a1 = ((seg + 1) / N) * Math.PI * 2;
    const f  = (target - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]);
    const a  = a0 + (a1 - a0) * f;
    const slope = -(swagDepth * swagCount / 2) * Math.sin(a * swagCount); // d(dip)/d(angle)
    const tilt  = -swagTilt * Math.atan2(slope, r);
    const sh = Math.sin(tilt / 2), ch = Math.cos(tilt / 2);
    // Rotation about world radial axis (cos a, 0, sin a).
    const tq = [Math.cos(a) * sh, 0, Math.sin(a) * sh, ch];
    out.push({ pos: [Math.cos(a) * r, baseY + dipAt(a), Math.sin(a) * r], rotY: a, tq });
  }
  return out;
}

// Place ONE single-mode shell on a perimeter. The instance `angle` is read as a fraction
// of the way round (relative to the cake front), so the existing front-relative angle
// sliders keep working on rectangles.
export function perimeterSinglePos({ perim, off, baseY, angle }) {
  const f = ((((angle - PIPING_FRONT_ANGLE) / (2 * Math.PI)) % 1) + 1) % 1;
  const p = perim.at(f * perim.length);
  return { pos: [p.x + off * p.nx, baseY, p.z + off * p.nz], rotY: Math.atan2(p.nz, p.nx), tq: [0, 0, 0, 1] };
}

// Evenly-spaced shells around ANY perimeter (heart, number, polygon…). Generalises rectEdgeRing's clean
// garland to a free-form outline by doing what rectEdgeRing does for a rectangle: build a proper ROUND-
// JOIN offset of the outline (the corners come out ROUNDED, like a rounded-rect), then walk that smooth
// closed path at even arc length. Round joins are the whole trick — a sharp corner becomes an arc the
// beads flow around continuously, so there is no gap, no self-intersection spike, and no corner pile, and
// none of the corner-detection / spike-filter / corner-thin patches those failure modes used to need.
// Relies on the outline being wound CCW-in-xz so the offset normals point OUTWARD (see numberShape).
export function perimeterRing(perim, off, step, baseY) {
  const dense = Math.max(160, Math.round((perim.length / step) * 10));
  const P = [];
  for (let i = 0; i < dense; i++) { const p = perim.at((i / dense) * perim.length); P.push({ x: p.x, z: p.z }); }
  // Outward normal of each edge (CCW winding ⇒ the right-hand perpendicular points out).
  const nrm = [];
  for (let i = 0; i < dense; i++) { const a = P[i], b = P[(i + 1) % dense], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; nrm.push({ x: dz / l, z: -dx / l }); }

  // ROUND-JOIN offset: push each vertex out along its normal by `off`; where the normal swings sharply
  // (a corner) sweep an ARC of radius |off| from the incoming normal to the outgoing one, rounding the
  // corner. `nx,nz` is the outward direction at each offset point (the shell's facing).
  const Q = [];
  const ARC = 7 * Math.PI / 180, TURN = 8 * Math.PI / 180;
  const put = (cx, cz, a) => Q.push({ x: cx + off * Math.cos(a), z: cz + off * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) });
  for (let i = 0; i < dense; i++) {
    const np = nrm[(i - 1 + dense) % dense], nc = nrm[i];
    const a0 = Math.atan2(np.z, np.x), a1 = Math.atan2(nc.z, nc.x);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) > TURN) { const steps = Math.ceil(Math.abs(da) / ARC); for (let s = 0; s <= steps; s++) put(P[i].x, P[i].z, a0 + da * (s / steps)); }
    else put(P[i].x, P[i].z, a0 + da * 0.5);
  }

  // Thin-stroke collapse: where an inset stroke is narrower than 2·|off| its two sides cross to the wrong
  // side of the outline. Keep only the points on the correct side (inside for an inset, outside for an
  // outset); the crossed strip vanishes and the walk chords across it, thinning to one clean row.
  const path = off === 0 ? Q : Q.filter(q => (off < 0) === pointInPolygon(P, q.x, q.z));
  const use = path.length >= 3 ? path : Q;

  // Even walk of the smooth offset path.
  const n = use.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = use[i], b = use[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const len = cum[n], N = Math.max(6, Math.round(len / step)), raw = [];
  for (let j = 0; j < N; j++) {
    const t = (j / N) * len;
    let seg = 0;
    while (seg < n && cum[seg + 1] < t) seg++;
    const a = use[seg], b = use[(seg + 1) % n], d = cum[seg + 1] - cum[seg], u = d ? (t - cum[seg]) / d : 0;
    const nx = a.nx + (b.nx - a.nx) * u, nz = a.nz + (b.nz - a.nz) * u;
    raw.push({ pos: [a.x + (b.x - a.x) * u, baseY, a.z + (b.z - a.z) * u], rotY: Math.atan2(nz, nx), tq: [0, 0, 0, 1] });
  }

  // Collapse dedup, tuned against the REAL ring capture (step≈0.49, off≈−0.26 — a big rosette on a "1"):
  // drop a shell within 0.5·step of ANY kept shell. This removes genuine overlaps — a thin stroke folded
  // onto itself, or a concave notch folding the path back on a non-adjacent part — while leaving a narrow
  // stroke's two parallel rows (~0.6·step apart) intact. NO sequential/walk-adjacent rule: it can't tell a
  // clean ROUNDED CORNER (where consecutive shells sit a full step apart by arc but a bit less by chord)
  // from real bunching, so it culled the corner shells and opened GAPS at the top-right (and every rounded
  // corner). A rounded corner reads best with its shells kept — slightly crowding is how piping turns a
  // corner; a gap is not.
  const out = [], glob2 = (0.5 * step) ** 2;
  for (const sh of raw) {
    const x = sh.pos[0], z = sh.pos[2];
    if (out.some(q => (q.pos[0] - x) ** 2 + (q.pos[2] - z) ** 2 < glob2)) continue;
    out.push(sh);
  }
  return out;
}

// Distribute instances around the tier perimeter. `A` = { shellScale, bbWidth, bbDepth } — the
// measured instance (a cream shell, or a decoration GLB); `off` = radial offset (sign set by the
// caller: rim pulls inward, board pushes outward); `baseY` = vertical anchor. Returns [{ pos,
// rotY, tq, key? }]. The branch order (single → outline/rect → swag → round circle) exactly
// reproduces the logic that was inlined in TopPipingRing / BottomPipingRing.
export function ringPositions({
  A, radius, off, baseY,
  spacing = 1, swagCount = 0, swagDepth = 0, swagTilt = 0.5,
  arrangement = 'ring', instances = null, altActive = false, pattern = 'AB', shape = null,
}) {
  const r = radius + off;
  const step = A.shellScale * A.bbWidth * 0.9 * spacing;   // tracks rendered instance width (scale already capped)
  const perim = (shape?.kind === 'rect' || shape?.outline) ? pipingPerimeter(shape) : null;
  if (arrangement === 'single') {
    const list = instances?.length ? instances : [{ angle: 0 }];
    return list.map(inst => {
      const angle = inst.angle ?? 0;
      if (perim) return { ...perimeterSinglePos({ perim, off, baseY, angle }), key: inst.id };
      return { pos: [Math.cos(angle) * r, baseY, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1], key: inst.id };
    });
  }
  if (perim) {
    if (shape.kind === 'rect') return rectEdgeRing(shape, off, step, baseY);   // sheet: clean straight runs + corners
    // heart, number, …: even by arc length, EACH contour its OWN loop; counters (holes) ringed too, offset
    // flipped (+off) onto the material side (see the ring impls for the rationale).
    return [
      ...pipingPerimeters(shape).flatMap(p => perimeterRing(p, off, step, baseY)),
      ...pipingHolePerimeters(shape).flatMap(p => perimeterRing(p, Math.abs(off), step, baseY)),
    ];
  }
  if (swagCount > 0 && swagDepth > 0) {
    return buildSwagRing({ r, baseY, step, swagCount, swagDepth, swagTilt });
  }
  let count = Math.max(6, Math.round((2 * Math.PI * r) / step));
  // Round up to a whole number of pattern cycles so the A/B alternation closes cleanly.
  if (altActive) { const L = pattern.length || 1; count = Math.max(L, Math.ceil(count / L) * L); }
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return { pos: [Math.cos(angle) * r, baseY, Math.sin(angle) * r], rotY: angle, tq: [0, 0, 0, 1] };
  });
}
