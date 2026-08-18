// ── Turning a decoration's alpha into a shape you can cut ────────────────────────────────────────
//
// A baker making a fondant lion needs its OUTLINE at the real size, on paper, to cut around. The
// decoration is already a PNG with a transparent background — the 2D pipeline removed it at save —
// so the shape is sitting in the alpha channel and needs no GPT call, no vision model, nothing but
// arithmetic.
//
// ── Why pixel-edge walking and not marching squares ─────────────────────────────────────────────
// Marching squares interpolates an isoline through cell midpoints and has two genuinely ambiguous
// cases (the saddles, 5 and 10) that every implementation resolves by convention. For a BINARY mask
// none of that buys anything: the boundary is exactly the set of unit edges where a filled pixel
// meets an empty one. Walking those is exact rather than approximate, has no ambiguous case, and
// gives closed loops whose WINDING already says outer-versus-hole. The staircase it produces is
// then simplified away — and it has to be simplified either way, so starting exact costs nothing.
//
// ── Winding tells you what a loop IS ────────────────────────────────────────────────────────────
// Edges are emitted so the filled pixel is always on the same side of travel. An outer boundary
// therefore comes out one way round and a hole the other, and the signed area separates them with
// no containment test, no point-in-polygon, no sorting by bounding box.
//
// That matters for a cutting template: an OUTER loop is a line you cut along, a HOLE is a line you
// draw and do not cut — a unicorn's eye is a marking, not a piece to remove. The caller decides
// what to do with each, but it must be able to tell them apart.

/** A pixel is part of the shape when its alpha clears the threshold. 128 = "more opaque than not". */
const DEFAULT_ALPHA = 128;

const key = (x, y) => `${x},${y}`;

/**
 * Every closed boundary loop in an RGBA bitmap's alpha channel.
 *
 * @param {{ data: Uint8ClampedArray|number[], width: number, height: number }} img  RGBA, 4 bytes per pixel.
 * @param {{ alphaThreshold?: number }} [opts]
 * @returns {Array<{ points: Array<[number, number]>, area: number, hole: boolean }>}
 *   Points are in PIXEL space, first point repeated at the end so the loop is explicitly closed.
 *   `area` is unsigned; `hole` is the winding's verdict. Sorted largest first — the shape before
 *   its details, which is also the order a caller wants for "just give me the silhouette".
 */
export function traceAlpha(img, opts = {}) {
  const { data, width: w, height: h } = img;
  const threshold = opts.alphaThreshold ?? DEFAULT_ALPHA;

  const filled = (x, y) =>
    x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= threshold;

  // Directed unit edges, each oriented so the filled pixel is on the same side of travel. Outside
  // the image counts as empty, so a shape running off the edge still closes along the border
  // instead of leaving an open chain the stitcher would drop.
  const from = new Map();   // "x,y" → [[end, edge], …]
  const add = (x1, y1, x2, y2) => {
    const k = key(x1, y1);
    if (!from.has(k)) from.set(k, []);
    from.get(k).push([x2, y2]);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add(x,     y,     x + 1, y    );  // top,    left → right
      if (!filled(x + 1, y)) add(x + 1, y,     x + 1, y + 1);  // right,  top → bottom
      if (!filled(x, y + 1)) add(x + 1, y + 1, x,     y + 1);  // bottom, right → left
      if (!filled(x - 1, y)) add(x,     y + 1, x,     y    );  // left,   bottom → top
    }
  }

  const loops = [];
  while (from.size) {
    // Any remaining edge starts a loop. Every edge has exactly one continuation from its endpoint
    // except where four diagonal pixels meet, which is why the walk takes the FIRST available and
    // leaves the rest — that vertex is visited again by the loop that needs it.
    const startKey = from.keys().next().value;
    let [cx, cy] = startKey.split(',').map(Number);
    const points = [[cx, cy]];

    for (;;) {
      const outs = from.get(key(cx, cy));
      if (!outs || !outs.length) break;          // open chain — cannot happen on a closed mask
      const [nx, ny] = outs.shift();
      if (!outs.length) from.delete(key(cx, cy));
      points.push([nx, ny]);
      cx = nx; cy = ny;
      if (cx === points[0][0] && cy === points[0][1]) break;   // closed
    }

    if (points.length > 3) {
      // Sign convention, worked out from one pixel rather than assumed: the four edges above walk
      // (0,0)→(1,0)→(1,1)→(0,1)→(0,0), whose shoelace sum is +1. So POSITIVE is an outer boundary
      // here and negative is a hole — the opposite of the maths-class reading, because y runs down.
      const a = signedArea(points);
      loops.push({ points, area: Math.abs(a), hole: a < 0 });
    }
  }

  return loops.sort((p, q) => q.area - p.area);
}

/**
 * Twice the signed area (the shoelace sum). Sign is the winding; magnitude is area × 2.
 *
 * In this image space y runs DOWN, so the sign reads opposite to the maths-class convention — which
 * is exactly why this returns the raw number and lets `traceAlpha` name what the sign means, rather
 * than exporting a `isClockwise` that would be wrong half the time depending on who was asking.
 */
export function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * Ramer–Douglas–Peucker. A traced outline is one point per pixel edge — a 400 px lion is thousands
 * of collinear staircase steps, and a PDF of that is both enormous and, printed, indistinguishable
 * from the simplified version.
 *
 * `tolerance` is in pixels: no simplified point strays further than that from the original line.
 */
export function simplify(points, tolerance = 1) {
  if (points.length < 3) return points.slice();

  // Closed rings need care: RDP anchors its two endpoints, and on a ring those are the SAME point,
  // so the whole loop collapses towards it. Splitting at the far point gives two open chains with
  // four genuinely distinct anchors between them.
  const closed = points[0][0] === points[points.length - 1][0]
              && points[0][1] === points[points.length - 1][1];
  if (!closed) return rdp(points, tolerance);

  const ring = points.slice(0, -1);
  let far = 0, best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = dist2(ring[0], ring[i]);
    if (d > best) { best = d; far = i; }
  }
  const a = rdp(ring.slice(0, far + 1), tolerance);
  const b = rdp(ring.slice(far), tolerance);
  const out = a.concat(b.slice(1));
  out.push(out[0]);
  return out;
}

function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  const left  = rdp(pts.slice(0, idx + 1), tol);
  const right = rdp(pts.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}

const dist2 = ([ax, ay], [bx, by]) => (ax - bx) ** 2 + (ay - by) ** 2;

function perpDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
}

/**
 * The whole job: alpha → simplified loops in MILLIMETRES, ready to draw on a page.
 *
 * @param {{data, width, height}} img
 * @param {number} widthMm  How wide the decoration is on the finished cake. This is the number the
 *                          feature lives or dies by — an outline at the wrong size is worthless, and
 *                          it comes from the DESIGN (a lion is smaller on a 6" cake than a 10"), not
 *                          from the element. The caller owns that sum; this only scales to it.
 * @param {{ alphaThreshold?: number, toleranceMm?: number, holes?: boolean }} [opts]
 * @returns {{ widthMm: number, heightMm: number, cut: Array, mark: Array }}
 *   `cut` are outer boundaries — lines to cut along. `mark` are holes: on a cutting template these
 *   are drawn but NOT cut, because a unicorn's eye is a marking rather than a piece to remove.
 */
export function outlineMm(img, widthMm, opts = {}) {
  const all = traceAlpha(img, opts);
  if (!all.length) return { widthMm, heightMm: 0, cut: [], mark: [] };

  // ── Speckle ────────────────────────────────────────────────────────────────────────────────────
  // Measured against the real catalogue, not imagined: a grass clump traced to 46 "holes", a leaf
  // branch to 39, and a football player to 8 separate outer loops. None of them are features. They
  // are anti-aliased edge pixels and leftovers from background removal — a few pixels each, invisible
  // on screen and meaningless on paper. Printed, they are 46 marks a baker has to decide about.
  //
  // TWO floors, because neither alone is enough:
  //
  //   ratio    the same decoration exists at 512² and 1024², and an absolute cut-off would filter
  //            them differently. Half a percent of the shape scales with whatever it is given.
  //   pixels   a loop of one or two pixels is noise at ANY resolution, and on a small image half a
  //            percent is less than a pixel, so the ratio alone would let it through.
  const minRatio = opts.minAreaRatio ?? 0.005;
  const minPx    = opts.minAreaPx    ?? 4;
  const biggest = all[0].area;
  const floor = Math.max(biggest * minRatio, minPx);
  const loops = all.filter(l => l.area >= floor);

  // Scale from the TRACED bounds, not the bitmap's: a PNG is usually mostly transparent padding, and
  // scaling by canvas width would print every shape smaller than asked by whatever that margin was.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of loops) {
    if (l.hole) continue;                      // padding is measured by the shape, not by its eyes
    for (const [x, y] of l.points) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const spanX = maxX - minX || 1;
  const mmPerPx = widthMm / spanX;
  const tolPx = (opts.toleranceMm ?? 0.2) / mmPerPx;

  const toMm = (loop) =>
    simplify(loop.points, tolPx).map(([x, y]) => [(x - minX) * mmPerPx, (y - minY) * mmPerPx]);

  return {
    widthMm,
    heightMm: (maxY - minY) * mmPerPx,
    cut:  loops.filter(l => !l.hole).map(toMm),
    mark: opts.holes === false ? [] : loops.filter(l => l.hole).map(toMm),
  };
}

/** An SVG path `d` for one loop. Closed with Z so a renderer can fill or stroke it either way. */
export function toPathData(points) {
  if (!points.length) return '';
  const n = (v) => (Math.round(v * 100) / 100);
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join(' ') + ' Z';
}
