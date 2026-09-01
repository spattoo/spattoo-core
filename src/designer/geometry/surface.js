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
import { tierGeometry } from '../cakeShapes.js';
import {
  scaledOutline, polygonPerimeter, multiPolygonPerimeter, asRings,
  pointInPolygon, nearestOnPolygon, scalePolygon, polygonRadius,
} from './shapes.js';
import { isGlyphFamily, glyphDescriptor } from './glyphShape.js';

// THREE kinds, and the third is the general case:
//   { kind:'round',   radius }                                   — analytic circle (the cylinder path)
//   { kind:'rect',    halfW, halfD, cornerR, pipingCornerR }     — analytic rounded rectangle (sheet)
//   { kind:'outline', halfW, halfD, outline: [{x,z}…] }          — ANY footprint (heart, butterfly, …)
//
// Round and rect stay analytic on purpose: every cake that exists today must take exactly the code it
// took before, so adding shapes cannot regress one. Everything else routes through the polygon ops,
// which means a new shape is an outline — data — and no consumer of this module changes.
//
// Width (X) is the long side, depth (Z) the short side. `pipingCornerR` is the gentler corner
// the piping ring follows (≥ body cornerR, capped so small cakes don't over-round).
export function tierShape(tier) {
  const { family, config } = tierGeometry(tier);   // from the tier itself, else the catalog; never a crash

  if (family === 'rounded_rect' || tier?.shape === 'rect') {
    const square = !!config?.square;
    const halfW = (tier.width ?? 2.16) / 2;
    const halfD = (square ? (tier.width ?? 2.16) : (tier.depth ?? 1.56)) / 2;
    const cornerR = tier.cornerR ?? SHEET_CORNER_RADIUS;
    return {
      kind: 'rect', halfW, halfD, cornerR,
      pipingCornerR: Math.max(cornerR, Math.min(SHEET_PIPING_CORNER_RADIUS, 0.55 * Math.min(halfW, halfD))),
    };
  }

  if (isGlyphFamily(family)) {
    // A cake shaped like the typed characters — the `number` (digits) and `letter` (A–Z) families. The
    // footprint comes from font glyphs (with their counters), so it renders as its OWN kind (`glyph`: a
    // THREE.Shape[] extrude, holes and all) rather than the single-contour outline prism. Sized by HEIGHT,
    // chosen by the CHARACTER COUNT: every string of a given count comes out the same tall and just grows
    // wider — so what admin authored per count is what the customer gets. The descriptor (kind/shapes/
    // outline/halfW/halfD/thickness/shellRadius) is built ONCE in glyphShape.glyphDescriptor and shared by
    // both families — see there for the shellRadius rationale (short-axis half-height × per-count pipingScale).
    return glyphDescriptor(family, config);
  }

  if (family !== 'circle') {
    // An outline shape is sized by the SAME two numbers a sheet cake uses, so one set of size
    // controls drives every shape. Falls back to the tier's radius when width/depth aren't authored.
    const r = tier.radius ?? 1.2;
    const halfW = (tier.width ?? r * 2) / 2;
    const halfD = (tier.depth ?? r * 2) / 2;
    const outline = scaledOutline(family, config, halfW, halfD);
    // `family` travels with the descriptor so a reader can ask "is this the SAME shape as that?" —
    // an edible sheet cut as a heart fills a heart cake exactly, and inscribes on anything else. The
    // outline alone cannot answer that without comparing polygons.
    if (outline) return { kind: 'outline', family, halfW, halfD, outline };
  }

  return { kind: 'round', radius: tier.radius ?? 1.2 };
}

// Does this wall wrap a single analytic cylinder? ONLY the round family does — its side is placed
// and hit-tested by a polar angle (theta) against `radius`. EVERY other shape (rect AND any outline:
// heart, butterfly, number…) has a non-circular wall walked by perimeter fraction `u` via
// perimeter()/rectSidePlacement()/nearestU(). Side placement must branch on THIS, not on `=== 'rect'`
// — treating "not rect" as round strands an outline decal on an imaginary bounding-radius circle
// instead of on the actual wall. One predicate so the four side-placement sites can't drift apart.
export function isRoundWall(shape) {
  return !shape.outline && shape.kind !== 'rect';
}

// Largest horizontal half-extent — a "bounding radius" so radius-based incidental
// placement (board size, toolbar offsets, topper scale) keeps working for every shape.
export function boundingRadius(shape) {
  if (shape.kind === 'rect') return Math.max(shape.halfW, shape.halfD);
  // Any outline-bearing shape (heart, number, …) measures to its FARTHEST contour point, not the
  // bounding-box half-extent — a "2" reaches toward its box corners, so max(halfW,halfD) leaves the
  // digit overhanging a board/camera framed to it. polygonRadius is the true containing radius.
  if (shape.outline) return polygonRadius(shape.outline);
  return shape.radius;
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

// Perimeter for a shape descriptor (the common entry point for placement/hit-testing). Every op below
// keys off `shape.outline` — NOT the exact kind — so ANY shape that carries a contour (heart, polygon,
// a number cake, whatever lands next) traces it generically; only the two ANALYTIC families (round,
// rect) have no outline and keep their closed-form perimeter. Decoration is outline-driven, not per-shape.
export function perimeter(shape) {
  if (shape.outline) return multiPolygonPerimeter(asRings(shape.outline));
  return shape.kind === 'rect'
    ? roundedRectPerimeter(shape.halfW, shape.halfD, shape.cornerR)
    : circlePerimeter(shape.radius);
}

// Perimeter the piping ring walks — uses the gentler `pipingCornerR` so shells flow
// around corners. Straight runs still sit on the body's faces (±halfW / ±halfD); only
// the corner is rounded more. This COMBINED form (one arc-length coordinate over every ring) is for
// single-shell placement; the garland ring walks each contour separately — see pipingPerimeters.
export function pipingPerimeter(shape) {
  if (shape.outline) return multiPolygonPerimeter(asRings(shape.outline));
  return shape.kind === 'rect'
    ? roundedRectPerimeter(shape.halfW, shape.halfD, shape.pipingCornerR ?? shape.cornerR)
    : circlePerimeter(shape.radius);
}

// The piping GARLAND walks each CONTOUR as its own closed loop, so a multi-digit number's digits are
// each ringed on their own and no shell ever bridges the gap between them (the "1—0" join). Round/rect
// are a single loop; an outline is one loop per ring. The caller runs perimeterRing per loop and
// concatenates — a single-ring shape (heart, single digit) yields exactly one loop, unchanged.
export function pipingPerimeters(shape) {
  if (shape.outline) return asRings(shape.outline).map(polygonPerimeter);
  return [pipingPerimeter(shape)];
}

// The COUNTER (hole) contours a piping ring also borders — the inner edges of an 8/0/A/…, so a shell
// border frames every edge of a glyph, not just its silhouette. Empty for any shape without holes
// (round, rect, heart, a digit like 1/7). The caller walks these with the OPPOSITE offset sign to the
// outline (out INTO the material, away from the hole) so beads sit on the counter's edge, not in the gap.
export function pipingHolePerimeters(shape) {
  return (shape.holes ?? []).map(polygonPerimeter);
}

// ── Top-surface placement ─────────────────────────────────────────────────────
// Clamp a top point (x,z) to within the tier footprint, scaled by margin k.
//   Round: pull onto the inscribed circle of radius·k (matches the old r>maxR rescale).
//   Rect:  clamp each axis independently to halfW·k / halfD·k, so a decoration can reach
//          the rectangle's corners instead of being trapped in an inscribed circle.
export function topClamp(shape, x, z, k = 0.92) {
  if (shape.outline) {
    // The footprint shrunk by k, keeping its silhouette — a decoration on a heart stays inside the
    // HEART, not inside some inscribed circle that would strand the lobes.
    const inner = scalePolygon(shape.outline, k);
    if (pointInPolygon(inner, x, z)) return { x, z };
    const p = nearestOnPolygon(inner, x, z);
    return { x: p.x, z: p.z };
  }
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
  if (shape.outline) {
    // Absolute margin → the equivalent shrink factor on the shape's smaller half-extent, so the inset
    // is (very nearly) `margin` all the way round without running a true polygon offset on the drag path.
    const half = Math.max(1e-6, Math.min(shape.halfW, shape.halfD));
    return topClamp(shape, x, z, Math.max(0, 1 - margin / half));
  }
  if (shape.kind === 'rect') {
    const mx = Math.max(0, shape.halfW - margin), mz = Math.max(0, shape.halfD - margin);
    return { x: Math.max(-mx, Math.min(mx, x)), z: Math.max(-mz, Math.min(mz, z)) };
  }
  const maxR = Math.max(0, shape.radius - margin);
  const r = Math.hypot(x, z);
  return r > maxR ? { x: (x * maxR) / r, z: (z * maxR) / r } : { x, z };
}

/* ── The BOARD ring: inside the board, outside the cake ──────────────────────────────────────────
 *
 * A decoration standing on the board has a usable area shaped like a washer: the board's own
 * footprint with the cake's footprint punched out of it. Everything else on a flat surface clamps to
 * a solid shape (topClamp / topClampInset), which is why a board decoration had nowhere to be — drag
 * it toward the middle and it walks under the cake, which is opaque, and the decoration simply
 * disappears.
 *
 * Two constraints, applied in that order:
 *   1. keep it ON the board  — clamped inward by `margin` so a footprint does not overhang the edge
 *   2. push it OFF the cake  — moved radially outward until its footprint clears the cake's outline
 *
 * ⚠️ Order matters and step 2 wins. On a board barely wider than its cake the ring can be thinner
 * than the decoration, and there is no position satisfying both. Standing slightly proud of the
 * board edge is recoverable — the baker sees it and drags it — where standing inside an opaque cake
 * is not, because there is nothing left to grab.
 *
 * `hole` is the CAKE's shape (tierShape of the bottom tier), not a radius: a heart cake has a heart
 * footprint, and clearing an inscribed circle would strand a decoration inside the lobes.
 */
export function boardRingClamp(board, hole, x, z, margin = 0) {
  // 1 — on the board.
  const onBoard = topClampInset(board, x, z, margin);
  if (!hole) return onBoard;

  // 2 — off the cake. Work in the direction away from the cake's centre, which is the board's centre.
  const r = Math.hypot(onBoard.x, onBoard.z);
  // Dead centre has no outward direction; nudge along +z (toward the FRONT of the cake, where a
  // decoration is most likely wanted and always visible) rather than picking an arbitrary axis.
  const dir = r < 1e-6 ? { x: 0, z: 1 } : { x: onBoard.x / r, z: onBoard.z / r };

  // How far the cake's outline reaches in this direction — plus the decoration's own half-width, so
  // it clears rather than touches.
  const reach = shapeReach(hole, dir) + margin;
  if (r >= reach) return onBoard;
  return { x: dir.x * reach, z: dir.z * reach };
}

/* How far a shape's outline extends from its centre along a unit direction.
 *
 * Round → the radius. Rect → the box edge in that direction. Outline → the furthest vertex within a
 * narrow cone about the direction, which is cheap and slightly conservative: on a heart it can push a
 * decoration a little further out than strictly needed, and erring outward is the safe direction
 * (see the note on boardRingClamp — outward is recoverable, inward is not).
 */
export function shapeReach(shape, dir) {
  if (shape.outline) {
    let best = 0;
    for (const p of shape.outline) {
      const d = p.x * dir.x + p.z * dir.z;          // projection onto the direction
      if (d > best) best = d;
    }
    return best;
  }
  if (shape.kind === 'rect') {
    // The box's own extent along dir: |dx|·halfW + |dz|·halfD is the support function of a rectangle.
    return Math.abs(dir.x) * shape.halfW + Math.abs(dir.z) * shape.halfD;
  }
  return shape.radius ?? 0;
}

// Snap a point (x,z) ONTO the rim perimeter (nearest edge point). Edge-seated modes (perch, verge)
// live on the rim, so dragging moves them AROUND the rim rather than inward onto the top surface
// (where a centre-seated element would bury its lower half in the cake). Round → project to the
// radius; rect → nearest point on the rounded-rect perimeter (via nearestU).
export function snapToRim(shape, x, z) {
  if (shape.outline) {
    const p = nearestOnPolygon(shape.outline, x, z);
    return { x: p.x, z: p.z };
  }
  if (shape.kind !== 'rect') {
    const r = Math.hypot(x, z) || 1;
    return { x: (x / r) * shape.radius, z: (z / r) * shape.radius };
  }
  const perim = perimeter(shape);
  const p = perim.at((((nearestU(shape, x, z) % 1) + 1) % 1) * perim.length);
  return { x: p.x, z: p.z };
}

// Is (x,z) on the top surface (margin k)? Drives tap-to-place hit testing.
export function topContains(shape, x, z, k = 1) {
  if (shape.outline) return pointInPolygon(k === 1 ? shape.outline : scalePolygon(shape.outline, k), x, z);
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

  // ── A CORNER ONLY GETS SHELLS IF IT CAN HOLD THEM ───────────────────────────────────────────
  // This used to drop exactly ONE shell on every corner's bisector, asking only that the fillet
  // exist (`cr >= 0.02`) — never that it be big enough. A shell is laid TANGENTIALLY, across its
  // facing, so one sitting on a fillet shorter than itself overhangs both ends of that fillet and
  // the overhang is not over the cake: it is over the air beside it.
  //
  // On a sheet the fillet is only ever as big as the ring's own outset (`SHEET_PIPING_CORNER_RADIUS`
  // is 0, so cr = off), which is small. The reported case: a scroll 0.688 across on a 0.336 arc —
  // twice too long — put four shells 0.181 clear of the wall, floating at the corners.
  //
  // So the fillet is measured against the shell. It carries however many WHOLE shells fit at the
  // authored step, which is none at all on a normal sheet, and the two straight runs then meet
  // directly.
  const arcLen = (Math.PI / 2) * cr;
  const cornerN = Math.floor(arcLen / step);
  const filled = cornerN > 0;

  // ── AND THE END MARGIN FOLLOWS FROM THAT ────────────────────────────────────────────────────
  // Each edge used to centre its shells with a half-pitch margin at both ends (`t = (i+0.5)/N`).
  // That is exactly right where the junction is SMOOTH — a straight run flowing into a tangent
  // fillet — and wrong where it is a hard right angle, because the turn eats the chord: two shells
  // half a pitch either side of a corner are `hypot(p/2, p/2)` = 0.71p apart, not p.
  //
  // Writing `len = 2m + (N-1)p` and tying m to p by the junction gives an exact solve for both:
  //
  //   filled fillet — smooth junction, so the old half-pitch margin stands:  m = p/2
  //   hard corner   — the two end shells sit on perpendicular faces, `cr + m` from the corner along
  //                   each, so they are (cr + m)·√2 apart:  (cr + m)√2 = p  ⇒  m = p/√2 − cr
  //
  // N is then chosen the way a swag's count is (see festoon.js): by which candidate lands the
  // PITCH nearest the authored step, scored as a ratio, rather than by rounding the count — the
  // count is not what the eye judges.
  const edge = (ax, az, bx, bz, nx, nz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) return;                               // collapsed side (deep inset): skip
    const pitchOf = (n) => (filled ? len / n : (len + 2 * cr) / (n - 1 + Math.SQRT2));
    const ideal   = filled ? len / step : (len + 2 * cr) / step - Math.SQRT2 + 1;
    const lo = Math.max(1, Math.floor(ideal)), hi = Math.max(1, Math.ceil(ideal));
    const err = (n) => { const r = pitchOf(n) / step; return r >= 1 ? r : 1 / r; };
    const N = err(hi) < err(lo) ? hi : lo;
    // Clamped: a fillet wider than the pitch would otherwise ask for a negative margin, i.e. a
    // shell off the end of its own edge. The walk below uses the REAL gap, so positions stay valid.
    const m = Math.min(Math.max(filled ? pitchOf(N) / 2 : pitchOf(N) * Math.SQRT1_2 - cr, 0), len / 2);
    const gap = N > 1 ? (len - 2 * m) / (N - 1) : 0;
    const yaw = Math.atan2(nz, nx);
    for (let i = 0; i < N; i++) {
      const t = N === 1 ? 0.5 : (m + i * gap) / len;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      out.push({ pos: [x, baseY, z], rotY: yaw, tq: [0, 0, 0, 1] });
    }
  };
  // The fillet walked like any other run: `cornerN` shells across its 90°, half-pitch margins at
  // both ends so it meets the straight runs at the same spacing they use internally.
  const corner = (cx, cz, a0) => {
    for (let i = 0; i < cornerN; i++) {
      const a = a0 - (Math.PI / 2) * ((i + 0.5) / cornerN);
      const nx = Math.cos(a), nz = Math.sin(a);
      out.push({ pos: [cx + cr * nx, baseY, cz + cr * nz], rotY: a, tq: [0, 0, 0, 1] });
    }
  };
  // Walk the four sides + corners, in perimeter order (front, FR, right, BR, back, BL, left, FL).
  // Each fillet sweeps 90° clockwise from the facing of the run that fed into it.
  const HP = Math.PI / 2;
  edge(-sx, halfD,  sx, halfD,  0,  1); corner( sx,  sz,  HP);
  edge(halfW,  sz, halfW, -sz,  1,  0); corner( sx, -sz,  0);
  edge( sx, -halfD, -sx, -halfD, 0, -1); corner(-sx, -sz, -HP);
  edge(-halfW, -sz, -halfW,  sz, -1, 0); corner(-sx,  sz, -Math.PI);
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

// ── Where a dragged decoration lands on a surface ───────────────────────────────────────────────
// The number topper's and cream writing's move maps, lifted out of their components so they can be
// asked the movable contract's questions. They were four and twelve lines inside a `resolve` that
// also did raycasting, and a map you cannot call is a map you cannot test — which is how three grab
// planes stayed single-sided and a drag stayed dead over most of a cake.
//
// These take the world point the ray already hit, not the ray: intersecting is the canvas's job and
// needs a camera. What lands here is the part with a rule in it.

/**
 * The number topper, on the cake top. A direct assignment, clamped inside the tier — so it has no
 * solve to go dead and no scale to disturb, which is the whole of why it never broke the way the
 * rainbow's did.
 */
export function numberTopperPlaceAt(shape, hit) {
  if (!hit) return null;
  const p = shape ? topClamp(shape, hit.x, hit.z, 1.0) : hit;
  return { offsetX: p.x, offsetZ: p.z };
}

/**
 * Cream writing, on any of its three surfaces. Each writes its own pair of coordinates, and which
 * pair is part of what the surface MEANS — a writing on a round wall is at an angle and a height,
 * one on a flat wall is at an x and a height, and one on the board is at an x and a z.
 */
export function writingPlaceAt({ surface, sideRect, sideWidth, minSideY, maxSideY, shape, boardShape }, hit) {
  if (!hit) return null;
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (surface === 'side' && !sideRect) {
    return { sideAngle: hit.theta, sideY: clampTo(hit.y, minSideY, maxSideY) };
  }
  if (surface === 'side') {
    return { offsetX: clampTo(hit.x, -sideWidth / 2, sideWidth / 2),
             sideY: clampTo(hit.y, minSideY, maxSideY) };
  }
  const cs = surface === 'board' ? (boardShape ?? shape) : shape;
  const p = cs ? topClamp(cs, hit.x, hit.z, 1.0) : hit;
  return surface === 'board' ? { boardX: p.x, boardZ: p.z } : { offsetX: p.x, offsetZ: p.z };
}

/* ── Where a typed message actually sits ─────────────────────────────────────────────────────────
 *
 * One resolution, shared by every material a message can be made of — piped cream today, cut acrylic
 * now, whatever comes next. It was inline in CreamWriting.jsx, which was fine while cream was the
 * only kind; a second renderer copying it is how two decorations start disagreeing about where the
 * same message is.
 *
 * ⚠️ THE TIER COMES FROM THE HEIGHT, never from a stored key. Dragging a message up the cake crosses
 * tiers and the radius has to follow it — a stored `sideTier` was tried and reverted because it
 * clamped the drag to one wall and took away something bakers were already doing. That rule now
 * applies to every material by construction rather than by each one remembering it.
 */
export function writingSurface({
  writing, tiers, topY, topRadius, shape = 'round', width = 0, depth = 0, boardRadius = 0,
}) {
  const surface = writing?.surface ?? 'top';
  const fit     = writing?.fit ?? 0.8;
  const isRect  = shape === 'rect';

  const bottom    = tiers?.[0];
  const cakeBaseR = bottom ? (bottom.shape === 'rect' ? Math.max(bottom.width, bottom.depth) / 2 : bottom.radius) : topRadius;
  const sideY     = writing?.sideY ?? (bottom ? bottom.baseY + bottom.height / 2 : topY / 2);
  const sideTier  = tiers?.find(t => sideY >= t.baseY && sideY <= t.baseY + t.height) ?? bottom;
  const sideRect  = (sideTier?.shape ?? shape) === 'rect';
  const sideR     = sideTier ? (sideRect ? sideTier.depth / 2 : sideTier.radius) : topRadius;
  const sideH     = sideTier?.height ?? 1;
  const sideFaceW = sideRect ? (sideTier?.width ?? width) : sideR * 2.0;

  let maxW, maxH;
  if (surface === 'side')       { maxW = sideFaceW * fit; maxH = sideH * fit; }
  else if (surface === 'board') { maxW = maxH = (boardRadius || topRadius) * 0.9 * fit; }
  else                          { maxW = (isRect ? width : 2 * topRadius) * fit; maxH = (isRect ? depth : 2 * topRadius) * fit; }

  const minSideY = 0.14, maxSideY = Math.max(minSideY + 0.05, topY - 0.14);
  return {
    surface, fit, bottom, cakeBaseR, sideY, sideTier, sideRect, sideR, sideH, sideFaceW,
    maxW, maxH, minSideY, maxSideY,
    wrapRadius: surface === 'side' && !sideRect ? sideR + 0.006 : 0,
  };
}
