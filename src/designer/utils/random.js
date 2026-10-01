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

/* ── Coherent noise around a closed ring ────────────────────────────────────────────────────────
 *
 * K random control points spaced around a circle, smoothstep-blended between — so the result is
 * continuous, WRAPS at the seam, and reads as something torn or scraped rather than as per-vertex
 * spikes. Values in -1..1; the caller scales.
 *
 * ⚠️ ONE KERNEL, TWO USERS, AND IT WAS ONE-AND-A-HALF. `secondCreamLayer` has used exactly this
 * since it was written, inline, to jitter a torn cream edge; the dished top needs the same thing to
 * stop its lip reading as a machined torus. Copying ten lines would have been quicker and is how
 * the two would end up with different K, different blending and different answers to "what does
 * hand-scraped cream look like" — which is one question.
 *
 * ⚠️ K IS THE CALLER'S, because it is the only part that is NOT shared. A torn band wants many
 * small tears; a scraped rim wants a dozen slow swells. Same kernel, different coarseness.
 */
export function ringNoise(n, k, seed) {
  const rnd = mulberry32(seed >>> 0);
  const ctrl = Array.from({ length: Math.max(2, k) }, () => rnd() * 2 - 1);
  const K = ctrl.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * K;
    const i0 = Math.floor(t) % K;
    const i1 = (i0 + 1) % K;
    const f = t - Math.floor(t);
    const s = f * f * (3 - 2 * f);
    out[i] = ctrl[i0] * (1 - s) + ctrl[i1] * s;
  }
  return out;
}
