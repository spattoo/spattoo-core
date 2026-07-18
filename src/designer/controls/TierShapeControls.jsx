import React from 'react';
import GlyphInput, { GLYPH_INPUT_PROPS } from './GlyphInput.jsx';
import { GLYPH_FAMILIES, isGlyphFamily } from '../geometry/glyphShape.js';
import { tierGeometry } from '../cakeShapes.js';

// A glyph family's per-tier edit field — the label, the config key it writes and the input charset all
// come from the family, so number and letter share ONE field.
const GLYPH_FIELD = {
  number: { label: 'Number',  ...GLYPH_INPUT_PROPS.number },
  letter: { label: 'Letters', ...GLYPH_INPUT_PROPS.letter },
};

// ── Per-tier SHAPE config controls ─────────────────────────────────────────────────────────────────
// ONE home for each family's own config knob (a glyph cake's typed characters, a rounded_rect's corner
// radius, …). Config-driven by the tier's RESOLVED family (`tierGeometry`, so it works whether the tier
// carries shapeFamily or resolves through the catalog), so a new shape's control is a branch HERE — not
// another block bolted into the 6k-line CakeDesigner.
//
// There is deliberately NO shape SWITCHER here: a cake's shape is chosen when you start it ("New" →
// ShapePicker), not swapped in place on an existing cake (which would silently reshape a design the
// customer already built). This panel only tunes the CURRENT shape.
export default function TierShapeControls({ tier, index, onShapeConfig, onCornerR }) {
  const family = tierGeometry(tier).family;
  return (
    <>
      {isGlyphFamily(family) && <GlyphField family={family} tier={tier} index={index} onShapeConfig={onShapeConfig} />}
      {family === 'rounded_rect' && <CornerRadius tier={tier} index={index} onCornerR={onCornerR} />}
    </>
  );
}

// Glyph cake (number or letter) — the customer TYPES the characters their cake is shaped like. A character
// is a recipe, not a pre-made shape: whatever they type, the footprint regenerates (weight/rounding are
// set on the starter). One field for both families, keyed by the family's config field + charset.
function GlyphField({ family, tier, index, onShapeConfig }) {
  const { label, ...inputProps } = GLYPH_FIELD[family];
  const textKey = GLYPH_FAMILIES[family].textKey;
  return (
    <div style={{ width: '100%', paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#3a3a44', marginBottom: 6 }}>{label}</div>
      <GlyphInput value={tier?.shapeConfig?.[textKey]} onChange={v => onShapeConfig(index, { [textKey]: v })} {...inputProps} />
    </div>
  );
}

// Corner radius — the rounded_rect family, the only footprint with square corners to round (the analytic
// rect path is the one that reads cornerR). A pointer-drag track, matching the other popup sliders.
function CornerRadius({ tier, index, onCornerR }) {
  const w = tier.width ?? 2.16, d = tier.depth ?? 1.56, h = tier.height ?? 0.85;
  const maxR = +(Math.min(w, d, h) / 2 * 0.9).toFixed(2);
  const val  = Math.min(tier.cornerR ?? 0, maxR);
  const pct  = maxR > 0 ? (val / maxR) * 100 : 0;
  const setFromEvent = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onCornerR(index, +(ratio * maxR).toFixed(3));
  };
  return (
    <div style={{ width: '100%', paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: 0.5 }}>Corner radius</span>
        <span style={{ fontSize: 10, color: '#888' }}>{val < 0.02 ? 'Sharp' : val.toFixed(2)}</span>
      </div>
      <div
        style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
        onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); setFromEvent(e); }}
        onPointerUp={e => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); }}
      >
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e0e0e0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#1a1a1a', borderRadius: 2 }} />
        </div>
        <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%', background: '#1a1a1a', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
