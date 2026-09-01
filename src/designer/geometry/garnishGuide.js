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
      /* ⚠️ BOTH FORMS, BECAUSE THIS IS DRAWN IN TWO MEDIA. The screen is SVG and wants path data; the
         printed sheet is a canvas and wants points. Deriving one from the other at the far end means
         parsing path strings back into numbers, which is how the two renderings start to disagree. */
      d: svgPath(p),
      points: p,
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
        points: pn.outline,                       // for the canvas — see the note on strokes above
        holePoints: pn.holes,
        holeCount: pn.holes.length,
        /* ⚠️ CUTTING IS A MOTION TOO. This was given no start mark and no direction on the reasoning
           that "spread, set, cut" is not a movement the way piping is — which is wrong about the
           only part that matters at the bench. The knife begins somewhere, travels round the
           outline, and the holes are punched after. That is a traversal, and it is what a baker
           needs told: where to enter the shape, and which line is cut before which. */
        start: pn.outline[0],
        heading: heading(pn.outline),
        holeStarts: pn.holes.map(h => h[0]),
      }))
    : [];

  /* ⚠️ THE ANIMATION HAS TO NARRATE, or it is decoration. A line growing on its own tells a baker
   * that something is being drawn and nothing about what to DO — the words are what make it a guide.
   * So every step of the motion carries its own sentence, shown as that step plays, and each one
   * names the action and the thing that goes wrong if you get it wrong. The full list below stays as
   * the reference to read once; this is what you glance at with your hands full. */
  /* ⚠️ EACH BEAT SAYS SOMETHING DIFFERENT, or it is a counter rather than a narration. Repeating
   * "start at the dot, finish at the arrow" for every stroke teaches nothing after the first: the
   * first beat carries the setup, the last carries the finish, and the ones between say only what
   * changes — which is what somebody following along actually needs. */
  const beats = kind === 'cut'
    ? panels.flatMap((pn, i) => [
        {
          caption: i === 0
            ? 'Spread the tempered chocolate 2 mm thin and let it firm up. Then cut the outline from '
              + 'the dot, one way round, pressing straight down.'
            : `Cut piece ${i + 1} the same way, from its dot.`,
        },
        ...pn.holes.map((_, k) => ({
          caption: k === 0
            ? 'Now punch the hole with a warmed cutter — straight down in one go, not twisted.'
            : `And the next hole, ${k + 2} of ${pn.holeCount}.`,
        })),
      ])
    : strokes.map((st, i) => {
        const shape = st.closed ? 'close it back on the dot' : 'stop the pressure before the arrow';
        if (i === 0) {
          return { caption: `Fill a paper cone with tempered chocolate. Pipe stroke 1 from the dot — `
                          + `keep the tip just clear of the parchment and ${shape}.` };
        }
        if (i === strokes.length - 1) {
          return { caption: `Lift, and pipe the last stroke from its dot — ${shape}. `
                          + 'Then leave it to set at room temperature.' };
        }
        return { caption: `Lift the cone clear, then pipe stroke ${st.n} from its dot and ${shape}.` };
      });

  return {
    kind,
    strokes,
    panels,
    beats,
    lifts: kind === 'piped' ? liftCount(paths) : 0,
    /* The order of work, in both kinds — what the diagram animates. For a piped piece that is the
       strokes; for a cut one it is the outline first, then each hole. */
    order: kind === 'piped'
      ? strokes.length
      : panels.reduce((n, pn) => n + 1 + pn.holeCount, 0),
    box,
    size: { w: box.x1 - box.x0, h: box.y1 - box.y0 },
    widthMm:  mmPerPlate ? round((box.x1 - box.x0) * mmPerPlate) : null,
    heightMm: mmPerPlate ? round((box.y1 - box.y0) * mmPerPlate) : null,
    ropeMm:   mmPerPlate ? round((g.rope ?? 6) * mmPerPlate) : null,
    steps: steps({ kind, strokes, panels, g }),
  };
}

/* The words beside the diagram.
 *
 * ⚠️ TECHNIQUE, NOT MEASUREMENT. The diagram already carries the shape, the size and the order; what
 * it cannot show is the part that actually decides whether the piece works — temper, consistency,
 * when to move and when to wait. A guide that spends its words restating dimensions is telling a
 * baker what they can already see and leaving out what they came for.
 *
 * ⚠️ AND TEMPER IS THE WHOLE CRAFT. Untempered chocolate sets dull, streaks white within a day and
 * snaps softly instead of cleanly — the single difference between a garnish that looks bought and
 * one that looks homemade, and it is decided before a line is piped. The temperatures differ by
 * chocolate, so they are stated rather than left as "temper it". */
function steps({ kind, strokes, panels, g }) {
  const colours = [...new Set(strokes.map(s => s.color))];
  const twoTone = colours.length > 1;

  if (kind === 'cut') {
    const holes = panels.reduce((n, p) => n + p.holeCount, 0);
    return [
      TEMPER,
      'Pour onto acetate and spread with a palette knife to about 2 mm — thin enough to cut, thick '
      + 'enough not to shatter when you lift it.',
      twoTone
        ? 'Two chocolates: set the first, then spread the second beside it. Do not let them run '
          + 'together while either is wet.'
        : null,
      'Wait until it has lost its wet shine and is firm but still yields to a fingernail. Cut it '
      + 'fully set and it snaps; cut it too soon and the edge drags.',
      `Cut the outline${panels.length > 1 ? `s — ${panels.length} pieces` : ''} with a warmed knife, `
      + 'wiped between cuts. Press straight down rather than dragging.',
      holes ? `Punch ${holes} hole${holes > 1 ? 's' : ''} with a warmed round cutter.` : null,
      'Chill briefly, then slide a palette knife under the whole sheet at once — lifting a corner '
      + 'first is how a thin panel cracks.',
    ].filter(Boolean);
  }

  return [
    TEMPER,
    'Fill a paper cone and snip the tip small. A cone gives finer control than a bag, and you can '
    + 'open the tip further but never close it again.',
    'Work on parchment or acetate, never on the cake — the piece is made flat, set, then placed.',
    twoTone
      ? 'Two chocolates: pipe all of one colour and let it set before starting the other, or they '
        + 'bleed at the joins.'
      : null,
    'Pipe in the order numbered: start at each dot, follow the line, finish at the arrow.',
    'Keep the tip just clear of the surface and let the chocolate fall into place — dragging the tip '
    + 'along the parchment gives a flat, ragged line.',
    strokes.length > 1
      ? `Lift between strokes: ${strokes.length} strokes means ${strokes.length} separate lines, not `
        + 'one continuous run. Stop the pressure before you lift or the end tails.'
      : null,
    'Leave it to set at room temperature, not in the fridge — cold sets it dull and sweats it when '
    + 'it comes out. Lift it only when it releases cleanly.',
  ].filter(Boolean);
}

/* ⚠️ THE NUMBERS ARE THE CRAFT, so they are stated. "Temper it" is advice a baker who needs this
 * guide cannot act on, and the three chocolates behave differently enough that one range would be
 * wrong for two of them. */
const TEMPER = 'Temper the chocolate: melt to 45°C, cool to 27°C, work at 31°C for dark — 30°C for '
  + 'milk, 29°C for white. Untempered chocolate sets dull, streaks within a day and snaps softly.';

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
