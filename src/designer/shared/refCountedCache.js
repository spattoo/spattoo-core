// ── Ref-counted, idle-TTL cache for EXPENSIVE per-signature bakes ────────────────────────────────
// Scattered decor mounts one component per instance, and React never shares a `useMemo` across
// component instances — so 24 identical scattered stickers used to bake their relief maps + solid
// geometry 24 times over. Those bakes depend only on a SIGNATURE (image + bake params + scale + …),
// not on the per-instance position, so they can be computed ONCE and the resulting THREE
// textures/geometry SHARED by every mesh (a Texture/BufferGeometry may back many meshes).
//
// Lifetime — "session-lived, not forever": each entry ref-counts its live users. While ANY instance
// is mounted the entry is pinned (never disposed mid-use — sharing a disposed GPU resource would
// break every other mesh using it). When the LAST user unmounts, the entry starts an idle timer; if
// still unused after `ttlMs`, it's disposed and evicted. So a bake survives quick add/remove/re-
// scatter cycles but a genuinely-unused one is reclaimed. The sweep timer runs ONLY while entries are
// awaiting expiry and stops itself once the cache drains — no perpetual timer.
//
// A fresh entry from get() starts on the expiry clock (refs 0) so a render that computes it but never
// commits (a thrown/aborted render) is still reclaimed; retain() (called from a mount effect) pins it.
//
// This is a client-runtime cache (browser, dies with the tab), so setTimeout/Date.now are fine here —
// this is NOT the server in-process-timer case the root CLAUDE.md warns about.
export function makeRefCountedCache({ ttlMs = 120000, dispose = () => {} } = {}) {
  const map = new Map();   // key → { value, refs, disposeAt }
  let timer = null;

  function schedule() {
    if (timer != null) return;
    timer = setTimeout(sweep, ttlMs);
  }
  function sweep() {
    timer = null;
    const now = Date.now();
    let pending = false;
    for (const [key, e] of map) {
      if (e.refs > 0) continue;
      if (now >= e.disposeAt) { try { dispose(e.value); } catch { /* best-effort */ } map.delete(key); }
      else pending = true;
    }
    if (pending) schedule();
  }

  return {
    // Compute-if-absent; returns the shared value. Does NOT change the ref count — pair with retain()
    // in a mount effect. A brand-new entry is on the expiry clock until retained.
    get(key, factory) {
      let e = map.get(key);
      if (!e) { e = { value: factory(), refs: 0, disposeAt: Date.now() + ttlMs }; map.set(key, e); schedule(); }
      return e.value;
    },
    // Pin the entry (a live user mounted). Idempotent-safe under StrictMode double-invoke.
    retain(key) {
      const e = map.get(key);
      if (e) { e.refs++; e.disposeAt = Infinity; }
    },
    // A user unmounted; when the last one leaves, arm the idle timer.
    release(key) {
      const e = map.get(key);
      if (!e) return;
      e.refs = Math.max(0, e.refs - 1);
      if (e.refs === 0) { e.disposeAt = Date.now() + ttlMs; schedule(); }
    },
  };
}
