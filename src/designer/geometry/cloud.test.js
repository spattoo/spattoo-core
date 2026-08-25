import { describe, it, expect } from 'vitest';
import {
  CLOUD_DEFAULTS, cloudLobes, cloudPlacement, cloudBaseY, cloudGuide, cloudOutline,
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

// ── Size is the author's, position is the author's, and neither moves the other ─────────────────
// A cloud used to SHRINK as it was dragged toward the rim, on a fit solved so nothing overhung.
// Nobody asked for that: there is a size control, which is what a size control is for, and a real
// fondant cloud hangs over the edge — the reference photo shows one doing it. The fit also dragged
// a position cap in behind it, because at the rim it solved to zero and deleted the cloud.
//
// Both are gone, and these pin them staying gone.
describe('dragging a cloud does not resize it', () => {
  it('is the same size wherever it is put', () => {
    const at = extra => cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', ...extra }, CAKE);
    const middle = at({ standoff: 0 });
    for (const extra of [{ standoff: 0.5 }, { standoff: 0.95 }, { standoff: 1.4 },
                         { offsetX: 0.9 }, { yaw: Math.PI / 2, standoff: 0.9 }]) {
      const there = at(extra);
      expect(there.width).toBeCloseTo(middle.width, 9);
      expect(there.height).toBeCloseTo(middle.height, 9);
      expect(there.thickness).toBeCloseTo(middle.thickness, 9);
    }
  });

  it('lets a cloud at the rim hang over it, like fondant does', () => {
    // The behaviour the shrink existed to prevent. It is not a bug — it is what the reference looks
    // like, and the baker moves or resizes it if they disagree.
    const { lobes } = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', standoff: 1 }, CAKE);
    const reach = Math.max(...lobes.map(l => Math.hypot(l.position.x, l.position.z) + l.r));
    expect(reach).toBeGreaterThan(CAKE.radius);
  });

  it('does not cap how far out it can be dragged', () => {
    // The cap only existed to stop the fit solving to zero. With no fit it has nothing to protect,
    // and a drag that silently stops short of where the pointer went is its own bug.
    const out = s => {
      const { lobes } = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', standoff: s }, CAKE);
      return lobes.reduce((a, l) => a + l.position.z, 0) / lobes.length;
    };
    expect(out(1.3)).toBeGreaterThan(out(1.0));
    expect(out(1.0)).toBeGreaterThan(out(0.7));
  });

  it('still scales when the SIZE is changed, which is the control that does it', () => {
    const one = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', scale: 1 }, CAKE);
    const two = cloudPlacement({ ...CLOUD_DEFAULTS, surface: 'top', scale: 2 }, CAKE);
    expect(two.width / one.width).toBeCloseTo(2, 6);
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

// ── The two variants must land in the SAME place from the same numbers ──────────────────────────
// They do not share a placement path: the puff spins its balls round the cake, the flat one is a
// single extruded sheet the renderer positions. So a number that reaches one and not the other is
// invisible in the geometry and obvious on screen — `yaw` was dropped from the sheet, and a flat
// cloud could only move front-to-back however it was dragged, while its selection box (computed
// from the lobes) travelled correctly and drifted away from it.
describe('a flat cloud goes where a puffy one goes', () => {
  const CAKE_T = { radius: 1.2, topY: 1.55, boardY: 0.1 };

  // Where the renderer puts the sheet: a translate, and nothing else. The carrying-round-the-cake is
  // done in the geometry now, so `sheet.x`/`sheet.z` are already the final place.
  const sheetCentre = sheet => ({ x: sheet.x, z: sheet.z });
  const lobesCentre = lobes => ({
    x: (Math.min(...lobes.map(l => l.position.x)) + Math.max(...lobes.map(l => l.position.x))) / 2,
    z: (Math.min(...lobes.map(l => l.position.z)) + Math.max(...lobes.map(l => l.position.z))) / 2,
  });

  it('carries the sheet round the cake, not only the balls', () => {
    for (const yaw of [0, 0.7, Math.PI, 4.5]) {
      const pl = cloudPlacement({ ...CLOUD_DEFAULTS, variant: 'flat', surface: 'top', yaw, standoff: 0.6 }, CAKE_T);
      const a = sheetCentre(pl.sheet), b = lobesCentre(pl.lobes);
      // Within a hundredth, not exactly: the lumps are deliberately unequal, so their bounding
      // centre sits a hair off the sheet's origin. What matters is that both TURN.
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.05);
    }
  });

  it('moves on BOTH axes, not just front to back', () => {
    // The symptom, stated as a number: turning the yaw must change x, or the cloud is on a rail.
    const at = yaw => sheetCentre(cloudPlacement(
      { ...CLOUD_DEFAULTS, variant: 'flat', surface: 'top', yaw, standoff: 0.6 }, CAKE_T).sheet);
    expect(Math.abs(at(Math.PI / 2).x - at(0).x)).toBeGreaterThan(0.5);
  });
});

// ── A flat cloud is a sticker: it slides, it does not turn ──────────────────────────────────────
// The two variants are different objects and only one of them has a front. A puff is a bunch of
// balls — turn it and it reads the same, and it MUST turn, or the side that bulges toward you goes
// on pointing at the front while the cloud sits round the back. A flat one is a cut sheet: a quarter
// turn shows you its thin edge, a half turn shows you its back, and neither is ever wanted.
describe('a flat cloud faces the front wherever it is dragged', () => {
  const CAKE_T = { radius: 1.2, topY: 1.55, boardY: 0.1 };
  const YAWS = [0, 0.7, Math.PI / 2, Math.PI, 4.5, 6.0];
  const place = (variant, yaw, standoff = 0.6) =>
    cloudPlacement({ ...CLOUD_DEFAULTS, variant, surface: 'top', yaw, standoff }, CAKE_T);

  it('never turns the sheet, however far round it goes', () => {
    for (const yaw of YAWS) {
      for (const l of place('flat', yaw).lobes) expect(l.rotationY).toBe(0);
    }
  });

  it('does turn a puffy one, which has no front to keep', () => {
    for (const yaw of YAWS) {
      for (const l of place('puff', yaw).lobes) expect(l.rotationY).toBeCloseTo(yaw, 6);
    }
  });

  it('keeps its shape while it travels — the lumps hold their arrangement', () => {
    // A rigid move, not a reshape: every lump's offset from the cloud's middle is the same at every
    // yaw. Without this, "does not turn" could be satisfied by flattening it.
    const offsets = yaw => {
      const { lobes } = place('flat', yaw);
      const mx = lobes.reduce((a, l) => a + l.position.x, 0) / lobes.length;
      const mz = lobes.reduce((a, l) => a + l.position.z, 0) / lobes.length;
      return lobes.map(l => [l.position.x - mx, l.position.z - mz]);
    };
    const first = offsets(0);
    for (const yaw of YAWS) {
      offsets(yaw).forEach(([x, z], i) => {
        expect(x).toBeCloseTo(first[i][0], 6);
        expect(z).toBeCloseTo(first[i][1], 6);
      });
    }
  });

});
