import React from 'react';

/* ── THE size control ────────────────────────────────────────────────────────────────────────────
 *
 * One dial for every size a customer sets: piping, the hero chooser, scatter cards, ages, drips,
 * and now the acrylic topper. INVARIANTS #5b and the root CLAUDE.md both name it as the only one —
 * "never a row of hand-rolled swatches" applies here as much as to ColorWheel.
 *
 * Lifted out of CakeDesigner.jsx unchanged so callers outside that file can have it. It was reachable
 * only by living in the same 11k-line module, which is a reason to copy it and the reason this file
 * exists instead. Bounds come from placement_config.scale via placement.js `scaleRangeOf` — this
 * component decides nothing about range, only how it is dragged.
 */
// Compact radial size control: a 280° arc whose band tapers thin → thick (= small →
// large), so it reads like a piping nozzle widening. Drag or tap anywhere on the arc;
// the filled portion shows the current value and the centre shows the number. Replaces
// the full-width linear slider so Color + Size fit a short row and the popup stays tight.
export function SizeDial({ size = 1, min = 0.5, max = 2, step = 0.05, onChange }) {
  const CX = 24, CY = 24, R_IN = 12, W_MIN = 2, W_MAX = 8;
  const A_START = -140 * Math.PI / 180;   // lower-left (thin end)
  const A_SWEEP =  280 * Math.PI / 180;   // sweeps up over the top to lower-right (gap at bottom)
  const t = Math.max(0, Math.min(1, (size - min) / (max - min)));

  const angOf = u => A_START + u * A_SWEEP;
  const pt    = (u, r) => [CX + r * Math.sin(angOf(u)), CY - r * Math.cos(angOf(u))];
  // Filled band from uA→uB: inner edge at R_IN, outer edge growing with u (the taper).
  const band = (uA, uB) => {
    const N = Math.max(2, Math.round(40 * Math.abs(uB - uA)));
    const seg = [];
    for (let i = 0; i <= N; i++) { const u = uA + (uB - uA) * i / N; const [x, y] = pt(u, R_IN); seg.push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`); }
    for (let i = 0; i <= N; i++) { const u = uB - (uB - uA) * i / N; const [x, y] = pt(u, R_IN + W_MIN + (W_MAX - W_MIN) * u); seg.push(`L${x.toFixed(2)} ${y.toFixed(2)}`); }
    return seg.join(' ') + ' Z';
  };
  const knob = pt(t, R_IN + (W_MIN + (W_MAX - W_MIN) * t) / 2);

  const setFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width  * 48;
    const py = (e.clientY - rect.top)  / rect.height * 48;
    const a  = Math.atan2(px - CX, CY - py);          // angle from top, clockwise
    const u  = Math.max(0, Math.min(1, (a - A_START) / A_SWEEP));
    // Clamp to [min,max]: a step that doesn't evenly divide (max-min) can round the top notch past max.
    onChange?.(+(Math.min(max, Math.max(min, min + Math.round(u * (max - min) / step) * step))).toFixed(2));
  };

  return (
    <div style={{ width: 46, height: 46, position: 'relative', flexShrink: 0, cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
      onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setFromEvent(e); }}
      onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={e => e.currentTarget.releasePointerCapture(e.pointerId)}>
      <svg viewBox="0 0 48 48" width={46} height={46} style={{ display: 'block', pointerEvents: 'none' }}>
        <path d={band(0, 1)} fill="#e6e0e3" />
        {t > 0.001 && <path d={band(0, t)} fill="#1a1a1a" />}
        <circle cx={knob[0]} cy={knob[1]} r={4.5} fill="#fff" stroke="#1a1a1a" strokeWidth={2} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#1a1a1a', fontFamily: "'Quicksand',sans-serif", pointerEvents: 'none' }}>
        {size.toFixed(1)}
      </span>
    </div>
  );
}
