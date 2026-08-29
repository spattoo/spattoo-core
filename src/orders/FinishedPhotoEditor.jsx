import { useEffect, useRef, useState, useCallback } from 'react';
import { Panel } from '../shared/Panel.jsx';
import { autoFix, relight, brighten } from './photoEdit.js';

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

/* ⚠️ SLIDERS, NOT TICKBOXES, for the two that have an AMOUNT. A tickbox says "our judgement or
 * nothing", and the first answer to a photo that is still too flat is "give me more" — which a
 * tickbox cannot express. The name mark is genuinely binary and stays a tickbox; pretending it has
 * a strength would be a control that does nothing at 40%.
 *
 * ⚠️ BRIGHTNESS IS A SEPARATE TOOL FROM COLOUR, and merging them back would undo a real finding.
 * `autoFix` was originally labelled "Brighten" and the report was "it still looks dark" — correctly,
 * because its contrast term works ABOUT THE MIDPOINT: it lifts highlights while pushing shadows
 * *down*, for a net 151.2 → 157.2 mean on the reference photo. It is a colour fix wearing the wrong
 * name. Gamma brightening does the job that label promised: 151.2 → 187.1 at 70%, with 0.00% of the
 * frame blown out at ANY setting, because the curve pins white at white (see `brighten`).
 *
 * The other two ceilings are each for their own reason:
 *  - Colour reaches 150% because `autoFix` blends `orig + (fixed - orig) × strength`, so above 1 it
 *    EXTRAPOLATES past the correction the maths chose — the reference photo already spanned 0–254,
 *    leaving levels almost nothing to stretch. Capped at 1.5: contrast and saturation ride the same
 *    multiplier and pastels are the first thing to break.
 *  - Backdrop stops at 100% because it interpolates TOWARD a target colour; past 1 it overshoots the
 *    target and starts inventing a wall lighter than white.
 */
const TOOLS = [
  { key: 'bright', label: 'Brightness',      hint: 'Lifts a photo shot in poor light', max: 100 },
  { key: 'fix',    label: 'Colour',          hint: 'Corrects a dull, grey cast', max: 150 },
  { key: 'light',  label: 'Clean backdrop',  hint: 'Lifts a plain wall behind the cake', max: 100 },
  { key: 'mark',   label: 'Add your name',   hint: 'A small mark in the corner' },
];

// A sensible amount on first tap, so a baker meets the effect rather than a dead control at zero.
const NUDGE = 70;

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

/** Run the chosen tools over an ImageData. Amounts are percentages.
 *
 *  ⚠️ THE ORDER IS NOT ARBITRARY. Brightness first, because it is a property of the capture and
 *  everything after it should judge the *lit* photo: `autoFix` picks its endpoints and white balance
 *  from percentiles, so running it first would have it correct an exposure that is about to change.
 *  The wall goes last, since it is the surface the first two reveal. */
export function applyTools(imageData, tools) {
  let out = imageData;
  if (tools.bright) out = brighten(out, { amount: tools.bright / 100 });
  if (tools.fix)    out = autoFix(out, { strength: tools.fix / 100 });
  if (tools.light)  out = relight(out, { strength: tools.light / 100 });
  return out;
}

export default function FinishedPhotoEditor({ file, bakerName, primaryColor = '#1a1a1a', onCancel, onDone }) {
  const canvasRef = useRef(null);
  const sourceRef = useRef(null);         // the decoded preview-size ImageData, computed once
  const bitmapRef = useRef(null);         // the decoded image, kept for the full-size export
  const [tools, setTools] = useState({ bright: 0, fix: 0, light: 0, mark: false });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);   // press to see the original

  const edited = tools.fix > 0 || tools.light > 0 || tools.mark;

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
    const active = compare ? { fix: 0, light: 0, mark: false } : tools;
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
        background: '#F4F1EC', marginBottom: 10, minHeight: 160,
      }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
      </div>

      {/* ⚠️ TWO LABELLED TABS, not press-and-hold. Holding was tried and was wrong twice over: there
          was nothing to say WHERE to hold, and a control you have to discover is a control most
          people never use. The original objection to a toggle — that somebody could leave it on the
          original and judge the edit by it — is answered by LABELLING which one is on screen rather
          than by making the interaction awkward.

          Only shown once something is ticked: with nothing chosen the two states are identical, and
          a comparison between a thing and itself is furniture. */}
      {edited && (
        <div style={{
          display: 'flex', gap: 3, padding: 3, borderRadius: 10, marginBottom: 14,
          background: '#F2F0EB', border: '1.5px solid #E8E4DC',
        }}>
          {[[true, 'Before'], [false, 'After']].map(([isBefore, label]) => (
            <button key={label} type="button" onClick={() => setCompare(isBefore)} style={{
              flex: 1, border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
              background: compare === isBefore ? '#fff' : 'transparent',
              color:      compare === isBefore ? '#1a1a1a' : '#8a8a8a',
              boxShadow:  compare === isBefore ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
            }}>{label}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TOOLS.map(t => {
          if (t.key === 'mark' && !bakerName) return null;   // nothing to write

          // The name mark: on or off, no amount.
          if (!t.max) {
            const on = !!tools.mark;
            return (
              <button key={t.key} type="button"
                onClick={() => { setCompare(false); setTools(s => ({ ...s, mark: !s.mark })); }}
                style={row(on, primaryColor)}>
                <span style={tick(on, primaryColor)}>{on ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={labelStyle}>{t.label}</span>
                  <span style={hintStyle}>{t.hint}</span>
                </span>
              </button>
            );
          }

          const v = tools[t.key];
          const on = v > 0;
          return (
            <div key={t.key} style={{ ...row(on, primaryColor), display: 'block', cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Tapping the row turns it on at a sensible amount rather than at zero — a slider
                    that starts dead teaches nothing about what the tool does. Tapping again is off. */}
                <button type="button" aria-label={t.label}
                  onClick={() => { setCompare(false); setTools(s => ({ ...s, [t.key]: on ? 0 : NUDGE })); }}
                  style={{ ...tick(on, primaryColor), border: `1.5px solid ${on ? primaryColor : '#C9C4BC'}`, cursor: 'pointer' }}>
                  {on ? '✓' : ''}
                </button>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={labelStyle}>{t.label}</span>
                  <span style={hintStyle}>{t.hint}</span>
                </span>
                <span style={{
                  fontSize: 11.5, fontWeight: 800, color: on ? primaryColor : '#B9B3AA',
                  fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right',
                }}>{v}%</span>
              </div>
              <input
                type="range" min={0} max={t.max} step={5} value={v}
                onChange={e => { setCompare(false); setTools(s => ({ ...s, [t.key]: Number(e.target.value) })); }}
                style={{ width: '100%', marginTop: 8, accentColor: primaryColor }}
              />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const row = (on, color) => ({
  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
  padding: '11px 13px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
  border: `1.5px solid ${on ? color : '#E0DDD8'}`,
  background: on ? `${color}0F` : '#fff',
});

const tick = (on, color) => ({
  width: 18, height: 18, borderRadius: 5, flexShrink: 0, padding: 0,
  border: `1.5px solid ${on ? color : '#C9C4BC'}`,
  background: on ? color : '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 11, fontWeight: 900, fontFamily: 'inherit',
});

const labelStyle = { display: 'block', fontSize: 13.5, fontWeight: 700, color: '#2C4433' };
const hintStyle  = { display: 'block', fontSize: 11.5, color: '#8a8a8a', marginTop: 1 };

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
