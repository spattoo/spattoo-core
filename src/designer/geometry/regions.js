// ── What encloses what: turning strokes into regions ─────────────────────────────────────────────
//
// A region is an area with an inside. It is what can be FILLED and what can carry its own COLOUR —
// white chocolate inside dark — and it is the thing the studio has never had.
//
// ⚠️ A REGION IS NOT A STROKE, and treating it as one is the bug this exists to fix. Nobody draws a
// triangle in one gesture; they draw three lines. Under a per-stroke model none of those three closes
// on its own, so the triangle has no inside: it cannot be filled and cannot be coloured. Filling only
// ever worked for shapes drawn in a single unbroken loop, which is not how anybody draws.
//
// ⚠️ THE WELD TOLERANCE IS THE WHOLE DESIGN. Two lines that a person means to meet do not meet
// exactly. Too tight and a hand-drawn triangle stays three open lines; too loose and two shapes that
// merely pass near each other fuse into one. It scales with the piece, because the same absolute gap
// is a rounding error on a large drawing and a deliberate space on a small one — the same lesson the
// fill's closure test taught expensively, where 9% of the shape was far too tight for a hand and hid
// the feature completely.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const WELD_FRACTION = 0.04;   // of the drawing's bounding diagonal
const WELD_FLOOR    = 6;      // plate units, for a drawing too small for the fraction to mean much

export function weldTolerance(paths, { fraction = WELD_FRACTION, floor = WELD_FLOOR } = {}) {
  const pts = paths.flat();
  if (pts.length < 2) return floor;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Math.max(floor, diag * fraction);
}

/**
 * paths  the strokes, each [[x, y], …] — outlines only, never generated fill passes
 *
 * Returns `{ regions, openPaths }`:
 *   regions    [{ ring, paths }] — `ring` is a closed loop of points (last repeats first), `paths`
 *              the indices of the strokes that formed it, in the order they are walked
 *   openPaths  indices of strokes that are part of no region — a vein, a swirl, a letter, which are
 *              perfectly good things to pipe and simply have no inside
 */
export function findRegions(paths, opts = {}) {
  const valid = (paths ?? []).map((p, i) => ({ p, i })).filter(s => Array.isArray(s.p) && s.p.length >= 2);
  if (!valid.length) return { regions: [], openPaths: [] };
  const weld = opts.weld ?? weldTolerance(valid.map(s => s.p), opts);

  /* Endpoints that fall within the tolerance become ONE node. Done by simple clustering rather than
   * union-find: a drawing has tens of strokes, not thousands, and the readable version is the one
   * that will still be understood when the weld rule is next questioned. */
  const nodes = [];
  const nodeOf = pt => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], pt) <= weld) return i;
    nodes.push([...pt]);
    return nodes.length - 1;
  };

  const edges = valid.map(({ p, i }) => ({
    stroke: i,
    pts: p,
    a: nodeOf(p[0]),
    b: nodeOf(p[p.length - 1]),
    used: false,
  }));

  const regions = [];

  /* ⚠️ A SELF-LOOP IS A REGION ON ITS OWN — a shape drawn in one unbroken gesture, which is the only
   * case the old per-stroke test could see. Taken first so the walk below never has to reason about
   * an edge whose two ends are the same node. */
  for (const e of edges) {
    if (e.a === e.b && e.pts.length >= 4) {
      e.used = true;
      regions.push({ ring: closeRing(e.pts), paths: [e.stroke] });
    }
  }

  /* Then the multi-stroke cycles. Walk from an unused edge, always taking an unused edge that
   * continues from the node just reached, until arriving back where the walk began. Anything that
   * closes is a region; anything that runs out is put back and its edges stay available to a later
   * walk that may close through them. */
  for (const start of edges) {
    if (start.used) continue;
    const walk = [];
    let node = start.a;
    let edge = start;

    while (edge) {
      walk.push({ edge, from: node });
      edge.used = true;
      node = edge.a === node ? edge.b : edge.a;
      if (node === start.a && walk.length >= 2) break;      // closed
      edge = edges.find(e => !e.used && (e.a === node || e.b === node));
    }

    if (node === start.a && walk.length >= 2) {
      const ring = [];
      for (const step of walk) {
        // Each stroke joins in the direction it is being traversed, so the ring reads continuously
        // rather than doubling back at every join.
        const pts = step.edge.a === step.from ? step.edge.pts : [...step.edge.pts].reverse();
        for (const pt of pts) {
          if (!ring.length || dist(ring[ring.length - 1], pt) > 1e-9) ring.push(pt);
        }
      }
      regions.push({ ring: closeRing(ring), paths: walk.map(s => s.edge.stroke) });
    } else {
      for (const step of walk) step.edge.used = false;      // no cycle: give the edges back
    }
  }

  const claimed = new Set(regions.flatMap(r => r.paths));
  return { regions, openPaths: valid.map(s => s.i).filter(i => !claimed.has(i)) };
}

const closeRing = pts =>
  (dist(pts[0], pts[pts.length - 1]) < 1e-9 ? pts.slice() : [...pts, pts[0]]);

/** Is `inner` wholly inside `outer`? A region inside another is the nested case — white chocolate
 *  inside dark — and, on a cut panel, a HOLE. One test answers both. */
export function isInside(inner, outer) {
  return inner.every(p => pointInRing(p, outer));
}

// Even-odd ray crossing. The half-open edge test keeps a point level with a vertex from counting
// twice, which is the classic source of a point being called outside a ring it sits well within.
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
