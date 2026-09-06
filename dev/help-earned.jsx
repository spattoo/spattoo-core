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
import { demoPoses } from '../src/designer/elementDemo.js';
import { ZONES, ZONE_LABELS } from '../src/designer/constants.js';
import ELEMENTS from './sample-elements.json';

/* OPTION 4 — "help that finds you".
 *
 * No help surface at all until somebody is visibly stuck. Drop the element somewhere it cannot go
 * and nothing happens — which is what the designer does TODAY, and is the whole problem. Do it
 * twice and the cake answers: the places it CAN go light up, with one line.
 *
 * The person who already knows never sees any of this, which is the entire argument for it. The
 * risk is the opposite one: someone who fails once, shrugs, and picks a different decoration is
 * never counted as stuck.
 *
 * ── WHAT THIS HARNESS FAKES ─────────────────────────────────────────────────────────────────────
 * Real struggle is a failed DRAG, and drag lives in CakeCanvas's interactive layer, which
 * CakePreview deliberately does not mount. So the drop targets here are buttons. The trigger logic —
 * two rejections, then reveal — is real; the gesture that fires it is not.
 */

const ALL_ZONES = [ZONES.TOP_SURFACE, ZONES.RIM, ZONES.SIDE, ZONES.MIDDLE_TIER, ZONES.BOARD];
const zoneName = z => (z === ZONES.RIM ? 'Rim' : ZONE_LABELS[z] ?? z);

const REVEAL_AFTER = 2;   // rejections before the cake speaks up

function EarnedDemo({ element }) {
  const { design, addSticker, resetDesign, addTier } = useCakeDesign();
  const [rejections, setRejections] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(null);
  const [placed, setPlaced] = useState(null);

  const poses = demoPoses(element);
  const allowed = poses.map(p => p.zone);

  useEffect(() => {
    resetDesign();
    for (let i = 1; i < 3; i++) addTier();
    setRejections(0); setRevealed(false); setPlaced(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  function tryDrop(zone) {
    if (allowed.includes(zone)) {
      const pose = poses.find(p => p.zone === zone);
      resetDesign();
      for (let i = 1; i < 3; i++) addTier();
      addSticker(element, zone, zone === ZONES.MIDDLE_TIER ? 1 : 0, pose.mode, {}, {
        id: 'earned', scale: (element.placement_config?.scale?.max ?? 2) * 0.7,
      });
      setPlaced(zone);
      return;
    }
    // Rejected. Deliberately SILENT the first time — that is today's behaviour, and it is the
    // baseline this option is measured against.
    setFlash(zone);
    setTimeout(() => setFlash(null), 400);
    const n = rejections + 1;
    setRejections(n);
    if (n >= REVEAL_AFTER) setRevealed(true);
  }

  return (
    <div style={s.card}>
      <div style={{ position: 'relative' }}>
        <CakePreview design={design} autoRotate={false} style={{ width: 360, aspectRatio: '1/1' }} />
        {revealed && (
          <div style={s.hint}>
            {element.name} goes {allowed.map(zoneName).map(z => z.toLowerCase()).join(', ')} — lit below.
          </div>
        )}
      </div>

      <div style={s.zoneRow}>
        {ALL_ZONES.map(z => {
          const ok = allowed.includes(z);
          return (
            <button key={z} onClick={() => tryDrop(z)}
                    style={{
                      ...s.zoneBtn,
                      ...(revealed && ok ? s.zoneLit : {}),
                      ...(flash === z ? s.zoneFlash : {}),
                      ...(placed === z ? s.zonePlaced : {}),
                    }}>
              {zoneName(z)}
            </button>
          );
        })}
      </div>

      <div style={s.meter}>
        {revealed
          ? <span style={{ color: '#3a4f46', fontWeight: 700 }}>Help appeared after {rejections} rejected drops.</span>
          : <span>Try dropping it somewhere it can't go. First one is silent — same as today.
              ({rejections}/{REVEAL_AFTER})</span>}
      </div>
    </div>
  );
}

function Harness() {
  const [i, setI] = useState(0);
  return (
    <div style={s.page}>
      <h1 style={s.h1}>Option 4 — help that finds you</h1>
      <p style={s.sub}>
        Nothing on screen until someone is stuck. Drop the element where it can't go: the first
        rejection is silent (today's behaviour), the second lights up everywhere it <i>can</i> go.
        Someone who already knows never sees it.
      </p>
      <div style={s.picker}>
        {ELEMENTS.map((e, n) => (
          <button key={e.id} onClick={() => setI(n)} style={{ ...s.tile, ...(n === i ? s.tileOn : {}) }}>
            <img src={e.thumbnail_url} alt="" style={s.thumb} />
            <span style={s.tileName}>{e.name}</span>
          </button>
        ))}
      </div>
      <EarnedDemo key={ELEMENTS[i].id} element={ELEMENTS[i]} />
      <p style={s.foot}>
        <b>Faked here:</b> real struggle is a failed <i>drag</i>, and drag lives in the interactive
        canvas this preview doesn't mount — so the drop targets are buttons. The trigger rule is real;
        the gesture is not. <b>The real risk:</b> someone who fails once, shrugs and picks a different
        decoration never gets counted as stuck.
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
  card: { background: '#fff', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12 },
  hint: { position: 'absolute', left: 8, right: 8, bottom: 10, padding: '7px 12px', borderRadius: 10,
          background: 'rgba(58,79,70,0.94)', color: '#fff', fontSize: 12.5, fontWeight: 600,
          textAlign: 'center', lineHeight: 1.4 },
  zoneRow: { display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  zoneBtn: { padding: '7px 13px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
             borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd8cf', background: '#fff',
             color: '#3a3a3a', fontFamily: 'inherit', transition: 'all 160ms' },
  zoneLit:   { borderColor: '#3a4f46', background: '#eaf0ec', color: '#3a4f46', boxShadow: '0 0 0 3px rgba(58,79,70,0.12)' },
  zoneFlash: { borderColor: '#d9534f', background: '#fdeded', color: '#b3261e' },
  zonePlaced:{ background: '#3a4f46', borderColor: '#3a4f46', color: '#fff' },
  meter: { fontSize: 12, color: '#8a8a8a', textAlign: 'center' },
  foot: { marginTop: 16, fontSize: 12, lineHeight: 1.6, color: '#8a6d1a', background: '#FFF6E5',
          borderRadius: 10, padding: '10px 12px' },
};

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
