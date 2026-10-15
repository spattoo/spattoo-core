import { describe, it, expect } from 'vitest';
import { occupantRadius, surfaceOccupants, occupantFootprint, radiusToward, surfaceYaw } from './placement.js';
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

describe('radiusToward — how far a piece reaches in one direction', () => {
  const leaf = occupantFootprint({ placementMode: 'stand', scale: 2 }, LEAF);
  const rose = occupantFootprint({ placementMode: 'stand', scale: 2 }, ROSE);

  it('reaches its full width along its face and its thickness across it', () => {
    expect(radiusToward(leaf, 1, 0)).toBeCloseTo(0.2358, 4);
    expect(radiusToward(leaf, 0, 1)).toBeCloseTo(0.0068, 4);
  });

  it('turns with the piece — a spun leaf is thin where it used to be wide', () => {
    const spun = occupantFootprint({ placementMode: 'stand', scale: 2, rotation: Math.PI / 2 }, LEAF);
    expect(radiusToward(spun, 1, 0)).toBeCloseTo(0.0068, 4);
    expect(radiusToward(spun, 0, 1)).toBeCloseTo(0.2358, 4);
  });

  /* The whole point, as one number: the leaf may now come within a thickness of the rose when it
     approaches edge-on, where before it stopped 0.5158 out whichever way it came. */
  it('lets a leaf meet a rose face to face, where the circle held it half a leaf away', () => {
    const before = occupantRadius({ scale: 2 }, LEAF.hx) + occupantRadius({ scale: 2 }, ROSE.hx);
    const edgeOn = radiusToward(leaf, 0, 1) + radiusToward(rose, 0, 1);
    expect(before).toBeCloseTo(0.5158, 4);
    expect(edgeOn).toBeCloseTo(0.2744, 4);
    expect(edgeOn).toBeLessThan(before / 1.8);
  });

  /* ⚠️ AND IT MUST NOT GIVE GROUND WHERE THE CIRCLE WAS RIGHT. A rose is near-spherical, so two of
     them keep what they always kept — a change that loosened everything would be penetration, which
     is the bug this rule exists to prevent (INVARIANTS #3b). */
  it('leaves a near-spherical pair where it found them', () => {
    const both = radiusToward(rose, 1, 0) + radiusToward(rose, 1, 0);
    expect(both).toBeCloseTo(0.5600, 4);
    expect(radiusToward(rose, 0, 1) + radiusToward(rose, 0, 1)).toBeGreaterThan(0.5 * both);
  });

  it('answers the larger semi-axis for a zero-length direction rather than dividing by it', () => {
    expect(radiusToward(leaf, 0, 0)).toBeCloseTo(0.2358, 4);
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
