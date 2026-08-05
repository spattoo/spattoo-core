import { useEffect, useRef, useState } from 'react';
import { buildA4Pdf, downloadPdf } from '../../orders/pdf.js';
import { sized, resized, moved } from './geometry.js';

// ── The A4 print sheet ────────────────────────────────────────────────────────────────────────────
// A to-scale A4 page the baker lays images out on, then downloads as a print-ready PDF for an edible
// printer. Edible sugar sheets are A4, so the sheet IS the ruler — there is no cake-size maths here,
// only a page and things placed on it.
//
// ── WHY THIS KNOWS NOTHING ABOUT ORDERS ─────────────────────────────────────────────────────────
// It began inside the order detail pane, reading photo-frames out of a saved design. That made the
// one job it could do "print what a customer composed", when the job bakers do far more often is
// "print this, now" — a name, a logo, six of the same rose. The layout, the cake-fit guides and the
// PDF were never order-shaped; only the input was.
//
// So the page takes SOURCES and knows nothing else. See the contract below.
//
// ── NO IMAGE I/O HERE ───────────────────────────────────────────────────────────────────────────
// Loading and painting live in the adapter, never in this file. An order's photo is clipped to a
// mask and carries the customer's zoom/pan/rotate; a baker's upload is a plain image. Had the sheet
// loaded images itself it would need to know which of those it was holding, and every later source
// would add another branch to a file whose job is arithmetic on rectangles. Instead a source arrives
// ready to draw itself, and this file has no `if (mask)` in it — and cannot grow one.

// ── The source contract ───────────────────────────────────────────────────────────────────────────
//   id      string   — stable; placements reference it
//   name    string   — for the thumbnail's title
//   preview string   — dataUrl shown in the palette strip and on the sheet
//   aspect  number    — natural width ÷ height. 1 for anything cut to a (square) frame mask; a wide
//                      name banner is >1. Decides the shape an item is BORN at; see below.
//   draw    (ctx, x, y, wPx, hPx) => void
//                    — paint onto the export canvas at device px. The source owns its WHOLE paint,
//                      cut guide included, because what a cut guide even is depends on the shape.
//
// `preview` and `draw` are deliberately separate: the on-screen copy is a cheap raster the browser
// can composite, while the export re-renders at 300dpi. Reusing the preview for the PDF would print
// the screen's resolution, which on an edible sheet is visible.

// ── Why w and h are BOTH fractions of the sheet's WIDTH ───────────────────────────────────────────
// x is a fraction of the width and y a fraction of the height, because that is what positions a point
// on a page. Sizes are different: an item's proportions must not change when the page does, so both
// of its dimensions are measured against the SAME edge. A square is then simply `w === h`, and
// `aspectRatio: w / h` hands the arithmetic to CSS.
//
// Measuring h against the height instead would make a square item `h = w * (W/H)` — a ratio smuggled
// into the data, wrong the moment anything about the page changes, and invisible until something
// prints out of shape.
//
// Items were square until this point (one `size`, `aspectRatio: '1 / 1'`), which is correct for a
// photo cut to a mask and wrong for everything else a baker prints. A squashed name is the single
// most likely way to waste an edible sheet, so resize scales w and h TOGETHER and proportions are
// only ever set by the source's own aspect.

const A4_ASPECT = 210 / 297;       // portrait W/H
const A4_WIDTH_IN = 210 / 25.4;    // 8.27" — A4 width, used to size cake-fit guides to scale
const A4_HEIGHT_IN = 297 / 25.4;   // 11.69" — A4 height, used for the vertical extent of guides
const GUIDE_SIZES = [3, 4, 5, 6, 7, 8];    // inch cake diameters/sides the baker can check fit against

// Drop trailing ".0" so 9 prints as "9" but 8.5 stays "8.5".
const fmtIn = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

let _uid = 0;
const uid = () => `it${++_uid}`;

export default function A4Sheet({
  sources = [],
  // Auto-place the first source, centred. True for an order (its photos are the reason the sheet was
  // opened, so an empty page would be a chore), false when the baker is choosing what goes on.
  autoPlaceFirst = false,
  paletteTitle = 'Images',
  emptyHint = '',
  // Shown under the strip when the adapter could not load something. The adapter owns the wording:
  // it knows what failed to load and therefore what would help.
  error = '',
  fileName = 'print-sheet.pdf',
  onClose,
}) {
  // [{ uid, sourceId, x, y, w, h }] — x of the sheet's width, y of its height, w and h BOTH of its
  // width (see above).
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const [guide, setGuide] = useState(null);    // cake-fit guide { shape:'round'|'square'|'rect', w, h } inches, or null
  const [shape, setShape] = useState('round'); // which shape the size controls author
  const [rect, setRect] = useState({ l: '', w: '' });  // custom rectangle length × width (inch, as typed)
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 760);
  const [showTip, setShowTip] = useState(true);   // the intro is a dismissible tip card — hide it for more sheet room
  const [stripOverflow, setStripOverflow] = useState(false);  // true → photo strip scrolls, show carousel arrows
  const sheetRef = useRef(null);
  const stripRef = useRef(null);

  const sourceById = (id) => sources.find(src => src.id === id);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Show carousel arrows only when the strip actually overflows its width (any count, any width).
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const check = () => setStripOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sources]);

  // Auto-place, ONCE, when the first source arrives. Keyed on the source list rather than any id the
  // caller happens to have — the order version keyed on `order.id`, which is `undefined` forever for
  // a sheet that has no order, so the effect would never re-run as sources loaded in.
  const placed = useRef(false);
  useEffect(() => {
    if (!autoPlaceFirst || placed.current || !sources.length) return;
    placed.current = true;
    setItems([{ uid: uid(), sourceId: sources[0].id, x: 0.30, y: 0.10, ...sized(sources[0], 0.40) }]);
  }, [sources, autoPlaceFirst]);

  function scrollStrip(dir) {
    stripRef.current?.scrollBy({ left: dir * 148, behavior: 'smooth' });
  }

  function addSource(sourceId) {
    setItems(list => {
      const n = list.length;
      const off = Math.min(0.12 * n, 0.4);
      const src = sourceById(sourceId);
      return [...list, { uid: uid(), sourceId, x: 0.15 + off, y: 0.12 + off, ...sized(src, 0.35) }];
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
    const start = { mx: e.clientX, my: e.clientY, x: it.x, y: it.y, w: it.w, h: it.h };
    const onMove = (ev) => {
      const dx = (ev.clientX - start.mx) / W, dy = (ev.clientY - start.my) / H;
      patch(it.uid, mode === 'move'
        ? moved(start, { dx, dy, w: it.w, h: it.h }, W / H)
        : resized(start, dx));
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
          const src = sourceById(it.sourceId);
          if (!src) continue;
          // Both sizes scale by W — the same edge they are stored against, so what the baker laid out
          // is what prints. Measuring the height against H here would stretch every item by the
          // page's own aspect, which looks almost right and is not.
          src.draw(ctx, Math.round(it.x * W), Math.round(it.y * H), Math.round(it.w * W), Math.round(it.h * W));
        }
      }, { dpi: 300, portrait: true });
      downloadPdf(blob, fileName);
    } finally { setBusy(false); }
  }

  return (
    <div style={s.overlay} onPointerDown={() => setSel(null)}>
      <style>{`.ps-strip::-webkit-scrollbar{display:none}`}</style>
      {showTip && (
        <div style={{ ...s.tipPopup, ...(isMobile ? { bottom: 16, right: 16 } : { top: 74, right: 24 }) }}
          onPointerDown={e => e.stopPropagation()}>
          <button style={s.tipClose} onClick={() => setShowTip(false)} title="Dismiss">×</button>
          <b>A4 print simulator</b> (to scale). Lay the images out at print size, then download a
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
          <div style={s.paletteTitle}>{paletteTitle}{sources.length ? ` (${sources.length})` : ''}</div>
          {sources.length === 0 && emptyHint && <div style={s.hint}>{emptyHint}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {stripOverflow && <button style={s.carArrow} onClick={() => scrollStrip(-1)} aria-label="Scroll left">‹</button>}
            <div ref={stripRef} className="ps-strip" style={s.carStrip}>
              {sources.map(src => (
                <button key={src.id} style={s.palThumb} onClick={() => addSource(src.id)}
                  disabled={!src.preview} title={src.preview ? 'Add to sheet' : 'Loading…'}>
                  {src.preview
                    ? <img src={src.preview} alt={src.name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <div style={{ fontSize: 10, color: '#aaa' }}>…</div>}
                  <span style={s.addBadge}>+</span>
                </button>
              ))}
            </div>
            {stripOverflow && <button style={s.carArrow} onClick={() => scrollStrip(1)} aria-label="Scroll right">›</button>}
          </div>
          {error && <div style={{ ...s.hint, color: '#c0392b', marginTop: 10 }}>{error}</div>}

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
              const src = sourceById(it.sourceId);
              const seld = sel === it.uid;
              return (
                <div key={it.uid}
                  onPointerDown={e => startDrag(e, it, 'move')}
                  style={{
                    // aspectRatio does the height: w and h are both width-fractions, so `w / h` is the
                    // item's true shape and CSS resolves the pixels. No W/H conversion in the view.
                    position: 'absolute', left: `${it.x * 100}%`, top: `${it.y * 100}%`,
                    width: `${it.w * 100}%`, aspectRatio: `${it.w} / ${it.h}`, cursor: 'move',
                    outline: seld ? '2px dashed #6c47ff' : 'none', touchAction: 'none',
                  }}>
                  {src?.preview && <img src={src.preview} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
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
