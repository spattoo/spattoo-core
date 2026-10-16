import { describe, it, expect } from 'vitest';
import { occupantRadius, surfaceOccupants, occupantFootprint, footprintCapsule, separationPush, surfaceYaw } from './placement.js';
import { STICKER_SIZE } from './constants.js';

/* ⚠️ THE RULE EXISTED AND WAS TRAPPED IN ONE COMPONENT. `CakeCanvas` has cached every GLB's measured
 * half-width since the faux-ball work and used it to push a DRAGGED piece off its siblings — written
 * inline three times in one function. Trapped there it answers only "where may this piece be
 * dragged", so a filler looking for gaps between roses, or a piping ring that should not drive
 * through a decoration, had no way to ask. Sandeep: *"we should block penetration of gypsophila into
 * roses are any other elements. it can find gaps in the rose bunch and fill those gaps."* */
describe('occupantRadius — how wide is a placed thing', () => {
  it('uses the measured radius when the model has loaded', () => {
    expect(occupantRadius({ scale: 1 }, 0.4)).toBeCloseTo(0.4, 6);
    expect(occupantRadius({ scale: 2 }, 0.4)).toBeCloseTo(0.8, 6);
  });

  /* ⚠️ A FALLBACK IS NOT OPTIONAL. Seats are computed long before a GLB finishes loading, and a
     radius of 0 would let a ring seat itself straight through a rose for the first second of every
     page load — the kind of fault that only shows on a cold cache. */
  it('falls back to a nominal radius before the model has loaded', () => {
    expect(occupantRadius({ scale: 1 }, null)).toBeCloseTo(STICKER_SIZE / 4, 6);
    expect(occupantRadius({ scale: 1 })).toBeCloseTo(STICKER_SIZE / 4, 6);
  });

  it('scales with the instance, not just the model', () => {
    expect(occupantRadius({ scale: 0.5 }, 0.4)).toBeLessThan(occupantRadius({ scale: 1.5 }, 0.4));
  });

  it('survives a sticker with no scale at all', () => {
    expect(occupantRadius({}, 0.3)).toBeCloseTo(0.3, 6);
  });
});

describe('surfaceOccupants — what is standing on this surface', () => {
  const stickers = [
    { id: 'a', tierIndex: 0, zone: 'top_surface', x: 0.1, z: 0.2, scale: 1 },
    { id: 'b', tierIndex: 0, zone: 'top_surface', x: -0.3, z: 0.0, scale: 2 },
    { id: 'c', tierIndex: 1, zone: 'top_surface', x: 0.0, z: 0.0, scale: 1 },   // another tier
    { id: 'd', tierIndex: 0, zone: 'side', x: 0.5, z: 0.5, scale: 1 },          // another surface
    { id: 'e', tierIndex: 0, zone: 'top_surface', x: null, z: null, scale: 1 }, // not seated yet
  ];
  const opts = { tierIndex: 0, zone: 'top_surface' };

  it('takes only what is on the same tier and the same surface', () => {
    expect(surfaceOccupants(stickers, opts).map(o => o.id)).toEqual(['a', 'b']);
  });

  it('carries each one its own radius', () => {
    const got = surfaceOccupants(stickers, { ...opts, radiusOf: (s) => (s.id === 'b' ? 0.5 : 0.2) });
    expect(got.find(o => o.id === 'a').r).toBeCloseTo(0.2, 6);
    expect(got.find(o => o.id === 'b').r).toBeCloseTo(1.0, 6);   // 0.5 measured × scale 2
  });

  /* The piece being placed must not be asked to clear ITSELF, or it shoves itself across the cake
     the moment it is dragged. */
  it('can skip one by id', () => {
    expect(surfaceOccupants(stickers, { ...opts, skipId: 'a' }).map(o => o.id)).toEqual(['b']);
  });

  /* ⚠️ IT ASKS WHAT IS THERE, NEVER WHAT IT IS. A candle, a topper and a rose all occupy space and
     the rule is identical for each — there is no type, slug or category anywhere in the answer. */
  it('says nothing about what kind of thing each is', () => {
    for (const o of surfaceOccupants(stickers, opts)) {
      expect(Object.keys(o).sort()).toEqual(['id', 'r', 'x', 'z']);
    }
  });

  it('is empty rather than undefined when nothing is placed', () => {
    expect(surfaceOccupants(null, opts)).toEqual([]);
    expect(surfaceOccupants([], opts)).toEqual([]);
  });
});


/* ⚠️ THE CIRCLE IS A LIE FOR ANYTHING THAT IS NOT ROUND, and it reached a baker as a decoration that
 * would not go where there was clearly room. The two models below are the real catalogue rows, with
 * their measured bounding boxes, normalised to STICKER_SIZE exactly as StickerModel does:
 *
 *   Gingko leaf   1.602 x 1.902 x 0.047   →  half-extents 0.1179 x 0.1400 x 0.0034
 *   Rose          1.996 x 1.712 x 1.908   →  half-extents 0.1400 x 0.1201 x 0.1338
 *
 * Both carry `r: 2`. Before this, dragging the leaf at the rose parked it 0.5158 away (0.236 +
 * 0.280) with a leaf's width of clear icing between them — measured live in
 * dev/designer-mobile.html?leafrose=1. Sandeep: *"though there is space between gingko leaf and
 * rose, i am not able to move it near to the rose."* */
const LEAF = { hx: 0.1179, hy: 0.1400, hz: 0.0034 };
const ROSE = { hx: 0.1400, hy: 0.1201, hz: 0.1338 };

describe('occupantFootprint — the patch of surface a piece covers', () => {
  it('an upright piece shows the surface its x by its z — so a sheet is a sliver, not a disc', () => {
    const fp = occupantFootprint({ placementMode: 'stand', scale: 2 }, LEAF);
    expect(fp.a).toBeCloseTo(0.2358, 4);
    expect(fp.b).toBeCloseTo(0.0068, 4);
  });

  it('a piece lying flat shows its x by its y', () => {
    const fp = occupantFootprint({ placementMode: 'hug', scale: 2 }, LEAF);
    expect(fp.b).toBeCloseTo(0.2800, 4);
  });

  /* `insert` is a MODIFIER on an upright pose, not a pose of its own — the leaf on the cake carries
     `{ mode: 'stand', insert: {...} }`, and an element whose mode never reached the instance must
     still be read as upright or it gets the lying-flat axes and a 41x exclusion zone back. */
  it('an inserted piece is upright, whatever its mode says', () => {
    const fp = occupantFootprint({ insertDepth: 0.3, scale: 2 }, LEAF);
    expect(fp.b).toBeCloseTo(0.0068, 4);
  });

  /* ⚠️ NOTHING WITHOUT A MEASUREMENT MOVES. Every 2D sticker is unmeasured, and in an upright pose
     it billboards — it turns to face the camera, so it has no stable footprint to describe at all. */
  it('an unmeasured element keeps exactly the circle it had', () => {
    const fp = occupantFootprint({ placementMode: 'stand', scale: 2 }, null);
    expect(fp.a).toBeCloseTo(occupantRadius({ scale: 2 }, null), 6);
    expect(fp.b).toBeCloseTo(fp.a, 6);
  });
});

/* A separation test has to answer for the whole piece, not for the point where the line of centres
 * leaves it. The first version of this fix asked an ellipse for its radius along that line, and a
 * sheet aimed tip-first at a rose has almost no radius there — so it let the leaf's TIP travel
 * 0.136 inside the rose while the arithmetic said they were touching. Caught by looking at the
 * render: *"is ginko penetrating into rose?"* These are the cases that fault would pass. */
describe('separationPush — a piece rests against its neighbour, never through it', () => {
  const capOf = (sticker, half, x, z) => footprintCapsule(occupantFootprint(sticker, half), x, z);
  const leafAt = (x, z, rotation = 0) => capOf({ placementMode: 'stand', scale: 2, rotation }, LEAF, x, z);
  const roseAt = (x, z) => capOf({ placementMode: 'stand', scale: 2 }, ROSE, x, z);

  // Distance between the two pieces' own outlines after the push, which is the only thing that
  // decides whether they look joined or impaled.
  const restAfter = (self, sib) => {
    const { dx, dz } = separationPush(self, sib);
    const moved = { ...self, x: self.x + dx, z: self.z + dz };
    const back = separationPush(moved, sib);
    return { centre: Math.hypot(moved.x - sib.x, moved.z - sib.z), stillPushes: Math.hypot(back.dx, back.dz) };
  };

  it('a leaf laid alongside a rose comes right up to it', () => {
    // Broadside: the rose is off the leaf's FACE, where the leaf is 0.0068 thick.
    const r = restAfter(leafAt(0, 0.1), roseAt(0, 0));
    expect(r.centre).toBeCloseTo(0.2744, 3);     // 0.0068 + 0.2676, was 0.5158
    expect(r.stillPushes).toBeLessThan(1e-9);
  });

  it('a leaf aimed TIP FIRST at a rose stops at its tip, which is the case that was broken', () => {
    const r = restAfter(leafAt(0.3, 0), roseAt(0, 0));
    /* The leaf's own length is in the way, so its MIDDLE cannot get near: 0.229 + 0.0124 + 0.2744.
       ⚠️ That is 0.5158 — the number the old circle gave in EVERY direction. Tip-first is the one
       approach the circle happened to be right about, and this must not improve: a leaf really
       cannot push its point into a rose. The gain is entirely in the directions it was wrong. */
    expect(r.centre).toBeCloseTo(0.5158, 3);
    expect(r.stillPushes).toBeLessThan(1e-9);
  });

  /* ⚠️ THE REGRESSION, AS ONE NUMBER. This is the position the ellipse rule settled on; the tip was
     0.136 inside the rose there. Whatever else changes, that state must not be reachable. */
  it('refuses the state the ellipse rule produced', () => {
    const { dx, dz } = separationPush(leafAt(-0.2633, -0.1288), roseAt(0, 0));
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.1);
  });

  it('two roses keep the distance they always kept', () => {
    const r = restAfter(roseAt(0.4, 0), roseAt(0, 0));
    expect(r.centre).toBeCloseTo(0.5600, 3);
  });

  it('leaves pieces that are already clear exactly where they are', () => {
    const { dx, dz } = separationPush(leafAt(0, 1.2), roseAt(0, 0));
    expect(dx).toBe(0);
    expect(dz).toBe(0);
  });

  /* Dropped dead centre on another piece there is no direction to be had — it must still come
     apart rather than divide by zero and stay buried. */
  it('separates two pieces at the very same point', () => {
    const { dx, dz } = separationPush(roseAt(0, 0), roseAt(0, 0));
    expect(Math.hypot(dx, dz)).toBeCloseTo(0.5352, 3);   // r + r, the whole gap to close
  });

  it('turns with the piece — a spun leaf is thin where it used to be wide', () => {
    const r = restAfter(leafAt(0.1, 0, Math.PI / 2), roseAt(0, 0));
    expect(r.centre).toBeCloseTo(0.2868, 3);   // 0.2744 + the rose's own 0.0124 of length
  });
});

describe('footprintCapsule — a round piece is still a disc', () => {
  it('collapses to a point-and-radius when the footprint is near-square', () => {
    const c = footprintCapsule(occupantFootprint({ placementMode: 'stand', scale: 2 }, ROSE));
    expect(c.r).toBeCloseTo(0.2676, 4);
    expect(c.halfLen).toBeCloseTo(0.0124, 4);
  });

  it('a sheet is a long segment with a thin radius', () => {
    const c = footprintCapsule(occupantFootprint({ placementMode: 'stand', scale: 2 }, LEAF));
    expect(c.r).toBeCloseTo(0.0068, 4);
    expect(c.halfLen).toBeCloseTo(0.2290, 4);
  });

  it('an unmeasured element is exactly the circle it always was', () => {
    const c = footprintCapsule(occupantFootprint({ scale: 2 }, null));
    expect(c.halfLen).toBeCloseTo(0, 6);
    expect(c.r).toBeCloseTo(occupantRadius({ scale: 2 }, null), 6);
  });
});

describe('surfaceYaw — one home for which way a piece faces', () => {
  it('is the spin the customer set', () => {
    expect(surfaceYaw({ rotation: 0.4 })).toBeCloseTo(0.4, 6);
    expect(surfaceYaw({})).toBeCloseTo(0, 6);
  });

  /* A verge auto-orients radially outward and re-derives it from x/z as it is dragged round the rim
     — the renderer reads this same function, so the footprint can never face a different way than
     the model on screen. */
  it('a verge adds the radial facing its render uses', () => {
    expect(surfaceYaw({ placementMode: 'verge', x: 1, z: 0, rotation: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });
});
