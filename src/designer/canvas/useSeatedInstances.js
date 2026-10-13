import { useRef, useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { grassSeats } from '../geometry/grass.js';
import { mulberry32 } from '../utils/random.js';

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

export function useSeatedInstances(seats, topY,
                                   { lay = 0, layVary = 0, laySeed = 7, geo = null,
                                     shadeVary = 0 } = {}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tip = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    /* ⚠️ THE GENERATOR IS BUILT HERE, INSIDE THE EFFECT, NOT HANDED IN. A PRNG is a STREAM: every
       draw advances it. Passing one in — even a stable, memoised, correctly seeded one — means the
       second run of this effect continues where the first stopped and seats every piece at a
       different angle. The board ring shook on every frame for exactly that: *"boarder ring is
       continuously shaking."* Re-seeding here makes a re-run produce identical matrices, which is
       the property the whole feature already claims ("must look random and be STABLE"). */
    const rand = mulberry32((laySeed + 991) >>> 0);
    /* ⚠️ A CROWD IS NOT ONE BRIGHTNESS, and this is the only lever an InstancedMesh has on the
       flatness of a packed field. Every instance shares one geometry, so per-vertex shading can
       only paint the same gradient on all of them — measured, baking depth INSIDE a sprig moved
       the ring's median from 233 to 225 and its tonal range not at all. That is uniform dimming,
       which is the wafer skirt's "smoke" in another costume.
       What buries a bloom in a ring is the hundred sprigs around it, and no instance can know
       about its neighbours. But a real crowd has some pieces catching the light and some in the
       shade of the rest, so giving each INSTANCE its own brightness is what the eye reads as depth.
       `setColorAt` multiplies alongside the vertex colours, so the stem/bloom split survives. */
    const shaded = shadeVary > 0 && typeof mesh.setColorAt === 'function';
    const c = shaded ? new THREE.Color() : null;
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
        const amount = lay * (1 - layVary * rand());
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
      if (shaded) {
        const k = 1 - shadeVary * rand();
        mesh.setColorAt(i, c.setRGB(k, k, k));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (shaded && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
  }, [seats, topY, lay, layVary, laySeed, geo, shadeVary]);
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
  collars = null,
}) {
  return useMemo(() => {
    const R = patchRadius ?? shape.radius ?? 1;
    const toWorld = (p, fallbackR) => ({
      x: p.v * R * Math.sin(p.u * Math.PI * 2),
      z: p.v * R * Math.cos(p.u * Math.PI * 2),
      r: p.r ?? fallbackR,
      inner: p.inner ?? 0,
    });
    /* A collar IS a patch with a bite out of the middle, so it rides the same machinery — the outer
       edge is the patch radius and the bite is applied afterwards. */
    const world = [...(patches ?? []).map(p => toWorld(p, 0.35)),
                   ...(collars ?? []).map(p => toWorld(p, 0.4))];
    const seats = grassSeats({ shape, spacing, jitter, inset, seed: seed + 1, bandInner, hole,
                               overhang, patches: world.length ? world : null });
    return collars?.length ? withoutCollarCentres(seats, world.filter(w => w.inner > 0)) : seats;
  }, [shape, spacing, jitter, inset, seed, bandInner, hole, overhang, patches, patchRadius, collars]);
}

/* ── A ring of pieces around something already on the cake ───────────────────────────────────────
 *
 * Gypsophila round a rose, which is how every florist-style cake uses it: the filler hugs the
 * subject and radiates outward, so the rose reads as placed rather than stuck on. Sandeep: *"when
 * there are roses, gypsophila flowers surround them. we should also be able to add these between
 * the roses."*
 *
 * ⚠️ NEITHER `patches` NOR `hole` CAN SAY THIS, which is why it is a filter and not a fourth
 * argument to `grassSeats`. `patches` gives a disc — flowers would grow THROUGH the rose. `hole` is
 * an outline test against the tier's own centre (`hypot(x, z)`), so it can only bite the middle out
 * of the cake, never a hole at an arbitrary spot. The outer edge of a collar is a patch and the
 * bite is taken afterwards, which keeps grass's own file out of it.
 *
 * ⚠️ IT IS A SQUARED-DISTANCE TEST ON PURPOSE. A seat loop over a few thousand pieces and a handful
 * of collars runs this often enough that a `Math.hypot` per pair is worth not paying.
 */
export function withoutCollarCentres(seats, collars) {
  if (!collars?.length) return seats;
  return seats.filter((s) => !collars.some((c) => {
    const dx = s.x - c.x, dz = s.z - c.z;
    return dx * dx + dz * dz < c.inner * c.inner;
  }));
}

/* ── A ring hugging the foot of the cake ─────────────────────────────────────────────────────────
 *
 * Grown OUTWARD from the tier's own outline by `width` (a fraction of it), so the band is the shape
 * of the cake rather than a circle, and a sheet or a heart gets a ring that follows its corners.
 * Paired with `hole: { shape: <the tier>, scale: 1 }` it is an annulus exactly `width` wide.
 *
 * ⚠️ IT IS A RING ON THE CAKE'S BOTTOM RIM, NOT A FIELD ON THE BOARD. Seating against the board's
 * own outline fills everything between the cake and the board's edge, which both floods it and says
 * the flowers are standing in the board: *"we dont need to flood the board entirely… it should
 * actually be the ring on the botton rim of the cake. like i already said, you cant insert them on
 * board."* A real base ring is tucked into the JOIN — stems into the cake's foot, blooms resting
 * out over the board — so the band is measured from the cake outward and its width is a control.
 *
 * ⚠️ `bandInner` CANNOT SAY THIS. It hollows out the same outline it fills, so it can only make a
 * ring INSIDE a shape; this one lives outside it.
 */
export function outwardBand(shape, width = 0.18) {
  const k = 1 + Math.max(0, width);
  if (shape.kind === 'rect') {
    return { ...shape, halfW: shape.halfW * k, halfD: shape.halfD * k,
             cornerR: (shape.cornerR ?? 0) * k };
  }
  if (shape.outline) return { ...shape, scale: (shape.scale ?? 1) * k };
  return { ...shape, radius: (shape.radius ?? 1) * k };
}

/* ── A band straddling the rim ───────────────────────────────────────────────────────────────────
 *
 * A ring on the top edge has TWO edges of its own, and both are choices a baker makes: how far in
 * from the rim the flowers start, and how far past it they reach. Returns the pair `grassSeats`
 * needs — a shape grown outward by `out`, and the `bandInner` that hollows it back to `1 - inn`.
 *
 * ⚠️ `overhang` IS NOT THIS CONTROL, which is why it is not the one exposed. It caps at 9% of the
 * outline (OVERHANG_REACH) and it also drives the rim lean, so turning it up to reach further also
 * tips the pieces over — two effects on one slider, and neither of them in tier units. Sandeep:
 * *"on the rim also, how much to come out of the rim should be a controlling field."* A field, so
 * it says one thing.
 *
 * Both are fractions of the tier, the same units the foot ring's width is in, so "0.1 out" means
 * the same distance in both places.
 */
export function rimBand(shape, { inn = 0.14, out = 0.1 } = {}) {
  const o = Math.max(0, out), i = Math.max(0, Math.min(0.95, inn));
  return {
    shape: outwardBand(shape, o),
    /* `bandInner` is a scale of the shape being FILLED, and that shape is already grown — so the
       inner edge has to be divided back out or the band narrows as the reach grows. */
    bandInner: (1 - i) / (1 + o),
  };
}
