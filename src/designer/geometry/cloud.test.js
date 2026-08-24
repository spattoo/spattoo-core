import { describe, it, expect } from 'vitest';
import {
  CLOUD_DEFAULTS, cloudLobes, cloudPlacement, cloudBaseY, cloudFitScale, cloudGuide,
} from './cloud.js';

const CAKE = { radius: 1.2, topY: 1.55, boardY: 0.1 };

describe('what a cloud is made of', () => {
  it('rests every lump ON the surface, never in it', () => {
    // The mistake this pins: sinking the lumps into the base line overlaps their sides more
    // prettily and puts the bottom of every ball below the thing it is sitting on. On a board that
    // is half a cloud inside the board.
    for (const surface of ['top', 'board', 'side']) {
      const { lobes, baseY } = cloudPlacement({ ...CLOUD_DEFAULTS, surface }, CAKE);
      for (const l of lobes) expect(l.position.y - l.r).toBeGreaterThanOrEqual(baseY - 1e-9);
    }
  });

  it('is widest in the middle and smallest at the ends', () => {
    // A row of equal circles is a caterpillar. The taper is what makes it read as a cloud.
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, lobes: 5, variation: 0 }, CAKE);
    const mid = lobes[2].r;
    expect(mid).toBeGreaterThan(lobes[0].r);
    expect(mid).toBeGreaterThan(lobes[4].r);
  });

  it('is not symmetrical once variation is on', () => {
    // A symmetrical cloud looks like a diagram of a cloud.
    const { lobes } = cloudLobes({ ...CLOUD_DEFAULTS, lobes: 5, variation: 0.35 }, CAKE);
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

  it('reaches exactly the height it was asked for', () => {
    const { lobes, height } = cloudLobes({ ...CLOUD_DEFAULTS, variation: 0 }, CAKE);
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

  it('hugs the wall, so every lump is the same distance from the axis', () => {
    // What a flat plane cannot do: laid against a round cake its middle touches and its ends float.
    const { lobes, thickness } = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'side' }, CAKE);
    const out = lobes.map(l => Math.hypot(l.position.x, l.position.z));
    for (const d of out) expect(d).toBeCloseTo(CAKE.radius + thickness / 2, 6);
  });

  it('keeps the width it was drawn as when bent round the cake', () => {
    // Arc length over radius. A plaque bent round a cake must not become a different amount of
    // fondant to roll — the same rule wrapToWall keeps for a rope.
    const flat = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'board' }, CAKE);
    const wall = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'side' }, CAKE);
    expect(wall.width).toBeCloseTo(flat.width, 6);
  });

  it('turns each lump to face out of the wall', () => {
    // Otherwise the discs are edge-on to the cake and the plaque is invisible from the front.
    const { lobes } = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'side', theta: 0.5 }, CAKE);
    for (const l of lobes) {
      expect(l.rotationY).toBeCloseTo(Math.atan2(l.position.x, l.position.z), 6);
    }
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

  it('counts the standoff against the room across', () => {
    // The footprint is a circle: standing a cloud back leaves it less width, not the same width
    // further away.
    const flat = cloudFitScale({ centerX: 0.6, standoff: 0, width: 1.2, cakeRadius: 1.2 });
    const back = cloudFitScale({ centerX: 0.6, standoff: 0.8, width: 1.2, cakeRadius: 1.2 });
    expect(back).toBeLessThan(flat);
  });
});

describe('the two variants', () => {
  it('gives the flat one a straight bottom and the puff none', () => {
    // A row of circles has a scalloped underside. The reference plaque is cut with a knife.
    expect(cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat' }, CAKE).base).toBeTruthy();
    // A puff standing on a plinth would be a cloud on a shelf.
    expect(cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'puff' }, CAKE).base).toBeNull();
  });

  it('builds both from the same lumps', () => {
    // The variant decides whether they are solid or a silhouette, not what they are — which is why
    // one generator produces both.
    const puff = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'puff', surface: 'board' }, CAKE);
    const flat = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'board' }, CAKE);
    expect(puff.lobes.map(l => l.r)).toEqual(flat.lobes.map(l => l.r));
  });
});

describe('what the baker rolls', () => {
  it('answers in proportions of the cake, never millimetres', () => {
    // A millimetre is a promise about a cake nobody has seen. Same rule as the rainbow's guide.
    const g = cloudGuide(CLOUD_DEFAULTS, CAKE);
    expect(g.widthOfCakeWidth).toBeGreaterThan(0);
    expect(g.widthOfCakeWidth).toBeLessThan(1);
    expect(g.balls).toBe(CLOUD_DEFAULTS.lobes);
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
