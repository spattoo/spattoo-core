// Visual bench for the cake-shape kernel: every shape in the catalog, rendered by the REAL cake
// renderer (CakePreview → toCanvasConfig → CakeTier) with the designer's default buttercream.
// http://localhost:5173/shapes.html
//
// The point is the two on the left: `round` and `rect` must look EXACTLY as they always have. Adding
// shapes is only safe if it changes nothing about the cakes that already exist.

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CakePreview, cakeShapeList, applyCakeShapeConfig } from '../src/index.js';

// The bench shows the CURVES the code ships, at their default proportions — NOT the catalog, which is
// authored in the admin studio and holds only `round` + `rect` until somebody makes a heart. So it
// authors one of each locally, purely to look at them.
applyCakeShapeConfig([
  { key: 'square',    label: 'Square',    family: 'rounded_rect', config: { square: true } },
  { key: 'heart',     label: 'Heart',     family: 'heart',        config: { plump: 1, cleft: 1 } },
  { key: 'butterfly', label: 'Butterfly', family: 'butterfly',    config: { wing: 1 } },
  { key: 'hexagon',   label: 'Hexagon',   family: 'polygon',      config: { sides: 6, rotation: 0 } },
  { key: 'oval',      label: 'Oval',      family: 'oval',         config: {} },
]);

function Bench() {
  const [tiers, setTiers] = useState(2);
  const [frosting, setFrosting] = useState('fondant');
  const shapes = cakeShapeList();

  const design = key => ({
    tiers: Array.from({ length: tiers }, (_, i) => ({
      shape: key,
      width:  2.4 - i * 0.6,
      depth:  2.4 - i * 0.6,
      radius: (2.4 - i * 0.6) / 2,
      height: i === 0 ? 1.45 : 1.0,
      color: '#e0466b',
      frostingType: frosting,
      // Chocolate-glaze marble palette (dark → milk → cream) so the bench shows the poured marble on
      // every shape; a single colour would render a solid glaze. Only present for the glaze finish.
      ...(frosting === 'glaze' && { glaze: { colors: ['#2a1810', '#8a5a30', '#efd9b8'], flow: 2.6, warp: 1.1, contrast: 3.2, streak: 0.12 } }),
      topPipings: [], bottomPipings: [], creamLayers: [],
    })),
    texts: [], ages: [], stickers: [], writing: null, piping: [],
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <h1 style={{ fontSize: 18 }}>Cake shapes — the real renderer</h1>
      <label style={{ fontSize: 13 }}>
        Tiers: {tiers}{' '}
        <input type="range" min={1} max={4} value={tiers} onChange={e => setTiers(+e.target.value)} />
      </label>{' '}
      <label style={{ fontSize: 13 }}>
        Frosting:{' '}
        <select value={frosting} onChange={e => setFrosting(e.target.value)}>
          <option value="fondant">fondant (rolled rim)</option>
          <option value="buttercream">buttercream (sharp rim)</option>
          <option value="glaze">glaze marble (rolled rim)</option>
        </select>
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {shapes.map(sh => (
          <div key={sh.key} style={{ width: 260 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {sh.label} <span style={{ color: '#888', fontWeight: 400 }}>({sh.family})</span>
            </div>
            <div style={{ width: 260, height: 260, border: '1px solid #ddd', borderRadius: 10, background: '#fafafa' }}>
              <CakePreview design={design(sh.key)} autoRotate={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Bench />);
