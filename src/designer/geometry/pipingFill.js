import { mulberry32 } from '../utils/random.js';

// ── Filling a drawn shape with piped lines ──────────────────────────────────────────────────────
//
// The baker outlines a shape with a thin nozzle and then fills it — the chocolate filigree that is
// piped flat on parchment, set, and lifted onto a cake.
//
// ⚠️ A PIPED FILL IS A PATH, NOT A FILLED SURFACE, and everything here follows from that. A graphics
// fill asks "which pixels are inside"; a nozzle cannot answer that question, because it can only be
// somewhere and then somewhere else. So this returns POLYLINES — the actual route the tip travels —
// and the existing sweep in `creamPen.js` turns each into geometry. Nothing new renders it.
//
// ⚠️ AND THE FILL IS DELIBERATELY OPEN. None of the reference pieces are flooded solid: the discs are
// packed scribble, the star is cross-hatch, the band is a zigzag lattice, and you can see the tray
// through all of them. That is not a stylistic accident — a solid slab of chocolate is thick, heavy
// and dull, and it snaps when lifted. The lacy version is what survives being peeled off parchment.
// Do not "improve" this into a flood fill.
//
// ── Why it returns a LIST of polylines ──────────────────────────────────────────────────────────
// One polyline is one continuous squeeze. A convex shape fills in a single serpentine pass, so the
// nozzle never lifts; a shape with a waist splits into spans that cannot be reached without lifting.
// Returning the split honestly means `paths.length` IS the number of lifts the baker makes — which
// is a real instruction for the build guide, and the thing a solid-fill abstraction would hide.

const EPS = 1e-9;

// Scanline crossings of a closed polygon, at a given y. Returns sorted x values.
// Half-open edge test (y0 <= y < y1) so a vertex exactly on the line is counted once rather than
// twice — the classic source of a fill that leaks out of one corner of an otherwise closed shape.
function crossings(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (Math.abs(y1 - y0) < EPS) continue;                 // horizontal edge: contributes nothing
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    if (y < lo || y >= hi) continue;
    xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  }
  return xs.sort((a, b) => a - b);
}

// Inside spans on one scanline, as [xStart, xEnd] pairs (even-odd rule).
function spansAt(poly, y, inset) {
  const xs = crossings(poly, y);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const a = xs[i] + inset, b = xs[i + 1] - inset;
    if (b > a) out.push([a, b]);
  }
  return out;
}

const rot = (p, c, s) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

/**
 * One set of parallel passes across the shape, joined end-to-end into serpentines.
 *
 * poly     [[x, y], …] closed outline (the last point need not repeat the first)
 * spacing  gap between passes, in the same units as the polygon
 * angle    radians; the direction the passes run
 * inset    how far to stop short of the outline — the fill should touch the outline, not cross it,
 *          and a nozzle lays a rope of real width, so half a rope width is the sane value
 */
export function hatchPaths(poly, { spacing = 0.06, angle = 0, inset = 0 } = {}) {
  if (!poly || poly.length < 3 || spacing <= 0) return [];

  // Work in a frame where the passes are horizontal, then rotate the result back. Simpler and less
  // error-prone than intersecting the polygon against arbitrary-angle lines.
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const local = poly.map(p => rot(p, c, s));
  const ys = local.map(p => p[1]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);

  // Rows of spans, top to bottom.
  const rows = [];
  for (let y = yMin + spacing * 0.5; y < yMax; y += spacing) {
    const sp = spansAt(local, y, inset);
    if (sp.length) rows.push({ y, spans: sp });
  }

  /* Stitch rows into serpentines. A span continues the polyline above it when the two OVERLAP in x
   * — that is exactly the condition under which the nozzle can travel from the end of one pass to
   * the start of the next without leaving the shape. Where nothing overlaps, the polyline ends and
   * a new one starts, which is the lift. */
  const open = [];        // { pts, span, dir } still being extended
  const done = [];
  for (const { y, spans } of rows) {
    const used = new Array(open.length).fill(false);
    const next = [];
    for (const span of spans) {
      const j = open.findIndex((o, k) => !used[k] && o.span[1] >= span[0] && o.span[0] <= span[1]);
      if (j === -1) {
        next.push({ pts: [[span[0], y], [span[1], y]], span, dir: 1 });   // a new squeeze
      } else {
        used[j] = true;
        const o = open[j];
        const dir = -o.dir;                                   // alternate, so it snakes
        o.pts.push(dir > 0 ? [span[0], y] : [span[1], y]);
        o.pts.push(dir > 0 ? [span[1], y] : [span[0], y]);
        next.push({ pts: o.pts, span, dir });
      }
    }
    open.forEach((o, k) => { if (!used[k]) done.push(o.pts); });
    open.length = 0; open.push(...next);
  }
  done.push(...open.map(o => o.pts));

  const cb = Math.cos(angle), sb = Math.sin(angle);
  return done.filter(p => p.length > 1).map(p => p.map(q => rot(q, cb, sb)));
}

/* Patterns, straight off the reference pieces. Each is a recipe over `hatchPaths` rather than its
 * own algorithm — a pattern is an ANGLE and a RHYTHM, and giving each one bespoke code is how four
 * subtly different fills start behaving differently for no reason anyone can name. */
export const FILL_PATTERNS = {
  hatch:  { label: 'Hatch',       passes: [0] },
  cross:  { label: 'Cross-hatch', passes: [0, Math.PI / 2] },
  // Not 45°/135°: at exactly 90° apart the crossings line up in a grid and read as woven fabric.
  // Offsetting the second pass keeps the little diamonds irregular, which is what a hand does.
  weave:  { label: 'Woven',       passes: [Math.PI / 5, -Math.PI / 3] },
  /* ⚠️ SCRIBBLE IS NOT A JITTERED HATCH, which is what it was first built as and it looked like
   * wobbly stripes with the return travel showing as long diagonals. The reference discs are dense
   * and DIRECTIONLESS — the hand goes back and forth without caring where, and no direction reads as
   * "the" direction. That is several passes at angles with no simple relation to each other, so no
   * two of them line up into a visible grid; three is where it stops looking like anything. */
  scribble: { label: 'Scribble',  passes: [0, 0.95, 2.1], wobble: 1 },
};

/**
 * The full fill for one shape.
 *
 * pattern  a key of FILL_PATTERNS
 * seed     any integer — the wobble is deterministic, so the same shape fills the same way on every
 *          reload and in every preview. See utils/random.js: never Math.random in procedural work.
 */
export function fillShape(poly, { pattern = 'hatch', spacing = 0.06, angle = 0, inset = 0, seed = 1 } = {}) {
  const spec = FILL_PATTERNS[pattern] ?? FILL_PATTERNS.hatch;
  const out = [];
  for (const p of spec.passes) out.push(...hatchPaths(poly, { spacing, angle: angle + p, inset }));
  if (!spec.wobble) return out;

  /* Scribble is a hatch that has stopped being careful. The wobble is applied ALONG the path after
   * the fact rather than by generating a different route, so it cannot wander outside the shape by
   * more than the amplitude — which is capped at a third of the spacing, so neighbouring passes
   * cannot touch and close the lace up into a solid patch. */
  const rnd = mulberry32(seed >>> 0);
  const amp = spacing / 3;
  return out.map(path => path.map(([x, y], i) =>
    (i === 0 || i === path.length - 1)
      ? [x, y]                                            // pin the ends: they meet the outline
      : [x + (rnd() - 0.5) * 2 * amp, y + (rnd() - 0.5) * 2 * amp]));
}

/** How many times the nozzle lifts — `fillShape(...).length`, named so a build guide can say it. */
export const liftCount = paths => paths.length;
