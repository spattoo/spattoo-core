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
// ⚠️ `ttlMs` AFTER THAT ENTRY WAS RELEASED — not `ttlMs` after some other entry armed the shared
// timer. One timer serves the whole cache, so it has to be aimed at the earliest deadline rather
// than set to a flat interval; see the note on schedule() for what that cost before it was. It is
// invisible in a test that releases late, and doubled the real grace for everything else.
//
// A fresh entry from get() starts on the expiry clock (refs 0) so a render that computes it but never
// commits (a thrown/aborted render) is still reclaimed; retain() (called from a mount effect) pins it.
//
// This is a client-runtime cache (browser, dies with the tab), so setTimeout/Date.now are fine here —
// this is NOT the server in-process-timer case the root CLAUDE.md warns about.
export function makeRefCountedCache({ ttlMs = 120000, dispose = () => {} } = {}) {
  const map = new Map();   // key → { value, refs, disposeAt }
  let timer = null;

  /* ⚠️ ARMED FOR THE EARLIEST DEADLINE, NOT FOR A FLAT INTERVAL, and that distinction is the whole
     of this function. One timer serves the whole cache, so waking it after `ttlMs` means waking it
     `ttlMs` after whatever last armed it — which has nothing to do with when the next entry is
     actually due. An entry released soon after it was created would be looked at while it still had
     grace left, found not-yet-expired, and then wait out ANOTHER full interval.

     That is not a rounding error: it doubled the real grace in exactly the case that matters.
     Measured in the designer harness — two stickers placed, New cake nine seconds later — the
     renderer still held all 13 MB at t+193s and gave it back at t+253s. Four minutes for a
     two-minute grace, and the faster a baker churns through decorations the more of them overlap.

     Sandeep found it by asking the right question of the feature above: *"are we handling it only
     on the removal event? then we may not be completley safe."* The answer was that unmount covers
     more than removal does — and that what it covers, it was covering twice as slowly as it said. */
  function schedule() {
    if (timer != null) clearTimeout(timer);
    let soonest = Infinity;
    for (const e of map.values()) if (e.refs === 0 && e.disposeAt < soonest) soonest = e.disposeAt;
    // Nothing is waiting: leave the timer off. The header's promise — no perpetual timer — is this
    // line, and refCountedCache.test.js holds it.
    if (soonest === Infinity) { timer = null; return; }
    timer = setTimeout(sweep, Math.max(0, soonest - Date.now()));
  }
  function sweep() {
    timer = null;
    const now = Date.now();
    for (const [key, e] of map) {
      if (e.refs > 0) continue;
      if (now >= e.disposeAt) { try { dispose(e.value); } catch { /* best-effort */ } map.delete(key); }
    }
    // Re-arm from what is actually left rather than from a flag: an entry that was RETAINED again
    // while the timer was running is no longer waiting, and a flag computed during the walk above
    // would have to be kept in step with that by hand.
    schedule();
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
