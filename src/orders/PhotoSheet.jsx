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
const A4_WIDTH_IN = 210 / 25.4;    // 8.27" — A4 width, used to size cake-fit guides to scale
const A4_HEIGHT_IN = 297 / 25.4;   // 11.69" — A4 height, used for the vertical extent of guides
const GUIDE_SIZES = [3, 4, 5, 6, 7, 8];    // inch cake diameters/sides the baker can check fit against

// Drop trailing ".0" so 9 prints as "9" but 8.5 stays "8.5".
const fmtIn = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

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
  const [guide, setGuide] = useState(null);    // active cake-fit guide { shape:'round'|'square'|'rect', w, h } inches, or null
  const [shape, setShape] = useState('round'); // which shape the size controls author
  const [rect, setRect] = useState({ l: '', w: '' });  // custom rectangle length × width (inch, as typed)
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 760);
  const [showTip, setShowTip] = useState(true);   // the intro is a dismissible tip card — hide it for more sheet room
  const [stripOverflow, setStripOverflow] = useState(false);  // true → photo strip scrolls, show carousel arrows
  const sheetRef = useRef(null);
  const stripRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Show carousel arrows only when the photo strip actually overflows its width (any count, any width).
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const check = () => setStripOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frames.length, imgs]);

  function scrollStrip(dir) {
    stripRef.current?.scrollBy({ left: dir * 148, behavior: 'smooth' });
  }

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

  // Switch which shape the size controls author; clear any active guide so stale dims don't linger.
  function pickShape(sh) { setShape(sh); setGuide(null); }
  // Live-apply the custom rectangle as the baker types L × W (length → vertical, width → horizontal).
  function setRectDim(k, v) {
    const next = { ...rect, [k]: v };
    setRect(next);
    const l = parseFloat(next.l), w = parseFloat(next.w);
    setGuide(l > 0 && w > 0 ? { shape: 'rect', w, h: l } : null);
  }
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
      <style>{`.ps-strip::-webkit-scrollbar{display:none}`}</style>
      {showTip && (
        <div style={{ ...s.tipPopup, ...(isMobile ? { bottom: 16, right: 16 } : { top: 74, right: 24 }) }}
          onPointerDown={e => e.stopPropagation()}>
          <button style={s.tipClose} onClick={() => setShowTip(false)} title="Dismiss">×</button>
          <b>A4 print simulator</b> (to scale). Lay the photos out at print size, then download a
          print-ready PDF. Drag to move, drag a corner to resize.
        </div>
      )}
      <div style={s.header}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#2C4433' }}>Print sheet — A4</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={s.primaryBtn} disabled={busy || !items.length} onClick={download}>
            {busy ? 'Preparing…' : 'Download PDF'}
          </button>
          <button style={s.ghostBtn} onClick={onClose}>Close</button>
        </div>
      </div>

      <div style={{ ...s.body, flexDirection: isMobile ? 'column' : 'row', overflowY: isMobile ? 'auto' : 'hidden' }}>
        {/* Palette */}
        <div style={{ ...s.palette, ...(isMobile ? { width: '100%', borderRight: 'none', borderBottom: '1.5px solid #E8E4DC', flexShrink: 0, overflowY: 'visible' } : {}) }}>
          <div style={s.paletteTitle}>Uploaded photos{frames.length ? ` (${frames.length})` : ''}</div>
          {frames.length === 0 && <div style={s.hint}>No customer photos in this order.</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {stripOverflow && <button style={s.carArrow} onClick={() => scrollStrip(-1)} aria-label="Scroll left">‹</button>}
            <div ref={stripRef} className="ps-strip" style={s.carStrip}>
              {frames.map(f => (
                <button key={f.id} style={s.palThumb} onClick={() => addFrame(f.id)}
                  disabled={!imgs[f.id]} title="Add to sheet">
                  {imgs[f.id]
                    ? <img src={imgs[f.id].dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <div style={{ fontSize: 10, color: '#aaa' }}>…</div>}
                  <span style={s.addBadge}>+</span>
                </button>
              ))}
            </div>
            {stripOverflow && <button style={s.carArrow} onClick={() => scrollStrip(1)} aria-label="Scroll right">›</button>}
          </div>
          {loadErr && <div style={{ ...s.hint, color: '#c0392b', marginTop: 10 }}>Some images couldn’t load (check R2 CORS for this origin).</div>}

          <div style={s.guideBlock}>
            <div style={{ ...s.paletteTitle, marginBottom: 10 }}>Check size</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['round', 'Round'], ['square', 'Square'], ['rect', 'Rectangle']].map(([sh, label]) => (
                <button key={sh} onClick={() => pickShape(sh)}
                  style={{ ...s.guideBtn, flex: 1, ...(shape === sh ? s.guideBtnOn : {}) }}>{label}</button>
              ))}
            </div>
            {shape === 'rect' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <input type="number" min="0" step="0.5" placeholder="L" value={rect.l}
                  onChange={e => setRectDim('l', e.target.value)} style={s.dimInput} />
                <span style={{ color: '#8a7a80', fontWeight: 700 }}>×</span>
                <input type="number" min="0" step="0.5" placeholder="W" value={rect.w}
                  onChange={e => setRectDim('w', e.target.value)} style={s.dimInput} />
                <span style={{ fontSize: 11, color: '#8a7a80' }}>in</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setGuide(null)} style={{ ...s.guideBtn, ...(guide === null ? s.guideBtnOn : {}) }}>Off</button>
                {GUIDE_SIZES.map(d => {
                  const on = guide?.shape === shape && guide.w === d && guide.h === d;
                  return (
                    <button key={d} onClick={() => setGuide({ shape, w: d, h: d })}
                      style={{ ...s.guideBtn, ...(on ? s.guideBtnOn : {}) }}>{d}″</button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* A4 sheet */}
        <div style={{ ...s.stage, ...(isMobile ? { flex: 'none', overflow: 'visible' } : {}) }}>
          <div ref={sheetRef} style={{ ...s.sheet, ...(isMobile ? { height: 'auto', width: 'min(92vw, 460px)' } : {}) }} onPointerDown={e => e.stopPropagation()}>
            <div style={s.watermark}>
              <div style={s.watermarkBig}>A4</div>
              <div style={s.watermarkSub}>210 × 297 mm</div>
            </div>
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
            {guide && (
              <div style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: `${(guide.w / A4_WIDTH_IN) * 100}%`, height: `${(guide.h / A4_HEIGHT_IN) * 100}%`,
                border: '2px dashed #b08968', borderRadius: guide.shape === 'round' ? '50%' : 6,
                pointerEvents: 'none', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
              }}>
                <span style={{ transform: 'translateY(-50%)', background: '#fff', padding: '0 6px', fontSize: 11, fontWeight: 700, color: '#b08968' }}>
                  {guide.shape === 'rect' ? `${fmtIn(guide.h)} × ${fmtIn(guide.w)}″` : `${fmtIn(guide.w)}″ ${guide.shape}`}
                </span>
              </div>
            )}
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
  tipPopup: { position: 'absolute', zIndex: 10, width: 'min(300px, calc(100vw - 48px))', fontSize: 12, color: '#5b5340', lineHeight: 1.6, padding: '14px 34px 14px 16px', borderRadius: 12, border: '1px solid #E8E4DC', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.18)' },
  tipClose: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: '#9a8f80', fontSize: 18, lineHeight: '22px', cursor: 'pointer', padding: 0 },
  paletteTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#8a7a80', marginBottom: 10 },
  palThumb: { position: 'relative', width: 64, height: 64, flexShrink: 0, padding: 0, borderRadius: 8, border: '1px solid #e6e2ea', background: '#faf9fb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' },
  addBadge: { position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: '50%', background: '#3D5A44', color: '#fff', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, lineHeight: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' },
  carStrip: { flex: 1, minWidth: 0, display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', paddingBottom: 2 },
  carArrow: { flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '1.5px solid #d8cfd9', background: '#fff', color: '#5b5340', fontSize: 17, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  hint: { fontSize: 11, color: '#8a7a80', lineHeight: 1.5 },
  guideBlock: { marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e6e2ea' },
  guideBtn: { padding: '5px 12px', borderRadius: 8, border: '1.5px solid #d8cfd9', background: '#fff', fontSize: 12, fontWeight: 700, color: '#8a7a80', cursor: 'pointer' },
  guideBtnOn: { borderColor: '#b08968', background: '#fbf3ec', color: '#8a5a36' },
  dimInput: { width: 56, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #d8cfd9', background: '#fff', fontSize: 12, fontWeight: 700, color: '#5b5340', textAlign: 'center' },
  watermark: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#ececE6', userSelect: 'none' },
  watermarkBig: { fontSize: 'clamp(48px, 14vw, 140px)', fontWeight: 800, letterSpacing: 4, lineHeight: 1 },
  watermarkSub: { fontSize: 'clamp(10px, 2.4vw, 16px)', fontWeight: 700, letterSpacing: 3, marginTop: 8 },
  stage: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, background: '#EFEDE8' },
  sheet: { position: 'relative', height: 'min(calc(100vh - 130px), 980px)', aspectRatio: `${A4_ASPECT}`, background: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,0.15)', borderRadius: 2 },
  resizeHandle: { position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: 4, background: '#6c47ff', border: '2px solid #fff', cursor: 'nwse-resize', touchAction: 'none' },
  removeBtn: { position: 'absolute', left: -10, top: -10, width: 22, height: 22, borderRadius: '50%', background: '#e53935', color: '#fff', border: '2px solid #fff', fontSize: 14, lineHeight: '18px', cursor: 'pointer', padding: 0 },
};
