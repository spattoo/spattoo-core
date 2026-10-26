import { describe, it, expect } from 'vitest';
import { secondsLeft, clampDelay, DELAY_MAX, DELAY_DEFAULT } from './takeDelay.js';

describe('the head start before a take', () => {
  /* ⚠️ THE COUNT NEVER SHOWS ZERO WHILE IT IS STILL WAITING. `Math.floor` does, for a whole second,
     and a screen reading "0" that has not started yet looks broken at the one moment the baker is
     staring at it. Ceiling counts 3, 2, 1 and then stops being drawn at all. */
  it('counts 3, 2, 1 and never sits on a zero', () => {
    expect(secondsLeft(3000)).toBe(3);
    expect(secondsLeft(2999)).toBe(3);
    expect(secondsLeft(2001)).toBe(3);
    expect(secondsLeft(2000)).toBe(2);
    expect(secondsLeft(1)).toBe(1);
    // Only a finished wait reads zero, which is the caller's signal to stop drawing it.
    expect(secondsLeft(0)).toBe(0);
    expect(secondsLeft(-50)).toBe(0);
  });

  it('shows every whole second once, and no second twice', () => {
    const seen = [];
    for (let ms = 5000; ms > 0; ms -= 10) {
      const s = secondsLeft(ms);
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    expect(seen).toEqual([5, 4, 3, 2, 1]);
  });

  it('treats rubbish as no delay rather than as NaN', () => {
    for (const bad of [NaN, undefined, null, 'x', {}]) {
      expect(secondsLeft(bad)).toBe(0);
      expect(clampDelay(bad)).toBe(0);
    }
  });

  it('keeps a delay inside what the panel offers', () => {
    expect(clampDelay(99)).toBe(DELAY_MAX);
    expect(clampDelay(-3)).toBe(0);
    expect(clampDelay(7)).toBe(7);
  });

  /* ⚠️ OFF BY DEFAULT. Every take before this one started when you pressed Start, and a delay that
     arrives switched on would silently change what that button does. */
  it('is off until someone asks for it', () => {
    expect(DELAY_DEFAULT).toBe(0);
    expect(clampDelay(DELAY_DEFAULT)).toBe(0);
  });
});
