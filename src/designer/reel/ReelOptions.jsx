import { useEffect, useState } from 'react';
import { Panel, PanelBlock } from '../../shared/Panel.jsx';
import { DESIGNER_GROUND } from '../constants.js';
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

/* ── The grounds ─────────────────────────────────────────────────────────────────────────────────
 * A CURATED LIST, not a colour picker — the same call the storefront themes made for exactly this
 * problem (templates.js `grounds`). A free picker means somebody records a cake on neon pink at the
 * moment they are trying to post something, and the bakers who would not need the freedom anyway.
 *
 * The baker's own primary is offered FIRST but is not the default, because a dark green brand behind
 * a dark green cake is mush and no rule we could write would predict that. They look and choose.
 */
const GROUNDS = [
  // Literally the designer's own ground, imported rather than retyped: picking Studio — or opening
  // the panel, which selects it — must leave the scene exactly as the baker had it.
  { key: 'studio', label: 'Studio', value: DESIGNER_GROUND },
  { key: 'cream',  label: 'Cream',  value: '#FBF3E7' },
  { key: 'blush',  label: 'Blush',  value: '#FBEFEF' },
  { key: 'slate',  label: 'Slate',  value: '#2E3A36' },
  { key: 'ink',    label: 'Ink',    value: '#14181A' },
];

const LENGTHS = [2.5, 3.5, 4.5, 6];
const SWEEPS  = [90, 120, 150, 180];

export default function ReelOptions({ open, onClose, onRecord, busy, onGround, onIncludeName,
                                      brandPrimary, bakeryName = '', canChooseName = false,
                                      isMobile = false, loading = false }) {
  const [pingPong, setPingPong] = useState(true);
  // +1 turns one way, -1 the other. The camera code takes a signed arc, so this is a multiplier
  // rather than a branch.
  const [dir, setDir]           = useState(1);
  const [seconds, setSeconds]   = useState(4.5);
  const [arcDeg, setArcDeg]     = useState(120);
  const [ground, setGround]     = useState(GROUNDS[0].value);
  // Their own name on the frame. On by default — the whole point of the entitlement is that the reel
  // markets the bakery, and somebody who wants that never has to find this control.
  const [includeName, setIncludeName] = useState(true);

  // Brand colour first, if they have one and it is not already in the list.
  const grounds = brandPrimary && !GROUNDS.some(g => g.value.toLowerCase() === brandPrimary.toLowerCase())
    ? [{ key: 'brand', label: 'Your colour', value: brandPrimary }, ...GROUNDS]
    : GROUNDS;

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

  const pick = (on) => ({
    padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
    border: `1.5px solid ${on ? '#2C4433' : '#D8E0DA'}`,
    background: on ? '#2C4433' : '#fff', color: on ? '#fff' : '#3D5A44',
  });
  const row = { display: 'flex', gap: 6, flexWrap: 'wrap' };
  const label = { fontSize: 11, fontWeight: 700, color: '#6E8577', letterSpacing: '0.04em',
                  textTransform: 'uppercase', marginBottom: 6 };

  return (
    // isMobile makes Panel a bottom sheet, which is what leaves the top of the screen free for the
    // 9:16 preview. On desktop it stays centred and the preview moves to the left instead.
    <Panel onClose={onClose} title="Record a reel" width={400} isMobile={isMobile}
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
          <div style={row}>
            {grounds.map(g => (
              <button key={g.key} onClick={() => setGround(g.value)} title={g.label}
                      aria-label={g.label} aria-pressed={ground === g.value}
                      style={{ width: 34, height: 34, borderRadius: 8, cursor: 'pointer', padding: 0,
                               background: g.value,
                               border: ground === g.value ? '3px solid #2C4433' : '1.5px solid #D8E0DA' }} />
            ))}
          </div>
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
          <div>
            <div style={label}>Name on the reel</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeName} onChange={e => setIncludeName(e.target.checked)}
                     style={{ width: 17, height: 17, accentColor: '#2C4433', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3D5A44' }}>
                {bakeryName.trim() ? `Show “${bakeryName.trim()}”` : 'Show my bakery name'}
              </span>
            </label>
            <div style={{ fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 }}>
              {includeName
                ? 'Burned into every frame, so the reel still carries your name wherever it gets reposted.'
                : 'This take records with nothing written on it — for a reel going out under somebody else’s name.'}
            </div>
          </div>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button disabled={btn.disabled}
                onClick={() => onRecord({ pingPong, seconds, arcDeg: arcDeg * dir })}
                style={{ flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
                         background: '#2C4433', color: '#fff', fontWeight: 700, fontSize: 14,
                         cursor: btn.disabled ? 'default' : 'pointer',
                         opacity: btn.disabled ? 0.5 : 1 }}>
          {btn.label}
        </button>
      </div>

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
