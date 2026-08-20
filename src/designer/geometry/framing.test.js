import { describe, it, expect } from 'vitest';
import { cakeAimY, cakeAimTarget, cakeMiddleY, cakeStackHeight, cameraDistance, CAKE_SIT_FRAC,
         fitDistance, sitFromSlack } from './framing.js';
import { BOTTOM_H, TIER_HEIGHT_STEP, CAMERA_POSITION, CAMERA_POSITION_MOBILE } from '../constants.js';

// The three cakes the old constant could not serve at once.
const ONE   = [BOTTOM_H];
const TWO   = [BOTTOM_H, BOTTOM_H - TIER_HEIGHT_STEP];
const THREE = [BOTTOM_H, BOTTOM_H - TIER_HEIGHT_STEP, BOTTOM_H - 2 * TIER_HEIGHT_STEP];

describe('cakeStackHeight', () => {
  it('sums the tiers', () => {
    expect(cakeStackHeight(TWO)).toBeCloseTo(BOTTOM_H * 2 - TIER_HEIGHT_STEP);
  });

  it('falls back for a cake with no tiers, rather than collapsing to zero', () => {
    // A camera aimed at y=0 stares at the floor, and swings up when the first tier lands.
    expect(cakeStackHeight([])).toBeGreaterThan(0);
    expect(cakeStackHeight(null)).toBeGreaterThan(0);
  });

  it('ignores a tier whose height is missing rather than returning NaN', () => {
    expect(cakeStackHeight([BOTTOM_H, undefined, null, NaN])).toBeCloseTo(BOTTOM_H);
  });
});

describe('cakeMiddleY', () => {
  it('counts the board — it is part of the cake that is being framed', () => {
    expect(cakeMiddleY(ONE)).toBeCloseTo((0.1 + BOTTOM_H) / 2);
  });

  it('rises with the cake', () => {
    expect(cakeMiddleY(ONE)).toBeLessThan(cakeMiddleY(TWO));
    expect(cakeMiddleY(TWO)).toBeLessThan(cakeMiddleY(THREE));
  });
});

// The angle the aim sits above the cake's middle, which is what the eye actually reads.
const sitAngle = (tiers, cam) =>
  Math.atan((cakeAimY(tiers, cam) - cakeMiddleY(tiers)) / cameraDistance(cam)) * 180 / Math.PI;

describe('cameraDistance', () => {
  it('is the length of the camera position — a cake stands at the origin', () => {
    expect(cameraDistance([0, 3, 4])).toBeCloseTo(5);
  });

  it('never returns zero, so the sit can always be divided by it', () => {
    expect(cameraDistance([0, 0, 0])).toBeGreaterThan(0);
    expect(cameraDistance(null)).toBeGreaterThan(0);
  });
});

describe('cakeAimY', () => {
  it('aims ABOVE the middle, which is what sits the cake low in frame instead of floating it', () => {
    for (const tiers of [ONE, TWO, THREE]) {
      expect(cakeAimY(tiers, CAMERA_POSITION)).toBeGreaterThan(cakeMiddleY(tiers));
    }
  });

  it('sits every cake by the same ANGLE — only the middle moves', () => {
    expect(sitAngle(ONE, CAMERA_POSITION)).toBeCloseTo(sitAngle(THREE, CAMERA_POSITION));
  });

  it('sits the cake the same on a PHONE, where the camera is further out', () => {
    // The bug this replaced: a world-space lift tuned on the desktop camera covered a quarter less
    // of the frame on the phone's, which sits 1.33x further back — so the cake read as floating on a
    // phone and correct on a desktop. As an angle, both cameras get the same shot.
    expect(cameraDistance(CAMERA_POSITION_MOBILE)).toBeGreaterThan(cameraDistance(CAMERA_POSITION));
    expect(sitAngle(ONE, CAMERA_POSITION_MOBILE)).toBeCloseTo(sitAngle(ONE, CAMERA_POSITION));
    // …which means the phone's aim is higher in world terms, not the same number.
    expect(cakeAimY(ONE, CAMERA_POSITION_MOBILE)).toBeGreaterThan(cakeAimY(ONE, CAMERA_POSITION));
  });

  it('aims higher at a taller cake — the whole point of not using a constant', () => {
    expect(cakeAimY(ONE, CAMERA_POSITION)).toBeLessThan(cakeAimY(TWO, CAMERA_POSITION));
    expect(cakeAimY(TWO, CAMERA_POSITION)).toBeLessThan(cakeAimY(THREE, CAMERA_POSITION));
  });

  it('reproduces the old framing on a one-tier cake at the desktop camera', () => {
    // The hand-tuned constant was [0, 1.55, 0]. On the cake this app makes most, and the camera it
    // was tuned against, the rule must land on the same spot — otherwise "keep the old look" was
    // not honoured. CAKE_SIT_FRAC is derived from exactly this.
    expect(cakeAimY(ONE, CAMERA_POSITION)).toBeCloseTo(1.55, 1);
    expect(CAKE_SIT_FRAC).toBeGreaterThan(0);
  });

  it('no longer aims over the top of a tall cake, which is what cut the top tier off', () => {
    const top = 0.1 + cakeStackHeight(THREE);
    for (const cam of [CAMERA_POSITION, CAMERA_POSITION_MOBILE]) {
      expect(cakeAimY(THREE, cam)).toBeLessThan(top);
    }
  });
});

describe('cakeAimTarget', () => {
  it('is the aim on the Y axis, centred in X and Z', () => {
    expect(cakeAimTarget(TWO, CAMERA_POSITION)).toEqual([0, cakeAimY(TWO, CAMERA_POSITION), 0]);
  });
});

// ── Fitting the cake to the frame ───────────────────────────────────────────────────────────────
// The camera stood at a fixed distance and was hand-tuned four times, each tune right for the cake
// it was checked against: in so a single tier was not a speck, out so a three-tier kept its top, in
// again. Two tiers plus a tall topper — the tallest thing the app makes — then ran its board off the
// bottom of the screen. A constant cannot answer this, so the distance is measured from the cake.
describe('fitDistance', () => {
  const FOV = 42, WIDE = 1.4, PHONE = 335 / 560;

  it('stands further back for a bigger cake — the whole point', () => {
    expect(fitDistance(1.4, FOV, WIDE)).toBeLessThan(fitDistance(2.5, FOV, WIDE));
  });

  it('scales with the cake, so every cake gets the same framing', () => {
    // Twice the cake, twice the distance: the cake occupies the same share of the frame either way.
    expect(fitDistance(3, FOV, WIDE) / fitDistance(1.5, FOV, WIDE)).toBeCloseTo(2);
  });

  it('stands FURTHER back on a narrow frame, which is what a phone needs', () => {
    // A tall narrow viewport is limited by its width, so the same cake needs more distance there.
    // Without this a camera fitted on a desktop crops the board off the sides of a phone.
    expect(fitDistance(1.8, FOV, PHONE)).toBeGreaterThan(fitDistance(1.8, FOV, WIDE));
  });

  it('leaves air around the cake rather than fitting it edge to edge', () => {
    const r = 2;
    const half = (FOV / 2) * Math.PI / 180;
    expect(fitDistance(r, FOV, WIDE)).toBeGreaterThan(r / Math.sin(half));
  });

  it('never divides by zero on an empty or degenerate cake', () => {
    expect(Number.isFinite(fitDistance(0, FOV, WIDE))).toBe(true);
    expect(Number.isFinite(fitDistance(1.5, FOV, 0))).toBe(true);
  });
});

describe('sitFromSlack', () => {
  const FOV = 42;

  it('sits the cake below centre when there is room to', () => {
    const r = 1.5, d = fitDistance(r, FOV, 1.4);
    expect(sitFromSlack(r, d, FOV)).toBeGreaterThan(0);
  });

  it('gives up the sit rather than push a tall cake out of frame', () => {
    // THE BUG. A fixed-angle sit went on pushing down however tall the cake got, until the board
    // left the bottom edge — which is the opposite of what a sit is for. As a share of the slack it
    // cannot: no slack, no sit.
    //
    // "Fills the frame" is d·tan(halfFov) = r — the half-frame AT THE CAKE equals the cake. (Not
    // r/sin, which is where a sphere touches the frustum's sloping sides; measured at its centre
    // plane that one still leaves a few percent, and this test asserted otherwise at first.)
    const r = 2.5;
    const tooClose = r / Math.tan((FOV / 2) * Math.PI / 180);
    expect(sitFromSlack(r, tooClose, FOV)).toBe(0);
    expect(sitFromSlack(r, tooClose * 0.8, FOV)).toBe(0);   // closer still: still no sit, never negative
  });

  it('never returns a negative sit, which would lift the cake off the top instead', () => {
    expect(sitFromSlack(5, 1, FOV)).toBe(0);
  });

  it('keeps the whole cake inside the frame at the fitted distance', () => {
    // The real invariant: aim + the cake's own radius must stay within the half-frame, or something
    // goes off an edge. Checked across every cake size the app can make.
    for (const r of [1.2, 1.5, 2.0, 2.5, 3.0, 4.0]) {
      const d = fitDistance(r, FOV, 1.4);
      const halfFrame = d * Math.tan((FOV / 2) * Math.PI / 180);
      expect(sitFromSlack(r, d, FOV) + r).toBeLessThanOrEqual(halfFrame + 1e-9);
    }
  });
});
