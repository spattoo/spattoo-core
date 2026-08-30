import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import GarnishStudio from '../src/designer/garnish/GarnishStudio.jsx';

/* The studio, plus whatever it last saved — so "save" can be seen to produce something rather than
 * disappearing into a callback. */
function App() {
  const [saved, setSaved] = useState(null);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ padding: 20 }}>
      {open && <GarnishStudio onCancel={() => setOpen(false)}
        onSave={p => { setSaved(p); setOpen(false); }} />}
      {!open && (
        <div>
          <button onClick={() => setOpen(true)} style={{ padding: '8px 14px', fontFamily: 'inherit' }}>
            Open the studio
          </button>
          <pre data-saved style={{ marginTop: 14, fontSize: 12 }}>
            {saved ? `saved "${saved.name}" — ${saved.paths.length} paths, ${saved.paths.flat().length} points` : 'nothing saved'}
          </pre>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
