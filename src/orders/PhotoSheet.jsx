import { useEffect, useMemo, useState } from 'react';
import { loadImage, renderFramedPhoto, renderCutGuide } from './framePhoto.js';
import A4Sheet from '../chefsdesk/a4/A4Sheet.jsx';

// ── An order's photo-frames, on the A4 print sheet ───────────────────────────────────────────────
// The ADAPTER, not the tool. The sheet itself lives in chefsdesk/a4/A4Sheet.jsx and knows nothing
// about orders; this file's whole job is turning one order into sources it can draw.
//
// What makes an order's photo special is that it is not a picture — it is a picture the CUSTOMER
// composed: clipped to the frame's mask, at their zoom, pan and rotation. Printing it any other way
// would print something they never saw. That composition is read-only here on purpose: the baker is
// reproducing a customer's decision, not making one.

// Pull the photo frames out of a saved design (config-gated on photoMask, like the renderer).
function framesOf(order) {
  const stickers = order?.design_snapshot?.stickers ?? [];
  return stickers
    .filter(s => s?.photoMask && s?.photoUrl)
    .map(s => ({
      id: String(s.id),
      name: s.name || 'Photo',
      photoUrl: s.photoUrl,
      photoMask: s.photoMask,
      transform: s.photoTransform ?? { x: 0, y: 0, zoom: 1, rot: 0 },
    }));
}

export default function PhotoSheet({ order, onClose }) {
  // The frames are known the MOMENT the order is — they are fields on a design already in memory,
  // and only their pixels need fetching. So the list is derived synchronously and the palette is
  // right on the first paint: the correct count, and a thumbnail per photo that is disabled until
  // its image arrives.
  //
  // Deriving the list from what had LOADED instead would mean an order with photos rendering
  // "No customer photos in this order." until the network came back — an empty-state message that is
  // simply false, shown at exactly the moment the baker is deciding whether the tool is working.
  const frames = useMemo(() => framesOf(order), [order?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [painted, setPainted] = useState({});   // frameId → { preview, draw }
  const [loadErr, setLoadErr] = useState(false);

  // Load every frame's photo + mask, render the shaped preview once (read-only transform).
  // Raw R2 urls are fine here: loadImage qualifies them itself (framePhoto.js → corsUrl), so this
  // CORS-clean load can never be blocked by a cache entry a plain <img> elsewhere poisoned.
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const f of frames) {
        try {
          const [photo, mask] = await Promise.all([loadImage(f.photoUrl), loadImage(f.photoMask)]);
          if (!alive) return;
          setPainted(prev => ({
            ...prev,
            [f.id]: {
              preview: renderFramedPhoto(photo, mask, f.transform, 420).toDataURL('image/png'),
              // The export re-renders at the size the PDF needs rather than upscaling `preview` — an
              // edible sheet shows the difference. The cut-guide ring is drawn just behind the photo,
              // slightly proud of it, so there is a line to cut along after printing.
              draw: (ctx, x, y, sPx) => {
                const pad = Math.round(sPx * 0.012);
                ctx.drawImage(renderCutGuide(mask, sPx), x - pad, y - pad, sPx + 2 * pad, sPx + 2 * pad);
                ctx.drawImage(renderFramedPhoto(photo, mask, f.transform, sPx), x, y, sPx, sPx);
              },
            },
          }));
        } catch { if (alive) setLoadErr(true); }
      }
    })();
    return () => { alive = false; };
  }, [frames]);

  const sources = useMemo(() => frames.map(f => ({
    id: f.id,
    name: f.name,
    preview: painted[f.id]?.preview ?? null,   // null → the strip shows it as still loading
    draw: painted[f.id]?.draw ?? (() => {}),
  })), [frames, painted]);

  return (
    <A4Sheet
      sources={sources}
      autoPlaceFirst
      paletteTitle="Uploaded photos"
      emptyHint="No customer photos in this order."
      error={loadErr ? 'Some images couldn’t load (check R2 CORS for this origin).' : ''}
      fileName={`order-${order?.id ?? 'photos'}-sheet.pdf`}
      onClose={onClose}
    />
  );
}
