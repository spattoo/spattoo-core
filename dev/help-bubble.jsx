/* ⛔ PARKED 2026-08-10 — exploration, not a feature. Nothing imports this.
 *
 * Four approaches to per-element help were built and looked at side by side; none was convincing
 * enough to ship. Kept rather than deleted because the DERIVATION is the reusable part: help
 * generated from an element's own allowed_zones / placement_config / allowed_actions, needing no
 * per-element authoring. The verdict, what each option failed at, and what a next attempt should do
 * differently are in spattoo-docs/plans/element-help.md — read that before reviving any of this.
 */
import React, { useEffect, useState } from 'react';
import './scene.js';   // light it the way production does — see the file
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { demoPoses, demoActions } from '../src/designer/elementDemo.js';
import { ZONES, ZONE_LABELS } from '../src/designer/constants.js';
import ELEMENTS from './sample-elements.json';

/* OPTION 2 — "test-drive bubble".
 *
 * A cake of your own to ruin. The element is already on it; shove it about, change its mind, and
 * when you like what you have, "Use it on my cake" transfers exactly that — same zone, same size,
 * same tilt — onto the real design. Nothing you do in here can be wrong, and nothing needs undoing.
 *
 * The argument for it is that it is the only one of the four that teaches by DOING rather than by
 * watching. The argument against is in the code below: it is a second placement surface, and the
 * day it disagrees with the real one it becomes a machine for teaching things that aren't true.
 *
 * ── WHAT THIS HARNESS FAKES ─────────────────────────────────────────────────────────────────────
 * The real bubble would be direct manipulation — drag the element with a finger. Drag lives in
 * CakeCanvas's interactive layer, which CakePreview does not mount, so the controls here are chips
 * and sliders. Everything they drive is real: the zone list, the poses, and the size bounds are the
 * element's own, and placement runs through the designer's addSticker.
 */

const zoneName = z => (z === ZONES.RIM ? 'Rim' : ZONE_LABELS[z] ?? z);

function Bubble({ element, onUse }) {
  const { design, addSticker, updateSticker, resetDesign, addTier } = useCakeDesign();
  const poses = demoPoses(element);
  const range = element.placement_config?.scale ?? {};
  const [zone, setZone]   = useState(poses[0]?.zone ?? ZONES.TOP_SURFACE);
  const [scale, setScale] = useState((range.max ?? 2) * 0.6);
  const [tilt, setTilt]   = useState(0);
  const [spin, setSpin]   = useState(0);
  const canTilt = element.allowed_actions?.tilt === true;

  const wantsMiddle = poses.some(p => p.zone === ZONES.MIDDLE_TIER);

  // Re-seat whenever the ZONE changes — the pose is the zone's, not a setting that survives a move.
  useEffect(() => {
    const pose = poses.find(p => p.zone === zone) ?? poses[0];
    resetDesign();
    for (let i = 1; i < (wantsMiddle ? 3 : 1); i++) addTier();
    addSticker(element, zone, zone === ZONES.MIDDLE_TIER ? 1 : 0, pose.mode, {}, { id: 'bubble', scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, zone]);

  // Size / tilt / spin are live edits on the seated instance — the same calls the real toolbar makes.
  useEffect(() => { updateSticker('bubble', { scale }); /* eslint-disable-line */ }, [scale]);
  useEffect(() => { updateSticker('bubble', { tiltAngle: tilt }); /* eslint-disable-line */ }, [tilt]);
  useEffect(() => { updateSticker('bubble', { rotation: spin }); /* eslint-disable-line */ }, [spin]);

  return (
    <div style={s.bubble}>
      <div style={s.bubbleHead}>
        <span style={s.bubbleTitle}>Try it — nothing here touches your cake</span>
      </div>

      <CakePreview design={design} autoRotate={false} style={{ width: 340, aspectRatio: '1/1' }} />

      <div style={s.controls}>
        <div style={s.ctrlRow}>
          <span style={s.ctrlLabel}>Where</span>
          <div style={s.chipWrap}>
            {poses.map(p => (
              <button key={p.zone} onClick={() => setZone(p.zone)}
                      style={{ ...s.chip, ...(zone === p.zone ? s.chipOn : {}) }}>{zoneName(p.zone)}</button>
            ))}
          </div>
        </div>

        {range.min != null && range.max != null && (
          <label style={s.ctrlRow}>
            <span style={s.ctrlLabel}>Size</span>
            {/* Bounds are the ELEMENT's, so the slider physically cannot reach a size it disallows. */}
            <input type="range" min={range.min} max={range.max} step={0.05} value={scale}
                   onChange={e => setScale(Number(e.target.value))} style={{ flex: 1 }} />
          </label>
        )}

        {canTilt && (
          <label style={s.ctrlRow}>
            <span style={s.ctrlLabel}>Tilt</span>
            <input type="range" min={-0.6} max={0.6} step={0.02} value={tilt}
                   onChange={e => setTilt(Number(e.target.value))} style={{ flex: 1 }} />
          </label>
        )}

        <label style={s.ctrlRow}>
          <span style={s.ctrlLabel}>Turn</span>
          <input type="range" min={0} max={6.28} step={0.05} value={spin}
                 onChange={e => setSpin(Number(e.target.value))} style={{ flex: 1 }} />
        </label>
      </div>

      <button style={s.use} onClick={() => onUse({ zone, scale, tilt, spin })}>
        Use it on my cake
      </button>
      <div style={s.verbs}>{demoActions(element).map(a => a.label).join(' · ')}</div>
    </div>
  );
}

function Harness() {
  const [i, setI] = useState(0);
  const [used, setUsed] = useState(null);
  const el = ELEMENTS[i];

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Option 2 — test-drive bubble</h1>
      <p style={s.sub}>
        A cake of your own to ruin. Learning by doing rather than by watching — and when you like it,
        the settings transfer to the real cake instead of being thrown away.
      </p>

      <div style={s.picker}>
        {ELEMENTS.map((e, n) => (
          <button key={e.id} onClick={() => { setI(n); setUsed(null); }}
                  style={{ ...s.tile, ...(n === i ? s.tileOn : {}) }}>
            <img src={e.thumbnail_url} alt="" style={s.thumb} />
            <span style={s.tileName}>{e.name}</span>
          </button>
        ))}
      </div>

      <Bubble key={el.id} element={el} onUse={setUsed} />

      {used && (
        <div style={s.receipt}>
          Would place on the real cake: <b>{zoneName(used.zone)}</b>, size <b>{used.scale.toFixed(2)}</b>,
          tilt <b>{used.tilt.toFixed(2)}</b>, turn <b>{used.spin.toFixed(2)}</b> — the exact instance
          you just built, not a fresh default.
        </div>
      )}

      <p style={s.foot}>
        <b>Faked here:</b> the real bubble is direct manipulation — dragging with a finger. Drag lives
        in the interactive canvas this preview doesn't mount, so these are chips and sliders. The
        bounds, poses and placement are real. <b>The real cost:</b> this is a SECOND placement
        surface, and the day it disagrees with the designer it teaches things that aren't true.
      </p>
    </div>
  );
}

const s = {
  page: { padding: 28, maxWidth: 760, margin: '0 auto' },
  h1:   { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  sub:  { fontSize: 13.5, lineHeight: 1.6, color: '#5a5a5a', marginBottom: 18 },
  picker: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
  tile: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer',
          width: 110, padding: 9, borderRadius: 12, background: '#fff', fontFamily: 'inherit',
          borderWidth: 2, borderStyle: 'solid', borderColor: 'transparent' },
  tileOn: { borderColor: '#3a4f46' },
  thumb: { width: 54, height: 54, objectFit: 'contain' },
  tileName: { fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.25 },
  bubble: { background: '#fff', borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 10, boxShadow: '0 10px 34px rgba(0,0,0,0.10)', maxWidth: 400,
            margin: '0 auto' },
  bubbleHead: { width: '100%', textAlign: 'center' },
  bubbleTitle: { fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: '#8a8a8a' },
  controls: { width: '100%', display: 'flex', flexDirection: 'column', gap: 9 },
  ctrlRow: { display: 'flex', alignItems: 'center', gap: 10 },
  ctrlLabel: { fontSize: 11.5, fontWeight: 800, color: '#8a8a8a', width: 46, flexShrink: 0 },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  chip: { padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd8cf', background: '#fff',
          color: '#3a3a3a', fontFamily: 'inherit' },
  chipOn: { background: '#3a4f46', borderColor: '#3a4f46', color: '#fff' },
  use: { padding: '11px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', width: '100%',
         background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' },
  verbs: { fontSize: 11, color: '#a0a0a0', textAlign: 'center' },
  receipt: { marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#eaf0ec',
             color: '#2f4038', fontSize: 12.5, lineHeight: 1.55 },
  foot: { marginTop: 16, fontSize: 12, lineHeight: 1.6, color: '#8a6d1a', background: '#FFF6E5',
          borderRadius: 10, padding: '10px 12px' },
};

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
