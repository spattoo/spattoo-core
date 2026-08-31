import { liftCount } from './pipingFill.js';
import { panelsFrom } from './garnishPanel.js';

// ── How to make this garnish: the paths ARE the instructions ─────────────────────────────────────
//
// A baker receives a design and has to build the piece. Everything needed is already in the data:
// the strokes are in the order they were piped, so stroke order IS piping order, and the number of
// separate paths is the number of times the nozzle comes off the parchment.
//
// ⚠️ THIS IS WHY THE PATHS ARE STORED RATHER THAN A PICTURE. An image of a finished garnish can show
// what it looks like and can never say where to start, which way to go, or how many times to lift.
// Every other decoration guide in the X-ray is written by a model from a description; this one is
// DERIVED, so it cannot be wrong about the piece it describes and costs nothing to produce.
//
// ⚠️ TWO KINDS, TWO DIFFERENT INSTRUCTIONS, and the piece decides which — never a setting. A piped
// piece is a motion: pipe this line, lift, pipe the next. A cut piece is not a motion at all —
// spread, set, cut — and animating it would teach a baker to make it the wrong way.
//
// ⚠️ IT MUST WORK ON PAPER. A baker prints the X-ray or glances at it with their hands full; they are
// not scrubbing a video with chocolate on their fingers. So the deliverable is the static numbered
// diagram, and any animation is an enhancement on top of it that must never be the only way to read
// the order — which the numbers guarantee.

/* A garnish is drawn on the studio's plate and placed at a fraction of the cake's radius, so its
 * true size follows from the cake it goes on. Mirrors `Garnishes.jsx`, which is the renderer's own
 * rule — if the two disagree, the printed template is the wrong size and the piece will not fit. */
export const WORLD_PER_PLATE = (cakeRadiusWorld, scale, plate) =>
  (cakeRadiusWorld * 0.75 * (scale ?? 1)) / (plate ?? 420);

const svgPath = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ');
const round = n => Math.round(n * 10) / 10;

/**
 * g   a placed garnish: `{ kind, paths, rings, parts, color, rope, plate, scale }`
 *
 * opts.cakeDiameterMm  the real cake's diameter, so the piece can be given a TRUE SIZE. Without it
 *                      the geometry still comes back — in plate units — and `widthMm` is null, which
 *                      is honest: a template printed at a guessed size is worse than none.
 *
 * Returns `{ kind, strokes, panels, lifts, size, widthMm, heightMm, steps }`.
 */
export function garnishGuide(g, { cakeDiameterMm = null } = {}) {
  const kind = g?.kind === 'cut' ? 'cut' : 'piped';
  const paths = (g?.paths ?? []).filter(p => Array.isArray(p) && p.length >= 2);
  const rings = (g?.rings ?? []).filter(r => Array.isArray(r) && r.length >= 4);
  if (!paths.length && !rings.length) return null;

  const box = bounds(paths.length ? paths : rings);

  /* ⚠️ THE PIECE'S SIZE IS NOT THE PLATE'S. A baker piping from this template needs the piece at the
   * size it will be on the cake, and the plate is just the sheet it happened to be drawn on. The
   * chain is plate → world → mm, and the world step is the renderer's own, so a template and the
   * rendered piece cannot drift apart. */
  const mmPerPlate = cakeDiameterMm
    ? (WORLD_PER_PLATE(1.2, g.scale, g.plate) * (cakeDiameterMm / 2.4))
    : null;

  /* ⚠️ MATCHED BY VALUE, NOT BY REFERENCE. Written as `some(p => p === paths[i])` this worked in the
   * studio, where both lists hold the same array objects, and failed for every piece that had been
   * SAVED — JSON gives back equal arrays that are not the same objects, so no part ever matched and
   * a two-tone piece printed as one colour. The guide is read almost exclusively from saved designs,
   * so the only case it was right about is the one case it will never see. */
  const key = p => JSON.stringify(p);
  const partColour = new Map();
  for (const pt of g.parts ?? []) {
    for (const p of pt.paths ?? []) partColour.set(key(p), pt.color);
  }
  const colourOf = i => partColour.get(key(paths[i])) ?? g.color ?? '#4A2C1B';

  /* Stroke order IS piping order — the studio appends as the hand moves, and nothing reorders them.
   * The start dot and the end arrow come straight off the ends of the path for the same reason. */
  const strokes = paths.map((p, i) => {
    const closed = near(p[0], p[p.length - 1], (g.rope ?? 6) * 1.5);
    /* ⚠️ ON A CLOSED STROKE THE ARROW WOULD LAND ON THE START DOT — a triangle piped in one gesture
       ends where it began, so the two marks that say "begin here" and "finish here" stack on top of
       each other and say nothing. Backed off along the path instead, which also reads correctly:
       the arrow points onward, round to the dot. */
    const arrow = closed ? along(p, 0.9) : { at: p[p.length - 1], heading: heading(p) };
    return {
      n: i + 1,
      d: svgPath(p),
      start: p[0],
      end: arrow.at,
      // The direction of travel there, for an arrowhead that points the way the hand was going.
      heading: arrow.heading,
      closed,
      color: colourOf(i),
    };
  });

  const panels = kind === 'cut'
    ? panelsFrom(rings).map((pn, i) => ({
        n: i + 1,
        outline: svgPath(pn.outline),
        holes: pn.holes.map(svgPath),
        holeCount: pn.holes.length,
      }))
    : [];

  return {
    kind,
    strokes,
    panels,
    lifts: kind === 'piped' ? liftCount(paths) : 0,
    box,
    size: { w: box.x1 - box.x0, h: box.y1 - box.y0 },
    widthMm:  mmPerPlate ? round((box.x1 - box.x0) * mmPerPlate) : null,
    heightMm: mmPerPlate ? round((box.y1 - box.y0) * mmPerPlate) : null,
    ropeMm:   mmPerPlate ? round((g.rope ?? 6) * mmPerPlate) : null,
    steps: steps({ kind, strokes, panels, g }),
  };
}

/* The words beside the diagram. Deliberately few: the diagram carries the shape and the order, and a
 * paragraph restating it in prose is what a baker skips. What words are good for is the part the
 * picture cannot show — temper, thickness, setting time, and how to get the piece off the sheet. */
function steps({ kind, strokes, panels, g }) {
  const colours = [...new Set(strokes.map(s => s.color))];
  const twoTone = colours.length > 1;

  if (kind === 'cut') {
    const holes = panels.reduce((n, p) => n + p.holeCount, 0);
    return [
      'Temper the chocolate and spread it thin on acetate or parchment — about 2 mm.',
      twoTone
        ? 'Two chocolates: spread and set the first, then the second beside it where the template shows.'
        : null,
      'Leave it until it is set but not brittle. It should still cut cleanly rather than snap.',
      `Cut the outline${panels.length > 1 ? `s — ${panels.length} pieces` : ''} against the template.`,
      holes ? `Punch ${holes} hole${holes > 1 ? 's' : ''} where marked.` : null,
      'Chill until firm, then lift it off the sheet with a palette knife.',
    ].filter(Boolean);
  }

  return [
    'Temper the chocolate and fill a paper cone or a fine piping bag.',
    'Work on parchment or acetate, not on the cake — the piece is made flat and placed once it sets.',
    twoTone
      ? `Two chocolates: pipe all of one colour, then the other. The numbers are the order within each.`
      : null,
    `Pipe the strokes in the order numbered: start at each dot, follow the line, finish at the arrow.`,
    strokes.length > 1
      ? `Lift the nozzle between strokes — ${strokes.length} strokes means ${strokes.length} separate lines, not one continuous run.`
      : null,
    'Leave it to set completely before lifting it, then place it on the cake.',
  ].filter(Boolean);
}

function bounds(paths) {
  const pts = paths.flat();
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/* A point a fraction of the way along a polyline, with the direction of travel there. Measured by
 * arc length rather than by point index: hand-drawn paths bunch points where the hand slowed, so the
 * halfway INDEX can be nowhere near the halfway POINT. */
function along(pts, frac) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d); total += d;
  }
  let want = total * frac, i = 0;
  while (i < segs.length && want > segs[i]) { want -= segs[i]; i += 1; }
  const a = pts[Math.min(i, pts.length - 2)], b = pts[Math.min(i + 1, pts.length - 1)];
  const t = segs[i] ? want / segs[i] : 0;
  return {
    at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/* The direction of travel at the END of a stroke, taken over the last stretch rather than the last
 * two points: hand-drawn paths are noisy at the tip, and a single final segment can point almost
 * anywhere — an arrowhead that contradicts the line it sits on is worse than no arrowhead. */
function heading(p) {
  const back = p[Math.max(0, p.length - 6)];
  const tip = p[p.length - 1];
  return Math.atan2(tip[1] - back[1], tip[0] - back[0]);
}
