import { describe, it, expect, vi } from 'vitest';
import { ediblePrintsChanged, onEdiblePrintsChanged } from './ediblePrintsBus.js';

// ── Why this exists ─────────────────────────────────────────────────────────────────────────────
// A baker made an edible print from inside X-Ray, was told "it is in your uploads", closed X-Ray,
// and "Print & cut-outs" in order details was still not there. The data was correct the whole time
// — the launcher had fetched its list once, on mount, and X-Ray is a takeover ABOVE that still
// mounted component, so closing it remounts nothing.
//
// ⚠️ THE FAILURE IS INVISIBLE FROM THE BAKER'S SIDE. A gate that is stale looks exactly like a
// print that was never made, and they have already paid credits for it.
describe('edible prints bus', () => {
  it('notifies every listener', () => {
    const a = vi.fn(); const b = vi.fn();
    const offA = onEdiblePrintsChanged(a);
    const offB = onEdiblePrintsChanged(b);
    ediblePrintsChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA(); offB();
  });

  it('stops notifying after unsubscribe — the effect cleanup must actually detach', () => {
    const fn = vi.fn();
    const off = onEdiblePrintsChanged(fn);
    off();
    ediblePrintsChanged();
    expect(fn).not.toHaveBeenCalled();
  });

  // One listener throwing must not stop the others: the launcher and anything added later are
  // independent readers of the same event.
  it('one broken listener does not stop the rest', () => {
    const good = vi.fn();
    const offBad  = onEdiblePrintsChanged(() => { throw new Error('boom'); });
    const offGood = onEdiblePrintsChanged(good);
    expect(() => ediblePrintsChanged()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad(); offGood();
  });

  it('carries no payload — listeners re-read from the server', () => {
    // image_url is composed by the API from the storage key and does not exist on the row the
    // generate call returns, so a client-assembled print row would be missing its picture.
    const fn = vi.fn();
    const off = onEdiblePrintsChanged(fn);
    ediblePrintsChanged({ id: 'print:1' });
    expect(fn).toHaveBeenCalledWith();
    off();
  });
});
