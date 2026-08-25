import { useEffect, useState } from 'react';
import { Panel, PanelBlock } from '../../shared/Panel.jsx';
import { TAKE_GROUNDS } from '../constants.js';
import { PHOTO_SHAPES, DEFAULT_SHAPE, shapeByKey } from './photoShapes.js';
import { PHOTO_ANGLES, DEFAULT_ANGLE } from './photoAngles.js';

/* ── The photograph, chosen before it is taken ───────────────────────────────────────────────────
 *
 * ⚠️ THE ANGLE ROW IS A SHORTCUT, NOT THE CHOICE. The baker frames the shot by dragging the cake —
 * that control already exists, it is the one already under their finger, and it is the only one that
 * can know which side of THIS cake has the name piped on it. The first design of this feature was a
 * menu of fixed angles, and it would have been a worse version of a control the app already had.
 * What the row does is put the camera somewhere sensible so the dragging starts from a good place.
 *
 * Which is why a preset stops being highlighted the moment the camera moves off it: a lit "Front"
 * over a three-quarter view claims the shot is something it is not, and everything about this panel
 * rests on the preview being the truth.
 *
 * ── SHAPE COMES FIRST, ABOVE ANGLE ──────────────────────────────────────────────────────────────
 * It decides what the frame can HOLD. A 4:5 portrait of a tall three-tier cake and a 4:3 landscape of
 * the same cake are different photographs, not the same photograph cropped, so choosing the angle
 * before the shape means framing a shot that is about to change under you.
 */

// A woven grey, the universal "this is nothing" — a flat swatch would just look like another colour
// and the one thing this option must communicate is the absence of one.
const CHECKER = 'repeating-conic-gradient(#c9cfcb 0% 25%, #ffffff 0% 50%) 50% / 10px 10px';

export default function PhotoOptions({
  open, onClose, onCapture, busy, loading = false, isMobile = false,
  onShape, onGround, onCutout, onAngle, onIncludeName,
  activeAngle = null, brandPrimary, bakeryName = '', canChooseName = false,
}) {
  const [shape, setShape]     = useState(DEFAULT_SHAPE);
  const [ground, setGround]   = useState(TAKE_GROUNDS[0].value);
  const [cutout, setCutout]   = useState(false);
  const [includeName, setIncludeName] = useState(true);

  const grounds = brandPrimary && !TAKE_GROUNDS.some(g => g.value.toLowerCase() === brandPrimary.toLowerCase())
    ? [{ key: 'brand', label: 'Your colour', value: brandPrimary }, ...TAKE_GROUNDS]
    : TAKE_GROUNDS;

  /* Everything is pushed UP while the panel is open, never held here until the button is pressed.
   * The preview is the product: the frame on screen is cropped to this shape, painted this ground
   * and carrying this name, so what the baker approves is what downloads. A panel that kept its
   * settings to itself would be showing a picture of a different photograph. */
  useEffect(() => { if (open) onShape?.(shapeByKey(shape).aspect); }, [open, shape, onShape]);
  // Ground and cutout travel SEPARATELY. Collapsing them into "ground = null means cutout" looks
  // tidier and immediately loses the colour the baker had chosen, so coming back from a cutout would
  // land on Studio rather than on their slate.
  useEffect(() => { if (open) onGround?.(ground); }, [open, ground, onGround]);
  useEffect(() => { if (open) onCutout?.(cutout); }, [open, cutout, onCutout]);
  useEffect(() => { if (open) onIncludeName?.(includeName && !cutout); }, [open, includeName, cutout, onIncludeName]);

  // Frame it the way the panel opens, so the first thing the baker sees is a composed shot rather
  // than whatever angle the last edit left behind. Once only — after this the camera is theirs.
  useEffect(() => { if (open) onAngle?.(DEFAULT_ANGLE); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const pick = (on) => ({
    padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
    border: `1.5px solid ${on ? '#2C4433' : '#D8E0DA'}`,
    background: on ? '#2C4433' : '#fff', color: on ? '#fff' : '#3D5A44',
  });
  const row   = { display: 'flex', gap: 6, flexWrap: 'wrap' };
  const label = { fontSize: 11, fontWeight: 700, color: '#6E8577', letterSpacing: '0.04em',
                  textTransform: 'uppercase', marginBottom: 6 };
  const note  = { fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 };

  const disabled = busy || loading;

  return (
    <Panel onClose={onClose} title="Take a photo" width={400} isMobile={isMobile}
           subtitle="Downloads a single picture, larger than a reel frame.">
      <PanelBlock>
        <div>
          <div style={label}>Shape</div>
          <div style={row}>
            {PHOTO_SHAPES.map(s => (
              <button key={s.key} style={pick(shape === s.key)} onClick={() => setShape(s.key)}>{s.label}</button>
            ))}
          </div>
          {/* The reason, not the ratio. "4:5" is a number to somebody who does not think in them. */}
          <div style={note}>{shapeByKey(shape).hint}</div>
        </div>
      </PanelBlock>

      <PanelBlock>
        <div>
          <div style={label}>Angle</div>
          <div style={row}>
            {PHOTO_ANGLES.map(a => (
              <button key={a.key} style={pick(activeAngle === a.key)} onClick={() => onAngle?.(a.key)}>{a.label}</button>
            ))}
          </div>
          <div style={note}>
            {PHOTO_ANGLES.find(a => a.key === activeAngle)?.hint
              ?? 'Framed by hand. Drag the cake to adjust it, or tap an angle to start again.'}
          </div>
        </div>
      </PanelBlock>

      <PanelBlock>
        <div>
          <div style={label}>Background</div>
          <div style={row}>
            {grounds.map(g => (
              <button key={g.key} onClick={() => { setGround(g.value); setCutout(false); }} title={g.label}
                      aria-label={g.label} aria-pressed={!cutout && ground === g.value}
                      style={{ width: 34, height: 34, borderRadius: 8, cursor: 'pointer', padding: 0,
                               background: g.value,
                               border: !cutout && ground === g.value ? '3px solid #2C4433' : '1.5px solid #D8E0DA' }} />
            ))}
            {/* The one thing a photo can do that a reel never can. */}
            <button onClick={() => setCutout(true)} title="No background" aria-label="No background"
                    aria-pressed={cutout}
                    style={{ width: 34, height: 34, borderRadius: 8, cursor: 'pointer', padding: 0,
                             background: CHECKER,
                             border: cutout ? '3px solid #2C4433' : '1.5px solid #D8E0DA' }} />
          </div>
          <div style={note}>
            {cutout
              /* Both costs stated. Neither is recoverable after the fact, and a baker who meets them
                 in the downloaded file has already spent the shot. */
              ? 'The cake on nothing, saved as a see-through PNG for dropping into your own poster. There is no floor for it to cast a shadow on, and no name is written on it.'
              : 'Paints the cake’s background as you pick, so what you see is what you get. A dark cake wants a light ground and the other way round.'}
          </div>
        </div>
      </PanelBlock>

      {/* Same rule as the reel: the tick belongs to a plan that carries `reel_branding`, and off
          means a blank frame rather than our mark. Hidden entirely on a cutout — there is nothing
          for a caption to sit on, and a control that cannot do anything is worse than no control. */}
      {canChooseName && !cutout && (
        <PanelBlock>
          <div>
            <div style={label}>Name on the photo</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeName} onChange={e => setIncludeName(e.target.checked)}
                     style={{ width: 17, height: 17, accentColor: '#2C4433', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3D5A44' }}>
                {bakeryName.trim() ? `Show “${bakeryName.trim()}”` : 'Show my bakery name'}
              </span>
            </label>
            <div style={note}>
              {includeName
                ? 'Burned into the picture, so it still carries your name wherever it gets reposted.'
                : 'This photo saves with nothing written on it.'}
            </div>
          </div>
        </PanelBlock>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button disabled={disabled}
                onClick={() => onCapture({ shape, ground, cutout })}
                style={{ flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
                         background: '#2C4433', color: '#fff', fontWeight: 700, fontSize: 14,
                         cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
          {busy ? 'Saving…' : loading ? 'Loading decorations…' : 'Take the photo'}
        </button>
      </div>

      {/* ⚠️ The same gate the reel has, for a milder version of the same reason: a decoration that
          resolves a moment after the shutter is simply missing from the picture, and nothing about
          the file says so. */}
      <div style={note}>
        {loading
          ? 'Waiting for the decorations to finish loading — one arriving late would be missing from the picture.'
          : 'The frame above is exactly what saves. Drag the cake to change how it sits.'}
      </div>
    </Panel>
  );
}
