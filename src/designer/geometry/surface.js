// ── Cake surface / perimeter abstraction ──────────────────────────────────────
// One interface that both cake shapes implement, so rendering, piping, and (later)
// decoration placement generalise once instead of per-feature.
//
//   tierShape(tier)   → normalised shape descriptor (round | rect)
//   perimeter(shape)  → { length, at(s) → { x, z, nx, nz } }
//                       s = arc length around the edge; (nx,nz) = unit OUTWARD normal.
//
// The shell/decal facing is atan2(nz, nx); for a circle that reduces to the polar
// angle, so the round path stays byte-identical to the old cos/sin math.

import { SHEET_CORNER_RADIUS, SHEET_PIPING_CORNER_RADIUS } from '../constants.js';

// Round: { kind:'round', radius }.  Rect (sheet): { kind:'rect', halfW, halfD, cornerR, pipingCornerR }.
// Width (X) is the long side, depth (Z) the short side. `pipingCornerR` is the gentler corner
// the piping ring follows (≥ body cornerR, capped so small cakes don't over-round).
export function tierShape(tier) {
  if (tier?.shape === 'rect') {
    const halfW = (tier.width ?? 2.16) / 2;
    const halfD = (tier.depth ?? 1.56) / 2;
    const cornerR = tier.cornerR ?? SHEET_CORNER_RADIUS;
    return {
      kind: 'rect', halfW, halfD, cornerR,
      pipingCornerR: Math.max(cornerR, Math.min(SHEET_PIPING_CORNER_RADIUS, 0.55 * Math.min(halfW, halfD))),
    };
  }
  return { kind: 'round', radius: tier.radius ?? 1.2 };
}

// Largest horizontal half-extent — a "bounding radius" so radius-based incidental
// placement (board size, toolbar offsets, topper scale) keeps working for both shapes.
export function boundingRadius(shape) {
  return shape.kind === 'rect' ? Math.max(shape.halfW, shape.halfD) : shape.radius;
}

export function circlePerimeter(r) {
  return {
    length: 2 * Math.PI * r,
    at(s) {
      const a = s / r;                       // angle = arc length / radius
      const nx = Math.cos(a), nz = Math.sin(a);
      return { x: nx * r, z: nz * r, nx, nz };
    },
  };
}

// Rounded rectangle centred at the origin. Traversal starts at front-centre
// (0, +halfD) and winds once around, so s=0 sits at the cake front (+Z).
export function roundedRectPerimeter(halfW, halfD, cornerR) {
  const cr = Math.max(0, Math.min(cornerR, halfW, halfD));
  const sx = halfW - cr, sz = halfD - cr;
  const A = (Math.PI / 2) * cr, HP = Math.PI / 2;
  const line = (x0, z0, x1, z1, nx, nz) => ({
    len: Math.hypot(x1 - x0, z1 - z0),
    at: (u) => ({ x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u, nx, nz }),
  });
  const arc = (cx, cz, a0, a1) => ({
    len: A,
    at: (u) => { const a = a0 + (a1 - a0) * u, nx = Math.cos(a), nz = Math.sin(a);
                 return { x: cx + cr * nx, z: cz + cr * nz, nx, nz }; },
  });
  const segs = [
    line(0, halfD, sx, halfD, 0, 1),
    arc(sx, sz, HP, 0),
    line(halfW, sz, halfW, -sz, 1, 0),
    arc(sx, -sz, 0, -HP),
    line(sx, -halfD, -sx, -halfD, 0, -1),
    arc(-sx, -sz, -HP, -Math.PI),
    line(-halfW, -sz, -halfW, sz, -1, 0),
    arc(-sx, sz, Math.PI, HP),
    line(-sx, halfD, 0, halfD, 0, 1),
  ];
  const length = segs.reduce((t, s) => t + s.len, 0);
  return {
    length,
    at(s) {
      let d = ((s % length) + length) % length;
      for (let k = 0; k < segs.length; k++) {
        if (d <= segs[k].len || k === segs.length - 1) return segs[k].at(segs[k].len ? d / segs[k].len : 0);
        d -= segs[k].len;
      }
      return segs[0].at(0);
    },
  };
}

// Perimeter for a shape descriptor (the common entry point for placement/hit-testing).
export function perimeter(shape) {
  return shape.kind === 'rect'
    ? roundedRectPerimeter(shape.halfW, shape.halfD, shape.cornerR)
    : circlePerimeter(shape.radius);
}

// Perimeter the piping ring walks — uses the gentler `pipingCornerR` so shells flow
// around corners. Straight runs still sit on the body's faces (±halfW / ±halfD); only
// the corner is rounded more.
export function pipingPerimeter(shape) {
  return shape.kind === 'rect'
    ? roundedRectPerimeter(shape.halfW, shape.halfD, shape.pipingCornerR ?? shape.cornerR)
    : circlePerimeter(shape.radius);
}

// ── Top-surface placement ─────────────────────────────────────────────────────
// Clamp a top point (x,z) to within the tier footprint, scaled by margin k.
//   Round: pull onto the inscribed circle of radius·k (matches the old r>maxR rescale).
//   Rect:  clamp each axis independently to halfW·k / halfD·k, so a decoration can reach
//          the rectangle's corners instead of being trapped in an inscribed circle.
export function topClamp(shape, x, z, k = 0.92) {
  if (shape.kind === 'rect') {
    const mx = shape.halfW * k, mz = shape.halfD * k;
    return { x: Math.max(-mx, Math.min(mx, x)), z: Math.max(-mz, Math.min(mz, z)) };
  }
  const maxR = shape.radius * k;
  const r = Math.hypot(x, z);
  return r > maxR ? { x: (x * maxR) / r, z: (z * maxR) / r } : { x, z };
}

// Clamp (x,z) onto the top surface, inset by an ABSOLUTE `margin` from the edge — so a footprint
// of half-width `margin` never overhangs the rim. `margin = 0` lets the point reach the rim itself.
// Used instead of the fixed-fraction `topClamp` where the inset should track the decoration: a
// `stand` element (point base) passes margin 0 and can sit at the rim; a flat decal passes half its
// size so its outer edge meets the rim. Mode/size-derived by the caller — never a config flag.
export function topClampInset(shape, x, z, margin = 0) {
  if (shape.kind === 'rect') {
    const mx = Math.max(0, shape.halfW - margin), mz = Math.max(0, shape.halfD - margin);
    return { x: Math.max(-mx, Math.min(mx, x)), z: Math.max(-mz, Math.min(mz, z)) };
  }
  const maxR = Math.max(0, shape.radius - margin);
  const r = Math.hypot(x, z);
  return r > maxR ? { x: (x * maxR) / r, z: (z * maxR) / r } : { x, z };
}

// Is (x,z) on the top surface (margin k)? Drives tap-to-place hit testing.
export function topContains(shape, x, z, k = 1) {
  return shape.kind === 'rect'
    ? Math.abs(x) <= shape.halfW * k && Math.abs(z) <= shape.halfD * k
    : Math.hypot(x, z) <= shape.radius * k;
}

// ── Sheet-cake piping ring ────────────────────────────────────────────────────
// Instead of sweeping shells continuously through the corner arc (which makes them
// over-rotate and fan), pipe each straight side as its own row of parallel shells that
// END at the corner, plus ONE shell on each corner's diagonal bisector to bridge the
// 90° turn — exactly how a piped shell border is done by hand. Returns the same
// { pos, rotY, tq } entries the round ring produces. `off` pushes shells out (board) or
// in (rim) along the local outward normal; rotY uses atan2(nz,nx) like the round ring.
export function rectEdgeRing(shape, off, step, baseY) {
  // `off` insets (off<0, rim pulled in) or outsets (off>0, board pushed out) the rounded
  // rectangle along every edge's outward normal. We bake it into a SHRUNK/GROWN rectangle —
  // pulling the corner radius and the straight runs in together — rather than just sliding
  // each edge line while leaving its endpoints at the original corner tangents. The latter
  // makes the straight rows overshoot past the (now-closer) perpendicular edges when pulled
  // deep inward, piling shells up at the corners. Insetting keeps a clean, smaller rectangle.
  const cr0 = shape.pipingCornerR ?? shape.cornerR;
  const halfW = Math.max(0, shape.halfW + off);
  const halfD = Math.max(0, shape.halfD + off);
  const cr = Math.max(0, Math.min(cr0 + off, halfW, halfD));
  const sx = Math.max(0, halfW - cr), sz = Math.max(0, halfD - cr);
  const out = [];
  const edge = (ax, az, bx, bz, nx, nz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) return;                               // collapsed side (deep inset): skip
    const N = Math.max(1, Math.round(len / step));        // whole shells, spaced to fit
    const yaw = Math.atan2(nz, nx);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      out.push({ pos: [x, baseY, z], rotY: yaw, tq: [0, 0, 0, 1] });
    }
  };
  const corner = (cx, cz, dx, dz) => {                    // one shell on the bisector
    if (cr < 0.02) return;                                // (near-)sharp corner: rows meet directly, no bridge
    const L = Math.hypot(dx, dz) || 1, nx = dx / L, nz = dz / L;
    out.push({ pos: [cx + cr * nx, baseY, cz + cr * nz], rotY: Math.atan2(nz, nx), tq: [0, 0, 0, 1] });
  };
  // Walk the four sides + corners, in perimeter order (front, FR, right, BR, back, BL, left, FL).
  edge(-sx, halfD,  sx, halfD,  0,  1); corner( sx,  sz,  1,  1);
  edge(halfW,  sz, halfW, -sz,  1,  0); corner( sx, -sz,  1, -1);
  edge( sx, -halfD, -sx, -halfD, 0, -1); corner(-sx, -sz, -1, -1);
  edge(-halfW, -sz, -halfW,  sz, -1, 0); corner(-sx,  sz, -1,  1);
  return out;
}

// ── Side-wall placement (rectangular only; round keeps its own theta path) ─────
// Side decorations on a sheet cake are positioned by a perimeter fraction u ∈ [0,1)
// (the rect analogue of the round cake's theta). These helpers are THREE-free so the
// math stays unit-testable.

// Nearest hit of a ray on the 4 vertical side faces of a box (halfW in X, halfD in Z),
// treated as infinite in Y (the fillet is ignored for picking — it's tiny). `ray` is any
// object with .origin/.direction each having {x,y,z}. Returns { x, y, z, nx, nz } or null.
export function boxHit(ray, halfW, halfD) {
  const o = ray.origin, d = ray.direction;
  let best = null, bestT = Infinity;
  const consider = (t, x, y, z, ok, nx, nz) => {
    if (t > 1e-6 && t < bestT && ok) { bestT = t; best = { x, y, z, nx, nz }; }
  };
  if (Math.abs(d.x) > 1e-9) {
    for (const sgn of [1, -1]) {
      const t = (sgn * halfW - o.x) / d.x;
      const z = o.z + d.z * t, y = o.y + d.y * t;
      consider(t, sgn * halfW, y, z, Math.abs(z) <= halfD + 1e-6, sgn, 0);
    }
  }
  if (Math.abs(d.z) > 1e-9) {
    for (const sgn of [1, -1]) {
      const t = (sgn * halfD - o.z) / d.z;
      const x = o.x + d.x * t, y = o.y + d.y * t;
      consider(t, x, y, sgn * halfD, Math.abs(x) <= halfW + 1e-6, 0, sgn);
    }
  }
  return best;
}

// Perimeter fraction u ∈ [0,1) of the point on `shape`'s edge closest to (x,z).
// Coarse sample then refine, so placement (perimeter.at) and picking stay consistent.
export function nearestU(shape, x, z, samples = 360) {
  const perim = perimeter(shape);
  const at = u => perim.at((((u % 1) + 1) % 1) * perim.length);
  let bu = 0, bd = Infinity;
  for (let i = 0; i < samples; i++) {
    const u = i / samples, p = at(u);
    const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (dd < bd) { bd = dd; bu = u; }
  }
  // refine around the best sample
  let lo = bu - 1 / samples, hi = bu + 1 / samples;
  for (let k = 0; k < 24; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const d1 = at(m1), d2 = at(m2);
    if ((d1.x - x) ** 2 + (d1.z - z) ** 2 < (d2.x - x) ** 2 + (d2.z - z) ** 2) hi = m2; else lo = m1;
  }
  return (((((lo + hi) / 2) % 1) + 1) % 1);
}

// Map a perimeter fraction u to a wall placement, pushed `off` proud of the surface.
// yaw uses the sticker convention (decal rotated about Y by yaw faces outward).
export function rectSidePlacement(shape, u, off = 0) {
  const perim = perimeter(shape);
  const p = perim.at((((u % 1) + 1) % 1) * perim.length);
  return { x: p.x + off * p.nx, z: p.z + off * p.nz, yaw: Math.atan2(p.nx, p.nz), nx: p.nx, nz: p.nz };
}

// ── Self-test ─────────────────────────────────────────────────────────────────
// Pure invariants for the geometry above. Returns a list of failure messages ([] = ok).
// Run from a node script or under a dev guard; lets the math be validated without a render.
export function selfTest() {
  const errs = [];
  const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
  const check = (cond, msg) => { if (!cond) errs.push(msg); };

  // Rect clamp keeps a corner in the corner (NOT pulled onto an inscribed circle).
  const rc = topClamp({ kind: 'rect', halfW: 2, halfD: 1, cornerR: 0.1 }, 9, 9, 1);
  check(near(rc.x, 2) && near(rc.z, 1), 'rect topClamp should hold the corner (2,1)');
  // Round clamp pulls an outside point onto the circle of radius·k.
  const cc = topClamp({ kind: 'round', radius: 1 }, 4, 0, 1);
  check(near(cc.x, 1) && near(cc.z, 0), 'round topClamp should land on the circle (1,0)');
  // topClampInset: margin 0 reaches the rim; a margin insets the footprint by that absolute amount.
  const ti0 = topClampInset({ kind: 'round', radius: 1 }, 4, 0, 0);
  check(near(ti0.x, 1) && near(ti0.z, 0), 'topClampInset margin 0 should reach the rim (1,0)');
  const ti = topClampInset({ kind: 'round', radius: 1 }, 4, 0, 0.2);
  check(near(ti.x, 0.8) && near(ti.z, 0), 'topClampInset margin 0.2 should stop at radius−margin (0.8)');
  // Inside points are untouched by both.
  const ins = topClamp({ kind: 'rect', halfW: 2, halfD: 1, cornerR: 0.1 }, 0.5, 0.2, 1);
  check(near(ins.x, 0.5) && near(ins.z, 0.2), 'topClamp must leave interior points alone');
  // topContains agrees with the footprint.
  check(topContains({ kind: 'rect', halfW: 2, halfD: 1, cornerR: 0 }, 1.9, -0.9),
    'topContains should accept a point inside the rect');
  check(!topContains({ kind: 'rect', halfW: 2, halfD: 1, cornerR: 0 }, 2.1, 0),
    'topContains should reject a point outside the rect');

  // Perimeter: front (s=0) is +Z, unit outward normals, length is positive.
  const pr = perimeter({ kind: 'rect', halfW: 1, halfD: 1, cornerR: 0.2 });
  const f = pr.at(0);
  check(near(f.x, 0) && near(f.z, 1), 'rect perimeter s=0 should be front-centre (0, +halfD)');
  check(near(Math.hypot(f.nx, f.nz), 1), 'rect perimeter normal should be unit length');
  // Circle perimeter reduces to the polar angle (s=0 → +X), normal outward.
  const cp = circlePerimeter(1);
  const c0 = cp.at(0);
  check(near(c0.x, 1) && near(c0.z, 0) && near(Math.hypot(c0.nx, c0.nz), 1), 'circle perimeter s=0 should be (1,0)');

  // Side placement: u=0 is the front face centre (+Z), decal faces +Z (yaw 0), pushed out.
  const sp = rectSidePlacement({ kind: 'rect', halfW: 2, halfD: 1, cornerR: 0.2 }, 0, 0.1);
  check(near(sp.x, 0) && near(sp.z, 1.1) && near(sp.yaw, 0), 'rectSidePlacement(u=0) should be front-centre facing +Z');

  // boxHit: a ray from far +Z aimed at -Z hits the front face at z=+halfD.
  const bh = boxHit({ origin: { x: 0, y: 0.3, z: 9 }, direction: { x: 0, y: 0, z: -1 } }, 2, 1);
  check(bh && near(bh.z, 1) && near(bh.x, 0) && near(bh.nz, 1), 'boxHit should hit the front face at (0,·,1)');

  // rectEdgeRing: a front-edge shell faces +Z (rotY π/2), a front-right corner shell faces
  // the diagonal (rotY π/4), and every shell sits at baseY.
  const ring = rectEdgeRing({ kind: 'rect', halfW: 2, halfD: 1, cornerR: 0.14, pipingCornerR: 0.2 }, 0.05, 0.25, 0.3);
  check(ring.length > 8 && ring.every(s => near(s.pos[1], 0.3)), 'rectEdgeRing shells should all sit at baseY');
  check(ring.some(s => near(s.rotY, Math.PI / 2)), 'rectEdgeRing should have +Z-facing front-edge shells');
  check(ring.some(s => near(s.rotY, Math.PI / 4)), 'rectEdgeRing should have a diagonal corner shell');

  // nearestU round-trips with placement: u → world point → nearestU returns ~u.
  const shp = { kind: 'rect', halfW: 2, halfD: 1, cornerR: 0.2 };
  for (const u of [0.0, 0.13, 0.5, 0.77]) {
    const pp = rectSidePlacement(shp, u, 0);
    const back = nearestU(shp, pp.x, pp.z);
    const d = Math.min(Math.abs(back - u), 1 - Math.abs(back - u));   // wrap-around distance
    check(d < 0.01, `nearestU should round-trip u=${u} (got ${back.toFixed(3)})`);
  }

  return errs;
}
