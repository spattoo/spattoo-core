/* ── The cake as a SOLID, for anything placed by hand ────────────────────────────────────────────
 *
 * Every other placement path in this app seats a decoration against ONE surface — a top, a wall, a
 * rim — and the surface's own clamp (`topClampInset`, `snapToRim`, `boardRingClamp`) keeps it there.
 * Free hand releases all of that on purpose, and the comment in `CakeCanvas`'s drag says why: *"a
 * row that asks for free hand has given up on being seated automatically — clamping it back to the
 * perimeter would be the app overruling the person it just handed control to."* That stands.
 *
 * ⚠️ BUT "ANYWHERE" WAS INCLUDING INSIDE THE SPONGE, and that is a different question from the one
 * the surface clamps answer. Sandeep: *"there elements like fondant monkey that dont get inserted
 * into cake, so should be stopped by walls. there are elements like flowers, can be inserted."* A
 * hand-placed piece may still go anywhere a hand could put it — over the edge, out in the air,
 * beside the cake, hanging off a rim. It may not go where there is already cake, because a baker
 * cannot do that either. The freedom is kept; only the volume stops being empty.
 *
 * ⚠️ AND IT IS A CONFIG FLAG, WHICH INVARIANTS #3b SPECIFIED BEFORE THERE WAS A CALLER: *"Some
 * elements will legitimately want to penetrate (a sauce, a topper that sinks in). When that day
 * comes it is a CONFIG FLAG on the element, read by the caller before it asks for clearance — never
 * a branch on element type (#1), and never a second seating path."* This is that day. The flag is
 * `placement_config.pierces`, it is OFF by default — a solid body is the common case and a flower
 * on a wire is the exception — and nothing here knows what any element IS.
 *
 * ⚠️ THE BODY IS SLABS, NOT A SHAPE. A stacked cake is not one footprint: a piece beside the upper
 * tier is resting on the lower tier's visible ring, which is INSIDE the lower tier's outline and
 * perfectly legal. Asking "is this inside the cake" of a single silhouette would refuse it. So each
 * tier contributes its own footprint over its own vertical band, and a piece is judged against the
 * band it is actually in.
 *
 * Pure, so it can be tested without a renderer — the measurements (`reachAt`, `hy`) are injected
 * for the same reason `radiusOf` is injected into `surfaceOccupants`: the models live in the canvas.
 */

import { tierShape, shapeReach } from './surface.js';
import { BOTTOM_BASE } from '../constants.js';

/* The solid volume of a cake, as slabs: `{ shape, yBottom, yTop }` for a tier, `{ shape, yTop,
 * floor: true }` for the board.
 *
 * `tierData` is `resolveCakeScene`'s — each tier with its resolved `baseY` — so the live editor and
 * the capture cannot end up with two different ideas of where the cake is.
 *
 * ⚠️ THE BOARD IS A FLOOR, NOT AN OBSTACLE, and saying so is what makes it behave. Modelled as an
 * ordinary slab with an open underside it was still a slab, so a piece pushed below it took the
 * SHORTEST way out — sideways, squeezing out from under the drum, because near the edge that is a
 * shorter trip than climbing. Nobody puts a decoration under a cake board. A floor has exactly one
 * way out, upward, and no thickness for anyone to keep in step with the render.
 */
export function cakeBody(tierData = [], board = null) {
  const slabs = [];
  for (const t of tierData ?? []) {
    if (!t || !Number.isFinite(t.baseY) || !Number.isFinite(t.height)) continue;
    slabs.push({ shape: tierShape(t), yBottom: t.baseY, yTop: t.baseY + t.height });
  }
  if (board) {
    slabs.push({
      shape: board.kind === 'rect'
        ? { kind: 'rect', halfW: board.halfW, halfD: board.halfD }
        : { kind: 'round', radius: board.radius },
      yTop: BOTTOM_BASE,
      floor: true,
    });
  }
  return slabs;
}

/* Move a hand-placed point to the nearest spot that is not inside the cake.
 *
 * `piece` carries the decoration's own size: `reachAt(dir)` — how far it extends along a horizontal
 * direction, which is `footprintReach(occupantFootprint(...))` at the call site, the same answer the
 * seated drag uses — and `hy`, its half-height. Returns `pos` unchanged when nothing is penetrated,
 * so a caller can compare and write only on a real correction.
 *
 * ⚠️ THE SMALLER OF TWO PUSHES, which is what makes it feel like a wall rather than a magnet.
 * Dragged in from the side, the way out is sideways and the piece stops against the icing; lowered
 * onto the top, the way out is upward and it comes to rest on the surface. Resolving always
 * horizontally would shove a piece lowered onto the middle of a tier out to the rim, which is not
 * where the hand holding it was going.
 *
 * ⚠️ AND DOWN IS NEVER ONE OF THEM, which the first version got wrong by being even-handed. It
 * offered three ways out and took the shortest, so a piece near the bottom of a tier left through
 * its UNDERSIDE — which is not open space, it is the board, or the tier below. Measured on the
 * satin bow: asked for (0.20, 0.75) it came back (0.20, 0.66), having dropped out of the bottom of
 * the tier and stood up on the drum, still underneath the cake. A cake is a solid stack on a board;
 * the ways out of it are sideways and over the top.
 *
 * ⚠️ A FEW PASSES, because the slabs are not disjoint from the piece's point of view: pushed off the
 * upper tier it can land in the lower one. It converges in one or two on any real cake; the cap is
 * there so a pathological shape cannot spin.
 *
 * ⚠️ WHAT IS APPROXIMATED, said rather than left to be found. The piece is treated as its yawed
 * footprint plus an upright half-height — a tilt or a roll stretches the real body a few per cent
 * further than that. It is the SAME approximation `occupantFootprint` already documents for sibling
 * collision, and it errs by stopping a hair late rather than by inventing a different rule here.
 */
export function clampOutsideBody(body, pos, piece = {}, passes = 4) {
  if (!body?.length || !pos) return pos;
  let { x, y, z } = pos;
  if (![x, y, z].every(Number.isFinite)) return pos;

  const hy = Math.max(0, piece.hy ?? 0);
  const reachAt = typeof piece.reachAt === 'function' ? piece.reachAt : () => 0;

  const EPS = 1e-9;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const slab of body) {
      /* Vertical overlap first — it is the cheap test, and most slabs fail it.
         ⚠️ TOUCHING COUNTS. The first version demanded a POSITIVE overlap, which is never true of a
         piece with no measured height yet: its band is a single value, the overlap is exactly zero
         and every slab was waved through. A piece resting on a surface is in contact with it; the
         zero-move guard below is what stops that contact from being read as a penetration. */
      if (slab.floor ? y - hy > slab.yTop
                     : Math.min(y + hy, slab.yTop) < Math.max(y - hy, slab.yBottom)) continue;

      const r = Math.hypot(x, z);
      // Dead centre has no outward direction; +z (the FRONT, always in view) rather than an
      // arbitrary axis — the same choice boardRingClamp makes for the same reason.
      const dir = r < 1e-6 ? { x: 0, z: 1 } : { x: x / r, z: z / r };
      const clear = shapeReach(slab.shape, dir) + reachAt(dir);
      const out = clear - r;
      if (out <= 0) continue;                      // already outside this slab's footprint

      const up = slab.yTop - (y - hy);             // rest its base on the slab's top
      const push = slab.floor ? up : Math.min(out, up);
      if (push <= EPS) continue;                   // already resting on it — contact, not penetration
      if (push === out) { x = dir.x * clear; z = dir.z * clear; }
      else { y += up; }
      moved = true;
    }
    if (!moved) break;
  }
  return { x, y, z };
}
