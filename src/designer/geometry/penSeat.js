/* ── Where a piped piece sits, when there may already be cream there ──────────────────────────────
 *
 * Sandeep, with a unicorn cake: *"the piping includes multiple nozzles and a lot of overlap.
 * currently we dont have a mechanism to overlap like or create a pattern with multiple nozzle
 * pipings."* Overlap is the whole job: a mane is cream piped ON cream, not a single layer.
 *
 * ⚠️ A PURE FUNCTION, DELIBERATELY, AND THE REASON IS A CHECK I ALMOST SHIPPED. This rule lived
 * inside `CreamPen`'s `seatAt`, which needs a raycaster, a camera and a live scene — so the only way
 * to "prove" it was a dev hook that re-decided the same question in design space and then agreed
 * with itself. That is a proxy chosen because it agrees with me, not evidence. Taking the DECISION
 * out of the raycasting leaves the component doing only what a component must (fire a ray) and
 * leaves the rule somewhere a test can ask it directly, with no scene at all.
 *
 * `hits` is whatever the raycaster returned, IN DISTANCE ORDER — three.js guarantees that — each
 * shaped `{ userData, faceNormal }` where `faceNormal` is already world-space. The caller does the
 * transform; this decides what the hit MEANS.
 */

/** The seat for a press, or null if the ray struck nothing pipeable.
 *
 *  - The nearest hit wins, whether it is the cake or cream already standing on it. Filtering to the
 *    cake alone is what made cream piped on cream sink into the piece it was aimed at.
 *  - EVERY seat is lifted along its normal by the rope radius, cake or cream alike. The stored point
 *    is a CENTRELINE one radius above the surface, and that is a convention the renderer depends on:
 *    `stampTransforms` places a piece at `seatedP + (-th + seatDrop)*up`, subtracting the radius
 *    unconditionally. I removed the lift for cream first, reasoning that the ray had already stopped
 *    on the piece below so adding a radius would float the new piece. That reasoning was about the
 *    HEAP path, which is a different renderer with a different convention — `buildPipingHeap`
 *    extrudes FROM the stored point, so for a heap the point is the base. Dropping the lift for
 *    stamps meant the renderer subtracted a radius nobody had added, and each stacked piece SANK
 *    into the one under it. Measured, not reasoned: two taps at one point came back with the second
 *    0.0754 BELOW the first.
 *  - The heap path's own float (0.0275, from the same lift being applied where it is not wanted) is
 *    a real shipped bug and is deliberately NOT changed here — it belongs to how a heap is committed,
 *    not to where a press lands.
 *  - A seat on CREAM grows along the piece's OWN stored normal, not the face the ray struck: a
 *    rosette's face normals swing right round between crests and creases, so seating on the struck
 *    face sends the next piece off sideways and it reads as a smooth leaf. A piece laid on another
 *    follows the one BELOW it, which is what a hand does.
 */
export function pickSeat(hits, { thickness = 0.03 } = {}) {
  const hit = (hits ?? []).find(h => h?.userData?.isPenCatcher || h?.userData?.isPenSeat);
  if (!hit) return null;

  const onCream = !!hit.userData?.isPenSeat && !hit.userData?.isPenCatcher;
  const grow = hit.userData?.grow;
  const up = (onCream && Array.isArray(grow) && grow.length === 3 && grow.some(v => v !== 0))
    ? normalize(grow)
    : (hit.faceNormal ? normalize(hit.faceNormal) : [0, 1, 0]);

  const lift = thickness;
  const p = hit.point ?? [0, 0, 0];
  return {
    point: [p[0] + up[0] * lift, p[1] + up[1] * lift, p[2] + up[2] * lift],
    normal: up,
    onCream,
  };
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}
