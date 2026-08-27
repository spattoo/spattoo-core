// ── Sliding a placed stroke across the cake ──────────────────────────────────────────────────────
//
// A committed stroke is a fixed list of seated points, and until now the only edits were Undo and
// Clear all. So a border that lands a few millimetres too low costs you the whole line — you undo it
// and draw it again, and the second attempt is a fresh piece of freehand rather than the one you
// liked with one thing wrong.
//
// This moves the WHOLE stroke and keeps its shape, which is the unit the customer drew and the unit
// a ring already is.
//
// ── WHY IT IS NOT A WORLD-SPACE TRANSLATION ─────────────────────────────────────────────────────
// On the cake top it would be, and that is the easy half. On the WALL the surface is a cylinder:
// adding the same world vector to every point walks the stroke off the tangent and either buries it
// in the cake or floats it in the air, worst in the middle of the run. Anything drawn round more
// than a few degrees breaks visibly.
//
// So a wall stroke moves in the coordinates it actually lives in — round the tier and up it — which
// is the same unrolling strokeSnap.js uses to straighten one, for the same reason. Every point keeps
// the radius it was drawn at, so the stroke stays ON the wall however far it is dragged.

const EPS = 1e-9;

const round = v => +v.toFixed(4);

/**
 * Move every point of a stroke by the drag from `from` to `to`.
 *
 * @param points  [[x,y,z], …] the stroke's seated centerline
 * @param from    [x,y,z] where the drag started, on the surface
 * @param to      [x,y,z] where the pointer is now, on the surface
 * @param opts.normal  the surface the stroke was drawn against
 * @param opts.axis    the cake's centre in world XZ
 * @returns the moved points (a new array; the input is untouched)
 */
export function translateStroke(points, from, to, { normal = [0, 1, 0], axis = [0, 0] } = {}) {
  if (!Array.isArray(points) || !points.length || !from || !to) return points;

  const upright = Math.abs(normal[1] ?? 0) > 0.7;
  return upright
    ? moveOnFlat(points, from, to)
    : moveOnWall(points, from, to, axis);
}

// The top, or the board: a plane, so the drag IS the offset. Y is left alone — the surface is level,
// and taking the pointer's height would drift the stroke up or down on the little inaccuracies of a
// raycast against a curved-shaded mesh.
function moveOnFlat(points, from, to) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  return points.map(p => [round(p[0] + dx), p[1], round(p[2] + dz)]);
}

// The wall: turn round the tier and rise up it. Every point keeps its own radius, so a stroke drawn
// on a 1.2 tier stays at 1.2 no matter how far round it goes.
function moveOnWall(points, from, to, axis) {
  const angOf = p => Math.atan2(p[2] - axis[1], p[0] - axis[0]);
  let dA = angOf(to) - angOf(from);
  // Shortest way round, so dragging past the back of the cake does not spin the stroke a full turn.
  while (dA > Math.PI) dA -= Math.PI * 2;
  while (dA < -Math.PI) dA += Math.PI * 2;
  const dY = to[1] - from[1];

  return points.map(p => {
    const r = Math.hypot(p[0] - axis[0], p[2] - axis[1]);
    if (r < EPS) return [p[0], round(p[1] + dY), p[2]];
    const a = Math.atan2(p[2] - axis[1], p[0] - axis[0]) + dA;
    return [
      round(axis[0] + Math.cos(a) * r),
      round(p[1] + dY),
      round(axis[1] + Math.sin(a) * r),
    ];
  });
}

/**
 * Is this drag close enough to a stroke to be a grab of it?
 *
 * Used to pick which stroke a press landed on when several overlap — the nearest point wins, which
 * is what a finger means by "that one".
 *
 * @returns the distance from `point` to the nearest point of the stroke
 */
export function distanceToStroke(points, point) {
  if (!Array.isArray(points) || !points.length) return Infinity;
  let best = Infinity;
  for (const p of points) {
    const d = Math.hypot(p[0] - point[0], p[1] - point[1], p[2] - point[2]);
    if (d < best) best = d;
  }
  return best;
}
