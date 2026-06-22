import { useEffect, useRef, useState } from 'react';
import { loadImage, renderFramedPhoto, renderCutGuide } from './framePhoto.js';
import { buildA4Pdf } from './pdf.js';

// ── Print sheet (A4) ─────────────────────────────────────────────────────────
// Baker-facing layout tool for an order's customer photo-frames. Shows the photos exactly as the
// customer composed them (shaped, with their zoom/pan/rotate), on an A4 sheet to scale — the sheet is
// the physical reference for print size. The first photo is auto-placed; the baker adds the rest,
// moves/resizes each freely, and exports a print-ready A4 PDF (with faint cut guides). No cake-size
// math: the A4 is the ruler. Edible sugar sheets are A4, so this is print-ready.

const A4_ASPECT = 210 / 297;   // portrait W/H

let _uid = 0;
const uid = () => `it${++_uid}`;

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
  const frames = framesOf(order);
  const [imgs, setImgs] = useState({});        // frameId → { photo, mask, dataUrl } (loaded + shaped)
  const [loadErr, setLoadErr] = useState(false);
  const [items, setItems] = useState([]);       // [{ uid, frameId, x, y, size }] x/y/size as A4-width fractions
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 760);
  const sheetRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Load every frame's photo + mask, render the shaped preview once (read-only transform).
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const f of frames) {
        try {
          const [photo, mask] = await Promise.all([loadImage(f.photoUrl), loadImage(f.photoMask)]);
          out[f.id] = { photo, mask, dataUrl: renderFramedPhoto(photo, mask, f.transform, 420).toDataURL('image/png') };
        } catch { setLoadErr(true); }
      }
      if (!alive) return;
      setImgs(out);
      // Auto-place the first frame centred.
      if (frames[0]) setItems([{ uid: uid(), frameId: frames[0].id, x: 0.30, y: 0.10, size: 0.40 }]);
    })();
    return () => { alive = false; };
  }, [order?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  function addFrame(frameId) {
    setItems(list => {
      const n = list.length;
      const off = Math.min(0.12 * n, 0.4);
      return [...list, { uid: uid(), frameId, x: 0.15 + off, y: 0.12 + off, size: 0.35 }];
    });
  }
  function removeItem(u) { setItems(list => list.filter(it => it.uid !== u)); if (sel === u) setSel(null); }
  function patch(u, p) { setItems(list => list.map(it => it.uid === u ? { ...it, ...p } : it)); }

  // Pointer drag (move) / resize, in A4-width fractions.
  function startDrag(e, it, mode) {
    e.preventDefault(); e.stopPropagation(); setSel(it.uid);
    const rect = sheetRef.current.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const start = { mx: e.clientX, my: e.clientY, x: it.x, y: it.y, size: it.size };
    const onMove = (ev) => {
      const dx = (ev.clientX - start.mx) / W, dy = (ev.clientY - start.my) / H;
      if (mode === 'move') {
        patch(it.uid, {
          x: Math.max(0, Math.min(1 - it.size, start.x + dx)),
          y: Math.max(0, Math.min(1 - it.size * (W / H), start.y + dy * 1)),
        });
      } else {
        const size = Math.max(0.1, Math.min(1 - it.x, start.size + dx));
        patch(it.uid, { size });
      }
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function download() {
    if (!items.length || busy) return;
    setBusy(true);
    try {
      const blob = await buildA4Pdf((ctx, { W, H }) => {
        for (const it of items) {
          const rec = imgs[it.frameId];
          if (!rec) continue;
          const f = frames.find(fr => fr.id === it.frameId);
          const sPx = Math.round(it.size * W);
          const x = Math.round(it.x * W), y = Math.round(it.y * H);
          // faint cut-guide ring just behind the shaped photo
          const pad = Math.round(sPx * 0.012);
          ctx.drawImage(renderCutGuide(rec.mask, sPx), x - pad, y - pad, sPx + 2 * pad, sPx + 2 * pad);
          ctx.drawImage(renderFramedPhoto(rec.photo, rec.mask, f.transform, sPx), x, y, sPx, sPx);
        }
      }, { dpi: 300, portrait: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `order-${order?.id ?? 'photos'}-sheet.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally { setBusy(false); }
  }

  return (
    <div style={s.overlay} onPointerDown={() => setSel(null)}>
      <div style={s.header}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#2C4433' }}>Print sheet — A4</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={s.primaryBtn} disabled={busy || !items.length} onClick={download}>
            {busy ? 'Preparing…' : 'Download PDF'}
          </button>
          <button style={s.ghostBtn} onClick={onClose}>Close</button>
        </div>
      </div>

      <div style={{ ...s.body, flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Palette */}
        <div style={{ ...s.palette, ...(isMobile ? { width: '100%', borderRight: 'none', borderBottom: '1.5px solid #E8E4DC', maxHeight: '34vh', flexShrink: 0 } : {}) }}>
          <div style={s.paletteTitle}>Customer photos</div>
          {frames.length === 0 && <div style={s.hint}>No customer photos in this order.</div>}
          {frames.map(f => (
            <div key={f.id} style={s.palItem}>
              <div style={s.palThumb}>
                {imgs[f.id]
                  ? <img src={imgs[f.id].dataUrl} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <div style={{ fontSize: 10, color: '#aaa' }}>…</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.palName}>{f.name}</div>
                <button style={s.addBtn} onClick={() => addFrame(f.id)}>+ Add to sheet</button>
              </div>
            </div>
          ))}
          {loadErr && <div style={{ ...s.hint, color: '#c0392b' }}>Some images couldn’t load (check R2 CORS for this origin).</div>}
          <div style={s.note}>The A4 is shown to scale — use it to judge real print size. Drag to move, drag the corner to resize.</div>
        </div>

        {/* A4 sheet */}
        <div style={s.stage}>
          <div ref={sheetRef} style={{ ...s.sheet, ...(isMobile ? { height: 'auto', width: 'min(92vw, 460px)' } : {}) }} onPointerDown={e => e.stopPropagation()}>
            {items.map(it => {
              const rec = imgs[it.frameId];
              const seld = sel === it.uid;
              return (
                <div key={it.uid}
                  onPointerDown={e => startDrag(e, it, 'move')}
                  style={{
                    position: 'absolute', left: `${it.x * 100}%`, top: `${it.y * 100}%`,
                    width: `${it.size * 100}%`, aspectRatio: '1 / 1', cursor: 'move',
                    outline: seld ? '2px dashed #6c47ff' : 'none', touchAction: 'none',
                  }}>
                  {rec && <img src={rec.dataUrl} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
                  {seld && (
                    <>
                      <div onPointerDown={e => startDrag(e, it, 'resize')} style={s.resizeHandle} />
                      <button onPointerDown={e => { e.stopPropagation(); removeItem(it.uid); }} style={s.removeBtn}>×</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 4000, background: '#FAFAF8', display: 'flex', flexDirection: 'column', fontFamily: 'inherit' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1.5px solid #E8E4DC', background: '#fff' },
  primaryBtn: { padding: '9px 16px', borderRadius: 10, border: 'none', background: '#3D5A44', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  ghostBtn: { padding: '9px 14px', borderRadius: 10, border: '1.5px solid #ccc', background: '#fff', fontSize: 13, fontWeight: 700, color: '#555', cursor: 'pointer' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  palette: { width: 260, flexShrink: 0, borderRight: '1.5px solid #E8E4DC', background: '#fff', padding: 16, overflowY: 'auto' },
  paletteTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#8a7a80', marginBottom: 10 },
  palItem: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 },
  palThumb: { width: 56, height: 56, flexShrink: 0, borderRadius: 8, border: '1px solid #e6e2ea', background: '#faf9fb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  palName: { fontSize: 12, fontWeight: 700, color: '#2C4433', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  addBtn: { marginTop: 4, padding: '4px 10px', borderRadius: 8, border: '1.5px solid #C5D4C8', background: '#F7FAF8', fontSize: 11, fontWeight: 700, color: '#3D5A44', cursor: 'pointer' },
  hint: { fontSize: 11, color: '#8a7a80', lineHeight: 1.5 },
  note: { fontSize: 11, color: '#8a7a80', lineHeight: 1.5, marginTop: 14, paddingTop: 12, borderTop: '1px dashed #e6e2ea' },
  stage: { flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, background: '#EFEDE8' },
  sheet: { position: 'relative', height: 'min(calc(100vh - 130px), 980px)', aspectRatio: `${A4_ASPECT}`, background: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,0.15)', borderRadius: 2 },
  resizeHandle: { position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: 4, background: '#6c47ff', border: '2px solid #fff', cursor: 'nwse-resize', touchAction: 'none' },
  removeBtn: { position: 'absolute', left: -10, top: -10, width: 22, height: 22, borderRadius: '50%', background: '#e53935', color: '#fff', border: '2px solid #fff', fontSize: 14, lineHeight: '18px', cursor: 'pointer', padding: 0 },
};
