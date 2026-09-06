// ── A chocolate brushstroke ──────────────────────────────────────────────────────────────────────
//
// The third way a chocolate garnish is made, and the one the brushstroke cakes are built from:
// coloured white chocolate spooned onto acetate, pressed with a spatula and pulled in ONE motion,
// left to set, then peeled off and stood on the cake.
//
// ⚠️ IT IS NEITHER OF THE OTHER TWO. A piped piece is a PATH swept into a rope — a line with an even
// thickness a nozzle decides. A cut piece is a REGION extruded into a slab — an outline with an
// inside. A brushstroke is a SMEAR: its width comes from the pressure of the knife, so the shape is
// the gesture rather than a setting, and it is widest where the hand pressed and frayed where it was
// lifted. Building it as a fat piped line gives a sausage; building it as a cut shape gives a leaf.
//
// ⚠️ ASYMMETRY IS THE WHOLE TELL. A stroke that tapers equally at both ends reads as a leaf or a
// petal. A real one is BLUNT where the spatula lands, broad through the middle, and pulls out to a
// ragged point — because the chocolate runs out, not because the baker aimed for a tip.
//
// ⚠️ AND THE RIDGES ARE NOT DECORATION. The striations left by the edge of the knife are most of what
// says "chocolate smear" rather than "coloured shape"; without them the piece reads as plastic.

const lerp = (a, b, t) => a + (b - a) * t;

/* The torn end. Walks from the left edge to the right one, pushing each point along the direction of
 * travel by a random amount — so the piece finishes in fingers of different lengths rather than on a
 * ruled line. Deeper in the middle, where the layer is thickest and lets go last. */
function tipJag(pts, l, r, width, rnd) {
  const n = 7;
  const a = pts[Math.max(0, pts.length - 3)], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;                 // the way the hand was going
  const reach = width * 0.42;                         // how far the longest finger runs on
  const out = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const mid = 1 - Math.abs(t - 0.5) * 1.6;          // longest near the middle
    const grab = Math.max(0, mid) * lerp(0.25, 1, rnd()) * reach;
    out.push([lerp(l[0], r[0], t) + ux * grab, lerp(l[1], r[1], t) + uy * grab]);
  }
  return out;
}

/* Deterministic wobble. A brushstroke's edge tears rather than curving cleanly, but the same drawing
 * must come back the same on every render and after a save — `Math.random()` here would make a piece
 * that changed shape each time the cake was opened. */
function noise(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/**
 * path   the gesture, [[x, y], …]
 * width  how broad the stroke is at its widest, in the same units
 *
 * Returns `{ outline, ridges }` — a closed polygon and the polylines running along it.
 */
export function brushStroke(path, { width = 60, seed = 1, frayed = true, blade = false, round = false } = {}) {
  let pts = (path ?? []).filter(p => Array.isArray(p) && p.length === 2);
  if (pts.length < 2) return null;

  /* ⚠️ A RING IS NOT A PULL, AND THE PROFILE IS THE DIFFERENCE. A brushstroke tapers to nothing where
   * the spatula is lifted — right for a pull, and fatal for a loop: the thin tail can never meet the
   * blunt start, so a ring drawn in one gesture always came out with a gap in it, no matter how
   * carefully it was closed. A spatula taken round a ring never lifts, so it lays an EVEN band.
   * Closure is detected from the gesture rather than asked for: bringing the ends together IS the
   * request. */
  const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0],
                            pts[0][1] - pts[pts.length - 1][1]) <= width * 0.9;
  if (closed) {
    // Snap the ends together, so the band joins cleanly rather than nearly.
    pts = [...pts.slice(0, -1), [...pts[0]]];
  }

  // Arc length, so the profile follows the DISTANCE travelled rather than however many points the
  // hand happened to leave — a slow start would otherwise look like a long one.
  const seg = [0];
  for (let i = 1; i < pts.length; i++) {
    seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = seg[seg.length - 1];
  if (!(total > 0)) return null;

  const rnd = noise(seed);
  /* ⚠️ ONE EDGE IS CLEAN, THE OTHER TEARS, and fraying both equally is why our pieces read as
   * symmetrical leaves. A spatula has a flat side that sweeps a smooth curve and a trailing side
   * where the chocolate rips away from the blade — the reference pieces show a long clean sweep on
   * one side and a ragged, notched edge on the other. Jittering both alike loses the single feature
   * that says a knife made this. */
  const jitter = frayed ? Array.from({ length: pts.length }, () => rnd()) : null;
  const tear = frayed ? Array.from({ length: pts.length }, () => rnd()) : null;

  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const t = seg[i] / total;
    /* ⚠️ ROUNDED, NOT TORN. Lifted almost straight up rather than dragged off, a piece keeps its
       width and ends in a curve — the soft blunt one at the front of the reference cake. */
    let w = closed ? width / 2
      : round ? (width / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 2)))
      : blade ? bladeProfile(t, width) : halfWidth(t, width);

    /* Perpendicular to the direction of travel. On a ring the neighbours WRAP, or the first and last
       cross-sections face different ways and the join shows as a kink. */
    const a = closed ? pts[(i - 1 + pts.length - 1) % (pts.length - 1)] : pts[Math.max(0, i - 1)];
    const b = closed ? pts[(i + 1) % (pts.length - 1)] : pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;

    /* ⚠️ A TIGHT TURN FOLDS THE INSIDE EDGE THROUGH ITSELF, and that is why a looping stroke
       VANISHED. Offsetting a curve by more than its radius of curvature sends the inner edge past
       the centre and out the other side: the outline becomes a bowtie, and a bowtie filled by the
       non-zero rule cancels its own area — so the piece is not mis-shaped, it is simply gone. The
       width is pulled in to what the turn can carry, which is also what really happens: a spatula
       dragged round a tight curve lays a narrower band on the inside. */
    w = Math.min(w, turnRadius(pts, i) * 0.9);

    // The blade side: a clean sweep, barely varying.
    const wl = w * (jitter ? lerp(0.985, 1, jitter[i]) : 1);
    // The trailing side: torn, and it tears in notches rather than smoothly.
    /* ⚠️ IRREGULAR, NOT A SAWTOOTH. Quantised to even steps the torn edge came out as a row of
       identical notches — a decorative zigzag, which reads as machined rather than broken. Chocolate
       tears in runs of different length and depth, so two scales are combined: a slow one that says
       where the edge is generally full or thin, and a fast one that bites into it. */
    const slow = tear ? tear[Math.floor(i / 7) % tear.length] : 0.5;
    const fast = tear ? tear[i] : 0.5;
    const bite = fast > 0.62 ? lerp(0.62, 0.92, fast) : lerp(0.94, 1.03, fast);
    const wr = w * (tear ? bite * lerp(0.9, 1.03, slow) : 1);
    left.push([pts[i][0] + nx * wl, pts[i][1] + ny * wl]);
    right.push([pts[i][0] - nx * wr, pts[i][1] - ny * wr]);
  }

  /* ⚠️ THE END OF A PULL IS RAGGED, NOT A STRAIGHT CUT. Left and right are joined by a single
   * cross-section, so every piece finished with one flat horizontal edge — the same guillotine cut
   * on all of them, which is the opposite of what chocolate does. It does not stop; it THINS until
   * the layer breaks, and it breaks unevenly across the width, leaving fingers.
   *
   * So the tip is a jagged run between the two edges: points that reach past the last cross-section
   * by varying amounts, deepest near the middle where the chocolate holds on longest. It is the same
   * seeded noise as the torn edge, so the same drawing comes back the same. */
  const tip = closed ? [] : tipJag(pts, left[left.length - 1], right[right.length - 1], width, rnd);

  const outline = [...left, ...tip, ...right.slice().reverse()];
  outline.push([...outline[0]]);

  /* ⚠️ THE BAND, NOT JUST THE OUTLINE, AND THIS IS WHAT MAKES A DOUBLING-BACK STROKE FILL.
   * Left-plus-reversed-right is one polygon, and where a stroke turns back on itself that polygon
   * CROSSES: it splits into two lobes with opposite winding, and under the non-zero rule the second
   * cancels the first — so half the piece filled and half came out as an empty outline. Clamping the
   * width to the turn stopped the whole shape vanishing but not this, because the crossing is real
   * geometry, not an artefact of width.
   *
   * A swept band has no global winding to cancel: each cross-section quad is filled on its own and
   * overlaps simply overdraw. It is also closer to the truth — a spatula lays chocolate down section
   * by section; it does not trace an outline and pour. */
  const band = left.map((l, i) => [l, right[i]]);
  if (closed) band.push(band[0]);          // the last section joins back to the first

  // `width` travels with the piece: the ridges are drawn relative to it, not to a nozzle setting.
  return { outline, band, tip, closed, width, ridges: ridgesAlong(pts, seg, total, width, rnd, closed) };
}

/* The radius of the circle through this point and its neighbours — how tight the turn is here.
 * Infinite on a straight run, which the caller clamps against harmlessly. */
function turnRadius(pts, i) {
  const a = pts[Math.max(0, i - 2)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 2)];
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  // Twice the triangle's area, by the cross product — zero when the three are in a line.
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  if (cross < 1e-6) return Infinity;
  return (ab * bc * ca) / (2 * cross);
}

/* The width profile, as a fraction of the widest point.
 *
 * ⚠️ THE SHAPE OF THIS FUNCTION IS THE SHAPE OF THE STROKE. Blunt at the start — the spatula lands
 * with its full edge, so it begins near full width rather than at nothing — broadest just past the
 * start where the pressure is greatest, then falling away and running out to a point. Read it as a
 * pressure curve, because that is what it is. */
function halfWidth(t, width) {
  const w = width / 2;
  /* ⚠️ NO SHOULDER. Holding full width and then tapering puts a corner where the two meet, and the
   * stroke comes out as a bottle: straight sides, a neck, a blunt top. A spatula never does that —
   * the chocolate starts being used up from the moment it lands, so the width falls STEADILY from
   * the landing to the tear. One smooth curve, no flat section to step off. */
  if (t < 0.1) return w * lerp(0.86, 1, t / 0.1);         // the landing, already broad
  const TIP = 0.42;                                       // where the chocolate gives out
  const u = (t - 0.1) / 0.9;
  return w * lerp(1, TIP, Math.pow(u, 1.5));              // slow at first, then away
}

export function bladeProfile(t, width) {
  const w = width / 2;
  if (t < 0.08) return w * lerp(0.82, 1, t / 0.08);
  if (t < 0.72) return w * lerp(1, 0.93, (t - 0.08) / 0.64);
  return w * lerp(0.93, 0.66, (t - 0.72) / 0.28);        // narrows a little, then stops flat
}

/* The knife's own edge, dragged along. Three or four inner lines that stop short of the end, because
 * by then there is too little chocolate left to hold a ridge. */
function ridgesAlong(pts, seg, total, width, rnd, closed = false) {
  const out = [];
  /* ⚠️ HOW MANY RIDGES DEPENDS ON HOW WIDE THE BLADE IS. Four lanes look right on a narrow pull and
   * almost disappear on a petal — the same four lines spread across four times the width, so a big
   * piece came out as flat colour. A wider knife has more teeth in contact, so the count follows the
   * width and the spacing between them stays roughly constant, which is what the eye reads as
   * texture rather than as stripes. */
  const count = Math.max(3, Math.min(11, Math.round(width / 16)));
  const lanes = Array.from({ length: count }, (_, i) => -0.72 + (1.44 * i) / (count - 1));
  for (const lane of lanes) {
    // On a ring the knife never lifts, so its striations run the whole way round.
    const stop = closed ? 1.01 : 0.55 + rnd() * 0.3;
    const line = [];
    for (let i = 0; i < pts.length; i++) {
      const t = seg[i] / total;
      if (t > stop) break;
      const w = Math.min(closed ? width / 2 : halfWidth(t, width), turnRadius(pts, i) * 0.9);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      line.push([pts[i][0] + (-dy / len) * w * lane, pts[i][1] + (dx / len) * w * lane]);
    }
    if (line.length > 1) out.push(line);
  }
  return out;
}
