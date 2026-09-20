import React from 'react';
import { INK } from '../../shared/tokens.js';

/* ── THE offset dial ─────────────────────────────────────────────────────────────────────────────
 *
 * A dial for a SIGNED NUDGE away from zero: how far a piping ring sits in or out from where it
 * would naturally fall, how far up or down a wall a border rides. Zero is the middle, and the
 * filled band grows left or right from it.
 *
 * ⚠️ WHY THIS IS NOT SizeDial WITH DIFFERENT PROPS. SizeDial is THE size control and its own header
 * says so. Three things there are size-specific and would be lies about an offset:
 *
 *   · its band TAPERS thin → thick, deliberately, so it "reads like a piping nozzle widening".
 *     That taper MEANS small → large. An offset has no small end — it has two directions.
 *   · it fills from one end, so the resting state of a centred value looks half-applied.
 *   · it prints `size.toFixed(1)`, so 0.00 shows as "0.0" and the sign — the entire point of an
 *     offset — is thrown away.
 *
 * Reusing it would have been the letter of CLAUDE.md rule 1 (reuse what exists) against the spirit
 * of INVARIANTS #14 (an icon means the same thing everywhere). Two dials that look alike and mean
 * different things is the thing #14 exists to stop.
 *
 * Same 46px footprint, same drag-or-tap gesture, same 280° sweep as SizeDial, so the two sit in a
 * row together without one looking like a bigger deal than the other.
 *
 * Bounds come from the CALLER and are recomputed per ring — see rimRadialTravel / ringHeightTravel
 * in CakeDesigner.jsx. This component decides nothing about range, only how it is dragged.
 */
export function OffsetDial({ value = 0, min = -1, max = 1, step = 0.05, label, onChange }) {
  const CX = 24, CY = 24, R_IN = 12, W = 5;
  const A_START = -140 * Math.PI / 180;   // lower-left
  const A_SWEEP =  280 * Math.PI / 180;   // over the top to lower-right (gap at the bottom)

  /* ⚠️ A RING WITH NOWHERE LEFT TO GO IS A REAL STATE, NOT AN EDGE CASE. clampYo floors yoMax at
   * yoMin, and rimRadialTravel does the same, so a ring packed between two neighbours legitimately
   * reports min === max. (v - min) / (max - min) is NaN there, which paints nothing at all — a
   * control that has silently vanished rather than one that says "this cannot move". So: span 0
   * pins the knob dead centre and the dial simply does not respond. */
  const span = max - min;
  const frac = span > 1e-9 ? (value - min) / span : 0.5;
  const t    = Math.max(0, Math.min(1, frac));
  // Where zero sits on the arc. Usually the middle, but the travel either side is rarely symmetric —
  // a ring hard against its neighbour has far more room one way — so this is computed, not assumed.
  const zero = span > 1e-9 ? Math.max(0, Math.min(1, (0 - min) / span)) : 0.5;

  const angOf = u => A_START + u * A_SWEEP;
  const pt    = (u, r) => [CX + r * Math.sin(angOf(u)), CY - r * Math.cos(angOf(u))];
  const band  = (uA, uB) => {
    const [a, b] = uA <= uB ? [uA, uB] : [uB, uA];
    const N = Math.max(2, Math.round(40 * (b - a)));
    const seg = [];
    for (let i = 0; i <= N; i++) { const [x, y] = pt(a + (b - a) * i / N, R_IN);     seg.push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`); }
    for (let i = 0; i <= N; i++) { const [x, y] = pt(b - (b - a) * i / N, R_IN + W); seg.push(`L${x.toFixed(2)} ${y.toFixed(2)}`); }
    return seg.join(' ') + ' Z';
  };
  const knob = pt(t, R_IN + W / 2);

  const setFromEvent = (e) => {
    if (span <= 1e-9) return;                      // pinned: nothing to choose
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width  * 48;
    const py = (e.clientY - rect.top)  / rect.height * 48;
    const a  = Math.atan2(px - CX, CY - py);       // angle from top, clockwise
    const u  = Math.max(0, Math.min(1, (a - A_START) / A_SWEEP));
    // Snap to `step` from ZERO rather than from min, so the detent a baker feels is the one that
    // matters — coming back to exactly 0 — and not an arbitrary offset from the lower bound.
    const raw = min + u * span;
    const snapped = Math.round(raw / step) * step;
    onChange?.(+Math.min(max, Math.max(min, snapped)).toFixed(2));
  };

  const pinned = span <= 1e-9;
  return (
    <div role="slider" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
      style={{ width: 46, height: 46, position: 'relative', flexShrink: 0,
               cursor: pinned ? 'default' : 'pointer', touchAction: 'none', userSelect: 'none',
               opacity: pinned ? 0.45 : 1 }}
      onPointerDown={e => { if (pinned) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
      onPointerMove={e => { if (pinned || !e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setFromEvent(e); }}
      onPointerUp={e => { if (pinned) return; e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={e => { if (!pinned) e.currentTarget.releasePointerCapture(e.pointerId); }}>
      <svg viewBox="0 0 48 48" width={46} height={46} style={{ display: 'block', pointerEvents: 'none' }}>
        <path d={band(0, 1)} fill="#e6e0e3" />
        {/* Filled FROM zero toward the value, in whichever direction that is. */}
        {Math.abs(t - zero) > 0.004 && <path d={band(zero, t)} fill={INK} />}
        {/* The zero mark, so "back to neutral" is a place you can see and aim at. */}
        <circle cx={pt(zero, R_IN + W / 2)[0]} cy={pt(zero, R_IN + W / 2)[1]} r={1.6} fill="#b29aa2" />
        <circle cx={knob[0]} cy={knob[1]} r={4.5} fill="#fff" stroke={INK} strokeWidth={2} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                     fontSize: 9, fontWeight: 700, color: INK, fontFamily: "'Quicksand',sans-serif", pointerEvents: 'none' }}>
        {/* ⚠️ The SIGN is kept. It is the whole difference between in and out, up and down. */}
        {value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2)}
      </span>
    </div>
  );
}
