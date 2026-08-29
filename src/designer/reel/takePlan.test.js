import { describe, it, expect } from 'vitest';
import { planTake, medianOf, progressAt, elevationAt, RUNGS, SLOW_MS, POLE_MARGIN } from './takePlan.js';
import { angleByKey } from '../photo/photoAngles.js';

describe('planTake', () => {
  it('keeps full resolution on a device that sustains the shot', () => {
    expect(planTake(9)).toMatchObject({ width: 1080, height: 1920, demoted: false });
    expect(planTake(16.7)).toMatchObject({ width: 1080, demoted: false });
  });

  it('drops a rung when the device cannot keep up', () => {
    expect(planTake(34)).toMatchObject({ width: 720, height: 1280, demoted: true });
  });

  it('does NOT demote a device it failed to measure', () => {
    // A probe that could not run is not evidence of a slow device. Guessing downward would quietly
    // halve everybody's resolution the day the probe breaks — the worse of the two bugs, and the
    // one nobody would notice.
    for (const bad of [null, undefined, NaN, Infinity]) {
      expect(planTake(bad)).toMatchObject({ width: 1080, demoted: false });
    }
  });

  it('stops at 720p rather than inventing a third rung', () => {
    // Below this the video stops being worth posting, and a reel nobody posts is not a cheaper
    // success — it is a failure that took longer.
    expect(RUNGS).toHaveLength(2);
    expect(planTake(500)).toMatchObject({ width: 720, demoted: true });
  });

  it('treats the threshold itself as fast enough', () => {
    expect(planTake(SLOW_MS).demoted).toBe(false);
    expect(planTake(SLOW_MS + 0.1).demoted).toBe(true);
  });

  it('keeps both rungs 9:16, because the whole format depends on it', () => {
    for (const r of RUNGS) expect(+(r.width / r.height).toFixed(3)).toBe(0.563);
  });
});

describe('medianOf', () => {
  it('ignores the one slow frame instead of being dragged by it', () => {
    // The frame after a resize pays for the drawing buffer's reallocation, and any frame can absorb
    // a garbage collection. A mean of these is 25.5 — over the threshold — and would demote a
    // device that renders in 10ms.
    const samples = [10, 11, 10, 12, 104];
    expect(medianOf(samples)).toBe(11);
    expect(planTake(medianOf(samples)).demoted).toBe(false);
  });

  it('averages the middle pair on an even count', () => {
    expect(medianOf([10, 12, 14, 20])).toBe(13);
  });

  it('returns null rather than NaN when there is nothing to measure', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([NaN, Infinity])).toBeNull();
    // …and null means "unmeasured", which planTake must not read as slow.
    expect(planTake(medianOf([])).demoted).toBe(false);
  });
});

describe('progressAt', () => {
  it('reads the shot off the clock, so the length is the length', () => {
    expect(progressAt(0, 4.5)).toBe(0);
    expect(progressAt(2250, 4.5)).toBe(0.5);
    expect(progressAt(4500, 4.5)).toBe(1);
  });

  it('clamps rather than overrunning when a frame lands late', () => {
    // The last frame almost never lands exactly on the duration. Past the end it must hold at 1, or
    // the easing runs off its domain and the cake keeps turning past its start angle — which is
    // precisely the seam the out-and-back exists to remove.
    expect(progressAt(4600, 4.5)).toBe(1);
    expect(progressAt(99999, 4.5)).toBe(1);
    expect(progressAt(-5, 4.5)).toBe(0);
  });

  it('gives a slow device the same shot, in fewer frames', () => {
    // 30fps and 60fps disagree about how many frames a 3s take contains, and agree exactly about
    // where the camera is at any moment in it. That is the whole point: duration and motion are
    // what the baker chose, frame count is the machine's business.
    const at = fps => Array.from({ length: 3 * fps + 1 }, (_, i) => progressAt(i * (1000 / fps), 3));
    const fast = at(60), slow = at(30);
    expect(fast[fast.length - 1]).toBe(1);
    expect(slow[slow.length - 1]).toBe(1);
    // Same moment in time, same progress, whatever the cadence.
    expect(progressAt(1500, 3)).toBe(0.5);
    expect(slow[45]).toBeCloseTo(fast[90], 10);
  });
});

// ── The take that shows the top ──────────────────────────────────────────────────────────────────
// Every take used to hold `start.phi` for its whole length — only the azimuth swept — so no reel
// could show the top of a cake. A single-tier decorated on its lid is nearly invisible from any
// standing angle, and the still-photo panel has had an angle for exactly that cake since it shipped.
const DEG = Math.PI / 180;
const LEVEL = 72 * DEG;                     // roughly where a baker leaves the camera
const TOP   = angleByKey('above').phi * DEG;

describe('elevationAt', () => {
  it('holds the framed height when a take does not ask to rise', () => {
    // The old behaviour, to the digit: without a target, nothing about the height changes across
    // the whole take. This is the assertion that says the default shot is untouched.
    for (const eased of [0, 0.25, 0.5, 0.75, 1]) {
      expect(elevationAt(LEVEL, eased, null)).toBe(LEVEL);
    }
  });

  it('starts on the baker\'s framing and ends looking down', () => {
    expect(elevationAt(LEVEL, 0, TOP)).toBeCloseTo(LEVEL, 10);
    expect(elevationAt(LEVEL, 1, TOP)).toBeCloseTo(TOP, 10);
  });

  it('rises to the SAME height the photo panel calls "From above"', () => {
    // Borrowed, not chosen. Two numbers for "looking down at a cake" would drift the first time
    // either was adjusted, and only one of them would get the adjustment.
    expect(angleByKey('above').phi).toBe(26);
    expect(elevationAt(LEVEL, 1, TOP)).toBeCloseTo(26 * DEG, 10);
  });

  it('climbs steadily, never overshooting either end', () => {
    let prev = elevationAt(LEVEL, 0, TOP);
    for (let i = 1; i <= 20; i++) {
      const phi = elevationAt(LEVEL, i / 20, TOP);
      expect(phi).toBeLessThanOrEqual(prev + 1e-12);      // phi DECREASES as the camera rises
      expect(phi).toBeGreaterThanOrEqual(TOP - 1e-12);
      expect(phi).toBeLessThanOrEqual(LEVEL + 1e-12);
      prev = phi;
    }
  });

  it('comes back down on an out-and-back, so the loop still has no seam', () => {
    // The lift rides the SAME eased phase as the arc and the dolly, so this drives it through the
    // real curve rather than asserting against a hand-picked number. If the height did not come
    // home with the phase, a ping-pong reel would jump on elevation at the loop point even with the
    // angle and the distance matched — the one seam the out-and-back exists to remove.
    // (Mirrors outAndBack/smootherstep in TakeDirector, which are not exported.)
    const smootherstep = t => t * t * t * (t * (t * 6 - 15) + 10);
    const OUT = 0.4;
    const outAndBack = t => t <= OUT
      ? smootherstep(t / OUT)
      : smootherstep(1 - (t - OUT) / (1 - OUT));

    const at = t => elevationAt(LEVEL, outAndBack(t), TOP);
    expect(at(0)).toBeCloseTo(LEVEL, 10);        // starts on the baker's framing
    expect(at(OUT)).toBeCloseTo(TOP, 10);        // highest at the turnaround, not at the end
    expect(at(1)).toBeCloseTo(LEVEL, 10);        // and home again, which is the seam
    expect(at(1)).toBeCloseTo(at(0), 10);
  });

  it('never reaches either pole, whatever it is asked for', () => {
    // ⚠️ At phi 0 the camera sits on the very axis it looks down: up and view become parallel and
    // the view matrix degenerates — the frame flips or blanks depending on the driver. Asking for
    // straight overhead must come back short of it, not produce it.
    expect(elevationAt(LEVEL, 1, 0)).toBeCloseTo(POLE_MARGIN, 10);
    expect(elevationAt(LEVEL, 1, -1)).toBeCloseTo(POLE_MARGIN, 10);
    expect(elevationAt(LEVEL, 1, Math.PI)).toBeCloseTo(Math.PI - POLE_MARGIN, 10);
    expect(elevationAt(LEVEL, 1, 99)).toBeCloseTo(Math.PI - POLE_MARGIN, 10);
  });

  it('guards a camera the baker had already dragged to a pole', () => {
    // The start is theirs, not ours — OrbitControls can leave it very high. Clamping only the
    // target would let the first frames of a take sit somewhere the last frame is forbidden.
    expect(elevationAt(0, 0, TOP)).toBeCloseTo(POLE_MARGIN, 10);
    expect(elevationAt(Math.PI, 0, TOP)).toBeCloseTo(Math.PI - POLE_MARGIN, 10);
  });

  it('just eases toward the target when the camera already looks down', () => {
    // Somebody who has already dragged overhead and then asks to rise: the move is small or
    // downward, and must stay well-defined rather than inverting or jumping.
    const high = 20 * DEG;
    expect(elevationAt(high, 0, TOP)).toBeCloseTo(high, 10);
    expect(elevationAt(high, 1, TOP)).toBeCloseTo(TOP, 10);
    expect(elevationAt(high, 0.5, TOP)).toBeCloseTo((high + TOP) / 2, 10);
  });
});
