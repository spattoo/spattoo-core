import { useRef, useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { grassSeats } from '../geometry/grass.js';

/* ── Seating an instanced field on a surface ─────────────────────────────────────────────────────
 *
 * `grassSeats` hands back `[{ x, z, yaw, scale, lean?, out? }]` and every caller then writes the
 * same loop: compose a matrix per seat, flag the attribute, recompute the bounding sphere. This is
 * that loop, once. It came out of `GrassPatch` the moment gypsophila needed the identical thing —
 * `check:dup` caught the copy before it was committed, which is the gate doing exactly its job.
 *
 * ⚠️ `lean` IS ONLY EVER SET ON A RIM SEAT, and the tipping maths is the part worth not retyping.
 * Rotating about (cos out, 0, −sin out) tips +Y toward the OUTWARD direction: the axis is
 * horizontal and perpendicular to it, so the piece falls away from the cake rather than along it.
 * Mid-surface a tip would lift one side of a clump off the cake and bury the other; at the edge
 * there is nothing underneath to bury into, which is what makes a drape possible at all.
 */
/* ⚠️ THE AXIS THAT TIPS A PIECE AWAY FROM THE CAKE, exported so it can be tested rather than
 * trusted. Rotating about (cos out, 0, −sin out) carries +Y toward the OUTWARD bearing `out`; the
 * axis is horizontal and perpendicular to it, so the piece falls away from the cake rather than
 * along it. Get the sign wrong and everything leans INWARD through the cake — which is exactly the
 * bug the wafer skirt's `fin` mounting shipped with, found by a test and not by looking at renders.
 */
export function layAxis(out, into = new THREE.Vector3()) {
  return into.set(Math.cos(out), 0, -Math.sin(out));
}

export function useSeatedInstances(seats, topY, { lay = 0, layVary = 0, rand = null, geo = null } = {}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tip = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    seats.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      /* ⚠️ `lay` IS FOR A SURFACE YOU CANNOT PUSH A STEM INTO. A cake board is hard — card or
         acrylic — so a ring round the base is not planted in it, it is LAID on it: stems tucked in
         sideways at the join, resting against the cake's wall, blooms fanning outward. Seated
         upright instead, a board ring reads as a hedge round a building. Sandeep: *"on the board,
         it looks more like a tree plantation… board is a hard material thing and you cannot insert
         into it."*
         Same tipping maths as the rim lean, taken all the way over: rotating about
         (cos out, 0, −sin out) carries +Y toward the OUTWARD direction, so the sprig falls away
         from the cake rather than along it. `out` is the seat's own bearing from the centre, which
         every seat has whether or not `grassSeats` bothered to compute it for an overhang. */
      if (lay > 0) {
        const out = s.out ?? Math.atan2(s.x, s.z);
        const amount = lay * (1 - layVary * (rand ? rand() : 0));
        layAxis(out, axis);
        tip.setFromAxisAngle(axis, amount);
        q.premultiply(tip);
      } else if (s.lean) {
        layAxis(s.out, axis);
        tip.setFromAxisAngle(axis, s.lean);
        q.premultiply(tip);
      }
      pos.set(s.x, topY, s.z);
      scl.setScalar(s.scale);
      mesh.setMatrixAt(i, m.compose(pos, q, scl));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    /* ⚠️ `geo` IS A DEPENDENCY EVEN THOUGH IT IS NEVER READ HERE, and leaving it out is a bug you
       cannot see coming. R3F treats `args` on a primitive as construction arguments: change the
       geometry and it does not swap it in, it REBUILDS the InstancedMesh. The new mesh arrives with
       an untouched instanceMatrix, so unless this effect runs again every instance sits at the
       identity — all of them stacked at the origin, inside the cake, invisible.
       It showed as a decoration vanishing when a slider that has nothing to do with placement
       moved: *"when i increase the branches… rim bunch disappears when the value reaches 4."* The
       seats had not changed, so the effect did not re-run. `GrassPatch` carried the same latent
       fault and is fixed by the same line. */
  }, [seats, topY, lay, layVary, rand, geo]);
  return ref;
}

/* How many triangles the field would be if somebody MERGED it — which is the number worth warning
 * about, since as an InstancedMesh it is one draw call over one piece however many seats there are.
 * Counted off the geometry that actually gets drawn, so it cannot drift from what it describes the
 * way a formula in a studio panel would. */
export function instancedTriangleCount(geo, seatCount) {
  const per = geo?.index ? geo.index.count / 3 : (geo?.attributes?.position?.count ?? 0) / 3;
  return { per, total: Math.round(seatCount * per) };
}

/* ── Where the pieces go ─────────────────────────────────────────────────────────────────────────
 *
 * `grassSeats` is the one distribution system: cover a top, ring the rim (`bandInner`), put a clump
 * here (`patches`), keep out of that (`hole`), drape over the edge (`overhang`) — against any tier
 * outline, round or sheet or heart. This wraps it with the memo and the coordinate conversion both
 * callers need, so a second field does not become a second answer to the same question.
 *
 * ⚠️ PATCHES ARRIVE POLAR, SEATS WANT WORLD. Handles store (u, v) against the surface — the same
 * convention FinishHandles drags dust and foil in — and the conversion happens INSIDE the memo on
 * purpose: at the call site it would build a fresh array every render and rebuild every seat on
 * every frame, which for a few thousand pieces is the whole frame budget.
 */
export function useSurfaceSeats({
  shape, spacing, jitter, inset = 0.98, seed = 7,
  bandInner = null, hole = null, overhang = 0, patches = null, patchRadius = null,
}) {
  return useMemo(() => {
    const R = patchRadius ?? shape.radius ?? 1;
    const world = patches?.length
      ? patches.map(p => ({ x: p.v * R * Math.sin(p.u * Math.PI * 2),
                            z: p.v * R * Math.cos(p.u * Math.PI * 2),
                            r: p.r ?? 0.35 }))
      : null;
    return grassSeats({ shape, spacing, jitter, inset, seed: seed + 1,
                        bandInner, hole, overhang, patches: world });
  }, [shape, spacing, jitter, inset, seed, bandInner, hole, overhang, patches, patchRadius]);
}
