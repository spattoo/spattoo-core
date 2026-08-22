import { useState } from 'react';
import { Panel, PanelBlock } from '../../shared/Panel.jsx';

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

const LENGTHS = [2.5, 3.5, 4.5, 6];
const SWEEPS  = [90, 120, 150, 180];

export default function ReelOptions({ open, onClose, onRecord, busy }) {
  const [pingPong, setPingPong] = useState(true);
  // +1 turns one way, -1 the other. The camera code takes a signed arc, so this is a multiplier
  // rather than a branch.
  const [dir, setDir]           = useState(1);
  const [seconds, setSeconds]   = useState(4.5);
  const [arcDeg, setArcDeg]     = useState(120);

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
    <Panel onClose={onClose} title="Record a reel" width={400}
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

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button disabled={busy}
                onClick={() => onRecord({ pingPong, seconds, arcDeg: arcDeg * dir })}
                style={{ flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
                         background: '#2C4433', color: '#fff', fontWeight: 700, fontSize: 14,
                         cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Recording…' : `Record ${seconds}s`}
        </button>
      </div>
      {/* Whatever is on screen is in every frame — and unlike the Playwright script, there is no
          pause here in which to notice. */}
      <div style={{ fontSize: 11.5, color: '#6E8577', lineHeight: 1.5 }}>
        Deselect everything first — a selection outline or a drag handle will be in every frame.
      </div>
    </Panel>
  );
}
