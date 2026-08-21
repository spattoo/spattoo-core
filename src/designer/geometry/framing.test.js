import { describe, it, expect } from 'vitest';
import { cakeAimY, cakeAimTarget, cakeMiddleY, cakeStackHeight, cameraDistance, CAKE_SIT_FRAC,
         fitDistance, sitFromSlack, seenHalfHeight } from './framing.js';
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
// The camera stood at a fixed distance and was hand-tuned four times, each tune right for the cake it
// was checked against. Then it was fitted to the cake's BOUNDING SPHERE, which is rotation-proof and
// badly wrong for this shape: a cake with its board is a wide flat disc, so the sphere is far taller
// than the cake and the frame reserves vertical room for empty air. The camera stood too far back and
// the cake floated in the middle of it.
//
// A standing CYLINDER is just as rotation-proof — its silhouette from every azimuth is the same
// rectangle — and it is the shape a cake actually is.
const FOV = 42, WIDE = 2.2, PHONE = 335 / 560;
const ELEV = 34 * Math.PI / 180;          // the studio camera's tilt above the horizon
const ONE_TIER  = { w: 1.8, h: 0.775 };   // board radius; half of board+tier
const THREE_TIER = { w: 1.8, h: 2.155 };

describe('seenHalfHeight', () => {
  it('is just the height when the camera is level with the cake', () => {
    expect(seenHalfHeight(1.8, 0.775, 0)).toBeCloseTo(0.775);
  });

  it('grows as the camera tilts down, because the board swings into view', () => {
    // THE BUG THIS EXISTS FOR. Ignore it and a wide board is exactly what runs off the bottom edge.
    expect(seenHalfHeight(1.8, 0.775, ELEV)).toBeGreaterThan(0.775);
  });

  it('is the width from directly overhead — the cake is then a disc', () => {
    expect(seenHalfHeight(1.8, 0.775, Math.PI / 2)).toBeCloseTo(1.8);
  });
});

describe('fitDistance', () => {
  it('stands further back for a taller cake', () => {
    expect(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE))
      .toBeLessThan(fitDistance(THREE_TIER.w, THREE_TIER.h, ELEV, FOV, WIDE));
  });

  it('stands further back for a wider cake', () => {
    expect(fitDistance(1.8, 0.775, ELEV, FOV, WIDE))
      .toBeLessThan(fitDistance(3.0, 0.775, ELEV, FOV, WIDE));
  });

  it('does not reserve height for a wide flat cake that has none', () => {
    // The sphere fit did exactly that, and it is why the camera ended up too far away. A sphere round
    // a one-tier cake has radius hypot(1.8, 0.775) — much taller than the cake — so anchoring the
    // frame to it wastes the difference. Fitting the real shape must come in closer than that.
    const spherish = Math.hypot(ONE_TIER.w, ONE_TIER.h) / Math.sin((FOV / 2) * Math.PI / 180);
    expect(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE)).toBeLessThan(spherish);
  });

  it('stands FURTHER back on a narrow frame, which is what a phone needs', () => {
    expect(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, PHONE))
      .toBeGreaterThan(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE));
  });

  it('keeps the whole cake in frame, on every shape of viewport and cake', () => {
    // The invariant that matters: at the fitted distance, both the cake's width and its seen height
    // are inside the frame. Checked over the cakes and screens the app actually has.
    const vHalf = (FOV / 2) * Math.PI / 180;
    for (const aspect of [PHONE, 0.8, 1.2, 2.2, 3.0]) {
      for (const c of [ONE_TIER, THREE_TIER, { w: 2.6, h: 0.8 }, { w: 1.4, h: 3.2 }]) {
        const d = fitDistance(c.w, c.h, ELEV, FOV, aspect);
        const hHalf = Math.atan(Math.tan(vHalf) * aspect);
        expect(d * Math.tan(hHalf)).toBeGreaterThanOrEqual(c.w);
        expect(d * Math.tan(vHalf)).toBeGreaterThanOrEqual(seenHalfHeight(c.w, c.h, ELEV));
      }
    }
  });

  it('never divides by zero on an empty or degenerate cake', () => {
    expect(Number.isFinite(fitDistance(0, 0, ELEV, FOV, WIDE))).toBe(true);
    expect(Number.isFinite(fitDistance(1.8, 0.8, ELEV, FOV, 0))).toBe(true);
  });
});

describe('sitFromSlack', () => {
  it('sits the cake below centre when there is room to', () => {
    const seen = seenHalfHeight(ONE_TIER.w, ONE_TIER.h, ELEV);
    const d = fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE);
    expect(sitFromSlack(seen, d, FOV)).toBeGreaterThan(0);
  });

  it('gives up the sit rather than push a tall cake out of frame', () => {
    // A fixed-angle sit went on pushing down however tall the cake got, until the board left the
    // bottom edge — the opposite of what a sit is for. As a share of the slack it cannot.
    const seen = 2.5;
    const tooClose = seen / Math.tan((FOV / 2) * Math.PI / 180);   // cake exactly fills the height
    expect(sitFromSlack(seen, tooClose, FOV)).toBe(0);
    expect(sitFromSlack(seen, tooClose * 0.8, FOV)).toBe(0);
  });

  it('keeps the whole cake inside the frame at the fitted distance', () => {
    const vHalf = (FOV / 2) * Math.PI / 180;
    for (const c of [ONE_TIER, THREE_TIER, { w: 2.6, h: 0.8 }]) {
      const seen = seenHalfHeight(c.w, c.h, ELEV);
      const d = fitDistance(c.w, c.h, ELEV, FOV, WIDE);
      expect(sitFromSlack(seen, d, FOV) + seen).toBeLessThanOrEqual(d * Math.tan(vHalf) + 1e-9);
    }
  });
});
