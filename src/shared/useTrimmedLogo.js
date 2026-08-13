import { useEffect, useState } from 'react';
import { alphaBounds } from './image.js';
import { corsUrl } from '../designer/utils/assetUrl.js';

// ── Render-time logo trim ────────────────────────────────────────────────────────────────────────
// Baker logos are uploaded as-is, and most carry a wide transparent margin — the sample Spattoo
// wordmark is 38% padding, a real baker logo 29%. Every surface caps the logo by HEIGHT, so that
// margin is spent out of the height budget: a 40px box renders 26px of actual mark. Bakers read
// that as "my logo is tiny", and no amount of layout tuning fixes it, because the box was never
// the problem.
//
// Trimming at UPLOAD would be cheaper at runtime but only helps logos uploaded afterwards, leaving
// every existing baker looking small until someone backfills. Doing it at render fixes them all at
// once, on every surface, with no migration — the cost is one decode per logo per session, memoised
// below, which is nothing next to the 3D scene sharing the page.
//
// Failure is always silent and always falls back to the original URL. The realistic failure is a
// tainted canvas: `getImageData` throws if the image did not arrive with CORS headers, which is why
// the load goes through corsUrl() — the same qualifier the texture pipeline uses, so a logo fetched
// by a plain <img> elsewhere on the page cannot poison the cache entry this needs.

const MAX_EDGE = 4096;   // a full getImageData beyond this is not worth it for a logo

// url -> Promise<string|null>. null means "use the original": already tight, fully transparent,
// too large, or undecodable. Cached per URL so remounts and sibling components decode once.
const cache = new Map();

export function trimTransparent(src) {
  if (!src || typeof src !== 'string') return Promise.resolve(null);
  const hit = cache.get(src);
  if (hit) return hit;

  const job = (async () => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = corsUrl(src);
      await img.decode();

      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || Math.max(w, h) > MAX_EDGE) return null;

      const src2d = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = src2d.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const box = alphaBounds(ctx.getImageData(0, 0, w, h).data, w, h);
      if (!box) return null;                          // nothing opaque — leave it alone
      if (box.w === w && box.h === h) return null;    // already tight — no data URL worth minting

      const out = Object.assign(document.createElement('canvas'), { width: box.w, height: box.h });
      out.getContext('2d').drawImage(src2d, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      return out.toDataURL('image/png');
    } catch {
      return null;                                    // tainted canvas, decode failure, no DOM
    }
  })();

  cache.set(src, job);
  return job;
}

// Returns a trimmed copy of `src` once it is ready, and `src` itself until then — so the logo shows
// immediately at its uploaded size and tightens up, rather than popping in from nothing.
export function useTrimmedLogo(src) {
  const [trimmed, setTrimmed] = useState(null);

  useEffect(() => {
    setTrimmed(null);
    if (!src) return undefined;
    let live = true;
    trimTransparent(src).then((result) => { if (live) setTrimmed(result); });
    return () => { live = false; };
  }, [src]);

  return trimmed ?? src ?? null;
}
