// ── Deterministic PRNG ────────────────────────────────────────────────────────────────────────
// mulberry32: a tiny, fast, well-distributed seeded generator. Deterministic (no Math.random) so every
// procedural build — texture flecks, torn-foil shards, second-cream edge wobble — is reproducible and
// cacheable, and survives reloads. Returns a function () → float in [0, 1). The ONE copy; callers seed
// it (`seed >>> 0` for an unsigned 32-bit seed).
//
// NOTE: this is the canonical mulberry32. `creamPen.js` has a look-alike `rng()` that does NOT wrap the
// seed advance to int32, so it produces a DIFFERENT sequence — do not assume they match, and migrating
// it here would change cream-pen stamp jitter (a visual change, needs sign-off).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
