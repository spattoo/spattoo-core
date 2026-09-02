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
export function brushStroke(path, { width = 60, seed = 1, frayed = true } = {}) {
  const pts = (path ?? []).filter(p => Array.isArray(p) && p.length === 2);
  if (pts.length < 2) return null;

  // Arc length, so the profile follows the DISTANCE travelled rather than however many points the
  // hand happened to leave — a slow start would otherwise look like a long one.
  const seg = [0];
  for (let i = 1; i < pts.length; i++) {
    seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = seg[seg.length - 1];
  if (!(total > 0)) return null;

  const rnd = noise(seed);
  const jitter = frayed ? Array.from({ length: pts.length }, () => rnd()) : null;

  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const t = seg[i] / total;
    let w = halfWidth(t, width) * (jitter ? lerp(0.86, 1, jitter[i]) : 1);

    // Perpendicular to the direction of travel here.
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
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

    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }

  const outline = [...left, ...right.slice().reverse()];
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

  return { outline, band, ridges: ridgesAlong(pts, seg, total, width, rnd) };
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
  if (t < 0.06) return w * lerp(0.72, 1, t / 0.06);      // the landing: blunt, already wide
  if (t < 0.35) return w;                                 // full pressure
  return w * Math.max(0.02, Math.pow(1 - (t - 0.35) / 0.65, 1.35));   // pulling out, running dry
}

/* The knife's own edge, dragged along. Three or four inner lines that stop short of the end, because
 * by then there is too little chocolate left to hold a ridge. */
function ridgesAlong(pts, seg, total, width, rnd) {
  const out = [];
  const lanes = [-0.55, -0.2, 0.2, 0.55];
  for (const lane of lanes) {
    const stop = 0.55 + rnd() * 0.3;      // each ridge runs out at its own point
    const line = [];
    for (let i = 0; i < pts.length; i++) {
      const t = seg[i] / total;
      if (t > stop) break;
      const w = Math.min(halfWidth(t, width), turnRadius(pts, i) * 0.9);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      line.push([pts[i][0] + (-dy / len) * w * lane, pts[i][1] + (dx / len) * w * lane]);
    }
    if (line.length > 1) out.push(line);
  }
  return out;
}
