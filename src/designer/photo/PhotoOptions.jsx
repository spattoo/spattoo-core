import { useEffect, useState } from 'react';
import { Panel, PanelBlock } from '../../shared/Panel.jsx';
import { TAKE_GROUNDS } from '../constants.js';
import { takeRow as row, takeLabel as label, takeNote as note, takePick as pick,
         groundsFor, GroundSwatches, NameOnFrame, TakeButton } from '../capture/takeUi.jsx';
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
  activeAngle = null, brandPrimary, bakeryName = '', canChooseName = false, maxHeightMobile,
}) {
  const [shape, setShape]     = useState(DEFAULT_SHAPE);
  const [ground, setGround]   = useState(TAKE_GROUNDS[0].value);
  const [cutout, setCutout]   = useState(false);
  const [includeName, setIncludeName] = useState(true);

  const grounds = groundsFor(brandPrimary);

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
  /* ── Per-take choices are CLEARED every time the panel opens ─────────────────────────────────
   *
   * ⚠️ Reported: after one take with the name off, "I don't see that entire field at all" and no way
   * back to one carrying the bakery name. Both halves were real. The tick stayed off because the
   * panel is never unmounted, and picking the cutout HIDES the name block
   * entirely — so a baker who had used one reopened to find the control simply absent, recoverable
   * only by guessing that a ground swatch brings it back.
   *
   * The first version kept these for the session, reasoning that somebody producing a batch of
   * unbranded takes should not re-untick for every cake. That trade is backwards. The cost of
   * stickiness is a customer's cake going out with no bakery name on it, silently, because of a
   * choice made for a different cake ten minutes ago; the cost of resetting is one tap. A take is
   * about ONE picture, so the answer applies to one picture.
   *
   * Deliberately NOT reset: shape, ground and angle. Those are framing preferences somebody working through a
   * batch genuinely repeats, and getting them back is a visible tap on a control that is still on
   * screen — the failure this fixes is a control that was not.
   */
  useEffect(() => {
    if (!open) return;
    setIncludeName(true);
    setCutout(false);
  }, [open]);

  if (!open) return null;


  const disabled = busy || loading;

  /* ⚠️ The action button is the FOOTER, not the last thing in the body. Capping the sheet so the
   * frame shows above it means the body scrolls — and the primary action was landing below the fold,
   * on a panel whose one job is to take the picture. Panel's footer sits outside the scroll area.
   *
   * ⚠️ And scrim={false}: the frame above the sheet is the whole point of that layout, and the
   * panel's own 4px backdrop blur was landing on it. Uncovered but out of focus is no more honest
   * than covered. The designer already dims everything outside the crop. */
  return (
    <Panel onClose={onClose} title="Take a photo" width={400} isMobile={isMobile} maxHeightMobile={maxHeightMobile} scrim={false}
           footer={<TakeButton disabled={disabled} onClick={() => onCapture({ shape, ground, cutout })}
                               label={busy ? 'Saving…' : loading ? 'Loading decorations…' : 'Take the photo'} />}
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
          <GroundSwatches grounds={grounds} value={ground} selected={!cutout}
                          onPick={v => { setGround(v); setCutout(false); }}
                          extra={<>
                            {/* The one thing a photo can do that a reel never can. */}
                            <button onClick={() => setCutout(true)} title="No background" aria-label="No background"
                    aria-pressed={cutout}
                    style={{ width: 34, height: 34, borderRadius: 8, cursor: 'pointer', padding: 0,
                             background: CHECKER,
                             border: cutout ? '3px solid #2C4433' : '1.5px solid #D8E0DA' }} />
                          </>} />
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
          <NameOnFrame subject="photo" bakeryName={bakeryName}
                       checked={includeName} onChange={setIncludeName} />
        </PanelBlock>
      )}

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
