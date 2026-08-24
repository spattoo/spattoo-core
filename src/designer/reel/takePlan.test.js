import { describe, it, expect } from 'vitest';
import { planTake, medianOf, progressAt, RUNGS, SLOW_MS } from './takePlan.js';

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
