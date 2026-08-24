import { describe, it, expect } from 'vitest';
import {
  CLOUD_DEFAULTS, cloudLobes, cloudPlacement, cloudBaseY, cloudFitScale, cloudGuide, cloudOutline,
} from './cloud.js';

const CAKE = { radius: 1.2, topY: 1.55, boardY: 0.1 };

describe('what a cloud is made of', () => {
  it('rests every PUFF ball on the surface, never in it', () => {
    // The mistake this pins: sinking the balls into the base line overlaps their sides more prettily
    // and puts the bottom of each one below the thing it is sitting on. On a board that is half a
    // cloud inside the board. The flat variant is the opposite case and is covered below — it dips
    // under the line on purpose and is then CUT there, so nothing is left underneath either way.
    for (const surface of ['top', 'board', 'side']) {
      const { lobes, baseY } = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'puff', surface }, CAKE);
      for (const l of lobes) expect(l.position.y - l.r).toBeGreaterThanOrEqual(baseY - 1e-9);
    }
  });

  it('stacks the puff into rows, nestled into the gaps below', () => {
    // Balls in ONE line make an arch — a caterpillar with a curved back — and the reference is
    // plainly a bunch: three or four along the bottom with two or three sitting in the dips on top.
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'puff', lobes: 4, rows: 2 }, CAKE);
    expect(lobes).toHaveLength(7);
    const levels = new Set(lobes.map(l => Math.round(l.y * 1000) - Math.round(l.r * 1000)));
    expect(levels.size).toBeGreaterThan(1);          // more than one row off the base
    // Each upper ball sits over a GAP between two lower ones, not on top of one.
    const bottom = lobes.slice(0, 4).map(l => l.x);
    for (const up of lobes.slice(4)) {
      const nearest = Math.min(...bottom.map(x => Math.abs(x - up.x)));
      expect(nearest).toBeGreaterThan(0.01);
    }
  });

  it('keeps the balls near enough the same size to read as a bunch', () => {
    // A strong taper turns a cluster back into an arch. The reference balls are close to equal.
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'puff', variation: 0 }, CAKE);
    const rs = lobes.map(l => l.r);
    expect(Math.min(...rs) / Math.max(...rs)).toBeGreaterThan(0.7);
  });

  it('is about 1.7 times as wide as it is tall', () => {
    // Measured off the reference, after guessing it twice: 2.5:1 is a bank of cloud and 1:1 is a
    // ball, and a pressed bunch is neither.
    const { width, height } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'puff' }, CAKE);
    expect(width / height).toBeGreaterThan(1.4);
    expect(width / height).toBeLessThan(2.1);
  });

  it('is about as deep as it is tall, not a wall of balls', () => {
    // The thing the flat-plane version could not do. In the reference you can see the balls behind
    // the front ones catching less light; rows in one plane are a wall seen face-on, however much
    // they are jittered.
    const { lobes, height } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'puff' }, CAKE);
    const depth = Math.max(...lobes.map(l => l.z + l.r)) - Math.min(...lobes.map(l => l.z - l.r));
    expect(depth / height).toBeGreaterThan(0.7);
  });

  it('alternates the balls front and back, so the bunch closes up', () => {
    // Behind the GAP between its neighbours, the same interlock the rows use going up. Random
    // depths leave daylight through it.
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'puff', lobes: 4, rows: 1 }, CAKE);
    for (let i = 1; i < lobes.length; i++) {
      expect(Math.sign(lobes[i].z)).not.toBe(Math.sign(lobes[i - 1].z));
    }
  });

  it('rolls balls big enough to read as balls', () => {
    // A third of the cloud's width each. Seven small ones read as a texture rather than as the
    // lumps a baker rolled and pressed together.
    const { lobes, width } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'puff' }, CAKE);
    expect((2 * Math.max(...lobes.map(l => l.r))) / width).toBeGreaterThan(0.3);
  });

  it('spreads the puff front to back as well as up', () => {
    // Balls at one depth light identically and the whole thing flattens into a silhouette, which is
    // most of what "dull and lifeless" looks like.
    const { lobes } = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'puff', surface: 'board' }, CAKE);
    const zs = lobes.map(l => l.position.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0);
  });

  it('is widest in the middle of a row and smallest at its ends', () => {
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, lobes: 5, rows: 1, variation: 0 }, CAKE);
    const mid = lobes[2].r;
    expect(mid).toBeGreaterThan(lobes[0].r);
    expect(mid).toBeGreaterThan(lobes[4].r);
  });

  it('is not symmetrical once variation is on', () => {
    // A symmetrical cloud looks like a diagram of a cloud.
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, lobes: 5, rows: 1, variation: 0.35 }, CAKE);
    expect(lobes[0].r).not.toBeCloseTo(lobes[4].r, 4);
  });

  it('shapes itself the same way every time it is asked', () => {
    // A design is stored as numbers and rendered again later — on a phone, in the baker's order, in
    // the template thumbnail. Math.random would make it a different cloud in each of them.
    const a = cloudLobes(CLOUD_DEFAULTS, CAKE).lobes.map(l => l.r);
    const b = cloudLobes(CLOUD_DEFAULTS, CAKE).lobes.map(l => l.r);
    expect(a).toEqual(b);
  });

  it('measures its width edge to edge, not middle to middle', () => {
    const { lobes, width } = cloudLobes(CLOUD_DEFAULTS, CAKE);
    const left = Math.min(...lobes.map(l => l.x - l.r));
    const right = Math.max(...lobes.map(l => l.x + l.r));
    expect(right - left).toBeCloseTo(width, 6);
  });

  it('reaches the height it was asked for when the lumps are even', () => {
    const { lobes, height } = cloudLobes({ ...CLOUD_DEFAULTS, variation: 0, taper: 0 }, CAKE);
    expect(Math.max(...lobes.map(l => l.y + l.r))).toBeCloseTo(height, 6);
  });
});

describe('scaling to the cake, not to the world', () => {
  it('gives a bigger cake a bigger cloud, in the same proportion', () => {
    const small = cloudLobes(CLOUD_DEFAULTS, { ...CAKE, radius: 0.6 });
    const big = cloudLobes(CLOUD_DEFAULTS, { ...CAKE, radius: 1.2 });
    expect(big.width / small.width).toBeCloseTo(2, 6);
  });

  it('changes size without changing shape', () => {
    const one = cloudLobes({ ...CLOUD_DEFAULTS, scale: 1 }, CAKE);
    const two = cloudLobes({ ...CLOUD_DEFAULTS, scale: 2 }, CAKE);
    // Same cloud, twice as big: every ratio between the lumps survives.
    expect(two.width / one.width).toBeCloseTo(2, 6);
    for (let i = 0; i < one.lobes.length; i++) {
      expect(two.lobes[i].r / one.lobes[i].r).toBeCloseTo(2, 6);
    }
  });
});

describe('where it sits', () => {
  it('stands on the cake top, the board, or the board again for a wall cloud', () => {
    expect(cloudBaseY('top', CAKE)).toBe(CAKE.topY);
    expect(cloudBaseY('board', CAKE)).toBe(CAKE.boardY);
    // A cloud pressed on a wall still stands on something. It does not hover partway up.
    expect(cloudBaseY('side', CAKE)).toBe(CAKE.boardY);
  });

  it('hugs the wall, so every ball sits on it rather than on a plane through it', () => {
    // What a flat plane cannot do: laid against a round cake its middle touches and its ends float.
    // Each ball's middle stands one radius off the wall, which is what resting on it means.
    const { lobes } = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'puff', surface: 'side', puffDepth: 0 }, CAKE);
    for (const l of lobes) {
      expect(Math.hypot(l.position.x, l.position.z)).toBeCloseTo(CAKE.radius + l.r, 6);
    }
  });

  it('keeps the width it was drawn as when bent round the cake', () => {
    // Arc length over radius. A plaque bent round a cake must not become a different amount of
    // fondant to roll — the same rule wrapToWall keeps for a rope.
    const flat = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'board' }, CAKE);
    const wall = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'side' }, CAKE);
    expect(wall.width).toBeCloseTo(flat.width, 6);
    expect(wall.outline.length).toBe(flat.outline.length);
  });

  it('hands the wall bend to the renderer for a flat piece, not to per-lump turns', () => {
    // A sheet is bent whole. Turning each lump separately is what discs needed, and discs are what
    // made it read as paper.
    const { sheet } = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'side', theta: 0.5 }, CAKE);
    expect(sheet.onWall).toBe(true);
    expect(sheet.wallR).toBe(CAKE.radius);
    expect(sheet.theta).toBe(0.5);
  });
});

describe('staying on what it sits on', () => {
  it('shrinks a cloud placed near the rim rather than moving it', () => {
    // Where it sits is the author's decision; its size is not. Same trade the rainbow's standing
    // arch makes.
    const near = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', offsetX: 0.9 }, CAKE);
    expect(near.fit).toBeLessThan(1);
    const right = Math.max(...near.lobes.map(l => l.position.x + l.r));
    expect(right).toBeLessThanOrEqual(CAKE.radius + 1e-6);
  });

  it('leaves a centred cloud alone', () => {
    expect(cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', offsetX: 0 }, CAKE).fit).toBe(1);
  });

  it('does not shrink one on the board or the wall', () => {
    // There is no edge to fall off — the whole board is under it. Shrinking there would be
    // answering a question nobody asked.
    for (const surface of ['board', 'side']) {
      expect(cloudPlacement({ ...CLOUD_DEFAULTS, surface, offsetX: 0.9 }, CAKE).fit).toBe(1);
    }
  });

  it('measures the fit from the LUMPS, not from a width', () => {
    // The bug this replaces: a width-based fit ignored the bunch's depth and every ball's own
    // radius, so a puffy cloud near the rim reached 1.30 on a 1.20 cake and reported a fit of 1.00.
    const CAKE_R = 1.2;
    const near = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', standoff: 0.9 }, CAKE);
    const reach = Math.max(...near.lobes.map(l => Math.hypot(l.position.x, l.position.z) + l.r));
    expect(reach).toBeLessThanOrEqual(CAKE_R + 1e-3);
    expect(near.fit).toBeLessThan(1);
  });

  it('leaves a cloud alone until it actually reaches the rim', () => {
    // Shrinking one that already fits would be answering a question nobody asked.
    for (const standoff of [0, 0.45, 0.75]) {
      expect(cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', standoff }, CAKE).fit).toBe(1);
    }
  });

  it('never lets a drag to the rim delete it', () => {
    // Its middle placed ON the rim leaves nothing to stand on, and the fit solves to ZERO there —
    // the cloud disappears. So the position is capped, and this is the one case where where-it-sits
    // is not purely the author's.
    for (const standoff of [1, 1.5, 4]) {
      const r = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', standoff }, CAKE);
      expect(r.fit).toBeGreaterThan(0.3);
      expect(r.lobes.length).toBeGreaterThan(0);
    }
  });
});

describe('the two variants', () => {
  it('cuts the flat one as ONE outline, with no lump list to render', () => {
    // Overlapping discs left a visible circle wherever two met, and the slab that gave them a
    // straight bottom left a knife edge across the front: together, cut paper stuck on a cake.
    const flat = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    expect(flat.outline.length).toBeGreaterThan(50);
    expect(flat.sheet).toBeTruthy();
  });

  it('leaves the puff as separate balls, because the seams are the point', () => {
    const puff = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'puff' }, CAKE);
    expect(puff.outline).toBeNull();
    expect(puff.sheet).toBeNull();
    // `lobes` counts the BOTTOM ROW; each row above has one fewer, so a 4-across, 2-row cloud is
    // seven balls.
    expect(puff.lobes).toHaveLength(CLOUD_DEFAULTS.lobes * 2 - 1);
  });

  it('closes the outline, so it can be a shape at all', () => {
    const o = cloudOutline({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    const gap = o[0].distanceTo(o[o.length - 1]);
    // Within a grid cell: the loop is stitched from segments computed twice, once per neighbouring
    // cell, so it closes to about the tracing resolution rather than exactly.
    expect(gap).toBeLessThan(CLOUD_DEFAULTS.width * CAKE.radius * 0.05);
  });

  it('cuts the flat bottom straight along the base line', () => {
    // Where the fondant was trimmed against the board. A row of circles alone has a scalloped
    // underside, which the reference plainly does not.
    const o = cloudOutline({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    const onBase = o.filter(v => Math.abs(v.y) < 1e-3);
    expect(onBase.length).toBeGreaterThan(10);
    // Nothing below the line: the shape stops at the cut.
    expect(Math.min(...o.map(v => v.y))).toBeGreaterThan(-1e-3);
  });

  it('spans the full width it was asked for', () => {
    const o = cloudOutline({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    const span = Math.max(...o.map(v => v.x)) - Math.min(...o.map(v => v.x));
    const { width } = cloudLobes({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    expect(span).toBeCloseTo(width, 1);
  });

  it('traces the same outline every time', () => {
    const a = cloudOutline({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    const b = cloudOutline({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE);
    expect(a.length).toBe(b.length);
    expect(a[0].x).toBeCloseTo(b[0].x, 12);
  });
});

describe('what the baker rolls', () => {
  it('answers in proportions of the cake, never millimetres', () => {
    // A millimetre is a promise about a cake nobody has seen. Same rule as the rainbow's guide.
    const g = cloudGuide(CLOUD_DEFAULTS, CAKE);
    expect(g.widthOfCakeWidth).toBeGreaterThan(0);
    expect(g.widthOfCakeWidth).toBeLessThan(1);
    expect(g.balls).toBe(CLOUD_DEFAULTS.lobes * 2 - 1);
  });

  it('says the same thing about a 6 inch and a 10 inch cake', () => {
    const small = cloudGuide(CLOUD_DEFAULTS, { ...CAKE, radius: 0.6 });
    const big = cloudGuide(CLOUD_DEFAULTS, { ...CAKE, radius: 1.4 });
    expect(small.widthOfCakeWidth).toBeCloseTo(big.widthOfCakeWidth, 6);
    expect(small.ballsOfCakeWidth).toEqual(big.ballsOfCakeWidth);
  });

  it('lists the biggest ball first, which is the one to roll to size', () => {
    const { ballsOfCakeWidth } = cloudGuide(CLOUD_DEFAULTS, CAKE);
    const sorted = [...ballsOfCakeWidth].sort((a, b) => b - a);
    expect(ballsOfCakeWidth).toEqual(sorted);
  });
});
