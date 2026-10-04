/* ── The Draw / Edit row, at the card's real width ───────────────────────────────────────────────
 *
 * renderPenModeRow is a closure inside CakeDesigner over `penMove`, and the card it sits on is
 * reached through Decorations → a piping element → "I'll pipe it myself" — which needs a baker
 * login and a stocked catalogue, so the designer harness (whose stub answers null to everything)
 * cannot get there.
 *
 * ⚠️ SO THIS IS A COPY OF THE ROW, NOT THE ROW. It proves what it can: whether the two sentences
 * fit the 300px card without wrapping into a paragraph, and whether the Draw line reads as pointing
 * somewhere. It proves nothing about the wiring — that is one ternary inside a block which already
 * rendered, and `penMove` already drove it.
 */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { INK, LINE, SURFACE } from '../src/shared/tokens.js';

const EDIT_POPUP_W = 300;   // CakeDesigner's own constant

function Row({ penMove, setPenMove }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {[['Draw', false], ['Edit', true]].map(([label, val]) => (
          <button key={label} onClick={() => setPenMove(val)}
            style={{ flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                     border: `1.5px solid ${penMove === val ? INK : LINE}`,
                     background: penMove === val ? INK : SURFACE,
                     color: penMove === val ? SURFACE : INK,
                     fontWeight: 800, fontSize: 11, fontFamily: "'Quicksand',sans-serif" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: '#b29aa2', lineHeight: 1.4, marginTop: 5 }}>
        {penMove
          ? 'Tap a piped piece to change its colour and size. Drag one to slide it.'
          : 'To recolour or move what you have piped, switch to Edit.'}
      </div>
    </>
  );
}

function Card({ title, start }) {
  const [penMove, setPenMove] = useState(start);
  return (
    <div style={{ width: EDIT_POPUP_W, background: '#fff', borderRadius: 14, padding: 14,
                  boxShadow: '0 6px 22px rgba(0,0,0,0.18)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: INK }}>{title}</div>
      <Row penMove={penMove} setPenMove={setPenMove} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ display: 'flex', gap: 20, padding: 24, alignItems: 'flex-start' }}>
    <Card title="Cream Pen" start={false} />
    <Card title="Cream Pen" start={true} />
  </div>
);
