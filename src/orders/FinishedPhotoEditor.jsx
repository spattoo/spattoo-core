import { useEffect, useRef, useState, useCallback } from 'react';
import { Panel } from '../shared/Panel.jsx';
import { autoFix, relight } from './photoEdit.js';

/* ── Tidying a finished-cake photo on its way to the customer ────────────────────────────────────
 *
 * ⚠️ IT SITS BEFORE THE SEND, AND THAT IS THE POINT. MarkReadySheet uploads a photo the moment it is
 * chosen, and the ready flip that follows is what fires the customer's email. So the editor opens
 * between choosing and uploading: by the time anything leaves, the baker has already had their say.
 * Declining to edit is a complete answer; not having been asked is not.
 *
 * ⚠️ NOTHING IS APPLIED BY DEFAULT. Every toggle starts off and the first thing shown is the
 * baker's own photo, unaltered. It is their photo of their cake going to their customer — an editor
 * that silently "improves" it has made a decision that was never ours.
 *
 * ⚠️ FREE AND LOCAL. Canvas and arithmetic: no AI, no network, no credits, no entitlement. Background
 * REPLACEMENT was prototyped and deliberately cut — it costs a credit, it needs a billing path that
 * has never executed in production, and it provably bit a piece out of a real cake. See
 * plans/finished-cake-photo-editor.md.
 */

// Work at a bounded size. The maths is O(pixels) and a modern phone photo is 12MP — full-res would
// stall the UI for a second per toggle on exactly the mid-range Android this has to feel quick on.
// The preview is for judging; the export re-runs at the upload size.
const PREVIEW_MAX = 900;

const TOOLS = [
  { key: 'fix',   label: 'Brighten',        hint: 'Fixes the colour and the flat, grey look' },
  { key: 'light', label: 'Clean backdrop',  hint: 'Lifts a plain wall behind the cake' },
  { key: 'mark',  label: 'Add your name',   hint: 'A small mark in the corner' },
];

/* ⚠️ ESCAPE NOTHING HERE — this draws to a canvas, not to SVG. The sibling prototype built the mark
 * as SVG and threw `xmlParseEntityRef: no name` on "feelings & flavours", because a bare & is
 * invalid XML and "Bake & Co" is the commonest shape a bakery name takes. Canvas fillText has no
 * such trap, which is one reason the mark is drawn rather than composited. */
function drawMark(ctx, name, w, h) {
  const size = Math.max(13, Math.round(w * 0.036));
  ctx.save();
  ctx.font = `600 ${size}px "Quicksand", system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  // Outlined, then filled: the mark has to survive landing on a dark board or a pale backdrop, and
  // which one it lands on is not knowable in advance.
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.fillStyle   = 'rgba(255,255,255,0.88)';
  const x = w - Math.round(w * 0.045), y = h - Math.round(h * 0.035);
  ctx.strokeText(name, x, y);
  ctx.fillText(name, x, y);
  ctx.restore();
}

/** Run the chosen tools over an ImageData. Order matters: colour first, then the wall it reveals. */
export function applyTools(imageData, tools) {
  let out = imageData;
  if (tools.fix)   out = autoFix(out);
  if (tools.light) out = relight(out);
  return out;
}

export default function FinishedPhotoEditor({ file, bakerName, primaryColor = '#1a1a1a', onCancel, onDone }) {
  const canvasRef = useRef(null);
  const sourceRef = useRef(null);         // the decoded preview-size ImageData, computed once
  const bitmapRef = useRef(null);         // the decoded image, kept for the full-size export
  const [tools, setTools] = useState({ fix: false, light: false, mark: false });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);   // press to see the original

  const edited = tools.fix || tools.light || tools.mark;

  // ── Decode once ───────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const bmp = await createImageBitmap(file);
      if (!alive) return;
      bitmapRef.current = bmp;
      const scale = Math.min(1, PREVIEW_MAX / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0, w, h);
      sourceRef.current = cx.getImageData(0, 0, w, h);
      setReady(true);
    })().catch(() => setReady(true));
    return () => { alive = false; };
  }, [file]);

  // ── Redraw whenever a toggle changes ──────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const src = sourceRef.current, canvas = canvasRef.current;
    if (!src || !canvas) return;
    canvas.width = src.width; canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    // `compare` renders the untouched original — held, not toggled, so it is impossible to leave it
    // on and mistake the original for the result.
    const active = compare ? { fix: false, light: false, mark: false } : tools;
    const out = applyTools(src, active);
    ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
    if (active.mark && bakerName) drawMark(ctx, bakerName, canvas.width, canvas.height);
  }, [tools, compare, bakerName]);

  useEffect(() => { if (ready) redraw(); }, [ready, redraw]);

  // ── Export at upload size, not preview size ───────────────────────────────────────────────────
  async function finish() {
    if (!edited) return onDone(file);           // untouched: hand back the original file itself
    setBusy(true);
    try {
      const bmp = bitmapRef.current;
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const full = ctx.getImageData(0, 0, c.width, c.height);
      const out = applyTools(full, tools);
      ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
      if (tools.mark && bakerName) drawMark(ctx, bakerName, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
      // Named, not `blob`: the filename survives into the upload key and into a download, and
      // `image.jpeg` in a camera roll is indistinguishable from everything around it.
      onDone(new File([blob], (file.name || 'cake').replace(/\.\w+$/, '') + '-edited.jpg', { type: 'image/jpeg' }));
    } catch {
      onDone(file);                              // never lose the photo to a failed edit
    } finally { setBusy(false); }
  }

  return (
    <Panel
      title="Tidy the photo"
      width={460}
      flow="block"
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <button onClick={() => onDone(file)} disabled={busy} style={btn(false, primaryColor)}>
            Use as it is
          </button>
          <button onClick={finish} disabled={busy || !edited} style={btn(true, primaryColor, busy || !edited)}>
            {busy ? 'Saving…' : 'Use edited'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#777', lineHeight: 1.5 }}>
        Your customer will see this. Nothing is changed unless you choose it.
      </p>

      <div style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        background: '#F4F1EC', marginBottom: 14, minHeight: 160,
      }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
        {edited && (
          // Press and hold. A toggle would let somebody leave it showing the original and judge the
          // edit by it; holding cannot be left on.
          <button
            onPointerDown={() => setCompare(true)}
            onPointerUp={() => setCompare(false)}
            onPointerLeave={() => setCompare(false)}
            style={{
              // ⚠️ LEFT, because the mark is drawn bottom-RIGHT. Both sat in the same corner and
              // the button covered the very thing it was there to let you judge.
              position: 'absolute', left: 10, bottom: 10, padding: '7px 12px', borderRadius: 9,
              border: 'none', background: 'rgba(20,24,21,0.62)', color: '#fff',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {compare ? 'Original' : 'Hold to compare'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TOOLS.map(t => {
          if (t.key === 'mark' && !bakerName) return null;   // nothing to write
          const on = tools[t.key];
          return (
            <button key={t.key} type="button"
              onClick={() => setTools(s => ({ ...s, [t.key]: !s[t.key] }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                padding: '11px 13px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${on ? primaryColor : '#E0DDD8'}`,
                background: on ? `${primaryColor}0F` : '#fff',
              }}>
              <span style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `1.5px solid ${on ? primaryColor : '#C9C4BC'}`,
                background: on ? primaryColor : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 900,
              }}>{on ? '✓' : ''}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#2C4433' }}>{t.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#8a8a8a', marginTop: 1 }}>{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

const btn = (primary, color, disabled = false) => ({
  flex: primary ? 1 : '0 0 auto',
  padding: primary ? '12px' : '12px 18px',
  borderRadius: 11,
  border: primary ? 'none' : '1.5px solid #E0DDD8',
  background: primary ? (disabled ? '#9BB5A2' : color) : '#fff',
  color: primary ? '#fff' : '#555',
  fontSize: 14, fontWeight: primary ? 800 : 700,
  cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
});
