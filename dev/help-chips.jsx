import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { demoActions, demoPoses } from '../src/designer/elementDemo.js';
import { ZONES } from '../src/designer/constants.js';
import ELEMENTS from './sample-elements.json';

/* OPTION 3 — "chips that perform".
 *
 * The conventional shape (a row of capability chips) with the unconventional bit: tapping a chip
 * DOES the thing to the element in front of you. "Tilt it" tilts it. Nothing is explained.
 *
 * Cheapest of the four to build and the only one that is always visible without a gesture — which is
 * also its weakness: it is a toolbar, and people stop seeing toolbars.
 */

// A side-on cake, with the zones this element is allowed in lit. Answers "where does it go?" as a
// glance instead of a 9-second performance — the thing option 1 spends its whole loop on.
function ZoneMap({ zones }) {
  const on = z => zones.includes(z);
  const LIT = '#3a4f46', OFF = '#eceae4', EDGE = '#d5d0c6';
  // Every zone is drawn ALWAYS, unlit ones in pale grey with a stroke between them. Filling only the
  // lit ones merged a five-zone element into one dark silhouette — it read as a logo, not a map.
  const z = (cond, extra = {}) => ({ fill: cond ? LIT : OFF, stroke: EDGE, strokeWidth: 1, ...extra });
  return (
    <svg viewBox="0 0 120 100" style={{ width: 132 }}>
      <ellipse cx="60" cy="88" rx="50" ry="7"   {...z(on(ZONES.BOARD))} />
      <rect x="24" y="56" width="72" height="26" rx="2" {...z(on(ZONES.SIDE))} />
      <ellipse cx="60" cy="56" rx="36" ry="6"   {...z(on(ZONES.SIDE))} />
      <rect x="38" y="30" width="44" height="22" rx="2" {...z(on(ZONES.MIDDLE_TIER))} />
      <ellipse cx="60" cy="30" rx="22" ry="5"   {...z(on(ZONES.TOP_SURFACE))} />
      {/* the rim is an EDGE, so it reads as a ring rather than a filled area */}
      <ellipse cx="60" cy="30" rx="22" ry="5" fill="none"
               stroke={on(ZONES.RIM) ? LIT : EDGE} strokeWidth={on(ZONES.RIM) ? 3.5 : 1} />
    </svg>
  );
}

function ChipDemo({ element }) {
  const { design, addSticker, updateSticker, removeSticker, resetDesign } = useCakeDesign();
  const [active, setActive] = useState(null);
  const raf = useRef(null);
  const id = 'chip-demo';
  const zone = demoPoses(element)[0]?.zone ?? ZONES.TOP_SURFACE;
  const mode = demoPoses(element)[0]?.mode;
  const base = element.placement_config?.r ?? 1;
  // Same rule option 1 settled on — 70% up the element's OWN authored range. At the default `r` a
  // piping drop is a few pixels and tapping "Resize it" changes nothing you can see.
  const sc = element.placement_config?.scale ?? {};
  const startScale = (sc.min != null && sc.max != null) ? sc.min + (sc.max - sc.min) * 0.7 : base * 1.6;

  useEffect(() => {
    resetDesign();
    addSticker(element, zone, 0, mode, {}, { id, scale: startScale });
    setActive(null);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  // Every chip is the SAME shape: animate one field over ~900ms and settle back. Written once rather
  // than five times, so a new verb is a new row in this table and nothing else.
  const MOVES = {
    resize: { field: 'scale',     from: startScale, to: (sc.max ?? base * 3) },
    tilt:   { field: 'tiltAngle', from: 0, to: 0.5 },
    move:   { field: 'theta',     from: 0, to: 1.1 },
    color:  { field: 'color',     swatches: ['#e8b4c8', '#f2d16b', '#8fbf9f'] },
    duplicate: { dup: true },
  };

  function perform(key) {
    if (raf.current) cancelAnimationFrame(raf.current);
    setActive(key);
    const m = MOVES[key];
    if (!m) return;

    if (m.dup) {
      addSticker(element, zone, 0, mode, {}, { id: id + '-2', scale: startScale });
      setTimeout(() => removeSticker(id + '-2'), 1400);
      return;
    }
    if (m.swatches) {
      m.swatches.forEach((c, i) => setTimeout(() => updateSticker(id, { color: c }), i * 380));
      return;
    }
    const t0 = performance.now(), DUR = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / DUR);
      // Out and back, so the element ends where it started and the demo can be replayed forever.
      const p = Math.sin(t * Math.PI);
      updateSticker(id, { [m.field]: m.from + (m.to - m.from) * p });
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  const actions = demoActions(element);
  return (
    <div style={s.card}>
      <CakePreview design={design} autoRotate={false} style={{ width: 360, aspectRatio: '1/1' }} />
      <div style={s.chipRow}>
        {actions.map(a => (
          <button key={a.key} onClick={() => perform(a.key)}
                  style={{ ...s.chip, ...(active === a.key ? s.chipOn : {}) }}>{a.label}</button>
        ))}
      </div>
      <div style={s.mapRow}>
        <ZoneMap zones={element.allowed_zones ?? []} />
        <div style={s.mapText}>
          <b>{(element.allowed_zones ?? []).length} places</b> it can go — lit above.
          <div style={s.mapHint}>Tap a chip; it happens to the cake.</div>
        </div>
      </div>
    </div>
  );
}

function Harness() {
  const [i, setI] = useState(0);
  return (
    <div style={s.page}>
      <h1 style={s.h1}>Option 3 — chips that perform</h1>
      <p style={s.sub}>
        Always visible, no gesture to discover, and tapping a chip <b>does</b> the thing rather than
        describing it. The zone map answers "where does it go?" instantly — the question option 1
        spends nine seconds performing.
      </p>
      <div style={s.picker}>
        {ELEMENTS.map((e, n) => (
          <button key={e.id} onClick={() => setI(n)} style={{ ...s.tile, ...(n === i ? s.tileOn : {}) }}>
            <img src={e.thumbnail_url} alt="" style={s.thumb} />
            <span style={s.tileName}>{e.name}</span>
          </button>
        ))}
      </div>
      <ChipDemo key={ELEMENTS[i].id} element={ELEMENTS[i]} />
      <p style={s.foot}>
        Honest limits: "Move it" spins the element around the wall rather than following a finger, and
        chips are a toolbar — the thing people stop seeing after a week.
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
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  chip: { padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd8cf', background: '#fff',
          color: '#3a3a3a', fontFamily: 'inherit' },
  chipOn: { background: '#3a4f46', borderColor: '#3a4f46', color: '#fff' },
  mapRow: { display: 'flex', alignItems: 'center', gap: 14, borderTop: '1px solid #eee', paddingTop: 12, width: '100%' },
  mapText: { fontSize: 12.5, color: '#3a3a3a', lineHeight: 1.5 },
  mapHint: { fontSize: 11.5, color: '#8a8a8a', marginTop: 2 },
  foot: { marginTop: 16, fontSize: 12, lineHeight: 1.6, color: '#8a6d1a', background: '#FFF6E5',
          borderRadius: 10, padding: '10px 12px' },
};

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
