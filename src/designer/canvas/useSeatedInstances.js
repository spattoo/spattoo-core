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
export function useSeatedInstances(seats, topY) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tip = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    seats.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      if (s.lean) {
        axis.set(Math.cos(s.out), 0, -Math.sin(s.out));
        tip.setFromAxisAngle(axis, s.lean);
        q.premultiply(tip);
      }
      pos.set(s.x, topY, s.z);
      scl.setScalar(s.scale);
      mesh.setMatrixAt(i, m.compose(pos, q, scl));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [seats, topY]);
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
