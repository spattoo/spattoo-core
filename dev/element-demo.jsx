/* ⛔ PARKED 2026-08-10 — exploration, not a feature. Nothing imports this.
 *
 * Four approaches to per-element help were built and looked at side by side; none was convincing
 * enough to ship. Kept rather than deleted because the DERIVATION is the reusable part: help
 * generated from an element's own allowed_zones / placement_config / allowed_actions, needing no
 * per-element authoring. The verdict, what each option failed at, and what a next attempt should do
 * differently are in spattoo-docs/plans/element-help.md — read that before reviving any of this.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import ElementDemo from '../src/designer/preview/ElementDemo.jsx';
import { demoTimeline, demoActions } from '../src/designer/elementDemo.js';
import ELEMENTS from './sample-elements.json';

/* Harness for the element demo — REAL elements, pulled from the dev library (a GLB piping drop, a
 * shell border, a single-zone topper, a buried chocolate bar), so the timelines are the ones real
 * config produces rather than ones invented to make the feature look good.
 *
 * Not shipped: `files: ['dist','src']` in package.json, so dev/ never leaves this repo.
 */
function Harness() {
  const [i, setI] = useState(0);
  const [speed, setSpeed] = useState(1);
  const el = ELEMENTS[i];
  const timeline = demoTimeline(el);

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h1 style={s.h1}>Show me what this does</h1>
        <p style={s.sub}>
          No text is authored per element. Every pose below is derived from that element's own
          <code style={s.code}>allowed_zones</code> + <code style={s.code}>placement_config</code>,
          and performed through the designer's real <code style={s.code}>addSticker</code>.
        </p>
      </div>

      <div style={s.picker}>
        {ELEMENTS.map((e, n) => (
          <button key={e.id} onClick={() => setI(n)} style={{ ...s.tile, ...(n === i ? s.tileOn : {}) }}>
            <img src={e.thumbnail_url} alt="" style={s.thumb} />
            <span style={s.tileName}>{e.name}</span>
            <span style={s.tileZones}>{(e.allowed_zones || []).length} placements</span>
          </button>
        ))}
      </div>

      <div style={s.split}>
        <div style={s.demoCol}>
          <ElementDemo element={el} speed={speed} style={{ width: 380 }} />
          <div style={s.speedRow}>
            <span style={s.speedLabel}>Speed</span>
            {[[0.5, 'Slow'], [0.75, 'Slower'], [1, 'Normal'], [1.5, 'Fast']].map(([v, label]) => (
              <button key={v} onClick={() => setSpeed(v)}
                      style={{ ...s.speedBtn, ...(speed === v ? s.speedBtnOn : {}) }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={s.dataCol}>
          <div style={s.cardTitle}>What the config says</div>
          <pre style={s.pre}>{JSON.stringify({
            allowed_zones: el.allowed_zones,
            placement_config: el.placement_config,
            allowed_actions: el.allowed_actions,
          }, null, 1)}</pre>

          <div style={{ ...s.cardTitle, marginTop: 14 }}>What it becomes</div>
          <ol style={s.steps}>
            {timeline.map((t, n) => (
              <li key={n} style={s.step}>
                <b>{t.kind === 'size' ? 'size' : t.zone}</b> — {t.caption}
              </li>
            ))}
          </ol>
          <div style={{ ...s.cardTitle, marginTop: 14 }}>Verbs offered</div>
          <div style={s.chips}>
            {demoActions(el).map(a => <span key={a.key} style={s.chip}>{a.label}</span>)}
          </div>

          {/* The trap this feature had to route around, kept visible in the harness so nobody
              "improves" the demo by putting the description back in front of a customer. */}
          <div style={s.warn}>
            <b>Not used:</b> <code style={s.code}>description</code> reads like prose and is a keyword
            bag for search — present on all 94 elements. Shown to a customer it is comma salad.
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:   { padding: 28, maxWidth: 1100, margin: '0 auto' },
  head:   { marginBottom: 18 },
  h1:     { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  sub:    { fontSize: 13.5, lineHeight: 1.6, color: '#5a5a5a', maxWidth: 680 },
  code:   { background: '#e2ded5', borderRadius: 4, padding: '1px 5px', fontSize: 12 },
  picker: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  tile:   {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer',
    width: 116, padding: 10, borderRadius: 12, background: '#fff',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'transparent', fontFamily: 'inherit',
  },
  tileOn: { borderColor: '#3a4f46' },
  thumb:  { width: 60, height: 60, objectFit: 'contain' },
  tileName:  { fontSize: 11.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.25 },
  tileZones: { fontSize: 10.5, color: '#8a8a8a' },
  split:  { display: 'flex', gap: 26, alignItems: 'flex-start', flexWrap: 'wrap' },
  demoCol: { background: '#fff', borderRadius: 16, padding: 14 },
  speedRow:   { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'center' },
  speedLabel: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8a8a8a', marginRight: 2 },
  speedBtn:   { padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd8cf', background: '#fff', color: '#5a5a5a', fontFamily: 'inherit' },
  speedBtnOn: { background: '#3a4f46', borderColor: '#3a4f46', color: '#fff' },
  dataCol: { flex: '1 1 320px', minWidth: 300 },
  cardTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8a8a8a', marginBottom: 6 },
  pre:    { background: '#fff', borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 1.5, maxHeight: 240, overflow: 'auto' },
  steps:  { margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 },
  step:   { color: '#3a3a3a' },
  chips:  { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip:   { padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: '#fff', color: '#5a5a5a' },
  warn:   { marginTop: 16, padding: '10px 12px', borderRadius: 10, background: '#FFF6E5', color: '#8a6d1a', fontSize: 12, lineHeight: 1.55 },
};

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
