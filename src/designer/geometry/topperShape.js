import * as THREE from 'three';

/* ── An acrylic cake topper, as one cut-out ──────────────────────────────────────────────────────
 *
 * A word, a bar under it if it needs one, and the prongs that push into the cake — all as
 * THREE.Shape[] in the font's XY plane, ready to extrude thin and stand upright.
 *
 * ── WHY THIS IS NOT glyphShape.js ───────────────────────────────────────────────────────────────
 * That module makes a CAKE shaped like letters: one hardcoded block font (helvetikerBold), extruded
 * a hundred millimetres, and it does not care whether the letters touch — a "1" and a "0" are two
 * separate cakes on one board, which is correct there.
 *
 * A topper is the opposite on both counts. It is cut from ONE sheet of acrylic, so a letter that
 * touches nothing is a letter that arrives loose in a bag; and the fonts that work are scripts,
 * where the letters run into each other on purpose. Hence an injectable font and a connectivity
 * check, neither of which the cake path wants.
 *
 * ── THE CONNECTIVITY CHECK IS THE POINT ─────────────────────────────────────────────────────────
 * Everything else here is arithmetic. `pieceCount` is the thing that decides whether the object can
 * exist, and it is the one question a picture cannot answer: on screen a floating "i" dot looks
 * exactly like an attached one, and the difference only shows up when somebody cuts it.
 *
 * Pure geometry — no React, no material, no renderer. The studio previews it and the designer
 * renders it from the same numbers.
 */

// Outline sampling. Enough to keep a script's curves smooth where two letters meet, since that
// junction is exactly what the connectivity test reads.
const CURVE_SEG = 24;

/* Build the topper's outline.
 *
 * `font` is a parsed three.js Font — injected, never module-level, because the whole feature turns
 * on being able to use a connecting script rather than the block face the cake path is fixed to.
 *
 * `weight` thickens every stroke, and it earns its place here beyond looking bolder: on a script it
 * is often what closes a hairline gap between two letters, turning three pieces into one. It is the
 * first thing to reach for when the count comes back above 1.
 */
export function topperShapes(font, text, {
  height = 1,
  weight = 0,
  baseline = null,          // { thickness, overhang } — a bar under the word, or null for none
  legs = null,              // { count, width, length, inset } — prongs below, or null for none
} = {}) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!font || !clean) return { shapes: [], glyphs: [], width: 0, height: 0, baselineY: 0, legs: [] };

  const raw = font.generateShapes(clean, 1);          // unit em
  const glyphOutlines = raw.map(sh => ({
    outer: sh.getPoints(CURVE_SEG).map(p => ({ x: p.x, y: p.y })),
    holes: (sh.holes ?? []).map(h => h.getPoints(CURVE_SEG).map(p => ({ x: p.x, y: p.y }))),
  }));

  // Size by HEIGHT with the aspect kept, the same bargain glyphShape makes: every topper of a given
  // setting stands the same tall and simply grows wider with more letters, so a baker's "Emma" and
  // "Charlotte" are the same object at two lengths rather than two different sizes.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphOutlines) for (const p of g.outer) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const gw = (maxX - minX) || 1, gh = (maxY - minY) || 1;
  const scale = height / gh;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tx = p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale });

  const glyphs = glyphOutlines.map(g => ({
    outer: offsetRing(g.outer.map(tx), weight * scale),
    holes: g.holes.map(h => offsetRing(h.map(tx), -weight * scale)),
  }));

  const width = gw * scale;
  const halfH = height / 2;
  const parts = glyphs.map(g => ({ outer: g.outer, holes: g.holes, kind: 'glyph' }));

  /* The bar, and WHERE IT SITS IS THE WHOLE THING.
   *
   * ⚠️ At the TYPOGRAPHIC baseline, not the bottom of the bounding box. Those are the same line only
   * for a word with no descender. Put a bar at the bbox bottom of "Amy" and it lands at the tail of
   * the y, several millimetres BELOW where the A and the m end — so it joins the descender and
   * nothing else, and the topper is still three pieces while looking perfectly attached on screen.
   * The connectivity test caught exactly that, which is the argument for having it.
   *
   * The font hands the real line over for nothing: generateShapes puts y = 0 at the baseline, so it
   * is just that point carried through the same centre-and-scale as everything else.
   *
   * It then bites UP into the letters rather than meeting them edge to edge. A bar that merely
   * touches is a butt joint at the one place the whole object hangs from. */
  const typographicBaseline = (0 - cy) * scale;
  let baselineY = typographicBaseline;
  if (baseline) {
    const t = Math.max(1e-4, baseline.thickness ?? height * 0.08);
    const over = baseline.overhang ?? height * 0.06;
    const top = typographicBaseline + t * 0.35;       // bite up into the letters
    baselineY = top - t;
    parts.push({ kind: 'baseline', outer: rect(-width / 2 - over, baselineY, width + over * 2, t), holes: [] });
  }

  /* The prongs. Rectangles hanging from the lowest solid edge, and they overlap it for the same
   * reason the bar does.
   *
   * ⚠️ Placed where there IS material above them, not at tidy fractions of the width. A leg at 25%
   * of "Amelia" can easily land in the gap between two letters, and a prong joined to nothing is
   * the part that snaps off first — silently, because on screen it looks attached. */
  const legShapes = [];
  if (legs && legs.count > 0) {
    const w = legs.width ?? height * 0.06;
    const len = legs.length ?? height * 0.5;
    const anchors = legAnchors(parts, legs.count, width, legs.inset ?? 0.18);
    for (const ax of anchors) {
      const bottom = lowestSolidAt(parts, ax, w) ?? baselineY;
      legShapes.push({ kind: 'leg', outer: rect(ax - w / 2, bottom - len, w, len + w * 0.5), holes: [] });
    }
    parts.push(...legShapes);
  }

  const shapes = parts.map(p => {
    const s = new THREE.Shape(p.outer.map(q => new THREE.Vector2(q.x, q.y)));
    s.holes = (p.holes ?? []).map(h => new THREE.Path(h.map(q => new THREE.Vector2(q.x, q.y))));
    return s;
  });

  return { shapes, parts, glyphs, width, height, baselineY, legs: legShapes };
}

/* ── How many separate bits of acrylic is this? ──────────────────────────────────────────────────
 *
 * 1 is a topper. Anything more is that many objects in a bag, and the customer finds out after it
 * is cut. Two rings belong together when their outlines cross OR one sits inside the other, walked
 * as connected components.
 *
 * Cheap by construction: an axis-aligned box test rejects almost every pair before any segment
 * maths runs, because letters only ever touch their neighbours.
 */
export function pieceCount(parts) {
  return components(parts).length;
}

/* The same walk, but returning WHICH parts group together — because a count on its own does not
 * help anybody fix it.
 *
 * "2 pieces" on a finished-looking word sends an author hunting. "The dot on the i is loose" is the
 * whole answer, and it is the most common one: a tittle is its own contour and touches nothing, so
 * every i and j in a block font floats. The studio paints these red rather than printing a number.
 *
 * Returns arrays of indices into `parts`, largest group first, so [0] is the body of the topper and
 * anything after it is what would arrive loose in the bag.
 */
export function components(parts) {
  const n = parts.length;
  if (n === 0) return [];
  if (n === 1) return [[0]];
  const boxes = parts.map(p => bbox(p.outer));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!boxOverlap(boxes[i], boxes[j])) continue;
      if (ringsTouch(parts[i].outer, parts[j].outer)) join(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/* ── Joining up what floats ──────────────────────────────────────────────────────────────────────
 *
 * The dot on an i is its own contour and touches nothing, so every i and j comes back loose. That
 * is not a font to avoid — it is most fonts — and rejecting them would leave the feature usable
 * only with scripts nobody has sourced yet.
 *
 * So each stray group gets a hairline stem dropped straight down from its lowest point until it
 * meets material below, and a rectangle spans the gap. Real acrylic toppers do exactly this: look
 * closely at a cut one and the tittle is joined to its stem by a sliver.
 *
 * ⚠️ It changes the letterform, slightly and visibly, and that is the honest cost. `width` is the
 * lever: thin enough to read as a join, thick enough to survive being cut and handled. Anything
 * under about a millimetre of real acrylic snaps, which is why this is a fraction of the topper's
 * height rather than a fixed number — the object gets scaled on the way to the cake.
 *
 * Nothing is bridged when the parts are already one piece, and a group with nothing beneath it is
 * left alone rather than given a stem to nowhere — the count still reports it, and the author still
 * sees it in red.
 */
export function bridgeLoose(parts, { width = 0.02 } = {}) {
  const groups = components(parts);
  if (groups.length <= 1) return [];

  const main = new Set(groups[0]);
  const bridges = [];
  for (const g of groups.slice(1)) {
    // The lowest point of the stray group, and the x it sits at.
    let low = Infinity, lowX = 0;
    for (const i of g) for (const q of parts[i].outer) if (q.y < low) { low = q.y; lowX = q.x; }
    // What is directly beneath it, ignoring its own group — the top of the nearest material below.
    const below = highestBelow(parts, lowX, low, g);
    if (below == null) continue;                      // nothing under it; leave it flagged, not faked
    bridges.push({
      kind: 'bridge',
      outer: rect(lowX - width / 2, below - width * 0.25, width, (low - below) + width * 0.5),
      holes: [],
    });
  }
  return bridges;
}

// The highest y at or below `fromY` in this column, excluding the group doing the asking.
function highestBelow(parts, x, fromY, exclude) {
  const skip = new Set(exclude);
  let best = null;
  for (let i = 0; i < parts.length; i++) {
    if (skip.has(i)) continue;
    const p = parts[i];
    const b = bbox(p.outer);
    if (x < b.x0 || x > b.x1) continue;
    for (let k = 0; k < p.outer.length; k++) {
      const a = p.outer[k], c = p.outer[(k + 1) % p.outer.length];
      if ((a.x <= x && c.x >= x) || (c.x <= x && a.x >= x)) {
        const t = (x - a.x) / ((c.x - a.x) || 1e-12);
        const y = a.y + (c.y - a.y) * t;
        if (y <= fromY && (best == null || y > best)) best = y;
      }
    }
  }
  return best;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function bbox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ring) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
// A hair of slack, so two outlines that meet exactly on a shared tangent — which is what a joined
// script does — count as touching rather than falling to floating-point luck.
const EPS = 1e-6;
const boxOverlap = (a, b) => a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.y0 <= b.y1 + EPS && b.y0 <= a.y1 + EPS;

function segCross(p, p2, q, q2) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(q, q2, p), d2 = d(q, q2, p2), d3 = d(p, p2, q), d4 = d(p, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function pointInRing(ring, pt) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

function ringsTouch(a, b) {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segCross(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  // No crossing still leaves containment — an 'i' dot fully inside a swash, or a leg swallowed by a
  // thick bar. One point each way settles it.
  return pointInRing(a, b[0]) || pointInRing(b, a[0]);
}

/* Fatten (or thin, for a hole) a closed ring by pushing each point along the average of its two
 * edge normals. Not a true offset — it will not survive a large weight on a tight curve — and
 * deliberately so: this exists to close hairline gaps between letters, which is a small nudge. The
 * connectivity count is what says whether the nudge was enough, so an approximation that is
 * MEASURED beats an exact one that is trusted. */
function offsetRing(ring, d) {
  if (!d) return ring;
  const n = ring.length;
  return ring.map((p, i) => {
    const prev = ring[(i - 1 + n) % n], next = ring[(i + 1) % n];
    const n1 = norm(p.x - prev.x, p.y - prev.y), n2 = norm(next.x - p.x, next.y - p.y);
    const nx = (n1.y + n2.y) / 2, ny = -(n1.x + n2.x) / 2;
    const len = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / len) * d, y: p.y + (ny / len) * d };
  });
}
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

/* Where the prongs go: spread across the word, but nudged to the nearest x that actually has
 * material at the bottom. A real topper's legs are under the letters, not under the gaps. */
function legAnchors(parts, count, width, inset) {
  const span = width * (1 - inset * 2);
  const x0 = -span / 2;
  const wanted = count === 1 ? [0] : Array.from({ length: count }, (_, i) => x0 + (span * i) / (count - 1));
  return wanted.map(x => nearestSolidX(parts, x, width));
}
function nearestSolidX(parts, x, width) {
  const step = width / 120;
  for (let k = 0; k < 60; k++) {
    for (const dx of (k === 0 ? [0] : [-k * step, k * step])) {
      if (lowestSolidAt(parts, x + dx, step) != null) return x + dx;
    }
  }
  return x;
}
// The lowest y at which this column has material, by testing the ring segments the column crosses.
function lowestSolidAt(parts, x, w) {
  let lowest = null;
  for (const p of parts) {
    const b = bbox(p.outer);
    if (x + w / 2 < b.x0 || x - w / 2 > b.x1) continue;
    for (let i = 0; i < p.outer.length; i++) {
      const a = p.outer[i], c = p.outer[(i + 1) % p.outer.length];
      if ((a.x <= x && c.x >= x) || (c.x <= x && a.x >= x)) {
        const t = (x - a.x) / ((c.x - a.x) || 1e-12);
        const y = a.y + (c.y - a.y) * t;
        if (lowest == null || y < lowest) lowest = y;
      }
    }
  }
  return lowest;
}
