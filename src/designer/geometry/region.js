import { pointInPolygon, nearestOnPolygon } from './shapes.js';
import { snapToRim, topContains } from './surface.js';

// ── A chosen AREA on the cake's surface ──────────────────────────────────────────────────────────
//
// A rectangle or a triangle the baker puts somewhere on the top, so a filling — sand today, cream
// "water" next — covers that patch instead of the whole surface. Sandeep's beach: *"i want to
// diagonally add sand on a sheet cake. rest ill add cream to resemble water."*
//
// ⚠️ THIS IS NOT A SAND FEATURE AND IT MUST NOT BECOME ONE. Sand, cream, grass and every other
// field already seat through `useSurfaceSeats`, so the moment this lives inside `sand.js` the next
// filling needs its own copy. It is a region on the surface; what gets poured into it is somebody
// else's question.
//
// ⚠️ AND IT IS NOT `shape`. A cake's `shape` (surface.js) is the footprint of the cake itself, and
// every question asked of it — `shapeReach`, `perimeter`, `edgeSeat` — is answered FROM THE CENTRE.
// That is why handing an off-centre polygon to the sand generator produced a cone spreading out of
// the middle of the cake rather than a patch in the corner: `shapeReach(shape, dir)` is a support
// function measured from the origin, so it can only describe regions star-shaped about the middle.
// A region is a closed ring that can sit anywhere, and the only question asked of it is **how far
// inside it is this point** — a distance, not a radius.
//
// ⚠️ THE POLYGON MATHS IS `shapes.js`'s, NOT A SECOND COPY. `pointInPolygon` and `nearestOnPolygon`
// have been there since heart and number cakes arrived; both already walk multiple rings, which a
// freshly-written pair would not. This module is the REGION vocabulary — kinds, placement, depth —
// and nothing more.
//
// ── EVERYTHING IS A FRACTION OF THE CAKE'S REACH ────────────────────────────────────────────────
// `size`, `x` and `z` are fractions, never centimetres (INVARIANTS #8). A region authored on a 6"
// round is the same region on a 12" sheet, and nothing has to be re-placed when a customer resizes
// the cake.

/* The unit outlines, in a 2×2 box about the origin. A new region shape is A ROW HERE — data — and
   no consumer changes (rule 2: config-driven, never type-driven). `rotation` and `aspect` between
   them cover the variations that would otherwise be tempting to add as separate kinds: a corner
   wedge is the triangle turned, a band is the rectangle squashed. */
/* ⚠️ A CIRCLE IS A POLYGON HERE, NOT A SPECIAL CASE. Giving `round` a closed-form depth would be
   faster — but it would also be the one kind that does not go through `ringDepth`, so every later
   change to how a region is measured would have to be made twice and tested twice. The cost is
   bounded and was measured, not assumed: see the build-time note in sand.js. 44 segments puts the
   flat-to-arc error at 0.26% of the radius, under half a lattice step on a 6" cake — invisible
   against an edge that is deliberately ragged anyway. */
const circle = (n) => Object.freeze(Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return Object.freeze({ x: Math.sin(a), z: Math.cos(a) });
}));

export const REGION_KINDS = Object.freeze({
  round: circle(44),
  rect: Object.freeze([{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }]),
  // Apex toward -z, base along +z, so an unrotated triangle points "up" on a top-down view.
  triangle: Object.freeze([{ x: 0, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }]),
});

export const REGION_DEFAULTS = Object.freeze({
  kind: 'round',
  /* ⚠️ GENEROUS ON PURPOSE. At 0.55 the first tap put a small blob in the middle of the top, which
     reads as a mistake rather than as a decoration — and the thing a baker just asked for should
     look like it arrived. 0.8 covers most of the surface and leaves a rim of bare cake, which is
     what "sand on top" usually means. Shrinking is as easy as growing; the dial is right there. */
  size: 0.8,        // half-extent, as a fraction of the cake's reach
  aspect: 1,        // >1 wider than deep, <1 deeper than wide
  rotation: 0,      // radians, clockwise on a top-down view
  x: 0, z: 0,       // centre, as a fraction of the cake's reach
});

/**
 * The region as a closed ring of world points — ready for `ringDepth`, and for the seat samplers
 * via `regionSeatShape`.
 *
 * `reach` is the cake's own half-size, so every number in `region` stays a fraction.
 */
export function regionRing(region, reach = 1) {
  const r = { ...REGION_DEFAULTS, ...(region ?? {}) };
  const unit = REGION_KINDS[r.kind] ?? REGION_KINDS.rect;
  /* ⚠️ ASPECT SPLITS EITHER SIDE OF 1 RATHER THAN SCALING ONE AXIS, so `size` always means the same
     thing: turning a rectangle on its side must not also make it bigger. Scaling x alone made every
     wide region a large one and every tall region a small one, so `size` and `aspect` fought. */
  const ax = Math.sqrt(Math.max(1e-6, r.aspect));
  const sx = r.size * reach * ax;
  const sz = r.size * reach / ax;
  const cos = Math.cos(r.rotation), sin = Math.sin(r.rotation);
  return unit.map(p => {
    const px = p.x * sx, pz = p.z * sz;
    return { x: px * cos - pz * sin + r.x * reach, z: px * sin + pz * cos + r.z * reach };
  });
}

/**
 * The cake's half-extent — the number a region's fractional `size`, `x` and `z` are measured in.
 *
 * ⚠️ NOT THE SUPPORT-FUNCTION MAXIMUM, which on a sheet is the DIAGONAL. `shapeMaxReach` answers
 * "how far does this footprint reach in its furthest direction" and is right for sizing a lattice,
 * which must cover the corners; it is wrong here. On a 1.35 × 0.95 sheet it is 1.63, so a region
 * asked for at `size: 0.5` came out half the diagonal — wider than the cake is deep, and nothing
 * like half of it. A baker reading "half" means half the long side.
 *
 * ⚠️ AND IT MUST AGREE WITH `grassSeats`, which computes exactly this number inline for its own
 * sampling extent (`grass.js`). The mound and the crumbs that garnish it have to be measured in the
 * same units or a region's sand and a region's crumbs are different sizes.
 */
export function shapeExtent(shape) {
  if (shape.outline) {
    let e = 0;
    for (const p of shape.outline) e = Math.max(e, Math.abs(p.x ?? 0), Math.abs(p.z ?? 0));
    return e;
  }
  if (shape.kind === 'rect') return Math.max(shape.halfW ?? 0, shape.halfD ?? 0);
  return shape.radius ?? 1;
}

/** The ring's axis-aligned extent — what a lattice has to cover. */
export function ringBounds(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * How far inside the region (x, z) is, and where its edge is from there.
 *
 * Returns `{ depth, edgeX, edgeZ, inX, inZ }` — depth positive inside and negative outside, the
 * nearest point on the boundary, and the UNIT DIRECTION from that boundary point toward the inside.
 *
 * ⚠️ THE INWARD DIRECTION IS DERIVED FROM THE SIDE, NOT FROM THE EDGE NORMAL. `nearestOnPolygon`
 * hands back a normal built from the edge's winding, which points outward or inward depending on
 * how the ring happens to be wound — and a region's ring comes from `REGION_KINDS`, where nothing
 * guarantees a winding. Taking the direction from the point itself is winding-proof. At a corner,
 * where the nearest point IS the vertex, it still aims into the region.
 */
export function ringDepth(ring, x, z) {
  const near = nearestOnPolygon(ring, x, z);
  const d = Math.hypot(x - near.x, z - near.z);
  const inside = pointInPolygon(ring, x, z);
  // Toward the inside: away from the edge if we are already in, toward us-and-beyond if we are out.
  let ix = inside ? x - near.x : near.x - x;
  let iz = inside ? z - near.z : near.z - z;
  const len = Math.hypot(ix, iz);
  if (len > 1e-9) { ix /= len; iz /= len; } else { ix = 0; iz = 0; }
  return { depth: inside ? d : -d, edgeX: near.x, edgeZ: near.z, inX: ix, inZ: iz };
}

/**
 * The deepest point in the region — its inradius, near enough.
 *
 * ⚠️ SAMPLED, NOT SOLVED. The exact inradius of an arbitrary polygon is a medial-axis problem and
 * nothing here needs that: this number only sets how far a filling's taper reaches in from the
 * edge, so a few percent low makes a feather a few percent tighter and nothing else. A coarse grid
 * over the bounding box is enough, and it costs one scan per region rather than one per vertex.
 */
export function ringInradius(ring, samples = 48) {
  const b = ringBounds(ring);
  let best = 0;
  for (let i = 0; i <= samples; i++) {
    const x = b.minX + (b.maxX - b.minX) * (i / samples);
    for (let j = 0; j <= samples; j++) {
      const z = b.minZ + (b.maxZ - b.minZ) * (j / samples);
      if (!pointInPolygon(ring, x, z)) continue;
      const near = nearestOnPolygon(ring, x, z);
      const d = Math.hypot(x - near.x, z - near.z);
      if (d > best) best = d;
    }
  }
  return best;
}

/**
 * How far inside the CAKE'S OWN TOP a point is — positive in, negative out.
 *
 * ⚠️ A REGION MUST BE CLIPPED TO THE CAKE, and forgetting it is not subtle: a triangle at `size`
 * 0.85 on a round tier put its two base corners at radius 1.44 on a 1.2 cake, so the sand hung in
 * the air past the rim. The radial drift has a test against exactly this; a region needs the same
 * guarantee by a different route, because its boundary has nothing to do with the cake's.
 *
 * ⚠️ BUILT FROM `snapToRim` AND `topContains`, which have answered "where is the rim from here" and
 * "am I on the cake" for every footprint since hearts and number cakes. A second distance-to-cake
 * routine would be a copy that drifts — and would have to re-learn a sheet's rounded corners, which
 * `snapToRim` already walks through `perimeter`.
 */
export function surfaceDepth(shape, x, z) {
  const inside = topContains(shape, x, z);
  const p = snapToRim(shape, x, z);
  let d = Math.hypot(x - p.x, z - p.z);
  /* ⚠️ THE EXACT CENTRE OF A ROUND TIER HAS NO DIRECTION TO SNAP ALONG. `snapToRim` normalises
     (x, z) to find the bearing, and at the origin that is 0/0 — it guards with `|| 1` and hands
     back the origin itself, so the rim reads as being 0 away and the middle of the cake measures as
     if it were ON the edge. Harmless for the mesh, whose lattice almost never lands exactly there;
     not harmless for a point query, and the symptom was a shell placed dead centre sitting at zero
     height while the sand around it stood proud. Asking again a hair off the origin restores the
     bearing, and anywhere else this branch never runs. */
  if (inside && d < 1e-9) d = Math.hypot(x - snapToRim(shape, x + 1e-6, z).x, z - snapToRim(shape, x + 1e-6, z).z);
  return inside ? d : -d;
}

/**
 * The region as a `shape` the seat samplers already understand — `{ kind:'outline' }`, which
 * `topContains` and `grassSeats` have handled since hearts and number cakes arrived. This is why
 * the crumbs needed no new code at all.
 *
 * ⚠️ `halfW`/`halfD` ARE THE REACH TO THE REGION, NOT ITS OWN HALF-WIDTH. `grassSeats` walks
 * `-ext…+ext` with `ext = max(halfW, halfD)`, so a region sitting out in one corner needs the
 * extent that GETS THERE. Half the bounding box leaves a corner patch's seats cut off.
 */
export function regionSeatShape(ring) {
  const b = ringBounds(ring);
  return {
    kind: 'outline',
    halfW: Math.max(Math.abs(b.minX), Math.abs(b.maxX)),
    halfD: Math.max(Math.abs(b.minZ), Math.abs(b.maxZ)),
    outline: ring,
  };
}
