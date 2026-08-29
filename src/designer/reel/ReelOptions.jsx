import { useEffect, useState } from 'react';
import { Panel, PanelBlock } from '../../shared/Panel.jsx';
import { TAKE_GROUNDS } from '../constants.js';
import { takeRow as row, takeLabel as label, takePick as pick,
         groundsFor, GroundSwatches, NameOnFrame, TakeButton } from '../capture/takeUi.jsx';
import { pickMimeType, isInstagramReady, recordButtonState } from './recordReel.js';

/* ── The shot, chosen before it is taken ─────────────────────────────────────────────────────────
 *
 * A reel is filmed once per cake and cut together afterwards, so the choices that matter are the
 * ones that make two takes DIFFERENT from each other. Two cakes filmed with identical choreography
 * read as one idea repeated, however different the cakes are — which is the whole reason this panel
 * exists rather than the menu item simply recording.
 *
 * Four controls, and no more. Everything here changes how a take differs from the last one;
 * anything that does not belongs in the code, not in front of the person filming.
 */

/* The grounds live in constants.js — the photo panel offers the same five, and two copies of a
 * swatch list is two places for "Slate" to become two different greys. The baker's own primary is
 * prepended below rather than living in the list, since it is theirs and not ours.
 */

const LENGTHS = [2.5, 3.5, 4.5, 6];
const SWEEPS  = [90, 120, 150, 180];

export default function ReelOptions({ open, onClose, onRecord, busy, onGround, onIncludeName,
                                      brandPrimary, bakeryName = '', canChooseName = false,
                                      isMobile = false, loading = false, maxHeightMobile }) {
  const [pingPong, setPingPong] = useState(true);
  // +1 turns one way, -1 the other. The camera code takes a signed arc, so this is a multiplier
  // rather than a branch.
  const [dir, setDir]           = useState(1);
  const [seconds, setSeconds]   = useState(4.5);
  const [arcDeg, setArcDeg]     = useState(120);
  // Lift over the cake as it turns. Off by default: the shot that has always been here is the right
  // one for most cakes, and a take that suddenly ended overhead would surprise somebody filming
  // their tenth cake the same way as their first.
  const [riseToTop, setRiseToTop] = useState(false);
  const [ground, setGround]     = useState(TAKE_GROUNDS[0].value);
  // Their own name on the frame. On by default — the whole point of the entitlement is that the reel
  // markets the bakery, and somebody who wants that never has to find this control.
  const [includeName, setIncludeName] = useState(true);

  const grounds = groundsFor(brandPrimary);

  // Push the choice into the scene, including on open — the preview is only truthful if the ground
  // on screen is the one that will record.
  useEffect(() => { if (open) onGround?.(ground); }, [open, ground, onGround]);

  /* ⚠️ The name goes up the SAME way, and for the same reason.
   *
   * The caption is composed one level up, because the 9:16 preview overlay and the recorder both
   * read it — that is what makes "the frame above is exactly what records" true. Keeping the tick
   * local and passing it only at onRecord would mean the preview kept showing a name the take was
   * about to leave out, which is the one promise this panel makes. */
  useEffect(() => { if (open) onIncludeName?.(includeName); }, [open, includeName, onIncludeName]);
  /* ── Per-take choices are CLEARED every time the panel opens ─────────────────────────────────
   *
   * ⚠️ Reported: after one take with the name off, "I don't see that entire field at all" and no way
   * back to one carrying the bakery name. Both halves were real. The tick stayed off because the
   * panel is never unmounted, and in the photo panel the cutout hid the block outright. This
   * panel has no cutout, but the sticky tick is the same fault and takes the same fix.
   *
   * The first version kept these for the session, reasoning that somebody producing a batch of
   * unbranded takes should not re-untick for every cake. That trade is backwards. The cost of
   * stickiness is a customer's cake going out with no bakery name on it, silently, because of a
   * choice made for a different cake ten minutes ago; the cost of resetting is one tap. A take is
   * about ONE picture, so the answer applies to one picture.
   *
   * Deliberately NOT reset: ground, length, sweep and direction. Those are framing preferences somebody working through a
   * batch genuinely repeats, and getting them back is a visible tap on a control that is still on
   * screen — the failure this fixes is a control that was not.
   */
  useEffect(() => { if (open) setIncludeName(true); }, [open]);

  /* ⚠️ Asked when the panel OPENS, not after the take.
   *
   * A browser that cannot encode MP4 hands back WebM, which Instagram refuses. Finding that out
   * afterwards means the baker has spent the take, closed the designer and is standing in Instagram
   * when they learn it — at which point the cake may not even be on screen any more. Answering here
   * costs one synchronous call and lets them switch browser before spending anything.
   *
   * In practice this fires almost nowhere: current Chrome and iOS Safari both do H.264. It is for
   * the older Android WebViews and Firefox, where it fires every time and is the only warning that
   * would have helped. */
  const mime = open ? pickMimeType() : null;
  const willBeWebM = open && !isInstagramReady(mime);
  // One decision, made in one testable place — see recordButtonState.
  const btn = recordButtonState({ busy, loading, mime, seconds });

  if (!open) return null;


  return (
    // isMobile makes Panel a bottom sheet, which is what leaves the top of the screen free for the
    // 9:16 preview. On desktop it stays centred and the preview moves to the left instead.
    // Footer, not the tail of the body, and no scrim — see PhotoOptions for both.
    <Panel onClose={onClose} title="Record a reel" width={400} isMobile={isMobile} maxHeightMobile={maxHeightMobile} scrim={false}
           footer={<TakeButton disabled={btn.disabled} label={btn.label}
                               onClick={() => onRecord({ pingPong, seconds, arcDeg: arcDeg * dir, riseToTop })} />}
           subtitle="Films the cake and downloads it at 1080×1920.">
      <PanelBlock>
        <div>
          <div style={label}>Movement</div>
          <div style={row}>
            <button style={pick(pingPong)}  onClick={() => setPingPong(true)}>Turn and come back</button>
            <button style={pick(!pingPong)} onClick={() => setPingPong(false)}>One way</button>
          </div>
          {/* Says WHY rather than what, because the reason is not guessable from the label. */}
          <div style={{ fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 }}>
            {pingPong
              ? 'Returns to where it started, so the reel loops with no jump. The way back is slower — that is the half people actually watch.'
              : 'Ends somewhere new. Instagram will cut straight back to the start, so expect a visible jump each time it loops.'}
          </div>
        </div>
      </PanelBlock>

      <PanelBlock>
        <div>
          <div style={label}>Direction</div>
          <div style={row}>
            <button style={pick(dir === 1)}  onClick={() => setDir(1)}>↻ Turn right</button>
            <button style={pick(dir === -1)} onClick={() => setDir(-1)}>↺ Turn left</button>
          </div>
          <div style={{ fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 }}>
            Film the second cake the other way. Two cakes turning identically read as one idea
            repeated, however different the cakes are.
          </div>
        </div>
      </PanelBlock>

      <PanelBlock>
        <div>
          <div style={label}>Background</div>
          <GroundSwatches grounds={grounds} value={ground} onPick={setGround} />
          <div style={{ fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 }}>
            Changes the cake behind you as you pick, so what you see is what records. A dark cake
            wants a light ground and the other way round.
          </div>
        </div>
      </PanelBlock>

      <PanelBlock>
        <div>
          <div style={label}>Length</div>
          <div style={row}>
            {LENGTHS.map(n => (
              <button key={n} style={pick(seconds === n)} onClick={() => setSeconds(n)}>{n}s</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...label, marginTop: 4 }}>How far it turns</div>
          <div style={row}>
            {SWEEPS.map(n => (
              <button key={n} style={pick(arcDeg === n)} onClick={() => setArcDeg(n)}>{n}°</button>
            ))}
          </div>
          {/* The one piece of judgement worth putting in front of somebody filming. */}
          <div style={{ fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 }}>
            A cake with detail all round its sides wants the full sweep. A rounded, even one — a
            football, a smooth dome — looks much the same from most angles, so a shorter turn with a
            closer push shows more than a long one.
          </div>
        </div>
        {/* ── The top ──────────────────────────────────────────────────────────────────────────
            Every take used to hold the height the baker left the camera at, so no reel could show
            the top of a cake at all — and a single-tier decorated on its lid is nearly invisible
            from any standing angle. The still-photo panel has had an angle for exactly that cake
            since it shipped; this is the moving version of it, and it rises to the same height. */}
        <div>
          <div style={{ ...label, marginTop: 4 }}>Does it show the top?</div>
          <div style={row}>
            <button style={pick(!riseToTop)} onClick={() => setRiseToTop(false)}>Stay level</button>
            <button style={pick(riseToTop)}  onClick={() => setRiseToTop(true)}>Rise over the top</button>
          </div>
          <div style={{ fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 }}>
            {riseToTop
              ? 'Climbs as it turns and finishes looking down, so the lid gets its own moment. For a cake whose design is on top — a piped scene, writing, a covered board.'
              : 'Keeps the height you framed it at. Right for a tall or tiered cake, where the sides are the cake.'}
          </div>
        </div>
      </PanelBlock>

      {/* ── The name on the frame ────────────────────────────────────────────────────────────────
          Only for a baker whose plan carries `reel_branding`. Everybody else gets "made with
          Spattoo" and no switch, which is what they are on: the entitlement IS control of this line.

          ⚠️ Off means BLANK, not our mark. Somebody reaches for this because the reel is going
          where their name should not be — a client's own account, a collaboration, a piece of
          Spattoo marketing filmed from a real bakery's login — and every one of those wants no name
          rather than a different one. The copy says so, because a checkbox called "Bakery name"
          otherwise reads as a choice between two names. */}
      {canChooseName && (
        <PanelBlock>
          <NameOnFrame subject="reel" bakeryName={bakeryName}
                       checked={includeName} onChange={setIncludeName} />
        </PanelBlock>
      )}

      {/* Before the take, not after it — see willBeWebM above. */}
      {willBeWebM && (
        <div style={{ fontSize: 12, lineHeight: 1.55, color: '#8A5A1E', background: '#FDF3E3',
                      border: '1px solid #F0DCB8', borderRadius: 9, padding: '9px 11px' }}>
          {mime
            ? 'This browser records WebM, which Instagram will not accept. It will still download, but open Spattoo in Chrome or Safari to get a file you can post.'
            : 'This browser cannot record video at all. Open Spattoo in Chrome or Safari.'}
        </div>
      )}

      {/* ⚠️ Disabled while ANY decoration is still resolving. A topper that finishes mid-take pops
          into the middle of the reel, and a reel is the one thing here that leaves the app — it
          cannot be quietly re-rendered afterwards the way a thumbnail can. */}
      <div style={{ fontSize: 11.5, color: '#6E8577', lineHeight: 1.5 }}>
        {loading
          ? 'Waiting for the decorations to finish loading — one arriving mid-take would pop into the middle of the reel.'
          : 'The frame above is exactly what records. Drag the cake to change where it starts.'}
      </div>
    </Panel>
  );
}
