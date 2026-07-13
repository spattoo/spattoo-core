// Visual bench for the cake-shape kernel: every shape in the catalog, rendered by the REAL cake
// renderer (CakePreview → toCanvasConfig → CakeTier) with the designer's default buttercream.
// http://localhost:5173/shapes.html
//
// The point is the two on the left: `round` and `rect` must look EXACTLY as they always have. Adding
// shapes is only safe if it changes nothing about the cakes that already exist.

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CakePreview, cakeShapeList } from '../src/index.js';

function Bench() {
  const [tiers, setTiers] = useState(2);
  const shapes = cakeShapeList();

  const design = key => ({
    tiers: Array.from({ length: tiers }, (_, i) => ({
      shape: key,
      width:  2.4 - i * 0.6,
      depth:  1.9 - i * 0.5,
      radius: (2.4 - i * 0.6) / 2,
      height: i === 0 ? 1.45 : 1.0,
      color: '#f5b8c8',
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
