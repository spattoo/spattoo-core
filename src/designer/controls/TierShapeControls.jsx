import React from 'react';
import ChipPicker from './ChipPicker.jsx';
import { tierGeometry } from '../cakeShapes.js';

// ── Per-tier SHAPE controls ──────────────────────────────────────────────────────────────────────
// ONE home for everything that shapes a tier: the Shape picker plus each family's own config knob (a
// number cake's digits, a rounded_rect's corner radius, …). Config-driven by the tier's RESOLVED family
// (`tierGeometry`, so it works whether the tier carries shapeFamily or resolves through the catalog), so
// a new shape's control is a branch HERE — not another block bolted into the 6k-line CakeDesigner. That
// file was accreting a per-shape control every time a family gained a knob; this keeps shape UI in one
// place, the same way the geometry lives in one place (geometry/shapes.js, geometry/numberShape.js).
export default function TierShapeControls({ tier, index, shapeOptions, onShape, onShapeConfig, onCornerR }) {
  const family = tierGeometry(tier).family;
  return (
    <>
      {shapeOptions.length > 1 && (
        <ChipPicker
          label="Shape"
          options={shapeOptions.map(sh => ({ value: sh.key, label: sh.label }))}
          value={tier?.shape ?? 'round'}
          onChange={key => onShape(index, key)}
        />
      )}

      {family === 'number' && <NumberField tier={tier} index={index} onShapeConfig={onShapeConfig} />}
      {family === 'rounded_rect' && <CornerRadius tier={tier} index={index} onCornerR={onCornerR} />}
    </>
  );
}

// Number cake — the customer TYPES the number their cake is shaped like. A digit is a recipe, not a
// pre-made shape: whatever they type, the footprint regenerates (weight/rounding are set on the starter).
function NumberField({ tier, index, onShapeConfig }) {
  return (
    <div style={{ width: '100%', paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#3a3a44', marginBottom: 6 }}>Number</div>
      <input
        inputMode="numeric" maxLength={4} placeholder="e.g. 4"
        value={tier?.shapeConfig?.digits ?? ''}
        onChange={e => onShapeConfig(index, { digits: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #d9d9e0', background: '#fff', fontSize: 20, fontWeight: 800, fontFamily: 'inherit', color: '#1a1a1a', textAlign: 'center', letterSpacing: 3 }}
      />
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
