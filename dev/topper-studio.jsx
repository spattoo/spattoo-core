import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import TopperComposer from '../src/designer/topper/TopperComposer.jsx';

/* The card topper studio on its own, so its FOOTER can be looked at.
 *
 * ⚠️ IT EXISTS BECAUSE THE TICK IS OTHERWISE INVISIBLE. "Save to my decorations" only renders when
 * the client offers `saveTopper`, and no client does yet — so the control could be written, shipped
 * and never once seen. A stub is enough: the footer does not care whether the call is real.
 *
 *   ?w=375   the phone width rule 5 asks for
 *   ?saved=1 opened from the shelf — the tick must be GONE, not unticked
 */
const q = new URLSearchParams(location.search);

/* Resolves, slowly enough that "Saving…" can be caught in a screenshot. It saves nothing: this
   harness is about the footer, and a fake row in a real table helps nobody. */
const apiClient = {
  saveCardTopper: async ({ thumbBase64 }) => {
    /* Handed to the page so the TILE can be looked at — it is the thing the shelf will show, and it
       is captured off the working canvas, so the grid and the selection have to be gone from it. */
    window.__tile = thumbBase64 ?? null;
    return new Promise(r => setTimeout(r, 1200));
  },
};

const KEPT = {
  name: 'A kept topper',
  payload: { v: 1, objects: [{ id: 1, kind: 'text', text: 'Mia', size: 0.9, x: 0, y: 0,
    colour: '#8E2F45', offset: 0.06, offsetColour: '#FFFFFF', face: '__block' }] },
};

function App() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ height: '100%', background: '#f4f4f5' }}>
      {open && (
        <TopperComposer
          apiClient={apiClient}
          openWith={q.has('saved') ? KEPT : null}
          onSave={t => { console.log('[harness] used on the cake:', t.name); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
      {!open && (
        <button onClick={() => setOpen(true)} style={{ margin: 24, padding: '10px 16px' }}>
          Open it again
        </button>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
