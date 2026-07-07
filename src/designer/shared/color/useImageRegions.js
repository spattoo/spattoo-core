import { useState, useEffect } from 'react';
import { extractRegions } from './imageRecolor.js';

// Load a sticker image and extract its recolourable colour regions for the `hue_regions` recolour method,
// so the designer can show one "Customise colours" swatch per detected colour. Returns [] until loaded (and
// when not applicable). Deterministic + cached per URL — the render half (useStickerImageTexture) derives
// the SAME regions in the same order, so a swatch's index lines up with the pixels it recolours.
const cache = new Map();   // imageUrl → regions

export function useImageRegions(imageUrl, recolor) {
  const active = recolor?.method === 'hue_regions' && !!imageUrl;
  const [regions, setRegions] = useState(() => (active && cache.get(imageUrl)) || []);
  useEffect(() => {
    if (!active) { setRegions([]); return; }
    if (cache.has(imageUrl)) { setRegions(cache.get(imageUrl)); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const rgs = extractRegions(ctx.getImageData(0, 0, w, h).data, w, h, { minSat: recolor.sat, maxRegions: recolor.maxRegions });
        cache.set(imageUrl, rgs);
        if (!cancelled) setRegions(rgs);
      } catch { if (!cancelled) setRegions([]); }   // tainted canvas / decode error → no regions (recolour off)
    };
    img.onerror = () => { if (!cancelled) setRegions([]); };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [active, imageUrl, recolor?.sat, recolor?.maxRegions]);
  return regions;
}
