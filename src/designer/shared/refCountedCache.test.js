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

  it('an entry never retained (a thrown render) is still reclaimed after TTL', () => {
    const dispose = vi.fn();
    const c = makeRefCountedCache({ ttlMs: 1000, dispose });
    c.get('k', () => ({ id: 'k' }));   // computed in render, never mounted
    vi.advanceTimersByTime(1000);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
