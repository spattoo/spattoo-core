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

/* ⚠️ SLIDERS, NOT TICKBOXES, for every tool that has an AMOUNT. A tickbox says "our judgement or
 * nothing", and the first answer to a photo that is still too flat is "give me more" — which a
 * tickbox cannot express. The name mark is genuinely binary and stays a toggle; pretending it has a
 * strength would be a control that does nothing at 40%.
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
/* ⚠️ `short` IS FOR THE TAB, `label` FOR THE PANEL, and both are needed. Four equal tabs on a 360px
 * phone give each about 80px — "Clean backdrop" does not fit and truncating it to "Clean back…"
 * makes the strip unreadable. The tab is a signpost and can be terse; the panel below it has room
 * for the real name and the sentence explaining what the tool does. */
const TOOLS = [
  { key: 'bright', label: 'Brightness',     short: 'Light',    hint: 'Lifts a photo shot in poor light', max: 100 },
  { key: 'fix',    label: 'Colour',         short: 'Colour',   hint: 'Corrects a dull, grey cast', max: 150 },
  { key: 'light',  label: 'Clean backdrop', short: 'Backdrop', hint: 'Lifts a plain wall behind the cake', max: 100 },
  { key: 'mark',   label: 'Add your name',  short: 'Name',     hint: 'A small mark in the corner' },
];

/* ⚠️ SWITCHING TABS MUST NOT TOUCH THE PHOTO, and this replaced a deliberate earlier behaviour.
 * When the tools were chips, tapping one turned it on at 70% so a baker met the effect rather than a
 * dead slider at zero. A tab cannot do that: a tab is navigation, and navigation that edits the
 * picture means you cannot look at what a tool does without having it applied — and "nothing is
 * changed unless you choose it" is the first rule of this screen, not a preference. The slider
 * therefore starts at 0 and the tab reads "off" until it is dragged. */

/* ⚠️ DERIVE "nothing applied" FROM THE TOOL LIST, never from a hand-written list of keys, and keep
 * it at module scope so it is a stable object rather than a new one per render.
 *
 * Both states were originally spelled out longhand, and adding a fourth tool silently broke two
 * things at once: the export handed back THE ORIGINAL FILE, because `edited` did not mention the new
 * key and so read false; and Before showed the brightened photo, because the compare state zeroed
 * the other three by name. Neither is visible in a screenshot of an editor that looks like it works.
 * A fifth tool must not be able to do this again. */
const NOTHING = Object.fromEntries(TOOLS.map(t => [t.key, t.max ? 0 : false]));

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
  const [compare, setCompare] = useState(false);   // showing the original
  const [sel, setSel] = useState('bright');        // which tool the one slider is driving

  const edited = TOOLS.some(t => (t.max ? tools[t.key] > 0 : tools[t.key]));

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
    const active = compare ? NOTHING : tools;
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
        Nothing changes unless you choose it.
      </p>

      {/* ⚠️ THE PHOTO IS CAPPED IN VIEWPORT HEIGHT, and this is load-bearing rather than cosmetic.
          A tall phone photo in a 100%-wide box is most of a phone screen on its own, which pushed the
          controls below the fold: you adjusted a slider you could see, then scrolled up to find out
          what it did. An editor you cannot watch while you adjust it is not an editor. */}
      <div style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        background: '#F4F1EC', marginBottom: 10, minHeight: 160,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <canvas ref={canvasRef} style={{
          display: 'block', maxWidth: '100%', maxHeight: '38vh', width: 'auto', height: 'auto',
        }} />

        {/* ⚠️ COMPARE SITS ON THE PHOTO, not in its own row above the tools. Two segmented strips
            stacked one above the other read as one confusing control with seven options; and the row
            it used to occupy is the row the tab strip now needs. On the image it is also where every
            other photo editor puts it. Still two LABELLED states rather than press-and-hold: holding
            gave no clue where to hold, and hid the comparison at the moment you wanted to study it.

            Only shown once something is applied — with nothing chosen the two states are identical,
            and a comparison between a thing and itself is furniture. */}
        {edited && (
          <div style={{
            position: 'absolute', top: 8, right: 8, display: 'flex', gap: 2, padding: 2,
            borderRadius: 999, background: 'rgba(28,28,28,0.55)', backdropFilter: 'blur(6px)',
          }}>
            {[[true, 'Before'], [false, 'After']].map(([isBefore, label]) => (
              <button key={label} type="button" onClick={() => setCompare(isBefore)} style={{
                border: 'none', borderRadius: 999, padding: '5px 11px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800,
                background: compare === isBefore ? '#fff' : 'transparent',
                color:      compare === isBefore ? '#1a1a1a' : 'rgba(255,255,255,0.85)',
              }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ⚠️ A TAB STRIP, FIXED AT ONE ROW. Chips that wrapped were the previous attempt, and on a
          narrow window they wrapped to THREE rows — reintroducing the variable height that pushed the
          photo off screen in the first place. Equal-width tabs cannot wrap and cannot grow.

          ⚠️ THE AMOUNT STAYS ON THE TAB. A plain tab strip would show only which tool is selected and
          hide what is applied to the photo — the one thing the old stacked list gave for free. The
          second line carries it, so all four states are legible without switching between them. */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${TOOLS.filter(t => t.max || bakerName).length}, 1fr)`,
        gap: 3, padding: 3, borderRadius: 12, marginBottom: 12,
        background: '#F2F0EB', border: '1.5px solid #E8E4DC',
      }}>
        {TOOLS.map(t => {
          if (t.key === 'mark' && !bakerName) return null;      // nothing to write
          const on = t.max ? tools[t.key] > 0 : !!tools[t.key];
          return (
            <button key={t.key} type="button" title={t.hint} onClick={() => setSel(t.key)}
              style={tab(sel === t.key, primaryColor)}>
              <span style={{ display: 'block' }}>{t.short}</span>
              <span style={{
                display: 'block', fontSize: 10, fontWeight: 800, marginTop: 1,
                fontVariantNumeric: 'tabular-nums',
                color: on ? primaryColor : '#BDB8B0',
              }}>{on ? (t.max ? `${tools[t.key]}%` : 'on') : 'off'}</span>
            </button>
          );
        })}
      </div>

      {/* ⚠️ ONE TOOL AT A TIME. Four stacked cards of label + hint + slider are taller than the
          photo, so nothing fitted on one screen and adjusting meant scrolling away from the very
          thing being adjusted. This panel is a fixed two lines plus a control whichever tab is on,
          so the photo above it never moves as you switch tools — a layout that jumps on every tap
          costs more than the space it saves. */}
      {(() => {
        const t = TOOLS.find(x => x.key === sel) || TOOLS[0];
        const v = tools[t.key];

        /* The name mark has no amount, so its tab gets a switch rather than a slider. Giving it a
           slider for consistency would be a control that does nothing at 40%. */
        if (!t.max) {
          const on = !!tools.mark;
          return (
            <div style={{ padding: '2px 2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={labelStyle}>{t.label}</span>
                  <span style={hintStyle}>{bakerName ? `“${bakerName}” in the corner` : t.hint}</span>
                </span>
                <button type="button" role="switch" aria-checked={on} aria-label={t.label}
                  onClick={() => { setCompare(false); setTools(s2 => ({ ...s2, mark: !s2.mark })); }}
                  style={{
                    width: 46, height: 27, flexShrink: 0, borderRadius: 999, cursor: 'pointer',
                    padding: 2, border: `1.5px solid ${on ? primaryColor : '#C9C4BC'}`,
                    background: on ? primaryColor : '#fff', display: 'flex',
                    justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
                  }}>
                  <span style={{
                    width: 19, height: 19, borderRadius: '50%', display: 'block',
                    background: on ? '#fff' : '#C9C4BC',
                  }} />
                </button>
              </div>
            </div>
          );
        }

        return (
          <div style={{ padding: '2px 2px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ ...labelStyle, flex: 1, minWidth: 0 }}>{t.label}</span>
              <span style={{
                fontSize: 11.5, fontWeight: 800, color: v > 0 ? primaryColor : '#B9B3AA',
                fontVariantNumeric: 'tabular-nums',
              }}>{v}%</span>
            </div>
            <span style={hintStyle}>{t.hint}</span>
            <input
              type="range" min={0} max={t.max} step={5} value={v} aria-label={t.label}
              onChange={e => { setCompare(false); setTools(s2 => ({ ...s2, [t.key]: Number(e.target.value) })); }}
              style={{ width: '100%', marginTop: 6, accentColor: primaryColor }}
            />
          </div>
        );
      })()}

    </Panel>
  );
}

/* ⚠️ A TAB CARRIES TWO INDEPENDENT FACTS and they must not collapse into one another: whether the
 * tool is SELECTED (this panel is driving it) and whether it is APPLIED (it is changing the photo).
 * A tool is normally applied WITHOUT being selected — that is the state of the other three — so a
 * strip that showed only selection would hide what is being done to the picture. Selection is the
 * raised tab; application is the amount printed on its second line. */
const tab = (selected, color) => ({
  border: 'none', borderRadius: 9, padding: '6px 4px', cursor: 'pointer', minWidth: 0,
  fontFamily: 'inherit', fontSize: 12, fontWeight: 800, textAlign: 'center',
  background: selected ? '#fff' : 'transparent',
  color:      selected ? color : '#8a8a8a',
  boxShadow:  selected ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
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
