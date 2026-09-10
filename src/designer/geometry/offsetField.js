// ── Growing a shape outward, correctly ───────────────────────────────────────────────────────────
//
// ⚠️ THIS EXISTS BECAUSE MOVING THE POINTS DOES NOT WORK, and three attempts proved it.
//
// Pushing each vertex out along its normal is right along a straight run and wrong at every corner.
// A convex corner can be patched — mitre it to `d / cos(θ/2)`, round it past a limit — and those
// patches did help. A REFLEX corner cannot: pushing outward there makes the two offset edges CROSS,
// and the crossing has to be REMOVED, which is a boolean union. Nothing local to a vertex can do it.
// On the digit "1", whose flag meets its stem at exactly such a corner, the leftover crossing showed
// as a wedge hanging off the bottom-left with no feature under it — reported three times, patched
// twice, still there.
//
// So the shape is not offset. It is REDRAWN at a distance:
//
//   1. measure the distance from every point on a grid to the outline, signed inside/outside
//   2. trace the contour where that distance equals the band width
//
// Every corner comes out right for free, because a distance field has no corners — the contour of a
// distance is what a compass draws, which is what a blade cuts and what the eye expects. Crossings
// cannot survive: a point is either d from the shape or it is not. Two letters whose bands would
// overlap come out as ONE merged band rather than two overlapping ones, which is also what happens
// in card.
//
// ⚠️ IT IS NOT USED FOR `weight`. That thickens a hairline IN PLACE and is tested never to break a
// design apart or raise the piece count; this merges anything that touches, which is the opposite of
// what a stroke-thickener may do. `offsetRing` stays for it. See the note in topperShape.js.

const MIN_N = 64;      // never coarser than this, or a small band goes faceted
const MAX_N = 420;     // nor finer: past here it is detail no blade could cut, paid for every frame

/* All the outline's segments, once. Both the outers and the holes: a hole is part of the boundary,
   and a band that ignored them would swallow the counter of an "O". */
function segmentsOf(parts) {
  const segs = [];
  for (const p of parts ?? []) {
    for (const ring of [p.outer, ...(p.holes ?? [])]) {
      if (!ring?.length) continue;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        segs.push([a.x, a.y, b.x, b.y]);
      }
    }
  }
  return segs;
}

/** Distance from a point to the nearest segment. */
function distTo(segs, x, y) {
  let best = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const [ax, ay, bx, by] = segs[i];
    const vx = bx - ax, vy = by - ay;
    const len = vx * vx + vy * vy;
    let t = len ? ((x - ax) * vx + (y - ay) * vy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + vx * t), dy = y - (ay + vy * t);
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/* Inside-ness by crossing count, EVEN-ODD, so a counter reads as outside — which it is. Done a row
   at a time: the crossings for a scanline are found once and reused across that row, which is the
   difference between this being usable and being a second of work. */
function insideRow(parts, y, xs) {
  const cross = [];
  for (const p of parts ?? []) {
    for (const ring of [p.outer, ...(p.holes ?? [])]) {
      if (!ring?.length) continue;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > y) !== (b.y > y)) cross.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
  }
  cross.sort((m, n) => m - n);
  const out = new Uint8Array(xs.length);
  for (let k = 0; k < xs.length; k++) {
    let c = 0;
    for (let i = 0; i < cross.length && cross[i] < xs[k]; i++) c++;
    out[k] = c & 1;
  }
  return out;
}

/* Marching squares, emitting DIRECTED segments so the rings come out consistently wound: an outer
   boundary anticlockwise, a hole clockwise. That is what lets the rings be sorted into outers and
   holes afterwards by the sign of their area, with no containment tests. */
const CASES = {
  1: [3, 0], 2: [0, 1], 3: [3, 1], 4: [1, 2], 6: [0, 2], 7: [3, 2],
  8: [2, 3], 9: [2, 0], 11: [2, 1], 12: [1, 3], 13: [1, 0], 14: [0, 3],
};

function march(grid, N, x0, y0, w, h, level) {
  const gx = (i) => x0 + (w * i) / N;
  const gy = (j) => y0 + (h * j) / N;
  const at = (i, j) => grid[j * (N + 1) + i];
  const segs = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const c = (v[0] < level ? 1 : 0) | (v[1] < level ? 2 : 0) | (v[2] < level ? 4 : 0) | (v[3] < level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      // 5 and 10 are the saddles. Resolved one way consistently: the alternative is a coin toss that
      // changes which way a band pinches at a waist, and consistency matters more than the choice.
      const key = c === 5 ? 3 : c === 10 ? 12 : c;
      const e = CASES[key];
      if (!e) continue;
      const lerp = (a, b, va, vb) => a + (b - a) * ((level - va) / (vb - va));
      const pt = (edge) => (
        edge === 0 ? { x: lerp(gx(i), gx(i + 1), v[0], v[1]), y: gy(j) }
        : edge === 1 ? { x: gx(i + 1), y: lerp(gy(j), gy(j + 1), v[1], v[2]) }
        : edge === 2 ? { x: lerp(gx(i), gx(i + 1), v[3], v[2]), y: gy(j + 1) }
        : { x: gx(i), y: lerp(gy(j), gy(j + 1), v[0], v[3]) });
      segs.push([pt(e[0]), pt(e[1])]);
    }
  }
  return segs;
}

/* Join the loose segments into closed rings. Endpoints are matched on a rounded key: marching
   squares produces the SAME point from both cells that share an edge, but only to floating-point
   luck, and a ring that fails to close is a ring that vanishes. */
function stitch(segs, tol) {
  const key = (p) => `${Math.round(p.x / tol)}:${Math.round(p.y / tol)}`;
  const from = new Map();
  for (const s of segs) {
    const k = key(s[0]);
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(s);
  }
  const rings = [];
  const used = new Set();
  for (const seg of segs) {
    if (used.has(seg)) continue;
    const ring = [seg[0]];
    let cur = seg;
    while (cur && !used.has(cur)) {
      used.add(cur);
      ring.push(cur[1]);
      const next = (from.get(key(cur[1])) ?? []).find(s => !used.has(s));
      if (!next) break;
      cur = next;
    }
    // Anything shorter is a speck from a grid cell clipping a corner, not a shape.
    if (ring.length > 6) rings.push(ring);
  }
  return rings;
}

const areaOf = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

const contains = (ring, p) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/**
 * Grow a set of contours outward by `d`, correctly at every corner.
 *
 * @param {Array} parts  `[{ outer, holes }]` in the shape's own units
 * @param {number} d     how far to grow, same units. Must be positive.
 * @returns {Array} new `[{ outer, holes }]` — possibly FEWER parts than went in, because two shapes
 *   whose bands meet come out as one. That is what happens in card, and it is the whole reason a
 *   thick offset can join separate letters into a single cuttable piece.
 */
export function offsetByDistance(parts, d) {
  if (!(d > 0) || !parts?.length) return parts ?? [];
  const segs = segmentsOf(parts);
  if (!segs.length) return parts;

  let lo = Infinity, hi = -Infinity, bo = Infinity, to = -Infinity;
  for (const [ax, ay, bx, by] of segs) {
    lo = Math.min(lo, ax, bx); hi = Math.max(hi, ax, bx);
    bo = Math.min(bo, ay, by); to = Math.max(to, ay, by);
  }
  const pad = d * 1.5;                       // room for the band, and for the contour to close
  const x0 = lo - pad, y0 = bo - pad;
  const w = (hi - lo) + pad * 2, h = (to - bo) + pad * 2;
  if (!(w > 0) || !(h > 0)) return parts;

  /* ⚠️ RESOLUTION FOLLOWS THE BAND, NOT THE GLYPH. The contour at distance d is smooth at the scale
     of d — that is what a distance field does — so cells about a quarter of the band wide are
     enough, and a fine grid would only buy detail no blade could cut while costing it every time
     somebody nudges the slider. */
  const N = Math.max(MIN_N, Math.min(MAX_N, Math.ceil(Math.max(w, h) / (d / 4))));

  const grid = new Float32Array((N + 1) * (N + 1));
  const xs = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) xs[i] = x0 + (w * i) / N;
  for (let j = 0; j <= N; j++) {
    const y = y0 + (h * j) / N;
    const insideFlags = insideRow(parts, y, xs);
    for (let i = 0; i <= N; i++) {
      const dist = distTo(segs, xs[i], y);
      grid[j * (N + 1) + i] = insideFlags[i] ? -dist : dist;
    }
  }

  const rings = stitch(march(grid, N, x0, y0, w, h, d), Math.max(w, h) / N / 4);
  if (!rings.length) return parts;

  /* ⚠️ WHICH WINDING MEANS "OUTER" IS READ OFF THE RINGS, NOT ASSUMED. The marching table decides
     it, and getting that backwards classifies every outer boundary as a hole — which is silent:
     there is then nothing to build, the offset returns its input unchanged, and the band simply does
     not appear. It did exactly that first time round. The biggest ring by area is always an outer,
     so its sign defines the convention and the rest follow. */
  const biggest = rings.reduce((m, r) => (Math.abs(areaOf(r)) > Math.abs(areaOf(m)) ? r : m), rings[0]);
  const outerSign = Math.sign(areaOf(biggest)) || 1;

  const outers = [], holes = [];
  for (const r of rings) (Math.sign(areaOf(r)) === outerSign ? outers : holes).push(r);
  if (!outers.length) return parts;

  /* Handed on wound the way the rest of this file expects — outer anticlockwise, holes clockwise —
     so a caller never has to know which way the marching happened to go. */
  const facing = (ring, want) => (Math.sign(areaOf(ring)) === want ? ring : [...ring].reverse());
  const built = outers.map(outer => ({ outer: facing(outer, 1), holes: [] }));
  for (const hole of holes) {
    const owner = built.find(b => contains(b.outer, hole[0]));
    if (owner) owner.holes.push(facing(hole, -1));
  }
  return built;
}
