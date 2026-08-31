import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import GarnishStudio from '../src/designer/garnish/GarnishStudio.jsx';

/* The studio, plus whatever it last saved — so "save" can be seen to produce something rather than
 * disappearing into a callback.
 *
 * ⚠️ THE COLOUR PICKER LIVES OUTSIDE THE STUDIO in the real app — it is the element card's, handed in
 * as a prop. The harness had none, so the studio here could only ever be one chocolate and per-shape
 * colour was untestable in the only place it can honestly be tested. These three swatches stand in
 * for that card. */
const CHOCOLATES = [
  { key: 'dark',  color: '#4A2C1B' },
  { key: 'white', color: '#EFE3CE' },
  { key: 'ruby',  color: '#C4626B' },
];

function App() {
  const [saved, setSaved] = useState(null);
  const [open, setOpen] = useState(true);
  const [color, setColor] = useState(CHOCOLATES[0].color);

  const control = (
    <div style={{ display: 'flex', gap: 6 }}>
      {CHOCOLATES.map(c => (
        <button key={c.key} type="button" aria-label={c.key} onClick={() => setColor(c.color)}
          style={{ width: 26, height: 26, borderRadius: '50%', background: c.color, cursor: 'pointer',
                   border: color === c.color ? '2.5px solid #2b6' : '1.5px solid #ccc' }} />
      ))}
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      {open && <GarnishStudio onCancel={() => setOpen(false)} color={color} colorControl={control}
        onSave={p => { setSaved(p); setOpen(false); }} />}
      {!open && (
        <div>
          <button onClick={() => setOpen(true)} style={{ padding: '8px 14px', fontFamily: 'inherit' }}>
            Open the studio
          </button>
          <pre data-saved style={{ marginTop: 14, fontSize: 12 }}>
            {saved
              ? `saved "${saved.name}" — ${saved.paths.length} paths, ${saved.paths.flat().length} points\n`
                + `parts: ${(saved.parts ?? []).map(pt => `${pt.color} x${pt.paths.length}`).join(', ') || 'none'}`
              : 'nothing saved'}
          </pre>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
