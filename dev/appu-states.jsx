import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Appu from '../src/shared/Appu.jsx';
import { ASSISTANT_STATES, ASSISTANT } from '../src/shared/assistantState.js';

/* ── Appu, every state, animating ────────────────────────────────────────────────────────────────
 *
 * A contact sheet cannot show motion, and motion is half of what a character is for. This is where
 * the states are judged: side by side at the size they ship at, and one at a time at full size.
 *
 * ⚠️ REPLAY IS THE POINT. Most of these animations play ONCE on arrival — that is deliberate, so
 * nothing loops in the corner of a working screen — which means a static page would show them for
 * 600ms and never again. The Replay button remounts, so an entry animation can actually be
 * watched more than once.
 */
function Row({ state, size, replay }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ height: size + 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <Appu key={`${state}-${replay}`} state={state} size={size} />
      </div>
      <div style={{ fontSize: 11, color: '#5C7565', marginTop: 4 }}>{state}</div>
    </div>
  );
}

function App() {
  const [replay, setReplay] = useState(0);
  const [solo, setSolo] = useState(ASSISTANT.THINKING);
  const [auto, setAuto] = useState(false);

  /* Cycling through every state is how you notice two that look the same — the eye catches a
     NON-change faster than it compares two stills. */
  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(() => {
      setSolo(s => ASSISTANT_STATES[(ASSISTANT_STATES.indexOf(s) + 1) % ASSISTANT_STATES.length]);
    }, 1800);
    return () => clearInterval(id);
  }, [auto]);

  const btn = (on) => ({
    fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8,
    border: `1px solid ${on ? '#2C4433' : '#C5D4C8'}`, background: on ? '#2C4433' : '#fff',
    color: on ? '#fff' : '#5C7565', cursor: 'pointer',
  });

  return (
    <div style={{ padding: 28, color: '#2C4433' }}>
      <h1 style={{ fontSize: 19, marginBottom: 4 }}>Appu</h1>
      <p style={{ fontSize: 13, color: '#5C7565', marginBottom: 20, maxWidth: 620, lineHeight: 1.6 }}>
        Only <strong>thinking</strong> and <strong>thinking_long</strong> loop — work is still
        happening and the loop is the message. Everything else plays once and settles, so nothing
        churns in the corner of a screen somebody is working on.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
        <button style={btn(false)} onClick={() => setReplay(r => r + 1)}>Replay all</button>
        <button style={btn(auto)} onClick={() => setAuto(a => !a)}>{auto ? 'Stop cycling' : 'Cycle states'}</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #C5D4C8', borderRadius: 12, padding: '26px 20px',
                    display: 'flex', gap: 24, alignItems: 'flex-end', justifyContent: 'center', marginBottom: 26 }}>
        <div style={{ textAlign: 'center' }}>
          <Appu key={`solo-${solo}-${replay}`} state={solo} size={150} />
          <div style={{ fontSize: 13, color: '#2C4433', marginTop: 6, fontWeight: 700 }}>{solo}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
        {ASSISTANT_STATES.map(s => (
          <button key={s} style={btn(s === solo)} onClick={() => { setSolo(s); setAuto(false); }}>{s}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#9BB5A2', marginBottom: 10 }}>at the size it ships (64px), all nine</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 8,
                    background: '#fff', border: '1px solid #C5D4C8', borderRadius: 12, padding: 16 }}>
        {ASSISTANT_STATES.map(s => <Row key={s} state={s} size={64} replay={replay} />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
