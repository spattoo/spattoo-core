import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeRefCountedCache } from './refCountedCache.js';

describe('makeRefCountedCache — share expensive bakes, reclaim when idle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('computes a signature ONCE and shares it across users', () => {
    const factory = vi.fn((k) => ({ id: k }));
    const c = makeRefCountedCache({ ttlMs: 1000 });
    const a = c.get('k', () => factory('k'));
    const b = c.get('k', () => factory('k'));   // second instance
    expect(factory).toHaveBeenCalledTimes(1);   // baked once
    expect(a).toBe(b);                            // same shared object
  });

  it('pins while any user is mounted, disposes only after the last leaves + TTL', () => {
    const dispose = vi.fn();
    const c = makeRefCountedCache({ ttlMs: 1000, dispose });
    const v = c.get('k', () => ({ id: 'k' }));
    c.retain('k'); c.retain('k');   // two instances mounted

    c.release('k');                 // one unmounts — still pinned by the other
    vi.advanceTimersByTime(5000);
    expect(dispose).not.toHaveBeenCalled();

    c.release('k');                 // last one unmounts — idle timer arms
    vi.advanceTimersByTime(999);
    expect(dispose).not.toHaveBeenCalled();   // not yet
    vi.advanceTimersByTime(1);
    expect(dispose).toHaveBeenCalledWith(v);  // reclaimed after TTL
  });

  it('a re-scatter within the TTL window keeps the bake (no dispose, no recompute)', () => {
    const factory = vi.fn(() => ({ id: 'k' }));
    const dispose = vi.fn();
    const c = makeRefCountedCache({ ttlMs: 1000, dispose });
    c.get('k', factory); c.retain('k');
    c.release('k');                 // idle timer armed
    vi.advanceTimersByTime(500);
    c.get('k', factory); c.retain('k');   // re-used before expiry
    vi.advanceTimersByTime(5000);
    expect(dispose).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);   // never re-baked
  });

  it('after eviction, the next get recomputes', () => {
    const factory = vi.fn(() => ({ id: 'k' }));
    const c = makeRefCountedCache({ ttlMs: 1000, dispose: () => {} });
    c.get('k', factory); c.retain('k'); c.release('k');
    vi.advanceTimersByTime(1000);   // evicted
    c.get('k', factory);            // fresh bake
    expect(factory).toHaveBeenCalledTimes(2);
  });

  /* ⚠️ TTL MEANS TTL, EVEN WHEN THE ENTRY IS DISCARDED YOUNG — and the test above passes without
     this one holding, which is how the gap survived. There it releases at t=5000, long after the
     first sweep has run, found the entry pinned and let the timer DIE; the next release arms a
     fresh, exact interval. The common case in the app is the opposite shape — a baker tries a
     decoration and clears the cake a few seconds later — and there the sweep that was armed when
     the entry was CREATED fires while the entry still has grace left, and the texture waits out a
     second full TTL before anything looks at it again.

     Measured in the designer harness before this was fixed: two stickers, New cake nine seconds
     after placing them, and the renderer still held all 13 MB at t+193s. They went back at t+253s.
     Four minutes for a two-minute grace. */
  it('disposes one TTL after the last release, not two, when the entry is released young', () => {
    const dispose = vi.fn();
    const c = makeRefCountedCache({ ttlMs: 1000, dispose });
    c.get('k', () => ({ id: 'k' }));   // t=0 — the entry is created here, and the sweep armed
    c.retain('k');
    vi.advanceTimersByTime(100);
    c.release('k');                    // t=100 — grace runs to t=1100
    vi.advanceTimersByTime(999);       // t=1099 — the sweep at t=1000 must not have evicted it...
    expect(dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);         // t=1100 — ...and must not have pushed it to t=2000 either
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  /* Several entries released at different moments each wait their OWN grace, rather than every one
     of them landing on whichever tick the first entry happened to arm. */
  it('each entry expires on its own clock', () => {
    const dispose = vi.fn();
    const c = makeRefCountedCache({ ttlMs: 1000, dispose });
    c.get('a', () => 'A'); c.retain('a');
    c.get('b', () => 'B'); c.retain('b');
    vi.advanceTimersByTime(100);
    c.release('a');                    // grace to t=1100
    vi.advanceTimersByTime(300);
    c.release('b');                    // grace to t=1400
    vi.advanceTimersByTime(700);       // t=1100
    expect(dispose.mock.calls.map(x => x[0])).toEqual(['A']);
    vi.advanceTimersByTime(300);       // t=1400
    expect(dispose.mock.calls.map(x => x[0])).toEqual(['A', 'B']);
  });

  /* The timer must still STOP once nothing is waiting — the header's "no perpetual timer" promise.
     An implementation that re-arms unconditionally would spin for the life of the tab. */
  it('stops its timer once the cache drains', () => {
    const c = makeRefCountedCache({ ttlMs: 1000, dispose: () => {} });
    c.get('k', () => ({ id: 'k' })); c.retain('k'); c.release('k');
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an entry never retained (a thrown render) is still reclaimed after TTL', () => {
    const dispose = vi.fn();
    const c = makeRefCountedCache({ ttlMs: 1000, dispose });
    c.get('k', () => ({ id: 'k' }));   // computed in render, never mounted
    vi.advanceTimersByTime(1000);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
