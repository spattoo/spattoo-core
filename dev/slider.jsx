import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Slider } from '../src/shared/Slider.jsx';

/* ── THE shared slider ───────────────────────────────────────────────────────────────────────────
 *
 * Five files hand-rolled `<input type="range">` before this existed. The case worth seeing is the
 * one none of them had: `value = null`, "not set". A range input always has a position, so a filter
 * built on one starts life filtering — the template panel's age filter would have answered "no
 * templates match" before anybody touched it, because no template in the catalogue has min_age 0.
 */
function Demo() {
  const [age, setAge] = useState(null);        // the real case: starts unset
  const [zoom, setZoom] = useState(1);         // an ordinary bounded number
  const [weight, setWeight] = useState(null);

  const card = { background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 14,
                 border: '1px solid #E7DFD5', maxWidth: 380 };

  return (
    <div>
      <div style={card}>
        <Slider label="Suits age" value={age} min={0} max={18} step={1}
                placeholder="any age" accent="#1a1a1a"
                fmt={(v) => (v >= 18 ? '18+' : `${v} yr${v === 1 ? '' : 's'}`)}
                onChange={setAge} onClear={() => setAge(null)} />
        <div style={{ fontSize: 11, color: '#8A8078', marginTop: 8 }}>
          value = {age === null ? 'null (filters nothing)' : String(age)}
        </div>
      </div>

      <div style={card}>
        <Slider label="Zoom" value={zoom} min={0.5} max={3} step={0.1}
                fmt={(v) => `${v.toFixed(1)}×`} onChange={setZoom} />
        <div style={{ fontSize: 11, color: '#8A8078', marginTop: 8 }}>always set — no placeholder, no "any"</div>
      </div>

      <div style={card}>
        <Slider label="Weight" value={weight} min={0} max={10} step={0.5}
                placeholder="any weight" fmt={(v) => `${v} kg+`}
                onChange={setWeight} onClear={() => setWeight(null)} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Demo />);
