// ── CORS-qualified asset URLs ─────────────────────────────────────────────────────────────────
// Every WebGL/canvas load of a remote asset goes through here. The qualifier is NOT a cache-bust —
// it's a CACHE KEY SEPARATOR, so a CORS fetch and a non-CORS fetch of the same asset can never share
// a browser cache entry.
//
// Why it's needed: R2 returns `Access-Control-Allow-Origin` + `Vary: Origin` ONLY when the request
// carries an `Origin` header. A request without one (a plain <img>, a CSS background:url(), a preload,
// a browser extension) gets a response with NO `ACAO` and — critically — NO `Vary`. Chrome therefore
// caches that response as valid for ANY later request to the same URL, including three.js's
// `crossOrigin='anonymous'` load. The cached copy has no ACAO, so the texture load is BLOCKED. An
// ETag revalidation then returns 304 and keeps the poisoned entry alive across refreshes — which is
// why the failure looks intermittent and "goes away if you reload a few times".
//
// A distinct URL means a distinct cache entry, so the poisoned one is simply never consulted. Also
// stops a tainted canvas silently disabling pixel reads (recolour, relief bake, photo mask, seat).
//
// The REAL fix is server-side: serve these assets from a custom domain that sends
// `Access-Control-Allow-Origin: *` on EVERY response (not just Origin-bearing ones — setting the
// bucket's CORS policy to `*` does NOT do this) and drop the bucket CORS rules so the header isn't
// emitted twice. This qualifier then costs nothing and still protects us from third-party fetches
// we don't control.
//
// data:/blob: URLs are same-origin by construction and are returned untouched.
export function corsUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (/^(data|blob):/i.test(url)) return url;
  if (/[?&]cors=/.test(url)) return url;                 // already qualified — never double-append
  return url + (url.includes('?') ? '&' : '?') + 'cors=1';
}

// ── R2 key → absolute URL ─────────────────────────────────────────────────────────────────────
// Some `bakers` columns hold an absolute URL (logo_url, portrait_url) and others hold a bare R2
// key (logo_transparent_key). Components that read the table directly — rather than going through
// the backend, which resolves keys before it returns a profile — have to resolve them here.
// Already-absolute values are returned untouched, so this is safe to apply to either shape.
export function assetUrl(keyOrUrl, base) {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return null;
  try { new URL(keyOrUrl); return keyOrUrl; } catch { /* a bare key — needs the base */ }
  if (!base) return null;                                // no base configured: unresolvable, not a guess
  return `${String(base).replace(/\/$/, '')}/${keyOrUrl.replace(/^\//, '')}`;
}

/* ── Is this asset a 3D model? ────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THIS REGEX WAS WRITTEN OUT TWELVE TIMES BEFORE IT WAS SHARED — eleven in CakeDesigner.jsx, one
 * in TopperPreview, one in admin's CreateTemplate. Identical every time, which is exactly the shape
 * rule 1 describes: nobody copies a predicate on purpose, they write it because they never looked.
 * `check:dup` cannot see it either — a one-line test is far under its minLines.
 *
 * ⚠️ IT IS A FACT ABOUT THE FILE, NOT A GUESS ABOUT THE ELEMENT, and that is the whole reason it is
 * allowed to be derived rather than authored. A `.glb` IS a model; nothing about the row has to be
 * consulted or trusted. The authored field that sounds like the answer — `cake_elements.medium` —
 * is a different axis and cannot answer this today: measured on the dev catalogue, 78% of rows have
 * no medium at all, and `fondant` spans both a flat cut-out (17 rows) and a modelled figure (13).
 * Medium is what a piece is MADE of; this is how it is RENDERED. If a real `dimension` column ever
 * lands, this one function is the only place that changes.
 */
export function isGlbUrl(url) {
  return /\.(glb|gltf)(\?|$)/i.test(url ?? '');
}

/** The same question asked of a catalogue row, which is how every caller actually asks it. */
export function elementIs3D(el) {
  return isGlbUrl(el?.image_url);
}
